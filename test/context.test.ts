// 上下文抽取：参数 → 变量，变量 → 成句。
//
// 这一层是"她真的知道你在干什么"的全部来源，所以测试分两头：
//   抽取端——各种工具的形态都要抽对，且**截断的 JSON 绝不能抛错**
//   渲染端——变量缺失时句子必须仍然成立（这是 V1 生硬之外更要命的坑：会渲染出"翻开  看看"）

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clip, baseName, dirName, shortUrl, parseArgs, varsFromCall, secsLabel, renderLine,
} from '../src/behavior/context.ts';

// ── 抽取 ──

test('parseArgs survives whatever the stream hands it', () => {
  assert.deepEqual(parseArgs('{"command":"ls -la"}'), { command: 'ls -la' });
  assert.deepEqual(parseArgs('{"file_path":"a/b.ts"}'), { file_path: 'a/b.ts' });
  // 流式阶段的截断 JSON：当作"没有参数"，绝不抛
  assert.deepEqual(parseArgs('{"file_path":"a/b'), {});
  assert.deepEqual(parseArgs('not json'), {});
  assert.deepEqual(parseArgs('[1,2]'), {}, '数组不是参数对象');
  assert.deepEqual(parseArgs('"a string"'), {});
  assert.deepEqual(parseArgs(''), {});
  assert.deepEqual(parseArgs(null), {});
  assert.deepEqual(parseArgs(42), {});
});

test('clip flattens, trims and truncates', () => {
  assert.equal(clip('  a\n\nb  ', 20), 'a b');
  assert.equal(clip('x'.repeat(30), 10), 'xxxxxxxxx…');
  assert.equal(clip('', 10), undefined);
  assert.equal(clip('   ', 10), undefined);
  assert.equal(clip(null, 10), undefined);
  assert.equal(clip(7, 10), undefined);
});

test('paths are split the way both platforms write them', () => {
  assert.equal(baseName('src/view/dock/pill.ts'), 'pill.ts');
  assert.equal(baseName('C:\\Users\\me\\a.ts'), 'a.ts');
  assert.equal(baseName('plain.ts'), 'plain.ts');
  assert.equal(dirName('src/view/dock/pill.ts'), 'src/view/dock');
  assert.equal(dirName('plain.ts'), undefined);
  assert.equal(dirName('/a.ts'), undefined);
  assert.equal(shortUrl('https://example.com/x/'), 'example.com/x');
  assert.equal(shortUrl('http://a.b'), 'a.b');
});

test('a shell command becomes a short, single-line variable', () => {
  const vars = varsFromCall('bash', 'shell', JSON.stringify({ command: 'pnpm   test\n --filter x' }));
  assert.equal(vars.cmd, 'pnpm test --filter x');
  const long = varsFromCall('bash', 'shell', JSON.stringify({ command: 'x'.repeat(200) }));
  assert.ok((long.cmd || '').length <= 34, '命令被截断，不把整行 shell 念出来');
});

test('a read call gives a file and its directory', () => {
  const vars = varsFromCall('read', 'read', JSON.stringify({ file_path: '/Users/me/proj/src/a.ts' }));
  assert.equal(vars.file, 'a.ts');
  assert.equal(vars.dir, '/Users/me/proj/src');
  const win = varsFromCall('read', 'read', JSON.stringify({ path: 'src\\b.ts' }));
  assert.equal(win.file, 'b.ts');
  assert.equal(win.dir, 'src');
});

test('search, web, plan, agent and skill each pick their own keys', () => {
  assert.equal(varsFromCall('grep', 'search', JSON.stringify({ pattern: 'TODO' })).pat, 'TODO');
  assert.equal(varsFromCall('glob', 'search', JSON.stringify({ glob: '**/*.ts' })).pat, '**/*.ts');
  assert.equal(varsFromCall('web_search', 'web', JSON.stringify({ queries: ['deepseek harness'] })).q, 'deepseek harness');
  assert.equal(varsFromCall('web_fetch', 'web', JSON.stringify({ url: 'https://a.b/c' })).url, 'a.b/c');
  assert.equal(varsFromCall('create_goal', 'plan', JSON.stringify({ objective: '把状态扩到 23 个' })).goal, '把状态扩到 23 个');
  assert.equal(varsFromCall('todo_write', 'plan', JSON.stringify({ subject: '写测试' })).task, '写测试');
  assert.equal(varsFromCall('spawn_teammate', 'agent', JSON.stringify({ name: 'writer' })).agent, 'writer');
  assert.equal(varsFromCall('send_message', 'agent', JSON.stringify({ target: 'lead' })).agent, 'lead');
  assert.equal(varsFromCall('skill', 'tool', JSON.stringify({ name: 'office-xlsx' })).skill, 'office-xlsx');
});

test('the same `name` key lands in different variables by category', () => {
  const raw = JSON.stringify({ name: 'thing' });
  assert.equal(varsFromCall('spawn_teammate', 'agent', raw).agent, 'thing');
  assert.equal(varsFromCall('spawn_teammate', 'agent', raw).skill, undefined, 'agent 池不抽 skill');
  assert.equal(varsFromCall('skill', 'tool', raw).skill, 'thing');
});

test('nothing to extract is not a crash', () => {
  for (const raw of [undefined, null, '', '{}', '{oops', 12]) {
    const vars = varsFromCall('bash', 'shell', raw);
    assert.equal(typeof vars, 'object');
    assert.equal(vars.cmd, undefined);
  }
  assert.deepEqual(varsFromCall(null, 'tool', undefined), {});
});

test('seconds are labelled for a spoken line, not for a stopwatch', () => {
  assert.equal(secsLabel(45_000), '45');
  assert.equal(secsLabel(1_000), '1');
  assert.equal(secsLabel(0), '1', '永远不说"0 秒"');
  assert.equal(secsLabel(125_000), '2m');
  assert.equal(secsLabel(-1), undefined);
  assert.equal(secsLabel(NaN), undefined);
});

// ── 渲染 ──

test('renderLine substitutes and leaves everything else alone', () => {
  assert.equal(renderLine('正在跑 {cmd}', { cmd: 'pnpm test' }), '正在跑 pnpm test');
  assert.equal(renderLine('翻开 {file} 看看', { file: 'a.ts' }), '翻开 a.ts 看看');
  assert.equal(renderLine('没有变量', {}), '没有变量');
});

test('a missing variable degrades gracefully — never a blank hole', () => {
  assert.equal(renderLine('正在跑 {cmd}', {}), '正在跑');
  assert.equal(renderLine('翻开 {file} 看看', {}), '翻开 看看', '空格折叠成一个');
  assert.equal(renderLine('跑完了（{cmd}）', {}), '跑完了', '空括号整对消失');
  assert.equal(renderLine('读「{file}」', {}), '读', '空引号整对消失');
  assert.equal(renderLine('跑 {cmd} …', {}), '跑 …');
  assert.equal(renderLine('  {cmd}  ', {}), '');
  assert.equal(renderLine('结果 {cmd} ，', {}), '结果，', '标点前的空位被吃掉，不留下"结果 ，"');
});

test('every template in the brief renders cleanly with no variables at all', () => {
  const templates = [
    '正在跑 {cmd}', '翻开 {file} 看看', '在找 {pat}', '搜索 {q} 的结果', '取回 {url}',
    '记下 {task}', '交给 {agent} 去办', '目标：{goal}', '用 {skill} 处理', '共 {n} 件一起跑',
    '第 {turn} 轮第 {step} 步', '已经 {secs} 秒了', '{nq} 个问题等你', '要批准 {name}：{why}',
  ];
  for (const template of templates) {
    const bare = renderLine(template, {});
    assert.ok(!/\{[a-z]+\}/.test(bare), `${template} → 没有残留占位符`);
    assert.ok(!/ {2}/.test(bare), `${template} → 没有连续空格：${bare}`);
    assert.ok(!/[（(]\s*[)）]/.test(bare), `${template} → 没有空括号`);
    assert.equal(bare, bare.trim(), `${template} → 首尾没有空白`);
    const filled = renderLine(template, { cmd: 'c', file: 'f', pat: 'p', q: 'q', url: 'u', task: 't', agent: 'a', goal: 'g', skill: 's', n: '1', turn: '1', step: '1', secs: '9', nq: '2', name: 'n', why: 'w' });
    assert.ok(!/ {2}/.test(filled), `${template} → 填满后也没有连续空格`);
  }
});
