/**
 * The inquiry receipt the contact printer prints (Figma 10099:11935, 546×1584), drawn on a
 * canvas from the visitor's answers. Dynamic (marked red in Figma; printed black like
 * the rest, as on thermal paper): the receipt number, the name, the company, the services,
 * the "Thanks, <name>" line; the date and time are the moment it prints.
 *
 * Fonts as in Figma: Alliance No.2 Medium (the small caps lines), and three receipt fonts —
 * Receiptional Receipt (the number), Merchant Copy (name, company, "what happens next",
 * thanks) and Paskowy (the barcode). Those three load from public/fonts/receipt/ (file names
 * below); until the files are there, a monospace stands in and the barcode is drawn as bars.
 */

const W = 546;
const H = 1584;
/** pixels per Figma pixel */
const SCALE = 2;
/** the dynamic parts: black like the rest (Figma's red only marks them) */
const RED = '#000000';
const INK = '#000000';

const FONTS = {
  alliance: { family: 'Receipt Alliance', url: '/fonts/AllianceNo2-Medium.woff2' },
  number: { family: 'Receiptional Receipt', url: '/fonts/receipt/ReceiptionalReceipt.woff2' },
  merchant: { family: 'Merchant Copy', url: '/fonts/receipt/MerchantCopy.woff2' },
  barcode: { family: 'Paskowy', url: '/fonts/receipt/Paskowy.woff2' },
} as const;
type FontKey = keyof typeof FONTS;
const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';

/** The form's services, as the receipt names them */
const SERVICE_NAMES: Record<string, string> = {
  'Brand identity': 'ROBOT BRANDING & POSITIONING',
  'UI/UX': 'PRODUCT DESIGN',
  'Video production': 'MOTION, VIDEO & LAUNCH',
};

export interface ReceiptData {
  number: number;
  name: string;
  company?: string;
  services: string[];
  date?: Date;
}

// ── Fonts: loaded once; each one that fails falls back for good
const loaded: Partial<Record<FontKey, boolean>> = {};
let fontsReady: Promise<void> | null = null;
function loadFonts() {
  fontsReady ??= Promise.all(
    (Object.keys(FONTS) as FontKey[]).map(async (k) => {
      try {
        const face = new FontFace(FONTS[k].family, `url(${FONTS[k].url})`);
        document.fonts.add(await face.load());
        loaded[k] = true;
      } catch {
        loaded[k] = false;
      }
    }),
  ).then(() => undefined);
  return fontsReady;
}
const font = (k: FontKey, size: number) => (loaded[k] ? `${size}px "${FONTS[k].family}"` : k === 'number' ? `700 ${size}px ${MONO}` : `500 ${size}px ${MONO}`);

let stamp: Promise<HTMLImageElement | null> | null = null;
function loadStamp() {
  stamp ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = '/images/contact/receipt-stamp.png';
  });
  return stamp;
}

// The paper: white, with the torn zigzag at the top and bottom (Figma's outline)
const OUTLINE =
  'M0 8.84L12 0L24 9.95L37 1.11L50 11.05L64 0L78 9.95L91 1.11L105 11.05L119 0L133 9.95L147 1.11L161 11.05L175 0L189 9.95L203 1.11L217 11.05L231 0L245 9.95L259 1.11L273 11.05L287 0L301 9.95L315 1.11L329 11.05L343 0L357 9.95L371 1.11L385 11.05L399 0L413 9.95L427 1.11L441 11.05L455 0L469 9.95L483 1.11L497 11.05L511 0L527 9.95L546 3.32V1576.26L532 1584L518 1574.05L504 1584L490 1574.05L476 1584L462 1574.05L448 1584L434 1574.05L420 1584L406 1574.05L392 1584L378 1574.05L364 1584L350 1574.05L336 1584L322 1574.05L308 1584L294 1574.05L280 1584L266 1574.05L252 1584L238 1574.05L224 1584L210 1574.05L196 1584L182 1574.05L168 1584L154 1574.05L140 1584L126 1574.05L112 1584L98 1574.05L84 1584L70 1574.05L56 1584L42 1574.05L28 1584L14 1574.05L0 1580.68Z';

const two = (n: number) => String(n).padStart(2, '0');
function stampDate(d: Date) {
  const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const zone = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ?? '';
  return `${d.getDate()} ${month} ${d.getFullYear()} · ${two(d.getHours())}:${two(d.getMinutes())} ${zone}`.trim();
}

/** Draws the receipt; resolves with its canvas (W×H Figma pixels at SCALE) */
export async function drawReceipt(data: ReceiptData): Promise<HTMLCanvasElement> {
  await Promise.all([loadFonts(), loadStamp()]);
  const img = await loadStamp();
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);

  // paper: its outline, everything else clipped to it
  const paper = new Path2D(OUTLINE);
  ctx.fillStyle = '#ffffff';
  ctx.fill(paper);
  ctx.save();
  ctx.clip(paper);
  ctx.textBaseline = 'top';

  const spacing = (px: number) => {
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
  };
  /** one line of text; `top` is Figma's text box top. Long text shrinks to `maxW` */
  const text = (s: string, o: { x: number; top: number; size: number; font: FontKey; color?: string; align?: CanvasTextAlign; track?: number; maxW?: number; lineH?: number }) => {
    let size = o.size;
    const set = () => {
      ctx.font = font(o.font, size);
      spacing((o.track ?? 0) * (size / o.size));
    };
    set();
    if (o.maxW) {
      while (size > 8 && ctx.measureText(s).width > o.maxW) {
        size -= 1;
        set();
      }
    }
    ctx.fillStyle = o.color ?? INK;
    ctx.textAlign = o.align ?? 'left';
    // a smaller font sits lower, so it stays on the line's middle
    const lh = o.lineH ?? o.size * 1.2;
    ctx.fillText(s, o.x, o.top + (lh - size * 1.2) / 2);
  };
  const small = (s: string, x: number, top: number, align: CanvasTextAlign = 'left', color = INK) =>
    text(s, { x, top, size: 13, font: 'alliance', color, align, track: 1.04, maxW: 514 });
  const dashed = (y: number) => {
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3.02, 4.02]);
    ctx.beginPath();
    ctx.moveTo(15, y);
    ctx.lineTo(529, y);
    ctx.stroke();
    ctx.restore();
  };
  const stars = (top: number) => {
    ctx.font = font('alliance', 20);
    spacing(0);
    const one = ctx.measureText('*').width;
    // 46 asterisks across 514
    spacing((514 - one * 46) / 46);
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    ctx.fillText('*'.repeat(46), 15, top + 4);
  };

  const C = W / 2;
  const name = data.name.trim() || 'Friend';
  const first = name.split(/\s+/)[0];

  small('INQUIRY RECEIPT', C, 51, 'center');
  text(String(data.number).padStart(3, '0'), { x: C, top: 127, size: 100, font: 'number', color: RED, align: 'center', track: 5, maxW: 514 });
  small('YOU ARE NOW IN THE HUMAN LOOP', C, 246, 'center');
  stars(281);
  small('HELLOROBO.CO', C, 324, 'center');
  small('INFO@HELLOROBO.CO', C, 340, 'center');
  small('NEW YORK, NY', C, 356, 'center');
  stars(391);
  small('受付完了 / SUBMISSION COMPLETE', 15, 434);
  small(stampDate(data.date ?? new Date()), 530, 434, 'right');

  text(name, { x: C, top: 510, size: 100, font: 'merchant', color: RED, align: 'center', track: 5, maxW: 514 });
  if (data.company?.trim()) text(data.company.trim(), { x: C, top: 584, size: 50, font: 'merchant', color: RED, align: 'center', track: 2.5, maxW: 514 });
  dashed(638);
  small('SELECTED SERVICES', C, 658, 'center');
  dashed(692);
  const services = data.services.length ? data.services.map((s) => SERVICE_NAMES[s] ?? s.toUpperCase()) : ['TO BE DISCUSSED'];
  services.slice(0, 3).forEach((s, i) => {
    const top = 717 + i * 49;
    small(data.services.length ? '1X' : '—', 15, top, 'left', RED);
    text(s, { x: 62, top, size: 13, font: 'alliance', color: RED, track: 1.04, maxW: 466 });
  });
  dashed(858);
  small('WHAT HAPPENS NEXT', C, 883, 'center');
  // two lines at one size (the longer one sets it); Merchant Copy's lines are 21 apart
  const next = ['WE READ EVERYTHING. A REAL HUMAN REPLIES.', 'YOUR ROBOT REMAINS CALM.'];
  let nextSize = 30;
  ctx.font = font('merchant', nextSize);
  spacing(1.5);
  while (nextSize > 8 && ctx.measureText(next[0]).width > 514) {
    nextSize -= 1;
    ctx.font = font('merchant', nextSize);
  }
  const k = nextSize / 30;
  next.forEach((line, i) =>
    text(line, { x: C, top: 931 + i * (loaded.merchant ? 21 : nextSize * 1.25), size: nextSize, font: 'merchant', align: 'center', track: 1.5 * k, lineH: 36 }),
  );
  small('人間が確認します / HUMAN REVIEW PENDING', C, 1005, 'center');

  // the studio stamp (Figma: 571×250 frame at -16, 1070; the picture overflows it a little)
  if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(-16, 1070, 571, 250);
    ctx.clip();
    ctx.drawImage(img, -26.4, 1069.5, 635.5, 251);
    ctx.restore();
  }

  text(`***Thanks, ${first}***`, { x: C, top: 1361, size: 50, font: 'merchant', color: RED, align: 'center', track: 2.5, maxW: 514 });
  small('KEEP THIS RECEIPT. OR DON’T. WE HAVE A COPY.', C, 1410, 'center');
  dashed(1453);

  // barcode
  const motto = 'MAKING THE WORLD SAY YES TO YOUR ROBOT';
  if (loaded.barcode) {
    text(motto, { x: 112, top: 1489, size: 37.015, font: 'barcode', color: '#000', track: -0.9254, maxW: 322 });
  } else {
    // stand-in: bars from the letters, the motto small underneath
    ctx.fillStyle = '#000';
    let x = 112;
    let seed = 7;
    for (const ch of motto) {
      seed = (seed * 31 + ch.charCodeAt(0)) % 9973;
      for (let b = 0; b < 3; b++) {
        const w = 1 + ((seed >> b) % 3);
        if (x + w > 434) break;
        ctx.fillRect(x, 1489, w, 34);
        x += w + 1 + ((seed >> (b + 2)) % 2);
      }
    }
    text(motto, { x: 273, top: 1525, size: 11, font: 'alliance', color: '#000', align: 'center', track: 0.4, maxW: 322 });
  }

  ctx.restore();
  return canvas;
}
