// ActionThumb — a PLAYING thumbnail of one action, at row size.
//
// The library is 106 different animations and a still of frame 0 is the least
// informative frame there is — a bob, a blink and a prop arrive later.  So a
// row plays its action, on the shared ticker, with the dirty check keeping it
// cheap: 212 of these cost ~0.016 ms per rAF tick.

import { h } from '../../platform/deps.ts';
import { AVATAR_FACE } from '../../skin/geometry.ts';
import type { FaceName } from '../../skin/geometry.ts';
import { PetCanvas } from '../pet-canvas.ts';

export function ActionThumb(props: { skin: string; actionId: string; face?: FaceName }) {
  return h(PetCanvas, {
    source: { kind: 'action', skin: props.skin, actionId: props.actionId, face: props.face ?? AVATAR_FACE },
    scale: 1,
    interactive: false,
  });
}