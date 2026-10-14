// The pet's rhythm knobs.  One flat object, no persistence and no Config: a
// loader plugin can only declare a Cordis `Config` when its build bundles
// `@deepseek-ai/schemastery`, which ships no client artifact, so these stay
// compile-time constants by necessity — and they are all the tuning there is.

export const TUNING = {
  /** false renders a purely decorative pet (the state machine short-circuits). */
  reactToStatus: true,
  /** How long after the last activity the pet falls asleep. */
  sleepAfterMs: 60_000,
  /**
   * Below this dwell, a state change switches the ARTWORK but keeps the
   * playback phase.  `think` / `stream` / `tool` flap while a tool call's
   * arguments stream in, and restarting the cycle at frame 0 on every flap
   * played only the first frame — a twitch instead of an animation.
   */
  stateMinDwellMs: 150,
  /**
   * How many whole plays of one animation are held before the player rolls the
   * state's next one.  A many-action state (idle carries 61) re-rolled every
   * cycle changed activity every couple of seconds; a hold makes it read as a
   * pet doing something for a while.  A state CHANGE ignores the hold.
   */
  minPlays: 3,
  /** Up to this many extra plays, drawn at random, so the rhythm is not metronomic. */
  playJitter: 2,
  /**
   * How long one speech line is held before the player draws the state's next
   * one.  Deliberately its own knob: an animation cycle is 1.2–3.4 s and text
   * that fast cannot be read.  A state CHANGE and a change of the facts
   * signature (a new tool, unread flipping) bypass the dwell.
   */
  lineDwellMs: 7000,
  /** Up to this many extra ms on a line, drawn at random. */
  lineJitterMs: 2500,
  /**
   * How long ONE tool call may run before "waiting" becomes the honest story.
   * Past this the pet stops narrating the work (`shell`/`read`/…) and starts
   * narrating the wait (`slow`) — the category still reaches the line as
   * `{tool}`/`{secs}`, so nothing is lost.  45 s is deliberately well past an
   * ordinary command, so `slow` stays meaningful instead of constant.
   */
  slowToolMs: 45_000,
  /**
   * 同一个状态一直不换时，话要**越来越稀**：第 n 次"同一状态里又开口"的停顿 =
   * 基础停顿 × (1 + lineIdleStretch × n)，封顶 `lineIdleMax` 倍。
   *
   * 为什么需要它：开场那几句按 7–9.5 s 的节奏是好的（有活干、有变化），但一个长
   * 工具跑上几分钟，状态一直不变，这个节奏就变成"每 7 秒念一句"的噪音。 变的是
   * **状态不变时的密度**，不是全局节奏 —— 状态/事实一变，stretch 立刻归零。
   */
  lineIdleStretch: 0.5,
  /** 上面那个拉伸的上限（倍）。 3 倍 ≈ 21–28.5 s 一句，之后不再变稀。 */
  lineIdleMax: 3,
  /**
   * 近期窗口：这么多条之内不重复说同一句。 独立抽签会复读（40 条的池子约 5 分钟
   * 绕回来），窗口把"随机"变成"洗牌"。
   */
  lineRecentWindow: 24,
  /** 一串最多几拍。 一串之内短打扮着长停顿，像人在追着一件事说。 */
  lineMaxBeat: 3,
  /** 这一拍之后有多大概率紧接着补一句（而不是等满停顿）。 */
  lineBurstChance: 0.25,
  /** 追赶时的停顿（ms）。 */
  lineBurstMs: [1200, 2600] as const,
  /** 手上有活时，有多大概率夹一句填充词（"嗯…"）。 */
  lineContinuerChance: 0.22,
  /** 填充词的停顿（ms）——比实句短，像随口应一声。 */
  lineContinuerMs: [2500, 5000] as const,
  /**
   * 留白：一段说完之后，她可能整拍**不吭声**。 这是"说得太密"唯一的真解法 ——
   * 只把停顿拉长，读数还是"每 N 秒念一句"；留白才有呼吸。
   *
   * 只在**上一次真的说了话**之后掷（`!silent`），所以不会连着留白 —— 连着两拍
   * 无声看起来像坏掉，而不是像沉默。 事实签名或状态一变立刻打断留白：那正是
   * 值得开口的时刻。
   */
  lineSilenceChance: 0.3,
  /** 留白的时长（ms）——比一个停顿长得多，像人想了一会儿。 */
  lineSilenceMs: [10_000, 18_000] as const,
  /** 事件反应的停顿（ms）——反应要快，否则不像"听见了"。 */
  lineEventMs: [1500, 3000] as const,
  /** 本轮目标数到这个数，话题层改说"这已经是第几个了"。 */
  topicManyAt: 4,
} as const;
