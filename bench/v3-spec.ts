// V3 契约：新增四层（continuers / events / topics / 追加序列）+ 多样性六条。
//
// 与 V2 共用同一套规则实现（长度、音区、变量、emoji、查重都从 v2-spec 里来），
// 这里只定义**V3 新增的东西**，避免两处各写一遍规则。
//
//   docs/dialogue-v3.md 是文字契约，本文件是它的唯一机器实现。

import { readFileSync } from 'node:fs';
import {
  COST, EMOJI, KAOMOJI, MAX_LEN, TONES, cost, langOf, seqRuns,
} from './v2-spec.ts';
import type { ParsedDoc, ParsedRow } from './v2-spec.ts';

export type Lang = 'zh' | 'en';
export type Row = { n: number; tone: string; line: string };
export type EventName = 'greet' | 'queue' | 'approvalDone' | 'answered' | 'failed' | 'cleared'
  | 'retry' | 'firstTool' | 'popupOpen' | 'popupClose';
export type TopicName = 'topicNew' | 'topicSame' | 'topicMany';

export const EVENT_NAMES: readonly EventName[] = ['greet', 'queue', 'approvalDone', 'answered',
  'failed', 'cleared', 'retry', 'firstTool', 'popupOpen', 'popupClose'];
export const TOPIC_NAMES: readonly TopicName[] = ['topicNew', 'topicSame', 'topicMany'];

/** 每层的目标量级（每语言）。 */
export const V3_SIZE = {
  continuers: 200,
  event: 24,
  topic: 40,
  bridges: 520,
  additionsPerState: 27,
};

/** continuers 的音区配比（顺序 calm/busy/formal）。 */
export const CONTINUER_MIX: Record<string, number> = { calm: 90, busy: 80, formal: 30 };

/** continuers 的长度上限（比正句短得多）。 */
export const CONTINUER_MAX = { zh: 5, en: 18 };
export const CONTINUER_TONES = ['calm', 'busy', 'formal'];

/** 变量白名单（§4.1）。 */
export const EVENT_TOKENS: Record<EventName, readonly string[]> = {
  greet: [], queue: ['{n}'], approvalDone: ['{name}', '{why}'], answered: ['{nq}'],
  failed: [], cleared: [], retry: [], firstTool: ['{name}'], popupOpen: [], popupClose: [],
};
export const TOPIC_TOKENS: readonly string[] = ['{file}', '{cmd}', '{pat}', '{q}', '{n}'];

/** 话题池只对"有目标"的状态有意义。 */
export const TOPIC_STATES = ['read', 'write', 'search', 'shell', 'web', 'tool'];

/** 序列要求（合并后的成品池）。 */
export const SEQ_MIN_GROUPS = 8;
export const SEQ_MIN_SHARE = 0.45;
export const SEQ_MAX_LEN = 4;

/** 多样性六条（§4）。 */
export const VARIETY = {
  /** 短句占比下限（zh 按字，en 按字符）。 */
  shortRatio: 0.15,
  shortMax: { zh: 6, en: 20 },
  /** 结尾：`…` 上限；无结尾标点的下限。 */
  ellipsisMax: 0.30,
  bareMin: 0.30,
  /** 任意「前 2 字」开头的占比上限。 */
  openingMax: 0.20,
};

export interface V3Doc {
  lang: Lang;
  path: string;
  continuers: Row[];
  events: Record<string, Row[] | undefined>;
  topics: Record<string, Row[] | undefined>;
  additions: Record<string, ParsedRow[] | undefined>;
  bridges: Array<{ from: string; to: string; tone: string; seq: string; line: string }>;
}

/** 解析一份 V3 交付文件；不认识的小节会被忽略（写手文件本来就只有一两节）。 */
export function parseV3Doc(path: string): V3Doc {
  const lang = langOf(path) as Lang;
  const text = readFileSync(path, 'utf8');
  const out: V3Doc = {
    lang, path, continuers: [], events: {}, topics: {}, additions: {}, bridges: [],
  };
  let mode: 'continuers' | 'events' | 'topics' | 'state' | 'bridges' | null = null;
  let cur: string | null = null;
  for (const raw of text.split('\n')) {
    const head = raw.match(/^## ([A-Za-z]+) — /);
    if (head) {
      const name = head[1];
      if (name === 'continuers') { mode = 'continuers'; cur = null; continue; }
      if (name === 'events') { mode = 'events'; cur = null; continue; }
      if (name === 'topics') { mode = 'topics'; cur = null; continue; }
      if (name === 'bridges') { mode = 'bridges'; cur = null; continue; }
      mode = 'state'; cur = name;
      if (!out.additions[cur]) out.additions[cur] = [];
      continue;
    }
    if (raw.startsWith('## ')) { mode = null; cur = null; continue; }

    if (mode === 'continuers') {
      const r = raw.match(/^\| (\d+) \| ([a-z]+) \| (.+?) \|$/);
      if (r && TONES.includes(r[2])) out.continuers.push({ n: Number(r[1]), tone: r[2], line: r[3] });
      continue;
    }
    if (mode === 'events') {
      const r = raw.match(/^\| (\d+) \| ([A-Za-z]+) \| ([a-z]+) \| (.+?) \|$/);
      if (r && TONES.includes(r[3])) {
        if (!out.events[r[2]]) out.events[r[2]] = [];
        out.events[r[2]]!.push({ n: Number(r[1]), tone: r[3], line: r[4] });
      }
      continue;
    }
    if (mode === 'topics') {
      const r = raw.match(/^\| (\d+) \| ([A-Za-z]+) \| ([a-z]+) \| (.+?) \|$/);
      if (r && TONES.includes(r[3])) {
        if (!out.topics[r[2]]) out.topics[r[2]] = [];
        out.topics[r[2]]!.push({ n: Number(r[1]), tone: r[3], line: r[4] });
      }
      continue;
    }
    if (mode === 'bridges') {
      const r = raw.match(/^\| ([A-Za-z]+) \| ([A-Za-z]+) \| ([a-z]+) \| *([0-9]+\/[0-9]+)? *\| (.+?) \|$/);
      if (r && TONES.includes(r[3])) {
        out.bridges.push({ from: r[1], to: r[2], tone: r[3], seq: r[4] || '', line: r[5] });
      }
      continue;
    }
    if (mode === 'state' && cur) {
      const r = raw.match(/^\| (\d+) \| ([a-z]+) \| *([0-9]+\/[0-9]+)? *\| (.+?) \|$/);
      const list = out.additions[cur];
      if (r && list && TONES.includes(r[2])) {
        list.push({ n: Number(r[1]), tone: r[2], seq: r[3] || '', line: r[4] });
      }
    }
  }
  return out;
}

const trailing = (line: string): boolean => /[。.]$/.test(line);

/** continuers：短、无变量、无句号、音区限制、池内查重。 */
export function checkContinuers(rows: readonly Row[], lang: Lang): string[] {
  const bad: string[] = [];
  const seen = new Map<string, string>();
  let kao = 0;
  rows.forEach((row, i) => {
    const at = `continuers.${String(i + 1).padStart(2, '0')}`;
    const len = [...row.line].length;
    if (len > CONTINUER_MAX[lang]) bad.push(`[${at}] 太长（${len} > ${CONTINUER_MAX[lang]}）：${row.line}`);
    if (/\{[a-z]+\}/.test(row.line)) bad.push(`[${at}] 填充词不许带变量：${row.line}`);
    if (trailing(row.line)) bad.push(`[${at}] 句号结尾：${row.line}`);
    if (EMOJI.test(row.line)) bad.push(`[${at}] emoji：${row.line}`);
    if (!CONTINUER_TONES.includes(row.tone)) bad.push(`[${at}] 音区 ${row.tone} 不在 calm/busy/formal`);
    if (KAOMOJI.test(row.line)) kao++;
    if (seen.has(row.line)) bad.push(`[${at}] 与 ${seen.get(row.line)} 重复：${row.line}`);
    else seen.set(row.line, at);
  });
  if (kao > Math.ceil(rows.length / 10)) bad.push(`[continuers] 颜文字 ${kao} 条过多`);
  return bad;
}

/** events / topics：条数、变量白名单、长度、无句号、查重。 */
export function checkKeyed(
  kind: 'event' | 'topic',
  pools: Record<string, Row[] | undefined>,
  names: readonly string[],
  tokens: (name: string) => readonly string[],
  lang: Lang,
): string[] {
  const bad: string[] = [];
  const seen = new Map<string, string>();
  for (const name of names) {
    const rows = pools[name];
    if (!rows) { bad.push(`[${kind}:${name}] 缺整节`); continue; }
    const want = kind === 'event' ? V3_SIZE.event : V3_SIZE.topic;
    if (rows.length !== want) bad.push(`[${kind}:${name}] ${rows.length} 条，应为 ${want}`);
    if (new Set(rows.map((r) => r.tone)).size < 2) bad.push(`[${kind}:${name}] 至少要有两路口气`);
    const allow = tokens(name);
    for (const row of rows) {
      const at = `${kind}.${name}.${String(row.n).padStart(2, '0')}`;
      for (const token of [...row.line.matchAll(/\{[a-z]+\}/g)].map((m) => m[0])) {
        if (!allow.includes(token)) bad.push(`[${at}] 变量 ${token} 越权（允许：${allow.join(' ') || '无'}）`);
      }
      const len = cost(lang, row.line);
      if (len > MAX_LEN[lang]) bad.push(`[${at}] 长度 ${len} > ${MAX_LEN[lang]}：${row.line}`);
      if (trailing(row.line)) bad.push(`[${at}] 句号结尾：${row.line}`);
      if (EMOJI.test(row.line)) bad.push(`[${at}] emoji：${row.line}`);
      const bare = row.line.replace(/\{[a-z]+\}/g, '').replace(/[ \t]{2,}/g, ' ').trim();
      if (/[（(]\s*[)）]|「\s*」/.test(bare)) bad.push(`[${at}] 变量清空后空括号：${row.line}`);
      // 变量在行首时，清空后会留下一个孤零零的逗号/句号 —— 同 v2-spec 的规矩。
      if (/^[，。、！？：；,.!?:;]/.test(bare) || /[，、：；,]$/.test(bare)) {
        bad.push(`[${at}] 变量清空后标点孤立：${row.line}`);
      }
      if (seen.has(row.line)) bad.push(`[${at}] 与 ${seen.get(row.line)} 重复：${row.line}`);
      else seen.set(row.line, at);
    }
  }
  return bad;
}

/**
 * 追加序列（单个写手文件）：本地编号、组长 2~4、组内音区一致、变量只在首句、白名单。
 *
 * `seqMin` 是**结构下限**（不是"该补多少组"）：它只保证"这么多序列句不能挤在太少的组里"。
 * 「成品池 ≥8 组、序列占比 ≥45%」是**整池**的属性，由 checkMergedPool 在合稿后查 ——
 * 单个补写文件本来就只补几组，拿整池标准卡它是错的（这条踩过一次）。
 */
export function checkAdditions(doc: V3Doc, states: readonly string[], tokens: (s: string) => readonly string[], seqMin: number): string[] {
  const bad: string[] = [];
  const seen = new Map<string, string>();
  for (const [state, rows] of Object.entries(doc.additions)) {
    if (!states.includes(state)) { bad.push(`[${state}] 不是真状态名`); continue; }
    if (!rows || !rows.length) continue;
    rows.forEach((r, i) => { if (r.n !== i + 1) bad.push(`[${state}] 第 ${i + 1} 行编号是 ${r.n}`); });
    const runs = seqRuns(rows);
    const allow = tokens(state);
    for (const r of rows) {
      const at = `${state}+.${String(r.n).padStart(2, '0')}`;
      for (const token of [...r.line.matchAll(/\{[a-z]+\}/g)].map((m) => m[0])) {
        if (!allow.includes(token)) bad.push(`[${at}] 变量 ${token} 越权（允许：${allow.join(' ') || '无'}）`);
      }
      const len = cost(doc.lang, r.line);
      if (len > MAX_LEN[doc.lang]) bad.push(`[${at}] 长度 ${len} > ${MAX_LEN[doc.lang]}：${r.line}`);
      if (trailing(r.line)) bad.push(`[${at}] 句号结尾：${r.line}`);
      if (EMOJI.test(r.line)) bad.push(`[${at}] emoji：${r.line}`);
      if (seen.has(r.line)) bad.push(`[${at}] 与 ${seen.get(r.line)} 重复：${r.line}`);
      else seen.set(r.line, at);
    }
    // 组数下限只看**序列句**：一组最多 SEQ_MAX_LEN 句，R 句至少要 ceil(R/4) 组。
    // 注意不能拿"表内总行数"算 —— 那会让"多加独立句分隔组"反而要求更多组，正好反了。
    const seqLines = runs.reduce((sum, r) => sum + r.length, 0);
    const wanted = Math.max(seqMin, Math.ceil(seqLines / SEQ_MAX_LEN));
    if (runs.length < wanted) bad.push(`[${state}] 追加文件里只有 ${runs.length} 组序列（${seqLines} 句），至少 ${wanted} 组`);
    runs.forEach((list, gi) => {
      const where = `[${state}] 追加第 ${gi + 1} 组`;
      if (list.length < 2 || list.length > SEQ_MAX_LEN) bad.push(`${where} ${list.length} 句，应为 2~${SEQ_MAX_LEN} 句`);
      list.forEach((x, i) => {
        const [a, b] = x.seq.split('/').map(Number);
        if (b !== list.length) bad.push(`${where}第 ${i + 1} 句写作 ${x.seq}，组内应为 n/${list.length}`);
        if (a !== i + 1) bad.push(`${where}序号不连续：${list.map((y) => y.seq).join(' ')}`);
      });
      if (new Set(list.map((x) => x.tone)).size > 1) bad.push(`${where}音区不一致`);
      for (const x of list.slice(1)) if (/\{[a-z]+\}/.test(x.line)) bad.push(`${where}非首句出现变量：${x.line}`);
    });
  }
  return bad;
}

/**
 * 多样性六条 + 序列要求，检查**合并后的成品池**（不是写手的追加文件）。
 * 这一层才是"读久了不腻"的真正门禁。
 */
export function checkMergedPool(state: string, rows: readonly ParsedRow[], lang: Lang): string[] {
  const bad: string[] = [];
  if (!rows.length) return [`[${state}] 空池`];

  // 序列：组数、占比、组长度
  const runs = seqRuns(rows);
  const seqLines = runs.reduce((sum, r) => sum + r.length, 0);
  const share = seqLines / rows.length;
  if (runs.length < SEQ_MIN_GROUPS) bad.push(`[${state}] 序列只有 ${runs.length} 组，应为 ≥${SEQ_MIN_GROUPS}`);
  if (share < SEQ_MIN_SHARE) bad.push(`[${state}] 序列句占比 ${Math.round(share * 100)}% < ${SEQ_MIN_SHARE * 100}%`);
  for (const list of runs) {
    if (list.length < 2 || list.length > SEQ_MAX_LEN) bad.push(`[${state}] 有一组序列 ${list.length} 句（应 2~${SEQ_MAX_LEN}）`);
  }

  // 多样性六条
  const lens = rows.map((r) => cost(lang, r.line));
  const shorts = lens.filter((n) => n <= VARIETY.shortMax[lang]).length;
  if (shorts / rows.length < VARIETY.shortRatio) {
    bad.push(`[${state}] 短句只有 ${Math.round(shorts / rows.length * 100)}%，应 ≥${VARIETY.shortRatio * 100}%`);
  }
  const ellipsis = rows.filter((r) => /…$/.test(r.line)).length;
  if (ellipsis / rows.length > VARIETY.ellipsisMax) {
    bad.push(`[${state}] ${Math.round(ellipsis / rows.length * 100)}% 以 … 结尾，应 ≤${VARIETY.ellipsisMax * 100}%`);
  }
  const bare = rows.filter((r) => !/[…！～♪.。!?？]$/.test(r.line)).length;
  if (bare / rows.length < VARIETY.bareMin) {
    bad.push(`[${state}] 只有 ${Math.round(bare / rows.length * 100)}% 不带结尾标点，应 ≥${VARIETY.bareMin * 100}%`);
  }
  const openings = new Map<string, number>();
  for (const r of rows) {
    const key = [...r.line.replace(/\{[a-z]+\}/g, '')].slice(0, 2).join('');
    if (!key) continue;
    openings.set(key, (openings.get(key) || 0) + 1);
  }
  for (const [key, n] of openings) {
    if (n / rows.length > VARIETY.openingMax) {
      bad.push(`[${state}] 「${key}」开头 ${n} 条（${Math.round(n / rows.length * 100)}%），应 ≤${VARIETY.openingMax * 100}%`);
    }
  }
  return bad;
}

/** 桥接：条数下限 + 允许 2 行序列 + 变量禁止。 */
export function checkBridges(rows: readonly { from: string; to: string; tone: string; seq: string; line: string }[], states: readonly string[], lang: Lang): string[] {
  const bad: string[] = [];
  const seen = new Map<string, string>();
  runsCheck(rows, states, lang, 'bridge', bad, seen);
  // 总量（≥520）是**合稿后**的要求，不是单个写手文件的要求 —— 由最终门禁检查。
  return bad;
}

function runsCheck(
  rows: readonly { from: string; to: string; tone: string; seq: string; line: string }[],
  states: readonly string[], lang: Lang, tag: string,
  bad: string[], seen: Map<string, string>,
): void {
  const byPair = new Map<string, Array<{ from: string; to: string; tone: string; seq: string; line: string }>>();
  for (const b of rows) {
    if (!states.includes(b.from) || !states.includes(b.to)) bad.push(`[${tag}] 非状态名：${b.from}>${b.to}`);
    if (/\{[a-z]+\}/.test(b.line)) bad.push(`[${tag}] 桥接不许带变量：${b.line}`);
    if (trailing(b.line)) bad.push(`[${tag}] 句号结尾：${b.line}`);
    if (EMOJI.test(b.line)) bad.push(`[${tag}] emoji：${b.line}`);
    const len = cost(lang, b.line);
    if (len > (lang === 'zh' ? 12 : 36)) bad.push(`[${tag}] ${b.from}>${b.to} 长度 ${len} 超上限：${b.line}`);
    if (seen.has(b.line)) bad.push(`[${tag}] 与 ${seen.get(b.line)} 重复：${b.line}`);
    else seen.set(b.line, `${b.from}>${b.to}`);
    const key = `${b.from}>${b.to}`;
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key)!.push(b);
  }
  for (const [key, list] of byPair) {
    // 桥接序列同样按"回到 1"切分（桥接行是 {from,to,tone,seq,line}，与 ParsedRow 同形）
    // 复用一个最小形状喂给共享的 seqRuns —— "怎么算一组"只有一处实现。
    const asRows = list.map((b) => ({ n: 0, tone: b.tone, seq: b.seq, line: b.line }));
    const runs = seqRuns(asRows);
    for (const r of runs) {
      if (r.length < 2 || r.length > SEQ_MAX_LEN) bad.push(`[${tag}] ${key} 的序列 ${r.length} 句（应 2~${SEQ_MAX_LEN}）`);
      if (new Set(r.map((x) => x.tone)).size > 1) bad.push(`[${tag}] ${key} 序列内音区不一致`);
      r.forEach((x, i) => {
        const [a, b] = x.seq.split('/').map(Number);
        if (a !== i + 1 || b !== r.length) bad.push(`[${tag}] ${key} 序列序号 ${x.seq} 与组长 ${r.length} 不符`);
      });
    }
  }
}

/** 两语言逐行对齐（新层）。 */
export function checkV3Pair(a: V3Doc, b: V3Doc): string[] {
  const bad: string[] = [];
  const cmpRows = (tag: string, x: readonly Row[], y: readonly Row[]): void => {
    if (x.length !== y.length) { bad.push(`[${tag}] 条数 ${x.length} vs ${y.length}`); return; }
    x.forEach((row, i) => {
      if (row.tone !== y[i].tone) bad.push(`[${tag}.${i + 1}] tone ${row.tone} vs ${y[i].tone}`);
    });
  };
  cmpRows('continuers', a.continuers, b.continuers);
  for (const name of [...EVENT_NAMES, ...TOPIC_NAMES]) {
    const x = a.events[name] || a.topics[name] || [];
    const y = b.events[name] || b.topics[name] || [];
    cmpRows(name, x, y);
  }
  for (const state of Object.keys(a.additions)) {
    const x = a.additions[state] || [];
    const y = b.additions[state] || [];
    if (x.length !== y.length) { bad.push(`[${state}+] 条数 ${x.length} vs ${y.length}`); continue; }
    x.forEach((row, i) => {
      if (row.tone !== y[i].tone) bad.push(`[${state}+.${i + 1}] tone ${row.tone} vs ${y[i].tone}`);
      if (row.seq !== y[i].seq) bad.push(`[${state}+.${i + 1}] seq ${row.seq} vs ${y[i].seq}`);
    });
  }
  if (a.bridges.length !== b.bridges.length) bad.push(`[bridges] 条数 ${a.bridges.length} vs ${b.bridges.length}`);
  for (let i = 0; i < Math.min(a.bridges.length, b.bridges.length); i++) {
    const x = a.bridges[i], y = b.bridges[i];
    if (x.from !== y.from || x.to !== y.to) bad.push(`[bridges ${i + 1}] 对子 ${x.from}>${x.to} vs ${y.from}>${y.to}`);
    if (x.tone !== y.tone) bad.push(`[bridges ${i + 1}] tone ${x.tone} vs ${y.tone}`);
    if (x.seq !== y.seq) bad.push(`[bridges ${i + 1}] seq ${x.seq} vs ${y.seq}`);
  }
  return bad;
}

export { COST, cost, langOf };
