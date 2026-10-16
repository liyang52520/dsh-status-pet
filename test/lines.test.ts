// The rendering contract: every line must still read when every variable is
// missing.  This is the assertion the deleted `test/lines.test.ts` used to make —
// without it 133 lines had quietly rotted into "把 摊平了看" / "在里找" holes.
//
// The renderer now fills a missing variable with a generic noun (VARS_FALLBACK),
// and the language of that noun is decided by the TEMPLATE (does it contain Han
// characters?), so both halves are pinned here.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VARS_FALLBACK, baseName, clip, dirName, parseArgs, redactSecrets, renderLine,
  secsLabel, shortUrl, varsForFacts, varsFromCall,
} from '../src/behavior/context.ts';
import { freshEdges, topicSig } from '../src/view/line.ts';
import type { ConsumedEdges } from '../src/view/line.ts';
import { emptyFacts } from '../src/behavior/facts.ts';
import { LINES_ZH } from '../src/labels/lines/zh.ts';
import { LINES_EN } from '../src/labels/lines/en.ts';

const HAN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const LOCALES: Array<[string, Record<string, string>]> = [['zh', LINES_ZH], ['en', LINES_EN]];

test('the fallback table covers every variable in both languages', () => {
  const vars = Object.keys(VARS_FALLBACK.zh).sort();
  assert.deepEqual(vars, Object.keys(VARS_FALLBACK.en).sort());
  for (const name of vars) {
    assert.ok(VARS_FALLBACK.zh[name].length > 0, `zh fallback for ${name} is empty`);
    assert.ok(VARS_FALLBACK.en[name].length > 0, `en fallback for ${name} is empty`);
  }
  // The variables the copy actually uses must all be in there.
  for (const [, dict] of LOCALES) {
    for (const text of Object.values(dict)) {
      for (const m of text.matchAll(/\{([a-z]+)\}/g)) {
        assert.ok(VARS_FALLBACK.zh[m[1]], `no zh fallback for {${m[1]}}`);
      }
    }
  }
});

test('a template is classified as zh/en by its own script, never mis-detected', () => {
  for (const [, dict] of LOCALES) {
    for (const [id, text] of Object.entries(dict)) {
      if (!/\{[a-z]+\}/.test(text)) continue;
      const isZh = HAN.test(text);
      assert.equal(isZh, dict === LINES_ZH, `${id} would be classified wrong: ${text}`);
    }
  }
});

test('every line still stands with every variable empty', () => {
  const broken: string[] = [];
  for (const [locale, dict] of LOCALES) {
    for (const [id, text] of Object.entries(dict)) {
      const out = renderLine(text, {});
      if (out.includes('{')) broken.push(`${locale} ${id}: unsubstituted placeholder in "${out}"`);
      if (/[（(「【]\s*[)）】」]/.test(out)) broken.push(`${locale} ${id}: empty bracket in "${out}"`);
      if (!out.trim()) broken.push(`${locale} ${id}: collapsed to nothing`);
      // A line that NAMED something must still be a sentence once the name is
      // missing.  (Continuers are single-syllable murmurs by design — exempt.)
      if (/\{[a-z]+\}/.test(text) && out.trim().length < 3) {
        broken.push(`${locale} ${id}: collapsed to "${out}"`);
      }
    }
  }
  assert.deepEqual(broken, []);
});

test('the historical holes are gone', () => {
  assert.equal(renderLine('在{file}里找{pat}', {}), '在这个文件里找这个线索');
  assert.equal(renderLine('把 {file} 摊平了看', {}), '把 这个文件 摊平了看');
  assert.equal(renderLine('已把 {task} 交给 {agent}', {}), '已把 这桩活 交给 队友');
  assert.equal(renderLine('攒到{n}条就熟了', {}), '攒到几条就熟了');
  assert.equal(renderLine('Smoothing {file} flat', {}), 'Smoothing this file flat');
});

test('a present variable always wins over the fallback', () => {
  assert.equal(renderLine('翻开{file}慢慢看', { file: 'a.ts' }), '翻开a.ts慢慢看');
  assert.equal(renderLine('翻开{file}慢慢看', { file: '' }), '翻开这个文件慢慢看');
  assert.equal(renderLine('第 {turn} 轮', { turn: '3' }), '第 3 轮');
});

test('renderLine cleans up whitespace and empty brackets it can create', () => {
  assert.equal(renderLine('a（）b', {}), 'ab');
  assert.equal(renderLine('「 」x', {}), 'x');
  assert.equal(renderLine('  trailing  ', {}), 'trailing');
  assert.equal(renderLine('word ,next', {}), 'word,next');
});

test('parseArgs never throws on the truncated JSON a streaming call produces', () => {
  assert.deepEqual(parseArgs('{"command":"npm ru'), {});
  assert.deepEqual(parseArgs(''), {});
  assert.deepEqual(parseArgs('[1,2,3]'), {});
  assert.deepEqual(parseArgs('null'), {});
  assert.deepEqual(parseArgs('{"a":1}'), { a: 1 });
});

test('clip flattens, truncates and drops non-strings', () => {
  assert.equal(clip('  a\n\tb  ', 10), 'a b');
  assert.equal(clip('abcdefghij', 5), 'abcd…');
  assert.equal(clip(42, 5), undefined);
  assert.equal(clip('   ', 5), undefined);
});

test('secrets are redacted before they can reach the status bar', () => {
  assert.equal(redactSecrets('deploy --token=SECRET_abc123'), 'deploy --token=***');
  assert.equal(redactSecrets('curl -H "Authorization: Bearer abc123def"'), 'curl -H "Authorization: Bearer ***"');
  assert.equal(redactSecrets('API_KEY=hunter2 npm start'), 'API_KEY=*** npm start');
  assert.equal(redactSecrets('npm run build'), 'npm run build');
  // …and through the real extraction path.
  const vars = varsFromCall('shell', '{"command":"deploy --token=SECRET_abcd1234"}');
  assert.equal(vars.cmd, 'deploy --token=***');
});

test('paths and urls are reduced the way the copy expects', () => {
  assert.equal(baseName('/a/b/c.ts'), 'c.ts');
  assert.equal(baseName('C:\\a\\b\\c.ts'), 'c.ts');
  assert.equal(dirName('/a/b/c.ts'), '/a/b');
  assert.equal(dirName('c.ts'), undefined);
  assert.equal(shortUrl('https://example.com/x/'), 'example.com/x');
  assert.equal(secsLabel(900), '1');
  assert.equal(secsLabel(61_000), '1m');
  assert.equal(secsLabel(-5), undefined);
});

test('varsFromCall only takes what the category can use', () => {
  const shell = varsFromCall('shell', '{"command":"ls -la","file_path":"/x/y.ts"}');
  assert.equal(shell.cmd, 'ls -la');
  assert.equal(shell.file, 'y.ts', 'a path argument is always worth naming');
  assert.equal(shell.agent, undefined, 'an agent name is not a skill');
  const agent = varsFromCall('agent', '{"target":"reviewer-1","name":"reviewer-1"}');
  assert.equal(agent.agent, 'reviewer-1');
  assert.equal(agent.skill, undefined);
});

test('varsForFacts folds counts, the clock and the pending question', () => {
  const facts = {
    ...emptyFacts(10_000),
    running: true,
    tools: [
      { name: 'read', argsRaw: '{"file_path":"/a/whale.ts"}', turn: 2, step: 3, time: 4_000 },
      { name: 'grep', argsRaw: '{"pattern":"pet"}' },
    ],
    pending: { kind: 'question' as const, questions: 2, reason: 'two things' },
  };
  const vars = varsForFacts(facts, 'read');
  assert.equal(vars.file, 'whale.ts');
  assert.equal(vars.dir, '/a');
  assert.equal(vars.n, '2');
  assert.equal(vars.turn, '2');
  assert.equal(vars.step, '3');
  assert.equal(vars.secs, '6');
  assert.equal(vars.nq, '2');
  assert.equal(vars.why, 'two things');
  assert.equal(vars.name, 'read');
});

test('the two edge streams are consumed independently', () => {
  // The regression this pins: a UI edge used to re-feed the last FACT edge (because
  // both lived under one sequence number), so `popupOpen` was never reached and a
  // stale `failed` was counted again on every popup toggle.
  let consumed: ConsumedEdges = {};

  // Mount: the fact stream speaks `greet`.
  let feed = freshEdges(
    { facts: { events: ['greet'], seq: '1' }, ui: { events: [], seq: undefined } },
    consumed,
  );
  assert.deepEqual(feed.events, ['greet']);
  consumed = feed.consumed;

  // A plain re-render with nothing new: nothing is spoken again.
  feed = freshEdges(
    { facts: { events: ['greet'], seq: '1' }, ui: { events: [], seq: undefined } },
    consumed,
  );
  assert.deepEqual(feed.events, []);
  consumed = feed.consumed;

  // Opening the popup: ONLY the UI edge, never the stale fact edge.
  feed = freshEdges(
    { facts: { events: ['greet'], seq: '1' }, ui: { events: ['popupOpen'], seq: 1 } },
    consumed,
  );
  assert.deepEqual(feed.events, ['popupOpen']);
  consumed = feed.consumed;

  // Closing it: the fact edge is STILL not replayed.
  feed = freshEdges(
    { facts: { events: ['failed'], seq: '1' }, ui: { events: ['popupClose'], seq: 2 } },
    consumed,
  );
  assert.deepEqual(feed.events, ['popupClose'], 'a stale fact edge must stay consumed');
  consumed = feed.consumed;

  // A genuine new fact edge arrives with a UI edge in the same beat: fact first.
  feed = freshEdges(
    { facts: { events: ['failed'], seq: '2' }, ui: { events: ['popupOpen'], seq: 3 } },
    consumed,
  );
  assert.deepEqual(feed.events, ['failed', 'popupOpen']);
});

test('topicSig is a content projection, not an identity', () => {
  assert.equal(topicSig({ file: 'a.ts' }), topicSig({ file: 'a.ts' }));
  assert.notEqual(topicSig({ file: 'a.ts' }), topicSig({ file: 'b.ts' }));
  assert.equal(topicSig(undefined), '');
  assert.equal(topicSig({}), '');
});
