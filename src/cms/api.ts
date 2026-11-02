/** Shared helpers for the /admin/api endpoints */
import { del, get } from '@vercel/blob';
import { CmsError, MAX_UPLOAD_BYTES } from './store';

/** Where the editor puts files on their way in, on Vercel (src/cms/client/upload.ts) */
export const UPLOAD_TMP = 'uploads/tmp/';

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function errorResponse(err: unknown) {
  if (err instanceof CmsError) return json({ error: err.message, errors: err.errors }, err.status);
  console.error('[cms]', err);
  return json({ error: 'Something went wrong while saving. Please try again.' }, 500);
}

/**
 * A file from a form: the file itself, or (on Vercel) a reference to the copy the browser
 * uploaded to the Blob store, which is fetched and then deleted
 */
export async function toFile(value: FormDataEntryValue | null): Promise<File | null> {
  if (value instanceof File) return value;
  if (typeof value !== 'string') return null;
  let ref: { pathname?: unknown; name?: unknown; type?: unknown };
  try {
    ref = JSON.parse(value);
  } catch {
    return null;
  }
  const pathname = typeof ref.pathname === 'string' ? ref.pathname : '';
  if (!pathname.startsWith(UPLOAD_TMP) || pathname.includes('..')) throw new CmsError('An upload is missing, please choose it again');
  const res = await get(pathname, { access: 'private', useCache: false });
  if (!res || res.statusCode !== 200 || !res.stream) throw new CmsError('An upload is missing, please choose it again');
  const data = await new Response(res.stream).arrayBuffer();
  await del(pathname).catch(() => {});
  return new File([data], String(ref.name || 'upload'), { type: String(ref.type || '') });
}

/**
 * Reads an editor submission: multipart form with `data` (the entry as JSON, new images
 * written as "upload:<token>") and one file (or uploaded-file reference) per token.
 */
export async function readSubmission(request: Request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_UPLOAD_BYTES * 10) throw new CmsError('Too much to upload at once — save in smaller steps', 413);
  const form = await request.formData();
  let data: unknown;
  try {
    data = JSON.parse(String(form.get('data') ?? ''));
  } catch {
    throw new CmsError('Invalid form data');
  }
  const files = new Map<string, File>();
  for (const [key, value] of form.entries()) {
    if (!key.startsWith('upload:')) continue;
    const file = await toFile(value);
    if (file) files.set(key, file);
  }
  return { data, files, id: String(form.get('id') ?? '') };
}
