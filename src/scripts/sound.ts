/**
 * Sound design — after toyfight.co and pensatori-irrazionali.com: short, quiet UI sounds,
 * synthesized in the browser (Web Audio), so there are no audio files to load or license.
 *
 * Every play varies (a few takes of each, pitch / level / timing nudged at random):
 *  click    a tiny, quiet tick on press, matched to toyfight.co's button sound: a ~3.1 kHz
 *           blip gone in under 2 ms, with a faint ring for ~20 ms after it
 *  error    a low two-note "nope" when the contact form shows an error, or an NDA project is
 *           clicked (it can't open)
 *  success  a rising three-note robot chirp when the form is sent
 *  print    the contact printer feeding a receipt, as a clock movement: struck metallic
 *           tick-tocks, speeding up and slowing down with the paper (as long as the caller
 *           says)
 *  shutter  a real film camera's shutter with each photographer's flash in the home hero:
 *           public/sounds/shutter.m4a, from "Werra.wav" by hmilleo (freesound.org/s/409093,
 *           CC0), a little different each time (pitch and level); a synthesized click until
 *           it has loaded
 *
 * Browsers only let a page make sound after the visitor has clicked, tapped or pressed a key,
 * so everything is silent until then (on desktop the audio is set up and the shutter loaded
 * at once, so it plays from the very first flash wherever the browser allows it, and from
 * the first one after a click everywhere else). Off when the visitor has turned it off
 * (localStorage "sound" = "off"). Presses on buttons and links click on their own (below);
 * the form sounds are called by the contact block. Hovering makes no sound.
 */

type Name = 'click' | 'error' | 'success' | 'shutter' | 'print';

const VOLUME = 0.32;

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let noise: AudioBuffer | null = null;
let shutter: AudioBuffer | null = null;
const last: Partial<Record<Name, number>> = {};
/** least ms between two of the same sound */
const GAP: Record<Name, number> = { click: 40, error: 300, success: 600, shutter: 90, print: 500 };

const off = () => {
  try {
    return localStorage.getItem('sound') === 'off';
  } catch {
    return false;
  }
};

/** sets up the audio graph and loads the recorded shutter */
function init() {
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
  // the recorded shutter: decoding works while the audio is still waiting for a click, so
  // the first flash after it already has the real sound
  const c = ctx;
  // (only the desktop hero's flash uses it)
  if (matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1024px)').matches) fetch('/sounds/shutter.m4a')
    .then((r) => r.arrayBuffer())
    .then((b) => c.decodeAudioData(b))
    .then((buf) => (shutter = buf))
    .catch(() => {});
  noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.05), ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

/** has the visitor clicked / tapped / pressed a key on this page yet */
const activated = () => navigator.userActivation?.hasBeenActive ?? !!ctx;

/** the audio starts on the visitor's first click / tap / key */
function unlock() {
  if (!ctx) init();
  if (!ctx) return;
  if (ctx.state !== 'running') {
    ctx.resume().catch(() => {});
    // Safari only really starts the audio once something plays inside the click itself
    const s = ctx.createBufferSource();
    s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    s.connect(ctx.destination);
    s.start();
  }
}
// (iOS only counts the end of a tap, other browsers the start)
for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown']) addEventListener(type, unlock, { passive: true, capture: true });
// set up and load straight away; browsers that allow sound before a click (a site the visitor
// often plays sound on, or set to allow it) then play from the very first flash. Desktop only:
// on phones it waits for the first tap as before
if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
  try {
    init();
  } catch {
    ctx = null;
  }
}

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

/** The click: a ~1.5 ms sine blip at `freq` (down 37 dB by then), a faint ring of the same
 * pitch for ~20 ms after it, a glint an octave and a half up and a breath of noise */
function tick(at: number, freq: number, vol: number) {
  if (!ctx || !out || !noise) return;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.0003);
  g.gain.exponentialRampToValueAtTime(vol * 0.014, at + 0.0016);
  g.gain.exponentialRampToValueAtTime(vol * 0.0035, at + 0.016);
  g.gain.exponentialRampToValueAtTime(vol * 0.0003, at + 0.024);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + 0.03);
  // a glint up top (~10 kHz), gone within a millisecond
  const hi = ctx.createOscillator();
  hi.type = 'sine';
  hi.frequency.value = freq * 3.2;
  const hg = ctx.createGain();
  hg.gain.setValueAtTime(0, at);
  hg.gain.linearRampToValueAtTime(vol * 0.12, at + 0.0002);
  hg.gain.exponentialRampToValueAtTime(vol * 0.002, at + 0.0012);
  hi.connect(hg).connect(out);
  hi.start(at);
  hi.stop(at + 0.004);
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = freq * 1.1;
  band.Q.value = 6;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(vol * 0.2, at);
  ng.gain.exponentialRampToValueAtTime(vol * 0.006, at + 0.0015);
  ng.gain.exponentialRampToValueAtTime(0.00001, at + 0.02);
  s.connect(band).connect(ng).connect(out);
  s.start(at);
  s.stop(at + 0.025);
}

/** `seconds`: how long it lasts (the print sound) */
export function sfx(name: Name, seconds = 6) {
  if (!ctx || off()) return;
  // the browser can suspend audio after the tab was in the background: wake it and play
  // as soon as it's back (allowed: the visitor has already clicked on this page)
  if (ctx.state === 'suspended') {
    // (before the first click this would only be refused, and warned about, every time)
    if (!activated()) return;
    ctx.resume().then(() => ctx?.state === 'running' && sfx(name, seconds), () => {});
    return;
  }
  if (ctx.state !== 'running') return;
  const now = performance.now();
  if (now - (last[name] ?? -1e9) < GAP[name]) return;
  last[name] = now;
  const t = ctx.currentTime + 0.005;
  // every play a little different: a few takes of each sound, then pitch, level and timing
  // nudged at random — so a run of clicks never sounds like the same sample over and over
  const p = vary(0.08); // pitch
  const v = vary(0.2); // level
  const d = vary(0.15); // timing
  switch (name) {
    case 'click':
      // matched to toyfight.co's button sound: the same tick every time, only a hair of
      // pitch / level drift
      tick(t, 3150 * vary(0.02), 0.125 * vary(0.08));
      break;
    // the form sounds stay recognisable: one shape, only nudged
    case 'error':
      tone(t, 190 * p, 175 * p, 0.075 * d, 0.3 * v);
      tone(t + 0.11 * d, 150 * p, 135 * p, 0.13 * d, 0.3 * v);
      break;
    // a camera shutter: the mirror flips up (a bright click and a soft thunk), the shutter
    // snaps a few tens of ms later; a few takes, like different cameras
    case 'shutter':
      if (shutter && ctx && out) {
        const src = ctx.createBufferSource();
        src.buffer = shutter;
        src.playbackRate.value = vary(0.05);
        const g = ctx.createGain();
        g.gain.value = 1.6 * v;
        src.connect(g).connect(out);
        src.start(t);
        break;
      }
      take(name, [
        () => {
          burst(t, 3200 * p, 0.018 * d, 0.5 * v);
          tone(t, 190 * p, 110 * p, 0.045 * d, 0.22 * v, 'sine');
          burst(t + 0.055 * d, 2400 * p, 0.022 * d, 0.42 * v);
        },
        () => {
          burst(t, 4200 * p, 0.012 * d, 0.45 * v);
          tone(t, 220 * p, 130 * p, 0.04 * d, 0.2 * v, 'sine');
          burst(t + 0.04 * d, 3000 * p, 0.016 * d, 0.38 * v);
        },
        () => {
          burst(t, 2600 * p, 0.022 * d, 0.5 * v);
          tone(t, 160 * p, 95 * p, 0.06 * d, 0.24 * v, 'sine');
          burst(t + 0.075 * d, 2000 * p, 0.03 * d, 0.4 * v);
        },
      ]);
      break;
    case 'print':
      printing(t, seconds, v);
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

/** One tick of a clock movement at `at`: a tiny dry impact ringing through the small metal
 * parts — a 2 ms noise click through a few narrow resonances (no tones, so it sounds struck,
 * not beeped). `pitch` sets the metal, `vol` the strength */
function clockTick(at: number, pitch: number, vol: number) {
  if (!ctx || !out || !noise) return;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const hit = ctx.createGain();
  hit.gain.setValueAtTime(vol, at);
  hit.gain.exponentialRampToValueAtTime(0.0001, at + 0.002);
  src.connect(hit);
  // the parts it rings: three narrow bands, each with its own ring time
  for (const [f, q, level] of [
    [2350, 28, 1],
    [3900, 32, 0.7],
    [6100, 24, 0.45],
  ]) {
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = f * pitch;
    band.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = level * 5;
    hit.connect(band).connect(g).connect(out);
  }
  // and the dry edge of the impact itself
  const edge = ctx.createBiquadFilter();
  edge.type = 'highpass';
  edge.frequency.value = 3000;
  const eg = ctx.createGain();
  eg.gain.value = 0.5;
  hit.connect(edge).connect(eg).connect(out);
  src.start(at);
  src.stop(at + 0.01);
}

/** The printer at work for `dur` s from `at`, as a clock movement: the escapement's
 * tick and tock in turn (the tock a little lower and softer), each followed a few ms later
 * by the faint click of the wheel dropping onto the next tooth. It starts slowly, settles
 * into a quick even beat and slows to a stop with the paper */
function printing(at: number, dur: number, vol: number) {
  if (!ctx || !out) return;
  const end = at + dur;
  const RAMP = 0.6;
  /** seconds between beats at full speed */
  const BEAT = 0.13;
  let tick = true;
  for (let t = at + 0.08; t < end - 0.05; ) {
    const k = Math.min(1, (t - at) / RAMP, (end - t) / RAMP); // 0 → 1 → 0 with the speed
    const pitch = (tick ? 1 : 0.86) * vary(0.015);
    const v = (tick ? 1 : 0.75) * (0.7 + 0.3 * k) * vary(0.1) * vol;
    clockTick(t, pitch, 0.9 * v);
    clockTick(t + 0.011 * vary(0.15), pitch * 1.18, 0.3 * v); // the drop
    tick = !tick;
    t += (BEAT + (1 - k) * 0.12) * vary(0.02);
  }
  // the button going down at the start, a last tick as the paper comes to rest
  burst(at, 1800, 0.02, 0.35 * vol);
  tone(at, 160, 110, 0.05, 0.1 * vol, 'sine');
  clockTick(end, 0.8, 0.8 * vol);
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

