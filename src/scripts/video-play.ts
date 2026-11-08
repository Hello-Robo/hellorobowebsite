/**
 * Looping background videos play only while they can be seen.
 *
 * A video opts in with `data-autoplay` (instead of the `autoplay` attribute) and starts with
 * preload="none". It loads once it comes near the screen and plays while it is near the
 * screen, laid out (not display: none) and visible (not visibility: hidden — the slideshows
 * hide every picture but the current one that way). Otherwise it is paused.
 *
 * Phones go further: one video at a time (the one taking most of the screen; in a slideshow
 * mid-change, the picture coming in), and a video that has left the screen or is hidden (a
 * slideshow's other pictures) is unloaded, so its decoded frames don't stay in memory. The
 * project reels are 1080p WebM, which phones decode in software: two at once (a slideshow
 * changing over) was enough to run out.
 *
 * Why: the Home page has a showreel and every project reel twice (the desktop wheel and the
 * phone cards). With `autoplay` they all downloaded and decoded at once, and phones ran out of
 * memory: iOS dropped the tab, which reloaded it or showed "Can't open this page".
 */
import { PHONE, reducedMotion } from './media-query';
const reduced = reducedMotion;
const phone = matchMedia(PHONE);
const videos = [...document.querySelectorAll<HTMLVideoElement>('video[data-autoplay]')];
const near = new Set<HTMLVideoElement>();

const canShow = (v: HTMLVideoElement) =>
  document.visibilityState === 'visible' && v.offsetWidth > 0 && getComputedStyle(v).visibility === 'visible';

/** how much of the screen the video covers (px²) */
const onScreen = (v: HTMLVideoElement) => {
  const r = v.getBoundingClientRect();
  const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
  const h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
  return Math.max(0, w) * Math.max(0, h);
};
/** stacking order among slideshow pictures sharing one spot: the one coming in is on top */
const layer = (v: HTMLVideoElement) => {
  for (let el: HTMLElement | null = v; el; el = el.parentElement) if (el.style.zIndex) return Number(el.style.zIndex) || 0;
  return 0;
};

/** stop a video and drop what it has loaded (it loads again when it comes back) */
const unload = (v: HTMLVideoElement) => {
  if (v.readyState === 0 && v.networkState !== HTMLMediaElement.NETWORK_LOADING) return;
  v.pause();
  v.preload = 'none';
  v.load();
};

const update = () => {
  let only: HTMLVideoElement | null = null;
  if (phone.matches) {
    // the one video a phone plays: most of the screen, then the top picture of a slideshow
    let best = -1;
    for (const v of videos) {
      if (!near.has(v) || !canShow(v)) continue;
      const score = onScreen(v) + layer(v) * 1e-3;
      if (score > best) {
        best = score;
        only = v;
      }
    }
  }
  for (const v of videos) {
    const on = near.has(v) && canShow(v) && (!phone.matches || v === only);
    if (on) {
      if (v.preload === 'none') v.preload = reduced ? 'metadata' : 'auto';
      if (!reduced && v.paused) v.play().catch(() => {});
    } else if (phone.matches && (!near.has(v) || !canShow(v))) {
      // off screen, or a slideshow picture not showing: let go of it entirely
      unload(v);
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
  // Leaving the page: the browser may keep it (back / forward cache) with its videos' frames
  // in memory while the next page loads. Let go of them; they load again if it comes back.
  addEventListener('pagehide', () => videos.forEach(unload));
  addEventListener('pageshow', (e) => {
    if (e.persisted) update();
  });
}
