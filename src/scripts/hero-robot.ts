/**
 * Home hero — the robot as a live 3D model (src/scripts/robot-3d.ts), seen from the front,
 * over the receipts sphere. The head drifts a little on its own (slow idle) and leans
 * slightly towards the mouse.
 *
 * Framing matches the still photo it replaces: the head is about 47% of the hero's width,
 * centred, its middle 55% down; the chest runs off the bottom edge.
 *
 * Desktop only (HomeHero imports this only there); if WebGL or the model fails, the photo
 * comes back.
 */
import { mountRobot } from './robot-3d';

// head motion, radians
const YAW = 0.14; // idle side to side
const PITCH = 0.05; // idle nod
const ROLL = 0.035; // idle tilt
const FOLLOW_YAW = 0.12; // extra towards the mouse
const FOLLOW_PITCH = 0.06;

const hero = document.querySelector<HTMLElement>('.home-hero');
const slot = hero?.querySelector<HTMLElement>('[data-webgl="home-hero"]');

if (hero && slot) {
  // the mouse, −1…1 across the window, eased
  const aim = { x: 0, y: 0 };
  const look = { x: 0, y: 0 };
  addEventListener(
    'pointermove',
    (e) => {
      aim.x = Math.max(-1, Math.min(1, (e.clientX / innerWidth) * 2 - 1));
      aim.y = Math.max(-1, Math.min(1, (e.clientY / innerHeight) * 2 - 1));
    },
    { passive: true },
  );

  mountRobot({
    host: slot,
    className: 'home-hero__robot-canvas',
    view: 'front',
    headX: 0.5,
    headY: 0.55,
    headShare: 0.47,
    light: 'studio',
    label: 'Hello Robo service robot',
    head: (s) => {
      if (!s) return { pitch: 0, yaw: 0, roll: 0 };
      look.x += (aim.x - look.x) * 0.04;
      look.y += (aim.y - look.y) * 0.04;
      // layered slow sines, so it never quite repeats
      return {
        yaw: YAW * (0.7 * Math.sin(s * 0.42) + 0.3 * Math.sin(s * 0.97 + 1.3)) + FOLLOW_YAW * look.x,
        pitch: PITCH * Math.sin(s * 0.61 + 0.6) + FOLLOW_PITCH * look.y,
        roll: ROLL * Math.sin(s * 0.33 + 2.1),
      };
    },
    onLive: () => slot.classList.add('is-robot-live'),
    onFail: () => hero.classList.add('is-robot-fallback'),
  });
}
