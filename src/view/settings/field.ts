// A field row — a label beside its body, the spine of a settings card.
// A plain function, not a component: it holds no state, and keeping its output
// in the caller's tree is what lets the tests read each card as one page.

import { h } from '../../platform/deps.ts';
import type { ReactNode } from '../../platform/deps.ts';

export function field(key: string, label: string, labelTitle: string | undefined, ...body: ReactNode[]) {
  return h('div', { className: 'status-pet-field', key },
    h('span', { className: 'status-pet-field-label', title: labelTitle }, label),
    h('div', { className: 'status-pet-field-body' }, ...body));
}