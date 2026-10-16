// The pet's body plan: two faces, and the geometry each one is drawn with.
//
// A face is a CROP of the character, not a scaling: the avatar is the head
// window the dock shows, the body is the whole character the popup shows.
// `body.size` is exactly 4 × `avatar.size`, which is what makes the avatar→body
// fallback an exact integer upscale and lets one authored gesture mean the same
// hop on both faces (offsets are authored in avatar units — see skin/face.ts).
//
// A canvas is LARGER than its face on both axes, so a frame's `dx`/`dy` has
// headroom: `baseY` above, the remainder below, `padX` on each side (the sprite
// draws at `padX + dx`).  `maxOffset === padX` is the invariant re-derived from the
// real artwork (test/skin.test.ts), so a legal offset can never clip a pixel.

export type FaceName = 'avatar' | 'body';

/** Both faces, in the order the Workshop's face switch lists them. */
export const FACE_NAMES: readonly FaceName[] = ['avatar', 'body'];

export const AVATAR_FACE: FaceName = 'avatar';
export const BODY_FACE: FaceName = 'body';

export interface FaceSpec {
  /** The face's square size in sprite pixels. */
  size: number;
  /** Backing-store height: the face plus its vertical headroom. */
  canvasH: number;
  /** Headroom above the face. */
  baseY: number;
  /** Horizontal headroom on EACH side. */
  padX: number;
  /** Max |dx| / |dy| a frame may declare, in sprite pixels. */
  maxOffset: number;
  /** Backing-store width: the face plus its horizontal headroom. */
  canvasW: number;
}

export const FACES: Record<FaceName, FaceSpec> = {
  avatar: { size: 32, canvasH: 40, baseY: 4, padX: 4, maxOffset: 4, canvasW: 40 },
  body: { size: 128, canvasH: 160, baseY: 16, padX: 16, maxOffset: 16, canvasW: 160 },
};

/** Integer upscale factor from the avatar face to the body face. */
export const BODY_SCALE = FACES.body.size / FACES.avatar.size; // 4

/** Display zoom of the pet in the two LIVE layers — the dock pill and the click
 *  popup: exactly half the rendered crop, i.e. 16 CSS px of avatar and 64 CSS px
 *  of body.  A pure 1:2 CSS downscale of the SAME rendered pixels (the sprite is
 *  never re-rendered smaller), so `image-rendering: pixelated` resolves every
 *  destination pixel to one source pixel. */
export const LIVE_ZOOM = 1 / 2;

export function isFaceName(value: unknown): value is FaceName {
  return value === 'avatar' || value === 'body';
}

/** The face a request falls back to: the body only exists when the artwork
 *  carries one. */
export function fallbackFace(face: FaceName): FaceName {
  return isFaceName(face) ? face : AVATAR_FACE;
}
