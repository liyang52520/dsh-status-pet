// The 状态 header preview — the one picture in the Workshop that keeps the
// state list honest.
//
// The header hands <PetCanvas> a SOURCE, and a source that names a field its
// kind does not carry is nowhere an error: the session answers `null`, the
// surface has nothing to draw, and the preview becomes a silently blank box the
// width of the canvas.  That is exactly what shipped once — `{kind:'skin'}` was
// handed a `skin` instead of a `name` — so this file pins the contract from both
// ends: the shape of the source, and that the shape PAINTS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SkinSource } from '../src/view/pet-canvas.ts';

// ── a DOM good enough for the surface driver (its fillRect path) ──

type Ops = string[];

function makeCanvas() {
  const ops: Ops = [];
  const canvas = {
    width: 0,
    height: 0,
    style: {} as Record<string, string>,
    ops,
    getContext: () => ({
      imageSmoothingEnabled: false,
      fillStyle: '',
      // No ImageData on this context: the sprite is painted one fillRect per
      // pixel, which is what makes the recorded ops a real read-out.
      putImageData: undefined,
      clearRect: () => ops.push('clear'),
      fillRect: () => ops.push('fill'),
      drawImage: () => ops.push('blit'),
    }),
  };
  return canvas;
}

(globalThis as any).document = {
  hidden: false,
  body: {},
  addEventListener() {},
  removeEventListener() {},
  createElement: (tag: string) => (tag === 'canvas' ? makeCanvas() : {}),
};
(globalThis as any).window = {
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  CustomEvent: function (this: { type: string }, type: string) { this.type = type; },
  dispatchEvent() {},
  addEventListener() {},
  removeEventListener() {},
};

let pending: ((now: number) => void) | null = null;
(globalThis as any).requestAnimationFrame = (fn: (now: number) => void) => { pending = fn; return 1; };
(globalThis as any).cancelAnimationFrame = () => { pending = null; };

/** Run the shared clock by hand, so the test owns the frame count. */
function frames(n: number): void {
  let now = 1000;
  for (let i = 0; i < n; i++) {
    const cb = pending;
    pending = null;
    if (cb) cb(now += 33);
  }
}

const { CATALOG } = await import('../src/skin/catalog.ts');
const { DEFAULT_SKIN } = await import('../src/skin/registry.ts');
const { installCatalog } = await import('../src/skin/session.ts');
const { headerSource } = await import('../src/view/settings/assignment-list.ts');
const { resolveSource } = await import('../src/view/pet-canvas.ts');
const { startSurface } = await import('../src/platform/surface.ts');
const { LIVE_ZOOM } = await import('../src/skin/geometry.ts');

installCatalog(CATALOG);

const ACTION = CATALOG[DEFAULT_SKIN].actions[0].id;

/** Draw one source for a few frames and report what the canvas was asked to
 *  do.  Nothing but `clear` (or nothing at all) means a blank preview. */
function paint(source: SkinSource, state: string): Ops {
  const canvas = makeCanvas();
  const dispose = startSurface(canvas as unknown as HTMLCanvasElement, {
    skin: resolveSource(source),
    state: { current: state },
    reduced: { current: false },
    scale: (skin) => (skin.face === 'avatar' ? 4 : 1),
    zoom: LIVE_ZOOM,
    roll: 'free',
  });
  frames(3);
  dispose();
  return canvas.ops;
}

test('the header asks for the skin by NAME, and for a hovered action by id', () => {
  assert.deepEqual(headerSource(DEFAULT_SKIN, null), {
    kind: 'skin', name: DEFAULT_SKIN, face: 'body',
  });
  assert.deepEqual(headerSource(DEFAULT_SKIN, ACTION), {
    kind: 'action', skin: DEFAULT_SKIN, actionId: ACTION, face: 'body',
  });
});

test('every header source resolves, at the body face', () => {
  for (const source of [headerSource(DEFAULT_SKIN, null), headerSource(DEFAULT_SKIN, ACTION)]) {
    const skin = resolveSource(source)();
    assert.ok(skin, `the ${source.kind} source resolves to a skin`);
    assert.equal(skin!.face, 'body', 'the header previews the body, not the avatar crop');
  }
});

test('the state preview paints — a nameless source is the blank box this pins down', () => {
  const idle = paint(headerSource(DEFAULT_SKIN, null), 'idle');
  assert.ok(idle.includes('fill') || idle.includes('blit'),
    'the state header draws its animation, not an empty canvas');

  const hover = paint(headerSource(DEFAULT_SKIN, ACTION), ACTION);
  assert.ok(hover.includes('fill') || hover.includes('blit'),
    'the hovered action paints too');

  // The documented trap: `{kind:'skin'}` without its `name` resolves to null,
  // and a null skin is a canvas the surface never draws on — no error, no
  // picture, exactly the bug this file exists for.
  const nameless = { kind: 'skin', face: 'body' } as unknown as SkinSource;
  assert.equal(resolveSource(nameless)(), null, 'a nameless skin source resolves to null');
  const blank = paint(nameless, 'idle');
  assert.ok(!blank.includes('fill') && !blank.includes('blit'), 'and paints nothing at all');
});
