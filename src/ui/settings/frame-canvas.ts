// A static one-frame canvas — the filmstrip's still.
//
// The 动作 view's filmstrip shows an action's frames one at a time, and a STILL
// is the whole point there: each thumbnail stands for exactly one frame, and
// stepping through them is how an animation is read.  (The library rows are the
// opposite case and play their action instead — see action-thumb.ts.)
//
// The canvas back is one pixel per grid pixel (32 or 128), so the 32px avatar
// upscales ×2 and the 128px body downscales 2:1 — both exact, both crisp under
// `pixelated`.

import { React, h } from '../../host-deps.ts';
import { GRIDS } from '../../pet/grids.ts';
import { draw } from '../../renderer/draw.ts';
import { spriteFor } from '../../pet/skins/store.ts';
import type { Cell } from '../../pet/skins/store.ts';

/** The filmstrip's fixed on-screen size. */
export const THUMB_CSS = 64;

/** A static frame drawn into a canvas (one draw per change).  The frame is a
 *  FACE — a v9 `Cell` (rows plus an optional accent) at one crop. */
export function FrameCanvas(props: { frame: Cell; palette: string[]; grid: number; css: number }) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const size = GRIDS[props.grid].grid;
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // `spriteFor` memoizes by the frame object, so a thumbnail that comes back
    // redraws a sprite that is already parsed.
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
