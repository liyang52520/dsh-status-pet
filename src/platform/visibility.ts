// 可见性：**一个** IntersectionObserver，服务每一块宠物画布。
//
// 为什么必须有这一层：工作台的「状态」页有 106 行动作缩略图，加上表头预览、皮肤
// 卡、动作选择器，一屏能挂两百多块画布。 它们全都**不在视口里**，却全都每帧被
// 共享时钟叫醒一次 —— 每帧 200 多次闭包调用、200 多次皮肤解析、200 多次脏检查，
// 换来的是一屏之外谁也看不见的像素。
//
// 于是把「要不要播」交给浏览器：画布进入视口（含 rootMargin 预热带）才挂上时钟，
// 离开就摘掉。 摘掉之后连闭包都不会被调用，不是「进去了再早退」。
//
// rootMargin 是刻意的：滚动时下一行最好**在露头之前**就已经热好（精灵已解析、位图
// 已烘焙），否则快速滚动会在每行露头的第一帧上付一笔解析费，看起来就是滚动顿一下。
//
// 没有 IntersectionObserver 的环境（node 里的纯逻辑测试、老宿主）一律当成"永远可见"，
// 也就是退回旧行为：调用方只需处理"可见/不可见"，不必知道观察器在不在。

/** 预热带：视口上下各多算这么多像素。 */
export const VISIBILITY_MARGIN = '320px 0px 320px 0px';

type Watcher = (visible: boolean) => void;

const watchers = new WeakMap<Element, Watcher>();
let observer: IntersectionObserver | null = null;
let supported: boolean | null = null;

function sharedObserver(): IntersectionObserver | null {
  if (supported === false) return null;
  if (observer) return observer;
  // 延迟读全局：测试会先装好自己的 global，模块顶层读会读空。
  if (typeof IntersectionObserver !== 'function') {
    supported = false;
    return null;
  }
  observer = new IntersectionObserver((entries) => {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const fn = watchers.get(entry.target);
      if (fn) fn(entry.isIntersecting);
    }
  }, { rootMargin: VISIBILITY_MARGIN });
  supported = true;
  return observer;
}

/** 订阅一个元素的可见性。 返回退订函数。
 *
 *  首帧**不**同步回调：IntersectionObserver 的第一份报告总是异步来的，所以调用方
 *  要自己决定"在被证明可见之前"是什么样子（surface.ts 选择：先不挂时钟）。
 *
 *  无 IntersectionObserver 时按"永远可见"处理，并立刻回调一次。 */
export function watchVisibility(el: Element, fn: Watcher): () => void {
  const io = sharedObserver();
  if (!io) {
    fn(true);
    return () => {};
  }
  watchers.set(el, fn);
  io.observe(el);
  return () => {
    if (watchers.get(el) === fn) watchers.delete(el);
    io.unobserve(el);
  };
}

/** 测试与降级用：这个环境是否真的能观察可见性。 */
export function visibilitySupported(): boolean {
  return sharedObserver() !== null;
}
