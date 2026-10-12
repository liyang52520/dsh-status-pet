// The action picker: ONE control that searches, previews and selects.
//
// It replaces two things the old page had side by side — a 106-row library list
// and a separate search box — because at the settings pane's real width
// (~555px) a list column next to the studio leaves the board 325px, which is
// 2.5 CSS px per pixel of a 128 face.  A dropdown costs no width at all: the
// studio keeps the full pane, and the list arrives only while you are choosing.
//
//   * closed, it shows the action on the board;
//   * focused/typing, it opens a filtered list — every row is a THUMBNAIL plus
//     its read-out, because pixel animations are recognised by eye;
//   * ↑/↓ move the highlight, Enter picks, Esc closes;
//   * on 我的创作 a footer entry switches the SAME list into 批量删除 mode
//     (rows become checkboxes), so the library's one destructive op still lives
//     beside the library instead of in a tab of its own.
//
// It owns no document state: `onSelect` and `onRemove` are the page's (the
// studio commits what it is told to), so there is one writer per surface.

import { React, h, useDismissOnOutsidePointer } from '../../host-deps.ts';
import { translatorOrFallback } from '../../pet/labels.ts';
import type { Translator } from '../../pet/labels.ts';
import { actionsOf, cellFor } from '../../pet/skins/store.ts';
import type { Action, CustomArtwork, LibraryEntryInfo } from '../../pet/skins/store.ts';
import { FrameCanvas, ROW_THUMB_CSS } from './frame-canvas.ts';

export interface ActionComboProps {
  t?: Translator;
  /** Every action, in library order — the page's `skinLibrary`. */
  library: LibraryEntryInfo[];
  /** The document the thumbnails come from (palette + frames). */
  art: CustomArtwork | null;
  /** Which FACE the thumbnails show (the studio's current face). */
  grid: number;
  /** The action on the board. */
  value: string;
  onSelect: (id: string) => void;
  /** 我的创作 only: the bulk removal, reached from the list's footer. */
  canManage?: boolean;
  removalBlocked?: (ids: string[]) => boolean;
  onRemove?: (ids: string[]) => void;
}

export function ActionCombo(props: ActionComboProps) {
  const t = translatorOrFallback(props.t);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [hi, setHi] = React.useState(0);
  const [managing, setManaging] = React.useState(false);
  const [picked, setPicked] = React.useState<string[]>([]);
  const [confirming, setConfirming] = React.useState(false);
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
  const pickedLive = picked.filter((id) => props.library.some((a) => a.id === id));
  const blocked = props.removalBlocked ? props.removalBlocked(pickedLive) : false;

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
    setManaging(false);
    setQuery('');
    setPicked([]);
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

  const thumbOf = (a: LibraryEntryInfo) => {
    if (!props.art) return null;
    const found = actionsOf(props.art).find((x) => x.id === a.id);
    if (!found || !found.frames.length) return null;
    return h(FrameCanvas, {
      frame: cellFor(found.frames[0], props.grid),
      palette: props.art.palette,
      grid: props.grid,
      css: ROW_THUMB_CSS,
    });
  };
  const readOut = (a: LibraryEntryInfo) =>
    t('settings.actionFrames', { n: a.frames })
      + ' · ' + (a.usedBy.length ? t('settings.usedByN', { n: a.usedBy.length }) : t('settings.unusedAction'))
      + (a.bodyFrames ? '' : ' · ' + t('settings.noBody'));

  const rows = matches.map((a, i) => {
    const text = label(a);
    if (managing) {
      const on = pickedLive.includes(a.id);
      return h('label', {
        key: a.id,
        className: 'status-pet-row' + (on ? ' on' : ''),
      },
        h('input', {
          type: 'checkbox',
          className: 'status-pet-row-check',
          checked: on,
          'aria-label': text,
          onChange: () => setPicked(on ? pickedLive.filter((x) => x !== a.id) : pickedLive.concat([a.id])),
        }),
        thumbOf(a),
        h('span', { className: 'status-pet-row-text' },
          h('span', { className: 'status-pet-row-name' }, text),
          h('span', { className: 'status-pet-row-meta' }, readOut(a)))
      );
    }
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
                query ? t('settings.comboEmpty', { q: query.trim() }) : t('settings.emptyLibrary'))),
          h('div', { className: 'status-pet-combo-foot' },
            managing
              ? [
                  h('button', {
                    type: 'button', className: 'status-pet-mini-button',
                    onClick: () => setPicked(matches.map((a) => a.id)),
                    disabled: !matches.length,
                  }, t('settings.selectAll')),
                  h('button', {
                    type: 'button', className: 'status-pet-mini-button',
                    onClick: () => setPicked([]), disabled: !pickedLive.length,
                  }, t('settings.clearSelection')),
                  h('span', { className: 'status-pet-hint' }, t('settings.selectedCount', { n: pickedLive.length })),
                  h('button', {
                    type: 'button',
                    className: 'status-pet-mini-button status-pet-danger',
                    disabled: !pickedLive.length || blocked,
                    title: blocked ? t('settings.deleteBlocked') : t('settings.deleteSelected'),
                    onClick: () => { if (pickedLive.length && !blocked) setConfirming(true); },
                  }, t('settings.deleteSelected')),
                  h('button', {
                    type: 'button', className: 'status-pet-ghost-link',
                    onClick: () => { setManaging(false); setPicked([]); },
                  }, t('settings.cancel')),
                ]
              : [
                  props.canManage
                    ? h('button', {
                        type: 'button', className: 'status-pet-mini-button',
                        title: t('settings.bulkHint'),
                        onClick: () => { setManaging(true); setPicked([]); },
                      }, t('settings.manageActions'))
                    : null,
                ]
          )
        )
      : null,
    // The confirm sits OUTSIDE the popup: it is a modal, and a removal is not
    // undoable, so nothing is written until 删除.
    confirming
      ? h('div', {
          className: 'status-pet-confirm', role: 'dialog', 'aria-modal': 'true',
          'aria-label': t('settings.confirmDeleteTitle', { n: pickedLive.length }),
        },
          h('div', { className: 'status-pet-confirm-card' },
            h('div', { className: 'status-pet-confirm-title' },
              t('settings.confirmDeleteTitle', { n: pickedLive.length })),
            h('div', { className: 'status-pet-hint' }, t('settings.confirmDeleteHint')),
            h('div', { className: 'status-pet-bulk-ops' },
              h('button', {
                type: 'button', className: 'status-pet-mini-button',
                onClick: () => setConfirming(false),
              }, t('settings.cancel')),
              h('button', {
                type: 'button', className: 'status-pet-mini-button status-pet-danger',
                onClick: () => {
                  if (props.onRemove) props.onRemove(pickedLive);
                  setConfirming(false);
                  close();
                },
              }, t('settings.confirmDelete')))))
      : null
  );
}
