// The upgrade door, as the store spells it: "give me a RENDERABLE v9 document,
// or null".
//
// `upgradeArtwork` (compose.ts) knows every older shape and converts it; this
// module adds the one thing the store additionally requires — that the result
// passes validation.  A document that cannot be understood is dropped so the
// pet falls back instead of half-reading it.
//
// The recognisers are re-exported here because this is the module the rest of
// the project reads shape questions from.

import { upgradeArtwork, looksV7, looksV8, looksV9 } from './compose.ts';
import type { Artwork } from './compose.ts';
import { artworkIsValid } from './validate.ts';

/** A stored artwork document of ANY version, as a valid v9 document — or null
 *  when it cannot be understood.  The single entrance for a v7 payload, a v8
 *  payload, a hand-written JSON and a v9 document alike, so the storage
 *  migration and the import path share it. */
export function convertArtwork(custom: unknown): Artwork | null {
  if (!custom || typeof custom !== 'object') return null;
  const upgraded = upgradeArtwork(custom);
  if (!upgraded) return null;
  return artworkIsValid(upgraded) ? upgraded : null;
}

export { looksV7, looksV8, looksV9 };

/** The pre-v9 spelling of `looksV7`, kept for embedders and tests. */
export const looksLegacy = looksV7;
