// The discourse engine, driven with a seeded random source — the point of the
// injectable `random`/`tables` parameters, used for real.

import test from 'node:test';
import assert from 'node:assert/strict';

import { stepDiscourse, topicEdge, moodTone, emptyDiscourse } from '../src/behavior/discourse.ts';
import type { DiscourseState, DiscourseTables } from '../src/behavior/discourse.ts';
import { BRIDGE_SPECS, CONTINUERS, EVENTS, LINE_SPECS, TOPICS } from '../src/behavior/line-pools.ts';
import { STATE_NAMES } from '../src/behavior/vocabulary.ts';
import { TUNING } from '../src/behavior/tuning.ts';

/** Deterministic PRNG: every property below is reproducible. */
function seeded(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TABLES: DiscourseTables = {
  pools: LINE_SPECS, bridges: BRIDGE_SPECS, continuers: CONTINUERS, events: EVENTS, topics: TOPICS,
};

/** Advance the engine, yielding only the beats where the spoken line CHANGES. */
function beats(state: string, opts: { tone?: string | null; running?: boolean; draws?: number; tables?: DiscourseTables; key?: string } = {}) {
  const random = seeded(7);
  let s: DiscourseState | null = null;
  let prev: string | null | undefined;
  const out: string[] = [];
  const draws = opts.draws ?? 4000;
  for (let i = 0; i < draws; i++) {
    s = stepDiscourse(s, {
      state: state as never,
      key: opts.key ?? 'k',
      tone: (opts.tone ?? null) as never,
      // A full dwell: every draw advances the conversation, so the number of
      // beats equals the number of draws (the dwell itself is tested separately).
      elapsedMs: 60_000,
      running: opts.running ?? true,
    }, random, opts.tables ?? TABLES);
    if (s.id !== prev) { out.push(s.id as string); prev = s.id; }
  }
  return { ids: out, last: s! };
}

test('there is never a blank beat, in any state', () => {
  for (const state of STATE_NAMES) {
    const { ids } = beats(state, { draws: 600 });
    assert.ok(ids.length > 50, `${state} produced only ${ids.length} beats`);
    for (const id of ids) assert.ok(id && id.length > 0, `${state} produced an empty line id`);
  }
});

test('every drawn line comes from a pool the engine was given', () => {
  const known = new Set<string>();
  for (const pool of Object.values(LINE_SPECS)) for (const l of pool) known.add(l.id);
  for (const pool of Object.values(BRIDGE_SPECS)) for (const l of pool) known.add(l.id);
  for (const pool of Object.values(EVENTS)) for (const l of pool) known.add(l.id);
  for (const pool of Object.values(TOPICS)) for (const l of pool) known.add(l.id);
  for (const l of CONTINUERS) known.add(l.id);
  for (const state of STATE_NAMES) {
    for (const id of beats(state, { draws: 400 }).ids) {
      assert.ok(known.has(id), `${state} drew ${id}, which is in no pool`);
    }
  }
});

test('the recency window really keeps a pool larger than the window from repeating', () => {
  // A synthetic pool of 40 same-tone lines: no tone/mood subset can narrow it, and
  // no murmur or topic pool exists, so this isolates the window itself.
  const pool = Array.from({ length: 40 }, (_, i) => ({ id: `synth.${i}`, tone: 'calm' as const }));
  const tables: DiscourseTables = {
    pools: { idle: pool }, bridges: {}, continuers: [], events: {}, topics: {},
  };
  const random = seeded(21);
  let s: DiscourseState | null = null;
  let prev: string | null | undefined;
  const ids: string[] = [];
  for (let i = 0; i < 3000; i++) {
    s = stepDiscourse(s, { state: 'idle', key: 'k', elapsedMs: 60_000, running: false }, random, tables);
    if (s.id !== prev) { ids.push(s.id as string); prev = s.id; }
  }
  const last = new Map<string, number>();
  let worst = Number.POSITIVE_INFINITY;
  ids.forEach((id, i) => { if (last.has(id)) worst = Math.min(worst, i - last.get(id)!); last.set(id, i); });
  assert.ok(ids.length > 1000, `expected a long run, got ${ids.length}`);
  assert.ok(worst >= TUNING.lineRecentWindow, `a repeat came after only ${worst} beats`);
});

test('a tone-narrowed real pool cycles through every line before reusing one', () => {
  // The 24-line window can only be promised while the tone/mood subset is at least
  // that large; when it is smaller the shuffle-bag must still cover the whole subset
  // before repeating.
  //
  // The measurement is exact only for a subset with NO sequence members: a sequence
  // draws its `at+1` directly (that is the point of a sequence) and so is exempt from
  // the window, which makes mid-sequence lines legitimately reachable a little sooner.
  // Those subsets get the weaker "never twice in a row" bound instead.
  for (const [state, tone] of [['petted', 'worry'], ['slow', 'worry'], ['multi', 'bright'], ['approval', 'calm']] as const) {
    const lines = LINE_SPECS[state].filter((l) => l.tone === tone);
    const sequenced = lines.some((l) => l.group !== undefined);
    const subset = new Set(lines.map((l) => l.id));
    assert.ok(subset.size > 0 && subset.size < TUNING.lineRecentWindow,
      `${state}/${tone} is not a narrowed pool (${subset.size})`);
    const ids = beats(state, { tone, draws: 4000 }).ids.filter((id) => subset.has(id));
    const last = new Map<string, number>();
    let worst = Number.POSITIVE_INFINITY;
    ids.forEach((id, i) => { if (last.has(id)) worst = Math.min(worst, i - last.get(id)!); last.set(id, i); });
    assert.ok(ids.length > 200, `${state}/${tone}: only ${ids.length} draws`);
    const bound = sequenced ? 2 : subset.size;
    assert.ok(worst >= bound,
      `${state}/${tone} reused a line after ${worst} draws (bound ${bound}, subset ${subset.size}${sequenced ? ', has sequences' : ''})`);
  }
});

test('a sequence is continued to its end before anything else is drawn', () => {
  // Interjections (a murmur "嗯…", a topic remark) are allowed IN the middle —
  // they must not break the sequence memory, so they are ignored here and the
  // state-pool line under them still has to finish the thought.
  const byId = new Map(LINE_SPECS.idle.map((l) => [l.id, l]));
  const { ids } = beats('idle', { draws: 1200 });
  const own = ids.filter((id) => byId.has(id));
  assert.ok(own.length > 100, `only ${own.length} state-pool beats`);
  let complete = 0;
  let started = 0;
  let i = 0;
  while (i < own.length) {
    const line = byId.get(own[i])!;
    if (line.group !== undefined && line.at === 1) {
      started++;
      const of = line.of ?? 1;
      let n = 1;
      while (n < of && i + n < own.length) {
        const member = byId.get(own[i + n])!;
        if (member.group !== line.group || member.at !== n + 1) break;
        n++;
      }
      if (n === of) complete++;
      i += Math.max(1, n);
    } else i++;
  }
  assert.ok(started > 5, `only ${started} sequences started`);
  assert.equal(complete, started, 'every started sequence must be finished');
});

test('a fresh fact edge preempts the state pool', () => {
  const random = seeded(3);
  let s = stepDiscourse(null, { state: 'shell', key: 'k', elapsedMs: 0, running: true }, random);
  s = stepDiscourse(s, { state: 'shell', key: 'k', elapsedMs: 0, running: true, events: ['failed'] }, random);
  assert.equal(s.source && s.source.kind, 'event');
  assert.equal((s.source as { name: string }).name, 'failed');
  // …and it is a one-shot: the next beat goes back to the state pool.
  s = stepDiscourse(s, { state: 'shell', key: 'k', elapsedMs: 99_000, running: true }, random);
  assert.equal(s.source && s.source.kind, 'state');
});

test('events are tried in order, so the caller controls priority', () => {
  const random = seeded(4);
  const s = stepDiscourse(null, {
    state: 'idle', key: 'k', elapsedMs: 0, running: true, events: ['queue', 'firstTool'],
  }, random);
  assert.equal((s.source as { name: string }).name, 'queue');
});

test('a failure raises the mood and a recovery lowers it', () => {
  const random = seeded(5);
  let s = stepDiscourse(null, { state: 'shell', key: 'k', elapsedMs: 0, running: true, events: ['failed'] }, random);
  assert.equal(s.failStreak, 1);
  s = stepDiscourse(s, { state: 'shell', key: 'k', elapsedMs: 0, running: true }, random);
  assert.equal(s.failStreak, 1, 'a beat with no event must not change the streak');
  s = stepDiscourse(s, { state: 'shell', key: 'k', elapsedMs: 0, running: true, events: ['failed'] }, random);
  assert.equal(s.failStreak, 2);
  assert.equal(moodTone(s), 'worry');
  s = stepDiscourse(s, { state: 'shell', key: 'k', elapsedMs: 0, running: true, events: ['cleared'] }, random);
  assert.equal(s.failStreak, 0);
});

test('a state change prefers the bridge written for that transition', () => {
  const random = seeded(6);
  let s = stepDiscourse(null, { state: 'read', key: 'k', elapsedMs: 0, running: true }, random);
  s = stepDiscourse(s, { state: 'write', key: 'k2', elapsedMs: 0, running: true }, random);
  assert.equal(s.source && s.source.kind, 'bridge');
  assert.equal((s.source as { from: string; to: string }).from, 'read');
  assert.equal((s.source as { to: string }).to, 'write');
});

test('reduced motion holds the current line instead of advancing it', () => {
  const random = seeded(8);
  let s = stepDiscourse(null, { state: 'idle', key: 'k', elapsedMs: 0, running: false }, random);
  const first = s.id;
  for (let i = 0; i < 50; i++) {
    s = stepDiscourse(s, { state: 'idle', key: 'k', elapsedMs: 60_000, running: false, reducedMotion: true }, random);
  }
  assert.equal(s.id, first);
});

test('an empty state pool follows idle instead of repeating the previous state', () => {
  const tables: DiscourseTables = {
    pools: { ...LINE_SPECS, idle: LINE_SPECS.idle, sleep: [] },
    bridges: {}, continuers: [], events: {}, topics: {},
  };
  const random = seeded(9);
  let s = stepDiscourse(null, { state: 'idle', key: 'k', elapsedMs: 0, running: false }, random, tables);
  s = stepDiscourse(s, { state: 'sleep', key: 'k2', elapsedMs: 0, running: false }, random, tables);
  assert.ok(s.id && s.id.startsWith('idle.'), `an empty pool must follow idle, got ${s.id}`);
  assert.equal((s.source as { state: string }).state, 'sleep', 'the state itself is still the reason');
});

test('a murmur never breaks the sequence memory it interrupts', () => {
  // A murmur is identified by its ID: the engine deliberately keeps the SOURCE
  // pointing at the thing being talked about, so `source.kind` never says
  // "continuer".
  const continuerIds = new Set(CONTINUERS.map((l) => l.id));
  const random = seeded(10);
  let s: DiscourseState | null = null;
  let murmurs = 0;
  let insideASequence = 0;
  for (let i = 0; i < 600; i++) {
    const beforeGroup: { group: number; at: number } | null = s ? s.group : null;
    const beforeKind: string | null = s && s.source ? s.source.kind : null;
    s = stepDiscourse(s, { state: 'shell', key: 'k', elapsedMs: 60_000, running: true }, random);
    const now: DiscourseState = s;
    if (now.id && continuerIds.has(now.id)) {
      murmurs++;
      if (beforeGroup) {
        // The interjection must leave the "which thought am I in" memory alone.
        assert.deepEqual(now.group, beforeGroup, 'a murmur cleared the sequence memory');
        assert.equal(now.source ? now.source.kind : null, beforeKind,
          'a murmur replaced the thing being talked about');
        insideASequence++;
      }
    }
  }
  assert.ok(murmurs > 3, `expected murmurs between the real sentences, got ${murmurs}`);
  assert.ok(insideASequence > 0, 'no murmur landed inside a sequence, so the property is untested');
});

test('the same seed and the same inputs give the same line', () => {
  const run = () => beats('read', { draws: 200, key: 'k' }).ids.join('|');
  assert.equal(run(), run());
});

test('topicEdge speaks once per change, and topicMany fires at the threshold', () => {
  assert.equal(topicEdge(null, { file: 'a.ts' }, ['a.ts']), 'topicNew');
  const prev = { ...emptyDiscourse(), lastTopicSpoken: 'a.ts' };
  assert.equal(topicEdge(prev, { file: 'a.ts' }, ['a.ts']), null, 'the same target is not announced twice');
  assert.equal(topicEdge(null, { file: 'd.ts' }, ['a.ts', 'b.ts', 'c.ts', 'd.ts']), 'topicMany');
  assert.equal(topicEdge(null, { file: 'a.ts' }, ['a.ts', 'b.ts']), 'topicSame');
  assert.equal(topicEdge(null, {}, ['a.ts']), null, 'no target, no comment');
});

test('the dwell stretches while one state just sits there', () => {
  const random = seeded(11);
  let s = stepDiscourse(null, { state: 'slow', key: 'k', elapsedMs: 0, running: true }, random);
  const first = s.remainingMs;
  for (let i = 0; i < 12; i++) {
    s = stepDiscourse(s, { state: 'slow', key: 'k', elapsedMs: s.remainingMs, running: true }, random);
  }
  assert.ok(s.remainingMs > first, `dwell should stretch, ${first} → ${s.remainingMs}`);
  const ceiling = TUNING.lineDwellMs * TUNING.lineIdleMax + TUNING.lineJitterMs * TUNING.lineIdleMax;
  assert.ok(s.remainingMs <= ceiling, `dwell ${s.remainingMs} exceeds the ceiling ${ceiling}`);
});
