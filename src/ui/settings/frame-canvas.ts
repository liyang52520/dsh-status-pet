// A static one-frame canvas — the Workshop's thumbnail.
//
// Both tabs need the same picture: the studio's filmstrip shows an action's
// frames, and the 关联 list shows one representative frame per action so the
// row is recognisable.  It lives beside them rather than in either one, so the
// editor does not have to be imported just to draw a 40px thumbnail.
//
// The canvas back is one pixel per grid pixel (32 or 128), so the 32px avatar
// upscales ×2 and the 128px body downscales 2:1 — both exact, both crisp under
// `pixelated`.

import { React, h } from '../../host-deps.ts';
import { GRIDS } from '../../pet/grids.ts';
import { draw } from '../../renderer/draw.ts';
import { spriteFor } from '../../pet/skins/store.ts';
import type { Frame } from '../../pet/skins/store.ts';

/** The filmstrip's fixed on-screen size. */
export const THUMB_CSS = 64;
/** The library row's smaller thumbnail. */
export const ROW_THUMB_CSS = 40;

/** A static frame drawn into a canvas (one draw per change). */
export function FrameCanvas(props: { frame: Frame; palette: string[]; grid: number; css: number }) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const size = GRIDS[props.grid].grid;
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // `spriteFor` memoizes by the frame object, so a thumbnail that comes back
    // (undo, re-selecting an action) redraws a sprite that is already parsed.
    draw(ctx, spriteFor(props.frame), props.palette, 1, 0, 0);
  }, [props.frame, props.palette]);
  return h('canvas', {
    ref: canvasRef,
    width: size,
    height: size,
    'aria-hidden': true,
    style: {
      display: 'block',
      width: props.css + 'px',
      height: props.css + 'px',
      imageRendering: 'pixelated',
    },
  });
}
