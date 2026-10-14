// The 1:1 pixel board — the picture of one face of one frame, exactly as
// authored.
//
// It is a PICTURE: no pointer handlers, no inline geometry.  A click does
// nothing — a built-in's artwork is frozen.
//
// It used to be 16,384 `<div>`s (one per cell of a 128×128 face), each with its
// own inset hairline: switching the face to 全身 built a quarter of a million
// style declarations in one commit and froze the pane for ~100 ms.  Now it is
// TWO nodes:
//
//   * a canvas at the face's own resolution, drawn once per (drawing, palette)
//     and upscaled by CSS with `image-rendering:pixelated` — the sprite is never
//     re-rasterized, the compositor does the scaling;
//   * a CSS graticule (`.status-pet-grid::after`) whose pitch is `100% / size`,
//     so the cell grid stays a 1 CSS px mesh at any board size.
//
// Same picture, four orders of magnitude fewer nodes, and drawing it is a paint
// instead of a layout of sixteen thousand boxes.

import { h } from '../../platform/deps.ts';
import type { FaceName } from '../../skin/geometry.ts';
import { FACES } from '../../skin/geometry.ts';
import type { Artwork, Drawing } from '../../skin/model.ts';
import { FrameCanvas } from './frame-canvas.ts';

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
    h('div', {
      className: 'status-pet-grid',
      style: { '--status-pet-grid-n': String(size) },
    },
      h(FrameCanvas, {
        drawing,
        palette: props.art ? props.art.palette : [],
        face: props.face,
        css: '100%',
      })
    )
  );
}
