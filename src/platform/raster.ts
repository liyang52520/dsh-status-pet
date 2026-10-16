// Pixel-perfect canvas rasterization of a parsed sprite (and its accent).
//
// Two paths, and the fast one is the one a browser takes:
//
//   * ImageData — one `putImageData` (plus, when the sprite is scaled, one
//     `drawImage` from a scratch canvas) instead of one `fillRect` per opaque
//     pixel.
//   * the fillRect loop — the fallback for a context without ImageData (or for a
//     `putImageData` the host refuses).

import type { Sprite } from '../skin/model.ts';

// One scratch canvas, reused by every scaled blit.
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

// #rrggbb → packed RGBA, endian-dependent and detected once.
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

function blitFast(
  ctx: CanvasRenderingContext2D,
  px: Uint8Array, w: number, h: number,
  palette: string[], scale: number, dx: number, dy: number,
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
  px: Uint8Array, w: number, h: number,
  palette: string[], scale: number, dx: number, dy: number,
): void {
  if (blitFast(ctx, px, w, h, palette, scale, dx, dy)) return;
  let colour: string | undefined;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = px[y * w + x];
      if (idx === 0) continue;
      const next = palette[idx];
      if (next !== colour) { colour = next; ctx.fillStyle = next; }
      ctx.fillRect(dx + x * scale, dy + y * scale, scale, scale);
    }
  }
}

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  palette: string[],
  scale: number,
  x: number,
  y: number,
): void {
  blit(ctx, sprite.px, sprite.w, sprite.h, palette, scale, x, y);
  const p = sprite.prop;
  if (p) blit(ctx, p.px, p.w, p.h, palette, scale, x + p.x * scale, y + p.y * scale);
}
