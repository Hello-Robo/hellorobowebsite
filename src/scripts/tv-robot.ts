/**
 * Robo Radio TV — the robot as a live 3D model (src/scripts/robot-3d.ts) in front of the
 * screen, the camera behind him: he watches. His head is tilted up to the screen and
 * turns slowly side to side, now and then a little quicker, as if following the picture.
 * It doesn't follow the mouse. Lit only by the screen, so from behind he's a silhouette
 * with bright edges, like the photo; a soft, wide, diffuse projector light spreads from his
 * face to the screen. It doesn't flicker or react to the sound; now and then, at random
 * (every 2–8 s, sometimes twice quickly), he blinks and
 * the light goes out for a moment.
 *
 * Screen colour: the page can't read the YouTube picture itself (another site's video), but
 * YouTube makes three frames of every video, at about a quarter, half and three quarters
 * through (i.ytimg.com/vi/<id>/1.jpg, 2.jpg, 3.jpg), and serves those readable. So while an
 * episode plays, the light on him (and the rays) takes its colour from the frame nearest the
 * point the player is at (RadioTV writes it to data-progress), blending from one frame to
 * the next as the episode goes on; every few seconds it eases to another part of that frame,
 * as if the scene changed. A dark stretch lights him dimly, a yellow one tints him yellow.
 * Idle (nothing playing) it's the TV's warm white.
 *
 * LED strip round his head (robot-led.ts): it repeats the episode on the TV, title and
 * speaker ("ROBO RADIO 14: ALEJANDRO OTALORA"), between micrographics, and switches when the
 * episode does (RadioTV writes its id to data-current; the titles are in data-playlist).
 *
 * Desktop only (RadioTV imports this only there); if WebGL or the model fails, the photo
 * comes back. Placement comes from RadioTV (data-head-x / -y / -share on the host).
 */
import { mountRobot } from './robot-3d';
import { ledTitle } from './robot-led';

const LOOK_UP = -0.16; // rad: tilted up to the screen
const YAW = 0.24; // rad: following the picture side to side
const SCENE = 3; // s between "scene changes" (a new part of the thumbnail)

type RGB = [number, number, number];
const toLinear = (v: number) => Math.pow(v / 255, 2.2);

type Look = { avg: RGB; parts: RGB[] };
/** a picture's light colours: its average and its 3×3 parts, each as a light (linear RGB: its
 * hue, a little more saturated, at a brightness that follows the picture's: dim for a dark
 * picture, never quite off) */
function look(img: HTMLImageElement): Look {
  const c = document.createElement('canvas');
  c.width = c.height = 3;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, 3, 3);
  const px = ctx.getImageData(0, 0, 3, 3).data;
  const parts: RGB[] = [];
  for (let i = 0; i < 9; i++) parts.push([toLinear(px[i * 4]), toLinear(px[i * 4 + 1]), toLinear(px[i * 4 + 2])]);
  const avg = [0, 1, 2].map((k) => parts.reduce((a, p) => a + p[k], 0) / 9) as RGB;
  const light = (v: RGB): RGB => {
    const l = 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    const sat = v.map((x) => Math.max(0, l + (x - l) * 1.5));
    const peak = Math.max(...sat, 1e-4);
    const level = Math.min(1.3, 0.22 + l * 3);
    return sat.map((x) => (x / peak) * level) as RGB;
  };
  return { avg: light(avg), parts: parts.map(light) };
}

/** An episode's three in-video frames (at ~25 / 50 / 75%), as looks; null while loading */
const episodes = new Map<string, (Look | null)[]>();
function frames(id: string) {
  let f = episodes.get(id);
  if (f) return f;
  f = [null, null, null];
  episodes.set(id, f);
  [1, 2, 3].forEach((n, i) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        f![i] = look(img);
      } catch {
        /* unreadable: that frame stays out */
      }
    };
    img.src = `https://i.ytimg.com/vi/${id}/${n}.jpg`;
  });
  return f;
}
const AT = [0.25, 0.5, 0.75]; // where in the video each frame is

for (const host of document.querySelectorAll<HTMLElement>('[data-tv-robot]')) {
  const tv = host.closest<HTMLElement>('[data-tv]');
  const playing = () => !!tv?.classList.contains('is-playing');
  let scene = 0;
  let sceneAt = 0;
  const color: RGB = [0, 0, 0];
  // the LED strip: the current episode's title (the first in the playlist until one is set)
  if (tv) {
    let playlist: { id: string; title: string }[] = [];
    try {
      playlist = JSON.parse(tv.dataset.playlist || '[]');
    } catch {
      /* no titles: the strip shows one of its own variants */
    }
    const showEpisode = () => {
      const ep = playlist.find((p) => p.id === tv.dataset.current) ?? playlist[0];
      if (ep) ledTitle(ep.title);
    };
    showEpisode();
    new MutationObserver(showEpisode).observe(tv, { attributes: true, attributeFilter: ['data-current'] });
  }
  mountRobot({
    host,
    className: 'radio-tv__robot-canvas',
    view: 'back',
    headX: Number(host.dataset.headX),
    headY: Number(host.dataset.headY),
    headShare: Number(host.dataset.headShare),
    light: 'screen',
    beam: true,
    blink: true,
    screenColor: () => {
      const id = tv?.dataset.current;
      if (!id || !playing()) return null;
      const f = frames(id);
      const have = AT.map((at, i) => ({ at, l: f[i] })).filter((x) => x.l) as { at: number; l: Look }[];
      if (!have.length) return null;
      // the two frames either side of where the player is, and how far between them
      const p = Number(tv?.dataset.progress ?? 0) || 0;
      let a = have[0];
      let b = have[have.length - 1];
      for (let i = 0; i < have.length - 1; i++) {
        if (p >= have[i].at && p <= have[i + 1].at) {
          a = have[i];
          b = have[i + 1];
        }
      }
      if (p <= have[0].at) b = a;
      if (p >= have[have.length - 1].at) a = b;
      const k = a === b ? 0 : (p - a.at) / (b.at - a.at);
      // a "scene change" every few seconds: halfway between the frame's average and one of
      // its parts
      const now = performance.now() / 1000;
      if (now - sceneAt > SCENE) {
        sceneAt = now;
        scene = Math.floor(Math.random() * 9);
      }
      for (let i = 0; i < 3; i++) {
        const ca = (a.l.avg[i] + a.l.parts[scene][i]) / 2;
        const cb = (b.l.avg[i] + b.l.parts[scene][i]) / 2;
        color[i] = ca + (cb - ca) * k;
      }
      return color;
    },
    head: (s) => ({
      // a slow sweep with a quicker glance on top, so it reads as following what's on
      yaw: YAW * (0.75 * Math.sin(s * 0.3) + 0.25 * Math.sin(s * 0.83 + 1.7)),
      pitch: LOOK_UP + 0.045 * Math.sin(s * 0.5 + 0.4),
      roll: 0.035 * Math.sin(s * 0.27 + 2),
    }),
    onLive: () => host.classList.add('is-live'),
    onFail: () => tv?.classList.add('is-robot-fallback'),
  });
}
