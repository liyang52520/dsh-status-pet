// The click popup (Peek layer): an anchored panel portal-ed to document.body
// by the dock pill.  Position comes from `useAnchoredPosition`; until it
// resolves the panel renders hidden.
//
// The popup is the pet's ONLY interactive surface — its `onClick` covers the
// whole panel, not just the 64px sprite, so the padding and the caption pet
// the pet too.  The panel owns the reaction, feeds it to the one canvas, and
// echoes it in the caption.
//
// It shows THE SAME animation the dock is playing: it pins the dock's derived
// state and follows the take channel, so the big picture is not a second,
// independently rolled pet.

import { h } from '../../platform/deps.ts';
import { LIVE_ZOOM } from '../../skin/geometry.ts';
import { translatorOrFallback } from '../../labels/index.ts';
import type { Translator } from '../../labels/index.ts';
import { useReaction } from '../reaction.ts';
import { PetCanvas } from '../pet-canvas.ts';

export function DockPopup(props: {
  panelRef: unknown;
  position: Record<string, unknown> | null;
  title: string;
  state?: string;
  t?: Translator;
}) {
  const t = translatorOrFallback(props.t);
  const { reaction, react } = useReaction();

  const caption = reaction ? t(reaction) : props.title;

  return h('div', {
    ref: props.panelRef,
    className: 'status-pet-popup',
    role: 'dialog',
    'aria-label': caption,
    style: props.position ? props.position : { visibility: 'hidden', left: 0, top: 0 },
    onClick: () => react('petted'),
  },
    h(PetCanvas, {
      source: { kind: 'best' },
      state: props.state,
      follow: true,
      reaction: reaction || undefined,
      zoom: LIVE_ZOOM,
      className: 'status-pet-popup-preview',
      t: props.t,
    }),
    h('div', { className: 'status-pet-popup-title', 'aria-live': 'polite' }, caption)
  );
}