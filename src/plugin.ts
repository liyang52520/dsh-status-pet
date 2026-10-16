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
import { documentOf, libraryOf } from './skin/documents.ts';
import { MAX_SELECTION } from './skin/model.ts';

// The dock entry's position is fixed.
export const DOCK_ORDER = -1000;

export function loadArtworkChunk(require: (spec: string) => unknown): void {
  const async = (require as { async?: (spec: string) => Promise<unknown> }).async;
  if (typeof async !== 'function') return;
  const load = (attempt: number): void => {
    async('./client.artwork.js').then((mod) => {
      const catalog = (mod as { CATALOG?: Record<string, unknown> } | null)?.CATALOG;
      if (!catalog || typeof catalog !== 'object') throw new Error('the artwork chunk carried no CATALOG');
      installCatalog(catalog);
    }).catch((err: unknown) => {
      // A missing artwork chunk must not take the dock down with it — the pet
      // degrades to a blank canvas.  But it must not be SILENT either: this used
      // to be `.catch(() => {})`, which left "the pet is blank forever" with no
      // clue anywhere.  One quiet retry, then say so on the console.
      if (attempt < 1) {
        setTimeout(() => load(attempt + 1), 2000);
        return;
      }
      try {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[status-pet] the artwork chunk did not load; the pet will stay blank', err);
        }
      } catch {
        // no console: stay silent, exactly as before.
      }
    });
  };
  load(0);
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

/** The plugin's public surface: the reads and writes an embedder (or another
 *  plugin) can honestly use.  It is deliberately SMALL — the previous version was
 *  a dumping ground of aliases (`GRIDS`, `cellFor`, `upscaleCell`), no-op stubs
 *  and the pixel codec, all kept alive "for the test suite" after that suite was
 *  deleted.  Tests import the modules directly; this object is for the host. */
export const skinTools = {
  // ── names and geometry ──
  DEFAULT_SKIN,
  BUILTIN_NAMES: BUILTIN_SKINS,
  FACES,
  LIVE_ZOOM,
  MAX_SELECTION,
  // ── storage ──
  STORE_KEY: KEY,
  SCHEMA,
  SKIN_EVENT: CHANGE_EVENT,
  loadStored: readStored,
  saveStored: writeStored,
  // ── the live wardrobe ──
  activeSkin,
  bestSkin: bestSkin,
  skinFor,
  actionSkinFor,
  chooseSkin,
  saveAssignments,
  installCatalog,
  onSkinChange,
  /** How many surfaces are attached to the shared frame clock right now.
   *  Off-screen canvases must not be among them (platform/visibility.ts). */
  tickerCount,
  // ── documents ──
  skinArtwork: (name: string) => documentOf(name),
  skinLibrary: libraryOf,
  // ── ui ──
  ui: {
    SkinPicker: SkinCards,
    PetPreview: PetCanvas,
    PetCanvas,
    ActionViewer,
  },
};
