/**
 * CMS storage: entries are the JSON files in src/content/<collection>/, images live in
 * src/assets/<collection>/ — the same files the site's content collections read, so a
 * save shows up on the site in dev right away and in production on the next build.
 * Files are read and written through repo.ts: on disk locally, as one GitHub commit per
 * save on Vercel. A save, reorder or delete is one changeset, so a failed one leaves
 * nothing half-written.
 */
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { getCmsCollection, youtubeId, type CmsCollection, type Field } from './collections';
import { graphicSize, libraryFileExists } from './library';
import { repo, type Changeset, type RepoReader } from './repo';

const CONTENT_DIR = 'src/content';
const ASSETS_DIR = 'src/assets';
/** Image paths in the JSON are relative to src/content/<collection>/ */
const ASSET_PREFIX = '../../assets/';
/** 3D models live in public/ (loaded at runtime by WebGL), stored as "/models/..." */
const MODEL_PREFIX = '/models/';
const MODELS_DIR = 'public/models';
export const MAX_MODEL_BYTES = 30 * 1024 * 1024;
/** Videos are served as files from public/videos/, stored as { video: "/videos/..." } */
const VIDEO_PREFIX = '/videos/';
const VIDEOS_DIR = 'public/videos';
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const VIDEO_TYPES: Record<string, string> = { 'video/mp4': '.mp4', 'video/webm': '.webm' };
const UPLOAD_PREFIX = 'upload:';

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IMAGE_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'image/svg+xml': '.svg',
};
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export type Data = Record<string, unknown>;
export interface Entry {
  id: string;
  data: Data;
}

export class CmsError extends Error {
  constructor(
    message: string,
    public status = 400,
    public errors: string[] = [],
  ) {
    super(message);
  }
}

export function isValidId(id: string) {
  return ID_RE.test(id) && id.length <= 80;
}

export function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

function entryFile(c: CmsCollection, id: string) {
  if (!isValidId(id)) throw new CmsError('Invalid entry id', 400);
  return `${CONTENT_DIR}/${c.collection}/${id}.json`;
}

/** Repo path of a stored image / video / model path, or null if it points outside its folder */
export function assetPath(ref: string): string | null {
  const inside = (dir: string, rel: string) => {
    const file = path.posix.normalize(`${dir}/${rel}`);
    return file.startsWith(dir + '/') ? file : null;
  };
  if (ref.startsWith(VIDEO_PREFIX)) return inside(VIDEOS_DIR, ref.slice(VIDEO_PREFIX.length));
  if (ref.startsWith(MODEL_PREFIX)) return inside(MODELS_DIR, ref.slice(MODEL_PREFIX.length));
  if (!ref.startsWith(ASSET_PREFIX)) return null;
  return inside(ASSETS_DIR, ref.slice(ASSET_PREFIX.length));
}

const readJson = async (from: RepoReader, file: string) => JSON.parse((await from.readText(file)) ?? 'null') as Data;

/** Whether the file (or, for a new file, the other files in its folder) ends with a newline */
async function endsWithNewline(from: RepoReader, file: string): Promise<boolean> {
  const dir = path.posix.dirname(file);
  const sample = (await from.exists(file)) ? file : (await from.files(dir)).find((f) => f.endsWith('.json'));
  return sample ? ((await from.readText(sample)) ?? '').endsWith('\n') : false;
}

async function writeJson(cs: Changeset, file: string, data: Data) {
  // Same format as the hand-written files: 2-space indent, and keep their trailing-newline style
  const newline = (await endsWithNewline(cs, file)) ? '\n' : '';
  cs.put(file, JSON.stringify(data, null, 2) + newline);
}

/** Commit message: what changed, and who did it */
const message = (what: string, by?: string) => `CMS: ${what}${by ? `\n\nSaved by ${by} in the CMS` : ''}`;

// --- Read ---

/** Fills in the options of `optionsFrom` selects with that section's entries */
export async function resolveOptions(fields: Field[], selfId?: string): Promise<Field[]> {
  return Promise.all(
    fields.map(async (f) => {
      // a checklist lists every entry of its section, NDA ones included, in their order
      if (f.kind === 'checklist') {
        const from = getCmsCollection(f.optionsFrom);
        const entries = from ? await listEntries(from) : [];
        return { ...f, options: entries.map((e) => ({ value: e.id, label: String(e.data[from!.titleField] ?? e.id) })) };
      }
      const from = f.kind === 'select' && f.optionsFrom ? getCmsCollection(f.optionsFrom) : undefined;
      if (f.kind !== 'select' || !from) return f;
      const entries = (await listEntries(from)).filter((e) => e.id !== selfId && !e.data.nda);
      const options = entries.map((e) => ({ value: e.id, label: String(e.data[from.titleField] ?? e.id) }));
      return { ...f, options: [...f.options, ...options] };
    }),
  );
}

export async function listEntries(c: CmsCollection, from: RepoReader = repo): Promise<Entry[]> {
  const dir = `${CONTENT_DIR}/${c.collection}`;
  // only the section's own folder, not deeper ones
  const files = (await from.files(dir)).filter((f) => f.endsWith('.json') && path.posix.dirname(f) === dir);
  const entries = await Promise.all(
    files.map(async (f) => ({ id: path.posix.basename(f, '.json'), data: await readJson(from, f) })),
  );
  return entries.sort(
    (a, b) => (Number(a.data.order) || 0) - (Number(b.data.order) || 0) || a.id.localeCompare(b.id),
  );
}

export async function getEntry(c: CmsCollection, id: string): Promise<Entry | null> {
  const file = entryFile(c, id);
  if (!(await repo.exists(file))) return null;
  return { id, data: await readJson(repo, file) };
}

// --- Validate ---

type MediaRef = string | { video: string } | { youtube: string };
const VIDEO_URL_RE = /^https:\/\/[^\s"'<>]{4,2000}$/;

/** An image path, { video } when videos are allowed, { youtube } when YouTube is; null when empty */
async function checkMedia(
  v: unknown,
  f: { video?: boolean; youtube?: boolean },
  at: string,
  errors: string[],
  from: RepoReader,
): Promise<MediaRef | null> {
  const allowVideo = !!f.video;
  if (typeof v === 'string') {
    if (!v) return null;
    const file = v.startsWith(ASSET_PREFIX) ? assetPath(v) : null;
    if (!file || !(await from.exists(file))) errors.push(`${at}: image not found`);
    return v;
  }
  const video = (v as { video?: unknown } | null)?.video;
  if (typeof video === 'string' && video) {
    if (!allowVideo) {
      errors.push(`${at}: videos aren’t allowed here`);
      return null;
    }
    // A hosted video: an https link, played straight from where it lives
    if (video.startsWith('https://')) {
      if (!VIDEO_URL_RE.test(video)) errors.push(`${at}: that video link doesn’t look right`);
      return { video };
    }
    if (/^http:\/\//i.test(video)) {
      errors.push(`${at}: video links need to start with https://`);
      return null;
    }
    const file = video.startsWith(VIDEO_PREFIX) ? assetPath(video) : null;
    if (!file || !(await from.exists(file))) errors.push(`${at}: video not found`);
    return { video };
  }
  const yt = (v as { youtube?: unknown } | null)?.youtube;
  if (typeof yt === 'string' && yt) {
    if (!f.youtube) {
      errors.push(`${at}: YouTube videos aren’t allowed here`);
      return null;
    }
    const id = youtubeId(yt);
    if (!id) errors.push(`${at}: paste a YouTube video link`);
    return id ? { youtube: id } : null;
  }
  return null;
}

async function validateFields(fields: Field[], input: unknown, where: string, errors: string[], from: RepoReader): Promise<Data> {
  const src = (input && typeof input === 'object' ? input : {}) as Data;
  const out: Data = {};
  for (const f of fields) {
    const v = src[f.key];
    const at = where ? `${where} › ${f.label}` : f.label;
    switch (f.kind) {
      case 'text':
      case 'textarea': {
        const s = typeof v === 'string' ? v.trim() : '';
        if (f.required && !s) errors.push(`${at} is required`);
        if (s || f.required) out[f.key] = s;
        break;
      }
      case 'number': {
        let n = v === '' || v == null ? (f.default ?? 0) : Number(v);
        if (!Number.isFinite(n)) errors.push(`${at} must be a number`);
        // Fields are validated in order, so the graphic is already in `out`
        const graphic = f.sizeOf && out[f.sizeOf.field];
        if (!n && typeof graphic === 'string') n = (await graphicSize(graphic, from))?.[f.sizeOf!.dimension] ?? 0;
        out[f.key] = n;
        break;
      }
      case 'select': {
        const s = typeof v === 'string' ? v : '';
        if (!f.options.some((o) => o.value === s)) errors.push(`${at}: choose one of the options`);
        if (s || !f.optionsFrom) out[f.key] = s;
        break;
      }
      case 'boolean': {
        out[f.key] = typeof v === 'boolean' ? v : (f.default ?? false);
        break;
      }
      case 'checklist': {
        const ticked = new Set(Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);
        // in the section's order; ids that no longer exist drop out
        const list = (f.options ?? []).map((o) => o.value).filter((id) => ticked.has(id));
        if (f.min && list.length < f.min) errors.push(`${at}: tick at least ${f.min}`);
        out[f.key] = list;
        break;
      }
      case 'color': {
        const s = typeof v === 'string' ? v.trim() : '';
        if (!s) break;
        if (!/^#[0-9a-fA-F]{6}$/.test(s)) errors.push(`${at}: use a hex color like #FF6B03`);
        else out[f.key] = s.toUpperCase();
        break;
      }
      case 'model': {
        const s = typeof v === 'string' ? v.trim() : '';
        if (!s) {
          if (f.required) errors.push(`${at} is required`);
          break;
        }
        const file = s.startsWith(MODEL_PREFIX) ? assetPath(s) : null;
        if (!file || !(await from.exists(file))) errors.push(`${at}: 3D file not found`);
        out[f.key] = s;
        break;
      }
      case 'graphic': {
        const s = typeof v === 'string' ? v.trim() : '';
        if (!s) {
          if (f.required) errors.push(`${at} is required`);
          break;
        }
        if (!(await libraryFileExists(s, from))) errors.push(`${at}: graphic not found in the library`);
        else out[f.key] = s;
        break;
      }
      case 'youtube': {
        const s = typeof v === 'string' ? v.trim() : '';
        if (!s) {
          if (f.required) errors.push(`${at} is required`);
          break;
        }
        const id = youtubeId(s);
        if (!id) errors.push(`${at}: paste a YouTube video link`);
        else out[f.key] = id;
        break;
      }
      case 'image': {
        const m = await checkMedia(v, f, at, errors, from);
        if (m === null) {
          if (f.required) errors.push(`${at} is required`);
          break;
        }
        out[f.key] = m;
        break;
      }
      case 'images': {
        const list: MediaRef[] = [];
        for (const item of Array.isArray(v) ? v : []) {
          const m = await checkMedia(item, f, at, errors, from);
          if (m !== null) list.push(m);
        }
        if (list.length < 1 || list.length > f.max) errors.push(`${at}: add 1 to ${f.max} ${f.video ? 'images or videos' : 'images'}`);
        out[f.key] = list;
        break;
      }
      case 'strings': {
        const list = Array.isArray(v)
          ? v.filter((s): s is string => typeof s === 'string').map((s) => s.trim()).filter(Boolean)
          : [];
        if (list.length || !f.omitEmpty) out[f.key] = list;
        break;
      }
      case 'group': {
        if (f.optional && (v == null || v === false)) break;
        out[f.key] = await validateFields(f.fields, v, at, errors, from);
        break;
      }
      case 'list': {
        const list = Array.isArray(v) ? v : [];
        if (f.max && list.length > f.max) errors.push(`${at}: at most ${f.max} ${f.item}s`);
        const items: Data[] = [];
        for (const [i, item] of list.entries()) items.push(await validateFields(f.fields, item, `${at} ${i + 1}`, errors, from));
        out[f.key] = items;
        break;
      }
      case 'blocks': {
        const list = Array.isArray(v) ? v : [];
        const blocks: Data[] = [];
        for (const [i, item] of list.entries()) {
          const type = (item as Data | null)?.type;
          const variant = f.variants.find((x) => x.type === type);
          if (!variant) {
            errors.push(`${at} ${i + 1}: unknown section type`);
            blocks.push({});
            continue;
          }
          blocks.push({ type, ...(await validateFields(variant.fields, item, `${at} ${i + 1}`, errors, from)) });
        }
        out[f.key] = blocks;
        break;
      }
    }
  }
  return out;
}

// --- Images ---

function collectRefs(value: unknown, refs = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    if ([ASSET_PREFIX, MODEL_PREFIX, VIDEO_PREFIX].some((p) => value.startsWith(p))) refs.add(value);
  } else if (Array.isArray(value)) {
    value.forEach((v) => collectRefs(v, refs));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((v) => collectRefs(v, refs));
  }
  return refs;
}

const OTHER_3D = /\.(obj|fbx|gltf|stl|usdz|dae|3ds|blend|c4d|max)$/i;

/** Saves a .glb (checked by its glTF 2 header) to public/models/<collection>/ */
function saveModel(cs: Changeset, c: CmsCollection, id: string, file: File, data: Buffer): string {
  if (file.size > MAX_MODEL_BYTES) throw new CmsError(`“${file.name}” is larger than 30 MB. Compress it (e.g. Draco in the glTF export) and try again.`);
  if (data.length < 12 || data.toString('latin1', 0, 4) !== 'glTF' || data.readUInt32LE(4) !== 2) {
    throw new CmsError(`“${file.name}” isn’t a valid GLB (glTF 2.0 binary) file`);
  }
  const name = `${slugify(id) || 'model'}-${randomBytes(3).toString('hex')}.glb`;
  cs.put(`${MODELS_DIR}/${c.collection}/${name}`, data);
  return `${MODEL_PREFIX}${c.collection}/${name}`;
}

/** Saves an MP4 / WebM (checked by its header) to public/videos/<collection>/<id>/ */
async function saveVideo(cs: Changeset, c: CmsCollection, id: string, file: File): Promise<{ video: string }> {
  const ext = VIDEO_TYPES[file.type] ?? (/\.webm$/i.test(file.name) ? '.webm' : '.mp4');
  if (file.size > MAX_VIDEO_BYTES) throw new CmsError(`“${file.name}” is larger than 100 MB. Compress it for the web (H.264 MP4, ideally under 20 MB).`);
  const data = Buffer.from(await file.arrayBuffer());
  const isMp4 = data.length > 12 && data.toString('latin1', 4, 8) === 'ftyp';
  const isWebm = data.length > 4 && data.readUInt32BE(0) === 0x1a45dfa3;
  if (!(ext === '.mp4' ? isMp4 : isWebm)) throw new CmsError(`“${file.name}” isn’t a valid ${ext === '.mp4' ? 'MP4' : 'WebM'} video`);
  const base = slugify(file.name.replace(/\.[^.]+$/, '')) || 'video';
  const name = `${base}-${randomBytes(3).toString('hex')}${ext}`;
  cs.put(`${VIDEOS_DIR}/${c.collection}/${id}/${name}`, data);
  return { video: `${VIDEO_PREFIX}${c.collection}/${id}/${name}` };
}

const isVideoFile = (file: File) => file.type in VIDEO_TYPES || /\.(mp4|webm)$/i.test(file.name);

async function saveUpload(cs: Changeset, c: CmsCollection, id: string, file: File): Promise<string | { video: string }> {
  if (isVideoFile(file)) return saveVideo(cs, c, id, file);
  if (/\.(mov|avi|mkv|m4v)$/i.test(file.name)) {
    throw new CmsError(`“${file.name}”: videos need to be MP4 (H.264) or WebM. Export or convert it and try again.`);
  }
  if (/\.glb$/i.test(file.name) || file.type === 'model/gltf-binary') {
    return saveModel(cs, c, id, file, Buffer.from(await file.arrayBuffer()));
  }
  if (OTHER_3D.test(file.name)) {
    throw new CmsError(`“${file.name}”: 3D objects need to be GLB files. Export as glTF 2.0 → “glTF Binary (.glb)” (Blender: File → Export → glTF 2.0).`);
  }
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw new CmsError(`“${file.name}” is not a PNG, JPG, WebP, GIF, AVIF or SVG image`);
  if (file.size > MAX_UPLOAD_BYTES) throw new CmsError(`“${file.name}” is larger than 15 MB`);
  const base = slugify(file.name.replace(/\.[^.]+$/, '')) || 'image';
  const dir = c.assetsPerEntry ? `${c.collection}/${id}` : c.collection;
  const name = `${base}-${randomBytes(3).toString('hex')}${ext}`;
  cs.put(`${ASSETS_DIR}/${dir}/${name}`, Buffer.from(await file.arrayBuffer()));
  return `${ASSET_PREFIX}${dir}/${name}`;
}

/** Replaces "upload:<token>" strings with the saved image path */
async function resolveUploads(cs: Changeset, c: CmsCollection, id: string, value: unknown, files: Map<string, File>): Promise<unknown> {
  if (typeof value === 'string' && value.startsWith(UPLOAD_PREFIX)) {
    const file = files.get(value);
    if (!file) throw new CmsError('An upload is missing, please choose it again');
    return saveUpload(cs, c, id, file);
  }
  if (Array.isArray(value)) {
    const out = [];
    for (const v of value) out.push(await resolveUploads(cs, c, id, v, files));
    return out;
  }
  if (value && typeof value === 'object') {
    const out: Data = {};
    for (const [k, v] of Object.entries(value)) out[k] = await resolveUploads(cs, c, id, v, files);
    return out;
  }
  return value;
}

/** Text of every source file outside src/content and src/assets, to spot images imported by components */
async function sourceText(from: RepoReader): Promise<string> {
  const files = (await from.files('src')).filter(
    (f) => /\.(astro|ts|js|mjs|css|md)$/.test(f) && !f.startsWith(`${CONTENT_DIR}/`) && !f.startsWith(`${ASSETS_DIR}/`),
  );
  return (await Promise.all(files.map((f) => from.readText(f)))).join('\n');
}

/** Removes images that no content file or component refers to any more (in the same changeset) */
async function removeUnreferenced(cs: Changeset, refs: Iterable<string>) {
  const candidates = [...refs];
  if (!candidates.length) return;
  const inUse = new Set<string>();
  const entries = (await cs.files(CONTENT_DIR)).filter((f) => f.endsWith('.json'));
  for (const f of entries) collectRefs(await readJson(cs, f), inUse);
  const source = await sourceText(cs);
  for (const ref of candidates) {
    const file = assetPath(ref);
    const imported = ref.startsWith(ASSET_PREFIX)
      ? source.includes(`assets/${ref.slice(ASSET_PREFIX.length)}`)
      : source.includes(ref);
    if (file && !inUse.has(ref) && !imported) cs.remove(file);
  }
}

// --- Write ---

export async function saveEntry(
  c: CmsCollection,
  id: string,
  input: unknown,
  files: Map<string, File>,
  mode: 'create' | 'update',
  by?: string,
): Promise<Entry> {
  const file = entryFile(c, id);
  const existing = await repo.exists(file);
  if (mode === 'create' && existing) throw new CmsError(`An entry called “${id}” already exists`, 409);
  if (mode === 'update' && !existing) throw new CmsError('Entry not found', 404);
  const before = existing ? collectRefs(await readJson(repo, file)) : new Set<string>();

  // nothing is written until the very end, so a failed save leaves no stray files
  const cs = repo.changeset();
  const resolved = await resolveUploads(cs, c, id, input, files);
  const errors: string[] = [];
  const data = await validateFields(await resolveOptions(c.fields, id), resolved, '', errors, cs);
  if (errors.length) throw new CmsError('Please fix the highlighted fields', 422, errors);
  await checkLimits(c, id, data);
  // A new entry in a draggable list goes to the end (order is set by dragging, not typed)
  if (mode === 'create' && c.sortable && !Number(data.order)) {
    const others = await listEntries(c);
    data.order = Math.max(0, ...others.map((e) => Number(e.data.order) || 0)) + 1;
  }
  await writeJson(cs, file, data);
  const after = collectRefs(data);
  await removeUnreferenced(cs, [...before].filter((r) => !after.has(r)));
  const title = String(data[c.titleField] ?? id);
  await cs.commit(message(`${mode === 'create' ? 'add' : 'update'} ${c.singular} “${title}”`, by));
  return { id, data };
}

/** Top-level boolean fields with a `limit` can only be on for that many entries */
async function checkLimits(c: CmsCollection, id: string, data: Data) {
  const limited = c.fields.filter(
    (f): f is Extract<Field, { kind: 'boolean' }> => f.kind === 'boolean' && !!f.limit && data[f.key] === true,
  );
  if (!limited.length) return;
  const others = (await listEntries(c)).filter((e) => e.id !== id);
  for (const f of limited) {
    const on = others.filter((e) => e.data[f.key] === true);
    if (on.length >= f.limit!) {
      const msg = `${f.label}: only ${f.limit} ${c.singular}s can be on at once. Switch it off on one of: ${on.map((e) => e.data[c.titleField] ?? e.id).join(', ')}`;
      throw new CmsError(msg, 422, [msg]);
    }
  }
}

/** Sets `order` to 1, 2, 3… following `ids`, which must list every entry exactly once */
export async function reorderEntries(c: CmsCollection, ids: unknown, by?: string) {
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) throw new CmsError('Invalid order');
  const entries = await listEntries(c);
  const existing = entries.map((e) => e.id).sort();
  const given = [...ids].sort();
  if (existing.length !== given.length || existing.some((id, i) => id !== given[i])) {
    throw new CmsError('The list changed since you opened it. Reload the page and try again.', 409);
  }
  const cs = repo.changeset();
  for (const [i, id] of (ids as string[]).entries()) {
    const data = entries.find((e) => e.id === id)!.data;
    if (data.order === i + 1) continue;
    data.order = i + 1;
    await writeJson(cs, entryFile(c, id), data);
  }
  await cs.commit(message(`reorder ${c.label}`, by));
}

export async function deleteEntry(c: CmsCollection, id: string, by?: string) {
  const file = entryFile(c, id);
  if (!(await repo.exists(file))) throw new CmsError('Entry not found', 404);
  const data = await readJson(repo, file);
  const cs = repo.changeset();
  cs.remove(file);
  await removeUnreferenced(cs, collectRefs(data));
  await cs.commit(message(`delete ${c.singular} “${String(data[c.titleField] ?? id)}”`, by));
}
