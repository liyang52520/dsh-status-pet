// UI tests: the real components driven by a stubbed React against stubbed
// slot props, with the runtime injected via initHostDeps — the same
// injection point the loader uses.  No DOM, no canvas.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── React stub ──
// One shared instance, because components close over the injected runtime.
// Hook storage persists across renders of one mount so an interaction can
// be exercised end to end; resetting is per mount.  Lazy initializers run,
// like real React (the editors seed state with useState(() => ...)).
interface El {
  type: any;
  props: Record<string, any>;
  children: any[];
}

let hooks: any[] = [];
let refs: Array<{ current: any }> = [];
let cursor = 0;
let refCursor = 0;

const ReactStub = {
  Fragment: Symbol('Fragment'),
  createElement: (type: any, props: any, ...children: any[]): El => ({
    type,
    props: props || {},
    children,
  }),
  useRef: (init: any) => {
    if (refs.length <= refCursor) refs.push({ current: init });
    return refs[refCursor++];
  },
  useState: (init: any) => {
    if (hooks.length <= cursor) hooks.push(typeof init === 'function' ? init() : init);
    const at = cursor++;
    return [hooks[at], (next: any) => {
      hooks[at] = typeof next === 'function' ? next(hooks[at]) : next;
    }];
  },
  useEffect: () => {},
};

// The design-system primitives the web shell seeds.  A Tooltip wrapper
// lands in the tree as an element whose type is this function.
function StubTooltip() {}
const PRIMITIVES = {
  Tooltip: StubTooltip,
  useAnchoredPosition: () => null,
  useDismissOnOutsidePointer: () => {},
};
const REACT_DOM = { createPortal: (el: any) => el };
const requireStub = (spec: string): any =>
  spec === 'react' ? ReactStub : spec === 'react-dom' ? REACT_DOM : PRIMITIVES;
const requireNoSeeds = (spec: string): any => {
  if (spec === 'react') return ReactStub;
  throw new Error('no such module: ' + spec);
};

// The store and popup read window/document; stub both before imports.
const storeMem = new Map<string, string>();
(globalThis as any).window = {
  localStorage: {
    getItem: (k: string) => (storeMem.has(k) ? storeMem.get(k)! : null),
    setItem: (k: string, v: string) => void storeMem.set(k, String(v)),
    removeItem: (k: string) => void storeMem.delete(k),
  },
  CustomEvent: function (this: { type: string }, type: string) {
    this.type = type;
  },
  dispatchEvent: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
};
(globalThis as any).document = {
  body: {},
  addEventListener: () => {},
  removeEventListener: () => {},
};

const { initHostDeps } = await import('../src/host-deps.ts');
const { DockPet } = await import('../src/ui/dock-pet.ts');
const { DockPopup } = await import('../src/ui/dock-popup.ts');
const { PetPreview } = await import('../src/ui/pet-preview.ts');
const { SettingsPage } = await import('../src/ui/settings/page.ts');
const { SkinPicker } = await import('../src/ui/settings/skin-picker.ts');
const { PixelEditor } = await import('../src/ui/settings/pixel-editor.ts');
const { StateAssignments } = await import('../src/ui/settings/assignments.ts');
const store = await import('../src/pet/skins/store.ts');
const { ARTWORK } = await import('../src/artwork.gen.ts');
store.installSkinArtwork(ARTWORK as never);
const SKINS = ARTWORK;
const { GRIDS, AVATAR_GRID, BODY_GRID, LIVE_ZOOM } = await import('../src/pet/grids.ts');
const { TUNING } = await import('../src/pet/behavior.ts');

// Every reset goes through the store's own flush: the store buffers a large
// snapshot instead of writing one per painted pixel, so a test that clears
// localStorage must force that buffer out first — otherwise the store would
// keep serving the pending document from memory.
const clearStorage = () => {
  store.flushStored();
  window.localStorage.removeItem(store.STORE_KEY);
  store.refreshActiveSkin();
};

initHostDeps(requireStub);

// ── Mount helpers ──
const SID = 'session-1';
interface MountInput {
  session?: Record<string, any>;
  status?: Record<string, any>;
  chat?: Record<string, any>;
  idleMs?: number;
  t?: ((k: string, p?: Record<string, unknown>) => string) | null;
}

// The dock pet wraps its button in an anchor span (which carries the
// popup's anchor ref) and, when the shell seeds the design system, the
// Tooltip.  When open, a PetPopup element follows in the fragment.
function unwrap(tree: El) {
  const anchor = tree.children.find((c: any) => c && c.props && c.props.className === 'status-pet-anchor');
  if (!anchor) return { button: null as any, tooltip: null as any, popup: null as any };
  const direct = anchor.children.find((c: any) => c && c.type === 'button');
  let button = direct;
  let tooltip = null;
  if (!button) {
    tooltip = anchor.children.find((c: any) => c && c.type === StubTooltip) || null;
    button = tooltip ? tooltip.children.find((c: any) => c && c.type === 'button') : null;
  }
  const popup = tree.children.find((c: any) => c && typeof c.type === 'function' && c.type.name === 'DockPopup') || null;
  return { button: button || null, tooltip, popup };
}

function mount({ session = {}, status = {}, chat = {}, idleMs = 0, t = (k: string) => 'S:' + k }: MountInput = {}) {
  // Hook storage is per mount, or one test's state leaks into the next.
  // Order matches the component's useState calls: sleeping (usePetStatus),
  // reaction (usePetReaction), jumping, open.  The sleep timeout is an
  // effect and never fires under the stub, so `idleMs` seeds `sleeping`.
  hooks = [idleMs >= TUNING.sleepAfterMs, null, false, false];
  refs = [];
  const fullSession = Object.assign({
    running: false, openState: 'open', lastAgentError: null,
    promptError: null, pendingSubmissions: [],
  }, session);
  const fullStatus = Object.assign({ pendingInteraction: undefined, completionUnread: false }, status);
  const fullChat = Object.assign({ runningCalls: [], partial: null }, chat);
  const props = {
    useSession: (sel: any) => sel(fullSession),
    useSessionStatus: (sel: any) => sel(new Map([[SID, fullStatus]])),
    useChat: (sel: any) => sel({ legacy: fullChat }),
    sessionId: SID,
    t,
  };
  return () => {
    cursor = 0;
    refCursor = 0;
    const tree = DockPet(props) as unknown as El;
    const { button, tooltip, popup } = unwrap(tree);
    const canvas = button.children.find((c: any) => c && c.type === 'canvas');
    return {
      title: tooltip ? tooltip.props.label : button.props.title,
      tooltip,
      nativeTitle: button.props.title,
      className: button.props.className,
      aria: button.props['aria-label'],
      haspopup: button.props['aria-haspopup'],
      expanded: button.props['aria-expanded'],
      canvas: canvas.props,
      popup,
      click: button.props.onClick,
      enter: button.props.onMouseEnter,
      focus: button.props.onFocus,
    };
  };
}
const petFor = (input: MountInput) => mount(input)();

// ── State mapping, end to end through the real component ──
const CASES: Array<[string, MountInput, string]> = [
  ['idle', {}, 'idle'],
  ['sleep', { idleMs: 60001 }, 'sleep'],
  ['idle@59.9s', { idleMs: 59999 }, 'idle'],
  ['think', { session: { running: true } }, 'think'],
  ['send echo bridges busy', { session: { pendingSubmissions: [{}] } }, 'think'],
  ['stream', { session: { running: true }, chat: { partial: { blocks: [] } } }, 'stream'],
  ['preparing call reads as stream', { session: { running: true }, chat: { runningCalls: [{ phase: 'preparing', name: 'bash' }] } }, 'stream'],
  ['tool', { session: { running: true }, chat: { runningCalls: [{ phase: 'start' }] } }, 'tool'],
  ['approval', { session: { running: true }, status: { pendingInteraction: { kind: 'approval' } } }, 'approval'],
  ['question', { session: { running: true }, status: { pendingInteraction: { kind: 'question' } } }, 'question'],
  ['error (agent)', { session: { lastAgentError: 'boom' } }, 'error'],
  ['error (open state)', { session: { openState: 'error' } }, 'error'],
  ['error (send)', { session: { promptError: { op: 'send' } } }, 'error'],
  ['done', { status: { completionUnread: true } }, 'done'],
  ['running beats error', { session: { running: true, lastAgentError: 'boom' } }, 'think'],
  ['echo beats error', { session: { pendingSubmissions: [{}], promptError: { op: 'send' } } }, 'think'],
  ['echo beats sleep', { idleMs: 999999, session: { pendingSubmissions: [{}] } }, 'think'],
  ['tool beats stream', { session: { running: true }, chat: { runningCalls: [{ phase: 'start' }], partial: { blocks: [] } } }, 'tool'],
  ['approval beats sleep', { idleMs: 999999, status: { pendingInteraction: { kind: 'approval' } } }, 'approval'],
  ['unread beats sleep', { idleMs: 999999, status: { completionUnread: true } }, 'done'],
];
for (const [name, input, expected] of CASES) {
  test(`pet state: ${name}`, () => {
    assert.equal(petFor(input).title, 'S:' + expected);
  });
}

test('the tooltip names the executing tool when known', () => {
  const rec = (k: string, p?: Record<string, unknown>) => 'S:' + k + (p ? '=' + p.name : '');
  const named: MountInput = { session: { running: true }, chat: { runningCalls: [{ phase: 'start', name: 'bash' }] } };
  const view = petFor({ ...named, t: rec });
  assert.equal(view.title, 'S:toolNamed=bash');
  assert.equal(view.aria, 'S:toolNamed=bash', 'aria-label tracks it');
  assert.equal(petFor({ t: rec, session: { running: true }, chat: { runningCalls: [{ phase: 'start' }] } }).title,
    'S:tool', 'a nameless call keeps the generic label');
  assert.equal(petFor({ t: rec, session: { running: true }, chat: { runningCalls: [{ phase: 'preparing', name: 'bash' }] } }).title,
    'S:stream', 'a preparing call names nothing');
  assert.equal(petFor({ ...named, t: null }).title, 'Running bash…',
    'the English fallback interpolates too');
});

test('click popup: closed by default, opens on click, closes on second click', () => {
  const render = mount({});
  let view = render();
  assert.equal(view.popup, null, 'closed by default');
  assert.equal(view.haspopup, 'dialog', 'the pill declares the popup');
  assert.equal(view.expanded, 'false');
  view.click();
  view = render();
  assert.ok(view.popup !== null, 'clicking opens the popup');
  assert.equal(view.expanded, 'true');
  assert.equal(view.tooltip.props.disabled, true, 'the tooltip is disabled while open');
  const panel = view.popup.type(view.popup.props);
  assert.equal(panel.props.role, 'dialog');
  assert.equal(panel.props['aria-label'], 'S:idle', 'labelled with the current state');
  const bigPreview = panel.children.find((c: any) => c && typeof c.type === 'function');
  assert.ok(bigPreview && bigPreview.type.name === 'PetPreview' && bigPreview.props.best === true,
    'the popup carries the big preview pinned to the best resolution');
  assert.equal(bigPreview.props.zoom, LIVE_ZOOM,
    'the peek is DISPLAYED at 64px of art (an exact 1:2 of the 128px crop it renders)');
  assert.equal(panel.props.style.visibility, 'hidden', 'hidden until the position resolves');
  assert.equal(view.title, 'S:idle', 'the dock click does not pet — it only opens');
  view.click();
  assert.equal(render().popup, null, 'clicking again closes');
});

test('the popup pets from anywhere in its panel — reaction fed to the sprite and echoed in the caption', () => {
  const render = mountPlain(DockPopup, { panelRef: {}, position: { left: 0, top: 0 }, title: 'S:idle', t: tKey });
  const previewOf = (el: any) => el.children.find((c: any) => c && c.type === PetPreview);
  const captionOf = (el: any) => findDeep(el, 'status-pet-popup-title').children[0];
  let tree = render();
  assert.equal(tree.props.role, 'dialog');
  assert.equal(previewOf(tree).props.reaction, undefined, 'no reaction before the click');
  assert.equal(captionOf(tree), 'S:idle', 'the caption names the state');
  // The panel's own click handler is what pets: the sprite is a small target.
  tree.props.onClick();
  tree = render();
  assert.equal(previewOf(tree).props.reaction, 'petted', 'the panel click feeds the reaction to the sprite');
  assert.equal(captionOf(tree), 'S:petted', 'and the caption answers the click too');
  assert.equal(tree.props['aria-label'], 'S:petted', 'the dialog label follows the reaction');
});

test('pet preview: interactive by default, bare canvas when not; state and skin pins', () => {
  clearStorage();
  const render = mountPlain(PetPreview, { t: tKey });
  const tree = render();
  // Interactive: a button (possibly wrapped in the Tooltip) with a canvas inside.
  const asButton = tree.type === 'button' ? tree
    : tree.children.find((c: any) => c && c.type === 'button');
  assert.ok(asButton, 'interactive preview renders a button');
  assert.ok(asButton.children.some((c: any) => c && c.type === 'canvas'), 'with a canvas inside');
  assert.ok(asButton.props.onClick, 'and petting wired');

  const bare = mountPlain(PetPreview, { t: tKey, state: 'approval', scale: 2, interactive: false })();
  assert.equal(bare.type, 'canvas', 'non-interactive preview is a bare canvas');
  assert.equal(bare.props['aria-hidden'], true, 'decorative');
  assert.ok(!bare.props.onClick, 'no petting');
});

test('settings page: skin picker + preview gallery; 编辑 exists on both skins', () => {
  // A built-in HAS an 编辑 tab — its state assignments are editable — but only
  // the 按状态 half of it.
  clearStorage();
  store.saveStored({ skin: store.DEFAULT_SKIN });
  store.refreshActiveSkin();
  let render = mountPlain(SettingsPage, { t: tKey });
  let tree = render();
  assert.ok(tree.children.some((c: any) => c && c.type === 'style'), 'the inline style element renders');
  assert.ok(!tree.children.some((c: any) => c && c.props && c.props.className === 'status-pet-preview'),
    'the two big previews are gone');
  assert.ok(tree.children.some((c: any) => c && c.type === SkinPicker), 'the skin picker renders');
  // No standalone Recolour row: colours belong to the artwork, and the only
  // editable palette is the studio's.
  const colourInputs = (function walk(el: any, out: any[] = []): any[] {
    if (!el || typeof el !== 'object') return out;
    if (el.props && el.props.type === 'color') out.push(el);
    for (const c of childList(el)) walk(c, out);
    return out;
  })(tree);
  assert.equal(colourInputs.length, 0, 'the page carries no Recolour wells');
  assert.equal(findAllByType(tree, PixelEditor).length, 0,
    'the page opens on 预览, not on the studio');
  const builtinTabs = findDeep(tree, 'status-pet-tab-list');
  assert.ok(builtinTabs, 'a built-in still has a tab row');
  assert.equal(childList(builtinTabs).length, 2, 'with both tabs');
  assert.equal(findAllByText(builtinTabs, 'S:settings.tab.edit').length, 1, 'including 编辑');
  // Every STATE cell can jump into its assignment, on a built-in too.
  assert.equal(findAllDeep(tree, 'status-pet-gallery-edit').length, 11,
    'all eleven state cells carry the corner ✎');
  assert.equal(findDeep(tree, 'status-pet-builtin-note'), null, 'no built-in note any more');
  const gallery = findDeep(tree, 'status-pet-gallery');
  const cells = gallery.children.flat();
  assert.equal(cells.length, 11, 'one gallery cell per state and reaction');
  for (const cell of cells) {
    const preview = cell.children.find((c: any) => c && c.type === PetPreview);
    assert.ok(preview, 'each cell carries a PetPreview');
    assert.equal(preview.props.interactive, false, 'decorative');
    assert.equal(typeof preview.props.state, 'string', 'pinned to its state');
    assert.equal(preview.props.crop, AVATAR_GRID, 'the dock avatar is the default crop');
  }
  assert.deepEqual(cells.map((c: any) => c.children.find((p: any) => p && p.type === PetPreview).props.state).sort(),
    ['approval', 'done', 'error', 'idle', 'petted', 'question', 'sleep', 'stream', 'think', 'tool', 'woken'],
    'every state and reaction pinned exactly once');
  // …but an ACTION cell has no ✎ on a built-in: its pixels cannot be edited.
  findAllByText(render(), 'S:settings.view.actions')[0].props.onClick();
  assert.equal(findAllDeep(render(), 'status-pet-gallery-edit').length, 0,
    'no corner ✎ on an action cell of a built-in');
  findAllByText(render(), 'S:settings.view.states')[0].props.onClick();

  // My Creation: the two tabs appear, and 编辑 opens on 按动作 — the studio.
  store.saveStored({ skin: 'custom', custom: store.seedArtworkFrom(store.DEFAULT_SKIN) });
  store.refreshActiveSkin();
  render = mountPlain(SettingsPage, { t: tKey });
  tree = render();
  assert.equal(childList(findDeep(tree, 'status-pet-tab-list')).length, 2, 'My Creation gets both tabs');
  clickTab(render(), 'S:settings.tab.edit');
  tree = render();
  assert.equal(findAllByType(tree, PixelEditor).length, 1, 'My Creation opens the studio');
  assert.equal(findAllByType(tree, StateAssignments).length, 0,
    'and 编辑 opens on 按动作, not on the assignment list');
  assert.equal(findAllByText(render(), 'S:settings.builtinHint').length, 0, 'and no built-in note anywhere');
  clearStorage();
});

test('settings page: two tabs (预览 / 编辑) with the 32 / 128 crop switch on the tab row', () => {
  clearStorage();
  store.saveStored({ skin: 'custom', custom: store.seedArtworkFrom(store.DEFAULT_SKIN) });
  store.refreshActiveSkin();
  const render = mountPlain(SettingsPage, { t: tKey });
  const tabsOf = (tree: any) => findDeep(tree, 'status-pet-tab-list');
  const previews = () => findDeep(render(), 'status-pet-gallery').children.flat()
    .map((cell: any) => cell.children.find((p: any) => p && p.type === PetPreview));
  const tree = render();
  const tabs = tabsOf(tree);
  assert.ok(tabs, 'the page has a tab row');
  assert.equal(tabs.children.flat().length, 2, 'two tabs: 预览 and 编辑');
  assert.equal(findAllByText(tabs, 'S:settings.tab.preview').length, 1, 'the preview tab');
  assert.equal(findAllByText(tabs, 'S:settings.tab.edit').length, 1, 'the edit tab');
  assert.ok(String(findAllByText(tabs, 'S:settings.tab.preview')[0].props.className).includes('active'),
    '预览 is the tab the page opens on');
  assert.ok(previews().length === 11, 'the preview tab holds the state gallery');

  // The crop switch rides on the tab row, above both tabs.
  const row = findDeep(tree, 'status-pet-tabs');
  assert.deepEqual([...new Set(previews().map((p: any) => p.props.crop))], [AVATAR_GRID],
    'the dock avatar is the crop shown by default');
  const avatar = findAllByText(row, 'S:settings.grid.32')[0];
  assert.ok(avatar, 'the tab row carries a 32 crop button');
  assert.equal(avatar.props['aria-pressed'], 'true', 'active while 32 is shown');
  const body = findAllByText(row, 'S:settings.grid.128')[0];
  assert.ok(body, 'the tab row carries a 128 crop button');
  assert.equal(body.props['aria-pressed'], 'false', 'inactive while 32 is shown');
  body.props.onClick();
  assert.deepEqual([...new Set(previews().map((p: any) => p.props.crop))], [BODY_GRID],
    'switching shows the full body crop instead');
  const active = findAllByText(findDeep(render(), 'status-pet-tabs'), 'S:settings.grid.128')[0];
  assert.ok(String(active.props.className).includes('active'), 'the 128 button marks itself active');
  assert.equal(active.props['aria-pressed'], 'true');

  // The label is the state name; what the state MEANS rides on the tooltip.
  const cell = findDeep(render(), 'status-pet-gallery').children.flat()[0];
  assert.equal(cell.props.title, 'S:settings.hint.' + cell.children.find((p: any) => p && p.type === PetPreview).props.state,
    'each cell explains its state on hover');
  clearStorage();
});

test('settings page: the state gallery badges each state with what it plays', () => {
  // The library model created a new failure mode — a state nobody ticked
  // anything for — and this badge is the only place it is visible.
  clearStorage();
  store.saveStored({ skin: store.DEFAULT_SKIN });
  store.refreshActiveSkin();
  const render = mountPlain(SettingsPage, { t: tKey });
  const badges = () => findDeep(render(), 'status-pet-gallery').children.flat()
    .map((c: any) => textOf(c.children.find((x: any) => x && String(x.props.className || '').includes('status-pet-gallery-meta'))));
  assert.equal(badges().length, 11, 'every state carries a badge');
  assert.ok(badges().every((b: string) => b === 'S:settings.actionCount'),
    'a built-in assigns every state, so every badge counts actions');
  assert.equal(findAllByText(render(), 'S:settings.followIdle').length, 0,
    'and none of them falls back to idle');

  // My Creation seeded from the built-in behaves the same; a hand-made artwork
  // with only idle assigned shows the fallback on the other ten.
  store.saveStored({ skin: 'custom', custom: customWithPalette() });
  store.refreshActiveSkin();
  const custom = mountPlain(SettingsPage, { t: tKey });
  const cells = () => findDeep(custom(), 'status-pet-gallery').children.flat();
  const idleCell = cells().find((c: any) => c.children.some((x: any) => x && x.type === PetPreview
    && x.props.state === 'idle'))!;
  assert.ok(textOf(idleCell).includes('S:settings.actionCount'), 'idle plays one action');
  const toolCell = cells().find((c: any) => c.children.some((x: any) => x && x.type === PetPreview
    && x.props.state === 'tool'))!;
  assert.ok(textOf(toolCell).includes('S:settings.followIdle'),
    'a state nothing was ticked for says so, in the gallery');
  clearStorage();
});

test('settings page: 按动作 browses the library live, including unused actions', () => {
  clearStorage();
  store.saveStored({ skin: 'custom', custom: customWithPalette() });
  store.refreshActiveSkin();
  const render = mountPlain(SettingsPage, { t: tKey });
  const view = (label: string) => findAllByText(render(), label)[0];
  const cells = () => findDeep(render(), 'status-pet-gallery').children.flat();
  const previews = () => cells().map((c: any) => c.children.find((p: any) => p && p.type === PetPreview));

  assert.ok(view('S:settings.view.states'), 'the gallery opens 按状态');
  assert.equal(view('S:settings.view.states').props['aria-pressed'], 'true');
  assert.ok(previews().every((p: any) => typeof p.props.state === 'string' && p.props.takeId === undefined),
    '按状态 pins states, not actions');
  assert.ok(previews().every((p: any) => p.props.zoom === LIVE_ZOOM),
    'and every gallery cell displays at LIVE_ZOOM, not 1:1');

  findDeep(render(), 'status-pet-view-switch').children.flat()
    .find((b: any) => textOf(b) === 'S:settings.view.actions').props.onClick();
  const actionPreviews = previews();
  assert.equal(actionPreviews.length, 1, 'the tiny fixture has one action');
  assert.equal(actionPreviews[0].props.takeId, 'idle-1', 'each cell pins ONE library action');
  assert.equal(actionPreviews[0].props.state, undefined, 'and is not a state cell');
  assert.equal(actionPreviews[0].props.zoom, LIVE_ZOOM, 'and it displays at the popup\'s size');
  assert.ok(textOf(cells()[0]).includes('S:settings.usedByN'), 'the cell says which states play it');
  // Actions nothing plays are the point of this view.
  const art = customWithPalette() as any;
  art.grids[AVATAR_GRID].library.push({ id: 'hop', frameMs: 400, frames: [{ rows: store.blankRows(AVATAR_GRID) }] });
  store.saveStored({ skin: 'custom', custom: art });
  store.refreshActiveSkin();
  assert.ok(textOf(cells()[1]).includes('S:settings.unusedAction'),
    'an action no state plays is listed, and says so');
  assert.equal(findAllByText(render(), 'S:settings.unusedCount').length, 1,
    'and the dead weight is counted above the gallery');

  // The library is paged: the built-in's 106 actions do not all mount at once.
  store.saveStored({ skin: 'custom', custom: store.seedArtworkFrom(store.DEFAULT_SKIN) });
  store.refreshActiveSkin();
  assert.equal(cells().length, 24, 'the first page is bounded');
  findAllContaining(render(), 'S:settings.showMore')[0].props.onClick();
  assert.equal(cells().length, 48, '显示更多 brings the next page');
  clearStorage();
});

test('settings page: 编辑 shows the studio on the crop the tab row picked', () => {
  clearStorage();
  store.saveStored({ skin: 'custom', custom: store.seedArtworkFrom(store.DEFAULT_SKIN) });
  store.refreshActiveSkin();
  const render = mountPlain(SettingsPage, { t: tKey });
  const studioGrid = () => {
    const ed = findAllByType(render(), PixelEditor)[0];
    return ed && ed.props.grid;
  };
  clickTab(render(), 'S:settings.tab.edit');
  assert.equal(studioGrid(), AVATAR_GRID, 'the studio starts on the crop the tab row shows');
  assert.equal(findDeep(render(), 'status-pet-gallery'), null,
    'the gallery is not rendered while 编辑 is active');
  // The switch is shared: it moves the studio too.
  const row = findDeep(render(), 'status-pet-tabs');
  findAllByText(row, 'S:settings.grid.128')[0].props.onClick();
  assert.equal(studioGrid(), BODY_GRID, 'the studio follows the tab-row crop switch');
  clearStorage();
});

test('settings page: a built-in opens 编辑 · 按状态 — assignments only, no studio', () => {
  clearStorage();
  store.saveStored({ skin: 'whale-chan' });
  store.refreshActiveSkin();
  const render = mountPlain(SettingsPage, { t: tKey });
  clickTab(render(), 'S:settings.tab.edit');
  const tree = render();
  const assign = findAllByType(tree, StateAssignments)[0];
  assert.ok(assign, 'the assignment surface renders for a built-in');
  assert.equal(assign.props.skin, 'whale-chan', 'pinned to the built-in, not to 我的创作');
  assert.equal(assign.props.key, 'assign:whale-chan',
    'and keyed by skin, so swapping skins while 编辑 is open re-reads');
  assert.equal(assign.props.grid, AVATAR_GRID, 'on the crop the tab row shows');
  assert.equal(findAllByType(tree, PixelEditor).length, 0, 'no studio — the pixels are frozen');
  const switcher = findAllDeep(tree, 'status-pet-view-switch')[0];
  assert.equal(childList(switcher).length, 1, 'the mode switch holds 按状态 alone');
  assert.ok(textOf(childList(switcher)[0]).includes('S:settings.view.states'));
  assert.equal(findAllByText(tree, 'S:settings.builtinStatesOnly').length, 1,
    'and a quiet line says where pixels CAN be changed');
  clearStorage();
});

// ── The seam between the tabs: the corner ✎ ──
// Each 预览 cell carries a small floating edit button, and the CELL ITSELF is
// inert: looking at the pet must never edit it.  The button opens the matching
// 编辑 mode already pointing at that cell.

const cornerEdits = (tree: any) => findAllDeep(tree, 'status-pet-gallery-edit');

test('预览 cells carry a corner ✎ that opens the matching 编辑 mode on that very thing', () => {
  clearStorage();
  store.saveStored({ skin: 'custom', custom: studioFixture() });
  store.refreshActiveSkin();
  const render = mountPlain(SettingsPage, { t: tKey });

  // 按状态: one ✎ per state cell, and the cell body is not clickable itself.
  const stateCells = findDeep(render(), 'status-pet-gallery').children.flat();
  assert.equal(cornerEdits(render()).length, 11, 'one corner ✎ per state cell');
  assert.ok(stateCells.every((c: any) => !c.props.onClick), 'looking at a state never edits it');
  const stateEdit = cornerEdits(render()).find((b: any) =>
    String(b.props['aria-label']).startsWith('S:tool —'));
  assert.ok(stateEdit, 'each button names its own state');
  stateEdit.props.onClick();
  let tree = render();
  const assign = findAllByType(tree, StateAssignments)[0];
  assert.ok(assign, 'it opens 编辑 · 按状态');
  assert.equal(assign.props.state, 'tool', 'already pointing at the clicked state');
  assert.equal(assign.props.grid, AVATAR_GRID, 'on the crop the tab row shows');

  // 按动作: the same seam, the other mode and the other dropdown value.
  store.refreshActiveSkin();
  const render2 = mountPlain(SettingsPage, { t: tKey });
  findAllByText(render2(), 'S:settings.view.actions')[0].props.onClick();
  const hopEdit = cornerEdits(render2()).find((b: any) =>
    String(b.props['aria-label']).startsWith('hop act —'));
  assert.ok(hopEdit, 'the action cell carries one too');
  assert.ok(findAllByText(render2(), 'S:settings.unusedAction').length > 0,
    'including for an action no state plays');
  hopEdit.props.onClick();
  const ed = findAllByType(render2(), PixelEditor)[0];
  assert.ok(ed, 'it opens 编辑 · 按动作');
  assert.equal(ed.props.actionId, 'hop', 'with that action on the board');
  assert.equal(findAllByType(render2(), StateAssignments).length, 0,
    'and not the assignment list');
  clearStorage();
});

test('编辑 · 按状态 is the assignment surface: a dropdown, its checkboxes and its ops', () => {
  clearStorage();
  store.saveStored({ skin: 'custom', custom: studioFixture() });
  store.refreshActiveSkin();
  const props: any = { t: tKey, skin: 'custom', grid: AVATAR_GRID, state: 'idle',
    onStateChange: (s: string) => { props.state = s; } };
  const render = mountPlain(StateAssignments, props);
  const rows = () => findAllDeep(render(), 'status-pet-library-row');
  const checks = () => rows().map((r: any) => inputsIn(r)[0]);
  // Rows are found by the ACTION's name, never by position: the list puts the
  // state's own ticks first, so an index is not an address any more.
  const rowFor = (name: string) => rows().find((r: any) => textOf(r).startsWith(name))!;
  const groups = () => findAllDeep(render(), 'status-pet-library-group').map((g: any) => textOf(g));

  // Two actions in the library; idle plays one of them, and tool plays neither.
  assert.equal(rows().length, 2, 'the list holds every action');
  assert.equal(optionLabels(render()).length, 11, 'every state is in the dropdown');
  const toolOption = optionLabels(render()).find((l: string) => l.startsWith('S:tool'));
  assert.ok(toolOption!.includes('S:settings.followIdle'), 'untouched states show the follow badge');
  assert.equal(inputsIn(rowFor('idle act'))[0].props.checked, true, 'idle starts ticked');
  // The tick is at the TOP, under a header, with the rest below it — the page
  // answers "what does this state do?" before it lists the material.
  assert.deepEqual(checks().map((c: any) => c.props.checked), [true, false],
    'the ticked action comes first');
  assert.deepEqual(groups(), ['S:settings.libraryTickedGroup', 'S:settings.libraryRestGroup'],
    'and the two halves are captioned');
  stateSelect(render()).props.onChange({ target: { value: 'tool' } });
  assert.deepEqual(checks().map((c: any) => c.props.checked), [false, false],
    'the list shows this state\'s selection, not the library');
  assert.deepEqual(groups(), [], 'nothing ticked → one plain list, no headers');

  // Tick the second action: the state now plays exactly it, and it jumps to
  // the top of the list (the library order underneath never changes).
  inputsIn(rowFor('hop act'))[0].props.onChange({ target: { checked: true } });
  let saved = store.loadStored().custom!;
  assert.deepEqual(saved.grids[AVATAR_GRID]!.states.tool, ['hop'], 'ticking adds the reference');
  assert.ok(optionLabels(render()).find((l: string) => l.startsWith('S:tool'))!
    .includes('S:settings.actionCount'), 'and the dropdown counts it');
  assert.equal(textOf(rows()[0]).startsWith('hop act'), true, 'the ticked row is first');
  assert.equal(inputsIn(rowFor('hop act'))[0].props.checked, true, 'the row is ticked');
  assert.ok(textOf(rowFor('hop act')).includes('S:settings.usedByN'), 'and the row says who plays it');

  // 「全选」 takes the whole library; 「清空」 is exactly the idle fallback — and
  // those two ARE the ops row: a state IS its selection, so the old "copy this
  // state / paste" pair (which read as duplicating a state) is gone.
  const ops = () => childList(findDeep(render(), 'status-pet-state-ops'))
    .filter(Boolean).map((b: any) => textOf(b));
  assert.deepEqual(ops(), ['S:settings.selectAll', 'S:settings.clearSelection'],
    'a non-empty selection offers 全选 and 清空 — no copy, no paste');
  findAllContaining(render(), 'S:settings.selectAll')[0].props.onClick();
  saved = store.loadStored().custom!;
  assert.deepEqual(saved.grids[AVATAR_GRID]!.states.tool, ['idle-1', 'hop'], 'all means all');
  assert.deepEqual(checks().map((c: any) => c.props.checked), [true, true],
    'and everything is in the ticked half');
  assert.deepEqual(groups(), [],
    'the whole library ticked → still one plain list, just all of it');
  findAllContaining(render(), 'S:settings.clearSelection')[0].props.onClick();
  assert.deepEqual(ops(), ['S:settings.selectAll'],
    'and 清空 disappears on the empty selection it just produced');
  saved = store.loadStored().custom!;
  assert.equal(saved.grids[AVATAR_GRID]!.states.tool, undefined,
    'clearing removes the key — an empty selection IS the fallback');
  const resolved = store.resolveSkin(store.loadStored());
  assert.equal(resolved.states.tool, resolved.states.idle, 'and the state really does follow idle');
  clearStorage();
});

test('pill modifiers: attention for approval/question, error tint for error', () => {
  assert.ok(petFor({ status: { pendingInteraction: { kind: 'approval' } } }).className.includes('attention'));
  assert.ok(petFor({ status: { pendingInteraction: { kind: 'question' } } }).className.includes('attention'));
  assert.ok(petFor({ session: { lastAgentError: 'x' } }).className.includes('error'));
  assert.ok(!petFor({}).className.includes('attention'));
  assert.ok(!petFor({ session: { running: true } }).className.includes('error'));
});

test('interactions: the dock click only opens the popup; hover/focus wakes a sleeper only', () => {
  {
    const render = mount({});
    assert.equal(render().title, 'S:idle');
    render().click();
    const view = render();
    assert.equal(view.title, 'S:idle', 'clicking the dock pill does not pet it');
    assert.ok(view.popup !== null, 'it opens the popup, where the petting lives');
  }
  {
    const render = mount({ idleMs: 60001 });
    assert.equal(render().title, 'S:sleep');
    render().enter();
    assert.equal(render().title, 'S:woken', 'hovering wakes a sleeping pet');
    render().focus();
    assert.equal(render().title, 'S:woken', 'focus also wakes it');
  }
  {
    const render = mount({});
    render().enter();
    assert.equal(render().title, 'S:idle', 'hovering an awake pet changes nothing');
  }
});

test('the pill wires no drag handlers — the pet is fixed at the far left', () => {
  const { button } = unwrap(DockPet({}) as unknown as El);
  for (const key of ['onPointerDown', 'onPointerMove', 'onPointerUp', 'onPointerCancel']) {
    assert.ok(!(key in button.props), key);
  }
});

test('locale: a resolved key is used verbatim; no translator falls back to English', () => {
  assert.equal(petFor({ t: (k: string) => ({ idle: '空闲' })[k] || k }).title, '空闲');
  assert.equal(petFor({ t: null }).title, 'Idle');
  assert.equal(petFor({ t: null }).aria, 'Idle', 'aria-label tracks the title');
  const { button } = unwrap(DockPet({}) as unknown as El);
  assert.ok(button !== null, 'survives a slot that passes no props');
});

test('the dock renders the 32px avatar crop 1:1 and displays it at 16px', () => {
  const active = store.activeSkin();
  assert.equal(active.grid, AVATAR_GRID);
  assert.equal(active.grid, 32, 'the dock avatar CROP is 32px of art');
  const c = petFor({}).canvas;
  // The backing store keeps every rendered pixel…
  assert.equal(c.width, active.canvasW);
  assert.equal(c.height, active.canvasH);
  assert.equal(c.width, 40, '32px of art + 4px headroom each side');
  // …and the CSS box is the LIVE size: an exact 1:2, i.e. 16px of art.
  assert.equal(c.style.width, active.canvasW * LIVE_ZOOM + 'px');
  assert.equal(c.style.width, '20px');
  assert.equal(Number.parseFloat(c.style.width) * 2, c.width, 'the live zoom is exact');
  assert.equal(c.style.imageRendering, 'pixelated');
});

test('fallback: no design system → native title, no popup, still pets', () => {
  initHostDeps(requireNoSeeds);
  try {
    const render = mount({});
    const view = render();
    assert.equal(view.tooltip, null, 'no Tooltip wrapper');
    assert.equal(view.nativeTitle, 'S:idle', 'the native title names the state');
    assert.equal(view.haspopup, undefined, 'no popup declared');
    assert.equal(view.expanded, undefined);
    view.click();
    const after = render();
    assert.equal(after.popup, null, 'no popup opens');
    assert.equal(after.nativeTitle, 'S:petted', 'clicking still pets');
  } finally {
    initHostDeps(requireStub);
  }
});

// ── Customisation UI (streamlined: behaviour, not layout) ──
const mountPlain = (comp: any, props: any) => {
  hooks = [];
  refs = [];
  cursor = 0;
  refCursor = 0;
  return () => {
    cursor = 0;
    refCursor = 0;
    return comp(props) as El;
  };
};
const tKey = (k: string) => 'S:' + k;

// Two numbers, deliberately different: the CROP the artwork is rendered at
// (32px avatar / 128px body — the Workshop shows these 1:1) and the LIVE DISPLAY
// size on the real page (16px / 64px — an exact 1:2 of those same rendered
// pixels).  The live zoom never re-renders the sprite smaller.
test('the live pet is 16px of avatar and 64px of body; the Workshop stays 1:1', () => {
  const dockSpec = GRIDS[AVATAR_GRID];
  const bodySpec = GRIDS[BODY_GRID];
  assert.equal(dockSpec.grid, 32, 'the avatar crop is 32px of art');
  assert.equal(dockSpec.canvasW, 40, 'its canvas is 40px: 32 of art + 4px headroom each side');
  assert.equal(bodySpec.grid, 128, 'the body crop is 128px of art');
  assert.equal(bodySpec.canvasW, 160, 'its canvas is 160px: 128 of art + 16px headroom each side');

  // The live zoom is exactly a half — an integer ratio, which is what keeps the
  // downscale crisp instead of blurry.
  assert.equal(LIVE_ZOOM, 1 / 2, 'exact, not a fractional fit');
  assert.equal(dockSpec.grid * LIVE_ZOOM, 16, 'the dock shows 16px of avatar');
  assert.equal(bodySpec.grid * LIVE_ZOOM, 64, 'the peek shows 64px of body');

  // The dock: 40px backing, 20px on screen.
  const c = petFor({}).canvas;
  assert.equal(c.width, 40, 'the backing keeps every rendered pixel');
  assert.equal(c.style.width, '20px', 'displayed at 16px of art + headroom');
  assert.equal(c.style.imageRendering, 'pixelated');

  // The peek resolves the 128px body and displays it at the live zoom: backing
  // 160, on screen 80 (64px of art + headroom).
  clearStorage();
  assert.equal(store.resolveBestSkin().grid, BODY_GRID);
  assert.equal(store.resolveBestSkin().canvasW, 160);
  const peek = mountPlain(PetPreview, { best: true, zoom: LIVE_ZOOM, interactive: false })();
  assert.equal(peek.props.width, 160, 'the peek renders the full 128px crop');
  assert.equal(peek.props.style.width, '80px', 'and shows 64px of body + headroom');

  // A `PetPreview` with NO `zoom` keeps 1:1: that is the studio's board-side
  // preview, which must show every rendered pixel.  A body-less skin still falls
  // back to its own avatar at 4×, so both crops land on the same size.  (The
  // GALLERY opts into LIVE_ZOOM instead — asserted in the gallery tests.)
  const atAvatarCrop = mountPlain(PetPreview, { crop: AVATAR_GRID, interactive: false })();
  assert.equal(atAvatarCrop.props.width, 160, 'the 32px crop is drawn at 4×');
  assert.equal(atAvatarCrop.props.style.width, '160px', 'and is NOT zoomed down');
  const atBodyCrop = mountPlain(PetPreview, { crop: BODY_GRID, interactive: false })();
  assert.equal(atBodyCrop.props.width, 160, 'the 128px crop is drawn at 1×');
  assert.equal(atBodyCrop.props.style.width, '160px');

  clearStorage();
});

// Click a page tab by its (prefixed) label; re-render to see the new tab.
const clickTab = (tree: El, label: string) => {
  findAllByText(tree, label)[0].props.onClick();
};

// Depth-first search helpers.
function findDeep(el: any, frag: string): any {
  if (!el || typeof el !== 'object') return null;
  if (el.props && String(el.props.className || '').split(' ').includes(frag)) return el;
  for (const c of el.children || []) {
    const hit = findDeep(c, frag);
    if (hit) return hit;
  }
  return null;
}

function childList(el: any): any[] {
  return ((el && el.children) || []).flat();
}

function textOf(el: any): string {
  if (el == null) return '';
  if (typeof el === 'string') return el;
  return childList(el).map(textOf).join('');
}

// All elements (deep) whose visible text is exactly `text`.
function findAllByText(el: any, text: string, out: any[] = []): any[] {
  if (!el || typeof el !== 'object') return out;
  if (el.props && textOf(el) === text) out.push(el);
  for (const c of childList(el)) findAllByText(c, text, out);
  return out;
}

// All CLICKABLE elements (deep) whose visible text contains `frag`.
function findAllContaining(el: any, frag: string, out: any[] = []): any[] {
  if (!el || typeof el !== 'object') return out;
  if (el.props && typeof el.props.onClick === 'function' && textOf(el).includes(frag)) out.push(el);
  for (const c of childList(el)) findAllContaining(c, frag, out);
  return out;
}

// Which state is being ASSIGNED TO (编辑 · 按状态), and which action is on the
// board (编辑 · 按动作): two dropdowns, two modes, never the same component.
const stateSelect = (tree: any) => findDeep(tree, 'status-pet-state-select');
const stateOptions = (tree: any) => childList(stateSelect(tree));
const optionLabels = (tree: any) => stateOptions(tree).map((o: any) => textOf(o));
const actionSelect = (tree: any) => findDeep(tree, 'status-pet-action-select');
const actionOptions = (tree: any) => childList(actionSelect(tree));
const actionOptionLabels = (tree: any) => actionOptions(tree).map((o: any) => textOf(o));

// Every element (deep) of this component type.
function findAllByType(el: any, type: any, out: any[] = []): any[] {
  if (!el || typeof el !== 'object') return out;
  if (el.type === type) out.push(el);
  for (const c of childList(el)) findAllByType(c, type, out);
  return out;
}

// All elements (deep) with this aria-label.
function findAllByLabel(el: any, label: string, out: any[] = []): any[] {
  if (!el || typeof el !== 'object') return out;
  if (el.props && el.props['aria-label'] === label) out.push(el);
  for (const c of childList(el)) findAllByLabel(c, label, out);
  return out;
}

// Is this string on screen as an authored HINT?  `findAllByText` counts the
// wrapper too when the hint is a container's only text, so the class is what
// makes "the hint says X" mean what it says.
function hintSays(tree: any, text: string): boolean {
  return findAllDeep(tree, 'status-pet-hint').some((el: any) => textOf(el) === text);
}

test('skin picker: one card per skin + custom; selecting persists', () => {
  clearStorage();
  const render = mountPlain(SkinPicker, { t: tKey });
  const cards = render().children[1].children.flat();
  assert.equal(cards.length, Object.keys(SKINS).length + 1);
  assert.ok(cards.every((c: any) => c.type === 'button'));
  assert.equal(cards[0].props['aria-pressed'], 'true', 'the default skin starts pressed');
  cards[1].props.onClick();                       // the 我的创作 card
  assert.equal(store.loadStored().skin, 'custom', 'clicking persists the selection');
  assert.equal(render().children[1].children.flat()[1].props['aria-pressed'], 'true');
});

test('skin picker: the custom slot seeds itself from the active skin', () => {
  clearStorage();
  store.saveStored({ skin: store.DEFAULT_SKIN });
  store.refreshActiveSkin();
  const render = mountPlain(SkinPicker, { t: tKey });
  const cards = render().children[1].children.flat();
  cards[cards.length - 1].props.onClick();
  const seeded = store.loadStored();
  assert.equal(seeded.skin, 'custom');
  assert.deepEqual(store.validateArtwork(seeded.custom), [], 'seeded from a real face');
  clearStorage();
});

// The studio's 画笔 row: six free brushes.  Painting bakes a brush's COLOUR
// into the pixels, so editing a brush never repaints the board — and there is
// nothing to add and no palette to manage.
const customWithPalette = () => ({
  palette: SKINS['whale-chan'].palette.slice(0, 7),   // transparency + 6 colours
  grids: {
    [AVATAR_GRID]: {
      library: [{ id: 'idle-1', frameMs: 400, frames: [{ rows: store.blankRows(AVATAR_GRID) }] }],
      states: { idle: ['idle-1'] },
    },
  },
});

// The library model's two addressing helpers: an ACTION is found by id, and a
// state's animation is whatever its ids resolve to.
const actionOf = (art: any, id: string, grid: number = AVATAR_GRID) =>
  art.grids[grid].library.find((a: any) => a.id === id);
const idleAction = (art: any, grid: number = AVATAR_GRID) => {
  const g = art.grids[grid];
  return g.library.find((a: any) => a.id === g.states.idle[0]);
};
/** The rows of one frame of the action the idle state plays. */
const idleRows = (art: any, frame = 0, grid: number = AVATAR_GRID) =>
  idleAction(art, grid).frames[frame].rows;

// Two named actions on the avatar grid: idle plays the first, the second is
// free — the shape almost every studio test below wants.
const studioFixture = () => ({
  palette: SKINS['whale-chan'].palette.slice(0, 7),
  grids: {
    [AVATAR_GRID]: {
      library: [
        { id: 'idle-1', name: 'idle act', frameMs: 400, frames: [{ rows: store.blankRows(AVATAR_GRID) }] },
        { id: 'hop', name: 'hop act', frameMs: 400, frames: [{ rows: store.blankRows(AVATAR_GRID) }] },
      ],
      states: { idle: ['idle-1'] },
    },
  },
});

const byClass = (el: any, frag: string, out: any[] = []): any[] => {
  if (!el || typeof el !== 'object') return out;
  if (el.props && String(el.props.className || '').split(' ').includes(frag)) out.push(el);
  for (const c of childList(el)) byClass(c, frag, out);
  return out;
};

// Every brush well, in order (the eraser is a button, not an input).
const brushWells = (el: any) =>
  byClass(el, 'status-pet-swatch-picker').filter((c: any) => c && c.type === 'input');

test('pixel studio: the brushes paint colours — editing one never repaints the board', () => {
  clearStorage();
  store.saveStored({ skin: 'custom', custom: customWithPalette() });
  store.refreshActiveSkin();
  const render = mountPlain(PixelEditor, { t: tKey });
  const wells = () => brushWells(render());
  const grid = () => findDeep(render(), 'status-pet-grid');
  const cell = (y: number, x: number) => grid().children.flat()[y].children.flat()[x];

  assert.equal(wells().length, 6, 'six brushes — a paint box, not a palette');
  assert.equal(findAllContaining(render(), 'S:settings.addColour').length, 0, 'nothing to add');
  assert.equal(findAllContaining(render(), 'S:settings.resetPalette').length, 0, 'nothing to reset');
  assert.ok(findAllByLabel(render(), 'S:settings.eraser').length > 0, 'an eraser sits beside them');
  assert.deepEqual(store.loadBrushes(), SKINS['whale-chan'].palette.slice(1, 1 + store.BRUSH_COUNT),
    'the default paint box is the default palette\'s first colours');

  // Brush 1 (the default) paints its colour; the pixel stores the colour.
  const row = () => idleRows(store.loadStored().custom!)[6];
  cell(6, 4).props.onPointerDown();
  assert.equal(store.pixelAt(row(), 4), '01', 'the pixel names the slot the colour landed in');
  assert.equal(store.loadStored().custom!.palette[1], SKINS['whale-chan'].palette[1],
    'and that slot is the colour the brush had');

  // Change the SAME brush to green (the well IS the brush): the pixel painted
  // before the change keeps its colour, the next one is green.
  wells()[0].props.onChange({ target: { value: '#00ff00' } });
  assert.equal(store.loadBrushes()[0], '#00ff00', 'the well is a brush, and it persists');
  cell(6, 5).props.onPointerDown();
  const art = store.loadStored().custom!;
  assert.equal(store.pixelAt(row(), 4), '01', 'the earlier pixel is untouched by the brush edit');
  assert.equal(store.pixelAt(row(), 5), '07', 'the green stroke took a new slot');
  assert.equal(art.palette[1], SKINS['whale-chan'].palette[1], 'the old colour is still in the artwork');
  assert.equal(art.palette[7], '#00ff00', 'the new colour joined the artwork palette');
  assert.deepEqual(store.validateArtwork(art), [], 'the artwork still validates');
  clearStorage();
});

test('pixel studio: the eraser, the eyedropper, and colours past the old 15-slot ceiling', () => {
  clearStorage();
  store.saveStored({ skin: 'custom', custom: customWithPalette() });
  store.refreshActiveSkin();
  const render = mountPlain(PixelEditor, { t: tKey });
  const wells = () => brushWells(render());
  const grid = () => findDeep(render(), 'status-pet-grid');
  const cell = (y: number, x: number) => grid().children.flat()[y].children.flat()[x];
  const row = () => idleRows(store.loadStored().custom!)[6];

  // Twenty distinct brush colours: each takes its own slot, well past 15.
  for (let i = 0; i < 20; i++) {
    wells()[0].props.onChange({ target: { value: '#' + (i + 1).toString(16).padStart(2, '0').repeat(3) } });
    cell(6, 4).props.onPointerDown();
  }
  const art = store.loadStored().custom!;
  assert.equal(art.palette.length, 7 + 20, 'every new colour took its own slot');
  assert.equal(parseInt(store.pixelAt(row(), 4), 16), 26, 'the last colour sits at slot 26 — past 15');

  // Eyedropper: right-clicking that pixel puts its colour on the current brush.
  wells()[0].props.onChange({ target: { value: '#ffffff' } });
  cell(6, 4).props.onPointerDown({ button: 2 });
  assert.equal(store.loadBrushes()[0], art.palette[26], 'the brush took the pixel\'s colour');

  // Eraser: the × well clears exactly the pixel under the pointer.
  findAllByLabel(render(), 'S:settings.eraser')[0].props.onClick();
  cell(6, 4).props.onPointerDown();
  assert.equal(store.pixelAt(row(), 4), store.TRANSPARENT, 'the eraser clears the pixel');
  assert.equal(store.pixelAt(row(), 11), store.TRANSPARENT,
    'the mirror column was never painted — drawing is free');
  clearStorage();
});

test('pixel studio: a free stroke saves as custom on the full grid', () => {
  clearStorage();
  store.saveStored({ skin: store.DEFAULT_SKIN });
  store.refreshActiveSkin();
  const render = mountPlain(PixelEditor, { t: tKey });
  const findGrid = (v: El) => findDeep(v, 'status-pet-grid');
  const grid = findGrid(render());
  const rows = grid.children.flat();
  assert.equal(rows.length, AVATAR_GRID, 'the board edits the FULL grid — the expression rows are unlocked');
  assert.equal(rows[0].children.flat().length, AVATAR_GRID);
  // Paint the classic expression row (row 4, previously locked): works now.
  rows[4].children.flat()[4].props.onPointerDown();
  const painted = store.loadStored();
  assert.equal(painted.skin, 'custom', 'painting saves as the custom skin');
  const drawn = idleRows(painted.custom!);
  // Forking to custom clones the built-in pixels, so "free drawing" means the
  // stroke changed exactly ONE cell of that row.
  const seeded = idleRows(store.seedArtworkFrom(store.DEFAULT_SKIN));
  assert.equal(store.pixelAt(drawn[4], 4), '01', 'the stroke landed');
  for (let x = 0; x < AVATAR_GRID; x++) {
    if (x === 4) continue;
    assert.equal(store.pixelAt(drawn[4], x), store.pixelAt(seeded[4], x),
      `column ${x} is untouched — the studio does not mirror strokes`);
  }
  const before = drawn[7];
  findGrid(render()).children.flat()[7].children.flat()[5].props.onPointerEnter({ buttons: 0 });
  assert.equal(idleRows(store.loadStored().custom!)[7], before,
    'hover without a button paints nothing');
  findGrid(render()).children.flat()[7].children.flat()[5].props.onPointerEnter({ buttons: 1 });
  assert.notEqual(idleRows(store.loadStored().custom!)[7], before,
    'dragging with a button paints');
  clearStorage();
});

test('pixel studio: an imported accent can be seen and removed, not silently stuck', () => {
  clearStorage();
  const art = customWithPalette() as any;
  art.grids[AVATAR_GRID].library[0].frames[0].prop = { x: 1, y: 1, rows: ['01', '01'] };
  assert.deepEqual(store.validateArtwork(art), [], 'the fixture is legal artwork');
  store.saveStored({ skin: 'custom', custom: art });
  store.refreshActiveSkin();
  const render = mountPlain(PixelEditor, { t: tKey });
  const clear = findAllByLabel(render(), 'S:settings.framePropClear');
  assert.equal(clear.length, 1, 'an accent on the selected frame offers its own row');
  clear[0].props.onClick();
  const saved = idleAction(store.loadStored().custom!).frames[0];
  assert.equal(saved.prop, undefined, 'the accent is gone');
  assert.deepEqual(store.validateArtwork(store.loadStored().custom!), [],
    'the artwork is still valid afterwards');
  clearStorage();
});

test('pixel studio: two strokes in one frame both land (no stale-closure loss)', () => {
  clearStorage();
  store.saveStored({ skin: store.DEFAULT_SKIN });
  store.refreshActiveSkin();
  const render = mountPlain(PixelEditor, { t: tKey });
  const grid = findDeep(render(), 'status-pet-grid');
  grid.children.flat()[1].children.flat()[3].props.onPointerDown();
  grid.children.flat()[2].children.flat()[4].props.onPointerDown();
  const drawn = idleRows(store.loadStored().custom!);
  assert.equal(store.pixelAt(drawn[1], 3), '01', 'the first stroke landed');
  assert.equal(store.pixelAt(drawn[2], 4), '01', 'the second stroke landed too');
  clearStorage();
});

test('pixel studio: follows the active skin; first stroke forks to custom with the full bake', () => {
  clearStorage();
  store.saveStored({ skin: 'whale-chan' });
  store.refreshActiveSkin();
  const render = mountPlain(PixelEditor, { t: tKey });
  // One dropdown names every ACTION — the whole baked library, with its length
  // and who plays it.  It never mentions a state: that is 按状态's dropdown.
  assert.equal(actionOptions(render()).length, 106, 'every library action is in the dropdown');
  assert.ok(actionOptionLabels(render()).every((l: string) => l.includes('S:settings.actionFrames')),
    'each option says how long the loop is');
  assert.ok(actionOptionLabels(render()).every((l: string) =>
    l.includes('S:settings.usedByN') || l.includes('S:settings.unusedAction')),
    'and how many states play it');
  assert.equal(actionSelect(render()).props.value, store.skinLibrary('whale-chan', AVATAR_GRID)[0].id,
    'the board starts on the library\'s first action');
  // Stroke: forks to custom with all states carried over.
  findDeep(render(), 'status-pet-grid').children.flat()[1].children.flat()[3].props.onPointerDown();
  const saved = store.loadStored();
  assert.equal(saved.skin, 'custom', 'the stroke forks to custom');
  assert.equal(Object.keys(saved.custom!.grids[AVATAR_GRID]!.states).length, 11, 'the fork carries every state');
  assert.equal(saved.custom!.grids[AVATAR_GRID]!.library.length, 106,
    'and the whole action library, once — the states only reference it');
  assert.equal(store.pixelAt(idleRows(saved.custom!)[1], 3), '01', 'the stroke landed');
  clearStorage();
});

test('pixel studio: the 动作 dropdown picks what the board edits, per action', () => {
  clearStorage();
  store.saveStored({ skin: 'custom', custom: studioFixture() });
  store.refreshActiveSkin();
  const render = mountPlain(PixelEditor, { t: tKey });
  const grid = () => findDeep(render(), 'status-pet-grid');
  const cell = (y: number, x: number) => grid().children.flat()[y].children.flat()[x];

  // Both actions are offered, by name, and the second one is selectable.
  assert.deepEqual(actionOptionLabels(render()).map((l: string) => l.split(' · ')[0]),
    ['idle act', 'hop act'], 'every action names itself in the dropdown');
  assert.equal(actionSelect(render()).props.value, 'idle-1', 'the board starts on the first action');
  actionSelect(render()).props.onChange({ target: { value: 'hop' } });
  assert.equal(actionSelect(render()).props.value, 'hop', 'choosing an action moves the board to it');

  // And the stroke lands on THAT action — idle's art is untouched.
  cell(2, 2).props.onPointerDown();
  const saved = store.loadStored().custom!;
  assert.equal(store.pixelAt(actionOf(saved, 'hop').frames[0].rows[2], 2), '01',
    'the stroke went to the action the dropdown names');
  assert.equal(store.pixelAt(idleRows(saved)[2], 2), store.TRANSPARENT,
    'and not to the one it was on before');
  clearStorage();
});

test('pixel studio: a jump from 预览 · 按动作 opens the board on that action', () => {
  // The prop is how the page hands a corner ✎ over; the studio must honour it
  // on mount (the ordinary way in has no target and takes the first action).
  clearStorage();
  store.saveStored({ skin: 'custom', custom: studioFixture() });
  store.refreshActiveSkin();
  const plain = mountPlain(PixelEditor, { t: tKey });
  assert.equal(actionSelect(plain()).props.value, 'idle-1', 'no target: the first action');
  const jumped = mountPlain(PixelEditor, { t: tKey, actionId: 'hop' });
  assert.equal(actionSelect(jumped()).props.value, 'hop', 'a target: that action');
  const stale = mountPlain(PixelEditor, { t: tKey, actionId: 'no-such-action' });
  assert.equal(actionSelect(stale()).props.value, 'idle-1', 'an unknown target falls back, never blanks');
  clearStorage();
});

test("assignments: a built-in's state assignment is a stored DIFF, and nothing forks", () => {
  // A built-in's pixels are frozen; WHICH OF ITS OWN ACTIONS each state plays is
  // the user's, and the store keeps it as a diff beside the skin — so the
  // artwork keeps its pixels, a state nobody touched keeps following the
  // artwork, and 我的创作 is not created behind the user's back.
  clearStorage();
  store.saveStored({ skin: 'whale-chan' });
  store.refreshActiveSkin();
  const props: any = { t: tKey, skin: 'whale-chan', grid: AVATAR_GRID, state: 'idle',
    onStateChange: (s: string) => { props.state = s; } };
  const render = mountPlain(StateAssignments, props);
  const lib = store.skinLibrary('whale-chan', AVATAR_GRID);
  // Looked up by NAME, not by position: the list shows this state's own ticks
  // first, so an index into the library is no longer an index into the rows.
  const rowFor = (id: string) =>
    findAllDeep(render(), 'status-pet-library-row')
      .find((r: any) => textOf(r).startsWith(lib.find((a) => a.id === id)!.name!))!;
  const authored = store.skinArtwork('whale-chan')!.grids[AVATAR_GRID]!.states;
  const authoredTool = authored.tool!.length;

  // The authored assignment is what the list shows first.
  stateSelect(render()).props.onChange({ target: { value: 'tool' } });
  assert.equal(inputsIn(rowFor('xie-daima'))[0].props.checked, true, 'a tick the artwork assigned is on');
  assert.equal(inputsIn(rowFor('chi-niangao'))[0].props.checked, false, 'an unassigned one is off');

  // Tick it: one diff entry, no fork, and every reader follows.
  inputsIn(rowFor('chi-niangao'))[0].props.onChange({ target: { checked: true } });
  const saved: any = store.loadStored();
  assert.equal(saved.skin, 'whale-chan', 'the active skin is still the built-in');
  assert.equal(saved.custom, undefined, 'nothing forked into 我的创作');
  assert.deepEqual(Object.keys(saved.builtinStates!['whale-chan']), ['32'], 'stored per crop');
  assert.deepEqual(Object.keys(saved.builtinStates!['whale-chan']['32']), ['tool'],
    'and only the state that changed');
  assert.deepEqual(saved.builtinStates!['whale-chan']['32'].tool.slice(-1), ['chi-niangao']);
  assert.equal(store.activeSkin().states.tool.takes.length, authoredTool + 1,
    'ACTIVE (dock/popup) picked it up');
  assert.equal(store.resolveNamedSkin('whale-chan', AVATAR_GRID)!.states.tool.takes.length, authoredTool + 1,
    'and so did the named resolution 预览 uses');
  assert.ok(store.skinLibrary('whale-chan', AVATAR_GRID).find((a) => a.id === 'chi-niangao')!
    .usedBy.includes('tool'), 'the library read-out says who plays it now');
  assert.ok(store.seedArtworkFrom('whale-chan').grids[AVATAR_GRID]!.states.tool!.includes('chi-niangao'),
    'and 我的创作 would start from what the user sees');

  // Emptying a state is stored as such: it deliberately follows idle instead of
  // falling back to the authored assignment.
  for (const id of [...authored.tool!, 'chi-niangao']) {
    inputsIn(rowFor(id))[0].props.onChange({ target: { checked: false } });
  }
  assert.deepEqual((store.loadStored() as any).builtinStates['whale-chan']['32'].tool, [],
    'an explicitly emptied state is stored empty');
  const skin = store.resolveNamedSkin('whale-chan', AVATAR_GRID)!;
  assert.equal(skin.states.tool, skin.states.idle, 'and it resolves to idle');

  // A stale id can never blank the pet: it is dropped on the way in.
  store.saveStored({ builtinStates: { 'whale-chan': { '32': { tool: ['no-such-action'] } } } });
  const stale = store.resolveNamedSkin('whale-chan', AVATAR_GRID)!;
  assert.equal(stale.states.tool, stale.states.idle, 'an unknown id is dropped, not rendered');
  assert.equal(stale.states.idle.takes.length, authored.idle!.length, 'while idle is untouched');
  clearStorage();
});

test('assignments: 清空 works on EVERY state — 空闲 keeps one, because it is the anchor', () => {
  clearStorage();
  store.saveStored({ skin: 'custom', custom: studioFixture() });
  store.refreshActiveSkin();
  const props: any = { t: tKey, skin: 'custom', grid: AVATAR_GRID, state: 'idle',
    onStateChange: (s: string) => { props.state = s; } };
  const render = mountPlain(StateAssignments, props);
  const clear = () => findAllByText(render(), 'S:settings.clearSelection')[0];
  const idle = () => store.loadStored().custom!.grids[AVATAR_GRID]!.states.idle;

  // 空闲 is the state the dropdown opens on, and the rule that shapes its two
  // buttons is printed — not left to a title a button cannot show.
  assert.equal(findAllByText(render(), 'S:settings.clearIdleHint').length, 1,
    'the anchor rule is on screen whenever 空闲 is');

  // 全选 then 清空 is the bulk round trip that used to DEAD-END on 空闲: the
  // ticks went on and nothing could take them off again.
  findAllContaining(render(), 'S:settings.selectAll')[0].props.onClick();
  assert.deepEqual(idle(), ['idle-1', 'hop'], '全选 ticks the whole library');
  clear().props.onClick();
  assert.deepEqual(idle(), ['idle-1'], '清空 clears 空闲 down to ONE — never to nothing');
  assert.deepEqual(store.validateArtwork(store.loadStored().custom!), [],
    'so the document still validates and the pet keeps drawing');

  // Every other state empties COMPLETELY: an empty selection IS the idle
  // fallback, and that is the one representation of "unset".
  stateSelect(render()).props.onChange({ target: { value: 'tool' } });
  assert.equal(findAllByText(render(), 'S:settings.clearIdleHint').length, 0,
    'the anchor hint belongs to 空闲 alone');
  inputsIn(findAllDeep(render(), 'status-pet-library-row')[1])[0]
    .props.onChange({ target: { checked: true } });
  clear().props.onClick();
  assert.equal(store.loadStored().custom!.grids[AVATAR_GRID]!.states.tool, undefined,
    'a non-idle state clears to empty — the state follows idle');
  clearStorage();
});

test('assignments: the search box narrows the list, and 全选 only ticks what is listed', () => {
  clearStorage();
  store.saveStored({ skin: 'custom', custom: studioFixture() });
  store.refreshActiveSkin();
  const props: any = { t: tKey, skin: 'custom', grid: AVATAR_GRID, state: 'tool',
    onStateChange: (s: string) => { props.state = s; } };
  const render = mountPlain(StateAssignments, props);
  const rows = () => findAllDeep(render(), 'status-pet-library-row');
  const search = () => findDeep(render(), 'status-pet-import-search');

  assert.equal(rows().length, 2, 'the whole library first');
  assert.equal(findAllByText(render(), 'S:settings.searchMatches').length, 0,
    'no match count while nothing is filtered');

  search().props.onChange({ target: { value: 'hop act' } });
  assert.equal(rows().length, 1, 'the filter narrows the list by name');
  assert.equal(textOf(rows()[0]).includes('hop act'), true);
  assert.equal(findAllByText(render(), 'S:settings.searchMatches').length, 1,
    'and says how much of the library it is showing');
  assert.equal(findAllByText(render(), 'S:settings.selectedCount').length, 1,
    'the tick count is a read-out, not a guess');

  // 全选 is AIMED: it ticks what the filter listed, on top of what the state
  // already plays — replacing would silently drop ticks the filter hides.
  findAllContaining(render(), 'S:settings.selectAll')[0].props.onClick();
  assert.deepEqual(store.loadStored().custom!.grids[AVATAR_GRID]!.states.tool, ['hop'],
    'only the listed action was ticked');

  search().props.onChange({ target: { value: '' } });
  findAllContaining(render(), 'S:settings.selectAll')[0].props.onClick();
  assert.deepEqual(store.loadStored().custom!.grids[AVATAR_GRID]!.states.tool, ['idle-1', 'hop'],
    'and unfiltered it adds the rest, in library order');

  search().props.onChange({ target: { value: 'nothing matches this' } });
  assert.equal(rows().length, 0, 'no rows');
  assert.ok(hintSays(render(), 'S:settings.searchEmpty'),
    'and the empty state says so instead of looking broken');
  clearStorage();
});

test('pixel studio × assignments: one edit to a SHARED action changes every state that plays it', () => {
  // The whole point of the library, and the reason both halves report the
  // players: reuse is a reference, so an edit in 按动作 lands in every state
  // that was ticked in 按状态.
  clearStorage();
  store.saveStored({ skin: 'custom', custom: studioFixture() });
  store.refreshActiveSkin();

  // Tick 'hop' for tool, and for done (the assignment half).
  const aProps: any = { t: tKey, skin: 'custom', grid: AVATAR_GRID, state: 'idle',
    onStateChange: (s: string) => { aProps.state = s; } };
  const assign = mountPlain(StateAssignments, aProps);
  const rows = () => findAllDeep(assign(), 'status-pet-library-row');
  stateSelect(assign()).props.onChange({ target: { value: 'tool' } });
  inputsIn(rows()[1])[0].props.onChange({ target: { checked: true } });
  stateSelect(assign()).props.onChange({ target: { value: 'done' } });
  inputsIn(rows()[1])[0].props.onChange({ target: { checked: true } });
  let saved = store.loadStored().custom!;
  assert.deepEqual(store.usedBy(saved, AVATAR_GRID, 'hop').sort(), ['done', 'tool']);
  assert.ok(textOf(rows()[1]).includes('S:settings.usedByN'), 'the row says how many states play it');

  // Paint one pixel of that same action (the drawing half): BOTH states move.
  const before = store.resolveSkin(store.loadStored());
  const studio = mountPlain(PixelEditor, { t: tKey, actionId: 'hop' });
  assert.ok(actionOptionLabels(studio()).find((l: string) => l.startsWith('hop act'))!
    .includes('S:settings.usedByN'), 'the studio warns that the action is shared');
  findDeep(studio(), 'status-pet-grid').children.flat()[2].children.flat()[2].props.onPointerDown();
  saved = store.loadStored().custom!;
  assert.equal(store.pixelAt(idleRows(saved)[2], 2), store.TRANSPARENT,
    'idle\'s own action is untouched — the stroke went to the shared one');
  assert.equal(store.pixelAt(actionOf(saved, 'hop').frames[0].rows[2], 2), '01',
    'the shared action took the stroke');
  const after = store.resolveSkin(store.loadStored());
  assert.notEqual(after.states.tool, before.states.tool, 'tool re-resolved to the edited action');
  assert.equal(after.states.done, after.states.tool,
    'and done shares that very resolution — they play the same object');
  clearStorage();
});

test('pixel studio: 导入来自内置库 — 覆盖当前动作，id 和状态关联都不动', () => {
  // 导入 is not a merge any more: it FILLS the slot you are editing.  The
  // library therefore never grows by 106 entries, and the states that played the
  // action keep playing it (the id is what they reference).
  clearStorage();
  store.saveStored({ skin: 'custom', custom: customWithPalette() });
  store.refreshActiveSkin();
  const render = mountPlain(PixelEditor, { t: tKey });
  const lib = () => store.loadStored().custom!.grids[AVATAR_GRID]!.library;
  const builtin = store.skinLibrary('whale-chan', AVATAR_GRID);
  const source = builtin.find((a) => a.id === 'chi-niangao')!;
  assert.equal(lib().length, 1, 'the fixture starts with one action');
  const idBefore = lib()[0].id;

  // The picker: the built-in catalog AND my own action, both at this crop.
  findAllByLabel(render(), 'S:settings.importAction')[0].props.onClick();
  assert.equal(findAllDeep(render(), 'status-pet-import-row').length, builtin.length + 1,
    'the built-in library plus my own action');
  assert.deepEqual(findAllDeep(render(), 'status-pet-import-group-title').map((g: any) => textOf(g)),
    ['S:settings.importSource.builtin', 'S:settings.importSource.mine'], 'grouped by where it comes from');
  assert.equal(findAllDeep(render(), 'status-pet-import-row')
    .filter((r: any) => textOf(r).includes('S:settings.importCurrent')).length, 1,
    'my own row is marked as the one on the board');
  // …and 106 rows need the search box.
  findAllDeep(render(), 'status-pet-import-search')[0]
    .props.onChange({ target: { value: 'chi-niangao' } });
  const narrowed = findAllDeep(render(), 'status-pet-import-row');
  assert.equal(narrowed.length, 1, 'searching narrows the catalog');
  narrowed[0].props.onClick();

  // The overwrite: same id, same states, new content.
  const after = lib();
  assert.equal(after.length, 1, 'importing does NOT grow the library');
  assert.equal(after[0].id, idBefore, 'the id is kept, so the state references still resolve');
  assert.deepEqual(store.usedBy(store.loadStored().custom!, AVATAR_GRID, idBefore), ['idle'],
    'and idle still plays it');
  assert.equal(after[0].name, '吃年糕', 'the source name comes along');
  assert.equal(after[0].origin, 'chi-niangao', 'and its provenance');
  assert.equal(after[0].frames.length, source.frames, 'the whole animation arrives');
  assert.notDeepEqual(after[0].frames[0].rows, store.blankRows(AVATAR_GRID), 'with real pixels');
  assert.deepEqual(store.validateArtwork(store.loadStored().custom!), [],
    'the imported colours were re-pointed at THIS artwork\'s palette');
  assert.equal(findAllByText(render(), 'S:settings.importedOne').length, 1,
    'and the picker reports which action landed');

  // Destructive, but one 撤销 away.
  findAllByLabel(render(), 'S:settings.undo')[0].props.onClick();
  const back = lib();
  assert.equal(back.length, 1, 'undo puts the slot back');
  assert.equal(back[0].id, idBefore);
  assert.equal(back[0].name, undefined, 'with my own (unnamed, blank) action');
  clearStorage();
});

test('pixel studio: 导入 from my own library copies that content into the current slot', () => {
  // The other source is this artwork's OWN actions at this crop — the two crops
  // are isolated, so a 32px action is never offered to the 128px board.
  clearStorage();
  store.saveStored({ skin: 'custom', custom: studioFixture() });
  store.refreshActiveSkin();
  const render = mountPlain(PixelEditor, { t: tKey });
  const lib = () => store.loadStored().custom!.grids[AVATAR_GRID]!.library;

  // Give 'hop' a pixel of its own, then come back to 'idle-1'.
  actionSelect(render()).props.onChange({ target: { value: 'hop' } });
  findDeep(render(), 'status-pet-grid').children.flat()[2].children.flat()[2].props.onPointerDown();
  actionSelect(render()).props.onChange({ target: { value: 'idle-1' } });

  findAllByLabel(render(), 'S:settings.importAction')[0].props.onClick();
  findAllByLabel(render(), 'hop act')[0].props.onClick();

  const after = lib();
  assert.equal(after.length, 2, 'no new slot: the content moved into the one being edited');
  assert.deepEqual(after.map((a: any) => a.id), ['idle-1', 'hop']);
  assert.equal(store.pixelAt(after[0].frames[0].rows[2], 2), '01',
    'idle-1 now carries hop\'s pixels');
  assert.equal(after[0].name, 'hop act', 'and its name');
  assert.equal(store.pixelAt(after[1].frames[0].rows[2], 2), '01', 'while hop itself is untouched');
  assert.deepEqual(store.validateArtwork(store.loadStored().custom!), [], 'the artwork stays valid');
  clearStorage();
});

test('pixel studio: 新建动作 / 删除动作, and delete refuses to strand idle', () => {
  // The 动作 row is three verbs and a name — 新建, 删除, 导入 — plus the dropdown.
  // There is deliberately no 复制动作: filling a second slot is what 导入 is for,
  // and the library stays a small set of slots you curate.
  clearStorage();
  store.saveStored({ skin: 'custom', custom: studioFixture() });
  store.refreshActiveSkin();
  const render = mountPlain(PixelEditor, { t: tKey });
  const size = () => store.loadStored().custom!.grids[AVATAR_GRID]!.library.length;
  const del = () => findAllByLabel(render(), 'S:settings.deleteAction')[0];

  // The selected action is the only one idle plays: deleting it would leave
  // the required idle assignment empty, so the button is off.
  assert.equal(size(), 2);
  assert.equal(actionSelect(render()).props.value, 'idle-1', 'the first action is selected by default');
  assert.equal(actionOptions(render()).length, 2, 'the dropdown offers both actions');
  assert.equal(findAllContaining(render(), 'S:settings.duplicateAction').length, 0,
    'no 复制动作 anywhere');
  assert.equal(del().props.disabled, true, 'deleting idle\'s only action is refused');

  // A new action is minted even though a blank one is already in the library:
  // sharing it silently would make the button look broken.
  findAllByLabel(render(), 'S:settings.newAction')[0].props.onClick();
  assert.equal(size(), 3, '新建动作 always mints an action');
  assert.equal(actionSelect(render()).props.value,
    store.loadStored().custom!.grids[AVATAR_GRID]!.library[2].id,
    'and puts it on the board');

  assert.equal(del().props.disabled, false, 'once it is not idle\'s only action, delete is available');
  del().props.onClick();
  assert.equal(size(), 2, 'the selected action is gone');
  assert.deepEqual(store.validateArtwork(store.loadStored().custom!), [], 'and the artwork is still valid');
  clearStorage();
});

test('预览 · 按动作: 批量删除 ticks several actions, and a dialog confirms the removal', () => {
  clearStorage();
  const fixture: any = studioFixture();
  const grid = fixture.grids[AVATAR_GRID];
  grid.library.push(
    { id: 'sleep-a', name: 'sleep act', frameMs: 400, frames: [{ rows: store.blankRows(AVATAR_GRID) }] },
    { id: 'tool-a', name: 'tool act', frameMs: 400, frames: [{ rows: store.blankRows(AVATAR_GRID) }] },
  );
  // Two actions shared by one state, so the delete has real references to strip.
  grid.states.tool = ['sleep-a', 'tool-a'];
  store.saveStored({ skin: 'custom', custom: fixture });
  store.refreshActiveSkin();
  const render = mountPlain(SettingsPage, { t: tKey });
  const ids = () => store.loadStored().custom!.grids[AVATAR_GRID]!.library.map((a) => a.id);
  const checks = () => findAllDeep(render(), 'status-pet-gallery-check');
  const del = () => findAllContaining(render(), 'S:settings.deleteSelected')[0];
  const dialog = () => findDeep(render(), 'status-pet-confirm');
  const manage = () => findAllByLabel(render(), 'S:settings.manageActions');

  // The gallery's OWN search is there before any selection mode, and the mode
  // is offered by 按动作 alone (按状态 has no action to select).
  findAllByText(render(), 'S:settings.view.actions')[0].props.onClick();
  assert.equal(findAllDeep(render(), 'status-pet-import-search').length, 1,
    '按动作 carries its search box');
  assert.equal(checks().length, 0, 'no checkboxes until selection mode is asked for');
  assert.equal(findAllDeep(render(), 'status-pet-gallery-edit').length, 4,
    'every tile carries its corner ✎ while just looking');
  // The button is a plain label: no icon prefix.
  assert.equal(textOf(manage()[0]), 'S:settings.manageActions', 'no icon on the button');
  manage()[0].props.onClick();
  assert.equal(checks().length, 4, 'selection mode makes every action checkable');
  assert.equal(findAllDeep(render(), 'status-pet-gallery-edit').length, 0,
    'and the corner ✎ gives way to the checkbox');
  assert.equal(findAllDeep(render(), 'status-pet-import-search').length, 1,
    'the pick bar adds no second search box');

  checks()[2].props.onChange();
  checks()[3].props.onChange();
  assert.ok(hintSays(render(), 'S:settings.selectedCount'), 'the tick count is a read-out');

  // A removal is not undoable, so it asks FIRST — and cancelling writes nothing.
  del().props.onClick();
  assert.ok(dialog(), 'clicking Delete selected opens the confirm dialog');
  assert.equal(ids().length, 4, 'and nothing has been removed yet');
  findAllContaining(render(), 'S:settings.cancel')[0].props.onClick();
  assert.equal(dialog(), null, 'Cancel closes it');
  assert.equal(ids().length, 4, 'still nothing removed');

  del().props.onClick();
  findAllContaining(render(), 'S:settings.confirmDelete')[0].props.onClick();
  assert.equal(dialog(), null, 'the dialog closes on confirm');
  assert.deepEqual(ids(), ['idle-1', 'hop'], 'one write removed both');
  assert.equal(store.loadStored().custom!.grids[AVATAR_GRID]!.states.tool, undefined,
    'and every state that referenced them lost just those references');
  assert.deepEqual(store.validateArtwork(store.loadStored().custom!), [], 'the document stays valid');
  assert.ok(hintSays(render(), 'S:settings.actionsRemoved'), 'and it says what happened');

  // The guards are the single delete's, applied to the whole selection: idle
  // would lose its only action, and emptying the library is refused too.
  checks()[0].props.onChange();
  assert.equal(del().props.disabled, true, 'deleting idle\'s only action is refused');
  assert.equal(del().props.title, 'S:settings.deleteBlocked', 'and the reason is on the button');
  del().props.onClick();
  assert.equal(dialog(), null, 'a blocked removal never opens the dialog');
  checks()[0].props.onChange();
  for (const c of checks()) c.props.onChange();
  assert.equal(del().props.disabled, true, 'so is deleting the whole library');
  assert.equal(ids().length, 2, 'and the two that were removed stay removed — there is no undo');
  clearStorage();
});

test('预览: both modes carry a search, and 批量删除 is 我的创作 · 按动作 alone', () => {
  clearStorage();
  store.saveStored({ skin: 'custom', custom: studioFixture() });
  store.refreshActiveSkin();
  let render = mountPlain(SettingsPage, { t: tKey });
  const searches = () => findAllDeep(render(), 'status-pet-import-search');
  const cells = () => findAllDeep(render(), 'status-pet-gallery-cell');

  // 按状态: a search that finds a STATE — by name, meaning, or an action it plays.
  assert.equal(searches().length, 1, '按状态 carries a search box');
  assert.equal(cells().length, 11, 'all eleven states');
  assert.equal(findAllByLabel(render(), 'S:settings.manageActions').length, 0,
    'and no 批量删除 here — 按状态 has nothing to select');
  searches()[0].props.onChange({ target: { value: 'idle act' } });
  assert.equal(cells().length, 1, 'searching an action name finds the states that play it');
  searches()[0].props.onChange({ target: { value: 'no such state' } });
  assert.equal(cells().length, 0, 'nothing matches');
  assert.ok(hintSays(render(), 'S:settings.searchEmpty'), 'and the empty state says so');

  // 按动作: the same box, and here it scopes 全选.
  findAllByText(render(), 'S:settings.view.actions')[0].props.onClick();
  assert.equal(searches().length, 1, '按动作 carries its own search box');
  const manage = () => findAllByLabel(render(), 'S:settings.manageActions');
  assert.equal(manage().length, 1, '我的创作 offers the mode');
  manage()[0].props.onClick();
  const checks = () => findAllDeep(render(), 'status-pet-gallery-check');
  assert.equal(checks().length, 2, 'the whole library is checkable');
  searches()[0].props.onChange({ target: { value: 'hop' } });
  assert.equal(checks().length, 1, 'the filter narrows the grid');
  assert.ok(hintSays(render(), 'S:settings.searchMatches'), 'and reports how much of the library it shows');
  findAllContaining(render(), 'S:settings.selectAll')[0].props.onClick();
  assert.deepEqual(checks().map((c: any) => c.props.checked), [true],
    '全选 takes what the search matched');
  findAllContaining(render(), 'S:settings.clearSelection')[0].props.onClick();
  assert.deepEqual(checks().map((c: any) => c.props.checked), [false], '清空 unticks the selection');

  // A built-in's actions are frozen: the gallery still searches, but there is
  // nothing to select or delete.
  clearStorage();
  store.saveStored({ skin: 'whale-chan' });
  store.refreshActiveSkin();
  render = mountPlain(SettingsPage, { t: tKey });
  findAllByText(render(), 'S:settings.view.actions')[0].props.onClick();
  assert.equal(searches().length, 1, '按动作 searches on a built-in too');
  assert.equal(findAllByLabel(render(), 'S:settings.manageActions').length, 0,
    'a built-in cannot prune its library');
  clearStorage();
});

test('pixel studio: the animation flow — duplicate the frame, then nudge it up', () => {
  clearStorage();
  store.saveStored({ skin: 'custom', custom: studioFixture() });
  store.refreshActiveSkin();
  const render = mountPlain(PixelEditor, { t: tKey });
  // draw something on frame 1
  findDeep(render(), 'status-pet-grid').children.flat()[3].children.flat()[3].props.onPointerDown();
  // the filmstrip's first verb duplicates the frame being edited
  findAllByLabel(render(), 'S:settings.addFrame')[0].props.onClick();
  const edited = () => idleAction(store.loadStored().custom!);
  assert.equal(edited().frames.length, 2, 'duplicating adds a frame');
  assert.deepEqual(edited().frames[1].rows, edited().frames[0].rows, 'the copy starts identical');
  // and one press of the nudge pad moves that whole frame up a cell
  findAllByLabel(render(), 'S:settings.moveUp')[0].props.onClick();
  assert.equal(edited().frames[1].dy, -1, 'the copy sits one cell higher');
  assert.deepEqual(edited().frames[1].rows, edited().frames[0].rows, 'the pixels themselves are untouched');
  findAllByText(render(), 'S:settings.offsetReset')[0].props.onClick();
  assert.equal(edited().frames[1].dy, undefined, 'reset puts the frame back');
  clearStorage();
});

test('pixel studio: the frame caps hold, and the library never runs out of room by accident', () => {
  clearStorage();
  store.saveStored({ skin: 'custom', custom: studioFixture() });
  store.refreshActiveSkin();
  const render = mountPlain(PixelEditor, { t: tKey });
  // Frames: add until capped at MAX_FRAMES.
  for (let i = 0; i < 10; i++) {
    const add = findAllByLabel(render(), 'S:settings.addFrame')[0];
    if (add) add.props.onClick();
  }
  const action = idleAction(store.loadStored().custom!);
  assert.equal(action.frames.length, store.MAX_FRAMES, 'frames capped at MAX_FRAMES');
  assert.equal(findAllByLabel(render(), 'S:settings.addFrame').length, 0,
    'and the duplicate button disappears at the cap');
  assert.ok(findAllContaining(render(), 'S:settings.delFrame').length > 0, 'while delete stays');
  // The frame list is per ACTION, so the other one is untouched.
  assert.equal(actionOf(store.loadStored().custom!, 'hop').frames.length, 1,
    'the other action keeps its own frames');
  clearStorage();
});

test('pixel studio: the 128 draft generates from the avatar; the body crop resolves', () => {
  clearStorage();
  store.saveStored({ skin: 'custom', custom: studioFixture() });
  store.refreshActiveSkin();
  // The crop comes from the page now: mount the studio ON the body crop, where
  // the empty-state card offers the draft generator.
  const render = mountPlain(PixelEditor, { t: tKey, grid: BODY_GRID });
  const gen = findAllByText(render(), 'S:settings.genBody');
  assert.ok(gen.length > 0, 'the draft generator is offered while the body is empty');
  gen[0].props.onClick();
  const saved = store.loadStored().custom!;
  assert.ok(saved.grids[BODY_GRID], 'the 128px grid was generated');
  const hdIdle = idleRows(saved, 0, BODY_GRID);
  assert.ok(hdIdle.length === BODY_GRID && hdIdle.every((r: string) => store.rowPixels(r) === BODY_GRID),
    'the draft is a full 128px frame');
  assert.equal(store.resolveNamedSkin('custom', BODY_GRID)!.grid, BODY_GRID, 'the body crop resolves');
  assert.equal(findDeep(render(), 'status-pet-grid').children.flat().length, BODY_GRID, 'the board shows 128 rows');
  clearStorage();
});

test('pixel studio: import/export round trip with a localized error path', () => {
  clearStorage();
  store.saveStored({ skin: 'custom', custom: studioFixture() });
  store.refreshActiveSkin();
  const render = mountPlain(PixelEditor, { t: tKey });
  // Open the IO fold.
  findAllByLabel(render(), 'S:settings.io')[0].props.onClick();
  const textarea = (v: El) => {
    let found: any = null;
    (function walk(el: any) {
      if (found || !el || typeof el !== 'object') return;
      if (el.type === 'textarea') { found = el; return; }
      for (const c of childList(el)) walk(c);
    })(v);
    return found;
  };

  textarea(render()).props.onChange({ target: { value: 'garbage' } });
  findAllByText(render(), 'S:settings.import')[0].props.onClick();
  assert.ok(findDeep(render(), 'status-pet-error'), 'an invalid import shows the localized error');

  const valid = store.serializeArtwork(customWithPalette());
  textarea(render()).props.onChange({ target: { value: valid } });
  findAllByText(render(), 'S:settings.import')[0].props.onClick();
  assert.equal(store.loadStored().custom!.palette[2], SKINS['whale-chan'].palette[2],
    'a valid import replaces the custom skin');
  assert.ok(!findDeep(render(), 'status-pet-error'), 'a successful import clears the error');

  findAllByText(render(), 'S:settings.export')[0].props.onClick();
  const exported = textarea(render()).props.value;
  assert.ok(store.parseArtworkExport(exported).data, 'export produces importable JSON');
  clearStorage();
});

test('pixel studio: undo restores the previous artwork', () => {
  clearStorage();
  store.saveStored({ skin: 'custom', custom: studioFixture() });
  store.refreshActiveSkin();
  const render = mountPlain(PixelEditor, { t: tKey });
  const grid = findDeep(render(), 'status-pet-grid');
  const beforeRow = grid.children.flat()[1].children.flat().map((c: any) => c.props.style.background).join(',');
  grid.children.flat()[1].children.flat()[3].props.onPointerDown();
  const strokedRow = findDeep(render(), 'status-pet-grid').children.flat()[1].children.flat()
    .map((c: any) => c.props.style.background).join(',');
  assert.notEqual(strokedRow, beforeRow, 'stroke landed on the board');
  const savedAfterStroke = idleRows(store.loadStored().custom!)[1];
  findAllByLabel(render(), 'S:settings.undo')[0].props.onClick();
  const afterUndoRow = findDeep(render(), 'status-pet-grid').children.flat()[1].children.flat()
    .map((c: any) => c.props.style.background).join(',');
  assert.equal(afterUndoRow, beforeRow, 'undo restores the pre-stroke board');
  findAllByLabel(render(), 'S:settings.redo')[0].props.onClick();
  assert.equal(idleRows(store.loadStored().custom!)[1], savedAfterStroke,
    'redo reapplies the stroke');
  clearStorage();
});

// ── The studio's LAYOUT invariants ──
// Two regressions reported from the running UI, both asserted here so they
// cannot come back: (1) the board was drawn at a fixed cell size, so the 64×64
// crop was clipped inside a narrow pane; (2) the take preview shared one
// bordered strip with the selected frame's numbers, which read as one confused
// control.  The fixes are structural, so the tests assert structure.

function findAllDeep(el: any, frag: string, out: any[] = []): any[] {
  if (!el || typeof el !== 'object') return out;
  if (el.props && String(el.props.className || '').split(' ').includes(frag)) out.push(el);
  for (const c of childList(el)) findAllDeep(c, frag, out);
  return out;
}

// Every number/colour input inside a subtree.
function inputsIn(el: any, out: any[] = []): any[] {
  if (!el || typeof el !== 'object') return out;
  if (el.type === 'input') out.push(el);
  for (const c of childList(el)) inputsIn(c, out);
  return out;
}

test('pixel studio: the board is sized by its column, never by a pixel constant', () => {
  clearStorage();
  store.saveStored({ skin: 'custom', custom: store.seedArtworkFrom(store.DEFAULT_SKIN) });
  store.refreshActiveSkin();
  const tree = PixelEditor({ t: tKey, grid: BODY_GRID }) as unknown as El;
  const grid = findDeep(tree, 'status-pet-grid');
  assert.ok(grid, 'the board renders');
  assert.ok(!grid.props.style, 'the board itself carries no inline geometry');
  const rows = childList(grid);
  assert.equal(rows.length, BODY_GRID, 'one row per grid row');
  const cell = childList(rows[0])[0];
  assert.deepEqual(Object.keys(cell.props.style), ['background'],
    'a cell carries its colour and nothing else — the size comes from the board');
  clearStorage();
});

test('pixel studio: untouched rows are reused, and a reused row paints the LIVE artwork', () => {
  // The board is 16,384 cells at the 128px crop; a stroke changes exactly one
  // row.  Rebuilding every row per stroke is what made drag-painting crawl, so
  // the board caches each row's cells — and a cached row's handlers must still
  // reach the CURRENT artwork, never a stale closure.
  clearStorage();
  store.saveStored({ skin: 'custom', custom: customWithPalette() });
  store.refreshActiveSkin();
  const render = mountPlain(PixelEditor, { t: tKey, grid: AVATAR_GRID });
  const rows = () => childList(findDeep(render(), 'status-pet-grid'));

  const before = rows();
  const row1 = before[1];
  const row7 = before[7];
  childList(row1)[3].props.onPointerDown({ button: 0 });

  const after = rows();
  assert.equal(after[7], row7, 'an untouched row keeps its elements — React can skip the subtree');
  assert.notEqual(after[1], row1, 'the painted row is rebuilt with its new pixels');

  // Paint from the REUSED row: the handler goes through the board ref, so the
  // stroke lands on the current frame.
  childList(after[7])[5].props.onPointerDown({ button: 0 });
  const painted = () => idleRows(store.loadStored().custom!);
  assert.equal(store.pixelAt(painted()[1], 3), '01', 'the first stroke landed');
  assert.equal(store.pixelAt(painted()[7], 5), '01', 'the reused row painted the live artwork');
  assert.equal(store.loadStored().custom!.palette.length, 7, 'and reused the colour it already had');

  // A new colour grows the palette → the array identity changes → the cache is
  // dropped (a cell's background is the one thing a reused row cannot
  // re-check by itself).
  const beforeGrow = rows()[7];
  brushWells(render())[0].props.onChange({ target: { value: '#123456' } });
  childList(rows()[2])[2].props.onPointerDown({ button: 0 });
  assert.notEqual(rows()[7], beforeGrow, 'a new palette array drops the cached rows');
  assert.equal(childList(rows()[2])[2].props.style.background, '#123456',
    'the new colour reaches the board');
  clearStorage();
});

test('pixel studio: one labelled field per row, and the preview is not the frame inspector', () => {
  clearStorage();
  store.saveStored({ skin: 'custom', custom: store.seedArtworkFrom(store.DEFAULT_SKIN) });
  store.refreshActiveSkin();
  const tree = PixelEditor({ t: tKey, grid: BODY_GRID }) as unknown as El;

  const fields = findAllDeep(tree, 'status-pet-field');
  assert.deepEqual(fields.map((f: any) => textOf(childList(f)[0])), [
    'S:settings.region.action', 'S:settings.region.canvas', 'S:settings.region.palette',
    'S:settings.field.frames', 'S:settings.region.frame',
  ], 'every row is labelled, in reading order — and 按动作 mentions no state');
  for (const f of fields) {
    assert.ok(String(childList(f)[1].props.className).split(' ').includes('status-pet-field-body'),
      'each label is followed by that row\'s controls');
  }

  // The preview is the preview: no numbers live with it any more.
  const inspect = findDeep(tree, 'status-pet-inspect');
  assert.ok(inspect, 'the take preview has its own cell in the stage');
  assert.equal(inputsIn(inspect).length, 0, 'the preview column holds no inputs');
  // The selected frame's numbers live in the frame field, under the frames.
  const frameField = fields[fields.length - 1];
  const frameInputs = inputsIn(frameField);
  assert.deepEqual(frameInputs.map((i: any) => i.props['aria-label']),
    ['S:settings.frameLen', 'S:settings.actionMs'],
    'the frame field owns this frame\'s length AND the action\'s shared pace');
  assert.ok(findAllByLabel(frameField, 'S:settings.moveUp').length === 1,
    'and the 整幅挪动 pad sits with it');
  clearStorage();
});
