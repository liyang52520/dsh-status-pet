// Harness: stub `window` for Node, print wall-clock times.
import { performance } from 'node:perf_hooks';

function statsObj() {
  let w = 0;
  let b = 0;
  return {
    reset() { w = b = 0; },
    writes() { return w; },
    bytesWritten() { return b; },
    record(n) { w++; b += n; },
  };
}

export function stubWindow() {
  const net = statsObj();
  const mem = new Map();
  globalThis.window = {
    localStorage: {
      getItem(k) { return mem.has(k) ? mem.get(k) : null; },
      setItem(k, v) { net.record(String(v).length); mem.set(k, String(v)); },
      removeItem(k) { mem.delete(k); },
    },
    CustomEvent: function (type) { this.type = type; },
    dispatchEvent() {},
    addEventListener() {},
    removeEventListener() {},
  };
  return {
    stats() { return { writes: net.writes(), bytesWritten: net.bytesWritten() }; },
    reset() { net.reset(); },
  };
}

export function time(label, fn, times) {
  if (!times) times = 3;
  fn(); // warm
  const start = performance.now();
  for (let i = 0; i < times; i++) fn();
  const ms = (performance.now() - start) / times;
  console.log(`  ${label.padEnd(52)} ${String(ms.toFixed(3)).padStart(9)} ms`);
}

export function section(title) {
  console.log(`\n${title}`);
  console.log('  ' + '-'.repeat(50));
}