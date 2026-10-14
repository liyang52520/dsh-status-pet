// The pet's rhythm knobs.  One flat object, no persistence and no Config: a
// loader plugin can only declare a Cordis `Config` when its build bundles
// `@deepseek-ai/schemastery`, which ships no client artifact, so these stay
// compile-time constants by necessity — and they are all the tuning there is.

export const TUNING = {
  /** false renders a purely decorative pet (the state machine short-circuits). */
  reactToStatus: true,
  /** How long after the last activity the pet falls asleep. */
  sleepAfterMs: 60_000,
  /**
   * Below this dwell, a state change switches the ARTWORK but keeps the
   * playback phase.  `think` / `stream` / `tool` flap while a tool call's
   * arguments stream in, and restarting the cycle at frame 0 on every flap
   * played only the first frame — a twitch instead of an animation.
   */
  stateMinDwellMs: 150,
  /**
   * How many whole plays of one animation are held before the player rolls the
   * state's next one.  A many-action state (idle carries 61) re-rolled every
   * cycle changed activity every couple of seconds; a hold makes it read as a
   * pet doing something for a while.  A state CHANGE ignores the hold.
   */
  minPlays: 3,
  /** Up to this many extra plays, drawn at random, so the rhythm is not metronomic. */
  playJitter: 2,
} as const;
