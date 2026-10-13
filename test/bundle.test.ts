// Bundle smoke test: load the built client.js with a stubbed module loader
// and drive apply(), proving the build wiring (entry → runtime →
// registration) is intact end to end.  Requires `tsdown` to have run first
// (the `pretest` script does).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

let def: any = null;
(globalThis as any).window = {
  __ModuleLoader__: { load: (d: any) => { def = d; } },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
  CustomEvent: function (this: { type: string }, type: string) {
    this.type = type;
  },
  dispatchEvent: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
};
(globalThis as any).document = { body: {}, addEventListener: () => {}, removeEventListener: () => {} };

await import(join(HERE, '..', 'client.js') + '?v=' + Date.now());
/** The plugin bundle's own text, so the shipped CSS and modules can be
 *  asserted against — a deletion is only real once it is gone from the build. */
const bundleText = readFileSync(join(HERE, '..', 'client.js'), 'utf8');

const ReactStub = {
  Fragment: Symbol('Fragment'),
  createElement: (type: any, props: any, ...children: any[]) => ({ type, props: props || {}, children }),
  useRef: (init: any) => ({ current: init }),
  useState: (init: any) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
};
function StubTooltip() {}
const requireStub = (spec: string): any =>
  spec === 'react'
    ? ReactStub
    : spec === 'react-dom'
      ? { createPortal: (el: any) => el }
      : { Tooltip: StubTooltip, useAnchoredPosition: () => null, useDismissOnOutsidePointer: () => {} };

test('the built bundle registers itself with the loader', () => {
  assert.ok(def !== null, 'client.js called window.__ModuleLoader__.load()');
  assert.equal(def.id, '@local/dsh-status-pet', 'module id matches the package name');
});

test('apply() registers the dock entry and the settings section', () => {
  const registrations: Array<{ options: any; component: any }> = [];
  const plugin = def.factory(requireStub);
  assert.deepEqual(plugin.inject, ['slots', 'locale']);
  assert.ok(plugin.skinTools && typeof plugin.skinTools.resolveSkin === 'function',
    'skinTools are exposed');
  assert.equal(typeof plugin.skinTools.ui.SkinPicker, 'function', 'the skin cards ship');
  assert.equal(typeof plugin.skinTools.ui.PetPreview, 'function', 'and the live preview');
  assert.equal(typeof plugin.skinTools.ui.ActionViewer, 'function', 'and the read-only 动作 view');
  assert.equal(typeof plugin.skinTools.ui.PixelEditor, 'undefined', 'but no studio');
  // The bundle is code only — the 动作 view's rules ship, and the studio's
  // WRITING surfaces do not.
  for (const live of ['status-pet-studio', 'status-pet-board-wrap', 'status-pet-cell',
                      'status-pet-filmstrip', 'status-pet-combo']) {
    assert.ok(bundleText.includes(live), live + ' ships with the viewer');
  }
  for (const dead of ['status-pet-swatch', 'status-pet-nudge', 'status-pet-action-name',
                      'status-pet-frame-ops', 'status-pet-combo-foot', 'status-pet-takeover']) {
    assert.equal(bundleText.includes(dead), false, dead + ' was a writing control');
  }
  plugin.apply({
    effect: (fn: any) => {
      fn();
      return () => {};
    },
    locale: { register: () => () => {}, bind: () => (k: string) => 'LOC:' + k },
    slots: {
      inject: (_name: string, fn: any) => fn(),
      register: (opts: any, comp: any) => {
        registrations.push({ options: opts, component: comp });
        return () => {};
      },
      entries: () => [],
    },
  });

  const dock = registrations.filter((r) => r.options.name === 'conversation.composer.dock');
  assert.equal(dock.length, 1, 'exactly one dock registration');
  assert.equal(dock[0].options.id, 'status-pet');
  assert.equal(dock[0].options.order, -1000, 'fixed at the far left (below every shipped entry)');
  assert.equal(dock[0].options.locale, 'status-pet');
  assert.equal(dock[0].options.label(), 'LOC:label', 'the label thunk resolves through the locale binding');
  assert.equal(typeof dock[0].component, 'function');

  const sections = registrations.filter((r) => r.options.name === 'settings.section');
  assert.equal(sections.length, 1, 'the settings tab was registered');
  assert.equal(sections[0].options.id, 'status-pet');
  assert.ok(sections[0].options.order > 20, 'sorts after every shipped section');
  assert.equal(sections[0].options.label(), 'LOC:settings.nav');
  assert.equal(typeof sections[0].component, 'function');

  assert.equal(registrations.filter((r) => r.options.name === 'settings.general.item').length, 0,
    'no General settings row: the position is fixed');
});

test('the built dock component renders a pill with a canvas', () => {
  const registrations: Array<{ options: any; component: any }> = [];
  const plugin = def.factory(requireStub);
  plugin.apply({
    effect: (fn: any) => {
      fn();
      return () => {};
    },
    locale: { register: () => () => {}, bind: () => (k: string) => 'LOC:' + k },
    slots: {
      inject: (_name: string, fn: any) => fn(),
      register: (opts: any, comp: any) => {
        registrations.push({ options: opts, component: comp });
        return () => {};
      },
      entries: () => [],
    },
  });
  const component = registrations.find((r) => r.options.name === 'conversation.composer.dock')!.component;
  const tree = component({ t: (k: string) => 'S:' + k });
  const anchor = tree.children.find((c: any) => c && c.props && c.props.className === 'status-pet-anchor');
  assert.ok(anchor, 'the anchor span renders');
  const style = tree.children.find((c: any) => c && c.type === 'style');
  assert.ok(style, 'the inline style element renders');
});

test('the built settings tab renders the Workshop from the SHIPPED bundle', async () => {
  // The artifact, not the source: the bundle carries its own copy of the store,
  // so this installs the artwork through the bundle's own `skinTools` and renders
  // the registered settings component exactly as the shell would.
  const registrations: Array<{ options: any; component: any }> = [];
  const plugin = def.factory(requireStub);
  plugin.apply({
    effect: (fn: any) => { fn(); return () => {}; },
    locale: { register: () => () => {}, bind: () => (k: string) => 'S:' + k },
    slots: {
      inject: (_name: string, fn: any) => fn(),
      register: (opts: any, comp: any) => {
        registrations.push({ options: opts, component: comp });
        return () => {};
      },
      entries: () => [],
    },
  });
  const { ARTWORK } = await import('../src/artwork.gen.ts');
  plugin.skinTools.installSkinArtwork(ARTWORK as never);

  const page = registrations.find((r) => r.options.name === 'settings.section')!.component;
  const tree = page({ t: (k: string) => 'S:' + k });

  const deep = (el: any, frag: string, out: any[] = []): any[] => {
    if (!el || typeof el !== 'object') return out;
    if (el.props && String(el.props.className || '').split(' ').includes(frag)) out.push(el);
    for (const c of ((el.children as any[]) || []).flat()) deep(c, frag, out);
    return out;
  };
  assert.ok(tree.children.some((c: any) => c && c.type === 'style'), 'the stylesheet ships');
  assert.equal(deep(tree, 'status-pet-state-row').length, 11, 'the eleven states render');
  assert.equal(deep(tree, 'status-pet-columns').length, 1, 'as two columns');
  const assign = (function find(el: any): any {
    if (!el || typeof el !== 'object') return null;
    if (el.props && el.props.skin === plugin.skinTools.DEFAULT_SKIN && el.props.state === 'idle') return el;
    for (const c of ((el.children as any[]) || []).flat()) {
      const hit = find(c);
      if (hit) return hit;
    }
    return null;
  })(tree);
  assert.ok(assign, 'the selected state is handed to the assignment surface');
  assert.equal(deep(tree, 'status-pet-axis').length, 1, 'the 状态 / 动作 axis ships');
  assert.equal(deep(tree, 'status-pet-studio').length, 0, '状态 opens first, so no viewer yet');
});

test('the factory asks the loader for the artwork chunk (relative, client.*.js)', () => {
  // The plugin's data lives in a sibling chunk so the main bundle stays small.
  // The module loader only serves siblings whose name matches
  // /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/, so this relative spec is a
  // contract, not a preference.
  let asked: string | null = null;
  const requireWithChunks = Object.assign(
    (spec: string) => requireStub(spec),
    { async: async (spec: string) => { asked = spec; return null; } },
  );
  def.factory(requireWithChunks);
  assert.equal(asked, './client.artwork.js');
});

test('the artwork chunk registers itself and carries the generated frames', async () => {
  const win = (globalThis as any).window;
  const prev = win.__ModuleLoader__;
  let reg: any = null;
  win.__ModuleLoader__ = { load: (d: any) => { reg = d; } };
  try {
    // eslint-disable-next-line no-new-func
    new Function(readFileSync(join(HERE, '..', 'client.artwork.js'), 'utf8'))();
  } finally {
    win.__ModuleLoader__ = prev;
  }
  assert.ok(reg, 'client.artwork.js called window.__ModuleLoader__.load()');
  assert.equal(reg.id, '@local/dsh-status-pet', 'the same package id as the plugin');
  assert.equal(reg.chunk, 'client.artwork.js', 'the loader keys a chunk by <owner>/<chunk>');
  const registry = reg.factory().ARTWORK as Record<string, any>;
  const art = registry['whale-chan'];
  assert.ok(art, 'the chunk carries the built-in artwork');
  const states = Object.keys(art.grids[32].states);
  assert.ok(states.length >= 9, 'the whole state vocabulary is there');
  // The shipped DEFAULTS are an authoring convention: every state names at
  // least one action and at most four, each of them matching what the state
  // MEANS.  This is a rule about the built-in's data, not a cap in the store
  // or the renderer — a custom skin may put up to MAX_TAKES on one state.
  for (const [state, ids] of Object.entries(art.grids[128].states as Record<string, string[]>)) {
    assert.ok(ids.length >= 1 && ids.length <= 4, `${state} plays 1–4 default actions`);
  }
  assert.ok(art.grids[32].library.length > 4 * Object.keys(art.grids[32].states).length,
    'the library is far larger than the short default lists');
  assert.ok(art.palette.length > 16, 'the palette holds the artwork colours');
  // The chunk ships the ACTION LIBRARY shape: named, unique ids the states
  // reference — not per-state copies.
  const library = art.grids[32].library;
  assert.ok(library.length > 50, 'the whole action library is shipped');
  assert.equal(new Set(library.map((a: any) => a.id)).size, library.length, 'ids are unique');
  assert.ok(library.every((a: any) => a.name && a.origin), 'every action is named and traceable');
  for (const state of states) {
    for (const id of art.grids[32].states[state]) {
      assert.ok(library.some((a: any) => a.id === id), `${state} references a shipped action`);
    }
  }

  // …and the plugin consumes it: installing the chunk makes the pet real.
  const store = await import('../src/pet/skins/store.ts');
  store.installSkinArtwork(registry);
  const skin = store.activeSkin();
  assert.equal(skin.name, 'whale-chan');
  assert.equal(skin.grid, 32, 'the dock resolves the avatar crop');
  assert.ok(skin.states.idle.takes.length > 1, 'the dock got real takes');
  assert.equal(store.resolveBestSkin().grid, 128, 'the popup resolves the body crop');
});
