// The pixel format: strings in, flat palette indices out.
//
// A row is a string of TWO-character pixels: `..` is transparent, and any other
// pair is a hex index into the artwork palette (1–255).  Two characters instead
// of one is what buys a real colour per pixel — a one-character row caps a whole
// artwork at 15 inks.
//
// This module owns the whole codec (encode, read, parse, memoize, serialize) and
// knows nothing about skins or states.  `validate.ts` reuses the same nibble
// table so a pixel is decoded in exactly one way, and `face.ts` reuses
// `blankRows` so "an empty face" has exactly one definition.

import type { PixelSource, Prop, Sprite } from './model.ts';

/** How many characters one pixel takes in a row. */
export const PIXEL_CHARS = 2;
/** The one token that means "no pixel here". */
export const TRANSPARENT = '..';

/** Encode a palette index as one pixel (1–255; index 0 is transparency). */
export function hexPixel(index: number): string {
  return index.toString(16).padStart(PIXEL_CHARS, '0');
}

/** One pixel of a row, by column. */
export function pixelAt(row: string, x: number): string {
  return row.slice(x * PIXEL_CHARS, (x + 1) * PIXEL_CHARS);
}

/** How many pixels a row holds. */
export function rowPixels(row: string): number {
  return row ? row.length / PIXEL_CHARS : 0;
}

/** Hex digit → value, or −1 for anything a pixel may not hold.  '0'-'9' and
 *  'a'-'f' only — the format has no uppercase digits, so the charset check and
 *  the colour check are the same lookup. */
export const NIBBLE = new Int8Array(128).fill(-1);
for (let i = 0; i < 10; i++) NIBBLE[48 + i] = i;       // '0'-'9'
for (let i = 0; i < 6; i++) NIBBLE[97 + i] = 10 + i;   // 'a'-'f'

/** One empty face of `size × size` pixels.  The one definition of "nothing
 *  here" — used by `face.ts` for a face it cannot serve, and by validation. */
export function blankRows(size: number): string[] {
  return Array.from({ length: size }, () => TRANSPARENT.repeat(size));
}

/** Parse pixel rows into a flat Uint8Array of palette indices.
 *
 *  The hot path of the whole wardrobe: one 128px face is 16,384 pixels and a
 *  skin carries ~424 frames, so this reads a pixel's two characters straight out
 *  of the string through the nibble table — no per-pixel `slice`, no `parseInt`
 *  — and allocates nothing per pixel. */
export function parseRows(rows: string[]): { w: number; h: number; px: Uint8Array } {
  const h = rows.length;
  const w = rowPixels(rows[0]);
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    const base = y * w;
    // Anything that is not a legal hex pair stays 0 (transparent), which is
    // what the row format means by '..'.
    for (let x = 0, at = 0; x < w; x++, at += PIXEL_CHARS) {
      const a = row.charCodeAt(at);
      const b = row.charCodeAt(at + 1);
      const hi = a < 128 ? NIBBLE[a] : -1;
      const lo = b < 128 ? NIBBLE[b] : -1;
      if (hi < 0 || lo < 0) continue;
      px[base + x] = (hi << 4) | lo;
    }
  }
  return { w, h, px };
}

function parseProp(prop: Prop): NonNullable<Sprite['prop']> {
  const p = parseRows(prop.rows);
  return { w: p.w, h: p.h, px: p.px, x: prop.x, y: prop.y };
}

/** Parse one face into a flat sprite. */
export function parseSprite(source: PixelSource): Sprite {
  const { w, h, px } = parseRows(source.rows);
  const sprite: Sprite = { w, h, px, dx: source.dx || 0, dy: source.dy || 0 };
  if (source.prop) sprite.prop = parseProp(source.prop);
  return sprite;
}

/** `parseSprite`, memoized by the SOURCE object.
 *
 *  A frame is immutable and shared by reference, so the same object always
 *  parses to the same sprite — and keeping that identity is worth more than the
 *  parse: the renderer's bitmap cache is keyed by the sprite, so an untouched
 *  frame keeps its pre-rendered bitmap across a skin switch and a re-resolve. */
const SPRITES = new WeakMap<object, Sprite>();

export function spriteFor(source: PixelSource): Sprite {
  const hit = SPRITES.get(source as object);
  if (hit) return hit;
  const sprite = parseSprite(source);
  SPRITES.set(source as object, sprite);
  return sprite;
}

/** Serialize a sprite back into rows (the inverse of `parseSprite`). */
export function spriteToRows(sprite: Sprite): string[] {
  const rows: string[] = [];
  for (let y = 0; y < sprite.h; y++) {
    let row = '';
    for (let x = 0; x < sprite.w; x++) {
      const index = sprite.px[y * sprite.w + x];
      row += index === 0 ? TRANSPARENT : hexPixel(index);
    }
    rows.push(row);
  }
  return rows;
}

/** Integer-upscale rows by `scale` — the body fallback, and the accents inside
 *  it. */
export function upscaleRows(rows: string[], scale: number): string[] {
  const out: string[] = [];
  for (const row of rows) {
    let wide = '';
    for (let x = 0, n = rowPixels(row); x < n; x++) wide += pixelAt(row, x).repeat(scale);
    for (let i = 0; i < scale; i++) out.push(wide);
  }
  return out;
}
