// The idle clear confirmation dialog — rendered as a modal overlay inside the
// assignment surface, asked for at exactly the moment the user clicks 清空 on
// 空闲 (the one state where it has a rule to explain).

import { h } from '../../platform/deps.ts';

export function clearConfirm(props: {
  t: (key: string) => string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return h('div', {
    className: 'status-pet-confirm', role: 'dialog', 'aria-modal': 'true',
    'aria-label': props.t('settings.clearIdleTitle'),
  },
    h('div', { className: 'status-pet-confirm-card' },
      h('div', { className: 'status-pet-confirm-title' }, props.t('settings.clearIdleTitle')),
      h('div', { className: 'status-pet-hint' }, props.t('settings.clearIdleHint')),
      h('div', { className: 'status-pet-bulk-ops' },
        h('button', { type: 'button', className: 'status-pet-mini-button', onClick: props.onCancel },
          props.t('settings.cancel')),
        h('button', { type: 'button', className: 'status-pet-mini-button', onClick: props.onConfirm },
          props.t('settings.clearSelection')))));
}