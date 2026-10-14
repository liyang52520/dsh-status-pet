// The action picker: ONE control that searches, previews and selects.
//
// Closed, it shows the action on the board.  Focused / typing, it opens a
// filtered list — every row is a PLAYING thumbnail plus its read-out, because
// pixel animations are recognised by eye.  ↑/↓ move the highlight, Enter picks,
// Esc closes.

import { React, h, useDismissOnOutsidePointer } from '../../platform/deps.ts';
import type { FaceName } from '../../skin/geometry.ts';
import type { ActionInfo } from '../../skin/library.ts';
import { translatorOrFallback } from '../../labels/index.ts';
import type { Translator } from '../../labels/index.ts';
import { ActionThumb } from './action-thumb.ts';

export function ActionPicker(props: {
  t?: Translator;
  skin: string;
  library: ActionInfo[];
  face: FaceName;
  value: string;
  onSelect: (id: string) => void;
}) {
  const t = translatorOrFallback(props.t);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [hi, setHi] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  if (useDismissOnOutsidePointer) useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef);

  const label = (a: ActionInfo) => a.name || t('settings.actionN', { n: props.library.indexOf(a) + 1 });
  const q = query.trim().toLowerCase();
  const matches = props.library.filter((a) =>
    !q || (label(a) + ' ' + (a.origin || '') + ' ' + a.id).toLowerCase().includes(q));
  const selected = props.library.find((a) => a.id === props.value) || null;

  function openList() {
    setOpen(true);
    setQuery('');
    const at = props.library.findIndex((a) => a.id === props.value);
    setHi(at < 0 ? 0 : at);
  }
  function close() { setOpen(false); setQuery(''); }
  function pick(id: string) { props.onSelect(id); close(); }

  function onKey(e: { key?: string; preventDefault?: () => void }) {
    if (e.key === 'Escape') { e.preventDefault?.(); close(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault?.();
      if (!open) { openList(); return; }
      if (!matches.length) return;
      setHi(((hi + (e.key === 'ArrowDown' ? 1 : -1)) % matches.length + matches.length) % matches.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault?.();
      if (open && matches[hi]) pick(matches[hi].id);
      else if (!open) openList();
    }
  }

  const readOut = (a: ActionInfo) =>
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
      h(ActionThumb, { skin: props.skin, actionId: a.id, face: props.face }),
      h('span', { className: 'status-pet-row-text' },
        h('span', { className: 'status-pet-row-name' }, text),
        h('span', { className: 'status-pet-row-meta' }, readOut(a)))
    );
  });

  return h('div', { className: 'status-pet-combo', ref: rootRef },
    h('input', {
      type: 'text',
      className: 'status-pet-combo-input',
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
      ? h('div', { className: 'status-pet-combo-pop', ref: panelRef, role: 'listbox', 'aria-label': t('settings.region.action') },
          h('div', { className: 'status-pet-combo-list' }, rows.length ? rows
            : h('div', { className: 'status-pet-hint' },
                query ? t('settings.comboEmpty', { q: query.trim() }) : t('settings.emptyLibrary'))))
      : null
  );
}