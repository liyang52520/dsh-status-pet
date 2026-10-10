// Behavior — the pet's state machine and its daily-rhythm knobs.
//
//   TUNING          rhythm knobs (sleep timeout)
//   derivePetState  the state machine: session facts → one of nine states
//   STATES          the state registry (vocabulary + seat accent)
//   REACTIONS       transient user-interaction states (petted, woken)
//
// Motion is NOT here: since skins are frame animations authored per state
// (multi-take, multi-frame, per-frame dx/dy), all movement is artwork.
// A state entry only declares `pill`, the dock seat's accent class.
//
// All of it is pure data and pure functions: no DOM, no React, so the test
// suite drives it directly in node.
//
// TUNING is deliberately NOT a Cordis `Config`: a bundle can only declare
// `Config` when its build bundles `@deepseek-ai/schemastery`, and that
// package ships no client artifact (`dsh.client` / client.js), so a loader
// plugin cannot require it.  Editing here, or promoting these to Config
// behind a heavier build, are the two options.
export const TUNING = {
  reactToStatus: true, // false renders a purely decorative pet
  sleepAfterMs: 60000, // how long after the last activity the pet falls asleep
  // Below this dwell, a state change switches the ARTWORK but keeps the playback
  // phase: `think`/`stream`/`tool` can flap while a tool's arguments stream in,
  // and restarting the cycle at frame 0 on every flap made the pet twitch (only
  // the first frame ever played) instead of animate.
  stateMinDwellMs: 150,
  // How long ONE take is held before the player rolls the state's next
  // animation.  A take is a whole loop of artwork (1.2–3.4 s), and a many-take
  // state (idle carries 61) re-rolled every cycle changed activity every couple
  // of seconds — frantic.  A take now plays at least `takeMinPlays` times, plus
  // up to `takePlayJitter` extra so the rhythm is not metronomic.  A state
  // CHANGE ignores the hold: the new state's take starts immediately.
  takeMinPlays: 3,
  takePlayJitter: 2,
} as const;

/** Everything the state machine is allowed to know about the session. */
export interface PetFacts {
  enabled?: boolean;
  pending: string | null;
  running: boolean;
  errored: boolean;
  unread: boolean;
  activity: 'tool' | 'stream' | null;
  /** Synthetic: `0` while awake, `sleepAfterMs` once the sleep timer fired —
   * it is a boundary, not a clock (`ui/hooks.ts` owns the one timeout). */
  idleMs: number;
}

/** The states derivePetState can return — keys of STATES. */
export type PetState =
  | 'idle' | 'sleep' | 'think' | 'stream' | 'tool'
  | 'approval' | 'question' | 'error' | 'done';

/** Transient user-interaction states — keys of REACTIONS. */
export type ReactionName = 'petted' | 'woken';

/** Every name a skin can carry artwork for: the nine states plus the two
 * reactions.  The skin's `idle` state is mandatory; the rest fall back to
 * it.  This is the editor's navigation list and the validator's allowlist. */
export const STATE_NAMES: readonly (PetState | ReactionName)[] = [
  'idle', 'sleep', 'think', 'stream', 'tool',
  'approval', 'question', 'error', 'done',
  'petted', 'woken',
];

// A pure fold over the observable session facts, so the priority order is
// verifiable without a browser.  Highest priority first: what the user owes
// the agent, then what the agent is doing, then the outcome.
export function derivePetState(f: PetFacts): PetState {
  if (f.enabled === false) return 'idle';
  if (f.pending === 'approval') return 'approval';
  if (f.pending === 'question') return 'question';
  if (f.running) {
    if (f.activity === 'tool') return 'tool';
    if (f.activity === 'stream') return 'stream';
    return 'think';
  }
  if (f.errored) return 'error';
  if (f.unread) return 'done';
  if (f.idleMs >= TUNING.sleepAfterMs) return 'sleep';
  return 'idle';
}

/** What the system still declares about a state: only the seat accent.
 * `pill` is the dock pill's extra CSS class (leading space) — a status
 * accent on the seat, not the pet's body language (that is the artwork's
 * job now). */
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

// Reactions are states for artwork purposes (a skin can carry frames for
// them); the system only owns how long the override lasts.
export const REACTIONS: Record<ReactionName, { durationMs: number }> = {
  petted: { durationMs: 900 },
  woken:  { durationMs: 1200 },
};
