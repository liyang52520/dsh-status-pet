// A tiny wall-clock benchmark harness for the store/resolution hot paths.
// Node runs the TypeScript source directly (type-stripping), so this measures
// the real modules the bundle ships — no bundler, no browser.
//
//   node bench/harness.mjs
//
// It stubs exactly what the modules touch: `window.localStorage`, the
// CustomEvent/event-target pair the store broadcasts over, and `document` for
// the sprite cache (left undefined here, so the cache falls back to draw()).

import { performance } from 'node:perf_hooks';

export function stubWindow() {
  const mem = new Map();
  let writes = 0;
  let bytesWritten = 0;
  let reads = 0;
  globalThis.window = {
    localStorage: {
      getItem(k) { reads++; return mem.has(k) ? mem.get(k) : null; },
      setItem(k, v) { writes++; bytesWritten += String(v).length; mem.set(k, String(v)); },
      removeItem(k) { mem.delete(k); },
    },
    CustomEvent: function (type) { this.type = type; },
    dispatchEvent() {},
    addEventListener() {},
    removeEventListener() {},
  };
  return {
    mem,
    stats: () => ({ writes, bytesWritten, reads }),
    reset: () => { writes = 0; bytesWritten = 0; reads = 0; },
  };
}

export function time(label, fn, runs = 1) {
  // One warm-up pass, then `runs` measured passes; report the mean.
  fn();
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) fn();
  const ms = (performance.now() - t0) / runs;
  console.log(`  ${label.padEnd(52)} ${ms.toFixed(2).padStart(9)} ms`);
  return ms;
}

export function section(title) {
  console.log('\n' + title);
  console.log('─'.repeat(72));
}
