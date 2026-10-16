// The wardrobe's pure core: the pixel codec, the 4× body fallback, the face
// geometry, the assignment diff, the action library and the store document.
// No DOM, no React, no canvas — every module here is plain data in/out.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  blankRows,
  hexPixel,
  parseRows,
  parseSprite,
  pixelAt,
  rowPixels,
  spriteToRows,
  TRANSPARENT,
} from '../src/skin/pixels.ts';
import { BODY_SCALE, FACES, LIVE_ZOOM } from '../src/skin/geometry.ts';
import { faceFor, hasActionBody, hasBody, upscaleDrawing, usableFace } from '../src/skin/face.ts';
import { applyDiff } from '../src/skin/overrides.ts';
import { assign, setSelection, usageIndex, usedBy } from '../src/skin/library.ts';
import { MAX_SELECTION } from '../src/skin/model.ts';
import type { Action, Artwork, Drawing, Frame, StateTable } from '../src/skin/model.ts';

// ── fixtures ──

function makeAction(id: string, opts: { avatar?: string; body?: string } = {}): Action {
  const art: Frame['art'] = { avatar: { rows: [opts.avatar ?? '..'] } };
  if (opts.body !== undefined) art.body = { rows: [opts.body] };
  return { id, name: id, frameMs: 100, frames: [{ art }] };
}

function actions(count: number): Action[] {
  return Array.from({ length: count }, (_, i) => makeAction('a' + i));
}

/** Three actions; only `a1` is played (by idle and tool). */
function makeArtwork(over: Partial<Artwork> = {}): Artwork {
  return {
    palette: ['transparent', '#ffffff'],
    actions: [makeAction('a1'), makeAction('a2'), makeAction('a3')],
    states: { idle: ['a1'], tool: ['a1'] },
    ...over,
  };
}

// ── pixels ──

test('pixels: parseRows decodes two-char pixels into palette indices', () => {
  const parsed = parseRows(['0102', '..03']);
  assert.equal(parsed.w, 2);
  assert.equal(parsed.h, 2);
  assert.ok(parsed.px instanceof Uint8Array);
  assert.deepEqual([...parsed.px], [1, 2, 0, 3], '`..` is transparency (index 0)');
});

test('pixels: illegal pixels and ragged rows decode to 0 instead of throwing', () => {
  // 'zz' is out of the charset, 'G' is uppercase (the format is lowercase-only),
  // and a non-ASCII char is not a hex digit either.
  assert.deepEqual([...parseRows(['zz0G']).px], [0, 0]);
  assert.deepEqual([...parseRows(['0A..']).px], [0, 0]);
  assert.deepEqual([...parseRows(['鲸鲸']).px], [0]);

  // A row shorter than row 0 reads past its end → transparency, no throw; a
  // longer row is truncated to the width row 0 established.
  const ragged = parseRows(['010203', '01']);
  assert.equal(ragged.w, 3);
  assert.equal(ragged.h, 2);
  assert.deepEqual([...ragged.px], [1, 2, 3, 1, 0, 0]);

  // An ODD-length row is tolerated but not really handled: `rowPixels` halves
  // the character count without checking parity, so the reported width becomes
  // fractional and the typed-array length is silently truncated by V8.
  // (NOTE: this is the actual behaviour — per spec ToIndex would reject a
  // fractional length, so the guard is the engine's, not the codec's.)
  const odd = parseRows(['011']);
  assert.equal(odd.w, 1.5, 'nothing rounds the odd row to a pixel count');
  assert.equal(odd.px.length, 1);

  assert.doesNotThrow(() => parseRows([]));
  assert.deepEqual([...parseRows([]).px], []);
  assert.equal(parseRows([]).w, 0);
});

test('pixels: hexPixel / rowPixels / pixelAt / spriteToRows round-trip', () => {
  assert.equal(hexPixel(1), '01');
  assert.equal(hexPixel(15), '0f');
  assert.equal(hexPixel(255), 'ff');
  assert.equal(hexPixel(0), '00');

  assert.equal(rowPixels('0102'), 2);
  assert.equal(rowPixels(''), 0);
  assert.equal(pixelAt('0102', 0), '01');
  assert.equal(pixelAt('0102', 1), '02');

  assert.equal(TRANSPARENT, '..');
  // `blankRows(size)` is a size×size square: `..` repeated `size` times per row.
  assert.deepEqual(blankRows(2), ['....', '....']);
  assert.equal(blankRows(2).length, 2);
  assert.equal(rowPixels(blankRows(2)[0]), 2);

  const rows = ['01..', 'abff'];
  assert.deepEqual(spriteToRows(parseSprite({ rows })), rows);

  const sprite = parseSprite({
    rows,
    dx: 2,
    dy: -3,
    prop: { x: 1, y: 1, rows: ['..0f'] },
  });
  assert.equal(sprite.w, 2);
  assert.equal(sprite.h, 2);
  assert.equal(sprite.dx, 2);
  assert.equal(sprite.dy, -3);
  assert.equal(sprite.prop?.w, 2);
  assert.equal(sprite.prop?.x, 1);
  assert.deepEqual([...(sprite.prop?.px ?? [])], [0, 15]);
});

// ── face ──

test('face: a frame with no art.body yields the avatar upscaled exactly 4×', () => {
  const f: Frame = { art: { avatar: { rows: ['01..', '..ab'] } } };
  assert.equal(BODY_SCALE, 4);

  const body = faceFor(f, 'body');
  assert.equal(body.rows.length, 8, '2 avatar rows × 4');
  assert.equal(rowPixels(body.rows[0]), 8, '2 avatar pixels × 4');
  // Each source row becomes 4 identical rows, each source pixel 4 identical ones.
  assert.equal(body.rows[0], '01010101........');
  assert.equal(body.rows[1], '01010101........');
  assert.equal(body.rows[4], '........abababab');

  // The avatar face is handed back by identity — no copy, no upscale.
  assert.equal(faceFor(f, 'avatar'), f.art.avatar);
  const headless = { art: {} } as unknown as Frame;
  assert.equal(faceFor(headless, 'avatar').rows.length, FACES.avatar.size);
  assert.deepEqual(faceFor(headless, 'avatar').rows, blankRows(FACES.avatar.size));
});

test('face: the derived body is memoized by (frame, face) identity', () => {
  const f: Frame = { art: { avatar: { rows: ['01..'] } } };
  assert.equal(faceFor(f, 'body'), faceFor(f, 'body'));

  // A different frame object is a different key …
  const other: Frame = { art: { avatar: { rows: ['01..'] } } };
  assert.notEqual(faceFor(other, 'body'), faceFor(f, 'body'));
  // … even though it derives the same pixels.
  assert.deepEqual(faceFor(other, 'body'), faceFor(f, 'body'));

  // An authored body is returned as-is, never derived.
  const withBody: Frame = { art: { avatar: { rows: ['01..'] }, body: { rows: ['..ff'] } } };
  assert.equal(faceFor(withBody, 'body'), withBody.art.body);
});

test('face: upscaleDrawing scales the accent too', () => {
  const drawing: Drawing = { rows: ['01'], prop: { x: 2, y: 1, rows: ['0f'] } };
  const big = upscaleDrawing(drawing);
  assert.equal(big.rows[0], '01010101');
  assert.equal(big.prop?.x, 8);
  assert.equal(big.prop?.y, 4);
  assert.equal(big.prop?.rows[0], '0f0f0f0f');
});

test('face: usableFace falls back to the avatar when the artwork carries no body', () => {
  const headless = makeArtwork();
  assert.equal(hasBody(headless), false);
  assert.equal(usableFace(headless, 'body'), 'avatar');
  assert.equal(usableFace(headless, 'avatar'), 'avatar');

  const bodied = makeArtwork({ actions: [makeAction('a1', { body: '..' })] });
  assert.equal(hasBody(bodied), true);
  assert.equal(usableFace(bodied, 'body'), 'body');
  assert.equal(usableFace(bodied, 'avatar'), 'avatar');

  // One body frame anywhere in the action is enough.
  const partial: Action = {
    id: 'a1',
    name: 'a1',
    frameMs: 100,
    frames: [{ art: { avatar: { rows: ['..'] } } }, { art: { avatar: { rows: ['..'] }, body: { rows: ['..'] } } }],
  };
  assert.equal(hasActionBody(partial), true);
});

// ── geometry ──

test('geometry: every face keeps maxOffset === padX and the 4× body plan', () => {
  assert.equal(FACES.avatar.maxOffset, FACES.avatar.padX);
  assert.equal(FACES.body.maxOffset, FACES.body.padX);
  assert.equal(FACES.body.size, FACES.avatar.size * 4);
  assert.equal(BODY_SCALE, 4);
  assert.equal(FACES.avatar.canvasW, FACES.avatar.size + FACES.avatar.padX * 2);
  assert.equal(FACES.body.canvasW, FACES.body.size + FACES.body.padX * 2);
  assert.equal(FACES.avatar.canvasH, FACES.avatar.size + FACES.avatar.baseY * 2);
  assert.equal(FACES.body.canvasH, FACES.body.size + FACES.body.baseY * 2);
  assert.equal(LIVE_ZOOM, 1 / 2);
});

// ── overrides ──

test('overrides: unknown states and non-list values are ignored entirely', () => {
  const art = makeArtwork();
  const diff = { nope: ['a1'], tool: 'a1' as unknown as string[] };
  // Nothing the sanitiser recognises changed ⇒ the very same document comes back,
  // so every downstream identity-keyed cache stays hot.
  assert.equal(applyDiff(art, diff), art);
  assert.equal(applyDiff(art, null), art);
  assert.equal(applyDiff(art, {}), art);
  assert.equal(applyDiff(undefined, { tool: ['a1'] }), undefined);
});

test('overrides: unknown ids are dropped and duplicates collapse', () => {
  const art = makeArtwork();

  const dropped = applyDiff(art, { tool: ['ghost'] })!;
  assert.equal(dropped.states.tool, undefined, 'an emptied state follows idle, rather than playing nothing');

  const collapsed = applyDiff(art, { tool: ['a2', 'a2', 'a3', 'a2'] })!;
  assert.deepEqual(collapsed.states.tool, ['a2', 'a3']);
  assert.equal(collapsed.states.idle, art.states.idle, 'untouched states keep the authored assignment');
  assert.equal(collapsed.actions, art.actions, 'a diff can never reach the pixels');
  assert.equal(collapsed.palette, art.palette);
});

test('overrides: a selection is capped at MAX_SELECTION', () => {
  const library = actions(65);
  const art: Artwork = {
    palette: ['transparent'],
    actions: library,
    states: { idle: library.slice(0, 3).map((a) => a.id) },
  };
  const out = applyDiff(art, { idle: library.map((a) => a.id) })!;
  assert.equal(out.states.idle?.length, MAX_SELECTION);
  assert.deepEqual(
    out.states.idle,
    library.slice(0, MAX_SELECTION).map((a) => a.id),
  );
});

test('overrides: an empty idle falls back to the authored idle — never a blank pet', () => {
  const art = makeArtwork();
  const out = applyDiff(art, { idle: [] })!;
  assert.ok(Array.isArray(out.states.idle) && out.states.idle.length > 0);
  assert.deepEqual(out.states.idle, art.states.idle);

  // Even an artwork that never carried an idle is given one (its first action),
  // because the renderer refuses a skin it cannot anchor.
  const orphan: Artwork = { palette: ['transparent'], actions: [makeAction('a1')], states: {} };
  const rescued = applyDiff(orphan, { idle: [] })!;
  assert.deepEqual(rescued.states.idle, ['a1']);
  const rescuedToo = applyDiff(orphan, { tool: ['a1'] })!;
  assert.deepEqual(rescuedToo.states.idle, ['a1']);
});

test('overrides: the result is memoized by (artwork, diff) identity', () => {
  const art = makeArtwork();
  const diff = { tool: ['a2'] };
  const once = applyDiff(art, diff)!;
  assert.equal(applyDiff(art, diff), once, 'same artwork + same diff object ⇒ same document');
  assert.notEqual(applyDiff(art, { tool: ['a3'] }), once);
  assert.notEqual(applyDiff(makeArtwork(), diff), once);
});

// ── library ──

test('library: usageIndex / usedBy report who plays what', () => {
  const art = makeArtwork();
  const index = usageIndex(art);

  assert.deepEqual(index.get('a2'), [], 'an action nothing plays maps to the empty list');
  assert.deepEqual(usedBy(art, 'a2'), []);
  assert.deepEqual(usedBy(art, 'a1'), ['idle', 'tool'], 'players come back in canonical state order');
  assert.equal(usageIndex(art), index, 'the index is memoized by artwork identity');
  assert.deepEqual(usedBy(art, 'ghost'), [], 'an unknown id is not an error');
});

test('library: assign refuses unknown ids and the cap; setSelection de-dupes', () => {
  const art = makeArtwork();
  assert.equal(assign(art, 'tool', 'ghost', true), art, 'an id the library does not carry cannot be assigned');

  const on = assign(art, 'tool', 'a2', true);
  assert.deepEqual(on.states.tool, ['a1', 'a2']);
  assert.equal(assign(on, 'tool', 'a2', true), on, 'already assigned ⇒ no-op');
  const off = assign(on, 'tool', 'a2', false);
  assert.deepEqual(off.states.tool, ['a1']);
  assert.equal(assign(off, 'tool', 'a2', false), off);

  // The cap: a state that already holds MAX_SELECTION cannot grow.
  const library = actions(MAX_SELECTION + 1);
  const full: Artwork = {
    palette: ['transparent'],
    actions: library,
    states: { idle: library.slice(0, MAX_SELECTION).map((a) => a.id) },
  };
  assert.equal(assign(full, 'idle', library[MAX_SELECTION].id, true), full);
  assert.equal(full.states.idle?.length, MAX_SELECTION);

  // setSelection: unknown dropped, duplicates collapsed, capped.
  assert.deepEqual(setSelection(art, 'tool', ['a2', 'a2', 'ghost', 'a3', 'a2']).states.tool, ['a2', 'a3']);
  const cleared = setSelection(art, 'tool', []);
  assert.equal('tool' in cleared.states, false, 'an empty selection is stored as "follow idle"');
  assert.deepEqual(setSelection(full, 'idle', library.map((a) => a.id)).states.idle?.length, MAX_SELECTION);

  // An unknown state is refused outright (symmetry with `applyDiff`, which drops
  // it on the way back in) — it used to be written into the table.
  const bogusState = assign(art, 'not-a-state', 'a2', true);
  assert.equal(bogusState, art, 'an unknown state must be a no-op');
  assert.equal('not-a-state' in bogusState.states, false);
});

test('library: withStates-style edits are immutable', () => {
  const art = makeArtwork();
  const before: StateTable = art.states;
  const next = assign(art, 'tool', 'a2', true);
  assert.notEqual(next, art);
  assert.equal(art.states, before, 'the source artwork is untouched');
  assert.deepEqual(art.states.tool, ['a1']);
});

// ── storage ──
//
// The module reads `window` lazily, so the fake is installed BEFORE the dynamic
// import and torn down after the whole group.

test('storage', async (t) => {
  let raw: string | null = null;
  let throwOnSet = false;
  let throwOnGet = false;
  const localStorage = {
    getItem(_key: string): string | null {
      if (throwOnGet) throw new Error('storage denied');
      return raw;
    },
    setItem(_key: string, value: string): void {
      if (throwOnSet) throw new Error('QuotaExceededError');
      raw = value;
    },
  };
  (globalThis as { window?: unknown }).window = { localStorage };
  t.after(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  const { readStored, writeStored, onWrite, KEY, SCHEMA } = await import('../src/skin/storage.ts');

  await t.test('a valid schema-1 document is parsed', () => {
    assert.equal(KEY, 'status-pet:skin');
    assert.equal(SCHEMA, 1);
    raw = JSON.stringify({
      v: 1,
      skin: 'whale-chan',
      assignments: { 'whale-chan': { tool: ['a1'] } },
      dockText: 'left',
    });
    const doc = readStored();
    assert.equal(doc.v, 1);
    assert.equal(doc.skin, 'whale-chan');
    assert.deepEqual(doc.assignments?.['whale-chan']?.tool, ['a1']);
    assert.equal(doc.dockText, 'left');
  });

  await t.test('foreign, malformed and non-object payloads read as an empty store', () => {
    const bad = [
      '{"v":2,"skin":"someone-elses-document"}',
      '{"skin":"whale-chan"}', // right shape, no version
      'not json at all{',
      '[1,2,3]',
      '"just a string"',
      '42',
      'null',
      '',
    ];
    for (const text of bad) {
      raw = text;
      assert.deepEqual(readStored(), {}, `payload: ${JSON.stringify(text)}`);
    }
    raw = null;
    assert.deepEqual(readStored(), {});

    // A storage that throws on read is an empty store too, not a crash.
    throwOnGet = true;
    assert.deepEqual(readStored(), {});
    throwOnGet = false;
  });

  await t.test('unchanged raw text yields the very same object', () => {
    raw = JSON.stringify({ v: 1, skin: 'whale-chan' });
    const first = readStored();
    assert.equal(readStored(), first, 'identity, not just deep equality');

    raw = JSON.stringify({ v: 1, skin: 'other' });
    const second = readStored();
    assert.notEqual(second, first, 'a changed payload is noticed');
    assert.equal(second.skin, 'other');
  });

  await t.test('a refused write does not keep a lie in memory', () => {
    raw = JSON.stringify({ v: 1, skin: 'whale-chan' });
    assert.equal(readStored().skin, 'whale-chan');

    let notified = 0;
    onWrite(() => {
      notified += 1;
    });

    const written = writeStored({ skin: 'other' });
    assert.equal(written.skin, 'other');
    assert.equal(written.v, SCHEMA);
    assert.equal(notified, 1);
    assert.equal(JSON.parse(raw as string).skin, 'other', 'the write went straight through');
    assert.equal(readStored().skin, 'other');

    // Now storage refuses the write (quota / private mode).
    throwOnSet = true;
    const refused = writeStored({ skin: 'third' });
    assert.equal(refused.skin, 'third', 'the returned document is the attempted merge …');
    assert.equal(readStored().skin, 'other', '… but the store re-reads what storage actually holds');
    assert.notEqual(readStored(), refused);
    assert.equal(notified, 2);
    throwOnSet = false;
  });
});
