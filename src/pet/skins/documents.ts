// The artwork DOCUMENT reads: everything that turns the store plus the
// built-in registry into the `Artwork` a resolution or a preview works on —
// plus the assignment write-back.
//
// A built-in's PIXELS are authored and frozen; WHICH OF ITS ACTIONS each state
// plays is presentation, and the user may change it: the state view shows the
// built-in's own library with a checkbox per action, and the result lands in a
// sidecar DIFF instead of being written anywhere near the artwork.
//
//   `{ 'whale-chan': { tool: ['xie-daima'] } }`
//
// An ABSENT state key means "no opinion — use the authored assignment" (so a
// later artwork update still moves the states the user never touched), while a
// PRESENT-BUT-EMPTY list means "this state deliberately plays nothing, it
// follows idle" — the only way to say that about a state the artwork assigned.
//
// This diff is the ONLY thing in the system that reaches the renderer without
// being authored, so it is also where it is sanitized: `withOverrides` drops
// ids the library does not carry, caps the list, ignores unknown states and
// refuses to let `idle` end up empty.  A corrupt store must never blank the pet.
//
// Two memos live here, both keyed by object identity:
//
//   `withOverrides`  the authored artwork + the user's diff.  It applies once
//                    per (artwork, diff) pair; every resolution calls it.
//   `artworkDoc`     the document of a named skin, so the store's "who is
//                    this?" question is answered once per storage revision.

import { STATE_NAMES } from '../behavior.ts';
import { BUILTIN_NAMES, builtinArtwork } from './built-ins.ts';
import { MAX_TAKES } from './compose.ts';
import type { Artwork } from './compose.ts';
import { actionsOf, libraryInfo, withStates } from './library.ts';
import type { LibraryEntryInfo } from './library.ts';
import { loadStored, saveStored } from './storage.ts';
import type { StoredData } from './storage.ts';

const STATE_NAMES_SET: ReadonlySet<string> = new Set<string>(STATE_NAMES as readonly string[]);

export type { LibraryEntryInfo };

/** One skin's assignment diff: state name → the action ids it plays. */
export type StateOverride = Record<string, string[]>;

/** The user's assignment diff for one built-in, or null when they have no
 *  opinion about it.  Exported because the resolution needs the same read. */
export function artworkOverrides(store: StoredData, name: string): StateOverride | null {
  return overrideFor(store, name);
}

function overrideFor(store: StoredData, name: string): StateOverride | null {
  if (!BUILTIN_NAMES.includes(name)) return null;
  const all = store.builtinStates;
  if (!all || typeof all !== 'object') return null;
  const mine = (all as Record<string, unknown>)[name];
  return mine && typeof mine === 'object' ? (mine as StateOverride) : null;
}

const OVERRIDDEN = new WeakMap<Artwork, WeakMap<object, Artwork>>();

/** The authored artwork with the user's state overrides applied — and the one
 *  place an untrusted list of ids becomes a state table.  Actions and the
 *  palette are shared BY REFERENCE (an override is a list of ids, it cannot
 *  touch a pixel), and the result is memoized by (artwork, override) identity,
 *  so a resolution that asks twice builds nothing the second time.
 *
 *  A state key the artwork does not know is ignored, an id the library does not
 *  carry is dropped, a list longer than `MAX_TAKES` is cut, and `idle` falls
 *  back to the authored assignment rather than being left empty — resolution
 *  requires an idle animation. */
export function withOverrides(art: Artwork | undefined, override: StateOverride | null): Artwork | undefined {
  if (!art || !override || typeof override !== 'object') return art;
  let byOverride = OVERRIDDEN.get(art);
  const hit = byOverride && byOverride.get(override);
  if (hit) return hit;
  let changed = false;
  const have = new Set(actionsOf(art).map((t) => t.id));
  const states: Record<string, string[]> = { ...(art.states || {}) };
  for (const state of Object.keys(override)) {
    if (!STATE_NAMES_SET.has(state)) continue;
    const raw = override[state];
    if (!Array.isArray(raw)) continue;
    const next = raw
      .filter((id, i) => typeof id === 'string' && have.has(id) && raw.indexOf(id) === i)
      .slice(0, MAX_TAKES);
    if (next.length) states[state] = next;
    else delete states[state];
    changed = true;
  }
  if (!Array.isArray(states.idle) || !states.idle.length) {
    const authored = art.states?.idle || [];
    states.idle = authored.length ? authored.slice() : actionsOf(art).slice(0, 1).map((t) => t.id);
  }
  const out = changed ? withStates(art, states) : art;
  if (!byOverride) {
    byOverride = new WeakMap();
    OVERRIDDEN.set(art, byOverride);
  }
  byOverride.set(override, out);
  return out;
}

// ── the document of a skin ──

const DOC_CACHE = new WeakMap<StoredData, Map<string, Artwork | null>>();

/** The authored artwork of one named skin with the user's assignment applied,
 *  or null.  Memoized per store revision, so the settings page, the previews
 *  and the resolution share one answer for as long as the store does not
 *  change.  The ONE read both the Workshop and the resolution use, so they can
 *  never disagree. */
export function artworkDoc(name: string): Artwork | null {
  const store = loadStored();
  let byName = DOC_CACHE.get(store);
  if (byName && byName.has(name)) return byName.get(name)!;
  const value = computeArtworkDoc(store, name);
  if (!byName) {
    byName = new Map();
    DOC_CACHE.set(store, byName);
  }
  byName.set(name, value);
  return value;
}

function computeArtworkDoc(store: StoredData, name: string): Artwork | null {
  if (!BUILTIN_NAMES.includes(name)) return null;
  return withOverrides(builtinArtwork(name), overrideFor(store, name)) || null;
}

/** The artwork document of one named skin, overrides applied. */
export function skinArtwork(name: string): Artwork | null {
  return artworkDoc(name);
}

/** A skin's action library: every action, its name/origin, how many frames it
 *  holds and WHICH STATES PLAY IT.  This is what the state view reads, so the
 *  checklist and the row read-outs can never disagree about the library. */
export function skinLibrary(name: string): LibraryEntryInfo[] {
  const art = artworkDoc(name);
  if (!art) return [];
  return libraryInfo(art);
}

// ── assignment write-back ──

/** Which actions each state of a built-in plays — the one thing a built-in
 *  lets you change.  It writes the DIFF against the authored assignment, so the
 *  skin keeps its own pixels and a state the user never touched keeps following
 *  the artwork.  An empty list for a state is stored as such: "plays nothing,
 *  follows idle". */
export function saveSkinStates(name: string, states: Record<string, string[]>): void {
  if (!BUILTIN_NAMES.includes(name)) return;
  const art = builtinArtwork(name);
  if (!art) return;
  const have = new Set(actionsOf(art).map((t) => t.id));
  const clean = (ids: string[] | undefined): string[] =>
    Array.isArray(ids)
      ? ids.filter((id, i) => typeof id === 'string' && have.has(id) && ids.indexOf(id) === i).slice(0, MAX_TAKES)
      : [];
  const diff: Record<string, string[]> = {};
  for (const state of STATE_NAMES) {
    const ids = clean(states[state]);
    const base = art.states?.[state] || [];
    if (ids.join('\u0000') !== base.join('\u0000')) diff[state] = ids;
  }
  // An idle assignment is required, so a diff that would empty it is not
  // stored: the authored idle stands.
  if (!(diff.idle && diff.idle.length)) delete diff.idle;
  const stored = loadStored();
  const current: Record<string, StateOverride> =
    (stored.builtinStates as Record<string, StateOverride> | undefined) || {};
  const all: Record<string, StateOverride> = { ...current };
  if (Object.keys(diff).length) all[name] = diff;
  else delete all[name];
  // Nothing moved: do not write, do not re-resolve, do not broadcast.  A tick
  // that ends where it started (re-ticking an action, clearing a state that was
  // already following idle) costs nothing.
  if (JSON.stringify(all) === JSON.stringify(current)) return;
  // An empty table is dropped rather than stored, so a store the user has no
  // opinion about stays exactly that.
  saveStored({ builtinStates: Object.keys(all).length ? all : undefined });
}
