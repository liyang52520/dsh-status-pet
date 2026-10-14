// plugin.ts — the plugin's public surface, slot registration and the lazy
// artwork chunk loader.  Everything but the `window.__ModuleLoader__.load`
// call, which lives in index.ts.

import { DockPet } from './view/dock/pill.ts';
import { SettingsPage } from './view/settings/page.ts';
import { PetCanvas } from './view/pet-canvas.ts';
import { ActionViewer } from './view/settings/action-panel.ts';
import { SkinCards } from './view/settings/skin-cards.ts';

import { FACES, LIVE_ZOOM } from './skin/geometry.ts';
import { tickerCount } from './platform/clock.ts';
import { DEFAULT_SKIN, BUILTIN_SKINS } from './skin/registry.ts';
import { KEY, SCHEMA, CHANGE_EVENT, readStored, writeStored } from './skin/storage.ts';
import { activeSkin, bestSkin, skinFor, actionSkinFor, chooseSkin, saveAssignments, installCatalog, onSkinChange } from './skin/session.ts';
import { resolveSkin, resolveActionSkin, blankSkin } from './skin/resolve.ts';
import { documentOf, libraryOf } from './skin/documents.ts';
import { applyDiff, diffOf } from './skin/overrides.ts';
import { assign, setSelection, usedBy, library, usageIndex, withStates, actionById } from './skin/library.ts';
import { faceFor, hasBody, hasActionBody, offsetScale, upscaleDrawing } from './skin/face.ts';
import { TRANSPARENT, PIXEL_CHARS, hexPixel, pixelAt, rowPixels, parseSprite, spriteFor, spriteToRows } from './skin/pixels.ts';
import { MAX_SELECTION, MAX_ACTIONS, MAX_FRAMES, DEFAULT_FRAME_MS } from './skin/model.ts';

// The dock entry's position is fixed.
export const DOCK_ORDER = -1000;

export function loadArtworkChunk(require: (spec: string) => unknown): void {
  const async = (require as { async?: (spec: string) => Promise<unknown> }).async;
  if (typeof async !== 'function') return;
  async('./client.artwork.js').then((mod) => {
    const catalog = (mod as { CATALOG?: Record<string, unknown> } | null)?.CATALOG;
    if (catalog && typeof catalog === 'object') installCatalog(catalog);
  }).catch(() => {});
}

interface PluginContext {
  effect: (fn: () => () => void) => void;
  locale: {
    register: (ns: string, labels: Record<string, Record<string, string>>) => () => void;
    bind: (ns: string) => (key: string, params?: Record<string, unknown>) => string;
  };
  slots: {
    inject: (name: string, fn: () => unknown) => void;
    register: (opts: { name: string; id: string; order: number; label: () => string; locale: string }, component: unknown) => unknown;
  };
}

export function applyPlugin(ctx: PluginContext, ns: string, labels: Record<string, Record<string, string>>): void {
  ctx.effect(() => ctx.locale.register(ns, labels));
  const t = ctx.locale.bind(ns);
  ctx.slots.inject('conversation.composer.dock', () =>
    ctx.slots.register({ name: 'conversation.composer.dock', id: 'status-pet', order: DOCK_ORDER, label: () => t('label'), locale: ns }, DockPet));
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register({ name: 'settings.section', id: 'status-pet', order: 30, label: () => t('settings.nav'), locale: ns }, SettingsPage));
}

// ── public surface ──

/** The skin layer, exposed for embedders and the test suite. */
export const skinTools = {
  // ── model ──
  DEFAULT_SKIN,
  BUILTIN_NAMES: BUILTIN_SKINS,
  MAX_TAKES: MAX_SELECTION,
  MAX_LIBRARY: MAX_ACTIONS,
  MAX_FRAMES,
  DEFAULT_FRAME_MS,
  // ── geometry ──
  GRIDS: FACES,  // backwards compat alias
  FACES,
  LIVE_ZOOM,
  // ── storage ──
  STORE_KEY: KEY,
  SKIN_EVENT: CHANGE_EVENT,
  SCHEMA,
  loadStored: readStored,
  saveStored: writeStored,
  onStoreWrite: (fn: () => void) => { /* no-op — session owns the wiring */ },
  // ── session ──
  activeSkin,
  /** How many surfaces are attached to the shared frame clock right now.
   *  Off-screen canvases must not be among them (platform/visibility.ts). */
  tickerCount,
  resolveBestSkin: bestSkin,
  resolveSkin: (storedLike: unknown) => {
    // adapter: old signature resolved from a stored-like object
    if (storedLike && typeof storedLike === 'object') {
      const s = storedLike as { skin?: string };
      if (s.skin) chooseSkin(s.skin);
    }
    return activeSkin();
  },
  resolveNamedSkin: (name: string, face?: unknown) => skinFor(name, (typeof face === 'string' ? face as any : void 0)),
  resolveTakeSkin: actionSkinFor,
  installSkinArtwork: installCatalog,
  refreshActiveSkin: () => { /* identity-keyed cache, no-op */ },
  chooseSkin,
  saveSkinStates: saveAssignments,
  onSkinChange,
  // ── documents ──
  skinArtwork: (name: string) => documentOf(name),
  skinLibrary: libraryOf,
  artworkDoc: documentOf,
  artworkOverrides: diffOf,
  withOverrides: applyDiff,
  // ── library ──
  actionsOf: (art: { actions: readonly unknown[] }) => art.actions,
  assignTake: assign,
  setStateSelection: setSelection,
  libraryInfo: library,
  usageIndex,
  usedBy,
  withStates: withStates as unknown as (art: any, states: Record<string, string[]>) => any,
  // ── pixels ──
  TRANSPARENT, PIXEL_CHARS, hexPixel, pixelAt, rowPixels,
  parseFrame: parseSprite,
  spriteFor,
  spriteToRows,
  // ── face ──
  cellFor: faceFor,   // backwards compat name
  upscaleCell: upscaleDrawing,
  hasBody,
  hasActionBody,
  offsetScale,
  // ── ui ──
  ui: {
    SkinPicker: SkinCards,
    PetPreview: PetCanvas,
    PetCanvas,
    ActionViewer,
    PixelEditor: void 0,
  },
};