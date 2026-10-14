// V2 台词契约：目标值 + 解析 + 校验。**无副作用、无 CLI、无 console** ——
// 于是它既被 bench/check-v2-copy.mjs（写手自检）用，也被 test/lines.test.ts（CI 门禁）用，
// 契约只有一份实现。
//
// 规则来源：docs/context-states-v2.md §4 §5 §7 与 docs/v2-copy-brief.md。

import { readFileSync } from 'node:fs';

/** 一份词库文档解析出来的形状。 */
export interface ParsedRow { n: number; tone: string; seq: string; line: string }
export interface ParsedBridge { from: string; to: string; tone: string; seq: string; line: string }
export interface ParsedDoc {
  lang: 'zh' | 'en';
  path: string;
  /** 缺的池直接没有键 —— 分组交付的文件本来就只有几节。 */
  states: Record<string, ParsedRow[] | undefined>;
  bridges: ParsedBridge[];
  hasBridgeSection: boolean;
}

export const STATES: readonly string[] = ['idle', 'sleep', 'woken', 'petted', 'think', 'reasoning', 'preparing', 'stream',
  'shell', 'read', 'search', 'write', 'web', 'agent', 'plan', 'deliver', 'tool', 'slow',
  'multi', 'approval', 'question', 'planReview', 'error', 'done'];

export const TONES: readonly string[] = ['calm', 'bright', 'busy', 'formal', 'worry'];

/** 每池条数与五音区配比（§5）。 */
export const SPEC: Record<string, readonly [number, readonly number[]]> = {
  idle: [113, [52, 33, 11, 13, 4]],
  sleep: [64, [48, 10, 0, 0, 6]],
  woken: [54, [27, 8, 0, 6, 13]],
  petted: [62, [15, 37, 0, 5, 5]],
  think: [101, [21, 9, 51, 11, 9]],
  reasoning: [101, [18, 6, 58, 6, 13]],
  preparing: [70, [11, 13, 33, 9, 4]],
  stream: [101, [16, 14, 54, 9, 8]],
  shell: [102, [15, 8, 50, 8, 21]],
  read: [122, [33, 9, 62, 8, 10]],
  search: [94, [15, 8, 51, 7, 13]],
  write: [98, [12, 11, 55, 9, 11]],
  web: [91, [14, 10, 40, 9, 18]],
  agent: [74, [9, 14, 30, 13, 8]],
  plan: [74, [17, 11, 31, 12, 3]],
  deliver: [76, [9, 31, 5, 26, 5]],
  tool: [105, [18, 11, 52, 15, 9]],
  slow: [66, [12, 7, 21, 7, 19]],
  multi: [90, [8, 20, 49, 10, 3]],
  approval: [86, [8, 13, 4, 26, 35]],
  question: [92, [17, 6, 29, 14, 26]],
  planReview: [85, [11, 8, 19, 31, 16]],
  error: [92, [17, 0, 0, 14, 61]],
  done: [92, [22, 55, 0, 13, 2]],
};

/** 每池应有的序列**组数**（§5 的"序列"列）。 */
export const SEQ_GROUPS: Record<string, number> = {
  idle: 21, sleep: 11, woken: 10, petted: 10, think: 21, reasoning: 21, preparing: 13, stream: 21, shell: 21, read: 29, search: 21, write: 21, web: 20, agent: 13, plan: 13, deliver: 18, tool: 20, slow: 12, multi: 18, approval: 15, question: 14, planReview: 13, error: 14, done: 14,
};

/** 变量白名单（§4）。 */
export const TOKENS: Record<string, readonly string[]> = {
  idle: [], sleep: [], woken: [], petted: [],
  think: ['{turn}', '{step}'], reasoning: ['{turn}', '{step}'], stream: ['{turn}', '{step}'],
  preparing: [], shell: ['{cmd}', '{n}', '{secs}'], read: ['{file}', '{dir}', '{turn}', '{step}'],
  search: ['{file}', '{pat}', '{q}'], write: ['{file}', '{dir}'], web: ['{q}', '{url}', '{secs}'],
  agent: ['{task}', '{agent}', '{n}', '{secs}'], plan: ['{task}', '{goal}'], deliver: [],
  tool: ['{skill}', '{n}', '{name}'], slow: ['{secs}', '{turn}', '{step}'], multi: ['{n}'],
  approval: ['{why}', '{name}'], question: ['{nq}'], planReview: ['{nq}'], error: [],
  done: ['{turn}', '{step}'], bridges: [],
};

/** 变量替换上限（用于长度估算）。 */
export const COST: Record<'zh' | 'en', Record<string, number>> = {
  zh: { '{file}': 4, '{cmd}': 6, '{pat}': 4, '{q}': 4, '{url}': 6, '{task}': 4, '{agent}': 3, '{goal}': 4, '{skill}': 3, '{n}': 1, '{turn}': 1, '{step}': 1, '{secs}': 2, '{nq}': 1, '{why}': 5, '{name}': 4 },
  en: { '{file}': 10, '{cmd}': 20, '{pat}': 10, '{q}': 10, '{url}': 16, '{task}': 10, '{agent}': 8, '{goal}': 10, '{skill}': 8, '{n}': 2, '{turn}': 2, '{step}': 2, '{secs}': 2, '{nq}': 2, '{why}': 12, '{name}': 10 },
};

export const MAX_LEN: Record<'zh' | 'en', number> = { zh: 16, en: 48 };
export const BRIDGE_MAX_LEN: Record<'zh' | 'en', number> = { zh: 12, en: 36 };
export const KAOMOJI = /[（(][^A-Za-z ]{0,6}[)）]/;
// 音乐符号是写作规范明确允许的（`…` `!` `～` `♪`），因此不算 emoji。
export const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{2668}\u{2670}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
export const TRAILING = /[。.]$/;
export const LEADING_PUNCT = /^[，。、！？：；,.!?:;]/;

/** 必覆盖的桥接对子（§3.3）。 */
export const REQUIRED_BRIDGES = [
  'think>shell', 'think>read', 'think>write', 'think>search', 'think>web', 'think>plan', 'think>agent',
  'read>write', 'read>search', 'search>read', 'shell>read', 'shell>write', 'write>shell', 'write>done',
  'agent>done', 'web>write', 'plan>shell', 'preparing>shell', 'preparing>read', 'preparing>write',
  'multi>read', 'multi>shell', 'multi>write', 'slow>done', 'slow>error',
  'stream>done', 'reasoning>stream', 'reasoning>shell', 'done>idle', 'idle>think', 'error>think',
];

export function langOf(path: string): 'zh' | 'en' {
  return /-en\.md$/i.test(path) ? 'en' : 'zh';
}

/** 解析一份词库文档。 容忍"只写一部分池"的分组交付。 */
export function parseDoc(path: string): ParsedDoc {
  const l = langOf(path);
  const text = readFileSync(path, 'utf8');
  const states: Record<string, ParsedRow[] | undefined> = {};
  const bridges: ParsedBridge[] = [];
  const hasBridgeSection = /^## bridges — /m.test(text);
  let cur: string | null = null;
  let mode: 'state' | 'bridge' | null = null;
  for (const raw of text.split('\n')) {
    const head = raw.match(/^## ([A-Za-z]+) — /);
    if (head) {
      if (head[1] === 'bridges') { mode = 'bridge'; continue; }
      mode = 'state'; cur = head[1];
      if (!states[cur]) states[cur] = [];
      continue;
    }
    if (raw.startsWith('## ')) { mode = null; cur = null; continue; }
    if (mode === 'bridge') {
      // 第 4 列（seq）可省略：V2 的桥接是单句，V3 起允许 2 行序列。
      const r = raw.match(/^\| ([A-Za-z]+) \| ([A-Za-z]+) \| ([a-z]+) \| *([0-9]+\/[0-9]+)? *\| (.+?) \|$/);
      if (r && TONES.includes(r[3])) {
        bridges.push({ from: r[1], to: r[2], tone: r[3], seq: r[4] || '', line: r[5] });
      }
      continue;
    }
    if (mode === 'state' && cur) {
      // seq 列里的 `/` 必须转义 —— 否则正则字面量提前结束，整个模块 SyntaxError。
      const r = raw.match(/^\| (\d+) \| ([a-z]+) \| *([0-9]+\/[0-9]+)? *\| (.+?) \|$/);
      const list = states[cur];
      if (r && list && TONES.includes(r[2])) {
        list.push({ n: Number(r[1]), tone: r[2], seq: r[3] || '', line: r[4] });
      }
    }
  }
  return { lang: l, path, states, bridges, hasBridgeSection };
}

/**
 * 把序列行编成组。
 *
 * 切分规则有两条，缺一不可：
 *   · 一句**不带 seq**（独立句）—— 序列到这里断
 *   · 一句的序号**回到 1** —— 新的一组开始
 *
 * 第二条是关键：写手可能把整池写成纯序列（组与组之间没有独立句），只认第一条会把
 * 几十句并成一组。两条一起用，两种写法都能正确分组。
 */
export function seqRuns(rows: readonly ParsedRow[]): ParsedRow[][] {
  const runs: ParsedRow[][] = [];
  let run: ParsedRow[] | null = null;
  for (const r of rows) {
    if (!r.seq) { run = null; continue; }
    const at = Number(r.seq.split('/')[0]);
    if (!run || at === 1) { run = []; runs.push(run); }
    run.push(r);
  }
  return runs;
}

/** 长度估算：字符数 + 变量按替换上限折算（变量本身也要占地方）。 */
export function cost(l: 'zh' | 'en', line: string): number {
  let total = [...line].length;
  for (const [tok, c] of Object.entries(COST[l])) {
    const hits = line.split(tok).length - 1;
    if (hits) total += hits * (c - [...tok].length);
  }
  return total;
}

/** 校验一份文档。 返回问题列表（空 = 通过）。 */
export function checkDoc(doc: ParsedDoc): string[] {
  const bad = [];
  const l = doc.lang;
  const seen = new Map();

  // 只写一部分池的分组文件不该报"缺整节"；只写 bridges 的文件整体跳过状态检查。
  const allPresent = STATES.every((s) => doc.states[s]);

  for (const state of STATES) {
    const rows = doc.states[state];
    const [want, mix] = SPEC[state];
    if (!rows) { if (allPresent) bad.push(`[${state}] 缺整节`); continue; }
    if (rows.length !== want) bad.push(`[${state}] ${rows.length} 条，应为 ${want}`);
    rows.forEach((r, i) => { if (r.n !== i + 1) bad.push(`[${state}] 第 ${i + 1} 行编号是 ${r.n}`); });

    const counts = TONES.map((t) => rows.filter((r) => r.tone === t).length);
    if (counts.join() !== mix.join()) bad.push(`[${state}] 音区 ${counts.join('/')}，应为 ${mix.join('/')}`);
    const idx = rows.map((r) => TONES.indexOf(r.tone));
    for (let i = 1; i < idx.length; i++) if (idx[i] < idx[i - 1]) bad.push(`[${state}] 第 ${i + 1} 行音区没有连续排列`);

    const allow = TOKENS[state] || [];
    let kao = 0;
    for (const r of rows) {
      const at = `${state}.${String(r.n).padStart(2, '0')}`;
      for (const tk of [...r.line.matchAll(/\{[a-z]+\}/g)].map((m) => m[0])) {
        if (!allow.includes(tk)) bad.push(`[${at}] 变量 ${tk} 越权（允许：${allow.join(' ') || '无'}）`);
      }
      const len = cost(l, r.line);
      if (len > MAX_LEN[l]) bad.push(`[${at}] 长度 ${len} > ${MAX_LEN[l]}：${r.line}`);
      if (TRAILING.test(r.line)) bad.push(`[${at}] 句号结尾：${r.line}`);
      if (EMOJI.test(r.line)) bad.push(`[${at}] emoji：${r.line}`);
      if (KAOMOJI.test(r.line)) kao++;
      if (LEADING_PUNCT.test(r.line)) bad.push(`[${at}] 行首标点：${r.line}`);
      // 变量全空后仍要合法
      const bare = r.line.replace(/\{[a-z]+\}/g, '').replace(/[ \t]{2,}/g, ' ').trim();
      if (LEADING_PUNCT.test(bare) || /[，、：；,]$/.test(bare)) bad.push(`[${at}] 变量清空后标点孤立：${r.line}`);
      if (/[（(]\s*[)）]|「\s*」|"\s*"/.test(bare)) bad.push(`[${at}] 变量清空后空括号：${r.line}`);
      if (seen.has(r.line)) bad.push(`[${at}] 与 ${seen.get(r.line)} 重复：${r.line}`);
      else seen.set(r.line, at);
    }
    if (kao > Math.ceil(rows.length / 5)) bad.push(`[${state}] 颜文字 ${kao} 条 > 1/5`);

    const runs = seqRuns(rows);
    // 组数是**下限**：V3 的多样性要求是"序列够多"，多写几组永远欢迎。
    const wantGroups = SEQ_GROUPS[state] || 0;
    if (runs.length < wantGroups) bad.push(`[${state}] 序列只有 ${runs.length} 组，应 ≥${wantGroups} 组`);
    runs.forEach((list, gi) => {
      const where = `[${state}] 第 ${gi + 1} 组序列`;
      // V3 把序列上限放宽到 4（给"一个完整的小观察"留空间）
      if (list.length < 2 || list.length > 4) bad.push(`${where} ${list.length} 句，应为 2~4 句`);
      list.forEach((x, i) => {
        const [a, b] = x.seq.split('/').map(Number);
        if (b !== list.length) bad.push(`${where}第 ${i + 1} 句写作 ${x.seq}，组内应为 n/${list.length}`);
        if (a !== i + 1) bad.push(`${where}序号不连续：${list.map((y) => y.seq).join(' ')}`);
      });
      if (new Set(list.map((x) => x.tone)).size > 1) bad.push(`${where}音区不一致`);
      for (const x of list.slice(1)) if (/\{[a-z]+\}/.test(x.line)) bad.push(`${where}非首句出现变量：${x.line}`);
    });
  }

  const writeBridges = doc.hasBridgeSection || Object.keys(doc.states).length === 0;
  const bseen = new Map();
  const byPair = new Map();
  if (writeBridges) {
    for (const b of doc.bridges) {
      if (!STATES.includes(b.from) || !STATES.includes(b.to)) bad.push(`[bridge] 非状态名：${b.from}>${b.to}`);
      const key = `${b.from}>${b.to}`;
      byPair.set(key, (byPair.get(key) || 0) + 1);
      const len = cost(l, b.line);
      if (len > BRIDGE_MAX_LEN[l]) bad.push(`[bridge] ${key} 长度 ${len} 超上限：${b.line}`);
      if (TRAILING.test(b.line)) bad.push(`[bridge] ${key} 句号结尾：${b.line}`);
      if (EMOJI.test(b.line)) bad.push(`[bridge] ${key} emoji：${b.line}`);
      if (/\{[a-z]+\}/.test(b.line)) bad.push(`[bridge] ${key} 桥接不许带变量：${b.line}`);
      if (bseen.has(b.line)) bad.push(`[bridge] 与 ${bseen.get(b.line)} 重复：${b.line}`);
      else bseen.set(b.line, key);
    }
    for (const pair of REQUIRED_BRIDGES) {
      const n = byPair.get(pair) || 0;
      if (n < 3) bad.push(`[bridge] 必覆盖 ${pair} 只有 ${n} 条（要求 ≥3）`);
    }
  }

  return bad;
}

/** 两份语言必须逐行对齐：状态顺序、条数、每行 tone/seq、桥接 from/to/tone。 */
export function checkPair(a: ParsedDoc, b: ParsedDoc): string[] {
  const bad = [];
  for (const state of STATES) {
    const ra = a.states[state] || [];
    const rb = b.states[state] || [];
    if (ra.length !== rb.length) { bad.push(`[${state}] 条数不一致：${ra.length} vs ${rb.length}`); continue; }
    for (let i = 0; i < ra.length; i++) {
      if (ra[i].tone !== rb[i].tone) bad.push(`[${state}.${i + 1}] tone ${ra[i].tone} vs ${rb[i].tone}`);
      if (ra[i].seq !== rb[i].seq) bad.push(`[${state}.${i + 1}] seq "${ra[i].seq}" vs "${rb[i].seq}"`);
    }
  }
  if (a.bridges.length !== b.bridges.length) bad.push(`[bridge] 条数不一致：${a.bridges.length} vs ${b.bridges.length}`);
  for (let i = 0; i < Math.min(a.bridges.length, b.bridges.length); i++) {
    const x = a.bridges[i];
    const y = b.bridges[i];
    if (x.from !== y.from || x.to !== y.to) bad.push(`[bridge ${i + 1}] 对子不一致：${x.from}>${x.to} vs ${y.from}>${y.to}`);
    if (x.tone !== y.tone) bad.push(`[bridge ${i + 1}] tone ${x.tone} vs ${y.tone}`);
  }
  return bad;
}
