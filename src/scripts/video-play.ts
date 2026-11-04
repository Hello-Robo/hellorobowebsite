/**
 * Looping background videos play only while they can be seen.
 *
 * A video opts in with `data-autoplay` (instead of the `autoplay` attribute) and starts with
 * preload="none". It loads once it comes near the screen and plays while it is near the
 * screen, laid out (not display: none) and visible (not visibility: hidden — the slideshows
 * hide every picture but the current one that way). Otherwise it is paused.
 *
 * Why: the Home page has a showreel and every project reel twice (the desktop wheel and the
 * phone cards). With `autoplay` they all downloaded and decoded at once, and phones ran out of
 * memory: iOS dropped the tab, which reloaded it or showed "Can't open this page".
 */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const videos = [...document.querySelectorAll<HTMLVideoElement>('video[data-autoplay]')];
const near = new Set<HTMLVideoElement>();

const canShow = (v: HTMLVideoElement) =>
  document.visibilityState === 'visible' && v.offsetWidth > 0 && getComputedStyle(v).visibility === 'visible';

const update = () => {
  for (const v of videos) {
    const on = near.has(v) && canShow(v);
    if (on) {
      if (v.preload === 'none') v.preload = reduced ? 'metadata' : 'auto';
      if (!reduced && v.paused) v.play().catch(() => {});
    } else if (!v.paused) {
      v.pause();
    }
  }
};

if (videos.length) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const v = e.target as HTMLVideoElement;
        if (e.isIntersecting) near.add(v);
        else near.delete(v);
      }
      update();
    },
    { rootMargin: '50% 0px' },
  );
  for (const v of videos) io.observe(v);
  // The slideshows switch which picture is visible as you scroll; check the near ones often
  setInterval(() => {
    if (near.size) update();
  }, 250);
  document.addEventListener('visibilitychange', update);
}
