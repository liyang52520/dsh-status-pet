// The built-in registry — the only artwork there is.
//
// A built-in is a plain `Artwork` document (skin/model.ts).  The data ships as a
// SEPARATE, lazily-loaded chunk (client.artwork.js), so ~16MB of frames never
// enter the main bundle: `installCatalog` swaps the registry in when the chunk
// lands, and the live wardrobe re-resolves and broadcasts, so every canvas picks
// the pixels up on its next frame.
//
// Until then the registry is empty and the pet draws nothing — a few
// milliseconds at boot, loaded in parallel with the dock.

import type { Artwork } from './model.ts';

/** Every built-in's name.  Static, so the skin cards can render before the
 *  artwork chunk has landed (the pixels arrive a frame later). */
export const BUILTIN_SKINS: readonly string[] = ['whale-chan'];

export const DEFAULT_SKIN = 'whale-chan';

let catalog: Record<string, Artwork> = {};

/** Install the artwork chunk: a document the registry cannot read is skipped
 *  rather than installed half read. */
export function installCatalog(documents: Record<string, unknown>): void {
  const next: Record<string, Artwork> = {};
  for (const name of Object.keys(documents || {})) {
    const doc = documents[name] as Artwork | undefined;
    if (doc && typeof doc === 'object' && Array.isArray(doc.actions)) next[name] = doc;
  }
  catalog = next;
}

/** One built-in's artwork, or undefined while the chunk is still in flight. */
export function artworkOf(name: string): Artwork | undefined {
  return catalog[name];
}

export function isBuiltin(name: unknown): name is string {
  return typeof name === 'string' && BUILTIN_SKINS.includes(name);
}
