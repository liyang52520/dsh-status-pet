// The upgrade door: a stored artwork document of ANY version, as a valid v8
// document — or null when it cannot be understood (and the pet falls back
// instead of half-reading it).
//
// This is the single entrance for a v7 payload, a hand-written legacy JSON and
// a v8 document alike, so the storage migration and the import path share it.
// `looksLegacy` recognises the pre-v8 shape by its give-away: a `states` entry
// whose value is a list of take OBJECTS (v8 lists strings — action ids).

import { upgradeArtwork } from './compose.ts';
import type { Artwork, LegacyArtwork, LegacyStateTakes, Take } from './compose.ts';
import { artworkIsValid } from './validate.ts';

export function looksLegacy(art: unknown): boolean {
  const a = art as LegacyArtwork | null;
  if (!a || typeof a !== 'object' || !a.grids || typeof a.grids !== 'object') return false;
  for (const key of Object.keys(a.grids)) {
    const g = a.grids[Number(key)] as { library?: unknown; states?: LegacyStateTakes } | undefined;
    if (!g || typeof g !== 'object' || Array.isArray(g.library)) continue;
    if (!g.states || typeof g.states !== 'object') continue;
    for (const state of Object.keys(g.states)) {
      const list = g.states[state];
      if (!Array.isArray(list)) continue;
      if (!list.length) return true;
      const first = list[0] as Take;
      if (first && typeof first === 'object' && Array.isArray(first.frames)) return true;
    }
  }
  return false;
}

export function convertArtwork(custom: unknown): Artwork | null {
  if (!custom || typeof custom !== 'object') return null;
  if (artworkIsValid(custom)) return custom as Artwork;
  if (!looksLegacy(custom)) return null;
  const upgraded = upgradeArtwork(custom as LegacyArtwork);
  return artworkIsValid(upgraded) ? upgraded : null;
}
