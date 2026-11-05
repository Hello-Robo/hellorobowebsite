/**
 * Robo Radio TV — the robot as a live 3D model (src/scripts/robot-3d.ts) in front of the
 * screen, the camera behind him: he watches. His head is tilted up to the screen and
 * turns slowly side to side, now and then a little quicker, as if following the picture.
 * It doesn't follow the mouse. Lit only by the screen, so from behind he's a silhouette
 * with bright edges, like the photo; soft, wide projector rays run from his face to the
 * screen. While an episode plays the light (and the rays) flicker a little.
 *
 * Screen colour: the page can't read the YouTube picture itself, so while an episode plays
 * the light on him (and the rays) takes its colours from the episode's thumbnail (YouTube
 * serves those readable): every few seconds it eases to another part of the thumbnail, as
 * if the scene changed — a dark episode lights him dimly, a yellow one tints him yellow.
 * Idle (nothing playing) it's the TV's warm white.
 *
 * Desktop only (RadioTV imports this only there); if WebGL or the model fails, the photo
 * comes back. Placement comes from RadioTV (data-head-x / -y / -share on the host).
 */
import { mountRobot } from './robot-3d';

const LOOK_UP = -0.16; // rad: tilted up to the screen
const YAW = 0.16; // rad: following the picture side to side
const SCENE = 3; // s between "scene changes" (a new part of the thumbnail)

type RGB = [number, number, number];
const toLinear = (v: number) => Math.pow(v / 255, 2.2);

/** An episode's light colours: the thumbnail's average and its 3×3 parts, each as a light
 * (linear RGB: its hue, a little more saturated, at a brightness that follows the
 * picture's: dim for a dark picture, never quite off) */
const palettes = new Map<string, { avg: RGB; parts: RGB[] } | null>();
function palette(id: string) {
  if (palettes.has(id)) return palettes.get(id);
  palettes.set(id, null); // loading
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 3;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, 3, 3);
      const px = ctx.getImageData(0, 0, 3, 3).data;
      const parts: RGB[] = [];
      for (let i = 0; i < 9; i++) parts.push([toLinear(px[i * 4]), toLinear(px[i * 4 + 1]), toLinear(px[i * 4 + 2])]);
      const avg = [0, 1, 2].map((k) => parts.reduce((a, p) => a + p[k], 0) / 9) as RGB;
      const light = (c: RGB): RGB => {
        const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        const sat = c.map((v) => Math.max(0, l + (v - l) * 1.5));
        const peak = Math.max(...sat, 1e-4);
        const level = Math.min(1.3, 0.22 + l * 3);
        return sat.map((v) => (v / peak) * level) as RGB;
      };
      palettes.set(id, { avg: light(avg), parts: parts.map(light) });
    } catch {
      /* unreadable: keep the idle light */
    }
  };
  img.src = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
  return null;
}

for (const host of document.querySelectorAll<HTMLElement>('[data-tv-robot]')) {
  const tv = host.closest<HTMLElement>('[data-tv]');
  const playing = () => !!tv?.classList.contains('is-playing');
  let scene = 0;
  let sceneAt = 0;
  const color: RGB = [0, 0, 0];
  mountRobot({
    host,
    className: 'radio-tv__robot-canvas',
    view: 'back',
    headX: Number(host.dataset.headX),
    headY: Number(host.dataset.headY),
    headShare: Number(host.dataset.headShare),
    light: 'screen',
    beam: true,
    flicker: playing,
    screenColor: () => {
      const id = tv?.dataset.current;
      const p = id ? palette(id) : null;
      if (!p || !playing()) return null;
      // a "scene change" every few seconds: halfway between the picture's average and one
      // of its parts
      const now = performance.now() / 1000;
      if (now - sceneAt > SCENE) {
        sceneAt = now;
        scene = Math.floor(Math.random() * 9);
      }
      const part = p.parts[scene];
      for (let i = 0; i < 3; i++) color[i] = (p.avg[i] + part[i]) / 2;
      return color;
    },
    head: (s) => ({
      // a slow sweep with a quicker glance on top, so it reads as following what's on
      yaw: YAW * (0.75 * Math.sin(s * 0.3) + 0.25 * Math.sin(s * 0.83 + 1.7)),
      pitch: LOOK_UP + 0.025 * Math.sin(s * 0.5 + 0.4),
      roll: 0.02 * Math.sin(s * 0.27 + 2),
    }),
    onLive: () => host.classList.add('is-live'),
    onFail: () => tv?.classList.add('is-robot-fallback'),
  });
}
