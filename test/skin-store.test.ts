// Skin store in the ACTION LIBRARY model: validation, the v7 → v8 upgrade,
// assignment, resolution fallbacks, persistence and the change broadcast.
// Built-in artwork arrives from a chunk, so the suite installs the generated
// data itself.

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
  upscalePixels,
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
  takeKey,
  libraryInfo,
  usedBy,
  assignTake,
  setStateSelection,
  addLibraryTake,
  removeLibraryTake,
  renameLibraryTake,
  replaceLibraryTake,
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
const { GRIDS, AVATAR_GRID, BODY_GRID } = await import('../src/pet/grids.ts');
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

const take = (rows = blankRows(AVATAR_GRID), extra: Record<string, unknown> = {}) =>
  ({ frameMs: 400, frames: [{ rows, ...extra }] }) as any;

// A minimal valid artwork: palette + one action the idle state plays.
const minimalArtwork = () => ({
  palette: whale.palette.slice(),
  grids: {
    [AVATAR_GRID]: {
      library: [{ id: 'idle-1', ...take() }],
      states: { idle: ['idle-1'] },
    },
  },
});
/** The library action an artwork's state plays first. */
const actionOf = (art: any, id: string, grid: number = AVATAR_GRID) =>
  art.grids[grid].library.find((a: any) => a.id === id);
const idleAction = (art: any, grid: number = AVATAR_GRID) =>
  actionOf(art, art.grids[grid].states.idle[0], grid);

test('validation accepts a minimal artwork and rejects bad shapes', () => {
  assert.deepEqual(validateArtwork(minimalArtwork()), [], 'minimal artwork is valid');
  assert.ok(validateArtwork(null).length > 0, 'null rejected');
  assert.ok(validateArtwork({}).length > 0, 'empty object rejected');
  assert.ok(validateArtwork({ palette: whale.palette, grids: {} }).length > 0, 'no grids rejected');
  const noIdle = minimalArtwork() as any;
  noIdle.grids[AVATAR_GRID].states = {};
  assert.ok(validateArtwork(noIdle).length > 0, 'idle is mandatory');

  const badPal = minimalArtwork() as any;
  badPal.palette = badPal.palette.slice(0, 1); // transparency with no ink at all
  assert.ok(validateArtwork(badPal).length > 0, 'a palette without an ink is rejected');

  // The palette is the artwork's own colour table: it may hold a handful of
  // colours or a couple of hundred, as long as the pixels only name slots the
  // palette carries.
  const symRow = (ch: string) => ch + TRANSPARENT.repeat(AVATAR_GRID - 2) + ch;
  const fewerColours = minimalArtwork() as any;
  fewerColours.palette = whale.palette.slice(0, 4); // transparency + 3 colours
  assert.deepEqual(validateArtwork(fewerColours), [], 'a palette with few colours is valid');

  // The whale palette already fills all 256 slots, so prove the ceiling on a
  // small artwork instead: 40 colours is well past the old 15-ink format.
  const extended: any = minimalArtwork();
  const extra: string[] = ['transparent'];
  for (let i = 0; i < 40; i++) extra.push('#' + (i + 1).toString(16).padStart(2, '0').repeat(3));
  extended.palette = extra;
  extended.grids[AVATAR_GRID].library[0].frames = [{ rows: Array.from({ length: AVATAR_GRID }, () => symRow('28')) }];
  assert.deepEqual(validateArtwork(extended), [],
    'slot 40 (well past the old 15-colour ceiling) is legal');

  const offPalette = minimalArtwork() as any;
  offPalette.palette = whale.palette.slice(0, 4);      // transparency + 3 colours
  offPalette.grids[AVATAR_GRID].library[0].frames = [{ rows: Array.from({ length: AVATAR_GRID }, () => symRow('28')) }];
  assert.ok(validateArtwork(offPalette).length > 0, 'a pixel naming a missing slot is rejected');

  const asym = minimalArtwork() as any;
  const asymRows = blankRows(AVATAR_GRID);
  asymRows[0] = '01' + TRANSPARENT.repeat(AVATAR_GRID - 2) + TRANSPARENT; // not symmetric
  asym.grids[AVATAR_GRID].library[0].frames = [{ rows: asymRows }];
  assert.deepEqual(validateArtwork(asym), [],
    'drawing is free: an asymmetric frame is legal artwork');

  // Accents are validated like frames.  They used to be unchecked, so a
  // hand-written export could carry a broken prop straight into parseFrame
  // and throw out of the store on the next write.
  const withProp = minimalArtwork() as any;
  withProp.grids[AVATAR_GRID].library[0].frames = [
    { rows: blankRows(AVATAR_GRID), prop: { x: 1, y: 1, rows: ['01', '01'] } },
  ];
  assert.deepEqual(validateArtwork(withProp), [], 'a legal accent is accepted');

  const propNoRows = minimalArtwork() as any;
  propNoRows.grids[AVATAR_GRID].library[0].frames = [{ rows: blankRows(AVATAR_GRID), prop: { x: 1, y: 1 } }];
  assert.ok(validateArtwork(propNoRows).length > 0, 'an accent without rows is rejected');

  const propOutside = minimalArtwork() as any;
  propOutside.grids[AVATAR_GRID].library[0].frames = [
    { rows: blankRows(AVATAR_GRID), prop: { x: AVATAR_GRID, y: 0, rows: ['01', '01'] } },
  ];
  assert.ok(validateArtwork(propOutside).length > 0, 'an accent spilling out of the grid is rejected');

  const propTall = minimalArtwork() as any;
  propTall.grids[AVATAR_GRID].library[0].frames = [
    { rows: blankRows(AVATAR_GRID), prop: { x: 0, y: AVATAR_GRID - 1, rows: ['01', '01'] } },
  ];
  assert.ok(validateArtwork(propTall).length > 0, 'an accent spilling off the bottom is rejected');

  const propOffPalette = minimalArtwork() as any;
  propOffPalette.palette = whale.palette.slice(0, 4);  // slots 1-3 only
  propOffPalette.grids[AVATAR_GRID].library[0].frames = [
    { rows: blankRows(AVATAR_GRID), prop: { x: 0, y: 0, rows: ['09'] } },
  ];
  assert.ok(validateArtwork(propOffPalette).length > 0, 'an accent naming a missing slot is rejected');

  const tooManyFrames = minimalArtwork() as any;
  tooManyFrames.grids[AVATAR_GRID].library[0].frames =
    Array.from({ length: MAX_FRAMES + 1 }, () => ({ rows: blankRows(AVATAR_GRID) }));
  assert.ok(validateArtwork(tooManyFrames).length > 0, `more than ${MAX_FRAMES} frames rejected`);

  const badOffset = minimalArtwork() as any;
  badOffset.grids[AVATAR_GRID].library[0].frames = [{ rows: blankRows(AVATAR_GRID), dy: 99 }];
  assert.ok(validateArtwork(badOffset).length > 0, 'offset beyond headroom rejected');

  const badState = minimalArtwork() as any;
  badState.grids[AVATAR_GRID].states.dizzy = ['idle-1'];
  assert.ok(validateArtwork(badState).length > 0, 'unknown state rejected');
});

// ── the library is a REFERENCE TABLE, and that is what gets validated ──

test('the library\'s ids are unique, and a state may only name ids it carries', () => {
  const dangling = minimalArtwork() as any;
  dangling.grids[AVATAR_GRID].states.tool = ['nope'];
  const broken = validateArtwork(dangling);
  assert.ok(broken.some((e: string) => e.includes('no such action')), 'a dangling reference is refused');

  const duplicate = minimalArtwork() as any;
  duplicate.grids[AVATAR_GRID].states.idle = ['idle-1', 'idle-1'];
  assert.ok(validateArtwork(duplicate).some((e: string) => e.includes('twice')),
    'listing the same action twice is refused');

  const dupId = minimalArtwork() as any;
  dupId.grids[AVATAR_GRID].library = [{ id: 'a', ...take() }, { id: 'a', ...take() }];
  dupId.grids[AVATAR_GRID].states.idle = ['a'];
  assert.ok(validateArtwork(dupId).some((e: string) => e.includes('duplicate id')),
    'two actions cannot share an id');

  const noId = minimalArtwork() as any;
  noId.grids[AVATAR_GRID].library = [{ ...take() }];
  assert.ok(validateArtwork(noId).some((e: string) => e.includes('id must be')),
    'an action without an id is refused');

  const emptyLibrary = minimalArtwork() as any;
  emptyLibrary.grids[AVATAR_GRID].library = [];
  assert.ok(validateArtwork(emptyLibrary).length > 0, 'a grid without a library is refused');
});

test('the caps are separate: MAX_LIBRARY bounds the library, MAX_TAKES one state\'s selection', () => {
  const big = minimalArtwork() as any;
  big.grids[AVATAR_GRID].library = Array.from({ length: MAX_LIBRARY + 1 }, (_, i) => ({ id: 'a' + i, ...take() }));
  big.grids[AVATAR_GRID].states.idle = ['a0'];
  assert.ok(validateArtwork(big).some((e: string) => e.includes('1-' + MAX_LIBRARY)),
    `more than ${MAX_LIBRARY} actions in the library is refused`);

  const manyRefs = minimalArtwork() as any;
  manyRefs.grids[AVATAR_GRID].library =
    Array.from({ length: MAX_TAKES + 1 }, (_, i) => ({ id: 'a' + i, ...take() }));
  manyRefs.grids[AVATAR_GRID].states.idle = Array.from({ length: MAX_TAKES + 1 }, (_, i) => 'a' + i);
  assert.ok(validateArtwork(manyRefs).some((e: string) => e.includes('at most ' + MAX_TAKES)),
    `a state playing more than ${MAX_TAKES} actions is refused`);
});

// ── the pre-v8 shape: one door, and it must be lossless ──

const legacyArtwork = () => ({
  palette: whale.palette.slice(),
  grids: {
    [AVATAR_GRID]: {
      states: {
        idle: [take(), take(blankRows(AVATAR_GRID), { dy: -1 })],
        tool: [take()], // IDENTICAL to idle's first action
      },
    },
  },
});

test('upgradeArtwork turns state-owned takes into one shared library, losslessly', () => {
  const legacy = legacyArtwork();
  const art = upgradeArtwork(legacy as never);
  const g = art.grids[AVATAR_GRID]!;
  assert.equal(g.library.length, 2,
    'the take copied into tool collapses into ONE shared action');
  assert.equal(g.states.idle!.length, 2, 'idle keeps both of its actions');
  assert.deepEqual(g.states.tool, [g.states.idle![0]],
    'tool references the very same action idle plays');
  // The pixels are shared by REFERENCE, not copied.
  const shared = g.library.find((a) => a.id === g.states.idle![0])!;
  assert.equal(shared.frames, legacy.grids[AVATAR_GRID].states.idle[0].frames,
    'upgrading shares the frame objects instead of duplicating 15MB of rows');
  assert.deepEqual(validateArtwork(art), [], 'the upgraded document is valid');
  // Deterministic: the same input gives the same ids and order.
  assert.deepEqual(upgradeArtwork(legacyArtwork() as never), art, 'the upgrade is deterministic');
});

test('convertArtwork understands both shapes and refuses neither by accident', () => {
  assert.deepEqual(convertArtwork(minimalArtwork()), minimalArtwork(), 'v8 as-is');
  const upgraded = convertArtwork(legacyArtwork());
  assert.ok(upgraded, 'a legacy document is upgraded');
  assert.equal(upgraded!.grids[AVATAR_GRID]!.library.length, 2);
  assert.equal(convertArtwork({ palette: [], grids: {} }), null, 'garbage is refused');
  assert.equal(convertArtwork(null), null);
  assert.equal(convertArtwork({ palette: ['transparent'], grids: { 32: { states: {} } } }), null,
    'an empty legacy grid is not artwork');
});

test('a v7 payload in storage is upgraded on read (not thrown away)', () => {
  clearStorage();
  const v7 = {
    v: 7,
    skin: 'custom',
    brushes: ['#000000', '#111111', '#222222', '#333333', '#444444', '#555555'],
    custom: legacyArtwork(),
  };
  storeMem.set(STORE_KEY, JSON.stringify(v7));
  const loaded = loadStored();
  assert.equal(loaded.v, STORE_VERSION, 'the payload is stamped with the current version');
  assert.equal(loaded.skin, 'custom', 'the skin choice survives');
  assert.equal(loaded.brushes![0], '#000000', 'so does the paint box');
  assert.equal(upgradeArtwork(legacyArtwork() as never).grids[AVATAR_GRID]!.library.length, 2);
  assert.deepEqual(loaded.custom!.grids[AVATAR_GRID]!.library.map((a) => a.id).length, 2,
    'the artwork was upgraded, not dropped');
  assert.equal(resolveSkin(loaded).name, 'custom', 'and it resolves as the user\'s own skin');
  refreshActiveSkin();
  assert.equal(activeSkin().name, 'custom', 'a re-read makes it the module-level ACTIVE');
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

// ── assignment: the one operation the library model adds ──

test('assigning an action to a state is a REFERENCE, never a copy', () => {
  const art = minimalArtwork() as any;
  const two = addLibraryTake(art, AVATAR_GRID, take(blankRows(AVATAR_GRID), { dy: -1 }), { id: 'hop' });
  assert.equal(two.id, 'hop');
  let next = assignTake(two.art, AVATAR_GRID, 'tool', 'hop', true);
  assert.deepEqual(next.grids[AVATAR_GRID]!.states.tool, ['hop']);
  // The action is the SAME object in the library: editing it is one edit.
  const shared = next.grids[AVATAR_GRID]!.library.find((a) => a.id === 'hop')!;
  next = replaceLibraryTake(next, AVATAR_GRID, 'hop', {
    frameMs: 123, frames: [{ rows: blankRows(AVATAR_GRID) }],
  });
  assert.equal(next.grids[AVATAR_GRID]!.library.find((a) => a.id === 'hop')!.frameMs, 123);
  assert.equal(shared.frameMs, 400, 'the edit is immutable — the old object is untouched');
  assert.deepEqual(usedBy(next, AVATAR_GRID, 'hop'), ['tool'], 'and it names its player');

  // Unassigning leaves no trace: an empty selection IS "follow idle".
  next = assignTake(next, AVATAR_GRID, 'tool', 'hop', false);
  assert.equal(next.grids[AVATAR_GRID]!.states.tool, undefined, 'the empty list is not stored');
  assert.deepEqual(assignTake(next, AVATAR_GRID, 'tool', 'nope', true), next,
    'assigning an action the library does not have is a no-op');

  // setStateSelection is 「全选」/「清空」.
  next = setStateSelection(next, AVATAR_GRID, 'done', ['idle-1', 'hop', 'idle-1', 'ghost']);
  assert.deepEqual(next.grids[AVATAR_GRID]!.states.done, ['idle-1', 'hop'],
    'a whole selection is filtered to real, distinct ids');
  next = setStateSelection(next, AVATAR_GRID, 'done', []);
  assert.equal(next.grids[AVATAR_GRID]!.states.done, undefined, 'clearing removes the key');
});

test('addLibraryTake shares identical work but can be told to mint a new action', () => {
  const art = minimalArtwork() as any;
  const same = addLibraryTake(art, AVATAR_GRID, take());
  assert.equal(same.art, art, 'an identical action is deduped: the artwork is unchanged');
  assert.equal(same.id, 'idle-1', 'and the existing one is the answer');
  const fresh = addLibraryTake(art, AVATAR_GRID, take(), { unique: true });
  assert.equal(fresh.id, 't1', 'unique: true mints a second, separate action');
  assert.equal(fresh.art.grids[AVATAR_GRID]!.library.length, 2);
  const named = addLibraryTake(fresh.art, AVATAR_GRID, take(blankRows(AVATAR_GRID), { dy: 1 }),
    { id: 'chi-niangao', name: '吃年糕', origin: 'chi-niangao' });
  const last = named.art.grids[AVATAR_GRID]!.library[2];
  assert.equal(last.id, 'chi-niangao');
  assert.equal(last.name, '吃年糕');
  assert.equal(last.origin, 'chi-niangao');
  // A colliding id makes room instead of overwriting: a free id is derived.
  const clash = addLibraryTake(named.art, AVATAR_GRID, take(blankRows(AVATAR_GRID), { dy: 2 }),
    { id: 'chi-niangao', unique: true });
  assert.equal(clash.id, 'chi-niangao-2', 'the base name is kept legible with a suffix');
  // A full library refuses to grow (the returned artwork is unchanged).
  const full = minimalArtwork() as any;
  full.grids[AVATAR_GRID].library = Array.from({ length: MAX_LIBRARY }, (_, i) => ({ id: 'a' + i, ...take() }));
  full.grids[AVATAR_GRID].states.idle = ['a0'];
  assert.equal(addLibraryTake(full, AVATAR_GRID, take(blankRows(AVATAR_GRID), { dy: 3 }), { unique: true }).art, full,
    'a full library does not grow');
});

test('removing an action strips every reference to it — there is no dangling id', () => {
  let art = minimalArtwork() as any;
  art = addLibraryTake(art, AVATAR_GRID, take(blankRows(AVATAR_GRID), { dy: -1 }), { id: 'hop' }).art;
  art = assignTake(art, AVATAR_GRID, 'tool', 'hop', true);
  art = assignTake(art, AVATAR_GRID, 'done', 'hop', true);
  assert.deepEqual(usedBy(art, AVATAR_GRID, 'hop').sort(), ['done', 'tool']);
  const after = removeLibraryTake(art, AVATAR_GRID, 'hop');
  assert.equal(after.grids[AVATAR_GRID]!.library.some((a) => a.id === 'hop'), false, 'it is gone');
  assert.equal(after.grids[AVATAR_GRID]!.states.tool, undefined, 'and its players fall back to idle');
  assert.equal(after.grids[AVATAR_GRID]!.states.done, undefined);
  assert.deepEqual(validateArtwork(after), [], 'the document is still valid');
  assert.equal(removeLibraryTake(after, AVATAR_GRID, 'ghost'), after, 'removing an unknown id is a no-op');
});

test('renaming labels an action without touching its pixels or its players', () => {
  const art = minimalArtwork() as any;
  const renamed = renameLibraryTake(art, AVATAR_GRID, 'idle-1', '  待机  ');
  const a = renamed.grids[AVATAR_GRID]!.library[0];
  assert.equal(a.name, '待机', 'the name is trimmed');
  assert.deepEqual(renamed.grids[AVATAR_GRID]!.states, art.grids[AVATAR_GRID].states);
  assert.equal(a.frames, art.grids[AVATAR_GRID].library[0].frames, 'the pixels are shared');
  assert.equal(renameLibraryTake(renamed, AVATAR_GRID, 'idle-1', '  ').grids[AVATAR_GRID]!.library[0].name,
    undefined, 'an empty name clears the label');
});

test('libraryInfo is the UI\'s read-out: every action, plus who plays it', () => {
  let art = minimalArtwork() as any;
  art = addLibraryTake(art, AVATAR_GRID, take(blankRows(AVATAR_GRID), { dy: -1 }), { id: 'hop' }).art;
  art = assignTake(art, AVATAR_GRID, 'tool', 'hop', true);
  const info = libraryInfo(art, AVATAR_GRID);
  assert.deepEqual(info.map((a: any) => a.id), ['idle-1', 'hop'], 'authored order, first-seen first');
  assert.deepEqual(info[0].usedBy, ['idle'], 'idle plays the first action');
  assert.deepEqual(info[1].usedBy, ['tool'], 'tool plays the second');
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

test('export/import round-trips the library document, and upgrades a v7 one', () => {
  const art = minimalArtwork() as any;
  art.grids[AVATAR_GRID].states.tool = ['idle-1'];
  const roundTrip = parseArtworkExport(serializeArtwork(art));
  assert.ok(roundTrip.data);
  assert.deepEqual(roundTrip.data!.grids[AVATAR_GRID]!.states.tool, ['idle-1'],
    'the assignment rides along');
  assert.equal(roundTrip.data!.grids[AVATAR_GRID]!.library.length, 1,
    'and the library is stored once, however many states play it');

  assert.ok(parseArtworkExport('not json').errors, 'garbage JSON is rejected');
  assert.ok(parseArtworkExport(JSON.stringify({ palette: [], grids: {} })).errors, 'invalid artwork fails');

  // The wire format is versioned, and the SHAPE decides how it is read: a
  // pre-v8 export is upgraded rather than refused (refusing it would strand
  // the user's drawing), while a document from the future is refused outright.
  assert.equal(JSON.parse(serializeArtwork(art)).v, STORE_VERSION, 'the export is stamped');
  assert.ok(parseArtworkExport(JSON.stringify({ palette: art.palette, grids: art.grids })).data,
    'a bare (pre-stamp) export still imports');
  const oldShape = parseArtworkExport(JSON.stringify({ ...legacyArtwork(), v: 7 }));
  assert.ok(oldShape.data, 'a v7 export is upgraded, not refused');
  assert.equal(oldShape.data!.grids[AVATAR_GRID]!.library.length, 2, 'with its copies shared');
  const newer = { v: STORE_VERSION + 1, palette: art.palette, grids: art.grids };
  assert.ok(parseArtworkExport(JSON.stringify(newer)).errors, 'a newer export is refused');
});

test('takeKey names an action by its content, so a copy can be recognised', () => {
  assert.equal(takeKey(take()), takeKey(take()), 'identical takes share a key');
  assert.notEqual(takeKey(take()), takeKey(take(blankRows(AVATAR_GRID), { dy: -1 })),
    'an offset is part of the content');
  assert.notEqual(takeKey(take()), takeKey({ frameMs: 401, frames: [{ rows: blankRows(AVATAR_GRID) }] } as any),
    'so is the pace');
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

test('a custom skin without a body falls back to its OWN avatar, never another skin', () => {
  clearStorage();
  saveStored({ skin: 'custom', custom: minimalArtwork() }); // avatar grid only
  const best = resolveBestSkin();
  assert.equal(best.name, 'custom', 'the popup keeps the user\'s own skin');
  assert.equal(best.grid, AVATAR_GRID, 'at its own avatar crop (drawn at 4x), not the default body');
  const named = resolveNamedSkin('custom', BODY_GRID);
  assert.equal(named!.name, 'custom', 'a named body-grid resolution agrees');
  assert.equal(named!.grid, AVATAR_GRID);
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
  let art = minimalArtwork() as any;
  art.grids[AVATAR_GRID].states.tool = ['idle-1'];
  art.grids[AVATAR_GRID].states.done = ['idle-1'];
  saveStored({ skin: 'custom', custom: art });
  const shared = resolveSkin(loadStored());
  assert.equal(shared.states.tool, shared.states.idle, 'an explicit equal selection shares too');
  assert.equal(shared.states.done, shared.states.idle);
  clearStorage();
});

test('a state plays exactly the actions it names, in library resolution order', () => {
  clearStorage();
  const art = minimalArtwork() as any;
  art.grids[AVATAR_GRID].library.push({ id: 'hop', ...take(blankRows(AVATAR_GRID), { dy: -1 }) });
  art.grids[AVATAR_GRID].states.tool = ['hop'];
  saveStored({ skin: 'custom', custom: art });
  const skin = resolveSkin(loadStored());
  assert.equal(skin.states.tool.takes.length, 1, 'one action assigned, one take to roll');
  assert.equal(skin.states.tool.takes[0].frames[0].sprite.dy, -1, 'and it is the one that was named');
  assert.equal(skin.states.idle.takes.length, 1, 'idle still plays its own');
  clearStorage();
});

test('resolveTakeSkin plays ONE library action, even an unassigned one', () => {
  clearStorage();
  const art = minimalArtwork() as any;
  art.grids[AVATAR_GRID].library.push({ id: 'hop', ...take(blankRows(AVATAR_GRID), { dy: -1 }) });
  saveStored({ skin: 'custom', custom: art });
  const skin = resolveTakeSkin('custom', AVATAR_GRID, 'hop');
  assert.ok(skin, 'an action no state plays still resolves');
  assert.equal(skin!.grid, AVATAR_GRID);
  assert.equal(skin!.states.idle.takes[0].frames[0].sprite.dy, -1, 'and it is that action');
  assert.equal(skin!.states.tool, skin!.states.idle, 'every state maps to it, so a pin cannot miss');
  assert.equal(resolveTakeSkin('custom', AVATAR_GRID, 'ghost'), null, 'an unknown id resolves to null');
  assert.equal(resolveTakeSkin('nope', AVATAR_GRID, 'hop'), null, 'so does an unknown skin');
  // A built-in's library is browsable the same way.
  const builtin = resolveTakeSkin('whale-chan', AVATAR_GRID, whaleIdleId);
  assert.ok(builtin, 'a built-in action resolves by id');
  assert.equal(builtin!.name, 'whale-chan');
  clearStorage();
});

test('skinLibrary lists every action with its frame count and its players', () => {
  const builtin = skinLibrary('whale-chan', AVATAR_GRID);
  assert.equal(builtin.length, whale.grids[AVATAR_GRID]!.library.length,
    'the built-in ships its whole library');
  assert.ok(builtin.every((a) => a.frames >= 1 && a.name && a.origin),
    'every built-in action carries a name and its provenance');
  assert.deepEqual(builtin.find((a) => a.id === whaleIdleId)!.usedBy, ['idle'],
    'and says which state plays it');
  assert.equal(skinLibrary('nope', AVATAR_GRID).length, 0, 'an unknown skin has no library');

  clearStorage();
  const art = minimalArtwork() as any;
  art.grids[AVATAR_GRID].library.push({ id: 'hop', ...take(blankRows(AVATAR_GRID), { dy: -1 }) });
  saveStored({ skin: 'custom', custom: art });
  const custom = skinLibrary('custom', AVATAR_GRID);
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
  saveStored({ custom: { palette: [], grids: {} } });
  assert.equal(loadCustomArtwork(), null, 'invalid artwork → null');
  clearStorage();
});

test('a corrupt store never blanks the pet', () => {
  storeMem.set(STORE_KEY, 'x');
  assert.equal(resolveSkin(loadStored()).name, DEFAULT_SKIN);
  clearStorage();
});

// A guard on the generated data itself: the built-in library must be a real
// library (named, unique ids) and every state must reference ids it carries.
test('the shipped built-in library is a well-formed reference table', () => {
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
  assert.ok(whaleIdleRows.length === AVATAR_GRID, 'the idle action resolves to real pixels');
});
