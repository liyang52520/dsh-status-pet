// The hot-path CONTRACTS — the mechanisms that make editing cheap, asserted
// without a stopwatch (wall-clock thresholds are the benchmark's job:
// `node bench/store.mjs`).
//
// Three mechanisms carry the performance work, and each can be observed
// directly:
//
//   1. IDENTITY-KEYED CACHES.  Artwork is immutable, every mutator shares what
//      it did not change by reference, so "this object is the same object" is
//      a sound statement about "this work was already done".  A one-face edit
//      must leave every other action, frame, FACE and sprite IDENTICAL — the
//      other face of the very action being painted included.
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

const face = (grid: number, over: Record<string, unknown> = {}) => ({ rows: store.blankRows(grid), ...over });

/** A small two-action artwork: each action carries BOTH faces, and the two
 *  actions are different, so "did the edit touch this one?" is observable. */
const fixture = () => ({
  palette: ARTWORK['whale-chan'].palette.slice(0, 7),
  actions: [
    {
      id: 'one',
      frameMs: 400,
      frames: [{ cells: { [AVATAR_GRID]: face(AVATAR_GRID), [BODY_GRID]: face(BODY_GRID) } }],
    },
    {
      id: 'two',
      frameMs: 400,
      frames: [{ cells: { [AVATAR_GRID]: face(AVATAR_GRID), [BODY_GRID]: face(BODY_GRID) } }],
    },
  ],
  states: { idle: ['one'], tool: ['two'] },
}) as any;

test('a one-face edit leaves every other action, frame, face and sprite identical', () => {
  clearStorage();
  const art = fixture();
  store.saveStored({ skin: 'custom', custom: art });
  const before = store.loadCustomArtwork()!;
  const one = before.actions[0] as any;
  const two = before.actions[1] as any;

  // Sprites are memoized by the FACE object, so the renderer's bitmap cache
  // (keyed by the sprite) survives a re-resolve.
  assert.equal(store.spriteFor(one.frames[0].cells[AVATAR_GRID]),
    store.spriteFor(one.frames[0].cells[AVATAR_GRID]),
    'parsing the same face twice gives the same sprite');

  // A stroke lands on the AVATAR face of action `one` — the edit the studio
  // actually makes.
  const edited = store.replaceFrameCell(before, 'one', 0, AVATAR_GRID,
    face(AVATAR_GRID, { rows: store.paintCell(one.frames[0].cells[AVATAR_GRID].rows, 1, 1, '01') }));

  assert.notEqual(edited.actions[0], one, 'the painted action is a new object');
  assert.equal(edited.actions[1], two,
    'the action nobody touched is the SAME object — its validation, its frames and its sprite are already known');
  assert.equal(edited.actions[0].frames[0].cells[BODY_GRID], one.frames[0].cells[BODY_GRID],
    'the OTHER FACE of the painted action is shared by reference: painting the head never rebuilds the body');
  assert.equal(edited.palette, before.palette, 'the palette array is shared while it did not grow');
  assert.equal(store.spriteFor(edited.actions[1].frames[0].cells[AVATAR_GRID]),
    store.spriteFor(two.frames[0].cells[AVATAR_GRID]), 'the untouched face keeps its sprite by identity');
  assert.notEqual(store.spriteFor(edited.actions[0].frames[0].cells[AVATAR_GRID]),
    store.spriteFor(one.frames[0].cells[AVATAR_GRID]), 'the painted face gets a fresh one');
});

test('validation answers from the memo, and follows a real edit', () => {
  clearStorage();
  const art = fixture();
  assert.equal(store.artworkErrors(art), store.artworkErrors(art),
    'the same document is answered with the very same verdict (one scan, not one per ask)');
  assert.equal(store.artworkErrors(art).length, 0, 'and the verdict is "valid"');

  const broken = { ...art, states: { idle: ['one'], tool: ['ghost'] } };
  assert.ok(store.artworkErrors(broken).some((e) => e.includes('no such action')),
    'a changed document is re-checked — the memo is keyed by identity, so a new object is a new question');
  assert.equal(store.artworkErrors(art).length, 0, 'and the original document is still valid');

  // A one-face edit re-checks the ONE action it rewrote: the verdict for the
  // action nobody touched is the cached one.
  const edited = store.replaceFrameCell(art, 'one', 0, AVATAR_GRID, face(AVATAR_GRID));
  assert.deepEqual(store.artworkErrors(edited), [], 'the edited document is valid too');
});

test('resolution is memoized by artwork identity, and the 4× body fallback with it', () => {
  clearStorage();
  store.saveStored({ skin: 'custom', custom: fixture() });
  const a = store.resolveNamedSkin('custom', AVATAR_GRID);
  const b = store.resolveNamedSkin('custom', AVATAR_GRID);
  assert.equal(a, b, 'the same artwork resolves to the very same skin object');
  assert.equal(store.resolveTakeSkin('custom', AVATAR_GRID, 'two'),
    store.resolveTakeSkin('custom', AVATAR_GRID, 'two'),
    'and so does one action pinned as a whole skin');
  assert.equal(store.resolveNamedSkin('custom', BODY_GRID),
    store.resolveNamedSkin('custom', BODY_GRID), 'face by face');
  assert.equal(store.activeSkin(), store.activeSkin(), 'ACTIVE is a stable reference between writes');

  // An edit produces a new document → a new resolution, but the faces it did
  // not touch keep their sprites, so the canvases redraw the same bitmaps.
  const before = store.loadCustomArtwork()!;
  const sprite = store.resolveTakeSkin('custom', AVATAR_GRID, 'two')!
    .states.idle.takes[0].frames[0].sprite;
  store.saveStored({
    custom: store.replaceFrameCell(before, 'one', 0, AVATAR_GRID,
      face(AVATAR_GRID, { rows: store.paintCell(before.actions[0].frames[0].cells[AVATAR_GRID].rows, 2, 2, '01') })),
  });
  const after = store.resolveTakeSkin('custom', AVATAR_GRID, 'two')!
    .states.idle.takes[0].frames[0].sprite;
  assert.equal(after, sprite, 'an untouched action’s sprite survives the edit — no re-parse, no re-rasterise');
  assert.notEqual(store.resolveNamedSkin('custom', AVATAR_GRID), a, 'while the skin as a whole re-resolved');
  clearStorage();
});

test('a derived 128 face is memoized per (frame, face), and a stroke invalidates only its own', () => {
  clearStorage();
  const art = fixture();
  // Action `two` carries no body face: the popup derives one from its avatar,
  // and must pay for that once.  (`one` keeps its authored body, which is what
  // makes the artwork body-carrying at all.)
  art.actions = art.actions.map((a: any) => (a.id === 'two'
    ? { ...a, frames: a.frames.map((f: any) => ({ ...f, cells: { [AVATAR_GRID]: f.cells[AVATAR_GRID] } })) }
    : a));
  store.saveStored({ skin: 'custom', custom: art });
  assert.equal(store.hasBody(store.loadCustomArtwork()!), true, 'one authored body is enough');
  const peek = store.resolveNamedSkin('custom', BODY_GRID)!;
  assert.equal(peek.grid, BODY_GRID, 'the artwork resolves the popup at 128');
  const derivedBefore = peek.states.tool.takes[0].frames[0].sprite;
  const authoredBefore = peek.states.idle.takes[0].frames[0].sprite;
  assert.equal(derivedBefore.w, BODY_GRID, 'the missing face is materialised at 128');
  assert.equal(store.resolveNamedSkin('custom', BODY_GRID)!.states.tool.takes[0].frames[0].sprite, derivedBefore,
    'the derived sprite is memoized, not re-upscaled per resolve');
  assert.equal(store.resolveNamedSkin('custom', BODY_GRID)!.states.idle.takes[0].frames[0].sprite, authoredBefore,
    'and the authored one is the face object’s own sprite');
  assert.equal(store.cellFor(store.loadCustomArtwork()!.actions[1].frames[0], BODY_GRID).rows.length, BODY_GRID,
    'the display helper derives the same 128 rows');

  // Painting the avatar face of action 'two' must NOT invalidate action 'one'.
  const before = store.loadCustomArtwork()!;
  store.saveStored({
    custom: store.replaceFrameCell(before, 'two', 0, AVATAR_GRID,
      face(AVATAR_GRID, { rows: store.paintCell(before.actions[1].frames[0].cells[AVATAR_GRID].rows, 3, 3, '01') })),
  });
  const after = store.resolveNamedSkin('custom', BODY_GRID)!;
  assert.equal(after.states.idle.takes[0].frames[0].sprite, authoredBefore,
    'the untouched action’s authored body sprite survives (identity is the invalidation key)');
  assert.notEqual(after.states.tool.takes[0].frames[0].sprite, derivedBefore,
    'while the painted action’s derived face is fresh');
  clearStorage();
});

test('a corrupt custom document falls back instead of rendering', () => {
  clearStorage();
  // A document that fails validation must never reach a canvas: there is no
  // idle assignment, so nothing could be played.
  const bad: any = { palette: ['transparent', '#111111'], actions: [], states: {} };
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
  clearStorage();
});

test('a drag of many strokes writes storage once', () => {
  clearStorage();
  const big = store.seedArtworkFrom(store.DEFAULT_SKIN);
  store.saveStored({ skin: 'custom', custom: big });
  store.flushStored();
  writes = 0;

  const id = store.loadCustomArtwork()!.actions[0].id;
  let painted = store.loadCustomArtwork()!;
  for (let i = 0; i < 30; i++) {
    const action = painted.actions.find((a) => a.id === id)!;
    const base = action.frames[0].cells[BODY_GRID]!;
    painted = store.replaceFrameCell(painted, id, 0, BODY_GRID,
      { rows: store.paintCell(base.rows, i, i, '01') });
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
