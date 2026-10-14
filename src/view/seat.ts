// The dock seat's status: read the session's standard props through narrow
// selectors, fold them into `PetFacts` for the state machine, and own the ONE
// sleep timeout — no polling interval, at most two re-renders per sleep cycle.

import { React } from '../platform/deps.ts';
import { TUNING } from '../behavior/tuning.ts';
import type { PetFacts } from '../behavior/facts.ts';
import type { Reaction } from '../behavior/vocabulary.ts';
import type { Translator } from '../labels/index.ts';

// Fallbacks keep the hook count stable when the slot omits a prop, so a
// contract change degrades to a decorative pet instead of a blank slot.
const NO_SESSION = {
  running: false as boolean,
  openState: '' as string,
  lastAgentError: null as unknown,
  promptError: null as unknown,
  pendingSubmissions: [] as unknown[],
};
const NO_STATUS = new Map();
const NO_CHAT = { legacy: { runningCalls: [] as Array<{ phase: string; name?: string }>, partial: null } };

type Selector<T> = (value: T) => unknown;
type SnapshotHook<T> = (select: Selector<T>) => any;

function useNoSession<T>(select: Selector<T>) { return select(NO_SESSION as unknown as T); }
function useNoStatus<T>(select: Selector<T>) { return select(NO_STATUS as unknown as T); }
function useNoChat<T>(select: Selector<T>) { return select(NO_CHAT as unknown as T); }

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
  toolName: string | null;
}

export function usePetStatus(props: DockSeatProps): PetStatus {
  const useSession: SnapshotHook<typeof NO_SESSION> = props.useSession || useNoSession;
  const useStatus: SnapshotHook<Map<string, unknown>> = props.useSessionStatus || useNoStatus;
  const useChat: SnapshotHook<typeof NO_CHAT> = props.useChat || useNoChat;
  const sessionId = props.sessionId;

  const busy = useSession((s) =>
    s.running || (s.pendingSubmissions ? s.pendingSubmissions.length > 0 : false)
  );
  const errored = useSession((s) =>
    s.openState === 'error' || s.lastAgentError != null || s.promptError != null
  );
  const pending = useStatus((map) => {
    if (sessionId === undefined) return null;
    const entry = map.get(sessionId) as { pendingInteraction?: { kind: string } } | undefined;
    const interaction = entry && entry.pendingInteraction;
    return interaction ? interaction.kind : null;
  });
  const unread = useStatus((map) => {
    if (sessionId === undefined) return false;
    const entry = map.get(sessionId) as { completionUnread?: boolean } | undefined;
    return entry ? !!entry.completionUnread : false;
  });
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

  const active = busy || pending !== null;
  const [sleeping, setSleep] = React.useState(false);
  React.useEffect(() => {
    if (active) { setSleep(false); return; }
    const id = setTimeout(() => setSleep(true), TUNING.sleepAfterMs);
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

// Re-export for the view's convenience.
export type { PetFacts, Reaction };