/**
 * The Hello Robo robot as a live 3D model (public/models/hello-robot.glb) on a transparent
 * canvas. Shared by the home hero (seen from the front) and the Robo Radio TV (seen from
 * behind, watching the screen). The body stays still; only the head (tripo_part_3 in the
 * model, hung from a pivot at the neck) moves, as the caller's `head` function says.
 *
 * Framing: the caller says where the head's middle sits in the canvas (fractions of its
 * width / height) and how much of the width the head takes; the camera is placed to match.
 *
 * Desktop only — callers check that before importing this (so phones never fetch three.js
 * or the model). Off screen or in a hidden tab it stops drawing; with reduced motion it
 * draws one still frame in the head's resting pose.
 */
import {
  ACESFilmicToneMapping,
  DirectionalLight,
  Group,
  HemisphereLight,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const MODEL = '/models/hello-robot.glb';
const HEAD = 'tripo_part_3';
const NECK_Y = 0.872; // where the head sits on the neck (model units, the robot is 1 tall)
const HEAD_MID_Y = 0.937; // the head's middle
const HEAD_W = 0.27; // the head's width

export type HeadPose = { pitch: number; yaw: number; roll: number };

export interface RobotOptions {
  /** the canvas fills this (it should be positioned) */
  host: HTMLElement;
  className: string;
  /** 'front': the camera faces the robot; 'back': it stands behind him */
  view: 'front' | 'back';
  /** where the head's middle sits, as fractions of the canvas (0 = left / top) */
  headX: number;
  headY: number;
  /** the head's width, as a fraction of the canvas width */
  headShare: number;
  /** ° vertical field of view */
  fov?: number;
  /** the head's pose at time `s` (seconds); radians (pitch > 0 looks down, yaw > 0 turns
   * to the robot's left, roll tilts) */
  head: (s: number) => HeadPose;
  /** 'studio': lit from the front, as in a photo; 'screen': dark, lit only from in front
   * of him (the TV), so from behind he reads as a silhouette with bright edges */
  light: 'studio' | 'screen';
  /** when true, the screen's light flickers a little (the TV is playing) */
  flicker?: () => boolean;
  /** an accessible name for the canvas (it stands in for a photo) */
  label?: string;
  onLive?: () => void;
  onFail?: () => void;
}

export function mountRobot(o: RobotOptions) {
  const fail = () => o.onFail?.();
  const canvas = document.createElement('canvas');
  canvas.className = o.className;
  if (o.label) {
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', o.label);
  } else canvas.setAttribute('aria-hidden', 'true');

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    return fail();
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  let screenLight: DirectionalLight | null = null;
  let screenBase = 0;
  if (o.light === 'studio') {
    renderer.toneMappingExposure = 1.05;
    const pmrem = new PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.add(new HemisphereLight(0xffffff, 0xb9b4ac, 0.6));
    const key = new DirectionalLight(0xffffff, 1.6);
    key.position.set(-1.5, 2.5, 3);
    scene.add(key);
    const rim = new DirectionalLight(0xffffff, 0.8);
    rim.position.set(2, 1.5, -2);
    scene.add(rim);
  } else {
    // the TV in front of him (he faces +z): light from straight ahead, level with his
    // head, so only his edges catch it from behind; next to nothing reaches his back
    renderer.toneMappingExposure = 1;
    scene.add(new HemisphereLight(0x2a241f, 0x000000, 0.25));
    screenBase = 3.2;
    screenLight = new DirectionalLight(0xfff1e0, screenBase);
    screenLight.position.set(0, 0.95, 3);
    scene.add(screenLight);
    // the side screens, off to his left and right and a little ahead: warm edges
    for (const x of [-1, 1]) {
      const side = new DirectionalLight(0xffd2a6, 1.1);
      side.position.set(x * 2.5, 0.9, 1.6);
      scene.add(side);
    }
  }

  const fovY = o.fov ?? 18;
  const camera = new PerspectiveCamera(fovY, 1, 0.1, 20);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let head: Object3D | null = null;
  let ready = false;
  let visible = true;
  let raf = 0;
  let t0 = 0;
  let glow = 1;

  const resize = () => {
    const w = o.host.clientWidth;
    const h = o.host.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // the distance at which the head takes headShare of the width
    const viewW = HEAD_W / o.headShare;
    const viewH = viewW / camera.aspect;
    const dist = viewH / 2 / Math.tan(((fovY * Math.PI) / 180) / 2);
    const side = o.view === 'front' ? 1 : -1;
    camera.position.set(0, HEAD_MID_Y, side * dist);
    camera.lookAt(0, HEAD_MID_Y, 0);
    // slide the camera (keeping its direction) so the head lands at (headX, headY)
    camera.translateX(-(o.headX - 0.5) * viewW);
    camera.translateY((o.headY - 0.5) * viewH);
    camera.updateProjectionMatrix();
  };

  const draw = (s: number) => {
    if (head) {
      const p = o.head(reduced ? 0 : s);
      head.rotation.set(p.pitch, p.yaw, p.roll, 'YXZ');
    }
    if (screenLight) {
      // a playing TV's light shifts a little with the picture
      const target = !reduced && o.flicker?.() ? 0.8 + 0.35 * Math.random() : 1;
      glow += (target - glow) * 0.12;
      screenLight.intensity = screenBase * glow;
    }
    renderer.render(scene, camera);
  };

  const tick = (t: number) => {
    raf = 0;
    if (!t0) t0 = t;
    draw((t - t0) / 1000);
    if (visible && !document.hidden) raf = requestAnimationFrame(tick);
  };
  const run = () => {
    if (ready && !raf && !reduced) raf = requestAnimationFrame(tick);
  };

  new GLTFLoader().load(
    MODEL,
    (gltf) => {
      const root = gltf.scene;
      root.updateMatrixWorld(true);
      const mesh = root.getObjectByName(HEAD) as Mesh | undefined;
      if (mesh) {
        // hang the head from a pivot at the neck, keeping where it is
        const pivot = new Group();
        pivot.position.set(0, NECK_Y, 0);
        mesh.parent!.add(pivot);
        pivot.attach(mesh);
        head = pivot;
      }
      root.traverse((obj) => {
        const m = (obj as Mesh).material as MeshStandardMaterial | undefined;
        if (!m || !('metalness' in m)) return;
        // the model came from FBX Phong: tone the metal down, it reads as painted plastic
        m.metalness = 0.15;
        m.roughness = 0.55;
        m.envMapIntensity = 0.9;
      });
      scene.add(root);

      o.host.append(canvas);
      resize();
      ready = true;
      draw(0);
      requestAnimationFrame(() => o.onLive?.());
      run();
    },
    undefined,
    fail,
  );

  new ResizeObserver(() => {
    if (!ready) return;
    resize();
    renderer.render(scene, camera);
  }).observe(o.host);
  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    run();
  }).observe(o.host);
  document.addEventListener('visibilitychange', run);
  canvas.addEventListener('webglcontextlost', fail);
}
