// 状态栏的显示设置：台词显示在宠物旁边（关闭 / 左侧 / 右侧），以及那个框有多宽。
//
// 这是**用户能改的第二样东西**（第一样是「哪个状态播哪个动作」）。 因此它进了
// 同一份存储文档（storage.ts 的 `dockText` / `dockLineWidth`），走同一条写入通道，
// 也就自动获得了「写入即生效 + 广播 + 跨标签页同步」——`onSkinChange` 是「文档变了」
// 这个通道，这里只是给它一个说得清的名字。
//
// 消毒是必要的：存储是一段可以被手改的 JSON，一个不认识的值必须读成默认值，而
// 不是让宠物变成没有名字的状态。

import { onSkinChange } from './session.ts';
import { readStored, writeStored } from './storage.ts';

export type DockText = 'off' | 'left' | 'right';

export const DOCK_TEXT_VALUES: readonly DockText[] = ['off', 'left', 'right'];
export const DOCK_TEXT_DEFAULT: DockText = 'right';

export function isDockText(value: unknown): value is DockText {
  return value === 'off' || value === 'left' || value === 'right';
}

/** The current placement, sanitized. */
export function dockText(): DockText {
  const stored = readStored().dockText;
  return isDockText(stored) ? stored : DOCK_TEXT_DEFAULT;
}

/** Persist one placement.  Setting what is already there costs nothing at all. */
export function setDockText(value: DockText): void {
  if (!isDockText(value) || value === dockText()) return;
  writeStored({ dockText: value });
}

/** Subscribe to any store change (a placement write, a skin write, another tab).
 *  Returns the disposer. */
export function onDockTextChange(fn: () => void): () => void {
  return onSkinChange(fn);
}

// ── 台词框有多宽 ──
//
// 框宽必须是**常数**：dock 那行是居中 flex，宽度跟着台词走的话，每一拍换台词都会
// 让整条状态栏重新居中（也就是"闪"）。 所以这里给的是三档固定宽度 —— 宽一点一次
// 说得完整，窄一点占的地方少，装不下的部分在框里滚动（view/line-scroll.ts）。
// 默认取「中」：比中文台词的中位数宽一点，又比原来那 200px 省下不少地方。

export type DockLineWidth = 'narrow' | 'medium' | 'wide';

export const DOCK_LINE_WIDTH_VALUES: readonly DockLineWidth[] = ['narrow', 'medium', 'wide'];
export const DOCK_LINE_WIDTH_DEFAULT: DockLineWidth = 'medium';

/** 每一档的宽度（px）。 theme.ts 里的 CSS 默认值与 `medium` 一致。 */
export const DOCK_LINE_WIDTH_PX: Record<DockLineWidth, number> = { narrow: 48, medium: 66, wide: 100 };

export function isDockLineWidth(value: unknown): value is DockLineWidth {
  return value === 'narrow' || value === 'medium' || value === 'wide';
}

/** 当前的框宽档位，消毒过。 */
export function dockLineWidth(): DockLineWidth {
  const stored = readStored().dockLineWidth;
  return isDockLineWidth(stored) ? stored : DOCK_LINE_WIDTH_DEFAULT;
}

/** Persist one width.  Setting what is already there costs nothing at all. */
export function setDockLineWidth(value: DockLineWidth): void {
  if (!isDockLineWidth(value) || value === dockLineWidth()) return;
  writeStored({ dockLineWidth: value });
}

/** 当前档位对应的像素宽度 —— dock 把它写成台词框上的 CSS 变量。 */
export function dockLineWidthPx(): number {
  return DOCK_LINE_WIDTH_PX[dockLineWidth()];
}

/** Subscribe to any store change, like `onDockTextChange`. */
export function onDockLineWidthChange(fn: () => void): () => void {
  return onSkinChange(fn);
}
