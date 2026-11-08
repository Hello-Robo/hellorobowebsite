/**
 * Pixel helpers for the hover effect (button-hover.ts): draw something at a fraction of its
 * resolution, leave some blocks out, scale it back up without smoothing — the chunky
 * "pixel" look.
 */

/**
 * Draws `draw` (into a w×h context) at 1/size resolution, scales it up without smoothing, then
 * knocks a share of the blocks out. Never reads pixels back: browsers with fingerprinting
 * protection (Safari, Brave…) blank or scramble canvas read-back, which left the label empty.
 */
export function pixelFrame(
  canvas: HTMLCanvasElement,
  size: number,
  holes: number,
  draw: (c: CanvasRenderingContext2D, w: number, h: number) => void,
) {
  const dpr = canvas.width / (canvas.clientWidth || canvas.width) || 1;
  const w = Math.max(1, Math.round(canvas.width / dpr / size));
  const h = Math.max(1, Math.round(canvas.height / dpr / size));
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  draw(small.getContext('2d')!, w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // a few times over: the soft edges of the tiny drawing build up into solid blocks
  for (let i = 0; i < 4; i++) ctx.drawImage(small, 0, 0, canvas.width, canvas.height);
  const bw = canvas.width / w;
  const bh = canvas.height / h;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (Math.random() < holes) ctx.clearRect(Math.floor(x * bw), Math.floor(y * bh), Math.ceil(bw), Math.ceil(bh));
}

export function makeCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.className = 'hover-fx__pixels';
  canvas.setAttribute('aria-hidden', 'true');
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.ceil(w * dpr);
  canvas.height = Math.ceil(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  return canvas;
}
