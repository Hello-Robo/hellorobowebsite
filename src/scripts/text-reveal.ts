/**
 * Reading text reveal — after the reference recording: when a paragraph comes into view its
 * words light up one after another, dim to full, in reading order. Triggered like the
 * headlines (headline-reveal.ts): it plays once, on its own time (DURATION), as soon as the
 * paragraph is on screen, whatever the scrolling pace; text already scrolled past when the
 * page opens shows lit.
 * Body text only — paragraphs and list items in the body sizes; anything set in a heading
 * style (H1–H3, big statements) rises like the headlines instead (headline-reveal.ts). Not links, buttons, the menu, the footer, or blocks that already move
 * their text (contact block, Services scroller, Robo Radio clips, Careers values, the
 * wheels, Team canvas). Off for reduced motion.
 *
 * Groups of pictures do the same: in a `[data-reveal-group]` each `[data-reveal-item]` is
 * one "word" — dim (grey) to full, one after another in page order, e.g. Home's client
 * logos.
 */

import { uncovered } from './uncovered';

const TEXT = 'main p, main li, main blockquote, main dd';
const SKIP = [
  'h1', 'h2', 'h3', '.t-h1', '.t-h2', '.t-h3', 'a', 'button', 'label',
  '.site-menu', '.nav-pill', '.footer', '.contact', '.services-scroller', '.radio-clips',
  '.careers-values__scroller', '.home-showcase__titles', '.project-wheel', '.work-wheel', '.project-cards',
  '.team', '.careers-positions', '.visually-hidden', '[aria-hidden="true"]', '.has-hover-fx',
].join(',');
/** dimmest a word gets */
const FLOOR = 0.15;
/** share of the reveal each word takes (the rest is the stagger) */
const SPAN = 0.3;
/** how long a paragraph takes to light up */
const DURATION = 1000;
/** on screen when the page opens: it starts a moment after the headlines */
const LOAD_DELAY = 350;

/** `start`: when it began lighting up (ms) */
type Para = { el: HTMLElement; words: HTMLElement[]; last: number[]; start: number };

function split(el: HTMLElement): HTMLElement[] {
  const words: HTMLElement[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    // text inside links stays as it is (and keeps its own hover)
    acceptNode: (n) => (n.parentElement?.closest('a, button') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const texts: Text[] = [];
  for (let t = walker.nextNode(); t; t = walker.nextNode()) texts.push(t as Text);
  for (const text of texts) {
    const frag = document.createDocumentFragment();
    for (const part of text.nodeValue!.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        frag.append(part);
        continue;
      }
      const w = document.createElement('span');
      w.className = 'tr-word';
      w.textContent = part;
      words.push(w);
      frag.append(w);
    }
    text.replaceWith(frag);
  }
  return words;
}

if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const paras: Para[] = [];
  for (const el of document.querySelectorAll<HTMLElement>(TEXT)) {
    if (el.closest(SKIP) || el.querySelector('.mask, .hl-mask')) continue;
    // a list item holding paragraphs: the paragraphs do it
    if (el.querySelector('p, li, blockquote, dd')) continue;
    if (el.textContent!.trim().length < 30) continue;
    // body sizes only (a big statement without a heading class is still a headline)
    if (parseFloat(getComputedStyle(el).fontSize) > 26) continue;
    const words = split(el);
    if (words.length < 4) continue;
    paras.push({ el, words, last: [], start: 0 });
  }
  // picture groups (the client logos): each item lights up like a word
  for (const el of document.querySelectorAll<HTMLElement>('[data-reveal-group]')) {
    const words = [...el.querySelectorAll<HTMLElement>('[data-reveal-item]')];
    if (words.length) paras.push({ el, words, last: [], start: 0 });
  }

  const active = new Set<Para>();
  let frame = 0;

  /** each word's opacity at `progress` (0 all dim … 1 all lit), in reading order */
  const paint = (p: Para, progress: number) => {
    const n = p.words.length;
    p.words.forEach((w, i) => {
      const start = (i / n) * (1 - SPAN);
      const t = Math.min(1, Math.max(0, (progress - start) / SPAN));
      const o = Math.round((FLOOR + (1 - FLOOR) * t) * 50) / 50;
      if (p.last[i] !== o) {
        p.last[i] = o;
        w.style.opacity = o === 1 ? '' : String(o);
      }
    });
  };
  const update = () => {
    frame = 0;
    const now = performance.now();
    for (const p of active) {
      const progress = Math.min(1, Math.max(0, (now - p.start) / DURATION));
      paint(p, progress);
      if (progress >= 1) active.delete(p);
    }
    if (active.size) frame = requestAnimationFrame(update);
  };
  const play = (p: Para, delay: number) => {
    p.start = performance.now() + delay;
    active.add(p);
    if (!frame) frame = requestAnimationFrame(update);
  };

  // everything starts dim, except what's already been scrolled past
  const later: Para[] = [];
  for (const p of paras) {
    if (p.el.getBoundingClientRect().bottom <= 0) continue;
    paint(p, 0);
    later.push(p);
  }
  // plays once it's on screen, like the headlines (what's on screen when the page opens:
  // once the page transition has uncovered it, a moment after the headlines)
  let opening = true;
  const seen = new IntersectionObserver(
    (entries) => {
      const delay = opening ? LOAD_DELAY : 0;
      opening = false;
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        seen.unobserve(e.target);
        const p = later.find((q) => q.el === e.target)!;
        uncovered.then(() => play(p, delay));
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  later.forEach((p) => seen.observe(p.el));
}
