// The settings page itself (Workshop layer): the skin picker, then TWO tabs —
// 预览 (look at the pet) and 编辑 (change it) — with the 32 / 128 crop switch on
// the tab row because it belongs to both: it picks which crop you look at AND
// which crop you edit, so neither tab owns it.  There is deliberately no
// position control (see main.ts) and no standalone recolour row.
//
// ── both tabs ask the same two questions ──
//
// 预览 and 编辑 each carry the SAME 按状态 / 按动作 switch, because the two ways
// of looking are also the two ways of working:
//
//   按状态  →  what each state PLAYS (its assignment, shown as a badge in 预览,
//              ticked in 编辑)
//   按动作  →  one library action, as material (browsed live in 预览, drawn in
//              编辑)
//
// The switch is shared vocabulary, but each tab remembers its own mode: 预览
// opens 按状态 (the RESULT — what the pet will look like, which is the question
// a status pet has to answer), 编辑 opens 按动作 (the MATERIAL you came to draw).
//
// ── and each mode is ONE job ──
//
// 编辑 · 按动作 is a pure action editor: an action dropdown, then the board.
// 编辑 · 按状态 is a pure assignment surface: a state dropdown, then the
// checkboxes.  Neither mentions the other's control, which is the fix for the
// old single page where one state dropdown sat above a checkbox list and a pixel
// board and decided only half of what the user thought it decided.
//
// ── what a BUILT-IN may change ──
//
// A built-in keeps its 编辑 tab, but only the 按状态 half: its pixels are
// authored and frozen, while WHICH OF ITS OWN ACTIONS each state plays is
// presentation and the user's to change (the store keeps that as a diff beside
// the skin — `saveSkinStates`).  So the mode switch loses 按动作 for a built-in,
// its state cells carry the corner ✎ and its action cells do not, and a quiet
// line says where pixels CAN be changed (我的创作).
//
// ── jumping from 预览 ──
//
// State cells (every skin) and action cells (我的创作 only) wear a small
// floating ✎ in their top-right corner — an action cell has nothing on the other
// side of the jump on a built-in, because its actions cannot be edited.  It
// opens the matching 编辑 mode ALREADY POINTING AT THAT CELL: an action cell →
// 按动作 with that action on the board; a state cell → 按状态 with that state's
// boxes in front of you.  The cell itself stays inert — the corner button is the
// affordance, so looking at the pet never edits it.
//
// A gallery cell displays the pet at `LIVE_ZOOM` — 64 CSS px of art, an exact
// 1:2, the size the click popup uses.  The cells are for RECOGNISING an action
// or a state at a glance, not for judging pixels (that is what the studio's 1:1
// board and preview are for).

import { React, h } from '../../host-deps.ts';
import { STATE_NAMES } from '../../pet/behavior.ts';
import { CSS } from '../styles.ts';
import { translatorOrFallback } from '../../pet/labels.ts';
import type { Translator } from '../../pet/labels.ts';
import { activeSkin, onSkinChange, skinLibrary } from '../../pet/skins/store.ts';
import type { LibraryEntryInfo } from '../../pet/skins/store.ts';
import { AVATAR_GRID, BODY_GRID, LIVE_ZOOM } from '../../pet/grids.ts';
import { PetPreview } from '../pet-preview.ts';
import { SkinPicker } from './skin-picker.ts';
import { PixelEditor } from './pixel-editor.ts';
import { StateAssignments } from './assignments.ts';

const TABS = [
  ['preview', 'settings.tab.preview'],
  ['edit', 'settings.tab.edit'],
] as const;

const VIEWS = [
  ['states', 'settings.view.states'],
  ['actions', 'settings.view.actions'],
] as const;

type View = (typeof VIEWS)[number][0];

/** How many live action cells 按动作 renders at once.  Each one is an animated
 * canvas and a 106-action library would mount all of them; the rest arrive on
 * demand, so the view is complete without being a load at open. */
const ACTION_PAGE = 24;

export function SettingsPage(props: { t?: Translator } | null) {
  props = props || {};
  const t = translatorOrFallback(props.t);
  // Follow the picker: choosing a built-in has to take 编辑 away.
  const [skin, setSkin] = React.useState(() => activeSkin().name);
  React.useEffect(() => onSkinChange(() => setSkin(activeSkin().name)), []);
  // 预览 first: the page opens on "look at it", not on the drawing tools.
  const [tab, setTab] = React.useState<(typeof TABS)[number][0]>('preview');
  // Which crop both tabs work on: 32 (the dock avatar — the pet as it actually
  // looks in the composer) by default, 128 for the full body.  A viewing
  // preference, never part of the artwork; the 32px crop is drawn at 4×, so both
  // land on the same on-screen size.
  const [crop, setCrop] = React.useState<number>(AVATAR_GRID);
  // Each tab remembers its own 按状态 / 按动作 mode (see the header).
  const [previewView, setPreviewView] = React.useState<View>('states');
  const [editView, setEditView] = React.useState<View>('actions');
  // What 编辑 · 按状态 has in front of it, and what 编辑 · 按动作 has on the
  // board — both settable from 预览's corner ✎.
  const [editState, setEditState] = React.useState<string>('idle');
  const [editAction, setEditAction] = React.useState<string | null>(null);
  const [shown, setShown] = React.useState(ACTION_PAGE);
  // BOTH skins get the 编辑 tab: a built-in's state ASSIGNMENTS are editable,
  // only its pixels are not (see the header).  That is why 按动作 — the studio —
  // is the part that disappears, not the whole tab.
  const isCustom = skin === 'custom';
  const activeTab = tab;
  const tabs: ReadonlyArray<readonly [string, string]> = TABS;
  // 按状态 is the one mode every skin has; 按动作 needs an editable artwork.
  const editViews: ReadonlyArray<readonly [string, string]> = isCustom ? VIEWS : [VIEWS[0]];
  const editMode: View = isCustom ? editView : 'states';
  const library: LibraryEntryInfo[] = skinLibrary(skin, crop);
  const unused = library.filter((a) => !a.usedBy.length).length;
  const ids = library.map((a) => a.id);

  // The corner ✎: open 编辑 on the same thing the cell was showing.
  function editActionFrom(id: string) {
    setEditAction(id);
    setEditView('actions');
    setTab('edit');
  }
  function editStateFrom(name: string) {
    setEditState(name);
    setEditView('states');
    setTab('edit');
  }

  // The 按状态 / 按动作 switch — the one control both tabs carry, and the only
  // thing that decides which half of a tab is on screen.
  const viewBar = (views: ReadonlyArray<readonly [string, string]>, view: View, onView: (v: View) => void, extra?: unknown) =>
    h('div', { className: 'status-pet-gallery-bar' },
      h('div', { className: 'status-pet-view-switch', role: 'group', 'aria-label': t('settings.view') },
        views.map(([id, label]) =>
          h('button', {
            key: id,
            type: 'button',
            className: 'status-pet-mini-button' + (view === id ? ' active' : ''),
            'aria-pressed': view === id ? 'true' : 'false',
            onClick: () => onView(id as View),
          }, t(label))
        )
      ),
      extra === undefined ? null : extra
    );

  return h('div', { className: 'status-pet-section' },
    h('style', null, CSS),
    h(SkinPicker, { t }),
    h('div', { className: 'status-pet-tabs' },
      h('div', { className: 'status-pet-tab-list', role: 'tablist' },
        tabs.map(([id, label]) =>
          h('button', {
            key: id,
            type: 'button',
            role: 'tab',
            className: 'status-pet-tab' + (activeTab === id ? ' active' : ''),
            'aria-selected': activeTab === id ? 'true' : 'false',
            // Opening 编辑 from the tab row is the ordinary way in: no jump
            // target survives from an earlier corner ✎.
            onClick: () => { if (id === 'edit') setEditAction(null); setTab(id as (typeof TABS)[number][0]); },
          }, t(label))
        )
      ),
      h('div', { className: 'status-pet-grid-toggle' },
        [AVATAR_GRID, BODY_GRID].map((g) =>
          h('button', {
            key: g,
            type: 'button',
            className: 'status-pet-mini-button' + (crop === g ? ' active' : ''),
            'aria-pressed': crop === g ? 'true' : 'false',
            onClick: () => { setCrop(g); setShown(ACTION_PAGE); },
          }, t('settings.grid.' + g))
        )
      )
    ),
    activeTab === 'edit'
      ? h('div', {
          className: 'status-pet-gallery-wrap',
          role: 'tabpanel',
          'aria-label': t('settings.tab.edit'),
        },
          viewBar(editViews, editMode, setEditView,
            // A built-in cannot be drawn on, and saying so here is kinder than
            // letting the user hunt for a board that is not there.
            isCustom ? null : h('span', { className: 'status-pet-hint' }, t('settings.builtinStatesOnly'))),
          editMode === 'states'
            // Keyed by skin: the picker can swap skins WHILE 编辑 is open (both
            // skins have this mode now), and the surface holds the document it
            // read on mount — a remount is what makes it re-read instead of
            // writing the new skin's name onto the old skin's artwork.
            ? h(StateAssignments, {
                key: 'assign:' + skin,
                t, skin, grid: crop, state: editState, onStateChange: setEditState,
              })
            : h(PixelEditor, { t, grid: crop, actionId: editAction || undefined })
        )
      // ── 预览 ── the mode switch, then either the state gallery or the action
      // gallery.
      : h('div', {
          className: 'status-pet-gallery-wrap',
          role: 'tabpanel',
          'aria-label': t('settings.tab.preview'),
        },
          viewBar(VIEWS, previewView, setPreviewView,
            // The library's dead weight, said out loud: an action nothing plays
            // is invisible in 按状态, and silently accumulating art is worse
            // than a number.
            unused
              ? h('span', { className: 'status-pet-hint' }, t('settings.unusedCount', { n: unused }))
              : null),
          // Plain render helpers, not components: they hold no state, and
          // keeping their output in this tree is what lets a test (and the
          // reader) see the gallery as one page.  The corner ✎ is handed in
          // only for 我的创作.
          previewView === 'states'
            // A state's assignment is editable on EVERY skin, so every state
            // cell offers the jump.
            ? stateGallery({ t, crop, library, onEdit: editStateFrom })
            // An action's pixels are not, on a built-in.
            : actionGallery({ t, crop, library, ids, shown,
                onMore: () => setShown(shown + ACTION_PAGE),
                onEdit: isCustom ? editActionFrom : null })
        )
  );
}

/** 按状态: one cell per state, LIVE, with its assignment as a badge. */
function stateGallery(props: {
  t: (k: string, p?: Record<string, unknown>) => string;
  crop: number;
  library: LibraryEntryInfo[];
  onEdit: ((state: string) => void) | null;
}) {
  const t = props.t;
  return h('div', { className: 'status-pet-gallery' },
    STATE_NAMES.map((name) => {
      // The badge counts the actions this state plays, from the SAME library
      // list 按动作 shows — so the two views can never disagree about what is
      // assigned.  Zero means "follows idle", and it is the one thing that
      // cannot be seen anywhere else.
      const plays = props.library.filter((a) => a.usedBy.includes(name)).length;
      return h('div', { className: 'status-pet-gallery-cell', key: name, title: t('settings.hint.' + name) },
        props.onEdit
          ? h('button', {
              type: 'button',
              className: 'status-pet-gallery-edit',
              'aria-label': t(name) + ' — ' + t('settings.editState'),
              title: t('settings.editState'),
              onClick: () => props.onEdit!(name),
            }, '✎')
          : null,
        h(PetPreview, { state: name, crop: props.crop, zoom: LIVE_ZOOM, interactive: false }),
        h('div', { className: 'status-pet-gallery-label' }, t(name)),
        h('div', { className: 'status-pet-gallery-meta' + (plays ? '' : ' idle-fallback') },
          plays ? t('settings.actionCount', { n: plays }) : t('settings.followIdle'))
      );
    })
  );
}

/** 按动作: one cell per library action — the whole catalog, live. */
function actionGallery(props: {
  t: (k: string, p?: Record<string, unknown>) => string;
  crop: number;
  library: LibraryEntryInfo[];
  ids: string[];
  shown: number;
  onMore: () => void;
  onEdit: ((id: string) => void) | null;
}) {
  const t = props.t;
  const visible = props.library.slice(0, props.shown);
  return h('div', null,
    h('div', { className: 'status-pet-gallery' },
      visible.map((a) => {
        const label = a.name || t('settings.actionN', { n: props.ids.indexOf(a.id) + 1 });
        return h('div', {
          className: 'status-pet-gallery-cell',
          key: a.id,
          title: label + (a.origin ? ' · ' + a.origin : ''),
        },
          props.onEdit
            ? h('button', {
                type: 'button',
                className: 'status-pet-gallery-edit',
                'aria-label': label + ' — ' + t('settings.editAction'),
                title: t('settings.editAction'),
                onClick: () => props.onEdit!(a.id),
              }, '✎')
            : null,
          h(PetPreview, { takeId: a.id, crop: props.crop, zoom: LIVE_ZOOM, interactive: false }),
          h('div', { className: 'status-pet-gallery-text' },
            h('div', { className: 'status-pet-gallery-label' }, label),
            h('div', { className: 'status-pet-gallery-meta' },
              a.usedBy.length
                ? t('settings.usedByN', { n: a.usedBy.length })
                : t('settings.unusedAction')))
        );
      })
    ),
    props.shown < props.library.length
      ? h('div', { className: 'status-pet-colors' },
          h('button', { type: 'button', className: 'status-pet-mini-button', onClick: props.onMore },
            t('settings.showMore')))
      : null
  );
}
