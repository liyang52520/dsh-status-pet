// The take-rotation policy: which animation take plays, and for how many
// cycles it is held before the player rolls the next one.
//
// A state carries 1–64 takes and the player used to re-roll one on EVERY
// animation cycle.  A cycle is short (1.2–3.4 s of artwork), so a many-take
// state — idle has 61 — changed activity every couple of seconds, which read
// as frantic switching rather than a pet doing something for a while.  A take
// is therefore HELD for a minimum number of full plays (`TUNING.takeMinPlays`,
// plus up to `TUNING.takePlayJitter` extra so the rhythm is not metronomic)
// before the next roll.
//
// A state change bypasses the hold completely: the new state's artwork starts
// at once (loop.ts owns the dwell rule that decides whether the playback PHASE
// restarts on a flapping state).
//
// Pure — no DOM, no React, and `random` is injectable — so the policy is
// verifiable in node directly.

/** Where the rotation currently stands. */
export interface TakeRotation {
  /** Index into the state's takes. */
  index: number;
  /** Full plays this take still owes, NOT counting the one in flight. */
  playsLeft: number;
}

/** The hold policy, measured in whole plays of one take. */
export interface TakePolicy {
  /** A take plays at least this many times before the next roll. */
  minPlays: number;
  /** Up to this many extra plays, chosen at random (0 = fixed rhythm). */
  jitter: number;
}

/** A take index in [0, count).  Never `except` while there is a choice, so a
 * re-roll always shows a different take instead of re-dealing the same one. */
export function rollTake(count: number, except: number, random: () => number = Math.random): number {
  if (count <= 1) return 0;
  const drawn = Math.floor(random() * count) % count;
  let index = drawn < 0 ? 0 : drawn;
  if (index === except) index = (index + 1) % count;
  return index;
}

/** How many times a freshly rolled take plays: `minPlays` plus 0–`jitter`. */
export function playsFor(policy: TakePolicy, random: () => number = Math.random): number {
  const extra = policy.jitter > 0 ? Math.floor(random() * (policy.jitter + 1)) : 0;
  return Math.max(1, Math.floor(policy.minPlays) + extra);
}

/** Begin a take — a state change, or the very first tick.  `except` is the
 * take being left behind (‑1 = none), so a state change never re-deals it. */
export function startTake(
  count: number,
  policy: TakePolicy,
  except = -1,
  random: () => number = Math.random,
): TakeRotation {
  return { index: rollTake(count, except, random), playsLeft: playsFor(policy, random) - 1 };
}

/** The cycle wrapped: hold the take while it owes plays, then roll a new one
 * — never the one just played. */
export function advanceTake(
  rotation: TakeRotation,
  count: number,
  policy: TakePolicy,
  random: () => number = Math.random,
): TakeRotation {
  if (rotation.playsLeft > 0) return { index: rotation.index, playsLeft: rotation.playsLeft - 1 };
  return startTake(count, policy, rotation.index, random);
}
