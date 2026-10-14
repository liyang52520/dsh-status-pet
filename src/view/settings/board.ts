// The 1:1 pixel board — a grid of coloured cells that shows one face of one
// frame, exactly as authored, scaled only by the flex container.
//
// It is a PICTURE: no pointer handlers, no inline geometry.  A click does
// nothing — a built-in's artwork is frozen.

import { h } from '../../platform/deps.ts';
import type { FaceName } from '../../skin/geometry.ts';
import { FACES } from '../../skin/geometry.ts';
import type { Drawing, Artwork } from '../../skin/model.ts';
import { TRANSPARENT, pixelAt } from '../../skin/pixels.ts';

export function PixelBoard(props: {
  face: FaceName;
  /** The face to draw (null when there is no artwork for this face). */
  drawing: Drawing | null;
  art: Artwork | null;
  t: (key: string) => string;
}) {
  const size = FACES[props.face].size;
  const drawing = props.drawing;

  if (!drawing) {
    return h('div', { className: 'status-pet-empty-body' },
      h('div', null, props.t('settings.emptyBody')));
  }

  return h('div', { className: 'status-pet-board-wrap status-pet-board-readonly' },
    h('div', { className: 'status-pet-grid' },
      drawing.rows.map((row, y) =>
        h('div', { className: 'status-pet-grid-row', key: y },
          Array.from({ length: size }, (_, x) => {
            const tok = pixelAt(row, x);
            const idx = tok === TRANSPARENT ? 0 : parseInt(tok, 16);
            return h('div', {
              key: x,
              className: 'status-pet-cell',
              style: { background: idx === 0 ? 'transparent' : (props.art ? props.art.palette[idx] : 'transparent') },
            });
          })
        )
      )
    )
  );
}