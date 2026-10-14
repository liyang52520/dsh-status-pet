// 状态栏显示设置（skin/display.ts）：默认值、消毒、以及「写一次就够」。
//
// 存储是一段可以被手改、也可能来自别的版本的 JSON，所以这里真正要守住的是：
// 一个不认识的值读成默认值、一个非法值写不进去、以及默认值不产生任何写入。

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const storeMem = new Map<string, string>();
let writes = 0;
(globalThis as any).window = {
  localStorage: {
    getItem: (k: string) => (storeMem.has(k) ? storeMem.get(k)! : null),
    setItem: (k: string, v: string) => { writes++; storeMem.set(k, String(v)); },
    removeItem: (k: string) => void storeMem.delete(k),
  },
  CustomEvent: function (this: { type: string }, type: string) { this.type = type; },
  dispatchEvent: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
};

const storage = await import('../src/skin/storage.ts');
const display = await import('../src/skin/display.ts');

beforeEach(() => { storeMem.clear(); writes = 0; });

test('the default shows the line on the right, and costs no write', () => {
  assert.equal(display.dockText(), 'right');
  assert.equal(display.DOCK_TEXT_DEFAULT, 'right');
  assert.equal(writes, 0);
});

test('a placement round-trips through the one stored document', () => {
  display.setDockText('left');
  assert.equal(display.dockText(), 'left');
  assert.equal(storage.readStored().dockText, 'left');
  assert.equal(storage.readStored().v, 1, 'the schema did not move');
  assert.ok(JSON.stringify(storage.readStored()).length < 2000, 'the payload is still tiny');

  display.setDockText('off');
  assert.equal(display.dockText(), 'off');
  display.setDockText('right');
  assert.equal(display.dockText(), 'right');
});

test('every placement the UI offers is accepted', () => {
  for (const value of display.DOCK_TEXT_VALUES) {
    display.setDockText(value);
    assert.equal(display.dockText(), value);
  }
});

test('writing what is already there costs nothing at all', () => {
  display.setDockText('left');
  const before = writes;
  display.setDockText('left');
  assert.equal(writes, before, 'no second write');
});

test('a hand-edited value reads as the default and is never written back', () => {
  for (const junk of ['top', '', 'RIGHT', '3', '{}']) {
    storeMem.clear();
    writes = 0;
    storeMem.set(storage.KEY, JSON.stringify({ v: 1, skin: 'whale-chan', dockText: junk }));
    assert.equal(display.dockText(), 'right', `“${junk}” reads as the default`);
    assert.equal(writes, 0, `“${junk}” is not written back`);
  }
});

test('an invalid value is refused rather than stored', () => {
  display.setDockText('sideways' as never);
  assert.equal(display.dockText(), 'right');
  assert.equal(writes, 0);
});

test('a document from another version is not interpreted', () => {
  storeMem.set(storage.KEY, JSON.stringify({ v: 1, skin: 'whale-chan', assignments: {} }));
  assert.equal(display.dockText(), 'right', 'a v1 document without the key is fine');
  storeMem.set(storage.KEY, JSON.stringify({ v: 2, dockText: 'left' }));
  assert.equal(display.dockText(), 'right', 'a foreign schema reads as empty');
});

// ── 台词框有多宽 ──
//
// 这一档必须是一个**固定像素值**：dock 那行是居中 flex，宽度只要跟着台词走，每一拍
// 换台词都会把整条状态栏推来推去（用户看到的就是"闪"）。 所以三档都是常数，默认落在
// 「中」，而且比原来那个 200px 的上限窄 —— 宽框会把旁边的 dock 项挤走。

test('the default width is medium and costs no write', () => {
  assert.equal(display.dockLineWidth(), 'medium');
  assert.equal(display.DOCK_LINE_WIDTH_DEFAULT, 'medium');
  assert.equal(writes, 0);
});

test('every width the UI offers is a fixed pixel value, and it round-trips', () => {
  for (const value of display.DOCK_LINE_WIDTH_VALUES) {
    display.setDockLineWidth(value);
    assert.equal(display.dockLineWidth(), value);
    assert.equal(display.dockLineWidthPx(), display.DOCK_LINE_WIDTH_PX[value]);
    assert.equal(storage.readStored().dockLineWidth, value);
  }
  assert.equal(storage.readStored().v, 1, 'the schema did not move');
});

test('the widths are ordered, and the default is the narrow-ish middle', () => {
  const { narrow, medium, wide } = display.DOCK_LINE_WIDTH_PX;
  assert.ok(narrow < medium && medium < wide, '窄 < 中 < 宽');
  assert.ok(medium <= 70, '默认只有原来 200px 的三分之一');
  assert.ok(narrow >= 40, '再窄也得放得下几个字');
});

test('writing the same width twice costs nothing', () => {
  display.setDockLineWidth('wide');
  const before = writes;
  display.setDockLineWidth('wide');
  assert.equal(writes, before, 'no second write');
});

test('a hand-edited width reads as the default and is never written back', () => {
  for (const junk of ['huge', '', 'Medium', '999', '{}']) {
    storeMem.clear();
    writes = 0;
    storeMem.set(storage.KEY, JSON.stringify({ v: 1, skin: 'whale-chan', dockLineWidth: junk }));
    assert.equal(display.dockLineWidth(), 'medium', `“${junk}” reads as the default`);
    assert.equal(display.dockLineWidthPx(), display.DOCK_LINE_WIDTH_PX.medium);
    assert.equal(writes, 0, `“${junk}” is not written back`);
  }
});

test('an invalid width is refused rather than stored', () => {
  display.setDockLineWidth('gigantic' as never);
  assert.equal(display.dockLineWidth(), 'medium');
  assert.equal(writes, 0);
});

test('the placement and the width share the one document without clobbering each other', () => {
  display.setDockText('left');
  display.setDockLineWidth('narrow');
  assert.equal(display.dockText(), 'left');
  assert.equal(display.dockLineWidth(), 'narrow');
  assert.deepEqual(storage.readStored(), { v: 1, dockText: 'left', dockLineWidth: 'narrow' });
});
