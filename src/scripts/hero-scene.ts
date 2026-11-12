/**
 * Home hero — one WebGL scene (ported from the "robot-hero draft v2" prototype):
 * - the robot (public/models/hello-robot.glb, its head swapped for public/models/
 *   sentinel-head.glb, with a slight glossy lacquer) cropped at the torso; his head follows the
 *   mouse, the body takes a little of the turn; after a few seconds without the mouse he
 *   looks around on his own; he "breathes" slightly;
 * - now and then a photographer's flash lights him and the sphere for a moment and casts
 *   his soft shadow on it (only the light shows, not the flash itself);
 * - behind him the sticker graphics (public/images/home/hero-bg.jpg, an equirect 2:1
 *   picture) on a virtual sphere — tiled, a little fisheye at the edges, the top bent like a
 *   curved screen — that turns with
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
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { sfx } from './sound';
import { reducedMotion } from './media-query';
import { ledStrip, ledTick, ledUse } from './robot-led';
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
  bgBendTop: 0.4, // the top bends like a curved screen (rows bow down towards the sides), 0..1
  bgFovDeg: 84, // background field of view (smaller = bigger graphics)
  bgOpacity: 0.9, // graphics over white, 0..1
};
export type HeroSettings = typeof DEFAULTS;

// TEST: the sphere's fresnel edge glow, 0 (off) … 1 (strong)
const FRESNEL = 0.8;
// TEST: the sphere's edges — an extra warp that only grows near them (0 = off), and a soft
// blur that grows towards them (0 = off, 1 = about 7 px at the corners, 2.5 ≈ 17 px)
const EDGE_WARP = 0.35;
const EDGE_BLUR = 2.5;

// Part of the model kept in frame: from mid-torso to just above the head (model units).
const FRAME = { top: 1.06, bottom: 0.5, width: 0.62 };

const BG_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const BG_FRAG = `
uniform sampler2D map;
uniform float tiles, opacity, tanH, aspect, fish, bendTop;
uniform mat3 rot;
// photographer's flash on the sphere: its level, where its hotspot lands (uv), and the
// robot's silhouette (rendered small while a flash is on) cast as his shadow: projected from
// the flash's spot on screen (shadowFrom) and enlarged by shadowScale — the sphere is
// further away than he is — so it falls long and away from the flash, with a firm edge
uniform float flash, shadowScale;
// TEST: fresnel — the sphere's edge glows like glass seen at a grazing angle (0 = off)
uniform float fresnel, edgeWarp, edgeBlur;
uniform vec2 flashAt, shadowFrom;
uniform sampler2D shadowMask;
varying vec2 vUv;
void main(){
  vec2 p = vUv * 2.0 - 1.0; p.x *= aspect;
  float r2 = dot(p, p) / (1.0 + aspect * aspect);   // 0 at the centre, 1 in the corners
  vec2 q = p * (1.0 + fish * 3.0 * r2);               // barrel: rays pushed out at the edges
  // TEST: edge warp — nothing in the middle, stretching harder and harder near the edges
  q *= 1.0 + edgeWarp * 2.0 * r2 * r2 * r2;
  // top bend: towards the top, the further out to the sides the higher it samples, so rows
  // there bow down at the sides like the top of a curved screen
  float top = smoothstep(0.0, 1.0, vUv.y);
  q.y += bendTop * 2.25 * top * top * (p.x / aspect) * (p.x / aspect);
  vec3 d = normalize(rot * vec3(q * tanH, -1.0));
  float lon = atan(d.x, -d.z);
  float lat = asin(clamp(d.y, -1.0, 1.0));
  vec2 uv = vec2(lon / 6.2831853, lat / 3.1415927) * tiles + 0.5;
  // TEST: edge blur — sharp in the middle, softer towards the edges: two rings of taps (sized
  // in screen pixels from the uv's own derivatives) plus a little mipmap softening
  float edge = smoothstep(0.3, 1.0, r2) * edgeBlur;
  vec2 dx = dFdx(uv), dy = dFdy(uv); // outside the branch: derivatives need every pixel
  vec3 c;
  if (edge > 0.001) {
    float rad = edge * 7.0;
    // two rings (full and half radius, the inner one turned half a step) keep a wide blur
    // smooth instead of grainy
    float bias = min(edge * 1.5, 4.0);
    c = texture2D(map, uv, bias).rgb;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398;
      c += texture2D(map, uv + (dx * cos(a) + dy * sin(a)) * rad, bias).rgb;
      c += texture2D(map, uv + (dx * cos(a + 0.3927) + dy * sin(a + 0.3927)) * rad * 0.5, bias).rgb;
    }
    c /= 17.0;
  } else {
    c = texture2D(map, uv).rgb;
  }
  vec3 col = mix(vec3(1.0), c, opacity);
  // TEST: fresnel. From the sphere's centre we'd always see it head-on, so it's faked on
  // screen: towards the edges and corners (r2: 0 middle, 1 corners) the graphics wash out
  // to a glassy white, with a faint warm rim just inside it
  float fr = pow(clamp(r2 * 1.25, 0.0, 1.0), 2.2);
  col = mix(col, vec3(1.0), fresnel * fr * 0.85);
  col += vec3(0.06, 0.025, 0.0) * fresnel * smoothstep(0.25, 0.7, fr) * (1.0 - fr);
  if (flash > 0.0) {
    // the flash lights the graphics: brightest round its hotspot, a little everywhere
    vec2 h = (vUv - flashAt) * vec2(aspect, 1.0);
    float spot = 0.35 + 0.65 * exp(-dot(h, h) * 1.6);
    col += (1.0 - col) * flash * 0.55 * spot;
    // the robot's shadow: the point of him that shades this spot of the sphere lies on the
    // line to the flash, closer by shadowScale; a light blur keeps the edge firm but clean
    vec2 su = shadowFrom + (vUv - shadowFrom) / shadowScale;
    float sh = 0.0;
    for (int i = -1; i <= 1; i++) {
      for (int j = -1; j <= 1; j++) {
        sh += texture2D(shadowMask, su + vec2(float(i), float(j)) * vec2(0.0018 / aspect, 0.0018)).r;
      }
    }
    sh = smoothstep(0.15, 0.85, sh / 9.0);
    col *= 1.0 - flash * 0.55 * sh;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export function mountHeroScene(o: {
  host: HTMLElement;
  className: string;
  modelUrl: string;
  /** the head model, in the body's units and place; it stands in for the body's own head */
  headUrl: string;
  bgUrl: string;
  config?: Partial<HeroSettings>;
  label?: string;
  onLive?: () => void;
  onFail?: () => void;
}) {
  const config: HeroSettings = { ...DEFAULTS, ...o.config };
  ledUse(); // what the LED strip round his head says (robot-led.ts)
  const reduceMotion = reducedMotion;

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
  scene.environment = pmrem.fromScene(studioEnvironment(), 0.02).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.6 * Math.PI);
  key.position.set(1.2, 2.0, 2.2);
  const rim = new THREE.DirectionalLight(0xffd9c4, 1.7 * Math.PI);
  rim.position.set(-1.6, 1.4, -1.8);
  scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0x8a8580, 0.35 * Math.PI));
  // Photographer's flash, now and then: a bright, cool-white burst from just beside the camera
  // (a little left and up) that lights only the robot — its glossy coat and paint catch it —
  // and dies off fast. The flash itself is never shown; the background isn't lit by it.
  const flash = new THREE.DirectionalLight(0xf4f8ff, 0);
  flash.position.set(-0.5, 1.5, 3);
  scene.add(flash);
  const camera = new THREE.PerspectiveCamera(26, 1, 0.01, 20);

  // Post: the robot is drawn into his own HDR buffer, shaded by ambient occlusion (GTAO, half
  // resolution), his brightest glints bloomed (a dual-filter blur down and up a mip chain),
  // then tone-mapped and laid over the background (see POST below)
  const robotRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const gtao = new GTAOPass(scene, camera, 1, 1);
  gtao.output = GTAOPass.OUTPUT.Off; // only compute it; the composite reads it
  gtao.updateGtaoMaterial({ radius: POST.aoRadius, distanceExponent: 1.5, thickness: 1, scale: 1, samples: 16 });
  const bloomMips = Array.from({ length: 5 }, () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
  const quad = new FullScreenQuad();
  const postMat = (frag: string, uniforms: Record<string, THREE.IUniform>, blending: THREE.Blending = THREE.NoBlending) =>
    new THREE.ShaderMaterial({
      uniforms: { src: { value: null }, texel: { value: new THREE.Vector2() }, ...uniforms },
      vertexShader: BG_VERT,
      fragmentShader: frag,
      blending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
  const prefilterMat = postMat(BLOOM_PREFILTER, {
    threshold: { value: POST.bloomThreshold },
    knee: { value: POST.bloomKnee },
  });
  const downMat = postMat(BLOOM_DOWN, {});
  const upMat = postMat(BLOOM_UP, {}, THREE.AdditiveBlending);
  const compositeMat = new THREE.ShaderMaterial({
    uniforms: {
      robot: { value: robotRT.texture },
      ao: { value: gtao.pdRenderTarget.texture },
      bloom: { value: bloomMips[0].texture },
      aoStrength: { value: POST.aoStrength },
      bloomStrength: { value: POST.bloomStrength },
    },
    vertexShader: BG_VERT,
    fragmentShader: COMPOSITE,
    // premultiplied "over": the robot covers the background, his bloom adds light to it
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    depthTest: false,
    depthWrite: false,
    // tone mapping and sRGB come from the renderer (toneMapping(), linearToOutputTexel())
    toneMapped: true,
  });
  const blit = (mat: THREE.ShaderMaterial, src: THREE.WebGLRenderTarget, target: THREE.WebGLRenderTarget) => {
    mat.uniforms.src.value = src.texture;
    mat.uniforms.texel.value.set(1 / src.width, 1 / src.height);
    renderer.setRenderTarget(target);
    quad.material = mat;
    quad.render(renderer);
  };
  function drawRobot() {
    renderer.setRenderTarget(robotRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    // @ts-expect-error: with output Off the pass reads no buffers
    gtao.render(renderer, null, null);
    blit(prefilterMat, robotRT, bloomMips[0]);
    for (let i = 1; i < bloomMips.length; i++) blit(downMat, bloomMips[i - 1], bloomMips[i]);
    for (let i = bloomMips.length - 2; i >= 0; i--) blit(upMat, bloomMips[i + 1], bloomMips[i]);
    renderer.setRenderTarget(null);
    renderer.setClearColor(0xffffff, 1);
  }

  // Background: a full-screen quad, each pixel casts a ray onto the virtual sphere.
  const bgScene = new THREE.Scene();
  const bgCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  // the robot's silhouette for the flash shadow, small (it's blurred anyway)
  const shadowRT = new THREE.WebGLRenderTarget(1, 1);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const bgUniforms = {
    flash: { value: 0 },
    fresnel: { value: FRESNEL },
    edgeWarp: { value: EDGE_WARP },
    edgeBlur: { value: EDGE_BLUR },
    flashAt: { value: new THREE.Vector2(0.5, 0.6) },
    shadowFrom: { value: new THREE.Vector2(0.5, 0.5) },
    shadowScale: { value: 1.3 },
    shadowMask: { value: shadowRT.texture },
    map: { value: null as THREE.Texture | null },
    tiles: { value: 1 },
    opacity: { value: 1 },
    tanH: { value: 1 },
    aspect: { value: 1 },
    fish: { value: 0 },
    bendTop: { value: 0 },
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
    shadowRT.setSize(Math.max(1, Math.round(w / 4)), Math.max(1, Math.round(h / 4)));
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
    const db = renderer.getDrawingBufferSize(new THREE.Vector2());
    robotRT.setSize(db.x, db.y);
    gtao.setSize(Math.ceil(db.x / 2), Math.ceil(db.y / 2));
    bloomMips.forEach((rt, i) => rt.setSize(Math.max(1, Math.ceil(db.x / 2 ** (i + 1))), Math.max(1, Math.ceil(db.y / 2 ** (i + 1)))));
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
  const loader = new GLTFLoader();
  Promise.all([loader.loadAsync(o.modelUrl), loader.loadAsync(o.headUrl)]).then(
    ([{ scene: model }, { scene: headModel }]) => {
      // the body's own head goes; the head model's mesh takes its name and place
      model.getObjectByName(config.head)?.removeFromParent();
      const headMesh = headModel.getObjectByProperty('type', 'Mesh');
      if (headMesh) {
        headMesh.name = config.head;
        model.add(headMesh);
      }
      // shine and texture: the model is fully matte (roughness 0.82), so each part gets a
      // clear lacquer on top (glossy highlights and room reflections) over a finely grained
      // surface (grain(), below); colours and textures stay as they are
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
      const grainFreq = GRAIN.cells / Math.max(size.x, size.y, size.z, 1e-6);
      const glossy = new Map<THREE.Material, THREE.MeshPhysicalMaterial>();
      model.traverse((n) => {
        const mesh = n as THREE.Mesh;
        const m = mesh.material as THREE.MeshStandardMaterial | undefined;
        if (!mesh.isMesh || !m?.isMeshStandardMaterial) return;
        let g = glossy.get(m);
        if (!g) {
          // copy the standard properties only (the physical copy expects a physical source),
          // then put back the physical shader's defines that the copy replaced
          g = new THREE.MeshPhysicalMaterial();
          THREE.MeshStandardMaterial.prototype.copy.call(g, m);
          g.defines = { STANDARD: '', PHYSICAL: '' };
          if (mesh.name === config.head) {
            // the head is matte plastic: no lacquer, a soft sheen only
            g.roughness = 0.62;
            g.clearcoat = 0;
          } else {
            g.roughness = Math.min(m.roughness, 0.34);
            g.clearcoat = 1;
            g.clearcoatRoughness = 0.04;
          }
          g.specularIntensity = 1;
          g.envMapIntensity = 2.1;
          grain(g, grainFreq, mesh.name === config.head); // the head also gets the LED strip
          glossy.set(m, g);
          m.dispose();
        }
        mesh.material = g;
      });
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

  // flash timing, random like a press pit: the next one comes 1.5–7 s later (short gaps more
  // likely), now and then a quick burst of 2–3; each flash has its own strength and comes
  // from its own spot round the camera (left / right, higher / lower), as if from different
  // photographers. Each burst: up in 20 ms, then a fast exponential fall-off (~0.25 s).
  const FLASH = { peak: 6 * Math.PI, rise: 0.02, fall: 0.07 };
  type Flash = { at: number; strength: number; x: number; y: number; heard?: boolean };
  const flashPos = new THREE.Vector2();
  let flashes: Flash[] = [];
  let nextFlash = 1.5 + Math.random() * 3;
  const shot = (at: number): Flash => ({
    at,
    strength: 0.55 + Math.random() * 0.45,
    x: (Math.random() * 2 - 1) * 1.6,
    y: 0.9 + Math.random() * 1.2,
  });
  const flashLevel = (t: number) => {
    if (reduceMotion) return 0;
    if (t >= nextFlash) {
      // fire it now: after a pause (scrolled away, menu open, another tab) the clock has
      // jumped past it, and starting it in the past skipped both the flash and its sound
      flashes = [shot(t)];
      const r = Math.random();
      const extra = r < 0.12 ? 2 : r < 0.35 ? 1 : 0;
      for (let i = 1; i <= extra; i++) flashes.push(shot(flashes[i - 1].at + 0.12 + Math.random() * 0.22));
      nextFlash = t + 1.5 + 5.5 * Math.pow(Math.random(), 1.6);
    }
    let level = 0;
    for (const f of flashes) {
      const k = t - f.at;
      if (k < 0) continue;
      // the shutter clicks as it fires (silent until the visitor has clicked, or if they
      // turned sound off: see sound.ts)
      if (!f.heard) {
        f.heard = true;
        if (k < 0.3) sfx('shutter'); // (a slow frame still gets its click)
      }
      const l = f.strength * (k < FLASH.rise ? k / FLASH.rise : Math.exp(-(k - FLASH.rise) / FLASH.fall));
      if (l > level) {
        level = l;
        flash.position.set(f.x, f.y, 3);
        flashPos.set(f.x, f.y);
      }
    }
    return level < 0.002 ? 0 : level;
  };

  function tick() {
    raf = 0;
    const dt = Math.min(clock.getDelta(), 0.05);
    const f = flashLevel(clock.elapsedTime);
    flash.intensity = FLASH.peak * f;
    scene.environmentIntensity = 1 + 1.2 * f; // the room reflections brighten with it
    glowUniform.value = GLOW.strength * (1 + GLOW.flashBoost * f); // and so does his edge glow
    ledTick(clock.elapsedTime, reduceMotion);
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
    bgUniforms.bendTop.value = c.bgBendTop;
    bgUniforms.tanH.value = Math.tan(D2R(c.bgFovDeg / 2));

    // during a flash: the robot's silhouette into the small mask, for his shadow on the sphere
    const fl = flash.intensity / FLASH.peak;
    bgUniforms.flash.value = fl;
    if (fl > 0 && rig.stage) {
      bgUniforms.flashAt.value.set(0.5 + flashPos.x * 0.16, 0.5 + (flashPos.y - 1.2) * 0.22);
      // the flash's spot on screen (off to the side / above for a far-out flash)
      bgUniforms.shadowFrom.value.set(0.5 + flashPos.x * 0.35, 0.55 + (flashPos.y - 1.2) * 0.4);
      renderer.setRenderTarget(shadowRT);
      renderer.setClearColor(0x000000, 1);
      renderer.clear();
      scene.overrideMaterial = shadowMat;
      renderer.render(scene, camera);
      scene.overrideMaterial = null;
      renderer.setRenderTarget(null);
      renderer.setClearColor(0xffffff, 1);
    }
    if (rig.stage) drawRobot();
    renderer.clear();
    if (bgUniforms.map.value) renderer.render(bgScene, bgCamera);
    if (rig.stage) {
      quad.material = compositeMat;
      quad.render(renderer);
    }

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
    // paused while the site menu is open: it's behind the menu's full-screen blur, and
    // redrawing under that blur made the menu's fades stutter
    const menuOpen = document.documentElement.dataset.menu === 'open';
    const should = !failed && onScreen && !document.hidden && !menuOpen;
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
  new MutationObserver(update).observe(document.documentElement, { attributes: true, attributeFilter: ['data-menu'] });
  canvas.addEventListener('webglcontextlost', fail);
  update();
}

/** Post settings: ambient occlusion `aoRadius` (world units) and how much it darkens (0..1);
 * bloom: linear brightness where glints start to bloom, the softness of that start, and how
 * strong the bloom is */
const POST = { aoRadius: 0.05, aoStrength: 0.8, bloomThreshold: 1.6, bloomKnee: 0.4, bloomStrength: 0.22 };

const BLOOM_PREFILTER = `
uniform sampler2D src; uniform vec2 texel; uniform float threshold, knee;
varying vec2 vUv;
void main(){
  vec3 c = 0.25 * (texture2D(src, vUv + texel * vec2(-0.5, -0.5)).rgb + texture2D(src, vUv + texel * vec2(0.5, -0.5)).rgb
                 + texture2D(src, vUv + texel * vec2(-0.5, 0.5)).rgb + texture2D(src, vUv + texel * vec2(0.5, 0.5)).rgb);
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - threshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  gl_FragColor = vec4(c * max(soft, br - threshold) / max(br, 1e-4), 1.0);
}`;
const BLOOM_DOWN = `
uniform sampler2D src; uniform vec2 texel;
varying vec2 vUv;
void main(){
  vec3 s = texture2D(src, vUv).rgb * 4.0;
  s += texture2D(src, vUv - texel).rgb + texture2D(src, vUv + texel).rgb;
  s += texture2D(src, vUv + vec2(texel.x, -texel.y)).rgb + texture2D(src, vUv - vec2(texel.x, -texel.y)).rgb;
  gl_FragColor = vec4(s / 8.0, 1.0);
}`;
const BLOOM_UP = `
uniform sampler2D src; uniform vec2 texel;
varying vec2 vUv;
void main(){
  vec3 s = texture2D(src, vUv + vec2(-2.0, 0.0) * texel).rgb + texture2D(src, vUv + vec2(2.0, 0.0) * texel).rgb;
  s += texture2D(src, vUv + vec2(0.0, -2.0) * texel).rgb + texture2D(src, vUv + vec2(0.0, 2.0) * texel).rgb;
  s += 2.0 * (texture2D(src, vUv + vec2(-1.0, -1.0) * texel).rgb + texture2D(src, vUv + vec2(1.0, -1.0) * texel).rgb
            + texture2D(src, vUv + vec2(-1.0, 1.0) * texel).rgb + texture2D(src, vUv + vec2(1.0, 1.0) * texel).rgb);
  gl_FragColor = vec4(s / 12.0, 1.0);
}`;
const COMPOSITE = `
uniform sampler2D robot, ao, bloom;
uniform float aoStrength, bloomStrength;
varying vec2 vUv;
void main(){
  vec4 r = texture2D(robot, vUv);
  float a = r.a;
  vec3 base = a > 1e-4 ? r.rgb / a : vec3(0.0);
  base *= mix(1.0, texture2D(ao, vUv).r, aoStrength);
  vec3 b = texture2D(bloom, vUv).rgb * bloomStrength;
  vec3 inside = linearToOutputTexel(vec4(toneMapping(base + b), 1.0)).rgb;
  vec3 outside = linearToOutputTexel(vec4(toneMapping(b), 1.0)).rgb;
  gl_FragColor = vec4(inside * a + outside * (1.0 - a), a);
}`;

/** The reflections on his lacquer: a photo studio instead of a generic room — a grey cyc,
 * lighter overhead and dark towards the floor, with big softboxes (above-front, two tall
 * strips at the sides, a warm one behind, a low fill card) bright enough (HDR) to give long,
 * clean highlights that bloom */
function studioEnvironment() {
  const env = new THREE.Scene();
  env.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(10, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        vertexShader:
          'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader:
          'varying vec3 vDir; void main(){ gl_FragColor = vec4(mix(vec3(0.14, 0.135, 0.13), vec3(0.5, 0.5, 0.51), smoothstep(-0.6, 0.8, vDir.y)), 1.0); }',
      }),
    ),
  );
  const box = (w: number, h: number, power: number, color: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide }),
    );
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  box(3, 2, 9, 0xffffff, 1.5, 4, 3); // key softbox, above and in front
  box(0.6, 5, 7, 0xffffff, -4, 1, 1.5); // tall strip, left
  box(0.6, 5, 5, 0xffffff, 4, 1, 0.5); // tall strip, right
  box(4, 0.8, 6, 0xffd9c4, 0, 2.5, -4); // warm rim, behind
  box(4, 1.5, 1.5, 0xffffff, 0, -0.5, 4.5); // low fill card, front
  return env;
}

/** The robot's surface grain: a fine, slightly uneven texture like a powder-coated or
 * bead-blasted part, felt in how the light catches it (not painted on). `cells` across the
 * model's longest side; `bump` how far it tilts the surface (about the steepest slope); `rough` how much the gloss varies
 * between patches */
const GRAIN = { cells: 420, bump: 0.12, rough: 0.22 };

/** The robot's edge glow: a warm light that wraps his silhouette, strongest where the
 * surface turns away from the camera (fresnel). `strength` 0 = off; `power` higher = a
 * thinner rim; `flashBoost` how much brighter it gets during a photographer's flash */
const GLOW = { color: [1.0, 0.78, 0.6], strength: 0.45, power: 4.5, flashBoost: 1.5 };
const glowUniform = { value: GLOW.strength };

/** Adds the grain to `mat`: 3D value noise on each part's own coordinates (the model's UVs
 * are an AI unwrap in many small islands, a tiled map would show their seams), so it sticks
 * to the surface as the head turns. It tilts the base surface's normal (the clear coat on top
 * stays smooth, so reflections stay crisp) and varies its roughness a little, in larger
 * patches */
function grain(mat: THREE.MeshPhysicalMaterial, freq: number, led = false) {
  mat.onBeforeCompile = (shader) => {
    if (led) ledStrip(shader);
    shader.uniforms.grainFreq = { value: freq };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrainPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGrainPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vGrainPos;
        uniform float grainFreq;
        float grainHash(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }
        float grainNoise(vec3 x) {
          vec3 i = floor(x);
          vec3 f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(grainHash(i), grainHash(i + vec3(1, 0, 0)), f.x),
                mix(grainHash(i + vec3(0, 1, 0)), grainHash(i + vec3(1, 1, 0)), f.x), f.y),
            mix(mix(grainHash(i + vec3(0, 0, 1)), grainHash(i + vec3(1, 0, 1)), f.x),
                mix(grainHash(i + vec3(0, 1, 1)), grainHash(i + vec3(1, 1, 1)), f.x), f.y),
            f.z);
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        vec3 grainP = vGrainPos * grainFreq;
        float grainH = grainNoise(grainP) * 0.65 + grainNoise(grainP * 2.3) * 0.35;
        roughnessFactor = clamp(roughnessFactor * (1.0 + ${GRAIN.rough.toFixed(3)} * (grainNoise(grainP * 0.08) - 0.5) * 2.0), 0.04, 1.0);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // bump from the grain's slope on screen (as three's bump map does)
          vec3 sx = dFdx(-vViewPosition);
          vec3 sy = dFdy(-vViewPosition);
          float hx = dFdx(grainH);
          float hy = dFdy(grainH);
          vec3 r1 = cross(sy, normal);
          vec3 r2 = cross(normal, sx);
          float det = dot(sx, r1);
          vec3 slope = sign(det) * (hx * r1 + hy * r2);
          normal = normalize(abs(det) * normal - (${GRAIN.bump.toFixed(3)} / grainFreq) * slope);
        }`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          // edge glow (GLOW, above): fresnel on the smooth geometry normal, added as light
          float glowRim = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), ${GLOW.power.toFixed(3)});
          outgoingLight += vec3(${GLOW.color.map((c) => c.toFixed(3)).join(', ')}) * glowRim * glowLevel;
        }
        #include <opaque_fragment>`,
      )
      .replace('#include <common>', '#include <common>\nuniform float glowLevel;');
    shader.uniforms.glowLevel = glowUniform;
  };
  mat.customProgramCacheKey = () => (led ? 'robot-grain-led' : 'robot-grain');
}
