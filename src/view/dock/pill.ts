// The dock pill (Resident layer): a button holding the live avatar, plus its
// click popup.  The status comes from the seat props through `usePetStatus` and
// `deriveState`; the popup mechanism is the same anchored panel the host's
// "context used" meter uses.

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
import { STATES } from '../../behavior/vocabulary.ts';
import { LIVE_ZOOM } from '../../skin/geometry.ts';
import { activeSkin } from '../../skin/session.ts';
import { translatorOrFallback } from '../../labels/index.ts';
import { THEME } from '../../platform/theme.ts';
import { useReaction } from '../reaction.ts';
import { usePetStatus } from '../seat.ts';
import type { DockSeatProps } from '../seat.ts';
import { PetCanvas } from '../pet-canvas.ts';
import { DockPopup } from './popup.ts';

export function DockPet(props: DockSeatProps | null) {
  props = props || {};
  const t = translatorOrFallback(props.t);

  // ── What is the agent doing? ──
  const { facts, toolName } = usePetStatus(props);
  const state = deriveState(facts);

  // ── Interactions ──
  const { reaction, react } = useReaction();
  const [open, setOpen] = React.useState(false);

  // The dock leads; the popup follows.  The face is the reaction while one is
  // playing, else the derived state.
  const face = reaction || state;

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  // Anchored popup mechanics, exactly as the host meter uses them.
  const rootRef = React.useRef<Element | null>(null);
  const panelRef = React.useRef<HTMLElement | null>(null);
  const position = POPUP_OK && useAnchoredPosition
    ? useAnchoredPosition({ open, anchorRef: rootRef, panelRef, side: 'top', gap: 8, margin: 12 })
    : null;
  if (POPUP_OK && useDismissOnOutsidePointer) useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef);
  React.useEffect(() => {
    if (!POPUP_OK || !open) return;
    const onKeyDown = (e: { key: string }) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKeyDown as unknown as EventListener);
    return () => document.removeEventListener('keydown', onKeyDown as unknown as EventListener);
  }, [open]);

  function onClick() {
    if (POPUP_OK) { setOpen(!open); return; }
    react('petted');
  }
  function onWake() { if (state === 'sleep') react('woken'); }

  const named = face === 'tool' && toolName;
  const title = named ? t('toolNamed', { name: toolName }) : t(face);
  const pill = (STATES[state] && STATES[state].pill) || '';
  const activeSkinNow = activeSkin();

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
    h(PetCanvas, {
      source: { kind: 'active' },
      state: face,
      zoom: LIVE_ZOOM,
      scale: 1,
      interactive: false,
      lead: true,
    })
  );

  const anchor = h('span', { ref: rootRef, className: 'status-pet-anchor' },
    Tooltip ? h(Tooltip, { label: title, side: 'top', delayMs: 0, disabled: open }, button) : button
  );

  return h(React.Fragment, null,
    h('style', null, THEME),
    anchor,
    open && POPUP_OK && createPortal
      ? createPortal(h(DockPopup, { panelRef, position, title, state, t }), document.body as unknown as Element)
      : null
  );
}