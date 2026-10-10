// Artwork validation — the guard every read of stored or imported artwork
// passes through, and the hot spot the editor lives or dies by.
//
// A stored document is ~180 frames of 32/128-pixel rows: the full scan is
// millions of characters.  `validateArtwork` is therefore built out of
// MEMOIZED PARTS (see `artworkErrors` below): a document is checked per action
// and per crop, and each part is keyed by the OBJECT IDENTITY of the piece
// itself.  Artwork is immutable by construction — every mutator in the studio
// builds fresh objects and shares everything it did not change by reference —
// so identity is a sound key: a stroke that rewrites ONE action re-scans that
// one action and re-uses the cached verdicts for the other 105.
//
// Before this split a stroke paid the whole 15MB scan (~35 ms), several times
// over (the store validated on every resolution).  It now pays for the frames
// it actually touched.
//
// The scan itself is deliberately allocation-free: a nibble lookup table and
// one fused pass per row, no per-pixel slicing and no per-row regex.  Drawing
// is FREE — nothing here requires the symmetry the old editor imposed.

import { GRIDS, AVATAR_GRID } from '../grids.ts';
import { STATE_NAMES } from '../behavior.ts';
import type { Artwork, GridArtwork, LibraryTake, PropArt } from './compose.ts';
import { PIXEL_CHARS, rowPixels } from './compose.ts';
import { MAX_FRAMES, MAX_LIBRARY, MAX_TAKES, MIN_FRAME_MS, MAX_FRAME_MS } from './compose.ts';

const SKIN_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** How many colours an artwork's palette can carry (index 0 is transparency,
 * so indices 1–255): the ceiling of the two-character pixel format.  The
 * studio never makes the user manage this — it grows as they paint. */
export const MAX_PALETTE = 256;

// ── the pixel scan ──
//
// One nibble table for every character a pixel may hold: '0'-'9' and 'a'-'f'.
// Anything else (including a stray uppercase hex digit, which the format does
// not use) is −1 and rejects the pixel — so the charset check and the colour
// check are the same pass, and a row no longer needs its own regex.

const NIBBLE = new Int8Array(128).fill(-1);
for (let i = 0; i < 10; i++) NIBBLE[48 + i] = i;          // '0'-'9'
for (let i = 0; i < 6; i++) NIBBLE[97 + i] = 10 + i;      // 'a'-'f'

const DOT = 46;                                            // '.'

/** Does one row name only transparency and legal palette slots?  Length is
 * checked by the caller; this is one fused pass. */
function rowLegal(r: string, maxIdx: number): boolean {
  for (let i = 0; i < r.length; i += 2) {
    const a = r.charCodeAt(i);
    const b = r.charCodeAt(i + 1);
    if (a === DOT && b === DOT) continue;                  // '..'
    const hi = a < 128 ? NIBBLE[a] : -1;
    const lo = b < 128 ? NIBBLE[b] : -1;
    if (hi < 0 || lo < 0) return false;
    const idx = (hi << 4) | lo;
    if (idx < 1 || idx > maxIdx) return false;
  }
  return true;
}

function validateRows(rows: unknown, grid: number, tag: string, maxIdx: number): string[] {
  const errors: string[] = [];
  if (!Array.isArray(rows) || rows.length !== grid) {
    return [tag + ' must be ' + grid + ' rows'];
  }
  const width = grid * PIXEL_CHARS;
  for (let y = 0; y < rows.length; y++) {
    const r = rows[y];
    if (typeof r !== 'string' || r.length !== width) {
      errors.push(tag + ' row ' + y + ' must be ' + grid + ' two-character pixels');
      continue;
    }
    if (!rowLegal(r, maxIdx)) {
      errors.push(tag + ' row ' + y + ' uses a colour the palette does not carry');
    }
  }
  return errors;
}

// Props are part of a frame (the built-ins' accents; the studio can import
// them with a state).  They used to be unvalidated on stored artwork, which
// meant a hand-written export could carry a broken accent straight into
// `parseFrame` and throw out of the store — so they are checked like frames:
// rectangular legal pixels that sit inside the grid, where the horizontal
// headroom guarantees a legal offset cannot clip them.
function validateProp(prop: unknown, grid: number, tag: string, maxIdx: number): string[] {
  if (prop === undefined) return [];
  if (!prop || typeof prop !== 'object') return [tag + ': prop is not an object'];
  const p = prop as PropArt;
  const rows = p.rows;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > grid) {
    return [tag + ': prop must be 1-' + grid + ' rows'];
  }
  const w = rowPixels(rows[0]);
  const width = w * PIXEL_CHARS;
  for (let y = 0; y < rows.length; y++) {
    const r = rows[y];
    if (typeof r !== 'string' || r.length !== width) {
      return [tag + ': prop rows must be rectangular two-character pixels'];
    }
    if (!rowLegal(r, maxIdx)) {
      return [tag + ': prop uses a colour the palette does not carry'];
    }
  }
  if (!Number.isInteger(p.x) || !Number.isInteger(p.y) || p.x < 0 || p.y < 0
    || p.x + w > grid || p.y + rows.length > grid) {
    return [tag + ': prop must sit inside the grid'];
  }
  return [];
}

function validateTake(take: unknown, grid: number, tag: string, maxIdx: number): string[] {
  const errors: string[] = [];
  if (!take || typeof take !== 'object') return [tag + ': not an object'];
  const t = take as LibraryTake;
  if (typeof t.frameMs !== 'number' || t.frameMs < MIN_FRAME_MS || t.frameMs > MAX_FRAME_MS) {
    errors.push(tag + ': frameMs out of range');
  }
  if (!Array.isArray(t.frames) || t.frames.length < 1 || t.frames.length > MAX_FRAMES) {
    errors.push(tag + ': must have 1-' + MAX_FRAMES + ' frames');
    return errors;
  }
  const maxOffset = GRIDS[grid].maxOffset;
  t.frames.forEach((f, i) => {
    if (!f || typeof f !== 'object') {
      errors.push(tag + ' frame ' + i + ': not an object');
      return;
    }
    errors.push(...validateRows(f.rows, grid, tag + ' frame ' + i, maxIdx));
    for (const axis of ['dx', 'dy'] as const) {
      const v = f[axis];
      if (v !== undefined && (typeof v !== 'number' || !Number.isInteger(v) || Math.abs(v) > maxOffset)) {
        errors.push(tag + ' frame ' + i + ': ' + axis + ' exceeds ±' + maxOffset);
      }
    }
    if (f.ms !== undefined && (typeof f.ms !== 'number' || f.ms < MIN_FRAME_MS || f.ms > MAX_FRAME_MS)) {
      errors.push(tag + ' frame ' + i + ': ms out of range');
    }
    errors.push(...validateProp(f.prop, grid, tag + ' frame ' + i, maxIdx));
  });
  return errors;
}

// ── the memoized parts ──
//
// Each cache is a WeakMap keyed by the OBJECT that was checked, so an entry
// dies with the artwork it describes and can never leak or go stale: a
// document that changed is a different object.  The values are the error
// LISTS; the empty list is the common case and is shared, frozen, so callers
// cannot scribble on a cached verdict.

const NO_ERRORS: readonly string[] = Object.freeze([]);

/** One action's verdict, keyed by the action object and the two parameters
 * that could change it: the crop (row count and offset ceiling) and the
 * palette ceiling.  The `tag` is baked into the messages of the first caller —
 * an action that MOVED in the library would still be described at its old
 * position, which is a cosmetic difference in an error no user sees. */
const TAKE_ERRORS = new WeakMap<object, Map<number, string[]>>();

function takeErrors(take: unknown, grid: number, tag: string, maxIdx: number): string[] {
  if (!take || typeof take !== 'object') return validateTake(take, grid, tag, maxIdx);
  const key = grid * 256 + maxIdx;
  let byKey = TAKE_ERRORS.get(take as object);
  if (!byKey) {
    byKey = new Map();
    TAKE_ERRORS.set(take as object, byKey);
  }
  const hit = byKey.get(key);
  if (hit) return hit;
  const errors = validateTake(take, grid, tag, maxIdx);
  if (!errors.length) {
    byKey.set(key, NO_ERRORS as string[]);
    return NO_ERRORS as string[];
  }
  byKey.set(key, errors);
  return errors;
}

// ── the document scan ──

/** Validate the full custom artwork document.  The avatar grid's `idle`
 * assignment is the only required artwork; everything else is optional and
 * falls back.  Rows need not be mirror-symmetric: the studio draws freely, and
 * requiring symmetry was only ever an editor convention, not a rendering one.
 *
 * The library is checked as a REFERENCE TABLE: ids are unique within their
 * grid, and every id a state names must exist.  A state that points at an
 * action the library does not carry is refused here rather than silently
 * rendering one animation fewer — that is the whole reason the reference is
 * validated instead of resolved leniently. */
export function validateArtwork(d: unknown): string[] {
  const errors: string[] = [];
  if (!d || typeof d !== 'object') return ['not an object'];
  const art = d as Artwork;
  const pal = art.palette;
  if (!Array.isArray(pal) || pal.length < 2 || pal.length > MAX_PALETTE) {
    errors.push('palette must carry transparency plus 1-' + (MAX_PALETTE - 1) + ' colours');
  } else {
    if (pal[0] !== 'transparent') errors.push('palette 0 must be transparent');
    for (let i = 1; i < pal.length; i++) {
      if (typeof pal[i] !== 'string' || !SKIN_COLOR_RE.test(pal[i])) {
        errors.push('palette ' + i + ' is not a #rrggbb colour');
      }
    }
  }
  const maxIdx = Array.isArray(pal) ? Math.min(pal.length - 1, MAX_PALETTE - 1) : MAX_PALETTE - 1;
  const grids = art.grids;
  if (!grids || typeof grids !== 'object') {
    errors.push('grids must be an object');
    return errors;
  }
  for (const key of Object.keys(grids)) {
    const grid = Number(key);
    const g = grids[grid];
    if (!GRIDS[grid]) {
      errors.push('unknown grid ' + key);
      continue;
    }
    if (!g || typeof g !== 'object' || !Array.isArray(g.library)) {
      errors.push('grid ' + key + ' must carry a library');
      continue;
    }
    if (g.library.length < 1 || g.library.length > MAX_LIBRARY) {
      errors.push('grid ' + key + ' library must hold 1-' + MAX_LIBRARY + ' actions');
    }
    const ids = new Set<string>();
    g.library.forEach((take: LibraryTake, i: number) => {
      const tag = 'grid ' + key + ' action ' + i;
      if (!take || typeof take !== 'object') {
        errors.push(tag + ': not an object');
        return;
      }
      if (typeof take.id !== 'string' || !take.id || take.id.length > 64) {
        errors.push(tag + ': id must be a non-empty string (max 64 chars)');
      } else if (ids.has(take.id)) {
        errors.push(tag + ': duplicate id ' + take.id);
      } else {
        ids.add(take.id);
      }
      if (take.name !== undefined && typeof take.name !== 'string') errors.push(tag + ': name must be a string');
      if (take.origin !== undefined && typeof take.origin !== 'string') errors.push(tag + ': origin must be a string');
      errors.push(...takeErrors(take, grid, tag, maxIdx));
    });
    if (!g.states || typeof g.states !== 'object') {
      errors.push('grid ' + key + ' must carry states');
      continue;
    }
    for (const state of Object.keys(g.states)) {
      if (!STATE_NAMES.includes(state as never)) {
        errors.push('grid ' + key + ': unknown state ' + state);
        continue;
      }
      const refs = (g.states as Record<string, string[]>)[state];
      if (!Array.isArray(refs) || refs.length > MAX_TAKES) {
        errors.push('grid ' + key + ' state ' + state + ': must be a list of at most ' + MAX_TAKES + ' action ids');
        continue;
      }
      const seen = new Set<string>();
      refs.forEach((id: unknown, i: number) => {
        if (typeof id !== 'string') {
          errors.push('grid ' + key + ' state ' + state + ' ref ' + i + ': not an action id');
        } else if (!ids.has(id)) {
          errors.push('grid ' + key + ' state ' + state + ' ref ' + i + ': no such action ' + id);
        } else if (seen.has(id)) {
          errors.push('grid ' + key + ' state ' + state + ' ref ' + i + ': lists ' + id + ' twice');
        } else {
          seen.add(id);
        }
      });
    }
  }
  const avatar = grids[AVATAR_GRID] as GridArtwork | undefined;
  if (!avatar || !Array.isArray(avatar.states?.idle) || avatar.states.idle.length < 1) {
    errors.push('the avatar grid must carry an idle state');
  }
  return errors;
}

// ── the memoized document gate ──
//
// What the STORE asks, on every resolution: "may I render this document?".
// Keyed by the document object, but built out of the cached parts above, so a
// stroke re-validates only the action it rewrote.  A document that is valid
// caches the shared empty verdict.

const DOC_ERRORS = new WeakMap<object, string[]>();

export function artworkErrors(d: unknown): readonly string[] {
  if (!d || typeof d !== 'object') return validateArtwork(d);
  const hit = DOC_ERRORS.get(d as object);
  if (hit) return hit;
  const errors = validateArtwork(d);
  const answer = errors.length ? errors : (NO_ERRORS as string[]);
  DOC_ERRORS.set(d as object, answer);
  return answer;
}

/** Is this document renderable?  The store's one question, at O(1) when the
 * document has been seen and at "one action" when it was just edited. */
export function artworkIsValid(d: unknown): boolean {
  return artworkErrors(d).length === 0;
}
