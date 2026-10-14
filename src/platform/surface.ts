// Per-canvas surface: ONE driver that sizes the backing store, feeds the pure
// tick reducer, paints through the sprite cache, and returns a disposer.
//
// Three rules keep the workspace cheap, and they are all about **not working**:
//
//   1. **Off-screen canvases are detached from the clock entirely.**  The
//      Workshop mounts 200+ canvases at once (106 library rows, the header, the
//      picker); almost none of them are in the viewport.  `watchVisibility`
//      (platform/visibility.ts) attaches this surface to the shared rAF only
//      while its canvas is inside the viewport plus a warm-up margin, so a
//      hidden row costs nothing at all — not even a call.
//   2. **The skin is resolved once, not per frame.**  A canvas showed the same
//      skin for its whole life unless a write, a chunk landing or another tab
//      moved it; all three arrive as the one `status:skin-changed` event.  So the
//      per-frame `readStored()` — 100+ localStorage reads per frame across the
//      Workshop — is gone.
//   3. **A tick that would draw the same sprite draws nothing** (the identity
//      dirty check), so a still animation is O(1) per frame.
//
//   roll: 'lead'   publishes the animation to the take channel every tick,
//                   so one or more followers can mirror it — that is the dock
//   roll: 'follow' mirrors the published take when state and skin match,
//                   otherwise plays freely — that is the popup
//   roll: 'free'   no coupling — cards, rows, the header preview

import { FACES } from '../skin/geometry.ts';
import type { ResolvedSkin } from '../skin/resolve.ts';
import { onSkinChange } from '../skin/session.ts';
import { TUNING } from '../behavior/tuning.ts';
import { stepPlayback, createPlayback } from '../player/timeline.ts';
import type { PlaybackState } from '../player/timeline.ts';
import { leadTake, publish } from '../player/sync.ts';
import type { AnimationPolicy } from '../player/rotation.ts';
import { addTicker } from './clock.ts';
import { watchVisibility } from './visibility.ts';
import { spriteBitmap } from './bitmap.ts';
import { drawSprite } from './raster.ts';

export type MutableRef<T> = { current: T };

const DEFAULT_POLICY: AnimationPolicy = {
  minPlays: TUNING.minPlays,
  jitter: TUNING.playJitter,
};

export type SurfaceRole = 'lead' | 'follow' | 'free';

export interface SurfaceOptions {
  /** The skin to draw, resolved to a value or null (explicit blank).  Called
   *  ONCE per change now, not once per tick — "follow the active skin" is still
   *  a view concern (the caller builds a closure over `session.activeSkin()`),
   *  and a change re-resolves through the skin-change event. */
  skin: () => ResolvedSkin | null;
  /** The state (or reaction) name — through a ref, so a change never restarts
   *  the loop. */
  state: MutableRef<string>;
  reduced: MutableRef<boolean>;
  /** Canvas px per sprite pixel at this face.  Called when the skin changes. */
  scale: (skin: ResolvedSkin) => number;
  /** CSS zoom on the element only; the backing store stays unscaled. */
  zoom?: number;
  roll?: SurfaceRole;
  /** Called when the ANIMATION the surface is playing changes — not every tick,
   *  only on a roll.  The dock uses it to pick a speech line for the tone she is
   *  currently in; nothing else needs it. */
  onAction?: (actionId: string) => void;
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

  /** The resolved skin, held until something actually moves it. */
  let skin: ResolvedSkin | null = null;
  let skinValid = false;

  /** The geometry of the held skin: computed on a skin change, not per tick. */
  let scale = 1;
  let specW = 0;
  let specH = 0;
  let baseY = 0;
  let padX = 0;

  let drawnSpriteId: object | null = null;
  let drawnScale = 0;
  let blanked = true;

  /** The last action reported to `onAction`, so a tick that rolled nothing is
   *  silent. */
  let reportedActionId: string | null = null;

  function currentSkin(): ResolvedSkin | null {
    if (!skinValid) {
      skin = skinFn();
      skinValid = true;
      prepare();
    }
    return skin;
  }

  /** Fold the (possibly new) skin into the canvas: scale, spec, backing store,
   *  CSS box.  A backing-store resize clears the canvas, so the sprite identity
   *  is reset and the next tick paints. */
  function prepare(): void {
    if (!skin) return;
    drawnSpriteId = null;
    blanked = false;
    scale = scaleFor(skin);
    const spec = FACES[skin.face];
    specW = spec.canvasW;
    specH = spec.canvasH;
    baseY = spec.baseY;
    padX = spec.padX;
    const cw = specW * scale;
    const ch = specH * scale;
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
  }

  function tick(now: number): void {
    const active = currentSkin();
    if (!active) {
      if (!blanked) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        blanked = true;
        drawnSpriteId = null;
      }
      return;
    }

    const currentState = faceRef.current;
    const entry = active.states[currentState as import('../behavior/vocabulary.ts').StateName]
      || active.states.idle;
    const animations = entry.animations;
    if (!animations.length) return;

    const mirrored = role === 'follow'
      ? leadTake(active.name, currentState, animations.length, now)
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
      publish(active.name, currentState, result.animationIndex, result.cycleStart, now);
    }

    // Report a ROLL, not a tick: the owner re-renders (it holds the tone), and
    // an animation is held for several plays, so this fires every few seconds.
    if (opts.onAction) {
      const action = animations[result.animationIndex % animations.length];
      const actionId = action && action.id ? action.id : null;
      if (actionId && actionId !== reportedActionId) {
        reportedActionId = actionId;
        opts.onAction(actionId);
      }
    }

    const frame = result.frame;
    if (frame.sprite === drawnSpriteId && scale === drawnScale) return;
    drawnSpriteId = frame.sprite;
    drawnScale = scale;
    blanked = false;

    const cw = specW * scale;
    const ch = specH * scale;
    ctx.clearRect(0, 0, cw, ch);
    const bitmap = spriteBitmap(frame.sprite, active.palette, scale);
    const dx = (padX + frame.dx) * scale;
    const dy = (baseY + frame.dy) * scale;
    if (bitmap) {
      ctx.drawImage(bitmap, dx, dy);
    } else {
      drawSprite(ctx, frame.sprite, active.palette, scale, dx, dy);
    }
  }

  // ── the two switches: "is it on screen?" and "did the skin move?" ──

  let detach: (() => void) | null = null;

  function start(): void {
    if (detach || disposed) return;
    detach = addTicker(tick);
  }

  function stop(): void {
    if (!detach) return;
    detach();
    detach = null;
  }

  let disposed = false;

  const unwatch = watchVisibility(canvas, (visible) => {
    if (visible) start();
    else stop();
  });

  // A write (ours or another tab's), the artwork chunk landing, a skin switch —
  // all of it arrives here as one event, and re-resolving on it is exact: the
  // store cannot have changed without one.
  const offChange = onSkinChange(() => {
    skinValid = false;
    // Re-resolve now, so the frame that follows the event is already correct.
    if (detach) currentSkin();
  });

  return () => {
    disposed = true;
    unwatch();
    offChange();
    stop();
  };
}
