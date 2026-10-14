// Skin layer: session, library, storage, resolution — the wardrobe.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const storeMem = new Map<string, string>();
let writes = 0;
(globalThis as any).window = {
  localStorage: {
    getItem: (k: string) => (storeMem.has(k) ? storeMem.get(k)! : null),
    setItem: (k: string, v: string) => { writes++; storeMem.set(k, String(v)); },
    removeItem: (k: string) => void storeMem.delete(k),
  },
  CustomEvent: function (this: { type: string }, type: string) { this.type = type; },
  dispatchEvent: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
};

const store = await import('../src/skin/storage.ts');
const session = await import('../src/skin/session.ts');
const library = await import('../src/skin/library.ts');
const overrides = await import('../src/skin/overrides.ts');
const face = await import('../src/skin/face.ts');
const documents = await import('../src/skin/documents.ts');
const { DEFAULT_SKIN } = await import('../src/skin/registry.ts');
const { MAX_SELECTION } = await import('../src/skin/model.ts');
const { FACES, AVATAR_FACE, BODY_FACE } = await import('../src/skin/geometry.ts');

session.installCatalog({ [DEFAULT_SKIN]: (await import('../src/skin/catalog.ts')).CATALOG[DEFAULT_SKIN] });

function reset() { storeMem.clear(); writes = 0; }

beforeEach(reset);

// ── storage ──

test('schema 1: reads and writes roundtrip', () => {
  assert.deepEqual(store.readStored(), {});
  store.writeStored({ skin: DEFAULT_SKIN });
  assert.equal(store.readStored().skin, DEFAULT_SKIN);
  assert.equal(store.readStored().v, store.SCHEMA);
});

test('foreign payloads are ignored', () => {
  storeMem.set(store.KEY, JSON.stringify({ v: 10, skin: 'old-thing', builtinStates: {} }));
  assert.deepEqual(store.readStored(), {});
});

test('write refusal drops the in-memory copy', () => {
  // Simulate write failure by corrupting the setItem.
  const prev = window.localStorage.setItem;
  (window.localStorage as any).setItem = () => { throw new Error('quota'); };
  store.writeStored({ skin: DEFAULT_SKIN });
  (window.localStorage as any).setItem = prev;
  // Next read re-parses what is actually there.
  assert.deepEqual(store.readStored(), {});
});

// ── session ──

test('activeSkin resolves the dock face', () => {
  const skin = session.activeSkin();
  assert.equal(skin.name, DEFAULT_SKIN);
  assert.equal(skin.face, AVATAR_FACE);
  assert.ok(skin.states.idle.animations.length > 1, 'idle has animations');
});

test('bestSkin resolves the body face', () => {
  const skin = session.bestSkin();
  assert.equal(skin.name, DEFAULT_SKIN);
  assert.equal(skin.face, BODY_FACE);
});

test('skinFor returns a named skin or null', () => {
  assert.ok(session.skinFor(DEFAULT_SKIN), 'a built-in resolves');
  assert.equal(session.skinFor('nope'), null, 'unknown returns null');
});

test('actionSkinFor resolves one action as a skin', () => {
  const doc = documents.documentOf(DEFAULT_SKIN)!;
  const id = doc.actions[0].id;
  const preview = session.actionSkinFor(DEFAULT_SKIN, AVATAR_FACE, id);
  assert.ok(preview);
  assert.equal(preview!.states.idle.animations.length, 1, 'a one-action skin');
});

// ── library ──

test('usedBy returns the states that play an action', () => {
  const art = documents.documentOf(DEFAULT_SKIN)!;
  const index = library.usedBy(art, art.actions[0].id);
  assert.ok(index.length > 0, 'the first action is played by at least idle');
});

test('an assignment saves and persists', () => {
  const art = documents.documentOf(DEFAULT_SKIN)!;
  const second = art.actions[1].id;
  session.saveAssignments(DEFAULT_SKIN, { ...art.states, idle: [second] });
  assert.deepEqual((store.readStored().assignments || {})[DEFAULT_SKIN], { idle: [second] }, 'the diff is stored');
  // A no-op is not written.
  const w0 = writes;
  session.saveAssignments(DEFAULT_SKIN, { ...art.states, idle: [second] });
  assert.equal(writes, w0, 'a no-op does not write');
});

test('an assignment that would empty idle is refused', () => {
  const art = documents.documentOf(DEFAULT_SKIN)!;
  session.saveAssignments(DEFAULT_SKIN, { idle: [] });
  const doc = documents.documentOf(DEFAULT_SKIN)!;
  assert.deepEqual(doc.states.idle, art.states.idle, 'the authored idle stands');
});

test('overrides sanitize unknown states and ids', () => {
  const art = documents.documentOf(DEFAULT_SKIN)!;
  const applied = overrides.applyDiff(art, { ghost: ['x'], tool: ['yes', 'no', 'no'] })!;
  assert.equal(applied.states.idle, art.states.idle);
});

test('states with the same selection share identity', () => {
  const art = documents.documentOf(DEFAULT_SKIN)!;
  const first = art.actions[0].id;
  session.saveAssignments(DEFAULT_SKIN, { ...art.states, idle: [first], done: [first] });
  const skin = session.activeSkin();
  assert.equal(skin.states.done, skin.states.idle, 'states with the same selection share one object');
});

test('the body face has larger geometry', () => {
  assert.equal(FACES.body.size, FACES.avatar.size * 4);
  assert.equal(FACES.body.maxOffset, FACES.avatar.maxOffset * 4);
});