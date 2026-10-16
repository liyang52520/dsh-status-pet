// The dock pill (Resident layer): a button holding the live avatar, plus its
// click popup.  The status comes from the seat props through `usePetStatus` and
// `deriveState`; the popup mechanism is the same anchored panel the host's
// "context used" meter uses.
//
// Two pieces of text live here, and they are deliberately different things:
//
//   ① the STATUS (the tooltip and the accessible name) — what the agent is
//      doing, derived from facts, short and true.  A skin change must never
//      move it.
//   ② the LINE (the dock's own label, and the popup's caption) — the pet's
//      voice, drawn from the pool of the state she is in, narrowed by the tone
//      of the action she is currently playing, and **rendered with the real
//      context** (`{file}`, `{cmd}`, `{secs}`, …) so she talks about the thing
//      you are actually doing.  The DOCK owns it: the popup is handed the very
//      same string, so the two can never drift apart.
//
// The line is the one thing the user governs here — 关闭 / 左侧 / 右侧, stored
// through skin/display.ts.

import {
  React,
  h,
  Tooltip,
  createPortal,
  useAnchoredPosition,
  useDismissOnOutsidePointer,
  POPUP_OK,
} from '../../platform/deps.ts';
import { deriveState } from '../../behavior/facts.ts';
import type { PetFacts } from '../../behavior/facts.ts';
import { renderLine, varsForFacts } from '../../behavior/context.ts';
import { STATES } from '../../behavior/vocabulary.ts';
import type { Tone } from '../../behavior/vocabulary.ts';
import { LIVE_ZOOM } from '../../skin/geometry.ts';
import { activeSkin } from '../../skin/session.ts';
import { dockLineWidth, dockText, onDockLineWidthChange, onDockTextChange } from '../../skin/display.ts';
import type { DockLineWidth, DockText } from '../../skin/display.ts';
import { DOCK_LINE_WIDTH_PX } from '../../skin/display.ts';
import { ACTION_TONES } from '../../skin/tones.ts';
import { translatorOrFallback } from '../../labels/index.ts';
import { THEME } from '../../platform/theme.ts';
import { useReaction } from '../reaction.ts';
import { usePetStatus } from '../seat.ts';
import type { DockSeatProps } from '../seat.ts';
import { PetCanvas } from '../pet-canvas.ts';
import type { SkinSource } from '../pet-canvas.ts';
import { useLine } from '../line.ts';
import { useLineScroll } from '../line-scroll.ts';
import { DockPopup } from './popup.ts';

/** Module-level so its identity is stable: a fresh source object per render
 *  re-binds the surface and restarts the animation (see pet-canvas.ts). */
const ACTIVE_SOURCE: SkinSource = { kind: 'active' };

/** 弹窗 primitives 缺席时的替身。 有了它们，两个 hook 就**无条件**被调用 ——
 *  `POPUP_OK` 在 init 之后就冻住了，但"条件式 hook 调用"本身仍然是规则违反。 */
const NO_ANCHORED_POSITION = (): Record<string, unknown> | null => null;
const NO_DISMISS = (): void => {};

/** 「状态 + 事实」签名：它一变就立即换一条台词。 刻意**不含** `{secs}` ——
 *  时间流逝不该把话头打断，秒数会在下一次重抽时刷新。 */
function lineKey(facts: PetFacts): string {
  const first = facts.tools[0];
  return [
    first ? first.name : '',
    first && first.turn !== undefined ? first.turn : '',
    first && first.step !== undefined ? first.step : '',
    facts.tools.length,
    facts.pending ? facts.pending.kind : '',
    facts.queued > 0 ? 'q' : '',
    facts.errored ? 'e' : '',
    facts.stream || '',
  ].join('|');
}

export function DockPet(props: DockSeatProps | null) {
  props = props || {};
  const t = translatorOrFallback(props.t);

  // ── What is the agent doing? ──
  const { facts, toolName, events: factEvents, eventSeq } = usePetStatus(props);
  const state = deriveState(facts);
  const skin = activeSkin();

  // ── Interactions ──
  const { reaction, react } = useReaction();
  const [open, setOpen] = React.useState(false);

  // The dock leads; the popup follows.  The face is the reaction while one is
  // playing, else the derived state.  It governs the artwork AND the line.
  const face = reaction || state;

  // ── The two things the user can move here ──
  const [place, setPlace] = React.useState<DockText>(() => dockText());
  React.useEffect(() => onDockTextChange(() => setPlace(dockText())), []);
  // 台词框有多宽（窄 / 中 / 宽）。 它是一个**固定值**：dock 那行居中，框宽要是跟着
  // 台词走，每一拍换台词都会让整条状态栏重新居中。 宽度变了 hook 会自己重量。
  const [lineWidth, setLineWidth] = React.useState<DockLineWidth>(() => dockLineWidth());
  React.useEffect(() => onDockLineWidthChange(() => setLineWidth(dockLineWidth())), []);
  // The action she is playing right now → its tone.  Reported by the surface on
  // a roll (every few seconds), never per frame.
  const [actionId, setActionId] = React.useState<string | null>(null);
  const skinTones = ACTION_TONES[skin.name];
  const tone: Tone | null = actionId && skinTones ? skinTones[actionId] || null : null;

  // ── The line ──
  // 词条里的 `{file}` `{cmd}` `{secs}` … 在这里换成这次会话真实的值；同一批变量也
  // 告诉她"你现在在哪个目标上"（话题连续），以及这是这一轮的第几步。
  const vars = varsForFacts(facts, toolName);
  // 内容签名当依赖：调用方每次渲染都会新建对象，引用当依赖会让引擎每渲染重跑一次。
  const topic = React.useMemo(
    () => ({ file: vars.file, cmd: vars.cmd, pat: vars.pat, q: vars.q }),
    [vars.file, vars.cmd, vars.pat, vars.q],
  );
  const turn = facts.tools[0] ? facts.tools[0].turn : undefined;

  // 界面边沿：你点开/关上了她。 事实边沿由 seat 检测，这里只补 UI 这一半 ——
  // 它带**自己的序号**，否则它会把上一条事实边沿重新当成新事件喂给引擎。
  const [uiEvent, setUiEvent] = React.useState<{ kind: string; seq: number } | null>(null);
  const uiSeqRef = React.useRef(0);
  const seenOpenRef = React.useRef(open);
  React.useEffect(() => {
    if (seenOpenRef.current === open) return;
    seenOpenRef.current = open;
    uiSeqRef.current += 1;
    setUiEvent({ kind: open ? 'popupOpen' : 'popupClose', seq: uiSeqRef.current });
  }, [open]);

  const lineId = useLine({
    state: face,
    key: lineKey(facts),
    tone,
    topic,
    turn,
    events: factEvents,
    eventSeq,
    uiEvents: uiEvent ? [uiEvent.kind] : [],
    uiSeq: uiEvent ? uiEvent.seq : undefined,
    running: facts.running,
    active: place !== 'off',
  });
  const line = lineId ? renderLine(t(lineId), vars) : null;
  // 台词框的宽度固定，装不下的在里面滚 —— 否则每一拍换台词都会让整条状态栏
  // （`.yhfFVG_dock` 是居中的 flex）重新居中，看起来就是"闪"。 详见 view/line-scroll.ts。
  const scroll = useLineScroll<HTMLSpanElement>(line, DOCK_LINE_WIDTH_PX[lineWidth]);

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  // Anchored popup mechanics, exactly as the host meter uses them.  Both hooks are
  // called on every render; only their input differs when the primitives are missing.
  const rootRef = React.useRef<Element | null>(null);
  const panelRef = React.useRef<HTMLElement | null>(null);
  const anchoredPosition = useAnchoredPosition || NO_ANCHORED_POSITION;
  const dismissOnOutside = useDismissOnOutsidePointer || NO_DISMISS;
  const position = POPUP_OK
    ? anchoredPosition({ open, anchorRef: rootRef, panelRef, side: 'top', gap: 8, margin: 12 })
    : null;
  dismissOnOutside(rootRef, open, setOpen, panelRef);
  React.useEffect(() => {
    if (!POPUP_OK || !open) return;
    const onKeyDown = (e: { key: string }) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      // Escape离场：焦点还给触发它的那颗按钮，键盘用户不会掉到页面顶部。
      if (buttonRef.current) buttonRef.current.focus();
    };
    document.addEventListener('keydown', onKeyDown as unknown as EventListener);
    return () => document.removeEventListener('keydown', onKeyDown as unknown as EventListener);
  }, [open]);

  function onClick() {
    if (POPUP_OK) { setOpen(!open); return; }
    react('petted');
  }
  function onWake() { if (state === 'sleep') react('woken'); }

  // ① the status: the tooltip, the accessible name, and — through the one live
  //     region below — the announcement.  Only the fallback category needs the
  //     tool's own name: every named category has a status label of its own
  //     ("在读文件…"), which is the more honest thing to say.
  //
  //     The live region lives HERE, not in the popup: the dock is always mounted,
  //     so a state change is announced once whether or not the popup is open (it
  //     used to be announced only while the popup happened to be open).  The
  //     rotating LINE never enters it.
  const named = face === 'tool' && toolName;
  const status = named ? t('toolNamed', { name: toolName }) : t(face);
  const pill = (STATES[state] && STATES[state].pill) || '';

  const buttonProps: Record<string, unknown> = {
    type: 'button',
    ref: buttonRef,
    className: 'status-pet-pill' + pill,
    'aria-label': status,
    onClick,
    onMouseEnter: onWake,
    onFocus: onWake,
  };
  if (POPUP_OK) {
    buttonProps['aria-haspopup'] = 'dialog';
    buttonProps['aria-expanded'] = open ? 'true' : 'false';
  }
  if (!Tooltip) buttonProps.title = status;

  // ② the line: visible, tinted like the rest of the dock chrome, and hidden
  // from assistive tech — the button already announces the truth, and a line
  // that changes on a timer must never be a live region.
  //
  // 盒子是固定尺寸的（`--status-pet-line-w`，用户选的窄/中/宽）：短句留一点余量、
  // 长句在里面滚动，但**宽度永远不变** —— 状态栏不会因为台词长短而左右抽动，也不会
  // 越变越长去挤旁边的 dock 项。
  //
  // `key` 是给滚动用的：换一句（或改宽度、或量出来的时长变了）就重挂一次 run，
  // 动画永远从左端、按**这一句最终**的时长跑，不会半路被改目标值。
  const label = line
    ? h('span', {
        ref: scroll.boxRef,
        className: 'status-pet-line ' + (place === 'left' ? 'left' : 'right'),
        style: { '--status-pet-line-w': DOCK_LINE_WIDTH_PX[lineWidth] + 'px' },
        'aria-hidden': 'true',
      },
        h('span', {
          key: scroll.runKey,
          ref: scroll.runRef,
          className: 'status-pet-line-run' + (scroll.scrolling ? ' scrolling' : ''),
          style: scroll.style || undefined,
        }, line))
    : null;
  const pet = h(PetCanvas, {
    source: ACTIVE_SOURCE,
    state: face,
    zoom: LIVE_ZOOM,
    scale: 1,
    interactive: false,
    lead: true,
    onAction: setActionId,
  });
  const button = h('button', buttonProps, ...(place === 'left' ? [label, pet] : [pet, label]));

  const anchor = h('span', { ref: rootRef, className: 'status-pet-anchor' },
    Tooltip ? h(Tooltip, { label: status, side: 'top', delayMs: 0, disabled: open }, button) : button,
    // The truth, announced once per state change.  Visually hidden, always mounted,
    // and separate from the rotating line (a timer-driven line must never be live).
    h('span', { className: 'status-pet-sr', role: 'status' }, status)
  );

  return h(React.Fragment, null,
    h('style', null, THEME),
    anchor,
    open && POPUP_OK && createPortal
      ? createPortal(h(DockPopup, {
          panelRef,
          position,
          state,
          status,
          line,
          t,
          // Petting in the popup pets the DOCK too, so the animation, the
          // caption and the dock label all say the same thing at the same time.
          onPet: () => react('petted'),
        }), document.body as unknown as Element)
      : null
  );
}
