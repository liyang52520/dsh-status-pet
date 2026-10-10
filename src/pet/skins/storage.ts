// Persistence: the one JSON document in localStorage, and the write policy.
//
// ── what is stored ──
//
//   { v: 8,                                   schema version
//     skin: 'whale-chan' | 'custom',
//     brushes: ['#rrggbb', …6…],              the paint box (UI state)
//     builtinStates: { … },                   per-built-in state-assignment DIFF
//     custom: { palette, grids } }            我的创作
//
// The built-in artwork is NOT stored — it is generated data, loaded as its own
// chunk.
//
// ── why the write policy exists ──
//
// The custom document is BIG: the seeded built-in library is ~15 MB of JSON
// once both crops are materialised.  The studio writes on every painted pixel,
// and the old store serialized the whole document, handed it to localStorage
// and then re-parsed it — ~95 ms of blocking work per pixel, which is exactly
// what made drag-painting crawl.
//
// So the store keeps the document IN MEMORY as the truth and treats
// localStorage as a snapshot:
//
//   * `saveStored` merges, re-resolves and broadcasts SYNCHRONOUSLY, so every
//     reader (and every test) sees the new state immediately;
//   * the SNAPSHOT is written through immediately while it is small (a skin
//     choice, the paint box, a state-assignment diff — the metadata that must
//     never be at risk), and COALESCED while it is large: one serialization
//     per editing burst instead of one per pixel;
//   * a coalesced write is forced out after a short idle, and hard-capped, and
//     also flushed when the page goes away (`pagehide` / hidden tab), so a
//     burst is never lost for long;
//   * `loadStored` serves the in-memory document while a write is pending and
//     otherwise re-reads storage — so an external writer (another tab, a test)
//     is still noticed, and a REFUSED write (quota, private mode) falls back to
//     what storage actually holds instead of serving a lie.  While a burst is
//     pending, this tab's document is the truth and a concurrent write from
//     another tab loses on the next flush — the same last-writer-wins outcome
//     the old immediate write produced, over a window of at most one burst.

import { builtinArtwork, DEFAULT_SKIN } from './built-ins.ts';
import { convertArtwork } from './convert.ts';
import type { Artwork } from './compose.ts';

export type CustomArtwork = Artwork;

/** Schema version of the persisted JSON: v8 is the ACTION LIBRARY model (a
 * library of animations per crop + the ids each state plays). */
export const STORE_VERSION = 8;

export const STORE_KEY = 'status-pet:skin';
export const SKIN_EVENT = 'status-pet:skin-changed';

/** The paint box: a fixed row of free colour wells.  Brushes are UI state —
 *  painting bakes a brush's colour into the pixels, so editing a brush never
 *  repaints anything. */
export const BRUSH_COUNT = 6;

const SKIN_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Six neutral inks, used until the artwork chunk has landed (and as the last
 *  resort if a palette is shorter than the paint box). */
const FALLBACK_BRUSHES = ['#1b2340', '#46589a', '#4d6bfe', '#ffe9dd', '#ffffff', '#ff9db0'];

export interface StoredData {
  v?: number;
  skin?: string;
  brushes?: string[];
  custom?: CustomArtwork;
  [key: string]: unknown;
}

// ── the paint box ──

export function defaultBrushes(): string[] {
  const art = builtinArtwork(DEFAULT_SKIN);
  const palette = art ? art.palette : FALLBACK_BRUSHES;
  return Array.from({ length: BRUSH_COUNT }, (_, i) => palette[i + 1] || FALLBACK_BRUSHES[i] || '#000000');
}

/** A stored paint box, or the default one — never a partial or invalid row. */
export function resolveBrushes(stored: StoredData | null | undefined): string[] {
  const b = stored && Array.isArray(stored.brushes) ? stored.brushes : null;
  if (!b || b.length !== BRUSH_COUNT) return defaultBrushes();
  const out = b.map((c) => (typeof c === 'string' && SKIN_COLOR_RE.test(c) ? c.toLowerCase() : ''));
  return out.every(Boolean) ? out : defaultBrushes();
}

export function loadBrushes(): string[] {
  return resolveBrushes(loadStored());
}

// ── the in-memory truth ──

let state: StoredData | null = null;
/** The raw storage text `state` was parsed from (or written as). */
let lastRaw: string | null | undefined = undefined;
let dirty = false;
let flushTimer: ReturnType<typeof setTimeout> | 0 = 0;
let firstDirtyAt = 0;

function readRaw(): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
}

function parseRaw(raw: string | null): StoredData {
  if (!raw) return {};
  try {
    const d = JSON.parse(raw);
    return d && typeof d === 'object' ? migrate(d as StoredData) : {};
  } catch {
    return {};
  }
}

/** The current store document.  Memoized: identical storage gives the
 *  identical object (the parse and the v7 upgrade are not repeated), while a
 *  write — ours, or another tab's — is always noticed. */
export function loadStored(): StoredData {
  if (dirty && state) return state;
  const raw = readRaw();
  if (state !== null && raw === lastRaw) return state;
  lastRaw = raw;
  state = parseRaw(raw);
  return state;
}

// ── the write path ──

/** Below this, a write goes straight through: the metadata writes (skin
 *  choice, paint box, assignment diffs) are tiny and must land instantly. */
const SYNC_WRITE_MAX = 96 * 1024;
/** How long after the last edit a coalesced snapshot goes out.  It is a pause
 *  the user is taking, not a pause they are painting through — serializing
 *  15 MB plus a synchronous localStorage write is ~20–50 ms of main thread, and
 *  the worst place to spend it is the instant they stop to judge a stroke. */
const FLUSH_IDLE_MS = 800;
/** …and never later than this after the first unflushed edit.  This is the
 *  crash window: a normal exit or tab switch still flushes (see the lifecycle
 *  listeners below), so it only bounds an outright browser crash. */
const FLUSH_MAX_MS = 6000;

// The serialized size of a document, memoized by identity: the estimate walks
// every row string of a 15 MB document (~0.2 ms), and an unchanged document —
// which is every write that did not touch the artwork — is free.
const SIZE_CACHE = new WeakMap<object, number>();

function estimateBytes(st: StoredData): number {
  const c = st.custom;
  if (!c || typeof c !== 'object') return 0;
  const hit = SIZE_CACHE.get(c);
  if (hit !== undefined) return hit;
  let n = 0;
  const grids = c.grids;
  for (const key of Object.keys(grids)) {
    const g = grids[Number(key)];
    if (!g) continue;
    for (const t of g.library) {
      n += 48;
      for (const f of t.frames) {
        for (const r of f.rows) n += r.length + 4;
        if (f.prop) for (const r of f.prop.rows) n += r.length + 4;
      }
    }
  }
  SIZE_CACHE.set(c, n);
  return n;
}

let afterWrite: (() => void) | null = null;

/** Wire the store's reaction to a write (re-resolve ACTIVE + broadcast).  A
 *  hook instead of an import so that persistence and resolution stay separate
 *  modules with no cycle between them. */
export function onStoreWrite(fn: () => void): void {
  afterWrite = fn;
}

function flushNow(): void {
  if (!dirty) return;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = 0;
  }
  const text = JSON.stringify(state);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORE_KEY, text);
      lastRaw = text;
    } else {
      lastRaw = readRaw();
    }
    dirty = false;
    firstDirtyAt = 0;
  } catch {
    // Storage full / private mode: the write did not happen, so the cache must
    // follow STORAGE, not our intent — drop the in-memory document and let the
    // next read re-parse what is actually there.
    dirty = false;
    firstDirtyAt = 0;
    state = null;
    lastRaw = undefined;
  }
}

/** Force a pending snapshot out.  Exported for the page-lifecycle listeners
 *  and for tests that want the write without waiting. */
export function flushStored(): void {
  flushNow();
}

function scheduleFlush(): void {
  const st = state as StoredData;
  if (!dirty) return;
  if (estimateBytes(st) <= SYNC_WRITE_MAX) {
    flushNow();
    return;
  }
  const now = Date.now();
  if (!firstDirtyAt) firstDirtyAt = now;
  const left = FLUSH_MAX_MS - (now - firstDirtyAt);
  const delay = Math.max(0, Math.min(FLUSH_IDLE_MS, left));
  if (flushTimer) clearTimeout(flushTimer);
  if (delay <= 0) {
    flushNow();
    return;
  }
  flushTimer = setTimeout(flushNow, delay);
  // The bundle runs in a browser, where this is a number.  Under node's test
  // runner an un-unref'd timer would keep the process alive after the last
  // test, so unref when the runtime offers it (a browser never does).
  const t = flushTimer as unknown as { unref?: () => void };
  if (t && typeof t.unref === 'function') t.unref();
}

/** Merge a patch into the store.  Synchronous for every reader: the new
 *  document is live, ACTIVE is re-resolved and subscribers are notified before
 *  this returns.  Only the localStorage snapshot may lag (see the header). */
export function saveStored(patch: Partial<StoredData>): StoredData {
  const next = Object.assign({}, loadStored(), patch, { v: STORE_VERSION });
  state = next;
  dirty = true;
  scheduleFlush();
  if (afterWrite) afterWrite();
  return next;
}

// A coalesced snapshot must not be lost when the page goes away.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  const flush = () => flushNow();
  try {
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    window.addEventListener('visibilitychange', () => {
      if (typeof document !== 'undefined' && document.hidden) flushNow();
    });
  } catch {
    // a host without a real event target: the idle timer still flushes
  }
}

// ── version handling ──
//
// The artwork is upgraded, not dropped, from v7: a pre-v8 payload (a state
// owning its own takes) converts to the library model losslessly, and it is
// the shape an older document in the wild actually has — refusing it would
// throw away the user's drawing for no reason.  A payload from a NEWER version
// is dropped (its artwork may mean anything), and so is anything older than
// v7, whose pixel format and grids the studio would not understand.  The skin
// CHOICE and the PAINT BOX are version-independent and always survive.

function migrate(d: StoredData): StoredData {
  if (d.v === STORE_VERSION) return d;
  const { custom, colors, ...rest } = d;
  void colors;
  const future = typeof d.v === 'number' && d.v > STORE_VERSION;
  const art = future ? null : convertArtwork(custom);
  return art ? { ...rest, v: STORE_VERSION, custom: art } : { ...rest, v: STORE_VERSION };
}
