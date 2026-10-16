// The filmstrip — a row of still frame thumbnails that SELECTS one.
// Stepping through them is how an animation is read; each is a static
// `FrameCanvas` at the on-screen THUMB_CSS size, exact for every face.

import { React, h } from '../../platform/deps.ts';
import type { FaceName } from '../../skin/geometry.ts';
import type { Artwork, Drawing } from '../../skin/model.ts';
import { faceFor } from '../../skin/face.ts';
import type { Action, Frame } from '../../skin/model.ts';
import { FrameCanvas } from './frame-canvas.ts';

export const THUMB_CSS = 64;

function FrameThumb(props: {
  drawing: Drawing;
  palette: string[];
  face: FaceName;
  index: number;
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return h('button', {
    type: 'button',
    className: 'status-pet-frame-thumb' + (props.active ? ' active' : ''),
    'aria-pressed': props.active ? 'true' : 'false',
    'aria-label': props.label,
    onClick: props.onClick,
  }, h(FrameCanvas, {
    drawing: props.drawing,
    palette: props.palette,
    face: props.face,
    css: THUMB_CSS,
  }));
}

export function Filmstrip(props: {
  action: Action;
  face: FaceName;
  palette: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  t: (key: string, params?: Record<string, number | string>) => string;
}) {
  return h('div', { className: 'status-pet-filmstrip' },
    props.action.frames.map((frame, i) =>
      h(FrameThumb, {
        key: i,
        drawing: faceFor(frame, props.face),
        palette: props.palette,
        face: props.face,
        index: i,
        active: i === props.selectedIndex,
        label: props.t('settings.frameN', { n: i + 1 }),
        onClick: () => props.onSelect(i),
      })
    )
  );
}
