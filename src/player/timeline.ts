// The tick reducer: elapsed wall-clock time → which frame to draw.
//
// This is the heart of the player, pulled out of the rAF callback and written
// as a pure function over a mutable `Playback` state.  It is DOM-free and
// canvas-free, so it can be unit-tested with a hand-driven clock.
//
//   stepPlayback()   call every tick — returns the frame to draw and advances
//                     the playback state in place
//
// A STATE CHANGE starts a new rotation immediately, the dwell rule lets a
// flapping state (think/stream/tool) keep its phase, and on every cycle wrap
// the rotation holds or re-rolls the current animation per the policy.

import type { AnimationPolicy, AnimationRotation } from './rotation.ts';
import { advanceAnimation, startAnimation } from './rotation.ts';
import type { ResolvedAnimation, ResolvedFrame } from '../skin/resolve.ts';

function cycleMs(animation: ResolvedAnimation): number {
  return animation.frames.reduce((sum, frame) => sum + frame.ms, 0);
}

export interface PlaybackState {
  stateName: string;
  /** When the current state was first seen. */
  stateSince: number;
  /** When the current play-through began. */
  cycleStart: number;
  rotation: AnimationRotation;
}

export function createPlayback(now: number): PlaybackState {
  return {
    stateName: '',
    stateSince: Number.NEGATIVE_INFINITY,
    cycleStart: now,
    rotation: { index: 0, playsRemaining: 0 },
  };
}

export interface TickInput {
  now: number;
  /** The state being played (a state or reaction name). */
  state: string;
  /** The animations of that state — never empty (the idle fallback is the
   *  caller's business). */
  animations: ResolvedAnimation[];
  minDwellMs: number;
  reduced: boolean;
  policy: AnimationPolicy;
  /** A follower may mirror the leader's animation and phase instead of rolling
   *  its own.  null means "play freely". */
  mirror?: { animationIndex: number; cycleStart: number } | null;
}

export interface TickResult {
  frame: ResolvedFrame;
  /** The index of the animation being played (0-based, into `animations`). */
  animationIndex: number;
  /** The wall-clock instant the current play-through started. */
  cycleStart: number;
}

/** Advance the playhead by one tick.  Mutates `p` and returns what to draw. */
export function stepPlayback(input: TickInput, p: PlaybackState): TickResult {
  const { now, state, animations, minDwellMs, reduced, policy, mirror } = input;

  // ── mirror the leader ──
  if (mirror) {
    const index = ((mirror.animationIndex % animations.length) + animations.length) % animations.length;
    const animation = animations[index];
    let elapsed = now - mirror.cycleStart;
    const total = cycleMs(animation);
    if (total > 0 && elapsed >= total) elapsed %= total;
    return { frame: frameAt(animation, elapsed, reduced), animationIndex: index, cycleStart: mirror.cycleStart };
  }

  // ── state change ──
  if (state !== p.stateName) {
    const dwell = now - p.stateSince;
    p.stateName = state;
    p.stateSince = now;
    if (dwell >= minDwellMs) {
      p.cycleStart = now;
      p.rotation = startAnimation(animations.length, policy);
    } else if (p.rotation.index >= animations.length) {
      p.rotation = startAnimation(animations.length, policy);
    }
  }

  // ── cycle wrap → hold or re-roll ──
  let animationIndex = p.rotation.index;
  let animation = animations[animationIndex % animations.length];
  let elapsed = now - p.cycleStart;

  if (elapsed >= cycleMs(animation)) {
    p.cycleStart = now;
    p.rotation = advanceAnimation(p.rotation, animations.length, policy);
    animationIndex = p.rotation.index;
    animation = animations[animationIndex % animations.length];
    elapsed = 0;
  }

  const total = cycleMs(animation);
  if (total > 0 && elapsed >= total) elapsed %= total;

  return {
    frame: frameAt(animation, elapsed, reduced),
    animationIndex,
    cycleStart: p.cycleStart,
  };
}

/** Walk `elapsed` ms through an animation's frames and return the one whose
 *  duration window contains it.  Reduced motion always returns the first frame. */
function frameAt(animation: ResolvedAnimation, elapsed: number, reduced: boolean): ResolvedFrame {
  if (reduced || animation.frames.length === 0) return animation.frames[0];
  let remaining = elapsed;
  for (let i = 0; i < animation.frames.length; i++) {
    if (remaining < animation.frames[i].ms) return animation.frames[i];
    remaining -= animation.frames[i].ms;
  }
  return animation.frames[animation.frames.length - 1];
}