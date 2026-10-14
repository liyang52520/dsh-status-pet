// The transient reaction: petted / woken.  `react(name)` sets a timer that
// outranks the derived state while it lasts and then expires on its own.

import { React } from '../platform/deps.ts';
import { REACTIONS } from '../behavior/vocabulary.ts';
import type { Reaction } from '../behavior/vocabulary.ts';

export function useReaction() {
  const [reaction, setReaction] = React.useState<Reaction | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | 0>(0);
  React.useEffect(() => () => clearTimeout(timerRef.current), []);
  function react(name: Reaction) {
    const spec = REACTIONS[name];
    if (!spec) return;
    setReaction(name);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setReaction(null), spec.durationMs);
  }
  return { reaction, react } as const;
}