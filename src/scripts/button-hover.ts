/**
 * Hover for buttons and text links — after exp.fiddle.digital: on hover the label first turns
 * into chunky pixels — a blocky version of the word for a moment, then sparse blocks of two
 * sizes flickering where the letters are (~0.4s) — and only then Japanese characters
 * (katakana) settle into the real word (~a quarter of a second). The label never gets wider
 * than the word: a katakana is about two letters wide, so each one stands in for as many
 * letters as it covers, and the label's width is held for the whole effect. An icon next to
 * it (an arrow, the hexagon) pixelates and flickers with the label and comes back as the
 * letters start; buttons with only an icon (play / pause, close, back) do just that.
 * Every hover varies: the flicker, the katakana, the order they settle in (left, right,
 * from the middle, random) and the pace.
 * Text links: every plain link with a short label (menu, footer, socials, "View →",
 * "Portfolio →", legal pages…), not the ones made of pictures or blocks of text. The button
 * keeps its own colours throughout. With a mouse it plays on hover (leaving early puts
 * everything back); on phones and tablets it plays on press. Off for reduced motion.
 * Other elements can take it too (hoverFx): a label, and a picture that goes to the label's
 * pixels — in blocks of the label's size, with its flicker (the Team page objects and their
 * file names).
 */

import { makeCanvas, pixelFrame } from './pixel';
import { reducedMotion } from './media-query';

const SELECTOR = [
  '.button',
  '.get-in-touch',
  '.site-menu__talk',
  '.nav-pill__toggle',
  '.nav-pill__back',
  '.nav-pill__close',
  '.contact__back',
  '.contact__submit',
  '.contact__next',
  '.contact__card',
  '.radio-tv__btn',
  '.team-card__close',
].join(',');

/** where the words are: the first match inside the button wins. The menu's links and socials:
 * the word inside its reveal mask — the mask itself would get its inner span (the one that
 * slides up as the menu opens) overwritten by the scramble, so after one hover the word sat
 * there unmasked and popped in fully drawn with every later opening */
const LABEL = '[data-copy-label], .button__label, .contact__card > .t-body, .t-button:not(.button), .site-menu__mask > span, :scope > span';

/** links made of more than words: only the named part animates */
const ROW_LINKS: Record<string, string> = {
  '.careers-positions__link': '.careers-positions__title .t-h2',
};

/** text links: plain links with a short label, outside the wheels / Team canvas */
const isTextLink = (a: HTMLAnchorElement) =>
  !a.matches(SELECTOR) &&
  !a.matches(Object.keys(ROW_LINKS).join(',')) &&
  !a.closest('.project-wheel, .work-wheel, .project-cards, .team, [aria-hidden="true"]:not(.site-menu)') &&
  !a.querySelector('img, picture, video, canvas, h1, h2, h3, h4, p, li, ul, div') &&
  a.textContent!.trim().length > 0 &&
  a.textContent!.trim().length <= 40;

/** The characters a scramble uses: Japanese only (katakana) */
const GLYPHS = [...'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン'];
/** Which letters settle first */
const ORDERS = ['left', 'right', 'middle', 'random'] as const;

const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

/** One pixel frame: when (ms from the start), block size (share of the font size), share of
 *  blocks left out */
type PixelStep = { at: number; block: number; holes: number };

/** A fresh look for one hover: the pixel flicker, the glyphs, the settling order, the pace.
 *  After the reference (exp.fiddle.digital): first the word turns into chunky blocks — a
 *  blocky word for a moment, then sparse blocks of two sizes flickering where the letters
 *  are (~half a second) — then random characters settle into the word (~a third). */
function variation(length: number) {
  const pixels: PixelStep[] = [];
  let at = 0;
  // the blocky word
  for (let i = 0; i < 2; i++) {
    pixels.push({ at, block: 0.3, holes: 0.2 + i * 0.1 });
    at += 55 + Math.random() * 20;
  }
  // flicker: sparse blocks, small and big, scattered again every frame
  const flickers = 4 + Math.floor(Math.random() * 2);
  for (let i = 0; i < flickers; i++) {
    pixels.push({ at, block: Math.random() < 0.55 ? 0.5 : 0.9, holes: 0.38 + Math.random() * 0.2 });
    at += 45 + Math.random() * 25;
  }
  const order = pick(ORDERS);
  // frame (from the start of the letters) at which each character settles: all within a few
  // frames, whatever the word's length
  const span = 3 + Math.floor(Math.random() * 2);
  const settleAt = Array.from({ length }, (_, i) => {
    const pos =
      order === 'left' ? i
      : order === 'right' ? length - 1 - i
      : order === 'middle' ? Math.abs(i - (length - 1) / 2) * 2
      : Math.random() * length;
    return 1 + Math.round((pos / Math.max(1, length - 1)) * span + Math.random());
  });
  return { pixels, pixelEnd: at, settleAt, pace: 42 + Math.floor(Math.random() * 14) };
}

const START = 20;
/** an icon's (or picture's) pixel blocks: this share of its height × the frame's block size */
const ICON_SCALE = 0.45;

/** the label's font on a canvas, to measure with */
const measurer = document.createElement('canvas').getContext('2d')!;
function fontOf(cs: CSSStyleDeclaration) {
  measurer.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  if ('letterSpacing' in measurer) (measurer as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
  return measurer;
}

/** how wide each character of `word` is, and the widest katakana, in the label's font */
function widths(word: string, cs: CSSStyleDeclaration) {
  const ctx = fontOf(cs);
  const chars = [...word];
  let x = 0;
  const each = chars.map((_, i) => {
    const next = ctx.measureText(chars.slice(0, i + 1).join('')).width;
    const w = next - x;
    x = next;
    return w;
  });
  return { each, kana: Math.max(...GLYPHS.map((g) => ctx.measureText(g).width)) };
}

/**
 * One scramble frame: the settled characters as they are; each run of unsettled ones turned
 * into katakana, one for every stretch of letters at least as wide as a katakana (so the
 * line never gets wider than the word), the few letters left over at the end of a run shown
 * as themselves.
 */
function scrambled(word: string, settled: (i: number) => boolean, size: { each: number[]; kana: number }) {
  let out = '';
  let run = '';
  let wide = 0;
  const flush = () => {
    out += run;
    run = '';
    wide = 0;
  };
  [...word].forEach((ch, i) => {
    if (ch.trim() === '' || settled(i)) {
      flush();
      out += ch;
      return;
    }
    run += ch;
    wide += size.each[i];
    if (wide >= size.kana) {
      out += pick(GLYPHS);
      run = '';
      wide = 0;
    }
  });
  flush();
  return out;
}

/**
 * Pixel frame for a label: blocks of `px` on a grid over the word, filled where the grid cell
 * falls on a letter (measured, never read back from a canvas — see pixel.ts), less a random
 * share left out. At any text size this gives solid, chunky blocks where the letters are.
 */
function blockFrame(canvas: HTMLCanvasElement, cs: CSSStyleDeclaration, color: string, word: string, px: number, holes: number) {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.clientWidth || parseFloat(canvas.style.width);
  const h = canvas.clientHeight || parseFloat(canvas.style.height);
  const dpr = canvas.width / w;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
  // where each letter is, left to right
  const spans: [number, number][] = [];
  const chars = [...word];
  let x = 0;
  chars.forEach((ch, i) => {
    const next = ctx.measureText(chars.slice(0, i + 1).join('')).width;
    if (ch.trim()) spans.push([x, next]);
    x = next;
  });
  // the letters' height: about the cap height, centred on the line
  const fs = parseFloat(cs.fontSize);
  const top = h / 2 - fs * 0.36;
  const rows = Math.max(1, Math.round((fs * 0.72) / px));
  const cols = Math.ceil(x / px);
  ctx.fillStyle = color;
  for (let c = 0; c < cols; c++) {
    const a = c * px;
    const b = a + px;
    const on = spans.some(([s0, s1]) => Math.min(b, s1) - Math.max(a, s0) > px * 0.35);
    if (!on) continue;
    for (let r = 0; r < rows; r++) if (Math.random() >= holes) ctx.fillRect(Math.round(a), Math.round(top + r * px), Math.ceil(px), Math.ceil(px));
  }
}

/** holds a label at its size for the effect (katakana come from a taller fallback font), and
 *  lets it go */
function hold(lbl: HTMLElement, cs: CSSStyleDeclaration, box: DOMRect) {
  if (cs.display === 'inline') lbl.style.display = 'inline-block';
  lbl.style.width = `${box.width}px`;
  lbl.style.height = `${box.height}px`;
  lbl.style.whiteSpace = 'nowrap';
}
function release(lbl: HTMLElement) {
  lbl.style.display = '';
  lbl.style.width = '';
  lbl.style.height = '';
  lbl.style.whiteSpace = '';
}

type Options = {
  /** a picture (img) that pixelates and flickers like the icons, inside whatever moves it */
  picture?: string;
  /** false: don't play now (e.g. while the Team canvas is being dragged) */
  enabled?: () => boolean;
};

function setup(btn: HTMLElement, labelSelector?: string, opts: Options = {}) {
  // the label: its own span (wrapping a bare text node if needed)
  // in the order of LABEL (not document order: the copy card's words sit inside its .t-body)
  let label: HTMLElement | null = null;
  for (const sel of (labelSelector ?? LABEL).split(',')) if ((label = btn.querySelector<HTMLElement>(sel.trim()))) break;
  if (labelSelector && !label) return;
  if (!label) {
    const text = [...btn.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
    if (text) {
      label = document.createElement('span');
      text.replaceWith(label);
      label.append(text);
    }
  }
  label?.classList.add('hover-fx__label');
  btn.classList.add('has-hover-fx');

  let timers: number[] = [];
  let running = false;
  let word = '';
  /** what the effect last wrote, to notice when the button's own script changes the words */
  let written = '';
  let icon: SVGSVGElement | HTMLImageElement | null = null;
  const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));

  /** stops the effect and puts the label / icon back as they were */
  const settle = () => {
    timers.forEach(clearTimeout);
    timers = [];
    btn.querySelectorAll('.hover-fx__pixels').forEach((c) => c.remove());
    if (icon) icon.style.visibility = '';
    if (label) {
      label.classList.remove('is-pixel');
      if (running) label.textContent = word;
      release(label);
    }
    running = false;
  };

  /** the button's own script changed the words mid-effect ("Email copied"): leave them be */
  const interrupted = (lbl: HTMLElement, canvas: HTMLCanvasElement) => {
    const changed = canvas.isConnected ? false : lbl.classList.contains('is-pixel') || lbl.textContent !== written;
    if (!changed) return false;
    timers.forEach(clearTimeout);
    timers = [];
    lbl.classList.remove('is-pixel');
    release(lbl);
    running = false;
    return true;
  };

  /** the label: pixels, then random letters settling on the word */
  const playText = (lbl: HTMLElement, look: ReturnType<typeof variation>) => {
    word = lbl.textContent!.trim();
    written = lbl.textContent!;
    const box = lbl.getBoundingClientRect();
    if (!word || !box.width) return;
    running = true;
    const cs = getComputedStyle(lbl);
    // hold the width while letters change, so nothing around it moves (an inline label
    // ignores widths: it's an inline block for the effect)
    hold(lbl, cs, box);
    const size = widths(word, cs);
    const canvas = makeCanvas(box.width, box.height);
    // the colour now: hiding the words (is-pixel) makes the live one transparent, which drew
    // every pixel frame invisible
    const color = cs.color;
    lbl.classList.add('is-pixel');
    lbl.append(canvas);
    const fontSize = parseFloat(cs.fontSize);
    for (const { at: t, block, holes } of look.pixels) {
      const px = Math.max(2, fontSize * block);
      at(START + t, () => !interrupted(lbl, canvas) && blockFrame(canvas, cs, color, word, px, holes));
    }
    const start = START + look.pixelEnd;
    const frames = Math.max(...look.settleAt) + 1;
    for (let f = 0; f <= frames; f++) {
      at(start + f * look.pace, () => {
        if (f === 0) {
          if (interrupted(lbl, canvas)) return;
          canvas.remove();
          lbl.classList.remove('is-pixel');
        } else if (lbl.textContent !== written) {
          // changed by the button's own script between frames
          timers.forEach(clearTimeout);
          timers = [];
          running = false;
          release(lbl);
          return;
        }
        lbl.textContent =
          f === frames
            ? word
            : scrambled(word, (i) => f >= look.settleAt[i], size);
        written = lbl.textContent;
        if (f === frames) {
          running = false;
          release(lbl);
        }
      });
    }
  };

  /** the icon pixelates and flickers with the label, then snaps back as the letters start */
  /** a picture (opts.picture): the label's pixels, on the picture — the picture in blocks of
   *  the label's size, with the label's flicker (the same share left out, frame by frame),
   *  then it comes back as the letters start. In its own colours: the Team objects have their
   *  background baked in, so there's no shape to fill with the label's colour. Its canvas goes
   *  in the picture's own box (its parent), placed in that box's own units, so it moves and
   *  scales with whatever moves the picture */
  const playPicture = (look: ReturnType<typeof variation>) => {
    const pic = btn.querySelector<HTMLImageElement>(opts.picture!);
    const host = pic?.parentElement;
    if (!pic || !host || !pic.complete || !pic.naturalWidth || !pic.offsetWidth) return;
    icon = pic;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const w = pic.offsetWidth;
    const h = pic.offsetHeight;
    const canvas = makeCanvas(w, h);
    canvas.style.inset = 'auto';
    canvas.style.left = `${pic.offsetLeft}px`;
    canvas.style.top = `${pic.offsetTop}px`;
    // the label's block size (as the letters')
    const fontSize = parseFloat(getComputedStyle(label ?? btn).fontSize);
    const shape = (s: CanvasRenderingContext2D, cw: number, ch: number) => s.drawImage(pic, 0, 0, cw, ch);
    for (const { at: t, block, holes } of look.pixels) {
      const px = Math.max(2, fontSize * block);
      at(START + t, () => {
        if (!canvas.isConnected) {
          pic.style.visibility = 'hidden';
          host.append(canvas);
        }
        pixelFrame(canvas, px, holes, shape);
      });
    }
    at(START + look.pixelEnd, () => {
      canvas.remove();
      pic.style.visibility = '';
    });
  };

  const playIcon = (look: ReturnType<typeof variation>) => {
    if (opts.picture) return playPicture(look);
    icon = [...btn.querySelectorAll<SVGSVGElement>('svg')].find((s) => !label?.contains(s) && s.getBoundingClientRect().width > 0) ?? null;
    if (!icon) return;
    const box = icon.getBoundingClientRect();
    const own = btn.getBoundingClientRect();
    const color = getComputedStyle(icon).color;
    const svg = icon.cloneNode(true) as SVGSVGElement;
    svg.setAttribute('width', String(box.width));
    svg.setAttribute('height', String(box.height));
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML.replaceAll('currentColor', color))}`;
    if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
    const canvas = makeCanvas(box.width, box.height);
    // inset first: setting it afterwards wiped left / top and misplaced the pixels
    canvas.style.inset = 'auto';
    canvas.style.left = `${box.left - own.left - btn.clientLeft}px`;
    canvas.style.top = `${box.top - own.top - btn.clientTop}px`;
    const shown = icon;
    const begun = performance.now();
    img.onload = () => {
      shown.style.visibility = 'hidden';
      btn.append(canvas);
      // on the label's timeline (the picture took a moment to load)
      const late = performance.now() - begun;
      for (const { at: t, block, holes } of look.pixels) {
        // the icon's blocks: a little finer than the letters' (it's small)
        const px = Math.max(2, box.height * block * ICON_SCALE);
        at(Math.max(0, START + t - late), () => pixelFrame(canvas, px, holes * 0.6, (s, w, h) => s.drawImage(img, 0, 0, w, h)));
      }
      at(Math.max(0, START + look.pixelEnd - late), () => {
        canvas.remove();
        shown.style.visibility = '';
      });
    };
  };

  const play = () => {
    settle();
    const look = variation([...(label?.textContent?.trim() ?? '')].length);
    if (label) playText(label, look);
    playIcon(look);
  };
  const enabled = () => opts.enabled?.() !== false;
  // mouse: on hover, back when it leaves
  btn.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse' && enabled()) play();
  });
  btn.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') settle();
  });
  // phones and tablets: on press (it plays out even after the finger lifts)
  btn.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' && !running && enabled()) play();
  });
}

const reduced = reducedMotion;

/** The same hover for another element: its `label` (selector) scrambles, its `picture`
 *  (selector, in opts) pixelates like the icons */
export function hoverFx(el: HTMLElement, label: string, opts: Options = {}) {
  if (!reduced) setup(el, label, opts);
}

if (!reduced) {
  document.querySelectorAll<HTMLElement>(SELECTOR).forEach((b) => setup(b));
  document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => isTextLink(a) && setup(a));
  for (const [row, label] of Object.entries(ROW_LINKS)) document.querySelectorAll<HTMLElement>(row).forEach((a) => setup(a, label));
}
