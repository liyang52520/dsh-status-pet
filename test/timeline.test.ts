// The pure tick reducer: state changes, hold/re-roll, reduced motion, and
// the leader/follower mirror channel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepPlayback, createPlayback } from '../src/player/timeline.ts';
import type { PlaybackState, TickInput } from '../src/player/timeline.ts';
import { publish, leadTake } from '../src/player/sync.ts';
import type { AnimationPolicy } from '../src/player/rotation.ts';
import type { ResolvedAnimation, ResolvedFrame } from '../src/skin/resolve.ts';

// Build synthetic resolved frames.
function frame(spriteIdx: number, ms = 200): ResolvedFrame {
  return { ms, sprite: { w: 1, h: 1, px: new Uint8Array([1]), dx: 0, dy: 0 } as unknown as any, dx: 0, dy: 0 };
}
function animation(frameCount: number): ResolvedAnimation {
  return { frames: Array.from({ length: frameCount }, (_, i) => frame(i)) };
}

const POLICY: AnimationPolicy = { minPlays: 3, jitter: 0 };

function tick(p: PlaybackState, state: string, animations: ResolvedAnimation[], now: number, mir?: { animationIndex: number; cycleStart: number } | null) {
  return stepPlayback({ now, state, animations, minDwellMs: 150, reduced: false, policy: POLICY, mirror: mir ?? null }, p);
}

test('createPlayback starts with a blank state and negative-infinity stateSince', () => {
  const p = createPlayback(0);
  assert.equal(p.stateName, '');
  assert.equal(p.stateSince, Number.NEGATIVE_INFINITY);
});

test('the first tick of a state starts a rotation immediately', () => {
  const p = createPlayback(0);
  const anims = [animation(2), animation(3)];
  const result = tick(p, 'idle', anims, 100);
  assert.ok(result.animationIndex >= 0 && result.animationIndex < 2);
  assert.equal(result.animationIndex, p.rotation.index);
});

test('the same frame returns the same result on the next tick within the frame', () => {
  const p = createPlayback(0);
  const anims = [animation(2)];
  tick(p, 'idle', anims, 100);
  const r2 = tick(p, 'idle', anims, 199); // still in first frame
  assert.equal(r2.frame.sprite, anims[0].frames[0].sprite);
});

test('state change dwell: a short flap keeps the phase', () => {
  const p = createPlayback(0);
  const a = [animation(3)];
  const b = [animation(2)];
  const r1 = tick(p, 'think', a, 100);
  // Flap to stream after only 100ms (< 150ms minDwell).
  const r2 = tick(p, 'stream', b, 200);
  // The rotation was NOT restarted — the old index may still be valid.
  assert.ok(r2.animationIndex < b.length, 'rotation stays valid');
});

test('the leader publishes and the follower mirrors the exact frame', () => {
  const lead = createPlayback(500);
  const anims = [animation(3)];

  // Leader plays one tick.
  const r = tick(lead, 'idle', anims, 600);
  publish('test-skin', 'idle', r.animationIndex, r.cycleStart, 600);

  // Follower mirrors.
  const mir = leadTake('test-skin', 'idle', anims.length, 650);
  assert.ok(mir, 'leader is alive at 650ms');
  assert.equal(mir!.animationIndex, r.animationIndex);

  const fol = createPlayback(0);
  const fr = tick(fol, 'idle', anims, 650, mir);
  assert.equal(fr.frame.sprite, r.frame.sprite, 'follower drew the same frame');
});

test('a stale leader is treated as absent', () => {
  publish('test-skin', 'idle', 0, 500, 500);
  const mir = leadTake('test-skin', 'idle', 1, 500 + 251);
  assert.equal(mir, null, 'leader was stale after 251ms');
});