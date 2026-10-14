// Animation rotation: hold policy, re-roll, seeded random.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startAnimation, advanceAnimation, rollAnimation, playsFor } from '../src/player/rotation.ts';
import type { AnimationPolicy } from '../src/player/rotation.ts';

const policy: AnimationPolicy = { minPlays: 2, jitter: 0 };

test('rollAnimation: never picks except when it has a choice', () => {
  // With 3 choices, never the excepted one.
  for (let i = 0; i < 20; i++) assert.notEqual(rollAnimation(3, 0, () => 0), 0);
});

test('rollAnimation: returns 0 when count is 1 regardless of except', () => {
  assert.equal(rollAnimation(1, 0), 0);
  assert.equal(rollAnimation(1, 5), 0);
});

test('playsFor: returns minPlays when jitter is 0', () => {
  assert.equal(playsFor({ minPlays: 3, jitter: 0 }), 3);
  assert.equal(playsFor({ minPlays: 0, jitter: 0 }), 1); // floor at 1
});

test('playsFor: adds jitter', () => {
  const result = playsFor({ minPlays: 3, jitter: 3 }, () => 0.5);
  assert.ok(result >= 3 && result <= 6);
});

test('startAnimation holds for minPlays-1', () => {
  const rotation = startAnimation(4, policy);
  assert.ok(rotation.index >= 0 && rotation.index < 4);
  assert.equal(rotation.playsRemaining, policy.minPlays - 1);
});

test('advanceAnimation holds then rolls a new one', () => {
  // Use a deterministic random that always returns 0 — rollAnimation(3, except, () => 0)
  // with except=0 → returns 1 (since 0 === except → index=1).  So startAnimation
  // returns index 1, then advanceAnimation rolls a new one with except=1:
  // rollAnimation(3, 1, () => 0) → 0 (0 !== 1) → index=0.  Different.
  const deterministic = () => 0;
  // Ensure playsRemaining=0 so advanceAnimation must roll.
  const rotation = startAnimation(3, { minPlays: 0, jitter: 0 }, -1, deterministic);
  const after = advanceAnimation(rotation, 3, { minPlays: 1, jitter: 0 }, deterministic);
  assert.notEqual(after.index, rotation.index, 'never the one just played');
});