// The shared frame clock: ONE requestAnimationFrame loop for every pet canvas
// on the screen.  Many mounted canvases still cost a single rAF and a single
// `visibilitychange` listener.

type TickFn = (now: number) => void;
const tickers = new Set<TickFn>();
/** The iteration order handed to the frame.  Rebuilt only when the ticker SET
 *  changes — a surface attaching or detaching, i.e. a scroll crossing the
 *  warm-up margin — so the steady state allocates nothing per frame. */
let order: TickFn[] = [];
let orderStale = false;
let raf = 0;
let watchingVisibility = false;

function frame(now: number): void {
  raf = 0;
  if (orderStale) {
    order = Array.from(tickers);
    orderStale = false;
  }
  for (let i = 0; i < order.length; i++) order[i](now);
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
  orderStale = true;
  if (!watchingVisibility && typeof document !== 'undefined'
    && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', onVisibility);
    watchingVisibility = true;
  }
  ensureRunning();
  return () => {
    if (!tickers.delete(tick)) return;
    orderStale = true;
    if (!tickers.size && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
}

/** How many surfaces are currently attached to the clock.  The perf contract
 *  reads this: off-screen canvases must NOT be here. */
export function tickerCount(): number {
  return tickers.size;
}