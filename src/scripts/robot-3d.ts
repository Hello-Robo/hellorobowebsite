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
  AdditiveBlending,
  Mesh as ThreeMesh,
  PlaneGeometry,
  Vector2,
  Vector3,
  ShaderMaterial,
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
  /** the colour of the light coming off the screen right now (linear RGB, its brightness
   * included: a dark picture is a dim light), or null for the idle screen. The light on him
   * and the rays ease towards it */
  screenColor?: () => [number, number, number] | null;
  /** soft, wide projector rays from the front of his head (towards the TV) */
  beam?: boolean;
  /** an accessible name for the canvas (it stands in for a photo) */
  label?: string;
  onLive?: () => void;
  onFail?: () => void;
}

// Projector rays, as volumetric light: a soft shaft drawn in screen space over the whole
// canvas, under the robot (so his head hides where it starts). Each frame the front of his
// face and a point far along his gaze are projected to the screen; the shaft runs between
// them, widening as it goes, with a gaussian falloff across it (no edges), fading in just
// off his face and out towards the far end, and slow drifting haze through it. Additive.
const BEAM_LEN = 1.15; // how far it reaches on screen (1 = half the canvas height)
const BEAM_W0 = 0.14; // half-width at his face, in screen units (1 = half the canvas height)
const BEAM_W1 = 1.7; // … at the far end: wide
const BEAM_VERT = `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;
const BEAM_FRAG = `
uniform float uTime;
uniform float uGlow;
uniform vec3 uColor;
uniform float uStrength;
uniform float uAspect;
uniform vec2 uFrom;
uniform vec2 uTo;
varying vec2 vNdc;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 p = vec2(vNdc.x * uAspect, vNdc.y);
  vec2 a = vec2(uFrom.x * uAspect, uFrom.y);
  vec2 b = vec2(uTo.x * uAspect, uTo.y);
  vec2 ab = b - a;
  float len = max(length(ab), 1e-4);
  vec2 dir = ab / len;
  vec2 ap = p - a;
  float t = dot(ap, dir) / len; // 0 at his face, 1 at the far end
  float d = abs(dir.x * ap.y - dir.y * ap.x); // distance from the shaft's middle
  float w = mix(${BEAM_W0.toFixed(3)}, ${BEAM_W1.toFixed(3)}, clamp(t, 0.0, 1.0));
  float across = exp(-2.2 * (d / w) * (d / w));
  float along = smoothstep(0.0, 0.15, t) * pow(clamp(1.0 - t, 0.0, 1.0), 1.0);
  // haze drifting slowly up the light
  vec2 q = p * 3.0 + vec2(uTime * 0.04, -uTime * 0.09);
  float haze = 0.7 + 0.3 * noise(q) + 0.2 * (noise(q * 2.7 + 5.0) - 0.5);
  float alpha = uStrength * uGlow * across * along * haze;
  gl_FragColor = vec4(uColor, alpha);
}`;

function makeBeam() {
  const uniforms = {
    uTime: { value: 0 },
    uGlow: { value: 1 },
    uColor: { value: [1, 0.88, 0.74] as number[] },
    uStrength: { value: 0.15 },
    uAspect: { value: 1 },
    uFrom: { value: new Vector2() },
    uTo: { value: new Vector2() },
  };
  const quad = new ThreeMesh(
    new PlaneGeometry(2, 2),
    new ShaderMaterial({
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  );
  quad.frustumCulled = false;
  quad.renderOrder = -1; // under the robot: his head hides where it starts
  // where it starts (the front of his face) and which way it goes: hung from his head
  const anchor = new Group();
  return { quad, anchor, uniforms };
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
  const sides: DirectionalLight[] = [];
  // the screen light's colour, easing towards screenColor() (idle: a warm white)
  const IDLE: [number, number, number] = [1, 0.88, 0.74];
  const tint: [number, number, number] = [...IDLE];
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
      sides.push(side);
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
  let beam: ReturnType<typeof makeBeam> | null = null;
  const from = new Vector3();
  const to = new Vector3();

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
    camera.updateMatrixWorld();
  };

  const draw = (s: number) => {
    if (head) {
      const p = o.head(reduced ? 0 : s);
      head.rotation.set(p.pitch, p.yaw, p.roll, 'YXZ');
      // the rays swing less than his head, so they stay on the screen
      if (beam) beam.anchor.rotation.y = -0.6 * p.yaw;
    }
    if (screenLight) {
      // a playing TV's light shifts a little with the picture
      const target = !reduced && o.flicker?.() ? 0.8 + 0.35 * Math.random() : 1;
      glow += (target - glow) * 0.12;
      screenLight.intensity = screenBase * glow;
      const want = (!reduced && o.screenColor?.()) || IDLE;
      for (let i = 0; i < 3; i++) tint[i] += (want[i] - tint[i]) * 0.03;
      screenLight.color.setRGB(tint[0], tint[1], tint[2]);
      // the side screens show the picture's edges: the same light, a little warmer
      for (const side of sides) side.color.setRGB(tint[0], tint[1] * 0.92, tint[2] * 0.82);
    }
    if (beam) {
      beam.uniforms.uTime.value = s;
      beam.uniforms.uGlow.value = glow;
      beam.uniforms.uColor.value = tint;
      // the shaft's ends on screen: the front of his face, and far along his gaze
      head!.updateWorldMatrix(true, true);
      from.set(0, 0, 0);
      beam.anchor.localToWorld(from).project(camera);
      to.set(0, 0, 4);
      beam.anchor.localToWorld(to).project(camera);
      // the direction his gaze runs on screen, at a set length (perspective would shrink it)
      const dx = (to.x - from.x) * camera.aspect;
      const dy = to.y - from.y;
      const k = BEAM_LEN / Math.max(1e-4, Math.hypot(dx, dy));
      beam.uniforms.uFrom.value.set(from.x, from.y);
      beam.uniforms.uTo.value.set(from.x + (dx * k) / camera.aspect, from.y + dy * k);
      beam.uniforms.uAspect.value = camera.aspect;
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
      if (o.beam && head) {
        // from the front of his face: the head's middle height, just ahead of it
        beam = makeBeam();
        beam.anchor.position.set(0, HEAD_MID_Y - NECK_Y, 0.12);
        beam.anchor.rotation.x = -0.02; // a touch higher than his gaze: up to the screen
        head.add(beam.anchor);
        scene.add(beam.quad);
      }
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
