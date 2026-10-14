// Sprite cache — pre-renders each frame into an offscreen canvas ONCE, so the
// animation loop's per-frame cost is a single drawImage instead of one fillRect
// per pixel (up to 16,384 at 128 px).
//
// The key is the SPRITE object itself, and the palette is part of the identity
// (a frame object can legitimately outlive a palette).  Everything is WeakMap:
// entries vanish with the sprites they describe — no manual invalidation, no
// leak.

import type { Sprite } from '../skin/model.ts';
import { drawSprite } from './raster.ts';

interface BitmapEntry {
  palette: string[];
  canvas: HTMLCanvasElement;
}

const cache = new WeakMap<Sprite, Map<number, BitmapEntry>>();

/** The pre-rendered bitmap for one sprite at one integer scale, or null when
 *  there is no DOM canvas — callers fall back to `drawSprite` directly. */
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
  drawSprite(ctx, sprite, palette, scale, 0, 0);
  if (!byScale) { byScale = new Map(); cache.set(sprite, byScale); }
  byScale.set(scale, { palette, canvas: bitmap });
  return bitmap;
}