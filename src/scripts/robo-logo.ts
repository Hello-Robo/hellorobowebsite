/**
 * The nav robot looks where the cursor is (desktop only) — pseudo 3D after the Figma states
 * "nav pill" (10445:145): looking toward a corner its face slides that way and gets smaller,
 * as if the head turned (top left: 4 left, 4 up, 76%; top right: 3 right, 6 up). The face
 * eases after the cursor and drifts back to the middle when the cursor leaves the window.
 * Now and then it blinks (Figma "robo blinks": every part closes to a slit, ~21% high),
 * sometimes twice. Off on touch screens, phones and for reduced motion.
 * On a "nope" (a contact form error, a click on an NDA project) it blinks 4 times in a
 * row: blinkLogo() below, on every screen size (still not with reduced motion).
 */
import { isDesktop, reducedMotion } from './media-query';

/** Blink the nav robot `times` times, one blink every 250 ms (the NDA tag's rhythm) */
export const blinkLogo = (times = 4) => dispatchEvent(new CustomEvent('robo:blink', { detail: times }));

const logo = document.querySelector<SVGSVGElement>('[data-robo-alive]');
const face = logo?.querySelector<SVGGElement>('.robo-logo__face');

/** the face's middle in the 70×40 logo */
const CX = 34.53;
const CY = 19.84;
/** furthest the face moves (logo units) and how much smaller it gets, looking all the way */
const MOVE_X = 4;
const MOVE_Y = 5;
const SHRINK_X = 0.24;
const SHRINK_Y = 0.2;
/** cursor distance (px), up / down and sideways, at which the robot looks halfway round */
const REACH = 160;
const EASE = 0.12;
const BLINK = 0.21;

const desktop = { get matches() { return isDesktop(); } };
const reduced = reducedMotion;

if (logo && face && !reduced) {
  let x = 0;
  let y = 0;
  let toX = 0;
  let toY = 0;
  let frame = 0;

  const draw = () => {
    const m = Math.min(1, Math.hypot(x, y));
    const sx = 1 - SHRINK_X * m;
    const sy = 1 - SHRINK_Y * m;
    face.setAttribute(
      'transform',
      `translate(${(CX + x * MOVE_X).toFixed(2)} ${(CY + y * MOVE_Y).toFixed(2)}) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(${-CX} ${-CY})`,
    );
  };
  const tick = () => {
    frame = 0;
    x += (toX - x) * EASE;
    y += (toY - y) * EASE;
    if (Math.abs(toX - x) < 0.002 && Math.abs(toY - y) < 0.002) {
      x = toX;
      y = toY;
    } else frame = requestAnimationFrame(tick);
    draw();
  };
  const run = () => {
    if (!frame) frame = requestAnimationFrame(tick);
  };

  const look = (e: PointerEvent) => {
    if (!desktop.matches || e.pointerType !== 'mouse') return;
    const r = logo.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    // each way on its own, leaning in more the further away the cursor is (never quite all
    // the way), so a cursor in a corner of the screen gives Figma's corner looks
    toX = dx / (Math.abs(dx) + REACH);
    toY = dy / (Math.abs(dy) + REACH);
    run();
  };
  const rest = () => {
    toX = 0;
    toY = 0;
    run();
  };
  addEventListener('pointermove', look, { passive: true });
  document.documentElement.addEventListener('pointerleave', rest);
  addEventListener('blur', rest);

  // blink every 2.5–6 s, now and then twice
  let busy = false; // a "nope" run of blinks: the idle blinks wait
  const blinkOnce = (then?: () => void) => {
    face.style.setProperty('--blink', String(BLINK));
    setTimeout(() => {
      face.style.removeProperty('--blink');
      if (then) setTimeout(then, 140);
    }, 110);
  };
  const next = () =>
    setTimeout(() => {
      if (desktop.matches && !document.hidden && !busy) blinkOnce(Math.random() < 0.3 ? () => blinkOnce() : undefined);
      next();
    }, 2500 + Math.random() * 3500);
  next();

  // "nope": `times` blinks in a row (blinkLogo); a new one while it runs is ignored
  addEventListener('robo:blink', (e) => {
    if (busy) return;
    busy = true;
    let left = Math.max(1, Number((e as CustomEvent).detail) || 4);
    const again = () => (--left > 0 ? blinkOnce(again) : setTimeout(() => (busy = false), 140));
    blinkOnce(again);
  });
}
