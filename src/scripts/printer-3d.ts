/**
 * Contact block — the RCPT-01 receipt printer as a live 3D model (public/models/rcpt-01.glb)
 * on a transparent canvas, in place of the printer photo on the right of every screen.
 * It stands still at a fixed angle (no float, no mouse), with no paper out. `print(receipt)`
 * on the returned handle feeds a receipt out of the slot, bottom first so it hangs the right
 * way up and ends with its top under the slot (the canvas from receipt.ts, drawn
 * on a paper strip that follows the model's paper curve, then hangs down) while the model's
 * "Print" animation turns the rollers and presses the button. The receipt stays out until
 * the next one.
 *
 * Desktop only — ContactFlow imports this only on wide screens with a mouse, once the block
 * is near the screen (so phones never fetch three.js or the model). It draws a frame only
 * when needed (shown, resized, or while Print plays). If WebGL or the
 * model fails, the photo stays.
 *
 * The model is meshopt-compressed (EXT_meshopt_compression), hence the decoder.
 */
import {
  ACESFilmicToneMapping,
  AnimationMixer,
  Box3,
  Clock,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DirectionalLight,
  FrontSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  LoopOnce,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  PCFSoftShadowMap,
  type AnimationAction,
  type Material,
  type Object3D,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const MODEL = '/models/rcpt-01.glb';

/** The printer's resting angle (radians): its face (screen, receipt slot) turned a little
 * to the left, showing the side with the drive wheel, as in the photo it replaces */
const BASE_YAW = Math.PI - 0.55;
const BASE_PITCH = 0.12;

// ── The paper (in the model's frame: the printer 1 tall, centred). Measured from the
// model's own receipt mesh, which is hidden: the slot is 0.234 wide (x 0.1295 → -0.1041;
// the receipt's left edge, as seen from the front, is +x), the paper leaves it at
// (y -0.171, z -0.043) heading down and towards the front (-z), then gravity bends it down.
const PAPER_X_LEFT = 0.1295;
const PAPER_W = 0.2336;
/** the receipt is 546×1584 */
const PAPER_L = (PAPER_W * 1584) / 546;
const EXIT = { y: -0.171, z: -0.043 };
/** the paper's angle from straight down towards the front, at the slot and far below */
const ANGLE_START = Math.atan2(0.6, 0.8);
const ANGLE_END = 0.08;
/** how quickly it bends from the one to the other (model units) */
const BEND = 0.15;
/** the paper starts this far back inside the printer, so its cut edge never shows */
const INSIDE = 0.03;
/** rows along the receipt / columns across it */
const ROWS = 220;
const COLS = 3;
/** seconds to print one receipt */
const FEED = 6;

/** The drive train, turning while the paper feeds: each pivot in the model (they all turn
 * about their shaft, the x axis) and its speed in rad/s — the motor fastest, the big gear
 * slowest, the rollers pulling the paper, the roll unwinding */
const SPIN: Record<string, number> = {
  Pivot_Motor: 14,
  Pivot_Tensioner: 9,
  Pivot_Hero: -3.2,
  Pivot_Drive: 6,
  Pivot_Pinch: -6,
  Pivot_Guide: -7,
  Pivot_Roll: 1.6,
};
/** seconds the drive takes to get up to speed / to stop */
const SPIN_RAMP = 0.4;

/** Fine surface grain for every material but the paper: a little 3D noise in the
 * roughness, the colour and the normal, so plastic reads as moulded plastic and metal as
 * machined, not as flat colour. Worked out from the world position (the model has no UVs
 * for a texture). */
function addGrain(m: Material) {
  const grain = /Plastic|Rubber|Powder|Graphite|Chip/.test(m.name) ? 0.09 : 0.05;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGrain = { value: grain };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrainPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGrainPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vGrainPos;
        uniform float uGrain;
        float gHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float gNoise(vec3 x) {
          vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(gHash(i), gHash(i + vec3(1,0,0)), f.x), mix(gHash(i + vec3(0,1,0)), gHash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(gHash(i + vec3(0,0,1)), gHash(i + vec3(1,0,1)), f.x), mix(gHash(i + vec3(0,1,1)), gHash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float gFine = gNoise(vGrainPos * 900.0);
        float gBroad = gNoise(vGrainPos * 60.0);
        roughnessFactor = clamp(roughnessFactor + (gFine - 0.5) * uGrain * 2.5 + (gBroad - 0.5) * uGrain * 1.5, 0.04, 1.0);
        diffuseColor.rgb *= 1.0 + (gBroad - 0.5) * uGrain * 0.9;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        vec3 gP = vGrainPos * 1400.0;
        normal = normalize(normal + (vec3(gNoise(gP), gNoise(gP + 31.7), gNoise(gP + 71.3)) - 0.5) * uGrain * 0.6);`,
      );
  };
  m.customProgramCacheKey = () => `grain-${grain}`;
  m.needsUpdate = true;
}

export interface PrinterOptions {
  /** the canvas fills this (it should be positioned) */
  host: HTMLElement;
  className: string;
  /** how much of the canvas height the printer takes */
  fill?: number;
  onLive?: () => void;
  onFail?: () => void;
}

export function mountPrinter(o: PrinterOptions) {
  const canvas = document.createElement('canvas');
  canvas.className = o.className;
  canvas.setAttribute('aria-hidden', 'true');

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    o.onFail?.();
    return null;
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  // Lighting with more contrast than a plain studio wash: less of the soft room light, a
  // strong key from the upper left (as the light falls on the page) that casts shadows —
  // gears on the case, the rollers in their cavity — and a cool rim from behind on the right
  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();
  const key = new DirectionalLight(0xfff6ec, 3.2);
  key.position.set(-2.2, 3, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -0.75;
  key.shadow.camera.right = key.shadow.camera.top = 0.75;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 8;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.004;
  key.shadow.radius = 3;
  scene.add(key);
  const rim = new DirectionalLight(0xdfe8ff, 1.3);
  rim.position.set(2.5, 1.5, -2);
  scene.add(rim);

  const camera = new PerspectiveCamera(24, 1, 0.01, 100);
  /** holds the model, centred on its middle, at its fixed angle */
  const rig = new Group();
  rig.rotation.set(BASE_PITCH, BASE_YAW, 0);
  scene.add(rig);

  let mixer: AnimationMixer | null = null;
  let printAction: AnimationAction | null = null;
  let ready = false;
  let dist = 1;

  // ── The receipt strip: a grid whose rows each carry a fixed line of the receipt (so the
  // picture stays put on the paper) and move along the paper's path as it feeds
  const path: { y: number; z: number }[] = [];
  const STEP = 0.002;
  {
    let y = EXIT.y + Math.cos(ANGLE_START) * INSIDE;
    let z = EXIT.z + Math.sin(ANGLE_START) * INSIDE;
    for (let d = 0; d <= INSIDE + PAPER_L + 0.05; d += STEP) {
      path.push({ y, z });
      const out = Math.max(0, d - INSIDE);
      const a = ANGLE_END + (ANGLE_START - ANGLE_END) * Math.exp(-out / BEND);
      y -= Math.cos(a) * STEP;
      z -= Math.sin(a) * STEP;
    }
  }
  const at = (d: number) => {
    const f = Math.max(0, Math.min(path.length - 1.001, d / STEP));
    const i = Math.floor(f);
    const t = f - i;
    return { y: path[i].y + (path[i + 1].y - path[i].y) * t, z: path[i].z + (path[i + 1].z - path[i].z) * t };
  };
  const paperGeo = new BufferGeometry();
  const positions = new Float32Array((ROWS + 1) * (COLS + 1) * 3);
  const uvs = new Float32Array((ROWS + 1) * (COLS + 1) * 2);
  const index: number[] = [];
  for (let r = 0; r <= ROWS; r++) {
    for (let c = 0; c <= COLS; c++) {
      const i = r * (COLS + 1) + c;
      uvs[i * 2] = c / COLS;
      // row 0 (the end that comes out first) is the receipt's bottom: it prints bottom
      // first, so it hangs the right way up and ends with its top (number, name) under the slot
      uvs[i * 2 + 1] = r / ROWS;
      if (r < ROWS && c < COLS) {
        const a = i;
        const b = i + 1;
        const d = i + COLS + 1;
        const e = d + 1;
        index.push(a, d, b, b, d, e);
      }
    }
  }
  paperGeo.setIndex(index);
  paperGeo.setAttribute('position', new BufferAttribute(positions, 3));
  paperGeo.setAttribute('uv', new BufferAttribute(uvs, 2));
  // the grid's triangles face away from the camera: the printed side is their back
  // The printed side: matte, and glowing a little with its own picture so the paper stays
  // white and the print stays black wherever the light falls (not grey on grey); colours
  // as drawn (no tone mapping, which would wash them out)
  const paperFront = new MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, side: BackSide, envMapIntensity: 0.4, emissive: 0xffffff, emissiveIntensity: 0.45, toneMapped: false });
  const paperBack = new MeshStandardMaterial({ color: 0xece9e0, roughness: 1, metalness: 0, side: FrontSide });
  const paper = new Group();
  paper.add(new Mesh(paperGeo, paperFront), new Mesh(paperGeo, paperBack));
  paper.children.forEach((m) => {
    m.castShadow = true;
    m.receiveShadow = true;
  });
  paper.visible = false;
  rig.add(paper);
  /** lays the paper out with `fed` (0–1) of the receipt out of the slot */
  const feedTo = (fed: number) => {
    const head = fed * (PAPER_L + INSIDE);
    for (let r = 0; r <= ROWS; r++) {
      const p = at(Math.max(0, head - (r / ROWS) * PAPER_L));
      for (let c = 0; c <= COLS; c++) {
        const i = (r * (COLS + 1) + c) * 3;
        positions[i] = PAPER_X_LEFT - (c / COLS) * PAPER_W;
        positions[i + 1] = p.y;
        positions[i + 2] = p.z;
      }
    }
    paperGeo.attributes.position.needsUpdate = true;
    paperGeo.computeVertexNormals();
    paperGeo.computeBoundingSphere();
  };
  let fed = 1;
  let feeding = false;
  const spinners: { pivot: Object3D; speed: number }[] = [];
  /** seconds since this print started (the drive's speed ramps with it) */
  let printing = 0;

  const size = () => {
    const w = o.host.clientWidth || 1;
    const h = o.host.clientHeight || 1;
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(
    MODEL,
    (gltf) => {
      const model = gltf.scene;
      // centre it and scale it to 1 unit tall
      const box = new Box3().setFromObject(model);
      const c = box.getCenter(new Vector3());
      const s = box.getSize(new Vector3());
      const unit = 1 / Math.max(s.y, 1e-6);
      model.position.sub(c);
      const holder = new Group();
      holder.add(model);
      holder.scale.setScalar(unit);
      rig.add(holder);
      // no paper out to start with: the model's own receipt is hidden for good
      model.getObjectByName('Receipt_Strip')?.removeFromParent();
      // shadows and surface grain on every part
      const seen = new Set<Material>();
      model.traverse((obj: Object3D) => {
        const m = obj as Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        m.receiveShadow = true;
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
          if (seen.has(mat) || /^LED/.test(mat.name)) continue;
          seen.add(mat);
          addGrain(mat);
        }
      });
      for (const name of Object.keys(SPIN)) {
        const pivot = model.getObjectByName(name);
        if (pivot) spinners.push({ pivot, speed: SPIN[name] });
      }
      // the camera backs off until the printer fills `fill` of the height
      const fill = o.fill ?? 1.25;
      const radius = (Math.max(s.x, s.y, s.z) * unit) / 2;
      dist = (0.5 / fill / Math.tan((camera.fov * Math.PI) / 360)) + radius;
      camera.position.set(0, 0, dist);
      camera.lookAt(0, 0, 0);

      // from the model's Print animation only the button press is kept (the drive train
      // turns below, faster than the animation turns it)
      const clip = gltf.animations.find((a) => a.name === 'Print') ?? gltf.animations[0];
      if (clip) {
        clip.tracks = clip.tracks.filter((t) => t.name.startsWith('PrintButton'));
        clip.resetDuration();
        mixer = new AnimationMixer(model);
        printAction = mixer.clipAction(clip);
        printAction.setLoop(LoopOnce, 1);
      }
      ready = true;
      o.host.appendChild(canvas);
      size();
      draw(0);
      o.onLive?.();
      run();
    },
    undefined,
    () => {
      renderer.dispose();
      o.onFail?.();
    },
  );

  const clock = new Clock();
  const draw = (dt: number) => {
    mixer?.update(dt);
    if (feeding) {
      printing += dt;
      // the drive spins up, runs, and coasts to a stop as the paper finishes
      const speed = Math.min(1, printing / SPIN_RAMP, Math.max(0, (FEED - printing) / SPIN_RAMP));
      for (const s of spinners) s.pivot.rotation.x += s.speed * speed * dt;
      fed = Math.min(1, fed + dt / FEED);
      feedTo(fed);
      if (fed >= 1) feeding = false;
    }
    renderer.render(scene, camera);
  };

  // ── Draw only while on screen and the tab is visible
  let visible = false;
  let raf = 0;
  const loop = () => {
    raf = 0;
    if (!ready || !visible || document.hidden) return;
    draw(Math.min(0.05, clock.getDelta()));
    // still: keep drawing only while a receipt prints
    if (feeding || printAction?.isRunning()) raf = requestAnimationFrame(loop);
  };
  const run = () => {
    if (raf || !ready || !visible || document.hidden) return;
    clock.getDelta();
    raf = requestAnimationFrame(loop);
  };
  new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    run();
  }).observe(o.host);
  document.addEventListener('visibilitychange', run);
  new ResizeObserver(() => {
    if (!ready) return;
    size();
    draw(0);
  }).observe(o.host);

  const handle = {
    /** feeds `receipt` (a canvas) out of the slot, its bottom first */
    print(receipt: HTMLCanvasElement) {
      const old = paperFront.map;
      const map = new CanvasTexture(receipt);
      map.colorSpace = SRGBColorSpace;
      map.anisotropy = renderer.capabilities.getMaxAnisotropy();
      paperFront.map = map;
      paperFront.emissiveMap = map;
      paperFront.needsUpdate = true;
      old?.dispose();
      fed = 0;
      printing = 0;
      feedTo(0);
      paper.visible = true;
      feeding = true;
      printAction?.reset().play();
      run();
    },
  };
  return handle;
}
