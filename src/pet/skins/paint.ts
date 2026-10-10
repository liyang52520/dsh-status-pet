// The pixel primitives — everything the studio does to a FRAME's rows.
//
// Pure and allocation-light: the studio calls these on every painted pixel, so
// `paintCell` copies one row string and one row ARRAY (every other row stays
// the very same string by reference), and the eyedropper's lookup reads a
// pixel without slicing.
//
// Colour model: a pixel stores the COLOUR it was painted with, as an index
// into the artwork's own palette.  The palette is a private dedup table the
// editor grows on demand (`findOrAdd`); it is never a knob the user manages.

import { PIXEL_CHARS, TRANSPARENT, hexPixel, pixelAt, rowPixels } from './compose.ts';
import { MAX_PALETTE } from './validate.ts';

/** One empty frame's rows at `grid`. */
export function blankRows(grid: number): string[] {
  return Array.from({ length: grid }, () => TRANSPARENT.repeat(grid));
}

/** The pixel a colour paints with: an existing palette slot, or a new one.
 *  Reusing a slot keeps the artwork (and its JSON) small. */
export function findOrAdd(palette: string[], colour: string): { palette: string[]; idx: number } {
  const hit = palette.indexOf(colour);
  if (hit > 0) return { palette, idx: hit };
  if (palette.length >= MAX_PALETTE) return { palette, idx: 1 };
  const next = palette.concat([colour]);
  return { palette: next, idx: next.length - 1 };
}

/** Point rows authored against `from` at the equivalent colours in `to`,
 *  growing `to` as needed.  Indices are private to an artwork; colours are not
 *  — this is what makes "import this action from a built-in" portable. */
export function adoptRows(
  rows: string[],
  from: string[],
  to: string[],
): { rows: string[]; palette: string[] } {
  let palette = to;
  const out = rows.map((row) => {
    let next = '';
    for (let x = 0; x < rowPixels(row); x++) {
      const tok = pixelAt(row, x);
      if (tok === TRANSPARENT) { next += TRANSPARENT; continue; }
      const colour = from[parseInt(tok, 16)] || '#000000';
      const add = findOrAdd(palette, colour);
      palette = add.palette;
      next += hexPixel(add.idx);
    }
    return next;
  });
  return { rows: out, palette };
}

/** Paint ONE pixel.  Drawing is FREE — the studio does not mirror strokes, so
 *  a custom artwork can be asymmetric (a wink, a scar, a one-sided prop). */
export function paintCell(rows: string[], y: number, x: number, tok: string): string[] {
  const at = x * PIXEL_CHARS;
  const row = rows[y];
  const out = rows.slice();
  out[y] = row.slice(0, at) + tok + row.slice(at + PIXEL_CHARS);
  return out;
}

/** Shift every pixel of a frame by (sx, sy); pixels that fall off the grid are
 *  lost, vacated pixels become transparent.  The shift is literal: since
 *  drawing is free there is nothing to re-symmetrize afterwards. */
export function shiftRows(rows: string[], sx: number, sy: number): string[] {
  const grid = rows.length;
  const blank = TRANSPARENT.repeat(grid);
  const cut = sx * PIXEL_CHARS;
  const out: string[] = [];
  for (let y = 0; y < grid; y++) {
    const srcY = y - sy;
    const src = srcY >= 0 && srcY < grid ? rows[srcY] : blank;
    const shifted = sx > 0 ? blank.slice(0, cut) + src.slice(0, src.length - cut)
      : sx < 0 ? src.slice(-cut) + blank.slice(0, -cut)
      : src;
    out.push(shifted);
  }
  return out;
}
