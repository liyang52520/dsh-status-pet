// The take channel: the dock leads, the popup follows.
//
// The dock (LEADER) publishes the animation it is playing and the wall-clock
// instant its cycle started on every tick.  The popup (FOLLOWER) reads that and
// draws the same frame instead of rolling its own.  A follower whose state
// differs from the leader's — the popup playing a reaction while the dock shows
// the derived state — simply plays freely, and a leader that has been silent
// for 250 ms (its tab hidden, its ticker stopped) is treated as absent.
//
// One module-level mutable channel, so publishing costs no allocation per frame.

/** The leader's live take. */
const BOOTH = {
  skinName: '',
  state: '',
  animationIndex: 0,
  cycleStart: 0,
  at: 0,
};

/** A follower stops trusting the leader after this many ms of silence. */
const STALE_MS = 250;

export type LeadTake = {
  animationIndex: number;
  cycleStart: number;
};

/** Call this from a LEADER every tick. */
export function publish(skinName: string, state: string, animationIndex: number, cycleStart: number, now: number): void {
  BOOTH.skinName = skinName;
  BOOTH.state = state;
  BOOTH.animationIndex = animationIndex;
  BOOTH.cycleStart = cycleStart;
  BOOTH.at = now;
}

/** Ask for the leader's take.  Returns null when the follower is showing a
 *  different state of a different skin, or when the leader is stale. */
export function leadTake(skinName: string, state: string, animationCount: number, now: number): LeadTake | null {
  if (BOOTH.skinName !== skinName || BOOTH.state !== state) return null;
  if (now - BOOTH.at > STALE_MS) return null;
  const index = ((BOOTH.animationIndex % animationCount) + animationCount) % animationCount;
  return { animationIndex: index, cycleStart: BOOTH.cycleStart };
}