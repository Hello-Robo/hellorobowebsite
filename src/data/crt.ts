/**
 * The subtle CRT look (first tuned on the Team page's field): faint scanlines and shadow
 * mask, light flicker and static, a soft vignette and gentle colour fringing — so a light
 * picture doesn't look dirty. Used by the Team field and cards, the menu's pictures and the
 * Careers photo strip. Desktop only, like every CrtScreen.
 */
export const CRT_SUBTLE = {
  scanlines: 14,
  mask: 3,
  flicker: 12,
  noise: 4,
  vignette: 9,
  aberration: 6,
  rollSpeed: 0.35,
};
