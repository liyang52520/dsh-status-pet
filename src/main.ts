// Main — the bundle entry.  Registers the factory with the DSH client
// module loader.  The factory receives the loader's `require`, funnels it
// into host-deps.ts (the only place bare specifiers resolve), and returns
// the plugin's inject/apply contract.  Factories stay side-effect free
// until the loader materializes them.

import { initHostDeps } from './host-deps.ts';
import { GRIDS } from './pet/grids.ts';
import { LABELS, NS } from './pet/labels.ts';
import { DEFAULT_SKIN } from './pet/skins/built-ins.ts';
import {
  STORE_KEY,
  SKIN_EVENT,
  validateArtwork,
  artworkErrors,
  flushStored,
  serializeArtwork,
  parseArtworkExport,
  loadStored,
  saveStored,
  resolveSkin,
  resolveBestSkin,
  resolveNamedSkin,
  activeSkin,
  installSkinArtwork,
  loadBrushes,
  adoptRows,
  skinLibrary,
  resolveTakeSkin,
  libraryInfo,
  usageIndex,
  usedBy,
  assignTake,
  setStateSelection,
  addLibraryTake,
  removeLibraryTake,
  renameLibraryTake,
  replaceLibraryTake,
  upgradeArtwork,
  convertArtwork,
  MAX_TAKES,
  MAX_LIBRARY,
  MAX_FRAMES,
  MAX_PALETTE,
} from './pet/skins/store.ts';
import { DockPet } from './ui/dock-pet.ts';
import { SettingsPage } from './ui/settings/page.ts';
import { SkinPicker } from './ui/settings/skin-picker.ts';
import { PixelEditor } from './ui/settings/pixel-editor.ts';
import { PetPreview } from './ui/pet-preview.ts';

// The dock entry's position is fixed: −1000 is below every shipped entry,
// so the pet sits at the far left of the dock.  Position is intentionally
// NOT user-configurable: the dock's trailing "context used" meter is
// hardcoded by the host OUTSIDE the slot, so a "rightmost" pet could never
// actually be rightmost — a half-working position setting would read as a
// bug.
const DOCK_ORDER = -1000;

// The artwork is a SEPARATE, lazily-loaded chunk.  The module loader serves
// sibling files named `client.<something>.js` from this plugin's own directory
// on demand (`require.async`), so ~16MB of frames never enter this bundle.  It
// is requested at the earliest possible moment — the factory runs before the
// dock mounts — and the pet simply draws an empty canvas until it lands.
// The artwork is FROZEN data now: its raw material (the source gifs and the
// recipe that mapped them) was deleted, so src/artwork.gen.ts is the source
// of truth and is edited by hand when a built-in action needs a fix.
function loadArtworkChunk(require: (spec: string) => unknown): void {
  const async = (require as { async?: (spec: string) => Promise<unknown> }).async;
  if (typeof async !== 'function') return;   // a host without chunk support: the pet stays blank
  async('./client.artwork.js').then((mod) => {
    const art = (mod as { ARTWORK?: Record<string, never> } | null)?.ARTWORK;
    if (art && typeof art === 'object') installSkinArtwork(art);
  }).catch(() => {
    // A missing or broken chunk must not take the dock down with it.
  });
}

declare const window: {
  __ModuleLoader__: { load: (def: unknown) => void };
};

interface SlotRegistrationOptions {
  name: string;
  id: string;
  order: number;
  label: () => string;
  locale: string;
}

interface PluginContext {
  effect: (fn: () => () => void) => void;
  locale: {
    register: (ns: string, labels: typeof LABELS) => () => void;
    bind: (ns: string) => (key: string, params?: Record<string, unknown>) => string;
  };
  slots: {
    inject: (name: string, fn: () => unknown) => void;
    register: (opts: SlotRegistrationOptions, component: unknown) => () => void;
  };
}

window.__ModuleLoader__.load({
  id: '@local/dsh-status-pet',
  factory(require: (spec: string) => any) {
    initHostDeps(require);
    loadArtworkChunk(require);
    return {
      inject: ['slots', 'locale'],
      // Exposed for the test suite (and anyone embedding the artwork): the
      // pure skin helpers plus the customisation components.  The host
      // ignores unknown fields.
      skinTools: {
        STORE_KEY,
        SKIN_EVENT,
        DEFAULT_SKIN,
        GRIDS,
        validateArtwork,
        // The memoized gate and the write buffer: `artworkErrors` is what the
        // store itself asks (keyed by document identity), and `flushStored`
        // forces a coalesced snapshot out — the editing session keeps its
        // document in memory and writes localStorage in bursts.
        artworkErrors,
        flushStored,
        serializeArtwork,
        parseArtworkExport,
        loadStored,
        saveStored,
        resolveSkin,
        resolveBestSkin,
        resolveNamedSkin,
        activeSkin,
        installSkinArtwork,
        // The action library: the assignment operations, the upgrade door and
        // the read-outs the Workshop renders from.
        upgradeArtwork,
        convertArtwork,
        skinLibrary,
        resolveTakeSkin,
        libraryInfo,
        usageIndex,
        usedBy,
        assignTake,
        setStateSelection,
        addLibraryTake,
        removeLibraryTake,
        renameLibraryTake,
        replaceLibraryTake,
        MAX_TAKES,
        MAX_LIBRARY,
        MAX_FRAMES,
        MAX_PALETTE,
        adoptRows,
        loadBrushes,
        ui: { SkinPicker, PixelEditor, PetPreview },
      },
      apply(ctx: PluginContext) {
        ctx.effect(() => ctx.locale.register(NS, LABELS));
        const t = ctx.locale.bind(NS);

        // `slots.inject` re-runs the callback every time the dock slot
        // collapses and is re-declared (composer remounts, view switches).
        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register({
            name: 'conversation.composer.dock',
            id: 'status-pet',
            order: DOCK_ORDER,
            // A thunk is re-read on every projection, so the label follows
            // the active locale without re-registering.
            label: () => t('label'),
            locale: NS,
          }, DockPet)
        );

        // The pet's own settings tab, beside General / Models / Plugins.
        // The shell builds the nav from `settings.section` entries: the id
        // is the section key, the label thunk follows the active locale,
        // and the page renders in the content column.  If the settings UI
        // package is absent the inject simply never fires and the pet keeps
        // working.
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register({
            name: 'settings.section',
            id: 'status-pet',
            order: 30, // general 0, models 10, plugins 15, agent-presets 20
            label: () => t('settings.nav'),
            locale: NS,
          }, SettingsPage)
        );
      },
    };
  },
});
