/**
 * Home hero — one WebGL scene (ported from the "robot-hero draft v2" prototype):
 * - the robot (public/models/hello-robot.glb) cropped at the torso; his head follows the
 *   mouse, the body takes a little of the turn; after a few seconds without the mouse he
 *   looks around on his own; he "breathes" slightly;
 * - behind him the sticker graphics (public/images/home/hero-bg.jpg, an equirect 2:1
 *   picture) on a virtual sphere — tiled, a little fisheye at the edges — that turns with
 *   (by default against) the head.
 *
 * The settings and the background picture come from the CMS (Home page → Hero (3D,
 * desktop)); anything left out there takes the defaults below.
 *
 * Desktop only (HomeHero imports this only there). Off screen or in a hidden tab it stops
 * drawing. With reduced motion the head doesn't look around on its own and doesn't breathe.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
/** Defaults (the prototype's tuned values); the CMS overrides all but head / pivot */
const DEFAULTS = {
  head: 'tripo_part_3', // mesh that turns as the head
  pivot: [0.003, 0.888, -0.004] as [number, number, number], // neck point, model space
  maxYawDeg: 55, // head turn left / right
  maxPitchDeg: 18, // head tilt up / down
  damping: 4, // how fast the head catches up (higher = snappier)
  torsoShare: 0.15, // share of the turn taken by the whole body
  idleAfterMs: 4000, // looks around on his own after this long without the mouse
  robotScale: 1.4, // scaled around the frame centre
  robotLiftOfFrame: -0.41, // vertical shift, share of the frame's height
  bgRotationStrength: 0.45, // background turn relative to the head (1 = same angle)
  bgSameDirection: false, // false = the background turns against the head
  bgTiles: 4, // picture repeats round the sphere and top to bottom
  bgFisheye: 0.14, // edge distortion, 0..1
  bgFovDeg: 84, // background field of view (smaller = bigger graphics)
  bgOpacity: 0.9, // graphics over white, 0..1
};
export type HeroSettings = typeof DEFAULTS;

// Part of the model kept in frame: from mid-torso to just above the head (model units).
const FRAME = { top: 1.06, bottom: 0.5, width: 0.62 };

const BG_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const BG_FRAG = `
uniform sampler2D map;
uniform float tiles, opacity, tanH, aspect, fish;
uniform mat3 rot;
varying vec2 vUv;
void main(){
  vec2 p = vUv * 2.0 - 1.0; p.x *= aspect;
  float r2 = dot(p, p) / (1.0 + aspect * aspect);   // 0 at the centre, 1 in the corners
  vec2 q = p * (1.0 + fish * 3.0 * r2);               // barrel: rays pushed out at the edges
  vec3 d = normalize(rot * vec3(q * tanH, -1.0));
  float lon = atan(d.x, -d.z);
  float lat = asin(clamp(d.y, -1.0, 1.0));
  vec2 uv = vec2(lon / 6.2831853, lat / 3.1415927) * tiles + 0.5;
  vec3 c = texture2D(map, uv).rgb;
  gl_FragColor = vec4(mix(vec3(1.0), c, opacity), 1.0);
}`;

export function mountHeroScene(o: {
  host: HTMLElement;
  className: string;
  modelUrl: string;
  bgUrl: string;
  config?: Partial<HeroSettings>;
  label?: string;
  onLive?: () => void;
  onFail?: () => void;
}) {
  const config: HeroSettings = { ...DEFAULTS, ...o.config };
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch {
    o.onFail?.();
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0xffffff, 1);
  renderer.autoClear = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const canvas = renderer.domElement;
  canvas.className = o.className;
  if (o.label) {
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', o.label);
  }
  o.host.appendChild(canvas);

  // Robot: neutral studio light; the background never lights or reflects on him.
  // (×π: three r155+ uses physical light units, the prototype was r147)
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.6 * Math.PI);
  key.position.set(1.2, 2.0, 2.2);
  const rim = new THREE.DirectionalLight(0xffd9c4, 1.1 * Math.PI);
  rim.position.set(-1.6, 1.4, -1.8);
  scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0x8a8580, 0.35 * Math.PI));
  const camera = new THREE.PerspectiveCamera(26, 1, 0.01, 20);

  // Background: a full-screen quad, each pixel casts a ray onto the virtual sphere.
  const bgScene = new THREE.Scene();
  const bgCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const bgUniforms = {
    map: { value: null as THREE.Texture | null },
    tiles: { value: 1 },
    opacity: { value: 1 },
    tanH: { value: 1 },
    aspect: { value: 1 },
    fish: { value: 0 },
    rot: { value: new THREE.Matrix3() },
  };
  bgScene.add(
    new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: bgUniforms,
        vertexShader: BG_VERT,
        fragmentShader: BG_FRAG,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    ),
  );
  const bgEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const bgM4 = new THREE.Matrix4();

  // ── layout ──
  function layout() {
    const w = o.host.clientWidth || innerWidth;
    const h = o.host.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const halfV = THREE.MathUtils.degToRad(camera.fov / 2);
    const dist = Math.max(
      (FRAME.top - FRAME.bottom) / (2 * Math.tan(halfV)),
      FRAME.width / (2 * Math.tan(halfV) * camera.aspect),
    );
    const cy = (FRAME.top + FRAME.bottom) / 2;
    camera.position.set(0, cy + 0.03, dist);
    camera.lookAt(0, cy, 0);
    camera.updateProjectionMatrix();
    bgUniforms.aspect.value = camera.aspect;
  }
  new ResizeObserver(layout).observe(o.host);
  layout();

  // ── pointer ──
  const pointer = new THREE.Vector2();
  let lastMove = -Infinity;
  let hasPointer = false;
  const onPointer = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    lastMove = performance.now();
    hasPointer = true;
  };
  addEventListener('pointermove', onPointer, { passive: true });
  addEventListener('pointerdown', onPointer, { passive: true });
  document.addEventListener('pointerleave', () => (hasPointer = false));
  addEventListener('blur', () => (hasPointer = false));

  // ── model + head pivot (a "rig" without bones) ──
  const rig: { stage?: THREE.Group; body?: THREE.Group; pivot?: THREE.Group } = {};
  let live = false;
  new GLTFLoader().load(
    o.modelUrl,
    ({ scene: model }) => {
      const head = model.getObjectByName(config.head);
      if (!head) console.warn(`[hero] no "${config.head}" in the model`);
      rig.stage = new THREE.Group();
      rig.body = new THREE.Group();
      rig.body.add(model);
      rig.stage.add(rig.body);
      scene.add(rig.stage);
      model.updateMatrixWorld(true);
      rig.pivot = new THREE.Group();
      rig.pivot.position.fromArray(config.pivot);
      rig.pivot.rotation.order = 'YXZ';
      model.add(rig.pivot);
      rig.pivot.updateMatrixWorld(true);
      if (head) rig.pivot.attach(head);
    },
    undefined,
    () => fail(),
  );
  new THREE.TextureLoader().load(
    o.bgUrl,
    (tex) => {
      tex.colorSpace = THREE.NoColorSpace; // the shader passes sRGB through untouched
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      bgUniforms.map.value = tex;
    },
    undefined,
    () => fail(),
  );

  // ── loop ──
  const headScreen = new THREE.Vector3();
  const cur = { yaw: 0, pitch: 0 };
  const clock = new THREE.Clock();
  const D2R = THREE.MathUtils.degToRad;
  let raf = 0;
  let failed = false;
  function fail() {
    if (failed) return;
    failed = true;
    cancelAnimationFrame(raf);
    canvas.remove();
    o.onFail?.();
  }

  function tick() {
    raf = 0;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const c = config;
    if (rig.pivot && rig.body && rig.stage) {
      let tx = 0;
      let ty = 0;
      const idle = !hasPointer || performance.now() - lastMove > c.idleAfterMs;
      if (idle && !reduceMotion) {
        tx = Math.sin(t * 0.35) * 0.45;
        ty = Math.sin(t * 0.23 + 1.2) * 0.25;
      } else if (!idle) {
        rig.pivot.getWorldPosition(headScreen).project(camera);
        tx = THREE.MathUtils.clamp((pointer.x - headScreen.x) * 1.1, -1, 1);
        ty = THREE.MathUtils.clamp((pointer.y - headScreen.y) * 1.1, -1, 1);
      }
      const k = 1 - Math.exp(-dt * c.damping);
      cur.yaw += (tx * D2R(c.maxYawDeg) - cur.yaw) * k;
      cur.pitch += (-ty * D2R(c.maxPitchDeg) - cur.pitch) * k;
      rig.body.rotation.y = cur.yaw * c.torsoShare;
      rig.pivot.rotation.y = cur.yaw * (1 - c.torsoShare);
      rig.pivot.rotation.x = cur.pitch;
      rig.body.position.y = reduceMotion ? 0 : Math.sin(t * 1.6) * 0.0025;
      const s = c.robotScale;
      const cy = (FRAME.top + FRAME.bottom) / 2;
      rig.stage.scale.setScalar(s);
      rig.stage.position.y = cy * (1 - s) + c.robotLiftOfFrame * (FRAME.top - FRAME.bottom);
    }
    const par = c.bgRotationStrength * (c.bgSameDirection ? 1 : -1);
    bgEuler.set(cur.pitch * par, cur.yaw * par, 0);
    bgUniforms.rot.value.setFromMatrix4(bgM4.makeRotationFromEuler(bgEuler).invert());
    bgUniforms.tiles.value = c.bgTiles;
    bgUniforms.opacity.value = c.bgOpacity;
    bgUniforms.fish.value = c.bgFisheye;
    bgUniforms.tanH.value = Math.tan(D2R(c.bgFovDeg / 2));

    renderer.clear();
    if (bgUniforms.map.value) renderer.render(bgScene, bgCamera);
    renderer.clearDepth();
    renderer.render(scene, camera);

    // shown once both the robot and the background are in
    if (!live && rig.stage && bgUniforms.map.value) {
      live = true;
      o.onLive?.();
    }
    if (running) raf = requestAnimationFrame(tick);
  }

  // only draw while the hero is on screen and the tab is visible
  let onScreen = true;
  let running = false;
  const update = () => {
    const should = !failed && onScreen && !document.hidden;
    if (should && !running) {
      running = true;
      clock.getDelta();
      if (!raf) raf = requestAnimationFrame(tick);
    } else if (!should) running = false;
  };
  new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    update();
  }).observe(o.host);
  document.addEventListener('visibilitychange', update);
  canvas.addEventListener('webglcontextlost', fail);
  update();
}
