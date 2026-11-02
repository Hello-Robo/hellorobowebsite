/**
 * Contact form responses: one JSON file per submission. Written by the public /api/contact
 * endpoint, read and deleted in the CMS. People's names and emails never go into the repo
 * or the site build:
 * - locally: data/contact-responses/ (git-ignored)
 * - on Vercel (BLOB_READ_WRITE_TOKEN set): the project's private Blob store, contact-responses/
 */
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { del, get, list, put } from '@vercel/blob';
import { CmsError } from './store';

const DIR = path.resolve(process.env.CONTACT_RESPONSES_DIR || path.join(process.cwd(), 'data/contact-responses'));
const BLOB_PREFIX = 'contact-responses/';
const inBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
const ID_RE = /^\d{8}-\d{6}-[0-9a-f]{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ContactResponse {
  id: string;
  /** ISO date */
  receivedAt: string;
  /** "Start a project" (name, email, company, services) or "Drop a quick word" (message) */
  type: 'project' | 'message';
  name?: string;
  email?: string;
  company?: string;
  services?: string[];
  message?: string;
  /** Page the form was sent from */
  page?: string;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Checks a submission from the site; throws CmsError with the problems */
export function parseResponse(input: unknown): Omit<ContactResponse, 'id' | 'receivedAt'> {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const errors: string[] = [];
  const page = str(src.page, 200) || undefined;
  if (src.type === 'message') {
    const message = str(src.message, 5000);
    if (!message) errors.push('Message is empty');
    if (errors.length) throw new CmsError(errors[0], 422, errors);
    return { type: 'message', message, page };
  }
  if (src.type !== 'project') throw new CmsError('Unknown form');
  const name = str(src.name, 120);
  const email = str(src.email, 200);
  const company = str(src.company, 200);
  const services = Array.isArray(src.services)
    ? src.services.map((s) => str(s, 100)).filter(Boolean).slice(0, 20)
    : [];
  if (!name) errors.push('Name is missing');
  if (!EMAIL_RE.test(email)) errors.push('Email doesn’t look right');
  if (errors.length) throw new CmsError(errors[0], 422, errors);
  return { type: 'project', name, email, company: company || undefined, services, page };
}

export async function saveResponse(input: unknown): Promise<ContactResponse> {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const entry: ContactResponse = {
    id: `${stamp}-${randomBytes(3).toString('hex')}`,
    receivedAt: now.toISOString(),
    ...parseResponse(input),
  };
  const text = JSON.stringify(entry, null, 2) + '\n';
  if (inBlob) {
    await put(`${BLOB_PREFIX}${entry.id}.json`, text, { access: 'private', addRandomSuffix: false, contentType: 'application/json' });
    return entry;
  }
  await mkdir(DIR, { recursive: true });
  const file = path.join(DIR, `${entry.id}.json`);
  const tmp = `${file}.tmp`;
  await writeFile(tmp, text);
  await rename(tmp, file);
  return entry;
}

async function blobResponses(): Promise<ContactResponse[]> {
  const pathnames: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: BLOB_PREFIX, cursor, limit: 1000 });
    pathnames.push(...page.blobs.map((b) => b.pathname).filter((p) => p.endsWith('.json')));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  const entries = await Promise.all(
    pathnames.map(async (p) => {
      const res = await get(p, { access: 'private', useCache: false });
      if (!res || res.statusCode !== 200 || !res.stream) return null;
      return JSON.parse(await new Response(res.stream).text()) as ContactResponse;
    }),
  );
  return entries.filter((e): e is ContactResponse => !!e);
}

/** Newest first */
export async function listResponses(): Promise<ContactResponse[]> {
  let entries: ContactResponse[];
  if (inBlob) entries = await blobResponses();
  else if (!existsSync(DIR)) return [];
  else {
    const files = (await readdir(DIR)).filter((f) => f.endsWith('.json'));
    entries = await Promise.all(
      files.map(async (f) => JSON.parse(await readFile(path.join(DIR, f), 'utf8')) as ContactResponse),
    );
  }
  return entries.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

export async function deleteResponse(id: string) {
  if (!ID_RE.test(id)) throw new CmsError('Invalid response id', 400);
  if (inBlob) {
    const pathname = `${BLOB_PREFIX}${id}.json`;
    if (!(await get(pathname, { access: 'private', useCache: false }))) throw new CmsError('Response not found', 404);
    await del(pathname);
    return;
  }
  const file = path.join(DIR, `${id}.json`);
  if (!existsSync(file)) throw new CmsError('Response not found', 404);
  await unlink(file);
}
