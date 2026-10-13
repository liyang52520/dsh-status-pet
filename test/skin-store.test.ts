// The skin store: what is persisted, what the assignment diff means, how a
// stored list of ids is sanitized, and how artwork resolves into render-ready
// data.  Everything here runs in node against the real modules — no DOM beyond
// a localStorage-and-events-shaped `window`.
//
// The artwork itself is not in this file: `skins.test.ts` owns the shipped
// built-ins.  What is asserted here is the machinery around it — the pairing
// door (v8 → v9), the state assignment, and the resolution rules the renderer
// depends on.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const storeMem = new Map<string, string>();
const listeners = new Map<string, Set<(e: { type: string }) => void>>();
(globalThis as any).window = {
  localStorage: {
    getItem: (k: string) => (storeMem.has(k) ? storeMem.get(k)! : null),
    setItem: (k: string, v: string) => void storeMem.set(k, String(v)),
    removeItem: (k: string) => void storeMem.delete(k),
  },
  CustomEvent: function (this: { type: string }, type: string) {
    this.type = type;
  },
  dispatchEvent(e: { type: string }) {
    for (const fn of listeners.get(e.type) || []) fn(e);
    return true;
  },
  addEventListener(type: string, fn: (e: { type: string }) => void) {
    let set = listeners.get(type);
    if (!set) listeners.set(type, set = new Set());
    set.add(fn);
  },
  removeEventListener(type: string, fn: (e: { type: string }) => void) {
    listeners.get(type)?.delete(fn);
  },
};

const store = await import('../src/pet/skins/store.ts');
const { ARTWORK } = await import('../src/artwork.gen.ts');
const { GRIDS, AVATAR_GRID, BODY_GRID, BODY_FALLBACK_SCALE } = await import('../src/pet/grids.ts');
const { STATE_NAMES } = await import('../src/pet/behavior.ts');

store.installSkinArtwork(ARTWORK as never);

const SKIN = store.DEFAULT_SKIN;
type Artwork = import('../src/pet/skins/compose.ts').Artwork;

/** An empty store, with the in-memory copy dropped so the next read re-parses
 *  what storage actually holds. */
function reset() {
  storeMem.clear();
  store.loadStored();
  store.refreshActiveSkin();
}

beforeEach(reset);

const blank = (grid: number) => Array.from({ length: grid }, () => '..'.repeat(grid));

/** A small artwork for the pure contracts — it never reaches the store. */
function fixture(): Artwork {
  return {
    palette: ['transparent', '#111111', '#222222'],
    actions: [
      { id: 'one', frameMs: 400, frames: [{ cells: { [AVATAR_GRID]: { rows: blank(AVATAR_GRID) } } }] },
      {
        id: 'two',
        frameMs: 500,
        name: 'Two',
        frames: [
          { cells: { [AVATAR_GRID]: { rows: blank(AVATAR_GRID) } } },
          { ms: 200, dx: 1, cells: { [AVATAR_GRID]: { rows: blank(AVATAR_GRID) } } },
        ],
      },
    ],
    states: { idle: ['one'], tool: ['two'] },
  };
}

/** A v8 document: one library per crop, the shape the baked chunk ships in. */
function v8doc() {
  return {
    palette: ['transparent', '#111111'],
    grids: {
      [AVATAR_GRID]: {
        library: [
          { id: 'a', frameMs: 400, frames: [{ rows: blank(AVATAR_GRID), dy: 1 }] },
          { id: 'b', frameMs: 300, frames: [{ rows: blank(AVATAR_GRID) }] },
        ],
        states: { idle: ['a'], tool: ['a', 'b'] },
      },
      [BODY_GRID]: {
        library: [
          { id: 'a', frameMs: 999, frames: [{ rows: blank(BODY_GRID), dy: 4 }] },
          { id: 'body-only', frameMs: 250, frames: [{ rows: blank(BODY_GRID) }] },
        ],
        states: { idle: ['a'], tool: ['a'] },
      },
    },
  } as any;
}

// ── the pairing door ──

test('the v8 door pairs the two crops, with the AVATAR crop as the authority', () => {
  const v8 = v8doc();
  assert.equal(store.looksV8(v8), true, 'the baked shape is recognised');
  assert.equal(store.looksV9(v8), false);
  const art = store.pairArtwork(v8);
  assert.equal(store.looksV9(art), true);

  const a = art.actions.find((x) => x.id === 'a')!;
  assert.equal(a.frameMs, 400, 'the pace is the avatar crop\'s (999 on the body is ignored)');
  assert.equal(a.frames.length, 1);
  assert.equal(a.frames[0].dy, 1, 'the offset is the avatar crop\'s, in avatar units');
  assert.equal(a.frames[0].cells[AVATAR_GRID].rows, v8.grids[AVATAR_GRID].library[0].frames[0].rows,
    'rows are shared BY REFERENCE, never copied');
  assert.equal(a.frames[0].cells[BODY_GRID]!.rows, v8.grids[BODY_GRID].library[0].frames[0].rows,
    'and the body face is the body crop\'s, likewise by reference');
});

test('the v8 door keeps a body-only action, and injects an idle when there is none', () => {
  const art = store.pairArtwork(v8doc());
  const orphan = art.actions.find((x) => x.id === 'body-only')!;
  assert.ok(orphan, 'an action only the body crop carries is kept, not dropped');
  assert.equal(orphan.frameMs, 250, 'its pace comes from the crop that has it');
  assert.equal(orphan.frames[0].cells[AVATAR_GRID].rows.length, AVATAR_GRID,
    'behind a blank avatar face, so the document stays renderable');

  // The state assignment is the avatar crop's, and only ids that survived.
  assert.deepEqual(art.states.tool, ['a', 'b']);
  assert.deepEqual(art.states.idle, ['a']);

  const noIdle = v8doc();
  noIdle.grids[AVATAR_GRID].states = { tool: ['b'] };
  assert.deepEqual(store.pairArtwork(noIdle).states.idle, ['a'], 'an idle is injected from the library');
});

test('the door is memoized by input object, and refuses what it cannot understand', () => {
  const v8 = v8doc();
  assert.equal(store.upgradeArtwork(v8), store.upgradeArtwork(v8),
    'the same input gives back the very same document (resolution caches key on identity)');
  const art = store.upgradeArtwork(v8)!;
  assert.equal(store.upgradeArtwork(art), art, 'a v9 document passes straight through');
  assert.equal(store.upgradeArtwork({ nope: true }), null);
  assert.equal(store.upgradeArtwork(null), null);
  assert.equal(store.upgradeArtwork(undefined), null);
});

// ── the state assignment diff ──

test('an assignment is stored as a DIFF, and a no-op diff is not stored at all', () => {
  const art = store.skinArtwork(SKIN)!;
  assert.deepEqual(store.loadStored().builtinStates, undefined, 'a fresh store has no opinion');

  store.saveSkinStates(SKIN, art.states);
  assert.deepEqual(store.loadStored().builtinStates, undefined,
    'writing the authored assignment back is not a diff');

  const other = store.actionsOf(art).find((a) => a.id !== art.states.idle[0])!.id;
  store.saveSkinStates(SKIN, { ...art.states, idle: [other] });
  assert.deepEqual(store.loadStored().builtinStates![SKIN], { idle: [other] },
    'only the state that moved is recorded');
  assert.deepEqual(store.skinArtwork(SKIN)!.states.idle, [other],
    'and the document the Workshop reads follows it');
});

test('an assignment that would empty idle is refused, and the authored idle stands', () => {
  const art = store.skinArtwork(SKIN)!;
  store.saveSkinStates(SKIN, { ...art.states, idle: [] });
  assert.deepEqual(store.skinArtwork(SKIN)!.states.idle, art.states.idle,
    'idle is the anchor every unassigned state falls back to');
  assert.deepEqual(store.loadStored().builtinStates, undefined, 'and nothing was written');
});

test('an assignment for a skin we do not have is ignored', () => {
  store.saveSkinStates('custom', { idle: ['x'] });
  store.saveSkinStates('nope', { idle: ['x'] });
  assert.deepEqual(store.loadStored().builtinStates, undefined);
});

test('the override door sanitizes a corrupt diff: unknown ids, unknown states, duplicates, non-lists', () => {
  const art = fixture();
  const dirty = {
    idle: ['one', 'one', 'ghost'],
    tool: ['two', 7 as unknown as string, 'ghost'],
    nope: ['one'],
    sleep: 'not a list' as unknown as string[],
  };
  const applied = store.withOverrides(art, dirty as any)!;
  assert.deepEqual(applied.states.idle, ['one'], 'a duplicate id and an unknown id are dropped');
  assert.deepEqual(applied.states.tool, ['two'], 'a non-string and an unknown id are dropped');
  assert.equal('nope' in applied.states, false, 'a state the vocabulary does not know is ignored');
  assert.equal('sleep' in applied.states, false, 'a non-list is ignored');
  assert.deepEqual(art.states.idle, ['one'], 'the authored document is never mutated');
});

test('the override door caps a selection at MAX_TAKES', () => {
  // The shipped library has more actions than the cap, which is the only way to
  // reach it with ids that all exist.
  const art = store.skinArtwork(SKIN)!;
  const ids = store.actionsOf(art).map((a) => a.id);
  assert.ok(ids.length > store.MAX_TAKES, 'the fixture is big enough to hit the cap');
  const applied = store.withOverrides(art, { tool: ids })!;
  assert.equal(applied.states.tool.length, store.MAX_TAKES);
});

test('an override that empties idle falls back to the authored one', () => {
  const applied = store.withOverrides(fixture(), { idle: [] })!;
  assert.deepEqual(applied.states.idle, ['one'], 'resolution requires an idle animation');
});

test('withOverrides memoizes per (artwork, diff) and shares the library by reference', () => {
  const art = fixture();
  const diff = { tool: ['two'] };
  const a = store.withOverrides(art, diff)!;
  assert.equal(store.withOverrides(art, diff)!, a, 'applied once');
  assert.equal(a.actions, art.actions, 'the pixel library is shared');
  assert.notEqual(store.withOverrides(art, { tool: ['one'] })!, a, 'a different diff is a different document');
  assert.equal(store.withOverrides(art, null), art, 'no diff at all is the authored document itself');
});

// ── the library reads ──

test('assignTake toggles a REFERENCE and never touches a pixel', () => {
  const art = fixture();
  const on = store.assignTake(art, 'done', 'two', true);
  assert.deepEqual(on.states.done, ['two']);
  assert.equal(on.actions, art.actions, 'the action is shared, not copied');
  assert.equal(store.assignTake(on, 'done', 'two', true), on, 'an idempotent tick is a no-op');
  const off = store.assignTake(on, 'done', 'two', false);
  assert.equal('done' in off.states, false, 'an empty selection is not stored — it follows idle');
  assert.equal(store.assignTake(art, 'x', 'ghost', true), art, 'an unknown id cannot be assigned');

  const atCap = { ...art, states: { idle: ['one'], done: new Array(store.MAX_TAKES).fill('two') } };
  assert.equal(store.assignTake(atCap, 'done', 'one', true), atCap, 'the cap refuses silently');
});

test('setStateSelection replaces a whole selection, deduping and filtering it', () => {
  const art = fixture();
  const next = store.setStateSelection(art, 'tool', ['two', 'one', 'two', 'ghost']);
  assert.deepEqual(next.states.tool, ['two', 'one'], 'deduped and filtered, in the order given');
  assert.equal('tool' in store.setStateSelection(art, 'tool', []).states, false);
});

test('usedBy is the canonical-order list of the states that play an action', () => {
  const art = fixture();
  assert.deepEqual(store.usedBy(art, 'two'), ['tool']);
  assert.deepEqual(store.usedBy(art, 'ghost'), [], 'an unknown id is unused, not undefined');
  const info = store.libraryInfo(art);
  assert.deepEqual(info.map((a) => a.id), ['one', 'two']);
  assert.deepEqual(info.map((a) => a.frames), [1, 2], 'the read-out carries the frame count');
  assert.deepEqual(info.map((a) => a.usedBy), [['idle'], ['tool']]);
});

// ── resolution ──

test('an unassigned state IS idle, and states with the same selection share one object', () => {
  const art = store.skinArtwork(SKIN)!;
  // The built-in assigns all eleven states, so "unassigned" is expressed the
  // store's way: a state cleared to an empty list.
  store.saveSkinStates(SKIN, { ...art.states, think: [] });
  const skin = store.resolveSkin(store.loadStored());
  assert.equal(skin.states.think, skin.states.idle, 'a state with nothing ticked follows idle by identity');

  // An assignment that names exactly what idle names must resolve to the very
  // same object too — the memo key is the selection, not the state name.
  const other = store.actionsOf(art).find((a) => a.id !== art.states.idle[0])!.id;
  store.saveSkinStates(SKIN, { ...art.states, idle: [other], tool: [other] });
  const after = store.resolveSkin(store.loadStored());
  assert.equal(after.states.tool, after.states.idle);
});

test('the dock draws the avatar, and the popup falls back to it at exactly 4×', () => {
  const skin = store.resolveSkin(store.loadStored());
  assert.equal(skin.grid, AVATAR_GRID);
  assert.equal(skin.canvasW, GRIDS[AVATAR_GRID].canvasW);
  assert.equal(skin.states.idle.takes[0].frames[0].sprite.w, AVATAR_GRID);

  // An artwork with NO body anywhere resolves its popup from its own avatar.
  const noBody: Artwork = {
    palette: ['transparent', '#111111'],
    actions: [{ id: 'x', frameMs: 400, frames: [{ cells: { [AVATAR_GRID]: { rows: blank(AVATAR_GRID) } } }] }],
    states: { idle: ['x'] },
  };
  assert.equal(store.hasBody(noBody), false);
  assert.equal(store.usableGrid(noBody, BODY_GRID), AVATAR_GRID);
  const draft = store.cellFor(noBody.actions[0].frames[0], BODY_GRID);
  assert.equal(draft.rows.length, BODY_GRID);
  assert.equal(draft.rows[0], '..'.repeat(BODY_GRID));

  const upscaled = store.upscaleCell({ rows: ['01'] });
  assert.equal(upscaled.rows.length, BODY_FALLBACK_SCALE, 'one row becomes four');
  assert.equal(upscaled.rows[0], '01'.repeat(BODY_FALLBACK_SCALE), 'and each pixel becomes four');
});

test('an unknown (or an older build\'s) skin name falls back to the default skin', () => {
  assert.equal(store.resolveSkin({ skin: 'custom' }).name, SKIN,
    'a store written by the customisation build still lights the pet up');
  assert.equal(store.resolveSkin({ skin: 'nope' }).name, SKIN);
  assert.equal(store.resolveSkin({}).name, SKIN);
  assert.equal(store.resolveNamedSkin('nope', AVATAR_GRID), null, 'while a card for it resolves blank');
  assert.equal(store.resolveNamedSkin('custom', AVATAR_GRID), null);
});

test('ACTIVE follows a write, and subscribers are told about it', () => {
  let told = 0;
  const off = store.onSkinChange(() => { told++; });
  try {
    store.saveStored({ skin: SKIN });
    assert.equal(told, 1, 'a write notifies exactly once');
    assert.equal(store.activeSkin(), store.activeSkin(), 'and ACTIVE is a stable reference between writes');
  } finally {
    off();
  }
});

// ── persistence ──

test('the store round-trips, stamps the schema version and notices an outside write', () => {
  store.saveStored({ skin: SKIN });
  const raw = storeMem.get(store.STORE_KEY)!;
  assert.equal(JSON.parse(raw).v, store.STORE_VERSION);
  assert.equal(store.loadStored().skin, SKIN);

  // Another tab writes: the raw text changed, so the cache must not serve the
  // old document.
  storeMem.set(store.STORE_KEY, JSON.stringify({ v: store.STORE_VERSION, skin: 'other' }));
  assert.equal(store.loadStored().skin, 'other');
});

test('an older payload is migrated, and the artwork and brushes it carried are dropped', () => {
  storeMem.set(store.STORE_KEY, JSON.stringify({
    v: 9,
    skin: 'custom',
    brushes: ['#000000', '#111111', '#222222', '#333333', '#444444', '#555555'],
    custom: { palette: ['transparent', '#111111'], actions: [], states: {} },
    builtinStates: { [SKIN]: { tool: ['a'] } },
  }));
  const doc = store.loadStored();
  assert.equal(doc.v, store.STORE_VERSION);
  assert.equal(doc.custom, undefined, 'the custom artwork document has no meaning here');
  assert.equal(doc.brushes, undefined, 'and neither has the paint box');
  assert.deepEqual(doc.builtinStates, { [SKIN]: { tool: ['a'] } }, 'the assignment diff survives');
  assert.equal(store.resolveSkin(doc).name, SKIN, 'and a stale custom skin choice falls back');
});

test('a v8 payload keeps the avatar crop\'s per-crop assignment diff', () => {
  storeMem.set(store.STORE_KEY, JSON.stringify({
    v: 8,
    skin: SKIN,
    builtinStates: { [SKIN]: { '32': { tool: ['a'] }, '128': { idle: ['b'] } } },
  }));
  assert.deepEqual(store.loadStored().builtinStates, { [SKIN]: { tool: ['a'] } },
    'v8 kept one diff per crop; the face that is always required wins');
});

test('a payload from a newer version keeps the skin choice but not the assignment', () => {
  storeMem.set(store.STORE_KEY, JSON.stringify({
    v: store.STORE_VERSION + 1,
    skin: SKIN,
    builtinStates: { [SKIN]: { tool: ['a'] } },
  }));
  const doc = store.loadStored();
  assert.equal(doc.v, store.STORE_VERSION);
  assert.equal(doc.skin, SKIN, 'the choice is version-independent');
  assert.equal(doc.builtinStates, undefined, 'but a newer build\'s assignment is not ours to read');
});

test('a corrupt store falls back instead of throwing', () => {
  storeMem.set(store.STORE_KEY, 'not json at all');
  assert.deepEqual(store.loadStored(), {});
  storeMem.set(store.STORE_KEY, '[1,2,3]');
  assert.deepEqual(store.loadStored(), {});
  assert.equal(store.resolveSkin(store.loadStored()).name, SKIN);
});

// ── the pixel format ──

test('parseFrame reads two-character pixels, transparency and an accent', () => {
  const rows = ['..' + '01', '02' + '..'];
  const sprite = store.parseFrame({ rows, dx: 1, dy: -1 });
  assert.equal(sprite.w, 2);
  assert.equal(sprite.h, 2);
  assert.deepEqual(Array.from(sprite.px), [0, 1, 2, 0]);
  assert.equal(sprite.dx, 1);
  assert.equal(sprite.dy, -1);

  const withProp = store.parseFrame({ rows, prop: { x: 0, y: 0, rows: ['03'] } });
  assert.deepEqual(Array.from(withProp.prop!.px), [3]);
  assert.equal(store.spriteToRows(sprite)[0], '..01', 'and the round trip is exact');

  // A malformed pixel reads as transparent rather than throwing.
  assert.deepEqual(Array.from(store.parseFrame({ rows: ['ZZ' + '01'] }).px), [0, 1]);
});

test('spriteFor memoizes by the face object, so a bitmap cache survives a re-resolve', () => {
  const cell = { rows: blank(AVATAR_GRID) };
  assert.equal(store.spriteFor(cell), store.spriteFor(cell));
  assert.notEqual(store.spriteFor(cell), store.spriteFor({ rows: blank(AVATAR_GRID) }));
});

test('the state vocabulary and the grid table agree with the artwork', () => {
  const art = store.skinArtwork(SKIN)!;
  for (const state of STATE_NAMES) {
    assert.ok(art.states[state] === undefined || Array.isArray(art.states[state]),
      `${state}: known to the document`);
  }
  for (const grid of [AVATAR_GRID, BODY_GRID]) {
    assert.equal(GRIDS[grid].maxOffset, GRIDS[grid].padX, `${grid}: headroom is the offset ceiling`);
    assert.equal(GRIDS[grid].canvasW, grid + 2 * GRIDS[grid].padX, `${grid}: canvas covers the headroom`);
  }
  assert.equal(GRIDS[BODY_GRID].maxOffset, GRIDS[AVATAR_GRID].maxOffset * BODY_FALLBACK_SCALE,
    'the body has exactly the headroom the avatar-unit offset needs');
  assert.equal(store.offsetScale(BODY_GRID), BODY_FALLBACK_SCALE);
  assert.equal(store.offsetScale(AVATAR_GRID), 1);
});
