// 状态栏的显示设置：台词显示在宠物旁边，还是不显示。
//
// 这是**用户能改的第二样东西**（第一样是「哪个状态播哪个动作」）。 因此它进了
// 同一份存储文档（storage.ts 的 `dockText`），走同一条写入通道，也就自动获得了
// 「写入即生效 + 广播 + 跨标签页同步」——`onSkinChange` 是「文档变了」这个通道，
// 这里只是给它一个说得清的名字。
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
