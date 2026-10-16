// The line box's scroll policy (src/view/line-scroll.ts): whether to scroll and
// how long one pass takes.  Deliberately no DOM — only the pure exports are
// imported here (the React hook is never called).

import test from 'node:test';
import assert from 'node:assert/strict';

import { planScroll, samePlan, cssShiftPx, SCROLL } from '../src/view/line-scroll.ts';

test('planScroll: content that fits does not scroll', () => {
  const fits = planScroll(40, 66, false);
  assert.equal(fits.scrolling, false);
  assert.equal(fits.shiftPx, 0);
  assert.equal(fits.cycleMs, 0);
  assert.equal(fits.overflowPx, 0);
  assert.equal(fits.contentPx, 40);
  assert.equal(fits.boxPx, 66);
});

test('planScroll: the slop band is not an overflow, just past it is', () => {
  // `overflow <= SCROLL.slopPx` still counts as "fits" (sub-pixel font noise).
  const onTheEdge = planScroll(66 + SCROLL.slopPx, 66, false);
  assert.equal(onTheEdge.scrolling, false);

  const over = planScroll(66 + SCROLL.slopPx + 0.5, 66, false);
  assert.equal(over.scrolling, true);
  assert.equal(over.shiftPx, -(SCROLL.slopPx + 0.5));
  assert.ok(over.cycleMs > 0);
  assert.equal(over.overflowPx, SCROLL.slopPx + 0.5);
});

test('planScroll: the cycle is clamped to [minCycleMs, maxCycleMs]', () => {
  // A tiny overflow would be a blink — clamped up.
  assert.equal(planScroll(68, 66, false).cycleMs, SCROLL.minCycleMs);
  // A huge one would never be waited out — clamped down.
  assert.equal(planScroll(66 + 2000, 66, false).cycleMs, SCROLL.maxCycleMs);
  const mid = planScroll(200, 66, false);
  assert.ok(mid.cycleMs > SCROLL.minCycleMs && mid.cycleMs < SCROLL.maxCycleMs);
});

test('planScroll: the cycle length is derived from the 12%/12% hold', () => {
  assert.equal(SCROLL.holdPct, 12);
  assert.equal(SCROLL.holdPct * 2, 24);
  // platform/theme.ts keys the same pair: 0%,12% … 88%,100%.
  const overflow = 200;
  const travelMs = (overflow / SCROLL.speedPxPerSec) * 1000;
  const expected = Math.round((travelMs * 100) / (100 - 2 * SCROLL.holdPct));
  assert.ok(
    expected > SCROLL.minCycleMs && expected < SCROLL.maxCycleMs,
    'the fixture must land inside the clamp, or it pins nothing',
  );
  assert.equal(planScroll(overflow + 66, 66, false).cycleMs, expected);
});

test('planScroll: non-finite and negative measurements do not throw and stay still', () => {
  const cases: ReadonlyArray<readonly [number, number]> = [
    [NaN, 100],
    [Infinity, 100],
    [-Infinity, 100],
    [-5, 100],
    [100, NaN],
    [100, Infinity],
    [100, -1],
    [100, 0],
    [NaN, NaN],
  ];
  for (const [content, box] of cases) {
    const plan = planScroll(content, box, false);
    assert.equal(plan.scrolling, false, `content=${content} box=${box}`);
    assert.equal(plan.shiftPx, 0, `content=${content} box=${box}`);
    assert.equal(plan.cycleMs, 0, `content=${content} box=${box}`);
    // Non-finite is folded to 0 by `num()`; a finite negative is kept as measured.
    assert.ok(Number.isFinite(plan.contentPx) && Number.isFinite(plan.boxPx));
  }
  assert.equal(planScroll(NaN, 100, false).contentPx, 0);
  assert.equal(planScroll(-5, 100, false).contentPx, -5);
});

test('planScroll: reduced motion never scrolls', () => {
  const moving = planScroll(2000, 20, false);
  assert.equal(moving.scrolling, true);

  const frozen = planScroll(2000, 20, true);
  assert.equal(frozen.scrolling, false);
  assert.equal(frozen.shiftPx, 0);
  assert.equal(frozen.cycleMs, 0);
  // The measurement is still reported — only the action is withheld.
  assert.equal(frozen.contentPx, 2000);
  assert.equal(frozen.boxPx, 20);
});

test('spec pin: while scrolling, shiftPx is exactly what the CSS expression computes', () => {
  for (const content of [0, 20, 40, 66, 67, 68, 100, 200, 500, 2000]) {
    for (const box of [0, 1, 20, 48, 66, 100]) {
      const plan = planScroll(content, box, false);
      assert.ok(plan.shiftPx <= 0, `content=${content} box=${box}`);
      if (plan.scrolling) {
        assert.equal(plan.shiftPx, cssShiftPx(content, box), `content=${content} box=${box}`);
      } else {
        assert.equal(plan.shiftPx, 0, `content=${content} box=${box}`);
      }
    }
  }
});

test('spec pin: the only place the two differ is the slop band, where nothing scrolls', () => {
  // Inside the slop band (0 < overflow <= 1) the plan deliberately stays at 0 while
  // `cssShiftPx` still reports the negative layout delta.  That is honest: when
  // `scrolling` is false no transform is applied at all, so 0 is the rendered truth
  // and `cssShiftPx` only describes the scrolling keyframe.
  const plan = planScroll(67, 66, false);
  assert.equal(plan.scrolling, false);
  assert.equal(plan.shiftPx, 0);
  assert.equal(cssShiftPx(67, 66), -1);

  // …but once it DOES scroll the two are pixel-identical, sub-pixel overflow
  // included (the old version rounded to whole pixels and drifted up to 0.5px).
  const fractional = planScroll(100.6, 20, false);
  assert.equal(fractional.scrolling, true);
  assert.equal(fractional.shiftPx, -80.6);
  assert.equal(cssShiftPx(100.6, 20), -80.6);
});

test('samePlan: equal plans compare equal, every differing field does not', () => {
  const a = planScroll(200, 66, false);
  assert.equal(samePlan(null, a), false, 'a missing previous plan is never "the same"');
  assert.equal(samePlan(a, planScroll(200, 66, false)), true);
  assert.equal(samePlan(planScroll(40, 66, false), planScroll(40, 66, false)), true);

  assert.equal(samePlan(a, { ...a, scrolling: false }), false);
  assert.equal(samePlan(a, { ...a, cycleMs: a.cycleMs + 1 }), false);
  assert.equal(samePlan(a, { ...a, shiftPx: a.shiftPx - 1 }), false);
  assert.equal(samePlan(a, { ...a, contentPx: a.contentPx + 1 }), false);
  assert.equal(samePlan(a, { ...a, boxPx: a.boxPx + 1 }), false);
  assert.equal(samePlan(a, planScroll(201, 66, false)), false);

  // `overflowPx` is measured but is NOT part of the identity: it is implied by
  // (contentPx, boxPx) for every scrolling plan, and irrelevant when still.
  assert.equal(samePlan(a, { ...a, overflowPx: a.overflowPx + 99 }), true);
});
