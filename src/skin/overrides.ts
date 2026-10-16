// The assignment diff: the user's sidecar over the authored artwork, and the one
// place an untrusted list of ids becomes a state table.
//
// A skin's PIXELS are authored and frozen; WHICH OF ITS ACTIONS each state plays
// is presentation, and the user may change it.  The result is never written
// anywhere near the artwork — it is a diff:
//
//   `{ 'whale-chan': { tool: ['xie-daima'] } }`
//
// An ABSENT state key means "no opinion — use the authored assignment", so a later
// artwork update still moves the states the user never touched.  A list the user
// EMPTIED is not stored at all (see `session.saveAssignments`): "plays nothing" is
// the same thing as "follows idle", and one representation of that beats two.  The
// one exception is the anchor — an empty `idle` is rescued back to the authored
// assignment below, because a pet with nothing to play is a blank canvas.
//
// A stored diff is the only thing in the system that reaches the renderer
// without being authored, so it is sanitized on the way in: unknown states are
// ignored, ids the library does not carry are dropped, duplicates collapse, the
// list is capped, and `idle` falls back to the authored assignment rather than
// being left empty.  A corrupt store must never blank the pet.

import { STATE_NAMES } from '../behavior/vocabulary.ts';
import { MAX_SELECTION } from './model.ts';
import type { Artwork } from './model.ts';
import { withStates } from './library.ts';
import { isBuiltin } from './registry.ts';
import type { Stored } from './storage.ts';

const STATE_NAMES_SET: ReadonlySet<string> = new Set<string>(STATE_NAMES);

/** One skin's assignment diff: state name → the action ids it plays. */
export type AssignmentDiff = Record<string, string[]>;

/** The user's diff for one built-in, or null when they have no opinion about
 *  it. */
export function diffOf(stored: Stored, name: string): AssignmentDiff | null {
  if (!isBuiltin(name)) return null;
  const mine = stored.assignments?.[name];
  return mine && typeof mine === 'object' ? mine : null;
}

const APPLIED = new WeakMap<Artwork, WeakMap<object, Artwork>>();

/** The authored artwork with the user's diff applied.  Actions and the palette
 *  are shared BY REFERENCE (a diff is a list of ids, it cannot touch a pixel),
 *  and the result is memoized by (artwork, diff) identity, so a resolution that
 *  asks twice builds nothing the second time. */
export function applyDiff(art: Artwork | undefined, diff: AssignmentDiff | null): Artwork | undefined {
  if (!art || !diff || typeof diff !== 'object') return art;
  let byDiff = APPLIED.get(art);
  const hit = byDiff && byDiff.get(diff);
  if (hit) return hit;
  let changed = false;
  const known = new Set(art.actions.map((action) => action.id));
  const states: Record<string, string[]> = { ...art.states };
  for (const state of Object.keys(diff)) {
    if (!STATE_NAMES_SET.has(state)) continue;
    const raw = diff[state];
    if (!Array.isArray(raw)) continue;
    const next = raw
      .filter((id, i) => typeof id === 'string' && known.has(id) && raw.indexOf(id) === i)
      .slice(0, MAX_SELECTION);
    // Present-but-empty (and a list that sanitized away to nothing) means "follow
    // idle": the key is dropped rather than stored as an empty list.
    if (next.length) states[state] = next;
    else delete states[state];
    changed = true;
  }
  const authoredIdle = art.states.idle || [];
  if (!Array.isArray(states.idle) || !states.idle.length) {
    states.idle = authoredIdle.length ? authoredIdle.slice() : art.actions.slice(0, 1).map((a) => a.id);
  }
  const out = changed ? withStates(art, states) : art;
  if (!byDiff) {
    byDiff = new WeakMap();
    APPLIED.set(art, byDiff);
  }
  byDiff.set(diff, out);
  return out;
}
