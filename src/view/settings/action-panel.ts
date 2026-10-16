// The 动作 view — the skin's whole animation library, one action at a time,
// full width.  It LOOKS, never writes: the artwork is authored and frozen.
//
//   * the PICKER searches, previews and selects the action on the board;
//   * the BOARD is a 1:1 pixel grid beside the action's own live preview;
//   * the FILMSTRIP steps through the frames of the selected action.

import { React, h } from '../../platform/deps.ts';
import { AVATAR_FACE, BODY_FACE, FACE_NAMES } from '../../skin/geometry.ts';
import type { FaceName } from '../../skin/geometry.ts';
import { LIVE_ZOOM } from '../../skin/geometry.ts';
import { documentOf, libraryOf } from '../../skin/documents.ts';
import type { ActionInfo } from '../../skin/library.ts';
import type { Action, Artwork } from '../../skin/model.ts';
import { faceFor } from '../../skin/face.ts';
import { translatorOrFallback } from '../../labels/index.ts';
import type { Translator } from '../../labels/index.ts';
import { PetCanvas } from '../pet-canvas.ts';
import { ActionPicker } from './action-picker.ts';
import { PixelBoard } from './board.ts';
import { Filmstrip } from './filmstrip.ts';
import { field } from './field.ts';

export function ActionViewer(props: {
  t?: Translator;
  skin: string;
  face?: FaceName;
  onFaceChange?: (face: FaceName) => void;
  actionId?: string;
  onActionChange?: (id: string) => void;
}) {
  const t = translatorOrFallback(props.t);
  const skin = props.skin;
  const face = props.face === BODY_FACE ? BODY_FACE : AVATAR_FACE;

  const [frameIdx, setFrameIdx] = React.useState(0);
  React.useEffect(() => { setFrameIdx(0); }, [skin]);

  const library: ActionInfo[] = libraryOf(skin);
  const art: Artwork | null = documentOf(skin);
  const selectedId = library.some((a) => a.id === props.actionId)
    ? props.actionId!
    : (library[0]?.id || '');
  const action: Action | null = art ? art.actions.find((a) => a.id === selectedId) || null : null;
  const frames = action ? action.frames : [];
  const at = Math.min(frameIdx, Math.max(0, frames.length - 1));
  const frame = frames[at] || null;

  // Does the action lack a body face for the frame shown?
  const bodyGap = face === BODY_FACE && !!action && !(frame && frame.art[BODY_FACE]);
  const drawing = frame && !bodyGap ? faceFor(frame, face) : null;

  function select(id: string) {
    setFrameIdx(0);
    if (id !== selectedId && props.onActionChange) props.onActionChange(id);
  }

  return h('div', { className: 'status-pet-studio' },
    h('div', { className: 'status-pet-canvas-card' },

      // ── 动作 ──
      field('action', t('settings.region.action'), t('settings.actionHint'),
        h('div', { className: 'status-pet-action-row' },
          library.length
            ? h(ActionPicker, { t, skin, library, face, value: selectedId, onSelect: select })
            : h('span', { className: 'status-pet-hint' }, t('settings.emptyLibrary')),
        ),
      ),

      // ── 画布 ──
      field('canvas', t('settings.region.canvas'), undefined,
        h('div', { className: 'status-pet-face-switch', role: 'group', 'aria-label': t('settings.face') },
          FACE_NAMES.map((g) =>
            h('button', {
              key: g,
              type: 'button',
              className: 'status-pet-mini-button' + (face === g ? ' active' : ''),
              'aria-pressed': face === g ? 'true' : 'false',
              title: t('settings.face.' + g + 'Hint'),
              onClick: () => { if (props.onFaceChange) props.onFaceChange(g); },
            }, t('settings.face.' + g))
          )
        ),
        h('div', { className: 'status-pet-stage' },
          h('div', { className: 'status-pet-stage-cell' },
            h(PixelBoard, { face, drawing: bodyGap ? null : drawing, art, t })),
          h('div', { className: 'status-pet-stage-cell status-pet-inspect' },
            h(PetCanvas, {
              source: { kind: 'action', skin, actionId: selectedId, face },
              zoom: LIVE_ZOOM,
              interactive: false,
            }))
        )
      ),

      // ── 帧 ──
      action
        ? field('frames', t('settings.field.frames'), t('settings.region.frames'),
            h(Filmstrip, { action, face, palette: art?.palette || [], selectedIndex: at, onSelect: setFrameIdx, t }))
        : null
    )
  );
}
