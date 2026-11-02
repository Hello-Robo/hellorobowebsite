/** PUT / DELETE /admin/api/<section>/<id> — update or delete an entry */
import type { APIRoute } from 'astro';
import { errorResponse, json, readSubmission } from '../../../../cms/api';
import { getCmsCollection } from '../../../../cms/collections';
import { deleteEntry, saveEntry } from '../../../../cms/store';

export const prerender = false;

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const c = getCmsCollection(params.section);
  if (!c || !params.id) return json({ error: 'Not found' }, 404);
  try {
    const { data, files } = await readSubmission(request);
    return json(await saveEntry(c, params.id, data, files, 'update', locals.user?.email));
  } catch (err) {
    return errorResponse(err);
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const c = getCmsCollection(params.section);
  if (!c || c.fixed || !params.id) return json({ error: 'Not found' }, 404);
  try {
    await deleteEntry(c, params.id, locals.user?.email);
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
};
