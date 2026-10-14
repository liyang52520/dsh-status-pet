// Pixel codec roundtrips, sprite-for memoization, and blank rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PIXEL_CHARS, TRANSPARENT, hexPixel, pixelAt, rowPixels,
  NIBBLE, blankRows, parseRows, spriteFor, spriteToRows, upscaleRows,
} from '../src/skin/pixels.ts';

test('hexPixel roundtrips each palette index 1–255', () => {
  for (let i = 1; i <= 255; i++) {
    const tok = hexPixel(i);
    assert.equal(tok.length, 2);
    assert.equal(parseInt(tok, 16), i);
  }
});

test('TRANSPARENT is the two-dot token', () => {
  assert.equal(TRANSPARENT, '..');
  // '..' is not a hex number; it is the sentinel the parser skips.
});

test('pixelAt reads one pixel from a row', () => {
  const row = '0a1f..ff';
  assert.equal(pixelAt(row, 0), '0a');
  assert.equal(pixelAt(row, 1), '1f');
  assert.equal(pixelAt(row, 2), '..');
  assert.equal(pixelAt(row, 3), 'ff');
});

test('rowPixels returns the count independent of content', () => {
  assert.equal(rowPixels('0a1f'), 2);
  assert.equal(rowPixels('..' + '0a'.repeat(32)), 33);
});

test('NIBBLE table decodes hex digits', () => {
  for (const ch of '0123456789') assert.equal(NIBBLE[ch.charCodeAt(0)], Number(ch));
  for (const [v, ch] of ['a','b','c','d','e','f'].entries()) assert.equal(NIBBLE[ch.charCodeAt(0)], 10 + v);
  assert.equal(NIBBLE['x'.charCodeAt(0)], -1);
  assert.equal(NIBBLE['A'.charCodeAt(0)], -1); // uppercase not used
});

test('blankRows returns the right count of transparent rows', () => {
  for (const size of [32, 128]) {
    const rows = blankRows(size);
    assert.equal(rows.length, size);
    for (const row of rows) assert.equal(row, TRANSPARENT.repeat(size));
  }
});

test('parseRows → spriteToRows is an identity', () => {
  const rows = ['0a0a', '..ff', '0a..', 'ff0a'];
  const { w, h, px } = parseRows(rows);
  assert.equal(w, 2);
  assert.equal(h, 4);
  // '0a' → 0x0a = 10
  assert.equal(px[0], 10);
  assert.equal(px[3], 255);
  const back = spriteToRows({ w, h, px, dx: 0, dy: 0 });
  assert.deepEqual(back, rows);
});

test('spriteFor memoizes by source object identity', () => {
  const source = { rows: ['0a0a', '..ff'], dx: 0, dy: 0 };
  const a = spriteFor(source);
  const b = spriteFor(source);
  assert.equal(a, b, 'same object → same sprite');
  const copy = { rows: ['0a0a', '..ff'], dx: 0, dy: 0 };
  const c = spriteFor(copy);
  assert.notEqual(a, c, 'different object → different sprite identity');
});

const { parseSprite } = await import('../src/skin/pixels.ts');

test('parseSprite preserves dx/dy from source', () => {
  const sprite = parseSprite({ rows: ['0a..'], dx: 3, dy: 1 });
  assert.equal(sprite.dx, 3);
  assert.equal(sprite.dy, 1);
});

test('upscaleRows doubles each pixel and each row', () => {
  const rows = ['0a..', 'ff00'];
  const up = upscaleRows(rows, 2);
  assert.equal(up.length, 4); // 2×2
  assert.equal(up[0], '0a0a....');
  assert.equal(up[1], '0a0a....');
});