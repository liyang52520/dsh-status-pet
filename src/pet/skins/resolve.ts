// Resolution: an `Artwork` document → render-ready data, plus the module-level
// ACTIVE skin and the change broadcast.
//
// This is the hot end of the wardrobe.  A canvas asks for a skin every frame,
// the Workshop asks for eleven states plus up to 106 actions, and the store
// re-resolves on every write — so nothing here may do work twice for artwork
// that did not change:
//
//   * `resolveArtwork` is memoized by (ARTWORK OBJECT, name, grid).  Artwork is
//     immutable, so an unchanged document gives back the very same
//     `ResolvedSkin` — the same state table, the same `Sprite` objects, and
//     therefore the same pre-rendered bitmaps in the renderer's cache.
//   * the per-state bodies stay LAZY (a canvas plays one state; the gallery
//     resolves one action each), and two states that play the same set share
//     one object by identity.
//   * frames are parsed through `spriteFor`, memoized per Frame object, so a
//     stroke re-parses the frame it painted and re-uses every other sprite.
//
// The old code could not do any of this: it cleared ALL caches on every write
// and re-validated the whole document per resolution.  Opening 预览 · 按动作
// cost ~876 ms and a single painted pixel ~95 ms.  Identity is the invalidation
// key now — a document that changed is a different object.

import { STATE_NAMES } from '../behavior.ts';
import { AVATAR_GRID, BODY_GRID, GRIDS } from '../grids.ts';
import { BUILTIN_NAMES, DEFAULT_SKIN, builtinArtwork, installArtwork } from './built-ins.ts';
import { DEFAULT_FRAME_MS, spriteFor } from './compose.ts';
import type { Artwork, LibraryTake, Sprite, Take } from './compose.ts';
import { artworkDoc, artworkOverrides, withOverrides } from './documents.ts';
import { artworkIsValid } from './validate.ts';
import { blankRows } from './paint.ts';
import { loadStored, onStoreWrite, SKIN_EVENT, STORE_KEY } from './storage.ts';
import type { StoredData } from './storage.ts';

/** One state's frames, parsed and render-ready: each frame carries its sprite
 *  and its effective duration (frame.ms ?? take.frameMs). */
export interface ResolvedState {
  takes: { frameMs: number; frames: { ms: number; sprite: Sprite }[] }[];
}

/** Render-ready skin data for one grid of one skin. */
export interface ResolvedSkin {
  name: string;
  palette: string[];
  /** state name → takes (missing states pre-filled from idle) */
  states: Record<string, ResolvedState>;
  grid: number;
  canvasW: number;
  canvasH: number;
  baseY: number;
}

// ── one grid's states ──
//
// States resolve LAZILY.  A skin carries artwork for all eleven states, but a
// canvas plays exactly one of them — the settings gallery resolves nine skins
// to draw nine different states, and the editor re-resolves on every stroke.
// Parsing all eleven eagerly was most of that cost; the getter below parses a
// state on first access and memoizes it, while an unassigned state still shares
// the idle resolution BY IDENTITY (`states.x === states.idle`), which the suite
// asserts and the renderer relies on.
//
// The library turns a state's list of IDS into its takes, so two states that
// play the same set share one resolution by identity as well — the reference is
// the same, the resolved animation is the same object.
function resolveStateTakes(
  library: LibraryTake[],
  states: Record<string, string[]>,
  grid: number,
): Record<string, ResolvedState> {
  const byId = new Map(library.map((t) => [t.id, t]));
  const selection = (name: string): { list: Take[]; key: string } | null => {
    const ids = states[name];
    if (!Array.isArray(ids) || !ids.length) return null;
    const list: Take[] = [];
    for (const id of ids) {
      const take = byId.get(id);
      if (take) list.push(take);
    }
    return list.length ? { list, key: ids.join('\u0000') } : null;
  };
  const own = selection('idle');
  const idleSource: Take[] = own ? own.list
    : [{ frameMs: DEFAULT_FRAME_MS, frames: [{ rows: blankRows(grid) }] }];
  const resolve = (list: Take[]): ResolvedState => ({
    takes: list.map((t) => ({
      frameMs: t.frameMs,
      frames: t.frames.map((f) => ({ ms: f.ms ?? t.frameMs, sprite: spriteFor(f) })),
    })),
  });
  const memo = new Map<string, ResolvedState>();
  const lazily = (list: Take[], key: string) => (): ResolvedState => {
    let hit = memo.get(key);
    if (!hit) {
      hit = resolve(list);
      memo.set(key, hit);
    }
    return hit;
  };
  // The key is the SELECTION, not the state name: two states that play the
  // same actions — including a state that names exactly what idle names —
  // share one resolved object, which is what the renderer caches on.
  const getIdle = lazily(idleSource, own ? own.key : '\u0000blank');
  const out: Record<string, ResolvedState> = {};
  for (const name of STATE_NAMES) {
    const hit = selection(name);
    Object.defineProperty(out, name, {
      enumerable: true,
      configurable: true,
      get: hit ? lazily(hit.list, hit.key) : getIdle,
    });
  }
  return out;
}

// ── one skin ──

/** Resolution memo, keyed by the artwork OBJECT and then by (name, grid).
 *  Two entries can never describe the same artwork, and an entry can never
 *  outlive the document it was built from. */
const RESOLVED = new WeakMap<Artwork, Map<string, ResolvedSkin | null>>();

/** One resolver for every skin: a built-in and 我的创作 are the same `Artwork`
 *  shape, so there is exactly one code path from artwork to render-ready data.
 *  A skin without the requested crop falls back to ITS OWN other crop — never
 *  to another skin's artwork. */
function resolveArtwork(name: string, art: Artwork, grid: number): ResolvedSkin | null {
  let byKey = RESOLVED.get(art);
  if (!byKey) {
    byKey = new Map();
    RESOLVED.set(art, byKey);
  }
  const key = name + '|' + grid;
  const hit = byKey.get(key);
  if (hit !== undefined || byKey.has(key)) return hit!;
  const value = computeResolve(name, art, grid);
  byKey.set(key, value);
  return value;
}

function computeResolve(name: string, art: Artwork, grid: number): ResolvedSkin | null {
  const g = art.grids[grid];
  if (!g || !Array.isArray(g.library) || !g.library.length) return null;
  if (!Array.isArray(g.states?.idle) || !g.states.idle.length) return null;
  const spec = GRIDS[grid];
  return {
    name,
    palette: art.palette.slice(),
    states: resolveStateTakes(g.library, g.states, grid),
    grid,
    canvasW: spec.canvasW,
    canvasH: spec.canvasH,
    baseY: spec.baseY,
  };
}

/** What the pet draws before the artwork chunk has landed (and when a stored
 *  selection names a skin we do not have): a valid but empty 32px skin, so the
 *  dock renders a blank canvas for those few milliseconds instead of crashing. */
const EMPTY_SKINS = new Map<string, ResolvedSkin>();

function emptySkin(name: string): ResolvedSkin {
  const hit = EMPTY_SKINS.get(name);
  if (hit) return hit;
  const spec = GRIDS[AVATAR_GRID];
  const skin: ResolvedSkin = {
    name,
    palette: ['transparent'],
    states: resolveStateTakes([], {}, AVATAR_GRID),
    grid: AVATAR_GRID,
    canvasW: spec.canvasW,
    canvasH: spec.canvasH,
    baseY: spec.baseY,
  };
  EMPTY_SKINS.set(name, skin);
  return skin;
}

/** The default skin at `grid`, falling back to its own avatar crop and then to
 *  the empty skin. */
function resolveDefault(grid: number): ResolvedSkin {
  const art = artworkDoc(DEFAULT_SKIN) || builtinArtwork(DEFAULT_SKIN);
  if (!art) return emptySkin(DEFAULT_SKIN);
  return resolveArtwork(DEFAULT_SKIN, art, grid)
    || resolveArtwork(DEFAULT_SKIN, art, AVATAR_GRID)
    || emptySkin(DEFAULT_SKIN);
}

function resolveFor(stored: StoredData, name: string, grid: number): ResolvedSkin {
  if (name === 'custom') {
    // The validity gate is the memoized one: a document that has been checked
    // is O(1) to re-check, and a document from storage is checked exactly once
    // (its first resolution).  An invalid one falls back — a corrupt store must
    // never blank the pet.
    if (stored.custom && artworkIsValid(stored.custom)) {
      const hit = resolveArtwork('custom', stored.custom, grid)
        || (grid === BODY_GRID ? resolveArtwork('custom', stored.custom, AVATAR_GRID) : null);
      if (hit) return hit;
    }
    return resolveDefault(grid);
  }
  const art = withOverrides(builtinArtwork(name), overrideFor(stored, name));
  if (art) {
    const hit = resolveArtwork(name, art, grid)
      || (grid === BODY_GRID ? resolveArtwork(name, art, AVATAR_GRID) : null);
    if (hit) return hit;
  }
  return name === DEFAULT_SKIN ? emptySkin(name) : resolveDefault(grid);
}

// The override sidecar is read through documents.ts, which owns its shape and
// its diff semantics.
function overrideFor(stored: StoredData, name: string): Record<string, Record<string, string[]>> | null {
  return artworkOverrides(stored, name);
}

function storedName(store: StoredData): string {
  const name = typeof store.skin === 'string' ? store.skin : DEFAULT_SKIN;
  if (name === 'custom') return 'custom';
  return BUILTIN_NAMES.includes(name) ? name : DEFAULT_SKIN;
}

/** The dock resolution: always the 32px avatar grid. */
export function resolveSkin(stored: unknown): ResolvedSkin {
  const store: StoredData = stored && typeof stored === 'object' ? (stored as StoredData) : {};
  return resolveFor(store, storedName(store), AVATAR_GRID);
}

/** The popup resolution: the 128px full body when the skin carries it,
 *  else the skin's own 32px avatar (drawn at 4× — integer upscale). */
export function resolveBestSkin(): ResolvedSkin {
  const stored = loadStored();
  return resolveFor(stored, storedName(stored), BODY_GRID);
}

/** Resolve a NAMED skin for the picker's cards and the studio preview,
 *  regardless of the active skin.  A built-in resolves its authored palette;
 *  `custom` resolves its own artwork palette.  `grid` picks the artwork crop
 *  (default: the 32px avatar; the 128px body exists only when the artwork
 *  carries it, else the avatar at 4x is used).  Returns null for 'custom'
 *  without artwork (a blank card, never a crash). */
export function resolveNamedSkin(name: string, grid: number = AVATAR_GRID): ResolvedSkin | null {
  const art = artworkDoc(name);
  if (!art) {
    if (name === 'custom' || !BUILTIN_NAMES.includes(name)) return null;
    return emptySkin(name);           // a built-in whose chunk has not landed yet
  }
  return resolveArtwork(name, art, grid)
    || (grid === BODY_GRID ? resolveArtwork(name, art, AVATAR_GRID) : null);
}

/** Resolve ONE library action as a whole skin, so the Workshop can play any
 *  action live — including one no state plays yet, which is exactly the action
 *  a user is deciding about.  Every state maps to that single action, so the
 *  preview is pinned whatever state name it is given.  Falls back to the other
 *  crop, like every other resolution.  Null when the action is gone. */
export function resolveTakeSkin(name: string, grid: number, takeId: string): ResolvedSkin | null {
  const art = artworkDoc(name);
  if (!art) return null;
  let byKey = RESOLVED.get(art);
  if (!byKey) {
    byKey = new Map();
    RESOLVED.set(art, byKey);
  }
  const key = 'take|' + name + '|' + grid + '|' + takeId;
  const hit = byKey.get(key);
  if (hit !== undefined || byKey.has(key)) return hit!;
  const value = computeTakeResolve(name, art, grid, takeId);
  byKey.set(key, value);
  return value;
}

function computeTakeResolve(name: string, art: Artwork, grid: number, takeId: string): ResolvedSkin | null {
  const use = art.grids[grid] ? grid : (grid === BODY_GRID ? AVATAR_GRID : 0);
  if (!use) return null;
  const g = art.grids[use]!;
  const take = g.library.find((t) => t.id === takeId);
  if (!take) return null;
  const spec = GRIDS[use];
  // A one-action skin: every state maps to the SAME resolved object, so the
  // preview is pinned whatever state name it is handed.  Building it directly
  // skips the library map that a full resolution needs — the gallery asks for
  // up to 106 of these, one per cell.
  const resolved: ResolvedState = {
    takes: [{
      frameMs: take.frameMs,
      frames: take.frames.map((f) => ({ ms: f.ms ?? take.frameMs, sprite: spriteFor(f) })),
    }],
  };
  const states: Record<string, ResolvedState> = {};
  for (const state of STATE_NAMES) {
    Object.defineProperty(states, state, {
      enumerable: true,
      configurable: true,
      get: () => resolved,
    });
  }
  return {
    name,
    palette: art.palette.slice(),
    states,
    grid: use,
    canvasW: spec.canvasW,
    canvasH: spec.canvasH,
    baseY: spec.baseY,
  };
}

// ── the module-level ACTIVE skin ──

let ACTIVE = resolveSkin(loadStored());

export function activeSkin(): ResolvedSkin {
  return ACTIVE;
}

/** Re-read the store and re-resolve ACTIVE.  Called automatically by the store
 *  after every write; exported for tests and for anyone holding a stale store.
 *
 *  It deliberately does NOT clear the resolution caches any more: they are
 *  keyed by artwork IDENTITY, so a write that changed the document resolves
 *  through a new object and a write that did not is served from the memo. */
export function refreshActiveSkin(): void {
  ACTIVE = resolveSkin(loadStored());
}

export function emitSkinChange(): void {
  try {
    if (typeof window !== 'undefined'
      && typeof window.dispatchEvent === 'function'
      && typeof window.CustomEvent === 'function') {
      window.dispatchEvent(new window.CustomEvent(SKIN_EVENT));
    }
  } catch {
    // best effort
  }
}

/** Install the built-in artwork chunk: swap the registry in, re-resolve ACTIVE
 *  and notify every subscriber, so the canvases pick the pixels up on their
 *  next frame.  Called once by main.ts when `client.artwork.js` lands. */
export function installSkinArtwork(art: Record<string, Artwork>): void {
  installArtwork(art);
  refreshActiveSkin();
  emitSkinChange();
}

// The store owns ACTIVE: re-resolve synchronously on every write, then notify
// subscribers.  Components whose canvas reads ACTIVE per frame need no
// subscription.  (Registered here rather than in storage.ts so that
// persistence stays a module that knows nothing about rendering.)
onStoreWrite(() => {
  refreshActiveSkin();
  emitSkinChange();
});

// Cross-tab sync: another tab's write lands here as a `storage` event —
// re-resolve ACTIVE and re-notify local subscribers.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', ((e: StorageEvent) => {
    if (!e || !e.key || e.key === STORE_KEY) {
      refreshActiveSkin();
      emitSkinChange();
    }
  }) as EventListener);
}

/** Subscribe to skin swaps (same tab: saveStored emits SKIN_EVENT; cross
 *  tab: the storage listener above re-emits it).  Returns the disposer. */
export function onSkinChange(fn: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {};
  }
  const listener = fn as EventListener;
  window.addEventListener(SKIN_EVENT, listener);
  return () => {
    window.removeEventListener(SKIN_EVENT, listener);
  };
}
