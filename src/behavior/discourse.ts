// 话语引擎：让句子之间有记忆、有顿挫、有回应、有话题。
//
// V1/V2 的轮换是"每次独立抽签"——文案再多，读起来也是每 8 秒念一句不相干的话。
// V3 把它换成一次**话语推进会**：谁在说话不重要，重要的是**刚才说过什么、你在做什么、
// 她跟你说话说到哪了**。
//
// 传入的表可以替换（`tables`），随机源可以注入 —— 于是这一整层在 node 里可测，
// 不依赖任何一条真实文案。
//
//   E0 事件抢占   你排队/批准/回答/出错/点开它 —— 事实的**边沿**一响，立刻换话
//   E1 状态切换   有桥接就先接住上一句（桥接本身也可以是 2 行序列）
//   E2 停顿耗尽   ① 序列还有下一句 → 必然接上 ② 话题变了 → 说话题 ③ 否则抽状态池
//   E3 填充词     长时间在跑时，夹一句"嗯…"，**不打断序列记忆**
//   E4 成串       一串最多 3 拍，短打扮着长停顿，不再像节拍器
//   E4b 留白      说够一段之后整拍不吭声 —— 话真的稀疏下来，而不是每句拉长
//   E5 近期窗口   24 条之内不重复（shuffle-bag，而不是掷骰子）
//   E6 音区 + 心情  动作音区收窄；连败偏 worry，刚开场偏 bright，做久了偏 calm

import { BRIDGE_SPECS, CONTINUERS, EVENTS, LINE_SPECS, TOPICS } from './line-pools.ts';
import type { PoolLine } from './line-pools.ts';
import { TUNING } from './tuning.ts';
import type { StateName, Tone } from './vocabulary.ts';

/** 她说这句话时，是从哪一层抽出来的。 */
export type LineSource =
  | { kind: 'state'; state: StateName }
  | { kind: 'bridge'; from: StateName; to: StateName }
  | { kind: 'event'; name: string }
  | { kind: 'topic'; name: string }
  | { kind: 'continuer' };

/** 一次"目标"快照（话题边沿用它判断你有没有换地方）。 */
export interface Topic {
  file?: string;
  cmd?: string;
  pat?: string;
  q?: string;
}

export interface DiscourseTables {
  pools: Record<string, readonly PoolLine[] | undefined>;
  bridges: Record<string, readonly PoolLine[] | undefined>;
  continuers: readonly PoolLine[];
  events: Record<string, readonly PoolLine[] | undefined>;
  topics: Record<string, readonly PoolLine[] | undefined>;
}

export const TABLES: DiscourseTables = {
  pools: LINE_SPECS,
  bridges: BRIDGE_SPECS,
  continuers: CONTINUERS,
  events: EVENTS,
  topics: TOPICS,
};

export interface DiscourseState {
  id: string | null;
  source: LineSource | null;
  state: StateName | null;
  key: string;
  remainingMs: number;
  /** 最近说过的 id（含填充词）—— 近期窗口。 */
  recent: readonly string[];
  /** 序列记忆。 填充词**不**改写它，于是"…（嗯）…找到了"这种接续成立。 */
  group: { group: number; at: number } | null;
  /** 当前这一串说了几拍（最多 TUNING.lineMaxBeat）。 */
  beat: number;
  /** 上一句是填充词（插话）。 用它防止"嗯…嗯…嗯…"，也不许它顶掉当前池。 */
  interjected: boolean;
  /**
   * 这一拍是**留白**：她没说话，只是停着。 `id` 保持上一条（界面靠它占住原来的
   * 宽度，不能因为有话没话就把布局抖一下），`group` 已经清空 —— 长停顿是段落
   * 边界，不是"接着上一串的中段说"。
   */
  silent: boolean;
  spoken: number;
  /** 同一个状态里已经**推进**了几拍（换状态归零）。 停顿的拉伸系数看它。 */
  still: number;
  failStreak: number;
  topic: Topic;
  /** 她**评论过**的那个目标。 用它保证"话题变了只说一次"，而不是每拍都念。 */
  lastTopicSpoken: string;
  turn: number | null;
  /** 本轮出现过的目标（去重），`topicMany` 用。 */
  targets: readonly string[];
  greeted: boolean;
}

export interface DiscourseInput {
  state: StateName;
  /** 事实签名：它一变就立即重抽（同 V2 的 R4）。 */
  key: string;
  tone?: Tone | null;
  topic?: Topic;
  turn?: number;
  /** 刚刚发生的事实**边沿**（按重要性排序，取第一个有池的）。 */
  events?: readonly string[];
  running?: boolean;
  errored?: boolean;
  elapsedMs: number;
  reducedMotion?: boolean;
  /** 关掉某一层 —— 测试与"只要状态台词"的场合用。 */
  layers?: { bridges?: boolean; continuers?: boolean; events?: boolean; topics?: boolean; silence?: boolean };
}

export function emptyDiscourse(): DiscourseState {
  return {
    id: null, source: null, state: null, key: '', remainingMs: 0, recent: [], group: null,
    beat: 0, interjected: false, silent: false, spoken: 0, still: 0, failStreak: 0, topic: {}, lastTopicSpoken: '', turn: null, targets: [], greeted: false,
  };
}

// ── 池 ──

function poolOf(source: LineSource | null, tables: DiscourseTables): readonly PoolLine[] {
  if (!source) return [];
  switch (source.kind) {
    case 'state': return tables.pools[source.state] || [];
    case 'bridge': return tables.bridges[`${source.from}>${source.to}`] || [];
    case 'event': return tables.events[source.name] || [];
    case 'topic': return tables.topics[source.name] || [];
    case 'continuer': return tables.continuers;
  }
}

/** 只有状态池与桥接池可以带序列。 */
function sourceCanSequence(source: LineSource | null): boolean {
  return !!source && (source.kind === 'state' || source.kind === 'bridge');
}

// ── 音区与心情 ──

/** 心情：连败偏 worry；刚开场偏 bright；做久了且没出错偏 calm。 与动作音区**叠加**。 */
export function moodTone(s: Pick<DiscourseState, 'failStreak' | 'spoken'>): Tone | null {
  if (s.failStreak >= 2) return 'worry';
  if (s.spoken < 3) return 'bright';
  if (s.spoken > 120 && s.failStreak === 0) return 'calm';
  return null;
}

/** 按顺序试：动作音区 ∩ 候选 → 动作音区 → 心情音区 → 整池。 */
function toneOrder(tone: Tone | null | undefined, mood: Tone | null): Array<Tone | null> {
  const out: Array<Tone | null> = [];
  if (tone) out.push(tone);
  if (mood && mood !== tone) out.push(mood);
  out.push(null);
  return out;
}

function byTone(pool: readonly PoolLine[], tone: Tone | null | undefined): readonly PoolLine[] {
  if (!tone) return pool;
  const hit = pool.filter((line) => line.tone === tone);
  return hit.length ? hit : [];
}

// ── 抽取 ──

/** 近期窗口过滤：先排除窗口内的，排空了就只排除最近 4 条，再空就不过滤。 */
function withinRecency(pool: readonly PoolLine[], recent: readonly string[]): readonly PoolLine[] {
  const window = recent.slice(-TUNING.lineRecentWindow);
  const fresh = pool.filter((line) => !window.includes(line.id));
  if (fresh.length) return fresh;
  const tail = recent.slice(-4);
  const looser = pool.filter((line) => !tail.includes(line.id));
  return looser.length ? looser : pool;
}

/** 新话头只在「独立句 + 序列首句」里挑；`allowMid` 时才允许从中间接。 */
function pickFrom(
  pool: readonly PoolLine[],
  opts: { tone?: Tone | null; mood?: Tone | null; recent?: readonly string[]; allowMid?: boolean; random: () => number },
): PoolLine | null {
  const recent = opts.recent || [];
  for (const tone of toneOrder(opts.tone, opts.mood || null)) {
    const narrowed = byTone(pool, tone);
    if (!narrowed.length) continue;
    const recency = withinRecency(narrowed, recent);
    const list = opts.allowMid ? recency : recency.filter((line) => line.group === undefined || line.at === 1);
    const usable = list.length ? list : recency;
    if (!usable.length) continue;
    const n = Math.floor(opts.random() * usable.length) % usable.length;
    return usable[n < 0 ? 0 : n];
  }
  return null;
}

function memberAt(pool: readonly PoolLine[], group: number, at: number): PoolLine | null {
  for (const line of pool) if (line.group === group && line.at === at) return line;
  return null;
}

// ── 话题 ──

function topicKey(topic: Topic): string {
  return topic.file || topic.cmd || topic.pat || topic.q || '';
}

function collectTargets(prev: DiscourseState | null, topic: Topic, turn: number | null): string[] {
  const key = topicKey(topic);
  if (!key) return prev && prev.turn === turn ? [...prev.targets] : [];
  // 换轮就清空重记
  const base = prev && prev.turn === turn ? [...prev.targets] : [];
  if (!base.includes(key)) base.push(key);
  return base.slice(-12);
}

/**
 * 话题边沿：她**只在"该说的话变了"的时候**才评论一次。
 *
 *   · 刚说过这个话题（`lastTopicSpoken === key`）→ 不吭声（否则每拍都念，很烦）
 *   · 这一轮目标数已经到 `topicManyAt` → `topicMany`
 *   · 回到本轮更早出现过的目标 → `topicSame`（"又回来了"）
 *   · 全新的目标 → `topicNew`
 */
export function topicEdge(
  prev: DiscourseState | null,
  topic: Topic,
  targets: readonly string[],
): 'topicMany' | 'topicNew' | 'topicSame' | null {
  const key = topicKey(topic);
  if (!key) return null;
  if (prev && prev.lastTopicSpoken === key) return null;
  if (targets.length >= TUNING.topicManyAt) return 'topicMany';
  const earlier = targets.slice(0, -1);
  return earlier.includes(key) ? 'topicSame' : 'topicNew';
}

// ── 停顿时长 ──

function between(min: number, max: number, random: () => number): number {
  return Math.round(min + random() * (max - min));
}

// ── 主函数 ──

function record(
  prev: DiscourseState,
  line: PoolLine | null,
  source: LineSource | null,
  remainingMs: number,
  beat: number,
  opts: { keepGroup?: boolean; topicCommented?: boolean; interjected?: boolean },
): DiscourseState {
  const recent = line ? [...prev.recent, line.id].slice(-TUNING.lineRecentWindow) : prev.recent;
  const group = line && line.group !== undefined && line.at !== undefined
    ? { group: line.group, at: line.at }
    : opts.keepGroup ? prev.group : null;
  return {
    ...prev,
    id: line ? line.id : prev.id,
    source: line ? source : prev.source,
    remainingMs,
    recent,
    group,
    beat,
    spoken: line ? prev.spoken + 1 : prev.spoken,
    interjected: line ? !!opts.interjected : prev.interjected,
    // 记录一整句 = 这一拍她在说话，留白到此为止。
    silent: false,
    lastTopicSpoken: line && opts.topicCommented ? topicKey(prev.topic) : prev.lastTopicSpoken,
  };
}

/**
 * 推进一步。 返回新的状态（含 `id` 与停顿）。
 * `prev` 为 null 表示第一次说话。
 */
export function stepDiscourse(
  prev: DiscourseState | null,
  input: DiscourseInput,
  random: () => number = Math.random,
  tables: DiscourseTables = TABLES,
): DiscourseState {
  const { state, key, tone, elapsedMs, reducedMotion } = input;
  const layers = input.layers || {};
  const topic = input.topic || {};
  const turn = input.turn ?? null;

  // ── 先结算事实带来的心情与目标 ──
  let failStreak = prev ? prev.failStreak : 0;
  let greeted = prev ? prev.greeted : false;
  for (const event of input.events || []) {
    if (event === 'failed') failStreak += 1;
    if (event === 'cleared' || event === 'retry') failStreak = 0;
    if (event === 'greet') greeted = true;
  }
  const targets = collectTargets(prev, topic, turn);

  // state / key 必须在这里就记下来：整个引擎靠"和上一次比"来判断"是不是同一件事"，
  // 漏记一次，后面所有的同状态判断都会失准（第一版就栽在这）。
  let current: DiscourseState = {
    ...(prev || emptyDiscourse()),
    state,
    key,
    failStreak,
    greeted,
    turn,
    topic,
    targets,
    // 换了状态就归零；同一状态里保持上一拍的深度（真正的 +1 在"这一拍确定要开口"
    // 之后 —— 只 hold、不推进的那些调用不算）。
    still: prev && prev.state === state ? prev.still : 0,
  };
  const mood = moodTone({ failStreak, spoken: current.spoken });
  const drawOpts = { tone, mood, recent: current.recent, random };
  const reduced = !!reducedMotion;

  /** 基础停顿：`lineDwellMs` + 随机抖动。 */
  const baseDwell = () => reduced
    ? 0
    : between(TUNING.lineDwellMs, TUNING.lineDwellMs + TUNING.lineJitterMs, random);
  /** 同一个状态待得越久，下一句越晚：base × (1 + stretch·still)，封顶 max。 */
  const idleDwell = () => {
    if (reduced) return 0;
    const factor = Math.min(TUNING.lineIdleMax, 1 + TUNING.lineIdleStretch * current.still);
    return Math.round(between(TUNING.lineDwellMs, TUNING.lineDwellMs + TUNING.lineJitterMs, random) * factor);
  };

  const done = (line: PoolLine | null, source: LineSource | null, ms: number, beat: number, opts: { keepGroup?: boolean } = {}) =>
    record(current, line, source, ms, beat, opts);
  const hold = () => ({ ...current, remainingMs: reduced ? 0 : current.remainingMs });

  // ── E0 事件抢占 ──
  if (layers.events !== false) {
    for (const name of input.events || []) {
      const pool = tables.events[name];
      if (!pool || !pool.length) continue;
      current = { ...current, beat: 0 };
      const line = pickFrom(pool, { ...drawOpts, allowMid: true });
      if (line) {
        return done(line, { kind: 'event', name }, reduced ? 0 : between(TUNING.lineEventMs[0], TUNING.lineEventMs[1], random), 0);
      }
    }
  }

  const sameState = prev !== null && prev.state === state;
  const sameKey = prev !== null && prev.key === key;

  // ── E1 状态切换 ──
  if (!sameState) {
    const bridge = layers.bridges === false || prev === null
      ? null
      : tables.bridges[`${prev.state}>${state}`];
    const source: LineSource = bridge && bridge.length
      ? { kind: 'bridge', from: prev!.state as StateName, to: state }
      : { kind: 'state', state };
    const pool = poolOf(source, tables);
    const line = pickFrom(pool, drawOpts);
    return done(line, source, baseDwell(), 1);
  }

  // ── 同状态：只有停顿到了才换话（reduced motion 下只认 key/事件的边沿） ──
  if (sameKey) {
    if (reduced) return hold();
    const remaining = current.remainingMs - (elapsedMs > 0 ? elapsedMs : 0);
    if (remaining > 0) return { ...current, remainingMs: remaining };
  }

  // 这一拍真的往下走了（不是 hold）：同一个状态里再记一格"静默深度"。
  current = { ...current, still: current.still + 1 };

  const pool = poolOf(current.source, tables);

  // ── E2① 话题边沿（比"把旧话说完"更优先：目标都换了，旧话已经过期） ──
  if (layers.topics !== false && current.source && current.source.kind === 'state') {
    const edge = topicEdge(prev, topic, targets);
    const topicPool = edge ? tables.topics[edge] : undefined;
    if (topicPool && topicPool.length) {
      const line = pickFrom(topicPool, { ...drawOpts, allowMid: true });
      if (line) {
        current = { ...current, beat: 1 };
        return record(current, line, { kind: 'topic', name: edge! }, baseDwell(), 1,
          { topicCommented: true });
      }
    }
  }

  // ── E3 填充词：手上有活时夹一句，且**不打断序列记忆** ──
  //   刻意排在"接上下一句"之前：真实的插话就是会把一句话打断，然后接着说。
  if (layers.continuers !== false && input.running && tables.continuers.length
    && current.beat >= 1 && !current.interjected && current.source
    && random() < TUNING.lineContinuerChance) {
    const line = pickFrom(tables.continuers, { ...drawOpts, allowMid: true });
    // 两个关键点：
    //   · keepGroup —— 填充词之后，序列还能接着说完（"…（嗯）…找到了"）
    //   · source 不变 —— 填充词是**插在**当前这件事里的一句，不是换了一件事
    if (line) {
      return record(current, line, current.source,
        reduced ? 0 : between(TUNING.lineContinuerMs[0], TUNING.lineContinuerMs[1], random),
        current.beat, { keepGroup: true, interjected: true });
    }
  }

  // ── E2② 序列：上一句还有下一句 → 必然接上 ──
  if (sameKey && sourceCanSequence(current.source) && current.group) {
    const next = memberAt(pool, current.group.group, current.group.at + 1);
    if (next) {
      current = { ...current, beat: current.beat + 1 };
      return done(next, current.source, idleDwell(), current.beat);
    }
  }

  // ── E2④ 回到状态池 ──
  const source: LineSource = { kind: 'state', state };
  const statePool = poolOf(source, tables);
  const beat = current.beat + 1;

  // ── E4 成串：一串最多 lineMaxBeat 拍；串内短打扮长停顿 ──
  //    留白之后的第一句必然是一个正常停顿：安静完再"追着说"，读起来像抖了一下。
  const burst = !current.silent && beat < TUNING.lineMaxBeat && random() < TUNING.lineBurstChance;

  // ── E4b 留白：说够一段之后，她可能整拍**不吭声** ──
  //    "话太密"的正解不是把每句拉长（那还是"每 N 秒念一句"），而是让话之间真的
  //    有安静的段落。 四个约束，缺一个都会变成 bug：
  //      · 成串优先 —— 成串是"一句赶着一句"，正是留白的反面，掷中了就别说停就停；
  //      · `sameKey` —— 事实签名变了正是值得开口的时刻，留白不许盖过它；
  //      · `!current.silent` —— 不许连着留白，否则一直低随机就成了"死机"；
  //      · `current.beat >= 1` —— 得先说过话，才谈得上"停一停"。
  //    id 不动（界面靠它占住宽度，见 DiscourseState.silent）；group 清空，长停顿
  //    是段落边界，不是接着上一串的中段说。
  if (!burst && layers.silence !== false && sameKey && !current.silent && current.beat >= 1
    && !reduced && random() < TUNING.lineSilenceChance) {
    return {
      ...current,
      silent: true,
      beat: 0,
      group: null,
      interjected: false,
      remainingMs: between(TUNING.lineSilenceMs[0], TUNING.lineSilenceMs[1], random),
    };
  }

  const line = pickFrom(statePool, drawOpts);
  const ms = reduced ? 0 : burst
    ? between(TUNING.lineBurstMs[0], TUNING.lineBurstMs[1], random)
    : idleDwell();
  return done(line, source, ms, burst ? beat : 1);
}
