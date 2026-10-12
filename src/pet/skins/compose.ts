// The frame-animation model, shared by every skin — built-in and custom alike.
//
// ── the paired model (v9) ──
//
// An artwork is ONE action library and ONE state assignment.  An action is one
// animation of one character, and the character is drawn as TWO CROPS of the
// same pose: `cells[32]` (the dock avatar, REQUIRED) and `cells[128]` (the
// full body, OPTIONAL — a body-less action falls back to its avatar at a crisp
// 4× integer upscale, `BODY_FALLBACK_SCALE`).
//
// Everything that is not a pixel is SINGLE SOURCE, which is the point of the
// paired shape: frame count, `frameMs`, the per-frame `ms` override and the
// whole-frame `dx`/`dy` offset live on the ACTION/FRAME and describe BOTH
// crops, so the dock and the popup can never play two different animations.
// Only the pixels (and a frame's `prop`) are per crop, because the two crops
// are genuinely different pictures: 128 is 1:1 with the source material and 32
// is a 2:1 downscale of its head window, not a function of it.
//
//   offsets are authored in AVATAR units  — the 128px face renders `dx × 4`,
//   which is exactly what the headroom rule allows (`GRIDS[128].maxOffset` is
//   `GRIDS[32].maxOffset × 4`), so one gesture means the same hop on both faces.
//
// ── the doors that produced it ──
//
// Two older shapes still exist in the wild and both upgrade, losslessly where
// the data allows:
//
//   v7  `grids[g].states[state] = Take[]`      every state OWNED its takes
//   v8  `grids[g] = { library, states }`       one library per crop, ids
//   v9  `actions[] + states`                   one library, two faces  ← this file
//
// The baked built-in chunk (`artwork.gen.ts`, 15.9 MB of FROZEN data) is still
// in the v8 shape on purpose: it is hand-maintained and its per-action
// provenance comments are the catalog of what shipped, so the chunk goes
// through `upgradeArtwork` at install time (a pass over 106 objects that SHARES
// every row string by reference) instead of being rewritten by a codemod.
// `upgradeArtwork` is the one door for a stored document, an import and the
// built-in chunk.

import { AVATAR_GRID, BODY_FALLBACK_SCALE, BODY_GRID, GRIDS } from '../grids.ts';

/** A small accent drawn over a frame at (x, y) in grid pixels. */
export interface PropArt {
  x: number;
  y: number;
  rows: string[];
}

/** ONE CROP's pixels of one frame: a full grid of palette-index rows, plus an
 *  optional accent.  `rows` is the only thing that differs between the two
 *  faces of an action. */
export interface Cell {
  rows: string[];
  prop?: PropArt;
}

/** A frame's faces, keyed by grid.  `32` is REQUIRED — the avatar is the one
 *  face every action must carry, and validation enforces it — while every other
 *  grid (currently the optional 128 body) may be absent. */
export interface FrameCells {
  32: Cell;
  [grid: number]: Cell | undefined;
}

/** One drawable frame of an ACTION: the settings both crops share (`ms`, the
 *  whole-frame offset) plus the per-crop pixels.  The offset is in AVATAR
 *  units — see the header. */
export interface ActionFrame {
  ms?: number;
  dx?: number;
  dy?: number;
  cells: FrameCells;
}

/** One entry in the artwork's action library: an animation the ARTWORK owns,
 *  not a state.  States reference it by `id`, so any number of states can play
 *  the same action — editing it once changes every state that references it,
 *  and the pixels are stored once.
 *
 *   id      unique within the artwork (the reference states hold)
 *   name    a human label ('吃年糕'); built-ins get it from the map's gloss
 *   origin  provenance ('chi-niangao' — the source gif); also the merge key
 *           when the built-in library is imported into 我的创作
 */
export interface Action {
  id: string;
  name?: string;
  origin?: string;
  frameMs: number;
  frames: ActionFrame[];
}

/** A whole skin: a palette, ONE action library and the ids each state plays.
 *  Built-ins and 我的创作 are the same shape. */
export interface Artwork {
  palette: string[];
  actions: Action[];
  /** absent state key (or an empty list) = FOLLOW IDLE; a state is never
   *  stored as `[]`. */
  states: Record<string, string[]>;
}

// ── the v8 shape (the baked chunk and a stored v8 document) ──

/** One animation variant: a frame sequence with its own pace (the pre-v9
 *  frame shape, still the unit the v8 chunk and the shown takes use). */
export interface Take {
  frameMs: number;
  frames: Frame[];
}

export interface Frame {
  rows: string[];
  dx?: number;
  dy?: number;
  ms?: number;
  prop?: PropArt;
}

/** One entry in a v8 crop's library. */
export interface LibraryTake extends Take {
  id: string;
  name?: string;
  origin?: string;
}

/** One crop's v8 artwork: a shared action library per crop, plus which library
 *  ids each state plays. */
export interface GridArtwork {
  library: LibraryTake[];
  states: Record<string, string[]>;
}

export interface LibraryArtwork {
  palette: string[];
  grids: {
    [grid: number]: GridArtwork | undefined;
  };
}

/** The pre-v8 shape: every state OWNED its animations, so reuse was only ever
 *  a copy.  It is the shape of a v7 stored document. */
export type LegacyStateTakes = Record<string, Take[]>;
export interface LegacyArtwork {
  palette: string[];
  grids: {
    [grid: number]: { states: LegacyStateTakes } | undefined;
  };
}

/** Anything `upgradeArtwork` can be handed: a v7, v8 or v9 document. */
export type AnyArtwork = Artwork | LibraryArtwork | LegacyArtwork;

export interface Sprite {
  w: number;
  h: number;
  px: Uint8Array;
  /** Whole-frame offset in sprite pixels (the v8 frame carries it; a v9 frame
   *  keeps it on the frame itself — see `ResolvedFrame`). */
  dx: number;
  dy: number;
  /** An accent drawn over the body at (x, y) in grid pixels. */
  prop?: { w: number; h: number; px: Uint8Array; x: number; y: number };
}

export const MAX_TAKES = 64;
export const MAX_FRAMES = 8;
/** How many actions the library can hold.  Its own cap, separate from the
 *  per-state one: the built-in whale already ships 106 actions, so a per-state
 *  cap could never bound the library. */
export const MAX_LIBRARY = 128;
export const MIN_FRAME_MS = 50;
export const MAX_FRAME_MS = 5000;
export const DEFAULT_FRAME_MS = 400;

// ── the pixel format ──
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

/** Parse one frame's rows (and accent) into a flat sprite.  A v9 `Cell` is a
 *  legal argument too (it has no offsets of its own, so they come out 0 — the
 *  resolved frame carries them). */
export function parseFrame(frame: Frame | Cell): Sprite {
  const { w, h, px } = parseRows(frame.rows);
  const f = frame as Frame;
  const sprite: Sprite = { w, h, px, dx: f.dx || 0, dy: f.dy || 0 };
  if (frame.prop) {
    const p = parseRows(frame.prop.rows);
    sprite.prop = { w: p.w, h: p.h, px: p.px, x: frame.prop.x, y: frame.prop.y };
  }
  return sprite;
}

/** `parseFrame`, memoized by the FRAME (or v9 CELL) object.
 *
 *  A frame is immutable and its rows are shared by reference through every
 *  copy-on-write edit, so the same frame object always parses to the same
 *  sprite — and keeping that identity is worth more than the parse: the
 *  renderer's bitmap cache is keyed by the sprite, so an untouched frame keeps
 *  its pre-rendered bitmap across a stroke, a skin switch and a re-resolve.
 *  Without it every write rebuilt every bitmap on screen. */
const SPRITES = new WeakMap<object, Sprite>();

export function spriteFor(frame: Frame | Cell): Sprite {
  const hit = SPRITES.get(frame as object);
  if (hit) return hit;
  const sprite = parseFrame(frame);
  SPRITES.set(frame as object, sprite);
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
 *  a smaller crop, and the body fallback.  Offsets are the caller's business. */
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

/** Integer-upscale one FACE (its rows and its accent) by the avatar→body
 *  factor: the 128 draft the studio materialises, and the fallback the popup
 *  draws when an action has no body artwork of its own. */
export function upscaleCell(cell: Cell): Cell {
  const out: Cell = { rows: upscalePixels(cell.rows, BODY_FALLBACK_SCALE) };
  if (cell.prop) {
    out.prop = {
      x: cell.prop.x * BODY_FALLBACK_SCALE,
      y: cell.prop.y * BODY_FALLBACK_SCALE,
      rows: upscalePixels(cell.prop.rows, BODY_FALLBACK_SCALE),
    };
  }
  return out;
}

/** The face to SHOW for a frame at one grid: the authored cell when the action
 *  carries it, else the avatar at 4× (exactly what the renderer falls back to).
 *  Memoized per (frame, grid) object pair, so a thumbnail's props stay
 *  identical across renders and its canvas is not re-parsed. */
const DERIVED_CELLS = new WeakMap<object, Map<number, Cell>>();

export function cellFor(frame: ActionFrame, grid: number): Cell {
  const cell = frame.cells[grid];
  if (cell) return cell;
  const avatar = frame.cells[AVATAR_GRID];
  if (grid !== BODY_GRID || !avatar) return avatar || { rows: blanks(grid) };
  let byGrid = DERIVED_CELLS.get(frame as object);
  if (!byGrid) {
    byGrid = new Map();
    DERIVED_CELLS.set(frame as object, byGrid);
  }
  let hit = byGrid.get(grid);
  if (!hit) {
    hit = upscaleCell(avatar);
    byGrid.set(grid, hit);
  }
  return hit;
}

/** One empty grid's rows (no import from paint.ts: that module imports this
 *  one, and the v8 door needs a blank avatar for a body-only action). */
function blanks(grid: number): string[] {
  return Array.from({ length: grid }, () => TRANSPARENT.repeat(grid));
}

// ── the library: identity, dedupe, and the doors from the older shapes ──
//
// Two things make the library work, and neither belongs in the store: an id
// that survives editing (states hold ids, so deleting an action can never
// shift what another state points at — the old index-based model did exactly
// that), and a CONTENT KEY, which is how the same action authored twice
// collapses into one shared entry.

/** A stable, readable id that is free in this library.  `base` keeps a
 *  built-in's provenance legible ('chi-niangao'); anything invalid or already
 *  taken falls back to `t<n>`, so ids stay unique. */
export function freeTakeId(library: readonly { id: string }[], base?: string): string {
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

/** One v8 take's identity by CONTENT: two takes with the same key draw
 *  identically, so a migration may safely share one entry.
 *
 *  The key is memoized per take OBJECT (a WeakMap, not a string table): every
 *  mutator builds a fresh take object, so a cached key can never describe
 *  edited pixels, while a scan of an unchanged library pays for each entry
 *  exactly once. */
const KEY_CACHE = new WeakMap<object, string>();

export function takeKey(take: Take): string {
  const hit = KEY_CACHE.get(take as object);
  if (hit !== undefined) return hit;
  let key = String(take.frameMs);
  for (const f of take.frames) {
    key += '\u0001' + f.rows.join('\u0002')
      + '\u0003' + (f.dx || 0) + ',' + (f.dy || 0) + ',' + (f.ms ?? '');
    if (f.prop) key += '\u0004' + f.prop.x + ',' + f.prop.y + ',' + f.prop.rows.join('\u0002');
  }
  KEY_CACHE.set(take as object, key);
  return key;
}

/** One ACTION's identity by CONTENT — both faces, the shared settings and the
 *  name/provenance, so an import that changes any of them is not mistaken for
 *  an identical action.  Memoized per action object, like `takeKey`. */
export function actionKey(action: Action): string {
  const hit = KEY_CACHE.get(action as object);
  if (hit !== undefined) return hit;
  let key = String(action.frameMs) + '\u0005' + (action.name ?? '') + '\u0006' + (action.origin ?? '');
  for (const f of action.frames) {
    key += '\u0001' + (f.ms ?? '') + '\u0003' + (f.dx || 0) + ',' + (f.dy || 0);
    for (const grid of [AVATAR_GRID, BODY_GRID]) {
      const cell = f.cells[grid];
      if (!cell) continue;
      key += '\u0007' + grid + '\u0002' + cell.rows.join('\u0002');
      if (cell.prop) key += '\u0004' + cell.prop.x + ',' + cell.prop.y + ',' + cell.prop.rows.join('\u0002');
    }
  }
  KEY_CACHE.set(action as object, key);
  return key;
}

/** Add one ACTION to the library, deduping by content: an identical action
 *  already in the library is SHARED instead of stored twice.  Returns the
 *  (possibly unchanged) library plus the id to reference.
 *
 * The id comes from `meta.id` first, then from the action's own id (an imported
 * or migrated action carries the reference states hold), and is made unique by
 * `freeTakeId` — a colliding id is suffixed, never overwritten.
 *
 * `meta.unique` opts OUT of the content dedupe.  新建动作 needs it: an identical
 * blank is already in the library, and silently sharing it would make the
 * button look broken the second time it is pressed.  Merging — a migration —
 * wants the dedupe. */
export function addToLibrary(
  library: Action[],
  action: Action,
  meta?: { id?: string; name?: string; origin?: string; unique?: boolean },
): { actions: Action[]; id: string } {
  const key = actionKey(action);
  const hit = meta?.unique ? undefined : library.find((t) => actionKey(t) === key);
  if (hit) return { actions: library, id: hit.id };
  const wanted = meta?.id || action.id;
  const id = wanted ? freeTakeId(library, wanted) : freeTakeId(library);
  const entry: Action = { id, frameMs: action.frameMs, frames: action.frames };
  const name = meta?.name ?? action.name;
  const origin = meta?.origin ?? action.origin;
  if (name) entry.name = name;
  if (origin) entry.origin = origin;
  return { actions: library.concat([entry]), id };
}

/** Does this action carry any body artwork?  The body is a SKIN-level switch
 *  in practice (the editor materialises it for a whole action at a time), and
 *  a body-less action falls back to its avatar at 4×. */
export function hasActionBody(action: Action): boolean {
  return action.frames.some((f) => !!f.cells[BODY_GRID]);
}

/** Does this artwork carry a full-body face anywhere?  A skin without one
 *  resolves its popup from the avatar grid drawn at 4× (the cheap path), a skin
 *  with one resolves the 128 grid. */
export function hasBody(art: Artwork): boolean {
  return art.actions.some(hasActionBody);
}

/** The scale `dx`/`dy` is rendered at on one grid: offsets are authored in
 *  avatar units, so the body face moves `× 4` — the same hop on screen, and
 *  exactly the headroom `GRIDS[128]` reserves. */
export function offsetScale(grid: number): number {
  return grid === BODY_GRID ? BODY_FALLBACK_SCALE : 1;
}

// ── the doors ──

/** v7 → v8: convert a state-owned artwork into the per-crop library model.
 *
 * Deterministic and lossless: states are visited in their authored order, and
 * each take goes in through a content-deduping add, so a take copied across
 * three states becomes ONE shared entry referenced three times — the document
 * shrinks and the copies can no longer drift.  Frames and row strings are
 * shared by reference, never copied. */
export function libraryFromLegacy(legacy: LegacyArtwork): LibraryArtwork {
  const grids: LibraryArtwork['grids'] = {};
  for (const key of Object.keys(legacy.grids)) {
    const grid = Number(key);
    const g = legacy.grids[grid];
    if (!g || !g.states) continue;
    let library: LibraryTake[] = [];
    const states: Record<string, string[]> = {};
    for (const state of Object.keys(g.states)) {
      const ids: string[] = [];
      for (const take of g.states[state] || []) {
        const key2 = takeKey(take);
        const hit = library.find((t) => takeKey(t) === key2);
        if (hit) {
          ids.push(hit.id);
          continue;
        }
        const id = freeTakeId(library);
        library = library.concat([{ ...take, id }]);
        ids.push(id);
      }
      states[state] = ids;
    }
    grids[grid] = { library, states };
  }
  return { palette: legacy.palette, grids };
}

/** One v8 take + its body counterpart → one paired action.  `av` is the
 *  authority for every shared setting; `body` only contributes the 128 face. */
function pairAction(av: LibraryTake | undefined, body: LibraryTake | undefined): Action {
  const src = av || body!;
  const count = Math.max(av?.frames.length || 0, body?.frames.length || 0);
  const frames: ActionFrame[] = [];
  for (let i = 0; i < count; i++) {
    const fa = av?.frames[i];
    const fb = body?.frames[i];
    const face = (f: Frame | undefined): Cell | undefined =>
      f ? (f.prop ? { rows: f.rows, prop: f.prop } : { rows: f.rows }) : undefined;
    const frame: ActionFrame = {
      // The avatar face is REQUIRED by validation: a body-only action keeps its
      // pixels (nothing is dropped) behind a blank avatar the user can draw on.
      cells: { 32: face(fa) || { rows: blanks(AVATAR_GRID) } },
    };
    const from = fa || fb!;
    if (from.ms !== undefined) frame.ms = from.ms;
    const dx = fa ? fa.dx : fb?.dx;
    const dy = fa ? fa.dy : fb?.dy;
    if (dx) frame.dx = fa ? dx : Math.round(dx / BODY_FALLBACK_SCALE);
    if (dy) frame.dy = fa ? dy : Math.round(dy / BODY_FALLBACK_SCALE);
    const bodyCell = face(fb);
    if (bodyCell) frame.cells[BODY_GRID] = bodyCell;
    frames.push(frame);
  }
  const action: Action = { id: src.id, frameMs: src.frameMs, frames };
  if (src.name) action.name = src.name;
  if (src.origin) action.origin = src.origin;
  return action;
}

/** v8 → v9: fold a crop's two libraries into one paired library, and the two
 *  state assignments into one.
 *
 * The AVATAR crop is the authority: its action order, its `frameMs`/`ms`/
 * offsets/name, and its state assignment.  The body crop contributes the 128
 * face of every action id it shares, and any action only the body carries is
 * KEPT (unplayed, with a blank avatar) rather than dropped — a migration may
 * lose an assignment, never artwork. */
export function pairArtwork(v8: LibraryArtwork): Artwork {
  const av = v8.grids[AVATAR_GRID];
  const body = v8.grids[BODY_GRID];
  const bodyById = new Map((body?.library || []).map((t) => [t.id, t]));
  const actions: Action[] = [];
  for (const t of av?.library || []) {
    actions.push(pairAction(t, bodyById.get(t.id)));
    bodyById.delete(t.id);
  }
  for (const t of bodyById.values()) actions.push(pairAction(undefined, t));

  const have = new Set(actions.map((a) => a.id));
  const states: Record<string, string[]> = {};
  for (const state of Object.keys(av?.states || {})) {
    const ids = (av!.states[state] || []).filter((id, i, all) => have.has(id) && all.indexOf(id) === i);
    if (ids.length) states[state] = ids;
  }
  // The document is only renderable with an idle animation; a v8 document
  // already had one on the avatar crop, but a hand-built one may not.
  if (!states.idle || !states.idle.length) {
    if (actions.length) states.idle = [actions[0].id];
  }
  return { palette: v8.palette, actions, states };
}

export function looksV9(d: unknown): boolean {
  const a = d as Artwork | null;
  return !!a && typeof a === 'object' && Array.isArray(a.actions);
}

/** Does this look like the v8 shape (a per-crop `library`)? */
export function looksV8(d: unknown): boolean {
  const a = d as LibraryArtwork | null;
  if (!a || typeof a !== 'object' || !a.grids || typeof a.grids !== 'object') return false;
  return Object.keys(a.grids).some((key) => {
    const g = a.grids[Number(key)] as GridArtwork | undefined;
    return !!g && typeof g === 'object' && Array.isArray(g.library);
  });
}

/** Does this look like the pre-v8 shape (a state owning take OBJECTS)? */
export function looksV7(d: unknown): boolean {
  const a = d as LegacyArtwork | null;
  if (!a || typeof a !== 'object' || !a.grids || typeof a.grids !== 'object') return false;
  for (const key of Object.keys(a.grids)) {
    const g = a.grids[Number(key)] as { states?: LegacyStateTakes } | undefined;
    if (!g || typeof g !== 'object' || !g.states || typeof g.states !== 'object') continue;
    for (const state of Object.keys(g.states)) {
      const list = g.states[state];
      if (!Array.isArray(list)) continue;
      if (!list.length) return true;
      const first = list[0] as Take;
      if (first && typeof first === 'object' && Array.isArray(first.frames)) return true;
    }
  }
  return false;
}

/** THE upgrade door: any older shape → a v9 `Artwork`, or null when the input
 *  cannot be understood.  A v9 document is passed straight through (the caller
 *  validates it); a v8 one is paired; a v7 one goes through the library door
 *  first.  Used by the storage migration, the import path and the built-in
 *  chunk alike, so there is exactly one place where the shapes meet.
 *
 *  Memoized by the input OBJECT: the chunk is installed once, but a stored
 *  document is re-read through this door on every `loadStored` revision, and a
 *  resolution cache is keyed by artwork identity — so the same input must give
 *  back the same artwork rather than a fresh equal one. */
const UPGRADED = new WeakMap<object, Artwork | null>();

export function upgradeArtwork(input: unknown): Artwork | null {
  if (!input || typeof input !== 'object') return null;
  const key = input as object;
  if (UPGRADED.has(key)) return UPGRADED.get(key)!;
  let out: Artwork | null;
  if (looksV9(input)) out = input as Artwork;
  else if (looksV8(input)) out = pairArtwork(input as LibraryArtwork);
  else if (looksV7(input)) out = pairArtwork(libraryFromLegacy(input as LegacyArtwork));
  else out = null;
  UPGRADED.set(key, out);
  return out;
}
