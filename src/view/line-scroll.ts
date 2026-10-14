// 台词框是**固定尺寸**的：宿主的 dock 行是 `justify-content:center` 的 flex
// （`InputBar` 的 `.yhfFVG_dock`），只要 pill 的宽度跟着台词走，整条状态栏就会在
// 每一拍重新居中 —— 台词一长一短，状态栏就左右抽动。 固定宽度把原因去掉了：盒子
// 只跟视口有关，跟内容无关；装不下的台词在盒子里滚动。
//
// 这里只回答**一个问题**：要不要滚、滚一趟多久。 **滚到哪里不由这里决定** ——
// 终点写成 CSS（`translateX(min(0px, calc(宽度 - 100%)))`，见 theme.ts），也就是
// "文字尾巴贴住框右缘"，由浏览器按真实排版算。
//
// 为什么位移必须交给 CSS：
//   · 位移一旦是 JS 量的数字，就得在动画途中维护它。 而"改这个数字"在浏览器里
//     不是"重新算位置"，是**直接换掉动画的目标值** —— 还没滚完就停住、或者动画
//     已经结束（`forwards`）之后整段文字猛地跳一下。 量早了一点（字体、布局）
//     甚至会停在倒数第二个字，然后过一会儿把剩下的整段蹦出来。
//   · 写成布局表达式之后，终点**按定义**就是"尾巴贴右缘"：量错、字体换、窗口变
//     …都不可能让它多滚或少滚一个像素。
// 所以 `planScroll` 只用测量值决定 **滚不滚 + 走多快**，`shiftPx` 只作为"CSS 那条
// 式子应该等于多少"的规格留在测试里。

import { React } from '../platform/deps.ts';
import { useReducedMotion } from './reduce-motion.ts';

/** 滚动节奏的旋钮。 `holdPct` 与 theme.ts 里 `statusPetScroll` 的关键帧百分比
 *  配对（各 12%），改一个必须改另一个 —— test 里钉着这对数字。 */
export const SCROLL = {
  /** 匀速段的速度（px/s）。 12px 正文下大约每秒三个汉字，念得完。 */
  speedPxPerSec: 34,
  /** 关键帧两端各停多久（占整个周期的百分比）：开头读第一眼，结尾停一下再回。 */
  holdPct: 12,
  /** 溢出一个像素以内不算溢出（字体的亚像素误差）。 */
  slopPx: 1,
  /** 周期上下限（ms）：太短会闪，太长就没人等了。 */
  minCycleMs: 3000,
  maxCycleMs: 20_000,
} as const;

export interface ScrollPlan {
  /** true = 内容比框宽，需要滚动。 */
  scrolling: boolean;
  /** 量到的内容宽度（px）。 */
  contentPx: number;
  /** 量到的框宽度（px）。 */
  boxPx: number;
  /** 内容溢出框的宽度（px，负数表示还有富余）。 */
  overflowPx: number;
  /** 终点位移（≤0 的 px）—— **规格**：CSS 的布局表达式必须等于它。 */
  shiftPx: number;
  /** 走一趟的时长（ms）；不滚时为 0。 */
  cycleMs: number;
}

function num(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** 测量值 → 这一拍该怎么滚。 纯函数：同样的输入永远同样的输出，也就没有
 *  "量一次、渲染一次、再量一次"的循环。 */
export function planScroll(contentPx: number, boxPx: number, reducedMotion = false): ScrollPlan {
  const content = num(contentPx);
  const box = num(boxPx);
  const overflow = content - box;
  const still = {
    scrolling: false,
    contentPx: content,
    boxPx: box,
    overflowPx: Math.max(0, overflow),
    shiftPx: 0,
    cycleMs: 0,
  };
  // reduced motion：不滚（界面靠省略号裁掉），也免得读屏/低动效用户被一条走马灯烦到。
  if (reducedMotion || box <= 0 || overflow <= SCROLL.slopPx) return still;

  const travelMs = (overflow / SCROLL.speedPxPerSec) * 1000;
  // 一个周期里只有 `100 - 2·holdPct` 的时间在走，所以总时长要按这段占比放大。
  const cycleMs = clamp(
    Math.round((travelMs * 100) / (100 - 2 * SCROLL.holdPct)),
    SCROLL.minCycleMs,
    SCROLL.maxCycleMs,
  );
  return {
    scrolling: true,
    contentPx: content,
    boxPx: box,
    overflowPx: overflow,
    shiftPx: -Math.round(overflow),
    cycleMs,
  };
}

/** CSS 那条式子（`min(0px, calc(box - 100%))`）算出来的终点位移。 用来把"规格"和
 *  "实现"钉在一起：两者必须相等，否则就是多滚或少滚。 */
export function cssShiftPx(contentPx: number, boxPx: number): number {
  return Math.min(0, num(boxPx) - num(contentPx));
}

/** 两份策略是否等价：等价就复用旧对象，避免 setState 把渲染打进死循环。 */
export function samePlan(a: ScrollPlan | null, b: ScrollPlan): boolean {
  return !!a
    && a.scrolling === b.scrolling
    && a.contentPx === b.contentPx
    && a.boxPx === b.boxPx
    && a.shiftPx === b.shiftPx
    && a.cycleMs === b.cycleMs;
}

export interface LineScroll<T extends HTMLElement = HTMLElement> {
  /** 外层**固定宽度**的框（ref 类型按调用方的标签给）。 */
  boxRef: React.RefObject<T | null>;
  /** 里面真正排字、被位移的那一层。 */
  runRef: React.RefObject<T | null>;
  /** run 的 key：台词、框档位、量出来的时长，任一变就重挂 —— 动画只能从左边
   *  重新开始，绝不在半路被改目标值。 */
  runKey: string;
  /** 这一拍要滚：调用方据此挂 `.scrolling`。 */
  scrolling: boolean;
  /** 滚动时写进 run 的内联样式（只有时长；位移在 CSS 里），不滚时为 null。 */
  style: Record<string, unknown> | null;
}

/**
 * 把"固定框 + 溢出滚动"接到 React 上。
 *
 * @param text     这一拍的台词（变了就重新量、重新开始）。
 * @param geometry 框的几何记号（dock 传档位的 px，popup 传它的 CSS 宽度）。 它变了
 *                 说明框宽变了，要重新量 —— 这是**唯一**会让测量重跑的东西。
 *
 * 刻意**不**订阅 ResizeObserver / fonts.ready：那些会在动画途中（甚至动画结束之后）
 * 触发重算，而重算 = 改动画目标值 = 跳。 几何已经由 CSS 按真实布局算，测量只影响
 * "滚不滚 / 走多快"，量早一点点没有副作用。
 */
export function useLineScroll<T extends HTMLElement = HTMLElement>(
  text: string | null,
  geometry: string | number = '',
): LineScroll<T> {
  const boxRef = React.useRef<T | null>(null);
  const runRef = React.useRef<T | null>(null);
  const reduced = useReducedMotion();
  const [measured, setMeasured] = React.useState<{ token: string; plan: ScrollPlan } | null>(null);
  // 量在 paint 之前做完；宿主 React 没有 layout effect 时退回 effect（差一帧，但不崩）。
  const useIsoLayoutEffect = React.useLayoutEffect || React.useEffect;
  const token = (text ?? '') + '\u0000' + String(geometry);

  const measure = React.useCallback(() => {
    const box = boxRef.current;
    const run = runRef.current;
    if (!box || !run) return;
    // `scrollWidth` 报的是内容宽度，即使此刻被 max-width 裁着也一样 —— 这正是
    // 我们要的：量出来的是"要不要滚"，不是"现在看得见多少"。
    const plan = planScroll(run.scrollWidth, box.clientWidth, reduced.current);
    setMeasured((prev) => (prev && prev.token === token && samePlan(prev.plan, plan) ? prev : { token, plan }));
  }, [reduced, token]);

  useIsoLayoutEffect(() => { measure(); }, [measure]);

  // 只有"这一拍量过"的策略才算数：换台词的第一次渲染，run 以"没量过"的样子挂上
  // （不滚、没有时长），量完再带着**最终**时长重挂一次（runKey 变了）。 于是动画
  // 从第一帧起就是正确的目标与速度，不存在"先按上一句的时长跑起来"。
  const live = measured && measured.token === token ? measured.plan : null;
  const scrolling = !!live && live.scrolling;
  return {
    boxRef,
    runRef,
    runKey: token + '\u0000' + (live ? (live.scrolling ? 'scroll:' + live.cycleMs : 'still') : 'pending'),
    scrolling,
    style: scrolling && live ? { animationDuration: live.cycleMs + 'ms' } : null,
  };
}
