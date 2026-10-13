// The action picker: ONE control that searches, previews and selects.
//
// It replaces two things the old page had side by side — a 106-row library list
// and a separate search box — because at the settings pane's real width
// (~555px) a list column next to the board leaves the board 325px, which is
// 2.5 CSS px per pixel of a 128 face.  A dropdown costs no width at all: the
// view keeps the full pane, and the list arrives only while you are choosing.
//
//   * closed, it shows the action on the board;
//   * focused/typing, it opens a filtered list — every row is a THUMBNAIL plus
//     its read-out, because pixel animations are recognised by eye;
//   * ↑/↓ move the highlight, Enter picks, Esc closes.
//
// It owns no document state — `onSelect` is the page's — because it only ever
// LOOKS: the artwork is authored, and this control exists to move the picture on
// to another action.

import { React, h, useDismissOnOutsidePointer } from '../../host-deps.ts';
import { translatorOrFallback } from '../../pet/labels.ts';
import type { Translator } from '../../pet/labels.ts';
import type { LibraryEntryInfo } from '../../pet/skins/store.ts';
import { ActionThumb } from './action-thumb.ts';

export interface ActionComboProps {
  t?: Translator;
  /** The skin the thumbnails play, so a row is a live preview of ITS action. */
  skin: string;
  /** Every action, in library order — the page's `skinLibrary`. */
  library: LibraryEntryInfo[];
  /** Which FACE the thumbnails show (the page's current face). */
  grid: number;
  /** The action on the board. */
  value: string;
  onSelect: (id: string) => void;
}

export function ActionCombo(props: ActionComboProps) {
  const t = translatorOrFallback(props.t);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [hi, setHi] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  // The host's outside-pointer dismiss, exactly as the dock popup uses it; a
  // host without the primitive simply keeps the explicit Esc/click paths.
  if (useDismissOnOutsidePointer) useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef);

  const label = (a: LibraryEntryInfo) =>
    a.name || t('settings.actionN', { n: props.library.indexOf(a) + 1 });
  const q = query.trim().toLowerCase();
  const matches = props.library.filter((a) =>
    !q || (label(a) + ' ' + (a.origin || '') + ' ' + a.id).toLowerCase().includes(q));
  const selected = props.library.find((a) => a.id === props.value) || null;

  function openList() {
    setOpen(true);
    setQuery('');
    // The highlight starts ON the action that is on the board, so ↑/↓ step away
    // from where you already are rather than from the top of 106 rows.
    const at = props.library.findIndex((a) => a.id === props.value);
    setHi(at < 0 ? 0 : at);
  }
  function close() {
    setOpen(false);
    setQuery('');
  }
  function pick(id: string) {
    props.onSelect(id);
    close();
  }
  function onKey(e: { key?: string; preventDefault?: () => void }) {
    const k = e.key;
    if (k === 'Escape') { if (e.preventDefault) e.preventDefault(); close(); return; }
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      if (e.preventDefault) e.preventDefault();
      if (!open) { openList(); return; }
      const n = matches.length;
      if (!n) return;
      setHi(((hi + (k === 'ArrowDown' ? 1 : -1)) % n + n) % n);
      return;
    }
    if (k === 'Enter') {
      if (e.preventDefault) e.preventDefault();
      if (open && matches[hi]) pick(matches[hi].id);
      else if (!open) openList();
      return;
    }
  }

  // Every row PLAYS its action: 106 animations cannot be told apart by a still
  // of frame 0 (see action-thumb.ts — the rows cost ~0.1% of a frame budget).
  const thumbOf = (a: LibraryEntryInfo) =>
    h(ActionThumb, { skin: props.skin, actionId: a.id, grid: props.grid });
  const readOut = (a: LibraryEntryInfo) =>
    t('settings.actionFrames', { n: a.frames })
      + ' · ' + (a.usedBy.length ? t('settings.usedByN', { n: a.usedBy.length }) : t('settings.unusedAction'))
      + (a.bodyFrames ? '' : ' · ' + t('settings.noBody'));

  const rows = matches.map((a, i) => {
    const text = label(a);
    return h('button', {
      key: a.id,
      type: 'button',
      role: 'option',
      'aria-selected': a.id === props.value ? 'true' : 'false',
      className: 'status-pet-row' + (a.id === props.value ? ' active' : '') + (i === hi ? ' hi' : ''),
      title: text + (a.origin ? ' · ' + a.origin : ''),
      onMouseEnter: () => setHi(i),
      onClick: () => pick(a.id),
    },
      thumbOf(a),
      h('span', { className: 'status-pet-row-text' },
        h('span', { className: 'status-pet-row-name' }, text),
        h('span', { className: 'status-pet-row-meta' }, readOut(a)))
    );
  });

  return h('div', { className: 'status-pet-combo', ref: rootRef },
    h('input', {
      type: 'text',
      className: 'status-pet-combo-input',
      // Closed, the box IS the read-out of what is on the board; open, it is
      // the search field.  One control, one place to look.
      value: open ? query : (selected ? label(selected) : ''),
      placeholder: t('settings.comboPlaceholder'),
      role: 'combobox',
      'aria-expanded': open ? 'true' : 'false',
      'aria-label': t('settings.region.action'),
      'aria-autocomplete': 'list',
      onFocus: () => { if (!open) openList(); },
      onChange: (e: { target: { value: string } }) => { setQuery(e.target.value); setOpen(true); setHi(0); },
      onKeyDown: onKey,
    }),
    h('span', { className: 'status-pet-combo-caret', 'aria-hidden': 'true' }),
    open
      ? h('div', {
          className: 'status-pet-combo-pop',
          ref: panelRef,
          role: 'listbox',
          'aria-label': t('settings.region.action'),
        },
          h('div', { className: 'status-pet-combo-list' }, rows.length ? rows
            : h('div', { className: 'status-pet-hint' },
                query ? t('settings.comboEmpty', { q: query.trim() }) : t('settings.emptyLibrary')))
        )
      : null
  );
}
