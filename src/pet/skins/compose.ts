// The frame-animation model, shared by every skin — built-in and custom alike.
//
// A skin carries an ACTION LIBRARY per crop, plus which library ids each
// STATE plays.  An action (a "take") is a frame sequence with its own pace,
// owned by the ARTWORK: any number of states may reference it, editing it once
// changes all of them, and its pixels are stored once.  A frame is a full grid
// of palette-index rows plus an optional dx/dy whole-frame offset (bounded by
// GRIDS[grid].maxOffset), an optional ms override, and an optional PROP (a
// small accent stamped over the body: sleep bubbles, an exclamation,
// sparkles).
//
// There is exactly one artwork shape here.  A built-in is not composed from
// anything at load time: it is the same `Artwork` object a custom skin is,
// just authored by a generator (no longer in this repo) instead of by the
// pixel studio.  `upgradeArtwork` converts the pre-v8 shape (a state owning
// its own takes) — the one door for a v7 stored document and for the baked
// chunk.

import { GRIDS } from '../grids.ts';

/** A small accent drawn over a composed frame at (x, y) in grid pixels. */
export interface PropArt {
  x: number;
  y: number;
  rows: string[];
}

/** One drawable frame: a full grid of palette-index rows, plus an optional
 * whole-frame offset, an optional duration override (ms) and an optional
 * accent drawn over the body. */
export interface Frame {
  rows: string[];
  dx?: number;
  dy?: number;
  ms?: number;
  prop?: PropArt;
}

/** One animation variant of a state: a frame sequence with its own pace. */
export interface Take {
  frameMs: number;
  frames: Frame[];
}

/** One entry in a crop's ACTION LIBRARY: an animation the ARTWORK owns, not a
 * state.  States reference it by `id`, so any number of states can play the
 * same action — editing it once changes every state that references it, and
 * the pixels are stored once.
 *
 *   id      unique within its grid (the reference states hold)
 *   name    a human label ('吃年糕'); built-ins get it from the map's gloss
 *   origin  provenance ('chi-niangao' — the source gif); also the merge key
 *           when the built-in library is imported into 我的创作
 */
export interface LibraryTake extends Take {
  id: string;
  name?: string;
  origin?: string;
}

/** One crop's artwork: the shared action library, plus which library ids each
 * state plays.  A state that is absent — or whose list is empty — FOLLOWS
 * IDLE: there is deliberately no second "unset" mechanism. */
export interface GridArtwork {
  library: LibraryTake[];
  states: Record<string, string[]>;
}

/** A whole skin: a palette plus one action library and its state assignments
 * per crop.  Built-ins and 我的创作 are the same shape — see store.ts. */
export interface Artwork {
  palette: string[];
  grids: {
    [grid: number]: GridArtwork | undefined;
  };
}

/** The pre-v8 shape: every state OWNED its animations, so reuse was only ever
 * a copy.  It is still the shape of the baked built-in chunk (produced by the
 * Python pipeline, no longer in this repo) and of a v7 stored document, so
 * `upgradeArtwork` below is the one door from it into the library model. */
export type LegacyStateTakes = Record<string, Take[]>;
export interface LegacyArtwork {
  palette: string[];
  grids: {
    [grid: number]: { states: LegacyStateTakes } | undefined;
  };
}

export interface Sprite {
  w: number;
  h: number;
  px: Uint8Array;
  /** Whole-frame offset in sprite pixels (defaults 0). */
  dx: number;
  dy: number;
  /** An accent drawn over the body at (x, y) in grid pixels. */
  prop?: { w: number; h: number; px: Uint8Array; x: number; y: number };
}

export const MAX_TAKES = 64;
export const MAX_FRAMES = 8;
/** How many actions one crop's LIBRARY can hold.  Its own cap, separate from
 * the per-state one: the built-in whale already ships 106 actions, so a
 * per-state cap could never bound the library. */
export const MAX_LIBRARY = 128;
export const MIN_FRAME_MS = 50;
export const MAX_FRAME_MS = 5000;
export const DEFAULT_FRAME_MS = 400;

// ── The pixel format ──
//
// A row is a string of TWO-character pixels: `..` is transparent, and any
// other pair is a hex index into the artwork palette (1–255).  Two characters
// instead of one is what buys a real colour per pixel: a one-character row
// caps a whole artwork at 15 inks.

export const PIXEL_CHARS = 2;
export const TRANSPARENT = '..';

/** Encode a palette index as one pixel (1–255; index 0 is transparency). */
export function hexPixel(idx: number): string {
  return idx.toString(16).padStart(PIXEL_CHARS, '0');
}

/** One pixel of a row, by grid column. */
export function pixelAt(row: string, x: number): string {
  return row.slice(x * PIXEL_CHARS, (x + 1) * PIXEL_CHARS);
}

/** The palette index a pixel carries (0 = transparent). */
export function pixelColour(tok: string): number {
  return tok === TRANSPARENT ? 0 : parseInt(tok, 16);
}

/** How many grid pixels a row holds. */
export function rowPixels(row: string): number {
  return row ? row.length / PIXEL_CHARS : 0;
}

/** Parse pixel rows into a flat Uint8Array of palette indices.
 *
 *  The hot path of the whole wardrobe: one frame of the 128px body is 16,384
 *  pixels, a skin carries ~424 frames, and a resolution parses the frames of
 *  every state it touches.  So this reads the two characters of a pixel
 *  straight out of the string through a nibble table — no per-pixel `slice`,
 *  no `parseInt` — which is several times faster than the obvious form and
 *  allocates nothing per pixel. */
const NIBBLE = new Int8Array(128).fill(-1);
for (let i = 0; i < 10; i++) NIBBLE[48 + i] = i;          // '0'-'9'
for (let i = 0; i < 6; i++) NIBBLE[97 + i] = 10 + i;      // 'a'-'f'

export function parseRows(rows: string[]): { w: number; h: number; px: Uint8Array } {
  const h = rows.length;
  const w = rowPixels(rows[0]);
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    const base = y * w;
    // Two characters per pixel; anything that is not a legal hex pair stays 0
    // (transparent), which is what the row format means by '..'.
    for (let x = 0, at = 0; x < w; x++, at += PIXEL_CHARS) {
      const a = row.charCodeAt(at);
      const b = row.charCodeAt(at + 1);
      const hi = a < 128 ? NIBBLE[a] : -1;
      const lo = b < 128 ? NIBBLE[b] : -1;
      if (hi < 0 || lo < 0) continue;                     // '..' and anything malformed
      px[base + x] = (hi << 4) | lo;
    }
  }
  return { w, h, px };
}

/** Parse one frame's rows (and accent) into a flat sprite. */
export function parseFrame(frame: Frame): Sprite {
  const { w, h, px } = parseRows(frame.rows);
  const sprite: Sprite = { w, h, px, dx: frame.dx || 0, dy: frame.dy || 0 };
  if (frame.prop) {
    const p = parseRows(frame.prop.rows);
    sprite.prop = { w: p.w, h: p.h, px: p.px, x: frame.prop.x, y: frame.prop.y };
  }
  return sprite;
}

/** `parseFrame`, memoized by the FRAME object.
 *
 *  A frame is immutable and its rows are shared by reference through every
 *  copy-on-write edit, so the same frame object always parses to the same
 *  sprite — and keeping that identity is worth more than the parse: the
 *  renderer's bitmap cache is keyed by the sprite, so an untouched frame keeps
 *  its pre-rendered bitmap across a stroke, a skin switch and a re-resolve.
 *  Without it every write rebuilt every bitmap on screen. */
const SPRITES = new WeakMap<Frame, Sprite>();

export function spriteFor(frame: Frame): Sprite {
  const hit = SPRITES.get(frame);
  if (hit) return hit;
  const sprite = parseFrame(frame);
  SPRITES.set(frame, sprite);
  return sprite;
}

/** Serialize a sprite back into frame rows (the inverse of parseFrame). */
export function spriteToRows(s: Sprite): string[] {
  const rows: string[] = [];
  for (let y = 0; y < s.h; y++) {
    let row = '';
    for (let x = 0; x < s.w; x++) {
      const idx = s.px[y * s.w + x];
      row += idx === 0 ? TRANSPARENT : hexPixel(idx);
    }
    rows.push(row);
  }
  return rows;
}

/** Integer-upscale PIXEL rows (two chars per pixel) — the studio's draft from
 * a smaller crop.  Offsets scale with it. */
export function upscalePixels(rows: string[], scale: number): string[] {
  const out: string[] = [];
  for (const row of rows) {
    let wide = '';
    for (let x = 0; x < rowPixels(row); x++) wide += pixelAt(row, x).repeat(scale);
    for (let i = 0; i < scale; i++) out.push(wide);
  }
  return out;
}

/** The grid a frame grid's rows describe (their width in pixels). */
export function gridOfGrid(rows: string[]): number {
  const w = rowPixels(rows[0] || '');
  return GRIDS[w] ? w : 0;
}

// ── The library: identity, dedupe, and the door from the old shape ──
//
// Two things make the library work, and neither belongs in the store: an id
// that survives editing (states hold ids, so deleting an action can never
// shift what another state points at — the old index-based model did exactly
// that), and a CONTENT KEY, which is how the same action authored twice
// collapses into one shared entry.  `upgradeArtwork` is the single conversion
// from the pre-v8 shape, used for both a v7 stored document and the generated
// built-in chunk.

/** One action's identity by CONTENT: two takes with the same key draw
 * identically, so a migration or an import may safely share one entry.
 *
 * The key is memoized per take OBJECT (a WeakMap, not a string table): every
 * mutator in the studio builds a fresh take object, so a cached key can never
 * describe edited pixels, while a scan of an unchanged library pays for each
 * entry exactly once.  Building the key is the only O(pixels) part of the
 * library ops, and it is the reason a 106-action built-in upgrades in
 * milliseconds rather than seconds. */
const KEY_CACHE = new WeakMap<Take, string>();

export function takeKey(take: Take): string {
  const hit = KEY_CACHE.get(take);
  if (hit !== undefined) return hit;
  let key = String(take.frameMs);
  for (const f of take.frames) {
    key += '\u0001' + f.rows.join('\u0002')
      + '\u0003' + (f.dx || 0) + ',' + (f.dy || 0) + ',' + (f.ms ?? '');
    if (f.prop) key += '\u0004' + f.prop.x + ',' + f.prop.y + ',' + f.prop.rows.join('\u0002');
  }
  KEY_CACHE.set(take, key);
  return key;
}

/** A stable, readable id that is free in this library.  `base` keeps a
 * built-in's provenance legible ('chi-niangao'); anything invalid or already
 * taken falls back to `t<n>`, so ids stay unique per grid. */
export function freeTakeId(library: LibraryTake[], base?: string): string {
  const clean = (base || '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (clean) {
    if (!library.some((t) => t.id === clean)) return clean;
    for (let n = 2; ; n++) {
      const id = clean + '-' + n;
      if (!library.some((t) => t.id === id)) return id;
    }
  }
  for (let n = 1; ; n++) {
    const id = 't' + n;
    if (!library.some((t) => t.id === id)) return id;
  }
}

/** Add one take to a library, deduping by content: an identical action already
 * in the library is SHARED instead of stored twice.  Returns the (possibly
 * unchanged) library plus the id to reference.
 *
 * `meta.unique` opts OUT of that dedupe.  新建动作 needs it: an identical blank
 * is already in the library, and silently sharing it would make the button look
 * broken the second time it is pressed.  Merging — a migration, the v7 upgrade
 * door — wants the dedupe. */
export function addToLibrary(
  library: LibraryTake[],
  take: Take,
  meta?: { id?: string; name?: string; origin?: string; unique?: boolean },
): { library: LibraryTake[]; id: string } {
  const key = takeKey(take);
  const hit = meta?.unique ? undefined : library.find((t) => takeKey(t) === key);
  if (hit) return { library, id: hit.id };
  const id = freeTakeId(library, meta?.id);
  const entry: LibraryTake = { id, frameMs: take.frameMs, frames: take.frames };
  if (meta?.name) entry.name = meta.name;
  if (meta?.origin) entry.origin = meta.origin;
  return { library: library.concat([entry]), id };
}

/** Convert a pre-v8 artwork (state → its own takes) into the library model.
 *
 * Deterministic and lossless: states are visited in their authored order, and
 * each take goes in through `addToLibrary`, so a take copied across three
 * states becomes ONE shared entry referenced three times — the document
 * shrinks and the copies can no longer drift.  Frames and row strings are
 * shared by reference, never copied. */
export function upgradeArtwork(legacy: LegacyArtwork): Artwork {
  const grids: Artwork['grids'] = {};
  for (const key of Object.keys(legacy.grids)) {
    const grid = Number(key);
    const g = legacy.grids[grid];
    if (!g || !g.states) continue;
    let library: LibraryTake[] = [];
    const states: Record<string, string[]> = {};
    for (const state of Object.keys(g.states)) {
      const ids: string[] = [];
      for (const take of g.states[state] || []) {
        const added = addToLibrary(library, take);
        library = added.library;
        ids.push(added.id);
      }
      states[state] = ids;
    }
    grids[grid] = { library, states };
  }
  return { palette: legacy.palette, grids };
}
