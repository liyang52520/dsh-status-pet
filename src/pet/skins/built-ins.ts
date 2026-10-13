// The built-in skin registry — the only artwork there is.
//
// A built-in is PLAIN ARTWORK (see the `Artwork` type in compose.ts): a
// palette, ONE action library with both faces inside each action, and one state
// assignment.  Nothing is composed, mirrored or upscaled at load.
//
// The data is baked from raw gif material (now deleted) and shipped as a
// SEPARATE, lazily-loaded chunk (`client.artwork.js`), so ~16MB of frames never
// enter the main bundle.  Until that chunk arrives `SKINS` is empty and the pet
// draws nothing (a few milliseconds at boot, loaded in parallel);
// `installArtwork()` then swaps the registry in and the store re-resolves and
// broadcasts, so every canvas picks it up on its next frame.
//
// The baked file is still in the v8 shape (one library per crop) and is
// UPGRADED here through `upgradeArtwork`, the one door: it is FROZEN,
// hand-maintained data whose per-action provenance comments are the catalog of
// what shipped, so a codemod rewrite of 70k lines would risk that record for no
// runtime gain.  The upgrade shares every row string by reference — a pass over
// 106 actions, not a copy of 15 MB.

import { upgradeArtwork } from './compose.ts';
import type { Artwork, LibraryArtwork } from './compose.ts';

let SKINS: Record<string, Artwork> = {};

/** Every built-in's name.  Static, so the skin picker can render its cards
 *  before the artwork chunk has landed (the pixels arrive a frame later). */
export const BUILTIN_NAMES: readonly string[] = ['whale-chan'];

export const DEFAULT_SKIN = 'whale-chan';

/** Install the artwork chunk's data — called once, when it has loaded.  A
 *  document the door cannot understand is skipped rather than installed half
 *  read. */
export function installArtwork(art: Record<string, Artwork | LibraryArtwork>): void {
  const next: Record<string, Artwork> = {};
  for (const name of Object.keys(art)) {
    const doc = upgradeArtwork(art[name]);
    if (doc) next[name] = doc;
  }
  SKINS = next;
}

/** One built-in's artwork, or undefined while the chunk is still in flight.
 *  Already paired and v9-shaped. */
export function builtinArtwork(name: string): Artwork | undefined {
  return SKINS[name];
}

export type { Artwork };
