// The dock component (Resident layer): a 32px avatar in a pill that reads
// the session's status off the seat's standard props, plus its click popup.
// The logic lives in ./hooks.ts; this file is wiring and markup.

import {
  React,
  h,
  Tooltip,
  createPortal,
  useAnchoredPosition,
  useDismissOnOutsidePointer,
  POPUP_OK,
} from '../host-deps.ts';
import { derivePetState, STATES } from '../pet/behavior.ts';
import { CSS } from './styles.ts';
import { translatorOrFallback } from '../pet/labels.ts';
import { activeSkin } from '../pet/skins/store.ts';
import { LIVE_ZOOM } from '../pet/grids.ts';
import { startLoop, useReducedMotion } from '../renderer/loop.ts';
import { usePetStatus, usePetReaction } from './hooks.ts';
import type { DockSeatProps } from './hooks.ts';
import { DockPopup } from './dock-popup.ts';

export type DockPetProps = DockSeatProps;

export function DockPet(props: DockPetProps | null) {
  props = props || {};
  const t = translatorOrFallback(props.t);

  // ── What is the agent doing? ──
  const { facts, toolName } = usePetStatus(props);
  const state = derivePetState(facts);

  // ── Interactions and transient reactions ──
  const { reaction, react } = usePetReaction();
  const [open, setOpen] = React.useState(false);

  // The animation loop reads through refs so a state change never restarts
  // it, and nothing is captured stale between frames.  The ref holds a
  // state name or a reaction name.
  const faceRef = React.useRef<string>(state);
  React.useEffect(() => {
    faceRef.current = reaction || state;
  }, [state, reaction]);

  const reducedRef = useReducedMotion();

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // The dock is the 32px avatar crop drawn 1:1 and DISPLAYED at LIVE_ZOOM —
    // 16 CSS px of art, an exact 1:2 of the rendered bitmap — so the dock pet
    // is the size it always was, on top of the finer artwork.  Big artwork
    // lives in the click popup.  The loop reads the active skin per frame, so
    // a skin swap refreshes the dock pet with no re-render and no subscription.
    return startLoop(canvas, faceRef, reducedRef, () => 1, undefined, undefined, LIVE_ZOOM);
  }, []);

  // The popup: the same mechanism as the host's "context used" meter —
  // anchored above the pet, dismissed by an outside pointer or Escape.
  // Whether the primitives exist is decided once at module init
  // (POPUP_OK), so these conditional hook calls are stable per render.
  const rootRef = React.useRef<Element | null>(null);
  const panelRef = React.useRef<HTMLElement | null>(null);
  const position = POPUP_OK && useAnchoredPosition
    ? useAnchoredPosition({ open, anchorRef: rootRef, panelRef, side: 'top', gap: 8, margin: 12 })
    : null;
  if (POPUP_OK && useDismissOnOutsidePointer) useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef);
  React.useEffect(() => {
    if (!POPUP_OK || !open) return;
    const onKeyDown = (e: { key: string }) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown as unknown as EventListener);
    return () => {
      document.removeEventListener('keydown', onKeyDown as unknown as EventListener);
    };
  }, [open]);

  function onClick() {
    // The dock pill is a peephole, not a toy: its click only opens or closes
    // the popup, so the pet never plays a reaction just because you wanted to
    // see it.  Every interaction lives inside the popup, on the big sprite.
    if (POPUP_OK) {
      setOpen(!open);
      return;
    }
    // A host without the popup primitives has nowhere else to interact, so
    // the pill stays pettable there instead of doing nothing at all.
    react('petted');
  }

  // Waking a sleeping pet works by pointer and by keyboard focus.
  function onWake() {
    if (state === 'sleep') react('woken');
  }

  const shown = reaction || state;
  // The tool state names the executing call in the tooltip when known;
  // `toolNamed` carries a `{name}` template param.
  const named = shown === 'tool' && toolName;
  const title = named ? t('toolNamed', { name: toolName }) : t(shown);
  const pill = (STATES[state] && STATES[state].pill) || '';
  const activeSkinNow = activeSkin();

  // The Tooltip wrapper clones the button and chains these handlers, so
  // the wake and pet triggers keep working.  The native `title` is only
  // the fallback: with Tooltip present it would stack a second, delayed
  // native bubble on top of the instant one.  The tooltip is disabled
  // while the popup is open (the meter does the same).
  const buttonProps: Record<string, unknown> = {
    type: 'button',
    className: 'status-pet-pill' + pill,
    'aria-label': title,
    onClick,
    onMouseEnter: onWake,
    onFocus: onWake,
  };
  if (POPUP_OK) {
    buttonProps['aria-haspopup'] = 'dialog';
    buttonProps['aria-expanded'] = open ? 'true' : 'false';
  }
  if (!Tooltip) buttonProps.title = title;
  const button = h('button', buttonProps,
    h('canvas', {
      ref: canvasRef,
      // The backing store is the full 32px avatar crop; the CSS box is the LIVE
      // size (16px of art).  The pixel attribute pair stays 1:1 so the drawn
      // bitmap keeps every rendered pixel.
      width: activeSkinNow.canvasW,
      height: activeSkinNow.canvasH,
      'aria-hidden': true,
      style: {
        display: 'block',
        width: activeSkinNow.canvasW * LIVE_ZOOM + 'px',
        height: activeSkinNow.canvasH * LIVE_ZOOM + 'px',
        imageRendering: 'pixelated',
        pointerEvents: 'none',
        userSelect: 'none',
      },
    })
  );

  // The anchor span carries rootRef because Tooltip clones the button and
  // may attach its own ref for positioning its bubble.
  const anchor = h('span', { ref: rootRef, className: 'status-pet-anchor' },
    Tooltip ? h(Tooltip, { label: title, side: 'top', delayMs: 0, disabled: open }, button) : button
  );

  return h(React.Fragment, null,
    h('style', null, CSS),
    anchor,
    open && POPUP_OK && createPortal
      ? createPortal(h(DockPopup, { panelRef, position, title, t }), document.body as unknown as Element)
      : null
  );
}
