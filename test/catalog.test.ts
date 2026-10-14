// Validate the generated catalog against the same invariants the renderer
// relies on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../src/skin/catalog.ts';
import { validateArtwork } from '../src/skin/validate.ts';
import { BUILTIN_SKINS, DEFAULT_SKIN } from '../src/skin/registry.ts';
import { FACES } from '../src/skin/geometry.ts';
import { documentOf } from '../src/skin/documents.ts';
import { faceFor } from '../src/skin/face.ts';
import { installCatalog } from '../src/skin/session.ts';
import { MAX_SELECTION } from '../src/skin/model.ts';
import { STATE_NAMES } from '../src/behavior/vocabulary.ts';

// Install the catalog so the document layer can resolve.
installCatalog(CATALOG);

test('the catalog covers every advertised built-in', () => {
  assert.deepEqual(Object.keys(CATALOG).sort(), [...BUILTIN_SKINS].sort());
  assert.ok(CATALOG[DEFAULT_SKIN], 'the default skin ships artwork');
});

test('every built-in validates', () => {
  for (const [name, art] of Object.entries(CATALOG)) {
    const errors = validateArtwork(art);
    assert.deepEqual(errors, [], `${name}: validates as artwork`);
  }
});

test('every action has both faces present, and they are correctly sized', () => {
  for (const [name, art] of Object.entries(CATALOG)) {
    for (const action of art.actions) {
      for (const frame of action.frames) {
        const avatar = frame.art.avatar;
        assert.equal(avatar.rows.length, FACES.avatar.size, `${name}/${action.id}: avatar has ${FACES.avatar.size} rows`);
        for (const row of avatar.rows) {
          assert.equal(row.length, FACES.avatar.size * 2, `${name}/${action.id}: avatar row is ${FACES.avatar.size} chars`);
        }
        if (frame.art.body) {
          assert.equal(frame.art.body.rows.length, FACES.body.size, `${name}/${action.id}: body has ${FACES.body.size} rows`);
          for (const row of frame.art.body.rows) {
            assert.equal(row.length, FACES.body.size * 2, `${name}/${action.id}: body row is ${FACES.body.size} chars`);
          }
        }
      }
    }
  }
});

test('every state opens with a workable default assignment', () => {
  const art = CATALOG[DEFAULT_SKIN];
  // V2 把默认分派铺到 24 个状态，idle 有意拿得最多（她出场最多），所以上限是
  // 分配上限本身，而不是 V1 时代的"每状态最多 4 个"。
  for (const [state, ids] of Object.entries(art.states)) {
    assert.ok(ids.length >= 1 && ids.length <= MAX_SELECTION, `${state} 有 1~${MAX_SELECTION} 个默认动作`);
    assert.equal(new Set(ids).size, ids.length, `${state} 的默认动作不重复`);
  }
  assert.equal(Object.keys(art.states).length, STATE_NAMES.length, '每个状态名都有分派');
  assert.ok(art.actions.length > Object.keys(art.states).length, '动作库远大于默认分派');
});

test('ids are unique, every action is named and traceable', () => {
  const art = CATALOG[DEFAULT_SKIN];
  const ids = art.actions.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  assert.ok(art.actions.every((a) => a.name && a.origin), 'every action is named and traceable');
});

test('every state reference resolves to a shipped action', () => {
  const art = CATALOG[DEFAULT_SKIN];
  const byId = new Map(art.actions.map((a) => [a.id, a]));
  for (const [, ids] of Object.entries(art.states)) {
    for (const id of ids) assert.ok(byId.has(id), `state references shipped action "${id}"`);
  }
});

test('the document layer reads and resolves the default skin', () => {
  const doc = documentOf(DEFAULT_SKIN);
  assert.ok(doc, 'the default skin has a document');
  assert.ok(Array.isArray(doc!.actions) && doc!.actions.length > 0, 'the document has actions');
  assert.ok(Array.isArray(doc!.states.idle) && doc!.states.idle.length > 0, 'idle is assigned');
});