// The click popup (Peek layer): an anchored panel portal-ed to document.body
// by the dock pill.  Position comes from `useAnchoredPosition`; until it
// resolves the panel renders hidden.
//
// The popup is the pet's ONLY interactive surface — its `onClick` covers the
// whole panel, not just the 64px sprite, so the padding and the caption pet
// the pet too.  The panel owns the reaction, feeds it to the one canvas, and
// tells the DOCK about it as well (`onPet`), so the animation, this caption and
// the dock's own label all say the same thing at the same moment.
//
// It shows THE SAME animation the dock is playing: it pins the dock's derived
// state and follows the take channel, so the big picture is not a second,
// independently rolled pet.  And it shows the SAME LINE, for the same reason:
// `props.line` is the dock's string, handed down — there is no second rotation
// here that could drift from it.
//
// Two pieces of text, two jobs (see view/dock/pill.ts):
//   · the caption is the LINE — the pet's voice, allowed to change on a timer;
//   · `props.status` is the TRUTH — it NAMES the dialog.  The announcement is the
//     dock's job: its live region is always mounted, so the truth is spoken once
//     per state change whether or not this panel is open.  A second live region
//     here would announce everything twice.

import { React, h } from '../../platform/deps.ts';
import { LIVE_ZOOM } from '../../skin/geometry.ts';
import { POPUP_LINE_W } from '../../platform/theme.ts';
import { translatorOrFallback } from '../../labels/index.ts';
import type { Translator } from '../../labels/index.ts';
import type { SkinSource } from '../pet-canvas.ts';
import { useReaction } from '../reaction.ts';
import { useLineScroll } from '../line-scroll.ts';
import { PetCanvas } from '../pet-canvas.ts';

/** Module-level so its identity is stable (see pet-canvas.ts). */
const BEST_SOURCE: SkinSource = { kind: 'best' };

export function DockPopup(props: {
  panelRef: unknown;
  position: Record<string, unknown> | null;
  /** The status truth: the dialog's accessible name (announced by the dock). */
  status: string;
  /** The dock's current line.  null (an empty pool) falls back to the truth. */
  line?: string | null;
  state?: string;
  t?: Translator;
  /** Report a pet up to the dock, which owns the line and the animation. */
  onPet?: () => void;
}) {
  const t = translatorOrFallback(props.t);
  const { reaction, react } = useReaction();

  // Keyboard users land inside the panel when it opens: the dialog itself is
  // focusable (tabIndex -1) and takes focus on mount.  Closing never moves focus
  // back by force — an outside click must keep the focus the user aimed at.
  const panelRef = props.panelRef as { current: HTMLElement | null } | undefined;
  React.useEffect(() => {
    const node = panelRef ? panelRef.current : null;
    if (node && typeof node.focus === 'function') node.focus();
  }, []);

  const caption = props.line || props.status;
  // 字幕也是固定宽度 + 溢出滚动（和 dock 的台词同一套）：面板锚在宠物上，字幕每
  // 一拍长短不一的话，面板会跟着一胀一缩。
  // 框宽是 CSS 里的 `POPUP_LINE_W`（面板宽度由它决定），所以几何记号直接引用同一个
  // 常量 —— 两边各写一遍就会在改宽度时悄悄错开。
  const scroll = useLineScroll<HTMLDivElement>(caption, POPUP_LINE_W);

  function onClick() {
    react('petted');
    if (props.onPet) props.onPet();
  }

  return h('div', {
    ref: props.panelRef,
    className: 'status-pet-popup',
    role: 'dialog',
    'aria-modal': 'true',
    tabIndex: -1,
    'aria-label': props.status,
    style: props.position ? props.position : { visibility: 'hidden', left: 0, top: 0 },
    onClick,
  },
    h(PetCanvas, {
      source: BEST_SOURCE,
      state: props.state,
      follow: true,
      reaction: reaction || undefined,
      zoom: LIVE_ZOOM,
      className: 'status-pet-popup-preview',
      t: props.t,
    }),
    h('div', { ref: scroll.boxRef, className: 'status-pet-popup-title' },
      h('span', {
        key: scroll.runKey,
        ref: scroll.runRef,
        className: 'status-pet-line-run' + (scroll.scrolling ? ' scrolling' : ''),
        style: scroll.style || undefined,
      }, caption))
  );
}
