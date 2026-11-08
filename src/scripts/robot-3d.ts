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
  Color,
  CustomBlending,
  OneFactor,
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
import { reducedMotion } from './media-query';

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
  /** he blinks now and then, at random (every 2–8 s, sometimes twice in a row): the
   *  projector light goes out for a moment and comes back */
  blink?: boolean;
  /** an accessible name for the canvas (it stands in for a photo) */
  label?: string;
  onLive?: () => void;
  onFail?: () => void;
}

// Projector light, as diffuse volumetric light: a soft glow drawn in screen space over the
// whole canvas, under the robot (so his head hides where it starts). Each frame the front of
// his face and a point along his gaze are projected to the screen. The light spreads out
// from his face in a wide fan (a soft gaussian on the angle from his gaze, no edges), fades
// gently with distance (no end to it), with faint soft rays through it, slow drifting haze and
// tiny dust specks floating in it.
// Added on, premultiplied.
const BEAM_SPREAD = 1.25; // rad: how wide the fan is (gaussian on the angle off his gaze)
const BEAM_FALL = 2.6; // how fast it fades with distance (screen units, 1 = half the height)
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
// dust: tiny specks, a few per area (most grid cells are empty), each wandering on its own
// slow, random path (two sines per axis with its own speeds and phases: no shared drift, so
// they float every which way like dust) and twinkling. Neighbouring cells are checked too,
// since a speck can wander out of its own cell.
float dust(vec2 p, float scale, float seed) {
  vec2 pp = p * scale;
  vec2 base = floor(pp);
  float sum = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 id = base + vec2(float(i), float(j));
      float r = hash(id + seed);
      if (r > 0.056) continue;
      float h1 = hash(id + seed + 2.1), h2 = hash(id + seed + 5.9);
      float h3 = hash(id + seed + 11.3), h4 = hash(id + seed + 13.7);
      vec2 at = id + vec2(hash(id + seed + 1.3), hash(id + seed + 7.1));
      at += 0.55 * vec2(
        sin(uTime * (0.05 + 0.12 * h1) + h2 * 6.283) + 0.5 * sin(uTime * (0.16 + 0.2 * h3) + h4 * 6.283),
        sin(uTime * (0.04 + 0.11 * h3) + h1 * 6.283) + 0.5 * sin(uTime * (0.14 + 0.2 * h2) + h3 * 6.283)
      );
      float d = length(pp - at) / scale; // in screen units
      float size = mix(0.0008, 0.0018, hash(id + seed + 3.7));
      float twinkle = 0.45 + 0.55 * sin(uTime * (0.8 + r * 40.0) + h4 * 60.0);
      sum += smoothstep(size, size * 0.25, d) * max(twinkle, 0.0);
    }
  }
  return sum;
}
void main() {
  vec2 p = vec2(vNdc.x * uAspect, vNdc.y);
  vec2 a = vec2(uFrom.x * uAspect, uFrom.y);
  vec2 b = vec2(uTo.x * uAspect, uTo.y);
  vec2 dir = normalize(b - a);
  vec2 ap = p - a;
  float r = max(length(ap), 1e-4);
  // signed angle off his gaze
  float ang = atan(dir.x * ap.y - dir.y * ap.x, dot(ap, dir));
  float u = ang / ${BEAM_SPREAD.toFixed(3)};
  float fan = exp(-u * u);
  // starts just off his face, then fades softly with distance
  float fall = smoothstep(0.0, 0.25, r) * exp(-r / ${BEAM_FALL.toFixed(3)});
  // faint soft rays fanning out (slowly shifting), and haze drifting up through the light
  float rays = 0.82 + 0.18 * noise(vec2(ang * 9.0, uTime * 0.06));
  vec2 q = p * 1.4 + vec2(uTime * 0.02, -uTime * 0.05);
  float haze = 0.72 + 0.28 * noise(q) + 0.12 * (noise(q * 2.3 + 7.0) - 0.5);
  float alpha = uStrength * uGlow * fan * fall * rays * haze;
  // dust specks, only seen where the light is (three sizes / depths)
  float specks = dust(p, 22.0, 0.0) + 0.8 * dust(p, 34.0, 4.0) + 0.6 * dust(p, 52.0, 9.0);
  alpha += 0.9 * uGlow * specks * fan * fall;
  // a little dither so the soft falloff doesn't band in 8 bits
  alpha += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  alpha = max(alpha, 0.0);
  // premultiplied, added on (the canvas is transparent): the light's colour, and a third of its
  // strength as coverage, so the browser shows even the faintest part (an alpha that rounds
  // to 0 hides the pixel, which drew a hard edge) and the page under it dims a touch
  gl_FragColor = vec4(uColor * alpha, alpha * 0.3);
}`;

function makeBeam() {
  const uniforms = {
    uTime: { value: 0 },
    uGlow: { value: 1 },
    uColor: { value: [1, 0.88, 0.74] as number[] },
    uStrength: { value: 0.55 },
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
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneFactor,
      blendSrcAlpha: OneFactor,
      blendDstAlpha: OneFactor,
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
    // Dramatic rim light (like a product shot on black): he's a dark, glossy silhouette and
    // only his edges catch the light. The TV in front of him (he faces +z) lights him from
    // ahead and from below his head (a light level with or above it mirrors off the top of
    // his dome straight at the camera), so from behind just the outlines of his head and
    // shoulders shine and the top of his head stays fairly dark; the side screens, off to his left and right at a grazing angle, trace
    // his sides. No fill: next to nothing reaches his back.
    renderer.toneMappingExposure = 1.1;
    scene.add(new HemisphereLight(0x2a241f, 0x000000, 0.04));
    screenBase = 5;
    screenLight = new DirectionalLight(0xfff1e0, screenBase);
    screenLight.position.set(0, -0.6, 3);
    scene.add(screenLight);
    for (const x of [-1, 1]) {
      const side = new DirectionalLight(0xffd2a6, 6);
      side.position.set(x * 2.2, 1.0, 1.6);
      scene.add(side);
      sides.push(side);
    }
  }

  const fovY = o.fov ?? 18;
  const camera = new PerspectiveCamera(fovY, 1, 0.1, 20);
  const reduced = reducedMotion;
  let head: Object3D | null = null;
  let ready = false;
  let visible = true;
  let raf = 0;
  let t0 = 0;
  let glow = 1;
  // blinking: when the next one starts (s), and the light's level through one (0 = shut)
  // random gaps of 2–8 s (shorter ones more likely); about one in five is a double blink
  const gap = () => 2 + 6 * Math.pow(Math.random(), 1.4);
  let nextBlink = 1.5 + Math.random() * 3;
  const BLINK = { close: 0.07, shut: 0.06, open: 0.16 }; // s
  const blinkLevel = (s: number) => {
    if (!o.blink || reduced) return 1;
    let t = s - nextBlink;
    if (t < 0) return 1;
    const { close, shut, open } = BLINK;
    if (t < close) return 1 - t / close;
    if ((t -= close) < shut) return 0;
    if ((t -= shut) < open) {
      const k = t / open;
      return k * k * (3 - 2 * k);
    }
    nextBlink = s + (Math.random() < 0.2 ? 0.12 + Math.random() * 0.1 : gap());
    return 1;
  };
  let beam: ReturnType<typeof makeBeam> | null = null;
  // screen light: a thin glow round his silhouette (fresnel), none on top, in the
  // screen's colour — the light wrapping round his edges
  const rim = { uRimColor: { value: new Color(...IDLE) }, uRimStrength: { value: 1.1 } };
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
      rim.uRimColor.value.setRGB(tint[0], tint[1], tint[2]);
    }
    if (beam) {
      beam.uniforms.uTime.value = s;
      beam.uniforms.uGlow.value = glow * (0.04 + 0.96 * blinkLevel(s));
      beam.uniforms.uColor.value = tint;
      // the shaft's ends on screen: the front of his face, and far along his gaze
      head!.updateWorldMatrix(true, true);
      from.set(0, 0, 0);
      beam.anchor.localToWorld(from).project(camera);
      to.set(0, 0, 4);
      beam.anchor.localToWorld(to).project(camera);
      // the direction his gaze runs on screen (only the direction is used)
      const dx = (to.x - from.x) * camera.aspect;
      const dy = to.y - from.y;
      const k = 1 / Math.max(1e-4, Math.hypot(dx, dy));
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
    // paused while the site menu is open (it's under the menu's blur; see hero-scene.ts)
    if (visible && !document.hidden && document.documentElement.dataset.menu !== 'open') raf = requestAnimationFrame(tick);
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
      const done = new Set<MeshStandardMaterial>();
      root.traverse((obj) => {
        const m = (obj as Mesh).material as MeshStandardMaterial | undefined;
        if (!m || !('metalness' in m) || done.has(m)) return;
        done.add(m);
        // the model came from FBX Phong: tone the metal down, it reads as painted plastic
        m.metalness = 0.15;
        m.roughness = 0.55;
        m.envMapIntensity = 0.9;
        if (o.light === 'screen') {
          // dark and glossy, so the edges catch crisp, bright highlights
          m.color.multiplyScalar(0.18);
          m.metalness = 0.3;
          m.roughness = 0.3;
          m.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, rim);
            shader.fragmentShader = shader.fragmentShader
              .replace('void main() {', 'uniform vec3 uRimColor;\nuniform float uRimStrength;\nvoid main() {')
              .replace(
                '#include <opaque_fragment>',
                `float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 7.0);
                outgoingLight += uRimColor * fres * uRimStrength * (1.0 - smoothstep(0.1, 0.6, normal.y));
                #include <opaque_fragment>`,
              );
          };
        }
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
  new MutationObserver(run).observe(document.documentElement, { attributes: true, attributeFilter: ['data-menu'] });
  canvas.addEventListener('webglcontextlost', fail);
}
