// 状态 detail — the state ↔ action assignment surface, and the RIGHT half of
// the page's 状态 view (the master list on the left picks the state; see
// page.ts).
//
// It answers exactly one question: "which actions does THIS state play?".
// Drawing pixels is the other object's job (the 动作 view) and this surface
// never mentions it, because that mix is what made the old single page read as
// nonsense.
//
//   * a checkbox here is a REFERENCE, never a copy.  Ticking one action in
//     three states is one definition played three times — the row reports
//     「被 N 个状态在用」, and editing that action (the 动作 view) changes all
//     three;
//   * a state with nothing ticked FOLLOWS IDLE: `assignTake` /
//     `setStateSelection` delete the key rather than storing `[]`, so there is
//     one representation of "unset" and no "take over this state" step;
//   * the row's ✎ is the SEAM to the other object: it opens the board on that
//     action.  The page's 动作 master list is the ordinary door; this is the
//     shortcut from "this state plays it" to "let me draw it".
//
// v9: there is ONE assignment for the whole artwork — the dock and the popup
// play the same action set by construction — so this surface has no crop of its
// own.  The page's face switch decides which FACE the preview and the row
// thumbnails show (a viewing preference), never which library is assigned.
//
// The only bulk ops are 全选 and 清空.  全选 ADDS every action in the list in
// front of you (the search box is the scope of a bulk tick, so a 106-action
// library can be aimed instead of bulldozed), and 清空 empties the state —
// except 空闲, which keeps its first action, because it is the anchor every
// unassigned state falls back to and the document is invalid without one.
//
// The list is DISPLAYED in two groups — the actions this state already plays
// first, then the rest — because "what does this state do?" is the question the
// page exists to answer.  Each group keeps the library's order, the headers
// only appear while both halves have something in them, and the stored
// selection is untouched: display order must never re-order the rotation.
//
// BOTH skins get here.  A built-in's pixels are frozen, but which of its own
// actions each state plays is the user's to change, and the store keeps that as
// a diff beside the skin (`saveSkinStates`) instead of forking it into 我的创作.
// 我的创作 writes its document itself.

import { React, h } from '../../host-deps.ts';
import { AVATAR_GRID, BODY_GRID, LIVE_ZOOM } from '../../pet/grids.ts';
import { FrameCanvas, ROW_THUMB_CSS } from './frame-canvas.ts';
import { translatorOrFallback } from '../../pet/labels.ts';
import type { Translator } from '../../pet/labels.ts';
import {
  DEFAULT_SKIN,
  MAX_TAKES,
  actionsOf,
  assignTake,
  cellFor,
  saveSkinStates,
  seedArtworkFrom,
  setStateSelection,
  skinArtwork,
  usedBy,
} from '../../pet/skins/store.ts';
import type { Action, CustomArtwork } from '../../pet/skins/store.ts';
import { PetPreview } from '../pet-preview.ts';
import { field } from './field.ts';

export function StateAssignments(props: {
  t?: Translator;
  /** The skin whose states are being assigned: 'custom' (its own document) or a
   * built-in (a diff beside the frozen artwork). */
  skin: string;
  /** Which FACE the preview and the row thumbnails show (the page's shared
   * switch).  A viewing preference: the assignment itself is one table for both
   * faces. */
  grid?: number;
  /** The state in front of you.  Owned by the page: its 状态 master list is the
   * ONE door, so this surface carries no selector of its own (a dropdown here
   * named the same state a third time). */
  state: string;
  /** Called after every write, so the page's master list re-reads what it just
   * changed (the row meta is built from the store, not from this component). */
  onWritten?: () => void;
}) {
  const t = translatorOrFallback(props.t);
  const skin = props.skin;
  const grid = props.grid === 128 ? 128 : AVATAR_GRID;
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
  // WHICH row the pointer (or the keyboard) is on.  Every row carries a static
  // thumbnail — 106 actions are 106 different animations, so a list of names is
  // a list you cannot read — and the header plays the hovered one LIVE, at the
  // popup's size, because a 32px still is for finding it and the animation is
  // for choosing it.
  const [hover, setHover] = React.useState<string | null>(null);
  // 空闲 is the one state whose 清空 has a RULE (it must keep an action, because
  // every unselected state follows it).  That rule used to be a paragraph printed
  // under the list — a wall of text for a rule that applies to one of eleven
  // states — so it is ASKED for, at the moment it applies.
  const [clearing, setClearing] = React.useState(false);
  const library = actionsOf(art);
  const selection = (art.states && art.states[state]) || [];
  const label = (a: { name?: string }, i: number) => a.name || t('settings.actionN', { n: i + 1 });
  const q = query.trim().toLowerCase();
  const rows = library
    .map((a, i) => ({ a, i }))
    .filter(({ a, i }) => !q || (label(a, i) + ' ' + (a.origin || '') + ' ' + a.id)
      .toLowerCase().includes(q));
  const visibleIds = rows.map(({ a }) => a.id);
  // The list is TWO groups, each in LIBRARY order: what this state ALREADY
  // plays comes first — that is the answer to "what does this state do?" — then
  // everything else.  The headers show only while both halves have something in
  // them, so an empty or a full selection still reads as one plain list.  This
  // is DISPLAY order alone: the stored selection keeps the library's order, so
  // ticking never re-orders the rotation.
  const ticked = new Set(selection);
  const tickedRows = rows.filter(({ a }) => ticked.has(a.id));
  const restRows = rows.filter(({ a }) => !ticked.has(a.id));
  const grouped = tickedRows.length > 0 && restRows.length > 0;

  function commit(next: CustomArtwork) {
    // The store routes the write (document or override) and re-resolves ACTIVE,
    // so the dock, the popup and the other view all follow without a reload.
    saveSkinStates(skin, next.states || {});
    // Show what was actually STORED: the write may have been refused (quota),
    // and the override merge is the store's, not ours.
    const fresh = skinArtwork(skin) || next;
    artRef.current = fresh;
    setArt(fresh);
    if (props.onWritten) props.onWritten();
  }

  const toggle = (id: string, on: boolean) =>
    commit(assignTake(artRef.current, state, id, on));
  // 全选 ADDS: it ticks every action in the list in front of you on top of what
  // the state already plays.  Replacing would silently throw away ticks the
  // filter is hiding, and ridding a state of a big selection is 清空's job —
  // which works on every state, 空闲 included.  The order stays the library's,
  // so the resolved rotation does not depend on the click order.
  const selectAll = () => {
    const taken = new Set(selection);
    const add = new Set(visibleIds);
    const next = library.map((a) => a.id).filter((id) => taken.has(id) || add.has(id));
    commit(setStateSelection(artRef.current, state, next));
  };
  // 清空 empties any state EXCEPT 空闲, the anchor every unassigned state falls
  // back to: the validator and the resolver both require it to play something,
  // and an empty one would leave the pet drawing nothing.  So on 空闲 it keeps
  // the FIRST action instead of dead-ending.
  const clearSelection = () => {
    const keep = state === 'idle' ? selection.slice(0, 1) : [];
    commit(setStateSelection(artRef.current, state, keep));
  };
  const askClear = () => {
    if (state === 'idle') setClearing(true);
    else clearSelection();
  };
  // The anchor rule is what 空闲's two buttons answer to, and it is the one
  // thing about this page nobody can guess — so it is PRINTED, not left to a
  // tooltip.
  const idleAnchor = state === 'idle';
  const allTicked = selection.length >= MAX_TAKES;

  // One row = one action: checkbox · thumbnail · name · who plays it.  The whole
  // row is the <label>, so a click anywhere on it toggles; the row also feeds the
  // header's live preview, by pointer OR by keyboard.
  const row = ({ a, i }: { a: Action; i: number }) => {
    const on = ticked.has(a.id);
    const text = label(a, i);
    const used = usedBy(art, a.id);
    return h('label', {
      key: a.id,
      className: 'status-pet-library-row' + (on ? ' assigned' : ''),
      onMouseEnter: () => setHover(a.id),
      onMouseLeave: () => setHover((h) => (h === a.id ? null : h)),
    },
        h('input', {
          type: 'checkbox',
          className: 'status-pet-library-check',
          checked: on,
          'aria-label': text + ' — ' + t('settings.playedHere'),
          title: t('settings.playedHere'),
          onChange: (e: { target: { checked: boolean } }) => toggle(a.id, e.target.checked),
          onFocus: () => setHover(a.id),
          onBlur: () => setHover((h) => (h === a.id ? null : h)),
        }),
        h(FrameCanvas, {
          frame: cellFor(a.frames[0], AVATAR_GRID),
          palette: art.palette,
          grid: AVATAR_GRID,
          css: ROW_THUMB_CSS,
        }),
        h('span', { className: 'status-pet-library-name' }, text),
      h('span', { className: 'status-pet-library-meta' },
        a.frames.length + ' · ' + (used.length
          ? t('settings.usedByN', { n: used.length })
          : t('settings.unusedAction')))
    );
  };

  return h('div', { className: 'status-pet-edit' },

    // ── which state this is, what it means, and how it looks ── one compact
    // band, because the list on the left has already said the name once and the
    // checklist below is the work.
    h('div', { className: 'status-pet-edit-head' },
      hover
        ? h(PetPreview, { skinName: skin, grid: BODY_GRID, zoom: LIVE_ZOOM, takeId: hover, interactive: false })
        : h(PetPreview, { skinName: skin, grid: BODY_GRID, zoom: LIVE_ZOOM, state, interactive: false }),
      h('div', { className: 'status-pet-edit-text' },
        h('span', { className: 'status-pet-edit-title' }, t(state)),
        hover
          ? h('span', { className: 'status-pet-hint' },
              t('settings.previewing', { name: label(library.find((a) => a.id === hover) || { name: '' }, 0) }))
          : h('span', { className: 'status-pet-hint' }, t('settings.hint.' + state)))
    ),

    // ── 动作库 ── the ONE library, one checkbox per action: "this state plays
    // it".  The rows this state ALREADY plays come first (see the grouping
    // above); a search box in front of it is what makes a 106-action library
    // workable by hand, and what makes 全选 aimable: the filter is the scope of
    // a bulk tick.
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
              t('settings.searchMatches', { n: rows.length, total: library.length }))
          : null,
        h('div', { className: 'status-pet-bulk-ops' },
          // NO tick count: "已勾选 1 个" says nothing the checkboxes do not.  It
          // appears only when the selection hits the cap, which IS news.
          allTicked
            ? h('span', { className: 'status-pet-hint status-pet-full' },
                t('settings.selectedMax', { n: selection.length }))
            : null,
          // The two bulk ops ride the SEARCH line — one row of controls, never a
          // wrapped second line.  清空 appears only while there is something to
          // clear: an empty selection IS the idle fallback, so it would be a
          // no-op button.
          h('button', { type: 'button', className: 'status-pet-mini-button', onClick: selectAll },
            t('settings.selectAll')),
          selection.length
            ? h('button', {
                type: 'button', className: 'status-pet-mini-button',
                title: idleAnchor ? t('settings.clearIdleHint') : undefined,
                onClick: askClear,
              }, t('settings.clearSelection'))
            : null
        )
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
    ),

    // The one rule that cannot be guessed from the buttons — asked for exactly
    // when it applies, instead of printed on every visit.
    clearing
      ? h('div', {
          className: 'status-pet-confirm', role: 'dialog', 'aria-modal': 'true',
          'aria-label': t('settings.clearIdleTitle'),
        },
          h('div', { className: 'status-pet-confirm-card' },
            h('div', { className: 'status-pet-confirm-title' }, t('settings.clearIdleTitle')),
            h('div', { className: 'status-pet-hint' }, t('settings.clearIdleHint')),
            h('div', { className: 'status-pet-bulk-ops' },
              h('button', {
                type: 'button', className: 'status-pet-mini-button',
                onClick: () => setClearing(false),
              }, t('settings.cancel')),
              h('button', {
                type: 'button', className: 'status-pet-mini-button',
                onClick: () => { setClearing(false); clearSelection(); },
              }, t('settings.clearSelection')))))
      : null
  );
}
