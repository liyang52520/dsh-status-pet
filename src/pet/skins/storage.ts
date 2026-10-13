// Persistence: the one JSON document in localStorage.
//
// ── what is stored ──
//
//   { v: 10,                          schema version
//     skin: 'whale-chan',
//     builtinStates: { … } }          per-built-in state-assignment DIFF
//
// That is ALL of it.  The artwork is authored data and is never stored: it
// ships as its own lazily-loaded chunk (`client.artwork.js`).  What the user
// owns is WHICH of a built-in's own actions each state plays — a handful of
// ids — so the payload is a few hundred bytes and every write goes straight
// through to localStorage.  There is no in-memory document to protect, no
// coalescing window and nothing to flush on `pagehide`.
//
// The in-memory copy still exists, and it still matters: `loadStored` memoizes
// the parse by the raw TEXT, so a write of ours (or another tab's) is noticed
// exactly once rather than on every read, and everything downstream (the
// document memo, the resolution memo) is keyed by object identity.

/** Schema version of the persisted JSON.  v10 dropped the custom artwork
 *  document and the paint box: the only thing left to store is the skin choice
 *  and the per-built-in state assignment. */
export const STORE_VERSION = 10;

export const STORE_KEY = 'status-pet:skin';
export const SKIN_EVENT = 'status-pet:skin-changed';

export interface StoredData {
  v?: number;
  skin?: string;
  /** Per-built-in assignment diff: `{ 'whale-chan': { tool: ['xie-daima'] } }`.
   *  Absent state key = follow the authored assignment; present-but-empty = the
   *  state deliberately plays nothing, so it follows idle. */
  builtinStates?: Record<string, Record<string, string[]>>;
  [key: string]: unknown;
}

// ── the in-memory truth ──

let state: StoredData | null = null;
/** The raw storage text `state` was parsed from (or written as). */
let lastRaw: string | null | undefined = undefined;

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
    // A document, not an array or a primitive: anything else is corrupt.
    return d && typeof d === 'object' && !Array.isArray(d) ? migrate(d as StoredData) : {};
  } catch {
    return {};
  }
}

/** The current store document.  Memoized: identical storage gives the identical
 *  object (the parse and the migration are not repeated), while a write — ours,
 *  or another tab's — is always noticed. */
export function loadStored(): StoredData {
  const raw = readRaw();
  if (state !== null && raw === lastRaw) return state;
  lastRaw = raw;
  state = parseRaw(raw);
  return state;
}

// ── the write path ──

let afterWrite: (() => void) | null = null;

/** Wire the store's reaction to a write (re-resolve ACTIVE + broadcast).  A
 *  hook instead of an import so that persistence and resolution stay separate
 *  modules with no cycle between them. */
export function onStoreWrite(fn: () => void): void {
  afterWrite = fn;
}

/** Merge a patch into the store and write it through.  Synchronous for every
 *  reader: the new document is live, ACTIVE is re-resolved and subscribers are
 *  notified before this returns, and the localStorage snapshot is already out.
 *  A refused write (quota, private mode) drops the in-memory document so the
 *  next read re-parses what storage actually holds instead of serving a lie. */
export function saveStored(patch: Partial<StoredData>): StoredData {
  const next = Object.assign({}, loadStored(), patch, { v: STORE_VERSION });
  state = next;
  const text = writeRaw(next);
  if (text === null) {
    state = null;
    lastRaw = undefined;
  } else {
    lastRaw = text;
  }
  if (afterWrite) afterWrite();
  return next;
}

/** Write the document, returning the text that went out (or null when the
 *  write failed). */
function writeRaw(doc: StoredData): string | null {
  let text: string;
  try {
    text = JSON.stringify(doc);
  } catch {
    return null;
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORE_KEY, text);
    }
    return text;
  } catch {
    return null;
  }
}

// ── version handling ──
//
// The assignment diff is the only version-dependent part, and it is small
// enough to migrate rather than drop.  v8 kept one diff per crop
// (`{ '32': {…}, '128': {…} }`); v9/v10 have ONE assignment, so the avatar's
// diff is the one that survives (it is the face that is always required, and
// the one the dock shows), and a diff that only ever existed for the body is
// kept rather than thrown away.  The custom artwork document and the paint box
// were dropped in v10 — the drawings and brushes they carried have no meaning
// to a build that cannot render them, and an unknown key is not read anyway.
//
// The skin CHOICE is version-independent and always survives.  A payload from a
// NEWER version keeps only that: its assignment may mean anything.
function flattenBuiltinStates(
  raw: unknown,
): Record<string, Record<string, string[]>> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, Record<string, string[]>> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const v = value as Record<string, unknown>;
    const perCrop = '32' in v || '128' in v;
    const picked = perCrop ? (v['32'] ?? v['128']) : v;
    if (!picked || typeof picked !== 'object' || Array.isArray(picked)) continue;
    out[name] = picked as Record<string, string[]>;
  }
  return Object.keys(out).length ? out : undefined;
}

function migrate(d: StoredData): StoredData {
  if (d.v === STORE_VERSION) return d;
  const { custom, colors, brushes, builtinStates, ...rest } = d;
  void custom; void colors; void brushes;
  const out: StoredData = { ...rest, v: STORE_VERSION };
  const states = flattenBuiltinStates(builtinStates);
  if (states) out.builtinStates = states;
  if (typeof d.v === 'number' && d.v > STORE_VERSION) {
    // An assignment written by a newer build is not ours to interpret.  (The
    // skin CHOICE stays: `storedName` falls back for any name we do not have.)
    delete out.builtinStates;
  }
  return out;
}
