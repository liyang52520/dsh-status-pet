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
//            header, then the library as one checkbox per action.
//     动作   the studio, full width (`PixelEditor`), with ONE control that
//            searches, previews and selects the action — a dropdown — so the
//            board keeps the whole pane.  The library's destructive op lives in
//            that dropdown's footer.
//
// Why not a library LIST beside the studio: the settings pane is ~555 CSS px
// wide, so a 216px list column leaves the board ~325px, which is 2.5 CSS px per
// pixel of a 128 face.  A list you have to look at is not worth a board you
// cannot draw on; a dropdown costs no width and is there when you need it.
//
// And why the state list is the exception: eleven short rows ARE the context of
// the assignment ("which of these am I editing, and what do the others play?"),
// they need no search, and they cost ~176px — the checklist keeps ~360px, which
// is plenty for a checkbox, a thumbnail, a name and a read-out.
//
// The 32 / 128 switch is NOT navigation and NOT on the axis: it lives on the
// studio's 画布 row, the only place where the answer changes what you do.  Every
// preview in the 状态 view asks for the most detailed face there is.

import { React, h } from '../../host-deps.ts';
import { STATE_NAMES, STATES, REACTIONS } from '../../pet/behavior.ts';
import { CSS } from '../styles.ts';
import { translatorOrFallback } from '../../pet/labels.ts';
import type { Translator } from '../../pet/labels.ts';
import {
  activeSkin,
  onSkinChange,
  skinArtwork,
  skinLibrary,
} from '../../pet/skins/store.ts';
import type { CustomArtwork, LibraryEntryInfo } from '../../pet/skins/store.ts';
import { AVATAR_GRID } from '../../pet/grids.ts';
import { SkinPicker } from './skin-picker.ts';
import { PixelEditor } from './pixel-editor.ts';
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
  // Which FACE the studio draws.  A viewing preference, never part of the
  // artwork, and never navigation (see the header).
  const [crop, setCrop] = React.useState<number>(AVATAR_GRID);
  const [state, setState] = React.useState<string>('idle');
  const [action, setAction] = React.useState<string | null>(null);
  // Bumped by the studio after a write, so the state list (which reads the
  // store's frame counts and owners on every render) is re-rendered with them.
  const [rev, setRev] = React.useState(0);
  const onWritten = () => setRev((r) => r + 1);

  const library: LibraryEntryInfo[] = skinLibrary(skin);
  const art: CustomArtwork | null = skinArtwork(skin);
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
        // ONE 动作 view for EVERY skin: the same studio, in the same place, with
        // the same rows.  A built-in's is a VIEWER — nothing on it writes and
        // nothing on it copies the artwork either; drawing means picking 我的创作
        // in the skin cards, which seeds itself from the active skin.
        : h(PixelEditor, {
            t, grid: crop,
            onGridChange: setCrop,
            actionId: selected ? selected.id : undefined,
            onActionChange: setAction,
            rev,
            onWritten,
            onShowState: (name: string) => { setState(name); setObject('states'); },
          })
    )
  );
}
