// The frame-animation model, shared by every skin.
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
// ── the one door ──
//
// The baked built-in chunk (`artwork.gen.ts`, 15.9 MB of FROZEN data) is still
// in the v8 shape (one library per crop) on purpose: it is hand-maintained and
// its per-action provenance comments are the catalogue of what shipped, so the
// chunk goes through `upgradeArtwork` at install time (a pass over 106 objects
// that SHARES every row string by reference) instead of being rewritten by a
// codemod.  `pairArtwork` folds the two crops' libraries into the one paired
// library, and the avatar crop is the authority for every shared setting.
//
// That is the ONLY shape transition left: nothing else can enter the system.
// Artwork is authored (the chunk) or derived from authored data (the state
// assignment diff, which is a list of ids and no pixels at all), so there is no
// import path, no stored document and no legacy shape to migrate.

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
 *  the same action — the pixels are stored once.
 *
 *   id      unique within the artwork (the reference states hold)
 *   name    a human label ('吃年糕'); built-ins get it from the map's gloss
 *   origin  provenance ('chi-niangao' — the source gif)
 */
export interface Action {
  id: string;
  name?: string;
  origin?: string;
  frameMs: number;
  frames: ActionFrame[];
}

/** A whole skin: a palette, ONE action library and the ids each state plays.
 *  This is authored data — the built-in chunk is the only thing that produces
 *  one, and `withOverrides` may re-point the state table at other ids. */
export interface Artwork {
  palette: string[];
  actions: Action[];
  /** absent state key (or an empty list) = FOLLOW IDLE; a state is never
   *  stored as `[]`. */
  states: Record<string, string[]>;
}

// ── the v8 shape (the baked chunk, nothing else) ──

/** One animation variant: a frame sequence with its own pace (the pre-v9
 *  frame shape, still the unit the v8 chunk is baked in). */
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

/** Anything `upgradeArtwork` can be handed: the baked v8 chunk, or a document
 *  that is already v9. */
export type AnyArtwork = Artwork | LibraryArtwork;

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

/** The most action ids one state may play. */
export const MAX_TAKES = 64;
export const MAX_FRAMES = 8;
/** How many actions an artwork's library may hold (the built-in whale ships
 *  106). */
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
 *  A frame is immutable and shared by reference, so the same frame object
 *  always parses to the same sprite — and keeping that identity is worth more
 *  than the parse: the renderer's bitmap cache is keyed by the sprite, so an
 *  untouched frame keeps its pre-rendered bitmap across a skin switch and a
 *  re-resolve. */
const SPRITES = new WeakMap<object, Sprite>();

export function spriteFor(frame: Frame | Cell): Sprite {
  const hit = SPRITES.get(frame as object);
  if (hit) return hit;
  const sprite = parseFrame(frame);
  SPRITES.set(frame as object, sprite);
  return sprite;
}

/** Serialize a sprite back into frame rows (the inverse of parseFrame).  Used
 *  by the suite to assert that a parsed face describes the authored rows. */
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

/** Integer-upscale PIXEL rows (two chars per pixel) — the body fallback. */
function upscalePixels(rows: string[], scale: number): string[] {
  const out: string[] = [];
  for (const row of rows) {
    let wide = '';
    for (let x = 0; x < rowPixels(row); x++) wide += pixelAt(row, x).repeat(scale);
    for (let i = 0; i < scale; i++) out.push(wide);
  }
  return out;
}

/** Integer-upscale one FACE (its rows and its accent) by the avatar→body
 *  factor: the fallback the popup draws when an action has no body artwork of
 *  its own. */
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

/** One empty grid's rows (the v8 door needs a blank avatar for a body-only
 *  action, and `cellFor` needs one for a grid it cannot serve). */
function blanks(grid: number): string[] {
  return Array.from({ length: grid }, () => TRANSPARENT.repeat(grid));
}

/** Does this action carry any body artwork?  A body-less action falls back to
 *  its avatar at 4×. */
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

// ── the v8 → v9 door ──

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
      // pixels (nothing is dropped) behind a blank avatar face.
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
 * KEPT (unplayed, with a blank avatar) rather than dropped — the pairing may
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

/** THE door: a v8 document → a v9 `Artwork`, or null when the input cannot be
 *  understood.  A v9 document is passed straight through.  The built-in chunk
 *  is the only caller.
 *
 *  Memoized by the input OBJECT: a resolution cache is keyed by artwork
 *  identity — so the same input must give back the same artwork rather than a
 *  fresh equal one. */
const UPGRADED = new WeakMap<object, Artwork | null>();

export function upgradeArtwork(input: unknown): Artwork | null {
  if (!input || typeof input !== 'object') return null;
  const key = input as object;
  if (UPGRADED.has(key)) return UPGRADED.get(key)!;
  let out: Artwork | null;
  if (looksV9(input)) out = input as Artwork;
  else if (looksV8(input)) out = pairArtwork(input as LibraryArtwork);
  else out = null;
  UPGRADED.set(key, out);
  return out;
}
