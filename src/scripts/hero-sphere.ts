/**
 * Home hero — the receipts picture (hero-sphere.png, the hero's background image) as the
 * inside of a sphere, the camera at its centre, the sphere turning very slowly about its
 * vertical axis. Plain WebGL 2, no library.
 *
 * Mapping: the picture goes round the sphere WRAPS times (every other copy mirrored, so the
 * ends meet without a seam) — about one picture across the view, at the still image's
 * scale — and spans ±LAT_SPAN° of latitude (a touch taller than its own proportions, so it
 * fills the view top to bottom); above and below that, its top / bottom edge rows
 * (near-white) carry on to the poles.
 * At the start the picture's middle faces the camera, like the still image.
 *
 * Desktop only (a mouse, ≥ 1024 px wide): phones and tablets keep the still picture. The
 * still picture also stays without WebGL 2 or the picture; it fades out under the canvas
 * once the first frame is drawn. Off screen or in a hidden tab it stops drawing. With
 * reduced motion it draws one still frame.
 */

const WRAPS = 4; // copies of the picture round the sphere (even: no seam)
const LAT_SPAN = 31; // ° of latitude above and below the middle the picture covers
const FOV_Y = 62; // ° vertical field of view
const SPEED = 0.018; // rad per second (a turn in about 6 minutes)

const VERT = `#version 300 es
in vec3 aPos;
in vec2 aUv;
uniform mat4 uProj;
uniform float uAngle;
out vec2 vUv;
void main() {
  float c = cos(uAngle), s = sin(uAngle);
  vec3 p = vec3(c * aPos.x + s * aPos.z, aPos.y, -s * aPos.x + c * aPos.z);
  vUv = aUv;
  gl_Position = uProj * vec4(p, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
out vec4 outColor;
void main() {
  outColor = texture(uTex, vUv);
}`;

function sphere(lonSegs: number, latSegs: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const span = (LAT_SPAN * Math.PI) / 180;
  for (let j = 0; j <= latSegs; j++) {
    const lat = Math.PI / 2 - (j / latSegs) * Math.PI; // +90° (top) … −90°
    for (let i = 0; i <= lonSegs; i++) {
      // longitude 0 looks down −z (the camera's view); seen from inside, u runs left → right
      const lon = (i / lonSegs) * Math.PI * 2;
      const x = Math.cos(lat) * Math.sin(lon);
      const y = Math.sin(lat);
      const z = -Math.cos(lat) * Math.cos(lon);
      pos.push(x, y, z);
      // WRAPS times round, the picture's middle (u 0.5) at longitude 0
      uv.push(0.5 + (i / lonSegs) * WRAPS, 0.5 - lat / (2 * span));
    }
  }
  for (let j = 0; j < latSegs; j++) {
    for (let i = 0; i < lonSegs; i++) {
      const a = j * (lonSegs + 1) + i;
      const b = a + lonSegs + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { pos: new Float32Array(pos), uv: new Float32Array(uv), idx: new Uint32Array(idx) };
}

function perspective(fovY: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(((fovY * Math.PI) / 180) / 2);
  const nf = 1 / (near - far);
  // prettier-ignore
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader');
  return sh;
}

function mount(slot: HTMLElement) {
  const stage = slot.querySelector<HTMLElement>('.webgl-slot__stage');
  const img = slot.querySelector<HTMLImageElement>('.home-hero__sphere');
  if (!stage || !img) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'home-hero__canvas';
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'low-power' });
  if (!gl) return;

  const program = gl.createProgram()!;
  try {
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  } catch {
    return;
  }
  gl.useProgram(program);

  const mesh = sphere(128, 64);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const attr = (name: string, data: Float32Array, size: number) => {
    const loc = gl.getAttribLocation(program, name);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  };
  attr('aPos', mesh.pos, 3);
  attr('aUv', mesh.uv, 2);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);

  const uProj = gl.getUniformLocation(program, 'uProj');
  const uAngle = gl.getUniformLocation(program, 'uAngle');

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let angle = 0;
  let last = 0;
  let frame = 0;
  let visible = true;
  let ready = false;

  const resize = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(1, Math.round(stage.clientWidth * dpr));
    const h = Math.max(1, Math.round(stage.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.uniformMatrix4fv(uProj, false, perspective(FOV_Y, w / h, 0.01, 10));
  };

  const draw = () => {
    gl.uniform1f(uAngle, angle);
    gl.drawElements(gl.TRIANGLES, mesh.idx.length, gl.UNSIGNED_INT, 0);
  };

  const tick = (t: number) => {
    frame = 0;
    if (last) angle += Math.min(0.1, (t - last) / 1000) * SPEED;
    last = t;
    draw();
    if (!reduced && visible && !document.hidden) frame = requestAnimationFrame(tick);
    else last = 0;
  };
  const run = () => {
    if (ready && !frame) frame = requestAnimationFrame(tick);
  };

  const start = () => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    stage.append(canvas);
    resize();
    ready = true;
    draw();
    // the still picture fades out under the first frame
    requestAnimationFrame(() => slot.classList.add('is-live'));
    run();
  };

  new ResizeObserver(() => {
    if (!ready) return;
    resize();
    draw();
  }).observe(stage);
  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    run();
  }).observe(slot);
  document.addEventListener('visibilitychange', run);

  if (img.complete && img.naturalWidth) img.decode().then(start, start);
  else img.addEventListener('load', start, { once: true });
}

const desktop = matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1024px)');
const slot = document.querySelector<HTMLElement>('[data-webgl="home-hero"]');
if (slot && desktop.matches) mount(slot);
