// The state machine's truth table: which facts produce which state, in what order,
// and the shape guards that keep a host contract change from throwing.
//
// This is the gate AGENTS.md flags as the most likely to bite: "a wrong branch in
// deriveState now ships silently".

import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveState, emptyFacts } from '../src/behavior/facts.ts';
import type { PetFacts } from '../src/behavior/facts.ts';
import { PET_STATES, STATE_NAMES, STATES, REACTIONS } from '../src/behavior/vocabulary.ts';
import { TUNING } from '../src/behavior/tuning.ts';
import { categoryOf, isKnownTool, TOOL_CATEGORIES } from '../src/behavior/tool-catalog.ts';
import { detectEdges, toPendingFact, toRunningTools, toStreamKind } from '../src/view/seat.ts';

const base = (over: Partial<PetFacts> = {}): PetFacts => ({ ...emptyFacts(1000), ...over });

test('every pet state is reachable from a real fact combination', () => {
  const cases: PetFacts[] = [
    base(),
    base({ idleMs: TUNING.sleepAfterMs }),
    base({ running: true }),
    base({ running: true, stream: 'reasoning' }),
    base({ running: true, stream: 'text' }),
    base({ running: true, stream: 'tool-call' }),
    base({ running: true, tools: [{ name: 'bash' }] }),
    base({ running: true, tools: [{ name: 'read' }] }),
    base({ running: true, tools: [{ name: 'grep' }] }),
    base({ running: true, tools: [{ name: 'edit' }] }),
    base({ running: true, tools: [{ name: 'web_search' }] }),
    base({ running: true, tools: [{ name: 'spawn_teammate' }] }),
    base({ running: true, tools: [{ name: 'todo_write' }] }),
    base({ running: true, tools: [{ name: 'present' }] }),
    base({ running: true, tools: [{ name: 'mystery_tool' }] }),
    base({ running: true, tools: [{ name: 'bash', phase: 'preparing' }] }),
    base({ running: true, tools: [{ name: 'bash', time: 0 }], now: TUNING.slowToolMs + 1 }),
    base({ running: true, tools: [{ name: 'bash' }, { name: 'read' }] }),
    base({ pending: { kind: 'approval' } }),
    base({ pending: { kind: 'question' } }),
    base({ pending: { kind: 'planReview' } }),
    base({ errored: true }),
    base({ unread: true }),
  ];
  const reached = new Set(cases.map(deriveState));
  const unreachable = PET_STATES.filter((s) => !reached.has(s));
  assert.deepEqual(unreachable, [], 'a state nothing can reach is decoration, not behaviour');
  assert.equal(PET_STATES.length, 22);
  assert.equal(STATE_NAMES.length, 24, '22 pet states + 2 reactions');
  assert.deepEqual(Object.keys(REACTIONS).length, 2);
  // Every pet state carries a seat accent entry (possibly empty).
  for (const state of PET_STATES) assert.ok(state in STATES, `${state} has no STATES entry`);
});

test('priority: what you owe beats what the agent is doing, which beats the outcome', () => {
  const busy = base({ running: true, tools: [{ name: 'bash', time: 0 }], now: TUNING.slowToolMs + 1 });
  assert.equal(deriveState({ ...busy, pending: { kind: 'approval' } }), 'approval');
  assert.equal(deriveState({ ...busy, pending: { kind: 'planReview' } }), 'planReview');
  assert.equal(deriveState({ ...busy, pending: { kind: 'question' } }), 'question');
  assert.equal(deriveState(busy), 'slow');
  // An error while still running is NOT the outcome yet — the work is.
  assert.equal(deriveState({ ...busy, errored: true }), 'slow');
  assert.equal(deriveState(base({ errored: true, unread: true })), 'error');
  assert.equal(deriveState(base({ unread: true })), 'done');
  assert.equal(deriveState(base({ unread: true, idleMs: TUNING.sleepAfterMs })), 'done');
  assert.equal(deriveState(base({ idleMs: TUNING.sleepAfterMs - 1 })), 'idle');
  assert.equal(deriveState(base({ idleMs: TUNING.sleepAfterMs })), 'sleep');
});

test('the tool category becomes the state, and `enabled: false` wins outright', () => {
  assert.equal(deriveState(base({ running: true, tools: [{ name: 'BASH' }] })), 'shell', 'names are case-folded');
  assert.equal(deriveState(base({ enabled: false, running: true, pending: { kind: 'approval' } })), 'idle');
  // Two calls at once is "she is swamped", not "she is reading the second file".
  assert.equal(deriveState(base({ running: true, tools: [{ name: 'read' }, { name: 'read' }] })), 'multi');
  // Preparing wins over the category: the call is not dispatched yet.
  assert.equal(deriveState(base({ running: true, tools: [{ name: 'read', phase: 'preparing' }] })), 'preparing');
  // No tool yet → the stream block decides.
  assert.equal(deriveState(base({ running: true, stream: 'reasoning' })), 'reasoning');
  assert.equal(deriveState(base({ running: true, stream: 'tool-call' })), 'preparing');
  assert.equal(deriveState(base({ running: true, stream: 'other' })), 'think');
});

test('an unknown tool is still work, never a crash', () => {
  assert.equal(categoryOf(''), 'tool');
  assert.equal(categoryOf(null), 'tool');
  assert.equal(categoryOf('  '), 'tool');
  assert.equal(categoryOf('brand_new_tool'), 'tool');
  assert.equal(categoryOf(undefined), 'tool');
  for (const category of TOOL_CATEGORIES) {
    assert.equal(typeof category, 'string');
  }
  assert.equal(isKnownTool('bash'), true);
  assert.equal(isKnownTool('nope'), false);
});

// ── the shape guards around DSH's undocumented objects ──

test('toPendingFact normalizes the three real kinds and rejects junk', () => {
  assert.deepEqual(toPendingFact({ kind: 'approval', toolName: 'bash', displayReason: 'runs rm' }), {
    kind: 'approval', toolName: 'bash', reason: 'runs rm',
  });
  assert.deepEqual(toPendingFact({ kind: 'approval', reason: 'fallback' }), { kind: 'approval', toolName: undefined, reason: 'fallback' });
  assert.deepEqual(toPendingFact({ kind: 'question', questions: [1, 2, 3] }), { kind: 'question', questions: 3 });
  assert.deepEqual(toPendingFact({ kind: 'plan-review', questions: [] }), { kind: 'planReview', questions: 0 });
  assert.equal(toPendingFact(null), null);
  assert.equal(toPendingFact({ kind: 'something-new' }), null);
  assert.equal(toPendingFact('nope'), null);
});

test('toRunningTools skips malformed entries instead of throwing', () => {
  const tools = toRunningTools([
    { name: 'read', rawArguments: '{"a":1}', turn: 1, step: 2, time: 3, subCalls: [1, 2] },
    { name: 'grep', phase: 'start' },
    null, 42, { noname: true }, { name: '' },
  ]);
  assert.equal(tools.length, 2);
  assert.deepEqual(tools[0], { name: 'read', phase: undefined, argsRaw: '{"a":1}', turn: 1, step: 2, time: 3, subCalls: 2 });
  assert.equal(tools[1].name, 'grep');
  assert.deepEqual(toRunningTools('nope'), []);
  assert.deepEqual(toRunningTools(undefined), []);
});

test('toStreamKind reads the last block only', () => {
  assert.equal(toStreamKind({ blocks: [{ kind: 'text' }, { kind: 'reasoning' }] }), 'reasoning');
  assert.equal(toStreamKind({ blocks: [{ kind: 'tool-call' }] }), 'tool-call');
  assert.equal(toStreamKind({ blocks: [{ kind: 'text' }] }), 'text');
  assert.equal(toStreamKind({ blocks: [{ kind: 'unknown' }] }), 'other');
  assert.equal(toStreamKind({ blocks: [] }), null);
  assert.equal(toStreamKind({}), null);
  assert.equal(toStreamKind(null), null);
});

test('fact edges are ordered by importance and never invent a change', () => {
  const same = { running: true, errored: false, pending: null, queued: 0, tools: 1 };
  assert.deepEqual(detectEdges(null, same), ['greet'], 'the first observation greets');
  assert.deepEqual(detectEdges(same, same), [], 'nothing moved, nothing to say');
  assert.deepEqual(detectEdges(same, { ...same, errored: true }), ['failed']);
  assert.deepEqual(detectEdges(same, { ...same, pending: 'approval' }), []);
  assert.deepEqual(detectEdges({ ...same, pending: 'approval' }, same), ['approvalDone']);
  assert.deepEqual(detectEdges({ ...same, pending: 'question' }, { ...same, queued: 3 }), ['answered', 'queue']);
  assert.deepEqual(detectEdges({ ...same, errored: true }, { ...same, errored: false, running: false }), ['cleared']);
  assert.deepEqual(detectEdges({ ...same, errored: true }, { ...same, errored: false }), ['retry']);
  // Starting to work for the first time is worth saying; starting again with a tool
  // already on the books is not.
  const idleEdge = { running: false, errored: false, pending: null, queued: 0, tools: 0 };
  assert.deepEqual(detectEdges(idleEdge, { running: true, errored: false, pending: null, queued: 0, tools: 0 }), []);
  assert.deepEqual(detectEdges(idleEdge, same), ['firstTool']);
});
