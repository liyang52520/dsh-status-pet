// The hot-path CONTRACTS — the mechanisms that keep the pet and the settings
// page cheap, asserted without a stopwatch (wall-clock thresholds are the
// benchmark's job: `node bench/store.mjs`).
//
// Three mechanisms carry the performance work, and each can be observed
// directly:
//
//   1. IDENTITY-KEYED CACHES.  Artwork is immutable and the assignment shares
//      the pixel library BY REFERENCE, so "this object is the same object" is a
//      sound statement about "this work was already done".  A state tick must
//      leave every action, frame, FACE and sprite IDENTICAL.
//   2. THE WRITE-THROUGH SNAPSHOT.  What is stored is a list of ids, so the
//      snapshot is written on the spot — and it must never grow artwork.
//   3. THE USAGE INDEX.  usedBy is one pass per artwork, not a scan per ask.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const storeMem = new Map<string, string>();
let writes = 0;
(globalThis as any).window = {
  localStorage: {
    getItem: (k: string) => (storeMem.has(k) ? storeMem.get(k)! : null),
    setItem: (k: string, v: string) => { writes++; storeMem.set(k, String(v)); },
    removeItem: (k: string) => void storeMem.delete(k),
  },
  CustomEvent: function (this: { type: string }, type: string) {
    this.type = type;
  },
  dispatchEvent: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
};

const store = await import('../src/pet/skins/store.ts');
const { ARTWORK } = await import('../src/artwork.gen.ts');
const { AVATAR_GRID, BODY_GRID } = await import('../src/pet/grids.ts');
const SKIN = store.DEFAULT_SKIN;
store.installSkinArtwork(ARTWORK as never);

/** Back to an empty store, with the in-memory copy dropped so the next read
 *  re-parses what storage actually holds. */
const reset = () => {
  storeMem.clear();
  store.loadStored();
  store.refreshActiveSkin();
};

/** A small local artwork for the pure library/derivation contracts: the store
 *  never sees it, so these tests do not depend on the shipped chunk's shape. */
const blank = (grid: number) => Array.from({ length: grid }, () => '..'.repeat(grid));
const fixture = () => ({
  palette: ['transparent', '#111111'],
  actions: [
    { id: 'one', frameMs: 400, frames: [{ cells: { [AVATAR_GRID]: { rows: blank(AVATAR_GRID) } } }] },
    { id: 'two', frameMs: 400, frames: [{ cells: { [AVATAR_GRID]: { rows: blank(AVATAR_GRID) } } }] },
  ],
  states: { idle: ['one'], tool: ['two'] },
}) as any;

test('resolution is memoized by artwork identity', () => {
  reset();
  assert.equal(store.resolveNamedSkin(SKIN, AVATAR_GRID), store.resolveNamedSkin(SKIN, AVATAR_GRID),
    'the same artwork resolves to the very same skin object');
  assert.equal(store.resolveNamedSkin(SKIN, BODY_GRID), store.resolveNamedSkin(SKIN, BODY_GRID),
    'face by face');
  const id = store.actionsOf(store.skinArtwork(SKIN)!)[0].id;
  assert.equal(store.resolveTakeSkin(SKIN, AVATAR_GRID, id), store.resolveTakeSkin(SKIN, AVATAR_GRID, id),
    'and so does one action pinned as a whole skin');
  assert.equal(store.activeSkin(), store.activeSkin(), 'ACTIVE is a stable reference between writes');
});

test('a derived 128 face is materialised and memoized per (frame, face)', () => {
  const frame: any = { cells: { [AVATAR_GRID]: { rows: blank(AVATAR_GRID) } } };
  const first = store.cellFor(frame, BODY_GRID);
  assert.equal(first.rows.length, BODY_GRID, 'the missing face is derived at 128');
  assert.equal(store.cellFor(frame, BODY_GRID), first, 'and it is memoized, not re-upscaled per ask');
  assert.equal(store.spriteFor(first), store.spriteFor(first), 'the derived sprite is memoized too');
  // Two DIFFERENT frames each get their own draft — the memo is keyed by the
  // frame object, not by the grid.
  const other: any = { cells: { [AVATAR_GRID]: { rows: blank(AVATAR_GRID) } } };
  assert.notEqual(store.cellFor(other, BODY_GRID), first);
});

test('the assignment shares the pixel library BY REFERENCE, and is memoized per (artwork, diff)', () => {
  reset();
  const art = store.skinArtwork(SKIN)!;
  const diff = { tool: art.states.tool.slice(0, 2) };
  const applied = store.withOverrides(art, diff)!;
  assert.equal(store.withOverrides(art, diff), applied, 'one diff is applied once');
  assert.equal(applied.actions, art.actions,
    'the pixel library is shared: an assignment cannot invalidate a single sprite');
  assert.equal(applied.palette, art.palette, 'and neither can it touch the palette');
  assert.notEqual(applied, art, 'but the state table is a new object');
  assert.deepEqual(applied.states.tool, diff.tool);
  assert.deepEqual(applied.states.idle, art.states.idle, 'a state the diff does not name is the authored one');
  assert.equal(store.spriteFor(applied.actions[0].frames[0].cells[AVATAR_GRID]),
    store.spriteFor(art.actions[0].frames[0].cells[AVATAR_GRID]),
    'so the shared action keeps its parsed sprite by identity');
});

test('an assignment write re-resolves the skin, and every sprite survives it', () => {
  reset();
  const before = store.resolveNamedSkin(SKIN, AVATAR_GRID)!;
  const art = store.skinArtwork(SKIN)!;
  const idleAction = store.actionsOf(art).find((a) => a.id === art.states.idle[0])!;
  const otherAction = store.actionsOf(art).find((a) => a.id !== idleAction.id)!;

  assert.equal(before.states.idle.takes[0].frames[0].sprite,
    store.spriteFor(idleAction.frames[0].cells[AVATAR_GRID]), 'idle plays the authored action');

  store.saveSkinStates(SKIN, { ...art.states, idle: [otherAction.id] });

  const after = store.resolveNamedSkin(SKIN, AVATAR_GRID)!;
  assert.notEqual(after, before, 'the document changed, so the resolution is fresh');
  assert.equal(after.states.idle.takes[0].frames[0].sprite,
    store.spriteFor(otherAction.frames[0].cells[AVATAR_GRID]),
    'and it draws the action the assignment names — from the SHARED face object, so no re-parse');
  assert.equal(store.spriteFor(idleAction.frames[0].cells[AVATAR_GRID]),
    store.spriteFor(idleAction.frames[0].cells[AVATAR_GRID]),
    'the action the assignment moved away from is untouched');
  reset();
});

test('usedBy is an index: one pass per artwork, one shared answer per ask', () => {
  const art = fixture();
  const index = store.usageIndex(art);
  assert.equal(store.usageIndex(art), index, 'the index is built once per artwork');
  assert.equal(store.usedBy(art, 'two'), index.get('two'), 'and every ask is served from it');
  assert.deepEqual(store.usedBy(art, 'two'), ['tool']);
  assert.deepEqual(store.usedBy(art, 'ghost'), [], 'an unknown id is unused, not undefined');
  const info = store.libraryInfo(art);
  assert.deepEqual(info.map((a) => a.id), ['one', 'two']);
  assert.deepEqual(info.map((a) => a.frames), [1, 1], 'the read-out carries the frame count too');

  // The index is keyed by the artwork, so a change to the selection is a new
  // index rather than a stale one.
  const assigned = store.assignTake(art, 'done', 'two', true);
  assert.deepEqual(store.usedBy(assigned, 'two'), ['tool', 'done'], 'in the canonical state order');
  assert.notEqual(store.usageIndex(assigned), index, 'a new artwork is a new index, never a stale one');
  assert.deepEqual(info[0].usedBy, ['idle'], 'the old index still describes the old artwork');
});

test('every write lands at once, and the payload is a DIFF — never artwork', () => {
  reset();
  writes = 0;
  const art = store.skinArtwork(SKIN)!;
  const other = store.actionsOf(art).find((a) => a.id !== art.states.idle[0])!.id;
  store.saveSkinStates(SKIN, { ...art.states, idle: [other] });

  assert.equal(writes, 1, 'the assignment is written through synchronously');
  const text = storeMem.get(store.STORE_KEY)!;
  assert.ok(text.length < 4096, `the whole document is a few hundred bytes (was ${text.length})`);
  assert.ok(!text.includes('rows'), 'no artwork document is stored — the pixels ship in the chunk');
  const doc = JSON.parse(text);
  assert.equal(doc.v, store.STORE_VERSION, 'and it is stamped with the current schema');
  assert.deepEqual(doc.builtinStates[SKIN].idle, [other], 'the diff is what was stored');
  assert.equal(store.loadStored().skin, undefined, 'nothing else was invented');
});

test('the write-through snapshot survives a storage failure without serving a lie', () => {
  reset();
  const realSet = (globalThis as any).window.localStorage.setItem;
  (globalThis as any).window.localStorage.setItem = () => { throw new Error('quota'); };
  try {
    store.saveStored({ skin: SKIN });
  } finally {
    (globalThis as any).window.localStorage.setItem = realSet;
  }
  // The refused write dropped the in-memory copy, so the next read re-parses
  // storage — which still holds the last good document.
  assert.equal(store.loadStored().skin, undefined, 'the store reports what storage actually holds');
  reset();
});
