// 编辑 · 按状态 — the state ↔ action assignment surface.
//
// This is the half of 编辑 that answers "which actions does this state play?".
// The other half (编辑 · 按动作) draws the pixels of ONE action; the two are
// separate modes of the same tab because they are separate jobs — which is the
// whole point of the split:
//
//   * a checkbox here is a REFERENCE, never a copy.  Ticking one action in
//     three states is one definition played three times — the row reports
//     「被 N 个状态在用」 and editing that action (按动作) changes all three;
//   * a state with nothing ticked FOLLOWS IDLE: `assignTake` /
//     `setStateSelection` delete the key rather than storing `[]`, so there is
//     one representation of "unset" and no "take over this state" step;
//   * the dropdown decides WHICH STATE YOU ARE TICKING FOR, and nothing else.
//     What the board edits is not decided here at all — that is 按动作's
//     dropdown.  (Mixing the two on one page is exactly what made the old
//     studio read as nonsense.)
//
// The crop comes from the page's shared 32 / 128 switch: states live per crop.
//
// The only ops are 全选 (the whole library) and 清空 (exactly the idle
// fallback).  There is deliberately no copy/paste of a state's selection: with
// one state in front of you at a time it read as "duplicate this state" — and a
// state IS its selection, so the honest way to make two states agree is to tick
// the same boxes.
// A missing body crop has no states yet, so it says so instead of rendering a
// list that writes into a grid nothing resolves.
//
// BOTH skins get here.  A built-in's pixels are frozen, but which of its own
// actions each state plays is the user's to change, and the store keeps that as
// a diff beside the skin (`saveSkinStates`) instead of forking it into 我的创作.
// 我的创作 writes its document itself.  Either way this page only ever touches
// ASSIGNMENTS — its sibling 按动作 is where pixels change, and a built-in has no
// 按动作 half at all.

import { React, h } from '../../host-deps.ts';
import { STATE_NAMES } from '../../pet/behavior.ts';
import { translatorOrFallback } from '../../pet/labels.ts';
import type { Translator } from '../../pet/labels.ts';
import {
  DEFAULT_SKIN,
  assignTake,
  gridArtwork,
  saveSkinStates,
  seedArtworkFrom,
  setStateSelection,
  skinArtwork,
  usedBy,
} from '../../pet/skins/store.ts';
import type { CustomArtwork, LibraryTake } from '../../pet/skins/store.ts';
import { FrameCanvas, ROW_THUMB_CSS } from './frame-canvas.ts';
import { field } from './field.ts';

export function StateAssignments(props: {
  t?: Translator;
  /** The skin whose states are being assigned: 'custom' (its own document) or a
   * built-in (a diff beside the frozen artwork). */
  skin: string;
  /** The crop whose states are being assigned (the page's shared switch). */
  grid: number;
  /** The state whose checkboxes are being edited.  Owned by the page so 预览's
   * state cells can open this mode already pointing at their own state. */
  state: string;
  onStateChange: (state: string) => void;
}) {
  const t = translatorOrFallback(props.t);
  const skin = props.skin;
  const grid = props.grid;
  const state = props.state;
  // The EFFECTIVE document: a built-in plus the user's overrides, or 我的创作's
  // own.  Reading it (rather than the raw built-in) is what makes a second tick
  // build on the first, and what keeps this page and the resolution in step.
  const [art, setArt] = React.useState<CustomArtwork>(
    () => skinArtwork(skin) || seedArtworkFrom(DEFAULT_SKIN));
  // The synchronous mirror of `art`: a rapid click may fire before React has
  // re-rendered, and every mutator reads the document at CALL time.
  const artRef = React.useRef(art);
  const g = gridArtwork(art, grid);
  const selection = g.states[state] || [];
  const allIds = g.library.map((a) => a.id);

  function commit(next: CustomArtwork) {
    // The store routes the write (document or override) and re-resolves ACTIVE,
    // so the dock, the popup and 预览 all follow without a reload.
    saveSkinStates(skin, grid, gridArtwork(next, grid).states);
    // Show what was actually STORED: the write may have been refused (quota),
    // and the override merge is the store's, not ours.
    const fresh = skinArtwork(skin) || next;
    artRef.current = fresh;
    setArt(fresh);
  }

  const toggle = (id: string, on: boolean) =>
    commit(assignTake(artRef.current, grid, state, id, on));
  const selectAll = () => commit(setStateSelection(artRef.current, grid, state, allIds));
  // `idle` is the anchor every unassigned state falls back to, and both the
  // validator and the resolver require it: emptying it would invalidate the
  // document and blank the pet, so the button is refused there.
  const clearSelection = () => {
    if (state === 'idle') return;
    commit(setStateSelection(artRef.current, grid, state, []));
  };
  const label = (a: LibraryTake, i: number) => a.name || t('settings.actionN', { n: i + 1 });

  if (!art.grids[grid]) {
    return h('div', { className: 'status-pet-studio' },
      h('div', { className: 'status-pet-hint' }, t('settings.assignCropMissing')));
  }

  return h('div', { className: 'status-pet-studio' },
    h('div', { className: 'status-pet-canvas-card' },

      // ── 状态 ── WHICH state you are assigning to.  One native dropdown: its
      // options carry how many actions that state plays (or 跟随空闲), its
      // tooltip is what the state means, and none of it decides what is drawn.
      field('state', t('settings.region.states'), undefined,
        h('select', {
          className: 'status-pet-select status-pet-state-select',
          value: state,
          'aria-label': t('settings.region.states'),
          title: t('settings.hint.' + state),
          onChange: (e: { target: { value: string } }) => props.onStateChange(e.target.value),
        },
          STATE_NAMES.map((name) => {
            const ids = g.states[name];
            return h('option', { key: name, value: name },
              t(name) + ' · ' + (ids && ids.length
                ? t('settings.actionCount', { n: ids.length })
                : t('settings.followIdle')));
          })
        ),
        h('div', { className: 'status-pet-state-ops' },
          h('button', { type: 'button', className: 'status-pet-mini-button', onClick: selectAll },
            t('settings.selectAll')),
          // 清空 appears only while there is something to clear: an empty
          // selection IS the idle fallback, so it would be a no-op button.  It
          // is DISABLED for `idle`, which must keep at least one action — every
          // unassigned state falls back to it, and the document is invalid
          // without it.
          selection.length
            ? h('button', {
                type: 'button', className: 'status-pet-mini-button',
                disabled: state === 'idle',
                title: state === 'idle' ? t('settings.clearIdleHint') : undefined,
                onClick: clearSelection,
              }, t('settings.clearSelection'))
            : null
        )
      ),

      // ── 动作库 ── the crop's whole library, one checkbox per action: "this
      // state plays it".  Clicking the row's name area does nothing else — the
      // board is in 按动作, and one list with one meaning is the fix for the old
      // mixed page.
      field('library', t('settings.region.library'), t('settings.libraryHint'),
        h('div', { className: 'status-pet-library', role: 'list' },
          g.library.length
            ? g.library.map((a, i) => {
                const on = selection.includes(a.id);
                const text = label(a, i);
                const used = usedBy(art, grid, a.id);
                return h('label', {
                  key: a.id,
                  className: 'status-pet-library-row' + (on ? ' assigned' : ''),
                },
                  h('input', {
                    type: 'checkbox',
                    className: 'status-pet-library-check',
                    checked: on,
                    'aria-label': text + ' — ' + t('settings.playedHere'),
                    title: t('settings.playedHere'),
                    onChange: (e: { target: { checked: boolean } }) => toggle(a.id, e.target.checked),
                  }),
                  h(FrameCanvas, { frame: a.frames[0], palette: art.palette, grid, css: ROW_THUMB_CSS }),
                  h('span', { className: 'status-pet-library-name' }, text),
                  h('span', { className: 'status-pet-library-meta' },
                    a.frames.length + ' · ' + (used.length
                      ? t('settings.usedByN', { n: used.length })
                      : t('settings.unusedAction')))
                );
              })
            : h('div', { className: 'status-pet-hint' }, t('settings.emptyLibrary'))
        )
      )
    )
  );
}
