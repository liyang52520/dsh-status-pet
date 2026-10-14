// Per-canvas surface: ONE driver that sizes the backing store, feeds the pure
// tick reducer, paints through the sprite cache, and returns a disposer.
//
// Many surfaces share one rAF clock (platform/clock.ts), and a surface that is
// showing a still, single-frame animation skips the redraw entirely via a sprite
// identity dirty check — so 212 library row thumbnails cost ~0.016 ms per rAF
// tick.
//
//   roll: 'lead'   publishes the animation to the take channel every tick,
//                   so one or more followers can mirror it — that is the dock
//   roll: 'follow' mirrors the published take when state and skin match,
//                   otherwise plays freely — that is the popup
//   roll: 'free'   no coupling — cards, rows, the header preview

import { FACES } from '../skin/geometry.ts';
import type { ResolvedSkin } from '../skin/resolve.ts';
import { TUNING } from '../behavior/tuning.ts';
import { stepPlayback, createPlayback } from '../player/timeline.ts';
import type { PlaybackState } from '../player/timeline.ts';
import { leadTake, publish } from '../player/sync.ts';
import type { AnimationPolicy } from '../player/rotation.ts';
import { addTicker } from './clock.ts';
import { spriteBitmap } from './bitmap.ts';
import { drawSprite } from './raster.ts';

export type MutableRef<T> = { current: T };

const DEFAULT_POLICY: AnimationPolicy = {
  minPlays: TUNING.minPlays,
  jitter: TUNING.playJitter,
};

export type SurfaceRole = 'lead' | 'follow' | 'free';

export interface SurfaceOptions {
  /** The skin to draw, resolved to a value or null (explicit blank) every
   *  tick.  "Follow the active skin" is a view concern — the caller builds a
   *  closure over `session.activeSkin()`. */
  skin: () => ResolvedSkin | null;
  /** The state (or reaction) name — through a ref, so a change never restarts
   *  the loop. */
  state: MutableRef<string>;
  reduced: MutableRef<boolean>;
  /** Canvas px per sprite pixel at this face.  Called per tick with the
   *  resolved skin, so the scale follows the actual face the skin served. */
  scale: (skin: ResolvedSkin) => number;
  /** CSS zoom on the element only; the backing store stays unscaled. */
  zoom?: number;
  roll?: SurfaceRole;
}

/** The CSS attributes every pet canvas shares. */
export function canvasAttrs(
  pixelW: number,
  pixelH: number,
  cssW: number,
  cssH: number,
): Record<string, unknown> {
  return {
    width: pixelW,
    height: pixelH,
    style: {
      display: 'block',
      width: cssW + 'px',
      height: cssH + 'px',
      imageRendering: 'pixelated',
      pointerEvents: 'none',
      userSelect: 'none',
    },
  };
}

/** Start playing a pet surface on `canvas`.  Returns a disposer. */
export function startSurface(
  canvas: HTMLCanvasElement,
  opts: SurfaceOptions,
): () => void {
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const skinFn = opts.skin;
  const faceRef = opts.state;
  const reducedRef = opts.reduced;
  const scaleFor = opts.scale;
  const zoom = opts.zoom || 1;
  const role: SurfaceRole = opts.roll || 'free';

  const playback: PlaybackState = createPlayback(performance.now());

  let drawnSkin: ResolvedSkin | null = null;
  let drawnSpriteId: object | null = null;
  let drawnScale = 0;

  function tick(now: number): void {
    const skin = skinFn();
    if (!skin) {
      if (drawnSkin !== null || drawnSpriteId !== null) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawnSkin = null;
        drawnSpriteId = null;
      }
      return;
    }

    const currentState = faceRef.current;
    const entry = skin.states[currentState as import('../behavior/vocabulary.ts').StateName] || skin.states.idle;
    const animations = entry.animations;
    if (!animations.length) return;

    const mirrored = role === 'follow'
      ? leadTake(skin.name, currentState, animations.length, now)
      : null;

    const result = stepPlayback({
      now,
      state: currentState,
      animations,
      minDwellMs: TUNING.stateMinDwellMs,
      reduced: reducedRef.current,
      policy: DEFAULT_POLICY,
      mirror: mirrored,
    }, playback);

    if (role === 'lead') {
      publish(skin.name, currentState, result.animationIndex, result.cycleStart, now);
    }

    const frame = result.frame;
    const scale = scaleFor(skin);

    if (skin === drawnSkin && frame.sprite === drawnSpriteId && scale === drawnScale) {
      return;
    }
    drawnSkin = skin;
    drawnSpriteId = frame.sprite;
    drawnScale = scale;

    const spec = FACES[skin.face];
    const cw = spec.canvasW * scale;
    const ch = spec.canvasH * scale;

    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
      ctx.imageSmoothingEnabled = false;
    }
    const cssW = cw * zoom;
    const cssH = ch * zoom;
    if (canvas.style.width !== cssW + 'px' || canvas.style.height !== cssH + 'px') {
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
    }

    ctx.clearRect(0, 0, cw, ch);
    const bitmap = spriteBitmap(frame.sprite, skin.palette, scale);
    const dx = (spec.padX + frame.dx) * scale;
    const dy = (spec.baseY + frame.dy) * scale;
    if (bitmap) {
      ctx.drawImage(bitmap, dx, dy);
    } else {
      drawSprite(ctx, frame.sprite, skin.palette, scale, dx, dy);
    }
  }

  return addTicker(tick);
}