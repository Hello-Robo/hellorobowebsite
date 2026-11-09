/**
 * /api/contact — the site's contact form (src/blocks/contact/ContactFlow.astro).
 * Public: POST saves the submission for the CMS "Contact form responses" page.
 *
 * Anti-spam, no CAPTCHA (each layer stops a different kind of bot):
 * - GET hands out a signed form token; the form asks for one when the visitor starts on it.
 *   A send without a valid token (a bot posting straight to this URL) is dropped.
 * - Sent less than MIN_FILL_MS after the token was issued: too fast for a person, dropped.
 * - The hidden "website" field (only bots fill it in): dropped.
 * - Link spam (links in a name / company, HTML or BBCode links, 3+ links in a message): dropped.
 * - A few sends per visitor every 10 minutes (per server instance), and at most
 *   HOURLY_CAP saved per hour across all of them (counted from the stored files), so even a
 *   bot that gets past everything else can't flood the responses folder.
 * Dropped sends get the same "ok" a real one does, so bots get no signal to adapt to.
 */
import type { APIRoute } from 'astro';
import { CMS_SESSION_SECRET } from 'astro:env/server';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { errorResponse, json } from '../../cms/api';
import { countRecentResponses, countResponses, saveResponse } from '../../cms/responses';

export const prerender = false;

const MAX_BYTES = 20 * 1024;
/** A few sends per visitor every 10 minutes; resets when the server restarts */
const LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;
const recent = new Map<string, number[]>();
/** No person gets through the form faster than this after starting on it */
const MIN_FILL_MS = 3000;
/** A token older than this (a tab left open overnight) asks the form for a fresh one */
const MAX_TOKEN_AGE_MS = 12 * 60 * 60 * 1000;
/** Saved responses per hour, all visitors together */
const HOURLY_CAP = 30;

// Signed with the CMS secret (set on Vercel); locally without one, a per-process secret
const SECRET = CMS_SESSION_SECRET && CMS_SESSION_SECRET.length >= 32 ? CMS_SESSION_SECRET : randomBytes(32).toString('hex');
const sign = (payload: string) => createHmac('sha256', `contact-form:${SECRET}`).update(payload).digest('base64url');

function makeToken() {
  const payload = `${Date.now()}.${randomBytes(9).toString('base64url')}`;
  return `${payload}.${sign(payload)}`;
}

/** The token's age in ms, or null when it isn't one of ours */
function tokenAge(token: unknown): number | null {
  if (typeof token !== 'string' || token.length > 200) return null;
  const i = token.lastIndexOf('.');
  if (i < 0) return null;
  const payload = token.slice(0, i);
  const given = Buffer.from(token.slice(i + 1));
  const expected = Buffer.from(sign(payload));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const issued = Number(payload.split('.')[0]);
  return Number.isFinite(issued) ? Date.now() - issued : null;
}

const URL_RE = /https?:\/\/|www\.[a-z0-9-]+\.[a-z]/gi;
/** Typical spam: links where a person writes a name, HTML / BBCode links, a pile of links */
function looksLikeSpam(body: Record<string, unknown>) {
  const text = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : '');
  const all = ['name', 'company', 'message'].map(text).join('\n');
  if (/<a\s|<\/a>|\[url[=\]]|\[link[=\]]/i.test(all)) return true;
  if ((text('name') + text('company')).match(URL_RE)) return true;
  if ((text('message').match(URL_RE)?.length ?? 0) >= 3) return true;
  return false;
}

/** What a real send gets back, minus the save */
const fakeOk = () => json({ ok: true, number: 0 }, 201);

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ token: makeToken() }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export const POST: APIRoute = async ({ request, url, clientAddress }) => {
  if (request.headers.get('origin') !== url.origin) return json({ error: 'Forbidden' }, 403);
  if (Number(request.headers.get('content-length') || 0) > MAX_BYTES) return json({ error: 'Too long' }, 413);

  const now = Date.now();
  const ip = clientAddress || 'unknown';
  const times = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= LIMIT) return json({ error: 'Too many messages. Please try again in a few minutes.' }, 429);

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return json({ error: 'Bad request' }, 400);
    // Hidden field only bots fill in
    if (body.website) return fakeOk();
    const age = tokenAge(body.token);
    if (age === null) return fakeOk(); // no token / a forged one: never loaded the form
    if (age > MAX_TOKEN_AGE_MS) return json({ error: 'expired', retry: true }, 409); // the form fetches a new one
    if (age < MIN_FILL_MS) return fakeOk();
    if (looksLikeSpam(body)) return fakeOk();
    // a flood that got past the rest: stop saving for the hour
    if ((await countRecentResponses(60 * 60 * 1000).catch(() => 0)) >= HOURLY_CAP) {
      return json({ error: 'We’re getting a lot of messages right now. Please try again later.' }, 429);
    }
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
