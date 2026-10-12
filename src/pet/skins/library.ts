// The action library: reference maintenance, and the read-outs the Workshop
// renders.
//
// Everything here is PURE and answers the two questions the library model
// creates: WHO plays an action (a reference from a state) and WHAT is in the
// library.  They are exported so the suite can drive them without a DOM, and
// so the studio never has to hand-roll an immutable update.
//
// v9 note: there is ONE library and ONE state table for the whole artwork, so
// none of these functions takes a `grid` any more.  That is the pairing
// guarantee at its root — a state cannot play one set of actions on the dock
// and another in the popup, because there is only one set to name.
//
// `usageIndex` builds id → the states that play it in one pass per artwork and
// caches it by the artwork object, so the studio's 106 dropdown options and the
// assignment list do not each rescan eleven states.

import { STATE_NAMES } from '../behavior.ts';
import { addToLibrary } from './compose.ts';
import type { Action, ActionFrame, Artwork, Cell } from './compose.ts';
import { MAX_LIBRARY, MAX_TAKES } from './compose.ts';

const NO_STATES: string[] = [];

/** One artwork's action library (an empty list for a half-built document). */
export function actionsOf(art: Artwork): Action[] {
  return Array.isArray(art.actions) ? art.actions : [];
}

/** Replace the whole library immutably. */
export function withActions(art: Artwork, actions: Action[]): Artwork {
  return { ...art, actions };
}

/** Replace the whole state table immutably. */
export function withStates(art: Artwork, states: Record<string, string[]>): Artwork {
  return { ...art, states };
}

// ── who plays what ──

const USAGE = new WeakMap<Artwork, Map<string, string[]>>();

/** id → the states that play it, in the canonical state order.  Every id in
 *  the library gets an entry (an action nothing plays maps to the empty list),
 *  so a lookup never has to distinguish "unknown" from "unused". */
export function usageIndex(art: Artwork): Map<string, string[]> {
  const hit = USAGE.get(art);
  if (hit) return hit;
  const index = new Map<string, string[]>();
  for (const t of actionsOf(art)) index.set(t.id, []);
  const states = (art && art.states) || {};
  for (const name of STATE_NAMES) {
    const ids = states[name];
    if (!Array.isArray(ids)) continue;
    for (const id of ids) {
      const players = index.get(id);
      if (players && !players.includes(name)) players.push(name);
    }
  }
  USAGE.set(art, index);
  return index;
}

/** Which states play this action, in the canonical state order.  The returned
 *  array is SHARED and must be treated as read-only. */
export function usedBy(art: Artwork, id: string): string[] {
  return usageIndex(art).get(id) || NO_STATES;
}

export interface LibraryEntryInfo {
  id: string;
  name?: string;
  origin?: string;
  /** How many frames this action's loop holds (both faces share it). */
  frames: number;
  /** How many of those frames carry body artwork. */
  bodyFrames: number;
  /** The states that play it, in the canonical state order. */
  usedBy: string[];
}

/** The library as the UI needs it: every action plus the states that
 *  reference it.  `usedBy` is the read-out that keeps sharing honest — an
 *  action played by four states is one edit away from four changes. */
export function libraryInfo(art: Artwork): LibraryEntryInfo[] {
  const index = usageIndex(art);
  return actionsOf(art).map((t) => ({
    id: t.id,
    name: t.name,
    origin: t.origin,
    frames: Array.isArray(t.frames) ? t.frames.length : 0,
    bodyFrames: Array.isArray(t.frames) ? t.frames.filter((f) => !!f.cells?.[128]).length : 0,
    usedBy: index.get(t.id) || NO_STATES,
  }));
}

// ── assignment ──

/** Turn one state's reference to an action on or off.  This is the whole of
 *  "assigning an action to a state" — the action itself is untouched, so two
 *  states that both play it still share one definition. */
export function assignTake(art: Artwork, state: string, id: string, on: boolean): Artwork {
  if (!actionsOf(art).some((t) => t.id === id)) return art;
  const states = art.states || {};
  const cur = states[state] || [];
  const has = cur.includes(id);
  if (on === has) return art;
  if (on && cur.length >= MAX_TAKES) return art;
  const next = on ? cur.concat([id]) : cur.filter((x) => x !== id);
  const out = { ...states };
  if (next.length) out[state] = next;
  else delete out[state];
  return withStates(art, out);
}

/** Replace a state's whole selection (「全选」/「清空」).  An empty list is not
 *  stored: a state with nothing to play is exactly a state that follows idle,
 *  and one representation of that beats two. */
export function setStateSelection(art: Artwork, state: string, ids: string[]): Artwork {
  const have = new Set(actionsOf(art).map((t) => t.id));
  const next = ids.filter((id, i) => have.has(id) && ids.indexOf(id) === i).slice(0, MAX_TAKES);
  const states = { ...(art.states || {}) };
  if (next.length) states[state] = next;
  else delete states[state];
  return withStates(art, states);
}

// ── maintenance ──

/** Add one action to the library, sharing an identical one instead of storing
 *  it twice (`meta.unique` opts out — see `addToLibrary`).  Returns the artwork
 *  (UNCHANGED when it was deduped, or when the library is full) and the id to
 *  reference. */
export function addLibraryTake(
  art: Artwork,
  action: Action,
  meta?: { id?: string; name?: string; origin?: string; unique?: boolean },
): { art: Artwork; id: string } {
  const library = actionsOf(art);
  const added = addToLibrary(library, action, meta);
  if (added.actions === library) return { art, id: added.id };
  if (library.length >= MAX_LIBRARY) return { art, id: added.id };
  return { art: withActions(art, added.actions), id: added.id };
}

/** Remove an action from the library AND from every state that referenced it.
 *  There is no dangling reference to clean up afterwards, by construction. */
export function removeLibraryTake(art: Artwork, id: string): Artwork {
  if (!actionsOf(art).some((t) => t.id === id)) return art;
  const states: Record<string, string[]> = {};
  for (const state of Object.keys(art.states || {})) {
    const rest = art.states[state].filter((x) => x !== id);
    if (rest.length) states[state] = rest;
  }
  return withStates(withActions(art, actionsOf(art).filter((t) => t.id !== id)), states);
}

/** Would removing these actions leave the artwork unusable?  Two deletions
 *  can: emptying the library, and taking away the last action `idle` plays.
 *  Asked by the studio's 批量删除 to DISABLE the button, and by the mutator
 *  below to REFUSE the write — `validateArtwork` requires an idle animation,
 *  and a document that fails validation is dropped on the next read, losing the
 *  whole drawing.  A guard that only exists in the UI is not a guard. */
export function removalIsBlocked(art: Artwork, ids: readonly string[]): boolean {
  if (!ids.length) return false;
  const gone = new Set(ids);
  const left = actionsOf(art).filter((t) => !gone.has(t.id));
  if (!left.length) return true;
  const idle = (art.states || {}).idle || [];
  return idle.length > 0 && idle.every((id) => gone.has(id));
}

/** Remove SEVERAL actions in ONE pass (编辑 · 按动作's 批量删除): the library
 *  loses them, every state that referenced any of them loses just those
 *  references, and the caller gets one artwork — which is one undo step.
 *  Refuses the write outright when `removalIsBlocked` says it would invalidate
 *  the document. */
export function removeLibraryTakes(art: Artwork, ids: readonly string[]): Artwork {
  if (!ids.length || removalIsBlocked(art, ids)) return art;
  const gone = new Set(ids);
  if (!actionsOf(art).some((t) => gone.has(t.id))) return art;
  const states: Record<string, string[]> = {};
  for (const state of Object.keys(art.states || {})) {
    const rest = art.states[state].filter((x) => !gone.has(x));
    if (rest.length) states[state] = rest;
  }
  return withStates(withActions(art, actionsOf(art).filter((t) => !gone.has(t.id))), states);
}

/** Rename an action (an empty name clears it, so the UI shows the position). */
export function renameLibraryTake(art: Artwork, id: string, name: string): Artwork {
  const clean = (name || '').trim().slice(0, 40);
  return withActions(art, actionsOf(art).map((t) => {
    if (t.id !== id) return t;
    const next: Action = { id: t.id, frameMs: t.frameMs, frames: t.frames };
    if (clean) next.name = clean;
    if (t.origin) next.origin = t.origin;
    return next;
  }));
}

/** Replace one action's frames/pace in place (the studio's edits).  Name and
 *  provenance are untouched — they describe where the action came from. */
export function replaceLibraryTake(art: Artwork, id: string, take: { frameMs: number; frames: ActionFrame[] }): Artwork {
  return withActions(art, actionsOf(art).map((t) => (t.id === id
    ? { ...t, frameMs: take.frameMs, frames: take.frames }
    : t)));
}

/** Replace ONE face of ONE frame, leaving every other object identical (the
 *  studio's paint path: the action is rebuilt, the frames array is rebuilt, the
 *  one frame is rebuilt — every other row string and cell object is shared).
 *  A no-op (an unknown action or frame) returns the artwork itself, so the
 *  resolution and validation memos survive it. */
export function replaceFrameCell(
  art: Artwork,
  id: string,
  frameIdx: number,
  grid: number,
  cell: Cell,
): Artwork {
  const found = actionsOf(art).find((t) => t.id === id);
  if (!found || !found.frames[frameIdx]) return art;
  return withActions(art, actionsOf(art).map((t) => {
    if (t.id !== id) return t;
    const frames = t.frames.slice();
    const frame = frames[frameIdx];
    frames[frameIdx] = { ...frame, cells: { ...frame.cells, [grid]: cell } };
    return { ...t, frames };
  }));
}

/** Drop one face of one frame (the body of a frame the user emptied), leaving
 *  the action itself intact.  A no-op returns the artwork itself. */
export function dropFrameCell(art: Artwork, id: string, frameIdx: number, grid: number): Artwork {
  const found = actionsOf(art).find((t) => t.id === id);
  if (!found || !found.frames[frameIdx] || !found.frames[frameIdx].cells[grid]) return art;
  return withActions(art, actionsOf(art).map((t) => {
    if (t.id !== id) return t;
    const frames = t.frames.slice();
    const frame = frames[frameIdx];
    const cells = { ...frame.cells };
    delete cells[grid];
    frames[frameIdx] = { ...frame, cells };
    return { ...t, frames };
  }));
}

/** Overwrite one library action's whole CONTENT with another action's —
 *  编辑 · 按动作's 导入.  The ID is kept, and that is the point: every state that
 *  references this action still does, so importing a built-in animation into a
 *  slot that `idle` plays makes `idle` play it, with no re-assignment.  The
 *  name and provenance follow the source (an unnamed source leaves the action
 *  unnamed — the label falls back to 动作 N), and `frameMs` is the source's,
 *  like every other action's pace.  BOTH FACES come along, because an action is
 *  one thing: the frame count and the pace could not come from two sources.
 *
 *  The imported faces must already be expressed in THIS artwork's palette: the
 *  caller runs them through `adoptRows`, because a built-in's palette slot 7 is
 *  not this document's slot 7.  Returns the artwork unchanged when the id is
 *  gone (a deletion raced the click). */
export function overwriteLibraryTake(
  art: Artwork,
  id: string,
  source: { frameMs: number; frames: ActionFrame[]; name?: string; origin?: string },
): Artwork {
  if (!actionsOf(art).some((t) => t.id === id)) return art;
  return withActions(art, actionsOf(art).map((t) => (t.id === id
    ? {
      id,
      frameMs: source.frameMs,
      frames: source.frames,
      name: source.name,
      origin: source.origin,
    }
    : t)));
}
