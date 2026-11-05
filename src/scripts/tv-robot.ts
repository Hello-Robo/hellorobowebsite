/**
 * Robo Radio TV — the robot as a live 3D model (src/scripts/robot-3d.ts) in front of the
 * screen, the camera behind him: he watches. His head is tilted up to the screen and
 * turns slowly side to side, now and then a little quicker, as if following the picture.
 * It doesn't follow the mouse. Lit only by the screen, so from behind he's a silhouette
 * with bright edges, like the photo; while an episode plays the light flickers a little.
 *
 * Desktop only (RadioTV imports this only there); if WebGL or the model fails, the photo
 * comes back. Placement comes from RadioTV (data-head-x / -y / -share on the host).
 */
import { mountRobot } from './robot-3d';

const LOOK_UP = -0.16; // rad: tilted up to the screen
const YAW = 0.16; // rad: following the picture side to side

for (const host of document.querySelectorAll<HTMLElement>('[data-tv-robot]')) {
  const tv = host.closest<HTMLElement>('[data-tv]');
  mountRobot({
    host,
    className: 'radio-tv__robot-canvas',
    view: 'back',
    headX: Number(host.dataset.headX),
    headY: Number(host.dataset.headY),
    headShare: Number(host.dataset.headShare),
    light: 'screen',
    flicker: () => !!tv?.classList.contains('is-playing'),
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
