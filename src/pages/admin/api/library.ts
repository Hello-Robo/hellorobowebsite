/** GET / POST /admin/api/library — list the micrographics library, or upload one into it */
import type { APIRoute } from 'astro';
import { errorResponse, json, toFile } from '../../../cms/api';
import { listLibrary, saveLibraryUpload } from '../../../cms/library';
import { CmsError } from '../../../cms/store';

export const prerender = false;

export const GET: APIRoute = async () => json(await listLibrary());

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const file = await toFile((await request.formData()).get('file'));
    if (!file) throw new CmsError('Choose a file to upload');
    return json(await saveLibraryUpload(file, locals.user?.email), 201);
  } catch (err) {
    return errorResponse(err);
  }
};
