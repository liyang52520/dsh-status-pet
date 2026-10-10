// The take-rotation policy, driven directly (the module is pure and takes an
// injectable random, so no canvas and no browser are needed).  What has to
// hold: a take is HELD for its minimum number of plays, a re-roll never
// re-deals the same take, and a state change starts the new take at once.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING } from '../src/pet/behavior.ts';
import {
  advanceTake,
  playsFor,
  rollTake,
  startTake,
} from '../src/renderer/take-rotation.ts';
import type { TakePolicy } from '../src/renderer/take-rotation.ts';

// A seeded generator, so every assertion is reproducible.  Never returns 1.
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POLICY: TakePolicy = { minPlays: TUNING.takeMinPlays, jitter: TUNING.takePlayJitter };

/** How many full plays the take returned by startTake gets before the roll. */
function playsUntilRoll(count: number, policy: TakePolicy, random: () => number): number {
  let rot = startTake(count, policy, -1, random);
  const first = rot.index;
  let plays = 1;
  while (plays <= 100) {
    const next = advanceTake(rot, count, policy, random);
    if (next.index !== first) return plays;
    assert.equal(next.playsLeft, rot.playsLeft - 1, 'a held take only counts down');
    rot = next;
    plays += 1;
  }
  throw new Error('the take never rolled');
}

test('rollTake stays in range and never re-deals the take it is replacing', () => {
  const random = seeded(7);
  for (const count of [2, 3, 5, 61]) {
    for (let i = 0; i < 500; i++) {
      const except = Math.floor(random() * count);
      const idx = rollTake(count, except, random);
      assert.ok(idx >= 0 && idx < count, `${idx} is a take of ${count}`);
      assert.notEqual(idx, except, 'a single take state aside, the roll moves on');
    }
  }
});

test('a one-take state is not a special case: index 0, always', () => {
  const random = seeded(3);
  assert.equal(rollTake(1, -1, random), 0);
  assert.equal(rollTake(1, 0, random), 0);
  assert.equal(rollTake(0, 0, random), 0);
});

test('playsFor holds the minimum, plus up to the jitter', () => {
  const random = seeded(11);
  assert.equal(playsFor({ minPlays: 3, jitter: 0 }, random), 3);
  const seen = new Set<number>();
  for (let i = 0; i < 400; i++) seen.add(playsFor(POLICY, random));
  assert.deepEqual([...seen].sort((a, b) => a - b),
    [TUNING.takeMinPlays, TUNING.takeMinPlays + 1, TUNING.takeMinPlays + TUNING.takePlayJitter]);
  // A degenerate policy still plays the take once.
  assert.equal(playsFor({ minPlays: 0, jitter: 0 }, random), 1);
});

test('a take is held for at least takeMinPlays before the next one is rolled', () => {
  const random = seeded(23);
  for (const count of [2, 3, 61]) {
    for (let i = 0; i < 40; i++) {
      const plays = playsUntilRoll(count, POLICY, random);
      assert.ok(plays >= TUNING.takeMinPlays && plays <= TUNING.takeMinPlays + TUNING.takePlayJitter,
        `${plays} plays for one take of ${count}`);
    }
  }
});

test('the hold is exact when the jitter is off', () => {
  const random = seeded(31);
  for (let i = 0; i < 50; i++) {
    assert.equal(playsUntilRoll(61, { minPlays: 4, jitter: 0 }, random), 4);
  }
});

test('every re-roll moves to a different take', () => {
  const random = seeded(41);
  // One play per take, so every wrap is a roll and the rule is visible.
  const quick: TakePolicy = { minPlays: 1, jitter: 0 };
  let rot = startTake(61, quick, -1, random);
  for (let i = 0; i < 5000; i++) {
    const next = advanceTake(rot, 61, quick, random);
    assert.notEqual(next.index, rot.index, 'a roll never re-deals the take it replaces');
    rot = next;
  }
});

test('a state change starts the new state\'s take from cycle one', () => {
  const random = seeded(53);
  // Half-way through a held idle take…
  let rot = startTake(61, POLICY, -1, random);
  rot = advanceTake(rot, 61, POLICY, random);
  // …a state change bypasses the hold: a full quota, and not the take we left.
  const fresh = startTake(4, POLICY, rot.index, random);
  assert.notEqual(fresh.index, rot.index);
  assert.ok(fresh.index < 4);
  assert.ok(fresh.playsLeft >= TUNING.takeMinPlays - 1
    && fresh.playsLeft <= TUNING.takeMinPlays + TUNING.takePlayJitter - 1,
  `${fresh.playsLeft} plays left of the new state's take`);
});

test('a shrunken take list still rolls an in-range take', () => {
  const random = seeded(61);
  // The skin lost takes while playing (the studio deleted one); a roll against
  // the new count is still valid.
  assert.ok(startTake(61, POLICY, -1, random).index < 61);
  assert.ok(startTake(2, POLICY, 0, random).index < 2);
});
