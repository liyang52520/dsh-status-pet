// The artwork chunk — the built-in frames, as data.
//
// This file compiles to `client.artwork.js` (a sibling of `client.js` in the
// plugin directory).  The module loader serves sibling `client.*.js` files on
// demand, and client.js asks for this one with `require.async`.  The ~16MB of
// frames stay out of the main bundle.

import { CATALOG } from './skin/catalog.ts';

declare const window: {
  __ModuleLoader__: {
    load: (def: { id: string; chunk: string; factory: () => unknown }) => void;
  };
};

window.__ModuleLoader__.load({
  id: '@local/dsh-status-pet',
  chunk: 'client.artwork.js',
  factory() {
    return { CATALOG };
  },
});
