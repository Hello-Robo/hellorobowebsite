/**
 * The site's device rules, in one place, for every client script.
 *
 * DESKTOP — a mouse and a wide screen: the only place the heavy things run (three.js scenes,
 *   the CRT shader, the page shrink, …). Phones and tablets get the plain versions: every
 *   WebGL context and full-page effect costs memory iOS doesn't have to spare.
 * PHONE — up to 1023px wide (phones and portrait tablets): the layout's breakpoint.
 * reducedMotion — read once, when the page loads.
 *
 * (BaseLayout's inline <head> scripts can't import; they spell the queries out.)
 */
export const DESKTOP = '(hover: hover) and (pointer: fine) and (min-width: 1024px)';
export const PHONE = '(max-width: 1023px)';
export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

export const reducedMotion = matchMedia(REDUCED_MOTION).matches;
/** iPadOS with a Magic Keyboard / trackpad reports hover and a fine pointer and a desktop
 *  (Mac) user agent; its touch points give it away. It keeps the plain versions */
const iPad = navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent);
export const isDesktop = () => !iPad && matchMedia(DESKTOP).matches;
