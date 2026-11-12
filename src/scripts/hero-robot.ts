/**
 * Home hero — mounts the WebGL scene (src/scripts/hero-scene.ts: the robot following the
 * mouse over the turning graphics sphere). Its settings and background picture come from
 * the CMS (Home page → Hero (3D, desktop)); HomeHero puts them on the section as data-hero.
 *
 * Desktop only (HomeHero imports this only there); if WebGL, the model or the picture
 * fails, the still pictures come back.
 */
import { mountHeroScene } from './hero-scene';

const hero = document.querySelector<HTMLElement>('.home-hero');
const slot = hero?.querySelector<HTMLElement>('[data-webgl="home-hero"]');

if (hero && slot) {
  const { background, ...config } = JSON.parse(hero.dataset.hero || '{}');
  mountHeroScene({
    host: slot,
    className: 'home-hero__robot-canvas',
    modelUrl: '/models/hello-robot.glb',
    headUrl: '/models/sentinel-head.glb',
    bgUrl: background,
    config,
    label: 'Hello Robo service robot',
    onLive: () => slot.classList.add('is-robot-live'),
    onFail: () => hero.classList.add('is-robot-fallback'),
  });
}
