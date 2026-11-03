/**
 * Builds the entry form from a collection's field list and saves it.
 * Each field renderer returns its element plus a `get()` that reads the current value;
 * new images are sent as files and written into the data as "upload:<token>".
 */
import { youtubeId, type Field } from '../collections';
import { formValue, useDirectUploads } from './upload';

type Value = unknown;
type Data = Record<string, Value>;

interface Control {
  el: HTMLElement;
  get(): Value;
  /** Returns messages for empty required images (browser validation covers inputs) */
  check?(): string[];
}

interface Config {
  section: string;
  titleField: string;
  fields: Field[];
  id: string | null;
  data: Data | null;
  /** On Vercel: files go to the Blob store first (see ./upload.ts) */
  directUploads?: boolean;
}

const uploads = new Map<string, File>();
let uid = 0;
const nextId = (prefix: string) => `${prefix}-${++uid}`;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: (Node | string | null | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v as EventListener);
    else if (k in el && typeof v !== 'string') (el as unknown as Data)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

function labelRow(text: string, forId?: string, required?: boolean, extra?: Node) {
  return h(
    'div',
    { class: 'cms-field__label' },
    h('label', { for: forId }, text, required ? h('span', { class: 'cms-req', text: ' *' }) : null),
    extra ?? null,
  );
}

const hint = (text?: string) => (text ? h('p', { class: 'cms-hint', text }) : null);

function iconButton(label: string, symbol: string, onclick: () => void, danger = false) {
  return h('button', {
    type: 'button',
    class: `cms-icon-btn${danger ? ' cms-icon-btn--danger' : ''}`,
    'aria-label': label,
    title: label,
    text: symbol,
    onclick,
  });
}

// --- Images ---

function mediaUrl(ref: string) {
  return `/admin/media?ref=${encodeURIComponent(ref)}`;
}

type MediaValue = string | { video: string } | { youtube: string };
const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml';
const VIDEO_ACCEPT = 'video/mp4,video/webm,.mp4,.webm';
const isVideoValue = (v: unknown): v is { video: string } =>
  !!v && typeof v === 'object' && typeof (v as { video?: unknown }).video === 'string';
const isYoutubeValue = (v: unknown): v is { youtube: string } =>
  !!v && typeof v === 'object' && typeof (v as { youtube?: unknown }).youtube === 'string';
/** A hosted video (AWS etc.) is played from its own link; uploads go through /admin/media */
const videoSrc = (video: string) => (video.startsWith('https://') ? video : mediaUrl(video));

/**
 * One image slot: shows the current media, click or drop to replace. With allowVideo it
 * also takes an MP4 / WebM upload or a pasted link to a hosted video; with allowYoutube,
 * a pasted YouTube link.
 */
function imageSlot(initial: unknown, onRemove?: () => void, allowVideo = false, allowYoutube = false) {
  let ref: MediaValue = isVideoValue(initial)
    ? { video: initial.video }
    : isYoutubeValue(initial)
      ? { youtube: initial.youtube }
      : typeof initial === 'string'
        ? initial
        : '';
  let token = '';
  let preview = '';
  let previewIsVideo = false;
  const kind = allowVideo ? 'an image or video' : 'an image';
  const input = h('input', { type: 'file', accept: allowVideo ? `${IMAGE_ACCEPT},${VIDEO_ACCEPT}` : IMAGE_ACCEPT, title: `Click or drop ${kind}` });
  const box = h('div', { class: 'cms-image' });
  const error = h('span', { class: 'cms-image__error' });
  const linkOf = (r: MediaValue) =>
    isYoutubeValue(r) ? `https://www.youtube.com/watch?v=${r.youtube}` : isVideoValue(r) && r.video.startsWith('https://') ? r.video : '';
  const link = h('input', {
    type: 'url',
    class: 'cms-image__link',
    placeholder: allowYoutube ? 'or paste a video or YouTube link' : 'or paste a video link',
    'aria-label': allowYoutube ? 'Video or YouTube link' : 'Video link',
    spellcheck: false,
    value: linkOf(ref),
  });
  const el = h('div', { class: 'cms-image-slot' }, box, allowVideo ? link : null);

  const render = () => {
    box.replaceChildren();
    const isVideo = preview ? previewIsVideo : isVideoValue(ref);
    const src = preview || (isVideoValue(ref) ? videoSrc(ref.video) : isYoutubeValue(ref) ? '' : ref ? mediaUrl(ref) : '');
    box.classList.toggle('cms-image--filled', !!src || isYoutubeValue(ref));
    if (!preview && isYoutubeValue(ref)) {
      box.append(
        h('img', { src: `https://i.ytimg.com/vi/${ref.youtube}/hqdefault.jpg`, alt: '' }),
        h('span', { class: 'cms-image__tag', text: 'YouTube' }),
      );
    } else if (src && isVideo) {
      box.append(
        h('video', { src, muted: true, loop: true, autoplay: true, playsInline: true, preload: 'metadata' }),
        h('span', { class: 'cms-image__tag', text: 'Video' }),
      );
    } else if (src) {
      box.append(h('img', { src, alt: '' }));
    } else {
      box.append(h('span', { text: `Click or drop ${kind}` }));
    }
    if (error.textContent) box.append(error);
    if ((src || isYoutubeValue(ref)) && onRemove) {
      box.append(
        h('button', {
          type: 'button',
          class: 'cms-icon-btn cms-icon-btn--danger cms-image__remove',
          'aria-label': 'Remove',
          title: 'Remove',
          text: '×',
          onclick: (e: Event) => {
            e.stopPropagation();
            onRemove();
          },
        }),
      );
    }
    box.append(input);
  };

  const setFile = (file: File | undefined) => {
    if (!file) return;
    const video = /^video\//.test(file.type) || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
    error.textContent = '';
    if (video && !allowVideo) return;
    if (video && !/\.(mp4|webm)$/i.test(file.name)) {
      error.textContent = 'Use MP4 (H.264) or WebM';
      render();
      return;
    }
    if (!video && !file.type.startsWith('image/')) return;
    if (token) uploads.delete(token);
    if (preview) URL.revokeObjectURL(preview);
    token = `upload:${crypto.randomUUID()}`;
    uploads.set(token, file);
    preview = URL.createObjectURL(file);
    previewIsVideo = video;
    link.value = '';
    box.closest('.cms-field')?.classList.remove('cms-field--invalid');
    box.dispatchEvent(new Event('input', { bubbles: true }));
    render();
  };

  // A pasted link: YouTube (when allowed) or an https link to a hosted MP4 / WebM
  const setLink = () => {
    const text = link.value.trim();
    error.textContent = '';
    link.setCustomValidity('');
    if (!text) {
      if (linkOf(ref)) {
        ref = '';
        render();
        box.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return;
    }
    const yt = youtubeId(text);
    let next: MediaValue | null = null;
    if (yt && allowYoutube) next = { youtube: yt };
    else if (yt) link.setCustomValidity('YouTube videos can’t be used here: paste a link to an MP4 or WebM file');
    else if (/^https:\/\/\S+$/.test(text)) next = { video: text };
    else link.setCustomValidity(allowYoutube ? 'Paste an https link to an MP4 / WebM file, or a YouTube link' : 'Paste an https link to an MP4 / WebM file');
    if (!next) {
      link.reportValidity();
      return;
    }
    if (token) uploads.delete(token);
    if (preview) URL.revokeObjectURL(preview);
    token = preview = '';
    ref = next;
    box.closest('.cms-field')?.classList.remove('cms-field--invalid');
    render();
    box.dispatchEvent(new Event('input', { bubbles: true }));
  };
  link.addEventListener('change', setLink);
  link.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setLink();
    }
  });

  input.addEventListener('change', () => setFile(input.files?.[0]));
  box.addEventListener('dragover', (e) => {
    e.preventDefault();
    box.classList.add('cms-image--dragover');
  });
  box.addEventListener('dragleave', () => box.classList.remove('cms-image--dragover'));
  box.addEventListener('drop', (e) => {
    e.preventDefault();
    box.classList.remove('cms-image--dragover');
    setFile(e.dataTransfer?.files[0]);
  });
  render();

  return {
    el,
    input,
    get: (): MediaValue => token || ref,
    clear() {
      if (token) uploads.delete(token);
      ref = token = preview = '';
      link.value = '';
      render();
    },
  };
}

// --- Micrographics library ---

/**
 * Background for a graphic preview, from the graphic's own colours: black when it has
 * white parts (so they show), white otherwise (orange or black graphics).
 */
const tileBackgrounds = new Map<string, Promise<string>>();
function graphicBackground(src: string): Promise<string> {
  let bg = tileBackgrounds.get(src);
  if (!bg) {
    bg = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const size = 96;
        const w = img.naturalWidth || size;
        const ht = img.naturalHeight || size;
        const scale = Math.min(size / w, size / ht);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, w * scale, ht * scale);
        const px = ctx.getImageData(0, 0, size, size).data;
        let ink = 0;
        let white = 0;
        for (let i = 0; i < px.length; i += 4) {
          if (px[i + 3] < 128) continue;
          ink++;
          if (Math.min(px[i], px[i + 1], px[i + 2]) > 200) white++;
        }
        resolve(ink && white / ink >= 0.2 ? '#000000' : '#ffffff');
      };
      img.onerror = () => resolve('#ffffff');
      img.src = src;
    });
    tileBackgrounds.set(src, bg);
  }
  return bg;
}
function paintTile(tile: HTMLElement, src: string) {
  tile.style.background = '';
  graphicBackground(src).then((bg) => {
    if (tile.querySelector('img')?.getAttribute('src') === src) tile.style.background = bg;
  });
}

interface LibraryItem {
  path: string;
  name: string;
  group: string;
}

let library: Promise<LibraryItem[]> | null = null;
const loadLibrary = (fresh = false) => {
  if (!library || fresh) {
    library = fetch('/admin/api/library').then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))));
  }
  return library;
};

async function uploadToLibrary(file: File): Promise<LibraryItem> {
  const body = new FormData();
  body.set('file', await formValue(file));
  const res = await fetch('/admin/api/library', { method: 'POST', body });
  const result = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok) throw new Error(result.error ?? 'Upload failed');
  loadLibrary(true);
  return result;
}

/** Opens the library dialog; resolves with the chosen item, or null if closed */
function pickFromLibrary(current: string): Promise<LibraryItem | null> {
  return new Promise((resolve) => {
    let chosen: LibraryItem | null = null;
    const search = h('input', { type: 'search', placeholder: 'Search the library…', 'aria-label': 'Search the library' });
    const grid = h('div', { class: 'cms-library__grid' }, h('p', { class: 'cms-muted', text: 'Loading…' }));
    const error = h('p', { class: 'cms-notice cms-notice--error', hidden: true });
    const file = h('input', { type: 'file', accept: 'image/svg+xml,image/png,image/webp', hidden: true });
    const dialog = h(
      'dialog',
      { class: 'cms-dialog cms-library' },
      h(
        'div',
        { class: 'cms-library__head' },
        h('h2', { text: 'Hello Robo library' }),
        h('button', { type: 'button', class: 'cms-icon-btn', 'aria-label': 'Close', text: '×', onclick: () => dialog.close() }),
      ),
      h(
        'div',
        { class: 'cms-library__tools' },
        search,
        h('button', { type: 'button', class: 'cms-btn cms-btn--ghost cms-btn--small', text: 'Upload new', onclick: () => file.click() }),
        file,
      ),
      error,
      grid,
    );

    let items: LibraryItem[] = [];
    const render = () => {
      const q = search.value.trim().toLowerCase();
      const shown = items.filter((i) => !q || i.name.toLowerCase().includes(q));
      const groups = [...new Set(shown.map((i) => i.group))];
      grid.replaceChildren(
        ...(shown.length ? [] : [h('p', { class: 'cms-muted', text: 'Nothing matches.' })]),
        ...groups.flatMap((g) => [
          h('p', { class: 'cms-library__group', text: g }),
          ...shown
            .filter((i) => i.group === g)
            .map((i) =>
              h(
                'button',
                {
                  type: 'button',
                  class: `cms-library__item${i.path === current ? ' is-current' : ''}`,
                  title: i.path,
                  onclick: () => {
                    chosen = i;
                    dialog.close();
                  },
                },
                (() => {
                  const tile = h('span', { class: 'cms-graphic-tile' }, h('img', { src: i.path, alt: '', loading: 'lazy' }));
                  paintTile(tile, i.path);
                  return tile;
                })(),
                h('span', { class: 'cms-library__name', text: i.name }),
              ),
            ),
        ]),
      );
    };
    search.addEventListener('input', render);
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      error.hidden = true;
      try {
        chosen = await uploadToLibrary(f);
        dialog.close();
      } catch (err) {
        error.textContent = (err as Error).message;
        error.hidden = false;
      }
    });
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(chosen);
    });

    document.body.append(dialog);
    dialog.showModal();
    loadLibrary()
      .then((list) => {
        items = list;
        render();
      })
      .catch(() => grid.replaceChildren(h('p', { class: 'cms-muted', text: 'Couldn’t load the library.' })));
  });
}

// --- 3D model preview ---

const MODEL_VIEWER = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js';
let modelViewer: Promise<unknown> | null = null;
const loadModelViewer = () => {
  if (!modelViewer) {
    modelViewer = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.type = 'module';
      s.src = MODEL_VIEWER;
      s.onload = resolve;
      s.onerror = reject;
      document.head.append(s);
    });
  }
  return modelViewer;
};

const formatSize = (bytes: number) =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// --- Field renderers ---

function control(f: Field, value: Value, path: string): Control {
  const id = nextId('f');
  switch (f.kind) {
    case 'text':
    case 'textarea': {
      const input =
        f.kind === 'text'
          ? h('input', { id, type: 'text', value: typeof value === 'string' ? value : '', lang: f.lang })
          : h('textarea', { id, rows: 4 }, typeof value === 'string' ? value : '');
      input.required = !!f.required;
      input.dataset.path = path;
      return {
        el: h('div', { class: 'cms-field' }, labelRow(f.label, id, f.required), input, hint(f.hint)),
        get: () => input.value,
      };
    }
    case 'number': {
      if (f.hidden) return { el: h('span', { hidden: true }), get: () => value ?? f.default ?? 0 };
      const input = h('input', { id, type: 'number', step: 'any', value: String(value ?? f.default ?? 0) });
      return {
        el: h('div', { class: 'cms-field' }, labelRow(f.label, id), input, hint(f.hint)),
        get: () => (input.value === '' ? (f.default ?? 0) : Number(input.value)),
      };
    }
    case 'select': {
      if (f.hidden) return { el: h('span', { hidden: true }), get: () => value ?? '' };
      // an empty option of the field's own ('None', 'Automatic') is a real choice: it
      // replaces the placeholder (and the browser would refuse it as `required`)
      const empty = f.options.some((o) => o.value === '');
      const select = h(
        'select',
        { id, required: !empty },
        ...(empty ? [] : [h('option', { value: '', text: 'Choose…' })]),
        ...f.options.map((o) => h('option', { value: o.value, text: o.label, selected: o.value === value })),
      );
      return {
        el: h('div', { class: 'cms-field' }, labelRow(f.label, id, !empty), select, hint(f.hint)),
        get: () => select.value,
      };
    }
    case 'checklist': {
      // one row per entry of the other section, each with its own checkbox
      const ticked = new Set(Array.isArray(value) ? (value as string[]) : []);
      const count = h('p', { class: 'cms-hint' });
      const boxes = (f.options ?? []).map((o) => ({
        value: o.value,
        input: h('input', { id: nextId('f'), type: 'checkbox', checked: ticked.has(o.value) }),
        label: o.label,
      }));
      const update = () => {
        const n = boxes.filter((b) => b.input.checked).length;
        count.textContent = `${n} of ${boxes.length} ${f.check.toLowerCase()}`;
      };
      boxes.forEach((b) => b.input.addEventListener('change', update));
      update();
      return {
        el: h(
          'fieldset',
          { class: 'cms-fieldset' },
          h('legend', { text: f.label }),
          hint(f.hint),
          h(
            'ul',
            { class: 'cms-checklist' },
            ...boxes.map((b) =>
              h(
                'li',
                { class: 'cms-checklist__row' },
                h('span', { class: 'cms-checklist__name', text: b.label }),
                h('label', { class: 'cms-switch', for: b.input.id }, b.input, f.check),
              ),
            ),
          ),
          count,
        ),
        get: () => boxes.filter((b) => b.input.checked).map((b) => b.value),
        check: () => {
          const n = boxes.filter((b) => b.input.checked).length;
          return f.min && n < f.min ? [`${f.label}: tick at least ${f.min}`] : [];
        },
      };
    }
    case 'boolean': {
      const input = h('input', { id, type: 'checkbox', checked: typeof value === 'boolean' ? value : !!f.default });
      return {
        el: h('div', { class: 'cms-field' }, h('label', { class: 'cms-switch', for: id }, input, f.label), hint(f.hint)),
        get: () => input.checked,
      };
    }
    case 'color': {
      const HEX = /^#[0-9a-fA-F]{6}$/;
      const initial = typeof value === 'string' ? value : '';
      const text = h('input', { id, type: 'text', value: initial, placeholder: f.placeholder, spellcheck: false, 'aria-label': `${f.label} (hex)` });
      const swatch = h('input', { type: 'color', value: HEX.test(initial) ? initial : (f.placeholder ?? '#000000'), 'aria-label': `${f.label} picker` });
      const clear = h('button', { type: 'button', class: 'cms-btn cms-btn--ghost cms-btn--small', text: 'Default' });
      const sync = () => {
        const v = text.value.trim();
        text.setCustomValidity(v && !HEX.test(v) ? 'Use a hex color like #FF6B03' : '');
      };
      swatch.addEventListener('input', () => {
        text.value = swatch.value.toUpperCase();
        text.dispatchEvent(new Event('input', { bubbles: true }));
      });
      text.addEventListener('input', () => {
        if (HEX.test(text.value.trim())) swatch.value = text.value.trim();
        sync();
      });
      clear.addEventListener('click', () => {
        text.value = '';
        swatch.value = f.placeholder ?? '#000000';
        text.dispatchEvent(new Event('input', { bubbles: true }));
      });
      requestAnimationFrame(sync);
      return {
        el: h(
          'div',
          { class: 'cms-field' },
          labelRow(f.label, id),
          h('div', { class: 'cms-color' }, swatch, text, clear),
          hint(f.hint),
        ),
        get: () => text.value.trim(),
      };
    }
    case 'graphic': {
      let current = typeof value === 'string' ? value : '';
      const tile = h('button', {
        type: 'button',
        class: 'cms-graphic-tile cms-graphic-tile--large',
        'aria-label': `${f.label}: choose from library`,
      });
      const name = h('span', { class: 'cms-hint' });
      const error = h('p', { class: 'cms-hint cms-graphic__error', hidden: true });
      const remove = h('button', { type: 'button', class: 'cms-btn cms-btn--danger cms-btn--small', text: 'None' });
      const file = h('input', { type: 'file', accept: 'image/svg+xml,image/png,image/webp', hidden: true });
      const render = () => {
        tile.replaceChildren(current ? h('img', { src: current, alt: '' }) : h('span', { text: 'None' }));
        if (current) paintTile(tile, current);
        else tile.style.background = '';
        name.textContent = current ? current.split('/').pop()! : 'No graphic';
        remove.hidden = !current;
      };
      const set = (path: string) => {
        current = path;
        error.hidden = true;
        render();
        tile.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const choose = async () => {
        const item = await pickFromLibrary(current);
        if (item) set(item.path);
      };
      tile.addEventListener('click', choose);
      remove.addEventListener('click', () => set(''));
      file.addEventListener('change', async () => {
        const f = file.files?.[0];
        file.value = '';
        if (!f) return;
        try {
          set((await uploadToLibrary(f)).path);
        } catch (err) {
          error.textContent = (err as Error).message;
          error.hidden = false;
        }
      });
      render();
      return {
        el: h(
          'div',
          { class: 'cms-field' },
          labelRow(f.label),
          h(
            'div',
            { class: 'cms-graphic' },
            tile,
            h(
              'div',
              { class: 'cms-graphic__side' },
              name,
              h(
                'div',
                { class: 'cms-add-row' },
                h('button', { type: 'button', class: 'cms-btn cms-btn--ghost cms-btn--small', text: 'Choose from library', onclick: choose }),
                h('button', { type: 'button', class: 'cms-btn cms-btn--ghost cms-btn--small', text: 'Upload new', onclick: () => file.click() }),
                remove,
                file,
              ),
              error,
            ),
          ),
          hint(f.hint),
        ),
        get: () => current,
      };
    }
    case 'model': {
      let ref = typeof value === 'string' ? value : '';
      let token = '';
      let preview = '';
      let info = '';
      const stage = h('div', { class: 'cms-model__stage' });
      const name = h('span', { class: 'cms-model__name' });
      const meta = h('span', { class: 'cms-hint' });
      const error = h('p', { class: 'cms-hint cms-graphic__error', hidden: true });
      const file = h('input', { id, type: 'file', accept: '.glb,model/gltf-binary', hidden: true });
      const pick = h('button', { type: 'button', class: 'cms-btn cms-btn--ghost cms-btn--small', onclick: () => file.click() });
      const remove = h('button', { type: 'button', class: 'cms-btn cms-btn--danger cms-btn--small', text: 'Remove' });

      const render = () => {
        const src = preview || (ref ? mediaUrl(ref) : '');
        stage.replaceChildren();
        if (src) {
          const viewer = document.createElement('model-viewer');
          Object.entries({
            src,
            alt: `${f.label} preview`,
            'camera-controls': '',
            'auto-rotate': '',
            'shadow-intensity': '0.6',
            exposure: '1',
          }).forEach(([k, v]) => viewer.setAttribute(k, v));
          stage.append(viewer, h('span', { class: 'cms-model__help', text: 'Drag to rotate · scroll to zoom' }));
          loadModelViewer().catch(() => {
            stage.replaceChildren(h('span', { class: 'cms-muted', text: 'Preview unavailable' }));
          });
        } else {
          stage.append(h('span', { class: 'cms-muted', text: 'No 3D object yet' }));
        }
        name.textContent = src ? (token ? uploads.get(token)!.name : ref.split('/').pop()!) : '';
        meta.textContent = info;
        pick.textContent = src ? 'Replace .glb' : 'Upload .glb';
        remove.hidden = !src;
      };

      const setFile = (f2: File | undefined) => {
        if (!f2) return;
        error.hidden = true;
        if (!/\.glb$/i.test(f2.name)) {
          error.textContent = /\.(obj|fbx|gltf|stl|usdz|dae|blend)$/i.test(f2.name)
            ? 'Please export it as GLB: glTF 2.0 → “glTF Binary (.glb)” (Blender: File → Export → glTF 2.0).'
            : 'Choose a .glb file.';
          error.hidden = false;
          return;
        }
        if (token) uploads.delete(token);
        if (preview) URL.revokeObjectURL(preview);
        token = `upload:${crypto.randomUUID()}`;
        uploads.set(token, f2);
        preview = URL.createObjectURL(f2);
        info = `${formatSize(f2.size)} · uploads when you save${f2.size > 5 * 1024 * 1024 ? ' · large for the web, consider compressing' : ''}`;
        stage.dispatchEvent(new Event('input', { bubbles: true }));
        render();
      };

      file.addEventListener('change', () => {
        setFile(file.files?.[0]);
        file.value = '';
      });
      stage.addEventListener('dragover', (e) => {
        e.preventDefault();
        stage.classList.add('cms-image--dragover');
      });
      stage.addEventListener('dragleave', () => stage.classList.remove('cms-image--dragover'));
      stage.addEventListener('drop', (e) => {
        e.preventDefault();
        stage.classList.remove('cms-image--dragover');
        setFile(e.dataTransfer?.files[0]);
      });
      remove.addEventListener('click', () => {
        if (token) uploads.delete(token);
        if (preview) URL.revokeObjectURL(preview);
        ref = token = preview = info = '';
        stage.dispatchEvent(new Event('input', { bubbles: true }));
        render();
      });
      render();

      return {
        el: h(
          'div',
          { class: 'cms-field' },
          labelRow(f.label, id, f.required),
          h(
            'div',
            { class: 'cms-model' },
            stage,
            h('div', { class: 'cms-graphic__side' }, name, meta, h('div', { class: 'cms-add-row' }, pick, remove, file), error),
          ),
          hint(f.hint),
        ),
        get: () => token || ref,
        check: () => (f.required && !token && !ref ? [`${f.label} is required`] : []),
      };
    }
    case 'youtube': {
      const input = h('input', {
        id,
        type: 'text',
        inputmode: 'url',
        placeholder: 'https://www.youtube.com/watch?v=…',
        value: typeof value === 'string' && value ? `https://www.youtube.com/watch?v=${value}` : '',
      });
      input.required = !!f.required;
      const preview = h('a', { class: 'cms-youtube', target: '_blank', rel: 'noopener' });
      const sync = () => {
        const vid = youtubeId(input.value);
        input.setCustomValidity(input.value.trim() && !vid ? 'Paste a YouTube video link' : '');
        preview.hidden = !vid;
        if (vid) {
          preview.href = `https://www.youtube.com/watch?v=${vid}`;
          preview.replaceChildren(
            h('img', { src: `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`, alt: '' }),
            h('span', { text: 'Open on YouTube ↗' }),
          );
        }
      };
      input.addEventListener('input', sync);
      sync();
      return {
        el: h('div', { class: 'cms-field' }, labelRow(f.label, id, f.required), input, preview, hint(f.hint)),
        get: () => input.value,
      };
    }
    case 'image': {
      let slot: ReturnType<typeof imageSlot>;
      slot = imageSlot(value, f.required ? undefined : () => slot.clear(), f.video, f.youtube);
      slot.input.id = id;
      const el = h('div', { class: 'cms-field' }, labelRow(f.label, id, f.required), slot.el, hint(f.hint));
      return {
        el,
        get: slot.get,
        check: () => {
          const missing = f.required && !slot.get();
          el.classList.toggle('cms-field--invalid', !!missing);
          return missing ? [`${f.label} is required`] : [];
        },
      };
    }
    case 'images': {
      // Filled slots plus one empty slot at the end (until there are `max` images)
      const wrap = h('div', { class: 'cms-images' });
      const slots: ReturnType<typeof imageSlot>[] = [];
      const el = h('div', { class: 'cms-field' }, labelRow(f.label, undefined, true), wrap, hint(f.hint));
      const ensureEmpty = () => {
        if (slots.length < f.max && slots.every((s) => s.get())) add('');
      };
      const add = (ref: unknown) => {
        const slot = imageSlot(ref, () => {
          slots.splice(slots.indexOf(slot), 1);
          slot.el.remove();
          ensureEmpty();
        }, f.video, f.youtube);
        slot.el.addEventListener('input', ensureEmpty);
        slots.push(slot);
        wrap.append(slot.el);
      };
      (Array.isArray(value) ? value : []).slice(0, f.max).forEach((ref) => add(ref));
      ensureEmpty();
      return {
        el,
        get: () => slots.map((s) => s.get()).filter(Boolean),
        check: () => {
          const missing = !slots.some((s) => s.get());
          el.classList.toggle('cms-field--invalid', missing);
          return missing ? [`${f.label}: add at least one ${f.video ? 'image or video' : 'image'}`] : [];
        },
      };
    }
    case 'strings': {
      const rows = h('div', { class: 'cms-items' });
      const inputs: (HTMLInputElement | HTMLTextAreaElement)[] = [];
      const add = (v = '', focus = false) => {
        const input = f.multiline
          ? h('textarea', { rows: 3, 'aria-label': f.item }, v)
          : h('input', { type: 'text', value: v, 'aria-label': f.item });
        const row = h(
          'div',
          { class: 'cms-string-row' },
          input,
          iconButton(`Remove ${f.item}`, '×', () => {
            inputs.splice(inputs.indexOf(input), 1);
            row.remove();
          }, true),
        );
        inputs.push(input);
        rows.append(row);
        if (focus) input.focus();
      };
      (Array.isArray(value) ? value : []).forEach((v) => add(String(v)));
      return {
        el: h(
          'div',
          { class: 'cms-field' },
          labelRow(f.label),
          rows,
          h('div', { class: 'cms-add-row' },
            h('button', { type: 'button', class: 'cms-btn cms-btn--ghost cms-btn--small', text: `+ Add ${f.item}`, onclick: () => add('', true) }),
          ),
          hint(f.hint),
        ),
        get: () => inputs.map((i) => i.value),
      };
    }
    case 'group': {
      const inner = fieldsControl(f.fields, (value as Data) ?? {}, path);
      const set = h('fieldset', { class: 'cms-fieldset' });
      if (f.optional) {
        // Same as a list: "+ Add testimonial" when empty, the fields and a × once added.
        // The fields sit in their own fieldset so, while removed, it's disabled and skipped
        // by the browser's required-field checks.
        let on = value != null;
        const body = h('fieldset', { class: 'cms-optional' }, hint(f.hint) ?? '', ...inner.els);
        const add = h('button', {
          type: 'button',
          class: 'cms-btn cms-btn--ghost cms-btn--small cms-optional__add',
          text: `+ Add ${f.label.toLowerCase()}`,
        });
        const remove = iconButton(`Remove ${f.label.toLowerCase()}`, '×', () => toggle(false), true);
        const toggle = (next: boolean) => {
          on = next;
          body.hidden = body.disabled = !on;
          add.hidden = on;
          remove.hidden = !on;
          set.dispatchEvent(new Event('input', { bubbles: true }));
        };
        add.addEventListener('click', () => toggle(true));
        set.append(h('legend', { class: 'cms-fieldset__head' }, h('span', { text: f.label }), remove), body, add);
        body.hidden = body.disabled = !on;
        add.hidden = on;
        remove.hidden = !on;
        return { el: set, get: () => (on ? inner.get() : null), check: () => (on ? inner.check() : []) };
      }
      set.append(h('legend', { text: f.label }), hint(f.hint) ?? '', ...inner.els);
      return { el: set, get: inner.get, check: inner.check };
    }
    case 'list':
    case 'blocks':
      return repeater(f, value, path);
  }
}

/** Repeatable items (list of objects, or typed blocks) with move / remove */
function repeater(f: Extract<Field, { kind: 'list' | 'blocks' }>, value: Value, path: string): Control {
  const items = h('div', { class: 'cms-items' });
  const entries: { el: HTMLElement; type?: string; inner: ReturnType<typeof fieldsControl> }[] = [];
  // a list with a `max`: no more adding once it's full
  let addButtons: HTMLButtonElement[] = [];
  const limit = () => {
    const full = f.kind === 'list' && !!f.max && entries.length >= f.max;
    addButtons.forEach((b) => (b.disabled = full));
  };

  const renumber = () => {
    entries.forEach((e, i) => {
      const bar = e.el.querySelector('.cms-item__bar span')!;
      // Sections read "Section 2: Media"; plain list items "fact 2"
      bar.textContent =
        f.kind === 'blocks'
          ? `Section ${i + 1}: ${f.variants.find((v) => v.type === e.type)?.label}`
          : `${f.item} ${i + 1}`;
    });
  };
  // Order changes go into the form like any edit (saved with Save changes)
  const changed = () => items.dispatchEvent(new Event('input', { bubbles: true }));

  const add = (data: Data, type?: string) => {
    const fields = f.kind === 'blocks' ? (f.variants.find((v) => v.type === type)?.fields ?? []) : f.fields;
    const inner = fieldsControl(fields, data, path);
    // Page sections (blocks) are cards with a title; list items are lighter rows inside them
    const entry = { el: h('div', { class: f.kind === 'blocks' ? 'cms-item cms-item--section' : 'cms-item' }), type, inner };
    const moveTo = (j: number) => {
      const i = entries.indexOf(entry);
      if (j < 0 || j >= entries.length || j === i) return false;
      entries.splice(i, 1);
      entries.splice(j, 0, entry);
      // Move just this section (the others, and their image / video previews, stay put)
      items.insertBefore(entry.el, entries[j + 1]?.el ?? null);
      renumber();
      return true;
    };

    // Page sections (and sortable lists, e.g. the Careers photo strip) are dragged by their
    // ⠿ handle (or ↑ / ↓ on the focused handle), like the list pages; other list items
    // (lines, credits) only get ×
    let handle: HTMLButtonElement | null = null;
    if (f.kind === 'blocks' || f.sortable) {
      handle = h('button', {
        type: 'button',
        class: 'cms-drag',
        'aria-label': `Move ${f.kind === 'blocks' ? 'section' : f.item}. Drag, or use the up and down arrow keys.`,
        title: 'Drag to reorder',
        text: '⠿',
      });
      handle.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        if (moveTo(entries.indexOf(entry) + (e.key === 'ArrowUp' ? -1 : 1))) changed();
        handle!.focus();
      });
      handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || entries.length < 2) return;
        e.preventDefault();
        // The section follows the pointer and the others slide out of its way, all with
        // transforms only: nothing moves in the DOM until the drop, when the order is
        // applied once. The pointer is captured by the handle (which stays put), so the
        // drag always ends, wherever the button is released.
        const el = entry.el;
        const from = entries.indexOf(entry);
        const gap = parseFloat(getComputedStyle(items).rowGap) || 0;
        const shift = el.offsetHeight + gap;
        // Layout at the start, in page coordinates
        const mids = entries.map((x) => {
          const r = x.el.getBoundingClientRect();
          return r.top + window.scrollY + r.height / 2;
        });
        const startPageY = e.clientY + window.scrollY;
        let pointerY = e.clientY;
        let to = from;
        try {
          handle!.setPointerCapture(e.pointerId);
        } catch {
          // no active pointer to capture (synthetic events); the window listeners below still end the drag
        }
        items.classList.add('is-sorting');
        el.classList.add('is-dragging');
        for (const x of entries) if (x !== entry) x.el.style.transition = 'transform 0.25s cubic-bezier(0.2, 1, 0.3, 1)';

        const update = () => {
          const dy = pointerY + window.scrollY - startPageY;
          const mid = mids[from] + dy;
          // Target slot: how many other sections now sit above the dragged one's middle
          to = 0;
          entries.forEach((x, i) => {
            if (i !== from && mids[i] < mid) to++;
          });
          entries.forEach((x, i) => {
            if (i === from) return;
            const by = i > from && i <= to ? -shift : i < from && i >= to ? shift : 0;
            x.el.style.transform = by ? `translateY(${by}px)` : '';
          });
          el.style.transform = `translateY(${dy}px)`;
        };

        // Scroll the page while the pointer is near the top / bottom edge
        const EDGE = 100;
        let frame = 0;
        const autoScroll = () => {
          const speed =
            pointerY < EDGE ? -(EDGE - pointerY) / 3 : pointerY > innerHeight - EDGE ? (pointerY - (innerHeight - EDGE)) / 3 : 0;
          if (speed) {
            window.scrollBy(0, speed);
            update();
          }
          frame = requestAnimationFrame(autoScroll);
        };
        frame = requestAnimationFrame(autoScroll);

        const onMove = (ev: PointerEvent) => {
          pointerY = ev.clientY;
          update();
        };
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          cancelAnimationFrame(frame);
          handle!.removeEventListener('pointermove', onMove);
          handle!.removeEventListener('pointerup', finish);
          handle!.removeEventListener('pointercancel', finish);
          handle!.removeEventListener('lostpointercapture', finish);
          window.removeEventListener('pointerup', finish);
          window.removeEventListener('blur', finish);
          document.removeEventListener('visibilitychange', finish);
          // Apply the order once, then let the dragged section ease into its slot
          const before = el.getBoundingClientRect().top;
          for (const x of entries) {
            x.el.style.transition = '';
            x.el.style.transform = '';
          }
          items.classList.remove('is-sorting');
          if (to !== from && moveTo(to)) changed();
          const after = el.getBoundingClientRect().top;
          el.style.transform = `translateY(${before - after}px)`;
          el.getBoundingClientRect();
          el.style.transition = 'transform 0.25s cubic-bezier(0.2, 1, 0.3, 1)';
          el.style.transform = '';
          setTimeout(() => {
            el.style.transition = '';
            el.classList.remove('is-dragging');
          }, 260);
        };
        handle!.addEventListener('pointermove', onMove);
        handle!.addEventListener('pointerup', finish);
        handle!.addEventListener('pointercancel', finish);
        handle!.addEventListener('lostpointercapture', finish);
        window.addEventListener('pointerup', finish);
        window.addEventListener('blur', finish);
        document.addEventListener('visibilitychange', finish);
      });
    }

    entry.el.append(
      h(
        'div',
        { class: 'cms-item__bar' },
        h('div', { class: 'cms-item__title' }, handle, h('span')),
        h(
          'div',
          { class: 'cms-item__tools' },
          iconButton('Remove', '×', () => {
            entries.splice(entries.indexOf(entry), 1);
            entry.el.remove();
            renumber();
            limit();
            changed();
          }, true),
        ),
      ),
      ...inner.els,
    );
    entries.push(entry);
    items.append(entry.el);
    renumber();
    limit();
    return entry;
  };

  for (const item of Array.isArray(value) ? (value as Data[]) : []) {
    add(item, f.kind === 'blocks' ? String(item.type) : undefined);
  }

  addButtons =
    f.kind === 'blocks'
      ? f.variants.map((v) =>
          h('button', {
            type: 'button',
            class: 'cms-btn cms-btn--ghost cms-btn--small',
            text: `+ ${v.label}`,
            onclick: () => add({}, v.type).el.scrollIntoView({ block: 'nearest' }),
          }),
        )
      : [
          h('button', {
            type: 'button',
            class: 'cms-btn cms-btn--ghost cms-btn--small',
            text: `+ Add ${f.item}`,
            onclick: () => add({}).el.scrollIntoView({ block: 'nearest' }),
          }),
        ];
  limit();

  return {
    el: h(
      'fieldset',
      { class: 'cms-fieldset' },
      h('legend', { text: f.label }),
      hint(f.hint),
      items,
      f.kind === 'blocks'
        ? h(
            'div',
            { class: 'cms-add-sections' },
            h('p', { class: 'cms-add-sections__title', text: 'Add new section' }),
            h('div', { class: 'cms-add-row' }, ...addButtons),
          )
        : h('div', { class: 'cms-add-row' }, ...addButtons),
    ),
    get: () => entries.map((e) => (e.type ? { type: e.type, ...e.inner.get() } : e.inner.get())),
    check: () => entries.flatMap((e) => e.inner.check()),
  };
}

function fieldsControl(fields: Field[], data: Data, path: string) {
  const controls = fields.map((f) => ({ f, c: control(f, data[f.key], path ? `${path}.${f.key}` : f.key) }));
  return {
    els: controls.map(({ c }) => c.el),
    get: () => Object.fromEntries(controls.map(({ f, c }) => [f.key, c.get()])) as Data,
    check: () => controls.flatMap(({ c }) => c.check?.() ?? []),
  };
}

// --- Mount ---

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

export function mountEditor(form: HTMLFormElement, config: Config) {
  useDirectUploads(!!config.directUploads);
  const fieldsEl = form.querySelector<HTMLElement>('[data-fields]')!;
  const errorsEl = document.querySelector<HTMLElement>('[data-errors]')!;
  const saveBtn = form.querySelector<HTMLButtonElement>('[data-save]')!;
  const idInput = form.querySelector<HTMLInputElement>('[data-id]');
  const isNew = !config.id;

  const root = fieldsControl(config.fields, config.data ?? {}, '');
  fieldsEl.replaceChildren(...root.els);

  let dirty = false;
  let idTouched = false;
  form.addEventListener('input', (e) => {
    dirty = true;
    document.querySelector('[data-saved]')?.remove();
    const target = e.target as HTMLElement;
    if (target === idInput) idTouched = true;
    else if (idInput && !idTouched && target.dataset.path === config.titleField) {
      idInput.value = slugify((target as HTMLInputElement).value);
    }
  });
  form.addEventListener('change', () => (dirty = true));
  window.addEventListener('beforeunload', (e) => {
    if (dirty) e.preventDefault();
  });

  const showErrors = (title: string, list: string[] = []) => {
    errorsEl.replaceChildren(
      h('strong', { text: title }),
      list.length ? h('ul', {}, ...list.map((m) => h('li', { text: m }))) : '',
    );
    errorsEl.hidden = false;
    errorsEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorsEl.hidden = true;
    const imageErrors = root.check();
    if (!form.checkValidity() || imageErrors.length) {
      form.reportValidity();
      if (imageErrors.length) showErrors('Please fix these fields:', imageErrors);
      return;
    }

    const data = root.get();
    const body = new FormData();
    body.set('data', JSON.stringify(data));
    if (isNew) body.set('id', idInput!.value);

    saveBtn.disabled = true;
    const label = saveBtn.textContent;
    saveBtn.textContent = 'Saving…';
    try {
      // Send only the files this entry still uses
      const used = JSON.stringify(data);
      for (const [token, file] of uploads) if (used.includes(token)) body.set(token, await formValue(file));
      const res = await fetch(isNew ? `/admin/api/${config.section}` : `/admin/api/${config.section}/${config.id}`, {
        method: isNew ? 'POST' : 'PUT',
        body,
      });
      const result = await res.json().catch(() => ({ error: res.statusText }));
      if (!res.ok) {
        if (res.status === 401) location.href = `/admin/login?next=${encodeURIComponent(location.pathname)}`;
        showErrors(result.error ?? 'Could not save', result.errors);
        return;
      }
      dirty = false;
      location.href = `/admin/${config.section}/${result.id}?saved`;
    } catch {
      showErrors('Could not reach the server or upload the files. Check your connection and try again.');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = label;
    }
  });

  return {
    markSaved: () => {
      dirty = false;
    },
  };
}
