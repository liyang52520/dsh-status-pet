// The frame player end to end: the REAL loop.ts driven with a stubbed canvas,
// a stubbed rAF and a hand-driven clock, against a small synthetic skin.  The
// pure rotation policy has its own suite (take-rotation.test.ts); what is
// checked here is the wiring — a stable state HOLDS its take for at least
// TUNING.takeMinPlays plays, a state change switches the artwork on the spot,
// and a rolled take starts on its own first frame.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── the canvas / rAF stubs ──
// draw() is the fallback when there is no DOM canvas (sprite-cache returns
// null), so the ctx stub is the window onto what the player painted.

const FRAME_MS = 500;
const FRAMES = 4;

let painted: number | null = null; // palette index of the frame's single pixel
let lastPainted: number | null = null; // what is on the canvas (a redraw may be skipped)

const ctxStub: any = {
  imageSmoothingEnabled: false,
  fillStyle: '',
  clearRect() {
    painted = null;
  },
  fillRect() {
    const value = PALETTE.indexOf(ctxStub.fillStyle);
    assert.ok(value > 0, 'the frame painted a palette colour');
    if (painted === null) painted = value;
  },
  drawImage() {
    throw new Error('no DOM canvas in this test: drawImage must not be reachable');
  },
};

let pendingFrame: ((now: number) => void) | null = null;
(globalThis as any).requestAnimationFrame = (cb: (now: number) => void) => {
  pendingFrame = cb;
  return 1;
};
(globalThis as any).cancelAnimationFrame = () => {
  pendingFrame = null;
};

// ── a synthetic skin ──
// One painted pixel per frame, carrying `1 + 4 × takeId + frame`, so a tick's
// single fillRect names the exact take and frame that played.  Idle takes are
// numbered 0…, tool takes 16…, so the two states are never confusable.

const PALETTE = ['transparent', ...Array.from({ length: 128 }, (_, i) => `#c${String(i + 1).padStart(3, '0')}`)];
const TAKES = new Map<number, { state: string; index: number }>();

function makeTake(base: number, index: number, state: string, frameMs = FRAME_MS) {
  const id = base + index;
  TAKES.set(id, { state, index });
  return {
    frameMs,
    frames: Array.from({ length: FRAMES }, (_, frame) => ({
      ms: frameMs,
      sprite: { w: 1, h: 1, px: new Uint8Array([1 + id * FRAMES + frame]), dx: 0, dy: 0 },
    })),
  };
}

function makeSkin(idleTakes: number, toolTakes: number, frameMs = FRAME_MS): any {
  return {
    name: 'test',
    palette: PALETTE,
    grid: 32,
    canvasW: 40,
    canvasH: 40,
    baseY: 4,
    states: {
      idle: { takes: Array.from({ length: idleTakes }, (_, i) => makeTake(0, i, 'idle', frameMs)) },
      tool: { takes: Array.from({ length: toolTakes }, (_, i) => makeTake(16, i, 'tool', frameMs)) },
    },
  };
}

const { startLoop } = await import('../src/renderer/loop.ts');
const { TUNING } = await import('../src/pet/behavior.ts');

const T0 = 5000;
const at = (tick: number) => T0 + tick * FRAME_MS;

function decode(value: number) {
  const take = ((value - 1) / FRAMES) | 0;
  const where = TAKES.get(take);
  assert.ok(where, `take ${take} is one of the skin's`);
  return { take, frame: (value - 1) % FRAMES, state: where!.state, index: where!.index };
}

/** A running player on `skin`, following `state`. */
function player(skin: any, state: string, pin?: { current: number }) {
  const canvas: any = { width: 0, height: 0, style: {}, getContext: () => ctxStub };
  const faceRef = { current: state };
  const stop = startLoop(canvas as HTMLCanvasElement, faceRef, { current: false }, () => 1, { current: skin }, pin ?? null);
  return {
    faceRef,
    stop,
    /** One animation tick: the frame now on the canvas (a dirty-check skip
     * means the previous frame is still there). */
    step(now: number) {
      const cb = pendingFrame;
      assert.ok(cb, 'the shared ticker is running');
      pendingFrame = null;
      painted = null;
      cb(now);
      if (painted !== null) lastPainted = painted;
      assert.ok(lastPainted !== null, 'the tick painted a frame');
      return decode(lastPainted as number);
    },
  };
}

/** Whole cycles from an aligned (frame 0) tick: one play each. */
function plays(p: ReturnType<typeof player>, fromTick: number, count: number) {
  const out: Array<{ take: number; state: string }> = [];
  for (let j = 0; j < count; j++) {
    const first = p.step(at(fromTick + j * FRAMES));
    assert.equal(first.frame, 0, 'a play starts on the take\'s first frame');
    for (let f = 1; f < FRAMES; f++) {
      const next = p.step(at(fromTick + j * FRAMES + f));
      assert.equal(next.take, first.take, 'a cycle stays inside one take');
      assert.equal(next.frame, f, 'frames advance in order');
    }
    out.push({ take: first.take, state: first.state });
  }
  return out;
}

/** Group consecutive plays into "how many times each take played". */
function runsOf(sequence: Array<{ take: number }>) {
  const runs: Array<{ take: number; plays: number }> = [];
  for (const play of sequence) {
    const last = runs[runs.length - 1];
    if (last && last.take === play.take) last.plays += 1;
    else runs.push({ take: play.take, plays: 1 });
  }
  return runs;
}

test('the old per-cycle switching is gone: a take plays several cycles in a row', () => {
  const p = player(makeSkin(6, 4), 'idle');
  try {
    const played = plays(p, 0, 12);
    assert.equal(played[1].take, played[0].take, 'cycle 2 is still the first take');
    assert.equal(played[2].take, played[0].take, 'and so is cycle 3');
    assert.ok(played.every((x) => x.state === 'idle'));
  } finally {
    p.stop();
  }
});

test('every take is held for its minimum, up to the jitter, and never re-dealt', () => {
  const p = player(makeSkin(6, 4), 'idle');
  try {
    const runs = runsOf(plays(p, 0, 30)).slice(0, -1); // drop the truncated run
    assert.ok(runs.length > 2, 'takes do rotate');
    for (const run of runs) {
      assert.ok(run.plays >= TUNING.takeMinPlays,
        `take ${run.take} played ${run.plays} times, below the minimum`);
      assert.ok(run.plays <= TUNING.takeMinPlays + TUNING.takePlayJitter,
        `take ${run.take} played ${run.plays} times, above the maximum`);
    }
    for (let i = 1; i < runs.length; i++) {
      assert.notEqual(runs[i].take, runs[i - 1].take, 'a re-roll never re-deals the same take');
    }
  } finally {
    p.stop();
  }
});

test('a state change switches the artwork on the spot, then holds the new take', () => {
  const p = player(makeSkin(6, 4), 'idle');
  try {
    const before = plays(p, 0, 10);
    const left = before[before.length - 1];
    p.faceRef.current = 'tool';
    // The very next tick is the switch, and plays() starts a cycle on it.
    // 14 plays is at least ⌈14 / (min + jitter)⌉ complete holds whatever the jitter rolls.
    const after = plays(p, 10 * FRAMES, 14);
    assert.equal(after[0].state, 'tool', 'the state changed on the spot');
    assert.notEqual(after[0].take, left.take, 'and not into the take it was in the middle of');

    const runs = runsOf(after).slice(0, -1);
    assert.ok(runs.length > 1, 'the tool state rotates its takes too');
    for (const run of runs) {
      assert.ok(run.plays >= TUNING.takeMinPlays,
        `take ${run.take} played ${run.plays} times after the switch`);
    }
  } finally {
    p.stop();
  }
});

test('rapid flapping switches the artwork at once but never restarts the phase', () => {
  const FRAME = 100; // a 400 ms cycle, so frames turn over while we flap
  const p = player(makeSkin(4, 4, FRAME), 'idle');
  try {
    const t0 = at(0);
    const start = p.step(t0);
    assert.equal(start.state, 'idle');
    assert.equal(start.frame, 0);

    // think → tool → think …, every state shorter than TUNING.stateMinDwellMs.
    let previous = start;
    for (let ms = 50; ms <= 350; ms += 50) {
      const state = ms % 100 === 0 ? 'idle' : 'tool';
      p.faceRef.current = state;
      const tick = p.step(t0 + ms);
      assert.equal(tick.state, state, 'the artwork switches on the spot');
      assert.equal(tick.index, previous.index, 'the take slot is kept across a flap');
      assert.equal(tick.frame, Math.floor(ms / FRAME),
        'the frame follows the shared clock — a restart would show frame 0 every time');
      previous = tick;
    }
  } finally {
    p.stop();
  }
});

test('a state that outlives the dwell restarts the cycle', () => {
  const FRAME = 100;
  const p = player(makeSkin(4, 4, FRAME), 'idle');
  try {
    const t0 = at(0);
    assert.equal(p.step(t0).frame, 0);
    assert.equal(p.step(t0 + 100).frame, 1);
    assert.equal(p.step(t0 + 200).frame, 2);
    // 'idle' has now lasted 200 ms ≥ stateMinDwellMs, so the change starts a new
    // cycle at frame 0 (without the restart the shared clock would be at 2).
    p.faceRef.current = 'tool';
    assert.equal(p.step(t0 + 250).frame, 0, 'the new state starts at its first frame');
    assert.equal(p.step(t0 + 300).frame, 0);
    assert.equal(p.step(t0 + 350).frame, 1, 'and advances from there');
  } finally {
    p.stop();
  }
});

test('a pinned take (the editor preview) ignores the rotation', () => {
  const p = player(makeSkin(6, 4), 'idle', { current: 3 });
  try {
    for (let tick = 0; tick < 30; tick++) {
      assert.equal(p.step(at(tick)).take, 3, 'the pinned take never rotates away');
    }
  } finally {
    p.stop();
  }
});
