// The hot-path CONTRACTS — the mechanisms that make editing cheap, asserted
// without a stopwatch (wall-clock thresholds are the benchmark's job:
// `node bench/store.mjs`).
//
// Three mechanisms carry the performance work, and each can be observed
// directly:
//
//   1. IDENTITY-KEYED CACHES.  Artwork is immutable, every mutator shares what
//      it did not change by reference, so "this object is the same object" is
//      a sound statement about "this work was already done".  A one-action
//      edit must leave every other action, frame and sprite IDENTICAL.
//   2. THE COALESCED SNAPSHOT.  A big document must not be serialized per
//      painted pixel: memory is live immediately, localStorage follows on a
//      flush.
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
store.installSkinArtwork(ARTWORK as never);

const clearStorage = () => {
  store.flushStored();
  storeMem.clear();
  store.refreshActiveSkin();
};

/** A small two-action artwork on the avatar grid, plus a body crop. */
const fixture = () => ({
  palette: ARTWORK['whale-chan'].palette.slice(0, 7),
  grids: {
    [AVATAR_GRID]: {
      library: [
        { id: 'one', frameMs: 400, frames: [{ rows: store.blankRows(AVATAR_GRID) }] },
        { id: 'two', frameMs: 400, frames: [{ rows: store.blankRows(AVATAR_GRID) }] },
      ],
      states: { idle: ['one'], tool: ['two'] },
    },
    [BODY_GRID]: {
      library: [{ id: 'big', frameMs: 400, frames: [{ rows: store.blankRows(BODY_GRID) }] }],
      states: { idle: ['big'] },
    },
  },
});

test('a one-action edit leaves every other action, frame and sprite identical', () => {
  clearStorage();
  const art = fixture();
  store.saveStored({ skin: 'custom', custom: art });
  const before = store.loadCustomArtwork()!;
  const one = before.grids[AVATAR_GRID]!.library[0];
  const two = before.grids[AVATAR_GRID]!.library[1];

  // Sprites are memoized by the FRAME object, so the renderer's bitmap cache
  // (keyed by the sprite) survives a re-resolve.
  assert.equal(store.spriteFor(one.frames[0]), store.spriteFor(one.frames[0]),
    'parsing the same frame twice gives the same sprite');

  // A stroke lands on action `one` — the edit the studio actually makes.
  const edited = store.replaceLibraryTake(before, AVATAR_GRID, 'one', {
    frameMs: 400,
    frames: [{ rows: store.paintCell(one.frames[0].rows, 1, 1, '01') }],
  });

  assert.notEqual(edited.grids[AVATAR_GRID]!.library[0], one, 'the painted action is a new object');
  assert.equal(edited.grids[AVATAR_GRID]!.library[1], two,
    'the action nobody touched is the SAME object — its validation, its frames and its sprite are already known');
  assert.equal(edited.grids[BODY_GRID], before.grids[BODY_GRID],
    'and so is the whole other crop');
  assert.equal(edited.palette, before.palette, 'the palette array is shared while it did not grow');
  assert.equal(store.spriteFor(edited.grids[AVATAR_GRID]!.library[1].frames[0]),
    store.spriteFor(two.frames[0]), 'the untouched frame keeps its sprite by identity');
  assert.notEqual(store.spriteFor(edited.grids[AVATAR_GRID]!.library[0].frames[0]),
    store.spriteFor(one.frames[0]), 'the painted frame gets a fresh one');
});

test('validation answers from the memo, and follows a real edit', () => {
  clearStorage();
  const art = fixture();
  assert.equal(store.artworkErrors(art), store.artworkErrors(art),
    'the same document is answered with the very same verdict (one scan, not one per ask)');
  assert.equal(store.artworkErrors(art).length, 0, 'and the verdict is "valid"');

  const broken = {
    ...art,
    grids: {
      [AVATAR_GRID]: {
        ...art.grids[AVATAR_GRID],
        states: { idle: ['one'], tool: ['ghost'] },
      },
    },
  };
  assert.ok(store.artworkErrors(broken).some((e) => e.includes('no such action')),
    'a changed crop is re-checked — the memo is keyed by identity, so a new object is a new question');
  assert.equal(store.artworkErrors(art).length, 0, 'and the original document is still valid');
});

test('resolution is memoized by artwork identity', () => {
  clearStorage();
  store.saveStored({ skin: 'custom', custom: fixture() });
  const a = store.resolveNamedSkin('custom', AVATAR_GRID);
  const b = store.resolveNamedSkin('custom', AVATAR_GRID);
  assert.equal(a, b, 'the same artwork resolves to the very same skin object');
  assert.equal(store.resolveTakeSkin('custom', AVATAR_GRID, 'two'),
    store.resolveTakeSkin('custom', AVATAR_GRID, 'two'),
    'and so does one action pinned as a whole skin');
  assert.equal(store.resolveNamedSkin('custom', BODY_GRID),
    store.resolveNamedSkin('custom', BODY_GRID), 'grid by grid');
  assert.equal(store.activeSkin(), store.activeSkin(), 'ACTIVE is a stable reference between writes');

  // An edit produces a new document → a new resolution, but the frames it did
  // not touch keep their sprites, so the canvases redraw the same bitmaps.
  const before = store.loadCustomArtwork()!;
  const sprite = store.resolveTakeSkin('custom', AVATAR_GRID, 'two')!.states.idle.takes[0].frames[0].sprite;
  store.saveStored({
    custom: store.replaceLibraryTake(before, AVATAR_GRID, 'one', {
      frameMs: 400,
      frames: [{ rows: store.paintCell(before.grids[AVATAR_GRID]!.library[0].frames[0].rows, 2, 2, '01') }],
    }),
  });
  const after = store.resolveTakeSkin('custom', AVATAR_GRID, 'two')!.states.idle.takes[0].frames[0].sprite;
  assert.equal(after, sprite, 'an untouched action’s sprite survives the edit — no re-parse, no re-rasterise');
  assert.notEqual(store.resolveNamedSkin('custom', AVATAR_GRID), a, 'while the skin as a whole re-resolved');
});

test('a corrupt custom document falls back instead of rendering', () => {
  clearStorage();
  // A document that fails validation must never reach a canvas: the avatar
  // grid has no idle action, so nothing could be played.
  const bad: any = { palette: ['transparent', '#111111'], grids: { [AVATAR_GRID]: { library: [], states: {} } } };
  assert.ok(store.artworkErrors(bad).length > 0, 'it is refused by the validator');
  assert.equal(store.resolveSkin({ skin: 'custom', custom: bad }).name, store.DEFAULT_SKIN,
    'the dock falls back to the default skin');
  assert.equal(store.resolveNamedSkin('custom', AVATAR_GRID), null,
    'and the picker card resolves blank rather than crashing');
  assert.equal(store.loadCustomArtwork(), null);
});

test('usedBy is an index: one pass per artwork, one shared answer per ask', () => {
  clearStorage();
  const art = fixture();
  const index = store.usageIndex(art, AVATAR_GRID);
  assert.equal(store.usageIndex(art, AVATAR_GRID), index, 'the index is built once per artwork');
  assert.equal(store.usedBy(art, AVATAR_GRID, 'two'), index.get('two'),
    'and every ask is served from it');
  assert.deepEqual(store.usedBy(art, AVATAR_GRID, 'two'), ['tool']);
  assert.deepEqual(store.usedBy(art, AVATAR_GRID, 'ghost'), [], 'an unknown id is unused, not undefined');
  const info = store.libraryInfo(art, AVATAR_GRID);
  assert.deepEqual(info.map((a) => a.id), ['one', 'two']);
  assert.deepEqual(info.map((a) => a.frames), [1, 1], 'the read-out carries the frame count too');

  // The index is keyed by the artwork, so a change to the selection is a new
  // index rather than a stale one.
  const assigned = store.assignTake(art, AVATAR_GRID, 'done', 'two', true);
  assert.deepEqual(store.usedBy(assigned, AVATAR_GRID, 'two'), ['tool', 'done'],
    'in the canonical state order');
  assert.notEqual(store.usageIndex(assigned, AVATAR_GRID), index,
    'a new artwork is a new index, never a stale one');
  assert.deepEqual(info[0].usedBy, ['idle'], 'the old index still describes the old artwork');
});

test('small metadata writes land synchronously', () => {
  clearStorage();
  writes = 0;
  store.saveStored({ brushes: ['#000000', '#111111', '#222222', '#333333', '#444444', '#555555'] });
  assert.equal(writes, 1, 'a paint-box edit is written through at once');
  assert.ok(storeMem.get(store.STORE_KEY)!.includes('#111111'));
});

test('a big document is coalesced: memory is live, storage follows on a flush', () => {
  clearStorage();
  writes = 0;
  const big = store.seedArtworkFrom(store.DEFAULT_SKIN);
  store.saveStored({ skin: 'custom', custom: big });

  // Live for every reader — including the studio, which reads it back.
  assert.equal(store.loadStored().skin, 'custom');
  assert.equal(store.loadCustomArtwork(), big, 'the document in memory is the document just saved');
  assert.equal(store.activeSkin().name, 'custom', 'and ACTIVE already follows it');
  assert.equal(writes, 0, 'but the ~15MB snapshot was NOT serialized per save');

  store.flushStored();
  assert.equal(writes, 1, 'one flush, one write');
  assert.ok(storeMem.get(store.STORE_KEY)!.length > 1000000, 'and it carried the whole document');
  store.flushStored();
  assert.equal(writes, 1, 'a flush with nothing pending is a no-op');
});

test('a drag of many strokes writes storage once', () => {
  clearStorage();
  const big = store.seedArtworkFrom(store.DEFAULT_SKIN);
  store.saveStored({ skin: 'custom', custom: big });
  store.flushStored();
  writes = 0;

  const id = store.gridArtwork(store.loadCustomArtwork()!, BODY_GRID).library[0].id;
  let painted = store.loadCustomArtwork()!;
  for (let i = 0; i < 30; i++) {
    const g = store.gridArtwork(painted, BODY_GRID);
    const action = g.library.find((a) => a.id === id)!;
    const frames = action.frames.map((f) => ({ ...f, rows: store.paintCell(f.rows, i, i, '01') }));
    painted = store.replaceLibraryTake(painted, BODY_GRID, id, { frameMs: action.frameMs, frames });
    store.saveStored({ skin: 'custom', custom: painted });
  }
  assert.equal(writes, 0, 'thirty painted pixels, no serialization');
  assert.equal(store.loadCustomArtwork(), painted, 'every stroke is live');

  store.flushStored();
  assert.equal(writes, 1, 'and the burst costs exactly one snapshot');
  clearStorage();
});

test('the editor primitives stay cheap and pure', () => {
  const rows = store.blankRows(AVATAR_GRID);
  const painted = store.paintCell(rows, 3, 4, '02');
  assert.equal(store.pixelAt(painted[3], 4), '02');
  // Copy-on-write at ROW granularity: every other row is the same string.
  for (let y = 0; y < AVATAR_GRID; y++) {
    if (y === 3) continue;
    assert.equal(painted[y], rows[y], 'row ' + y + ' is shared by reference');
  }
  assert.equal(painted.length, AVATAR_GRID);
  assert.equal(store.TRANSPARENT, '..');
});
