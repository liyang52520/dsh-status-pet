import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

let def: any = null;
(globalThis as any).window = {
  __ModuleLoader__: { load: (d: any) => { def = d; } },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  CustomEvent: function (this: { type: string }, type: string) { this.type = type; },
  dispatchEvent: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
};
(globalThis as any).document = { body: {}, addEventListener: () => {}, removeEventListener: () => {} };

await import(join(HERE, '..', 'client.js') + '?v=' + Date.now());

const ReactStub = {
  Fragment: Symbol('Fragment'),
  createElement: (type: any, props: any, ...children: any[]) => ({ type, props: props || {}, children }),
  useRef: (init: any) => ({ current: init }),
  useState: (init: any) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
};
const requireStub = (spec: string): any =>
  spec === 'react' ? ReactStub
    : spec === 'react-dom' ? { createPortal: (el: any) => el }
    : { Tooltip: (() => {}) as any, useAnchoredPosition: () => null, useDismissOnOutsidePointer: () => {} };

test('the built bundle registers and apply() works', () => {
  assert.ok(def !== null);
  assert.equal(def.id, '@local/dsh-status-pet');
  const plugin = def.factory(requireStub);
  assert.deepEqual(plugin.inject, ['slots', 'locale']);
  assert.ok(typeof plugin.skinTools.resolveSkin === 'function');
  assert.equal(typeof plugin.skinTools.ui.PetCanvas, 'function');
  assert.equal(typeof plugin.skinTools.ui.ActionViewer, 'function');
  assert.equal(typeof plugin.skinTools.ui.PixelEditor, 'undefined');
  const regs: any[] = [];
  plugin.apply({
    effect: (fn: any) => { fn(); return () => {}; },
    locale: { register: () => () => {}, bind: () => (k: string) => 'L:' + k },
    slots: {
      inject: (_: string, fn: any) => fn(),
      register: (opts: any, comp: any) => { regs.push({ opts, comp }); return () => {}; },
      entries: () => [],
    },
  });
  assert.ok(regs.find((r) => r.opts.name === 'conversation.composer.dock'), 'dock slot');
  assert.ok(regs.find((r) => r.opts.name === 'settings.section'), 'settings slot');
});

test('the artwork chunk ships the catalog in the new shape', async () => {
  const win = (globalThis as any).window;
  const prev = win.__ModuleLoader__;
  let reg: any = null;
  win.__ModuleLoader__ = { load: (d: any) => { reg = d; } };
  try { new Function(readFileSync(join(HERE, '..', 'client.artwork.js'), 'utf8'))(); }
  finally { win.__ModuleLoader__ = prev; }
  assert.ok(reg);
  const catalog = reg.factory().CATALOG as Record<string, any>;
  const art = catalog['whale-chan'];
  assert.ok(art.palette.length > 16);
  assert.ok(art.actions.length > 50);
  const frame = art.actions[0].frames[0];
  assert.ok(frame.art && frame.art.avatar, 'new shape: art.avatar');
});
