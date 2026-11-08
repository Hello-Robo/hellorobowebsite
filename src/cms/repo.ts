/**
 * Where the CMS keeps the site's files: content JSON, images, videos, models, micrographics.
 * Paths are relative to the project root with forward slashes ("src/content/team/shak.json").
 *
 * - Locally (no GITHUB_TOKEN): straight on disk, as the dev server reads them.
 * - On Vercel (GITHUB_TOKEN set): in the GitHub repo the site is built from. Reads come from
 *   the branch head (pinned to its commit, so never stale); a changeset is one commit on that
 *   branch, which Vercel builds and publishes. The branch is the deployment's own
 *   (VERCEL_GIT_COMMIT_REF), so a preview's CMS never writes to main.
 *
 * A changeset reads through its own pending writes, so checks made while saving (is this
 * image still used anywhere?) see the entry as it is about to be saved.
 */
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CMS_BRANCH, GITHUB_REPO, GITHUB_TOKEN } from 'astro:env/server';

export interface RepoReader {
  /** The file's bytes, or null if there is none */
  read(file: string): Promise<Buffer | null>;
  readText(file: string): Promise<string | null>;
  exists(file: string): Promise<boolean>;
  /** Every file under the folder, at any depth (full paths) */
  files(dir: string): Promise<string[]>;
}

export interface Changeset extends RepoReader {
  put(file: string, data: Buffer | string): void;
  remove(file: string): void;
  /** Writes everything at once; a changeset with nothing in it does nothing */
  commit(message: string): Promise<void>;
}

export interface Repo extends RepoReader {
  changeset(): Changeset;
  /** Size in bytes, or null if there is no such file */
  size(file: string): Promise<number | null>;
  /** A GitHub-backed repo: where a file can be fetched (with `headers`) and its size */
  remote?: { url(file: string): Promise<string | null>; headers: Record<string, string> };
}

const clean = (file: string) => file.replace(/^\/+/, '').replace(/\/+$/, '');
const within = (file: string, dir: string) => !dir || file.startsWith(clean(dir) + '/');

/** Pending writes over a base reader */
function overlay(base: RepoReader, write: (puts: Map<string, Buffer>, removes: Set<string>, message: string) => Promise<void>): Changeset {
  const puts = new Map<string, Buffer>();
  const removes = new Set<string>();
  return {
    put(file, data) {
      const f = clean(file);
      removes.delete(f);
      puts.set(f, Buffer.isBuffer(data) ? data : Buffer.from(data));
    },
    remove(file) {
      const f = clean(file);
      puts.delete(f);
      removes.add(f);
    },
    async read(file) {
      const f = clean(file);
      if (puts.has(f)) return puts.get(f)!;
      return removes.has(f) ? null : base.read(f);
    },
    async readText(file) {
      return (await this.read(file))?.toString('utf8') ?? null;
    },
    async exists(file) {
      const f = clean(file);
      if (puts.has(f)) return true;
      return removes.has(f) ? false : base.exists(f);
    },
    async files(dir) {
      const out = new Set((await base.files(dir)).filter((f) => !removes.has(f)));
      for (const f of puts.keys()) if (within(f, dir)) out.add(f);
      return [...out];
    },
    async commit(message) {
      if (!puts.size && !removes.size) return;
      await write(puts, removes, message);
    },
  };
}

// --- On disk ---

function diskRepo(root: string): Repo {
  const abs = (file: string) => path.join(root, clean(file));
  const reader: RepoReader = {
    async read(file) {
      const f = abs(file);
      return existsSync(f) ? readFile(f) : null;
    },
    async readText(file) {
      return (await reader.read(file))?.toString('utf8') ?? null;
    },
    async exists(file) {
      return existsSync(abs(file));
    },
    async files(dir) {
      const out: string[] = [];
      const walk = async (rel: string) => {
        for (const d of await readdir(abs(rel), { withFileTypes: true }).catch(() => [])) {
          const child = `${rel}/${d.name}`;
          if (d.isDirectory()) await walk(child);
          else out.push(child);
        }
      };
      await walk(clean(dir));
      return out;
    },
  };
  return {
    ...reader,
    async size(file) {
      return existsSync(abs(file)) ? (await stat(abs(file))).size : null;
    },
    changeset: () =>
      overlay(reader, async (puts, removes) => {
        for (const [file, data] of puts) {
          const f = abs(file);
          await mkdir(path.dirname(f), { recursive: true });
          const tmp = `${f}.${randomBytes(4).toString('hex')}.tmp`;
          await writeFile(tmp, data);
          await rename(tmp, f);
        }
        for (const file of removes) await unlink(abs(file)).catch(() => {});
      }),
  };
}

// --- On GitHub ---

const API = 'https://api.github.com';
/** How long a looked-up branch head is trusted before asking again (ms) */
const HEAD_TTL = 1500;

interface Tree {
  commit: string;
  tree: string;
  files: Map<string, { sha: string; size: number }>;
}

function githubRepo(token: string, slug: string, branch: string): Repo {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'hello-robo-cms',
  };
  const api = async <T>(route: string, init?: { method?: string; body?: unknown }): Promise<T> => {
    const res = await fetch(`${API}/repos/${slug}${route}`, {
      method: init?.method ?? 'GET',
      headers: { ...headers, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok) {
      const err = new Error(`GitHub ${init?.method ?? 'GET'} ${route}: ${res.status} ${await res.text().catch(() => '')}`);
      (err as Error & { status: number }).status = res.status;
      throw err;
    }
    return res.json() as Promise<T>;
  };

  let cached: { at: number; tree: Promise<Tree> } | null = null;
  const loadTree = async (): Promise<Tree> => {
    const ref = await api<{ object: { sha: string } }>(`/git/ref/heads/${encodeURIComponent(branch)}`);
    const commit = ref.object.sha;
    const c = await api<{ tree: { sha: string } }>(`/git/commits/${commit}`);
    const t = await api<{ truncated: boolean; tree: { path: string; type: string; sha: string; size?: number }[] }>(
      `/git/trees/${c.tree.sha}?recursive=1`,
    );
    if (t.truncated) console.warn('[cms] the repo tree is too large to list in full');
    const files = new Map<string, { sha: string; size: number }>();
    for (const e of t.tree) if (e.type === 'blob') files.set(e.path, { sha: e.sha, size: e.size ?? 0 });
    return { commit, tree: c.tree.sha, files };
  };
  const tree = () => {
    if (!cached || Date.now() - cached.at > HEAD_TTL) {
      const promise = loadTree();
      cached = { at: Date.now(), tree: promise };
      promise.catch(() => (cached = null));
    }
    return cached.tree;
  };
  const rawUrl = (commit: string, file: string) =>
    `https://raw.githubusercontent.com/${slug}/${commit}/${clean(file).split('/').map(encodeURIComponent).join('/')}`;

  const reader: RepoReader = {
    async read(file) {
      const t = await tree();
      if (!t.files.has(clean(file))) return null;
      const res = await fetch(rawUrl(t.commit, file), { headers: { Authorization: headers.Authorization } });
      if (!res.ok) throw new Error(`GitHub raw ${file}: ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    },
    async readText(file) {
      return (await reader.read(file))?.toString('utf8') ?? null;
    },
    async exists(file) {
      return (await tree()).files.has(clean(file));
    },
    async files(dir) {
      return [...(await tree()).files.keys()].filter((f) => within(f, dir));
    },
  };

  const write = async (puts: Map<string, Buffer>, removes: Set<string>, message: string) => {
    // upload the new files once; the tree and commit are rebuilt if the branch moved meanwhile
    const blobs = new Map<string, string>();
    for (const [file, data] of puts) {
      const b = await api<{ sha: string }>('/git/blobs', { method: 'POST', body: { content: data.toString('base64'), encoding: 'base64' } });
      blobs.set(file, b.sha);
    }
    for (let attempt = 0; ; attempt++) {
      cached = null;
      const base = await tree();
      const entries = [
        ...[...blobs].map(([p, sha]) => ({ path: p, mode: '100644', type: 'blob', sha })),
        ...[...removes].filter((p) => base.files.has(p)).map((p) => ({ path: p, mode: '100644', type: 'blob', sha: null })),
      ];
      if (!entries.length) return;
      const t = await api<{ sha: string }>('/git/trees', { method: 'POST', body: { base_tree: base.tree, tree: entries } });
      const c = await api<{ sha: string }>('/git/commits', {
        method: 'POST',
        body: { message, tree: t.sha, parents: [base.commit], author: { name: 'Hello Robo CMS', email: 'cms@hellorobo.co' } },
      });
      try {
        await api(`/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'PATCH', body: { sha: c.sha, force: false } });
        cached = null;
        return;
      } catch (err) {
        // someone else committed in between: try again on top of theirs
        if ((err as { status?: number }).status !== 422 || attempt >= 3) throw err;
      }
    }
  };

  return {
    ...reader,
    async size(file) {
      return (await tree()).files.get(clean(file))?.size ?? null;
    },
    changeset: () => overlay(reader, write),
    remote: {
      headers: { Authorization: headers.Authorization },
      async url(file) {
        const t = await tree();
        return t.files.has(clean(file)) ? rawUrl(t.commit, file) : null;
      },
    },
  };
}

// --- Which one ---

const slug = GITHUB_REPO || [process.env.VERCEL_GIT_REPO_OWNER, process.env.VERCEL_GIT_REPO_SLUG].filter(Boolean).join('/') || 'Hello-Robo/hellorobowebsite';
const branch = CMS_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || 'main';

/** On Vercel without a token: the server's disk is thrown away, so refuse rather than lose saves */
function unconfigured(): Repo {
  const fail = async (): Promise<never> => {
    throw new Error('The CMS can’t reach the site’s files: GITHUB_TOKEN is not set in the Vercel project (see README “CMS”).');
  };
  return { read: fail, readText: fail, exists: fail, files: fail, size: fail, changeset: () => overlay({ read: fail, readText: fail, exists: fail, files: fail }, fail) };
}

export const repo: Repo = GITHUB_TOKEN
  ? githubRepo(GITHUB_TOKEN, slug, branch)
  : process.env.VERCEL
    ? unconfigured()
    : diskRepo(process.cwd());

/** True when saves go to GitHub (and reach the live site through a Vercel build) */
export const savesToGitHub = !!GITHUB_TOKEN;
