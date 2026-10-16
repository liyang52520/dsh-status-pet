// reduced-motion hook: read `prefers-reduced-motion` into a stable ref so the
// loop can freeze on each animation's first frame without a React re-render.
//
// ONE query, ONE listener, ONE ref — shared by every surface.  The Workshop
// mounts 200+ canvases and each of them used to build its own `MediaQueryList`
// (and its own change listener) for the very same question; `matchMedia` is not
// free and the answer cannot differ between two canvases on one page.
//
// The ref object is the SAME object for every caller, which is also what makes
// it safe to read from a `requestAnimationFrame` callback: the listener writes
// `.current` and nothing has to re-render.

/** The one shared answer. */
const REDUCED: { current: boolean } = { current: false };

let installed = false;

function install(): void {
  // 只有**真的装上了**才算装过：早先的实现先置 `installed = true` 再检查
  // `window`，于是"模块先于全局被加载"这一种情况会永久锁死成 false —— 而那种情况
  // 正是它自己声称要防的。
  if (installed) return;
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    REDUCED.current = query.matches;
    const onChange = () => { REDUCED.current = query.matches; };
    if (typeof query.addEventListener === 'function') query.addEventListener('change', onChange);
    else if (typeof query.addListener === 'function') query.addListener(onChange);
    installed = true;
  } catch {
    // A host without matchMedia: motion stays on, exactly as before.
  }
}

/** The shared answer.  Shaped like a ref so every call site is unchanged. */
export function useReducedMotion(): { current: boolean } {
  // Idempotent and lazy: some environments import this module before their
  // globals exist, so it cannot run at module scope.
  install();
  return REDUCED;
}

/** Read the shared answer without rendering — the surface layer's path. */
export function reducedMotion(): { current: boolean } {
  install();
  return REDUCED;
}
