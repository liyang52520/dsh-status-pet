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
const { FrameCanvas } = await import('../src/ui/settings/frame-canvas.ts');
const { ActionCombo } = await import('../src/ui/settings/action-combo.ts');
const store = await import('../src/pet/skins/store.ts');
const { ARTWORK } = await import('../src/artwork.gen.ts');
store.installSkinArtwork(ARTWORK as never);
const SKINS = ARTWORK;
const { GRIDS, AVATAR_GRID, BODY_GRID, LIVE_ZOOM } = await import('../src/pet/grids.ts');
const { TUNING } = await import('../src/pet/behavior.ts');
const { CSS } = await import('../src/ui/styles.ts');

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
  // The peek is the SAME animation: it is pinned to the dock's derived state
  // (rather than idling by itself, which is what it used to do while the caption
  // named the real state) and it mirrors the dock's take and phase.
  assert.equal(bigPreview.props.state, 'idle', 'pinned to the state the dock is showing');
  assert.equal(bigPreview.props.follow, true, 'and coupled to the dock\'s take channel');
  assert.equal(panel.props.style.visibility, 'hidden', 'hidden until the position resolves');
  assert.equal(view.title, 'S:idle', 'the dock click does not pet — it only opens');
  view.click();
  assert.equal(render().popup, null, 'clicking again closes');
});

test('the popup follows the DERIVED state — a tool run reaches the peek, not just the caption', () => {
  // The dock derives `tool` from a dispatched call; the popup must be pinned to
  // that same state, or the caption and the artwork disagree (which is exactly
  // the bug this asserts against).
  // A dispatched call while the turn runs = `tool` (busy AND phase 'start').
  const render = mount({
    t: tKey,
    session: { running: true },
    chat: { runningCalls: [{ phase: 'start', name: 'bash' }] },
  });
  render().click();
  const tree = render();
  const panel = tree.popup.type(tree.popup.props);
  const preview = panel.children.find((c: any) => c && typeof c.type === 'function');
  assert.equal(panel.props['aria-label'], 'S:toolNamed', 'the caption names the running tool');
  assert.equal(preview.props.state, 'tool', 'and the big picture plays THAT state');
  assert.equal(preview.props.follow, true, 'from the dock\'s take channel');
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

/** Expand a component element in place.  This stub renders nothing by itself,
 *  so a component nested in a page's tree is an ELEMENT with props: calling it
 *  is how a page test reads that child's output and drives its handlers, and it
 *  starts at the page's own hook count, so the page's state is untouched (the
 *  same move DockPopup's tests make). */
const expand = (el: any) => el.type(el.props);
/** Buttons (deep) whose text CONTAINS a fragment — the ops carry glyph prefixes. */
const findAllByContainText = (el: any, frag: string, out: any[] = []): any[] => {
  if (!el || typeof el !== 'object') return out;
  if (el.props && textOf(el).includes(frag)) out.push(el);
  for (const c of childList(el)) findAllByContainText(c, frag, out);
  return out;
};

test('the Workshop: skin cards, ONE axis, and a LIGHT 状态 list beside the edit', () => {
  clearStorage();
  store.saveStored({ skin: store.DEFAULT_SKIN });
  store.refreshActiveSkin();
  const render = mountPlain(SettingsPage, { t: tKey });
  const tree = render();
  assert.ok(tree.children.some((c: any) => c && c.type === 'style'), 'the inline style element renders');
  assert.ok(tree.children.some((c: any) => c && c.type === SkinPicker), 'the skin picker renders');

  // ONE axis, and it is the whole navigation: no tab row, no 预览 / 编辑, and no
  // crop switch up here.
  const axis = findDeep(tree, 'status-pet-axis');
  assert.ok(axis, 'the page carries one axis');
  assert.deepEqual(childList(axis).map((b: any) => textOf(b)),
    ['S:settings.view.states', 'S:settings.view.actions'], '状态 / 动作');
  assert.equal(childList(axis)[0].props['aria-pressed'], 'true', '状态 opens first');
  assert.equal(findAllDeep(tree, 'status-pet-tab-list').length, 0, 'no tab row');
  assert.equal(findAllDeep(axis, 'status-pet-face-switch').length, 0, 'and no face switch on it');

  // 状态 is TWO columns: the eleven states on the left, the edit on the right.
  const cols = findDeep(tree, 'status-pet-columns');
  assert.ok(cols, 'the 状态 view is a two-column layout');
  assert.equal(childList(cols).length, 2, 'list + edit');
  const list = findDeep(tree, 'status-pet-state-list');
  const rows = () => findAllDeep(list, 'status-pet-state-row');
  assert.equal(rows().length, 11, 'nine states and two reactions');
  assert.deepEqual(findAllDeep(list, 'status-pet-list-caption').map((c: any) => textOf(c)),
    ['S:settings.master.states', 'S:settings.master.reactions'], 'grouped, reactions apart');
  // Eleven rows need no search: the only box on this screen belongs to the
  // LIBRARY (which is 106 entries).
  assert.equal(findAllDeep(list, 'status-pet-import-search').length, 0, 'the state list has no search');
  // A row is ONE line: the name, and what the state plays.  No picture — eleven
  // copies of the same face was the noise that made this list look dirty.
  assert.equal(findAllByText(rows()[0], 'S:idle').length, 1, 'a row names its state');
  assert.equal(childList(rows()[0]).length, 2, 'name + read-out, nothing else');
  assert.equal(findAllByType(rows()[0], FrameCanvas).length, 0, 'no avatar per row');
  assert.ok(textOf(rows()[0]).includes('S:settings.actionCount'), 'and how much it plays');
  assert.equal(rows()[0].props['aria-pressed'], 'true', 'the open state marks itself');

  // The right half is the assignment surface, already on the selected state.
  const assign = findAllByType(tree, StateAssignments)[0];
  assert.ok(assign, 'the assignment surface is the right half');
  assert.equal(assign.props.state, 'idle');
  assert.equal(assign.props.skin, 'whale-chan');
  assert.equal(findAllByType(tree, PixelEditor).length, 0, 'and the 状态 view holds no studio');
  const detail = () => expand(findAllByType(render(), StateAssignments)[0]);
  // The 106 actions are 106 different animations: a list of names is a list you
  // cannot read, so every row carries its own 1:1 thumbnail…
  const libRows = () => findAllDeep(detail(), 'status-pet-library-row');
  assert.ok(findAllByType(libRows()[0], FrameCanvas).length === 1, 'each row shows the action');
  // …and pointing at one plays it LIVE in the header, at the popup's size.
  assert.equal(findAllByType(findDeep(detail(), 'status-pet-edit-head'), PetPreview)[0].props.takeId,
    undefined, 'the header shows the STATE until you reach for an action');
  libRows()[0].props.onMouseEnter();
  const head2 = findDeep(detail(), 'status-pet-edit-head');
  const hovered = findAllByType(head2, PetPreview)[0];
  assert.equal(hovered.props.takeId, store.skinLibrary('whale-chan')[0].id,
    'hovering a row previews THAT action');
  assert.equal(hovered.props.zoom, LIVE_ZOOM, 'at the popup zooms size');
  assert.ok(textOf(head2).includes('S:settings.previewing'), 'and says which one it is playing');
  libRows()[0].props.onMouseLeave();
  assert.equal(findAllByType(findDeep(detail(), 'status-pet-edit-head'), PetPreview)[0].props.takeId,
    undefined, 'leaving the row goes back to the state');

  // Its header carries the state ONCE: name + meaning + a compact live picture.
  const head = findDeep(detail(), 'status-pet-edit-head');
  assert.ok(textOf(head).includes('S:idle'), 'the header names the state');
  assert.ok(textOf(head).includes('S:settings.hint.idle'), 'and says what it means');
  const pic = findAllByType(head, PetPreview)[0];
  assert.equal(pic.props.state, 'idle', 'with the state live');
  assert.equal(pic.props.grid, BODY_GRID, 'at the most detailed face there is');
  assert.equal(pic.props.zoom, LIVE_ZOOM, 'displayed at 64px of art');
  assert.equal(findDeep(detail(), 'status-pet-state-select'), null, 'and no second selector');

  // Clicking a row is the whole selection.
  rows().find((r: any) => textOf(r).startsWith('S:tool'))!.props.onClick();
  assert.equal(findAllByType(render(), StateAssignments)[0].props.state, 'tool',
    'the edit follows the row you picked');
  clearStorage();
});

test('the FACE switch lives on the studio canvas row — nowhere else', () => {
  clearStorage();
  store.saveStored({ skin: 'custom', custom: store.seedArtworkFrom(store.DEFAULT_SKIN) });
  store.refreshActiveSkin();
  const render = mountPlain(SettingsPage, { t: tKey });
  const goto = (i: number) => childList(findDeep(render(), 'status-pet-axis'))[i].props.onClick();
  // The studio is a child COMPONENT of the page (an element in this stub), so its
  // rows are read by expanding it.
  const fieldFor = (key: string) => findAllDeep(expand(findAllByType(render(), PixelEditor)[0]), 'status-pet-field')
    .find((f: any) => textOf(childList(f)[0]) === key)!;

  goto(1);
  assert.equal(findAllByType(render(), PixelEditor)[0].props.grid, AVATAR_GRID,
    '32 (the dock avatar) opens');
  const canvasField = () => fieldFor('S:settings.region.canvas');
  assert.equal(findAllDeep(canvasField(), 'status-pet-face-switch').length, 1,
    'the canvas row carries the switch');
  assert.equal(findAllDeep(findDeep(render(), 'status-pet-axis'), 'status-pet-face-switch').length, 0,
    'and the axis does not');
  // Pressing it moves the board: the page owns the value and hands it down.
  findAllByText(canvasField(), 'S:settings.grid.128')[0].props.onClick();
  assert.equal(findAllByType(render(), PixelEditor)[0].props.grid, BODY_GRID,
    'the board follows the switch');
  assert.equal(findAllByText(canvasField(), 'S:settings.grid.128')[0].props['aria-pressed'], 'true');
  // The 状态 view has no switch at all: its picture is simply the best face.
  goto(0);
  assert.equal(findAllDeep(render(), 'status-pet-face-switch').length, 0,
    'the 状态 view asks for no face');
  clearStorage();
});

test('the 状态 list badges each state with what it plays', () => {
  clearStorage();
  store.saveStored({ skin: store.DEFAULT_SKIN });
  store.refreshActiveSkin();
  const render = mountPlain(SettingsPage, { t: tKey });
  const metaOf = (tree: any, name: string) => {
    const row = findAllDeep(tree, 'status-pet-state-row').find((r: any) => textOf(r).startsWith(name))!;
    return textOf(findAllDeep(row, 'status-pet-state-meta')[0]);
  };
  assert.equal(metaOf(render(), 'S:idle'), 'S:settings.actionCount', 'a built-in assigns every state');
  assert.equal(metaOf(render(), 'S:tool'), 'S:settings.actionCount');

  // A hand-made artwork with only idle assigned shows the fallback on the rest.
  store.saveStored({ skin: 'custom', custom: customWithPalette() });
  store.refreshActiveSkin();
  const custom = mountPlain(SettingsPage, { t: tKey });
  assert.equal(metaOf(custom(), 'S:idle'), 'S:settings.actionCount', 'idle plays one action');
  assert.equal(metaOf(custom(), 'S:tool'), 'S:settings.followIdle',
    'a state nothing was ticked for says so');
  clearStorage();
});

test('the 动作 view: the studio at FULL width, with one searchable picker', () => {
  clearStorage();
  const doc: any = customWithPalette();
  doc.actions.push(actionOf2({ id: 'hop', name: 'hop act' }));
  store.saveStored({ skin: 'custom', custom: doc });
  store.refreshActiveSkin();
  const render = mountPlain(SettingsPage, { t: tKey });
  childList(findDeep(render(), 'status-pet-axis'))[1].props.onClick();

  const ed = () => findAllByType(render(), PixelEditor)[0];
  assert.equal(ed().props.actionId, 'idle-1', 'the studio opens on the first action');
  const studio = () => expand(ed());
  // ONE control searches, previews and selects — a dropdown, not a <select> and
  // not a list column beside the board.
  assert.equal(findDeep(walk(render).studio, 'status-pet-select'), null, 'the native dropdown is gone');
  const combo = () => walk(render).combo;
  const input = () => comboInput(render);
  assert.ok(input(), 'the picker is a combobox input');
  assert.equal(input().props.role, 'combobox');
  assert.equal(input().props.value, 'S:settings.actionN', 'closed, it reads out the action on the board');
  assert.equal(input().props['aria-expanded'], 'false');
  assert.equal(findDeep(combo(), 'status-pet-combo-pop'), null, 'and its list is closed');

  // Focus opens the library: every row is a thumbnail plus a read-out.
  const rows = () => findAllDeep(comboOpen(render), 'status-pet-row');
  assert.equal(rows().length, 2, 'every action is listed');
  assert.ok(childList(rows()[0]).some((c: any) => c && c.type === FrameCanvas), 'with a preview');
  assert.ok(textOf(rows()[1]).includes('S:settings.actionFrames'), 'and its read-out');

  // Typing filters; Enter takes the highlighted one; the board follows.
  input().props.onChange({ target: { value: 'hop' } });
  assert.equal(rows().length, 1, 'typing narrows the list');
  assert.ok(textOf(rows()[0]).includes('hop act'));
  input().props.onKeyDown({ key: 'Enter' });
  assert.equal(findAllByType(render(), PixelEditor)[0].props.actionId, 'hop', 'Enter picks it');
  assert.equal(findDeep(combo(), 'status-pet-combo-pop'), null, 'and the list closes');
  clearStorage();
});

test('the action picker’s footer is where the library is pruned', () => {
  clearStorage();
  const fixture: any = studioFixture();
  fixture.actions.push(actionOf2({ id: 'sleep-a', name: 'sleep act' }));
  store.saveStored({ skin: 'custom', custom: fixture });
  store.refreshActiveSkin();
  const render = mountPlain(SettingsPage, { t: tKey });
  childList(findDeep(render(), 'status-pet-axis'))[1].props.onClick();
  const studio = () => walk(render).studio;
  const combo = () => walk(render).combo;
  const input = () => comboInput(render);
  const ids = () => store.loadStored().custom!.actions.map((a) => a.id);
  const pop = () => comboOpen(render);
  assert.ok(pop(), 'focusing opens the list');
  findAllContaining(pop(), 'S:settings.manageActions')[0].props.onClick();
  assert.equal(findAllDeep(combo(), 'status-pet-row-check').length, 3,
    '批量删除 turns the same rows into checkboxes');
  // The search still scopes the selection.
  input().props.onChange({ target: { value: 'sleep' } });
  assert.equal(findAllDeep(combo(), 'status-pet-row-check').length, 1, 'the filter scopes the list');
  findAllContaining(pop(), 'S:settings.selectAll')[0].props.onClick();
  assert.ok(hintSays(pop(), 'S:settings.selectedCount'), 'the tick count is a read-out');
  findAllContaining(pop(), 'S:settings.deleteSelected')[0].props.onClick();
  assert.ok(findDeep(combo(), 'status-pet-confirm'), 'a removal asks first');
  assert.equal(ids().length, 3, 'and writes nothing until 删除');
  findAllContaining(combo(), 'S:settings.confirmDelete')[0].props.onClick();
  assert.deepEqual(ids(), ['idle-1', 'hop'], 'one write removed it');
  assert.deepEqual(store.validateArtwork(store.loadStored().custom!), [], 'the document stays valid');
  assert.ok(hintSays(studio(), 'S:settings.actionsRemoved'), 'and the studio says what happened');

  // A built-in cannot prune its library, so the entry is not there at all.
  clearStorage();
  store.saveStored({ skin: 'whale-chan' });
  store.refreshActiveSkin();
  const builtin = mountPlain(SettingsPage, { t: tKey });
  childList(findDeep(builtin(), 'status-pet-axis'))[1].props.onClick();
  assert.ok(comboOpen(builtin), 'the frozen view carries the same picker');
  assert.equal(findAllContaining(builtin(), 'S:settings.manageActions').length, 0,
    'a built-in cannot prune its library');
  clearStorage();
});

test('a built-in: the SAME two views, READ-ONLY — nothing writes and nothing forks', () => {
  clearStorage();
  store.saveStored({ skin: 'whale-chan' });
  store.refreshActiveSkin();
  const render = mountPlain(SettingsPage, { t: tKey });
  const assign = findAllByType(render(), StateAssignments)[0];
  assert.ok(assign, 'the assignment surface renders for a built-in');
  assert.equal(assign.props.skin, 'whale-chan', 'pinned to the built-in, not to 我的创作');
  assert.equal(assign.props.key, 'assign:whale-chan',
    'and keyed by skin, so swapping skins re-reads instead of writing across');

  // 动作 is the SAME studio as 我的创作 — same picker, same canvas, same rows —
  // with every WRITE gated off.  A separate read-only layout is how the two
  // views drifted apart, so the gate is on the controls.
  childList(findDeep(render(), 'status-pet-axis'))[1].props.onClick();
  const ed = findAllByType(render(), PixelEditor)[0];
  assert.ok(ed, 'a built-in gets the studio too');
  assert.equal(ed.props.grid, AVATAR_GRID, 'on the same default face');
  const studio = () => expand(findAllByType(render(), PixelEditor)[0]);
  assert.ok(findDeep(studio(), 'status-pet-grid'), 'with a real board');
  assert.ok(findDeep(expand(picker(studio())), 'status-pet-combo-input'), 'and the same picker');
  // …but NOTHING here writes: no action ops, no frame CRUD, no brush box, no
  // frame numbers.
  assert.equal(findAllByLabel(studio(), 'S:settings.newAction').length, 0, 'no 新建动作');
  assert.equal(findAllByContainText(studio(), 'S:settings.deleteAction').length, 0, 'no 删除动作');
  assert.equal(findAllDeep(studio(), 'status-pet-library-check').length, 0, 'and nothing to prune');
  assert.equal(findAllDeep(studio(), 'status-pet-swatch').length, 0, 'no paint box to paint with');
  assert.equal(findAllByContainText(studio(), 'S:settings.addFrame').length, 0, 'no 复制一帧');
  assert.equal(findAllByContainText(studio(), 'S:settings.delFrame').length, 0, 'no 删除帧');
  assert.ok(findDeep(studio(), 'status-pet-board-readonly'), 'and the board says it is a picture');

  // A click on the board is LOOKING, not drawing: it writes nothing, switches
  // no skin and — the whole point — copies NOTHING.  (It used to fork 15 MB into
  // 我的创作 on this click.)
  findDeep(studio(), 'status-pet-grid').children.flat()[1].children.flat()[3].props.onPointerDown();
  assert.equal(store.loadStored().skin, 'whale-chan', 'a stray click writes nothing');
  assert.equal(store.loadStored().custom, undefined, 'and copies nothing');
  // There is no fork button anywhere on the page, and no line announcing one.
  assert.equal(findAllByContainText(render(), 'S:settings.forkToCustom').length, 0,
    'no copy button — the door is the skin picker');
  assert.equal(findAllByContainText(render(), 'S:settings.seededNotice').length, 0, 'no fork notice');
  assert.equal(hintSays(render(), 'S:settings.builtinActionNote'), false, 'and no note about one');
  // The way to draw is to PICK 我的创作, which seeds itself from the active skin.
  assert.equal(findAllByType(render(), SkinPicker).length, 1, 'the skin cards are the one door');
  clearStorage();
});

test('no corner ✎ and no library column: a state is ticked, an action is picked', () => {
  clearStorage();
  store.saveStored({ skin: 'custom', custom: studioFixture() });
  store.refreshActiveSkin();
  const render = mountPlain(SettingsPage, { t: tKey });
  for (const dead of ['status-pet-gallery-edit', 'status-pet-library-edit', 'status-pet-master',
                      'status-pet-master-title', 'status-pet-detail-head']) {
    assert.equal(findAllDeep(render(), dead).length, 0, dead + ' is gone');
  }
  // The state's own door to the board is gone with them: 动作 has ONE way in —
  // its picker.
  const detail = expand(findAllByType(render(), StateAssignments)[0]);
  assert.equal(findAllDeep(detail, 'status-pet-library-edit').length, 0, 'no per-row door');
  assert.equal(findAllDeep(detail, 'status-pet-library-row').length, 2, 'the rows are tick targets');
  clearStorage();
});

test('the 状态 detail is the assignment surface: checkboxes, their groups and their ops', () => {
  clearStorage();
  store.saveStored({ skin: 'custom', custom: studioFixture() });
  store.refreshActiveSkin();
  const props: any = { t: tKey, skin: 'custom', grid: AVATAR_GRID, state: 'idle' };
  const render = mountPlain(StateAssignments, props);
  const rows = () => findAllDeep(render(), 'status-pet-library-row');
  const checks = () => rows().map((r: any) => inputsIn(r)[0]);
  // Rows are found by the ACTION's name, never by position: the list puts the
  // state's own ticks first, so an index is not an address any more.
  const rowFor = (name: string) => rows().find((r: any) => textOf(r).startsWith(name))!;
  const groups = () => findAllDeep(render(), 'status-pet-library-group').map((g: any) => textOf(g));

  // Two actions in the library; idle plays one of them, and tool plays neither.
  assert.equal(rows().length, 2, 'the list holds every action');
  // The state is the master list's selection, so this surface carries NO
  // selector of its own — a dropdown here named the same state a third time.
  assert.equal(findDeep(render(), 'status-pet-state-select'), null,
    'the detail has no state dropdown');
  assert.equal(inputsIn(rowFor('idle act'))[0].props.checked, true, 'idle starts ticked');
  // The tick is at the TOP, under a header, with the rest below it — the page
  // answers "what does this state do?" before it lists the material.
  assert.deepEqual(checks().map((c: any) => c.props.checked), [true, false],
    'the ticked action comes first');
  assert.deepEqual(groups(), ['S:settings.libraryTickedGroup', 'S:settings.libraryRestGroup'],
    'and the two halves are captioned');
  props.state = 'tool';
  assert.deepEqual(checks().map((c: any) => c.props.checked), [false, false],
    'the list shows this state\'s selection, not the library');
  assert.deepEqual(groups(), [], 'nothing ticked → one plain list, no headers');

  // Tick the second action: the state now plays exactly it, and it jumps to
  // the top of the list (the library order underneath never changes).
  inputsIn(rowFor('hop act'))[0].props.onChange({ target: { checked: true } });
  let saved = store.loadStored().custom!;
  assert.deepEqual(saved.states.tool, ['hop'], 'ticking adds the reference');
  assert.equal(textOf(rows()[0]).startsWith('hop act'), true, 'the ticked row is first');
  assert.equal(inputsIn(rowFor('hop act'))[0].props.checked, true, 'the row is ticked');
  assert.ok(textOf(rowFor('hop act')).includes('S:settings.usedByN'), 'and the row says who plays it');

  // 「全选」 takes the whole library; 「清空」 is exactly the idle fallback — and
  // those two ARE the ops row: a state IS its selection, so the old "copy this
  // state / paste" pair (which read as duplicating a state) is gone.
  // The ops ride the search line, with the tick count: one row of controls, and
  // never a wrapped second line.
  const ops = () => childList(findDeep(render(), 'status-pet-bulk-ops'))
    .filter(Boolean).map((b: any) => textOf(b))
    .filter((x: string) => String(x).startsWith('S:settings.selectAll') || String(x).startsWith('S:settings.clearSelection'));
  const capWarning = () => findAllDeep(render(), 'status-pet-full').length;
  assert.deepEqual(ops(), ['S:settings.selectAll', 'S:settings.clearSelection'],
    'a non-empty selection offers 全选 and 清空 — no copy, no paste');
  assert.equal(capWarning(), 0, 'and no tick count: the checkboxes already say it');
  findAllContaining(render(), 'S:settings.selectAll')[0].props.onClick();
  saved = store.loadStored().custom!;
  assert.deepEqual(saved.states.tool, ['idle-1', 'hop'], 'all means all');
  assert.deepEqual(checks().map((c: any) => c.props.checked), [true, true],
    'and everything is in the ticked half');
  assert.deepEqual(groups(), [],
    'the whole library ticked → still one plain list, just all of it');
  findAllContaining(render(), 'S:settings.clearSelection')[0].props.onClick();
  assert.deepEqual(ops(), ['S:settings.selectAll'],
    'and 清空 disappears on the empty selection it just produced');
  saved = store.loadStored().custom!;
  assert.equal(saved.states.tool, undefined,
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
// ── the stylesheet is a shipped artifact too ──
// Two of this page's rewrites silently LOST rules (a line-based cleanup removed
// a heading and left the body, and a later one dropped whole rules): the stage
// stopped being a grid, so its `@container` override had nothing to override and
// the preview could never sit beside the board.  Structure alone cannot catch
// that, so the CSS itself is asserted.

test('stylesheet: every rule is well formed and the stage can actually go two-column', () => {
  const css = CSS;
  assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length,
    'every block is closed');
  // A top-level fragment must be a selector (or an at-rule), never a stray
  // declaration list left behind by a removed header.
  for (const part of css.split('}')) {
    const head = part.split('{')[0].trim();
    if (!head || part.indexOf('{') === -1) continue;
    if (/^[a-z-]+\s*:/.test(head)) assert.fail('orphaned declarations: ' + head.slice(0, 40));
  }
  // The board and its preview are a GRID, and the two-column switch is a
  // CONTAINER query (the pane, not the viewport).
  assert.match(css, /\.status-pet-stage\{[^}]*display:grid/,
    'the stage owns its layout');
  assert.match(css, /@container \(min-width:380px\)\{\.status-pet-stage\{grid-template-columns:[^}]*auto/,
    'and goes two-column from 380px of pane up — the preview is small enough that\n    the pair makes ONE row at every real pane width');
  // The preview is a picture, not a control: no caption, no link, no numbers.
  assert.equal(css.includes('.status-pet-stage-caption'), false, 'the caption rule is gone');
  // 106 library rows are a SCROLL REGION, not an endless column: without the cap
  // the assignment card grew several screens tall (the reported bug) and the rows
  // below the fold were unreachable without scrolling the whole dialog.
  assert.match(css, /\.status-pet-library\{[^}]*max-height[^}]*overflow:auto/,
    'the action library scrolls instead of stretching the card');
  // The classes the components rely on for placement.
  for (const cls of ['.status-pet-field-wide{', '.status-pet-library-group{', '.status-pet-stage-cell{']) {
    assert.ok(css.includes(cls), cls + ' has a rule');
  }
});

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
// The 状态 detail has NO selector of its own any more (the master list owns the
// selection); this helper is what asserts its absence.
const stateSelect = (tree: any) => findDeep(tree, 'status-pet-state-select');
// The studio's action picker is ActionCombo: `picker()` is its element (its
// props carry the whole library and the selected id) and `pickBy` is what
// clicking a row does.  The open list is covered by the page-level test, in a
// real page.
const picker = (tree: any) => findAllByType(tree, ActionCombo)[0] || null;
const pickValue = (tree: any) => { const p = picker(tree); return p ? p.props.value : null; };
const pickBy = (tree: any, id: string) => { const p = picker(tree); p.props.onSelect(id); };
/** Walk a render function down to the studio and its picker, expanding each
 *  child at the SAME hook base every call so their own state persists (a page
 *  test's `owner` is the page render; a studio test's is the studio render). */
const walk = (owner: () => any) => {
  const tree = owner();
  const px = findAllByType(tree, PixelEditor)[0];
  const studio = px ? expand(px) : tree;
  const cb = findAllByType(studio, ActionCombo)[0];
  return { studio, combo: cb ? expand(cb) : null };
};
const comboInput = (owner: () => any) => {
  const c = walk(owner).combo;
  return c ? findDeep(c, 'status-pet-combo-input') : null;
};
/** Focus the picker and return its popup — the list exists on the render AFTER
 *  focus, so the chain is walked again. */
const comboOpen = (owner: () => any) => {
  const input = comboInput(owner);
  if (!input) return null;
  input.props.onFocus();
  const c = walk(owner).combo;
  return c ? findAllDeep(c, 'status-pet-combo-pop')[0] || null : null;
};

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
const face = (grid: number = AVATAR_GRID) => ({ rows: store.blankRows(grid) });
const frameOf = (o: { rows?: string[]; body?: boolean; dy?: number; dx?: number; ms?: number } = {}): any => {
  const cells: Record<number, unknown> = { [AVATAR_GRID]: { rows: o.rows || store.blankRows(AVATAR_GRID) } };
  if (o.body) cells[BODY_GRID] = face(BODY_GRID);
  const f: Record<string, unknown> = { cells };
  if (o.dy !== undefined) f.dy = o.dy;
  if (o.dx !== undefined) f.dx = o.dx;
  if (o.ms !== undefined) f.ms = o.ms;
  return f;
};
const actionOf2 = (o: { id: string; name?: string; frameMs?: number; frames?: unknown[] }): any => {
  const a: Record<string, unknown> = { id: o.id, frameMs: o.frameMs ?? 400, frames: o.frames || [frameOf()] };
  if (o.name) a.name = o.name;
  return a;
};

const customWithPalette = () => ({
  palette: SKINS['whale-chan'].palette.slice(0, 7),   // transparency + 6 colours
  actions: [actionOf2({ id: 'idle-1' })],
  states: { idle: ['idle-1'] },
});

// The library model's two addressing helpers: an ACTION is found by id, and a
// state's animation is whatever its ids resolve to.
const actionOf = (art: any, id: string) => art.actions.find((a: any) => a.id === id);
const idleAction = (art: any) => actionOf(art, art.states.idle[0]);
/** The rows of one FACE of one frame of the action the idle state plays. */
const idleRows = (art: any, frame = 0, grid: number = AVATAR_GRID) =>
  store.cellFor(idleAction(art).frames[frame], grid).rows;

// Two named actions on the avatar grid: idle plays the first, the second is
// free — the shape almost every studio test below wants.
const studioFixture = () => ({
  palette: SKINS['whale-chan'].palette.slice(0, 7),
  actions: [
    actionOf2({ id: 'idle-1', name: 'idle act' }),
    actionOf2({ id: 'hop', name: 'hop act' }),
  ],
  states: { idle: ['idle-1'] },
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

test('pixel studio: a built-in only LOOKS — no stroke, no fork, no copy', () => {
  clearStorage();
  store.saveStored({ skin: store.DEFAULT_SKIN });
  store.refreshActiveSkin();
  const render = mountPlain(PixelEditor, { t: tKey });
  const findGrid = (v: El) => findDeep(v, 'status-pet-grid');
  const grid = findGrid(render());
  const rows = grid.children.flat();
  assert.equal(rows.length, AVATAR_GRID, 'the board draws the FULL grid — the expression rows are visible');
  assert.equal(rows[0].children.flat().length, AVATAR_GRID);
  // A bare click on a built-in's board is LOOKING, not drawing: nothing is
  // written, nothing is copied, and the active skin does not move.  (This click
  // used to copy 15 MB into 我的创作 and switch the skin underneath the user.)
  rows[4].children.flat()[4].props.onPointerDown();
  rows[4].children.flat()[4].props.onPointerEnter({ buttons: 1 });
  assert.equal(store.loadStored().skin, store.DEFAULT_SKIN, 'a stray click does not switch skins');
  assert.equal(store.loadStored().custom, undefined, 'and copies nothing');

  // There is no fork button and no announcement of one: the studio is a viewer,
  // and the door to drawing is the skin picker's 我的创作 card.
  assert.equal(findAllByContainText(render(), 'S:settings.forkToCustom').length, 0, 'no copy button');
  assert.equal(findAllByContainText(render(), 'S:settings.seededNotice').length, 0, 'no copy notice');
  // The controls that would write are absent, not merely inert.
  assert.equal(findAllDeep(render(), 'status-pet-swatch').length, 0, 'no brushes');
  assert.equal(findAllByContainText(render(), 'S:settings.addFrame').length, 0, 'no frame ops');
  assert.ok(findDeep(render(), 'status-pet-board-readonly'), 'the board is a picture');

  // Painting still works the moment the document is the user's: the SAME board
  // on a custom skin paints freely, one cell at a time.
  clearStorage();
  store.saveStored({ skin: 'custom', custom: store.seedArtworkFrom(store.DEFAULT_SKIN) });
  store.refreshActiveSkin();
  const mine = mountPlain(PixelEditor, { t: tKey });
  const drawn = () => idleRows(store.loadStored().custom!);
  const seeded = idleRows(store.seedArtworkFrom(store.DEFAULT_SKIN));
  findGrid(mine()).children.flat()[4].children.flat()[4].props.onPointerDown();
  assert.equal(store.pixelAt(drawn()[4], 4), '01', 'the stroke landed');
  for (let x = 0; x < AVATAR_GRID; x++) {
    if (x === 4) continue;
    assert.equal(store.pixelAt(drawn()[4], x), store.pixelAt(seeded[4], x),
      `column ${x} is untouched — the studio does not mirror strokes`);
  }
  const before = drawn()[7];
  findGrid(mine()).children.flat()[7].children.flat()[5].props.onPointerEnter({ buttons: 0 });
  assert.equal(idleRows(store.loadStored().custom!)[7], before,
    'hover without a button paints nothing');
  findGrid(mine()).children.flat()[7].children.flat()[5].props.onPointerEnter({ buttons: 1 });
  assert.notEqual(idleRows(store.loadStored().custom!)[7], before,
    'dragging with a button paints');
  clearStorage();
});

test('pixel studio: an imported accent can be seen and removed, not silently stuck', () => {
  clearStorage();
  const art = customWithPalette() as any;
  art.actions[0].frames[0].cells[AVATAR_GRID].prop = { x: 1, y: 1, rows: ['01', '01'] };
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
  store.saveStored({ skin: 'custom', custom: studioFixture() });
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

test('pixel studio: follows the active skin, and never copies it by itself', () => {
  clearStorage();
  store.saveStored({ skin: 'whale-chan' });
  store.refreshActiveSkin();
  const render = mountPlain(PixelEditor, { t: tKey });
  // One dropdown names every ACTION — the whole baked library, with its length
  // and who plays it.  It never mentions a state: that is 按状态's dropdown.
  assert.equal(picker(render()).props.library.length, 106, 'the picker carries every library action');
  assert.ok(picker(render()).props.library.every((a: any) => a.frames > 0 && a.bodyFrames > 0),
    'with its frames and its body face');
  assert.equal(pickValue(render()), store.skinLibrary('whale-chan')[0].id,
    'the board starts on the library\'s first action');
  // Looking at a built-in — even clicking its board — copies nothing: the whole
  // 15 MB bake lands in 我的创作 only when the user picks that skin (see the
  // skin-picker test), never as a side effect of browsing.
  findDeep(render(), 'status-pet-grid').children.flat()[1].children.flat()[3].props.onPointerDown();
  assert.equal(store.loadStored().skin, 'whale-chan', 'still the built-in');
  assert.equal(store.loadStored().custom, undefined, 'and nothing was copied');
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
  assert.deepEqual(picker(render()).props.library.map((a: any) => a.name),
    ['idle act', 'hop act'], 'the picker carries every action, by name');
  assert.equal(pickValue(render()), 'idle-1', 'the board starts on the first action');
  pickBy(render(), 'hop');
  assert.equal(pickValue(render()), 'hop', 'choosing an action moves the board to it');

  // And the stroke lands on THAT action — idle's art is untouched.
  cell(2, 2).props.onPointerDown();
  const saved = store.loadStored().custom!;
  assert.equal(store.pixelAt(store.cellFor(actionOf(saved, 'hop').frames[0], AVATAR_GRID).rows[2], 2), '01',
    'the stroke went to the action the dropdown names');
  assert.equal(store.pixelAt(idleRows(saved)[2], 2), store.TRANSPARENT,
    'and not to the one it was on before');
  clearStorage();
});

test('pixel studio: the board opens on the action the page handed over', () => {
  // `actionId` is how the page's 动作 master list hands an action over; the
  // studio honours it on mount, and with no target it resumes the session (the
  // document has not changed, so neither has where you were).
  clearStorage();
  store.saveStored({ skin: 'custom', custom: studioFixture() });
  store.refreshActiveSkin();
  const plain = mountPlain(PixelEditor, { t: tKey });
  assert.equal(pickValue(plain()), 'idle-1', 'no target: the first action');
  const jumped = mountPlain(PixelEditor, { t: tKey, actionId: 'hop' });
  assert.equal(pickValue(jumped()), 'hop', 'a target: that action');
  // A STALE target (an action that is gone) must never blank the board.  It
  // lands on the last real action of this document, which is a better answer
  // than the library's first: it does not throw away your place.
  const stale = mountPlain(PixelEditor, { t: tKey, actionId: 'no-such-action' });
  assert.equal(pickValue(stale()), 'hop', 'a stale target keeps the last real action');
  // A different document has no session at all, so there the fallback IS the
  // first action.
  clearStorage();
  store.saveStored({ skin: 'custom', custom: studioFixture() });
  store.refreshActiveSkin();
  const fresh = mountPlain(PixelEditor, { t: tKey, actionId: 'no-such-action' });
  assert.equal(pickValue(fresh()), 'idle-1', 'a fresh document starts on its first action');
  clearStorage();
});

test('pixel studio: the session survives a remount — the action and frame are kept', () => {
  // The page swaps the studio for the 状态 view, and that must not send you back
  // to the first frame of the library.  The session lives in a module keyed by
  // the ARTWORK IDENTITY, so a remount of the same document resumes exactly
  // where you were.
  clearStorage();
  store.saveStored({ skin: 'custom', custom: customWithPalette() });
  store.refreshActiveSkin();
  // The filmstrip's thumbs are the studio's own children (a nested component is
  // an unreduced element here), so their `active` prop IS the selection.
  const activeThumbs = (tree: any) =>
    childList(findDeep(tree, 'status-pet-filmstrip'))
      .filter((el: any) => el && el.props && 'active' in el.props)
      .map((el: any) => el.props.active);

  const first = mountPlain(PixelEditor, { t: tKey });
  findAllByLabel(first(), 'S:settings.addFrame')[0].props.onClick();
  assert.deepEqual(activeThumbs(first()), [false, true], 'the copy is the frame on the board');

  // …the page switches to 状态 and back: a NEW mount of the same document.
  const second = mountPlain(PixelEditor, { t: tKey });
  assert.deepEqual(activeThumbs(second()), [false, true],
    'the frame you were on is still the selected one');
  // A fresh document opens at the start: the old position describes artwork
  // nobody has.
  clearStorage();
  store.saveStored({ skin: 'custom', custom: customWithPalette() });
  store.refreshActiveSkin();
  const third = mountPlain(PixelEditor, { t: tKey });
  assert.deepEqual(activeThumbs(third()), [true],
    'a fresh document opens on its first frame');
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
  const props: any = { t: tKey, skin: 'whale-chan', grid: AVATAR_GRID, state: 'idle' };
  const render = mountPlain(StateAssignments, props);
  const lib = store.skinLibrary('whale-chan');
  // Looked up by NAME, not by position: the list shows this state's own ticks
  // first, so an index into the library is no longer an index into the rows.
  const rowFor = (id: string) =>
    findAllDeep(render(), 'status-pet-library-row')
      .find((r: any) => textOf(r).startsWith(lib.find((a) => a.id === id)!.name!))!;
  const authored = store.skinArtwork('whale-chan')!.states;
  const authoredTool = authored.tool!.length;

  // The authored assignment is what the list shows first.
  props.state = 'tool';
  assert.equal(inputsIn(rowFor('xie-daima'))[0].props.checked, true, 'a tick the artwork assigned is on');
  assert.equal(inputsIn(rowFor('chi-niangao'))[0].props.checked, false, 'an unassigned one is off');

  // Tick it: one diff entry, no fork, and every reader follows.
  inputsIn(rowFor('chi-niangao'))[0].props.onChange({ target: { checked: true } });
  const saved: any = store.loadStored();
  assert.equal(saved.skin, 'whale-chan', 'the active skin is still the built-in');
  assert.equal(saved.custom, undefined, 'nothing forked into 我的创作');
  assert.deepEqual(Object.keys(saved.builtinStates!['whale-chan']), ['tool'],
    'one flat diff, and only the state that changed');
  assert.deepEqual(saved.builtinStates!['whale-chan'].tool.slice(-1), ['chi-niangao']);
  assert.equal(store.activeSkin().states.tool.takes.length, authoredTool + 1,
    'ACTIVE (dock/popup) picked it up');
  assert.equal(store.resolveNamedSkin('whale-chan', AVATAR_GRID)!.states.tool.takes.length, authoredTool + 1,
    'and so did the named resolution 预览 uses');
  assert.ok(store.skinLibrary('whale-chan').find((a) => a.id === 'chi-niangao')!
    .usedBy.includes('tool'), 'the library read-out says who plays it now');
  assert.ok(store.seedArtworkFrom('whale-chan').states.tool!.includes('chi-niangao'),
    'and 我的创作 would start from what the user sees');

  // Emptying a state is stored as such: it deliberately follows idle instead of
  // falling back to the authored assignment.
  for (const id of [...authored.tool!, 'chi-niangao']) {
    inputsIn(rowFor(id))[0].props.onChange({ target: { checked: false } });
  }
  assert.deepEqual((store.loadStored() as any).builtinStates['whale-chan'].tool, [],
    'an explicitly emptied state is stored empty');
  const skin = store.resolveNamedSkin('whale-chan', AVATAR_GRID)!;
  assert.equal(skin.states.tool, skin.states.idle, 'and it resolves to idle');

  // A stale id can never blank the pet: it is dropped on the way in.
  store.saveStored({ builtinStates: { 'whale-chan': { tool: ['no-such-action'] } } });
  const stale = store.resolveNamedSkin('whale-chan', AVATAR_GRID)!;
  assert.equal(stale.states.tool, stale.states.idle, 'an unknown id is dropped, not rendered');
  assert.equal(stale.states.idle.takes.length, authored.idle!.length, 'while idle is untouched');
  clearStorage();
});

test('assignments: 清空 works on EVERY state — 空闲 keeps one, because it is the anchor', () => {
  clearStorage();
  store.saveStored({ skin: 'custom', custom: studioFixture() });
  store.refreshActiveSkin();
  const props: any = { t: tKey, skin: 'custom', grid: AVATAR_GRID, state: 'idle' };
  const render = mountPlain(StateAssignments, props);
  const clear = () => findAllByText(render(), 'S:settings.clearSelection')[0];
  const idle = () => store.loadStored().custom!.states.idle;

  // 空闲's rule is NOT printed on the page — it is asked for when you press
  // 清空, which is the only moment it matters.
  assert.equal(findAllDeep(render(), 'status-pet-confirm').length, 0,
    'no rule paragraph, and no dialog before you ask');

  // 全选 then 清空 is the bulk round trip that used to DEAD-END on 空闲: the
  // ticks went on and nothing could take them off again.
  findAllContaining(render(), 'S:settings.selectAll')[0].props.onClick();
  assert.deepEqual(idle(), ['idle-1', 'hop'], '全选 ticks the whole library');
  clear().props.onClick();
  assert.ok(findDeep(render(), 'status-pet-confirm'), '清空 on 空闲 asks first');
  assert.deepEqual(idle(), ['idle-1', 'hop'], 'and nothing is written yet');
  assert.ok(hintSays(render(), 'S:settings.clearIdleHint'), 'the dialog carries the rule');
  findAllContaining(render(), 'S:settings.cancel')[0].props.onClick();
  assert.equal(findAllDeep(render(), 'status-pet-confirm').length, 0, 'Cancel closes it');
  assert.deepEqual(idle(), ['idle-1', 'hop'], 'still nothing written');
  clear().props.onClick();
  findAllContaining(findDeep(render(), 'status-pet-confirm'), 'S:settings.clearSelection')[0]
    .props.onClick();
  assert.deepEqual(idle(), ['idle-1'], '清空 clears 空闲 down to ONE — never to nothing');
  assert.deepEqual(store.validateArtwork(store.loadStored().custom!), [],
    'so the document still validates and the pet keeps drawing');

  // Every other state empties COMPLETELY: an empty selection IS the idle
  // fallback, and that is the one representation of "unset".
  props.state = 'tool';
  assert.equal(findAllDeep(render(), 'status-pet-confirm').length, 0,
    'the dialog belongs to 空闲 alone');
  inputsIn(findAllDeep(render(), 'status-pet-library-row')[1])[0]
    .props.onChange({ target: { checked: true } });
  clear().props.onClick();
  assert.equal(findAllDeep(render(), 'status-pet-confirm').length, 0,
    'every other state clears at once — nothing to explain');
  assert.equal(store.loadStored().custom!.states.tool, undefined,
    'a non-idle state clears to empty — the state follows idle');
  clearStorage();
});

test('assignments: the search box narrows the list, and 全选 only ticks what is listed', () => {
  clearStorage();
  store.saveStored({ skin: 'custom', custom: studioFixture() });
  store.refreshActiveSkin();
  const props: any = { t: tKey, skin: 'custom', grid: AVATAR_GRID, state: 'tool' };
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
  assert.equal(findAllDeep(render(), 'status-pet-full').length, 0,
    'no tick count while the cap is not in play');

  // 全选 is AIMED: it ticks what the filter listed, on top of what the state
  // already plays — replacing would silently drop ticks the filter hides.
  findAllContaining(render(), 'S:settings.selectAll')[0].props.onClick();
  assert.deepEqual(store.loadStored().custom!.states.tool, ['hop'],
    'only the listed action was ticked');

  search().props.onChange({ target: { value: '' } });
  findAllContaining(render(), 'S:settings.selectAll')[0].props.onClick();
  assert.deepEqual(store.loadStored().custom!.states.tool, ['idle-1', 'hop'],
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
  const aProps: any = { t: tKey, skin: 'custom', grid: AVATAR_GRID, state: 'idle' };
  const assign = mountPlain(StateAssignments, aProps);
  const rows = () => findAllDeep(assign(), 'status-pet-library-row');
  aProps.state = 'tool';
  inputsIn(rows()[1])[0].props.onChange({ target: { checked: true } });
  aProps.state = 'done';
  inputsIn(rows()[1])[0].props.onChange({ target: { checked: true } });
  let saved = store.loadStored().custom!;
  assert.deepEqual(store.usedBy(saved, 'hop').sort(), ['done', 'tool']);
  assert.ok(textOf(rows()[1]).includes('S:settings.usedByN'), 'the row says how many states play it');

  // Paint one pixel of that same action (the drawing half): BOTH states move.
  const before = store.resolveSkin(store.loadStored());
  const studio = mountPlain(PixelEditor, { t: tKey, actionId: 'hop' });
  const shared = findAllDeep(comboOpen(studio), 'status-pet-row')
    .find((r: any) => textOf(r).startsWith('hop act'))!;
  assert.ok(textOf(shared).includes('S:settings.usedByN'),
    'the picker warns that the action is shared');
  findDeep(studio(), 'status-pet-grid').children.flat()[2].children.flat()[2].props.onPointerDown();
  saved = store.loadStored().custom!;
  assert.equal(store.pixelAt(idleRows(saved)[2], 2), store.TRANSPARENT,
    'idle\'s own action is untouched — the stroke went to the shared one');
  assert.equal(store.pixelAt(store.cellFor(actionOf(saved, 'hop').frames[0], AVATAR_GRID).rows[2], 2), '01',
    'the shared action took the stroke');
  const after = store.resolveSkin(store.loadStored());
  assert.notEqual(after.states.tool, before.states.tool, 'tool re-resolved to the edited action');
  assert.equal(after.states.done, after.states.tool,
    'and done shares that very resolution — they play the same object');
  clearStorage();
});

test('pixel studio: 新建动作 / 删除动作, and delete refuses to strand idle', () => {
  // The 动作 row is the picker plus two verbs — 新建 and 删除 — and the action's
  // name on the row under it.  There is deliberately no 复制动作: the library
  // stays a small set of slots you curate.
  clearStorage();
  store.saveStored({ skin: 'custom', custom: studioFixture() });
  store.refreshActiveSkin();
  const render = mountPlain(PixelEditor, { t: tKey });
  const size = () => store.loadStored().custom!.actions.length;
  const del = () => findAllByLabel(render(), 'S:settings.deleteAction')[0];

  // The selected action is the only one idle plays: deleting it would leave
  // the required idle assignment empty, so the button is off.
  assert.equal(size(), 2);
  assert.equal(pickValue(render()), 'idle-1', 'the first action is selected by default');
  assert.equal(picker(render()).props.library.length, 2, 'the picker offers both actions');
  assert.equal(findAllContaining(render(), 'S:settings.duplicateAction').length, 0,
    'no 复制动作 anywhere');
  assert.equal(del().props.disabled, true, 'deleting idle\'s only action is refused');

  // A new action is minted even though a blank one is already in the library:
  // sharing it silently would make the button look broken.
  findAllByLabel(render(), 'S:settings.newAction')[0].props.onClick();
  assert.equal(size(), 3, '新建动作 always mints an action');
  assert.equal(pickValue(render()),
    store.loadStored().custom!.actions[2].id,
    'and puts it on the board');

  assert.equal(del().props.disabled, false, 'once it is not idle\'s only action, delete is available');
  del().props.onClick();
  assert.equal(size(), 2, 'the selected action is gone');
  assert.deepEqual(store.validateArtwork(store.loadStored().custom!), [], 'and the artwork is still valid');
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
  assert.ok(gen.length > 0, 'the draft generator is offered while the body face is empty');
  assert.ok(findAllByText(render(), 'S:settings.genBodyAll').length > 0,
    'and the same draft is offered for every action at once');
  assert.equal(store.hasBody(store.loadStored().custom!), false, 'the artwork starts body-less');
  gen[0].props.onClick();
  const saved = store.loadStored().custom!;
  assert.ok(store.hasActionBody(actionOf(saved, 'idle-1')), 'the selected action got its 128 face');
  assert.equal(store.hasActionBody(actionOf(saved, 'hop')), false,
    'and the action nobody asked about is untouched — the body is per action');
  const hdIdle = idleRows(saved, 0, BODY_GRID);
  assert.ok(hdIdle.length === BODY_GRID && hdIdle.every((r: string) => store.rowPixels(r) === BODY_GRID),
    'the draft is a full 128px frame');
  assert.equal(store.resolveNamedSkin('custom', BODY_GRID)!.grid, BODY_GRID, 'the body face resolves now');
  assert.equal(findDeep(render(), 'status-pet-grid').children.flat().length, BODY_GRID, 'the board shows 128 rows');
  // The 4× relationship IS the draft: every draft pixel is the avatar's, doubled
  // twice — that is why a missing body can be shown at all.
  const avatarRows = idleRows(saved, 0, AVATAR_GRID);
  assert.equal(hdIdle[0], avatarRows[0].replace(/(..)/g, '$1$1$1$1'), 'the draft is the avatar at 4×');
  // 为所有动作生成草稿 fills the rest in, without touching what already exists.
  // It lives on the empty-state card, which is per action — so it is reachable
  // again by selecting an action that still has no body face.
  pickBy(render(), 'hop');
  findAllByText(render(), 'S:settings.genBodyAll')[0].props.onClick();
  const all = store.loadStored().custom!;
  assert.ok(all.actions.every((a: any) => store.hasActionBody(a)), 'every action has a body face now');
  assert.deepEqual(store.validateArtwork(all), [], 'and the document is still valid');
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
  // 动作 → 画布 → 帧 → 画笔 → 当前帧: the frame strip sits directly under the board
  // it selects ("draw a frame, duplicate it, nudge it"), and the frame's own
  // numbers come last.  Every row is labelled, and the studio mentions no state
  // (that is the OTHER object's business).
  assert.deepEqual(fields.map((f: any) => textOf(childList(f)[0])), [
    'S:settings.region.action', 'S:settings.region.canvas', 'S:settings.field.frames',
    'S:settings.region.palette', 'S:settings.region.frame',
  ], 'every row is labelled, in reading order');
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

test('pixel studio: 动作 is two explicit rows, and 整幅挪动 is a labelled row', () => {
  // The reported mess: five controls of three kinds wrapped wherever they fit in
  // one row, and the nudge pad floated under the frame's numbers.  Both fixes
  // are structural, so they are asserted structurally.
  clearStorage();
  store.saveStored({ skin: 'custom', custom: studioFixture() });
  store.refreshActiveSkin();
  const render = mountPlain(PixelEditor, { t: tKey });
  const tree = render();

  // 动作: the picker has the first line to itself; the action's NAME and the two
  // library verbs — 新建动作 / 删除动作 — share the second.  No 导入动作, no
  // 移除 128 面.
  const actionRows = findAllDeep(tree, 'status-pet-action-row');
  assert.equal(actionRows.length, 2, 'the 动作 row is two explicit lines');
  assert.equal(findAllByType(actionRows[0], ActionCombo).length, 1, 'the picker has the first line');
  assert.equal(findAllByLabel(actionRows[0], 'S:settings.newAction').length, 0, 'and nothing else on it');
  assert.equal(findAllByLabel(actionRows[0], 'S:settings.deleteAction').length, 0);
  assert.equal(findAllByLabel(actionRows[1], 'S:settings.actionName').length, 1, 'the name leads the second');
  assert.equal(findAllByLabel(actionRows[1], 'S:settings.newAction').length, 1, '新建动作 is beside it');
  assert.equal(findAllByLabel(actionRows[1], 'S:settings.deleteAction').length, 1, 'and 删除动作');
  assert.equal(findAllByContainText(tree, 'S:settings.importAction').length, 0, 'no 导入动作');
  assert.equal(findAllByContainText(tree, 'S:settings.removeBody').length, 0, 'no 移除 128 面');

  // 当前帧: 整幅挪动's label and its pad live in ONE row, so the three rows of
  // the field line up instead of the pad hanging under the numbers.
  const offset = findDeep(tree, 'status-pet-offset-row');
  assert.ok(offset, '整幅挪动 is its own labelled row');
  assert.match(textOf(offset), /S:settings\.frameOffset/);
  assert.equal(findAllByLabel(offset, 'S:settings.moveUp').length, 1, 'with the pad inside it');
  assert.equal(findAllByLabel(offset, 'S:settings.moveLeft').length, 1);

  // The frame ops are ONE group riding the filmstrip row — 复制一帧 / 空白帧, and
  // 删除此帧 as soon as there is a frame to delete.  No row of its own.
  const ops = () => findDeep(render(), 'status-pet-frame-ops');
  assert.ok(ops(), 'the ops ride the filmstrip');
  assert.equal(findAllByLabel(ops(), 'S:settings.addFrame').length, 1, '复制一帧');
  assert.equal(findAllByLabel(ops(), 'S:settings.addBlankFrame').length, 1, '空白帧');
  assert.equal(findAllContaining(ops(), 'S:settings.delFrame').length, 0,
    'one frame: there is nothing to delete');
  assert.equal(findAllDeep(render(), 'status-pet-frame-nav').length, 0,
    'and no second row for the frame list');
  findAllByLabel(tree, 'S:settings.addFrame')[0].props.onClick();
  assert.equal(findAllContaining(ops(), 'S:settings.delFrame').length, 1,
    '删除此帧 joins them on the same row');
  assert.equal(findAllDeep(render(), 'status-pet-frame-nav').length, 0, 'still no row of its own');
  assert.equal(findAllDeep(render(), 'status-pet-footer').length, 0, 'no undo/redo footer');
  assert.equal(findAllByLabel(render(), 'S:settings.io').length, 0, 'no JSON fold');
  clearStorage();
});
