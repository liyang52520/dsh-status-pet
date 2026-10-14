// The state machine: what the agent is doing → what the pet shows.
//
// A pure fold over observable session facts, so the priority order is
// verifiable without a browser.  Highest priority first: what the user owes the
// agent, then what the agent is doing, then the outcome.

import { TUNING } from './tuning.ts';
import type { PetState } from './vocabulary.ts';

/** Everything the state machine is allowed to know about the session. */
export interface PetFacts {
  /** false renders a decorative pet — the machine returns `idle` outright. */
  enabled?: boolean;
  /** `pendingInteraction.kind`, or null. */
  pending: string | null;
  /** Running OR a submission echo still in flight. */
  running: boolean;
  errored: boolean;
  unread: boolean;
  /** What the agent is producing right now, if anything. */
  activity: 'tool' | 'stream' | null;
  /** Synthetic: `0` while awake, `sleepAfterMs` once the sleep timer fired.  It
   *  is a boundary, not a clock — the view owns the one timeout. */
  idleMs: number;
}

export function deriveState(f: PetFacts): PetState {
  if (f.enabled === false) return 'idle';
  if (f.pending === 'approval') return 'approval';
  if (f.pending === 'question') return 'question';
  if (f.running) {
    if (f.activity === 'tool') return 'tool';
    if (f.activity === 'stream') return 'stream';
    return 'think';
  }
  if (f.errored) return 'error';
  if (f.unread) return 'done';
  if (f.idleMs >= TUNING.sleepAfterMs) return 'sleep';
  return 'idle';
}
