// 上下文抽取：把工具调用的原始参数（`argsRaw`，一段 JSON 字符串）变成台词可用的变量。
//
// 这是 V2 的核心——V1 的台词之所以生硬，是因为它只看得见工具名。参数里有文件名、
// 命令、搜索词、URL、目标、任务名，这些才是"她真的知道你在干什么"。
//
// 三条铁律：
//   1. **纯函数**，无 DOM、无时钟（`now` 由调用方传入），可在 node 直接验证。
//   2. **绝不抛错**：`argsRaw` 在流式阶段可能是截断的 JSON，解析失败就当没有参数。
//   3. **绝不回显敏感长文本**：一切进台词的字符串都截断、去换行、去重空白。命令行尤其
//      可能带 token，所以只取首段并限长；宁可信息少，不可把密钥念出来。

import type { ToolCategory } from './tool-catalog.ts';
import { categoryOf } from './tool-catalog.ts';
import type { PetFacts } from './facts.ts';

/** 台词可用的变量。 缺失即 `undefined`（渲染时替换为空串）。 */
export interface LineVars {
  cmd?: string;
  file?: string;
  dir?: string;
  pat?: string;
  q?: string;
  url?: string;
  task?: string;
  agent?: string;
  goal?: string;
  skill?: string;
}

/** 各变量的长度上限（字符）。 命令最短，是为了不把一整行 shell 念出来。 */
export const VARS_LIMITS = {
  cmd: 34,
  file: 24,
  dir: 18,
  pat: 24,
  q: 24,
  url: 28,
  task: 18,
  agent: 20,
  goal: 16,
  skill: 16,
} as const;

/** 折叠空白 + 截断（超出加 `…`）。 非字符串一律丢弃。 */
export function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const flat = value.replace(/\s+/g, ' ').trim();
  if (!flat) return undefined;
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}

/** basename，兼容 POSIX 与 Windows 分隔符。 */
export function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

/** 目录部分；没有目录、或与文件同名时返回 undefined。 */
export function dirName(path: string): string | undefined {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (cut <= 0) return undefined;
  return path.slice(0, cut);
}

/** 去掉协议与结尾斜杠，便于塞进一句话里。 */
export function shortUrl(raw: string): string {
  return raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/\/+$/, '');
}

/** 按顺序取第一个"像样的字符串"参数。 只返回 string，调用方不必再窄化。 */
function pick(args: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) return value[0];
  }
  return undefined;
}

/** `argsRaw` → 一个普通对象。 截断/非法 JSON 一律当作"没有参数"。 */
export function parseArgs(argsRaw: unknown): Record<string, unknown> {
  if (typeof argsRaw !== 'string' || !argsRaw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(argsRaw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/**
 * 从一次工具调用里抽出变量。 `category` 只用来决定"优先看哪些键"——它让同一个
 * `name` 键在 `agent` 池里是对象名、在 `tool` 池里是技能名，而不会互相污染。
 */
export function varsFromCall(
  toolName: string | null | undefined,
  category: ToolCategory,
  argsRaw: unknown,
): LineVars {
  const args = parseArgs(argsRaw);
  const out: LineVars = {};
  /** 只写"确实抽到了"的键：调用方可以直接 Object.keys 判断有没有东西。 */
  const put = (key: keyof LineVars, value: string | undefined): void => {
    if (value !== undefined) out[key] = value;
  };

  const cmd = pick(args, ['command', 'cmd']);
  if (category === 'shell') put('cmd', clip(cmd, VARS_LIMITS.cmd));

  const path = pick(args, ['file_path', 'filePath', 'path', 'file', 'notebook_path']);
  if (path) {
    put('file', clip(baseName(path), VARS_LIMITS.file));
    put('dir', clip(dirName(path), VARS_LIMITS.dir));
  }

  put('pat', clip(pick(args, ['pattern', 'glob', 'regex']), VARS_LIMITS.pat));
  put('q', clip(pick(args, ['query', 'queries', 'search', 'q', 'prompt']), VARS_LIMITS.q));

  const url = pick(args, ['url', 'uri']);
  if (url) put('url', clip(shortUrl(url), VARS_LIMITS.url));

  put('task', clip(pick(args, ['subject', 'description', 'task', 'title']), VARS_LIMITS.task));

  if (category === 'agent') put('agent', clip(pick(args, ['target', 'agent', 'teammate', 'name']), VARS_LIMITS.agent));
  put('goal', clip(pick(args, ['objective', 'goal']), VARS_LIMITS.goal));
  if (category !== 'agent') put('skill', clip(pick(args, ['name', 'skill']), VARS_LIMITS.skill));

  void toolName;
  return out;
}

/** 人类可读的秒数（截断到分钟，避免长句）。 */
export function secsLabel(ms: number): string | undefined {
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return String(Math.max(1, secs));
  const mins = Math.floor(secs / 60);
  return `${mins}m`;
}

/**
 * 一次渲染要用的**全部**变量：工具参数（`{cmd}`/`{file}`/…）+ 计数与时间
 * （`{n}`/`{turn}`/`{step}`/`{secs}`）+ 等你那件事（`{nq}`/`{why}`/`{name}`）。
 *
 * 在这里一次性折好，而不是散在组件里：它可测，而且"哪个变量从哪儿来"只有一个答案。
 * 注意 `{name}` 的优先级 —— 审批时它是**被审批的工具**（那才是你要决定的对象），
 * 其余时候才是正在跑的工具。
 */
export function varsForFacts(
  facts: PetFacts,
  toolName?: string | null,
): Record<string, string | undefined> {
  const first = facts.tools[0];
  const category: ToolCategory = categoryOf(first ? first.name : '');
  const vars: Record<string, string | undefined> = {
    ...varsFromCall(first ? first.name : null, category, first ? first.argsRaw : undefined),
  };

  if (facts.tools.length > 1) vars.n = String(facts.tools.length);
  if (first) {
    if (typeof first.turn === 'number') vars.turn = String(first.turn);
    if (typeof first.step === 'number') vars.step = String(first.step);
  }

  // `{secs}` 只从**正在跑的那次调用**算：它出现的地方（slow/shell/agent/web）都必然
  // 有一次带 `time` 的调用。 刻意不去订阅 turn 级的计时 —— 那个 Map 的引用会随
  // timeline 变动，订阅它等于让 dock 在流式过程中反复重渲染。
  if (first && typeof first.time === 'number') vars.secs = secsLabel(facts.now - first.time);

  const pending = facts.pending;
  if (pending) {
    if (typeof pending.questions === 'number') vars.nq = String(pending.questions);
    if (pending.reason) vars.why = clip(pending.reason, 20);
  }

  const name = (pending && pending.toolName) || toolName || (first ? first.name : undefined);
  if (name) vars.name = clip(name, VARS_LIMITS.skill);

  return vars;
}

/**
 * 渲染一条台词：把 `{var}` 换成值，并把因缺失变量留下的空白收敛掉。
 *
 * 这一步和抽取一样重要：句子必须在**变量全缺**时依然成立（"翻开 {} 看看"就废了）。
 * 所以替换后统一折叠空格、清掉空括号与空引号、去掉行尾/行首的孤立标点。
 */
export function renderLine(text: string, vars: Record<string, string | undefined>): string {
  let out = text.replace(/\{([a-z]+)\}/g, (_m, key: string) => {
    const value = vars[key];
    return typeof value === 'string' ? value : '';
  });
  out = out.replace(/[ \t]{2,}/g, ' ');
  out = out.replace(/[（(]\s*[)）]/g, '');
  out = out.replace(/「\s*」/g, '');
  out = out.replace(/[ \t]{2,}/g, ' ');
  out = out.replace(/[ \t]+([，。、！？：；,.!?:;])/g, '$1');
  out = out.replace(/([（(「])[ \t]+/g, '$1');
  out = out.replace(/[ \t]+$/g, '').replace(/^[ \t]+/g, '');
  return out;
}
