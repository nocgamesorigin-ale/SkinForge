// Image analysis (size, alpha, content bounds) and output rendering, all on <canvas> in the browser.

// OffscreenCanvas encodes without the main-thread throttling <canvas>.toBlob gets in background tabs.
const OFF = typeof OffscreenCanvas !== 'undefined';
const canvas = (w, h) => {
  w = Math.max(1, w); h = Math.max(1, h);
  if (OFF) return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
};
const encode = (c, type, quality) => OFF ? c.convertToBlob({ type, quality }) : new Promise((res) => c.toBlob(res, type, quality));

export async function decode(blob) {
  return createImageBitmap(blob);
}

/**
 * w, h, whether it uses transparency, and the bounding box of its visible pixels
 * (normalised 0..1 in the image's own space).
 */
export async function analyze(blob) {
  const bmp = await decode(blob);
  const { width: w, height: h } = bmp;
  const S = 128, sc = Math.min(1, S / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * sc)), ch = Math.max(1, Math.round(h * sc));
  const c = canvas(cw, ch), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0, cw, ch);
  const d = g.getImageData(0, 0, cw, ch).data;
  let alpha = false, x0 = cw, y0 = ch, x1 = -1, y1 = -1;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const a = d[(y * cw + x) * 4 + 3];
    if (a < 250) alpha = true;
    if (a > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  bmp.close?.();
  const bbox = x1 < 0 ? { x: 0, y: 0, w: 1, h: 1 } : { x: x0 / cw, y: y0 / ch, w: (x1 - x0 + 1) / cw, h: (y1 - y0 + 1) / ch };
  return { w, h, alpha, bbox: alpha ? bbox : { x: 0, y: 0, w: 1, h: 1 } };
}

/**
 * Where the reskin's visible content lands inside the ORIGINAL frame (W×H), normalised 0..1.
 * fit = null → the whole reskin image is contained (centred, aspect kept).
 * fit = { crop:{x,y,w,h}, fill } → that crop of the reskin is scaled so its long side fills `fill` of the frame.
 */
export function placement(W, H, r, fit) {
  const src = fit ? fit.crop : { x: 0, y: 0, w: 1, h: 1 };
  const sw = src.w * r.w, sh = src.h * r.h;
  const s = fit ? Math.min((W * fit.fill) / sw, (H * fit.fill) / sh) : Math.min(W / sw, H / sh);
  const dw = sw * s, dh = sh * s, dx = (W - dw) / 2, dy = (H - dh) / 2;
  // visible content box inside the frame
  const bb = r.bbox;
  const cx = dx + ((bb.x - src.x) / src.w) * dw, cy = dy + ((bb.y - src.y) / src.h) * dh;
  const cw = (bb.w / src.w) * dw, ch = (bb.h / src.h) * dh;
  return { draw: { sx: src.x * r.w, sy: src.y * r.h, sw, sh, dx, dy, dw, dh }, content: { x: cx / W, y: cy / H, w: cw / W, h: ch / H } };
}

const MIME = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
const QUALITY = { webp: 0.82, jpg: 0.88, jpeg: 0.88 };

/** Render the reskin into the original frame and encode it in the original's format. */
export async function render(blob, r, W, H, fit, fmt, maxSide = 0) {
  const k = maxSide ? Math.min(1, maxSide / Math.max(W, H)) : 1;
  const tw = Math.round(W * k), th = Math.round(H * k);
  const bmp = await decode(blob);
  const c = canvas(tw, th), g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  const p = placement(W, H, r, fit).draw;
  if (fmt === 'jpg' || fmt === 'jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, tw, th); }
  g.drawImage(bmp, p.sx, p.sy, p.sw, p.sh, p.dx * k, p.dy * k, p.dw * k, p.dh * k);
  bmp.close?.();
  return encode(c, MIME[fmt] || 'image/png', QUALITY[fmt]);
}

/** Any image → PNG at its own size (for the artist brief). PNGs are passed through untouched. */
export async function toPNG(blob, name = '') {
  if (/\.png$/i.test(name) || blob.type === 'image/png') return blob;
  const bmp = await decode(blob);
  const c = canvas(bmp.width, bmp.height); c.getContext('2d').drawImage(bmp, 0, 0); bmp.close?.();
  return encode(c, 'image/png');
}

export const fmtBytes = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : n >= 1e3 ? Math.round(n / 1e3) + ' KB' : n + ' B';
