// Persistence: the one JSON document in localStorage.
//
//   { "v": 1,                       this schema
//     "skin": "whale-chan",         which built-in is active
//     "assignments": { … } }        per-skin assignment diff (skin/overrides.ts)
//
// That is ALL of it.  The artwork is authored data and is never stored: it ships
// as its own lazily-loaded chunk.  What a user owns is WHICH of a skin's own
// actions each state plays — a handful of ids — so the payload is a few hundred
// bytes and every write goes straight through to localStorage.  There is no
// in-memory document to protect, no coalescing window and nothing to flush on
// `pagehide`.
//
// A payload that is NOT this schema is deliberately not interpreted: an older
// install's document described a different model, and guessing at foreign data
// would be worse than starting from the defaults.  Reading such a payload yields
// an empty store, and the next write replaces it.
//
// The in-memory copy still matters: `readStored` memoizes the parse by the raw
// TEXT, so every downstream cache can be keyed by store object identity — a
// write of ours (or another tab's) is noticed exactly once.

/** Schema version of the persisted JSON. */
export const SCHEMA = 1;
export const KEY = 'status-pet:skin';
export const CHANGE_EVENT = 'status-pet:skin-changed';

export interface Stored {
  v?: number;
  skin?: string;
  /** Per-skin assignment diff: `{ 'whale-chan': { tool: ['xie-daima'] } }`. */
  assignments?: Record<string, Record<string, string[]>>;
  /** Where the dock shows the speech line: 'off' | 'left' | 'right'.
   *  Absent means the default (see skin/display.ts). */
  dockText?: string;
  /** How wide the (fixed) dock line box is: 'narrow' | 'medium' | 'wide'.
   *  Absent means the default (see skin/display.ts). */
  dockLineWidth?: string;
}

// ── reading ──

let memo: Stored | null = null;
/** The raw text `memo` was parsed from (or written as). */
let memoRaw: string | null | undefined = undefined;

function rawText(): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function parse(text: string | null): Stored {
  if (!text) return {};
  try {
    const doc: unknown = JSON.parse(text);
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return {};
    // Anyone else's document: read as empty, never guessed at.
    if ((doc as Stored).v !== SCHEMA) return {};
    return doc as Stored;
  } catch {
    return {};
  }
}

/** The current store document.  Identical storage gives the identical OBJECT,
 *  so callers can memoize on it; a write — ours, or another tab's — is always
 *  noticed. */
export function readStored(): Stored {
  const text = rawText();
  if (memo !== null && text === memoRaw) return memo;
  memoRaw = text;
  memo = parse(text);
  return memo;
}

// ── writing ──

let afterWrite: (() => void) | null = null;

/** Wire the store's reaction to a write (re-resolve + broadcast).  A hook
 *  instead of an import, so persistence and the live wardrobe stay separate
 *  modules with no dependency between them. */
export function onWrite(fn: () => void): void {
  afterWrite = fn;
}

/** Merge a patch into the store and write it through.  Synchronous for every
 *  reader: the new document is live, the live wardrobe has re-resolved and
 *  subscribers are notified before this returns, and the localStorage snapshot
 *  is already out.  A REFUSED write (quota, private mode) drops the in-memory
 *  document so the next read re-parses what storage actually holds instead of
 *  serving a lie. */
export function writeStored(patch: Partial<Stored>): Stored {
  const next: Stored = { ...readStored(), ...patch, v: SCHEMA };
  memo = next;
  const text = writeRaw(next);
  if (text === null) {
    memo = null;
    memoRaw = undefined;
  } else {
    memoRaw = text;
  }
  if (afterWrite) afterWrite();
  return next;
}

function writeRaw(doc: Stored): string | null {
  let text: string;
  try {
    text = JSON.stringify(doc);
  } catch {
    return null;
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(KEY, text);
    }
    return text;
  } catch {
    return null;
  }
}
