/**
 * GET /admin/media?ref=../../assets/... | /models/... | /videos/... — serves a content image,
 * 3D model or video to the CMS for previews (with Range for videos): from disk locally, from
 * the GitHub branch the CMS saves to on Vercel.
 */
import { open } from 'node:fs/promises';
import path from 'node:path';
import type { APIRoute } from 'astro';
import { repo } from '../../cms/repo';
import { assetPath } from '../../cms/store';

export const prerender = false;

const TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/** Largest piece sent at once: Vercel functions answer with at most 4.5 MB */
const CHUNK = repo.remote ? 4 * 1024 * 1024 : 8 * 1024 * 1024;

export const GET: APIRoute = async ({ url, request }) => {
  const file = assetPath(url.searchParams.get('ref') ?? '');
  const type = file && TYPES[path.extname(file).toLowerCase()];
  const size = file && type ? await repo.size(file) : null;
  if (!file || !type || size === null) return new Response('Not found', { status: 404 });
  const headers: Record<string, string> = {
    'Content-Type': type,
    // SVGs can carry scripts: never let them run
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
  };

  /** Bytes start…end of the file */
  const slice = async (start: number, end: number): Promise<Buffer> => {
    if (repo.remote) {
      const res = await fetch((await repo.remote.url(file))!, { headers: { ...repo.remote.headers, Range: `bytes=${start}-${end}` } });
      return Buffer.from(await res.arrayBuffer());
    }
    const handle = await open(path.join(process.cwd(), file));
    const chunk = Buffer.alloc(end - start + 1);
    await handle.read(chunk, 0, chunk.length, start);
    await handle.close();
    return chunk;
  };

  // Video players ask for byte ranges to start and seek
  const range = request.headers.get('range')?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1, start + CHUNK - 1);
    if (start > end) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    const chunk = await slice(start, end);
    return new Response(new Uint8Array(chunk), {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(chunk.length) },
    });
  }
  // Too big to answer in one go from a Vercel function: send the browser to GitHub for it
  // (never an SVG, which is only ever served with the headers above)
  if (repo.remote && size > CHUNK) {
    if (type === 'image/svg+xml') return new Response('Too large', { status: 413 });
    return Response.redirect((await repo.remote.url(file))!, 302);
  }
  return new Response(new Uint8Array(size ? await slice(0, size - 1) : Buffer.alloc(0)), { headers });
};
