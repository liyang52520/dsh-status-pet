// dump-artwork.mjs — print one skin's SHIPPED artwork as JSON.
//
//   node tools/dump-artwork.mjs [skin]        # default: whale-chan
//
// Built for tools/gen-readme-media.py (the README imagery renderer) and handy
// on its own when you want to inspect the baked frames without the browser.
// The JSON is exactly what the store resolves from: the palette, both grids'
// geometry (canvas size, baseY, padX, maxOffset) and every take's frames
// (rows, dx/dy, prop).  Both locales' labels ride along, so captions can use
// the app's own strings instead of a second copy.

import { GRIDS } from '../src/pet/grids.ts';
import { LABELS } from '../src/pet/labels.ts';
import { ARTWORK } from '../src/artwork.gen.ts';

const skin = process.argv[2] || 'whale-chan';
const art = ARTWORK[skin];
if (!art) {
  console.error(`unknown skin "${skin}" — have: ${Object.keys(ARTWORK).join(', ')}`);
  process.exit(1);
}

const grids = {};
for (const [key, spec] of Object.entries(GRIDS)) {
  const states = art.grids[spec.grid] && art.grids[spec.grid].states;
  if (states) grids[key] = { ...spec, states };
}

process.stdout.write(JSON.stringify({ skin, palette: art.palette, grids, labels: LABELS }));
