// Resolution: an `Artwork` document → render-ready data.
//
// This is the hot end of the wardrobe.  A canvas asks for a skin every frame and
// the Workshop asks for eleven states plus up to 106 actions, so nothing here
// does work twice for artwork that did not change:
//
//   * `resolveSkin`/`resolveActionSkin` are memoized by (ARTWORK OBJECT, name,
//     face).  Artwork is immutable, so an unchanged document gives back the very
//     same `ResolvedSkin` — the same state table, the same `Sprite` objects, and
//     therefore the same pre-rendered bitmaps in the renderer's cache.
//   * the per-state bodies stay LAZY (a canvas plays one state), and two states
//     that play the same actions SHARE one object by identity — the memo key is
//     the selection, not the state name.  An unassigned state IS the idle
//     resolution.
//   * a face is parsed through `spriteFor`, memoized per drawing object, and the
//     4× body fallback per (frame, face), so re-resolving one face re-uses every
//     other sprite.
//
// Pure: no storage, no registry, no events.  `session.ts` is what makes it live.

import { STATE_NAMES } from '../behavior/vocabulary.ts';
import type { StateName } from '../behavior/vocabulary.ts';
import { AVATAR_FACE, FACES } from './geometry.ts';
import type { FaceName } from './geometry.ts';
import { DEFAULT_FRAME_MS } from './model.ts';
import type { Action, Artwork, Sprite } from './model.ts';
import { faceFor, offsetScale, usableFace } from './face.ts';
import { actionById } from './library.ts';
import { blankRows, spriteFor } from './pixels.ts';

/** One frame, parsed and render-ready: its sprite plus the whole-frame offset
 *  ALREADY scaled for this face (the renderer draws at `padX + dx`). */
export interface ResolvedFrame {
  ms: number;
  sprite: Sprite;
  dx: number;
  dy: number;
}

/** One action's whole loop, ready to play. */
export interface ResolvedAnimation {
  /** The action this was resolved from — what the surface reports to its owner
   *  so the dock can pick a speech line for the tone she is currently in.
   *  Optional: a hand-built animation in a test carries no id. */
  id?: string;
  frames: ResolvedFrame[];
}

/** One state's animations: what the player may roll between. */
export interface ResolvedState {
  animations: ResolvedAnimation[];
}

/** Render-ready skin data for one face of one skin. */
export interface ResolvedSkin {
  name: string;
  palette: string[];
  /** Every state name, pre-filled from idle where the artwork is silent. */
  states: Record<StateName, ResolvedState>;
  /** The face this was actually resolved on — a body request falls back to the
   *  avatar when the artwork carries no body. */
  face: FaceName;
  canvasW: number;
  canvasH: number;
  baseY: number;
}

function animationOf(action: Action, face: FaceName): ResolvedAnimation {
  const scale = offsetScale(face);
  return {
    id: action.id,
    frames: action.frames.map((frame) => ({
      ms: frame.ms ?? action.frameMs,
      sprite: spriteFor(faceFor(frame, face)),
      dx: (frame.dx || 0) * scale,
      dy: (frame.dy || 0) * scale,
    })),
  };
}

/** The animation a state plays when the artwork names nothing (and what the pen
 *  shows before the chunk lands): one still, empty frame.  Module-level so its
 *  sprite is parsed once. */
const BLANK_ACTION: Action = {
  id: '\u0000blank',
  name: '',
  frameMs: DEFAULT_FRAME_MS,
  frames: [{ art: { avatar: { rows: blankRows(FACES.avatar.size) } } }],
};

function stateAnimations(art: Artwork, face: FaceName): Record<StateName, ResolvedState> {
  const byId = new Map(art.actions.map((action) => [action.id, action]));
  const selection = (name: string): { actions: Action[]; key: string } | null => {
    const ids = art.states[name as StateName];
    if (!Array.isArray(ids) || !ids.length) return null;
    const actions: Action[] = [];
    for (const id of ids) {
      const action = byId.get(id);
      if (action) actions.push(action);
    }
    return actions.length ? { actions, key: ids.join('\u0000') } : null;
  };
  const own = selection('idle');
  const idleSource = own ? own.actions : [BLANK_ACTION];
  const memo = new Map<string, ResolvedState>();
  const resolve = (actions: Action[]): ResolvedState => ({
    animations: actions.map((action) => animationOf(action, face)),
  });
  const lazily = (actions: Action[], key: string) => (): ResolvedState => {
    let hit = memo.get(key);
    if (!hit) {
      hit = resolve(actions);
      memo.set(key, hit);
    }
    return hit;
  };
  // The key is the SELECTION, not the state name: two states that play the same
  // actions — including one that names exactly what idle names — share one
  // resolved object, which is what the renderer caches on.
  const idle = lazily(idleSource, own ? own.key : '\u0000blank');
  const out = {} as Record<StateName, ResolvedState>;
  for (const name of STATE_NAMES) {
    const hit = selection(name);
    Object.defineProperty(out, name, {
      enumerable: true,
      configurable: true,
      get: hit ? lazily(hit.actions, hit.key) : idle,
    });
  }
  return out;
}

function buildSkin(name: string, art: Artwork, face: FaceName): ResolvedSkin | null {
  // Only a document with pixels and a playable idle can be rendered at all.
  if (!art.actions.length) return null;
  if (!Array.isArray(art.states.idle) || !art.states.idle.length) return null;
  const spec = FACES[face];
  return {
    name,
    palette: art.palette.slice(),
    states: stateAnimations(art, face),
    face,
    canvasW: spec.canvasW,
    canvasH: spec.canvasH,
    baseY: spec.baseY,
  };
}

/** Resolution memo, keyed by the artwork OBJECT and then by (name, face).  Two
 *  entries can never describe the same artwork, and an entry can never outlive
 *  the document it was built from. */
const RESOLVED = new WeakMap<Artwork, Map<string, ResolvedSkin | null>>();

function memoFor(art: Artwork): Map<string, ResolvedSkin | null> {
  let byKey = RESOLVED.get(art);
  if (!byKey) {
    byKey = new Map();
    RESOLVED.set(art, byKey);
  }
  return byKey;
}

function memoized(art: Artwork, key: string, build: () => ResolvedSkin | null): ResolvedSkin | null {
  const byKey = memoFor(art);
  const hit = byKey.get(key);
  if (hit !== undefined || byKey.has(key)) return hit!;
  const value = build();
  byKey.set(key, value);
  return value;
}

/** Resolve a whole document at one face.  A face the artwork cannot serve
 *  resolves on the avatar — never on another skin. */
export function resolveSkin(art: Artwork, name: string, face: FaceName): ResolvedSkin | null {
  const use = usableFace(art, face);
  return memoized(art, name + '|' + use, () => buildSkin(name, art, use));
}

/** Resolve ONE library action as a whole skin, so a preview can play any action
 *  — including one no state plays yet, which is exactly the action a user is
 *  deciding about.  Every state maps to that single action, so the preview is
 *  pinned whatever state name it is handed; null when the action is gone. */
export function resolveActionSkin(
  art: Artwork,
  name: string,
  face: FaceName,
  actionId: string,
): ResolvedSkin | null {
  const use = usableFace(art, face);
  return memoized(art, 'action|' + name + '|' + use + '|' + actionId, () => {
    const action = actionById(art, actionId);
    if (!action) return null;
    const spec = FACES[use];
    const state: ResolvedState = { animations: [animationOf(action, use)] };
    const states = {} as Record<StateName, ResolvedState>;
    for (const stateName of STATE_NAMES) {
      Object.defineProperty(states, stateName, {
        enumerable: true,
        configurable: true,
        get: () => state,
      });
    }
    return {
      name,
      palette: art.palette.slice(),
      states,
      face: use,
      canvasW: spec.canvasW,
      canvasH: spec.canvasH,
      baseY: spec.baseY,
    };
  });
}

/** A skin with no pixels at all: valid, renderable, and blank.  What the dock
 *  draws before the artwork chunk has landed, and what a name we cannot resolve
 *  falls back to, so a canvas draws instead of crashing. */
const BLANKS = new Map<string, ResolvedSkin>();
const EMPTY_ARTWORK: Artwork = { palette: ['transparent'], actions: [], states: {} };

export function blankSkin(name: string, face: FaceName = AVATAR_FACE): ResolvedSkin {
  const key = name + '|' + face;
  let hit = BLANKS.get(key);
  if (hit) return hit;
  const spec = FACES[face];
  hit = {
    name,
    palette: ['transparent'],
    states: stateAnimations(EMPTY_ARTWORK, face),
    face,
    canvasW: spec.canvasW,
    canvasH: spec.canvasH,
    baseY: spec.baseY,
  };
  BLANKS.set(key, hit);
  return hit;
}
