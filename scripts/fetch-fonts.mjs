#!/usr/bin/env node
/**
 * Downloads the licensed Alliance No.2 fonts into public/fonts before a build on Vercel.
 * They aren't in git (public repo), so the host keeps them at a private URL instead:
 *
 *   FONTS_BASE_URL   folder URL holding the files below (e.g. a Vercel Blob store)
 *   FONTS_TOKEN      optional, sent as a Bearer token when the store is private; falls back
 *                    to BLOB_READ_WRITE_TOKEN, which Vercel adds for a connected Blob store
 *
 * Files already in public/fonts are kept, so a local build doesn't need either variable.
 */
import { existsSync, writeFileSync } from 'node:fs';

const FILES = ['AllianceNo2-Regular.woff2', 'AllianceNo2-Medium.woff2'];
const DIR = new URL('../public/fonts/', import.meta.url);
const base = process.env.FONTS_BASE_URL?.replace(/\/+$/, '');
const token = process.env.FONTS_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
const headers = token ? { Authorization: `Bearer ${token}` } : {};

const missing = FILES.filter((name) => !existsSync(new URL(name, DIR)));
if (missing.length === 0) process.exit(0);
if (!base) {
  console.error(`fetch-fonts: FONTS_BASE_URL is not set and public/fonts is missing ${missing.join(', ')}`);
  process.exit(1);
}

for (const name of missing) {
  const res = await fetch(`${base}/${name}`, { headers });
  if (!res.ok) {
    console.error(`fetch-fonts: ${name} — HTTP ${res.status}`);
    process.exit(1);
  }
  writeFileSync(new URL(name, DIR), Buffer.from(await res.arrayBuffer()));
  console.log(`fetch-fonts: ${name}`);
}
