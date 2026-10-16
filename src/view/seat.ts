// The dock seat's status: read the session's standard props through narrow
// selectors, fold them into `PetFacts` for the state machine, and own the two
// timers the machine needs (sleep, and "this step is taking too long").
//
// V2 reads MORE of what the host already publishes — the running tool calls
// (with their raw arguments, turn/step and start time) and the assistant
// stream's block kinds.  Two rules keep that safe:
//
//   1. **Selectors must return reference-stable values.**  `useChat` is a
//      store subscription: returning a freshly built array every call would
//      re-render forever.  So we select the store's own sub-objects (which the
//      store already keeps identity-stable) or primitives, and derive the rest
//      in plain code.
//   2. **Every read is guarded.**  These are not all documented APIs; a shape
//      change must degrade to fewer states, never throw and never blank the pet.

import { React } from '../platform/deps.ts';
import { TUNING } from '../behavior/tuning.ts';
import { emptyFacts } from '../behavior/facts.ts';
import type { PetFacts, PendingFact, RunningToolFact, StreamKind } from '../behavior/facts.ts';
import type { Translator } from '../labels/index.ts';

/** 用来判"边沿"的那几个事实（只留变化敏感的部分，避免每帧都当新事件）。 */
export interface FactEdge {
  running: boolean;
  errored: boolean;
  /** 归一化后的等待类型，无则 null。 */
  pending: string | null;
  queued: number;
  tools: number;
}

/**
 * 事实的**边沿** → 她该立刻回应的事件。
 *
 * 为什么要有这一层：状态机回答"现在是什么状态"，但"你刚做了什么"是**变化**，
 * 不是状态。没有它，你排了队、批准了、出错了，她只会照旧念状态台词——最像
 * 机器人的地方就在这儿。
 *
 * 返回按**重要性**排序（引擎取第一个有池的）：失败 > 等你的事结束 > 排队 > 恢复 > 开工。
 */
export function detectEdges(prev: FactEdge | null, next: FactEdge): string[] {
  if (prev === null) return ['greet'];
  const out: string[] = [];
  if (!prev.errored && next.errored) out.push('failed');
  if (prev.pending !== null && next.pending === null) {
    out.push(prev.pending === 'approval' ? 'approvalDone' : 'answered');
  }
  if (next.queued > prev.queued) out.push('queue');
  if (prev.errored && !next.errored) out.push(next.running ? 'retry' : 'cleared');
  if (!prev.running && next.running && prev.tools === 0 && next.tools > 0) out.push('firstTool');
  return out;
}

// Fallbacks keep the hook count stable when the slot omits a prop, so a
// contract change degrades to a decorative pet instead of a blank slot.
const NO_SESSION = {
  running: false as boolean,
  openState: '' as string,
  lastAgentError: null as unknown,
  promptError: null as unknown,
  pendingSubmissions: [] as unknown[],
};
const NO_STATUS = new Map();
const NO_CHAT = { legacy: { runningCalls: [] as unknown, partial: null as unknown } };

type Selector<T> = (value: T) => unknown;
type SnapshotHook<T> = (select: Selector<T>) => any;

function useNoSession<T>(select: Selector<T>) { return select(NO_SESSION as unknown as T); }
function useNoStatus<T>(select: Selector<T>) { return select(NO_STATUS as unknown as T); }
function useNoChat<T>(select: Selector<T>) { return select(NO_CHAT as unknown as T); }

/** The status props the `conversation.composer.dock` seat hands the pet. */
export interface DockSeatProps {
  useSession?: SnapshotHook<typeof NO_SESSION>;
  useSessionStatus?: SnapshotHook<Map<string, { pendingInteraction?: unknown; completionUnread?: boolean }>>;
  useChat?: SnapshotHook<typeof NO_CHAT>;
  sessionId?: string;
  t?: Translator;
}

export interface PetStatus {
  facts: PetFacts;
  /** The tool she is currently running, if any — the dock's `token` label. */
  toolName: string | null;
  /** 刚发生的边沿事件（有序）。 用 `eventSeq` 判断"是不是新的"。 */
  events: readonly string[];
  /** 事件序号：只有真正检测到新边沿时才前进。 */
  eventSeq: number;
}

// ── 形状守卫：DSH 的这些对象没有客户端类型，读之前一律先问"这是不是我要的东西" ──

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** `pendingInteraction` 实例 → 归一化的事实。 三种 kind 是 DSH 真实存在的三种。 */
export function toPendingFact(interaction: unknown): PendingFact | null {
  if (!interaction || typeof interaction !== 'object') return null;
  const raw = interaction as Record<string, unknown>;
  const kind = str(raw.kind);
  if (kind === 'approval') {
    return {
      kind: 'approval',
      toolName: str(raw.toolName),
      reason: str(raw.displayReason) || str(raw.reason),
    };
  }
  if (kind === 'question' || kind === 'plan-review') {
    const questions = Array.isArray(raw.questions) ? raw.questions : [];
    return { kind: kind === 'plan-review' ? 'planReview' : 'question', questions: questions.length };
  }
  return null;
}

/** `legacy.runningCalls` → 事实数组。 未知形状直接跳过那一项。 */
export function toRunningTools(rawCalls: unknown): RunningToolFact[] {
  if (!Array.isArray(rawCalls)) return [];
  const out: RunningToolFact[] = [];
  for (const call of rawCalls) {
    if (!call || typeof call !== 'object') continue;
    const raw = call as Record<string, unknown>;
    const name = str(raw.name);
    if (!name) continue;
    out.push({
      name,
      phase: str(raw.phase),
      argsRaw: str(raw.rawArguments) || str(raw.argsRaw),
      turn: num(raw.turn),
      step: num(raw.step),
      time: num(raw.time),
      subCalls: Array.isArray(raw.subCalls) ? raw.subCalls.length : undefined,
    });
  }
  return out;
}

/** `legacy.partial` 的最后一块 → 她正在产出什么。 */
export function toStreamKind(partial: unknown): StreamKind | null {
  if (!partial || typeof partial !== 'object') return null;
  const blocks = (partial as Record<string, unknown>).blocks;
  if (!Array.isArray(blocks) || !blocks.length) return null;
  const last = blocks[blocks.length - 1];
  if (!last || typeof last !== 'object') return null;
  const kind = str((last as Record<string, unknown>).kind);
  if (kind === 'reasoning') return 'reasoning';
  if (kind === 'text') return 'text';
  if (kind === 'tool-call') return 'tool-call';
  return 'other';
}

export function usePetStatus(props: DockSeatProps): PetStatus {
  const useSession: SnapshotHook<typeof NO_SESSION> = props.useSession || useNoSession;
  const useStatus: SnapshotHook<Map<string, unknown>> = props.useSessionStatus || useNoStatus;
  const useChat: SnapshotHook<typeof NO_CHAT> = props.useChat || useNoChat;
  const sessionId = props.sessionId;

  const busy = useSession((s) =>
    s.running || (s.pendingSubmissions ? s.pendingSubmissions.length > 0 : false)
  );
  const queued = useSession((s) => (Array.isArray(s.pendingSubmissions) ? s.pendingSubmissions.length : 0));
  const errored = useSession((s) =>
    s.openState === 'error' || s.lastAgentError != null || s.promptError != null
  );
  // 取的是**实例本身**（引用稳定），字段在下面用形状守卫读。
  const pendingInteraction = useStatus((map) => {
    if (sessionId === undefined) return null;
    const entry = map.get(sessionId) as { pendingInteraction?: unknown } | undefined;
    return entry ? entry.pendingInteraction || null : null;
  });
  const unread = useStatus((map) => {
    if (sessionId === undefined) return false;
    const entry = map.get(sessionId) as { completionUnread?: boolean } | undefined;
    return entry ? !!entry.completionUnread : false;
  });

  // 这三样都取自 store 自己的子对象：store 只在内容变化时换引用，所以选择器稳定。
  const rawCalls = useChat((s) => (s && s.legacy ? s.legacy.runningCalls : null));
  const partial = useChat((s) => (s && s.legacy ? s.legacy.partial : null));

  const tools = toRunningTools(rawCalls);
  const stream = toStreamKind(partial);
  const pending = toPendingFact(pendingInteraction);
  const toolName = (tools.find((t) => t.phase !== 'preparing') || tools[0] || null)?.name || null;

  // ── 边沿检测 ──
  // 只在"签名变了"的那一次渲染里更新：React 的严格模式会双跑渲染，若每次都重置，
  // 第二次跑会把刚检测到的事件抹掉。
  const edge: FactEdge = {
    running: busy,
    errored,
    pending: pending ? pending.kind : null,
    queued,
    tools: tools.length,
  };
  const edgeKey = `${edge.running}|${edge.errored}|${edge.pending}|${edge.queued}|${edge.tools}`;
  const prevEdgeRef = React.useRef<FactEdge | null>(null);
  const prevEdgeKeyRef = React.useRef<string | null>(null);
  const eventsRef = React.useRef<readonly string[]>([]);
  const eventSeqRef = React.useRef(0);
  if (prevEdgeKeyRef.current !== edgeKey) {
    const detected = detectEdges(prevEdgeRef.current, edge);
    prevEdgeRef.current = edge;
    prevEdgeKeyRef.current = edgeKey;
    if (detected.length) {
      eventsRef.current = detected;
      eventSeqRef.current += 1;
    }
  }

  const active = busy || pending !== null;
  const [sleeping, setSleep] = React.useState(false);
  React.useEffect(() => {
    if (active) { setSleep(false); return; }
    const id = setTimeout(() => setSleep(true), TUNING.sleepAfterMs);
    return () => clearTimeout(id);
  }, [active]);

  // 一个正在跑的工具过了 slowToolMs 就把状态从"在干活"翻成"等太久了"。这是一次
  // 性定时器（到点后 delay ≤ 0 会自行停止武装），所以只多一次重渲染。
  const firstTime = tools.length === 1 ? tools[0].time : undefined;
  const [, setSlowTick] = React.useState(0);
  React.useEffect(() => {
    if (!busy || typeof firstTime !== 'number') return;
    const delay = TUNING.slowToolMs - (Date.now() - firstTime);
    if (delay <= 0) return;
    const id = setTimeout(() => setSlowTick((n) => n + 1), delay + 30);
    return () => clearTimeout(id);
  }, [busy, firstTime]);

  return {
    facts: {
      ...emptyFacts(Date.now()),
      enabled: TUNING.reactToStatus,
      pending,
      running: busy,
      errored,
      unread,
      tools,
      stream,
      queued,
      idleMs: sleeping ? TUNING.sleepAfterMs : 0,
    },
    toolName,
    events: eventsRef.current,
    eventSeq: eventSeqRef.current,
  };
}

// Re-export for the view's convenience.
export type { PetFacts } from '../behavior/facts.ts';
export type { Reaction } from '../behavior/vocabulary.ts';
