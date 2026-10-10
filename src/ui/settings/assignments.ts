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
// The only ops are 全选 and 清空.  全选 ADDS every action in the list in front
// of you (the search box is the scope of a bulk tick, so a 106-action library
// can be aimed instead of bulldozed), and 清空 empties the state — except 空闲,
// which keeps its first action, because it is the anchor every unassigned state
// falls back to and the document is invalid without one.  There is deliberately
// no copy/paste of a state's selection: with one state in front of you at a time
// it read as "duplicate this state" — and a state IS its selection, so the
// honest way to make two states agree is to tick the same boxes.
//
// The list is DISPLAYED in two groups — the actions this state already plays
// first, then the rest — because "what does this state do?" is the question the
// page exists to answer, and the answer used to be scattered through a 106-row
// scroll.  Each group keeps the library's order, the headers only appear while
// both halves have something in them, and the stored selection is untouched:
// display order must never re-order the rotation.
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
  MAX_TAKES,
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
  // The filter in front of the library.  A built-in library is 106 actions, so
  // "tick the one I mean" used to mean scrolling; the box narrows the list, and
  // 全选 acts on what is LEFT — which is how a bulk change is aimed instead of
  // blunt.
  const [query, setQuery] = React.useState('');
  const g = gridArtwork(art, grid);
  const selection = g.states[state] || [];
  const label = (a: LibraryTake, i: number) => a.name || t('settings.actionN', { n: i + 1 });
  const q = query.trim().toLowerCase();
  const rows = g.library
    .map((a, i) => ({ a, i }))
    .filter(({ a, i }) => !q || (label(a, i) + ' ' + (a.name || '') + ' ' + (a.origin || '') + ' ' + a.id)
      .toLowerCase().includes(q));
  const visibleIds = rows.map(({ a }) => a.id);
  // The list is TWO groups, each in LIBRARY order: what this state ALREADY
  // plays comes first — that is the answer to "what does this state do?", and
  // it used to be scattered through a 106-row scroll — then everything else.
  // The headers show only while both halves have something in them, so an
  // empty or a full selection still reads as one plain list.  This is DISPLAY
  // order alone: the stored selection keeps the library's order, so ticking
  // never re-orders the rotation.
  const ticked = new Set(selection);
  const tickedRows = rows.filter(({ a }) => ticked.has(a.id));
  const restRows = rows.filter(({ a }) => !ticked.has(a.id));
  const grouped = tickedRows.length > 0 && restRows.length > 0;

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
  // 全选 ADDS: it ticks every action in the list in front of you on top of what
  // the state already plays.  Replacing would silently throw away ticks the
  // filter is hiding, and ridding a state of a big selection is 清空's job —
  // which now works on every state, 空闲 included.  The order stays the
  // library's, so the resolved rotation does not depend on the click order.
  const selectAll = () => {
    const taken = new Set(selection);
    const add = new Set(visibleIds);
    const next = g.library.map((a) => a.id).filter((id) => taken.has(id) || add.has(id));
    commit(setStateSelection(artRef.current, grid, state, next));
  };
  // 清空 empties any state EXCEPT 空闲, the anchor every unassigned state falls
  // back to: the validator and the resolver both require it to play something,
  // and an empty one would leave the pet drawing nothing.  So on 空闲 it keeps
  // the FIRST action instead of dead-ending — the one-way trap where 全选 could
  // add 106 actions and nothing could take them away again is worse than a 清空
  // that leaves one behind.
  const clearSelection = () => {
    const keep = state === 'idle' ? selection.slice(0, 1) : [];
    commit(setStateSelection(artRef.current, grid, state, keep));
  };
  // The anchor rule is what 空闲's two buttons answer to, and it is the one
  // thing about this page nobody can guess — so it is PRINTED, not left to a
  // tooltip.
  const idleAnchor = state === 'idle';
  const allTicked = selection.length >= MAX_TAKES;
  // One row = one action: checkbox · thumbnail · name · who plays it.  The
  // whole row is the <label>, so a click anywhere on it toggles.
  const row = ({ a, i }: { a: LibraryTake; i: number }) => {
    const on = ticked.has(a.id);
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
  };

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
          // selection IS the idle fallback, so it would be a no-op button.  On
          // 空闲 it clears down to one action rather than refusing — a 清空 that
          // does nothing is exactly what made a big selection hard to undo.
          selection.length
            ? h('button', {
                type: 'button', className: 'status-pet-mini-button',
                title: idleAnchor ? t('settings.clearIdleHint') : undefined,
                onClick: clearSelection,
              }, t('settings.clearSelection'))
            : null
        ),
        // The anchor rule is printed whenever 空闲 is the state in front of you
        // (it is the dropdown's default), because it is the one thing about this
        // page that cannot be guessed from the buttons.
        idleAnchor
          ? h('div', { className: 'status-pet-field-wide status-pet-hint' }, t('settings.clearIdleHint'))
          : null
      ),

      // ── 动作库 ── the crop's library, one checkbox per action: "this state
      // plays it".  The rows this state ALREADY plays come first (see the
      // grouping above); a search box in front of it is what makes a 106-action
      // library workable by hand, and what makes 全选 aimable: the filter is the
      // scope of a bulk tick.
      field('library', t('settings.region.library'), t('settings.libraryHint'),
        h('div', { className: 'status-pet-search-row' },
          h('input', {
            type: 'search',
            className: 'status-pet-import-search',
            value: query,
            placeholder: t('settings.searchActions'),
            'aria-label': t('settings.searchActions'),
            onChange: (e: { target: { value: string } }) => setQuery(e.target.value),
          }),
          query
            ? h('span', { className: 'status-pet-hint' },
                t('settings.searchMatches', { n: rows.length, total: g.library.length }))
            : null,
          h('span', { className: 'status-pet-hint' + (allTicked ? ' status-pet-full' : '') },
            allTicked
              ? t('settings.selectedMax', { n: selection.length })
              : t('settings.selectedCount', { n: selection.length }))
        ),
        h('div', { className: 'status-pet-library', role: 'list' },
          rows.length
            ? [
                grouped
                  ? h('div', { key: '__assigned', className: 'status-pet-library-group' },
                      t('settings.libraryTickedGroup', { n: tickedRows.length }))
                  : null,
                ...tickedRows.map(row),
                grouped
                  ? h('div', { key: '__rest', className: 'status-pet-library-group' },
                      t('settings.libraryRestGroup', { n: restRows.length }))
                  : null,
                ...restRows.map(row),
              ]
            : h('div', { className: 'status-pet-hint' },
                query ? t('settings.searchEmpty', { q: query.trim() }) : t('settings.emptyLibrary'))
        )
      )
    )
  );
}
