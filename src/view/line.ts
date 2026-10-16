// 台词的那一拍：把**话语引擎**（behavior/discourse.ts，纯函数）接上 React 的计时器。
//
// 引擎负责"说什么"（记忆、顿挫、填充、事件、话题、心情），这里只负责"什么时候推进"：
// 一条到期 → 把 tick 推一格 → effect 重跑 → 由引擎决定下一句并武装下一个计时器。
//
// **两种边沿，两个序号。** 事实边沿（排队/批准/出错…）由 seat 检测，界面边沿
// （弹窗开/关）由 dock 检测。 它们必须各带各的序号：合成一个序号的话，"开弹窗"会把
// **上一条事实边沿**一起重新当成新事件喂进去，而 E0 取的是数组里第一个有池的事件 ——
// 于是 popupOpen 永远被 greet 之类压住，而且陈旧的 `failed` 会被反复计进心情。
//
// 事件在 **effect 内部** 消费（不在渲染里算）：渲染可能被 React 严格模式双跑，而
// effect 的第二次执行看到 consumed 已更新，于是同一件事不会被说两遍。
//
// 依赖数组里只有**原始值**（以及按内容派生的 topic 签名、按内容派生的 key），所以
// 只有"事实/事件/状态下真的变了"才推进 —— 一次普通的重渲染不会重跑引擎、也不会把
// 停顿重新计时。
//
// reduced motion 下不武装计时器（引擎也只认状态/事实/事件的边沿）。

import { React } from '../platform/deps.ts';
import { stepDiscourse } from '../behavior/discourse.ts';
import type { DiscourseState, Topic } from '../behavior/discourse.ts';
import type { StateName, Tone } from '../behavior/vocabulary.ts';
import { useReducedMotion } from './reduce-motion.ts';

export interface UseLineInput {
  /** 当前播的状态（反应也算：反应是一个状态）。 */
  state: StateName;
  /** 事实签名（工具名、轮次、目标…）—— 它一变就立即重抽。 */
  key: string;
  /** 正在播的动作音区；null / 省略 = 不筛。 */
  tone?: Tone | null;
  /** 当前目标（话题边沿用）。 只在**内容**变化时重跑（见 `topicSig`）。 */
  topic?: Topic;
  /** 轮次（话题计数用）。 */
  turn?: number;
  /** 刚发生的事实边沿（按重要性排序）。 只在 `eventSeq` 变化的那一拍喂给引擎。 */
  events?: readonly string[];
  /** 事实边沿的序号。 */
  eventSeq?: string | number;
  /** 界面边沿（弹窗开/关）。 **独立序号** —— 否则会被事实边沿压住。 */
  uiEvents?: readonly string[];
  /** 界面边沿的序号。 */
  uiSeq?: number;
  running?: boolean;
  /** false = 设置里关掉了：不抽、不渲染、不计时。 */
  active?: boolean;
}

/** 话题的内容签名。 用它当依赖，而不是对象身份 —— 调用方每次渲染都会新建对象。
 *  "什么都没说" 与 "没有话题" 是同一个签名（都是空串），所以空对象不会让 effect 白跑。 */
export function topicSig(topic: Topic | undefined): string {
  if (!topic) return '';
  const parts = [topic.file || '', topic.cmd || '', topic.pat || '', topic.q || ''];
  return parts.some(Boolean) ? parts.join('\u0000') : '';
}

/** 两条边沿流水线 + 已消费到的位置（纯函数，所以"哪条边沿是新的"可以直接测）。 */
export interface EdgeFeed {
  facts: { events?: readonly string[]; seq?: string | number };
  ui: { events?: readonly string[]; seq?: number };
}
export interface ConsumedEdges {
  facts?: string | number;
  ui?: number;
}

/**
 * 这一拍该喂给引擎的事件（**只含真的新边沿**），以及消费后的位置。
 *
 * 为什么不能把两条边沿拼成一个序号：界面边沿一动，"上一条事实边沿"就会被当成新事件
 * 再喂一次 —— popupOpen 永远被 greet 压住，而陈旧的 `failed` 会被反复计进心情。
 * 事实边沿排在前面：同一拍里两者都新时，先说你刚做的事，再说你点开了她。
 */
export function freshEdges(
  feed: EdgeFeed,
  consumed: ConsumedEdges,
): { events: string[]; consumed: ConsumedEdges } {
  const freshFacts = feed.facts.seq !== undefined && feed.facts.seq !== consumed.facts;
  const freshUi = feed.ui.seq !== undefined && feed.ui.seq !== consumed.ui;
  return {
    events: [
      ...(freshFacts ? feed.facts.events || [] : []),
      ...(freshUi ? feed.ui.events || [] : []),
    ],
    consumed: {
      facts: freshFacts ? feed.facts.seq : consumed.facts,
      ui: freshUi ? feed.ui.seq : consumed.ui,
    },
  };
}

/** 当前该显示哪一条台词的 id（无可显示时为 null）。 */
export function useLine(input: UseLineInput): string | null {
  const reducedRef = useReducedMotion();
  const active = input.active !== false;
  const { state, tone, topic, turn, running } = input;
  const factsKey = input.key;
  const topicKey = topicSig(topic);

  const discourseRef = React.useRef<DiscourseState | null>(null);
  const lastRef = React.useRef(0);
  const consumedFacts = React.useRef<string | number | undefined>(undefined);
  const consumedUi = React.useRef<number | undefined>(undefined);
  const [id, setId] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);

  // 依赖：状态 / 事实签名 / 两种边沿的序号 / 音区 / 停顿那一格。
  const key = active
    ? [state, factsKey, String(input.eventSeq ?? ''), String(input.uiSeq ?? '')].join('\u0000')
    : '';

  React.useEffect(() => {
    if (!active) {
      discourseRef.current = null;
      consumedFacts.current = undefined;
      consumedUi.current = undefined;
      setId(null);
      return;
    }
    // 消费放在 effect 里：严格模式的双跑不会把同一条边沿说两遍。
    const feed = freshEdges(
      {
        facts: { events: input.events, seq: input.eventSeq },
        ui: { events: input.uiEvents, seq: input.uiSeq },
      },
      { facts: consumedFacts.current, ui: consumedUi.current },
    );
    consumedFacts.current = feed.consumed.facts;
    consumedUi.current = feed.consumed.ui;
    const events = feed.events;

    const now = Date.now();
    const prev = discourseRef.current;
    const next = stepDiscourse(prev, {
      state,
      key: factsKey,
      tone: tone || null,
      topic,
      turn,
      events,
      running,
      elapsedMs: prev ? now - lastRef.current : 0,
      reducedMotion: reducedRef.current,
    });
    discourseRef.current = next;
    lastRef.current = now;
    setId(next.id);
    if (reducedRef.current || next.remainingMs <= 0) return;
    const timer = setTimeout(() => setTick((n) => n + 1), Math.max(200, next.remainingMs));
    return () => clearTimeout(timer);
    // 依赖里只有原始值：`input.events` / `input.uiEvents` / `topic` 的身份每次渲染都会
    // 变，但它们只在各自的序号真的前进时才被读到（那时 effect 一定会重跑）。
  }, [key, tick, active, state, factsKey, tone, turn, running, topicKey, input.eventSeq, input.uiSeq, reducedRef]);

  return id;
}
