// The built-in artwork's invariant check.
//
// The artwork is AUTHORED (the 15.9 MB catalog produced by the one-shot pairing
// codemod), so a hand-edit to a built-in action needs a safety net.  This module
// re-checks the paired document the way the renderer reads it — full-face rows,
// legal palette indices, a required avatar face, an idle assignment that
// actually names an action — so a botched edit fails the suite instead of
// failing in the popup.
//
// It has no runtime caller on purpose: nothing validates on a hot path, because
// nothing untrusted reaches the renderer (the assignment diff is sanitized where it
// is applied).  Its caller is the test suite — `test/artwork.test.ts` runs
// `validateArtwork` over every built-in, so a botched hand-edit to `catalog.ts`
// fails `pnpm test` instead of failing in the popup.
//
// The nibble table is imported from `pixels.ts` so the charset and the colour
// check are one pass, never two.

import { FACE_NAMES, FACES } from './geometry.ts';
import type { FaceName, FaceSpec } from './geometry.ts';
import { STATE_NAMES } from '../behavior/vocabulary.ts';
import type { Prop, Artwork, Drawing } from './model.ts';
import { MAX_ACTIONS, MAX_FRAMES, MAX_SELECTION, MIN_FRAME_MS, MAX_FRAME_MS } from './model.ts';
import type { Action, Frame } from './model.ts';
import { NIBBLE, PIXEL_CHARS, rowPixels } from './pixels.ts';

const SKIN_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** How many colours an artwork's palette can carry (index 0 is transparency,
 *  so indices 1–255): the ceiling of the two-character pixel format. */
export const MAX_PALETTE = 256;

const DOT = 46; // '.'

/** Does one row name only transparency and legal palette slots?  Length is
 *  checked by the caller; this is one fused pass. */
function rowLegal(row: string, maxIdx: number): boolean {
  for (let i = 0; i < row.length; i += 2) {
    const a = row.charCodeAt(i);
    const b = row.charCodeAt(i + 1);
    if (a === DOT && b === DOT) continue;                  // '..'
    const hi = a < 128 ? NIBBLE[a] : -1;
    const lo = b < 128 ? NIBBLE[b] : -1;
    if (hi < 0 || lo < 0) return false;
    const idx = (hi << 4) | lo;
    if (idx < 1 || idx > maxIdx) return false;
  }
  return true;
}

function validateRows(rows: unknown, size: number, tag: string, maxIdx: number): string[] {
  const errors: string[] = [];
  if (!Array.isArray(rows) || rows.length !== size) {
    return [tag + ' must be ' + size + ' rows'];
  }
  const width = size * PIXEL_CHARS;
  for (let y = 0; y < rows.length; y++) {
    const r = rows[y];
    if (typeof r !== 'string' || r.length !== width) {
      errors.push(tag + ' row ' + y + ' must be ' + size + ' two-character pixels');
      continue;
    }
    if (!rowLegal(r, maxIdx)) {
      errors.push(tag + ' row ' + y + ' uses a colour the palette does not carry');
    }
  }
  return errors;
}

function validateProp(prop: unknown, size: number, tag: string, maxIdx: number): string[] {
  if (prop === undefined) return [];
  if (!prop || typeof prop !== 'object') return [tag + ': prop is not an object'];
  const p = prop as Prop;
  const rows = p.rows;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > size) {
    return [tag + ': prop must be 1-' + size + ' rows'];
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
    || p.x + w > size || p.y + rows.length > size) {
    return [tag + ': prop must sit inside the grid'];
  }
  return [];
}

/** One face at one of the two canonical face sizes. */
function validateDrawing(drawing: unknown, spec: FaceSpec, tag: string, maxIdx: number): string[] {
  if (!drawing || typeof drawing !== 'object') return [tag + ': not an object'];
  const errors = validateRows((drawing as Drawing).rows, spec.size, tag, maxIdx);
  errors.push(...validateProp((drawing as Drawing).prop, spec.size, tag, maxIdx));
  return errors;
}

// Offsets are authored in avatar units, so `FACES.avatar.maxOffset` is the one
// ceiling — the body headroom is exactly 4× it, so a legal offset at 32 can
// never push the 128 face out of its canvas either.
const MAX_OFFSET = FACES.avatar.maxOffset;

function validateFrame(frame: unknown, tag: string, maxIdx: number): string[] {
  const errors: string[] = [];
  if (!frame || typeof frame !== 'object') return [tag + ': not an object'];
  const f = frame as Frame;
  for (const axis of ['dx', 'dy'] as const) {
    const v = f[axis];
    if (v !== undefined && (typeof v !== 'number' || !Number.isInteger(v) || Math.abs(v) > MAX_OFFSET)) {
      errors.push(tag + ': ' + axis + ' exceeds ±' + MAX_OFFSET);
    }
  }
  if (f.ms !== undefined && (typeof f.ms !== 'number' || f.ms < MIN_FRAME_MS || f.ms > MAX_FRAME_MS)) {
    errors.push(tag + ': ms out of range');
  }
  const art = f.art;
  if (!art || typeof art !== 'object') return errors.concat([tag + ': art must be an object']);
  const avatar = art.avatar;
  if (!avatar || typeof avatar !== 'object') {
    errors.push(tag + ': the avatar face is required');
  } else {
    errors.push(...validateDrawing(avatar, FACES.avatar, tag + ' avatar', maxIdx));
  }
  for (const key of Object.keys(art)) {
    if (key === 'avatar') continue;
    if (!FACES[key as FaceName]) {
      errors.push(tag + ': unknown face ' + key);
      continue;
    }
    const drawing = art[key as FaceName];
    if (!drawing || typeof drawing !== 'object') {
      errors.push(tag + ' ' + key + ': not a face');
      continue;
    }
    errors.push(...validateDrawing(drawing, FACES[key as FaceName], tag + ' ' + key, maxIdx));
  }
  return errors;
}

function validateAction(action: unknown, tag: string, maxIdx: number): string[] {
  const errors: string[] = [];
  if (!action || typeof action !== 'object') return [tag + ': not an object'];
  const a = action as Action;
  if (typeof a.id !== 'string' || !a.id || a.id.length > 64) {
    errors.push(tag + ': id must be a non-empty string (max 64 chars)');
  }
  if (typeof a.name !== 'string') errors.push(tag + ': name must be a string');
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

/** Validate one artwork document.  Rows need not be mirror-symmetric: symmetry
 *  was only ever an editor convention, never a rendering one.
 *
 * The library is checked as a REFERENCE TABLE: ids are unique, and every id a
 * state names must exist. */
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
  if (actions.length < 1 || actions.length > MAX_ACTIONS) {
    errors.push('the library must hold 1-' + MAX_ACTIONS + ' actions');
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
    errors.push(...validateAction(action, tag, maxIdx));
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
    if (!Array.isArray(refs) || refs.length > MAX_SELECTION) {
      errors.push('state ' + state + ': must be a list of at most ' + MAX_SELECTION + ' action ids');
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
