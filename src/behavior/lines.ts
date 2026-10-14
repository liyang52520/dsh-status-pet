// 台词的**池**这一层：状态 → 一串台词，音区 → 收窄候选。
//
// V3 起，"什么时候说哪一句"全部搬去了 behavior/discourse.ts（话语引擎：记忆、顿挫、
// 填充、事件、话题、心情）。这里只剩**数据访问**——池在哪、怎么按音区过滤。
// 分开的好处：引擎可以拿合成表在 node 里测，不依赖任何一条真实文案。
//
//   LINE_POOLS   每个状态的台词池（由 behavior/line-pools.ts 的生成数据推导）
//   poolFor()    任意状态实际会用的池：空池跟随 idle
//   bridgeFor()  状态切换时的接话池（`from>to`），没有就直接说新状态的台词
//   candidates() 音区收窄后的候选；该音区一条都没有就退回整池

import { BRIDGE_SPECS, LINE_SPECS } from './line-pools.ts';
import type { PoolLine } from './line-pools.ts';
import { TUNING } from './tuning.ts';
import type { StateName, Tone } from './vocabulary.ts';

/** 池里的一条：id 是翻译字典的键（`approval.07`），tone 是它的音区，
 *  可选的 group/at 表示它属于某一组序列。 */
export type LineSpec = PoolLine;

/** 每个状态的台词池。 顺序即轮换顺序（先 calm，再 bright/busy/formal/worry）。 */
export const LINE_POOLS: Record<StateName, readonly LineSpec[]> = LINE_SPECS;

/** 全部桥接池的键（`from>to`）。 供测试与工作台展示。 */
export const BRIDGE_KEYS: readonly string[] = Object.keys(BRIDGE_SPECS);

/** 一个状态实际会用的池。 空池跟随 idle —— 与动作分配同一条规矩。 */
export function poolFor(name: StateName): readonly LineSpec[] {
  const own = LINE_POOLS[name];
  return own && own.length ? own : LINE_POOLS.idle;
}

/** 从 `from` 切到 `to` 时的接话池；没有写这个转移就返回 null。 */
export function bridgeFor(from: StateName | null | undefined, to: StateName): readonly LineSpec[] | null {
  if (!from || from === to) return null;
  const hit = BRIDGE_SPECS[from + '>' + to];
  return hit && hit.length ? hit : null;
}

/** 音区收窄后的候选。 该音区一条都没有 → 退回整池（永不因为滤镜而空手）。 */
export function candidates(pool: readonly LineSpec[], tone?: Tone | null): readonly LineSpec[] {
  if (!tone) return pool;
  const hit = pool.filter((spec) => spec.tone === tone);
  return hit.length ? hit : pool;
}
