// Entry — the client bundle (client.js).  Registers the status-pet plugin with
// the DSH module loader.

import { initHostDeps } from './platform/deps.ts';
import { NS, LABELS } from './labels/index.ts';
import { loadArtworkChunk, applyPlugin, skinTools } from './plugin.ts';

declare const window: {
  __ModuleLoader__: {
    load: (def: { id: string; factory: (require: (spec: string) => unknown) => unknown }) => void;
  };
};

window.__ModuleLoader__.load({
  id: '@local/dsh-status-pet',
  factory(require) {
    initHostDeps(require);
    loadArtworkChunk(require);
    return {
      inject: ['slots', 'locale'],
      skinTools,
      apply(ctx: unknown) {
        applyPlugin(ctx as Parameters<typeof applyPlugin>[0], NS, LABELS);
      },
    };
  },
});