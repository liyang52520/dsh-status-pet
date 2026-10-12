// The store hot paths an editing session actually pays for:
//   * loading a seeded 我的创作 document (the built-in library, both faces)
//   * the FIRST look at it — validation and resolution cold
//   * ONE paint stroke (the editor's commit: mutate + persist + re-resolve)
//   * a burst of strokes (what a drag actually is)
//   * switching skin while a big document sits in storage
//   * opening the gallery (24 live action previews)
//
// "Cold" means the document has never been seen by any cache; "warm" means the
// same immutable document is asked for again.  Both matter: art is immutable,
// so a warm ask is the common one, but the first open must not be a stall.
import { stubWindow, time, section } from './harness.mjs';

const net = stubWindow();

const store = await import('../src/pet/skins/store.ts');
const { ARTWORK } = await import('../src/artwork.gen.ts');
const { AVATAR_GRID, BODY_GRID } = await import('../src/pet/grids.ts');

store.installSkinArtwork(ARTWORK);

section('cold: the artwork chunk lands');
time('installSkinArtwork + first resolve', () => {
  store.installSkinArtwork(ARTWORK);
  store.resolveBestSkin();
}, 3);

section('the seeded 我的创作 document (both faces)');
let custom;
time('seedArtworkFrom(whale-chan)', () => { custom = store.seedArtworkFrom('whale-chan'); }, 3);
time('JSON.stringify(custom) — one coalesced write', () => JSON.stringify(custom), 3);

section('the FIRST look at that document (validation + resolution cold)');
let fresh;
time('validateArtwork(fresh 15MB document)', () => {
  fresh = store.seedArtworkFrom('whale-chan');
  store.validateArtwork(fresh);
}, 3);
time('resolveTakeSkin × 24 on a fresh document', () => {
  fresh = store.seedArtworkFrom('whale-chan');
  store.saveStored({ skin: 'custom', custom: fresh });
  for (let i = 0; i < 24; i++) store.resolveTakeSkin('custom', AVATAR_GRID, 'daiji-huxi-xiuxian-' + i);
}, 3);
time('the same 24 asks again (warm — the common case)', () => {
  for (let i = 0; i < 24; i++) store.resolveTakeSkin('custom', AVATAR_GRID, 'daiji-huxi-xiuxian-' + i);
}, 3);

section('one paint stroke on the 128px face (the editor commit path)');
store.saveStored({ skin: 'custom', custom });
const id = store.loadCustomArtwork().actions[0].id;
const stroke = () => {
  const cur = store.loadCustomArtwork();
  const action = cur.actions.find((a) => a.id === id);
  const base = action.frames[0].cells[BODY_GRID];
  const next = store.replaceFrameCell(cur, id, 0, BODY_GRID,
    { rows: store.paintCell(base.rows, 3, 3, '01') });
  store.saveStored({ skin: 'custom', custom: next });
};
time('paintCell + replaceFrameCell + saveStored', stroke, 5);
time('  …and re-resolve the studio preview', () => {
  store.resolveTakeSkin('custom', BODY_GRID, id);
}, 5);

section('a drag: 100 strokes back to back (what the user feels)');
let burstStart = 0;
const burst = () => {
  burstStart = Date.now();
  for (let i = 0; i < 100; i++) stroke();
};
const burstMs = time('100 strokes (total, ms)', burst, 1);
console.log(`  ${'  → wall clock for the burst'.padEnd(52)} ${(Date.now() - burstStart).toString().padStart(9)} ms`);
net.reset();
for (let i = 0; i < 100; i++) stroke();
const st = net.stats();
console.log(`  ${'  → localStorage writes for 100 strokes'.padEnd(52)} ${String(st.writes).padStart(9)}`);
console.log(`  ${'  → bytes handed to localStorage'.padEnd(52)} ${(st.bytesWritten / 1048576).toFixed(2).padStart(9)} MB`);
void burstMs;

section('switching skin while the 15MB document is stored');
time('saveStored({ skin: whale-chan })', () => store.saveStored({ skin: 'whale-chan' }), 5);
time('saveStored({ skin: custom })', () => store.saveStored({ skin: 'custom' }), 5);

section('library read-outs');
time('skinLibrary(custom) — 106 actions × usedBy', () => store.skinLibrary('custom'), 5);
time('a resolution of BOTH faces (the pairing guarantee)', () => {
  store.resolveNamedSkin('custom', AVATAR_GRID);
  store.resolveNamedSkin('custom', BODY_GRID);
}, 5);
