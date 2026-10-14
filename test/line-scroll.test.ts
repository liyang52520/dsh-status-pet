// 台词框：固定尺寸 + 溢出滚动。
//
// 这个文件守两件事：
//   ① 策略本身 —— 什么时候滚、滚多远、多久滚一趟，全是纯函数算出来的；
//   ② 修的那只 bug 不许回来 —— 盒子的宽度**不能**跟着内容变（dock 那行是居中的
//      flex，宽度一变整条状态栏就重新居中，也就是用户看到的"闪"）。
//
// ② 只能在 CSS 上钉：盒子是定宽（`width:var(--status-pet-line-w)`）而不是
// `max-width`，且关键帧里两端的停顿百分比与 `SCROLL.holdPct` 配对 —— 数字对不上
// 就意味着"滚一趟"里根本没停下让人读。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCROLL, cssShiftPx, planScroll, samePlan } from '../src/view/line-scroll.ts';
import { DOCK_LINE_WIDTH_PX } from '../src/skin/display.ts';
import { THEME } from '../src/platform/theme.ts';

/** 取一条 CSS 规则的声明体（`sel{...}`）。 */
function rule(selector: string): string {
  const at = THEME.indexOf(selector + '{');
  assert.notEqual(at, -1, `CSS 里找不到 ${selector}`);
  const from = at + selector.length + 1;
  return THEME.slice(from, THEME.indexOf('}', from));
}

test('装得下就不滚：一个像素的亚像素误差也不滚', () => {
  assert.equal(planScroll(120, 200).scrolling, false);
  assert.equal(planScroll(200, 200).scrolling, false);
  assert.equal(planScroll(200 + SCROLL.slopPx, 200).scrolling, false, 'slop 之内不算溢出');
  const plan = planScroll(120, 200);
  assert.equal(plan.shiftPx, 0);
  assert.equal(plan.cycleMs, 0);
  assert.equal(plan.overflowPx, 0, '富余不写成负数');
});

test('装不下就滚：位移 = 溢出量，方向朝左', () => {
  const plan = planScroll(300, 200);
  assert.equal(plan.scrolling, true);
  assert.equal(plan.overflowPx, 100);
  assert.equal(plan.shiftPx, -100, '滚到尾巴时最后一个字正好贴住右缘');
  assert.ok(plan.cycleMs >= SCROLL.minCycleMs && plan.cycleMs <= SCROLL.maxCycleMs);
});

test('放完不留空白：位移恰好把藏起来的那一段补回来', () => {
  // 位移 = 溢出量 → 内容的右缘和框的右缘重合，右边既没有空也没有多切。
  for (const [content, box] of [[300, 200], [205, 200], [70, 66], [4000, 48]]) {
    const plan = planScroll(content, box);
    assert.equal(plan.shiftPx + plan.contentPx, plan.boxPx,
      `${content} > ${box}: 停下来的位置要正好让整句的末尾贴住右缘`);
  }
});

test('周期跟着溢出长度走，且夹在上下限之间', () => {
  const small = planScroll(205, 200);   // 只溢出一丁点
  const mid = planScroll(320, 200);
  const huge = planScroll(4000, 200);   // 长得离谱
  assert.equal(small.cycleMs, SCROLL.minCycleMs, '太短的周期会闪，抬到下限');
  assert.equal(huge.cycleMs, SCROLL.maxCycleMs, '等不完的周期封顶');
  assert.ok(mid.cycleMs > SCROLL.minCycleMs && mid.cycleMs < SCROLL.maxCycleMs, '中间段按速度走');
  assert.ok(planScroll(400, 200).cycleMs >= planScroll(300, 200).cycleMs, '越长越慢不了');
});

test('匀速段的速度就是 SCROLL.speedPxPerSec（没被上下限夹住时）', () => {
  const plan = planScroll(600, 200);   // 溢出 400
  const walking = (plan.cycleMs * (100 - 2 * SCROLL.holdPct)) / 100;
  assert.ok(Math.abs(walking - (400 / SCROLL.speedPxPerSec) * 1000) < 2, '走的距离 / 时间 = 速度');
});

test('没法量的东西一律不滚：箱宽为 0、NaN、Infinity', () => {
  assert.equal(planScroll(300, 0).scrolling, false, '还没排版（clientWidth 为 0）');
  assert.equal(planScroll(Number.NaN, 200).scrolling, false);
  assert.equal(planScroll(300, Number.POSITIVE_INFINITY).scrolling, false);
});

test('reduced motion 一律不滚（界面退回省略号）', () => {
  const plan = planScroll(300, 200, true);
  assert.equal(plan.scrolling, false);
  assert.equal(plan.shiftPx, 0);
  assert.equal(plan.overflowPx, 100, '溢出照样如实报出来，只是不动它');
});

test('同样的测量值 → 同样的策略（hook 靠它避免自己喂自己）', () => {
  const a = planScroll(320, 200);
  const b = planScroll(320, 200);
  assert.ok(samePlan(a, b), '值一样就算相等，不必是同一个对象');
  assert.equal(samePlan(null, a), false);
  assert.equal(samePlan(a, planScroll(321, 200)), false);
  assert.equal(samePlan(a, planScroll(320, 201)), false);
});

test('台词框是定宽，不是"最宽多少"—— 宽度不能跟着内容走', () => {
  const box = rule('.status-pet-line');
  assert.match(box, /width:var\(--status-pet-line-w\)/, '固定宽度');
  assert.doesNotMatch(box, /max-width/, '只有 max-width 的话，宽度还是会随台词变化');
  assert.match(box, /overflow:hidden/);
  assert.match(rule('.status-pet-popup-title'), /width:var\(--status-pet-line-w\)/, '弹窗字幕同理');
  // CSS 里的默认宽度必须和设置里的「中」一致：dock 写的是内联变量，这里是一帧都
  // 还没写之前的退路，两边对不上就会先画错一下再跳到正确宽度。
  assert.ok(box.includes(`--status-pet-line-w:${DOCK_LINE_WIDTH_PX.medium}px`),
    'CSS 默认宽度 = 设置里的 medium');
  assert.doesNotMatch(box, /vw/, '宽度不能跟视口走：窗口一改，dock 的邻居就得跟着挪');
});

test('滚动层解掉钳制，否则位移出去的部分会被自己裁掉', () => {
  const run = rule('.status-pet-line-run');
  assert.match(run, /width:max-content/);
  assert.match(run, /max-width:100%/, '不滚时按框裁 + 省略号');
  assert.match(rule('.status-pet-line'), /flex:none/, '框宽必须就是那个 var：被 flex 压窄的话终点算式就错位');
  const scrolling = rule('.status-pet-line-run.scrolling');
  assert.match(scrolling, /max-width:none/);
  assert.match(scrolling, /overflow:visible/);
  assert.match(scrolling, /animation-name:statusPetScroll/);
});

test('一句只滚一趟：放完停住，不循环重放', () => {
  const scrolling = rule('.status-pet-line-run.scrolling');
  assert.match(scrolling, /animation-iteration-count:1/,
    'infinite 会把同一句话一遍遍重播 —— 台词没换就不该再动');
  assert.doesNotMatch(scrolling, /infinite/);
  assert.match(scrolling, /animation-fill-mode:forwards/, '放完停在末尾，不跳回开头');
});

test('关键帧的停顿与 SCROLL.holdPct 配对', () => {
  const hold = SCROLL.holdPct;
  assert.ok(THEME.includes(`@keyframes statusPetScroll{0%,${hold}%{transform:translateX(0)}`),
    `关键帧两端要各停 ${hold}%，和 line-scroll.ts 的 SCROLL.holdPct 一致`);
  assert.ok(THEME.includes('@media (prefers-reduced-motion: reduce)'), 'reduced motion 有兜底');
});

// ── 终点由布局算，不由 JS 算 ──
//
// 这一段是这一版真正的修复。 位移原来是 JS 量出来写进 `--status-pet-shift`，而"改
// 这个变量"在浏览器里不是"重算位置"，是**换掉动画的目标值**：还没滚完就停住、动画
// 结束之后文字再跳一下（右侧留白 / 卡在倒数第二个字）。 现在终点写成布局表达式，
// 一旦有人把它改回 JS 数字，这里就红。

test('终点是布局表达式：内容右缘贴住框右缘，且永不移出右边', () => {
  const keyframes = THEME.slice(THEME.indexOf('@keyframes statusPetScroll'));
  assert.match(keyframes, /translateX\(min\(0px,calc\(var\(--status-pet-line-w\) - 100%\)\)\)/,
    '终点 = min(0, 框宽 - 内容宽)：溢出多少就滚多少，剩下 0 就一步不动');
  assert.doesNotMatch(THEME, /--status-pet-shift/, '位移不许再回到 JS 变量上');
});

test('CSS 那条式子算出来 = 策略里的 shiftPx（规格与实现一致）', () => {
  for (const [content, box] of [[300, 200], [205, 200], [70, 66], [40, 100], [4000, 48]]) {
    assert.equal(cssShiftPx(content, box), planScroll(content, box).shiftPx,
      `${content}/${box}: CSS 的 min(0, 框-内容) 必须等于策略给的位移`);
  }
  assert.equal(cssShiftPx(40, 100), 0, '内容更窄时一步都不动（不往右推）');
});

test('run 的 key 由测量决定：换台词/换宽度/换时长都会重挂 → 动画只能从左边重来', () => {
  // 这条只能在源码层面钉：hook 里 `runKey` 必须同时含 token（text + 几何记号）与
  // 量出来的时长，否则时长变了而元素不重挂，浏览器会把动画**重新计时**（画面一顿）。
  const src = readFileSync(new URL('../src/view/line-scroll.ts', import.meta.url), 'utf8');
  assert.match(src, /runKey: token \+ '/, 'runKey 要带上 token（含台词与几何记号）');
  assert.match(src, /'scroll:' \+ live\.cycleMs/, 'runKey 要带上量出来的时长');
  // 注释里会提到这些名字（说明为什么不用），所以先去掉注释再看代码。
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /ResizeObserver|\.observe\(|fonts\.ready/,
    '不许在动画途中重算：那等于改动画目标值');
});
