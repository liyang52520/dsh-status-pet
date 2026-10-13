// The Workshop — the settings page.
//
// TWO things, and one control above them:
//
//   皮肤   the WHO: one card per skin
//   [状态 | 动作]
//
//     状态   a LIGHT list of the eleven states on the left (name + what it
//            plays, no search — there are eleven of them), and the edit surface
//            for the selected one on the right (`StateAssignments`): a compact
//            header, then the library as one checkbox per action.  This is the
//            one thing a user owns.
//     动作   the viewer, full width (`ActionViewer`): a picker that searches and
//            selects, the 1:1 board beside the action's live preview, and the
//            filmstrip.  It LOOKS — the pixels are authored.
//
// Why the state list is a list and not a dropdown: eleven short rows ARE the
// context of the assignment ("which of these am I editing, and what do the
// others play?"), they need no search, and they cost ~176px — the checklist
// keeps ~360px, which is plenty for a checkbox, a thumbnail, a name and a
// read-out.
//
// The 32 / 128 switch is NOT navigation and NOT on the axis: it lives on the
// viewer's 画布 row, the only place where the answer changes what you see.

import { React, h } from '../../host-deps.ts';
import { STATE_NAMES, STATES, REACTIONS } from '../../pet/behavior.ts';
import { CSS } from '../styles.ts';
import { translatorOrFallback } from '../../pet/labels.ts';
import type { Translator } from '../../pet/labels.ts';
import {
  activeSkin,
  onSkinChange,
  skinLibrary,
} from '../../pet/skins/store.ts';
import type { LibraryEntryInfo } from '../../pet/skins/store.ts';
import { AVATAR_GRID } from '../../pet/grids.ts';
import { SkinPicker } from './skin-picker.ts';
import { ActionViewer } from './action-viewer.ts';
import { StateAssignments } from './assignments.ts';

const OBJECTS = [
  ['states', 'settings.view.states'],
  ['actions', 'settings.view.actions'],
] as const;

type WorkshopObject = (typeof OBJECTS)[number][0];

export function SettingsPage(props: { t?: Translator } | null) {
  props = props || {};
  const t = translatorOrFallback(props.t);
  const [skin, setSkin] = React.useState(() => activeSkin().name);
  React.useEffect(() => onSkinChange(() => setSkin(activeSkin().name)), []);
  const [object, setObject] = React.useState<WorkshopObject>('states');
  // Which FACE the viewer draws.  A viewing preference, never part of the
  // artwork, and never navigation (see the header).
  const [crop, setCrop] = React.useState<number>(AVATAR_GRID);
  const [state, setState] = React.useState<string>('idle');
  const [action, setAction] = React.useState<string | null>(null);
  // Bumped by the assignment surface after a write, so the state list (which
  // reads the store's owners on every render) is re-rendered with them.
  const [rev, setRev] = React.useState(0);
  const onWritten = () => setRev((r) => r + 1);

  const library: LibraryEntryInfo[] = skinLibrary(skin);
  const selected = library.find((a) => a.id === action) || library[0] || null;
  void rev;

  const stateRows = (names: readonly string[]) => names.map((name) => {
    const plays = library.filter((a) => a.usedBy.includes(name)).length;
    const on = object === 'states' && state === name;
    return h('button', {
      key: name,
      type: 'button',
      className: 'status-pet-state-row' + (on ? ' active' : ''),
      'aria-pressed': on ? 'true' : 'false',
      title: t('settings.hint.' + name),
      onClick: () => setState(name),
    },
      h('span', { className: 'status-pet-state-name' }, t(name)),
      h('span', { className: 'status-pet-state-meta' }, plays
        ? t('settings.actionCount', { n: plays })
        : t('settings.followIdle'))
    );
  });

  return h('div', { className: 'status-pet-section' },
    h('style', null, CSS),
    h(SkinPicker, { t }),
    h('div', { className: 'status-pet-workshop' },
      h('div', { className: 'status-pet-axis', role: 'group', 'aria-label': t('settings.view') },
        OBJECTS.map(([id, key]) =>
          h('button', {
            key: id,
            type: 'button',
            className: 'status-pet-mini-button' + (object === id ? ' active' : ''),
            'aria-pressed': object === id ? 'true' : 'false',
            onClick: () => setObject(id as WorkshopObject),
          }, t(key))
        )
      ),

      object === 'states'
        ? h('div', { className: 'status-pet-columns' },
            h('div', { className: 'status-pet-state-list' },
              h('div', { className: 'status-pet-list-caption' }, t('settings.master.states')),
              stateRows(STATE_NAMES.filter((n) => n in STATES)),
              h('div', { className: 'status-pet-list-caption' }, t('settings.master.reactions')),
              stateRows(STATE_NAMES.filter((n) => n in REACTIONS))
            ),
            h(StateAssignments, {
              key: 'assign:' + skin,
              t, skin, state,
              onWritten,
            })
          )
        // The 动作 view: the whole library, one action at a time.  It only
        // LOOKS — a built-in's pixels are authored and frozen.
        : h(ActionViewer, {
            key: 'view:' + skin,
            t, skin, grid: crop,
            onGridChange: setCrop,
            actionId: selected ? selected.id : undefined,
            onActionChange: setAction,
          })
    )
  );
}
