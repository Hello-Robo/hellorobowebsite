import * as THREE from 'three';

/** The LED strip round his head: the recessed visor band of the head model
 * (public/models/sentinel-head.glb; heights y0..y1 in model units, the robot is 1 tall)
 * becomes a dot-matrix display under the clear coat. A ticker of messages and little pixel graphics runs round it, right to left as
 * seen from the front. `cols` dots round the full circle, `rows` dots tall; `speed` in dots
 * per second; `power` how bright a lit dot is (HDR: high enough to bloom), `off` the faint
 * glow of an unlit one. `eyes`: a window at the front with two blinking LED eyes. What it
 * says is one of the VARIANTS below, picked at random on each page load (for a preview, pin one
 * with ?led=servant|motion|weather or ?led=1|2|3 in the address).
 *
 * Shared by both 3D robots: the home hero (hero-scene.ts) and the Robo Radio TV (robot-3d.ts).
 * Each puts ledStrip() into his head material's shader and calls ledUse() once and ledTick()
 * every frame. */
const LED = {
  y0: 0.945,
  y1: 0.978,
  cols: 360,
  rows: 11,
  speed: 14,
  color: '#ff6b03', // brand orange
  power: 4.5,
  off: 0.025,
  eyes: false,
};

/** The variants' messages; a sprite goes in as {name} (SPRITES below). "weather" is written
 * live (ledWeather): the studio's local time and current weather */
export const LED_VARIANTS = ['servant', 'motion', 'weather'] as const;
export type LedVariant = (typeof LED_VARIANTS)[number];
const VARIANTS: Record<Exclude<LedVariant, 'weather'>, string[]> = {
  servant: [
    '{arrows} Я ТВОЙ СЛУГА, Я ТВОЙ РАБОТНИК {hr}',
    '{human} Я ТВОЙ СЛУГА, Я ТВОЙ РАБОТНИК {barcode}',
    '{globe} Я ТВОЙ СЛУГА, Я ТВОЙ РАБОТНИК {dino}',
  ],
  motion: [
    '{target} 46 DEGREES OF MOTION {globe}',
    '{checker} 46 DEGREES OF MOTION {kettlebell}',
    '{dashes} 46 DEGREES OF MOTION {arrows}',
  ],
};
/** "weather": the studio's city (Open-Meteo, free, no key; only these public coordinates are
 * sent), refreshed every 15 minutes; the clock in the studio's time zone */
const WEATHER = { place: 'NEW YORK', lat: 40.7128, lon: -74.006, tz: 'America/New_York' };

/** 5×7 LED font: each glyph is 7 rows, 5 bits per row (16 = leftmost dot). Latin, digits,
 * punctuation and Cyrillic (the letters that look Latin share their shapes) */
const FONT: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  '0': [14, 17, 19, 21, 25, 17, 14], '1': [4, 12, 4, 4, 4, 4, 14], '2': [14, 17, 1, 2, 4, 8, 31],
  '3': [31, 2, 4, 2, 1, 17, 14], '4': [2, 6, 10, 18, 31, 2, 2], '5': [31, 16, 30, 1, 1, 17, 14],
  '6': [6, 8, 16, 30, 17, 17, 14], '7': [31, 1, 2, 4, 8, 8, 8], '8': [14, 17, 17, 14, 17, 17, 14],
  '9': [14, 17, 17, 15, 1, 2, 12], '-': [0, 0, 0, 31, 0, 0, 0], '!': [4, 4, 4, 4, 4, 0, 4],
  '.': [0, 0, 0, 0, 0, 12, 12], '?': [14, 17, 1, 2, 4, 0, 4], '/': [1, 1, 2, 4, 8, 16, 16],
  '&': [12, 18, 20, 8, 21, 18, 13], ',': [0, 0, 0, 0, 12, 4, 8], ':': [0, 12, 12, 0, 12, 12, 0],
  '°': [12, 18, 18, 12, 0, 0, 0],
  Б: [31, 16, 16, 30, 17, 17, 30], Г: [31, 16, 16, 16, 16, 16, 16], Д: [6, 10, 10, 10, 10, 31, 17],
  Ж: [21, 21, 14, 4, 14, 21, 21], З: [14, 17, 1, 6, 1, 17, 14], И: [17, 17, 19, 21, 25, 17, 17],
  Й: [10, 17, 19, 21, 25, 17, 17], Л: [7, 9, 9, 9, 9, 9, 17], П: [31, 17, 17, 17, 17, 17, 17],
  У: [17, 17, 17, 15, 1, 17, 14], Ф: [4, 14, 21, 21, 21, 14, 4], Ц: [18, 18, 18, 18, 18, 31, 1],
  Ч: [17, 17, 17, 15, 1, 1, 1], Ш: [17, 21, 21, 21, 21, 21, 31], Щ: [21, 21, 21, 21, 21, 31, 1],
  Ы: [17, 17, 17, 29, 19, 19, 29], Ь: [16, 16, 16, 30, 17, 17, 30], Ъ: [24, 8, 8, 14, 9, 9, 14],
  Э: [14, 17, 1, 7, 1, 17, 14], Ю: [18, 21, 21, 29, 21, 21, 18], Я: [15, 17, 17, 15, 5, 9, 17],
};
for (const [cy, la] of Object.entries({ А: 'A', В: 'B', Е: 'E', Ё: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X' }))
  FONT[cy] = FONT[la];

/** a sprite from a test per dot, w × h */
const grid = (w: number, h: number, on: (x: number, y: number) => boolean) =>
  Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (on(x, y) ? '#' : '.')).join(''));

/** Mini graphics, at most LED.rows tall (# = lit). Most are the site's own micrographics
 * redrawn for 11 dots: the philosophy badge's arrows, the wireframe globe, the striped "HR"
 * of the Human Robot Department stamp, 人, the barcode, the crosshair, the checkerboard, the
 * kettlebell, the dashes and the contact page's dino; plus weather icons */
const SPRITES: Record<string, string[]> = {
  arrows: [0, 1, 2, 3, 2, 1, 0].map((n) => { const r = '#'.repeat(n + 1).padEnd(4, '.'); const l = [...r].reverse().join(''); return `${r}.${r}...${l}.${l}`; }),
  globe: grid(11, 11, (x, y) => {
    const dx = x - 5, dy = y - 5, d = Math.hypot(dx, dy);
    if (Math.abs(d - 5) < 0.55) return true;
    if (d >= 5) return false;
    const m = Math.round(Math.sqrt(Math.max(0, 25 - dy * dy)) * 0.55);
    return dx === 0 || dy === 0 || Math.abs(dx) === m || (Math.abs(dy) === 3 && d < 4.6);
  }),
  hr: ['##...##.######.', '...............', '##...##.##...##', '...............', '#######.######.', '...............', '##...##.##..##.', '...............', '##...##.##...##'],
  human: ['....#......', '....#......', '....#......', '....#......', '....##.....', '...#..#....', '...#..#....', '..#....#...', '..#.....#..', '.#.......#.', '#.........#'],
  barcode: (() => {
    const bars = '211213112123111221'.split('').map(Number);
    let row = '';
    bars.forEach((w, i) => (row += (i % 2 ? '.' : '#').repeat(w)));
    return Array.from({ length: 11 }, () => row);
  })(),
  target: grid(11, 11, (x, y) => {
    const dx = x - 5, dy = y - 5, d = Math.hypot(dx, dy);
    return Math.abs(d - 3.6) < 0.5 || d < 0.5 || ((dx === 0 || dy === 0) && d > 1.5);
  }),
  checker: grid(9, 9, (x, y) => (Math.floor(x / 3) + Math.floor(y / 3)) % 2 === 0),
  kettlebell: ['..#####..', '.#.....#.', '.#.....#.', '..#####..', '.#######.', '#########', '#########', '#########', '.#######.', '..#####..'],
  dashes: ['#####..#####..#####', '#####..#####..#####'],
  dino: ['....######.', '....#.####.', '....######.', '....###....', '#..#####...', '#.######...', '########...', '.######....', '..#####....', '...#..#....', '...##.##...'],
  sun: ['.....#.....', '.#...#...#.', '..#.....#..', '....###....', '...#####...', '##.#####.##', '...#####...', '....###....', '..#.....#..', '.#...#...#.', '.....#.....'],
  cloud: ['....####.....', '...######....', '..########...', '.###########.', '#############', '#############', '.###########.'],
  rain: ['....####.....', '..########...', '#############', '.###########.', '.............', '.#..#..#..#..', '#..#..#..#...', '.............', '..#..#..#..#.', '.#..#..#..#..'],
  snow: ['....#....', '.#..#..#.', '..#.#.#..', '...###...', '#########', '...###...', '..#.#.#..', '.#..#..#.', '....#....'],
  fog: ['###########', '...........', '.##########', '...........', '#########..', '...........', '..#########'],
  bolt: ['...###', '..###.', '..##..', '.###..', '.#####', '....##', '...##.', '..##..', '..#...', '.#....', '#.....'],
};

export const ledUniforms = {
  ledMap: { value: null as THREE.Texture | null },
  ledTickerW: { value: 1 },
  ledScroll: { value: 0 },
  ledOpen: { value: 1 }, // the eyes: 1 open, 0 shut (blink)
  ledColor: { value: new THREE.Color(LED.color) },
  ledBack: { value: 0 }, // 1: seen from behind (the radio robot): the strip's seam goes to the front, out of view
};

/** Draws the ticker (the messages, sprites and gaps in a row) one pixel per LED, lit = white,
 * into the strip's texture */
function ledTicker(messages: string[]) {
  const cols: boolean[][] = []; // columns of LED.rows dots, top first
  const blank = () => cols.push(new Array(LED.rows).fill(false));
  const draw = (rows: string[]) => {
    const top = Math.floor((LED.rows - rows.length) / 2);
    const w = Math.max(...rows.map((r) => r.length));
    for (let x = 0; x < w; x++) {
      const col = new Array(LED.rows).fill(false);
      rows.forEach((r, y) => (col[top + y] = r[x] === '#'));
      cols.push(col);
    }
  };
  const glyph = (bits: number[]) => draw(bits.map((r) => [16, 8, 4, 2, 1].map((b) => (r & b ? '#' : '.')).join('')));
  for (const msg of messages) {
    for (const part of msg.split(/(\{\w+\})/)) {
      const sprite = part.match(/^\{(\w+)\}$/);
      if (sprite) {
        if (SPRITES[sprite[1]]) draw(SPRITES[sprite[1]]);
        blank();
        continue;
      }
      for (const ch of part.toUpperCase()) {
        if (ch === ' ') for (let i = 0; i < 3; i++) blank();
        else if (FONT[ch]) {
          glyph(FONT[ch]);
          blank();
        }
      }
    }
    for (let i = 0; i < 24; i++) blank(); // gap between messages
  }
  const canvas = document.createElement('canvas');
  canvas.width = cols.length;
  canvas.height = LED.rows;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  cols.forEach((col, x) => col.forEach((on, y) => on && ctx.fillRect(x, y, 1, 1)));
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  ledUniforms.ledMap.value?.dispose();
  ledUniforms.ledMap.value = tex;
  ledUniforms.ledTickerW.value = canvas.width;
}

/** Robo Radio: the strip repeats the episode on the TV ("ROBO RADIO 14: ALEJANDRO OTALORA"),
 * between pairs of micrographics, instead of a random variant (tv-robot.ts calls this before
 * the robot mounts, and again whenever the episode changes) */
let shownTitle = '';
export function ledTitle(title: string) {
  used = true;
  const t = title.trim().toUpperCase();
  if (!t || t === shownTitle) return;
  shownTitle = t;
  ledTicker([`{arrows} ${t} {globe}`, `{hr} ${t} {barcode}`, `{target} ${t} {dino}`, `{checker} ${t} {kettlebell}`]);
}

/** Picks what the strip shows (once per page): a random variant, or the one ?led= names */
let used = false;
export function ledUse() {
  if (used) return;
  used = true;
  const q = new URLSearchParams(location.search).get('led');
  const variant = (LED_VARIANTS as readonly string[]).includes(q ?? '')
    ? (q as LedVariant)
    : (LED_VARIANTS[Number(q) - 1] ?? LED_VARIANTS[Math.floor(Math.random() * LED_VARIANTS.length)]);
  if (variant === 'weather') ledWeather();
  else ledTicker(VARIANTS[variant]);
}

/** The "weather" variant: "NEW YORK — 14:32 — ☀ 54°F 12°C CLEAR", the clock checked every few
 * seconds and redrawn when the minute changes, the weather fetched every 15 minutes (until it
 * comes, or if it can't, the clock alone) */
function ledWeather() {
  let weather = '';
  let shown = '';
  const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: WEATHER.tz });
  const redraw = () => {
    const text = `{globe} ${WEATHER.place} {dashes} ${clock.format(new Date())} ${weather}{kettlebell}`;
    if (text === shown) return;
    shown = text;
    ledTicker([text]);
  };
  const fetchWeather = async () => {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER.lat}&longitude=${WEATHER.lon}&current=temperature_2m,weather_code`;
      const { current } = await (await fetch(url)).json();
      const c = Math.round(current.temperature_2m);
      const [icon, label] = weatherLook(current.weather_code);
      weather = `{dashes} {${icon}} ${Math.round(c * 1.8 + 32)}°F ${c}°C ${label} `;
      redraw();
    } catch {
      // no weather: the clock goes on alone
    }
  };
  redraw();
  fetchWeather();
  setInterval(redraw, 5000);
  setInterval(fetchWeather, 15 * 60 * 1000);
}

/** WMO weather code → sprite and word */
function weatherLook(code: number): [string, string] {
  if (code === 0) return ['sun', 'CLEAR'];
  if (code <= 2) return ['sun', 'PARTLY CLOUDY'];
  if (code === 3) return ['cloud', 'CLOUDY'];
  if (code <= 48) return ['fog', 'FOG'];
  if (code <= 67 || (code >= 80 && code <= 82)) return ['rain', 'RAIN'];
  if (code <= 77 || code === 85 || code === 86) return ['snow', 'SNOW'];
  return ['bolt', 'STORM'];
}

/** Each frame: scrolls the ticker by whole dots and blinks the eyes (every 2.5–6 s, 0.14 s).
 * With reduced motion it stands still and doesn't blink. */
let nextBlink = 3;
export function ledTick(t: number, still: boolean) {
  if (still) return;
  ledUniforms.ledScroll.value = Math.floor(t * LED.speed);
  if (t > nextBlink + 0.14) nextBlink = t + 2.5 + Math.random() * 3.5;
  ledUniforms.ledOpen.value = t > nextBlink ? 0 : 1;
}

/** Puts the LED strip into the head's shader (see LED) */
export function ledStrip(shader: THREE.WebGLProgramParametersWithUniforms) {
  Object.assign(shader.uniforms, ledUniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vLedPos;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLedPos = position;');
  const f = (n: number) => n.toFixed(5);
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
      uniform sampler2D ledMap;
      uniform float ledTickerW, ledScroll, ledOpen, ledBack;
      varying vec3 vLedPos;
      uniform vec3 ledColor;`,
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      // the strip: black glass in place of the painted band
      vec3 ledP = vLedPos;
      float ledBand = smoothstep(${f(LED.y0)}, ${f(LED.y0 + 0.0006)}, ledP.y) * (1.0 - smoothstep(${f(LED.y1 - 0.0006)}, ${f(LED.y1)}, ledP.y));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012), ledBand);`,
    )
    .replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      if (ledBand > 0.0) {
        // which dot: round the head (0.5 = straight ahead) and up the strip
        // (the dots wrap round at the back; seen from behind, at the front instead)
        vec2 ledXZ = mix(ledP.xz, -ledP.xz, ledBack);
        vec2 ledCell = vec2((atan(ledXZ.x, ledXZ.y) / 6.2831853 + 0.5) * ${f(LED.cols)},
                            (ledP.y - ${f(LED.y0)}) / ${f(LED.y1 - LED.y0)} * ${f(LED.rows)});
        vec2 ledId = floor(ledCell);
        float ledD = length(fract(ledCell) - 0.5);
        float ledAA = fwidth(ledD);
        float ledDot = 1.0 - smoothstep(0.36 - ledAA, 0.36 + ledAA, ledD);
        float ledOn;
        float ledC = ledId.x - ${f(LED.cols / 2)} + 0.5; // dots from the front centre, ±0.5, ±1.5…
        if (${LED.eyes ? 'true' : 'false'} && abs(ledC) < 15.0) {
          // the eyes: two 6×7 blocks with clipped corners; shut, only the middle row stays lit
          float ex = abs(abs(ledC) - 9.0), ey = abs(ledId.y - 5.0);
          ledOn = (ex <= 2.5 && ey <= mix(0.0, 3.0, ledOpen) && !(ex > 2.0 && ey > 2.5)) ? 1.0 : 0.0;
        } else {
          float tx = mod(ledId.x + ledScroll, ledTickerW);
          ledOn = texture2D(ledMap, vec2((tx + 0.5) / ledTickerW, (ledId.y + 0.5) / ${f(LED.rows)})).r;
        }
        totalEmissiveRadiance += ledColor * ledBand * ledDot * (ledOn * ${f(LED.power)} + ${f(LED.off)});
      }`,
    )
    .replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.18, ledBand);`,
    );
}

