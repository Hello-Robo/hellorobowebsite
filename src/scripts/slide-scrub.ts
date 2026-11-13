/**
 * Image-to-image transition for every slideshow (Home showcase, Services, Robo Radio clips,
 * the project wheels and cards) — after floema.com: the next picture isn't moved in, it's
 * uncovered. A clip rises from the bottom of the frame and shows it over the current one,
 * following the scroll (or the wheel's turn) rather than a timer, so it goes exactly as fast
 * as the reader and reverses when they scroll back. Inside the frame each picture drifts
 * slowly upward and zooms a touch over its whole time on screen (parallax), and the position
 * eases after the input, so nothing ever jumps.
 *
 * `set(p)`: p is the slideshow's position in pictures — 0 = the first, 1 = the second… The
 * switch between picture i and i + 1 happens around p = i + 0.5 (where the blocks switch
 * their text), the uncovering taking WIDTH of a picture's share of the scroll.
 * Layers: absolutely placed, one per picture, in their frame (which clips them); the
 * picture inside (img / video, or the box marked data-drift when a still and its video sit
 * together) gets the drift. `wrap`: the wheels go round, so after the last picture comes the
 * first.
 */
import { PHONE, reducedMotion } from './media-query';

/** share of a picture's scroll the uncovering takes */
const WIDTH = 0.85;
/** the drift: px up and down from the middle (share of the frame height), and the zoom */
const DRIFT = 0.05;
const ZOOM_FROM = 1.1;
const ZOOM_TO = 1.13;
/** seconds the shown position takes to cover ~63% of the way to the input */
const SOFT = 0.22;

const reduced = reducedMotion;
/** phones: no will-change (each would keep a full-screen picture as a layer of its own) */
const phone = matchMedia(PHONE).matches;
const clamp = (v: number) => Math.min(1, Math.max(0, v));
/** soft in and out */
const ease = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;

type Options = {
  /** the box the pictures show through, when the layers are bigger than it (default: the layer) */
  frame?: HTMLElement | null;
  wrap?: boolean;
  /** ease the position after the input (off when the input is already eased, e.g. the wheels) */
  smooth?: boolean;
  /** the slow drift and zoom of the picture inside (off for artwork that must stay put, e.g. the Home philosophy chapters) */
  drift?: boolean;
};

export function slideScrub(layers: HTMLElement[], { frame = null, wrap = false, smooth = true, drift = true }: Options = {}) {
  const n = layers.length;
  const inners = layers.map((l) => (drift ? (l.querySelector<HTMLElement>('[data-drift]') ?? l.querySelector<HTMLElement>('img, video')) : null));
  layers.forEach((l, i) => {
    l.style.transition = 'none';
    l.style.translate = 'none';
    if (!phone) l.style.willChange = 'clip-path';
    const inner = inners[i];
    if (inner) {
      inner.style.transition = 'none';
      if (!phone) inner.style.willChange = 'translate, scale';
    }
  });

  let shown = NaN;
  let target = 0;
  let raf = 0;
  let last = 0;

  const render = (p: number) => {
    const box = frame ?? layers[0];
    const h = box.offsetHeight;
    // frame top inside the layers, when the layers are bigger than the frame (px)
    let offset = 0;
    let span = 0;
    if (frame) {
      const fr = frame.getBoundingClientRect();
      const lr = layers[0].getBoundingClientRect();
      offset = fr.top - lr.top;
      span = fr.height;
    }
    const base = Math.floor(p);
    layers.forEach((layer, j) => {
      // which turn of the wheel this picture is on: the one nearest the position
      const v = wrap ? j + n * Math.round((p - j) / n) : j;
      const start = v - 0.5 - WIDTH / 2;
      const first = !wrap && j === 0;
      const r = first ? 1 : ease(clamp((p - start) / WIDTH));
      // hidden until it starts, and once the next one has covered it
      const covered = !(wrap || j < n - 1) ? false : p >= v + 0.5 + WIDTH / 2;
      const shownNow = r > 0 && !covered;
      layer.style.visibility = shownNow ? 'visible' : 'hidden';
      if (!shownNow) return;
      layer.style.zIndex = String(v - base + 3);
      const top = frame ? `${(offset + (1 - r) * span).toFixed(1)}px` : `${((1 - r) * 100).toFixed(2)}%`;
      layer.style.clipPath = r >= 1 && !frame ? 'none' : `inset(${top} 0 0 0)`;
      // the drift over its whole time on screen: from its start to being covered
      const t = clamp((p - start) / (1 + WIDTH));
      const inner = inners[j];
      if (inner) {
        inner.style.translate = `0 ${((0.5 - t) * 2 * DRIFT * h).toFixed(1)}px`;
        inner.style.scale = (ZOOM_FROM + (ZOOM_TO - ZOOM_FROM) * t).toFixed(4);
      }
    });
  };

  const tick = (now: number) => {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    shown += (target - shown) * (1 - Math.exp(-dt / SOFT));
    if (Math.abs(target - shown) < 0.0005) {
      shown = target;
      last = 0;
    } else raf = requestAnimationFrame(tick);
    render(shown);
  };

  return {
    set(p: number) {
      if (Number.isNaN(shown) || !smooth || reduced) {
        shown = target = p;
        render(p);
        return;
      }
      // a wheel jumping a whole turn (re-centring) moves the shown position with it
      if (wrap && Math.abs(p - shown) > n / 2) shown += n * Math.round((p - shown) / n);
      target = p;
      if (!raf) raf = requestAnimationFrame(tick);
    },
  };
}
