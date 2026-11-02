/**
 * Bottom bend — after raggededge.com: pictures and videos bend outward as they pass the
 * bottom of the screen, as if the screen's lower edge were a curved lens. Their curve, one
 * to one: each row of the screen at height v (0 at the bottom, 1 at the top) is stretched
 * sideways from the middle of the screen by 1 / (1 − 0.05 · (1 − v)^58) — about 11% at the
 * very bottom, nothing a tenth of the way up (theirs reaches a sixth: too tall here). Text and the rest of the page stay as they are.
 *
 * Each picture that reaches the bottom band of the screen (BAND) gets a canvas of its own,
 * placed right after it in the page (after the frame that crops it, when the frame is the
 * picture's own size), so it sits exactly where the picture does: whatever lies on top of
 * the picture stays on top, and the canvas scrolls with the page, never a frame behind.
 * One shared WebGL context draws the bent band part of the picture, which is copied into
 * that canvas. The picture's own band part is cut off with a clip-path; the two overlap by
 * FADE px where the bend is still zero and cross-fade there, so no seam shows (while a
 * picture is see-through, fading in, a mask takes it out as the copy comes in, so that strip
 * is no denser than the rest). The copy
 * follows the picture's box (moves and reveal included), its opacity, the frame
 * that crops it and its rounded corners.
 *
 * In Chrome / Edge everything bends instead, text included (startAll, at the end).
 *
 * Skips the menu and page chrome, the home page's contact block and footer,
 * pictures turned in 3D or rotated (their box isn't where they show), pictures with a
 * clip-path of their own, and small icons. Videos from another site only bend if that site
 * allows it (CORS). Desktop with a mouse only (theirs is off on phones too); off for
 * reduced motion.
 */

/** the curve (their uniforms: distance 34, strength 1; tighter here, so the band is shorter) */
const DISTANCE = 58;
const STRENGTH = 1;
/** share of the screen height that bends: above it the bend is under 0.3px */
const BAND = 0.09;
/** where the bent copy and the picture cross-fade, above the band (px): long, because the
 *  screen shows a video and a canvas in slightly different colours (Mac, wide-gamut
 *  displays), and a short fade leaves that as a visible edge */
const FADE = 160;
/** the canvas reaches this far below the screen, so a fast scroll never shows its edge (px) */
const BELOW = 160;
/** the widest the corners flare out, as a share of the screen width */
const FLARE = 0.05 * STRENGTH;

/** on the home page, the contact block and the footer stay flat too */
const HOME = '.contact, .footer';
const SKIP = ['.pt, .site-menu, .nav-pill, .get-in-touch', location.pathname === '/' && HOME].filter(Boolean).join(', ');

const VERTEX = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0); }`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uView;      // screen size, css px
uniform vec2 uOrigin;    // top left of the drawn region on screen, css px
uniform float uTopPx;    // height of the drawing buffer, device px (the region starts at its top)
uniform float uDpr;
uniform float uFade;     // top of the cross-fade on screen, css px
uniform vec4 uBox;       // what shows of the picture (its box cut by its frame): left top right bottom
uniform float uRadius;
uniform vec4 uContent;   // where the image itself lies (object-fit): left top width height
uniform float uOpacity;
out vec4 color;

float roundBox(vec2 p, vec2 h, float r) {
  vec2 q = abs(p) - h + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  // this pixel on screen, css px
  vec2 px = uOrigin + vec2(gl_FragCoord.x, uTopPx - gl_FragCoord.y) / uDpr;
  vec2 uv = vec2(px.x / uView.x, 1.0 - px.y / uView.y);
  // their CurveEffect: rows near the bottom sample closer to the middle
  float below = clamp(1.0 - uv.y, 0.0, 1.0);
  uv.x += (uv.x * 2.0 - 1.0) * ${(-FLARE).toFixed(4)} * pow(below, ${DISTANCE.toFixed(1)});
  vec2 src = vec2(uv.x * uView.x, px.y);

  vec2 c = (uBox.xy + uBox.zw) * 0.5;
  vec2 h = (uBox.zw - uBox.xy) * 0.5;
  float d = roundBox(src - c, h, min(uRadius, min(h.x, h.y)));
  float edge = clamp(1.0 - d * uDpr, 0.0, 1.0); // edge pixels fully covered, the soft pixel just outside
  if (edge <= 0.0) discard;

  vec2 t = (src - uContent.xy) / uContent.zw;
  if (t.x < 0.0 || t.y < 0.0 || t.x > 1.0 || t.y > 1.0) discard;
  // comes in over the picture; while the picture is see-through, its mask (cut) takes it
  // out as much, so the two add up to its opacity, no more
  float fade = clamp((px.y - uFade) / ${FADE.toFixed(1)}, 0.0, 1.0);
  color = texture(uTex, t, -0.5) * (uOpacity * edge * fade);
}`;

type Media = HTMLImageElement | HTMLVideoElement;
type Item = {
  el: Media;
  /** the picture, or the frame it fills: the canvas goes right after it */
  anchor: Element;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** the clip-path and mask it had inline before the band cut it (null: not cut) */
  clip: string | null;
  mask: string;
  /** where the canvas is now: its css box and the scale it's drawn at */
  placed: { left: number; top: number; width: number; height: number } | null;
  /** what was drawn last: drawn again only when it changes */
  key: string;
};

const desktop = matchMedia('(hover: hover) and (pointer: fine)');
const still = matchMedia('(prefers-reduced-motion: reduce)');

const clips = (cs: CSSStyleDeclaration) => cs.overflowX !== 'visible' || cs.overflowY !== 'visible';

/** turned in 3D, rotated or skewed: its box isn't where it shows */
function turned(el: Element) {
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (cs.rotate !== 'none' && !/^0(deg)?$/.test(cs.rotate)) return true;
    if (cs.transform !== 'none') {
      const m = new DOMMatrixReadOnly(cs.transform);
      if (!m.is2D || Math.abs(m.b) > 1e-4 || Math.abs(m.c) > 1e-4) return true;
    }
    if (cs.perspective !== 'none' && n !== el) return true;
  }
  return false;
}

/** the picture, or the frame around it that is its own size and crops it (the canvas goes
 *  after that, so the flared corners aren't cut off by the frame) */
function anchorOf(el: Element) {
  let a = el;
  const own = (p: Element) => p.childElementCount - p.querySelectorAll(':scope > canvas.bottom-bend').length;
  const r = el.getBoundingClientRect();
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (!clips(cs)) {
      // a wrapper that doesn't crop: fine to pass if it's still the picture's size
      const b = p.getBoundingClientRect();
      if (Math.abs(b.width - r.width) > 2 || Math.abs(b.height - r.height) > 2 || own(p) > 1) break;
      continue;
    }
    if (cs.clipPath !== 'none' || cs.maskImage !== 'none' || own(p) > 1) break;
    const b = p.getBoundingClientRect();
    if (b.width > r.width + 2 || b.height > r.height + 2) break;
    a = p;
  }
  return a;
}

function start() {
  const glCanvas = document.createElement('canvas');
  const gl = glCanvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return;
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);
  const u = Object.fromEntries(
    ['uView', 'uOrigin', 'uTopPx', 'uDpr', 'uFade', 'uBox', 'uRadius', 'uContent', 'uOpacity'].map((n) => [n, gl.getUniformLocation(program, n)]),
  );
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  gl.disable(gl.BLEND);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.clearColor(0, 0, 0, 0);
  const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;

  // ---- textures: one per picture file (vector files drawn at their size on screen), one per video
  const textures = new Map<string, WebGLTexture | null>();
  const newTexture = () => {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  };
  const imageTexture = (img: HTMLImageElement, w: number, h: number) => {
    const src = img.currentSrc || img.src;
    const svg = /\.svg(\?|#|$)/i.test(src) || src.startsWith('data:image/svg');
    const key = svg ? `${src}|${Math.round(w)}x${Math.round(h)}` : src;
    if (textures.has(key)) return textures.get(key)!;
    let t: WebGLTexture | null = null;
    try {
      let source: TexImageSource = img;
      if (svg) {
        const k = Math.min(2, devicePixelRatio || 1);
        const c = document.createElement('canvas');
        c.width = Math.min(maxSize, Math.round(w * k));
        c.height = Math.min(maxSize, Math.round(h * k));
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        source = c;
      } else if (img.naturalWidth > maxSize || img.naturalHeight > maxSize) throw new Error('too big');
      t = newTexture();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } catch {
      // another site's picture without permission, or too big: it stays as it is
      if (t) gl.deleteTexture(t);
      t = null;
    }
    textures.set(key, t);
    return t;
  };
  const videoTextures = new WeakMap<HTMLVideoElement, WebGLTexture>();
  /** videos from another site that doesn't allow it (no CORS): they stay as they are */
  const tainted = new WeakSet<HTMLVideoElement>();
  const videoTexture = (video: HTMLVideoElement) => {
    if (tainted.has(video)) return null;
    let t = videoTextures.get(video);
    if (!t) {
      t = newTexture();
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      videoTextures.set(video, t);
    } else gl.bindTexture(gl.TEXTURE_2D, t);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    } catch {
      tainted.add(video);
      return null;
    }
    return t;
  };

  // ---- the pictures that reach into the band
  const items = new Map<Element, Item | null>();
  const near = new Set<Item>();
  const make = (el: Media): Item | null => {
    const r = el.getBoundingClientRect();
    if (r.width < 48 || r.height < 48) return null;
    if (getComputedStyle(el).clipPath !== 'none' && !el.style.clipPath) return null;
    if (getComputedStyle(el).maskImage !== 'none' && !el.style.maskImage) return null;
    if (turned(el)) return null;
    const anchor = anchorOf(el);
    const canvas = document.createElement('canvas');
    canvas.className = 'bottom-bend';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;margin:0;pointer-events:none;display:none';
    const z = getComputedStyle(anchor).zIndex;
    if (z !== 'auto' && getComputedStyle(anchor).position !== 'static') canvas.style.zIndex = z;
    anchor.after(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    return { el, anchor, canvas, ctx, clip: null, mask: '', placed: null, key: '' };
  };
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const el = e.target as Media;
        if (!items.has(el)) {
          if (!e.isIntersecting) continue;
          items.set(el, make(el));
        }
        const item = items.get(el);
        if (!item) {
          io.unobserve(el);
          continue;
        }
        if (e.isIntersecting) near.add(item);
        else {
          near.delete(item);
          off(item);
        }
      }
      run();
    },
    // the band and the cross-fade above it, and the strip below the screen
    { rootMargin: `-${(1 - BAND) * 100 - 25}% 0px ${BELOW}px 0px` },
  );
  const watch = (root: ParentNode) => {
    for (const el of root.querySelectorAll<Media>('img, video')) {
      if (items.has(el) || el.closest(SKIP)) continue;
      io.observe(el);
    }
  };
  watch(document);
  new MutationObserver((list) => {
    for (const m of list) for (const n of m.addedNodes) if (n instanceof Element && !n.matches('canvas.bottom-bend')) watch(n.parentNode ?? n);
  }).observe(document.body, { childList: true, subtree: true });

  /** cut off its band part (px, its own px). The copy comes in over the fade px above the
   *  cut at a · f (a: the picture's opacity, f: 0 → 1 down the fade); opaque, the picture
   *  stays whole under it, see-through, it's masked to (1 − f) / (1 − a · f) so the two
   *  together are a · f + a · (1 − f) = a */
  const cut = (item: Item, px: number, fade: number, a: number) => {
    const s = item.el.style;
    if (item.clip === null) {
      item.clip = s.clipPath;
      item.mask = s.maskImage;
    }
    s.clipPath = `inset(0 0 ${px}px 0)`;
    if (a > 0.995) {
      s.maskImage = item.mask;
      return;
    }
    const stops = [];
    for (let i = 0; i <= 8; i++) {
      const f = 1 - i / 8;
      stops.push(`rgba(0,0,0,${((1 - f) / (1 - a * f)).toFixed(3)}) ${(px + (1 - f) * fade).toFixed(1)}px`);
    }
    s.maskImage = `linear-gradient(to top, ${stops.join(', ')})`;
  };
  function off(item: Item) {
    if (item.clip !== null) {
      item.el.style.clipPath = item.clip;
      item.el.style.maskImage = item.mask;
      item.clip = null;
    }
    if (item.placed) {
      item.canvas.style.display = 'none';
      item.placed = null;
    }
    item.key = '';
  }

  /** what shows of the picture (cut by the frames that are its own size), their rounded
   *  corners, and the opacity of the picture and those frames */
  const shapeOf = (item: Item, r: DOMRect) => {
    let l = r.left, t = r.top, rr = r.right, b = r.bottom;
    let radius = parseFloat(getComputedStyle(item.el).borderTopLeftRadius) || 0;
    let opacity = 1;
    for (let n: Element | null = item.el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none') return null;
      opacity *= parseFloat(cs.opacity);
      if (n !== item.el && clips(cs)) {
        const f = n.getBoundingClientRect();
        l = Math.max(l, f.left);
        t = Math.max(t, f.top);
        rr = Math.min(rr, f.right);
        b = Math.min(b, f.bottom);
        radius = Math.max(radius, parseFloat(cs.borderTopLeftRadius) || 0);
      }
      if (n === item.anchor) break;
    }
    if (rr <= l || b <= t || opacity <= 0.001) return null;
    return { box: [l, t, rr, b] as const, radius, opacity };
  };

  /** where the image lies in its box (object-fit / object-position) */
  const contentOf = (el: Media, r: DOMRect, nw: number, nh: number) => {
    const cs = getComputedStyle(el);
    const fit = cs.objectFit;
    let w = r.width, h = r.height;
    if (fit === 'cover' || fit === 'contain' || fit === 'scale-down') {
      const k = fit === 'cover' ? Math.max(r.width / nw, r.height / nh) : Math.min(r.width / nw, r.height / nh, fit === 'scale-down' ? 1 : Infinity);
      w = nw * k;
      h = nh * k;
    } else if (fit === 'none') {
      w = nw;
      h = nh;
    }
    const [px, py = '50%'] = cs.objectPosition.split(' ');
    const at = (v: string, free: number) => (v.endsWith('%') ? (parseFloat(v) / 100) * free : parseFloat(v) || 0);
    return [r.left + at(px, r.width - w), r.top + at(py, r.height - h), w, h] as const;
  };

  // ---- drawing: every frame while a picture is near the band (scroll, reveals and
  // the blocks' own scripts all move them), but redrawn only when something changed
  let frame = 0;
  function run() {
    if (!frame) frame = requestAnimationFrame(draw);
  }
  addEventListener('resize', run);
  addEventListener('scroll', run, { passive: true });

  function draw() {
    frame = 0;
    const vw = innerWidth;
    const vh = innerHeight;
    const dpr = Math.min(2, devicePixelRatio || 1);
    /** top of the cross-fade, and of the bend */
    const fadeTop = vh * (1 - BAND) - FADE;

    // read everything first (one layout), then write
    const jobs = [];
    for (const item of near) {
      const { el } = item;
      const r = el.getBoundingClientRect();
      const shape = r.width && r.bottom > fadeTop && r.top < vh + BELOW ? shapeOf(item, r) : null;
      let nw = 0, nh = 0, ready = false;
      if (el instanceof HTMLImageElement) {
        ready = el.complete && el.naturalWidth > 0;
        nw = el.naturalWidth;
        nh = el.naturalHeight;
      } else {
        ready = el.readyState >= 2 && el.videoWidth > 0 && !tainted.has(el);
        nw = el.videoWidth;
        nh = el.videoHeight;
      }
      if (!shape || !ready) {
        jobs.push({ item, shape: null });
        continue;
      }
      // the region the canvas covers: the picture's band part, flare room either side
      const flare = vw * FLARE;
      const x0 = Math.max(0, Math.floor(shape.box[0] - flare));
      const x1 = Math.min(vw, Math.ceil(shape.box[2] + flare));
      const y0 = Math.floor(Math.max(shape.box[1], fadeTop));
      const y1 = Math.ceil(Math.min(shape.box[3], vh + BELOW));
      jobs.push({
        item,
        shape,
        r,
        k: el.offsetHeight / (r.height || 1),
        content: contentOf(el, r, nw, nh),
        region: x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : null,
        // where the canvas is on screen now, to place it exactly
        at: item.placed ? item.canvas.getBoundingClientRect() : null,
        playing: el instanceof HTMLVideoElement && !el.paused,
      });
    }

    for (const job of jobs) {
      const { item } = job;
      if (!job.shape || !job.region) {
        off(item);
        continue;
      }
      const tex = item.el instanceof HTMLImageElement ? imageTexture(item.el, job.r!.width, job.r!.height) : videoTexture(item.el);
      if (!tex) {
        off(item);
        continue;
      }
      const [rx, ry, rw, rh] = job.region;
      const { canvas, ctx } = item;
      const key = [vw, vh, dpr, ...job.region, ...job.shape.box, job.shape.radius, job.shape.opacity, ...job.content!, (item.el as HTMLImageElement).currentSrc]
        .map((v) => (typeof v === 'number' ? Math.round(v * 100) : v))
        .join('|');
      const inPlace = job.at && Math.abs(job.at.left - rx) < 0.5 && Math.abs(job.at.top - ry) < 0.5;
      if (key === item.key && inPlace && !job.playing) continue;
      item.key = key;

      // place the canvas over the region: its css position is in the page, so find the
      // page's offset (and any scale on the way) from where it is now
      let originX = 0, originY = 0, scale = 1;
      if (job.at && item.placed && item.placed.width > 0) {
        scale = job.at.width / item.placed.width || 1;
        originX = job.at.left - item.placed.left * scale;
        originY = job.at.top - item.placed.top * scale;
      } else {
        canvas.style.display = 'block';
        canvas.style.width = '100px';
        canvas.style.height = '100px';
        canvas.style.left = '0px';
        canvas.style.top = '0px';
        const at = canvas.getBoundingClientRect();
        scale = at.width / 100 || 1;
        originX = at.left;
        originY = at.top;
      }
      const placed = { left: (rx - originX) / scale, top: (ry - originY) / scale, width: rw / scale, height: rh / scale };
      canvas.style.display = 'block';
      canvas.style.left = `${placed.left}px`;
      canvas.style.top = `${placed.top}px`;
      canvas.style.width = `${placed.width}px`;
      canvas.style.height = `${placed.height}px`;
      item.placed = placed;
      const cw = Math.round(rw * dpr);
      const ch = Math.round(rh * dpr);
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      } else ctx.clearRect(0, 0, cw, ch);

      // draw the bent band part in the shared context, top left of its buffer
      if (glCanvas.width < cw || glCanvas.height < ch) {
        glCanvas.width = Math.max(glCanvas.width, cw, Math.round(vw * dpr));
        glCanvas.height = Math.max(glCanvas.height, ch, Math.round((vh * BAND + FADE + BELOW) * dpr));
      }
      gl.viewport(0, glCanvas.height - ch, cw, ch);
      gl.scissor(0, glCanvas.height - ch, cw, ch);
      gl.enable(gl.SCISSOR_TEST);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform2f(u.uView, vw, vh);
      gl.uniform2f(u.uOrigin, rx, ry);
      gl.uniform1f(u.uTopPx, glCanvas.height);
      gl.uniform1f(u.uDpr, dpr);
      gl.uniform1f(u.uFade, fadeTop);
      const { box, radius, opacity } = job.shape;
      gl.uniform4f(u.uBox, box[0], box[1], box[2], box[3]);
      gl.uniform1f(u.uRadius, radius);
      gl.uniform4f(u.uContent, ...job.content!);
      gl.uniform1f(u.uOpacity, opacity);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      ctx.drawImage(glCanvas, 0, 0, cw, ch, 0, 0, cw, ch);

      // the picture's own part below the cross-fade goes, fading out across it; the copy shows there
      const r = job.r!;
      cut(item, Math.max(0, (r.bottom - (fadeTop + FADE)) * job.k!), FADE * job.k!, opacity);
    }
    if (near.size) run();
  }
  run();
}

// ---- Everything, text included (Chrome / Edge): instead of a WebGL copy per picture, a
// strip along the bottom of the screen bends whatever is behind it, with an SVG displacement filter as its backdrop-filter (only Chromium applies
// those). Same curve: each row is pulled toward the middle by
// (2x / w − 1) · FLARE · w · d^DISTANCE, d = how close the row is to that edge (1 at it).
// lens() also builds a mirrored strip for the top edge (tried, not used: bottom only).
// Menu, menu pill and Get in touch sit above the strips and stay flat; on the home page a
// strip fades out while the contact block or the footer is in it, as before.
const chromium = !!(navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands.some((b) =>
  /Chromium/.test(b.brand),
);
const NS = 'http://www.w3.org/2000/svg';

function lens(edge: 'top' | 'bottom', svg: SVGSVGElement) {
  const id = `bend-${edge}`;
  const filter = document.createElementNS(NS, 'filter');
  filter.id = id;
  for (const [k, v] of Object.entries({ filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB', x: '0', y: '0' })) filter.setAttribute(k, v);
  const map = document.createElementNS(NS, 'feImage');
  map.setAttribute('result', 'map');
  map.setAttribute('preserveAspectRatio', 'none');
  const shift = document.createElementNS(NS, 'feDisplacementMap');
  for (const [k, v] of Object.entries({ in: 'SourceGraphic', in2: 'map', xChannelSelector: 'R', yChannelSelector: 'G' })) shift.setAttribute(k, v);
  filter.append(map, shift);
  svg.append(filter);

  const strip = document.createElement('div');
  strip.className = `bend-lens bend-lens--${edge}`;
  strip.setAttribute('aria-hidden', 'true');
  strip.style.cssText = `position:fixed;left:0;right:0;${edge}:0;pointer-events:none;z-index:calc(var(--z-header) - 1);backdrop-filter:url(#${id});-webkit-backdrop-filter:url(#${id});transition:opacity .2s ease`;
  document.body.append(strip);

  /** the displacement map for this screen size: red = sideways pull, green = none */
  const build = () => {
    const w = innerWidth;
    const vh = innerHeight;
    const h = Math.ceil(vh * (BAND + 0.01));
    const scale = 2 * FLARE * w + 4;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      // how close this row of the strip is to its edge of the screen
      const d = edge === 'bottom' ? (vh - h + y + 0.5) / vh : 1 - (y + 0.5) / vh;
      const curve = Math.pow(d, DISTANCE);
      for (let x = 0; x < w; x++) {
        const dx = -((2 * (x + 0.5)) / w - 1) * FLARE * w * curve;
        const i = (y * w + x) * 4;
        img.data[i] = Math.round(255 * (0.5 + dx / scale));
        img.data[i + 1] = 128;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    strip.style.height = `${h}px`;
    for (const el of [filter, map]) {
      el.setAttribute('width', String(w));
      el.setAttribute('height', String(h));
    }
    map.setAttribute('href', c.toDataURL('image/png'));
    shift.setAttribute('scale', String(scale));
  };
  build();
  let resizing = 0;
  addEventListener('resize', () => {
    clearTimeout(resizing);
    resizing = window.setTimeout(build, 150);
  });

  // home page: the contact block and the footer stay flat
  if (location.pathname === '/') {
    const inStrip = new Set<Element>();
    const away = `-${(1 - BAND - 0.01) * 100}%`;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) e.isIntersecting ? inStrip.add(e.target) : inStrip.delete(e.target);
        strip.style.opacity = inStrip.size ? '0' : '1';
      },
      { rootMargin: edge === 'bottom' ? `${away} 0px 0px 0px` : `0px 0px ${away} 0px` },
    );
    document.querySelectorAll(HOME).forEach((el) => io.observe(el));
  }
}

function startAll() {
  document.documentElement.classList.add('bend-all');
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  document.body.append(svg);
  lens('bottom', svg);
}

if (desktop.matches && !still.matches) {
  if (chromium) startAll();
  else start();
}
