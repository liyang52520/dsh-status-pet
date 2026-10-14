// The state machine: what the agent is doing → what the pet shows.
//
// A pure fold over observable session facts, so the priority order is
// verifiable without a browser.  Highest priority first: what the user owes the
// agent, then what the agent is doing, then the outcome.
//
// V2 widened both halves.  The FACTS now carry what the running tool calls
// actually are (name, raw arguments, turn/step, start time, nesting) and what
// the assistant stream is emitting (reasoning / text / a tool call being
// prepared), so the state can name the WORK (`shell`/`read`/`search`/…) instead
// of one generic `tool`.  Every field is optional and every read is guarded:
// a contract change degrades to fewer states, never to a crash or a blank pet.

import { TUNING } from './tuning.ts';
import { categoryOf } from './tool-catalog.ts';
import type { PetState } from './vocabulary.ts';

/** 正在等你的那件事。 `kind` 已归一化成状态名。 */
export interface PendingFact {
  kind: 'approval' | 'question' | 'planReview';
  /** 审批：要批准的是哪个工具。 */
  toolName?: string;
  /** 审批：理由（displayReason 优先）。 */
  reason?: string;
  /** 提问 / 计划评审：几问。 */
  questions?: number;
}

/** 一次正在运行的工具调用。 全部可选 —— 缺哪个都能退化成"有个工具在跑"。 */
export interface RunningToolFact {
  name: string;
  /** 'preparing' = 参数还在流式传输；'start' = 已派发。 */
  phase?: string;
  /** 原始参数 JSON（台词变量就从这里抽）。 */
  argsRaw?: string;
  turn?: number;
  step?: number;
  /** 开始时刻（ms）。 */
  time?: number;
  /** 嵌套子调用数（subagent / PTC 派发）。 */
  subCalls?: number;
}

/** 助手流式的最后一块是什么。 */
export type StreamKind = 'text' | 'reasoning' | 'tool-call' | 'other';

/** Everything the state machine is allowed to know about the session. */
export interface PetFacts {
  /** false renders a decorative pet — the machine returns `idle` outright. */
  enabled?: boolean;
  /** The interaction the user owes an answer to, or null. */
  pending: PendingFact | null;
  /** Running OR a submission echo still in flight. */
  running: boolean;
  errored: boolean;
  unread: boolean;
  /** Every tool call running right now, in dispatch order. */
  tools: RunningToolFact[];
  /** What the assistant stream emitted last (null = not streaming). */
  stream: StreamKind | null;
  /** Messages the user queued while the agent was busy. */
  queued: number;
  /** Wall clock, passed in so this stays pure. */
  now: number;
  /** Synthetic: `0` while awake, `sleepAfterMs` once the sleep timer fired.  It
   *  is a boundary, not a clock — the view owns the one timeout. */
  idleMs: number;
}

/** 默认值：一个"什么都没发生"的会话。 slot 少给一个 prop 也不会崩。 */
export function emptyFacts(now = 0): PetFacts {
  return {
    enabled: TUNING.reactToStatus,
    pending: null,
    running: false,
    errored: false,
    unread: false,
    tools: [],
    stream: null,
    queued: 0,
    now,
    idleMs: 0,
  };
}

export function deriveState(f: PetFacts): PetState {
  if (f.enabled === false) return 'idle';

  // ── 你欠她一个回答 ──（最高优先级：她停下来等你，别的事都不重要）
  const pending = f.pending;
  if (pending) {
    if (pending.kind === 'approval') return 'approval';
    if (pending.kind === 'planReview') return 'planReview';
    if (pending.kind === 'question') return 'question';
  }

  if (f.running) {
    const tools = f.tools;

    // 同时两件以上：当下的事实是"她忙不过来"，不是"她在读第 2 个文件"。
    if (tools.length >= 2) return 'multi';

    const first = tools[0];
    if (first) {
      // 参数还在流式传输：她还在凑这次调用，没开始干。
      if (first.phase === 'preparing') return 'preparing';
      // 跑太久了：等待本身成了当下的事实（类别仍会进台词，作为 {name}/{secs}）。
      if (typeof first.time === 'number' && f.now - first.time >= TUNING.slowToolMs) return 'slow';
      // 类别名就是状态名：shell / read / search / write / web / agent / plan / deliver / tool
      return categoryOf(first.name) as PetState;
    }

    // 还没有工具调用 —— 看她正在产出什么。
    if (f.stream === 'reasoning') return 'reasoning';
    if (f.stream === 'tool-call') return 'preparing';
    if (f.stream === 'text') return 'stream';
    return 'think';
  }

  if (f.errored) return 'error';
  if (f.unread) return 'done';
  if (f.idleMs >= TUNING.sleepAfterMs) return 'sleep';
  return 'idle';
}
