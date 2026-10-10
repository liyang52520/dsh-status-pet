// The skin store — the FACADE.
//
// The wardrobe used to be one 1,200-line module that validated artwork, owned
// persistence, resolved skins, ran the library ops and held the editor
// primitives, all with their caches tangled together.  It is now six focused
// modules, and this file is the single import surface the rest of the project
// (and the suite) keeps using:
//
//   compose.ts    the frame/action model, the pixel format, library identity
//   validate.ts   the artwork validator + the identity-keyed validation memo
//   convert.ts    the pre-v8 → v8 upgrade door
//   paint.ts      the pure pixel primitives the studio draws with
//   library.ts    reference maintenance (who plays what) + the usage index
//   storage.ts    the persisted document and the coalesced write policy
//   documents.ts  artwork document reads, assignment write-back, import/export
//   resolve.ts    artwork → render-ready skins, ACTIVE, the change broadcast
//
// Why the split is not cosmetic: each module now OWNS its invalidation rule,
// and every rule is the same one — object identity.  Artwork is immutable, so
// a document, an action or a frame that did not change is the same object, and
// every cache in the wardrobe can be a WeakMap keyed by it.  That is what lets
// a painted pixel re-validate one action, re-parse one frame and re-render one
// bitmap instead of the whole 15 MB document.

// ── the model ──
export type {
  Frame, Take, LibraryTake, GridArtwork, Artwork, LegacyArtwork, Sprite,
} from './compose.ts';
export {
  parseFrame, spriteToRows, upscalePixels, hexPixel, pixelAt, rowPixels,
  TRANSPARENT, PIXEL_CHARS, MAX_TAKES, MAX_LIBRARY, MAX_FRAMES, DEFAULT_FRAME_MS,
  takeKey, freeTakeId, upgradeArtwork, spriteFor,
} from './compose.ts';

export { DEFAULT_SKIN } from './built-ins.ts';

// ── validation ──
export { validateArtwork, artworkErrors, artworkIsValid, MAX_PALETTE } from './validate.ts';
export { convertArtwork } from './convert.ts';

// ── persistence ──
export {
  STORE_KEY, SKIN_EVENT, STORE_VERSION, BRUSH_COUNT,
  defaultBrushes, resolveBrushes, loadBrushes,
  loadStored, saveStored, flushStored,
} from './storage.ts';
export type { CustomArtwork, StoredData } from './storage.ts';

// ── resolution ──
export {
  resolveSkin, resolveBestSkin, resolveNamedSkin, resolveTakeSkin,
  activeSkin, refreshActiveSkin, installSkinArtwork, onSkinChange,
} from './resolve.ts';
export type { ResolvedState, ResolvedSkin } from './resolve.ts';

// ── documents ──
export {
  artworkDoc, skinArtwork, loadCustomArtwork, skinLibrary, saveSkinStates,
  seedArtworkFrom, serializeArtwork, parseArtworkExport, withOverrides,
} from './documents.ts';
export type { LibraryEntryInfo, ParseResult } from './documents.ts';

// ── the library ──
export {
  gridArtwork, withGridArtwork, libraryInfo, usageIndex, usedBy,
  assignTake, setStateSelection, addLibraryTake, removeLibraryTake,
  removeLibraryTakes, removalIsBlocked,
  renameLibraryTake, replaceLibraryTake, overwriteLibraryTake,
} from './library.ts';

// ── pixels ──
export { blankRows, findOrAdd, adoptRows, paintCell, shiftRows } from './paint.ts';
