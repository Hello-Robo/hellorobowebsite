/** POST /admin/api/<section> — create an entry · PUT — reorder ({ ids: [...] }) */
import type { APIRoute } from 'astro';
import { errorResponse, json, readSubmission } from '../../../../cms/api';
import { getCmsCollection } from '../../../../cms/collections';
import { CmsError, isValidId, reorderEntries, saveEntry } from '../../../../cms/store';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, locals }) => {
  const c = getCmsCollection(params.section);
  if (!c || c.fixed) return json({ error: 'Not found' }, 404);
  try {
    const { data, files, id } = await readSubmission(request);
    if (!isValidId(id) || id === 'new') {
      throw new CmsError('File name: use lowercase letters, numbers and dashes', 422, [
        'File name: use lowercase letters, numbers and dashes',
      ]);
    }
    const entry = await saveEntry(c, id, data, files, 'create', locals.user?.email);
    return json(entry, 201);
  } catch (err) {
    return errorResponse(err);
  }
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const c = getCmsCollection(params.section);
  if (!c?.sortable) return json({ error: 'Not found' }, 404);
  try {
    const body = await request.json().catch(() => null);
    await reorderEntries(c, body?.ids, locals.user?.email);
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
};
