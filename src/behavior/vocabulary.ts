// The pet's vocabulary: what a state IS, and the two extra names the artwork
// can carry for user interactions.
//
// The system declares only the names and the seat accent.  Motion is artwork —
// every animation is authored data (see skin/catalog.ts), and what a user owns
// is WHICH of a skin's own actions each state plays.

/** The nine states the pet can be in.  Keys of `STATES`; returned by deriveState. */
export type PetState =
  | 'idle' | 'sleep' | 'think' | 'stream' | 'tool'
  | 'approval' | 'question' | 'error' | 'done';

/** Transient user-interaction states.  Keys of `REACTIONS`. */
export type Reaction = 'petted' | 'woken';

/** Every name a skin can carry artwork for: the nine states plus the two
 *  reactions.  A skin's `idle` is mandatory; every other name falls back to it. */
export type StateName = PetState | Reaction;

export const STATE_NAMES: readonly StateName[] = [
  'idle', 'sleep', 'think', 'stream', 'tool',
  'approval', 'question', 'error', 'done',
  'petted', 'woken',
];

export const PET_STATES: readonly PetState[] = [
  'idle', 'sleep', 'think', 'stream', 'tool',
  'approval', 'question', 'error', 'done',
];

export const REACTION_NAMES: readonly Reaction[] = ['petted', 'woken'];

/** What the system still declares about a state: only the seat accent.
 *  `pill` is the dock pill's extra CSS class (leading space) — a status accent
 *  on the seat, not the pet's body language (that is the artwork's job). */
export interface StateSpec {
  pill?: string;
}

export const STATES: Record<PetState, StateSpec> = {
  idle:     {},
  sleep:    {},
  think:    {},
  stream:   {},
  tool:     {},
  approval: { pill: ' attention' },
  question: { pill: ' attention' },
  error:    { pill: ' error' },
  done:     {},
};

/** Reactions are states for artwork purposes (a skin can carry frames for
 *  them); the system only owns how long the override lasts. */
export const REACTIONS: Record<Reaction, { durationMs: number }> = {
  petted: { durationMs: 900 },
  woken:  { durationMs: 1200 },
};

export function isStateName(name: string): name is StateName {
  return (STATE_NAMES as readonly string[]).includes(name);
}
