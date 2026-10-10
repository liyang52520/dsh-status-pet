// The built-in skin registry.
//
// A built-in is PLAIN ARTWORK: the same shape 我的创作 has (see the `Artwork`
// type in compose.ts) — a palette plus one framed animation per state, per
// crop.  Nothing is composed, mirrored or upscaled at load any more.
//
// The data is built from assets/*.gif by tools/gen-artwork.py and shipped as a
// SEPARATE, lazily-loaded chunk (`client.artwork.js`), so ~16MB of frames never
// enter the main bundle.  Until that chunk arrives `SKINS` is empty and the pet
// draws nothing (a few milliseconds at boot, loaded in parallel);
// `installArtwork()` then swaps the registry in and the store re-resolves and
// broadcasts, so every canvas picks it up on its next frame.
//
// The artwork is FROZEN data now: the generator that produced it (and its two
// inputs, assets/*.gif and tools/gif-map.json) are gone, so `artwork.gen.ts` is
// edited by hand.  tools/gen-artwork.py survives as the format reference and
// tools/ARTWORK.md as the catalog of what shipped.

import type { Artwork } from './compose.ts';

let SKINS: Record<string, Artwork> = {};

/** Every built-in's name.  Static, so the skin picker can render its cards
 * before the artwork chunk has landed (the pixels arrive a frame later). */
export const BUILTIN_NAMES: readonly string[] = ['whale-chan'];

export const DEFAULT_SKIN = 'whale-chan';

/** Install the artwork chunk's data — called once, when it has loaded. */
export function installArtwork(art: Record<string, Artwork>): void {
  SKINS = art;
}

/** Have we got the artwork yet?  The dock draws nothing until we do. */
export function isArtworkReady(): boolean {
  return Object.keys(SKINS).length > 0;
}

/** One built-in's artwork, or undefined while the chunk is still in flight. */
export function builtinArtwork(name: string): Artwork | undefined {
  return SKINS[name];
}

export type { Artwork };
