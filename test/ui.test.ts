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
const { StateAssignments } = await import('../src/ui/settings/assignments.ts');
const { FrameCanvas } = await import('../src/ui/settings/frame-canvas.ts');
const { ActionViewer } = await import('../src/ui/settings/action-viewer.ts');
const { ActionThumb } = await import('../src/ui/settings/action-thumb.ts');
const { ActionCombo } = await import('../src/ui/settings/action-combo.ts');
const store = await import('../src/pet/skins/store.ts');
const { ARTWORK } = await import('../src/artwork.gen.ts');
store.installSkinArtwork(ARTWORK as never);
const SKINS = ARTWORK;
const SKIN = store.DEFAULT_SKIN;
const { GRIDS, AVATAR_GRID, BODY_GRID, LIVE_ZOOM } = await import('../src/pet/grids.ts');
const { TUNING } = await import('../src/pet/behavior.ts');
const { CSS } = await import('../src/ui/styles.ts');

// Back to an empty store: the document is written through, so clearing storage
// and re-resolving is all it takes.
const clearStorage = () => {
  storeMem.clear();
  store.loadStored();
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
test('the Workshop: skin cards and a LIGHT 状态 list beside the edit', () => {
  clearStorage();
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
  // 状态 is the list + its edit; the 动作 view is a different half of the page.
  assert.equal(findAllByType(tree, ActionViewer).length, 0, 'and no viewer in this half');

  // 状态 is TWO columns: the eleven states on the left, the edit on the right.
  const cols = findDeep(tree, 'status-pet-columns');
  assert.ok(cols, 'the page is a two-column layout');
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
  assert.equal(findAllByType(rows()[0], ActionThumb).length, 0, 'no avatar per row');
  assert.equal(findAllByType(rows()[0], FrameCanvas).length, 0, 'and no still either');
  assert.ok(textOf(rows()[0]).includes('S:settings.actionCount'), 'and how much it plays');
  assert.equal(rows()[0].props['aria-pressed'], 'true', 'the open state marks itself');

  // The right half is the assignment surface, already on the selected state.
  const assign = findAllByType(tree, StateAssignments)[0];
  assert.ok(assign, 'the assignment surface is the right half');
  assert.equal(assign.props.state, 'idle');
  assert.equal(assign.props.skin, SKIN);
  const detail = () => expand(findAllByType(render(), StateAssignments)[0]);
  // The 106 actions are 106 different animations: a list of names is a list you
  // cannot read, so every row carries its own 1:1 thumbnail…
  const libRows = () => findAllDeep(detail(), 'status-pet-library-row');
  // …and each row PLAYS it: the thumbnail is the one-action preview, pinned to
  // that row's action, not a still of frame 0.
  const rowThumb = () => findAllByType(libRows()[0], ActionThumb)[0];
  assert.ok(rowThumb(), 'each row shows the action');
  assert.equal(rowThumb().props.actionId, store.skinLibrary(SKIN)[0].id, 'the row previews ITS action');
  assert.equal(rowThumb().props.skin, SKIN);
  // …and what it previews is a LOOP: one action, every state pinned to it, so
  // the shared player cycles its frames instead of holding one still.
  const thumbSkin = store.resolveTakeSkin(SKIN, AVATAR_GRID, rowThumb().props.actionId)!;
  assert.equal(thumbSkin.states.idle.takes.length, 1, 'a one-action skin');
  assert.ok(thumbSkin.states.idle.takes[0].frames.length > 1, 'whose playhead advances');
  assert.equal(thumbSkin.states.tool, thumbSkin.states.idle, 'pinned whatever state it is handed');
  // …and pointing at one plays it LIVE in the header, at the popup's size.
  assert.equal(findAllByType(findDeep(detail(), 'status-pet-edit-head'), PetPreview)[0].props.takeId,
    undefined, 'the header shows the STATE until you reach for an action');
  libRows()[0].props.onMouseEnter();
  const head2 = findDeep(detail(), 'status-pet-edit-head');
  const hovered = findAllByType(head2, PetPreview)[0];
  assert.equal(hovered.props.takeId, store.skinLibrary(SKIN)[0].id,
    'hovering a row previews THAT action');
  assert.equal(hovered.props.zoom, LIVE_ZOOM, 'at the popup size');
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

  // The 状态 half holds no drawing surface, and the studio's writing surfaces
  // never come back anywhere.
  for (const dead of ['status-pet-studio', 'status-pet-stage', 'status-pet-cell', 'status-pet-face-switch',
                      'status-pet-library-edit', 'status-pet-gallery-edit']) {
    assert.equal(findAllDeep(render(), dead).length, 0, dead + ' is not in this half');
  }
  for (const dead of ['status-pet-swatch', 'status-pet-colors', 'status-pet-num-field',
                      'status-pet-nudge', 'status-pet-action-name', 'status-pet-frame-ops',
                      'status-pet-takeover', 'status-pet-bulk', 'status-pet-danger']) {
    assert.equal(findAllDeep(render(), dead).length, 0, dead + ' is a writing control — gone');
  }
  clearStorage();
});

test('the 动作 view is a VIEWER: picker, board and filmstrip — and nothing that writes', () => {
  clearStorage();
  const render = mountPlain(SettingsPage, { t: tKey });
  const goto = (i: number) => childList(findDeep(render(), 'status-pet-axis'))[i].props.onClick();

  goto(1);
  const viewer = () => findAllByType(render(), ActionViewer)[0];
  assert.ok(viewer(), '动作 opens the viewer');
  assert.equal(viewer().props.skin, SKIN);
  assert.equal(viewer().props.grid, AVATAR_GRID, '32 (the dock avatar) opens');
  assert.equal(viewer().props.actionId, store.skinLibrary(SKIN)[0].id,
    'on the first action of the library');

  // The viewer is a child COMPONENT of the page (an element in this stub), so its
  // output is read by expanding it.
  const view = () => expand(viewer());
  const fieldFor = (key: string) => findAllDeep(view(), 'status-pet-field')
    .find((f: any) => textOf(childList(f)[0]) === key)!;

  // 动作: ONE picker, closed it reads out the action on the board.  It is a
  // nested component too, so it is expanded at the same base every call.
  const combo = () => expand(findAllByType(view(), ActionCombo)[0]);
  assert.ok(findAllByType(view(), ActionCombo)[0], 'the picker is a combobox');
  const input = () => findDeep(combo(), 'status-pet-combo-input');
  assert.equal(input().props.role, 'combobox');
  assert.equal(input().props['aria-expanded'], 'false');
  assert.equal(input().props.value, store.skinLibrary(SKIN)[0].name,
    'closed, it names the action on the board');
  // Focus opens the whole library: a thumbnail and a read-out per row.
  input().props.onFocus();
  const pop = () => findDeep(combo(), 'status-pet-combo-pop');
  assert.ok(pop(), 'focusing opens the list');
  const options = () => findAllDeep(pop(), 'status-pet-row');
  assert.equal(options().length, store.skinLibrary(SKIN).length, 'every action is listed');
  const pickThumb = () => findAllByType(options()[0], ActionThumb)[0];
  assert.ok(pickThumb(), 'each row carries a thumbnail');
  assert.equal(pickThumb().props.actionId, store.skinLibrary(SKIN)[0].id, 'and it plays THAT action');
  assert.ok(textOf(options()[0]).includes('S:settings.actionFrames'), 'and a read-out');
  // Typing filters, Enter picks, and the board follows.
  const second = store.skinLibrary(SKIN)[1];
  input().props.onChange({ target: { value: second.name } });
  assert.equal(options().length, 1, 'typing narrows the list');
  options()[0].props.onClick();
  assert.equal(findAllByType(render(), ActionViewer)[0].props.actionId, second.id, 'picking moves the board');

  // 画布: the face switch sits ON the canvas row, and the board is a PICTURE —
  // 32×32 cells carrying a colour and NOTHING else, so no click can paint.
  const canvasField = () => fieldFor('S:settings.region.canvas');
  assert.equal(findAllDeep(canvasField(), 'status-pet-face-switch').length, 1, 'the switch is on the canvas row');
  assert.equal(findAllDeep(findDeep(render(), 'status-pet-axis'), 'status-pet-face-switch').length, 0,
    'and the axis does not carry it');
  const grid = () => findDeep(canvasField(), 'status-pet-grid');
  const rows = () => childList(grid());
  assert.equal(rows().length, AVATAR_GRID, 'one row per grid row');
  const cell = () => childList(rows()[0])[0];
  assert.deepEqual(Object.keys(cell().props.style), ['background'], 'a cell carries its colour only');
  for (const handler of ['onPointerDown', 'onPointerEnter', 'onContextMenu', 'onClick']) {
    assert.equal(handler in cell().props, false, handler + ' — the board cannot be painted');
  }
  // The preview beside it plays THAT action, at the popup's display size.
  const preview = findAllByType(findDeep(canvasField(), 'status-pet-stage'), PetPreview)[0];
  assert.equal(preview.props.takeId, second.id, 'the preview is pinned to the action on the board');
  assert.equal(preview.props.zoom, LIVE_ZOOM, 'and displayed at the popup size');
  assert.equal(preview.props.interactive, false, 'the card is a picture, not a toy');
  // Pressing 全身 moves the board: the page owns the value and hands it down.
  findAllByText(canvasField(), 'S:settings.grid.128')[0].props.onClick();
  assert.equal(findAllByType(render(), ActionViewer)[0].props.grid, BODY_GRID, 'the board changes face');
  assert.equal(findAllByText(fieldFor('S:settings.region.canvas'), 'S:settings.grid.128')[0].props['aria-pressed'],
    'true');
  goto(0);
  assert.equal(findAllDeep(render(), 'status-pet-face-switch').length, 0, 'the 状态 view asks for no face');

  // 帧: the filmstrip SELECTS a frame, and it is the only list op left.
  goto(1);
  const strip = () => findDeep(fieldFor('S:settings.field.frames'), 'status-pet-filmstrip');
  // A thumbnail is a nested component of the viewer, like the popup's sprite.
  const byName = (el: any, name: string, out: any[] = []): any[] => {
    if (!el || typeof el !== 'object') return out;
    if (el.type && el.type.name === name) out.push(el);
    for (const c of childList(el)) byName(c, name, out);
    return out;
  };
  const thumbs = () => byName(strip(), 'FrameThumb');
  const frameCount = store.skinArtwork(SKIN)!.actions.find((a) => a.id === second.id)!.frames.length;
  assert.ok(frameCount > 1, 'the action under test loops');
  assert.equal(thumbs().length, frameCount, 'one thumbnail per frame');
  assert.equal(expand(thumbs()[0]).props['aria-pressed'], 'true', 'the first frame is the one shown');
  assert.equal(findAllByType(expand(thumbs()[0]), FrameCanvas).length, 1, 'and it is a picture');
  expand(thumbs()[1]).props.onClick();
  assert.equal(expand(byName(strip(), 'FrameThumb')[1]).props['aria-pressed'], 'true',
    'clicking a frame looks at it');

  // Nothing here writes: no action ops, no frame CRUD, no brushes, no numbers.
  for (const dead of ['S:settings.newAction', 'S:settings.deleteAction', 'S:settings.addFrame',
                      'S:settings.delFrame', 'S:settings.eraser', 'S:settings.frameLen',
                      'S:settings.frameOffset', 'S:settings.genBody', 'S:settings.blankBody',
                      'S:settings.manageActions']) {
    assert.equal(findAllByText(view(), dead).length, 0, dead + ' is a writing control — gone');
  }
  for (const dead of ['status-pet-swatch', 'status-pet-num-field', 'status-pet-nudge',
                      'status-pet-action-name', 'status-pet-frame-ops', 'status-pet-combo-foot']) {
    assert.equal(findAllDeep(view(), dead).length, 0, dead + ' left with the studio');
  }
  clearStorage();
});

test('the 状态 list badges each state with what it plays', () => {
  clearStorage();
  const render = mountPlain(SettingsPage, { t: tKey });
  const metaOf = (tree: any, name: string) => {
    const row = findAllDeep(tree, 'status-pet-state-row').find((r: any) => textOf(r).startsWith(name))!;
    return textOf(findAllDeep(row, 'status-pet-state-meta')[0]);
  };
  assert.equal(metaOf(render(), 'S:idle'), 'S:settings.actionCount', 'every state of the built-in plays something');
  assert.equal(metaOf(render(), 'S:tool'), 'S:settings.actionCount');

  // Empty a state through the store: the read-out says it follows idle.
  const art = store.skinArtwork(SKIN)!;
  store.saveSkinStates(SKIN, { ...art.states, tool: [] });
  const cleared = mountPlain(SettingsPage, { t: tKey });
  assert.equal(metaOf(cleared(), 'S:tool'), 'S:settings.followIdle',
    'a state nothing is ticked for says so');
  clearStorage();
});

test('the 状态 detail is the assignment surface: checkboxes, their groups and their ops', () => {
  clearStorage();
  const lib = store.skinLibrary(SKIN);
  const art = store.skinArtwork(SKIN)!;
  const nameOf = (id: string) => lib.find((a) => a.id === id)!.name!;
  const ticked = art.states.tool[0];
  const free = lib.find((a) => a.id !== ticked && !a.usedBy.includes('tool'))!.id;
  const props: any = { t: tKey, skin: SKIN, state: 'tool' };
  const render = mountPlain(StateAssignments, props);
  const rows = () => findAllDeep(render(), 'status-pet-library-row');
  const checks = () => rows().map((r: any) => inputsIn(r)[0]);
  const rowFor = (name: string) => rows().find((r: any) => textOf(r).startsWith(name))!;
  const groups = () => findAllDeep(render(), 'status-pet-library-group').map((g: any) => textOf(g));

  assert.equal(rows().length, lib.length, 'the list holds every action');
  assert.equal(findDeep(render(), 'status-pet-state-select'), null, 'the detail has no state dropdown');
  assert.equal(checks().filter((c: any) => c.props.checked).length, art.states.tool.length,
    'tool starts on its authored selection');
  // The tick is at the TOP, under a header, with the rest below it — the page
  // answers "what does this state do?" before it lists the material.
  assert.deepEqual(groups(), ['S:settings.libraryTickedGroup', 'S:settings.libraryRestGroup'],
    'the two halves are captioned');
  const flags = checks().map((c: any) => c.props.checked);
  assert.ok(flags.lastIndexOf(true) < flags.indexOf(false), 'every ticked row precedes every other one');

  // Tick a free action: the state now plays it too, and the row reports it.
  inputsIn(rowFor(nameOf(free)))[0].props.onChange({ target: { checked: true } });
  assert.deepEqual(store.loadStored().builtinStates![SKIN].tool, art.states.tool.concat([free]),
    'ticking stores a REFERENCE beside the frozen artwork');
  assert.equal(inputsIn(rowFor(nameOf(free)))[0].props.checked, true, 'the row is ticked');
  assert.ok(textOf(rowFor(nameOf(free))).includes('S:settings.usedByN'), 'and it says who plays it');

  // 「全选」 takes the whole library — up to the per-state cap; 「清空」 is
  // exactly the idle fallback, so it disappears once it has nothing to do.
  const ops = () => childList(findDeep(render(), 'status-pet-bulk-ops'))
    .filter(Boolean).map((b: any) => textOf(b))
    .filter((x: string) => String(x).startsWith('S:settings.selectAll')
      || String(x).startsWith('S:settings.clearSelection'));
  assert.deepEqual(ops(), ['S:settings.selectAll', 'S:settings.clearSelection'], 'the two bulk ops');
  findAllContaining(render(), 'S:settings.selectAll')[0].props.onClick();
  assert.equal(store.loadStored().builtinStates![SKIN].tool.length, store.MAX_TAKES,
    'all means all, capped at the per-state limit');
  assert.equal(findAllDeep(render(), 'status-pet-full').length, 1, 'and the cap is announced');

  findAllContaining(render(), 'S:settings.clearSelection')[0].props.onClick();
  assert.deepEqual(store.loadStored().builtinStates![SKIN].tool, [],
    'clearing stores a PRESENT-BUT-EMPTY list: this state deliberately plays nothing');
  const resolved = store.resolveSkin(store.loadStored());
  assert.equal(resolved.states.tool, resolved.states.idle, 'and it really does follow idle');

  // 空闲 is the one state whose 清空 has a rule, and it is ASKED for.
  props.state = 'idle';
  const idleBefore = store.skinArtwork(SKIN)!.states.idle;
  assert.ok(idleBefore.length >= 1);
  findAllContaining(render(), 'S:settings.clearSelection')[0].props.onClick();
  assert.ok(findDeep(render(), 'status-pet-confirm'), '空闲 asks first');
  findAllContaining(findDeep(render(), 'status-pet-confirm-card'), 'S:settings.clearSelection')[0].props.onClick();
  assert.deepEqual(store.skinArtwork(SKIN)!.states.idle, [idleBefore[0]],
    '空闲 keeps its first action instead of dead-ending');
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
// (32px avatar / 128px body — the row thumbnails show these 1:1) and the LIVE
// DISPLAY size on the real page (16px / 64px — an exact 1:2 of those same
// rendered pixels).  The live zoom never re-renders the sprite smaller.
// ── the stylesheet is a shipped artifact too ──
// Two of this page's rewrites silently LOST rules (a line-based cleanup removed a
// heading and left the body, and a later one dropped whole rules, and the stage
// stopped being a grid so its `@container` override had nothing to override).
// Structure alone cannot catch either, so the CSS itself is asserted.

test('stylesheet: every rule is well formed, and the stage can actually go two-column', () => {
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
  // The state list is its own COLUMN, and it stacks on a narrow pane — the
  // container is the settings pane, not the viewport.
  assert.match(css, /\.status-pet-columns\{[^}]*grid-template-columns:176px/,
    'the state list owns a fixed column beside its edit');
  assert.ok(css.includes('@container (max-width:479px)'),
    'and the two columns stack by PANE width');
  // 106 library rows are a SCROLL REGION, not an endless column: without the cap
  // the assignment card grew several screens tall (the reported bug) and the rows
  // below the fold were unreachable without scrolling the whole dialog.
  assert.match(css, /\.status-pet-library\{[^}]*max-height[^}]*overflow:auto/,
    'the action library scrolls instead of stretching the card');
  // The classes the components rely on for placement.
  for (const cls of ['.status-pet-field{', '.status-pet-library-group{', '.status-pet-search-row{',
                     '.status-pet-axis{', '.status-pet-studio{', '.status-pet-canvas-card{',
                     '.status-pet-face-switch{', '.status-pet-board-wrap{', '.status-pet-grid{',
                     '.status-pet-cell{', '.status-pet-filmstrip{', '.status-pet-frame-thumb{',
                     '.status-pet-combo{', '.status-pet-row{']) {
    assert.ok(css.includes(cls), cls + ' has a rule');
  }
  // The board and its preview are a GRID, and the two-column switch is a
  // CONTAINER query (the pane, not the viewport) — the regression this test was
  // written for.
  assert.match(css, /\.status-pet-stage\{[^}]*display:grid/, 'the stage owns its layout');
  assert.match(css, /@container \(min-width:380px\)\{\.status-pet-stage\{grid-template-columns:[^}]*auto/,
    'and goes two-column from 380px of pane up');
  // …and the studio's WRITING surfaces left with the studio.
  for (const dead of ['.status-pet-swatch{', '.status-pet-colors{', '.status-pet-num-field{',
                      '.status-pet-nudge{', '.status-pet-action-name{', '.status-pet-frame-ops{',
                      '.status-pet-takeover{', '.status-pet-bulk{', '.status-pet-danger{',
                      '.status-pet-ghost-link{', '.status-pet-combo-foot{', '.status-pet-skin-badge{']) {
    assert.equal(css.includes(dead), false, dead + ' was a writing control');
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

  // A `PetPreview` with NO `zoom` keeps 1:1: the sprite is rendered at its crop
  // and shown at the same size.  The cards opt into `scale: 2` instead.
  const atAvatarCrop = mountPlain(PetPreview, { grid: AVATAR_GRID, interactive: false })();
  assert.equal(atAvatarCrop.props.width, 160, 'the 32px crop is drawn at 4×');
  assert.equal(atAvatarCrop.props.style.width, '160px', 'and is NOT zoomed down');
  const atBodyCrop = mountPlain(PetPreview, { grid: BODY_GRID, interactive: false })();
  assert.equal(atBodyCrop.props.width, 160, 'the 128px crop is drawn at 1×');
  assert.equal(atBodyCrop.props.style.width, '160px');

  clearStorage();
});

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

// Every element (deep) of this component type.
function findAllByType(el: any, type: any, out: any[] = []): any[] {
  if (!el || typeof el !== 'object') return out;
  if (el.type === type) out.push(el);
  for (const c of childList(el)) findAllByType(c, type, out);
  return out;
}

test('skin picker: one card per built-in, and selecting persists', () => {
  clearStorage();
  const render = mountPlain(SkinPicker, { t: tKey });
  const cards = render().children[1].children.flat();
  assert.equal(cards.length, Object.keys(SKINS).length, 'one card per built-in — and nothing else');
  assert.ok(cards.every((c: any) => c.type === 'button'));
  assert.equal(cards[0].props['aria-pressed'], 'true', 'the default skin starts pressed');
  assert.ok(textOf(cards[0]).includes('S:settings.skin.' + store.DEFAULT_SKIN), 'and is named');
  cards[0].props.onClick();
  assert.equal(store.loadStored().skin, store.DEFAULT_SKIN, 'clicking persists the selection');
  assert.equal((store.loadStored() as any).custom, undefined, 'and writes no artwork');
  clearStorage();
});

// ── Tree helpers ──

function findAllDeep(el: any, frag: string, out: any[] = []): any[] {
  if (!el || typeof el !== 'object') return out;
  if (el.props && String(el.props.className || '').split(' ').includes(frag)) out.push(el);
  for (const c of childList(el)) findAllDeep(c, frag, out);
  return out;
}

// Every input inside a subtree (the checkboxes of the assignment list).
function inputsIn(el: any, out: any[] = []): any[] {
  if (!el || typeof el !== 'object') return out;
  if (el.type === 'input') out.push(el);
  for (const c of childList(el)) inputsIn(c, out);
  return out;
}