// 台词层的 CI 门禁：文档满足契约、源码与文档一致、跑起来的东西自身成立。
//
// 这里刻意**复用 bench/v2-spec.ts**（写手自检用的同一份实现），而不是重写一遍规则，
// 否则"校验器通过但测试不通过"这种事迟早会发生。
//
// 分三层：
//   ① 文档层 —— 条数/音区/序列/变量/文风/查重/中英对齐
//   ② 漂移层 —— 生成的源码必须逐条等于文档（改了文档忘了重新生成 → 红灯）
//   ③ 运行层 —— 池结构、序列完整性、桥接覆盖、变量白名单、渲染、动作音区、美术缺失

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BRIDGE_SPECS, CONTINUERS, EVENTS, LINE_SPECS, TOPICS } from '../src/behavior/line-pools.ts';
import { BRIDGE_KEYS, LINE_POOLS, bridgeFor, candidates, poolFor } from '../src/behavior/lines.ts';
import { STATE_NAMES, TONES } from '../src/behavior/vocabulary.ts';
import { LINES_ZH } from '../src/labels/lines/zh.ts';
import { LINES_EN } from '../src/labels/lines/en.ts';
import { renderLine } from '../src/behavior/context.ts';
import { ACTION_TONES } from '../src/skin/tones.ts';
import { CATALOG } from '../src/skin/catalog.ts';
import { DEFAULT_SKIN } from '../src/skin/registry.ts';
import { SPEC, TOKENS, SEQ_GROUPS, REQUIRED_BRIDGES, checkDoc, checkPair, parseDoc, seqRuns } from '../bench/v2-spec.ts';
import type { ParsedDoc, ParsedRow } from '../bench/v2-spec.ts';
import { EVENT_NAMES, TOPIC_NAMES, V3_SIZE, checkBridges, checkContinuers, checkKeyed, checkMergedPool, parseV3Doc } from '../bench/v3-spec.ts';
import { EVENT_TOKENS, TOPIC_TOKENS } from '../bench/v3-spec.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const zhDoc: ParsedDoc = parseDoc(join(ROOT, 'docs/text-layer-copy-zh.md'));
const enDoc: ParsedDoc = parseDoc(join(ROOT, 'docs/text-layer-copy-en.md'));
const ART = CATALOG[DEFAULT_SKIN];

const DICTS: Record<'zh' | 'en', Record<string, string>> = { zh: LINES_ZH, en: LINES_EN };
const DOCS: Record<'zh' | 'en', ParsedDoc> = { zh: zhDoc, en: enDoc };
const LOCALES = ['zh', 'en'] as const;

/** 文档里的 id 推导必须与生成器一致。 */
const idOf = (state: string, index: number): string => `${state}.${String(index + 1).padStart(2, '0')}`;
const bridgeIdOf = (from: string, to: string, index: number): string =>
  `bridge.${from}.${to}.${String(index + 1).padStart(2, '0')}`;

function rowsOf(doc: ParsedDoc, state: string): ParsedRow[] {
  return doc.states[state] || [];
}

// ── ① 文档层 ──

test('the copy documents satisfy the whole contract', () => {
  assert.deepEqual(checkDoc(zhDoc), [], 'zh 文档');
  assert.deepEqual(checkDoc(enDoc), [], 'en 文档');
  assert.deepEqual(checkPair(zhDoc, enDoc), [], '中英逐行对齐');
});

test('every pool in the documents is the documented size', () => {
  for (const state of STATE_NAMES) {
    assert.equal(rowsOf(zhDoc, state).length, SPEC[state][0], state);
    assert.equal(rowsOf(enDoc, state).length, SPEC[state][0], state);
  }
});

// ── ② 漂移层 ──

test('the shipped pools are exactly what the documents say', () => {
  for (const state of STATE_NAMES) {
    const rows = rowsOf(zhDoc, state);
    const specs = LINE_SPECS[state];
    assert.equal(specs.length, rows.length, `${state}: 条数`);
    const runs = seqRuns(rows);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const spec = specs[i];
      assert.equal(spec.id, idOf(state, i), `${state} 第 ${i + 1} 条 id`);
      assert.equal(spec.tone, row.tone, `${spec.id} tone`);
      if (!row.seq) {
        assert.equal(spec.group, undefined, `${spec.id} 不该属于序列`);
        continue;
      }
      const [at, of] = row.seq.split('/').map(Number);
      const group = runs.findIndex((run) => run.includes(row));
      assert.equal(spec.group, group + 1, `${spec.id} 组号`);
      assert.equal(spec.at, at, `${spec.id} 组内序号`);
      assert.equal(spec.of, of, `${spec.id} 组长度`);
    }
  }
});

test('the shipped texts are exactly what the documents say, in both locales', () => {
  for (const locale of LOCALES) {
    const doc = DOCS[locale];
    for (const state of STATE_NAMES) {
      rowsOf(doc, state).forEach((row, i) => {
        assert.equal(DICTS[locale][idOf(state, i)], row.line, `${locale}/${idOf(state, i)}`);
      });
    }
    doc.bridges.forEach((b) => {
      const nth = doc.bridges.filter((x) => x.from === b.from && x.to === b.to).indexOf(b);
      assert.equal(DICTS[locale][bridgeIdOf(b.from, b.to, nth)], b.line, `${locale}/${b.from}>${b.to}#${nth + 1}`);
    });
  }
});

test('the shipped bridges are exactly what the documents say', () => {
  const keys = new Set(zhDoc.bridges.map((b) => `${b.from}>${b.to}`));
  assert.deepEqual(Object.keys(BRIDGE_SPECS).sort(), [...keys].sort(), '桥接池的键集合');
  for (const [key, specs] of Object.entries(BRIDGE_SPECS)) {
    const [from, to] = key.split('>');
    const rows = zhDoc.bridges.filter((b) => b.from === from && b.to === to);
    assert.equal(specs.length, rows.length, key);
    rows.forEach((row, i) => {
      assert.equal(specs[i].id, bridgeIdOf(from, to, i), `${key}#${i + 1}`);
      assert.equal(specs[i].tone, row.tone, `${key}#${i + 1}`);
    });
  }
});

// ── ③ 运行层 ──

test('every state name carries a pool, and the pools are the documented ones', () => {
  assert.equal(Object.keys(LINE_SPECS).length, STATE_NAMES.length);
  for (const state of STATE_NAMES) {
    assert.ok(poolFor(state).length > 0, `${state} 的池非空`);
    assert.equal(LINE_POOLS[state], LINE_SPECS[state]);
    const counts = TONES.map((t) => LINE_SPECS[state].filter((s) => s.tone === t).length);
    assert.equal(counts.join('/'), SPEC[state][1].join('/'), `${state} 音区配比`);
  }
  assert.equal(poolFor('not-a-state' as never), LINE_SPECS.idle, '未知状态跟随 idle');
});

test('sequence groups are well formed in the shipped data', () => {
  for (const state of STATE_NAMES) {
    const groups = new Map<number, typeof LINE_SPECS[typeof state][number][]>();
    for (const spec of LINE_SPECS[state]) {
      if (spec.group === undefined) continue;
      if (!groups.has(spec.group)) groups.set(spec.group, []);
      groups.get(spec.group)!.push(spec);
    }
    assert.equal(groups.size, SEQ_GROUPS[state] || 0, `${state} 的序列组数`);
    for (const [group, list] of groups) {
      assert.ok(list.length >= 2 && list.length <= 4, `${state} 第 ${group} 组 ${list.length} 句`);
      assert.equal(new Set(list.map((s) => s.tone)).size, 1, `${state} 第 ${group} 组音区一致`);
      list.forEach((spec, i) => {
        assert.equal(spec.at, i + 1, `${spec.id} 序号`);
        assert.equal(spec.of, list.length, `${spec.id} 组长度`);
      });
    }
  }
});

test('the bridge pools cover every required transition with at least three lines', () => {
  for (const pair of REQUIRED_BRIDGES) {
    const [from, to] = pair.split('>');
    const pool = bridgeFor(from as never, to as never);
    assert.ok(pool && pool.length >= 3, `${pair} 至少 3 条`);
  }
  for (const key of BRIDGE_KEYS) {
    const [from, to] = key.split('>');
    assert.ok((STATE_NAMES as readonly string[]).includes(from), `${key}: from 是真状态`);
    assert.ok((STATE_NAMES as readonly string[]).includes(to), `${key}: to 是真状态`);
    assert.equal(bridgeFor(from as never, from as never), null, '自己到自己没有桥接');
  }
  assert.equal(bridgeFor(null, 'idle' as never), null);
  assert.equal(bridgeFor('idle' as never, 'not-a-state' as never), null);
});

test('variables stay inside the whitelist and are renderable when absent', () => {
  for (const locale of LOCALES) {
    for (const state of STATE_NAMES) {
      const allow = TOKENS[state] || [];
      for (const spec of LINE_SPECS[state]) {
        const text = DICTS[locale][spec.id];
        for (const token of [...text.matchAll(/\{[a-z]+\}/g)].map((m) => m[0])) {
          assert.ok(allow.includes(token), `${spec.id} 用了越权变量 ${token}`);
        }
        const bare = renderLine(text, {});
        assert.ok(!/\{[a-z]+\}/.test(bare), `${spec.id} 变量全空后无残留占位符`);
        assert.ok(!/[ \t]{2}/.test(bare), `${spec.id} 变量全空后无连续空格：${bare}`);
        assert.ok(!/[（(]\s*[)）]|「\s*」/.test(bare), `${spec.id} 变量全空后无空括号`);
        assert.equal(bare, bare.trim(), `${spec.id} 变量全空后首尾无空白`);
        const filled = renderLine(text, {
          cmd: 'cmd', file: 'f.ts', dir: 'src', pat: 'TODO', q: 'q', url: 'a.b',
          task: 't', agent: 'a', goal: 'g', skill: 's', n: '2', turn: '1', step: '1',
          secs: '9', nq: '2', why: 'w', name: 'n',
        });
        assert.ok(!/[ \t]{2}/.test(filled), `${spec.id} 填满变量后无连续空格`);
      }
    }
  }
});

test('nothing is said twice, in either locale', () => {
  for (const locale of LOCALES) {
    const seen = new Map<string, string>();
    for (const id of Object.keys(DICTS[locale])) {
      const text = DICTS[locale][id];
      assert.ok(!seen.has(text), `${locale}: “${text}” 同时是 ${seen.get(text)} 和 ${id}`);
      seen.set(text, id);
    }
  }
});

test('both locales carry the same keys, covering every line and bridge', () => {
  const zhKeys = Object.keys(LINES_ZH).sort();
  const enKeys = Object.keys(LINES_EN).sort();
  assert.deepEqual(zhKeys, enKeys, '两份语言键集相同');
  const expected = [
    ...STATE_NAMES.flatMap((s) => LINE_SPECS[s].map((spec) => spec.id)),
    ...Object.values(BRIDGE_SPECS).flatMap((pool) => pool.map((spec) => spec.id)),
    // V3 的四层也要在字典里
    ...CONTINUERS.map((spec) => spec.id),
    ...Object.values(EVENTS).flatMap((pool) => pool.map((spec) => spec.id)),
    ...Object.values(TOPICS).flatMap((pool) => pool.map((spec) => spec.id)),
  ].sort();
  assert.deepEqual(zhKeys, expected, '字典与池结构一一对应');
});

test('a tone narrows the candidates, and an absent tone falls back to the whole pool', () => {
  const pool = LINE_SPECS.approval;
  const formal = candidates(pool, 'formal');
  assert.ok(formal.length > 0 && formal.every((s) => s.tone === 'formal'));
  assert.equal(candidates(pool, null).length, pool.length);
  assert.equal(candidates(LINE_SPECS.sleep, 'busy').length, LINE_SPECS.sleep.length, 'sleep 没有 busy 这一路 → 退回整池');
  assert.deepEqual(candidates([], 'calm'), []);
});

test('every catalog action carries exactly one tone', () => {
  const ids = ART.actions.map((a) => a.id).sort();
  assert.deepEqual(Object.keys(ACTION_TONES[DEFAULT_SKIN]).sort(), ids, '一个动作一个音区，不多不少');
  for (const id of ids) assert.ok(TONES.includes(ACTION_TONES[DEFAULT_SKIN][id]), id);
});

test('every state has artwork and a pool — no state is decoration', () => {
  for (const state of STATE_NAMES) {
    assert.ok(poolFor(state).length > 0, `${state} 有台词`);
    const actions = ART.states[state];
    assert.ok(Array.isArray(actions) && actions.length > 0, `${state} 有默认动作`);
    for (const id of actions) {
      assert.ok(ART.actions.some((a) => a.id === id), `${state} 引用的动作 ${id} 存在`);
    }
  }
});


// ── ④ V3 话语层：填充词 / 事件 / 话题 / 桥接 必须"真的存在且够用" ──

const v3zh = parseV3Doc(join(ROOT, 'docs/text-layer-copy-zh.md'));
const v3en = parseV3Doc(join(ROOT, 'docs/text-layer-copy-en.md'));

test('the V3 documents satisfy their own contract', () => {
  for (const doc of [v3zh, v3en]) {
    assert.deepEqual(checkContinuers(doc.continuers, doc.lang), [], `${doc.lang}: 填充词`);
    assert.deepEqual(
      checkKeyed('event', doc.events, EVENT_NAMES, (n) => EVENT_TOKENS[n as never] || [], doc.lang),
      [], `${doc.lang}: 事件`,
    );
    assert.deepEqual(
      checkKeyed('topic', doc.topics, TOPIC_NAMES, () => TOPIC_TOKENS, doc.lang),
      [], `${doc.lang}: 话题`,
    );
    assert.ok(checkBridges(doc.bridges, STATE_NAMES, doc.lang).length === 0, `${doc.lang}: 桥接`);
    assert.ok(doc.bridges.length >= V3_SIZE.bridges, `${doc.lang}: 桥接 ${doc.bridges.length} ≥ ${V3_SIZE.bridges}`);
  }
});

test('the shipped V3 layers are exactly what the documents say', () => {
  assert.equal(CONTINUERS.length, V3_SIZE.continuers, '填充词条数');
  v3zh.continuers.forEach((row, i) => {
    assert.equal(DICTS.zh[`continuer.${String(i + 1).padStart(2, '0')}`], row.line);
    assert.equal(CONTINUERS[i].tone, row.tone);
  });
  for (const name of EVENT_NAMES) {
    const rows = v3zh.events[name] || [];
    assert.equal(rows.length, V3_SIZE.event, `事件 ${name}`);
    assert.equal(EVENTS[name].length, rows.length);
    rows.forEach((row, i) => {
      const id = `event.${name}.${String(i + 1).padStart(2, '0')}`;
      assert.equal(DICTS.zh[id], row.line, id);
      assert.equal(DICTS.en[id], (v3en.events[name] || [])[i].line, `${id} en`);
      assert.equal(EVENTS[name][i].tone, row.tone);
    });
  }
  for (const name of TOPIC_NAMES) {
    const rows = v3zh.topics[name] || [];
    assert.equal(rows.length, V3_SIZE.topic, `话题 ${name}`);
    assert.equal(TOPICS[name].length, rows.length);
    rows.forEach((row, i) => {
      const id = `topic.${name}.${String(i + 1).padStart(2, '0')}`;
      assert.equal(DICTS.zh[id], row.line, id);
      assert.equal(DICTS.en[id], (v3en.topics[name] || [])[i].line, `${id} en`);
    });
  }
});

test('every merged pool passes the V3 sequence and variety gate', () => {
  for (const locale of LOCALES) {
    const doc = DOCS[locale];
    for (const state of STATE_NAMES) {
      assert.deepEqual(checkMergedPool(state, rowsOf(doc, state), locale), [], `${locale}/${state}`);
    }
  }
});

test('the discourse tables the engine actually uses carry the new layers', () => {
  assert.equal(CONTINUERS.length, V3_SIZE.continuers);
  for (const name of EVENT_NAMES) assert.ok((EVENTS[name] || []).length > 0, `事件池 ${name}`);
  for (const name of TOPIC_NAMES) assert.ok((TOPICS[name] || []).length > 0, `话题池 ${name}`);
  assert.ok(Object.keys(BRIDGE_SPECS).length >= 100, '桥接对子数');
  // 每一条都有文案，两种语言都有
  for (const line of CONTINUERS) {
    assert.equal(typeof DICTS.zh[line.id], 'string', `zh ${line.id}`);
    assert.equal(typeof DICTS.en[line.id], 'string', `en ${line.id}`);
  }
});
