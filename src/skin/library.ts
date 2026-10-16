// The action library: what a skin owns, who plays it, and the one change a user
// can make to it (which actions a state plays).
//
// Everything here is PURE.  There is no library maintenance — no add, rename,
// replace or delete — because the artwork is authored: the library is exactly
// what the catalog ships, and the user's only lever is the state assignment.
// That assignment is a list of ids, so an action played by four states is still
// ONE definition.
//
// `usageIndex` builds id → the states that play it in one pass per artwork and
// caches it by the artwork object, so a list of 106 rows does not rescan eleven
// states each.

import { STATE_NAMES } from '../behavior/vocabulary.ts';
import type { StateName } from '../behavior/vocabulary.ts';

const STATE_NAMES_SET: ReadonlySet<string> = new Set<string>(STATE_NAMES);
import { MAX_SELECTION } from './model.ts';
import type { Action, Artwork, StateTable } from './model.ts';

const NO_STATES: string[] = [];

/** Replace the whole state table immutably. */
export function withStates(art: Artwork, states: StateTable): Artwork {
  return { ...art, states };
}

// ── who plays what ──

const USAGE = new WeakMap<Artwork, Map<string, string[]>>();

/** id → the states that play it, in canonical state order.  Every id in the
 *  library gets an entry (an action nothing plays maps to the empty list), so a
 *  lookup never has to distinguish "unknown" from "unused". */
export function usageIndex(art: Artwork): Map<string, string[]> {
  const hit = USAGE.get(art);
  if (hit) return hit;
  const index = new Map<string, string[]>();
  for (const action of art.actions) index.set(action.id, []);
  const states: Record<string, string[] | undefined> = art.states;
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

/** Which states play this action, in canonical state order.  The returned array
 *  is SHARED: treat it as read-only. */
export function usedBy(art: Artwork, actionId: string): string[] {
  return usageIndex(art).get(actionId) || NO_STATES;
}

export function actionById(art: Artwork, actionId: string): Action | undefined {
  return art.actions.find((action) => action.id === actionId);
}

/** One library row: everything the Workshop shows about an action. */
export interface ActionInfo {
  id: string;
  name: string;
  origin?: string;
  /** How many frames this action's loop holds (both faces share it). */
  frames: number;
  /** How many of those frames carry body artwork. */
  bodyFrames: number;
  /** The states that play it. */
  usedBy: string[];
}

/** The library as the UI needs it: every action plus the states that reference
 *  it.  `usedBy` is the read-out that keeps sharing honest — an action played by
 *  four states is one edit away from four changes. */
export function library(art: Artwork): ActionInfo[] {
  const index = usageIndex(art);
  return art.actions.map((action) => ({
    id: action.id,
    name: action.name,
    origin: action.origin,
    frames: action.frames.length,
    bodyFrames: action.frames.reduce((n, frame) => n + (frame.art.body ? 1 : 0), 0),
    usedBy: index.get(action.id) || NO_STATES,
  }));
}

// ── assignment ──

/** Turn one state's reference to an action on or off.  This is the whole of
 *  "assigning an action to a state" — the action itself is untouched, so two
 *  states that both play it still share one definition. */
export function assign(art: Artwork, state: string, actionId: string, on: boolean): Artwork {
  if (!STATE_NAMES_SET.has(state)) return art;
  if (!actionById(art, actionId)) return art;
  const current: readonly string[] = art.states[state as StateName] || [];
  const has = current.includes(actionId);
  if (on === has) return art;
  if (on && current.length >= MAX_SELECTION) return art;
  const next = on ? current.concat([actionId]) : current.filter((id) => id !== actionId);
  return setSelection(art, state, next);
}

/** Replace a state's whole selection (「全选」/「清空」).  An empty list is not
 *  stored: a state with nothing to play is exactly a state that follows idle,
 *  and one representation of that beats two.  Emptying `idle` is possible here
 *  (the caller's business: the surface keeps its first action, and the write
 *  path refuses a diff that would empty the anchor), so no rule is enforced
 *  twice. */
export function setSelection(art: Artwork, state: string, actionIds: string[]): Artwork {
  const known = new Set(art.actions.map((action) => action.id));
  const next = actionIds
    .filter((id, i) => typeof id === 'string' && known.has(id) && actionIds.indexOf(id) === i)
    .slice(0, MAX_SELECTION);
  const states: Record<string, string[]> = { ...art.states };
  if (next.length) states[state] = next;
  else delete states[state];
  return withStates(art, states);
}
