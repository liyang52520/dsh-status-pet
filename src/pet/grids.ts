// Grids — the pet's body plan: geometry per sprite grid.
//
// Two grids exist because they are two CROPS of the character, not two
// scalings: the 32px grid is the avatar (dock), the 128px grid is the full
// body (popup).  128 = 32 × 4, so a skin without full-body artwork falls
// back to the avatar at a crisp 4× integer upscale — and the editor can
// seed a 128px draft from the 32px avatar the same way.
//
// Both grids grew from 16/64 in the same step, so every ratio is unchanged:
// one sprite pixel is still one CSS pixel at the dock (32px of art) and the
// popup's full body is 128px of art.  Stored artwork is upscaled by the v6
// migration; built-in blocks are upscaled at load.
//
// `headroom` bounds the per-frame dx/dy offset: a frame is drawn at
// (baseY + dy), so |dx| and |dy| may not exceed headroom without clipping.
// The suite recomputes this from real sprites and fails on overflow.

export interface GridSpec {
  grid: number;
  canvasH: number;
  baseY: number;
  /** Horizontal headroom on EACH side, in sprite pixels.  Without it a frame's
   * `dx` would push real artwork off the canvas edge (the canvas was exactly
   * `grid` wide, so a ±1 sway ate a column of pixels and a prop could leave the
   * frame); with `padX === maxOffset` every legal offset and every in-grid prop
   * is provably inside the canvas. */
  padX: number;
  /** Max |dx| / |dy| a frame may declare (in sprite pixels). */
  maxOffset: number;
  /** Backing-store size: the grid plus its horizontal headroom. */
  canvasW: number;
}

export const GRIDS: Record<number, GridSpec> = {
  32: { grid: 32, canvasH: 40, baseY: 4, padX: 4, maxOffset: 4, canvasW: 40 },
  128: { grid: 128, canvasH: 160, baseY: 16, padX: 16, maxOffset: 16, canvasW: 160 },
};

/** The avatar grid — the dock always shows this one. */
export const AVATAR_GRID = 32;
/** The full-body grid — the popup prefers this one. */
export const BODY_GRID = 128;
/** Integer upscale factor from avatar to body, used by the fallback. */
export const BODY_FALLBACK_SCALE = BODY_GRID / AVATAR_GRID; // 4

/** Display zoom of the pet in the two LIVE layers — the dock pill (Resident)
 *  and the click popup (Peek): exactly half the rendered crop, i.e. 16 CSS px
 *  of avatar (from the 32px grid) and 64 CSS px of body (from the 128px grid).
 *
 *  This is a pure 1:2 CSS downscale of the SAME rendered pixels — the sprite is
 *  never re-rendered smaller — so `image-rendering: pixelated` resolves every
 *  destination pixel to one source pixel.  The built-in artwork is an exact 2×
 *  fill of its authored crops, so the live pet lands back on its original
 *  pixels: the size it always had, still sharp.
 *
 *  The Workshop (settings gallery, skin cards, the studio's board and preview)
 *  deliberately keeps 1:1, so there every rendered pixel is visible — which is
 *  the whole point of having raised the grids. */
export const LIVE_ZOOM = 1 / 2;
