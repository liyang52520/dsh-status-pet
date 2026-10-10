// How much does the DOM pixel board cost to BUILD?
//
// The board is `grid × grid` elements — 16,384 of them at the 128px crop, each
// with its own props bag, style object and three handlers.  Node cannot lay
// out a DOM, but the JS half of that (createElement + the closures the real
// component passes) is measurable, and it is the floor: the browser then has to
// create, style and lay out the same 16,384 nodes on top.
import { time, section } from './harness.mjs';

const h = (type, props, ...children) => ({ type, props, children });
const palette = Array.from({ length: 256 }, (_, i) => '#0' + i.toString(16).padStart(5, '0'));
const row = '01'.repeat(128);

function buildBoard(grid, cache) {
  const rows = [];
  for (let y = 0; y < grid; y++) {
    // The real board caches the WHOLE row element and reuses it untouched.
    const key = y + ':' + row;
    const hit = cache.get(key);
    if (hit) { rows.push(hit); continue; }
    const cells = Array.from({ length: grid }, (_, x) => h('div', {
      key: x,
      className: 'status-pet-cell',
      style: { background: x % 3 ? palette[x % 256] : 'transparent' },
      onPointerDown: (e) => { if (e && e.button === 2) paint(y, x); else paint(y, x); },
      onContextMenu: (e) => { if (e && e.preventDefault) e.preventDefault(); },
      onPointerEnter: (e) => { if (e && (e.buttons ?? 0) >= 1) paint(y, x); },
    }));
    const built = h('div', { className: 'status-pet-grid-row', key: y }, cells);
    cache.set(key, built);
    rows.push(built);
  }
  return rows;
}
let painted = 0;
function paint(y, x) { painted = y * 1000 + x; }

section('building the board (128 × 128 = 16,384 cells)');
time('cold build (empty row cache)', () => buildBoard(128, new Map()), 3);
const warm = new Map();
time('rebuild with a warm row cache (a stroke)', () => buildBoard(128, warm), 20);

section('building the board (32 × 32 = 1,024 cells)');
time('cold build', () => buildBoard(32, new Map()), 5);

console.log(`\n  (painted ${painted} — the handlers are real closures)`);
