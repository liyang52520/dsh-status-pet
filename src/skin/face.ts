// Face selection: which crop to draw, and how the body is derived when an action
// does not carry one.
//
// `art.body` is optional per action, so a missing body is DERIVED — the avatar
// at an exact 4× integer upscale — rather than invented.  This is the ONE
// definition of that fallback: the renderer, the filmstrip, the board and every
// thumbnail read a face through `faceFor`, so they can never disagree about what
// a body-less action looks like.

import { AVATAR_FACE, BODY_FACE, BODY_SCALE, FACES } from './geometry.ts';
import type { FaceName } from './geometry.ts';
import type { Action, Artwork, Drawing, Frame } from './model.ts';
import { blankRows, upscaleRows } from './pixels.ts';

/** Integer-upscale one face (its pixels and its accent) from the avatar to the
 *  body. */
export function upscaleDrawing(drawing: Drawing): Drawing {
  const out: Drawing = { rows: upscaleRows(drawing.rows, BODY_SCALE) };
  if (drawing.prop) {
    out.prop = {
      x: drawing.prop.x * BODY_SCALE,
      y: drawing.prop.y * BODY_SCALE,
      rows: upscaleRows(drawing.prop.rows, BODY_SCALE),
    };
  }
  return out;
}

/** The face to SHOW for a frame: the authored drawing when the action carries
 *  it, else the avatar at 4×.  Memoized per (frame, face) so a thumbnail's props
 *  stay identical across renders and its canvas is never re-parsed. */
const DERIVED = new WeakMap<object, Map<FaceName, Drawing>>();

export function faceFor(frame: Frame, face: FaceName): Drawing {
  const drawn = frame.art[face];
  if (drawn) return drawn;
  const avatar = frame.art.avatar;
  if (!avatar) return { rows: blankRows(FACES[face].size) };
  if (face !== BODY_FACE) return avatar;
  let byFace = DERIVED.get(frame);
  if (!byFace) {
    byFace = new Map();
    DERIVED.set(frame, byFace);
  }
  let hit = byFace.get(face);
  if (!hit) {
    hit = upscaleDrawing(avatar);
    byFace.set(face, hit);
  }
  return hit;
}

/** Does this action carry any body artwork? */
export function hasActionBody(action: Action): boolean {
  return action.frames.some((frame) => !!frame.art[BODY_FACE]);
}

/** Does this artwork carry a body face anywhere?  A skin without one resolves
 *  its popup from the avatar drawn at 4× — the same picture for a fraction of
 *  the work. */
export function hasBody(art: Artwork): boolean {
  return art.actions.some(hasActionBody);
}

/** The scale `dx`/`dy` is rendered at on one face: offsets are authored in
 *  avatar units, so the body moves `× 4` — the same hop on screen, and exactly
 *  the headroom its canvas reserves. */
export function offsetScale(face: FaceName): number {
  return face === BODY_FACE ? BODY_SCALE : 1;
}

/** The face to RESOLVE a request on: the asked-for one, or the avatar when the
 *  artwork carries no body. */
export function usableFace(art: Artwork, face: FaceName): FaceName {
  if (face !== BODY_FACE) return AVATAR_FACE;
  return hasBody(art) ? BODY_FACE : AVATAR_FACE;
}
