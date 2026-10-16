// The pool STRUCTURE: sequences, coverage, and the fact-edge names the engine can
// be handed.  Data-only, so it needs no browser.

import test from 'node:test';
import assert from 'node:assert/strict';

import { BRIDGE_SPECS, CONTINUERS, EVENTS, LINE_SPECS, TOPICS } from '../src/behavior/line-pools.ts';
import { STATE_NAMES } from '../src/behavior/vocabulary.ts';

test('all 24 states have a pool of their own', () => {
  assert.equal(Object.keys(LINE_SPECS).length, 24);
  for (const state of STATE_NAMES) {
    const pool = LINE_SPECS[state];
    assert.ok(pool && pool.length >= 40, `${state} has only ${pool ? pool.length : 0} lines`);
  }
});

test('every sequence is contiguous 1..of with one tone', () => {
  const groups = new Map<string, Array<{ id: string; at: number; of: number; tone: string }>>();
  const scan = (where: string, lines: readonly { id: string; tone: string; group?: number; at?: number; of?: number }[]) => {
    for (const line of lines) {
      if (line.group === undefined) continue;
      assert.notEqual(line.at, undefined, `${line.id} has a group but no \`at\``);
      assert.notEqual(line.of, undefined, `${line.id} has a group but no \`of\``);
      const key = `${where}#${line.group}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({ id: line.id, at: line.at!, of: line.of!, tone: line.tone });
    }
  };
  // 组号是**池内**编号，所以 where 必须带上池名，否则 24 个池的 group 1 会互相覆盖。
  for (const [state, lines] of Object.entries(LINE_SPECS)) scan(`state:${state}`, lines);
  for (const [key, lines] of Object.entries(BRIDGE_SPECS)) scan(`bridge:${key}`, lines);
  assert.ok(groups.size > 300, `expected hundreds of sequences, got ${groups.size}`);
  for (const [key, members] of groups) {
    const of = members[0].of;
    assert.ok(members.length === of, `${key}: ${members.length} members but of=${of}`);
    const ats = members.map((m) => m.at).sort((a, b) => a - b);
    assert.deepEqual(ats, Array.from({ length: of }, (_, i) => i + 1), `${key}: at must be 1..${of}`);
    assert.equal(new Set(members.map((m) => m.tone)).size, 1, `${key}: a sequence must hold one tone`);
    // A sequence's first line must be the only entry point (see pickFrom).
    assert.ok(members.some((m) => m.at === 1), `${key}: no line at 1`);
  }
});

test('the fact edges the seat can emit all have a pool', () => {
  // detectEdges() in view/seat.ts can return these, plus the two UI edges.
  const factEdges = ['greet', 'failed', 'approvalDone', 'answered', 'queue', 'retry', 'cleared', 'firstTool'];
  const uiEdges = ['popupOpen', 'popupClose'];
  for (const name of [...factEdges, ...uiEdges]) {
    assert.ok(EVENTS[name] && EVENTS[name].length > 0, `no event pool for ${name}`);
  }
  assert.equal(Object.keys(EVENTS).length, factEdges.length + uiEdges.length);
});

test('the topic edges match the three the engine can ask for', () => {
  assert.deepEqual(Object.keys(TOPICS).sort(), ['topicMany', 'topicNew', 'topicSame']);
  for (const pool of Object.values(TOPICS)) assert.ok(pool.length > 0);
});

test('continuers exist and are standalone (no sequence members)', () => {
  assert.ok(CONTINUERS.length > 50, `expected a real continuer pool, got ${CONTINUERS.length}`);
  for (const line of CONTINUERS) assert.equal(line.group, undefined, `${line.id} must not be in a sequence`);
});

test('bridges are keyed from>to and never from===to', () => {
  const keys = Object.keys(BRIDGE_SPECS);
  assert.ok(keys.length > 80, `expected many bridges, got ${keys.length}`);
  for (const key of keys) {
    const [from, to] = key.split('>');
    assert.ok(from && to, `${key} is not a from>to key`);
    assert.notEqual(from, to, `${key} bridges a state to itself`);
    assert.ok(STATE_NAMES.includes(from as never), `${key}: ${from} is not a state`);
    assert.ok(STATE_NAMES.includes(to as never), `${key}: ${to} is not a state`);
    assert.ok(BRIDGE_SPECS[key].length > 0, `${key} is empty`);
  }
});

test('every tone used in the pools is a declared tone', () => {
  const TONES = ['calm', 'bright', 'busy', 'formal', 'worry'];
  for (const pool of Object.values(LINE_SPECS)) {
    for (const line of pool) assert.ok(TONES.includes(line.tone), `${line.id}: unknown tone ${line.tone}`);
  }
});
