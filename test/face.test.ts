// Face selection: authored face, 4× fallback, memo identity, and offsetScale.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faceFor, upscaleDrawing, hasBody, hasActionBody, offsetScale, usableFace } from '../src/skin/face.ts';
import { FACES, AVATAR_FACE, BODY_FACE } from '../src/skin/geometry.ts';
import type { Action } from '../src/skin/model.ts';

function mockAction(bodyFrames: number, totalFrames = 4): Action {
  const frames: any[] = [];
  for (let i = 0; i < totalFrames; i++) {
    frames.push({
      art: {
        avatar: { rows: Array.from({ length: FACES.avatar.size }, () => '0a'.repeat(FACES.avatar.size)) },
        ...(i < bodyFrames ? { body: { rows: Array.from({ length: FACES.body.size }, () => 'ff'.repeat(FACES.body.size)) } } : {}),
      },
    });
  }
  return { id: 'test', name: 'Test', frameMs: 200, frames };
}

test('faceFor returns the authored face at the exact size', () => {
  const frame = mockAction(4, 4).frames[0];
  const avatar = faceFor(frame, AVATAR_FACE);
  assert.equal(avatar.rows.length, FACES.avatar.size);
  const body = faceFor(frame, BODY_FACE);
  assert.equal(body.rows.length, FACES.body.size);
});

test('faceFor derives body from avatar when no body art exists', () => {
  const frame = mockAction(0, 4).frames[3];
  const body = faceFor(frame, BODY_FACE);
  assert.equal(body.rows.length, FACES.body.size);
  assert.ok(body.rows[0].startsWith('0a0a'));
});

test('faceFor memoizes the derived body per (frame, face)', () => {
  const frame = mockAction(0, 4).frames[0];
  const a = faceFor(frame, BODY_FACE);
  const b = faceFor(frame, BODY_FACE);
  assert.equal(a, b, 'same frame → same derived face');
});

test('hasActionBody and hasBody', () => {
  assert.equal(hasActionBody(mockAction(4, 4)), true);
  assert.equal(hasActionBody(mockAction(0, 4)), false);
  assert.equal(hasBody({ palette: [], actions: [mockAction(0, 4)], states: { idle: ['test'] } }), false);
  assert.equal(hasBody({ palette: [], actions: [mockAction(0, 4), mockAction(1, 4)], states: { idle: ['test'] } }), true);
});

test('offsetScale is 1 for avatar, 4 for body', () => {
  assert.equal(offsetScale(AVATAR_FACE), 1);
  assert.equal(offsetScale(BODY_FACE), 4);
});

test('usableFace returns avatar when artwork has no body', () => {
  const art = { palette: [], actions: [mockAction(0, 4)], states: { idle: ['test'] } };
  assert.equal(usableFace(art, BODY_FACE), AVATAR_FACE);
  assert.equal(usableFace(art, AVATAR_FACE), AVATAR_FACE);
});

test('upscaleDrawing quadruples each pixel and row', () => {
  const drawing = { rows: ['0aff', '..00'] };
  const up = upscaleDrawing(drawing);
  assert.equal(up.rows.length, 8); // 2×4
  assert.equal(up.rows[0], '0a0a0a0affffffff');
});