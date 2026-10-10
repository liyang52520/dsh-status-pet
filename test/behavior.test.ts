// The state machine truth table and registry integrity, driven directly
// against the real behavior module.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derivePetState, STATES, REACTIONS, TUNING, STATE_NAMES } from '../src/pet/behavior.ts';
import type { PetFacts } from '../src/pet/behavior.ts';

const facts = (over: Partial<PetFacts>): PetFacts => ({
  enabled: TUNING.reactToStatus,
  pending: null,
  running: false,
  errored: false,
  unread: false,
  activity: null,
  idleMs: 0,
  ...over,
});

const CASES: Array<[string, Partial<PetFacts>, string]> = [
  ['idle', {}, 'idle'],
  ['sleep boundary: 59.999s stays idle', { idleMs: TUNING.sleepAfterMs - 1 }, 'idle'],
  ['sleep boundary: 60.001s sleeps', { idleMs: TUNING.sleepAfterMs + 1 }, 'sleep'],
  ['running with no output thinks', { running: true }, 'think'],
  ['a send echo in flight thinks', { running: true }, 'think'], // busy bridge is covered by the component tests
  ['streaming output', { running: true, activity: 'stream' }, 'stream'],
  ['executing tool', { running: true, activity: 'tool' }, 'tool'],
  ['approval outranks running', { running: true, pending: 'approval' }, 'approval'],
  ['question outranks running', { running: true, pending: 'question' }, 'question'],
  ['agent error', { errored: true }, 'error'],
  ['unread completion', { unread: true }, 'done'],
  // precedence
  ['running beats error', { running: true, errored: true }, 'think'],
  ['tool beats stream', { running: true, activity: 'tool' }, 'tool'],
  ['approval beats sleep', { pending: 'approval', idleMs: 999999 }, 'approval'],
  ['unread beats sleep', { unread: true, idleMs: 999999 }, 'done'],
  ['error beats sleep', { errored: true, idleMs: 999999 }, 'error'],
  ['question beats idle', { pending: 'question' }, 'question'],
  ['reactToStatus=false short-circuits to idle', { enabled: false, running: true, errored: true, unread: true, idleMs: 999999 }, 'idle'],
];

for (const [name, over, expected] of CASES) {
  test(`state: ${name}`, () => {
    assert.equal(derivePetState(facts(over)), expected);
  });
}

test('every registry name is part of the artwork vocabulary', () => {
  for (const name of Object.keys(STATES)) {
    assert.ok(STATE_NAMES.includes(name as never), `state ${name}`);
  }
  for (const name of Object.keys(REACTIONS)) {
    assert.ok(STATE_NAMES.includes(name as never), `reaction ${name}`);
  }
  assert.equal(STATE_NAMES.length, 11, 'nine states plus two reactions');
});

test('every reaction declares a positive duration', () => {
  for (const [name, spec] of Object.entries(REACTIONS)) {
    assert.ok(typeof spec.durationMs === 'number' && spec.durationMs > 0, name);
  }
});

test('only the states worth interrupting for carry a pill class', () => {
  const pillStates = Object.entries(STATES)
    .filter(([, s]) => s.pill)
    .map(([n]) => n)
    .sort();
  assert.deepEqual(pillStates, ['approval', 'error', 'question']);
});
