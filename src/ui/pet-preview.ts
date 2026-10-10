// PetPreview — the ONE component that plays the pet outside the dock.
// The loop plays the skin's frame animation for the current state: takes
// re-roll randomly per cycle; `takeIndex` pins one take (the editor
// previews the take being edited).
// Optional props cover every usage:
//
//   skinName    pin a named skin ('whale-chan', 'cat', 'custom') instead of
//               following the active skin — the picker's cards.  A custom
//               slot without data draws a blank canvas.
//   best        pin the most-detailed resolution (HD grid when present) —
//               the click popup.
//   crop        pin the ACTIVE skin to one crop (32 | 128) — the settings
//               gallery's 32/128 switch; same as `best` but at a chosen crop.
//   state       pin a state name, showing its real face AND motion — the
//               settings state gallery.  Without it the pet idles and is
//               pettable.
//   reaction    a transient reaction owned by the caller (the popup pets from
//               anywhere in its panel); it outranks the pinned state and the
//               component's own click reaction.
//   scale       draw scale override (the cards pass one; previews default to
//               4× for the 32px avatar grid and 1× for the 128px body grid,
//               so both crops land on the same 128px of art).
//   interactive false renders a bare decorative canvas (no button, no
//               tooltip, no petting) — for cards and gallery cells, which
//               already live inside their own clickable wrappers.
//
// Same shared loop as the dock pet; every variant follows skin changes live.

import { React, h, Tooltip } from '../host-deps.ts';
import { GRIDS, AVATAR_GRID, BODY_GRID } from '../pet/grids.ts';
import { translatorOrFallback } from '../pet/labels.ts';
import type { Translator } from '../pet/labels.ts';
import { activeSkin, resolveBestSkin, resolveNamedSkin, resolveTakeSkin, onSkinChange } from '../pet/skins/store.ts';
import type { ResolvedSkin } from '../pet/skins/store.ts';
import { startLoop, useReducedMotion } from '../renderer/loop.ts';
import type { MutableRef } from '../renderer/loop.ts';
import { usePetReaction } from './hooks.ts';

export interface PetPreviewProps {
  skinName?: string;
  /** With skinName: which crop to resolve (default: the 32px avatar). */
  grid?: number;
  best?: boolean;
  /** Pin the ACTIVE skin to one crop (32 = the avatar, 128 = the full body).
   * What the settings gallery's 32/128 switch uses: a viewing preference, so
   * the 32px crop is drawn at 4× and both land on the same on-screen size.
   * Unlike `grid`, it follows the active skin (it is what `best` does, at a
   * chosen crop); a missing body falls back to the avatar. */
  crop?: number;
  state?: string;
  /** A transient reaction handed down by the owner (the popup pets the pet
   * from anywhere in its panel, so the reaction lives there and is fed to the
   * one canvas).  It outranks the pinned state exactly like the component's
   * own click reaction, and expires with the owner's timer. */
  reaction?: string;
  /** Pin the take index (the loop's rotation pin). */
  takeIndex?: number;
  /** Pin ONE LIBRARY ACTION by its id — the Workshop's "look at this action"
   * preview, used by the studio (editing that action) and by the 按动作 gallery
   * (browsing the library, including actions no state plays yet).  It resolves
   * a single-action skin, so it works alongside `skinName` (the studio) and
   * `crop` (the gallery), and it takes precedence over both. */
  takeId?: string;
  /** How many canvas px one sprite pixel occupies. */
  scale?: number;
  /** CSS zoom applied to the finished canvas (LIVE_ZOOM for the dock popup:
   *  64px of body instead of 128).  The sprite is still rendered 1:1 — only the
   *  element shrinks, by an exact ratio, so `pixelated` stays sharp.  The
   *  Workshop leaves it at 1 so every rendered pixel is visible. */
  zoom?: number;
  interactive?: boolean;
  className?: string;
  t?: Translator;
}

export function PetPreview(props: PetPreviewProps | null) {
  props = props || {};
  const skinName = props.skinName;
  const best = !!props.best;
  const crop = props.crop;
  const pinnedState = props.state;
  const interactive = props.interactive !== false;
  const t = translatorOrFallback(props.t);

  const { reaction, react } = usePetReaction();
  const zoom = props.zoom || 1;

  // The loop reads through refs, so a state/reaction change never restarts
  // it.  A pinned state wins over idling; a reaction — the owner's or this
  // component's own click — wins over both while it lasts.
  const outerReaction = props.reaction;
  const faceRef = React.useRef('idle');
  React.useEffect(() => {
    faceRef.current = outerReaction || reaction || pinnedState || 'idle';
  }, [outerReaction, reaction, pinnedState]);

  const reducedRef = useReducedMotion();
  const skinRef: MutableRef<ResolvedSkin | null | undefined> = React.useRef(null);
  const takePinRef = React.useRef(props.takeIndex ?? -1);
  React.useEffect(() => {
    takePinRef.current = props.takeIndex ?? -1;
  }, [props.takeIndex]);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scaleFor = (skin: ResolvedSkin) =>
      props.scale || (skin.grid === AVATAR_GRID ? 4 : 1);
    const takeId = props.takeId;
    // Nothing pinned: follow the store's ACTIVE skin per frame (the store keeps
    // it fresh), which needs no subscription at all.
    if (takeId === undefined && skinName === undefined && !crop && !best) {
      skinRef.current = undefined;
      return startLoop(canvas, faceRef, reducedRef, scaleFor, null, takePinRef, zoom);
    }
    // One resolver for every pinned shape.  A pinned ACTION outranks the rest:
    // it is a whole skin of one action, so it fits `skinName` (the studio) and
    // `crop` (the gallery) alike.
    const update = () => {
      const name = skinName !== undefined ? skinName : activeSkin().name;
      if (takeId !== undefined) {
        const want = props.grid || crop || AVATAR_GRID;
        skinRef.current = resolveTakeSkin(name, want, takeId)
          || (want === BODY_GRID ? resolveTakeSkin(name, AVATAR_GRID, takeId) : null)
          || resolveNamedSkin(name, props.grid);
        return;
      }
      if (skinName !== undefined) {
        // Pinned to a named skin; null resolution = blank card.
        skinRef.current = resolveNamedSkin(skinName, props.grid);
        return;
      }
      if (crop) {
        // The active skin at a chosen crop: the 32px avatar is drawn at 4× by
        // `scaleFor`, and a body-less skin resolves the avatar for the 128px
        // request, so both settings land on the same on-screen size.  `zoom` is
        // the LIVE display factor and leaves the rendered pixels untouched.
        // Body first, then the avatar: a skin without a body falls back to its
        // own 32px crop at 4× rather than to another skin's artwork.
        skinRef.current = resolveNamedSkin(name, crop)
          || (crop === BODY_GRID ? resolveNamedSkin(name, AVATAR_GRID) : null)
          || resolveBestSkin();
        return;
      }
      skinRef.current = resolveBestSkin();
    };
    update();
    const unsubSkin = onSkinChange(update);
    const stopLoop = startLoop(canvas, faceRef, reducedRef, scaleFor, skinRef, takePinRef, zoom);
    return () => {
      stopLoop();
      unsubSkin();
    };
  }, [skinName, best, crop, props.scale, props.zoom, props.grid, props.takeId]);

  function onClick() {
    react('petted');
  }

  // Initial canvas size; the loop resizes to the exact grid × scale on the
  // first frame (a skin that resolves to its other crop replaces these).  The
  // width includes the grid's horizontal headroom (`padX`), like the loop's.
  const initGrid = props.grid || crop || AVATAR_GRID;
  const initScale = props.scale || (initGrid === AVATAR_GRID ? 4 : 1);
  const initW = GRIDS[initGrid].canvasW * initScale;
  const initH = GRIDS[initGrid].canvasH * initScale;
  const canvasStyle = {
    display: 'block',
    width: initW * zoom + 'px',
    height: initH * zoom + 'px',
    imageRendering: 'pixelated',
    pointerEvents: 'none',
    userSelect: 'none',
  };

  if (!interactive) {
    return h('canvas', {
      ref: canvasRef,
      width: initW,
      height: initH,
      'aria-hidden': true,
      style: canvasStyle,
    });
  }

  const label = t('settings.previewHint');
  const buttonProps: Record<string, unknown> = {
    type: 'button',
    className: props.className || 'status-pet-preview-button',
    'aria-label': label,
    onClick,
  };
  if (!Tooltip) buttonProps.title = label;
  const button = h('button', buttonProps,
    h('canvas', {
      ref: canvasRef,
      width: initW,
      height: initH,
      'aria-hidden': true,
      style: canvasStyle,
    })
  );
  return Tooltip ? h(Tooltip, { label, side: 'top', delayMs: 0 }, button) : button;
}
