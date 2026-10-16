// The idle clear confirmation dialog — rendered as a modal overlay inside the
// assignment surface, asked for at exactly the moment the user clicks 清空 on
// 空闲 (the one state where it has a rule to explain).
//
// It is a real modal: focus moves into it on mount, Escape cancels, and the two
// actions are the only focusable things inside.  A focus trap would be nicer, but
// the panel is two buttons wide — moving focus in and honouring Escape is what
// keeps a keyboard user from being stranded.

import { React, h } from '../../platform/deps.ts';

export function clearConfirm(props: {
  t: (key: string) => string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = React.useRef<HTMLButtonElement | null>(null);
  React.useEffect(() => {
    if (cancelRef.current) cancelRef.current.focus();
  }, []);
  React.useEffect(() => {
    const onKeyDown = (e: { key: string }) => { if (e.key === 'Escape') props.onCancel(); };
    document.addEventListener('keydown', onKeyDown as unknown as EventListener);
    return () => document.removeEventListener('keydown', onKeyDown as unknown as EventListener);
  }, [props.onCancel]);

  return h('div', {
    className: 'status-pet-confirm', role: 'dialog', 'aria-modal': 'true',
    'aria-label': props.t('settings.clearIdleTitle'),
  },
    h('div', { className: 'status-pet-confirm-card' },
      h('div', { className: 'status-pet-confirm-title' }, props.t('settings.clearIdleTitle')),
      h('div', { className: 'status-pet-hint' }, props.t('settings.clearIdleHint')),
      h('div', { className: 'status-pet-bulk-ops' },
        h('button', {
          ref: cancelRef, type: 'button', className: 'status-pet-mini-button', onClick: props.onCancel,
        }, props.t('settings.cancel')),
        h('button', { type: 'button', className: 'status-pet-mini-button', onClick: props.onConfirm },
          props.t('settings.clearSelection')))));
}
