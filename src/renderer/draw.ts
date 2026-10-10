// Pixel-perfect canvas drawing of a parsed sprite (and its accent).
//
// Two paths, and the fast one is the one a browser takes:
//
//   * ImageData — one `putImageData` (plus, when the sprite is scaled, one
//     `drawImage` from a scratch canvas) instead of one `fillRect` per opaque
//     pixel.  A 128px body frame is 16,384 pixels; the studio, the popup and
//     the gallery rasterize hundreds of frames, so the fillRect loop was a
//     measurable part of opening the Workshop.
//   * the fillRect loop — the fallback for a context without ImageData (the
//     node test suite's stub canvas), kept as it was so the player suite can
//     still read what was painted off `fillStyle`.
//
// Colours are packed once per PALETTE (a `#rrggbb` → 32-bit RGBA table keyed
// by the palette array's identity), so rasterizing a frame never parses a
// colour string.

import type { Sprite } from '../pet/skins/compose.ts';

// One scratch canvas, reused by every scaled blit: a body sprite is at most
// 128×128, and growing it once is cheaper than allocating per frame.
let scratch: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;

function scratchCtx(w: number, h: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  if (!scratch) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    scratch = { canvas, ctx };
  }
  if (scratch.canvas.width < w || scratch.canvas.height < h) {
    scratch.canvas.width = Math.max(w, scratch.canvas.width);
    scratch.canvas.height = Math.max(h, scratch.canvas.height);
  }
  return scratch.ctx;
}

// `#rrggbb` → packed RGBA.  Bytes are written through a Uint32 view, so the
// packing is endian-dependent and detected once.
const LITTLE_ENDIAN = (() => {
  if (typeof Uint8Array === 'undefined' || typeof Uint32Array === 'undefined') return true;
  const probe = new Uint8Array(4);
  new Uint32Array(probe.buffer)[0] = 0x01020304;
  return probe[0] === 0x04;
})();

function pack(r: number, g: number, b: number): number {
  return LITTLE_ENDIAN
    ? ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
    : ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0;
}

const COLOUR_LUT = new WeakMap<object, Uint32Array>();

function colourTable(palette: string[]): Uint32Array {
  const hit = COLOUR_LUT.get(palette);
  if (hit) return hit;
  const table = new Uint32Array(256);
  const n = Math.min(palette.length, 256);
  for (let i = 1; i < n; i++) {
    const hex = palette[i];
    if (typeof hex !== 'string' || hex.length < 7) continue;
    const rgb = parseInt(hex.slice(1, 7), 16);
    if (Number.isNaN(rgb)) continue;
    table[i] = pack((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255);
  }
  COLOUR_LUT.set(palette, table);
  return table;
}

function canImageData(ctx: CanvasRenderingContext2D): boolean {
  return typeof ImageData === 'function' && typeof ctx.putImageData === 'function';
}

/** Draw `px` (w×h palette indices) at (dx, dy) scaled by `scale`.  Returns
 *  false when the ImageData path is unavailable, so the caller can fall back. */
function blitFast(
  ctx: CanvasRenderingContext2D,
  px: Uint8Array,
  w: number,
  h: number,
  palette: string[],
  scale: number,
  dx: number,
  dy: number,
): boolean {
  if (!canImageData(ctx)) return false;
  const table = colourTable(palette);
  const img = new ImageData(w, h);
  const out = new Uint32Array(img.data.buffer);
  for (let i = 0, n = w * h; i < n; i++) {
    const idx = px[i];
    if (idx) out[i] = table[idx];
  }
  if (scale === 1) {
    ctx.putImageData(img, dx, dy);
    return true;
  }
  const tmp = scratchCtx(w, h);
  if (!tmp) return false;
  tmp.putImageData(img, 0, 0);
  ctx.drawImage(scratch!.canvas, 0, 0, w, h, dx, dy, w * scale, h * scale);
  return true;
}

function blit(
  ctx: CanvasRenderingContext2D,
  px: Uint8Array,
  w: number,
  h: number,
  palette: string[],
  scale: number,
  dx: number,
  dy: number,
): void {
  if (blitFast(ctx, px, w, h, palette, scale, dx, dy)) return;
  // Fallback: the same pixels, one fillRect at a time.  The fillStyle is only
  // reassigned when the colour actually changes — pixel art runs in runs.
  let colour: string | undefined;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = px[y * w + x];
      if (idx === 0) continue;
      const next = palette[idx];
      if (next !== colour) {
        colour = next;
        ctx.fillStyle = next;
      }
      ctx.fillRect(dx + x * scale, dy + y * scale, scale, scale);
    }
  }
}

export function draw(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  palette: string[],
  scale: number,
  dx: number,
  dy: number,
): void {
  blit(ctx, sprite.px, sprite.w, sprite.h, palette, scale, dx, dy);
  const p = sprite.prop;
  if (p) blit(ctx, p.px, p.w, p.h, palette, scale, dx + p.x * scale, dy + p.y * scale);
}
