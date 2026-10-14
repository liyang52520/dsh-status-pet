// <PetCanvas> — the ONE animated element.  The dock, the popup, the skin cards,
// the row thumbnails and the header preview all render through it.
//
//   source   where the skin comes from, discriminately:
//              {kind:'active'}     the dock's own skin
//              {kind:'best'}       the popup — body when available
//              {kind:'skin',name,face}   a named skin (cards, state header)
//              {kind:'action',skin,actionId,face}  one action (thumbs, hover preview)
//   state    the state or reaction to play (default: 'idle')
//   reaction an owner-driven transient reaction (the popup feeds this)
//   follow   mirror the dock's take and phase (the popup)
//   zoom     CSS scale applied to the finished canvas (LIVE_ZOOM for the live
//            layers; 1 for the Workshop).  The sprite is never re-rendered
//            smaller — only the element shrinks, so `pixelated` stays crisp.
//   scale    canvas px per sprite px (default depends on face: avatar→4, body→1)
//   interactive  when false the canvas is bare — no button, no tooltip, no
//                click-to-pet — for cards and rows that sit inside their own
//                clickable wrappers.

import { React, h, Tooltip } from '../platform/deps.ts';
import { AVATAR_FACE } from '../skin/geometry.ts';
import type { FaceName } from '../skin/geometry.ts';
import type { ResolvedSkin } from '../skin/resolve.ts';
import { activeSkin, bestSkin, skinFor, actionSkinFor, onSkinChange } from '../skin/session.ts';
import { startSurface, canvasAttrs } from '../platform/surface.ts';
import type { MutableRef } from '../platform/surface.ts';
import { useReaction } from './reaction.ts';
import { useReducedMotion } from './reduce-motion.ts';
import { translatorOrFallback } from '../labels/index.ts';
import type { Translator } from '../labels/index.ts';

// ── skin source ──

export type SkinSource =
  | { kind: 'active' }
  | { kind: 'best' }
  | { kind: 'skin'; name: string; face?: FaceName }
  | { kind: 'action'; skin: string; actionId: string; face?: FaceName };

/** The live read for one source.  Exported so a test can drive the very mapping
 *  the component uses — a source whose kind and fields disagree resolves to
 *  `null`, which is a blank canvas with no error to show for it. */
export function resolveSource(source: SkinSource): () => ResolvedSkin | null {
  switch (source.kind) {
    case 'active':
      return () => activeSkin();
    case 'best':
      return () => bestSkin();
    case 'skin': {
      const face = source.face || AVATAR_FACE;
      return () => skinFor(source.name, face);
    }
    case 'action': {
      const face = source.face || AVATAR_FACE;
      return () => actionSkinFor(source.skin, face, source.actionId);
    }
  }
}

// ── the component ──

export interface PetCanvasProps {
  source?: SkinSource;
  state?: string;
  reaction?: string;
  /** Mirror the dock's take — the popup. */
  follow?: boolean;
  /** Publish the take for followers — the dock. */
  lead?: boolean;
  scale?: number;
  zoom?: number;
  interactive?: boolean;
  className?: string;
  /** Report a roll of the animation (the dock picks a speech line for that
   *  action's tone).  Fires on a roll only, never per frame. */
  onAction?: (actionId: string) => void;
  t?: Translator;
}

export function PetCanvas(props: PetCanvasProps) {
  const source = props.source || { kind: 'active' };
  const pinnedState = props.state;
  const interactive = props.interactive !== false;
  const t = translatorOrFallback(props.t);
  const zoom = props.zoom || 1;

  const { reaction, react } = useReaction();
  const outerReaction = props.reaction;

  const faceRef = React.useRef('idle');
  React.useEffect(() => {
    faceRef.current = outerReaction || reaction || pinnedState || 'idle';
  }, [outerReaction, reaction, pinnedState]);

  const reducedRef = useReducedMotion();

  // The surface's scale function: the old default is 4× for the avatar face
  // (a 32px grid on an 80px canvas), 1× for the body face or a format-scaled
  // override mapped through this prop.
  //
  // Stable identity is load-bearing: the effect below re-binds on a scale change,
  // so a fresh closure per render would tear the surface down — and restart the
  // animation from frame 0 — every time the owner re-renders (which the dock now
  // does whenever a new speech line or a new action lands).
  const scaleFor = React.useCallback(
    (skin: ResolvedSkin): number => props.scale ?? (skin.face === AVATAR_FACE ? 4 : 1),
    [props.scale],
  );

  // Same reason: the source object is written inline at every call site, so its
  // IDENTITY changes on every render while its CONTENT does not.  Re-bind on the
  // serialized content, and read the live object from a ref.
  const sourceRef = React.useRef(source);
  sourceRef.current = source;
  const sourceKey = JSON.stringify(source);

  // The owner's roll callback, read through a ref so it never re-binds either.
  const onActionRef = React.useRef(props.onAction);
  onActionRef.current = props.onAction;

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Re-bind on every source change, because the skin closure is captured in
    // resolveSource at the call site, not here.  The source object changes, but
    // the *function* inside it must be re-evaluated.
    const skinFn = resolveSource(sourceRef.current);
    // Attach when the skin registry changes, the surface needs a re-tick;
    // the loop already resolves per-frame, so a fresh closure is not needed
    // as long as the function calls the session's live read.  But skinFor
    // calls resolveFor(readStored(),...), which IS per-frame.  And bestSkin
    // calls readStored() per tick.  So the closure is stable — no source
    // key needed here.
    const roll = props.lead ? 'lead' as const : props.follow ? 'follow' as const : 'free' as const;
    return startSurface(canvas, {
      skin: skinFn,
      state: faceRef,
      reduced: reducedRef,
      scale: scaleFor,
      zoom,
      roll,
      onAction: (id) => { const fn = onActionRef.current; if (fn) fn(id); },
    });
  }, [sourceKey, scaleFor, zoom, props.follow, props.lead]);

  function onClick() { react('petted'); }

  // The initial canvas size: the smallest the surface may be, in case the skin
  // is not yet resolved.
  const face = (source as any).face || AVATAR_FACE;
  // For initial sizing before the first frame, choose a reasonable face:
  // show the body for best, avatar for everything else.  The surface resizes
  // properly on the first tick.
  const initFace: FaceName = source.kind === 'best' ? 'body' : face;
  const initScale = props.scale ?? (initFace === AVATAR_FACE ? 4 : 1);
  const spec = { avatar: { size: 32, canvasW: 40, canvasH: 40 }, body: { size: 128, canvasW: 160, canvasH: 160 } }[initFace] || { size: 32, canvasW: 40, canvasH: 40 };
  const pw = spec.canvasW * initScale;
  const ph = spec.canvasH * initScale;
  const attr = canvasAttrs(pw, ph, pw * zoom, ph * zoom);

  if (!interactive) {
    return h('canvas', { ref: canvasRef, 'aria-hidden': true, ...attr });
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
    h('canvas', { ref: canvasRef, 'aria-hidden': true, ...attr })
  );
  return Tooltip ? h(Tooltip, { label, side: 'top', delayMs: 0 }, button) : button;
}