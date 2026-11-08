/**
 * What the three.js scenes share (the Home hero, the robot on the Robo Radio TV, the contact
 * printer): the renderer and its canvas, the studio reflections, loading a model, and when
 * to draw. Desktop only, like the scenes: callers import them only there.
 */
import { ACESFilmicToneMapping, PMREMGenerator, WebGLRenderer, type Texture, type WebGLRendererParameters } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

type RendererOptions = WebGLRendererParameters & {
  className: string;
  /** an accessible name for the canvas (it stands in for a photo); without one it's hidden
   *  from screen readers */
  label?: string;
  toneMappingExposure?: number;
  /** the GPU dropped the context: the scene is gone */
  onLost?: () => void;
};

/** A canvas (not yet in the page) with a renderer on it: antialiased, at most 2× pixels,
 *  ACES tone mapping. Null without WebGL. */
export function createRenderer({ className, label, toneMappingExposure = 1, onLost, ...params }: RendererOptions) {
  const canvas = document.createElement('canvas');
  canvas.className = className;
  if (label) {
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', label);
  } else canvas.setAttribute('aria-hidden', 'true');
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, ...params });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = toneMappingExposure;
  if (onLost) canvas.addEventListener('webglcontextlost', onLost);
  return renderer;
}

/** Soft studio reflections (three's RoomEnvironment, prefiltered), for scene.environment */
export function roomEnvironment(renderer: WebGLRenderer): Texture {
  const pmrem = new PMREMGenerator(renderer);
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return texture;
}

/** Loads a glTF model; `setup` prepares the loader (e.g. a mesh decoder) */
export function loadModel(url: string, setup?: (loader: GLTFLoader) => void): Promise<GLTF> {
  const loader = new GLTFLoader();
  setup?.(loader);
  return loader.loadAsync(url);
}

/** Whether a scene should draw: its `host` on screen, the tab visible and (unless
 *  `menu: false`) the site menu closed — under the menu's full-screen blur, redrawing made
 *  its fades stutter. `onChange` runs whenever that may have changed; the returned function
 *  says whether to draw now. */
export function drawWhen(host: Element, onChange: () => void, { menu = true } = {}) {
  let onScreen = true;
  new IntersectionObserver((entries) => {
    onScreen = entries[entries.length - 1].isIntersecting;
    onChange();
  }).observe(host);
  document.addEventListener('visibilitychange', onChange);
  const html = document.documentElement;
  if (menu) new MutationObserver(onChange).observe(html, { attributes: true, attributeFilter: ['data-menu'] });
  return () => onScreen && !document.hidden && !(menu && html.dataset.menu === 'open');
}
