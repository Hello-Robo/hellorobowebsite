/**
 * Sound design — after toyfight.co and pensatori-irrazionali.com: short, quiet UI sounds,
 * synthesized in the browser (Web Audio), so there are no audio files to load or license.
 *
 * Every play varies (a few takes of each, pitch / level / timing nudged at random):
 *  hover    a soft blip (double, up or down, pips, chirp…) when the mouse comes onto anything
 *           that reacts to it: buttons and links as their pixel hover starts (button-hover.ts),
 *           everything else here (pictures, cards, project names, team objects, labels…)
 *  tick     a tiny digital tick on each frame of the letters settling (very quiet, high)
 *  click    a short bright click on press
 *  error    a low two-note "nope" when the contact form shows an error
 *  success  a rising three-note robot chirp when the form is sent
 *
 * Browsers only let a page make sound after the visitor has clicked, tapped or pressed a key,
 * so everything is silent until then. Off when the visitor has turned it off
 * (localStorage "sound" = "off"). Presses on buttons and links click on their own, and
 * hovers on whatever has no pixel hover blip here too (below); the pixel hover's blip, the
 * ticks and the form sounds are called by button-hover.ts and the contact block.
 */

type Name = 'hover' | 'tick' | 'click' | 'error' | 'success';

const VOLUME = 0.32;

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let noise: AudioBuffer | null = null;
const last: Partial<Record<Name, number>> = {};
/** least ms between two of the same sound (hovering along a row of links) */
const GAP: Record<Name, number> = { hover: 70, tick: 30, click: 40, error: 300, success: 600 };

const off = () => {
  try {
    return localStorage.getItem('sound') === 'off';
  } catch {
    return false;
  }
};

/** the audio starts on the visitor's first click / tap / key */
function unlock() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  out = ctx.createGain();
  out.gain.value = VOLUME;
  // keep the tops soft
  const soft = ctx.createBiquadFilter();
  soft.type = 'lowpass';
  soft.frequency.value = 9000;
  out.connect(soft).connect(ctx.destination);
  noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.05), ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
// (iOS only counts the end of a tap, other browsers the start)
for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown']) addEventListener(type, unlock, { passive: true, capture: true });

/** one tone: `f0` falling / rising to `f1`, `dur` s, decaying from `vol` */
function tone(at: number, f0: number, f1: number, dur: number, vol: number, wave: OscillatorType = 'square') {
  if (!ctx || !out) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = wave;
  o.frequency.setValueAtTime(f0, at);
  o.frequency.exponentialRampToValueAtTime(f1, at + dur);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.02);
}

/** a burst of noise through a band around `freq` */
function burst(at: number, freq: number, dur: number, vol: number) {
  if (!ctx || !out || !noise) return;
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = freq;
  band.Q.value = 6;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  s.connect(band).connect(g).connect(out);
  s.start(at);
  s.stop(at + dur + 0.01);
}

export function sfx(name: Name) {
  if (!ctx || ctx.state !== 'running' || off()) return;
  const now = performance.now();
  if (now - (last[name] ?? -1e9) < GAP[name]) return;
  last[name] = now;
  const t = ctx.currentTime + 0.005;
  // every play a little different: a few takes of each sound, then pitch, level and timing
  // nudged at random — so a row of hovers never sounds like the same sample over and over
  const p = vary(0.08); // pitch
  const v = vary(0.2); // level
  const d = vary(0.15); // timing
  switch (name) {
    case 'hover':
      take(name, [
        // the double blip, down
        () => {
          tone(t, 1500 * p, 1400 * p, 0.012 * d, 0.12 * v, 'triangle');
          tone(t + 0.022 * d, 1150 * p, 1050 * p, 0.04 * d, 0.22 * v, 'triangle');
        },
        // the double blip, up
        () => {
          tone(t, 1100 * p, 1050 * p, 0.012 * d, 0.12 * v, 'triangle');
          tone(t + 0.024 * d, 1450 * p, 1550 * p, 0.035 * d, 0.2 * v, 'triangle');
        },
        // three quick pips
        () => {
          for (let i = 0; i < 3; i++) tone(t + i * 0.018 * d, (1250 + i * 120) * p, (1200 + i * 120) * p, 0.01, (0.1 + i * 0.04) * v, 'triangle');
        },
        // one soft chirp
        () => tone(t, 950 * p, 1500 * p, 0.045 * d, 0.2 * v, 'sine'),
        // a blip with a breath of noise
        () => {
          burst(t, 3000 * p, 0.01, 0.08 * v);
          tone(t + 0.012, 1300 * p, 1200 * p, 0.04 * d, 0.2 * v, 'triangle');
        },
      ]);
      break;
    case 'tick':
      take(name, [
        () => burst(t, 4000 + Math.random() * 5000, 0.012 * d, 0.18 * v),
        () => burst(t, 6000 + Math.random() * 4000, 0.007, 0.2 * v),
        () => tone(t, (3500 + Math.random() * 3000) * p, 3000 * p, 0.008, 0.06 * v, 'square'),
      ]);
      break;
    case 'click':
      take(name, [
        () => {
          burst(t, 5500 * p, 0.006, 0.35 * v);
          tone(t, 2600 * p, 1700 * p, 0.05 * d, 0.22 * v);
        },
        () => {
          burst(t, 4500 * p, 0.008, 0.32 * v);
          tone(t, 2200 * p, 1500 * p, 0.04 * d, 0.2 * v, 'triangle');
        },
        () => {
          burst(t, 7000 * p, 0.005, 0.38 * v);
          tone(t, 3000 * p, 2100 * p, 0.035 * d, 0.18 * v);
        },
      ]);
      break;
    // the form sounds stay recognisable: one shape, only nudged
    case 'error':
      tone(t, 190 * p, 175 * p, 0.075 * d, 0.3 * v);
      tone(t + 0.11 * d, 150 * p, 135 * p, 0.13 * d, 0.3 * v);
      break;
    case 'success': {
      const q = vary(0.04);
      tone(t, 660 * q, 680 * q, 0.07, 0.16 * v, 'triangle');
      tone(t + 0.08, 990 * q, 1010 * q, 0.07, 0.16 * v, 'triangle');
      tone(t + 0.16, 1320 * q, 1360 * q, 0.22, 0.18 * v, 'triangle');
      break;
    }
  }
}

/** 1 ± up to `amount`, at random */
const vary = (amount: number) => 1 + (Math.random() * 2 - 1) * amount;

/** plays one of a sound's takes at random, never the same one twice in a row */
const lastTake: Partial<Record<Name, number>> = {};
function take(name: Name, takes: (() => void)[]) {
  let i = Math.floor(Math.random() * takes.length);
  if (i === lastTake[name] && takes.length > 1) i = (i + 1) % takes.length;
  lastTake[name] = i;
  takes[i]();
}

// a click on every press of a button or link (the contact block's cards and steps included)
addEventListener(
  'click',
  (e) => {
    if ((e.target as Element).closest?.('a[href], button, [role="button"], .contact__card')) sfx('click');
  },
  { capture: true },
);

// the hover blip on everything else that reacts to the mouse: picture links, cards, the
// project wheel's names, the Team objects, form labels… (once per element, as the mouse
// comes onto it; the pixel hover already blips for its own buttons and links)
const HOVERABLE =
  'a[href], button, [role="button"], label, summary, select, .contact__card, .team-obj, .project-wheel__name.is-shown, .home-news__link';
let hovered: Element | null = null;
addEventListener(
  'pointerover',
  (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = (e.target as Element).closest?.(HOVERABLE) ?? null;
    if (el === hovered) return;
    hovered = el;
    if (el && !el.closest('.has-hover-fx')) sfx('hover');
  },
  { passive: true, capture: true },
);
