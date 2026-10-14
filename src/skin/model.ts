// The artwork model: one palette, one action library, one state assignment.
//
//   an ACTION is one animation the ARTWORK owns — never a state.  States
//   reference actions by `id`, so an action played by four states is still ONE
//   definition and the pixels are stored once.
//
//   a FRAME carries what both faces share (its `ms` override and the whole-frame
//   `dx`/`dy`, authored in avatar units) plus the pixels of each face.
//
//   `art.avatar` is REQUIRED — the dock's face is the one every action must
//   carry — while `art.body` is optional and falls back to the avatar at an
//   exact 4× (skin/face.ts).
//
// Types and limits only: no parsing, no resolution, no DOM.

import type { StateName } from '../behavior/vocabulary.ts';

/** A small accent drawn over a frame at (x, y) in sprite pixels — the prop a
 *  character carries (a rice cake, a heart). */
export interface Prop {
  x: number;
  y: number;
  rows: string[];
}

/** ONE face of one frame: a full square of two-character palette pixels, plus
 *  an optional accent. */
export interface Drawing {
  rows: string[];
  prop?: Prop;
}

/** The two faces of one frame.  `avatar` is required; `body` is derived at 4×
 *  when an action does not carry it. */
export interface FrameArt {
  avatar: Drawing;
  body?: Drawing;
}

/** One drawable frame of an action. */
export interface Frame {
  /** Overrides the action's `frameMs` for this frame alone. */
  ms?: number;
  /** Whole-frame offset, in AVATAR units (the body face renders `× 4`). */
  dx?: number;
  dy?: number;
  art: FrameArt;
}

/** One entry in the artwork's action library. */
export interface Action {
  /** Unique within the artwork; the reference a state holds. */
  id: string;
  /** The human label ('吃年糕'). */
  name: string;
  /** Provenance ('chi-niangao' — the source material this was baked from). */
  origin?: string;
  /** Default duration of one frame of this action, in ms. */
  frameMs: number;
  frames: Frame[];
}

/** Which actions each state plays, by id.  An absent (or empty) key means
 *  FOLLOW IDLE — never store `[]`.
 *
 *  A RENDERABLE document always carries `idle` (it is the anchor every other
 *  state falls back to; skin/overrides.ts and validate.ts both enforce it),
 *  while a mid-edit table may transiently drop it — which is exactly why the
 *  write path refuses to store a diff that would empty it. */
export type StateTable = Partial<Record<StateName, string[]>>;

/** A whole skin.  Authored data: the built-in catalog ships it, and a user's
 *  assignment diff may re-point the state table at other ids (skin/overrides.ts)
 *  — never at other pixels. */
export interface Artwork {
  palette: string[];
  actions: Action[];
  states: StateTable;
}

/** One face at one point in time, parsed: one palette index per pixel.  `dx`/
 *  `dy` come from the source when it has any — a v9 frame keeps its offset on
 *  the RESOLVED frame, so a `Drawing` parses to 0. */
export interface Sprite {
  w: number;
  h: number;
  px: Uint8Array;
  dx: number;
  dy: number;
  prop?: { w: number; h: number; px: Uint8Array; x: number; y: number };
}

/** Anything the rasterizer can parse: a `Drawing`, or a `Frame` (the same plus
 *  offsets of its own). */
export interface PixelSource {
  rows: string[];
  dx?: number;
  dy?: number;
  prop?: Prop;
}

/** How many actions an artwork's library may hold. */
export const MAX_ACTIONS = 128;
/** The most action ids one state may play. */
export const MAX_SELECTION = 64;
/** How many frames one action may hold. */
export const MAX_FRAMES = 8;

export const MIN_FRAME_MS = 50;
export const MAX_FRAME_MS = 5_000;
export const DEFAULT_FRAME_MS = 400;
