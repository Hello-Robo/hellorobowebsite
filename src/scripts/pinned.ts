/**
 * Pinned scroll blocks — a tall block with a screen-high, sticky stage inside, driven by the
 * scroll through it: the Home showcase, work wheel, philosophy and showreel, the Services
 * scroller, Robo Radio clips, Careers values and the phone project cards.
 *
 * whileNear()  the shared loop: one update per frame while the page scrolls (and on resize),
 *   listening only while the block is near the screen. Before the block every scroll position
 *   gives the same state (progress 0), and after it too (progress 1), so one last update as it
 *   leaves is all it needs out there.
 * pinned()     the progress through the pin, measured against the stage's own height (not
 *   innerHeight, which phone toolbars change while scrolling: the slides would jump). With
 *   `expand`, the first part of the scroll (CSS --expand on the block, a share of the stage's
 *   height) widens the block to the full screen — `enter` 0 → 1 — before `progress` starts.
 * pinnedSlides() one screen of scroll per slide: --progress (and --enter) on the stage, the
 *   pictures uncovered half way between the text switches (slide-scrub.ts), and the slide in
 *   play as data-active on the stage.
 * slideStates() past / current / next on each slide (data-state, by its data-index), the
 *   masked words' motion in global.css; only the current one is read out.
 *
 * Style reads that only change with the window size (--expand, whether the stage is pinned at
 * this size) are made on load and on resize, not every frame.
 */

const clamp = (v: number) => Math.min(1, Math.max(0, v));

type NearOptions = {
  /** on load and on every resize, before the update (read what only the window size changes) */
  onResize?: () => void;
  /** on every scroll event while near (not once per frame) */
  onScroll?: () => void;
};

/** Runs `update` now, then once per frame while the page scrolls with `block` near the
 *  screen, and on resize. Returns a function that asks for an update on the next frame. */
export function whileNear(block: Element, update: () => void, { onResize, onScroll }: NearOptions = {}) {
  let frame = 0;
  const run = () => {
    frame = 0;
    update();
  };
  const request = () => {
    if (!frame) frame = requestAnimationFrame(run);
  };
  const scrolled = () => {
    request();
    onScroll?.();
  };
  let near = false;
  let first = true;
  new IntersectionObserver(
    (entries) => {
      const now = entries[entries.length - 1].isIntersecting;
      if (now !== near) {
        near = now;
        if (near) {
          addEventListener('scroll', scrolled, { passive: true });
          // a jump into the block (keys, a link) scrolled it here without a scroll event heard
          if (!first) onScroll?.();
        } else removeEventListener('scroll', scrolled);
      }
      first = false;
      // catch up as it comes near, and settle on the end state as it leaves
      request();
    },
    { rootMargin: '25% 0px' },
  ).observe(block);
  addEventListener('resize', () => {
    onResize?.();
    request();
  });
  onResize?.();
  update();
  return request;
}

export type Pin = {
  /** 0 → 1 through the pinned scroll (after the widening) */
  progress: number;
  /** 0 → 1 through the widening; 1 when there's none */
  enter: number;
};

export type PinOptions = {
  /** the first part of the scroll widens the block: its share of the stage's height is the
   *  block's CSS --expand */
  expand?: boolean;
  /** false: not in play at this window size (hidden, or not pinned), no updates. Checked on
   *  load and on resize */
  when?: () => boolean;
};

/** Calls `update` with the progress through the pinned `block`, once per frame while it
 *  scrolls near the screen. Returns a function that asks for an update. */
export function pinned(block: HTMLElement, stage: HTMLElement, update: (pin: Pin) => void, { expand = false, when }: PinOptions = {}) {
  let live = true;
  let share = 0;
  return whileNear(
    block,
    () => {
      if (!live) return;
      const rect = block.getBoundingClientRect();
      const height = stage.offsetHeight;
      const travel = rect.height - height;
      const widen = height * share;
      update({
        enter: widen > 0 ? clamp(-rect.top / widen) : 1,
        progress: travel - widen > 0 ? clamp((-rect.top - widen) / (travel - widen)) : 0,
      });
    },
    {
      onResize: () => {
        live = when ? when() : true;
        share = expand ? Number(getComputedStyle(block).getPropertyValue('--expand')) || 0 : 0;
      },
    },
  );
}

type Pictures = { set(p: number): void };

/** One screen of scroll per slide (`count` of them): --progress (and with `expand`, --enter)
 *  on the stage, `pictures` (slideScrub) uncovered half way between the text switches, and
 *  `onSlide` once the slide in play changes (data-active on the stage, 0 to start with). */
export function pinnedSlides(
  block: HTMLElement,
  stage: HTMLElement,
  count: number,
  { pictures = [], onSlide, ...options }: PinOptions & { pictures?: Pictures[]; onSlide: (active: number) => void },
) {
  return pinned(
    block,
    stage,
    ({ progress, enter }) => {
      if (options.expand) stage.style.setProperty('--enter', String(enter));
      stage.style.setProperty('--progress', String(progress));
      const p = Math.min(count - 1, Math.max(0, progress * count - 0.5));
      for (const box of pictures) box.set(p);
      const active = String(Math.min(count - 1, Math.floor(progress * count)));
      if (stage.dataset.active === active) return;
      stage.dataset.active = active;
      onSlide(Number(active));
    },
    options,
  );
}

/** Marks each slide past / current / next for the `active` one (by its data-index), and with
 *  `aria`, hides all but the current one from screen readers */
export function slideStates(slides: Iterable<HTMLElement>, active: number, aria = true) {
  for (const el of slides) {
    const i = Number(el.dataset.index);
    el.dataset.state = i < active ? 'past' : i === active ? 'current' : 'next';
    if (aria) el.setAttribute('aria-hidden', String(i !== active));
  }
}
