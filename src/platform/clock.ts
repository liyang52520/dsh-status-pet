// The shared frame clock: ONE requestAnimationFrame loop for every pet canvas
// on the screen.  Many mounted canvases still cost a single rAF and a single
// `visibilitychange` listener.

type TickFn = (now: number) => void;
const tickers = new Set<TickFn>();
let raf = 0;
let watchingVisibility = false;

function frame(now: number): void {
  raf = 0;
  for (const tick of Array.from(tickers)) tick(now);
  if (tickers.size) raf = requestAnimationFrame(frame);
}

function ensureRunning(): void {
  if (!raf && tickers.size && (typeof document === 'undefined' || !document.hidden)) {
    raf = requestAnimationFrame(frame);
  }
}

// A hidden tab costs nothing.
function onVisibility(): void {
  if (document.hidden) {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  } else {
    ensureRunning();
  }
}

/** Register a per-frame callback.  Returns a disposer — calling it removes the
 *  callback and, when it was the last, cancels the rAF loop. */
export function addTicker(tick: TickFn): () => void {
  tickers.add(tick);
  if (!watchingVisibility && typeof document !== 'undefined'
    && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', onVisibility);
    watchingVisibility = true;
  }
  ensureRunning();
  return () => {
    tickers.delete(tick);
    if (!tickers.size && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
}