// Sprite cache — pre-renders each frame of a skin into an offscreen canvas
// ONCE, so the animation loop's per-frame cost is a single drawImage instead of
// one fillRect per pixel (up to 16,384 at 128px).
//
// The key is the SPRITE object itself.  Sprites are memoized per Frame
// (`spriteFor` in compose.ts) and artwork is immutable, so an edit to one
// action leaves every other frame's sprite identical — and this cache survives
// a stroke, a re-resolve and a skin switch without rebuilding a bitmap.  The
// palette is part of the key as well, because a frame object can legitimately
// outlive a palette that grew around it; it is stored by identity, so the
// common case (palette unchanged) is still one WeakMap lookup.
//
// WeakMap entries vanish with the sprites they describe: no manual
// invalidation, no leak.

import type { Sprite } from '../pet/skins/compose.ts';
import { draw } from './draw.ts';

interface Bitmap {
  palette: string[];
  canvas: HTMLCanvasElement;
}

const cache = new WeakMap<Sprite, Map<number, Bitmap>>();

// The pre-rendered bitmap for one sprite at one integer scale, or null when
// there is no DOM canvas (tests) — callers fall back to draw() directly.
export function spriteBitmap(
  sprite: Sprite,
  palette: string[],
  scale: number,
): HTMLCanvasElement | null {
  let byScale = cache.get(sprite);
  const hit = byScale && byScale.get(scale);
  if (hit && hit.palette === palette) return hit.canvas;
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return null;
  }
  const bitmap = document.createElement('canvas');
  bitmap.width = sprite.w * scale;
  bitmap.height = sprite.h * scale;
  const ctx = bitmap.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  draw(ctx, sprite, palette, scale, 0, 0);
  if (!byScale) {
    byScale = new Map();
    cache.set(sprite, byScale);
  }
  byScale.set(scale, { palette, canvas: bitmap });
  return bitmap;
}
