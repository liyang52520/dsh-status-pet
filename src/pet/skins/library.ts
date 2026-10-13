// The action library reads, and the one write the Workshop makes: WHICH
// actions a state plays.
//
// Everything here is PURE and answers the two questions the library model
// creates: WHO plays an action (a reference from a state) and WHAT is in the
// library.  They are exported so the suite can drive them without a DOM.
//
// There is no library MAINTENANCE any more — no add, rename, replace or delete
// — because the artwork is authored: the library is exactly what the chunk
// ships, and the user's only lever is the state assignment.  That assignment is
// a list of ids, so an action played by four states is still ONE definition.
//
// `usageIndex` builds id → the states that play it in one pass per artwork and
// caches it by the artwork object, so the assignment list does not rescan
// eleven states per row.

import { STATE_NAMES } from '../behavior.ts';
import type { Action, Artwork } from './compose.ts';
import { MAX_TAKES } from './compose.ts';

const NO_STATES: string[] = [];

/** One artwork's action library (an empty list for a half-built document). */
export function actionsOf(art: Artwork): Action[] {
  return Array.isArray(art.actions) ? art.actions : [];
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

/** The library as the UI needs it: every action plus the states that reference
 *  it.  `usedBy` is the read-out that keeps sharing honest — an action played
 *  by four states is one edit away from four changes. */
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
