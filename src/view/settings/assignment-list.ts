// 状态 detail — the state ↔ action assignment surface.
//
// It answers exactly one question: "which actions does THIS state play?" — the
// only thing about a built-in that is the user's to change.
//
//   * a checkbox here is a REFERENCE, never a copy — ticking one action in three
//     states is one definition played three times;
//   * a state with nothing ticked FOLLOWS IDLE — no "take over" step;
//   * the list is DISPLAYED as two groups — what this state already plays first,
//     then the rest — each in library order.  Display order must never re-order
//     the rotation.
//
// The ONE assignment covers the whole artwork — the dock and the popup play the
// same action set — so this surface has no face switch.

import { React, h } from '../../platform/deps.ts';
import { BODY_FACE, LIVE_ZOOM } from '../../skin/geometry.ts';
import { MAX_SELECTION } from '../../skin/model.ts';
import type { Artwork } from '../../skin/model.ts';
import type { StateName } from '../../behavior/vocabulary.ts';
import { assign, setSelection, usedBy } from '../../skin/library.ts';
import { documentOf } from '../../skin/documents.ts';
import { saveAssignments } from '../../skin/session.ts';
import { translatorOrFallback } from '../../labels/index.ts';
import type { Translator } from '../../labels/index.ts';
import { PetCanvas } from '../pet-canvas.ts';
import type { SkinSource } from '../pet-canvas.ts';
import { ActionThumb } from './action-thumb.ts';
import { clearConfirm } from './confirm.ts';
import { field } from './field.ts';

const EMPTY_ARTWORK: Artwork = { palette: ['transparent'], actions: [], states: {} };

/** What the header is showing.  Two questions, two sources:
 *
 *   * nothing hovered — the chosen state's own rotation, resolved from the
 *     named skin at its BODY face, so the picture and the list underneath it
 *     are the same wardrobe (`kind: 'skin'` is keyed by `name`);
 *   * a row hovered — THAT action pinned alone (`kind: 'action'`), which is the
 *     only way to preview an action no state plays yet.
 *
 *  Exported because it is the contract a regression test pins: a source that
 *  names a field its kind does not carry resolves to `null`, and a null skin is
 *  a permanently blank canvas. */
export function headerSource(skin: string, hover: string | null): SkinSource {
  return hover
    ? { kind: 'action', skin, actionId: hover, face: BODY_FACE }
    : { kind: 'skin', name: skin, face: BODY_FACE };
}

export function StateAssignments(props: {
  t?: Translator;
  skin: string;
  state: string;
  onWritten?: () => void;
}) {
  const t = translatorOrFallback(props.t);
  const skin = props.skin;
  const state = props.state;

  const [art, setArt] = React.useState<Artwork>(() => documentOf(skin) || EMPTY_ARTWORK);
  const artRef = React.useRef(art);
  const [query, setQuery] = React.useState('');
  const [hover, setHover] = React.useState<string | null>(null);
  const [clearing, setClearing] = React.useState(false);

  const selection = (art.states && art.states[state as StateName]) || [];
  const q = query.trim().toLowerCase();
  // label: use the name, because every built-in action is named (no fallback needed).
  const textOf = (a: { name: string; origin?: string; id: string }, i: number) => a.name;
  const rows = art.actions
    .map((a, i) => ({ a, i }))
    .filter(({ a, i }) => !q || (textOf(a, i) + ' ' + (a.origin || '') + ' ' + a.id).toLowerCase().includes(q));
  const visibleIds = rows.map(({ a }) => a.id);

  const ticked = new Set(selection);
  const tickedRows = rows.filter(({ a }) => ticked.has(a.id));
  const restRows = rows.filter(({ a }) => !ticked.has(a.id));
  const grouped = tickedRows.length > 0 && restRows.length > 0;
  const idleAnchor = state === 'idle';
  const allTicked = selection.length >= MAX_SELECTION;

  function commit(next: Artwork) {
    saveAssignments(skin, next.states || {});
    const fresh = documentOf(skin) || next;
    artRef.current = fresh;
    setArt(fresh);
    if (props.onWritten) props.onWritten();
  }

  function toggle(id: string, on: boolean) {
    commit(assign(artRef.current, state, id, on));
  }

  function selectAll() {
    const taken = new Set(selection);
    const add = new Set(visibleIds);
    const next = art.actions.map((a) => a.id).filter((id) => taken.has(id) || add.has(id));
    commit(setSelection(artRef.current, state, next));
  }

  function clearSelection() {
    const keep = idleAnchor ? selection.slice(0, 1) : [];
    commit(setSelection(artRef.current, state, keep));
  }

  function askClear() {
    if (idleAnchor) setClearing(true);
    else clearSelection();
  }

  function rowButton({ a, i }: { a: typeof art.actions[number]; i: number }) {
    const on = ticked.has(a.id);
    const text = textOf(a, i);
    const players = usedBy(art, a.id);
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
      h(ActionThumb, { skin, actionId: a.id }),
      h('span', { className: 'status-pet-library-name' }, text),
      h('span', { className: 'status-pet-library-meta' },
        a.frames.length + ' · ' + (players.length
          ? t('settings.usedByN', { n: players.length })
          : t('settings.unusedAction')))
    );
  }

  return h('div', { className: 'status-pet-edit' },

    h('div', { className: 'status-pet-edit-head' },
      h(PetCanvas, {
        source: headerSource(skin, hover),
        zoom: LIVE_ZOOM,
        interactive: false,
        state: hover || state,
      }),
      h('div', { className: 'status-pet-edit-text' },
        h('span', { className: 'status-pet-edit-title' }, t(state)),
        hover
          ? h('span', { className: 'status-pet-hint' },
              t('settings.previewing', { name: art.actions.find((a) => a.id === hover)?.name || hover }))
          : h('span', { className: 'status-pet-hint' }, t('settings.hint.' + state)))
    ),

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
              t('settings.searchMatches', { n: rows.length, total: art.actions.length }))
          : null,
        h('div', { className: 'status-pet-bulk-ops' },
          allTicked
            ? h('span', { className: 'status-pet-hint status-pet-full' },
                t('settings.selectedMax', { n: selection.length }))
            : null,
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
              ...tickedRows.map(rowButton),
              grouped
                ? h('div', { key: '__rest', className: 'status-pet-library-group' },
                    t('settings.libraryRestGroup', { n: restRows.length }))
                : null,
              ...restRows.map(rowButton),
            ]
          : h('div', { className: 'status-pet-hint' },
              query ? t('settings.searchEmpty', { q: query.trim() }) : t('settings.emptyLibrary'))
      )
    ),

    clearing ? clearConfirm({
      t,
      onCancel: () => setClearing(false),
      onConfirm: () => { setClearing(false); clearSelection(); },
    }) : null
  );
}