/**
 * POST /admin/api/upload — hands the editor a short-lived token to upload one file straight
 * to the private Blob store, into uploads/tmp/ only (see src/cms/client/upload.ts). Signed-in
 * users only, like every /admin route (src/middleware.ts).
 */
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import type { APIRoute } from 'astro';
import { json, UPLOAD_TMP } from '../../../cms/api';
import { MAX_VIDEO_BYTES } from '../../../cms/store';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(UPLOAD_TMP) || pathname.includes('..')) throw new Error('Uploads go to the temporary folder only');
        // the file type and its contents are checked when the entry is saved
        return { maximumSizeInBytes: MAX_VIDEO_BYTES, addRandomSuffix: true, validUntil: Date.now() + 30 * 60 * 1000 };
      },
    });
    return json(result);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Upload failed' }, 400);
  }
};
