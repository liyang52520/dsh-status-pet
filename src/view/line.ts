// 台词的那一拍：把**话语引擎**（behavior/discourse.ts，纯函数）接上 React 的计时器。
//
// 引擎负责"说什么"（记忆、顿挫、填充、事件、话题、心情），这里只负责"什么时候推进"：
// 一条到期 → 把 tick 推一格 → effect 重跑 → 由引擎决定下一句并武装下一个计时器。
//
// 事件（事实边沿 / 界面边沿）用**序号**消费：同一个序号只喂给引擎一次，否则一次
// "你排队了"会在后续每一拍里被反复当成新事件（那会让事件池刷屏）。
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
  /** 当前目标（话题边沿用）。 */
  topic?: Topic;
  /** 轮次（话题计数用）。 */
  turn?: number;
  /** 刚发生的边沿事件。 */
  events?: readonly string[];
  /** 事件的序号：**变了才当成新事件**。 */
  eventSeq?: string | number;
  running?: boolean;
  errored?: boolean;
  /** false = 设置里关掉了：不抽、不渲染、不计时。 */
  active?: boolean;
}

/** 当前该显示哪一条台词的 id；无可显示时为 null。 文案由调用方用 `t(id)` 取。 */
export function useLine(input: UseLineInput): string | null {
  const reducedRef = useReducedMotion();
  const active = input.active !== false;
  const { state, tone, topic, turn, running, errored } = input;
  const factsKey = input.key;

  const discourseRef = React.useRef<DiscourseState | null>(null);
  const lastRef = React.useRef(0);
  const consumedRef = React.useRef<string | number | undefined>(undefined);
  const [id, setId] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);

  // 事件只在序号变化的那一拍喂给引擎。
  const isFresh = input.eventSeq !== undefined && input.eventSeq !== consumedRef.current;
  const events = isFresh ? input.events || [] : [];

  // effect 的依赖：状态、事实、事件序号（含"这一拍"）。 关掉时归零，不留计时器。
  const key = active ? [state, factsKey, String(input.eventSeq ?? '')].join('\u0000') : '';
  const turnMs = turn;

  React.useEffect(() => {
    if (!active) {
      discourseRef.current = null;
      setId(null);
      return;
    }
    if (isFresh) consumedRef.current = input.eventSeq;
    const now = Date.now();
    const prev = discourseRef.current;
    const next = stepDiscourse(prev, {
      state,
      key: factsKey,
      tone: tone || null,
      topic,
      turn: turnMs,
      events,
      running,
      errored,
      elapsedMs: prev ? now - lastRef.current : 0,
      reducedMotion: reducedRef.current,
    });
    discourseRef.current = next;
    lastRef.current = now;
    setId(next.id);
    if (reducedRef.current || !next.id) return;
    const timer = setTimeout(() => setTick((n) => n + 1), Math.max(200, next.remainingMs));
    return () => clearTimeout(timer);
  }, [key, tone, tick, active, state, factsKey, events, isFresh, input.eventSeq, turnMs, running, errored, topic, reducedRef]);

  return id;
}
