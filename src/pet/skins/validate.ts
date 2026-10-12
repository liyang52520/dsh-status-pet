// Artwork validation — the guard every read of stored or imported artwork
// passes through, and the hot spot the editor lives or dies by.
//
// A stored document is ~106 actions of 32- and 128-pixel rows: the full scan
// is millions of characters.  `validateArtwork` is therefore built out of
// MEMOIZED PARTS (see `actionErrors` below): a document is checked per ACTION,
// and each verdict is keyed by the OBJECT IDENTITY of the action itself.
// Artwork is immutable by construction — every mutator in the studio builds
// fresh objects and shares everything it did not change by reference — so
// identity is a sound key: a stroke that rewrites ONE action re-scans that one
// action and re-uses the cached verdicts for the other 105.
//
// The scan itself is deliberately allocation-free: a nibble lookup table and
// one fused pass per row, no per-pixel slicing and no per-row regex.  Drawing
// is FREE — nothing here requires the symmetry the old editor imposed.

import { AVATAR_GRID, GRIDS } from '../grids.ts';
import { STATE_NAMES } from '../behavior.ts';
import type { Action, ActionFrame, Artwork, Cell, PropArt } from './compose.ts';
import { PIXEL_CHARS, rowPixels } from './compose.ts';
import { MAX_FRAMES, MAX_LIBRARY, MAX_TAKES, MIN_FRAME_MS, MAX_FRAME_MS } from './compose.ts';

const SKIN_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** How many colours an artwork's palette can carry (index 0 is transparency,
 *  so indices 1–255): the ceiling of the two-character pixel format.  The
 *  studio never makes the user manage this — it grows as they paint. */
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
 *  checked by the caller; this is one fused pass. */
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

// Props are part of a FACE (the accents the v8 data carried; the studio can
// import them with an action).  They are checked like frames: rectangular
// legal pixels that sit inside the grid, where the horizontal headroom
// guarantees a legal offset cannot clip them.
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

/** One FACE: full grid rows plus an optional accent. */
function validateCell(cell: unknown, grid: number, tag: string, maxIdx: number): string[] {
  if (!cell || typeof cell !== 'object') return [tag + ': not an object'];
  const errors = validateRows((cell as Cell).rows, grid, tag, maxIdx);
  errors.push(...validateProp((cell as Cell).prop, grid, tag, maxIdx));
  return errors;
}

/** One frame of an action: the shared settings plus, at least, the avatar
 *  face.  `dx`/`dy` are authored in AVATAR units, so the avatar grid's headroom
 *  is the one ceiling — `GRIDS[128].maxOffset` is exactly 4× it, which is why
 *  the body face can never be pushed out of its canvas either. */
function validateFrame(frame: unknown, tag: string, maxIdx: number): string[] {
  const errors: string[] = [];
  if (!frame || typeof frame !== 'object') return [tag + ': not an object'];
  const f = frame as ActionFrame;
  const maxOffset = GRIDS[AVATAR_GRID].maxOffset;
  for (const axis of ['dx', 'dy'] as const) {
    const v = f[axis];
    if (v !== undefined && (typeof v !== 'number' || !Number.isInteger(v) || Math.abs(v) > maxOffset)) {
      errors.push(tag + ': ' + axis + ' exceeds ±' + maxOffset);
    }
  }
  if (f.ms !== undefined && (typeof f.ms !== 'number' || f.ms < MIN_FRAME_MS || f.ms > MAX_FRAME_MS)) {
    errors.push(tag + ': ms out of range');
  }
  const cells = f.cells;
  if (!cells || typeof cells !== 'object') return errors.concat([tag + ': cells must be an object']);
  for (const key of Object.keys(cells)) {
    const grid = Number(key);
    if (!GRIDS[grid]) {
      errors.push(tag + ': unknown grid ' + key);
      continue;
    }
    const cell = cells[grid];
    if (cell === undefined) continue;
    errors.push(...validateCell(cell, grid, tag + ' cell ' + grid, maxIdx));
  }
  if (!cells[AVATAR_GRID]) errors.push(tag + ': the avatar face (cell 32) is required');
  return errors;
}

function validateAction(action: unknown, tag: string, maxIdx: number): string[] {
  const errors: string[] = [];
  if (!action || typeof action !== 'object') return [tag + ': not an object'];
  const a = action as Action;
  if (typeof a.id !== 'string' || !a.id || a.id.length > 64) {
    errors.push(tag + ': id must be a non-empty string (max 64 chars)');
  }
  if (a.name !== undefined && typeof a.name !== 'string') errors.push(tag + ': name must be a string');
  if (a.origin !== undefined && typeof a.origin !== 'string') errors.push(tag + ': origin must be a string');
  if (typeof a.frameMs !== 'number' || a.frameMs < MIN_FRAME_MS || a.frameMs > MAX_FRAME_MS) {
    errors.push(tag + ': frameMs out of range');
  }
  if (!Array.isArray(a.frames) || a.frames.length < 1 || a.frames.length > MAX_FRAMES) {
    errors.push(tag + ': must have 1-' + MAX_FRAMES + ' frames');
    return errors;
  }
  a.frames.forEach((f, i) => {
    errors.push(...validateFrame(f, tag + ' frame ' + i, maxIdx));
  });
  return errors;
}

// ── the memoized parts ──
//
// The cache is a WeakMap keyed by the ACTION object, so an entry dies with the
// artwork it describes and can never leak or go stale: a document that changed
// is a different object.  The values are the error LISTS; the empty list is the
// common case and is shared, frozen, so callers cannot scribble on a cached
// verdict.  Only the palette ceiling can change a verdict, so that is the only
// extra key.

const NO_ERRORS: readonly string[] = Object.freeze([]);

/** One action's verdict, keyed by the action object and the palette ceiling.
 *  The `tag` is baked into the messages of the first caller — an action that
 *  MOVED in the library would still be described at its old position, which is
 *  a cosmetic difference in an error no user sees. */
const ACTION_ERRORS = new WeakMap<object, Map<number, string[]>>();

function actionErrors(action: unknown, tag: string, maxIdx: number): string[] {
  if (!action || typeof action !== 'object') return validateAction(action, tag, maxIdx);
  let byKey = ACTION_ERRORS.get(action as object);
  if (!byKey) {
    byKey = new Map();
    ACTION_ERRORS.set(action as object, byKey);
  }
  const hit = byKey.get(maxIdx);
  if (hit) return hit;
  const errors = validateAction(action, tag, maxIdx);
  if (!errors.length) {
    byKey.set(maxIdx, NO_ERRORS as string[]);
    return NO_ERRORS as string[];
  }
  byKey.set(maxIdx, errors);
  return errors;
}

// ── the document scan ──

/** Validate the full custom artwork document.  The avatar `idle` assignment is
 *  the only required artwork; everything else is optional and falls back.
 *  Rows need not be mirror-symmetric: the studio draws freely, and requiring
 *  symmetry was only ever an editor convention, not a rendering one.
 *
 * The library is checked as a REFERENCE TABLE: ids are unique, and every id a
 * state names must exist.  A state that points at an action the library does
 * not carry is refused here rather than silently rendering one animation fewer
 * — that is the whole reason the reference is validated instead of resolved
 * leniently. */
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
  const actions = art.actions;
  if (!Array.isArray(actions)) {
    errors.push('actions must be a list');
    return errors;
  }
  if (actions.length < 1 || actions.length > MAX_LIBRARY) {
    errors.push('the library must hold 1-' + MAX_LIBRARY + ' actions');
  }
  const ids = new Set<string>();
  actions.forEach((action, i) => {
    const tag = 'action ' + i;
    if (!action || typeof action !== 'object') {
      errors.push(tag + ': not an object');
      return;
    }
    if (typeof action.id === 'string' && action.id) {
      if (ids.has(action.id)) errors.push(tag + ': duplicate id ' + action.id);
      else ids.add(action.id);
    }
    errors.push(...actionErrors(action, tag, maxIdx));
  });
  if (!art.states || typeof art.states !== 'object') {
    errors.push('the artwork must carry states');
    return errors;
  }
  for (const state of Object.keys(art.states)) {
    if (!STATE_NAMES.includes(state as never)) {
      errors.push('unknown state ' + state);
      continue;
    }
    const refs = (art.states as Record<string, string[]>)[state];
    if (!Array.isArray(refs) || refs.length > MAX_TAKES) {
      errors.push('state ' + state + ': must be a list of at most ' + MAX_TAKES + ' action ids');
      continue;
    }
    const seen = new Set<string>();
    refs.forEach((id: unknown, i: number) => {
      if (typeof id !== 'string') {
        errors.push('state ' + state + ' ref ' + i + ': not an action id');
      } else if (!ids.has(id)) {
        errors.push('state ' + state + ' ref ' + i + ': no such action ' + id);
      } else if (seen.has(id)) {
        errors.push('state ' + state + ' ref ' + i + ': lists ' + id + ' twice');
      } else {
        seen.add(id);
      }
    });
  }
  if (!Array.isArray(art.states.idle) || art.states.idle.length < 1) {
    errors.push('the artwork must carry an idle state');
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
 *  document has been seen and at "one action" when it was just edited. */
export function artworkIsValid(d: unknown): boolean {
  return artworkErrors(d).length === 0;
}
