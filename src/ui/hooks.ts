// Pet hooks — the dock pet's logic extracted from the component, so
// dock-pet.ts is wiring and markup, and pet-preview.ts can reuse the
// reaction machinery.  Two hooks:
//
//   usePetStatus   reads the seat's session props through narrow selectors
//                  and folds them into PetFacts for derivePetState, including
//                  the sleep timer (one timeout after activity ends — no
//                  polling interval, no periodic re-renders).
//   usePetReaction owns the transient override (petted / woken) and its
//                  expiry timer.

import { React } from '../host-deps.ts';
import { TUNING, REACTIONS } from '../pet/behavior.ts';
import type { PetFacts, ReactionName } from '../pet/behavior.ts';
import type { Translator } from '../pet/labels.ts';

// Fallbacks keep the hook call count stable when the slot omits a prop, so
// a contract change degrades to a decorative pet instead of a blank entry.
const NO_SESSION = {
  running: false,
  openState: 'open',
  lastAgentError: null,
  promptError: null,
  pendingSubmissions: [] as unknown[],
};
const NO_STATUS = new Map();
const NO_CHAT = { legacy: { runningCalls: [] as Array<{ phase: string; name?: string }>, partial: null } };

type Selector<T> = (value: T) => unknown;
type SnapshotHook<T> = (select: Selector<T>) => any;

function useNoSession<T>(select: Selector<T>) {
  return select(NO_SESSION as T);
}
function useNoStatus<T>(select: Selector<T>) {
  return select(NO_STATUS as T);
}
function useNoChat<T>(select: Selector<T>) {
  return select(NO_CHAT as T);
}

/** The status props the `conversation.composer.dock` seat hands the pet. */
export interface DockSeatProps {
  useSession?: SnapshotHook<typeof NO_SESSION>;
  useSessionStatus?: SnapshotHook<Map<string, { pendingInteraction?: { kind: string }; completionUnread?: boolean }>>;
  useChat?: SnapshotHook<typeof NO_CHAT>;
  sessionId?: string;
  t?: Translator;
}

export interface PetStatus {
  facts: PetFacts;
  /** The executing tool call's name, while one is executing. */
  toolName: string | null;
}

export function usePetStatus(props: DockSeatProps): PetStatus {
  const useSession: SnapshotHook<typeof NO_SESSION> = props.useSession || useNoSession;
  const useSessionStatus = props.useSessionStatus || useNoStatus;
  const useChat: SnapshotHook<typeof NO_CHAT> = props.useChat || useNoChat;
  const sessionId = props.sessionId;

  // Narrow selectors: a re-render happens on a real transition, never per
  // streamed token.  `useChat` does force Chat assembly on, but the shipped
  // stats pill at this same seat already subscribes to it.
  // `busy` bridges the gap between pressing enter and the first durable
  // turn event: `running` is event-driven, so a submission echo still in
  // flight counts as busy too — the pet reacts the instant you hit send.
  const busy = useSession((s) =>
    s.running || (s.pendingSubmissions ? s.pendingSubmissions.length > 0 : false)
  );
  const errored = useSession((s) =>
    s.openState === 'error' || s.lastAgentError != null || s.promptError != null
  );
  const pending = useSessionStatus((map) => {
    if (sessionId === undefined) return null;
    const entry = map.get(sessionId);
    const interaction = entry && entry.pendingInteraction;
    return interaction ? interaction.kind : null;
  });
  const unread = useSessionStatus((map) => {
    if (sessionId === undefined) return false;
    const entry = map.get(sessionId);
    return entry ? !!entry.completionUnread : false;
  });
  // A tool call is only *executing* once dispatched (phase 'start'); while
  // the model is still generating its arguments (phase 'preparing') the
  // agent is producing output, which reads as stream.  The executing
  // call's name feeds the tooltip ("Running bash…").
  const activity: 'tool' | 'stream' | null = useChat((s) => {
    const calls = s.legacy.runningCalls;
    for (let i = 0; i < calls.length; i++) if (calls[i].phase === 'start') return 'tool';
    if (calls.length > 0 || s.legacy.partial !== null) return 'stream';
    return null;
  });
  const toolName: string | null = useChat((s) => {
    const calls = s.legacy.runningCalls;
    for (let i = 0; i < calls.length; i++) if (calls[i].phase === 'start') return calls[i].name || null;
    return null;
  });

  // Sleep: while anything is active the pet stays awake; once quiet, ONE
  // timeout flips it to asleep after sleepAfterMs.  No polling interval —
  // at most two re-renders per sleep cycle (in and out).
  const active = busy || pending !== null;
  const [sleeping, setSleeping] = React.useState(false);
  React.useEffect(() => {
    if (active) {
      setSleeping(false);
      return;
    }
    const id = setTimeout(() => setSleeping(true), TUNING.sleepAfterMs);
    return () => clearTimeout(id);
  }, [active]);

  return {
    facts: {
      enabled: TUNING.reactToStatus,
      pending,
      running: busy,
      errored,
      unread,
      activity,
      idleMs: sleeping ? TUNING.sleepAfterMs : 0,
    },
    toolName,
  };
}

export interface PetReaction {
  reaction: ReactionName | null;
  react: (name: ReactionName) => void;
}

// One place to add an interaction's trigger: `react(name)` sets a transient
// override with the reaction's own duration; the override outranks the
// derived state while it lasts and then expires on its own.
export function usePetReaction(): PetReaction {
  const [reaction, setReaction] = React.useState<ReactionName | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | 0>(0);
  React.useEffect(() => () => clearTimeout(timerRef.current), []);
  function react(name: ReactionName) {
    const spec = REACTIONS[name];
    if (!spec) return;
    setReaction(name);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setReaction(null), spec.durationMs);
  }
  return { reaction, react };
}
