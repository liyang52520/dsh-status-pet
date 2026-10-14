// The state machine: facts → derived pet state.
//
// V2 的真值表：22 个状态，每一个都有一条**真实信号**能命中它；再加优先级规则
// （你欠她回答 > 在跑 > 出错/未读 > 睡）。 表驱动，所以"加了一个永远到不了的状态"
// 会在第一段就露出来。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveState, emptyFacts } from '../src/behavior/facts.ts';
import type { PetFacts, RunningToolFact } from '../src/behavior/facts.ts';
import { PET_STATES, REACTIONS, STATES, STATE_NAMES } from '../src/behavior/vocabulary.ts';
import { TUNING } from '../src/behavior/tuning.ts';
import { toPendingFact, toRunningTools, toStreamKind } from '../src/view/seat.ts';

const NOW = 1_000_000;
const idle: PetFacts = emptyFacts(NOW);

/** 一个正在跑的工具调用。 */
const tool = (name: string, extra: Partial<RunningToolFact> = {}): RunningToolFact => ({ name, phase: 'start', ...extra });

test('reactToStatus:false short-circuits to idle', () => {
  assert.equal(deriveState({ ...idle, enabled: false, running: true, tools: [tool('bash')] }), 'idle');
});

// ── 待命 ──

test('idle and the sleep boundary', () => {
  assert.equal(deriveState(idle), 'idle');
  assert.equal(deriveState({ ...idle, idleMs: TUNING.sleepAfterMs - 1 }), 'idle');
  assert.equal(deriveState({ ...idle, idleMs: TUNING.sleepAfterMs }), 'sleep');
});

// ── 想 ──

test('think: running, nothing emitted yet', () => {
  assert.equal(deriveState({ ...idle, running: true }), 'think');
});

test('stream / reasoning / preparing come from the LAST assistant block', () => {
  assert.equal(deriveState({ ...idle, running: true, stream: 'text' }), 'stream');
  assert.equal(deriveState({ ...idle, running: true, stream: 'reasoning' }), 'reasoning');
  assert.equal(deriveState({ ...idle, running: true, stream: 'tool-call' }), 'preparing');
  assert.equal(deriveState({ ...idle, running: true, stream: 'other' }), 'think');
});

test('preparing also comes from a call whose arguments are still streaming', () => {
  assert.equal(deriveState({ ...idle, running: true, tools: [tool('bash', { phase: 'preparing' })] }), 'preparing');
});

// ── 做：类别 ──

test('every tool category has its own state', () => {
  const cases: Array<[string, string]> = [
    ['bash', 'shell'], ['terminal_open', 'shell'], ['job_output', 'shell'],
    ['read', 'read'], ['read_image', 'read'], ['lsp', 'read'], ['session_search', 'read'],
    ['grep', 'search'], ['glob', 'search'],
    ['edit', 'write'], ['write', 'write'],
    ['web_fetch', 'web'], ['web_search', 'web'],
    ['subagent', 'agent'], ['spawn_teammate', 'agent'], ['send_message', 'agent'], ['team_task_list', 'agent'],
    ['todo_write', 'plan'], ['create_goal', 'plan'], ['schedule_create', 'plan'],
    ['present', 'deliver'],
  ];
  for (const [name, want] of cases) {
    assert.equal(deriveState({ ...idle, running: true, tools: [tool(name)] }), want, name);
  }
});

test('an unknown tool falls back to the generic working state', () => {
  assert.equal(deriveState({ ...idle, running: true, tools: [tool('a_tool_from_the_future')] }), 'tool');
  assert.equal(deriveState({ ...idle, running: true, tools: [tool('workflow')] }), 'tool');
  // 名字都没有的工具调用会被 seat 丢掉（见 toRunningTools），到不了这里；万一到了，
  // 也只是"有个名字空空的工具在跑"，仍然是兜底类别。
  assert.equal(deriveState({ ...idle, running: true, tools: [tool('')] }), 'tool');
});

// ── 做：处境 ──

test('multi: two or more tools at once wins over any single category', () => {
  const two = { ...idle, running: true, tools: [tool('read'), tool('bash')] };
  assert.equal(deriveState(two), 'multi');
  // 明显压过类别，也压过 slow —— 同时几件事时"忙不过来"才是当下的事实
  assert.equal(deriveState({ ...two, tools: [tool('read', { time: NOW - 10 * TUNING.slowToolMs }), tool('bash')] }), 'multi');
});

test('slow: one tool past the threshold stops narrating the work', () => {
  assert.equal(deriveState({ ...idle, running: true, tools: [tool('bash', { time: NOW - TUNING.slowToolMs + 1 })] }), 'shell');
  assert.equal(deriveState({ ...idle, running: true, tools: [tool('bash', { time: NOW - TUNING.slowToolMs })] }), 'slow');
  assert.equal(deriveState({ ...idle, running: true, tools: [tool('read', { time: NOW - 90_000 })] }), 'slow');
});

test('without a start time there is no slow — a missing field degrades, never guesses', () => {
  assert.equal(deriveState({ ...idle, running: true, tools: [tool('bash')] }), 'shell');
});

// ── 等你 ──

test('the three waiting states, and they beat everything else', () => {
  assert.equal(deriveState({ ...idle, pending: { kind: 'approval' } }), 'approval');
  assert.equal(deriveState({ ...idle, pending: { kind: 'question' } }), 'question');
  assert.equal(deriveState({ ...idle, pending: { kind: 'planReview' } }), 'planReview');
  const busy = { ...idle, running: true, tools: [tool('bash'), tool('read')], errored: true, unread: true };
  assert.equal(deriveState({ ...busy, pending: { kind: 'approval' } }), 'approval');
  assert.equal(deriveState({ ...busy, pending: { kind: 'question' } }), 'question');
  assert.equal(deriveState({ ...busy, pending: { kind: 'planReview' } }), 'planReview');
});

// ── 结果与优先级 ──

test('error / done, and their order', () => {
  assert.equal(deriveState({ ...idle, errored: true }), 'error');
  assert.equal(deriveState({ ...idle, unread: true }), 'done');
  assert.equal(deriveState({ ...idle, errored: true, unread: true }), 'error', '失败先于未读');
  assert.equal(deriveState({ ...idle, unread: true, idleMs: TUNING.sleepAfterMs }), 'done', '未读先于睡');
});

test('running beats error and unread', () => {
  assert.equal(deriveState({ ...idle, running: true, errored: true, unread: true }), 'think');
  assert.equal(deriveState({ ...idle, running: true, tools: [tool('bash')], errored: true }), 'shell');
});

// ── 词表 ──

test('the vocabulary is complete and every name is reachable', () => {
  assert.equal(PET_STATES.length, 22);
  assert.equal(STATE_NAMES.length, 24);
  assert.deepEqual(Object.keys(REACTIONS), ['petted', 'woken']);
  for (const name of STATE_NAMES) {
    assert.ok(name in STATES || name in REACTIONS, `"${name}" is in one of the registries`);
  }
  // 每个状态都必须能被某组事实命中 —— 否则它只是装饰。
  const reached = new Set<string>();
  reached.add(deriveState(idle));
  reached.add(deriveState({ ...idle, idleMs: TUNING.sleepAfterMs }));
  for (const kind of ['approval', 'question', 'planReview'] as const) reached.add(deriveState({ ...idle, pending: { kind } }));
  for (const stream of ['text', 'reasoning', 'tool-call'] as const) reached.add(deriveState({ ...idle, running: true, stream }));
  reached.add(deriveState({ ...idle, running: true }));
  // 每个类别都要真跑一遍，否则"可达性"这个断言只是在自我安慰
  for (const name of ['bash', 'read', 'grep', 'edit', 'web_fetch', 'spawn_teammate', 'todo_write', 'present', 'workflow']) {
    reached.add(deriveState({ ...idle, running: true, tools: [tool(name)] }));
  }
  reached.add(deriveState({ ...idle, running: true, tools: [tool('bash', { time: NOW - 60_000 })] }));
  reached.add(deriveState({ ...idle, running: true, tools: [tool('read'), tool('bash')] }));
  reached.add(deriveState({ ...idle, errored: true }));
  reached.add(deriveState({ ...idle, unread: true }));
  for (const state of PET_STATES) assert.ok(reached.has(state), `状态 ${state} 没有信号能到`);
});

// ── 形状守卫：DSH 的对象没有客户端类型，读之前必须先问 ──

test('toPendingFact normalizes the three real interaction kinds', () => {
  assert.deepEqual(toPendingFact({ kind: 'approval', toolName: 'bash', reason: 'it deletes things' }),
    { kind: 'approval', toolName: 'bash', reason: 'it deletes things' });
  assert.deepEqual(toPendingFact({ kind: 'approval', displayReason: 'localized', reason: 'raw' }),
    { kind: 'approval', toolName: undefined, reason: 'localized' }, 'displayReason 优先');
  assert.deepEqual(toPendingFact({ kind: 'question', questions: [{}, {}] }), { kind: 'question', questions: 2 });
  assert.deepEqual(toPendingFact({ kind: 'plan-review', questions: [{}] }), { kind: 'planReview', questions: 1 });
  assert.equal(toPendingFact({ kind: 'something-new' }), null);
  for (const junk of [null, undefined, 'approval', 42, {}]) assert.equal(toPendingFact(junk), null);
});

test('toRunningTools reads the real call shape and skips junk', () => {
  const raw = [
    { phase: 'start', name: 'bash', argsRaw: '{"command":"ls"}', turn: 2, step: 3, time: 123, subCalls: [1] },
    { phase: 'preparing', name: 'read' },
    null, 'x', { phase: 'start' },
  ];
  const tools = toRunningTools(raw);
  assert.equal(tools.length, 2);
  assert.deepEqual(tools[0], { name: 'bash', phase: 'start', argsRaw: '{"command":"ls"}', turn: 2, step: 3, time: 123, subCalls: 1 });
  assert.equal(tools[1].name, 'read');
  assert.equal(tools[1].time, undefined);
  for (const junk of [null, undefined, 'x', 42, {}]) assert.deepEqual(toRunningTools(junk), []);
});

test('toStreamKind reads the last block, and nothing else', () => {
  assert.equal(toStreamKind({ blocks: [{ kind: 'reasoning' }] }), 'reasoning');
  assert.equal(toStreamKind({ blocks: [{ kind: 'reasoning' }, { kind: 'text' }] }), 'text');
  assert.equal(toStreamKind({ blocks: [{ kind: 'tool-call' }] }), 'tool-call');
  assert.equal(toStreamKind({ blocks: [{ kind: 'image' }] }), 'other');
  assert.equal(toStreamKind({ blocks: [] }), null);
  for (const junk of [null, undefined, 'x', {}, { blocks: 'no' }]) assert.equal(toStreamKind(junk), null);
});
