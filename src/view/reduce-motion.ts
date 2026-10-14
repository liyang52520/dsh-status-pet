// reduced-motion hook: read `prefers-reduced-motion` into a stable ref so the
// loop can freeze on each animation's first frame without a React re-render.

import { React } from '../platform/deps.ts';

export function useReducedMotion(): { current: boolean } {
  const ref = React.useRef(false);
  React.useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    ref.current = query.matches;
    const onChange = () => { ref.current = query.matches; };
    if (typeof query.addEventListener === 'function') query.addEventListener('change', onChange);
    else if (typeof query.addListener === 'function') query.addListener(onChange);
    return () => {
      if (typeof query.removeEventListener === 'function') query.removeEventListener('change', onChange);
      else if (typeof query.removeListener === 'function') query.removeListener(onChange);
    };
  }, []);
  return ref;
}