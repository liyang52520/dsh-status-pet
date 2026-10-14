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

test('every default state plays 1–4 actions and the library is much larger', () => {
  const art = CATALOG[DEFAULT_SKIN];
  for (const [state, ids] of Object.entries(art.states)) {
    assert.ok(ids.length >= 1 && ids.length <= 4, `${state} plays 1–4 default actions`);
  }
  assert.ok(art.actions.length > 4 * Object.keys(art.states).length, 'library is far larger than default assignments');
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