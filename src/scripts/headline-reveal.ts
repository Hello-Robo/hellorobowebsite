/**
 * Headline reveal — after the reference recording: when a headline scrolls into view, its
 * words slide up out of their line one after another (the line clips them), the next line
 * following the first. Every h1 / h2 / h3 and every text set in a heading style (H1–H3,
 * e.g. the big statement paragraphs) on the site — body text has the reading reveal
 * (text-reveal.ts) instead — except blocks that
 * already move their titles (Services scroller, Robo Radio clips, Careers values, the
 * contact block, the Home showcase slides and philosophy chapters, the wheels, the menu) and labels that run the
 * hover scramble. Runs once per headline; off for reduced motion. Without JS, headlines
 * simply show.
 *
 * Those slide blocks only moved their words when the slide changed, so their first slide
 * just sat there: it waits below its masks (.slide-wait, global.css) until it scrolls
 * into view, then slides up with the block's own motion.
 */

const HEADLINES = 'h1, h2, h3, .t-h1, .t-h2, .t-h3';
const SKIP = [
  '.footer',
  '.nav-pill',
  'a',
  'button',
  '.services-scroller',
  '.radio-clips',
  '.careers-values__scroller',
  '.contact',
  '.home-showcase__titles',
  '.home-philosophy__texts',
  '.project-wheel',
  '.work-wheel',
  '.project-cards',
  '.team',
  '.site-menu',
  '.visually-hidden',
  '[aria-hidden="true"]',
  '.has-hover-fx',
].join(',');

import { uncovered } from './uncovered';
import { reducedMotion } from './media-query';
import { splitWords } from './split-words';

/** each word sits in a clipping box and rises into it (55ms after the one before: global.css) */
const split = (h: HTMLElement) =>
  splitWords(h, {
    className: 'hl-word',
    stagger: true,
    wrap: (word) => {
      const mask = document.createElement('span');
      mask.className = 'hl-mask';
      mask.append(word);
      return mask;
    },
  }).length;

if (!reducedMotion) {
  // headings, and big statement paragraphs without a heading class
  const big = [...document.querySelectorAll<HTMLElement>('main p')].filter((p) => !p.matches(HEADLINES) && parseFloat(getComputedStyle(p).fontSize) > 26);
  const heads = [...document.querySelectorAll<HTMLElement>(HEADLINES), ...big].filter(
    (h) =>
      !h.closest(SKIP) &&
      !h.querySelector('.has-hover-fx, .hover-fx__label') &&
      // an H1/H2 style inside a heading is the same headline
      !h.parentElement?.closest(HEADLINES) &&
      h.textContent!.trim(),
  );
  const seen = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        // not while the page transition still covers the page
        uncovered.then(() => e.target.classList.add('is-in'));
        seen.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  for (const h of heads) {
    if (!split(h)) continue;
    h.classList.add('hl-ready');
    seen.observe(h);
  }

  // first slides of the slide blocks: in when they come into view
  const firsts = document.querySelectorAll<HTMLElement>(
    ':is(.services-scroller__slide, .radio-clips__slide, .careers-values__copy, .home-showcase__title, .home-showcase__services, .home-showcase__stamp, .home-philosophy__text, .project-wheel__services, .project-wheel__mark)[data-index="0"][data-state="current"]',
  );
  const slideSeen = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        uncovered.then(() => e.target.closest('.slide-wait')?.classList.remove('slide-wait'));
        slideSeen.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -12% 0px' },
  );
  // a slide drawn as `display: contents` has no box to watch: watch its text (all the
  // reads first, then the writes)
  const watched = [...firsts].map((el) => (getComputedStyle(el).display === 'contents' ? el.firstElementChild! : el));
  firsts.forEach((el, i) => {
    el.classList.add('slide-wait');
    slideSeen.observe(watched[i]);
  });
}
