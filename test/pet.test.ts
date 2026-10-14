// The activity state machine: facts → derived pet state.
// Adapted from the old behavior.test.ts — same truth table, new module paths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveState } from '../src/behavior/facts.ts';
import { STATES, REACTIONS, STATE_NAMES } from '../src/behavior/vocabulary.ts';
import { TUNING } from '../src/behavior/tuning.ts';
import type { PetFacts } from '../src/behavior/facts.ts';

const idle: PetFacts = { enabled: true, pending: null, running: false, errored: false, unread: false, activity: null, idleMs: 0 };

test('reactToStatus:false short-circuits to idle', () => {
  assert.equal(deriveState({ ...idle, enabled: false, running: true }), 'idle');
});

test('pet state: idle', () => { assert.equal(deriveState(idle), 'idle'); });
test('pet state: sleep', () => { assert.equal(deriveState({ ...idle, idleMs: TUNING.sleepAfterMs }), 'sleep'); });
test('pet state: think (including echo)', () => {
  assert.equal(deriveState({ ...idle, running: true }), 'think');
});
test('pet state: stream', () => {
  assert.equal(deriveState({ ...idle, running: true, activity: 'stream' }), 'stream');
});
test('pet state: tool', () => {
  assert.equal(deriveState({ ...idle, running: true, activity: 'tool' }), 'tool');
});
test('pet state: approval', () => {
  assert.equal(deriveState({ ...idle, pending: 'approval' }), 'approval');
});
test('pet state: question', () => {
  assert.equal(deriveState({ ...idle, pending: 'question' }), 'question');
});
test('pet state: error', () => {
  assert.equal(deriveState({ ...idle, errored: true }), 'error');
});
test('pet state: done', () => {
  assert.equal(deriveState({ ...idle, unread: true }), 'done');
});

test('priority: pending beats running', () => {
  assert.equal(deriveState({ ...idle, pending: 'approval', running: true, activity: 'tool' }), 'approval');
  assert.equal(deriveState({ ...idle, pending: 'question', running: true, activity: 'tool' }), 'question');
});

test('priority: tool beats stream beats think', () => {
  assert.equal(deriveState({ ...idle, running: true, activity: 'tool' }), 'tool');
  assert.equal(deriveState({ ...idle, running: true, activity: 'stream' }), 'stream');
  assert.equal(deriveState({ ...idle, running: true }), 'think');
});

test('priority: running beats error and unread', () => {
  assert.equal(deriveState({ ...idle, running: true, errored: true }), 'think');
});

test('priority: unread over sleep', () => {
  assert.equal(deriveState({ ...idle, unread: true, idleMs: TUNING.sleepAfterMs }), 'done');
});

// Reactions exist for artwork purposes.
test('reactions exist and every state name is known', () => {
  assert.deepEqual(Object.keys(REACTIONS), ['petted', 'woken']);
  assert.ok(STATE_NAMES.length >= 11);
  for (const name of STATE_NAMES) {
    assert.ok(name in STATES || name in REACTIONS, `"${name}" is in one of the registries`);
  }
});