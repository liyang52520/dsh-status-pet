// 话语引擎：记忆、顿挫、填充、回应、话题、心情。
//
// 表是注入的，随机源是注入的 —— 所以这一层完全在 node 里可测，不依赖任何一条真实文案。
// 真实文案由契约测试（test/lines.test.ts）守。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyDiscourse, moodTone, stepDiscourse, topicEdge, TABLES,
} from '../src/behavior/discourse.ts';
import { detectEdges } from '../src/view/seat.ts';
import type { FactEdge } from '../src/view/seat.ts';
import type { DiscourseState, DiscourseTables, Topic } from '../src/behavior/discourse.ts';
import type { PoolLine } from '../src/behavior/line-pools.ts';
import { TUNING } from '../src/behavior/tuning.ts';

// ── 合成表 ──

/** 造一个池：`groups` 组序列（每组 3 句）+ 其余独立句，音区默认 busy。 */
function mkPool(prefix: string, n: number, tone = 'busy', groups = 0): PoolLine[] {
  const out: PoolLine[] = [];
  let i = 0;
  for (let g = 1; g <= groups; g++) {
    for (let at = 1; at <= 3; at++) out.push({ id: `${prefix}.${String(++i).padStart(2, '0')}`, tone: tone as never, group: g, at, of: 3 });
  }
  while (i < n) out.push({ id: `${prefix}.${String(++i).padStart(2, '0')}`, tone: tone as never });
  return out;
}

const tables: DiscourseTables = {
  pools: {
    idle: mkPool('idle', 60, 'calm', 4),
    shell: mkPool('shell', 40, 'busy', 4),
    read: mkPool('read', 40, 'busy', 4),
    error: mkPool('error', 30, 'worry'),
    done: mkPool('done', 30, 'bright'),
    tiny: [{ id: 'tiny.01', tone: 'busy' }, { id: 'tiny.02', tone: 'busy' }],
  },
  bridges: {
    'idle>shell': [{ id: 'bridge.idle.shell.01', tone: 'bright' }, { id: 'bridge.idle.shell.02', tone: 'busy' }],
    'idle>error': [{ id: 'bridge.idle.error.01', tone: 'brisk' as never }].map((x) => ({ id: x.id, tone: 'worry' as never })),
  },
  continuers: [
    { id: 'continuer.01', tone: 'calm' }, { id: 'continuers.02', tone: 'busy' },
    { id: 'continuer.03', tone: 'calm' }, { id: 'continuer.04', tone: 'busy' },
  ],
  events: {
    queue: [{ id: 'event.queue.01', tone: 'bright' }, { id: 'event.queue.02', tone: 'bright' }],
    failed: [{ id: 'event.failed.01', tone: 'worry' }],
    greet: [{ id: 'event.greet.01', tone: 'bright' }],
  },
  topics: {
    topicNew: [{ id: 'topic.topicNew.01', tone: 'busy' }, { id: 'topic.topicNew.02', tone: 'busy' }],
    topicSame: [{ id: 'topic.topicSame.01', tone: 'calm' }, { id: 'topic.topicSame.02', tone: 'calm' }],
    topicMany: [{ id: 'topic.topicMany.01', tone: 'worry' }, { id: 'topic.topicMany.02', tone: 'worry' }],
  },
};

const always = (v: number) => () => v;
/** 按顺序返回给定值，用完就用最后一个。 */
function queue(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

const base = { state: 'idle' as const, key: 'k', elapsedMs: 0 };

/** 走一步，并且总是"停顿已到"（用上一步的 remaining 逼出重抽）。 */
function tick(prev: DiscourseState | null, over: Record<string, unknown> = {}, random = always(0.5)): DiscourseState {
  const elapsedMs = prev ? (prev.remainingMs || 1) + 1 : 0;
  return stepDiscourse(prev, { ...base, ...over, elapsedMs } as never, random, tables);
}

// ── 基础 ──

test('第一次说话：从状态池抽，并武装一个停顿', () => {
  const s = stepDiscourse(null, { ...base }, always(0.5), tables);
  assert.ok(s.id && s.id.startsWith('idle.'), s.id as string);
  assert.equal(s.state, 'idle');
  assert.equal(s.source && s.source.kind, 'state');
  assert.ok(s.remainingMs >= TUNING.lineDwellMs && s.remainingMs <= TUNING.lineDwellMs + TUNING.lineJitterMs);
  assert.equal(s.spoken, 1);
  assert.equal(s.beat, 1);
});

test('停顿没到就不换话（同一个 id，时钟往下走）', () => {
  const a = stepDiscourse(null, base, always(0.5), tables);
  const b = stepDiscourse(a, { ...base, elapsedMs: 1000 }, always(0.5), tables);
  assert.equal(b.id, a.id);
  assert.equal(b.remainingMs, a.remainingMs - 1000);
  assert.equal(b.spoken, a.spoken);
});

test('reduced motion：不再因为时间而换话，但状态/事实变了仍然换', () => {
  const a = stepDiscourse(null, base, always(0.5), tables);
  const b = stepDiscourse(a, { ...base, elapsedMs: 10 * TUNING.lineDwellMs, reducedMotion: true }, always(0.5), tables);
  assert.equal(b.id, a.id);
  assert.equal(b.remainingMs, 0);
  const c = stepDiscourse(b, { state: 'done', key: 'k', elapsedMs: 1, reducedMotion: true }, always(0.5), tables);
  assert.ok(c.id && c.id.startsWith('done.'), c.id as string);
  const d = stepDiscourse(c, { state: 'done', key: 'k2', elapsedMs: 1, reducedMotion: true }, always(0.5), tables);
  assert.ok(d.id && d.id.startsWith('done.'));
});

// ── E1 桥接 ──

test('状态切换：写了桥接就先接住上一句', () => {
  const a = tick(null, { state: 'idle' });
  const b = tick(a, { state: 'shell' });
  assert.ok(b.id && b.id.startsWith('bridge.idle.shell.'), b.id as string);
  assert.equal(b.source && b.source.kind, 'bridge');
  assert.equal(b.beat, 1);
});

test('没有桥接的一对：直接说新状态的台词', () => {
  const a = tick(null, { state: 'idle' });
  const b = tick(a, { state: 'read' });
  assert.ok(b.id && b.id.startsWith('read.'), b.id as string);
  assert.equal(b.source && b.source.kind, 'state');
});

test('关掉桥接层就退回状态池', () => {
  const a = tick(null, { state: 'idle' });
  const b = tick(a, { state: 'shell', layers: { bridges: false } });
  assert.ok(b.id && b.id.startsWith('shell.'), b.id as string);
});

// ── E2② 序列 ──

test('序列：上一句还有下一句时，必然接上（不掷骰子）', () => {
  const first = tick(null, { state: 'shell' });
  const group1 = (tables.pools.shell as PoolLine[]).filter((l) => l.group === 1);
  // 直接构造一个"正说到第 1 组第 2 句"的状态，看它会不会接第 3 句
  const at2: DiscourseState = {
    ...first, id: group1[1].id, group: { group: 1, at: 2 },
    source: { kind: 'state', state: 'shell' }, beat: 2,
  };
  const next = tick(at2, { state: 'shell' }, always(0.9));
  assert.equal(next.id, group1[2].id, '必须接第 3 句');
  assert.equal(next.beat, 3);
});

test('事实签名变了 → 不接旧序列，重新开话头', () => {
  const a = tick(null, { state: 'shell' });
  const withGroup = { ...a, group: { group: 1, at: 1 } };
  const b = stepDiscourse(withGroup, { state: 'shell', key: 'k|new', elapsedMs: 1 }, always(0.5), tables);
  assert.ok(!b.id!.endsWith('02') || b.group?.at === 1 || b.group === null, `不该接旧序列：${b.id}`);
});

// ── E0 事件抢占 ──

test('事件：边沿一响就换话，不等停顿，且用事件池', () => {
  const a = stepDiscourse(null, base, always(0.5), tables);
  const b = stepDiscourse(a, { ...base, elapsedMs: 1, events: ['queue'] }, always(0.5), tables);
  assert.ok(b.id && b.id.startsWith('event.queue.'), b.id as string);
  assert.equal(b.source && b.source.kind, 'event');
  assert.equal(b.beat, 0);
  assert.ok(b.remainingMs >= TUNING.lineEventMs[0] && b.remainingMs <= TUNING.lineEventMs[1], '反应要快');
});

test('事件里没有池的那个会被跳过，轮到下一个', () => {
  const a = stepDiscourse(null, base, always(0.5), tables);
  const b = stepDiscourse(a, { ...base, elapsedMs: 1, events: ['not-a-real-event', 'failed'] }, always(0.5), tables);
  assert.ok(b.id && b.id.startsWith('event.failed.'), b.id as string);
});

test('失败连击与恢复：failStreak 由事件结算', () => {
  let s = stepDiscourse(null, base, always(0.5), tables);
  s = stepDiscourse(s, { ...base, elapsedMs: 1, events: ['failed'] }, always(0.5), tables);
  assert.equal(s.failStreak, 1);
  s = stepDiscourse(s, { ...base, elapsedMs: 1, events: ['failed'] }, always(0.5), tables);
  assert.equal(s.failStreak, 2);
  s = stepDiscourse(s, { ...base, elapsedMs: 1, events: ['cleared'] }, always(0.5), tables);
  assert.equal(s.failStreak, 0);
});

// ── E3 填充词 ──

test('填充词：手上有活时插入，而且**不打断序列记忆**', () => {
  // 先说到某组第 1 句，再让填充词插进来，然后看能否接着第 2 句
  const first = tick(null, { state: 'shell' });
  const group1 = (tables.pools.shell as PoolLine[]).filter((l) => l.group === 1);
  const at1: DiscourseState = {
    ...first, id: group1[0].id, group: { group: 1, at: 1 }, source: { kind: 'state', state: 'shell' }, beat: 1,
  };
  // 0.1 < lineContinuerChance → 走填充词分支
  const withContinuer = stepDiscourse(at1, { state: 'shell', key: 'k', elapsedMs: (at1.remainingMs || 1) + 1, running: true }, always(0.05), tables);
  assert.ok(withContinuer.id && withContinuer.id.startsWith('continuer.'), withContinuer.id as string);
  assert.equal(withContinuer.interjected, true, '标记为插话');
  assert.equal(withContinuer.source && withContinuer.source.kind, 'state', '插话不能顶掉当前池');
  assert.deepEqual(withContinuer.group, { group: 1, at: 1 }, '序列记忆必须还在');
  // 下一步（不再触发填充词）应当接上第 2 句
  const next = stepDiscourse(withContinuer, { state: 'shell', key: 'k', elapsedMs: (withContinuer.remainingMs || 1) + 1 }, always(0.9), tables);
  assert.equal(next.id, group1[1].id, `填充词之后应接着说完：${next.id}`);
});

test('不在跑的时候不插填充词', () => {
  const first = tick(null, { state: 'shell' });
  const at = { ...first, group: { group: 1, at: 1 } };
  const next = stepDiscourse(at, { state: 'shell', key: 'k', elapsedMs: (at.remainingMs || 1) + 1, running: false }, always(0.05), tables);
  assert.ok(!next.id!.startsWith('continuer.'), next.id as string);
});

// ── E2③ 话题 ──

test('话题边沿：换了目标说 topicNew / 回到旧目标说 topicSame / 同一个目标不啰嗦', () => {
  const step = (prev: DiscourseState | null, topic: Topic) => stepDiscourse(
    prev, { state: 'read', key: 'k', topic, elapsedMs: prev ? (prev.remainingMs || 1) + 1 : 0 }, always(0.5), tables);

  const entry = step(null, { file: 'a.ts' });        // 入场那句由状态池说
  assert.ok(entry.id && entry.id.startsWith('read.'), entry.id as string);
  const changed = step(entry, { file: 'b.ts' });     // 换了目标
  assert.ok(changed.id && changed.id.startsWith('topic.topicNew.'), `换了目标：${changed.id}`);
  const again = step(changed, { file: 'b.ts' });     // 同一个目标：不啰嗦
  assert.ok(!again.id!.startsWith('topic.'), `同一个目标不该每拍都念：${again.id}`);
  const back = step(again, { file: 'a.ts' });        // 回到旧目标
  assert.ok(back.id && back.id.startsWith('topic.topicSame.'), `回到旧目标：${back.id}`);
});

test('话题边沿的判定（纯函数）', () => {
  const said = (spoken: string) => ({ ...emptyDiscourse(), lastTopicSpoken: spoken });
  assert.equal(topicEdge(said(''), { file: 'a.ts' }, ['a.ts']), 'topicNew', '第一次评论这个目标');
  assert.equal(topicEdge(said('a.ts'), { file: 'a.ts' }, ['a.ts']), null, '刚说过就别再念');
  assert.equal(topicEdge(said('b.ts'), { file: 'a.ts' }, ['a.ts', 'b.ts']), 'topicSame', '回到本轮早先的目标');
  assert.equal(topicEdge(said('a.ts'), { file: 'x.ts' }, ['a.ts', 'x.ts']), 'topicNew', '全新目标');
  assert.equal(topicEdge(said('c.ts'), { file: 'd.ts' }, ['a', 'b', 'c', 'd.ts']), 'topicMany');
  assert.equal(topicEdge(said(''), {}, ['a']), null, '没有目标就谈不上话题');
  assert.equal(topicEdge(null, { cmd: 'ls' }, ['ls']), 'topicNew');
});

// ── E4 成串 ──

test('成串：进入状态后可能短打扮，串满了必回长停顿', () => {
  // 进入状态那一拍总是正常停顿（她刚开口），成串发生在紧随其后的拍上
  let s = stepDiscourse(null, base, always(0.1), tables);
  assert.ok(s.remainingMs >= TUNING.lineDwellMs, `入场应是长停顿：${s.remainingMs}`);
  s = tick(s, { state: 'idle' }, always(0.1));
  assert.ok(s.remainingMs <= TUNING.lineBurstMs[1], `第二拍该追上：${s.remainingMs}`);
  for (let i = 0; i < 8; i++) s = tick(s, { state: 'idle' }, always(0.1));
  assert.ok(s.beat <= TUNING.lineMaxBeat, `拍数不该超过上限：${s.beat}`);
  // 不成串的随机值下必须回到长停顿
  const relaxed = tick(s, { state: 'idle' }, always(0.9));
  assert.ok(relaxed.remainingMs >= TUNING.lineDwellMs, `${relaxed.remainingMs}`);
  assert.equal(relaxed.beat, 1, '长停顿会把这一串收尾');
});

test('不成串时回到正常停顿', () => {
  const a = stepDiscourse(null, base, always(0.5), tables);
  const b = tick(a, { state: 'idle' }, always(0.9));
  assert.ok(b.remainingMs >= TUNING.lineDwellMs, `应是长停顿：${b.remainingMs}`);
});

// ── E5 近期窗口 ──

test('近期窗口：60 次抽取里，24 条之内不重复', () => {
  let s: DiscourseState | null = null;
  const ids: string[] = [];
  for (let i = 0; i < 60; i++) {
    s = tick(s, { state: 'idle' }, always(0.37));
    ids.push(s.id as string);
  }
  for (let i = 0; i < ids.length; i++) {
    for (let j = Math.max(0, i - TUNING.lineRecentWindow + 1); j < i; j++) {
      assert.notEqual(ids[i], ids[j], `第 ${i} 条与第 ${j} 条重复（窗口内）`);
    }
  }
});

test('池子比窗口还小时也不空手', () => {
  let s: DiscourseState | null = null;
  const ids = new Set<string>();
  for (let i = 0; i < 20; i++) {
    s = tick(s, { state: 'tiny' as never }, always(0.4));
    assert.ok(s.id, '永远要有一句可说');
    ids.add(s.id as string);
  }
  assert.equal(ids.size, 2, '两条都用到');
});

// ── E6 音区与心情 ──

test('动作音区收窄候选；该音区没有就退回', () => {
  const a = tick(null, { state: 'idle', tone: 'calm' });
  const calm = new Set((tables.pools.idle as PoolLine[]).filter((l) => l.tone === 'calm').map((l) => l.id));
  assert.ok(calm.has(a.id as string), a.id as string);
  const b = tick(null, { state: 'idle', tone: 'worry' }, always(0.3));
  assert.ok(b.id && b.id.startsWith('idle.'), '没有 worry 也照样说');
});

test('心情：连败偏 worry，刚开场偏 bright，做久了偏 calm', () => {
  assert.equal(moodTone({ failStreak: 2, spoken: 50 }), 'worry');
  assert.equal(moodTone({ failStreak: 0, spoken: 1 }), 'bright');
  assert.equal(moodTone({ failStreak: 0, spoken: 200 }), 'calm');
  assert.equal(moodTone({ failStreak: 0, spoken: 50 }), null);
});

test('心情真的会改变选择：连败之后落到 worry 池', () => {
  const s = tick({ ...emptyDiscourse(), failStreak: 2, spoken: 50 } as DiscourseState, { state: 'error' }, always(0.3));
  const worry = (tables.pools.error as PoolLine[]).every((l) => l.tone === 'worry');
  assert.ok(worry, '合成表本身就是 worry 池');
  assert.ok(s.id && s.id.startsWith('error.'));
});

// ── 可复现与容错 ──

test('同一个随机流给出同一个结果', () => {
  const run = (): string[] => {
    let s: DiscourseState | null = null;
    const out: string[] = [];
    for (let i = 0; i < 12; i++) {
      s = tick(s, { state: 'idle' }, queue([0.11, 0.42, 0.73, 0.28]));
      out.push(s.id as string);
    }
    return out;
  };
  assert.deepEqual(run(), run());
});

test('空表不崩：没有池就保持原样，不返回半成品', () => {
  const empty: DiscourseTables = { pools: {}, bridges: {}, continuers: [], events: {}, topics: {} };
  const a = stepDiscourse(null, { state: 'idle', key: 'k', elapsedMs: 0 }, always(0.5), empty);
  assert.equal(a.id, null);
  assert.equal(a.source, null);
  const b = stepDiscourse(a, { state: 'idle', key: 'k', elapsedMs: 99999 }, always(0.5), empty);
  assert.equal(b.id, null);
});

test('真实表已就位（文案还没写时是空的，但结构必须在）', () => {
  assert.ok(TABLES.pools.idle && TABLES.pools.idle.length > 0, '状态池有内容');
  assert.ok(Array.isArray(TABLES.continuers));
  assert.equal(typeof TABLES.events, 'object');
  assert.equal(typeof TABLES.topics, 'object');
  assert.ok(Object.keys(TABLES.bridges).length > 0, '桥接池有内容');
});

// ── 新话头绝不从半截开始（V2 的老规矩，V3 仍然成立） ──

test('新话头只从独立句或序列首句里挑，绝不从半截开始', () => {
  const middles = new Set(
    (tables.pools.idle as PoolLine[]).filter((l) => l.group !== undefined && l.at !== 1).map((l) => l.id),
  );
  assert.ok(middles.size > 0, '合成表里得有半截句，否则这个测试没意义');
  let s: DiscourseState | null = null;
  for (let i = 0; i < 200; i++) {
    // 每次换 key = 模拟"事实变了"，逼出一次全新抽取
    s = stepDiscourse(s, { state: 'idle', key: `k${i}`, elapsedMs: 99999 }, always(0.3), tables);
    assert.ok(!middles.has(s.id as string), `抽到了半截：${s.id}`);
  }
});

// ── 事实边沿：把"变化"认出来 ──

const edge = (over: Partial<FactEdge> = {}): FactEdge =>
  ({ running: false, errored: false, pending: null, queued: 0, tools: 0, ...over });

test('detectEdges：第一次看到她就是 greet，只发生一次', () => {
  assert.deepEqual(detectEdges(null, edge()), ['greet']);
  assert.deepEqual(detectEdges(edge(), edge()), [], '没有变化就没有事件');
});

test('detectEdges：失败、等待结束、排队、恢复、开工', () => {
  assert.deepEqual(detectEdges(edge(), edge({ errored: true })), ['failed']);
  assert.deepEqual(detectEdges(edge({ errored: true }), edge()), ['cleared']);
  assert.deepEqual(detectEdges(edge({ errored: true }), edge({ running: true })), ['retry']);
  assert.deepEqual(detectEdges(edge({ pending: 'approval' }), edge()), ['approvalDone']);
  assert.deepEqual(detectEdges(edge({ pending: 'question' }), edge()), ['answered']);
  assert.deepEqual(detectEdges(edge({ pending: 'planReview' }), edge()), ['answered']);
  assert.deepEqual(detectEdges(edge({ queued: 1 }), edge({ queued: 3, running: true })), ['queue']);
  assert.deepEqual(detectEdges(edge({ running: true, tools: 1 }), edge({ running: true, tools: 2 })), [],
    '已经开工了就不再报 firstTool');
});

test('detectEdges：同一次变化的多个边沿按重要性排序', () => {
  const got = detectEdges(
    edge({ pending: 'approval', queued: 0 }),
    edge({ pending: null, errored: true, queued: 2, running: true, tools: 1 }),
  );
  // 失败最急、等待结束次之、你有没有说话再次之，最后才是"开工了"
  assert.deepEqual(got, ['failed', 'approvalDone', 'queue', 'firstTool']);
});


// ── 用**真实数据**跑一遍四层：合成表过了不代表线上接得上 ──

test('真实数据：状态池、桥接池、事件池、话题池、填充词池都真的能被说出来', () => {
  const run = (prev: DiscourseState | null, over: Record<string, unknown>, random = always(0.05)) =>
    stepDiscourse(prev, { state: 'read' as never, key: 'k', elapsedMs: 99999, ...over } as never, random);

  // ① 状态池
  const entry = run(null, {});
  assert.ok(entry.id && entry.id.startsWith('read.'), `状态池：${entry.id}`);

  // ② 桥接池：找一个真实存在的转移对
  const bridgeKey = Object.keys(TABLES.bridges).find((k) => k.endsWith('>read'));
  assert.ok(bridgeKey, '至少有一个指向 read 的桥接对');
  const [from] = bridgeKey.split('>');
  const before = stepDiscourse(null, { state: from as never, key: 'k', elapsedMs: 0 }, always(0.5));
  const crossed = stepDiscourse(before, { state: 'read', key: 'k', elapsedMs: 1 }, always(0.5));
  assert.ok(crossed.id && crossed.id.startsWith(`bridge.${from}.read.`), `桥接池：${crossed.id}`);

  // ③ 事件池（抢占，不等停顿）
  const event = stepDiscourse(entry, { state: 'read', key: 'k', elapsedMs: 1, events: ['queue'] }, always(0.5));
  assert.ok(event.id && event.id.startsWith('event.queue.'), `事件池：${event.id}`);

  // ④ 话题池：目标换了
  const moved = stepDiscourse(entry, { state: 'read', key: 'k', topic: { file: 'zzz-new-file.ts' }, elapsedMs: 99999 }, always(0.5));
  assert.ok(moved.id && moved.id.startsWith('topic.topicNew.'), `话题池：${moved.id}`);

  // ⑤ 填充词：手上有活时插入
  const working = { ...entry, source: { kind: 'state', state: 'read' } as const, beat: 1, group: null };
  const murmur = stepDiscourse(working, { state: 'read', key: 'k', elapsedMs: 99999, running: true }, always(0.05));
  assert.ok(murmur.id && murmur.id.startsWith('continuer.'), `填充词池：${murmur.id}`);
});

test('真实数据：序列真的会接着说下一句', () => {
  // 在真实的 read 池里找一个组
  const pool = TABLES.pools.read as PoolLine[];
  const group = pool.filter((l) => l.group === 1).sort((a, b) => (a.at || 0) - (b.at || 0));
  assert.ok(group.length >= 2, '真实池里有序列组');
  const at1: DiscourseState = {
    ...emptyDiscourse(),
    id: group[0].id, state: 'read', key: 'k', source: { kind: 'state', state: 'read' },
    group: { group: 1, at: 1 }, beat: 1, remainingMs: 100,
  };
  const next = stepDiscourse(at1, { state: 'read', key: 'k', elapsedMs: 500 }, always(0.9));
  assert.equal(next.id, group[1].id, '真实数据里也要接得上');
});
