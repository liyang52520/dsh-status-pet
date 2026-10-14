// 词源 → 源码（V2）。一次性移植脚本，改文案后重跑即可。
//
//   node bench/merge-v2-copy.mjs && node bench/port-lines.mjs
//
//   docs/text-layer-copy-zh.md / -en.md   →  src/behavior/line-pools.ts
//                                            src/labels/lines/zh.ts
//                                            src/labels/lines/en.ts
//   docs/context-states-v2.md 附录 A       →  src/skin/tones.ts
//
// 文档是**写文案的地方**，源码是**跑起来的地方**；test/lines.test.ts 会重新解析文档
// 逐条比对，所以"改了文档忘了重新生成"会立刻红灯。

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TONES = ['calm', 'bright', 'busy', 'formal', 'worry'];
const isTone = (v) => TONES.includes(v);
const STATES = ['idle', 'sleep', 'woken', 'petted', 'think', 'reasoning', 'preparing', 'stream',
  'shell', 'read', 'search', 'write', 'web', 'agent', 'plan', 'deliver', 'tool', 'slow',
  'multi', 'approval', 'question', 'planReview', 'error', 'done'];

function parseCopy(file) {
  const states = new Map();
  const bridges = [];
  const continuers = [];
  const events = new Map();
  const topics = new Map();
  let cur = null;
  let mode = null;
  for (const raw of readFileSync(join(ROOT, file), 'utf8').split('\n')) {
    const head = raw.match(/^## ([A-Za-z]+) — /);
    if (head) {
      const name = head[1];
      if (name === 'bridges') { mode = 'bridge'; continue; }
      if (name === 'continuers') { mode = 'continuer'; continue; }
      if (name === 'events') { mode = 'event'; continue; }
      if (name === 'topics') { mode = 'topic'; continue; }
      mode = 'state'; cur = name;
      if (!states.has(cur)) states.set(cur, []);
      continue;
    }
    if (raw.startsWith('## ')) { mode = null; cur = null; continue; }
    if (mode === 'continuer') {
      const r = raw.match(/^\| (\d+) \| ([a-z]+) \| (.+?) \|$/);
      if (r && isTone(r[2])) continuers.push({ tone: r[2], line: r[3] });
      continue;
    }
    if (mode === 'event' || mode === 'topic') {
      const r = raw.match(/^\| (\d+) \| ([A-Za-z]+) \| ([a-z]+) \| (.+?) \|$/);
      if (r && isTone(r[3])) {
        const map = mode === 'event' ? events : topics;
        if (!map.has(r[2])) map.set(r[2], []);
        map.get(r[2]).push({ tone: r[3], line: r[4] });
      }
      continue;
    }
    if (mode === 'bridge') {
      // 第 4 列（seq）可省略：V2 的桥接是单句，V3 起允许 2 行序列。
      const r = raw.match(/^\| ([A-Za-z]+) \| ([A-Za-z]+) \| ([a-z]+) \| *([0-9]+\/[0-9]+)? *\| (.+?) \|$/);
      // 表头行 `| from | to | tone | ... |` 也长得像数据，必须靠 tone 合法性挡掉。
      if (r && isTone(r[3])) bridges.push({ from: r[1], to: r[2], tone: r[3], seq: r[4] || '', line: r[5] });
      continue;
    }
    if (mode === 'state' && cur) {
      const r = raw.match(/^\| (\d+) \| ([a-z]+) \| *([0-9]+\/[0-9]+)? *\| (.+?) \|$/);
      if (r && isTone(r[2])) states.get(cur).push({ tone: r[2], seq: r[3] || '', line: r[4] });
    }
  }
  return { states, bridges, continuers, events, topics };
}

const zh = parseCopy('docs/text-layer-copy-zh.md');
const en = parseCopy('docs/text-layer-copy-en.md');

// ── 两份语言必须描述同一套池与同一套序列 ──
for (const state of STATES) {
  const a = zh.states.get(state);
  const b = en.states.get(state);
  if (!a || !b) throw new Error(`${state}: 缺节`);
  if (a.length !== b.length) throw new Error(`${state}: zh ${a.length} vs en ${b.length}`);
  a.forEach((row, i) => {
    if (row.tone !== b[i].tone) throw new Error(`${state}.${i + 1}: tone ${row.tone} vs ${b[i].tone}`);
    if (row.seq !== b[i].seq) throw new Error(`${state}.${i + 1}: seq "${row.seq}" vs "${b[i].seq}"`);
  });
}
if (zh.bridges.length !== en.bridges.length) throw new Error('bridges: 条数不一致');
if (zh.continuers.length !== en.continuers.length) throw new Error('continuers: 条数不一致');
zh.continuers.forEach((row, i) => {
  if (row.tone !== en.continuers[i].tone) throw new Error(`continuer ${i + 1}: tone 不一致`);
});
for (const [name, rows] of zh.events) {
  const other = en.events.get(name);
  if (!other || other.length !== rows.length) throw new Error(`event ${name}: 条数不一致`);
  rows.forEach((row, i) => { if (row.tone !== other[i].tone) throw new Error(`event ${name}.${i + 1}: tone 不一致`); });
}
for (const [name, rows] of zh.topics) {
  const other = en.topics.get(name);
  if (!other || other.length !== rows.length) throw new Error(`topic ${name}: 条数不一致`);
  rows.forEach((row, i) => { if (row.tone !== other[i].tone) throw new Error(`topic ${name}.${i + 1}: tone 不一致`); });
}
zh.bridges.forEach((b, i) => {
  const e = en.bridges[i];
  if (b.from !== e.from || b.to !== e.to || b.tone !== e.tone) throw new Error(`bridge ${i + 1}: 对子/tone 不一致`);
});

/**
 * 给序列行编号。 断点有两条，缺一不可：
 *   · 一句不带 seq（独立句）
 *   · 一句的序号回到 1 —— 写手可能把整池写成纯序列（组间没有独立句）
 * 必须与 bench/v2-spec.ts 的 seqRuns 完全一致，否则"文档里的组"和"生成出来的组"会对不上
 * （测试会报 `组号 1 !== 2`）。
 */
function withGroups(rows) {
  const out = [];
  let group = 0;
  for (const row of rows) {
    if (!row.seq) { out.push({ ...row }); continue; }
    const [at, of] = row.seq.split('/').map(Number);
    if (at === 1) group += 1;
    out.push({ ...row, group, at, of });
  }
  return out;
}

// ── 1. 池结构 + 桥接结构 ──
const stateLines = STATES.map((state) => {
  const rows = withGroups(zh.states.get(state));
  const body = rows.map((r, i) => {
    const id = `${state}.${String(i + 1).padStart(2, '0')}`;
    const seq = r.group ? ` group: ${r.group}, at: ${r.at}, of: ${r.of}` : '';
    return `    { id: ${JSON.stringify(id)}, tone: '${r.tone}'${seq ? ',' + seq : ''} },`;
  }).join('\n');
  return `  ${state}: [\n${body}\n  ],`;
}).join('\n');

const bridgeKeys = [];
const bridgeSeen = new Set();
for (const b of zh.bridges) {
  const key = `${b.from}>${b.to}`;
  if (!bridgeSeen.has(key)) { bridgeSeen.add(key); bridgeKeys.push(key); }
}
const bridgeLines = bridgeKeys.map((key) => {
  const [from, to] = key.split('>');
  const rows = zh.bridges.filter((b) => b.from === from && b.to === to);
  const withSeq = withGroups(rows);
  const body = withSeq.map((r, i) => {
    const id = `bridge.${from}.${to}.${String(i + 1).padStart(2, '0')}`;
    const seq = r.group ? ` group: ${r.group}, at: ${r.at}, of: ${r.of}` : '';
    return `    { id: ${JSON.stringify(id)}, tone: '${r.tone}'${seq ? ',' + seq : ''} },`;
  }).join('\n');
  return `  ${JSON.stringify(key)}: [\n${body}\n  ],`;
}).join('\n');

const flat = (rows) => rows.map((r) => `  { id: ${JSON.stringify(r.id)}, tone: '${r.tone}' },`).join('\n');
const continuerLines = zh.continuers.map((r, i) =>
  `  { id: ${JSON.stringify('continuer.' + String(i + 1).padStart(2, '0'))}, tone: '${r.tone}' },`).join('\n');
const eventLines = [...zh.events.entries()].map(([name, rows]) =>
  `  ${JSON.stringify(name)}: [\n${rows.map((r, i) => `    { id: ${JSON.stringify(`event.${name}.` + String(i + 1).padStart(2, '0'))}, tone: '${r.tone}' },`).join('\n')}\n  ],`).join('\n');
const topicLines = [...zh.topics.entries()].map(([name, rows]) =>
  `  ${JSON.stringify(name)}: [\n${rows.map((r, i) => `    { id: ${JSON.stringify(`topic.${name}.` + String(i + 1).padStart(2, '0'))}, tone: '${r.tone}' },`).join('\n')}\n  ],`).join('\n');
void flat;

writeFileSync(join(ROOT, 'src/behavior/line-pools.ts'), `// 台词池与桥接池的结构 —— GENERATED by bench/port-lines.mjs. Do not hand-edit.
//
// 每条台词带三样东西：词条 id（翻译字典的键）、音区（收窄候选）、以及可选的**序列**
// 归属（group/at/of）。序列是连贯性的来源：同一状态里，上一条属于某组且还有下一条时，
// 下一次重抽**必然**接上它，于是她像在把一件事说完，而不是每隔几秒换一句不相干的话。
//
// 桥接池按 \`from>to\` 索引：状态**切换**时优先从那里抽一句把上一句接住。
//
// 文案在 src/labels/lines/{zh,en}.ts，全文见 docs/text-layer-copy-*.md，
// 契约见 docs/context-states-v2.md。test/lines.test.ts 会重新解析文档，两边一旦漂移就报错。

import type { StateName, Tone } from './vocabulary.ts';

/** 池里的一条。 有 group 就是序列成员。 */
export interface PoolLine {
  id: string;
  tone: Tone;
  /** 序列组号（池内 1 起）。 */
  group?: number;
  /** 组内第几句（1 起）。 */
  at?: number;
  /** 这一组共几句。 */
  of?: number;
}

export const LINE_SPECS: Record<StateName, readonly PoolLine[]> = {\n${stateLines}\n};

/** \`from>to\` → 那个转移的接话池。 没有对应池 = 直接说新状态的台词。 */
export const BRIDGE_SPECS: Record<string, readonly PoolLine[]> = {\n${bridgeLines}\n};

/** V3：填充词。 任何状态都能说，且**不打断序列记忆**（见 behavior/discourse.ts）。 */
export const CONTINUERS: readonly PoolLine[] = [\n${continuerLines}\n];

/** V3：事实的边沿 → 她的反应。 */
export const EVENTS: Record<string, readonly PoolLine[]> = {\n${eventLines}\n};

/** V3：话题连续（同一个目标 / 换了目标 / 第 n 个目标）。 */
export const TOPICS: Record<string, readonly PoolLine[]> = {\n${topicLines}\n};
`);

// ── 2 & 3. 两份语言词条 ──
function emitLines(locale, doc, cvar) {
  const lines = [];
  let total = 0;
  for (const state of STATES) {
    doc.states.get(state).forEach((row, i) => {
      const id = `${state}.${String(i + 1).padStart(2, '0')}`;
      lines.push(`  ${JSON.stringify(id)}: ${JSON.stringify(row.line)},`);
      total += 1;
    });
  }
  for (const b of doc.bridges) {
    const nth = doc.bridges.filter((x) => x.from === b.from && x.to === b.to).indexOf(b) + 1;
    const id = `bridge.${b.from}.${b.to}.${String(nth).padStart(2, '0')}`;
    lines.push(`  ${JSON.stringify(id)}: ${JSON.stringify(b.line)},`);
    total += 1;
  }
  doc.continuers.forEach((row, i) => {
    lines.push(`  ${JSON.stringify('continuer.' + String(i + 1).padStart(2, '0'))}: ${JSON.stringify(row.line)},`);
    total += 1;
  });
  for (const [name, rows] of doc.events) rows.forEach((row, i) => {
    lines.push(`  ${JSON.stringify(`event.${name}.` + String(i + 1).padStart(2, '0'))}: ${JSON.stringify(row.line)},`);
    total += 1;
  });
  for (const [name, rows] of doc.topics) rows.forEach((row, i) => {
    lines.push(`  ${JSON.stringify(`topic.${name}.` + String(i + 1).padStart(2, '0'))}: ${JSON.stringify(row.line)},`);
    total += 1;
  });
  writeFileSync(join(ROOT, `src/labels/lines/${locale}.ts`), `// ${locale} 台词词条 —— GENERATED by bench/port-lines.mjs from
// docs/text-layer-copy-${locale}.md. Do not hand-edit; edit the document and re-run.
//
// 键是 \`<状态>.<两位序号>\` 与 \`bridge.<from>.<to>.<两位序号>\`。
// 两份语言必须键集相同 —— test/lines.test.ts 强制。

export const ${cvar}: Record<string, string> = {
${lines.join('\n')}
};

/** ${total} 条。 */
export const ${cvar}_COUNT = ${total};
`);
  return total;
}
const zhTotal = emitLines('zh', zh, 'LINES_ZH');
const enTotal = emitLines('en', en, 'LINES_EN');

// ── 4. 动作音区侧表（V1 设计文档附录 A，106 个动作未变） ──
const design = readFileSync(join(ROOT, 'docs/text-layer-design.md'), 'utf8');
const appendix = design.slice(design.indexOf('## 附录 A'), design.indexOf('## 附录 B'));
const tones = new Map();
for (const raw of appendix.split('\n')) {
  const row = raw.match(/^\| `(calm|bright|busy|formal|worry)` \| (.+) \|$/);
  if (!row) continue;
  for (const hit of row[2].matchAll(/`([a-z0-9][a-z0-9-]*)`\(/g)) tones.set(hit[1], row[1]);
}
const catalog = readFileSync(join(ROOT, 'src/skin/catalog.ts'), 'utf8');
const catalogIds = [...catalog.matchAll(/"id":"([^"]*)"/g)].map((m) => m[1]);
const missing = catalogIds.filter((id) => !tones.has(id));
const extra = [...tones.keys()].filter((id) => !catalogIds.includes(id));
if (missing.length || extra.length) throw new Error(`附录 A 与 catalog 不一致 — 缺 ${missing} 多 ${extra}`);

const byTone = Object.fromEntries(TONES.map((tone) => [tone, [...tones].filter(([, t]) => t === tone).map(([id]) => id)]));
writeFileSync(join(ROOT, 'src/skin/tones.ts'), `// 动作音区 —— GENERATED by bench/port-lines.mjs from docs/context-states-v2.md 附录 A.
//
// 一个动作属于哪一路口气。台词池按它收窄候选：正在播的动作音区为 T 时，优先只在 T
// 的台词里抽；T 交为空则退回整池；动作没有标签则不筛。
//
// 这是一张**侧表**，不是 catalog.ts 的字段：artwork 是 15 MB 冻结数据，音区是策略不是
// 素材，放这里才能 review、能整体替换。全部 ${catalogIds.length} 个动作都有分档。

import type { Tone } from '../behavior/vocabulary.ts';

export const ACTION_TONES: Record<string, Record<string, Tone>> = {
  'whale-chan': {
${TONES.map((tone) => `    // ${tone} (${byTone[tone].length})\n${byTone[tone].map((id) => `    ${JSON.stringify(id)}: '${tone}',`).join('\n')}`).join('\n')}
  },
};
`);

console.log(`✅ ports written: line-pools.ts (${STATES.length} 池 + ${bridgeKeys.length} 桥接对) | `
  + `lines/{zh,en}.ts (${zhTotal} / ${enTotal} 条) | tones.ts (${catalogIds.length} 动作)`);
