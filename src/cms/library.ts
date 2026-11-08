/**
 * Hello Robo asset library: the micrographics (stamps, badges, globes) in public/images
 * plus anything uploaded through the CMS into public/images/micrographics/.
 * Stored on entries as the public path, e.g. "/images/project/badge-25.svg".
 */
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { repo, type RepoReader } from './repo';
import { CmsError, MAX_UPLOAD_BYTES, slugify } from './store';

const PUBLIC_DIR = 'public';
const IMAGES_DIR = 'public/images';
export const UPLOAD_DIR = 'images/micrographics';

/** Site graphics that count as micrographics (players and illustrations don't) */
const SITE_GRAPHIC = /^(stamp-|badge-)|micrographic|globe/;
/** The Home Clients logos are in the library too, so they can be swapped back and forth */
const CLIENT_LOGOS = 'public/images/home/clients';

export interface LibraryItem {
  path: string;
  name: string;
  group: 'Uploaded' | 'Site';
}

const toPublicPath = (file: string) => file.slice(PUBLIC_DIR.length);
/** Repo path of a public path inside public/images, or null */
const libraryPath = (publicPath: string) => {
  if (!publicPath.startsWith('/images/')) return null;
  const file = path.posix.normalize(PUBLIC_DIR + publicPath);
  return file.startsWith(IMAGES_DIR + '/') ? file : null;
};
const label = (file: string) =>
  path
    .basename(file)
    .replace(/\.[^.]+$/, '')
    .replace(/-[0-9a-f]{6}$/, '')
    .replace(/[-_]+/g, ' ');

export async function listLibrary(): Promise<LibraryItem[]> {
  const uploadDir = `${PUBLIC_DIR}/${UPLOAD_DIR}`;
  const files = await repo.files(IMAGES_DIR);
  const uploaded = files.filter((f) => f.startsWith(uploadDir + '/') && /\.(svg|png|webp)$/i.test(f));
  const site = files.filter(
    (f) =>
      !f.startsWith(uploadDir + '/') &&
      ((f.endsWith('.svg') && SITE_GRAPHIC.test(path.posix.basename(f))) || f.startsWith(CLIENT_LOGOS + '/')),
  );
  const items = (list: string[], group: LibraryItem['group']) =>
    list
      .map((f) => ({ path: toPublicPath(f), name: label(f), group }))
      .sort((a, b) => a.name.localeCompare(b.name));
  return [...items(uploaded, 'Uploaded'), ...items(site, 'Site')];
}

/** True if the public path points at an existing file in public/images */
export async function libraryFileExists(publicPath: string, from: RepoReader = repo) {
  const file = libraryPath(publicPath);
  return !!file && (await from.exists(file));
}

/** Width / height of an SVG in the library, from its width/height or viewBox */
export async function graphicSize(publicPath: string, from: RepoReader = repo): Promise<{ width: number; height: number } | null> {
  const file = libraryPath(publicPath);
  if (!file || !publicPath.endsWith('.svg')) return null;
  const head = ((await from.readText(file)) ?? '').slice(0, 2000);
  const tag = head.match(/<svg\b[^>]*>/i)?.[0] ?? '';
  const attr = (name: string) => Number(tag.match(new RegExp(`\\s${name}="([\\d.]+)(px)?"`))?.[1]);
  const box = tag.match(/viewBox="[\d.\s-]+?\s([\d.]+)\s+([\d.]+)"/);
  const width = attr('width') || Number(box?.[1]);
  const height = attr('height') || Number(box?.[2]);
  return width && height ? { width: Math.round(width), height: Math.round(height) } : null;
}

// SVGs are served from the site's own origin, so refuse anything that could run code
const UNSAFE_SVG = /<script|<foreignObject|\son\w+\s*=|javascript:|<iframe|<embed|<object/i;

export async function saveLibraryUpload(file: File, by?: string): Promise<LibraryItem> {
  const ext = { 'image/svg+xml': '.svg', 'image/png': '.png', 'image/webp': '.webp' }[file.type];
  if (!ext) throw new CmsError('Micrographics must be SVG (preferred), PNG or WebP');
  if (file.size > MAX_UPLOAD_BYTES) throw new CmsError(`“${file.name}” is larger than 15 MB`);
  const data = Buffer.from(await file.arrayBuffer());
  if (ext === '.svg') {
    const text = data.toString('utf8');
    if (!/<svg[\s>]/i.test(text)) throw new CmsError(`“${file.name}” is not a valid SVG`);
    if (UNSAFE_SVG.test(text)) throw new CmsError(`“${file.name}” contains scripts or links, which aren’t allowed`);
    // Figma exports a grain / noise texture as thousands of tiny copies (<use>) of one huge
    // shape. A single such stamp cost phones 100–250 MB of memory and crashed the site on
    // iPhones; those are exported as PNG / WebP (at 3×) instead
    if ((text.match(/<use[\s>]/gi)?.length ?? 0) > 200)
      throw new CmsError(`“${file.name}” has a grain texture made of thousands of shapes, which phones can’t handle — export it as PNG or WebP (3×) instead`);
  }
  const base = slugify(file.name.replace(/\.[^.]+$/, '')) || 'micrographic';
  const name = `${base}-${randomBytes(3).toString('hex')}${ext}`;
  const full = `${PUBLIC_DIR}/${UPLOAD_DIR}/${name}`;
  const cs = repo.changeset();
  cs.put(full, data);
  await cs.commit(`CMS: add micrographic “${label(full)}”${by ? `\n\nSaved by ${by} in the CMS` : ''}`);
  return { path: toPublicPath(full), name: label(full), group: 'Uploaded' };
}
