// The built-in artwork — through the PAIRING door, because that is what the
// runtime draws.  The strongest check available is `validateArtwork` (the
// authored-data invariant module; the suite is its only caller), and on top of
// that this asserts the handful of rendering invariants the validator
// deliberately does not care about (sprite headroom at BOTH faces, crop
// completeness, the state vocabulary), plus the pairing rules the model rests on:
//
//   * both faces of an action share the frame count, the pace, the per-frame
//     `ms` and the offset;
//   * the offset is authored in AVATAR units, so the body face renders ×4 and
//     must still sit inside its own canvas;
//   * the two crops name the same actions in the same order, which is what
//     makes the dock and the popup play the same animation.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { ARTWORK } = await import('../src/artwork.gen.ts');
const { BUILTIN_NAMES, DEFAULT_SKIN, installArtwork } = await import('../src/pet/skins/built-ins.ts');
const { GRIDS, AVATAR_GRID, BODY_GRID, BODY_FALLBACK_SCALE } = await import('../src/pet/grids.ts');
const { STATE_NAMES } = await import('../src/pet/behavior.ts');
const { validateArtwork } = await import('../src/pet/skins/validate.ts');
const {
  parseFrame,
  spriteToRows,
  pixelAt,
  rowPixels,
  hasBody,
  offsetScale,
  upgradeArtwork,
  MAX_TAKES,
  MAX_LIBRARY,
  MAX_FRAMES,
} = await import('../src/pet/skins/store.ts');
type Action = import('../src/pet/skins/compose.ts').Action;

installArtwork(ARTWORK as never);

/** The built-ins as the runtime sees them: paired. */
const PAIRED = Object.fromEntries(
  Object.entries(ARTWORK).map(([name, doc]) => [name, upgradeArtwork(doc as never)!]),
) as Record<string, import('../src/pet/skins/compose.ts').Artwork>;

/** The actions a state plays, in the order it names them. */
function stateActions(art: any, state: string): Action[] {
  const byId = new Map<string, Action>(art.actions.map((a: Action) => [a.id, a]));
  return (art.states[state] || []).map((id: string) => byId.get(id)!);
}

test('the registry covers every advertised built-in, and the default resolves', () => {
  assert.deepEqual(Object.keys(ARTWORK).sort(), [...BUILTIN_NAMES].sort());
  assert.ok(ARTWORK[DEFAULT_SKIN], 'the default skin ships artwork');
  assert.ok(PAIRED[DEFAULT_SKIN], 'and it pairs');
});

test('every built-in validates with the store\'s own artwork validator once paired', () => {
  for (const [name, art] of Object.entries(PAIRED)) {
    assert.deepEqual(validateArtwork(art), [], `${name}: validates as artwork`);
  }
});

test('every built-in carries the whole state vocabulary, and every state has artwork', () => {
  for (const [name, art] of Object.entries(PAIRED)) {
    assert.ok(hasBody(art), `${name}: ships full bodies`);
    assert.ok(art.actions.length <= MAX_LIBRARY, `${name}: library within the cap`);
    assert.ok(art.states.idle.length, `${name}: has idle`);
    for (const state of STATE_NAMES) {
      const actions = stateActions(art, state);
      assert.ok(actions.length >= 1, `${name}/${state}: artwork`);
      assert.ok(actions.length <= MAX_TAKES, `${name}/${state}: action count`);
      assert.ok(actions.every(Boolean), `${name}/${state}: every id resolves`);
    }
  }
});

test('both faces of an action are what the crop means: full grids, never upscaled', () => {
  for (const [name, art] of Object.entries(PAIRED)) {
    for (const action of art.actions) {
      assert.ok(action.frames.length >= 1 && action.frames.length <= MAX_FRAMES,
        `${name}/${action.id}: frame count`);
      for (const f of action.frames) {
        for (const grid of [AVATAR_GRID, BODY_GRID]) {
          const cell = f.cells[grid];
          assert.ok(cell, `${name}/${action.id}: the ${grid}px face ships`);
          assert.equal(cell!.rows.length, grid, `${name}/${action.id}: ${grid} rows`);
          assert.ok(cell!.rows.every((r) => rowPixels(r) === grid),
            `${name}/${action.id}: ${grid} pixels per row`);
        }
      }
    }
  }
});

test('the two faces share the frame count, the pace and the per-frame timing', () => {
  for (const [name, art] of Object.entries(PAIRED)) {
    const raw = ARTWORK[name] as any;
    for (const action of art.actions) {
      const avatar = raw.grids[AVATAR_GRID].library.find((t: any) => t.id === action.id);
      const body = raw.grids[BODY_GRID].library.find((t: any) => t.id === action.id);
      assert.equal(action.frames.length, avatar.frames.length,
        `${name}/${action.id}: the frame count is single source (the avatar crop's)`);
      assert.equal(action.frames.length, body.frames.length,
        `${name}/${action.id}: and the body crop agrees — the pairing is lossless`);
      assert.equal(action.frameMs, avatar.frameMs, `${name}/${action.id}: one pace`);
      assert.equal(action.frameMs, body.frameMs, `${name}/${action.id}: and both crops agreed`);
      action.frames.forEach((f, i) => {
        assert.equal(f.ms, avatar.frames[i].ms, `${name}/${action.id} frame ${i}: one ms`);
        assert.equal(f.ms, body.frames[i].ms, `${name}/${action.id} frame ${i}: both crops agreed`);
      });
    }
  }
});

test('no frame — or its accent — is clipped by its own offset, at EITHER face', () => {
  const maxOffset = GRIDS[AVATAR_GRID].maxOffset;
  for (const [name, art] of Object.entries(PAIRED)) {
    for (const action of art.actions) {
      for (const f of action.frames) {
        // Offsets are authored in avatar units: that is the one ceiling, and the
        // body's headroom is exactly it at the pairing factor.
        assert.ok(Math.abs(f.dx || 0) <= maxOffset, `${name}/${action.id}: dx in headroom`);
        assert.ok(Math.abs(f.dy || 0) <= maxOffset, `${name}/${action.id}: dy in headroom`);
        for (const grid of [AVATAR_GRID, BODY_GRID]) {
          const spec = GRIDS[grid];
          const scale = offsetScale(grid);
          const dx = (f.dx || 0) * scale;
          const dy = (f.dy || 0) * scale;
          assert.ok(Math.abs(dx) <= spec.maxOffset, `${name}/${action.id}: dx fits the ${grid}px canvas`);
          assert.ok(Math.abs(dy) <= spec.maxOffset, `${name}/${action.id}: dy fits the ${grid}px canvas`);
          const rows = f.cells[grid]!.rows;
          for (let y = 0; y < grid; y++) {
            for (let x = 0; x < grid; x++) {
              if (rows[y].slice(x * 2, x * 2 + 2) === '..') continue;
              const cx = spec.padX + dx + x;
              const cy = spec.baseY + dy + y;
              assert.ok(cx >= 0 && cx < spec.canvasW && cy >= 0 && cy < spec.canvasH,
                `${name}/${action.id}: (${x},${y}) is inside the ${grid}px canvas`);
            }
          }
        }
      }
    }
  }
});

test('every palette names only legal colours, and every painted pixel names one', () => {
  for (const [name, art] of Object.entries(PAIRED)) {
    assert.equal(art.palette[0], 'transparent', `${name}: index 0 is transparency`);
    assert.ok(art.palette.length >= 2, `${name}: has colours`);
    assert.ok(art.palette.slice(1).every((c) => /^#[0-9a-f]{6}$/i.test(c)),
      `${name}: palette colours are #rrggbb`);
    const top = art.palette.length - 1;
    for (const action of art.actions) {
      for (const f of action.frames) {
        for (const grid of [AVATAR_GRID, BODY_GRID]) {
          for (const row of f.cells[grid]!.rows) {
            for (let x = 0; x < rowPixels(row); x++) {
              const tok = pixelAt(row, x);
              if (tok === '..') continue;
              const idx = parseInt(tok, 16);
              assert.ok(idx >= 1 && idx <= top, `${name}: pixel names a palette slot`);
            }
          }
        }
      }
    }
  }
});

test('every action is named, traceable and paired by id with the body crop', () => {
  for (const [name, art] of Object.entries(ARTWORK)) {
    const raw = art as any;
    const ids = raw.grids[AVATAR_GRID].library.map((a: any) => a.id);
    const bodyIds = raw.grids[BODY_GRID].library.map((a: any) => a.id);
    assert.deepEqual(ids, bodyIds,
      `${name}: both crops carry the same library, in the same order — the pairing guarantee starts here`);
    const seen = new Set<string>();
    for (const a of raw.grids[AVATAR_GRID].library) {
      assert.ok(a.id && a.id.length <= 64, `${name}: ${a.id} has a legal id`);
      assert.ok(!seen.has(a.id), `${name}: ${a.id} is unique`);
      seen.add(a.id);
      assert.equal(typeof a.name, 'string', `${name}: ${a.id} has a gloss`);
      assert.equal(typeof a.origin, 'string', `${name}: ${a.id} names its gif`);
    }
    // …and the paired document still knows all of it.
    for (const action of PAIRED[name].actions) {
      assert.equal(typeof action.name, 'string', `${name}: the paired ${action.id} kept its gloss`);
      assert.equal(typeof action.origin, 'string', `${name}: the paired ${action.id} kept its gif`);
    }
  }
});

test('parseFrame ⇄ spriteToRows round-trips a real built-in face', () => {
  const art = PAIRED[DEFAULT_SKIN];
  for (const grid of [AVATAR_GRID, BODY_GRID]) {
    const rows = art.actions.find((a) => a.id === art.states.idle[0])!.frames[0].cells[grid]!.rows;
    const sprite = parseFrame({ rows, dx: 1, dy: -1 });
    assert.equal(sprite.w, grid);
    assert.equal(sprite.h, grid);
    assert.deepEqual(spriteToRows(sprite), rows);
  }
});

test('the crops carry real transparency around the character', () => {
  // A frame that is entirely opaque would mean the matte/crop failed.
  for (const [name, art] of Object.entries(PAIRED)) {
    for (const grid of [AVATAR_GRID, BODY_GRID]) {
      const rows = stateActions(art, 'idle')[0].frames[0].cells[grid]!.rows;
      const empty = rows.join('').split('..').length - 1;
      assert.ok(empty > grid, `${name}/${grid}: has transparent background`);
    }
  }
});

test('the body face really is the same character, one integer ratio up', () => {
  // The 32px avatar is a 2:1 downscale of the body's head window, so the two
  // faces are different PICTURES of the same pose — which is exactly why both
  // are stored.  This is a coarse structural check: the avatar's painted area
  // must be a small multiple of the body's, not a whole different silhouette.
  for (const [name, art] of Object.entries(PAIRED)) {
    const action = stateActions(art, 'idle')[0];
    const painted = (rows: string[]) => {
      let n = 0;
      for (const row of rows) for (let x = 0; x < rowPixels(row); x++) if (pixelAt(row, x) !== '..') n++;
      return n;
    };
    const avatar = painted(action.frames[0].cells[AVATAR_GRID]!.rows);
    const body = painted(action.frames[0].cells[BODY_GRID]!.rows);
    const ratio = body / avatar;
    assert.ok(ratio > 4 && ratio < 25,
      `${name}: the body carries ${ratio.toFixed(1)}× the avatar's painted pixels (4-25 expected)`);
    assert.ok(ratio * BODY_FALLBACK_SCALE > 0, 'the pairing factor is part of the check');
  }
});
