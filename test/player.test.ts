// The playback policy: `stepPlayback` (src/player/timeline.ts) and the rotation
// policy (src/player/rotation.ts).  Both are pure and DOM-free, so they are
// driven here by hand with a fake clock and hand-built animations.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createPlayback, stepPlayback } from '../src/player/timeline.ts';
import type { PlaybackState, TickInput } from '../src/player/timeline.ts';
import { advanceAnimation, playsFor, rollAnimation, startAnimation } from '../src/player/rotation.ts';
import type { AnimationPolicy, AnimationRotation } from '../src/player/rotation.ts';
import { cycleMsOf } from '../src/skin/resolve.ts';
import type { ResolvedAnimation, ResolvedFrame } from '../src/skin/resolve.ts';
import type { Sprite } from '../src/skin/model.ts';

// A sprite is only ever handed back to a canvas; the reducer never reads it.
const SPRITE = { w: 1, h: 1, px: new Uint8Array(1), dx: 0, dy: 0 } as unknown as Sprite;

function frame(ms: number): ResolvedFrame {
  return { ms, sprite: SPRITE, dx: 0, dy: 0 };
}

function anim(msList: number[], id?: string): ResolvedAnimation {
  return { id, frames: msList.map(frame) };
}

/** A policy that re-rolls on every cycle, so a single-animation state is fully
 *  deterministic even though `stepPlayback` uses the real `Math.random`. */
const ONE_PLAY: AnimationPolicy = { minPlays: 1, jitter: 0 };

function tick(p: PlaybackState, over: Partial<TickInput> = {}) {
  return stepPlayback(
    {
      now: 0,
      state: 'idle',
      animations: [anim([100, 200, 300])],
      minDwellMs: 150,
      reduced: false,
      policy: ONE_PLAY,
      ...over,
    },
    p,
  );
}

test('stepPlayback: elapsed ms walks the frames (half-open [start, end) windows)', () => {
  const a = anim([100, 200, 300]);
  const p = createPlayback(0);
  const at = (now: number) => tick(p, { now, animations: [a] }).frame;

  assert.equal(at(0), a.frames[0]);
  assert.equal(at(99), a.frames[0]);
  assert.equal(at(100), a.frames[1], 'a frame boundary belongs to the NEXT frame');
  assert.equal(at(299), a.frames[1]);
  assert.equal(at(300), a.frames[2]);
  assert.equal(at(599), a.frames[2]);
});

test('stepPlayback: a state change restarts the cycle only after minDwellMs', () => {
  const a = anim([400, 400]); // one animation ⇒ the rotation index is not random
  const p = createPlayback(0);

  assert.equal(tick(p, { now: 0, state: 'idle', animations: [a] }).cycleStart, 0);

  // A flap INSIDE the dwell keeps the phase: cycleStart does not move.
  const flapped = tick(p, { now: 100, state: 'think', animations: [a] });
  assert.equal(flapped.cycleStart, 0);
  assert.equal(flapped.frame, a.frames[0]);
  assert.equal(p.cycleStart, 0);
  assert.equal(p.stateName, 'think', 'the state itself is adopted immediately');

  const flappedAgain = tick(p, { now: 200, state: 'stream', animations: [a] });
  assert.equal(flappedAgain.cycleStart, 0);

  // Past the dwell the cycle restarts from this instant.
  const settled = tick(p, { now: 500, state: 'done', animations: [a] });
  assert.equal(settled.cycleStart, 500);
  assert.equal(settled.frame, a.frames[0]);
  assert.equal(p.cycleStart, 500);
});

test('stepPlayback: the first tick is a state change from nowhere', () => {
  const p = createPlayback(1234);
  assert.equal(p.stateName, '');
  assert.equal(p.cycleStart, 1234);
  // `stateSince` starts at -Infinity, so the very first tick always restarts.
  const first = tick(p, { now: 5000, state: 'idle', animations: [anim([400, 400])] });
  assert.equal(first.cycleStart, 5000);
});

test('stepPlayback: wrapping a cycle advances the rotation and restarts at now', () => {
  const a = anim([100, 100, 100]); // 300 ms per play
  const p = createPlayback(0);
  tick(p, { now: 0, animations: [a] });
  assert.equal(p.rotation.playsRemaining, 0);

  const wrapped = tick(p, { now: 300, animations: [a] });
  assert.equal(wrapped.cycleStart, 300);
  assert.equal(wrapped.frame, a.frames[0]);
  assert.equal(wrapped.animationIndex, 0, 'one animation ⇒ always index 0');
});

test('stepPlayback: a mirror returns the leader index/phase and mutates nothing', () => {
  const leader = anim([100, 200]);
  const local = [anim([50]), anim([50]), anim([50])];
  const p = createPlayback(0);
  p.stateName = 'idle';
  p.stateSince = 0;
  p.rotation = { index: 0, playsRemaining: 7 };
  const snapshot = { stateName: p.stateName, cycleStart: p.cycleStart, rotation: { ...p.rotation } };

  const mirrored = tick(p, {
    now: 120,
    state: 'whatever',
    animations: local,
    mirror: { animationIndex: 1, cycleStart: 100 },
  });
  assert.equal(mirrored.animationIndex, 1);
  assert.equal(mirrored.cycleStart, 100, "the follower adopts the leader's cycleStart");
  assert.equal(mirrored.frame, local[1].frames[0], 'elapsed = now − leaderCycleStart');

  // Nothing local moved — not the state, not the phase, not the rotation.
  assert.equal(p.stateName, snapshot.stateName);
  assert.equal(p.cycleStart, snapshot.cycleStart);
  assert.deepEqual(p.rotation, snapshot.rotation);

  // Elapsed is wrapped into the leader's cycle.
  const wrapped = tick(p, { now: 350, animations: local, mirror: { animationIndex: 0, cycleStart: 0 } });
  assert.equal(wrapped.animationIndex, 0);
  assert.equal(wrapped.frame, local[0].frames[0], '350 % 300 = 50 ms into the leader animation');

  // A negative leader index is folded into range, not clamped.
  const negative = tick(p, { now: 10, animations: local, mirror: { animationIndex: -1, cycleStart: 0 } });
  assert.equal(negative.animationIndex, 2);
});

test('stepPlayback: reduced motion always draws the first frame', () => {
  const a = anim([100, 200, 300]);

  const frozen = createPlayback(0);
  tick(frozen, { now: 0, animations: [a], reduced: true });
  const later = tick(frozen, { now: 250, animations: [a], reduced: true });
  assert.equal(later.frame, a.frames[0]);

  const moving = createPlayback(0);
  tick(moving, { now: 0, animations: [a], reduced: false });
  assert.equal(tick(moving, { now: 250, animations: [a], reduced: false }).frame, a.frames[1]);

  // Even a mirror obeys it.
  const mirrored = tick(moving, {
    now: 250,
    animations: [a],
    reduced: true,
    mirror: { animationIndex: 0, cycleStart: 0 },
  });
  assert.equal(mirrored.frame, a.frames[0]);
});

test('cycleMsOf: returns the summed frame durations and memoizes them', () => {
  const a = anim([120, 380]);
  assert.equal(a.totalMs, undefined);
  assert.equal(cycleMsOf(a), 500);
  assert.equal(a.totalMs, 500, 'the sum is cached on the animation');
  assert.equal(cycleMsOf(a), 500);

  // A pre-computed total wins over the (deliberately wrong) frame list.
  const preset: ResolvedAnimation = { frames: [frame(10)], totalMs: 999 };
  assert.equal(cycleMsOf(preset), 999);
  assert.equal(cycleMsOf(preset), 999);
});

// ── rotation ──

function rotation(index: number, playsRemaining: number): AnimationRotation {
  return { index, playsRemaining };
}

test('rollAnimation: never draws the animation it is leaving (when there is a choice)', () => {
  for (const count of [2, 3, 7]) {
    for (let except = 0; except < count; except++) {
      const index = rollAnimation(count, except, () => 0);
      assert.notEqual(index, except, `count=${count} except=${except}`);
      assert.ok(index >= 0 && index < count);
    }
  }
  // count 1 has no choice: it repeats, and that is not a violation.
  assert.equal(rollAnimation(1, 0, () => 0), 0);
});

test('startAnimation / advanceAnimation never re-roll what they leave behind', () => {
  for (let i = 0; i < 3; i++) {
    const started = startAnimation(3, ONE_PLAY, i, () => 0);
    assert.notEqual(started.index, i);
    assert.ok(started.index >= 0 && started.index < 3);

    const advanced = advanceAnimation(rotation(i, 0), 3, ONE_PLAY, () => 0);
    assert.notEqual(advanced.index, i);
    assert.ok(advanced.index >= 0 && advanced.index < 3);
  }
});

test('playsFor: minPlays is a floor and jitter is the inclusive extra', () => {
  assert.equal(playsFor({ minPlays: 3, jitter: 0 }, () => 0), 3);
  assert.equal(playsFor({ minPlays: 3, jitter: 2 }, () => 0), 3);
  assert.equal(playsFor({ minPlays: 3, jitter: 2 }, () => 0.5), 4);
  assert.equal(playsFor({ minPlays: 3, jitter: 2 }, () => 0.999999), 5);
  assert.equal(playsFor({ minPlays: 0, jitter: 0 }, () => 0), 1, 'at least one play');

  for (let r = 0; r < 1; r += 0.05) {
    const plays = playsFor({ minPlays: 3, jitter: 2 }, () => r);
    assert.ok(plays >= 3 && plays <= 5, `r=${r} → ${plays}`);
  }
});

test('a held animation keeps its index while it still owes plays', () => {
  const held = rotation(2, 2);
  const policy: AnimationPolicy = { minPlays: 1, jitter: 0 };

  const first = advanceAnimation(held, 3, policy, () => 0);
  assert.deepEqual(first, { index: 2, playsRemaining: 1 });
  const second = advanceAnimation(first, 3, policy, () => 0);
  assert.deepEqual(second, { index: 2, playsRemaining: 0 });
  // Out of owed plays → a fresh roll, and never the one just played.
  const third = advanceAnimation(second, 3, policy, () => 0);
  assert.notEqual(third.index, 2);

  // Pure: the input rotation is untouched.
  assert.deepEqual(held, { index: 2, playsRemaining: 2 });
});
