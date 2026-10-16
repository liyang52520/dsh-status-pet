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
import { AVATAR_FACE, FACES } from '../skin/geometry.ts';
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

/** The live read for one source.  A source whose kind and fields disagree resolves
 *  to `null`, which is a blank canvas with no error to show for it — so the mapping
 *  is exported to be exercised directly. */
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

/** The re-bind key for a source: its CONTENT, cheaply.
 *
 *  This used to be `JSON.stringify(source)`, which the Workshop paid 200+ times
 *  per keystroke — every row's canvas rebuilt the same string.  The key only has
 *  to distinguish sources that behave differently, and the fields below are
 *  exactly the ones `resolveSource` reads. */
export function sourceKeyOf(source: SkinSource): string {
  switch (source.kind) {
    case 'action':
      return 'a\u0000' + source.skin + '\u0000' + source.actionId + '\u0000' + (source.face || '');
    case 'skin':
      return 's\u0000' + source.name + '\u0000' + (source.face || '');
    default:
      return source.kind;
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
  //
  // The refs are written in a LAYOUT effect (before the surface effect below
  // runs), not during render: a discarded concurrent render must not leave an
  // uncommitted source behind for the surface to read.
  const sourceRef = React.useRef(source);
  const onActionRef = React.useRef(props.onAction);
  const useIsoLayoutEffect = React.useLayoutEffect || React.useEffect;
  useIsoLayoutEffect(() => {
    sourceRef.current = source;
    onActionRef.current = props.onAction;
  });
  const sourceKey = sourceKeyOf(source);

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Re-bind whenever the source CONTENT changes (that is what `sourceKey` is):
    // the closure built by `resolveSource` reads the session's live value, and the
    // surface calls it once per change, not once per frame.
    const skinFn = resolveSource(sourceRef.current);
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
    // `interactive` swaps the element between a bare <canvas> and a <button><canvas>:
    // the canvas node changes, so the surface must re-bind or it keeps ticking a
    // detached node while the visible one stays blank.
  }, [sourceKey, scaleFor, zoom, props.follow, props.lead, interactive]);

  function onClick() { react('petted'); }

  // The initial canvas size, before the surface has resolved anything.  It must be
  // the SAME geometry the surface will pick (FACES), or React's width/height
  // attributes and `prepare()` disagree and the first frames get cleared.
  const initFace: FaceName = source.kind === 'best'
    ? 'body'
    : (source.kind === 'skin' || source.kind === 'action') && source.face ? source.face : AVATAR_FACE;
  const initScale = props.scale ?? (initFace === AVATAR_FACE ? 4 : 1);
  const spec = FACES[initFace];
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
