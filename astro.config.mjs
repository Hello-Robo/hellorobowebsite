// @ts-check
import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  // Site pages are prerendered (static). Only the CMS under /admin and the contact form's
  // /api/contact render on demand, as Vercel functions (each sets `prerender = false`).
  output: 'static',
  adapter: vercel(),
  devToolbar: { enabled: false },
  security: {
    // Hosts the server trusts in the Host header. The CMS checks that form posts come
    // from the same origin, so the live domain has to be listed here.
    allowedDomains: [
      { hostname: 'hellorobo.co', protocol: 'https' },
      { hostname: 'www.hellorobo.co', protocol: 'https' },
      // the Vercel project and its preview deployments
      { hostname: '*.vercel.app', protocol: 'https' },
      { hostname: 'localhost' },
      { hostname: '127.0.0.1' },
    ],
  },
  env: {
    schema: {
      // CMS login. Both live in the git-ignored .env (locally) or the host's env vars.
      // `npm run cms:user` manages them — see README "CMS".
      CMS_USERS: envField.string({ context: 'server', access: 'secret', optional: true }),
      CMS_SESSION_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      // On Vercel: the CMS saves by committing to the repo (src/cms/repo.ts). A fine-grained
      // token with Contents read/write on this repo only. Unset locally: saves go to disk.
      GITHUB_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Optional overrides: "owner/name" and the branch (default: the deployment's own)
      GITHUB_REPO: envField.string({ context: 'server', access: 'secret', optional: true }),
      CMS_BRANCH: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
});
