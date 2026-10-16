// The Workshop page shell: skin cards, the 状态/动作 axis, and whichever half
// of the Workshop is currently showing.
//
// It owns which state is being assigned and which action is on the board — so
// the two halves can never disagree, and neither carries its own selector.

import { React, h } from '../../platform/deps.ts';
import { STATE_NAMES, STATES, REACTIONS } from '../../behavior/vocabulary.ts';
import { THEME } from '../../platform/theme.ts';
import { translatorOrFallback } from '../../labels/index.ts';
import type { Translator } from '../../labels/index.ts';
import { libraryOf } from '../../skin/documents.ts';
import type { ActionInfo } from '../../skin/library.ts';
import { AVATAR_FACE } from '../../skin/geometry.ts';
import type { FaceName } from '../../skin/geometry.ts';
import { activeSkin, onSkinChange } from '../../skin/session.ts';
import { SkinCards } from './skin-cards.ts';
import { DockTextSetting } from './dock-text.ts';
import { StateAssignments } from './assignment-list.ts';
import { ActionViewer } from './action-panel.ts';

const VIEWS = [
  ['states', 'settings.view.states'],
  ['actions', 'settings.view.actions'],
] as const;

type WorkshopView = (typeof VIEWS)[number][0];

export function SettingsPage(props: { t?: Translator } | null) {
  props = props || {};
  const t = translatorOrFallback(props.t);

  const [skin, setSkin] = React.useState(() => activeSkin().name);
  const [view, setView] = React.useState<WorkshopView>('states');
  const [face, setFace] = React.useState<FaceName>(AVATAR_FACE);
  const [stateName, setStateName] = React.useState<string>('idle');
  const [actionId, setActionId] = React.useState<string | null>(null);
  const [rev, setRev] = React.useState(0);

  // Any store change bumps `rev` as well as the name: the artwork chunk landing
  // keeps the SAME skin name (`activeSkin().name` does not move), so a setSkin of
  // an equal string would bail out and the Workshop would stay empty for the whole
  // session.  `rev` is what makes that change visible.
  React.useEffect(() => onSkinChange(() => {
    setSkin(activeSkin().name);
    setRev((r) => r + 1);
  }), []);

  const library: ActionInfo[] = React.useMemo(() => libraryOf(skin), [skin, rev]);
  const selected = library.find((a) => a.id === actionId) || library[0] || null;

  // How many actions each state plays — computed ONCE per library, not once per
  // row.  This used to be `library.filter(...)` inside `stateRow`, i.e. 24 × 106
  // `includes` on every render of the Workshop, and the profile showed it as the
  // single biggest plugin frame in the whole assignment flow.
  const playsByName = React.useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < library.length; i++) {
      const used = library[i].usedBy;
      for (let k = 0; k < used.length; k++) map.set(used[k], (map.get(used[k]) || 0) + 1);
    }
    return map;
  }, [library]);

  // The 24 state rows: one line each, grouped states / reactions.  They live in
  // their OWN scrolling box — 24 rows are far taller than the action library
  // beside them, and the page belongs to the whole settings form, not to this
  // one column.  See `.status-pet-state-scroll` in platform/theme.ts (the cap is
  // the same knob the library uses, so the two columns can never drift apart).
  const stateRow = (name: string) => {
    const plays = playsByName.get(name) || 0;
    const on = view === 'states' && stateName === name;
    return h('button', {
      key: name,
      type: 'button',
      className: 'status-pet-state-row' + (on ? ' active' : ''),
      'aria-pressed': on ? 'true' : 'false',
      title: t('settings.hint.' + name),
      onClick: () => setStateName(name),
    },
      h('span', { className: 'status-pet-state-name' }, t(name)),
      h('span', { className: 'status-pet-state-meta' }, plays
        ? t('settings.actionCount', { n: plays })
        : t('settings.followIdle'))
    );
  };

  return h('div', { className: 'status-pet-section' },
    h('style', null, THEME),
    h(SkinCards, { t }),
    h(DockTextSetting, { t, onChanged: () => setRev((r) => r + 1) }),
    h('div', { className: 'status-pet-workshop' },
      h('div', { className: 'status-pet-axis', role: 'group', 'aria-label': t('settings.view') },
        VIEWS.map(([id, key]) =>
          h('button', {
            key: id,
            type: 'button',
            className: 'status-pet-mini-button' + (view === id ? ' active' : ''),
            'aria-pressed': view === id ? 'true' : 'false',
            onClick: () => setView(id as WorkshopView),
          }, t(key))
        )
      ),

      view === 'states'
        ? h('div', { className: 'status-pet-columns' },
            h('div', { className: 'status-pet-state-list' },
              h('div', { className: 'status-pet-state-scroll' },
                h('div', { className: 'status-pet-list-caption' }, t('settings.master.states')),
                ...[...STATE_NAMES].filter((n) => n in STATES).map(stateRow),
                h('div', { className: 'status-pet-list-caption' }, t('settings.master.reactions')),
                ...[...STATE_NAMES].filter((n) => n in REACTIONS).map(stateRow),
              )
            ),
            h(StateAssignments, {
              key: 'assign:' + skin,
              t, skin, state: stateName,
              onWritten: () => setRev((r) => r + 1),
            })
          )
        : h(ActionViewer, {
            key: 'view:' + skin,
            t, skin, face,
            onFaceChange: setFace,
            actionId: selected ? selected.id : undefined,
            onActionChange: setActionId,
          })
    )
  );
}
