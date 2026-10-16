// A static one-frame canvas — the filmstrip's still, and the pixel board.
//
// The 动作 view's filmstrip shows an action's frames one at a time, and a STILL
// is the whole point there.  One pixel per face pixel, so the avatar upscales
// ×2 and the body downscales 2:1 — both exact under `pixelated`.
//
// `css` is the on-screen size: a number of px (the filmstrip) or any CSS length
// (`'100%'` for the board, which fills whatever the flex container decided).

import { React, h } from '../../platform/deps.ts';
import { FACES } from '../../skin/geometry.ts';
import type { FaceName } from '../../skin/geometry.ts';
import type { Drawing } from '../../skin/model.ts';
import { spriteFor } from '../../skin/pixels.ts';
import { drawSprite } from '../../platform/raster.ts';

export function FrameCanvas(props: {
  drawing: Drawing;
  palette: string[];
  face: FaceName;
  css: number | string;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const size = FACES[props.face].size;
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    // A canvas without a 2D context degrades to a blank still instead of throwing
    // out of the effect.
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawSprite(ctx, spriteFor(props.drawing), props.palette, 1, 0, 0);
  }, [props.drawing, props.palette, size]);
  const css = typeof props.css === 'number' ? props.css + 'px' : props.css;
  return h('canvas', {
    ref: canvasRef,
    width: size,
    height: size,
    'aria-hidden': true,
    style: {
      display: 'block',
      width: css,
      height: css,
      imageRendering: 'pixelated',
    },
  });
}
