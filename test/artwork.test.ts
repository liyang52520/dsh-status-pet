// The artwork gate.  `skin/validate.ts` had NO caller after the test suite was
// deleted, so a hand-edit to the 15 MB catalog shipped unchecked — this is the
// caller.  It is the slowest test file (the catalog is huge); that is the price of
// checking the data that the renderer trusts.

import test from 'node:test';
import assert from 'node:assert/strict';

import { validateArtwork } from '../src/skin/validate.ts';
import { CATALOG } from '../src/skin/catalog.ts';
import { BUILTIN_SKINS, DEFAULT_SKIN, installCatalog, artworkOf, isBuiltin } from '../src/skin/registry.ts';
import { ACTION_TONES } from '../src/skin/tones.ts';
import { STATE_NAMES } from '../src/behavior/vocabulary.ts';
import { MAX_FRAMES, MAX_SELECTION, MIN_FRAME_MS, MAX_FRAME_MS } from '../src/skin/model.ts';
import { resolveSkin, resolveActionSkin, blankSkin } from '../src/skin/resolve.ts';
import type { ResolvedState } from '../src/skin/resolve.ts';
import { BODY_FACE, AVATAR_FACE } from '../src/skin/geometry.ts';

test('the shipped catalog passes its own invariant check', () => {
  assert.ok(Object.keys(CATALOG).length > 0, 'the catalog is empty');
  for (const [name, art] of Object.entries(CATALOG)) {
    const problems = validateArtwork(art);
    assert.deepEqual(problems, [], `${name} fails validation: ${problems.join('; ')}`);
  }
});

test('every built-in name has artwork, and the default is one of them', () => {
  assert.ok(BUILTIN_SKINS.length >= 1);
  assert.ok(BUILTIN_SKINS.includes(DEFAULT_SKIN));
  for (const name of BUILTIN_SKINS) {
    assert.ok(CATALOG[name], `${name} is advertised but ships no artwork`);
    assert.equal(isBuiltin(name), true);
    assert.equal(isBuiltin('nope'), false);
  }
});

test('the registry only installs a document it can read', () => {
  installCatalog({ [DEFAULT_SKIN]: { notAnArtwork: true }, junk: null, alsojunk: 3 });
  assert.equal(artworkOf(DEFAULT_SKIN), undefined, 'a malformed document must be skipped, not half-installed');
  installCatalog(CATALOG);
  assert.notEqual(artworkOf(DEFAULT_SKIN), undefined, 'the real catalog installs');
  assert.equal(artworkOf('not-a-skin'), undefined);
});

test('the assignment table covers every state with actions the library owns', () => {
  for (const [name, art] of Object.entries(CATALOG)) {
    const ids = new Set(art.actions.map((a) => a.id));
    const assigned = new Set<string>();
    for (const [state, list] of Object.entries(art.states)) {
      assert.ok(STATE_NAMES.includes(state as never), `${name}: ${state} is not a state name`);
      assert.ok(Array.isArray(list) && list.length > 0, `${name}: ${state} plays nothing`);
      assert.ok(list.length <= MAX_SELECTION, `${name}: ${state} exceeds MAX_SELECTION`);
      for (const id of list) {
        assert.ok(ids.has(id), `${name}: ${state} names the missing action ${id}`);
        assigned.add(id);
      }
    }
    assert.ok(art.states.idle && art.states.idle.length, `${name}: idle is the anchor and must play something`);
    for (const state of STATE_NAMES) {
      assert.ok(art.states[state], `${name}: ${state} has no assignment (it would silently follow idle)`);
    }
    // An action nothing plays is dead weight in a 15 MB chunk.
    const orphans = [...ids].filter((id) => !assigned.has(id));
    assert.deepEqual(orphans, [], `${name}: actions no state plays`);
  }
});

test('every action is tone-tagged, and no tone names a missing action', () => {
  for (const [name, art] of Object.entries(CATALOG)) {
    const tones = ACTION_TONES[name];
    assert.ok(tones, `${name} has no tone table`);
    const ids = new Set(art.actions.map((a) => a.id));
    for (const id of ids) {
      assert.ok(tones[id], `${name}: action ${id} has no tone (it cannot narrow the copy)`);
      assert.ok(['calm', 'bright', 'busy', 'formal', 'worry'].includes(tones[id]),
        `${name}: ${id} has the unknown tone ${tones[id]}`);
    }
    for (const id of Object.keys(tones)) {
      assert.ok(ids.has(id), `${name}: the tone table names the missing action ${id}`);
    }
  }
});

test('frames are within the authored limits', () => {
  for (const [name, art] of Object.entries(CATALOG)) {
    for (const action of art.actions) {
      assert.ok(action.frames.length >= 1 && action.frames.length <= MAX_FRAMES,
        `${name}/${action.id}: ${action.frames.length} frames`);
      assert.ok(action.frameMs >= MIN_FRAME_MS && action.frameMs <= MAX_FRAME_MS,
        `${name}/${action.id}: frameMs ${action.frameMs}`);
      for (const frame of action.frames) {
        if (frame.ms === undefined) continue;
        assert.ok(frame.ms >= MIN_FRAME_MS && frame.ms <= MAX_FRAME_MS, `${name}/${action.id}: ms ${frame.ms}`);
      }
      assert.ok(action.name && action.name.length > 0, `${name}/${action.id}: no human label`);
    }
  }
});

test('resolution is total: every state of every skin renders at both faces', () => {
  for (const name of BUILTIN_SKINS) {
    const art = CATALOG[name];
    for (const face of [AVATAR_FACE, BODY_FACE] as const) {
      const skin = resolveSkin(art, name, face);
      assert.ok(skin, `${name}/${face} did not resolve`);
      for (const state of STATE_NAMES) {
        const entry: ResolvedState | undefined = skin!.states[state];
        assert.ok(entry && entry.animations.length > 0, `${name}/${face}: ${state} has nothing to play`);
        for (const animation of entry.animations) {
          assert.ok(animation.frames.length > 0, `${name}/${face}: an animation has no frames`);
          for (const frame of animation.frames) {
            assert.ok(frame.sprite, `${name}/${face}: a frame has no sprite`);
            assert.ok(Number.isFinite(frame.ms) && frame.ms > 0, `${name}/${face}: a frame has no duration`);
          }
        }
      }
    }
  }
});

test('resolution is memoized by artwork identity', () => {
  const art = CATALOG[BUILTIN_SKINS[0]];
  assert.equal(resolveSkin(art, 'x', AVATAR_FACE), resolveSkin(art, 'x', AVATAR_FACE));
  const action = art.actions[0].id;
  assert.equal(resolveActionSkin(art, 'x', AVATAR_FACE, action), resolveActionSkin(art, 'x', AVATAR_FACE, action));
  assert.equal(resolveActionSkin(art, 'x', AVATAR_FACE, 'no-such-action'), null);
});

test('a blank skin is always renderable (what the dock shows before the chunk lands)', () => {
  const blank = blankSkin('whatever', AVATAR_FACE);
  for (const state of STATE_NAMES) assert.ok(blank.states[state].animations.length > 0);
  assert.equal(blank.name, 'whatever');
});
