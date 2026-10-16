// The animation-rotation policy: which animation plays, and for how many
// cycles it is held before the player rolls the next one.
//
// A state carries 1–64 animations and the player used to re-roll one on EVERY
// cycle.  A cycle is short (1.2–3.4 s), so a many-animation state — idle has
// 61 — changed activity every couple of seconds, which read as frantic
// switching.  An animation is therefore HELD for a minimum number of full plays
// before the next roll, with up to `jitter` extra plays so the rhythm is not
// metronomic.
//
// A state CHANGE bypasses the hold entirely.  The re-roll NEVER picks the
// animation it is leaving behind.
//
// Pure — no DOM, no React, and `random` is injectable — so the policy is
// verifiable in node directly.

/** Where the rotation currently stands. */
export interface AnimationRotation {
  /** Index into the state's animation list. */
  index: number;
  /** Full plays this animation still owes, NOT counting the one in flight. */
  playsRemaining: number;
}

/** The hold policy, measured in whole plays of one animation. */
export interface AnimationPolicy {
  /** An animation plays at least this many times before the next roll. */
  minPlays: number;
  /** Up to this many extra plays, chosen at random (0 = fixed rhythm). */
  jitter: number;
}

/** An animation index in [0, count).  Never `except` while there is a choice,
 *  so a re-roll always shows a different animation. */
export function rollAnimation(count: number, except: number, random: () => number = Math.random): number {
  if (count <= 1) return 0;
  const drawn = Math.floor(random() * count) % count;
  let index = drawn < 0 ? 0 : drawn;
  if (index === except) index = (index + 1) % count;
  return index;
}

/** How many times a freshly rolled animation plays: `minPlays` plus 0–`jitter`. */
export function playsFor(policy: AnimationPolicy, random: () => number = Math.random): number {
  const extra = policy.jitter > 0 ? Math.floor(random() * (policy.jitter + 1)) : 0;
  return Math.max(1, Math.floor(policy.minPlays) + extra);
}

/** Begin an animation — a state change, or the very first tick.  `except` is
 *  the animation being left behind (−1 = none). */
export function startAnimation(
  count: number,
  policy: AnimationPolicy,
  except = -1,
  random: () => number = Math.random,
): AnimationRotation {
  return { index: rollAnimation(count, except, random), playsRemaining: playsFor(policy, random) - 1 };
}

/** The cycle wrapped: hold the animation while it owes plays, then roll a new
 *  one — never the one just played. */
export function advanceAnimation(
  rotation: AnimationRotation,
  count: number,
  policy: AnimationPolicy,
  random: () => number = Math.random,
): AnimationRotation {
  if (rotation.playsRemaining > 0) {
    return { index: rotation.index, playsRemaining: rotation.playsRemaining - 1 };
  }
  return startAnimation(count, policy, rotation.index, random);
}
