// The artwork DOCUMENT reads: everything that turns the store plus the
// built-in registry into the `Artwork` a resolution, a preview or the studio
// works on — plus the assignment write-back and the import/export wire format.
//
// Two memos live here, both keyed by object identity:
//
//   `withOverrides`  the authored built-in + the user's assignment diff.  It
//                    used to rebuild a library-id Set and clone eleven state
//                    lists on every call, and every resolution calls it.
//   `artworkDoc`     the document of a named skin, so the store's "who is
//                    this?" question is answered once per storage revision.
//
// v9: the state assignment is ONE table for the whole artwork (both faces play
// the same action set), so the built-in sidecar is a flat `{ state: ids }` diff
// rather than one diff per crop.

import { STATE_NAMES } from '../behavior.ts';
import { AVATAR_GRID } from '../grids.ts';
import { BUILTIN_NAMES, DEFAULT_SKIN, builtinArtwork } from './built-ins.ts';
import { artworkIsValid, validateArtwork } from './validate.ts';
import { MAX_TAKES, upgradeArtwork } from './compose.ts';
import type { Action, ActionFrame, Artwork, Cell } from './compose.ts';
import { actionsOf, libraryInfo, withStates } from './library.ts';
import type { LibraryEntryInfo } from './library.ts';
import { loadStored, saveStored, STORE_VERSION } from './storage.ts';
import type { CustomArtwork, StoredData } from './storage.ts';

const STATE_NAMES_SET: ReadonlySet<string> = new Set<string>(STATE_NAMES as readonly string[]);

export type { LibraryEntryInfo };

// ── built-in state overrides ──
//
// A built-in's PIXELS are authored and frozen, but WHICH OF ITS ACTIONS each
// state plays is presentation, and the user may change it: 编辑 · 按状态 shows
// the built-in's own library with a checkbox per action, and the result lands
// in this sidecar instead of forking the skin into 我的创作 (the old studio
// forked on the first stroke, which is what made "I edited the whale but saved
// 我的创作" happen).
//
// The sidecar stores a DIFF against the authored assignment:
// `{ 'whale-chan': { tool: ['xie-daima'] } }`.  An ABSENT state key means "no
// opinion — use the authored assignment" (so a later artwork update still moves
// the states the user never touched), while a PRESENT-BUT-EMPTY list means
// "this state deliberately plays nothing, it follows idle" — the only way to
// say that about a state the artwork assigned.
//
// Ids are re-checked against the library on the way in, and `idle` can never be
// emptied: resolution requires an idle animation, and a document that fails to
// resolve would blank the pet.
export type StateOverride = Record<string, string[]>;

/** The user's assignment diff for one built-in, or null when they have no
 *  opinion about it.  Exported because the resolution needs the same read. */
export function artworkOverrides(store: StoredData, name: string): StateOverride | null {
  return overrideFor(store, name);
}

function overrideFor(store: StoredData, name: string): StateOverride | null {
  if (name === 'custom' || !BUILTIN_NAMES.includes(name)) return null;
  const all = store.builtinStates;
  if (!all || typeof all !== 'object') return null;
  const mine = (all as Record<string, unknown>)[name];
  return mine && typeof mine === 'object' ? (mine as StateOverride) : null;
}

const OVERRIDDEN = new WeakMap<Artwork, WeakMap<object, Artwork>>();

/** The authored artwork with the user's state overrides applied.  Actions and
 *  the palette are shared BY REFERENCE — an override is a list of ids — and the
 *  result is memoized by (artwork, override) identity, so a resolution that
 *  asks twice builds nothing the second time. */
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

/** The stored/built-in artwork document of one named skin, or null.  Memoized
 *  per store revision, so the studio, the gallery and the resolution share one
 *  answer for as long as the store does not change. */
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
  if (name === 'custom') {
    return store.custom && artworkIsValid(store.custom) ? store.custom : null;
  }
  if (!BUILTIN_NAMES.includes(name)) return null;
  return withOverrides(builtinArtwork(name), overrideFor(store, name)) || null;
}

/** The artwork document of one named skin, overrides applied — the ONE read
 *  both the Workshop and the resolution use, so they can never disagree. */
export function skinArtwork(name: string): Artwork | null {
  return artworkDoc(name);
}

/** The editor's artwork document for the custom slot (validated), or null. */
export function loadCustomArtwork(): CustomArtwork | null {
  const stored = loadStored();
  return stored.custom && artworkIsValid(stored.custom) ? stored.custom : null;
}

/** A skin's action library: every action, its name/origin, how many frames it
 *  holds and WHICH STATES PLAY IT.  This is what the Workshop's 「按动作」
 *  gallery and the studio's list both read — one source, so the two can never
 *  disagree about what the library holds. */
export function skinLibrary(name: string): LibraryEntryInfo[] {
  const art = artworkDoc(name);
  if (!art) return [];
  return libraryInfo(art);
}

// ── assignment write-back ──

/** Which actions each state of a SKIN plays — the one thing a built-in lets you
 *  change.  For 我的创作 it writes the artwork document itself; for a built-in it
 *  writes the DIFF against the authored assignment, so the skin keeps its own
 *  pixels and a state the user never touched keeps following the artwork.  An
 *  empty list for a state is stored as such: "plays nothing, follows idle". */
export function saveSkinStates(name: string, states: Record<string, string[]>): void {
  const clean = (ids: string[] | undefined): string[] =>
    Array.isArray(ids)
      ? ids.filter((id, i) => typeof id === 'string' && ids.indexOf(id) === i).slice(0, MAX_TAKES)
      : [];
  if (name === 'custom') {
    const cur = loadCustomArtwork() || seedArtworkFrom(DEFAULT_SKIN);
    if (!cur) return;
    const have = new Set(actionsOf(cur).map((t) => t.id));
    const next: Record<string, string[]> = {};
    for (const state of STATE_NAMES) {
      const ids = clean(states[state]).filter((id) => have.has(id));
      if (ids.length) next[state] = ids;
    }
    // An idle assignment is required, so an accidental 清空 of idle must not
    // invalidate the whole document.
    if (!next.idle || !next.idle.length) next.idle = (cur.states?.idle || []).slice();
    if (!next.idle || !next.idle.length) return;
    saveStored({ custom: withStates(cur, next) });
    return;
  }
  if (!BUILTIN_NAMES.includes(name)) return;
  const art = builtinArtwork(name);
  if (!art) return;
  const have = new Set(actionsOf(art).map((t) => t.id));
  const diff: Record<string, string[]> = {};
  for (const state of STATE_NAMES) {
    const ids = clean(states[state]).filter((id) => have.has(id));
    const base = art.states?.[state] || [];
    if (ids.join('\u0000') !== base.join('\u0000')) diff[state] = ids;
  }
  if (!(diff.idle && diff.idle.length)) delete diff.idle;
  const stored = loadStored();
  const all: Record<string, StateOverride> =
    { ...((stored.builtinStates as Record<string, StateOverride> | undefined) || {}) };
  if (Object.keys(diff).length) all[name] = diff;
  else delete all[name];
  saveStored({ builtinStates: all });
}

// ── seeding 我的创作 ──

/** Bake a built-in skin into a full CustomArtwork document: its whole action
 *  library (BOTH faces of every action), its palette, names and state
 *  assignments.  The studio's initial view and the picker's custom seeding both
 *  come from here.
 *
 *  Rows are cloned (a row string is immutable, but the arrays around them are
 *  the studio's to replace), so seeding the 106-action built-in library costs
 *  one pass over the object graph — never a copy of 15 MB of pixels. */
export function seedArtworkFrom(name: string): CustomArtwork {
  // The effective document: 我的创作 starts as a copy of what the user SEES,
  // including any state reassignment they made on the built-in.
  const art = artworkDoc(BUILTIN_NAMES.includes(name) ? name : DEFAULT_SKIN)
    || builtinArtwork(DEFAULT_SKIN);
  if (!art) return { palette: ['transparent'], actions: [], states: {} };
  const cloneCell = (cell: Cell): Cell => ({
    rows: cell.rows.slice(),
    prop: cell.prop ? { x: cell.prop.x, y: cell.prop.y, rows: cell.prop.rows.slice() } : undefined,
  });
  const actions: Action[] = actionsOf(art).map((a) => {
    const frames: ActionFrame[] = a.frames.map((f) => {
      const cells: ActionFrame['cells'] = { [AVATAR_GRID]: cloneCell(f.cells[AVATAR_GRID]) };
      for (const grid of Object.keys(f.cells)) {
        const g = Number(grid);
        if (g === AVATAR_GRID) continue;
        const cell = f.cells[g];
        if (cell) cells[g] = cloneCell(cell);
      }
      const frame: ActionFrame = { cells };
      if (f.ms !== undefined) frame.ms = f.ms;
      if (f.dx) frame.dx = f.dx;
      if (f.dy) frame.dy = f.dy;
      return frame;
    });
    const out: Action = { id: a.id, frameMs: a.frameMs, frames };
    if (a.name) out.name = a.name;
    if (a.origin) out.origin = a.origin;
    return out;
  });
  const states: Record<string, string[]> = {};
  for (const state of Object.keys(art.states || {})) states[state] = art.states[state].slice();
  return { palette: art.palette.slice(), actions, states };
}

// ── import / export ──

/** The wire format is versioned: `{ v, palette, actions, states }`.  A bare
 *  document (hand-written JSON, or an export from before the stamp) is accepted
 *  by SHAPE — a v9 document validates as itself, a v8 one is paired and a v7
 *  one is recognised as the legacy shape and upgraded — while a document from a
 *  NEWER version is refused instead of being half-read. */
export function serializeArtwork(d: CustomArtwork): string {
  return JSON.stringify({ v: STORE_VERSION, palette: d.palette, actions: d.actions, states: d.states });
}

export type ParseResult =
  | { data: CustomArtwork; errors?: undefined }
  | { errors: string[]; data?: undefined };

export function parseArtworkExport(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { errors: ['not JSON'] };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { errors: ['not an artwork document'] };
  }
  const doc = raw as Record<string, unknown>;
  const nested = doc.custom;
  // Accept the versioned export, a bare artwork document, and a whole store
  // payload pasted by hand.
  const found = doc.palette ? doc : (nested && typeof nested === 'object' ? nested : null);
  if (!found) return { errors: ['not an artwork document'] };
  const v = typeof doc.v === 'number' ? doc.v : undefined;
  if (v !== undefined && v > STORE_VERSION) return { errors: ['exported by a newer version'] };
  const errors = validateArtwork(found);
  if (!errors.length) return { data: found as CustomArtwork };
  // An older export is upgraded rather than refused: both older shapes are
  // mechanically convertible, and refusing would strand the user's drawing.
  // A v9-shaped document comes back unchanged (and fails again, which is the
  // honest answer — it was simply invalid).
  const upgraded = upgradeArtwork(found);
  if (!upgraded) return { errors };
  const upErrors = validateArtwork(upgraded);
  if (upErrors.length) return { errors: upErrors };
  return { data: upgraded };
}
