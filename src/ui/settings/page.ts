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
import {
  activeSkin,
  loadCustomArtwork,
  onSkinChange,
  removeLibraryTakes,
  removalIsBlocked,
  saveStored,
  skinLibrary,
} from '../../pet/skins/store.ts';
import type { CustomArtwork, LibraryEntryInfo } from '../../pet/skins/store.ts';
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
  // Each preview gallery carries its own SEARCH — 按状态 finds a state, 按动作
  // finds an action — because both views are material you scan, and the library
  // is 106 entries.
  const [stateQuery, setStateQuery] = React.useState('');
  const [actionQuery, setActionQuery] = React.useState('');
  // ── 预览 · 按动作's selection mode: THE place several actions are removed ──
  // 预览 is the MATERIAL view — it already lists every action as a live tile —
  // so "take several of these out of the library" belongs here, next to the
  // tiles themselves.  编辑 · 按动作 is the studio for ONE action; a checkbox
  // list in there mixed the two jobs back together.
  //
  // A removal is destructive and this page has no history stack, so it takes a
  // CONFIRM step rather than an undo: the dialog names the count, and nothing
  // is written until 删除.
  const [picking, setPicking] = React.useState(false);
  const [picked, setPicked] = React.useState<string[]>([]);
  const [confirming, setConfirming] = React.useState(false);
  const [pickNote, setPickNote] = React.useState('');
  // Our own write does not change the skin NAME, so the picker's subscription
  // will not re-render this page by itself: this is the revision that makes the
  // library list (and every tile in it) re-read the document we just stored.
  const [rev, setRev] = React.useState(0);
  // BOTH skins get the 编辑 tab: a built-in's state ASSIGNMENTS are editable,
  // only its pixels are not (see the header).  That is why 按动作 — the studio —
  // is the part that disappears, not the whole tab.
  const isCustom = skin === 'custom';
  const activeTab = tab;
  const tabs: ReadonlyArray<readonly [string, string]> = TABS;
  // 按状态 is the one mode every skin has; 按动作 needs an editable artwork.
  const editViews: ReadonlyArray<readonly [string, string]> = isCustom ? VIEWS : [VIEWS[0]];
  const editMode: View = isCustom ? editView : 'states';
  void rev; // read through `library` below — the state exists to force the re-read
  const library: LibraryEntryInfo[] = skinLibrary(skin, crop);
  const unused = library.filter((a) => !a.usedBy.length).length;
  const ids = library.map((a) => a.id);
  // The ticks that still name a live action, and the artwork they are ticked
  // against.  A built-in's library is frozen, so selection mode is 我的创作's.
  const pickedLive = picked.filter((id) => ids.includes(id));
  const pickArt = isCustom ? loadCustomArtwork() : null;
  const pickBlocked = pickArt ? removalIsBlocked(pickArt, crop, pickedLive) : false;
  const actionLabel = (a: LibraryEntryInfo) => a.name || t('settings.actionN', { n: ids.indexOf(a.id) + 1 });
  const actionQueryNorm = actionQuery.trim().toLowerCase();
  const actionMatches = (a: LibraryEntryInfo) => !actionQueryNorm
    || (actionLabel(a) + ' ' + (a.origin || '') + ' ' + a.id).toLowerCase().includes(actionQueryNorm);
  // What 按动作 shows — and therefore what 全选 takes and what the removal
  // removes from view.  An empty box matches the whole library.
  const actionList = library.filter(actionMatches);
  // 按状态's search answers "where is the state that…": a state's own name, what
  // it MEANS, and the names of the actions it plays.
  const stateQueryNorm = stateQuery.trim().toLowerCase();
  const stateMatches = (name: string) => {
    if (!stateQueryNorm) return true;
    const played = library.filter((a) => a.usedBy.includes(name)).map((a) => a.name || '');
    return (t(name) + ' ' + t('settings.hint.' + name) + ' ' + played.join(' '))
      .toLowerCase().includes(stateQueryNorm);
  };
  const stateList = STATE_NAMES.filter(stateMatches);

  // ── the selection mode's moves ──
  function togglePick(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.concat([id])));
  }
  /** 全选 ticks every action the search MATCHES — the whole library when the box
   *  is empty, not just the page of tiles on screen. */
  function pickAll(matching: string[]) {
    const add = new Set(matching);
    setPicked(library.filter((a) => add.has(a.id) || pickedLive.includes(a.id)).map((a) => a.id));
  }
  /** The removal itself — reached only through the confirm dialog. */
  function deletePicked() {
    const art = loadCustomArtwork();
    if (!art || !pickedLive.length || removalIsBlocked(art, crop, pickedLive)) return;
    const next = removeLibraryTakes(art, crop, pickedLive);
    if (next === art) return;
    saveStored({ skin: 'custom', custom: next });
    setPicked([]);
    setConfirming(false);
    setPickNote(t('settings.actionsRemoved', { n: pickedLive.length }));
    setRev((r) => r + 1);
  }

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
            // The gallery bar's right side: the library's dead weight said out
            // loud, and — in 按动作, on 我的创作 — the way into selection mode.
            // (It stays in 按动作: it selects ACTIONS, and 按状态 has none to
            // select.)
            h('div', { className: 'status-pet-colors' },
              unused
                ? h('span', { className: 'status-pet-hint' }, t('settings.unusedCount', { n: unused }))
                : null,
              isCustom && previewView === 'actions'
                ? h('button', {
                    type: 'button',
                    className: 'status-pet-mini-button' + (picking ? ' active' : ''),
                    'aria-label': t('settings.manageActions'),
                    'aria-pressed': picking ? 'true' : 'false',
                    title: t('settings.bulkHint'),
                    onClick: () => {
                      setPicking(!picking);
                      setPicked([]);
                      setPickNote('');
                    },
                  }, t('settings.manageActions'))
                : null)),
          // Plain render helpers, not components: they hold no state, and
          // keeping their output in this tree is what lets a test (and the
          // reader) see the gallery as one page.  The corner ✎ is handed in
          // only for 我的创作.
          previewView === 'states'
            // A state's assignment is editable on EVERY skin, so every state
            // cell offers the jump.
            ? stateGallery({ t, crop, library, states: stateList,
                query: stateQuery,
                onQuery: setStateQuery,
                onEdit: editStateFrom })
            // An action's pixels are not, on a built-in.
            : actionGallery({ t, crop, library: actionList, ids, total: library.length,
                shown,
                query: actionQuery,
                onQuery: (v: string) => { setActionQuery(v); setShown(ACTION_PAGE); },
                onMore: () => setShown(shown + ACTION_PAGE),
                onEdit: isCustom && !picking ? editActionFrom : null,
                picking,
                picked: pickedLive,
                onToggle: togglePick,
                onAll: () => pickAll(actionList.map((a) => a.id)),
                onNone: () => setPicked([]),
                // The button is disabled when blocked; the handler refuses too,
                // so the dialog can never open on a removal that is invalid.
                onDelete: () => { if (pickedLive.length && !pickBlocked) setConfirming(true); },
                blocked: pickBlocked,
                note: pickNote })
        ),
    // The removal is not undoable, so it is CONFIRMED: a small overlay naming
    // exactly how many actions leave the library.
    confirming
      ? h('div', { className: 'status-pet-confirm', role: 'dialog', 'aria-modal': 'true',
          'aria-label': t('settings.confirmDeleteTitle', { n: pickedLive.length }) },
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
                onClick: deletePicked,
              }, t('settings.confirmDelete')))))
      : null
  );
}

/** 按状态: one cell per state, LIVE, with its assignment as a badge.
 *
 *  The search finds a STATE: by its name, by what it MEANS (the same hint the
 *  tooltip shows), or by the name of an action it plays — so "which states play
 *  吃年糕?" is a query, not a hunt. */
function stateGallery(props: {
  t: (k: string, p?: Record<string, unknown>) => string;
  crop: number;
  library: LibraryEntryInfo[];
  states: string[];
  query?: string;
  onQuery?: (v: string) => void;
  onEdit: ((state: string) => void) | null;
}) {
  const t = props.t;
  const query = props.query || '';
  return h('div', null,
    h('div', { className: 'status-pet-search-row status-pet-gallery-search' },
      h('input', {
        type: 'search',
        className: 'status-pet-import-search',
        value: query,
        placeholder: t('settings.searchStates'),
        'aria-label': t('settings.searchStates'),
        onChange: (e: { target: { value: string } }) => props.onQuery!(e.target.value),
      }),
      query
        ? h('span', { className: 'status-pet-hint' },
            t('settings.searchMatches', { n: props.states.length, total: STATE_NAMES.length }))
        : null
    ),
    h('div', { className: 'status-pet-gallery' },
      props.states.map((name) => {
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
    ),
    props.states.length === 0
      ? h('div', { className: 'status-pet-hint' },
          query ? t('settings.searchEmpty', { q: query.trim() }) : null)
      : null
  );
}

/** 按动作: one cell per library action — the whole catalog, live.
 *
 *  In SELECTION mode (我的创作 only, see `picking` on the page) a cell stops
 *  being a peephole and becomes a checkbox: the same tiles, but ticking several
 *  of them is what 删除选中 removes in ONE write.  The filter scopes 全选, the
 *  guards disable the delete before the click, and 撤销 hands back the snapshot
 *  the removal replaced — this page has no history stack. */
function actionGallery(props: {
  t: (k: string, p?: Record<string, unknown>) => string;
  crop: number;
  /** The actions MATCHING the search — the page owns the filter, so 全选 and
   *  the grid can never disagree about what is in front of you. */
  library: LibraryEntryInfo[];
  ids: string[];
  /** The unfiltered library size, for the "N of M" read-out. */
  total: number;
  shown: number;
  query?: string;
  onQuery?: (v: string) => void;
  onMore: () => void;
  onEdit: ((id: string) => void) | null;
  picking?: boolean;
  picked?: string[];
  onToggle?: (id: string) => void;
  onAll?: () => void;
  onNone?: () => void;
  onDelete?: () => void;
  blocked?: boolean;
  note?: string;
}) {
  const t = props.t;
  const picked = props.picked || [];
  const query = props.query || '';
  const visible = props.library.slice(0, props.shown);
  const cell = (a: LibraryEntryInfo) => {
    const label = a.name || t('settings.actionN', { n: props.ids.indexOf(a.id) + 1 });
    const title = label + (a.origin ? ' · ' + a.origin : '');
    const painted = h(PetPreview, { takeId: a.id, crop: props.crop, zoom: LIVE_ZOOM, interactive: false });
    const text = h('div', { className: 'status-pet-gallery-text' },
      h('div', { className: 'status-pet-gallery-label' }, label),
      h('div', { className: 'status-pet-gallery-meta' },
        a.usedBy.length
          ? t('settings.usedByN', { n: a.usedBy.length })
          : t('settings.unusedAction')));
    if (props.picking) {
      const on = picked.includes(a.id);
      return h('label', {
        key: a.id,
        className: 'status-pet-gallery-cell' + (on ? ' selected' : ''),
        title,
      },
        h('input', {
          type: 'checkbox',
          className: 'status-pet-gallery-check',
          checked: on,
          'aria-label': label,
          title: t('settings.deleteSelected'),
          onChange: () => props.onToggle!(a.id),
        }),
        painted,
        text
      );
    }
    return h('div', { className: 'status-pet-gallery-cell', key: a.id, title },
      props.onEdit
        ? h('button', {
            type: 'button',
            className: 'status-pet-gallery-edit',
            'aria-label': label + ' — ' + t('settings.editAction'),
            title: t('settings.editAction'),
            onClick: () => props.onEdit!(a.id),
          }, '✎')
        : null,
      painted,
      text
    );
  };
  return h('div', null,
    // ONE search box, always here — it filters the tiles whether or not
    // selection mode is on, and it is what 全选 and the removal act on.  The
    // pick bar therefore carries no search of its own.
    h('div', { className: 'status-pet-search-row status-pet-gallery-search' },
      h('input', {
        type: 'search',
        className: 'status-pet-import-search',
        value: query,
        placeholder: t('settings.searchActions'),
        'aria-label': t('settings.searchActions'),
        onChange: (e: { target: { value: string } }) => props.onQuery!(e.target.value),
      }),
      query
        ? h('span', { className: 'status-pet-hint' },
            t('settings.searchMatches', { n: props.library.length, total: props.total }))
        : null
    ),
    props.picking
      ? h('div', { className: 'status-pet-pick-bar' },
          h('div', { className: 'status-pet-bulk-ops' },
            h('button', {
              type: 'button', className: 'status-pet-mini-button', onClick: props.onAll,
              disabled: props.library.length === 0,
              title: t('settings.selectAllHint'),
            }, t('settings.selectAll')),
            h('button', {
              type: 'button', className: 'status-pet-mini-button', onClick: props.onNone,
              disabled: !picked.length,
            }, t('settings.clearSelection')),
            h('span', { className: 'status-pet-hint' }, t('settings.selectedCount', { n: picked.length })),
            h('button', {
              type: 'button',
              className: 'status-pet-mini-button status-pet-danger',
              onClick: props.onDelete,
              disabled: !picked.length || props.blocked,
              'aria-label': t('settings.deleteSelected'),
              title: props.blocked ? t('settings.deleteBlocked') : t('settings.deleteSelected'),
            }, t('settings.deleteSelected')),
            props.note
              ? h('span', { className: 'status-pet-hint' }, props.note)
              : null
          ),
          h('div', { className: 'status-pet-hint' },
            props.blocked ? t('settings.deleteBlocked') : t('settings.bulkHint'))
        )
      : null,
    h('div', { className: 'status-pet-gallery' }, visible.map(cell)),
    visible.length === 0
      ? h('div', { className: 'status-pet-hint' },
          query ? t('settings.searchEmpty', { q: query.trim() }) : t('settings.emptyLibrary'))
      : null,
    !props.picking && props.shown < props.library.length
      ? h('div', { className: 'status-pet-colors' },
          h('button', { type: 'button', className: 'status-pet-mini-button', onClick: props.onMore },
            t('settings.showMore')))
      : null
  );
}
