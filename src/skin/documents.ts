// The document reads: a named skin with the user's assignment applied.
//
// `documentOf` is the ONE read the Workshop and the resolution share, so they
// can never disagree about what a skin currently is.  It is memoized per store
// revision — and because `readStored` hands back the very same object until
// storage actually changes, a resolution cache upstream can key on the artwork
// it returns.

import { applyDiff, diffOf } from './overrides.ts';
import { artworkOf, isBuiltin } from './registry.ts';
import { library } from './library.ts';
import type { ActionInfo } from './library.ts';
import type { Artwork } from './model.ts';
import { readStored } from './storage.ts';
import type { Stored } from './storage.ts';

let DOCS = new WeakMap<Stored, Map<string, Artwork | null>>();

/** Called when the artwork chunk lands: a document that used to be null may now
 *  be real.  Every cache upstream (resolution memo, session active) is keyed by
 *  the stored object OR the artwork object, and both are still valid — but the
 *  *registry* changed behind them, so the store's "is this name a built-in that
 *  has artwork?" answer can flip from no to yes.  Clearing this one cache and
 *  letting the session re-resolve is all that is needed. */
export function clearDocumentCache(): void {
  DOCS = new WeakMap();
}

/** One named skin's artwork with the user's assignment applied, or null. */
export function documentOf(name: string): Artwork | null {
  if (!isBuiltin(name)) return null;
  const stored = readStored();
  let byName = DOCS.get(stored);
  if (byName && byName.has(name)) return byName.get(name)!;
  const value = applyDiff(artworkOf(name), diffOf(stored, name)) || null;
  if (!byName) {
    byName = new Map();
    DOCS.set(stored, byName);
  }
  byName.set(name, value);
  return value;
}

/** A skin's library, as the Workshop reads it. */
export function libraryOf(name: string): ActionInfo[] {
  const art = documentOf(name);
  return art ? library(art) : [];
}
