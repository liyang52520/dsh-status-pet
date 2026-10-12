// Skin store in the PAIRED model (v9): validation, both upgrade doors (v7 and
// v8), assignment, resolution fallbacks (including the 4× body face),
// persistence and the change broadcast.
//
// Built-in artwork arrives from a chunk, so the suite installs the generated
// data itself — and the chunk is still in the v8 shape, which makes it the best
// possible fixture for the pairing door.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const storeMem = new Map<string, string>();
const dispatched: string[] = [];
(globalThis as any).window = {
  localStorage: {
    getItem: (k: string) => (storeMem.has(k) ? storeMem.get(k)! : null),
    setItem: (k: string, v: string) => void storeMem.set(k, String(v)),
    removeItem: (k: string) => void storeMem.delete(k),
  },
  CustomEvent: function (this: { type: string }, type: string) {
    this.type = type;
  },
  dispatchEvent: (e: { type: string }) => void dispatched.push(e.type),
  addEventListener: () => {},
  removeEventListener: () => {},
};

const {
  STORE_KEY,
  STORE_VERSION,
  SKIN_EVENT,
  DEFAULT_SKIN,
  validateArtwork,
  paintCell,
  shiftRows,
  blankRows,
  pixelAt,
  findOrAdd,
  adoptRows,
  loadBrushes,
  resolveBrushes,
  saveStored,
  serializeArtwork,
  parseArtworkExport,
  loadStored,
  flushStored,
  resolveSkin,
  resolveBestSkin,
  resolveNamedSkin,
  resolveTakeSkin,
  loadCustomArtwork,
  activeSkin,
  installSkinArtwork,
  refreshActiveSkin,
  upgradeArtwork,
  convertArtwork,
  actionKey,
  hasBody,
  hasActionBody,
  cellFor,
  libraryInfo,
  usedBy,
  actionsOf,
  assignTake,
  setStateSelection,
  addLibraryTake,
  removeLibraryTake,
  removeLibraryTakes,
  removalIsBlocked,
  renameLibraryTake,
  replaceLibraryTake,
  replaceFrameCell,
  dropFrameCell,
  overwriteLibraryTake,
  skinLibrary,
  MAX_TAKES,
  MAX_LIBRARY,
  MAX_FRAMES,
  MAX_PALETTE,
  BRUSH_COUNT,
} = await import('../src/pet/skins/store.ts');
const { ARTWORK } = await import('../src/artwork.gen.ts');
installSkinArtwork(ARTWORK as never);
const SKINS = ARTWORK;
const { GRIDS, AVATAR_GRID, BODY_GRID, BODY_FALLBACK_SCALE } = await import('../src/pet/grids.ts');
const { rowPixels, TRANSPARENT } = await import('../src/pet/skins/compose.ts');

// Every reset goes through the store's own flush: the store buffers a large
// snapshot instead of writing one per painted pixel, so a test that clears
// localStorage must force that buffer out first — otherwise the store would
// keep serving the pending document from memory.
const clearStorage = () => {
  flushStored();
  storeMem.clear();
  refreshActiveSkin();
};

const whale = SKINS['whale-chan'];
const whaleIdleId = whale.grids[AVATAR_GRID]!.states.idle![0];
const whaleIdleRows = whale.grids[AVATAR_GRID]!.library.find((a) => a.id === whaleIdleId)!.frames[0].rows;

// ── fixtures in the v9 shape ──

/** One FACE: rows plus an optional accent. */
const face = (rows: string[] = blankRows(AVATAR_GRID), prop?: unknown) =>
  (prop ? { rows, prop } : { rows });

/** One frame: the shared settings on the frame, the pixels in `cells`, and
 *  `body: true` to give it the 128 face too. */
const frame = (
  o: { rows?: string[]; bodyRows?: string[]; dy?: number; dx?: number; ms?: number; prop?: unknown } = {},
) => {
  const cells: Record<number, unknown> = { [AVATAR_GRID]: face(o.rows, o.prop) };
  if (o.bodyRows) cells[BODY_GRID] = { rows: o.bodyRows };
  const f: Record<string, unknown> = { cells };
  if (o.dy !== undefined) f.dy = o.dy;
  if (o.dx !== undefined) f.dx = o.dx;
  if (o.ms !== undefined) f.ms = o.ms;
  return f;
};

/** One library action. */
const action = (
  o: {
    id?: string; frameMs?: number; frames?: unknown[]; name?: string; origin?: string;
  } = {},
): any => {
  const a: Record<string, unknown> = { id: o.id ?? 'a', frameMs: o.frameMs ?? 400, frames: o.frames || [frame()] };
  if (o.name) a.name = o.name;
  if (o.origin) a.origin = o.origin;
  return a;
};

// A minimal valid artwork: palette + one action the idle state plays.
const minimalArtwork = () => ({
  palette: whale.palette.slice(),
  actions: [action({ id: 'idle-1' })],
  states: { idle: ['idle-1'] },
}) as any;

/** The action an artwork's idle state plays. */
const idleAction = (art: any) => art.actions.find((a: any) => a.id === art.states.idle[0]);

/** A v8 document (one library per crop) — the shape the baked chunk still has,
 *  and what a stored v8 payload looks like. */
const v8Artwork = (o: { body?: boolean } = { body: true }) => {
  const grids: Record<number, unknown> = {
    [AVATAR_GRID]: {
      library: [{ id: 'idle-1', frameMs: 400, frames: [{ rows: blankRows(AVATAR_GRID) }] }],
      states: { idle: ['idle-1'] },
    },
  };
  if (o.body) {
    grids[BODY_GRID] = {
      library: [{ id: 'idle-1', frameMs: 400, frames: [{ rows: blankRows(BODY_GRID) }] }],
      states: { idle: ['idle-1'] },
    };
  }
  return { palette: whale.palette.slice(), grids } as any;
};

test('validation accepts a minimal artwork and rejects bad shapes', () => {
  assert.deepEqual(validateArtwork(minimalArtwork()), [], 'minimal artwork is valid');
  assert.ok(validateArtwork(null).length > 0, 'null rejected');
  assert.ok(validateArtwork({}).length > 0, 'empty object rejected');
  assert.ok(validateArtwork({ palette: whale.palette, actions: [] }).length > 0, 'no actions rejected');
  const noIdle = minimalArtwork();
  noIdle.states = {};
  assert.ok(validateArtwork(noIdle).length > 0, 'idle is mandatory');

  const badPal = minimalArtwork();
  badPal.palette = badPal.palette.slice(0, 1); // transparency with no ink at all
  assert.ok(validateArtwork(badPal).length > 0, 'a palette without an ink is rejected');

  // The palette is the artwork's own colour table: it may hold a handful of
  // colours or a couple of hundred, as long as the pixels only name slots the
  // palette carries.
  const symRow = (ch: string) => ch + TRANSPARENT.repeat(AVATAR_GRID - 2) + ch;
  const fewerColours = minimalArtwork();
  fewerColours.palette = whale.palette.slice(0, 4); // transparency + 3 colours
  assert.deepEqual(validateArtwork(fewerColours), [], 'a palette with few colours is valid');

  // The whale palette already fills all 256 slots, so prove the ceiling on a
  // small artwork instead: 40 colours is well past the old 15-ink format.
  const extended: any = minimalArtwork();
  const extra: string[] = ['transparent'];
  for (let i = 0; i < 40; i++) extra.push('#' + (i + 1).toString(16).padStart(2, '0').repeat(3));
  extended.palette = extra;
  extended.actions[0].frames = [{ cells: { [AVATAR_GRID]: face(Array.from({ length: AVATAR_GRID }, () => symRow('28'))) } }];
  assert.deepEqual(validateArtwork(extended), [],
    'slot 40 (well past the old 15-colour ceiling) is legal');

  const offPalette = minimalArtwork();
  offPalette.palette = whale.palette.slice(0, 4);      // transparency + 3 colours
  offPalette.actions[0].frames = [{ cells: { [AVATAR_GRID]: face(Array.from({ length: AVATAR_GRID }, () => symRow('28'))) } }];
  assert.ok(validateArtwork(offPalette).length > 0, 'a pixel naming a missing slot is rejected');

  const asym = minimalArtwork();
  const asymRows = blankRows(AVATAR_GRID);
  asymRows[0] = '01' + TRANSPARENT.repeat(AVATAR_GRID - 1); // not symmetric
  asym.actions[0].frames = [{ cells: { [AVATAR_GRID]: face(asymRows) } }];
  assert.deepEqual(validateArtwork(asym), [],
    'drawing is free: an asymmetric frame is legal artwork');

  // Accents are validated like frames.  They used to be unchecked, so a
  // hand-written export could carry a broken prop straight into parseFrame
  // and throw out of the store on the next write.
  const withProp = minimalArtwork();
  withProp.actions[0].frames = [{ cells: { [AVATAR_GRID]: face(blankRows(AVATAR_GRID), { x: 1, y: 1, rows: ['01', '01'] }) } }];
  assert.deepEqual(validateArtwork(withProp), [], 'a legal accent is accepted');

  const propNoRows = minimalArtwork();
  propNoRows.actions[0].frames = [{ cells: { [AVATAR_GRID]: face(blankRows(AVATAR_GRID), { x: 1, y: 1 }) } }];
  assert.ok(validateArtwork(propNoRows).length > 0, 'an accent without rows is rejected');

  const propOutside = minimalArtwork();
  propOutside.actions[0].frames = [{ cells: { [AVATAR_GRID]: face(blankRows(AVATAR_GRID), { x: AVATAR_GRID, y: 0, rows: ['01', '01'] }) } }];
  assert.ok(validateArtwork(propOutside).length > 0, 'an accent spilling out of the grid is rejected');

  const propTall = minimalArtwork();
  propTall.actions[0].frames = [{ cells: { [AVATAR_GRID]: face(blankRows(AVATAR_GRID), { x: 0, y: AVATAR_GRID - 1, rows: ['01', '01'] }) } }];
  assert.ok(validateArtwork(propTall).length > 0, 'an accent spilling off the bottom is rejected');

  const propOffPalette = minimalArtwork();
  propOffPalette.palette = whale.palette.slice(0, 4);  // slots 1-3 only
  propOffPalette.actions[0].frames = [{ cells: { [AVATAR_GRID]: face(blankRows(AVATAR_GRID), { x: 0, y: 0, rows: ['09'] }) } }];
  assert.ok(validateArtwork(propOffPalette).length > 0, 'an accent naming a missing slot is rejected');

  const tooManyFrames = minimalArtwork();
  tooManyFrames.actions[0].frames = Array.from({ length: MAX_FRAMES + 1 },
    () => ({ cells: { [AVATAR_GRID]: face() } }));
  assert.ok(validateArtwork(tooManyFrames).length > 0, `more than ${MAX_FRAMES} frames rejected`);

  const badOffset = minimalArtwork();
  badOffset.actions[0].frames = [{ cells: { [AVATAR_GRID]: face() }, dy: 99 }];
  assert.ok(validateArtwork(badOffset).length > 0, 'offset beyond headroom rejected');

  // Offsets are authored in AVATAR units, so the avatar's headroom is the one
  // ceiling — and it is exactly what keeps the body inside its own canvas
  // (`GRIDS[128].maxOffset` is 4× it).
  const maxOffset = GRIDS[AVATAR_GRID].maxOffset;
  assert.equal(GRIDS[BODY_GRID].maxOffset, maxOffset * BODY_FALLBACK_SCALE,
    'the body headroom is the avatar headroom at the pairing factor');
  const atCeiling = minimalArtwork();
  atCeiling.actions[0].frames = [{ cells: { [AVATAR_GRID]: face() }, dy: maxOffset }];
  assert.deepEqual(validateArtwork(atCeiling), [], 'the ceiling itself is legal');

  const badState = minimalArtwork();
  badState.states.dizzy = ['idle-1'];
  assert.ok(validateArtwork(badState).length > 0, 'unknown state rejected');

  // The avatar face is REQUIRED, the body face optional — and an unknown grid
  // is refused rather than silently ignored.
  const noAvatar = minimalArtwork();
  noAvatar.actions[0].frames = [{ cells: { [BODY_GRID]: { rows: blankRows(BODY_GRID) } } }];
  assert.ok(validateArtwork(noAvatar).some((e: string) => e.includes('avatar face')),
    'an action without its avatar face is refused');

  const bodyFace = minimalArtwork();
  bodyFace.actions[0].frames = [{ cells: { [AVATAR_GRID]: face(), [BODY_GRID]: { rows: blankRows(BODY_GRID) } } }];
  assert.deepEqual(validateArtwork(bodyFace), [], 'an action may carry a body face');

  const unknownGrid = minimalArtwork();
  unknownGrid.actions[0].frames = [{ cells: { [AVATAR_GRID]: face(), 64: { rows: blankRows(64) } } }];
  assert.ok(validateArtwork(unknownGrid).some((e: string) => e.includes('unknown grid')),
    'a face on an unknown grid is refused');

  const wrongBodySize = minimalArtwork();
  wrongBodySize.actions[0].frames = [{ cells: { [AVATAR_GRID]: face(), [BODY_GRID]: { rows: blankRows(AVATAR_GRID) } } }];
  assert.ok(validateArtwork(wrongBodySize).length > 0, 'a body face must be 128 rows');
});

// ── the library is a REFERENCE TABLE, and that is what gets validated ──

test('the library\'s ids are unique, and a state may only name ids it carries', () => {
  const dangling = minimalArtwork();
  dangling.states.tool = ['nope'];
  const broken = validateArtwork(dangling);
  assert.ok(broken.some((e: string) => e.includes('no such action')), 'a dangling reference is refused');

  const duplicate = minimalArtwork();
  duplicate.states.idle = ['idle-1', 'idle-1'];
  assert.ok(validateArtwork(duplicate).some((e: string) => e.includes('twice')),
    'listing the same action twice is refused');

  const dupId = minimalArtwork();
  dupId.actions = [action({ id: 'a' }), action({ id: 'a' })];
  dupId.states.idle = ['a'];
  assert.ok(validateArtwork(dupId).some((e: string) => e.includes('duplicate id')),
    'two actions cannot share an id');

  const noId = minimalArtwork();
  noId.actions = [{ frameMs: 400, frames: [frame()] }];
  assert.ok(validateArtwork(noId).some((e: string) => e.includes('id must be')),
    'an action without an id is refused');

  const emptyLibrary = minimalArtwork();
  emptyLibrary.actions = [];
  assert.ok(validateArtwork(emptyLibrary).length > 0, 'an artwork without a library is refused');
});

test('the caps are separate: MAX_LIBRARY bounds the library, MAX_TAKES one state\'s selection', () => {
  const big = minimalArtwork();
  big.actions = Array.from({ length: MAX_LIBRARY + 1 }, (_, i) => action({ id: 'a' + i }));
  big.states.idle = ['a0'];
  assert.ok(validateArtwork(big).some((e: string) => e.includes('1-' + MAX_LIBRARY)),
    `more than ${MAX_LIBRARY} actions in the library is refused`);

  const manyRefs = minimalArtwork();
  manyRefs.actions = Array.from({ length: MAX_TAKES + 1 }, (_, i) => action({ id: 'a' + i }));
  manyRefs.states.idle = Array.from({ length: MAX_TAKES + 1 }, (_, i) => 'a' + i);
  assert.ok(validateArtwork(manyRefs).some((e: string) => e.includes('at most ' + MAX_TAKES)),
    `a state playing more than ${MAX_TAKES} actions is refused`);
});

// ── door 1: the pre-v8 shape (a state owning its takes) ──

const legacyArtwork = () => ({
  palette: whale.palette.slice(),
  grids: {
    [AVATAR_GRID]: {
      states: {
        idle: [{ frameMs: 400, frames: [{ rows: blankRows(AVATAR_GRID) }] },
          { frameMs: 400, frames: [{ rows: blankRows(AVATAR_GRID), dy: -1 }] }],
        tool: [{ frameMs: 400, frames: [{ rows: blankRows(AVATAR_GRID) }] }], // IDENTICAL to idle's first
      },
    },
  },
});

test('upgradeArtwork turns state-owned takes into one shared library, losslessly', () => {
  const legacy = legacyArtwork();
  const art = upgradeArtwork(legacy as never)!;
  assert.equal(art.actions.length, 2, 'the take copied into tool collapses into ONE shared action');
  assert.equal(art.states.idle.length, 2, 'idle keeps both of its actions');
  assert.deepEqual(art.states.tool, [art.states.idle[0]],
    'tool references the very same action idle plays');
  // The pixels are shared by REFERENCE, not copied.
  const shared = art.actions.find((a) => a.id === art.states.idle[0])!;
  assert.equal(shared.frames[0].cells[AVATAR_GRID].rows, legacy.grids[AVATAR_GRID].states.idle[0].frames[0].rows,
    'upgrading shares the row arrays instead of duplicating 15MB of pixels');
  assert.deepEqual(validateArtwork(art), [], 'the upgraded document is valid');
  // Deterministic: the same input gives the same ids and order.
  assert.deepEqual(upgradeArtwork(legacyArtwork() as never), art, 'the upgrade is deterministic');
});

// ── door 2: the v8 shape (one library per crop) → ONE paired library ──

test('pairing a v8 document folds both crops into one action, avatar first', () => {
  const art = upgradeArtwork(v8Artwork())!;
  assert.equal(art.actions.length, 1, 'the two crops\' copies of an id are ONE action');
  const a = art.actions[0];
  assert.equal(a.frames.length, 1, 'the frame count is single source');
  assert.equal(a.frames[0].cells[AVATAR_GRID].rows.length, AVATAR_GRID, 'the avatar face is there');
  assert.equal(a.frames[0].cells[BODY_GRID]!.rows.length, BODY_GRID, 'and so is the body face');
  assert.deepEqual(art.states, { idle: ['idle-1'] }, 'the state table is ONE table');
  assert.ok(hasBody(art), 'the paired artwork carries a body');
  assert.deepEqual(validateArtwork(art), [], 'and it validates');
});

test('pairing keeps a body-only action (blank avatar) rather than dropping artwork', () => {
  const v8 = v8Artwork({ body: false });
  v8.grids[BODY_GRID] = {
    library: [{ id: 'body-only', frameMs: 400, frames: [{ rows: blankRows(BODY_GRID), dy: 4 }] }],
    states: { idle: ['body-only'] },
  };
  const art = upgradeArtwork(v8)!;
  assert.deepEqual(art.actions.map((a) => a.id), ['idle-1', 'body-only'], 'nothing is dropped');
  const orphan = art.actions[1];
  assert.equal(orphan.frames[0].cells[BODY_GRID]!.rows.length, BODY_GRID, 'its pixels survive');
  assert.equal(orphan.frames[0].cells[AVATAR_GRID].rows.length, AVATAR_GRID,
    'behind a blank avatar face the user can draw on');
  assert.equal(orphan.frames[0].dy, 1, 'a body-only offset converts back into avatar units');
  assert.deepEqual(art.states, { idle: ['idle-1'] },
    'the avatar crop is the assignment authority, so the orphan is simply unplayed');
});

test('the shipped chunk pairs losslessly, and the suite says so structurally', () => {
  const paired = upgradeArtwork(whale as never)!;
  assert.equal(paired.actions.length, 106, 'one action per shipped catalog entry');
  assert.equal(Object.keys(paired.states).length, 11, 'one state table');
  for (const a of paired.actions) {
    const source = whale.grids[AVATAR_GRID]!.library.find((t) => t.id === a.id)!;
    assert.equal(a.frameMs, source.frameMs, a.id + ': pace is the avatar crop\'s');
    assert.equal(a.frames.length, source.frames.length, a.id + ': frame count is the avatar crop\'s');
    source.frames.forEach((f, i) => {
      assert.equal(a.frames[i].cells[AVATAR_GRID].rows, f.rows, a.id + ': avatar pixels are shared by reference');
      assert.equal(a.frames[i].ms, f.ms, a.id + ': per-frame ms came along');
    });
    const body = whale.grids[BODY_GRID]!.library.find((t) => t.id === a.id)!;
    body.frames.forEach((f, i) => {
      assert.equal(a.frames[i].cells[BODY_GRID]!.rows, f.rows, a.id + ': body pixels are shared by reference');
    });
  }
  for (const [state, ids] of Object.entries(whale.grids[AVATAR_GRID]!.states)) {
    assert.deepEqual(paired.states[state], ids, state + ': the avatar crop\'s assignment is the one kept');
  }
  assert.deepEqual(validateArtwork(paired), [], 'the paired built-in validates');
  assert.ok(hasBody(paired), 'and it carries bodies');
});

test('convertArtwork understands every shape and refuses neither by accident', () => {
  assert.deepEqual(convertArtwork(minimalArtwork()), minimalArtwork(), 'v9 as-is');
  assert.ok(convertArtwork(v8Artwork()), 'a v8 document is paired');
  const upgraded = convertArtwork(legacyArtwork());
  assert.ok(upgraded, 'a v7 document is upgraded');
  assert.equal(upgraded!.actions.length, 2);
  assert.equal(convertArtwork({ palette: [], grids: {} }), null, 'garbage is refused');
  assert.equal(convertArtwork(null), null);
  assert.equal(convertArtwork({ palette: ['transparent'], grids: { 32: { states: {} } } }), null,
    'an empty legacy grid is not artwork');
});

test('a v7 or v8 payload in storage is upgraded on read (not thrown away)', () => {
  clearStorage();
  const v7 = {
    v: 7,
    skin: 'custom',
    brushes: ['#000000', '#111111', '#222222', '#333333', '#444444', '#555555'],
    custom: legacyArtwork(),
  };
  storeMem.set(STORE_KEY, JSON.stringify(v7));
  let loaded = loadStored();
  assert.equal(loaded.v, STORE_VERSION, 'the payload is stamped with the current version');
  assert.equal(loaded.skin, 'custom', 'the skin choice survives');
  assert.equal(loaded.brushes![0], '#000000', 'so does the paint box');
  assert.equal(loaded.custom!.actions.length, 2, 'the artwork was upgraded, not dropped');
  assert.equal(resolveSkin(loaded).name, 'custom', 'and it resolves as the user\'s own skin');
  refreshActiveSkin();
  assert.equal(activeSkin().name, 'custom', 'a re-read makes it the module-level ACTIVE');
  clearStorage();

  // The v8 payload: two libraries become one paired library, and the per-crop
  // sidecar diff becomes one flat diff (the avatar's is the one kept).
  const v8 = {
    v: 8,
    skin: 'whale-chan',
    builtinStates: { 'whale-chan': { 32: { tool: [whaleIdleId] }, 128: { tool: ['something-else'] } } },
    custom: v8Artwork(),
  };
  storeMem.set(STORE_KEY, JSON.stringify(v8));
  loaded = loadStored();
  assert.equal(loaded.v, STORE_VERSION);
  assert.equal(loaded.custom!.actions.length, 1, 'the v8 artwork was paired');
  assert.equal(loaded.custom!.actions[0].frames[0].cells[BODY_GRID]!.rows.length, BODY_GRID,
    'with both faces');
  assert.deepEqual(loaded.builtinStates, { 'whale-chan': { tool: [whaleIdleId] } },
    'the assignment diff is flattened, avatar first');
  clearStorage();
});

test('a payload from a NEWER version is dropped rather than half-read', () => {
  clearStorage();
  storeMem.set(STORE_KEY, JSON.stringify({
    v: STORE_VERSION + 1, skin: 'custom', custom: minimalArtwork(),
  }));
  const loaded = loadStored();
  assert.equal(loaded.custom, undefined, 'the artwork from the future is dropped');
  assert.equal(loaded.skin, 'custom', 'the version-independent choice survives');
  clearStorage();
});

// ── assignment: the operations the library model adds ──

test('assigning an action to a state is a REFERENCE, never a copy', () => {
  const art = minimalArtwork();
  const two = addLibraryTake(art, action({ id: 'hop', frames: [frame({ dy: -1 })] }));
  assert.equal(two.id, 'hop');
  let next = assignTake(two.art, 'tool', 'hop', true);
  assert.deepEqual(next.states.tool, ['hop']);
  // The action is the SAME object in the library: editing it is one edit.
  const shared = next.actions.find((a: any) => a.id === 'hop')!;
  next = replaceLibraryTake(next, 'hop', { frameMs: 123, frames: [frame()] as never });
  assert.equal(next.actions.find((a: any) => a.id === 'hop')!.frameMs, 123);
  assert.equal(shared.frameMs, 400, 'the edit is immutable — the old object is untouched');
  assert.deepEqual(usedBy(next, 'hop'), ['tool'], 'and it names its player');

  // Unassigning leaves no trace: an empty selection IS "follow idle".
  next = assignTake(next, 'tool', 'hop', false);
  assert.equal(next.states.tool, undefined, 'the empty list is not stored');
  assert.deepEqual(assignTake(next, 'tool', 'nope', true), next,
    'assigning an action the library does not have is a no-op');

  // setStateSelection is 「全选」/「清空」.
  next = setStateSelection(next, 'done', ['idle-1', 'hop', 'idle-1', 'ghost']);
  assert.deepEqual(next.states.done, ['idle-1', 'hop'], 'a whole selection is filtered to real, distinct ids');
  next = setStateSelection(next, 'done', []);
  assert.equal(next.states.done, undefined, 'clearing removes the key');
});

test('removeLibraryTakes: several actions in ONE pass, and the guards hold', () => {
  const art = addLibraryTake(
    addLibraryTake(minimalArtwork(), action({ id: 'hop', name: 'hop', frames: [frame({ dy: 1 })] })).art,
    action({ id: 'sleep-a', name: 'sleep', frames: [frame({ dy: 2 })] }),
  ).art;
  const withRefs = setStateSelection(art, 'tool', ['hop', 'sleep-a']);
  assert.deepEqual(withRefs.states.tool, ['hop', 'sleep-a']);

  const empty = removeLibraryTakes(withRefs, []);
  assert.equal(empty, withRefs, 'removing nothing is a no-op');

  const next = removeLibraryTakes(withRefs, ['hop', 'sleep-a', 'ghost']);
  assert.deepEqual(next.actions.map((a: any) => a.id), ['idle-1']);
  assert.equal(next.states.tool, undefined,
    'every state that referenced any of them loses just those references');
  assert.deepEqual(validateArtwork(next), [], 'and the document is still valid');
  assert.deepEqual(validateArtwork(withRefs), [], 'the old document is untouched (immutable)');

  // The two refusals: no idle animation, and no library at all.
  assert.equal(removalIsBlocked(withRefs, ['idle-1']), true, 'idle\'s only action cannot go');
  assert.equal(removalIsBlocked(withRefs, ['idle-1', 'hop', 'sleep-a']), true,
    'neither can the whole library');
  assert.equal(removalIsBlocked(withRefs, ['hop']), false, 'an action idle does not need is fine');
  assert.equal(removeLibraryTakes(withRefs, ['idle-1']), withRefs,
    'the mutator refuses what the predicate blocks, even called directly');
  assert.equal(removeLibraryTakes(withRefs, ['idle-1', 'hop', 'sleep-a']), withRefs,
    'including the deletion that would empty the library');
});

test('addLibraryTake shares identical work but can be told to mint a new action', () => {
  const art = minimalArtwork();
  const same = addLibraryTake(art, action({ id: 'ignored' }));
  assert.equal(same.art, art, 'an identical action is deduped: the artwork is unchanged');
  assert.equal(same.id, 'idle-1', 'and the existing one is the answer');
  const fresh = addLibraryTake(art, action({ id: '' }), { unique: true });
  assert.equal(fresh.id, 't1', 'unique: true mints a second, separate action');
  assert.equal(fresh.art.actions.length, 2);
  const carried = addLibraryTake(art, action({ id: 'carried' }), { unique: true });
  assert.equal(carried.id, 'carried', 'an action that carries an id keeps it — that is what a state holds');
  const named = addLibraryTake(fresh.art, action({ name: '吃年糕', origin: 'chi-niangao' }),
    { id: 'chi-niangao', name: '吃年糕', origin: 'chi-niangao' });
  const last = named.art.actions[2];
  assert.equal(last.id, 'chi-niangao');
  assert.equal(last.name, '吃年糕');
  assert.equal(last.origin, 'chi-niangao');
  // A colliding id makes room instead of overwriting: a free id is derived.
  const clash = addLibraryTake(named.art, action({ frames: [frame({ dy: 2 })] }),
    { id: 'chi-niangao', unique: true });
  assert.equal(clash.id, 'chi-niangao-2', 'the base name is kept legible with a suffix');
  // A full library refuses to grow (the returned artwork is unchanged).
  const full = minimalArtwork();
  full.actions = Array.from({ length: MAX_LIBRARY }, (_, i) => action({ id: 'a' + i }));
  full.states.idle = ['a0'];
  assert.equal(addLibraryTake(full, action({ frames: [frame({ dy: 3 })] }), { unique: true }).art, full,
    'a full library does not grow');
});

test('removing an action strips every reference to it — there is no dangling id', () => {
  let art = minimalArtwork();
  art = addLibraryTake(art, action({ id: 'hop', frames: [frame({ dy: -1 })] })).art;
  art = assignTake(art, 'tool', 'hop', true);
  art = assignTake(art, 'done', 'hop', true);
  assert.deepEqual(usedBy(art, 'hop').sort(), ['done', 'tool']);
  const after = removeLibraryTake(art, 'hop');
  assert.equal(after.actions.some((a: any) => a.id === 'hop'), false, 'it is gone');
  assert.equal(after.states.tool, undefined, 'and its players fall back to idle');
  assert.equal(after.states.done, undefined);
  assert.deepEqual(validateArtwork(after), [], 'the document is still valid');
  assert.equal(removeLibraryTake(after, 'ghost'), after, 'removing an unknown id is a no-op');
});

test('renaming labels an action without touching its pixels or its players', () => {
  const art = minimalArtwork();
  const renamed = renameLibraryTake(art, 'idle-1', '  待机  ');
  const a = renamed.actions[0];
  assert.equal(a.name, '待机', 'the name is trimmed');
  assert.deepEqual(renamed.states, art.states);
  assert.equal(a.frames, art.actions[0].frames, 'the pixels are shared');
  assert.equal(renameLibraryTake(renamed, 'idle-1', '  ').actions[0].name,
    undefined, 'an empty name clears the label');
});

test('replaceFrameCell and dropFrameCell touch ONE face of ONE frame', () => {
  const art = minimalArtwork();
  art.actions[0].frames = [frame(), frame({ dy: 1 })];
  const rows = paintCell(blankRows(AVATAR_GRID), 1, 1, '02');
  const painted = replaceFrameCell(art, 'idle-1', 0, AVATAR_GRID, { rows });
  assert.equal(painted.actions[0].frames[0].cells[AVATAR_GRID].rows, rows, 'the face is repainted');
  assert.equal(painted.actions[0].frames[1], art.actions[0].frames[1],
    'and the frame nobody touched is shared by reference');
  assert.equal(painted.actions[0].frames[0].cells[BODY_GRID], undefined, 'no body face appeared');
  const body = replaceFrameCell(art, 'idle-1', 0, BODY_GRID, { rows: blankRows(BODY_GRID) });
  assert.ok(body.actions[0].frames[0].cells[BODY_GRID], 'a body face can be minted');
  assert.equal(dropFrameCell(body, 'idle-1', 0, BODY_GRID).actions[0].frames[0].cells[BODY_GRID], undefined,
    'and dropped again');
  assert.equal(replaceFrameCell(art, 'ghost', 0, AVATAR_GRID, { rows }), art, 'an unknown id is a no-op');
});

test('overwriteLibraryTake keeps the id and takes BOTH faces from the source', () => {
  const art = addLibraryTake(minimalArtwork(), action({
    id: 'hop',
    frameMs: 250,
    frames: [frame({ bodyRows: blankRows(BODY_GRID) }), frame({ dy: 1, bodyRows: blankRows(BODY_GRID) })],
    name: '导入的',
  })).art;
  const target = minimalArtwork();
  const next = overwriteLibraryTake(target, 'idle-1', {
    frameMs: 250, frames: art.actions[1].frames, name: '导入的', origin: 'x',
  });
  const a = next.actions[0];
  assert.equal(a.id, 'idle-1', 'the reference the states hold is untouched');
  assert.equal(a.frameMs, 250, 'the pace follows the source');
  assert.equal(a.frames.length, 2, 'and so does the frame count');
  assert.ok(hasActionBody(a), 'both faces came along');
  assert.deepEqual(next.states, { idle: ['idle-1'] }, 'the assignment is untouched');
});

test('libraryInfo is the UI\'s read-out: every action, plus who plays it', () => {
  let art = minimalArtwork();
  art = addLibraryTake(art, action({ id: 'hop', frames: [frame({ dy: -1 })] })).art;
  art = assignTake(art, 'tool', 'hop', true);
  const info = libraryInfo(art);
  assert.deepEqual(info.map((a: any) => a.id), ['idle-1', 'hop'], 'authored order, first-seen first');
  assert.deepEqual(info[0].usedBy, ['idle'], 'idle plays the first action');
  assert.deepEqual(info[1].usedBy, ['tool'], 'tool plays the second');
  assert.deepEqual(info.map((a: any) => a.bodyFrames), [0, 0], 'and it reports how many frames carry a body');
  const withBody = replaceFrameCell(art, 'hop', 0, BODY_GRID, { rows: blankRows(BODY_GRID) });
  assert.equal(libraryInfo(withBody)[1].bodyFrames, 1, 'a body face is counted');
});

// ── the pixels (unchanged by the model) ──

test('paintCell paints exactly the pixel asked for — drawing is free', () => {
  let rows = blankRows(AVATAR_GRID);
  rows = paintCell(rows, 1, 3, '04');
  assert.equal(pixelAt(rows[1], 3), '04', 'the pixel landed');
  assert.equal(pixelAt(rows[1], 12), TRANSPARENT, 'and its mirror did NOT');
  rows = paintCell(rows, 5, 14, '05');
  assert.equal(pixelAt(rows[5], 14), '05');
  assert.equal(pixelAt(rows[5], 1), TRANSPARENT, 'no mirror on the other side either');
  assert.equal(rows[1].length, AVATAR_GRID * 2, `the row is still ${AVATAR_GRID} two-char pixels`);
  // Two neighbouring cells in one row stay independent.
  const edge = AVATAR_GRID - 1;
  const wide = paintCell(paintCell(blankRows(AVATAR_GRID), 0, 0, '01'), 0, edge, '02');
  assert.equal(pixelAt(wide[0], 0), '01', 'left edge');
  assert.equal(pixelAt(wide[0], edge), '02', 'right edge, independently');
});

test('findOrAdd: a colour is looked up, never duplicated — until the palette is full', () => {
  const palette = ['transparent', '#111111'];
  const again = findOrAdd(palette, '#111111');
  assert.equal(again.idx, 1, 'an existing colour keeps its slot');
  assert.equal(again.palette, palette, 'and the palette is untouched');
  const fresh = findOrAdd(palette, '#222222');
  assert.equal(fresh.idx, 2, 'a new colour appends');
  assert.deepEqual(fresh.palette, ['transparent', '#111111', '#222222']);
  const full = ['transparent'].concat(Array.from({ length: MAX_PALETTE - 1 }, (_, i) => '#' + i.toString(16).padStart(6, '0')));
  assert.equal(findOrAdd(full, '#abcdef').idx, 1, 'a full palette falls back to the first slot');
});

test('adoptRows points imported rows at this artwork\'s palette — colours, not indices', () => {
  const source = ['transparent', '#111111', '#222222'];
  const rows = ['0102' + '..'.repeat(2)];
  const into = ['transparent', '#222222'];
  const got = adoptRows(rows, source, into);
  // Slot 1 of the source is #111111 (new here → appended), slot 2 is #222222
  // (already present → reused).
  assert.deepEqual(got.palette, ['transparent', '#222222', '#111111']);
  assert.equal(pixelAt(got.rows[0], 0), '02', 'the existing colour is reused');
  assert.equal(pixelAt(got.rows[0], 1), '01', 'the new colour is appended');
  assert.equal(pixelAt(got.rows[0], 2), TRANSPARENT, 'transparency stays transparency');
});

test('shiftRows nudges a frame literally, without re-symmetrizing it', () => {
  const mirror = (x: number) => AVATAR_GRID - 1 - x;
  let rows = blankRows(AVATAR_GRID);
  rows = paintCell(rows, 2, 6, '02'); // a single pixel now
  const down = shiftRows(rows, 0, 1);
  assert.equal(pixelAt(down[3], 6), '02', 'moved down');
  assert.equal(pixelAt(down[3], mirror(6)), TRANSPARENT, 'the old mirror column stays empty');
  assert.equal(down[2], TRANSPARENT.repeat(AVATAR_GRID), 'vacated row is blank');
  const left = shiftRows(rows, -1, 0);
  assert.equal(pixelAt(left[2], 5), '02', 'moved left');
  assert.equal(pixelAt(left[2], mirror(5)), TRANSPARENT, 'nothing is mirrored back in');
  const none = shiftRows(rows, 0, 0);
  assert.deepEqual(none, rows, 'a zero shift is a no-op');
});

test('export/import round-trips the paired document, and upgrades older shapes', () => {
  const art = minimalArtwork();
  art.states.tool = ['idle-1'];
  const roundTrip = parseArtworkExport(serializeArtwork(art));
  assert.ok(roundTrip.data);
  assert.deepEqual(roundTrip.data!.states.tool, ['idle-1'], 'the assignment rides along');
  assert.equal(roundTrip.data!.actions.length, 1, 'and the library is stored once, however many states play it');

  assert.ok(parseArtworkExport('not json').errors, 'garbage JSON is rejected');
  assert.ok(parseArtworkExport(JSON.stringify({ palette: [], actions: [] })).errors, 'invalid artwork fails');

  // The wire format is versioned, and the SHAPE decides how it is read: both
  // older shapes are upgraded rather than refused (refusing would strand the
  // user's drawing), while a document from the future is refused outright.
  assert.equal(JSON.parse(serializeArtwork(art)).v, STORE_VERSION, 'the export is stamped');
  assert.ok(parseArtworkExport(JSON.stringify({ palette: art.palette, actions: art.actions, states: art.states })).data,
    'a bare (pre-stamp) export still imports');
  const v8Shape = parseArtworkExport(JSON.stringify({ ...v8Artwork(), v: 8 }));
  assert.ok(v8Shape.data, 'a v8 export is paired, not refused');
  assert.equal(v8Shape.data!.actions.length, 1);
  assert.ok(hasBody(v8Shape.data!), 'with its body face');
  const oldShape = parseArtworkExport(JSON.stringify({ ...legacyArtwork(), v: 7 }));
  assert.ok(oldShape.data, 'a v7 export is upgraded, not refused');
  assert.equal(oldShape.data!.actions.length, 2, 'with its copies shared');
  const newer = { v: STORE_VERSION + 1, palette: art.palette, actions: art.actions, states: art.states };
  assert.ok(parseArtworkExport(JSON.stringify(newer)).errors, 'a newer export is refused');
});

test('actionKey is the action BY CONTENT, across both faces', () => {
  assert.equal(actionKey(action() as never), actionKey(action() as never), 'identical actions share a key');
  assert.notEqual(actionKey(action() as never), actionKey(action({ frames: [frame({ dy: -1 })] }) as never),
    'an offset is part of the content');
  assert.notEqual(actionKey(action() as never), actionKey(action({ frameMs: 401 }) as never),
    'so is the pace');
  const withBody = action({ frames: [frame({ bodyRows: blankRows(BODY_GRID) })] });
  assert.notEqual(actionKey(action() as never), actionKey(withBody as never),
    'so is a body face — two actions that look different in the popup are not the same action');
  assert.notEqual(actionKey(action() as never), actionKey(action({ name: 'x' }) as never), 'and so is the name');
});

// ── resolution ──

test('resolveSkin falls back to the default on empty / unknown / corrupt', () => {
  assert.equal(resolveSkin({}).name, DEFAULT_SKIN, 'empty store');
  assert.equal(resolveSkin({ skin: 'nope' }).name, DEFAULT_SKIN, 'unknown name');
  assert.equal(resolveSkin({ skin: 'custom' }).name, DEFAULT_SKIN, 'custom with no data');
  assert.equal(resolveSkin(null).name, DEFAULT_SKIN, 'null store');
});

test('the dock resolution is always the 32px avatar; the popup prefers the 128px body', () => {
  const dock = resolveSkin({ skin: 'whale-chan' });
  assert.equal(dock.grid, AVATAR_GRID);
  assert.equal(dock.grid, 32, 'the dock avatar is 32px of art');
  assert.equal(dock.canvasW, GRIDS[AVATAR_GRID].canvasW, 'the canvas carries its horizontal headroom');
  assert.ok(dock.canvasW > dock.grid, 'padX is real headroom, not a relabelled grid');
  assert.equal(dock.canvasH, GRIDS[AVATAR_GRID].canvasH);

  clearStorage();
  saveStored({ skin: 'whale-chan' });
  const best = resolveBestSkin();
  assert.equal(best.grid, BODY_GRID, 'the 128px body when present');
  assert.equal(best.grid, 128, 'the full body is 128px of art');
  assert.equal(best.canvasH, GRIDS[BODY_GRID].canvasH);
  clearStorage();
});

test('BOTH faces of the live pet play the same action — that is the pairing guarantee', () => {
  clearStorage();
  saveStored({ skin: 'whale-chan' });
  const dock = resolveSkin(loadStored());
  const peek = resolveBestSkin();
  for (const state of ['idle', 'tool', 'sleep', 'petted']) {
    assert.equal(dock.states[state].takes.length, peek.states[state].takes.length,
      state + ': both faces roll from the SAME number of actions');
    assert.equal(dock.states[state].takes[0].frameMs, peek.states[state].takes[0].frameMs,
      state + ': and from the same pace');
  }
  clearStorage();
});

test('a custom skin without a body resolves its own avatar; with a body it resolves the 128 face', () => {
  clearStorage();
  saveStored({ skin: 'custom', custom: minimalArtwork() }); // avatar face only
  let best = resolveBestSkin();
  assert.equal(best.name, 'custom', 'the popup keeps the user\'s own skin');
  assert.equal(best.grid, AVATAR_GRID, 'at its own avatar crop (drawn at 4x), not the default body');
  const named = resolveNamedSkin('custom', BODY_GRID);
  assert.equal(named!.name, 'custom', 'a named body-grid resolution agrees');
  assert.equal(named!.grid, AVATAR_GRID);
  assert.equal(hasBody(loadCustomArtwork()!), false, 'the document carries no body');

  // One frame's 128 face is enough to make the artwork body-carrying — and then
  // the popup resolves the 128 grid.
  const withBody = minimalArtwork();
  withBody.actions[0].frames = [{ cells: { [AVATAR_GRID]: face(), [BODY_GRID]: { rows: blankRows(BODY_GRID) } } }];
  saveStored({ skin: 'custom', custom: withBody });
  best = resolveBestSkin();
  assert.equal(best.grid, BODY_GRID, 'a body-carrying artwork resolves the popup at 128');
  clearStorage();
});

test('a frame with no body face falls back to its avatar at 4×, and the offset scales with it', () => {
  clearStorage();
  const art = minimalArtwork();
  // The action carries a body on frame 0 only; frame 1 must derive one.
  art.actions[0].frames = [
    { cells: { [AVATAR_GRID]: face(), [BODY_GRID]: { rows: blankRows(BODY_GRID) } }, dy: 1 },
    { cells: { [AVATAR_GRID]: face(blankRows(AVATAR_GRID)) }, dy: 2 },
  ];
  saveStored({ skin: 'custom', custom: art });
  const peek = resolveBestSkin();
  assert.equal(peek.grid, BODY_GRID);
  const takes = peek.states.idle.takes[0];
  assert.equal(takes.frames[1].sprite.w, BODY_GRID, 'the missing face is materialised at 128');
  assert.equal(takes.frames[1].dy, 2 * BODY_FALLBACK_SCALE,
    'and the whole-frame offset is rendered ×4, so one 整幅挪动 is the same hop on both faces');
  assert.equal(takes.frames[0].dy, 1 * BODY_FALLBACK_SCALE, 'the authored face scales the same way');

  // The same action at the avatar crop keeps the offsets in avatar units.
  const dock = resolveNamedSkin('custom', AVATAR_GRID)!;
  assert.equal(dock.states.idle.takes[0].frames[1].dy, 2, 'the avatar face uses avatar units');
  // `cellFor` is the ONE definition of the fallback, shared by the renderer and
  // the Workshop: it must agree with what the canvas is drawing.
  assert.equal(cellFor(art.actions[0].frames[1], BODY_GRID).rows.length, BODY_GRID,
    'the display helper shows the same 4× draft the renderer derives');
  clearStorage();
});

test('an unassigned state IS idle\'s resolution, by identity', () => {
  const dock = resolveSkin({ skin: 'whale-chan' });
  assert.ok(dock.states.idle, 'idle present');
  assert.ok(dock.states.tool, 'every state present after pre-fill');
  clearStorage();
  saveStored({ skin: 'custom', custom: minimalArtwork() });
  const custom = resolveSkin(loadStored());
  assert.equal(custom.name, 'custom');
  // Not merely equal — the SAME object, which is what the renderer caches on.
  assert.equal(custom.states.tool, custom.states.idle, 'tool follows idle by identity');
  assert.equal(custom.states.petted, custom.states.idle, 'reactions follow too');
  assert.equal(custom.states.done, custom.states.idle);

  // Two states assigned the same SET also share one resolution: the reference
  // is the same, so the work is the same.
  const art = minimalArtwork();
  art.states.tool = ['idle-1'];
  art.states.done = ['idle-1'];
  saveStored({ skin: 'custom', custom: art });
  const shared = resolveSkin(loadStored());
  assert.equal(shared.states.tool, shared.states.idle, 'an explicit equal selection shares too');
  assert.equal(shared.states.done, shared.states.idle);
  clearStorage();
});

test('a state plays exactly the actions it names, in library resolution order', () => {
  clearStorage();
  const art = minimalArtwork();
  art.actions.push(action({ id: 'hop', frames: [frame({ dy: -1 })] }));
  art.states.tool = ['hop'];
  saveStored({ skin: 'custom', custom: art });
  const skin = resolveSkin(loadStored());
  assert.equal(skin.states.tool.takes.length, 1, 'one action assigned, one take to roll');
  assert.equal(skin.states.tool.takes[0].frames[0].dy, -1, 'and it is the one that was named');
  assert.equal(skin.states.idle.takes.length, 1, 'idle still plays its own');
  clearStorage();
});

test('resolveTakeSkin plays ONE library action, even an unassigned one', () => {
  clearStorage();
  const art = minimalArtwork();
  art.actions.push(action({ id: 'hop', frames: [frame({ dy: -1 })] }));
  saveStored({ skin: 'custom', custom: art });
  const skin = resolveTakeSkin('custom', AVATAR_GRID, 'hop');
  assert.ok(skin, 'an action no state plays still resolves');
  assert.equal(skin!.grid, AVATAR_GRID);
  assert.equal(skin!.states.idle.takes[0].frames[0].dy, -1, 'and it is that action');
  assert.equal(skin!.states.tool, skin!.states.idle, 'every state maps to it, so a pin cannot miss');
  assert.equal(resolveTakeSkin('custom', AVATAR_GRID, 'ghost'), null, 'an unknown id resolves to null');
  assert.equal(resolveTakeSkin('nope', AVATAR_GRID, 'hop'), null, 'so does an unknown skin');
  // A built-in's library is browsable the same way, on either face.
  const builtin = resolveTakeSkin('whale-chan', AVATAR_GRID, whaleIdleId);
  assert.ok(builtin, 'a built-in action resolves by id');
  assert.equal(builtin!.name, 'whale-chan');
  assert.equal(resolveTakeSkin('whale-chan', BODY_GRID, whaleIdleId)!.grid, BODY_GRID,
    'and the body face of the same action resolves too');
  clearStorage();
});

test('skinLibrary lists every action with its frame count and its players', () => {
  const builtin = skinLibrary('whale-chan');
  assert.equal(builtin.length, 106, 'the built-in ships its whole library');
  assert.ok(builtin.every((a) => a.frames >= 1 && a.name && a.origin),
    'every built-in action carries a name and its provenance');
  assert.deepEqual(builtin.find((a) => a.id === whaleIdleId)!.usedBy, ['idle'],
    'and says which state plays it');
  assert.ok(builtin.every((a) => a.bodyFrames === a.frames), 'and every shipped action carries both faces');
  assert.equal(skinLibrary('nope').length, 0, 'an unknown skin has no library');

  clearStorage();
  const art = minimalArtwork();
  art.actions.push(action({ id: 'hop', frames: [frame({ dy: -1 })] }));
  saveStored({ skin: 'custom', custom: art });
  const custom = skinLibrary('custom');
  assert.deepEqual(custom.map((a) => a.id), ['idle-1', 'hop']);
  assert.deepEqual(custom[1].usedBy, [], 'an unused action says so');
  clearStorage();
});

test('resolveNamedSkin resolves any skin by name, independent of the active skin', () => {
  clearStorage();
  saveStored({ skin: 'custom', custom: minimalArtwork() });
  const builtin = resolveNamedSkin('whale-chan');
  assert.ok(builtin, 'a built-in resolves even while 我的创作 is active');
  assert.equal(builtin!.name, 'whale-chan');
  assert.equal(builtin!.grid, AVATAR_GRID);
  assert.equal(builtin!.palette[2], SKINS['whale-chan'].palette[2],
    'a built-in resolves its authored palette');
  assert.equal(resolveNamedSkin('custom')!.palette[2], minimalArtwork().palette[2],
    'one skin\'s colours never bleed into another');

  assert.equal(resolveNamedSkin('nope'), null, 'an unknown name resolves to null');
  clearStorage();                 // drops the resolution cache too
  assert.equal(resolveNamedSkin('custom'), null, 'custom without artwork resolves to null (blank card)');
  saveStored({ custom: minimalArtwork() });
  assert.equal(resolveNamedSkin('custom')!.name, 'custom', 'custom with artwork resolves');
  clearStorage();
});

// ── persistence ──

test('a selection persists and broadcasts the change; writes stamp the schema version', () => {
  clearStorage();
  dispatched.length = 0;
  saveStored({ skin: 'custom', custom: minimalArtwork() });
  assert.equal(loadStored().skin, 'custom');
  assert.ok(dispatched.includes(SKIN_EVENT), 'the skin-changed event fired');
  const raw = JSON.parse(storeMem.get(STORE_KEY)!);
  assert.equal(raw.v, STORE_VERSION, 'persisted data carries the schema version');
  assert.ok(raw.custom.actions, 'and the document is stored in the paired shape');
  clearStorage();
});

test('loadStored serves the same object for unchanged storage, and follows every write', () => {
  clearStorage();
  saveStored({ skin: 'custom', custom: minimalArtwork() });
  const a = loadStored();
  assert.equal(loadStored(), a, 'an unchanged store is parsed once (the upgrade pass is not repeated)');
  assert.notEqual(a.skin, undefined);
  saveStored({ skin: 'whale-chan' });
  const b = loadStored();
  assert.notEqual(b, a, 'a write invalidates it');
  assert.equal(b.skin, 'whale-chan');
  assert.equal(a.skin, 'custom', 'and the cached object was not mutated by the write');
  clearStorage();
});

test('the paint box persists and never comes back half-invalid', () => {
  clearStorage();
  assert.deepEqual(loadBrushes(), whale.palette.slice(1, 1 + BRUSH_COUNT), 'the default paint box');
  const custom = ['#000000', '#111111', '#222222', '#333333', '#444444', '#555555'];
  saveStored({ brushes: custom });
  assert.deepEqual(loadBrushes(), custom, 'the paint box survives a write');
  assert.equal(storeMem.get(STORE_KEY)!.includes('#111111'), true, 'and is persisted');
  storeMem.set(STORE_KEY, JSON.stringify({ v: STORE_VERSION, brushes: ['#000000'] }));
  assert.equal(resolveBrushes(loadStored()).length, BRUSH_COUNT, 'a short paint box is rejected');
  storeMem.set(STORE_KEY, JSON.stringify({ v: STORE_VERSION, brushes: ['nope', '#111111', '#222222', '#333333', '#444444', '#555555'] }));
  assert.equal(resolveBrushes(loadStored())[0], whale.palette[1], 'an invalid well falls back to the default');
  clearStorage();
});

test('the module-level active skin follows writes, and refreshes on demand', () => {
  clearStorage();
  assert.equal(activeSkin().name, DEFAULT_SKIN, 'default when empty');
  saveStored({ skin: 'custom', custom: minimalArtwork() });
  assert.equal(activeSkin().name, 'custom', 'a write re-resolves ACTIVE synchronously');
  clearStorage();
});

test('loadCustomArtwork returns the validated document or null', () => {
  clearStorage();
  assert.equal(loadCustomArtwork(), null, 'empty → null');
  saveStored({ custom: minimalArtwork() });
  assert.ok(loadCustomArtwork(), 'valid artwork loads');
  saveStored({ custom: { palette: [], actions: [], states: {} } });
  assert.equal(loadCustomArtwork(), null, 'invalid artwork → null');
  clearStorage();
});

test('a corrupt store never blanks the pet', () => {
  storeMem.set(STORE_KEY, 'x');
  assert.equal(resolveSkin(loadStored()).name, DEFAULT_SKIN);
  clearStorage();
});

// A guard on the generated data itself: the baked v8 chunk must be a real
// reference table per crop (named, unique ids) — the pairing door turns it into
// the v9 model the runtime uses, and this is the one place the RAW data is
// checked before that.
test('the shipped built-in library is a well-formed reference table per crop', () => {
  for (const grid of [AVATAR_GRID, BODY_GRID]) {
    const g = whale.grids[grid]!;
    const ids = g.library.map((a) => a.id);
    assert.equal(new Set(ids).size, ids.length, `grid ${grid}: ids are unique`);
    for (const state of Object.keys(g.states)) {
      for (const id of g.states[state]) {
        assert.ok(ids.includes(id), `grid ${grid} state ${state}: ${id} exists`);
      }
    }
    assert.ok(g.library.every((a) => a.name && a.origin),
      `grid ${grid}: every action is named and traceable`);
    assert.equal(g.library.length, 106, `grid ${grid}: the whole catalog ships`);
  }
  assert.deepEqual(whale.grids[AVATAR_GRID]!.library.map((a) => a.id),
    whale.grids[BODY_GRID]!.library.map((a) => a.id),
    'both crops carry the same library, in the same order — the pairing guarantee starts here');
  assert.ok(whaleIdleRows.length === AVATAR_GRID, 'the idle action resolves to real pixels');
  assert.equal(hasActionBody(upgradeArtwork(v8Artwork())!.actions[0]), true,
    'the pairing helper and the door agree about what a body face is');
  assert.equal(rowPixels(whaleIdleRows[0]), AVATAR_GRID, 'and rows are two-character pixels');
  assert.equal(actionsOf(minimalArtwork()).length, 1, 'the read helper agrees with the fixture');
});
