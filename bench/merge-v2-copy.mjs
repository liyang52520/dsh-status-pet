// 合稿：docs/v2/g*-*.md 的分组交付 → docs/text-layer-copy-{zh,en}.md（规范顺序）。
//
//   node bench/merge-v2-copy.mjs
//
// 职责：
//   1. 按 §5 的规范顺序重排所有池（分组文件内部的顺序可能是 agent/plan/multi/slow，
//      规范化要求 agent/plan/tool/slow/multi —— 所以不能简单拼接）
//   2. 统一节标题（写手写的 label 各不相同）
//   3. 丢掉分组文件里的 `## 条数汇总` 之类的杂项
//   4. **全局查重**：跨池重复（单文件校验器看不见这个），并打印出来
//   5. 缺池直接失败：宁可不合，也不产出一份"少了一节"的规范词库

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseV3Doc } from './v3-spec.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const V2 = join(ROOT, 'docs/v2');

/** 规范顺序与标签（= docs/context-states-v2.md §5 的顺序）。 */
const ORDER = [
  ['idle', '待命 / At rest'],
  ['sleep', '睡着了 / Sleeping'],
  ['woken', '被叫醒 / Woken up'],
  ['petted', '被摸 / Petted'],
  ['think', '刚收到，还没开口 / Just received'],
  ['reasoning', '在脑子里绕 / Reasoning'],
  ['preparing', '在凑这次调用 / Preparing a call'],
  ['stream', '在说给你听 / Speaking'],
  ['shell', '在跑命令 / Running a command'],
  ['read', '在读文件 / Reading'],
  ['search', '在找东西 / Searching'],
  ['write', '在改文件 / Editing'],
  ['web', '在网上取 / Fetching'],
  ['agent', '在派别人做 / Delegating'],
  ['plan', '在记在排 / Planning'],
  ['deliver', '在递给你 / Delivering'],
  ['tool', '在干别的活 / Working'],
  ['slow', '等得有点久 / Waiting long'],
  ['multi', '几件事一起 / Juggling'],
  ['approval', '等你批准 / Waiting for approval'],
  ['question', '等你回答 / Waiting for an answer'],
  ['planReview', '请你看计划 / Plan review'],
  ['error', '出错了 / Error'],
  ['done', '做完了 / Done'],
];

const TONE = /^(calm|bright|busy|formal|worry)$/;

function parseGroup(path) {
  const out = { states: new Map(), bridges: [] , label: '' };
  let cur = null;
  let mode = null;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const head = raw.match(/^## ([A-Za-z]+) — /);
    if (head) {
      if (head[1] === 'bridges') { mode = 'bridge'; out.label = raw.replace(/^## /, ''); continue; }
      mode = 'state'; cur = head[1];
      if (!out.states.has(cur)) out.states.set(cur, []);
      continue;
    }
    if (raw.startsWith('## ')) { mode = null; cur = null; continue; }
    if (mode === 'bridge') {
      const r = raw.match(/^\| ([A-Za-z]+) \| ([A-Za-z]+) \| ([a-z]+) \| (.+?) \|$/);
      if (r && TONE.test(r[3])) out.bridges.push({ from: r[1], to: r[2], tone: r[3], line: r[4] });
      continue;
    }
    if (mode === 'state' && cur) {
      const r = raw.match(/^\| (\d+) \| ([a-z]+) \| *([0-9]+\/[0-9]+)? *\| (.+?) \|$/);
      if (r && TONE.test(r[2])) out.states.get(cur).push({ tone: r[2], seq: r[3] || '', line: r[4] });
    }
  }
  return out;
}

const files = readdirSync(V2).filter((f) => /-zh\.md$/.test(f)).sort();
const V3 = join(ROOT, 'docs/v3');
if (!files.length) { console.error('docs/v2/ 下没有 *-zh.md'); process.exit(1); }

const zh = { states: new Map(), bridges: [] };
const en = { states: new Map(), bridges: [] };
for (const f of files) {
  const z = parseGroup(join(V2, f));
  const e = parseGroup(join(V2, f.replace(/-zh\.md$/, '-en.md')));
  for (const [k, v] of z.states) zh.states.set(k, v);
  for (const [k, v] of e.states) en.states.set(k, v);
  zh.bridges.push(...z.bridges);
  en.bridges.push(...e.bridges);
}

// ── V3：追加序列 + continuers + events + topics + 扩展桥接 ──
const v3files = readdirSync(V3).filter((f) => /-zh\.md$/.test(f)).sort();
const v3zh = v3files.map((f) => parseV3Doc(join(V3, f)));
const v3en = v3files.map((f) => parseV3Doc(join(V3, f.replace(/-zh\.md$/, '-en.md'))));

/** 追加序列：接在原本的状态池后面（`#` 合稿时重排，所以只要顺序对）。 */
for (const doc of v3zh) {
  for (const [state, rows] of Object.entries(doc.additions)) {
    if (!rows || !rows.length) continue;
    const pool = zh.states.get(state) || [];
    for (const row of rows) pool.push({ tone: row.tone, seq: row.seq, line: row.line });
    zh.states.set(state, pool);
  }
}
for (const doc of v3en) {
  for (const [state, rows] of Object.entries(doc.additions)) {
    if (!rows || !rows.length) continue;
    const pool = en.states.get(state) || [];
    for (const row of rows) pool.push({ tone: row.tone, seq: row.seq, line: row.line });
    en.states.set(state, pool);
  }
}

const continuers = { zh: [], en: [] };
const events = { zh: new Map(), en: new Map() };
const topics = { zh: new Map(), en: new Map() };
for (const [i, doc] of v3zh.entries()) {
  continuers.zh.push(...doc.continuers);
  for (const [name, rows] of Object.entries(doc.events)) if (rows) {
    if (!events.zh.has(name)) events.zh.set(name, []);
    events.zh.get(name).push(...rows);
  }
  for (const [name, rows] of Object.entries(doc.topics)) if (rows) {
    if (!topics.zh.has(name)) topics.zh.set(name, []);
    topics.zh.get(name).push(...rows);
  }
  zh.bridges.push(...doc.bridges);
  const other = v3en[i];
  continuers.en.push(...other.continuers);
  for (const [name, rows] of Object.entries(other.events)) if (rows) {
    if (!events.en.has(name)) events.en.set(name, []);
    events.en.get(name).push(...rows);
  }
  for (const [name, rows] of Object.entries(other.topics)) if (rows) {
    if (!topics.en.has(name)) topics.en.set(name, []);
    topics.en.get(name).push(...rows);
  }
  en.bridges.push(...other.bridges);
}

const missingZh = ORDER.map(([s]) => s).filter((s) => !zh.states.has(s));
const missingEn = ORDER.map(([s]) => s).filter((s) => !en.states.has(s));
if (missingZh.length || missingEn.length) {
  console.error(`❌ 缺池：zh ${missingZh.join(' ') || '—'} | en ${missingEn.join(' ') || '—'}`);
  process.exit(1);
}

/**
 * 跨池查重（同一语言内，**覆盖全部五层**）。
 *
 * 只查状态池是不够的：填充词是两位写手分头写的，很容易撞车（"呣"、"呼…"），
 * 而事件/话题也可能撞上状态池的老句。返回 [文本, 位置数组]。
 */
function duplicates(doc) {
  const where = new Map();
  const add = (key, at) => {
    if (!where.has(key)) where.set(key, []);
    where.get(key).push(at);
  };
  for (const [state, rows] of doc.states) {
    rows.forEach((r, i) => add(r.line, `${state}.${String(i + 1).padStart(2, '0')}`));
  }
  doc.continuers.forEach((r, i) => add(r.line, `continuer.${String(i + 1).padStart(2, '0')}`));
  for (const [name, rows] of doc.events) rows.forEach((r, i) => add(r.line, `event.${name}.${String(i + 1).padStart(2, '0')}`));
  for (const [name, rows] of doc.topics) rows.forEach((r, i) => add(r.line, `topic.${name}.${String(i + 1).padStart(2, '0')}`));
  doc.bridges.forEach((b, i) => add(b.line, `bridge.${b.from}>${b.to}#${i + 1}`));
  return [...where].filter(([, at]) => at.length > 1);
}

const dupZh = duplicates({ ...zh, continuers: continuers.zh, events: events.zh, topics: topics.zh });
const dupEn = duplicates({ ...en, continuers: continuers.en, events: events.en, topics: topics.en });

/** 渲染一份规范词库。 */
function emit(doc, intro) {
  const parts = [intro];
  const toneIndex = (tone) => ['calm', 'bright', 'busy', 'formal', 'worry'].indexOf(tone);
  for (const [state, label] of ORDER) {
    // 按音区**稳定排序**：V2 的池子本来就是这个顺序，V3 的追加句插在后面会破坏它。
    // 稳定排序不会打乱序列（契约保证一组序列内音区一致），只是把同音区的排到一起。
    const rows = [...(doc.states.get(state) || [])].sort((a, b) => toneIndex(a.tone) - toneIndex(b.tone));
    parts.push(`\n## ${state} — ${label}（${rows.length} 条）\n`);
    parts.push('| # | tone | seq | line |');
    parts.push('|---|---|---|---|');
    rows.forEach((r, i) => {
      parts.push(`| ${i + 1} | ${r.tone} | ${r.seq ? ' ' + r.seq + ' ' : '  '} | ${r.line} |`);
    });
  }
  if (doc.continuers.length) {
    parts.push(`\n## continuers — 填充词（${doc.continuers.length} 条）\n`);
    parts.push('| # | tone | line |');
    parts.push('|---|---|---|');
    doc.continuers.forEach((row, i) => parts.push(`| ${i + 1} | ${row.tone} | ${row.line} |`));
  }
  const emitKeyed = (title, label, map) => {
    const total = [...map.values()].reduce((a, b) => a + b.length, 0);
    if (!total) return;
    // 小节标题必须带 ` — `：生成器（与契约）都按 `## <name> — ` 认小节。
    parts.push(`\n## ${title} — ${label}（${total} 条）\n`);
    parts.push(`| # | ${title} | tone | line |`);
    parts.push('|---|---|---|---|');
    let n = 0;
    for (const [name, rows] of map) for (const row of rows) parts.push(`| ${++n} | ${name} | ${row.tone} | ${row.line} |`);
  };
  emitKeyed('events', '边沿反应', doc.events);
  emitKeyed('topics', '话题连续', doc.topics);
  parts.push(`\n## bridges — 状态之间的接话（${doc.bridges.length} 条）\n`);
  parts.push('| from | to | tone | seq | line |');
  parts.push('|---|---|---|---|---|');
  for (const b of doc.bridges) {
    const seq = b.seq ? ` ${b.seq} ` : '  ';
    parts.push(`| ${b.from} | ${b.to} | ${b.tone} |${seq}| ${b.line} |`);
  }
  return parts.join('\n') + '\n';
}

const HEAD = (lang) => `# 台词词库 V2 · ${lang === 'zh' ? '中文' : 'English'}（GENERATED by bench/merge-v2-copy.mjs）
#
# 分区交付稿在 docs/v2/，这里是按规范顺序合成后的**唯一词源**；
# 改文案请改 docs/v2/ 里的分组文件，然后重跑：
#   node bench/merge-v2-copy.mjs && node bench/port-lines.mjs
#
# 契约见 docs/context-states-v2.md。`;

writeFileSync(join(ROOT, 'docs/text-layer-copy-zh.md'), emit({ ...zh, continuers: continuers.zh, events: events.zh, topics: topics.zh }, HEAD('zh')));
writeFileSync(join(ROOT, 'docs/text-layer-copy-en.md'), emit({ ...en, continuers: continuers.en, events: events.en, topics: topics.en }, HEAD('en')));

/** 打印"可以粘进 bench/v2-spec.ts 的基线表"——契约的标准要独立于产物，所以由人粘一次。 */
function printBaseline() {
  const tones = ['calm', 'bright', 'busy', 'formal', 'worry'];
  console.log('\n// ── 粘进 bench/v2-spec.ts 的 SPEC（V3 基线） ──');
  for (const [state] of ORDER) {
    const rows = zh.states.get(state) || [];
    const mix = tones.map((t) => rows.filter((r) => r.tone === t).length);
    console.log(`  ${state}: [${rows.length}, [${mix.join(', ')}]],`);
  }
  // 组数：断点 = 独立句 **或** 序号回到 1（与 v2-spec 的 seqRuns 一致）
  const groups = (rows) => {
    let n = 0;
    for (const r of rows) {
      if (!r.seq) continue;
      if (Number(r.seq.split('/')[0]) === 1) n += 1;
    }
    return n;
  };
  console.log('\n// ── SEQ_GROUPS 至少这么多组 ──');
  console.log('  ' + ORDER.map(([s]) => `${s}: ${groups(zh.states.get(s) || [])}`).join(', '));
  console.log(`\n总体：continuers ${continuers.zh.length} | events ${[...events.zh.values()].reduce((a, b) => a + b.length, 0)}`
    + ` | topics ${[...topics.zh.values()].reduce((a, b) => a + b.length, 0)} | bridges ${zh.bridges.length}`);
}
printBaseline();

// `--update-baseline`：把上面那张表**写进** bench/v2-spec.ts。
// 基线是"交付那一刻的冻结快照"：以后任何改动若不重跑这个命令，SPEC 就对不上、测试会红。
// 所以这是一个**显式的、一次性的**动作，绝不放进常规合稿流程。
if (process.argv.includes('--update-baseline')) {
  const tones = ['calm', 'bright', 'busy', 'formal', 'worry'];
  const specLines = ORDER.map(([state]) => {
    const rows = zh.states.get(state) || [];
    const mix = tones.map((t) => rows.filter((r) => r.tone === t).length);
    return `  ${state}: [${rows.length}, [${mix.join(', ')}]],`;
  });
  const spec = `export const SPEC: Record<string, readonly [number, readonly number[]]> = {\n`
    + specLines.join('\n') + `\n};`;
  const seqGroups = ORDER.map(([state]) => {
    const rows = zh.states.get(state) || [];
    let n = 0;
    for (const r of rows) if (r.seq && Number(r.seq.split('/')[0]) === 1) n += 1;
    return `${state}: ${n}`;
  });
  const seq = `export const SEQ_GROUPS: Record<string, number> = {\n  `
    + seqGroups.join(', ') + `,\n};`;
  const target = join(ROOT, 'bench/v2-spec.ts');
  let text = readFileSync(target, 'utf8');
  const a = text.indexOf('export const SPEC: Record<string, readonly [number, readonly number[]]> = {');
  const aEnd = text.indexOf('};', a) + 2;
  text = text.slice(0, a) + spec + text.slice(aEnd);
  const b = text.indexOf('export const SEQ_GROUPS: Record<string, number> = {');
  const bEnd = text.indexOf('};', b) + 2;
  text = text.slice(0, b) + seq + text.slice(bEnd);
  writeFileSync(target, text);
  console.log('\n✅ 基线已写入 bench/v2-spec.ts（SPEC + SEQ_GROUPS）');
}

const count = (doc) => [...doc.states.values()].reduce((s, v) => s + v.length, 0);
console.log(`合并：zh ${count(zh)} 状态台词 + ${continuers.zh.length} 填充词 + ${zh.bridges.length} 桥接 | `
  + `en ${count(en)} 状态台词 + ${continuers.en.length} 填充词 + ${en.bridges.length} 桥接`);
if (dupZh.length || dupEn.length) {
  console.log(`\n⚠ 跨池重复：zh ${dupZh.length} 组 / en ${dupEn.length} 组`);
  for (const [line, at] of [...dupZh, ...dupEn].slice(0, 30)) console.log(`   ${at.join(' = ')}  →  ${line}`);
  process.exit(2);
}
console.log('✅ 无跨池重复');
