// The skin store — the FACADE.
//
// The wardrobe is five focused modules, and this file is the single import
// surface the rest of the project (and the suite) keeps using:
//
//   compose.ts    the PAIRED model (one action, two faces), the pixel format,
//                 and the one shape door (the baked v8 chunk → v9)
//   library.ts    the library reads + the state assignment (who plays what)
//   storage.ts    the persisted document: the skin choice and the diff
//   documents.ts  artwork document reads, the assignment diff, write-back
//   resolve.ts    artwork → render-ready skins, ACTIVE, the change broadcast
//
// There is no customisation pipeline any more.  What the user owns is a few ids
// per state; the pixels are authored, so every cache here can be a WeakMap keyed
// by object identity precisely because the artwork never changes at runtime.

// ── the model ──
export type {
  PropArt, Frame, Take, LibraryTake, GridArtwork, LibraryArtwork,
  Cell, FrameCells, ActionFrame, Action, Artwork, Sprite,
} from './compose.ts';
export {
  parseFrame, spriteToRows, upscaleCell, cellFor, hexPixel, pixelAt, rowPixels,
  TRANSPARENT, PIXEL_CHARS, MAX_TAKES, MAX_LIBRARY, MAX_FRAMES, DEFAULT_FRAME_MS,
  spriteFor, pairArtwork, upgradeArtwork, looksV8, looksV9,
  hasBody, hasActionBody, offsetScale,
} from './compose.ts';

export { DEFAULT_SKIN, BUILTIN_NAMES } from './built-ins.ts';

// ── persistence ──
export { STORE_KEY, SKIN_EVENT, STORE_VERSION, loadStored, saveStored } from './storage.ts';
export type { StoredData } from './storage.ts';

// ── resolution ──
export {
  resolveSkin, resolveBestSkin, resolveNamedSkin, resolveTakeSkin, usableGrid,
  activeSkin, refreshActiveSkin, installSkinArtwork, onSkinChange,
} from './resolve.ts';
export type { ResolvedFrame, ResolvedTake, ResolvedState, ResolvedSkin } from './resolve.ts';

// ── documents ──
export {
  artworkDoc, skinArtwork, skinLibrary, saveSkinStates, artworkOverrides, withOverrides,
} from './documents.ts';
export type { LibraryEntryInfo, StateOverride } from './documents.ts';

// ── the library ──
export {
  actionsOf, withStates, libraryInfo, usageIndex, usedBy,
  assignTake, setStateSelection,
} from './library.ts';
