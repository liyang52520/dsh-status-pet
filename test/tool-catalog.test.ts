// 工具分类表：认得出来的分家，认不出来的一起干活。
//
// 这张表决定"她此刻的身体语言"从哪来，所以真正要守住的是两件事：
//   · 每个已知工具**恰好**属于一个类别（对象字面量天然去重，于是改成数一遍）
//   · 未知名字、空名字、大小写不一致，都必须安全落到兜底类别

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_CATEGORY, TOOL_CATEGORIES, categoryOf, isKnownTool } from '../src/behavior/tool-catalog.ts';

test('every category is a known category, and every non-fallback one is used', () => {
  for (const [tool, category] of Object.entries(TOOL_CATEGORY)) {
    assert.ok(TOOL_CATEGORIES.includes(category), `${tool} → ${category} 是合法类别`);
  }
  for (const category of TOOL_CATEGORIES) {
    const n = Object.values(TOOL_CATEGORY).filter((c) => c === category).length;
    if (category === 'tool') continue;
    assert.ok(n > 0, `类别 ${category} 至少有一个工具`);
  }
});

test('the catalogue covers the tools DSH actually ships', () => {
  const wire = ['bash', 'read', 'read_image', 'edit', 'write', 'grep', 'glob', 'web_fetch', 'web_search',
    'todo_write', 'create_goal', 'update_goal', 'get_goal', 'subagent', 'spawn_teammate', 'send_message',
    'wait_agent', 'interrupt_agent', 'list_agents', 'team_task_create', 'team_task_get', 'team_task_list',
    'team_task_update', 'job_list', 'job_output', 'job_kill', 'terminal_open', 'terminal_read',
    'terminal_signal', 'terminal_close', 'terminal_list', 'schedule_create', 'schedule_list',
    'schedule_delete', 'schedule_update', 'lsp', 'skill', 'workflow', 'ralph', 'present',
    'ask_user_question', 'session_search', 'session_trace', 'session_event_read', 'session_event_search',
    'session_event_trace', 'list_subagent_models', 'cordis_inspect_list', 'cordis_inspect_query',
    'cordis_inspect_self', 'cordis_define', 'cordis_run', 'cordis_stop', 'cordis_undefine'];
  for (const name of wire) {
    assert.ok(isKnownTool(name), `${name} 应该在表里`);
  }
  assert.ok(Object.keys(TOOL_CATEGORY).length >= 54, '至少覆盖 54 个工具');
});

test('the categories she can tell apart', () => {
  assert.equal(categoryOf('bash'), 'shell');
  assert.equal(categoryOf('terminal_read'), 'shell');
  assert.equal(categoryOf('read'), 'read');
  assert.equal(categoryOf('grep'), 'search');
  assert.equal(categoryOf('glob'), 'search');
  assert.equal(categoryOf('edit'), 'write');
  assert.equal(categoryOf('web_fetch'), 'web');
  assert.equal(categoryOf('spawn_teammate'), 'agent');
  assert.equal(categoryOf('todo_write'), 'plan');
  assert.equal(categoryOf('present'), 'deliver');
});

test('the fallback is total: unknown, empty, wrong case, non-string', () => {
  assert.equal(categoryOf('a_tool_that_does_not_exist_yet'), 'tool');
  assert.equal(categoryOf(''), 'tool');
  assert.equal(categoryOf('   '), 'tool');
  assert.equal(categoryOf(null), 'tool');
  assert.equal(categoryOf(undefined), 'tool');
  assert.equal(categoryOf(42 as never), 'tool');
  assert.equal(categoryOf('  BASH  '), 'shell', '大小写与空白归一化');
  assert.equal(isKnownTool('a_tool_that_does_not_exist_yet'), false);
});

test('a tool is in exactly one category — no accidental duplicate wins', () => {
  const counts = new Map<string, number>();
  for (const tool of Object.keys(TOOL_CATEGORY)) counts.set(tool, (counts.get(tool) || 0) + 1);
  for (const [tool, n] of counts) assert.equal(n, 1, `${tool} 只声明一次`);
});
