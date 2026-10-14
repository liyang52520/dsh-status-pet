// Pixel-perfect sprite rasterization.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Stub canvas with fillStyle recording.
(globalThis as any).document = {
  createElement: (tag: string) => {
    if (tag === 'canvas') return {
      width: 0, height: 0,
      getContext: () => ({
        imageSmoothingEnabled: true,
        fillStyle: '',
        putImageData: undefined,
        fillRect: function (x: number, y: number, w: number, h: number) {
          (this as any)._last = { x, y, w, h, fill: this.fillStyle };
        },
        clearRect: () => {},
      }),
    };
    return {};
  },
};

const { drawSprite } = await import('../src/platform/raster.ts');

test('drawSprite paints every opaque pixel', () => {
  const ctx = (globalThis as any).document.createElement('canvas').getContext();
  const sprite = {
    w: 2, h: 2, px: new Uint8Array([1, 0, 0, 2]), dx: 0, dy: 0,
  };
  const palette = ['transparent', '#aa0000', '#00aa00'];
  // Fill the canvas with a context that records fills.
  let painted = 0;
  const mockCtx = {
    imageSmoothingEnabled: true,
    fillStyle: '',
    fillRect: function (x: number, y: number, w: number, h: number) {
      if (w === 1 && h === 1) painted++;
    },
    clearRect: () => {},
  };
  // Skip ImageData path.
  (mockCtx as any).putImageData = undefined;
  drawSprite(mockCtx as any, sprite, palette, 1, 0, 0);
  assert.equal(painted, 2, 'two opaque pixels painted');
});

test('sprite with prop draws both layers', () => {
  let calls = 0;
  const ctx = {
    imageSmoothingEnabled: true, fillStyle: '',
    fillRect: () => { calls++; },
    clearRect: () => {},
    putImageData: undefined as any,
  };
  const sprite = {
    w: 1, h: 1, px: new Uint8Array([1]), dx: 0, dy: 0,
    prop: { w: 1, h: 1, px: new Uint8Array([2]), x: 5, y: 2 },
  };
  drawSprite(ctx as any, sprite, ['transparent', '#111111', '#222222'], 1, 0, 0);
  assert.ok(calls >= 2, 'prop pixels were also painted');
});