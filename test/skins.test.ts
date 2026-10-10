// The built-in artwork — and now there is nothing special about it: a built-in
// is the same `Artwork` document 我的创作 is, so the strongest check available
// is the store's OWN validator.  On top of that the suite asserts the handful
// of rendering invariants the validator deliberately does not care about
// (sprite headroom, crop completeness, the state vocabulary).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { ARTWORK } = await import('../src/artwork.gen.ts');
const { BUILTIN_NAMES, DEFAULT_SKIN, installArtwork } = await import('../src/pet/skins/built-ins.ts');
const { GRIDS, AVATAR_GRID, BODY_GRID } = await import('../src/pet/grids.ts');
const { STATE_NAMES } = await import('../src/pet/behavior.ts');
const {
  validateArtwork,
  parseFrame,
  spriteToRows,
  pixelAt,
  rowPixels,
  MAX_TAKES,
  MAX_LIBRARY,
  MAX_FRAMES,
} = await import('../src/pet/skins/store.ts');
type Take = import('../src/pet/skins/compose.ts').Take;

installArtwork(ARTWORK as never);

/** The library actions a state plays, in the order it names them.  A state
 * stores IDS; this is the one place the suite turns them back into takes. */
function stateTakes(art: any, grid: number, state: string): Take[] {
  const g = art.grids[grid];
  const byId = new Map<string, Take>(g.library.map((a: any) => [a.id, a]));
  return (g.states[state] || []).map((id: string) => byId.get(id)!);
}

test('the registry covers every advertised built-in, and the default resolves', () => {
  assert.deepEqual(Object.keys(ARTWORK).sort(), [...BUILTIN_NAMES].sort());
  assert.ok(ARTWORK[DEFAULT_SKIN], 'the default skin ships artwork');
});

test('every built-in validates with the store\'s own artwork validator', () => {
  for (const [name, art] of Object.entries(ARTWORK)) {
    assert.deepEqual(validateArtwork(art), [], `${name}: validates as artwork`);
  }
});

test('every built-in ships BOTH crops, each with the whole state vocabulary', () => {
  for (const [name, art] of Object.entries(ARTWORK)) {
    for (const grid of [AVATAR_GRID, BODY_GRID]) {
      const g = art.grids[grid];
      assert.ok(g, `${name}: has the ${grid}px crop`);
      assert.ok(g!.states.idle, `${name}/${grid}: has idle`);
      assert.ok(g!.library.length <= MAX_LIBRARY, `${name}/${grid}: library within the cap`);
      for (const state of STATE_NAMES) {
        const takes = stateTakes(art, grid, state);
        assert.ok(takes.length >= 1, `${name}/${grid}/${state}: artwork`);
        assert.ok(takes.length <= MAX_TAKES, `${name}/${grid}/${state}: action count`);
        assert.ok(takes.every(Boolean), `${name}/${grid}/${state}: every id resolves`);
      }
    }
  }
});

test('a built-in is never mirrored, never upscaled: frames are the crop, exactly', () => {
  for (const [name, art] of Object.entries(ARTWORK)) {
    for (const grid of [AVATAR_GRID, BODY_GRID]) {
      // Walk the LIBRARY, not the assignments: an action no state plays is
      // still shipped artwork and still has to be well-formed.
      for (const take of art.grids[grid]!.library) {
        assert.ok(take.frames.length >= 1 && take.frames.length <= MAX_FRAMES,
          `${name}/${grid}: frame count`);
        for (const f of take.frames) {
          assert.equal(f.rows.length, grid, `${name}/${grid}: ${grid} rows`);
          assert.ok(f.rows.every((r) => rowPixels(r) === grid),
            `${name}/${grid}: ${grid} pixels per row`);
        }
      }
    }
  }
});

test('no frame — or its accent — is clipped by its own dx/dy', () => {
  for (const [name, art] of Object.entries(ARTWORK)) {
    for (const grid of [AVATAR_GRID, BODY_GRID]) {
      const spec = GRIDS[grid];
      for (const take of art.grids[grid]!.library) {
        for (const f of take.frames) {
          assert.ok(Math.abs(f.dx || 0) <= spec.maxOffset, `${name}: dx in headroom`);
          assert.ok(Math.abs(f.dy || 0) <= spec.maxOffset, `${name}: dy in headroom`);
          // The painted pixels live inside the grid, and the canvas carries
          // that much headroom: the sprite can never be cut off.
          for (let y = 0; y < grid; y++) {
            for (let x = 0; x < grid; x++) {
              if (f.rows[y].slice(x * 2, x * 2 + 2) === '..') continue;
              const cx = spec.padX + (f.dx || 0) + x;
              const cy = spec.baseY + (f.dy || 0) + y;
              assert.ok(cx >= 0 && cx < spec.canvasW && cy >= 0 && cy < spec.canvasH,
                `${name}: (${x},${y}) is inside the canvas`);
            }
          }
        }
      }
    }
  }
});

test('every palette names only legal colours, and every painted pixel names one', () => {
  for (const [name, art] of Object.entries(ARTWORK)) {
    assert.equal(art.palette[0], 'transparent', `${name}: index 0 is transparency`);
    assert.ok(art.palette.length >= 2, `${name}: has colours`);
    assert.ok(art.palette.slice(1).every((c) => /^#[0-9a-f]{6}$/i.test(c)),
      `${name}: palette colours are #rrggbb`);
    const top = art.palette.length - 1;
    for (const grid of [AVATAR_GRID, BODY_GRID]) {
      for (const take of art.grids[grid]!.library) {
        for (const f of take.frames) {
          for (const row of f.rows) {
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

test('every library action is named and traceable to its gif', () => {
  for (const [name, art] of Object.entries(ARTWORK)) {
    for (const grid of [AVATAR_GRID, BODY_GRID]) {
      const g = art.grids[grid]!;
      const seen = new Set<string>();
      for (const a of g.library) {
        assert.ok(a.id && a.id.length <= 64, `${name}/${grid}: ${a.id} has a legal id`);
        assert.ok(!seen.has(a.id), `${name}/${grid}: ${a.id} is unique`);
        seen.add(a.id);
        assert.equal(typeof a.name, 'string', `${name}/${grid}: ${a.id} has a gloss`);
        assert.equal(typeof a.origin, 'string', `${name}/${grid}: ${a.id} names its gif`);
      }
      // The two crops are one character: the same actions, whatever is assigned.
      assert.deepEqual(g.library.map((a) => a.id),
        art.grids[grid]!.library.map((a) => a.id), `${name}/${grid}: stable order`);
    }
    assert.deepEqual(art.grids[AVATAR_GRID]!.library.map((a) => a.id),
      art.grids[BODY_GRID]!.library.map((a) => a.id),
      `${name}: both crops carry the same library, so a crop switch keeps the selection`);
  }
});

test('parseFrame ⇄ spriteToRows round-trips a real built-in frame', () => {
  const art = ARTWORK[DEFAULT_SKIN];
  for (const grid of [AVATAR_GRID, BODY_GRID]) {
    const rows = stateTakes(art, grid, 'idle')[0].frames[0].rows;
    const sprite = parseFrame({ rows, dx: 1, dy: -1 });
    assert.equal(sprite.w, grid);
    assert.equal(sprite.h, grid);
    assert.deepEqual(spriteToRows(sprite), rows);
  }
});

test('the crops carry real transparency around the character', () => {
  // A frame that is entirely opaque would mean the matte/crop failed.
  for (const [name, art] of Object.entries(ARTWORK)) {
    for (const grid of [AVATAR_GRID, BODY_GRID]) {
      const rows = stateTakes(art, grid, 'idle')[0].frames[0].rows;
      const empty = rows.join('').split('..').length - 1;
      assert.ok(empty > grid, `${name}/${grid}: has transparent background`);
    }
  }
});
