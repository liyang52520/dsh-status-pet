// The artwork chunk — the built-in frames, as data.
//
// This file compiles to `client.artwork.js` (a sibling of `client.js` in the
// plugin directory).  The module loader serves sibling `client.*.js` files on
// demand, and client.js asks for this one with
// `require.async('./client.artwork.js')`, so the ~16MB of frames stay out of
// the main bundle and are fetched once, then served from the immutable cache.
//
// The data itself is FROZEN: it was generated once from raw gif material that
// has since been deleted from this repo, along with the generator and its
// recipe.  `src/artwork.gen.ts` is therefore the source of truth and IS edited
// by hand; its per-action provenance comments are the catalog of what shipped.

import { ARTWORK } from './artwork.gen.ts';

declare const window: {
  __ModuleLoader__: { load: (def: unknown) => void };
};

window.__ModuleLoader__.load({
  // Same package id as client.js: the loader keys a chunk by
  // `<ownerId>/<chunk>`, and `chunk` must match /^client\..*\.js$/.
  id: '@local/dsh-status-pet',
  chunk: 'client.artwork.js',
  factory() {
    return { ARTWORK };
  },
});
