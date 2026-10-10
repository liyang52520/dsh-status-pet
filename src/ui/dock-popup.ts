// The dock pet's click popup (Peek layer): an anchored panel portal-ed to
// document.body by dock-pet.ts.  Position comes from the primitives'
// useAnchoredPosition; until it resolves, the panel renders hidden (the
// host's meter does the same).
//
// This is the pet's ONLY interactive surface, so the click target is the
// WHOLE panel, not just the 80×80 live canvas (64px of art): the padding and
// the caption pet the pet too, because aiming at a small canvas reads as
// "nothing happened".  The panel owns the reaction, feeds it to the one canvas,
// and echoes it in the caption, so a click is always answered twice over.

import { h } from '../host-deps.ts';
import { translatorOrFallback } from '../pet/labels.ts';
import type { Translator } from '../pet/labels.ts';
import { LIVE_ZOOM } from '../pet/grids.ts';
import { usePetReaction } from './hooks.ts';
import { PetPreview } from './pet-preview.ts';

export interface DockPopupProps {
  panelRef: unknown;
  position: Record<string, unknown> | null;
  title: string;
  t?: Translator;
}

export function DockPopup(props: DockPopupProps) {
  const t = translatorOrFallback(props.t);
  const { reaction, react } = usePetReaction();
  // The caption names the state, or the reaction while one is playing — the
  // same rule the dock pill's tooltip uses.
  const caption = reaction ? t(reaction) : props.title;

  return h('div', {
    ref: props.panelRef,
    className: 'status-pet-popup',
    role: 'dialog',
    'aria-label': caption,
    style: props.position ? props.position : { visibility: 'hidden', left: 0, top: 0 },
    onClick: () => react('petted'),
  },
    // The popup always shows the most detailed version of the skin (best),
    // animated and pettable — at the LIVE zoom, so the peek is 64px of body
    // even though it is rendered from the 128px crop.
    h(PetPreview, {
      t: props.t,
      best: true,
      zoom: LIVE_ZOOM,
      reaction: reaction || undefined,
      className: 'status-pet-popup-preview',
    }),
    h('div', { className: 'status-pet-popup-title', 'aria-live': 'polite' }, caption)
  );
}
