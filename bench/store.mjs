// The store hot paths the running pet and settings page actually pay for:
//   * the artwork chunk landing (pair 106 actions + first resolve)
//   * the FIRST look at a skin — resolution cold
//   * the same asks again (warm — the common case)
//   * the assignment list's rows (up to 106 live action previews)
//   * one state tick (assign + persist + re-resolve + broadcast)
//   * switching skin
//
// "Cold" means the document has never been seen by any cache; "warm" means the
// same immutable document is asked for again.  Both matter: artwork is
// immutable, so a warm ask is the common one, but the first open must not be a
// stall.
//
// What is NOT here any more: painting a pixel, a coalesced 15 MB snapshot, and
// a big-document load.  The customisation pipeline is gone, and with it the
// only code path that ever touched a megabyte of user data.
import { stubWindow, time, section } from './harness.mjs';

const net = stubWindow();

const store = await import('../src/pet/skins/store.ts');
const { ARTWORK } = await import('../src/artwork.gen.ts');
const { AVATAR_GRID } = await import('../src/pet/grids.ts');

section('cold: the artwork chunk lands');
time('installSkinArtwork + first resolve', () => {
  store.installSkinArtwork(ARTWORK);
  store.resolveBestSkin();
}, 3);

const SKIN = store.DEFAULT_SKIN;

section('resolution (the dock asks every frame, the page asks per row)');
time('resolveSkin(active) — cold', () => store.resolveSkin(store.loadStored()), 3);
time('resolveSkin(active) — warm (memoized by artwork identity)', () => store.resolveSkin(store.loadStored()), 100);
time('resolveBestSkin — the popup', () => store.resolveBestSkin(), 100);

const library = store.skinLibrary(SKIN);
time(`resolveTakeSkin × ${library.length} — every row of the assignment list`, () => {
  for (const a of library) store.resolveTakeSkin(SKIN, AVATAR_GRID, a.id);
}, 3);
time('the same asks again (warm)', () => {
  for (const a of library) store.resolveTakeSkin(SKIN, AVATAR_GRID, a.id);
}, 20);

section('one state tick (the only write path)');
const art = store.skinArtwork(SKIN);
const first = store.actionsOf(art)[0].id;
const second = store.actionsOf(art)[1].id;
let flip = false;
time('assignTake + saveSkinStates (persist + re-resolve + broadcast)', () => {
  flip = !flip;
  store.saveSkinStates(SKIN, { ...art.states, idle: [flip ? first : second] });
}, 20);

section('a burst of ticks (a user clicking down the list)');
const ids = store.actionsOf(art).slice(0, 40).map((a) => a.id);
let wrote = 0;
net.reset();
time('40 ticks', () => {
  const before = net.stats().writes;
  for (const id of ids) store.saveSkinStates(SKIN, { ...art.states, idle: [id] });
  wrote = net.stats().writes - before;
}, 3);
console.log(`  ${'→ localStorage writes for those 40 ticks'.padEnd(52)} ${String(wrote).padStart(9)}`);
console.log(`  ${'→ bytes handed to localStorage'.padEnd(52)} ${String(net.stats().bytesWritten).padStart(9)}`);

section('switching skin');
time('saveStored({ skin })', () => store.saveStored({ skin: SKIN }), 20);

section('the assignment reads the page renders');
time('skinLibrary × 11 states (the row read-outs)', () => {
  for (let i = 0; i < 11; i++) store.skinLibrary(SKIN);
}, 20);
time('usedBy for every action', () => {
  const a = store.skinArtwork(SKIN);
  for (const t of store.actionsOf(a)) store.usedBy(a, t.id);
}, 20);
