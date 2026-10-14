// Performance contracts: identity-keyed caches, reference sharing, split-second
// writes — asserted without a stopwatch (wall-clock is the bench's job).
import { test } from 'node:test';
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

const session = await import('../src/skin/session.ts');
const documents = await import('../src/skin/documents.ts');
const library = await import('../src/skin/library.ts');
const { CATALOG } = await import('../src/skin/catalog.ts');
const { DEFAULT_SKIN } = await import('../src/skin/registry.ts');
const { AVATAR_FACE } = await import('../src/skin/geometry.ts');

session.installCatalog(CATALOG);
const SKIN = DEFAULT_SKIN;

test('resolution is memoized by artwork identity', () => {
  const first = session.activeSkin();
  const second = session.activeSkin();
  // The same artwork object → the SAME ResolvedSkin (WeakMap memo).
  assert.equal(first, second);
});

test('animations share frames by reference — a write does not copy pixels', () => {
  const before = session.activeSkin();
  const art = documents.documentOf(SKIN)!;
  const firstId = art.actions[0].id;
  // Tick a state assignment.
  session.saveAssignments(SKIN, { ...art.states, idle: [firstId] });
  const after = session.activeSkin();
  // The first animation of idle in both snapshots — should share the sprites.
  assert.equal(
    before.states.idle.animations[0].frames[0].sprite,
    after.states.idle.animations[0].frames[0].sprite,
    'a state tick does not re-parse untouched frames',
  );
});

import { faceFor } from '../src/skin/face.ts';

test('the 4× body face is memoized per (frame, face) — re-resolving re-uses it', () => {
  const art = documents.documentOf(SKIN)!;
  const frame = art.actions[0].frames[0];
  const a = faceFor(frame, 'body');
  const b = faceFor(frame, 'body');
  assert.equal(a, b);
});

import { readStored } from '../src/skin/storage.ts';

test('the written payload contains no artwork — only ids', () => {
  const stored = readStored();
  const text = JSON.stringify(stored);
  assert.ok(text.length < 2000, `stored payload is tiny — ${text.length} bytes`);
  assert.ok(!text.includes('rows'), 'no pixel rows in storage');
  assert.ok(!text.includes('palette'), 'no palette in storage');
  assert.ok(!text.includes('frameMs'), 'no frame data in storage');
});