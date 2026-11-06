/**
 * POST /api/contact — the site's contact form (src/blocks/contact/ContactFlow.astro).
 * Public: saves the submission for the CMS "Contact form responses" page.
 */
import type { APIRoute } from 'astro';
import { errorResponse, json } from '../../cms/api';
import { countResponses, saveResponse } from '../../cms/responses';

export const prerender = false;

const MAX_BYTES = 20 * 1024;
/** A few sends per visitor every 10 minutes; resets when the server restarts */
const LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;
const recent = new Map<string, number[]>();

export const POST: APIRoute = async ({ request, url, clientAddress }) => {
  if (request.headers.get('origin') !== url.origin) return json({ error: 'Forbidden' }, 403);
  if (Number(request.headers.get('content-length') || 0) > MAX_BYTES) return json({ error: 'Too long' }, 413);

  const now = Date.now();
  const ip = clientAddress || 'unknown';
  const times = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= LIMIT) return json({ error: 'Too many messages. Please try again in a few minutes.' }, 429);

  try {
    const body = await request.json().catch(() => null);
    // Hidden field only bots fill in: pretend it worked
    if (body?.website) return json({ ok: true, number: 0 });
    await saveResponse(body);
    times.push(now);
    recent.set(ip, times);
    // the receipt's number: how many have come in, this one included (0 if counting fails)
    const number = await countResponses().catch(() => 0);
    return json({ ok: true, number }, 201);
  } catch (err) {
    return errorResponse(err);
  }
};
