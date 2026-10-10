// The rasterizer, both ways round.
//
// `draw()` takes the ImageData path whenever the platform offers it — which is
// every real browser and NONE of the other suites (their ctx stubs have no
// `putImageData`), so the path the product actually runs was untested.  This
// suite stubs ImageData and a canvas factory and asserts the pixels that come
// out: the colour packing, the transparency, the offsets, and the scaled case
// that goes through the shared scratch canvas.
//
// The fillRect fallback keeps its own coverage in loop.test.ts, which reads
// what the player painted off `ctx.fillStyle`.

import { test } from 'node:test';
import assert from 'node:assert/strict';

interface Put { img: any; dx: number; dy: number }

const puts: Put[] = [];
const draws: any[] = [];

/** The smallest ImageData a canvas needs: a width, a height and RGBA bytes. */
class StubImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }
}

function makeCtx(tag: string) {
  return {
    tag,
    imageSmoothingEnabled: true,
    fillStyle: '',
    putImageData(img: any, dx: number, dy: number) { puts.push({ img, dx, dy }); },
    drawImage(canvas: any, ...rest: number[]) {
      draws.push({ tag, canvas, rest });
    },
    fillRect() { throw new Error('fillRect must not be reached when ImageData exists'); },
    clearRect() {},
  } as any;
}

const scratchChunks: any[] = [];
(globalThis as any).ImageData = StubImageData;
(globalThis as any).document = {
  createElement() {
    const canvas: any = { width: 0, height: 0, getContext: () => makeCtx('scratch') };
    scratchChunks.push(canvas);
    return canvas;
  },
};

const { draw } = await import('../src/renderer/draw.ts');

const PALETTE = ['transparent', '#ff0000', '#00ff00', '#0000ff'];
// 3 pixels in one row, then 1: index 0 (transparent), 1, 3, and 2 below.
const sprite = { w: 3, h: 2, px: new Uint8Array([0, 1, 3, 2, 0, 0]), dx: 0, dy: 0 };

/** The RGBA at (x, y) of the most recent putImageData. */
function pixelAt(img: any, x: number, y: number): number[] {
  const at = (y * img.width + x) * 4;
  return Array.from(img.data.slice(at, at + 4));
}

test('draw packs palette colours into ImageData and keeps transparency', () => {
  puts.length = 0;
  const ctx = makeCtx('main');
  draw(ctx, sprite as any, PALETTE, 1, 4, 5);

  assert.equal(puts.length, 1, 'one putImageData for a sprite with no accent');
  const { img, dx, dy } = puts[0];
  assert.equal(dx, 4, 'the frame offset is honoured');
  assert.equal(dy, 5);
  assert.equal(img.width, 3);
  assert.equal(img.height, 2);
  assert.deepEqual(pixelAt(img, 0, 0), [0, 0, 0, 0], 'index 0 stays fully transparent');
  assert.deepEqual(pixelAt(img, 1, 0), [255, 0, 0, 255], 'slot 1 is the red the palette named');
  assert.deepEqual(pixelAt(img, 2, 0), [0, 0, 255, 255], 'slot 3 is blue');
  assert.deepEqual(pixelAt(img, 0, 1), [0, 255, 0, 255], 'the second row is placed below');
});

test('an integer scale goes through the scratch canvas, once, at the right rect', () => {
  puts.length = 0;
  draws.length = 0;
  const ctx = makeCtx('main');
  draw(ctx, sprite as any, PALETTE, 4, 0, 0);
  assert.equal(puts.length, 1, 'the frame is rasterized 1:1 into the scratch canvas');
  assert.equal(draws.length, 1, 'and blitted to the target exactly once');
  assert.deepEqual(draws[0].rest, [0, 0, 3, 2, 0, 0, 12, 8],
    'the destination is the 4× rect: source 3×2 → 12×8');
  assert.equal(scratchChunks.length, 1, 'one scratch canvas, reused — not one per frame');
  draw(ctx, sprite as any, PALETTE, 4, 0, 0);
  assert.equal(scratchChunks.length, 1, 'and the second frame reuses it');
});

test('an accent is a second blit, offset inside the frame', () => {
  puts.length = 0;
  const withProp = {
    ...sprite,
    prop: { w: 1, h: 1, px: new Uint8Array([2]), x: 1, y: 1 },
  };
  draw(makeCtx('main'), withProp as any, PALETTE, 1, 2, 3);
  assert.equal(puts.length, 2, 'body first, then the accent');
  assert.deepEqual(pixelAt(puts[1].img, 0, 0), [0, 255, 0, 255], 'the accent paints its own pixel');
  assert.deepEqual([puts[1].dx, puts[1].dy], [3, 4], 'at the frame offset plus the accent position');
});

test('the colour table follows the palette, not a stale global one', () => {
  puts.length = 0;
  const ctx = makeCtx('main');
  draw(ctx, sprite as any, PALETTE, 1, 0, 0);
  assert.deepEqual(pixelAt(puts[0].img, 1, 0), [255, 0, 0, 255]);
  // The same sprite pixels against a different palette must pack the NEW
  // colours: the table is keyed by the palette array, not by the artwork.
  const other = ['transparent', '#123456'];
  draw(ctx, sprite as any, other, 1, 0, 0);
  assert.deepEqual(pixelAt(puts[1].img, 1, 0), [0x12, 0x34, 0x56, 255]);
  assert.deepEqual(pixelAt(puts[1].img, 2, 0), [0, 0, 0, 0],
    'a slot the palette does not carry stays transparent');
});
