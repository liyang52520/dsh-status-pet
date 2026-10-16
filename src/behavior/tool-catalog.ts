// 工具 → 类别（= 她此刻身体语言的依据）。
//
// 名字取自 DSH 的 `tool.call.toolview` 注册键（48 个内建工具），加上
// deliverables 的 `present`、ui-skill 的 `skill`、cordis 的四个，以及少数
// host 侧存在但客户端没有专属视图的工具（`pwsh`、`str_replace_editor`）。
//
// 这张表**必须容错**：工具集会一直长，未知名字一律落到 `tool`（兜底类别）。
// 所以它不是一个白名单，而是一张"认得出来的就分家、认不出来的一起干活"的映射。
//
// 类别名与状态名一一对应（`deliver`/`tool` 等），但这里不 import vocabulary：
// 这一层只回答"这是什么性质的工作"，由 facts.ts 决定它构成哪个状态。

/** 工作性质。`tool` 是兜底：不知道那是什么工具。 */
export type ToolCategory = 'shell' | 'read' | 'search' | 'write' | 'web' | 'agent' | 'plan' | 'deliver' | 'tool';

export const TOOL_CATEGORIES: readonly ToolCategory[] =
  ['shell', 'read', 'search', 'write', 'web', 'agent', 'plan', 'deliver', 'tool'];

/** One tool belongs to exactly ONE category: the table is a `Record`, so a duplicate key
 *  is not even expressible.  test/facts.test.ts covers the fallback behaviour. */
export const TOOL_CATEGORY: Record<string, ToolCategory> = {
  // 跑命令：真实机器、真实副作用，最需要"陪你一起等"
  bash: 'shell',
  pwsh: 'shell',
  terminal_open: 'shell',
  terminal_read: 'shell',
  terminal_signal: 'shell',
  terminal_close: 'shell',
  terminal_list: 'shell',
  job_list: 'shell',
  job_output: 'shell',
  job_kill: 'shell',

  // 读：凑近纸面，一行行看
  read: 'read',
  read_image: 'read',
  lsp: 'read',
  list_subagent_models: 'read',
  session_search: 'read',
  session_trace: 'read',
  session_event_read: 'read',
  session_event_search: 'read',
  session_event_trace: 'read',

  // 找：到处翻
  grep: 'search',
  glob: 'search',

  // 改：提笔落下
  edit: 'write',
  write: 'write',
  str_replace_editor: 'write',

  // 从网上取回来
  web_fetch: 'web',
  web_search: 'web',

  // 派人去做：小队长
  subagent: 'agent',
  spawn_teammate: 'agent',
  send_message: 'agent',
  wait_agent: 'agent',
  interrupt_agent: 'agent',
  list_agents: 'agent',
  team_task_create: 'agent',
  team_task_get: 'agent',
  team_task_list: 'agent',
  team_task_update: 'agent',

  // 记下来、排计划
  todo_write: 'plan',
  create_goal: 'plan',
  update_goal: 'plan',
  get_goal: 'plan',
  schedule_create: 'plan',
  schedule_update: 'plan',
  schedule_list: 'plan',
  schedule_delete: 'plan',

  // 双手递上成品
  present: 'deliver',

  // 认不出来的（含未知工具）：通用干活
  ask_user_question: 'tool',
  skill: 'tool',
  workflow: 'tool',
  ralph: 'tool',
  cordis_inspect_list: 'tool',
  cordis_inspect_query: 'tool',
  cordis_inspect_self: 'tool',
  cordis_define: 'tool',
  cordis_run: 'tool',
  cordis_stop: 'tool',
  cordis_undefine: 'tool',
};

/** 类别，未知工具落到 `tool`。 名字大小写与空白先归一化。 */
export function categoryOf(toolName: string | null | undefined): ToolCategory {
  if (typeof toolName !== 'string') return 'tool';
  const name = toolName.trim().toLowerCase();
  if (!name) return 'tool';
  return TOOL_CATEGORY[name] || 'tool';
}

/** 认得出来吗（用来区分"兜底"与"已知"）。 */
export function isKnownTool(toolName: string | null | undefined): boolean {
  return typeof toolName === 'string' && Object.prototype.hasOwnProperty.call(TOOL_CATEGORY, toolName.trim().toLowerCase());
}
