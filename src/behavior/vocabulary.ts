// The pet's vocabulary: what a state IS, and the two extra names the artwork
// can carry for user interactions.
//
// The system declares only the names and the seat accent.  Motion is artwork —
// every animation is authored data (see skin/catalog.ts), and what a user owns
// is WHICH of a skin's own actions each state plays.
//
// V2 widened this from 9 states to 22.  The rule for adding one stays the same:
// **a state must be backed by a signal that actually exists** (see
// behavior/facts.ts; the old rationale doc docs/context-states-v2.md §2 is deleted).
// A state without a real signal is a state that will never be reached — decoration,
// not behaviour.

/** The 22 states the pet can be in.  Keys of `STATES`; returned by deriveState. */
export type PetState =
  // 待命
  | 'idle' | 'sleep'
  // 想
  | 'think' | 'reasoning' | 'preparing' | 'stream'
  // 做（按工作的性质分家）
  | 'shell' | 'read' | 'search' | 'write' | 'web'
  | 'agent' | 'plan' | 'deliver' | 'tool'
  // 做（按当下的处境：等太久 / 同时几件）
  | 'slow' | 'multi'
  // 等你
  | 'approval' | 'question' | 'planReview'
  // 结果
  | 'error' | 'done';

/** Transient user-interaction states.  Keys of `REACTIONS`. */
export type Reaction = 'petted' | 'woken';

/** Every name a skin can carry artwork for: the 22 states plus the two
 *  reactions.  A skin's `idle` is mandatory; every other name falls back to it. */
export type StateName = PetState | Reaction;

export const STATE_NAMES: readonly StateName[] = [
  'idle', 'sleep',
  'think', 'reasoning', 'preparing', 'stream',
  'shell', 'read', 'search', 'write', 'web',
  'agent', 'plan', 'deliver', 'tool',
  'slow', 'multi',
  'approval', 'question', 'planReview',
  'error', 'done',
  'petted', 'woken',
];

export const PET_STATES: readonly PetState[] = [
  'idle', 'sleep',
  'think', 'reasoning', 'preparing', 'stream',
  'shell', 'read', 'search', 'write', 'web',
  'agent', 'plan', 'deliver', 'tool',
  'slow', 'multi',
  'approval', 'question', 'planReview',
  'error', 'done',
];

export const REACTION_NAMES: readonly Reaction[] = ['petted', 'woken'];

/** What the system still declares about a state: only the seat accent.
 *  `pill` is the dock pill's extra CSS class (leading space) — a status accent
 *  on the seat, not the pet's body language (that is the artwork's job). */
export interface StateSpec {
  pill?: string;
}

export const STATES: Record<PetState, StateSpec> = {
  idle: {},
  sleep: {},
  think: {},
  reasoning: {},
  preparing: {},
  stream: {},
  shell: {},
  read: {},
  search: {},
  write: {},
  web: {},
  agent: {},
  plan: {},
  deliver: {},
  tool: {},
  slow: {},
  multi: {},
  // 等你：三件都是"你欠她一个回答"，所以都要在座位上显眼。
  approval: { pill: ' attention' },
  question: { pill: ' attention' },
  planReview: { pill: ' attention' },
  error: { pill: ' error' },
  done: {},
};

/** Reactions are states for artwork purposes (a skin can carry frames for
 *  them); the system only owns how long the override lasts. */
export const REACTIONS: Record<Reaction, { durationMs: number }> = {
  petted: { durationMs: 900 },
  woken: { durationMs: 1200 },
};

export function isStateName(name: string): name is StateName {
  return (STATE_NAMES as readonly string[]).includes(name);
}

export function isPetState(name: string): name is PetState {
  return (PET_STATES as readonly string[]).includes(name);
}

// ── 台词的音区 ──
//
// 一条台词属于哪一路口气，一个动作也属于哪一路口气（skin/tones.ts）。台词池按
// 正在播的动作音区收窄候选 —— 于是「换个动作，说话的口气也跟着变」，而事实仍
// 由状态行保证。五个音区是刻意少的：多了就变成又一个需要维护的分配面。

/** 台词（与动作）的音区。 */
export type Tone = 'calm' | 'bright' | 'busy' | 'formal' | 'worry';

export const TONES: readonly Tone[] = ['calm', 'bright', 'busy', 'formal', 'worry'];

export function isTone(value: string): value is Tone {
  return (TONES as readonly string[]).includes(value);
}
