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

import { STATE_NAMES } from '../behavior.ts';
import { AVATAR_GRID } from '../grids.ts';
import { BUILTIN_NAMES, DEFAULT_SKIN, builtinArtwork } from './built-ins.ts';
import { artworkIsValid, validateArtwork } from './validate.ts';
import { looksLegacy } from './convert.ts';
import { MAX_TAKES, upgradeArtwork } from './compose.ts';
import type { Artwork, LegacyArtwork, LibraryTake, Take } from './compose.ts';
import { gridArtwork, libraryInfo, withGridArtwork } from './library.ts';
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
// The sidecar stores a DIFF against the authored assignment, per crop:
// `{ 'whale-chan': { '32': { tool: ['xie-daima'] } } }`.  An ABSENT state key
// means "no opinion — use the authored assignment" (so a later artwork update
// still moves the states the user never touched), while a PRESENT-BUT-EMPTY
// list means "this state deliberately plays nothing, it follows idle" — the
// only way to say that about a state the artwork assigned.
//
// Ids are re-checked against the library on the way in, and `idle` can never be
// emptied: resolution requires an idle animation, and a document that fails to
// resolve would blank the pet.
type OverrideGrids = Record<string, Record<string, string[]>>;

/** The user's assignment diff for one built-in, or null when they have no
 *  opinion about it.  Exported because the resolution needs the same read. */
export function artworkOverrides(store: StoredData, name: string): OverrideGrids | null {
  return overrideFor(store, name);
}

function overrideFor(store: StoredData, name: string): OverrideGrids | null {
  if (name === 'custom' || !BUILTIN_NAMES.includes(name)) return null;
  const all = store.builtinStates;
  if (!all || typeof all !== 'object') return null;
  const mine = (all as Record<string, unknown>)[name];
  return mine && typeof mine === 'object' ? (mine as OverrideGrids) : null;
}

const OVERRIDDEN = new WeakMap<Artwork, WeakMap<object, Artwork>>();

/** The authored artwork with the user's state overrides applied.  Frames and
 *  the palette are shared BY REFERENCE — an override is a list of ids — and the
 *  result is memoized by (artwork, override) identity, so a resolution that
 *  asks twice builds nothing the second time. */
export function withOverrides(art: Artwork | undefined, override: OverrideGrids | null): Artwork | undefined {
  if (!art || !override) return art;
  let byOverride = OVERRIDDEN.get(art);
  const hit = byOverride && byOverride.get(override);
  if (hit) return hit;
  let changed = false;
  const grids = { ...art.grids };
  for (const key of Object.keys(override)) {
    const grid = Number(key);
    const g = art.grids[grid];
    const patch = override[key];
    if (!g || !patch || typeof patch !== 'object') continue;
    const have = new Set(g.library.map((t) => t.id));
    const states: Record<string, string[]> = { ...g.states };
    for (const state of Object.keys(patch)) {
      if (!STATE_NAMES_SET.has(state)) continue;
      const raw = patch[state];
      if (!Array.isArray(raw)) continue;
      const next = raw
        .filter((id, i) => typeof id === 'string' && have.has(id) && raw.indexOf(id) === i)
        .slice(0, MAX_TAKES);
      if (next.length) states[state] = next;
      else delete states[state];
      changed = true;
    }
    if (!Array.isArray(states.idle) || !states.idle.length) {
      const authored = g.states.idle || [];
      states.idle = authored.length ? authored.slice() : g.library.slice(0, 1).map((t) => t.id);
    }
    grids[grid] = { library: g.library, states };
  }
  const out = changed ? { ...art, grids } : art;
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

/** A skin's action library at one crop: every action, its name/origin, how
 *  many frames it holds and WHICH STATES PLAY IT.  This is what the Workshop's
 *  「按动作」 gallery and the studio's list both read — one source, so the two
 *  can never disagree about what the library holds. */
export function skinLibrary(name: string, grid: number = AVATAR_GRID): LibraryEntryInfo[] {
  const art = artworkDoc(name);
  if (!art) return [];
  const use = art.grids[grid] ? grid : AVATAR_GRID;
  if (!art.grids[use]) return [];
  return libraryInfo(art, use);
}

// ── assignment write-back ──

/** Which actions each state of a SKIN plays — the one thing a built-in lets you
 *  change.  For 我的创作 it writes the artwork document itself; for a built-in it
 *  writes the DIFF against the authored assignment, so the skin keeps its own
 *  pixels and a state the user never touched keeps following the artwork.  An
 *  empty list for a state is stored as such: "plays nothing, follows idle". */
export function saveSkinStates(name: string, grid: number, states: Record<string, string[]>): void {
  const clean = (ids: string[] | undefined): string[] =>
    Array.isArray(ids)
      ? ids.filter((id, i) => typeof id === 'string' && ids.indexOf(id) === i).slice(0, MAX_TAKES)
      : [];
  if (name === 'custom') {
    const cur = loadCustomArtwork() || seedArtworkFrom(DEFAULT_SKIN);
    if (!cur) return;
    const g = gridArtwork(cur, grid);
    const have = new Set(g.library.map((t) => t.id));
    const next: Record<string, string[]> = {};
    for (const state of STATE_NAMES) {
      const ids = clean(states[state]).filter((id) => have.has(id));
      if (ids.length) next[state] = ids;
    }
    // The avatar crop's idle assignment is required, so an accidental 清空 of
    // idle must not invalidate the whole document.
    if (!next.idle || !next.idle.length) next.idle = (g.states.idle || []).slice();
    if (!next.idle || !next.idle.length) return;
    saveStored({ custom: withGridArtwork(cur, grid, { library: g.library, states: next }) });
    return;
  }
  if (!BUILTIN_NAMES.includes(name)) return;
  const art = builtinArtwork(name);
  const g = art ? art.grids[grid] : undefined;
  if (!art || !g) return;
  const have = new Set(g.library.map((t) => t.id));
  const diff: Record<string, string[]> = {};
  for (const state of STATE_NAMES) {
    const ids = clean(states[state]).filter((id) => have.has(id));
    const base = g.states[state] || [];
    if (ids.join('\u0000') !== base.join('\u0000')) diff[state] = ids;
  }
  if (!(diff.idle && diff.idle.length)) delete diff.idle;
  const stored = loadStored();
  const all: Record<string, OverrideGrids> =
    { ...((stored.builtinStates as Record<string, OverrideGrids> | undefined) || {}) };
  const mine: OverrideGrids = { ...(all[name] || {}) };
  if (Object.keys(diff).length) mine[String(grid)] = diff;
  else delete mine[String(grid)];
  if (Object.keys(mine).length) all[name] = mine;
  else delete all[name];
  saveStored({ builtinStates: all });
}

// ── seeding 我的创作 ──

/** Bake a built-in skin into a full CustomArtwork document: its whole action
 *  library on the avatar grid, plus the 128px body grid when the skin carries
 *  one, with the built-in's authored palette, names and state assignments.  The
 *  studio's initial view and the picker's custom seeding both come from here.
 *
 *  Rows and frames are shared BY REFERENCE where they can be (a row string is
 *  immutable), so seeding the 106-action built-in library costs one pass over
 *  the object graph — never a copy of 15 MB of strings. */
export function seedArtworkFrom(name: string): CustomArtwork {
  // The effective document: 我的创作 starts as a copy of what the user SEES,
  // including any state reassignment they made on the built-in.
  const art = artworkDoc(BUILTIN_NAMES.includes(name) ? name : DEFAULT_SKIN)
    || builtinArtwork(DEFAULT_SKIN);
  if (!art) return { palette: ['transparent'], grids: {} };
  const cloneFrames = (t: Take): Take => ({
    frameMs: t.frameMs,
    frames: t.frames.map((f) => ({
      rows: f.rows.slice(), dx: f.dx, dy: f.dy, ms: f.ms,
      prop: f.prop ? { x: f.prop.x, y: f.prop.y, rows: f.prop.rows.slice() } : undefined,
    })),
  });
  const grids: CustomArtwork['grids'] = {};
  for (const key of Object.keys(art.grids)) {
    const g = art.grids[Number(key)];
    if (!g) continue;
    const library: LibraryTake[] = g.library.map((t) => {
      const entry = cloneFrames(t) as LibraryTake;
      entry.id = t.id;
      if (t.name) entry.name = t.name;
      if (t.origin) entry.origin = t.origin;
      return entry;
    });
    const states: Record<string, string[]> = {};
    for (const state of Object.keys(g.states)) states[state] = g.states[state].slice();
    grids[Number(key)] = { library, states };
  }
  return { palette: art.palette.slice(), grids };
}

// ── import / export ──

/** The wire format is versioned: `{ v, palette, grids }`.  A bare
 *  `{ palette, grids }` (hand-written JSON, or an export from before the
 *  stamp) is accepted by SHAPE — a v8 document validates as itself, a v7 one is
 *  recognised as the legacy shape and upgraded — while a document from a NEWER
 *  version is refused instead of being half-read. */
export function serializeArtwork(d: CustomArtwork): string {
  return JSON.stringify({ v: STORE_VERSION, palette: d.palette, grids: d.grids });
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
  // A pre-v8 export is upgraded rather than refused: the state-owned shape is
  // mechanically convertible, and refusing it would strand the user's drawing.
  if (!looksLegacy(found)) return { errors };
  const upgraded = upgradeArtwork(found as LegacyArtwork);
  const upErrors = validateArtwork(upgraded);
  if (upErrors.length) return { errors: upErrors };
  return { data: upgraded };
}
