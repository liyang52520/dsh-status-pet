// 动作 — the action viewer: the skin's whole animation library, one action at a
// time, full width.
//
// It is the SECOND half of the Workshop (the 状态 list is the other one, see
// page.ts), and it answers the question the state list cannot: "what does this
// action actually look like?".  The pixels are AUTHORED — a built-in's artwork
// is baked into the chunk and frozen — so this view LOOKS and never writes:
//
//   * 动作      ONE picker that searches, previews and selects the action on
//               the board;
//   * 画布      the face switch (头像 / 全身) on top, then the 1:1 board beside
//               the action's own live preview at the popup's display size;
//   * 帧        the filmstrip of that action, which selects a frame to look at.
//
// Nothing here edits, and nothing here copies: there is no 新建动作 / 删除动作,
// no frame CRUD, no brushes and no 当前帧 numbers.  Those controls belonged to a
// pixel studio that no longer exists (see the v10 schema in storage.ts); what
// survived is the part that was never the problem — looking at something is the
// ordinary way to choose it.
//
// The board is a PICTURE: it carries no pointer handlers at all, so a stray
// click cannot start a stroke on a frozen library (an earlier build copied the
// whole 15 MB artwork on the first stroke).

import { React, h } from '../../host-deps.ts';
import { AVATAR_GRID, BODY_GRID, LIVE_ZOOM } from '../../pet/grids.ts';
import { translatorOrFallback } from '../../pet/labels.ts';
import type { Translator } from '../../pet/labels.ts';
import {
  TRANSPARENT,
  actionsOf,
  cellFor,
  pixelAt,
  skinArtwork,
  skinLibrary,
} from '../../pet/skins/store.ts';
import type { Action, Artwork, ActionFrame, LibraryEntryInfo } from '../../pet/skins/store.ts';
import { PetPreview } from '../pet-preview.ts';
import { ActionCombo } from './action-combo.ts';
import { FrameCanvas, THUMB_CSS } from './frame-canvas.ts';
import { field } from './field.ts';

/** One filmstrip thumbnail: a still of one frame of the action on the board. */
function FrameThumb(props: { frame: ActionFrame; palette: string[]; grid: number; active: boolean; label: string; onClick: () => void }) {
  return h('button', {
    type: 'button',
    className: 'status-pet-frame-thumb' + (props.active ? ' active' : ''),
    'aria-pressed': props.active ? 'true' : 'false',
    'aria-label': props.label,
    onClick: props.onClick,
  }, h(FrameCanvas, {
    frame: cellFor(props.frame, props.grid),
    palette: props.palette,
    grid: props.grid,
    css: THUMB_CSS,
  }));
}

export function ActionViewer(props: {
  t?: Translator;
  /** The skin whose library is on show. */
  skin: string;
  /** Which FACE the board draws (the page's switch — a viewing preference). */
  grid?: number;
  onGridChange?: (grid: number) => void;
  /** The action on the board.  Owned by the page, like the state selection, so
   *  the two halves of the Workshop can never disagree about what is in front
   *  of you. */
  actionId?: string;
  onActionChange?: (id: string) => void;
}) {
  const t = translatorOrFallback(props.t);
  const skin = props.skin;
  const grid = props.grid === BODY_GRID ? BODY_GRID : AVATAR_GRID;
  // Which frame the filmstrip is showing.  Local to the view: it is a place in a
  // picture, not part of anything the page owns.
  const [frameIdx, setFrameIdx] = React.useState(0);
  // A remount (a skin switch) starts the strip over rather than keeping a frame
  // index from a document that is no longer on screen.
  React.useEffect(() => { setFrameIdx(0); }, [skin]);

  const library: LibraryEntryInfo[] = skinLibrary(skin);
  const art: Artwork | null = skinArtwork(skin);
  const selectedId = library.some((a) => a.id === props.actionId)
    ? props.actionId!
    : (library[0] ? library[0].id : '');
  const action: Action | null = art ? actionsOf(art).find((a) => a.id === selectedId) || null : null;
  const frames: ActionFrame[] = action ? action.frames : [];
  const at = Math.min(frameIdx, Math.max(0, frames.length - 1));
  const frame: ActionFrame | null = frames[at] || null;
  // A built-in ships both faces, but an action may lack its 128 face: that is
  // what the empty-state card says, instead of silently deriving one.
  const faceGap = grid === BODY_GRID && !!action && !(frame && frame.cells[BODY_GRID]);
  const face = frame && !faceGap ? cellFor(frame, grid) : null;

  function select(id: string) {
    setFrameIdx(0);
    if (id !== selectedId && props.onActionChange) props.onActionChange(id);
  }

  // The board is `grid × grid` plain divs, one per pixel, each carrying its
  // colour and nothing else — no handler, no ref, no inline geometry: the cell
  // is sized by the board (`.status-pet-cell` is `flex:1 1 0`), which is what
  // keeps the 128 face complete at any pane width.
  const board = faceGap
    ? h('div', { className: 'status-pet-empty-body' }, h('div', null, t('settings.emptyBody')))
    : h('div', { className: 'status-pet-board-wrap status-pet-board-readonly' },
        h('div', { className: 'status-pet-grid' },
          (face ? face.rows : []).map((row, y) =>
            h('div', { className: 'status-pet-grid-row', key: y },
              Array.from({ length: grid }, (_, x) => {
                const tok = pixelAt(row, x);
                const idx = tok === TRANSPARENT ? 0 : parseInt(tok, 16);
                return h('div', {
                  key: x,
                  className: 'status-pet-cell',
                  style: { background: idx === 0 ? 'transparent' : (art ? art.palette[idx] : 'transparent') },
                });
              })
            )
          )
        )
      );

  return h('div', { className: 'status-pet-studio' },
    h('div', { className: 'status-pet-canvas-card' },

      // ── 动作 ── WHICH action is on the board.  The list IS the picker:
      // search, preview and selection in one control, so the board keeps the
      // pane's full width.
      field('action', t('settings.region.action'), t('settings.actionHint'),
        h('div', { className: 'status-pet-action-row' },
          library.length
            ? h(ActionCombo, {
                t,
                skin,
                library,
                grid,
                value: selectedId,
                onSelect: select,
              })
            : h('span', { className: 'status-pet-hint' }, t('settings.emptyLibrary')),
        ),
      ),

      // ── 画布 ── the board and, beside it, the action's live preview.  The
      // face switch belongs to whatever picture is in front of you, so it sits
      // ON the canvas row rather than on the page's axis.
      field('canvas', t('settings.region.canvas'), undefined,
        h('div', { className: 'status-pet-face-switch', role: 'group', 'aria-label': t('settings.face') },
          [AVATAR_GRID, BODY_GRID].map((g) =>
            h('button', {
              key: g,
              type: 'button',
              className: 'status-pet-mini-button' + (grid === g ? ' active' : ''),
              'aria-pressed': grid === g ? 'true' : 'false',
              title: t('settings.grid.' + g + 'Hint'),
              onClick: () => { if (props.onGridChange) props.onGridChange(g); },
            }, t('settings.grid.' + g))
          )
        ),
        h('div', { className: 'status-pet-stage' },
          h('div', { className: 'status-pet-stage-cell' }, board),
          // The preview is a PICTURE and nothing else: no caption, no link, no
          // numbers — the picker's rows already say who plays what.  It is
          // small (the popup's own 1:2 display size) so the pair always fits on
          // ONE row beside the board.
          h('div', { className: 'status-pet-stage-cell status-pet-inspect' },
            h(PetPreview, {
              skinName: skin,
              grid,
              takeId: selectedId,
              zoom: LIVE_ZOOM,
              interactive: false,
            })
          )
        )
      ),

      // ── 帧 ── the filmstrip of the SELECTED action (ONE list — both faces
      // share it).  It SELECTS: a frame is a place to look from, and stepping
      // through them is how an animation is read.
      action
        ? field('frames', t('settings.field.frames'), t('settings.region.frames'),
            h('div', { className: 'status-pet-filmstrip' },
              frames.map((f, i) =>
                h(FrameThumb, {
                  key: i,
                  frame: f,
                  palette: art ? art.palette : [],
                  grid,
                  active: i === at,
                  label: t('settings.frameN', { n: i + 1 }),
                  onClick: () => setFrameIdx(i),
                })
              )
            )
          )
        : null,
    )
  );
}
