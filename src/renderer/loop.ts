// The animation machinery, shared by the dock pet, the click popup and the
// settings-page previews.  Two halves:
//
//   1. ONE shared requestAnimationFrame ticker drives every pet canvas —
//      many mounted canvases still cost a single rAF loop and a single
//      visibilitychange listener.
//   2. startLoop, a per-canvas player plugged into that ticker.  It plays
//      the skin's frame animation for the current state: each frame displays
//      for its own ms, a frame's dx/dy shifts the whole sprite, and the take
//      is re-rolled on a cycle wrap — but only after the current take has
//      played its minimum (see take-rotation.ts / TUNING.takeMinPlays), so a
//      many-take state does not switch activity every couple of seconds.  A
//      STATE change still switches the artwork at once.  A dirty check skips
//      the redraw when nothing visible changed — a still single-frame state
//      costs zero canvas work per frame.

import { React } from '../host-deps.ts';
import { GRIDS } from '../pet/grids.ts';
import { TUNING } from '../pet/behavior.ts';
import type { Sprite } from '../pet/skins/compose.ts';
import { activeSkin } from '../pet/skins/store.ts';
import type { ResolvedSkin } from '../pet/skins/store.ts';
import { draw } from './draw.ts';
import { spriteBitmap } from './sprite-cache.ts';
import { advanceTake, startTake } from './take-rotation.ts';
import type { TakePolicy, TakeRotation } from './take-rotation.ts';

export interface MutableRef<T> {
  current: T;
}

// ── The shared ticker ──

type TickFn = (now: number) => void;
const tickers = new Set<TickFn>();
let raf = 0;
let watchingVisibility = false;

function frame(now: number) {
  raf = 0;
  for (const tick of Array.from(tickers)) tick(now);
  if (tickers.size) raf = requestAnimationFrame(frame);
}

function ensureRunning(): void {
  if (!raf && tickers.size && (typeof document === 'undefined' || !document.hidden)) {
    raf = requestAnimationFrame(frame);
  }
}

// A hidden tab costs nothing.
function onVisibility(): void {
  if (document.hidden) {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  } else {
    ensureRunning();
  }
}

function addTicker(tick: TickFn): () => void {
  tickers.add(tick);
  if (!watchingVisibility && typeof document !== 'undefined'
    && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', onVisibility);
    watchingVisibility = true;
  }
  ensureRunning();
  return () => {
    tickers.delete(tick);
    if (!tickers.size && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
}

// ── One animated canvas ──

export interface LoopSkinRef {
  current: ResolvedSkin | null | undefined;
}

// `scaleFor(skin)` decides how many canvas px one sprite pixel is: the dock
// draws at 1x, previews at a fixed comfortable zoom.  `skinRef` pins the
// skin source: undefined → follow the store's ACTIVE; null → explicit
// blank (a picker card for a custom slot with no artwork); an object →
// that pinned skin.  `takePinRef` pins the take index (the editor previews
// the take being edited instead of the random rotation).  `zoom` scales the
// CSS box only (see LIVE_ZOOM): the backing store always keeps one canvas
// pixel per sprite pixel.  Returns the disposer.
export function startLoop(
  canvas: HTMLCanvasElement,
  faceRef: MutableRef<string>,
  reducedRef: MutableRef<boolean>,
  scaleFor: (skin: ResolvedSkin) => number,
  skinRef?: LoopSkinRef | null,
  takePinRef?: MutableRef<number> | null,
  zoom = 1,
): () => void {
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  // A take is held for a minimum number of plays before the next roll (see
  // take-rotation.ts); a state change bypasses the hold.
  const policy: TakePolicy = { minPlays: TUNING.takeMinPlays, jitter: TUNING.takePlayJitter };

  // Playback position, wall-clock based so hidden tabs resume smoothly.
  let stateName = '';
  let cycleStart = performance.now();
  let rotation: TakeRotation = { index: 0, playsLeft: 0 };
  // When the current state started, for the minimum-dwell rule below.  It
  // starts at −∞ so the very first tick always rolls a take.
  let stateChangedAt = Number.NEGATIVE_INFINITY;

  // The dirty check's memory of the last frame actually drawn.
  let drawnSkin: ResolvedSkin | null = null;
  let drawnSprite: Sprite | null = null;
  let drawnScale = 0;

  function tick(now: number) {
    const current = faceRef.current;
    const reduced = reducedRef.current;

    const pinned = skinRef ? skinRef.current : undefined;
    const skin = pinned === undefined ? activeSkin() : pinned;
    if (skin === null) {
      // Explicit blank (the picker's empty custom card).
      if (drawnSkin !== null || drawnSprite !== null) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawnSkin = null;
        drawnSprite = null;
      }
      return;
    }

    const entry = skin.states[current] || skin.states.idle;
    if (current !== stateName) {
      // State change: the ARTWORK switches immediately (the pet reacts the
      // instant the agent does), but the playback PHASE only restarts once the
      // state has been stable for `stateMinDwellMs`.  `think` / `stream` /
      // `tool` flap while a tool call's arguments stream in, and restarting the
      // cycle on every flap meant only frame 0 ever played — a twitch instead
      // of an animation.  A shorter-lived switch keeps the clock running; the
      // cycle below simply wraps into the new state's frames.
      const dwell = now - stateChangedAt;
      stateName = current;
      stateChangedAt = now;
      if (dwell >= TUNING.stateMinDwellMs) {
        cycleStart = now;
        rotation = startTake(entry.takes.length, policy);
      } else if (rotation.index >= entry.takes.length) {
        rotation = startTake(entry.takes.length, policy);
      }
    }

    // The pinned take (editor preview) replaces the random rotation.
    const pin = takePinRef ? takePinRef.current : -1;
    const currentTake = () => entry.takes[(pin >= 0 ? pin : rotation.index) % entry.takes.length];

    // Advance within the cycle; on a wrap the take is held or re-rolled, and
    // the frame drawn is the frame the CHOSEN take starts on — the roll used to
    // happen after the take was read, so a fresh take inherited the outgoing
    // one's phase and began on its second frame.
    let take = currentTake();
    let elapsed = now - cycleStart;
    const cycle = take.frames.reduce((sum, f) => sum + f.ms, 0);
    if (elapsed >= cycle) {
      cycleStart = now;
      if (pin < 0) rotation = advanceTake(rotation, entry.takes.length, policy);
      take = currentTake();
      elapsed = 0;
    }
    const frames = take.frames;
    let frameIdx = 0;
    for (let i = 0; i < frames.length; i++) {
      if (elapsed < frames[i].ms) {
        frameIdx = i;
        break;
      }
      elapsed -= frames[i].ms;
    }

    // Reduced motion: freeze on the first frame.
    const sprite = reduced ? frames[0].sprite : frames[frameIdx].sprite;
    const scale = scaleFor(skin);

    // Dirty check: skip the redraw when nothing visible changed.
    if (skin === drawnSkin && sprite === drawnSprite && scale === drawnScale) {
      return;
    }
    drawnSkin = skin;
    drawnSprite = sprite;
    drawnScale = scale;

    const spec = GRIDS[skin.grid];
    // The backing store carries horizontal headroom on each side (`padX`), so a
    // frame's `dx` can shift the whole sprite without eating a column of
    // artwork: the sprite is drawn at `padX + dx`.
    const cw = spec.canvasW * scale;
    const ch = spec.canvasH * scale;
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
      ctx.imageSmoothingEnabled = false; // canvas state resets on resize
    }
    // The CSS box is the backing times `zoom`.  The sprite is never redrawn
    // smaller — only the element shrinks — and `zoom` is an exact integer ratio
    // (LIVE_ZOOM is 1/2 against an exactly 2×-filled artwork), so `pixelated`
    // maps every destination pixel to one source pixel instead of blurring.
    const cssW = cw * zoom;
    const cssH = ch * zoom;
    if (canvas.style.width !== cssW + 'px' || canvas.style.height !== cssH + 'px') {
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
    }

    ctx.clearRect(0, 0, cw, ch);
    const bitmap = spriteBitmap(sprite, skin.palette, scale);
    const dx = (spec.padX + sprite.dx) * scale;
    const dy = (spec.baseY + sprite.dy) * scale;
    if (bitmap) {
      ctx.drawImage(bitmap, dx, dy);
    } else {
      draw(ctx, sprite, skin.palette, scale, dx, dy);
    }
  }

  return addTicker(tick);
}

// `prefers-reduced-motion` as a ref: the loop freezes on the first frame.
export function useReducedMotion(): MutableRef<boolean> {
  const ref = React.useRef(false);
  React.useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    ref.current = query.matches;
    const onChange = () => {
      ref.current = query.matches;
    };
    if (typeof query.addEventListener === 'function') query.addEventListener('change', onChange);
    else if (typeof query.addListener === 'function') query.addListener(onChange);
    return () => {
      if (typeof query.removeEventListener === 'function') query.removeEventListener('change', onChange);
      else if (typeof query.removeListener === 'function') query.removeListener(onChange);
    };
  }, []);
  return ref;
}
