// The Workshop's field row — one labelled row of a settings card.
//
// The label column is the spine: it is what makes a region read as a list of
// settings instead of a heap of buttons.  The assignment surface is built out
// of it.
//
// A plain function, not a component: it holds no state, and keeping its output
// in the caller's tree is what lets the tests (and the reader) see each card as
// one page.

import { h } from '../../host-deps.ts';

export function field(key: string, label: string, labelTitle: string | undefined, ...body: unknown[]) {
  return h('div', { className: 'status-pet-field', key },
    h('span', { className: 'status-pet-field-label', title: labelTitle }, label),
    h('div', { className: 'status-pet-field-body' }, ...body));
}
