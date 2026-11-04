/**
 * Page to page transition — after the reference: black columns rise from the bottom, a beat
 * apart left to right, until the screen is black (Figma "transition" 10434:7805). Then the
 * loading screen shows, the same as on the first page of a visit: site micrographics
 * flicking past and a 1px loading bar that fills as the new page loads (load()); then the
 * columns drop back down, left to right, and the page shows.
 *
 * The overlay is in BaseLayout; an inline script in <head> marks a page that should open
 * covered (html.pt-cover pt-load) before its first paint. Links to other pages of the site
 * are caught here; new tabs, downloads, the CMS, hash links and links other scripts already
 * handle (e.g. Get in touch opening the contact block) are left alone. Back / forward from
 * the browser cache uncovers too. Off for reduced motion.
 */

const html = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const KEY = 'pt';

/** columns rise: 0.63s each, 58ms apart (keep in step with .pt__col in global.css) */
const COVER_MS = 630 + 7 * 58;
/** columns drop back down */
const UNCOVER_MS = 750 + 7 * 63;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A page opened covered: the cover stays up while the loading bar fills with the page's
 * fonts, the pictures it loads straight away and the page load itself (never shorter than
 * MIN_LOAD, never longer than MAX_LOAD), then the page is revealed
 */
const MIN_LOAD = 1035;
const MAX_LOAD = 8000;
async function load() {
  try {
    sessionStorage.setItem('pt-loaded', '1');
  } catch {}
  const fill = document.querySelector<HTMLElement>('[data-pt-bar]');
  const images = [...document.images].filter((img) => img.loading !== 'lazy' && !img.complete && !img.closest('.pt'));
  const tasks: Promise<unknown>[] = [
    document.fonts?.ready ?? Promise.resolve(),
    document.readyState === 'complete' ? Promise.resolve() : new Promise((r) => addEventListener('load', r, { once: true })),
    ...images.map(
      (img) =>
        new Promise((r) => {
          img.addEventListener('load', r, { once: true });
          img.addEventListener('error', r, { once: true });
        }),
    ),
  ];
  let done = 0;
  const show = () => fill?.style.setProperty('--p', String(done / tasks.length));
  show();
  const started = performance.now();
  await Promise.race([Promise.all(tasks.map((t) => t.then(() => (done++, show())))), wait(MAX_LOAD)]);
  done = tasks.length;
  show();
  await wait(Math.max(350, MIN_LOAD - (performance.now() - started)));
  await reveal();
}

/** The new page is in: drop the columns */
async function reveal() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
  html.classList.add('pt-cover');
  html.classList.remove('pt-cover', 'pt-in', 'pt-hold', 'pt-load');
  html.classList.add('pt-out');
  await wait(UNCOVER_MS + 50);
  html.classList.remove('pt-out');
}

/** Cover the page, show the loading screen, then go to `url` */
async function leave(url: string) {
  html.classList.remove('pt-out');
  html.classList.add('pt-in');
  await wait(COVER_MS);
  document.querySelector<HTMLElement>('[data-pt-bar]')?.style.setProperty('--p', '0');
  html.classList.add('pt-hold', 'pt-load');
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {}
  location.assign(url);
}

const isPageLink = (a: HTMLAnchorElement, e: MouseEvent) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if (a.target && a.target !== '_self') return false;
  if (a.hasAttribute('download') || a.getAttribute('href')?.startsWith('#')) return false;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return false;
  if (/^\/(admin|api)(\/|$)/.test(url.pathname)) return false;
  // same page, only the hash changes: let the browser scroll
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return false;
  return true;
};

if (!reduced) {
  // opened covered (from another page of the site): uncover
  if (document.prerendering) {
    // prepared in the background while hovering: shown covered, uncovered on arrival if we
    // came here through the transition
    document.addEventListener(
      'prerenderingchange',
      () => {
        let came = false;
        try {
          came = sessionStorage.getItem(KEY) === '1';
        } catch {}
        if (came) load();
        else html.classList.remove('pt-cover', 'pt-load');
      },
      { once: true },
    );
  } else if (html.classList.contains('pt-load')) {
    load();
  }

  // links to other pages: cover first (bubble phase, after other scripts had their say)
  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest?.<HTMLAnchorElement>('a[href]');
    if (!a || !isPageLink(a, e)) return;
    e.preventDefault();
    leave(a.href);
  });

  // back / forward from the browser cache: the page comes back as it was left (covered)
  addEventListener('pageshow', (e) => {
    if (e.persisted && (html.classList.contains('pt-in') || html.classList.contains('pt-hold'))) reveal();
  });
}
