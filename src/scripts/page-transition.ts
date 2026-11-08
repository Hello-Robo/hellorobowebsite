/**
 * Page to page transition — after the reference (and toyfight.co): the page shrinks to 90%
 * towards the middle of the screen, on black (desktop), and black columns rise from the
 * bottom, a beat apart left to right, until the screen is black (Figma "transition" 10434:7805). Then the
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
import { isDesktop, reducedMotion } from './media-query';

const html = document.documentElement;
const reduced = reducedMotion;
/** the shrink is desktop only: on a phone, scaling the whole page made it one huge layer
 *  (every block of a long page at once) just as the next page starts loading */
const KEY = 'pt';

/** the columns start rising this far into the page's shrink to 90% (SHRINK, below): they
 * overlap it, so the cover comes on while the page is still moving */
const SHRINK_LEAD_MS = 100;
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
  unshrink();
  html.classList.add('pt-cover');
  html.classList.remove('pt-cover', 'pt-in', 'pt-hold', 'pt-load');
  html.classList.add('pt-out');
  await wait(UNCOVER_MS + 50);
  html.classList.remove('pt-out');
}

/** What shrinks: everything on the page but the transition itself */
const shrinking = () =>
  [...document.body.children].filter(
    (el): el is HTMLElement => el instanceof HTMLElement && !el.matches('.pt, script, style, template, link, astro-dev-toolbar'),
  );

/** Shrink the page to 90% around the middle of the screen. Each part scales around that same
 * point, so they all move as one picture — fixed bars and the scrolled page alike. The point
 * is measured from where the part sits before its own transform (transform-origin is), so a
 * bar centred with translateX(-50%) — the nav pill, wider still with the menu open — doesn't
 * drift sideways as it shrinks. Web Animations, so the parts' own CSS transitions and
 * animations are left alone */
const SHRINK = { duration: 825, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' as const };
let shrinks: Animation[] = [];
function shrink() {
  const cx = innerWidth / 2;
  const cy = innerHeight / 2;
  const parts = shrinking().map((el) => {
    const r = el.getBoundingClientRect();
    const t = getComputedStyle(el).transform;
    const m = t && t !== 'none' ? new DOMMatrix(t) : null;
    // (a plain translate: take it off to find the box's own place)
    return { el, x: cx - (r.left - (m?.e ?? 0)), y: cy - (r.top - (m?.f ?? 0)) };
  });
  html.classList.add('pt-shrink');
  shrinks = parts.map(({ el, x, y }) => {
    el.style.transformOrigin = `${x}px ${y}px`;
    return el.animate([{ scale: '1' }, { scale: '0.9' }], SHRINK);
  });
}

function unshrink() {
  for (const a of shrinks) a.cancel();
  shrinks = [];
  html.classList.remove('pt-shrink');
  for (const el of shrinking()) el.style.transformOrigin = '';
}

/** Shrink the page, cover it, show the loading screen, then go to `url` */
async function leave(url: string) {
  html.classList.remove('pt-out');
  if (isDesktop()) {
    shrink();
    await wait(SHRINK_LEAD_MS);
  }
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
