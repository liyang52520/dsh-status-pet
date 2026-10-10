// The action library: reference maintenance, and the read-outs the Workshop
// renders.
//
// Everything here is PURE and answers the two questions the library model
// creates: WHO plays an action (a reference from a state) and WHAT is in the
// library.  They are exported so the suite can drive them without a DOM, and
// so the studio never has to hand-roll an immutable update of a nested grid.
//
// Two caches make the read-outs cheap, and both are keyed by the artwork
// object so they die with it:
//
//   `usageIndex`   id → the states that play it.  It used to be recomputed per
//                  QUESTION (a scan of 11 states per action), which the studio
//                  asked 106 times per render — once per dropdown option —
//                  and 按状态 once per library row.  Now it is one pass per
//                  artwork, built on first ask.
//   `withGrid`     handled by the callers: every mutator here shares the parts
//                  it did not touch BY REFERENCE, so an edit to one action
//                  leaves every other action object identical — which is what
//                  the resolution and validation caches key on.

import { STATE_NAMES } from '../behavior.ts';
import { addToLibrary } from './compose.ts';
import type { Artwork, Frame, GridArtwork, LibraryTake, Take } from './compose.ts';
import { MAX_LIBRARY, MAX_TAKES } from './compose.ts';

const EMPTY_GRID: GridArtwork = { library: [], states: {} };
const NO_STATES: string[] = [];

/** One crop of an artwork (an empty one when the crop does not exist yet). */
export function gridArtwork(art: Artwork, grid: number): GridArtwork {
  return art.grids[grid] || EMPTY_GRID;
}

/** Replace one crop immutably. */
export function withGridArtwork(art: Artwork, grid: number, next: GridArtwork): Artwork {
  return { ...art, grids: { ...art.grids, [grid]: next } };
}

// ── who plays what ──

const USAGE = new WeakMap<Artwork, Map<number, Map<string, string[]>>>();

/** id → the states that play it, in the canonical state order.  Every id in
 *  the library gets an entry (an action nothing plays maps to the empty list),
 *  so a lookup never has to distinguish "unknown" from "unused". */
export function usageIndex(art: Artwork, grid: number): Map<string, string[]> {
  let byGrid = USAGE.get(art);
  if (!byGrid) {
    byGrid = new Map();
    USAGE.set(art, byGrid);
  }
  const hit = byGrid.get(grid);
  if (hit) return hit;
  const g = gridArtwork(art, grid);
  const index = new Map<string, string[]>();
  for (const t of g.library) index.set(t.id, []);
  for (const name of STATE_NAMES) {
    const ids = g.states[name];
    if (!Array.isArray(ids)) continue;
    for (const id of ids) {
      const players = index.get(id);
      if (players && !players.includes(name)) players.push(name);
    }
  }
  byGrid.set(grid, index);
  return index;
}

/** Which states play this action, in the canonical state order.  The returned
 *  array is SHARED and must be treated as read-only. */
export function usedBy(art: Artwork, grid: number, id: string): string[] {
  return usageIndex(art, grid).get(id) || NO_STATES;
}

export interface LibraryEntryInfo {
  id: string;
  name?: string;
  origin?: string;
  /** How many frames this action's loop holds. */
  frames: number;
  /** The states that play it, in the canonical state order. */
  usedBy: string[];
}

/** The library as the UI needs it: every action plus the states that
 *  reference it.  `usedBy` is the read-out that keeps sharing honest — an
 *  action played by four states is one edit away from four changes. */
export function libraryInfo(art: Artwork, grid: number): LibraryEntryInfo[] {
  const g = gridArtwork(art, grid);
  const index = usageIndex(art, grid);
  return g.library.map((t) => ({
    id: t.id,
    name: t.name,
    origin: t.origin,
    frames: t.frames.length,
    usedBy: index.get(t.id) || NO_STATES,
  }));
}

// ── assignment ──

/** Turn one state's reference to an action on or off.  This is the whole of
 *  "assigning an action to a state" — the action itself is untouched, so two
 *  states that both play it still share one definition. */
export function assignTake(art: Artwork, grid: number, state: string, id: string, on: boolean): Artwork {
  const g = gridArtwork(art, grid);
  if (!g.library.some((t) => t.id === id)) return art;
  const cur = g.states[state] || [];
  const has = cur.includes(id);
  if (on === has) return art;
  if (on && cur.length >= MAX_TAKES) return art;
  const next = on ? cur.concat([id]) : cur.filter((x) => x !== id);
  const states = { ...g.states };
  if (next.length) states[state] = next;
  else delete states[state];
  return withGridArtwork(art, grid, { library: g.library, states });
}

/** Replace a state's whole selection (「全选」/「清空」).  An empty list is not
 *  stored: a state with nothing to play is exactly a state that follows idle,
 *  and one representation of that beats two. */
export function setStateSelection(art: Artwork, grid: number, state: string, ids: string[]): Artwork {
  const g = gridArtwork(art, grid);
  const have = new Set(g.library.map((t) => t.id));
  const next = ids.filter((id, i) => have.has(id) && ids.indexOf(id) === i).slice(0, MAX_TAKES);
  const states = { ...g.states };
  if (next.length) states[state] = next;
  else delete states[state];
  return withGridArtwork(art, grid, { library: g.library, states });
}

// ── maintenance ──

/** Add one action to the library, sharing an identical one instead of storing
 *  it twice (`meta.unique` opts out — see `addToLibrary`).  Returns the artwork
 *  (UNCHANGED when it was deduped, or when the library is full) and the id to
 *  reference. */
export function addLibraryTake(
  art: Artwork,
  grid: number,
  take: Take,
  meta?: { id?: string; name?: string; origin?: string; unique?: boolean },
): { art: Artwork; id: string } {
  const g = gridArtwork(art, grid);
  const added = addToLibrary(g.library, take, meta);
  if (added.library === g.library) return { art, id: added.id };
  if (g.library.length >= MAX_LIBRARY) return { art, id: added.id };
  return { art: withGridArtwork(art, grid, { library: added.library, states: g.states }), id: added.id };
}

/** Remove an action from the library AND from every state that referenced it.
 *  There is no dangling reference to clean up afterwards, by construction. */
export function removeLibraryTake(art: Artwork, grid: number, id: string): Artwork {
  const g = gridArtwork(art, grid);
  if (!g.library.some((t) => t.id === id)) return art;
  const states: Record<string, string[]> = {};
  for (const state of Object.keys(g.states)) {
    const rest = g.states[state].filter((x) => x !== id);
    if (rest.length) states[state] = rest;
  }
  return withGridArtwork(art, grid, { library: g.library.filter((t) => t.id !== id), states });
}

/** Would removing these actions leave the crop unusable?  Two deletions can:
 *  emptying the library, and taking away the last action `idle` plays.  Asked
 *  by the studio's 批量管理 to DISABLE the button, and by the mutator below to
 *  REFUSE the write — `validateArtwork` requires an idle animation, and a
 *  document that fails validation is dropped on the next read, losing the whole
 *  drawing.  A guard that only exists in the UI is not a guard. */
export function removalIsBlocked(art: Artwork, grid: number, ids: readonly string[]): boolean {
  const g = gridArtwork(art, grid);
  if (!ids.length) return false;
  const gone = new Set(ids);
  const left = g.library.filter((t) => !gone.has(t.id));
  if (!left.length) return true;
  const idle = g.states.idle || [];
  return idle.length > 0 && idle.every((id) => gone.has(id));
}

/** Remove SEVERAL actions in ONE pass (编辑 · 按动作's 批量管理): the library
 *  loses them, every state that referenced any of them loses just those
 *  references, and the caller gets one artwork — which is one undo step.
 *  Refuses the write outright when `removalIsBlocked` says it would invalidate
 *  the document. */
export function removeLibraryTakes(art: Artwork, grid: number, ids: readonly string[]): Artwork {
  const g = gridArtwork(art, grid);
  if (!ids.length || removalIsBlocked(art, grid, ids)) return art;
  const gone = new Set(ids);
  if (!g.library.some((t) => gone.has(t.id))) return art;
  const states: Record<string, string[]> = {};
  for (const state of Object.keys(g.states)) {
    const rest = g.states[state].filter((x) => !gone.has(x));
    if (rest.length) states[state] = rest;
  }
  return withGridArtwork(art, grid, { library: g.library.filter((t) => !gone.has(t.id)), states });
}

/** Rename an action (an empty name clears it, so the UI shows the position). */
export function renameLibraryTake(art: Artwork, grid: number, id: string, name: string): Artwork {
  const g = gridArtwork(art, grid);
  const clean = (name || '').trim().slice(0, 40);
  return withGridArtwork(art, grid, {
    library: g.library.map((t) => {
      if (t.id !== id) return t;
      const next: LibraryTake = { id: t.id, frameMs: t.frameMs, frames: t.frames };
      if (clean) next.name = clean;
      if (t.origin) next.origin = t.origin;
      return next;
    }),
    states: g.states,
  });
}

/** Replace one action's frames/pace in place (the studio's edits).  Name and
 *  provenance are untouched — they describe where the action came from. */
export function replaceLibraryTake(art: Artwork, grid: number, id: string, take: Take): Artwork {
  const g = gridArtwork(art, grid);
  const next = g.library.map((t) => (t.id === id
    ? { ...t, frameMs: take.frameMs, frames: take.frames }
    : t));
  return withGridArtwork(art, grid, { library: next, states: g.states });
}

/** Overwrite one library action's whole CONTENT with another action's —
 *  编辑 · 按动作's 导入.  The ID is kept, and that is the point: every state that
 *  references this action still does, so importing a built-in animation into a
 *  slot that `idle` plays makes `idle` play it, with no re-assignment.  The
 *  name and provenance follow the source (an unnamed source leaves the action
 *  unnamed — the label falls back to 动作 N), and `frameMs` is the source's,
 *  like every other action's pace.
 *
 *  The imported frames must already be expressed in THIS artwork's palette:
 *  the caller runs them through `adoptRows`, because a built-in's palette slot
 *  7 is not this document's slot 7.  Returns the artwork unchanged when the id
 *  is gone (a deletion raced the click). */
export function overwriteLibraryTake(
  art: Artwork,
  grid: number,
  id: string,
  source: { frameMs: number; frames: Frame[]; name?: string; origin?: string },
): Artwork {
  const g = gridArtwork(art, grid);
  if (!g.library.some((t) => t.id === id)) return art;
  return withGridArtwork(art, grid, {
    library: g.library.map((t) => (t.id === id
      ? { id, frameMs: source.frameMs, frames: source.frames, name: source.name, origin: source.origin }
      : t)),
    states: g.states,
  });
}
