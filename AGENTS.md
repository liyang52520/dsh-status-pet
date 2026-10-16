# Status Pet — AGENTS.md

Whale-chan (鲸鱼娘) — a tiny pixel-art whale maid — lives in the DSH conversation
composer dock (the status bar above the chat input).  **It shows what the agent is
doing** — sleeping when nothing happens, working while a tool runs, bowing up when
something needs your approval, sheepish when a turn fails.  **It also talks**: a
speech line sits beside the avatar (left / right / off, a setting) and rotates, rendered
with the REAL context of what you are doing (`{file}`, `{cmd}`, `{pat}`, `{secs}`, …), and
the click popup shows the very same line.  V2 gave her **22 states** and **sequences + bridges**; **V3 gave her a discourse
engine** — a recency window so she stops repeating herself, bursts and murmurs so the
rhythm is not a metronome, **event reactions** to what YOU just did, **topic continuity**
(same file / new file / the Nth one), and a mood that shifts with a losing or winning
streak.  ~3,200 lines per locale.  Click it and the **big picture pops up**:
an anchored, animated, pettable panel.  The Settings tab swaps **skins**, shows her
whole **action library** one animation at a time, and lets you change **which of a
skin's own actions each state plays**.

### The three layers

| Layer | Where | What lives here | Rendering |
|---|---|---|---|
| Resident | dock, far left | the pet itself, plus her **speech line** when enabled | the 32 px **avatar** face, backing 40×40, at `LIVE_ZOOM` → **16 CSS px of art**; the line is plain 12 px text in a **fixed-width box** (long lines scroll inside it, so the dock never moves) |
| Peek | the click popup | the big animated **full body** + every interaction | the 128 px **body** face, backing 160×160, at `LIVE_ZOOM` → **64 CSS px of art** |
| Workshop | Settings → Status Pet | skin cards, the dock-line setting, ONE axis **状态** / **动作** | 状态 header at `LIVE_ZOOM`; 动作 board at 1:1; every library row a PLAYING thumbnail at 1:1 |

---

## Project Overview

| Field | Value |
|---|---|
| Package | `@local/dsh-status-pet` — client-plugin bundle, flat root |
| Mount points | `conversation.composer.dock` (id `status-pet`, order **−1000**, far left); `settings.section` (order 30, after agent-presets) |
| Rendering | Canvas 2D, **integer ratios only** |
| Sprite model | One action = one animation with TWO faces — `art.avatar` (required) and `art.body` (optional, falls back to avatar at 4×), 1–8 frames. Frame `ms` / `dx` / `dy` are SINGLE SOURCE. A state holds a list of action ids (≤64); empty/absent = follow idle. The dock leads, the popup mirrors. |
| Text model | TWO kinds of text, deliberately separate — the **status** (22 keys + `toolNamed`, tooltip + `aria-label`, derived from facts, never moved by artwork) and the **line** (~3,200 per locale across five layers: state pools with **sequences**, **bridges** per transition, **continuers** (murmurs), **events** (edge reactions) and **topics** (target continuity), rendered with live context variables). The dock OWNS the line and hands the same string to the popup. |
| Discourse model | `stepDiscourse` is a pure fold: recency window (shuffle-bag), bursts (`beat`), continuers that **do not break sequence memory**, event preemption on fact edges, topic edges that speak once per change, and tone choice biased by mood. Every beat speaks: there is no silent beat. Every rule is unit-tested against synthetic tables (`test/discourse.test.ts`) and the real tables are pinned too (`test/lines.test.ts`, `test/pools.test.ts`). |
| State model | 22 states + 2 reactions, every one backed by a real signal: pending interaction kind (incl. `plan-review`), running tool calls (name→category, raw args, turn/step, start time, concurrency), assistant stream block kind (text/reasoning/tool-call). |
| Dependencies | `react` + seeded `@deepseek-ai/dsh-client-ui-primitives` (guarded; native `title` fallback), both from the web shell |
| Build | **tsdown**, two IIFE builds: `src/index.ts` → `client.js` (648 kB, gzip ≈150 kB), `src/artwork.ts` → `client.artwork.js` (15.6 MB, fetched on demand) |

---

## File Structure

```
src/
  index.ts / artwork.ts / plugin.ts   entry (thin)
  behavior/                                 pure domain (no DOM, no React)
    tuning.ts          rhythm knobs (artwork AND text)
    facts.ts           PetFacts + deriveState (state machine)
    vocabulary.ts      STATES / REACTIONS / STATE_NAMES / TONES
    discourse.ts       the speech ENGINE (V3): recent window, beats, continuers,
                       events, topics, mood — pure, tables and random injectable
    line-pools.ts      the pool STRUCTURE: state lines + bridges + continuers +
                       events + topics (GENERATED)
    tool-catalog.ts    wire tool name → work category (shell/read/search/write/web/agent/plan/deliver)
    context.ts         argsRaw → line variables; varsForFacts; renderLine (the `{var}`
                       renderer, including the missing-variable fallbacks)
  labels/                              i18n (shared across layers)
    en.ts  zh.ts       the two shipped locales + the settings copy
    index.ts           NS + LABELS (state copy + ~3200 lines) + translatorOrFallback
    lines/zh.ts        every line entry, zh — 3,192 (GENERATED header, but it IS the source)
    lines/en.ts        every line entry, en — 3,192
  skin/                                artwork model + wardrobe
    geometry.ts        FACES (avatar 32 / body 128) + headroom + LIVE_ZOOM
    pixels.ts          two-char pixel codec (NIBBLE, parse, serialize, blanks)
    model.ts           Drawing / Frame / Action / Artwork + limits
    face.ts            faceFor (body 4× fallback) / hasBody / offsetScale
    library.ts         action library reads + assignment mutations
    overrides.ts       user diff + sanitizer (applyDiff)
    storage.ts         schema 1 + read/write (memoized by raw text); `dockText`
    display.ts         dockText() / dockLineWidth() — the line's placement AND its box width
    tones.ts           action → tone side table (GENERATED), 106 entries
    registry.ts        built-in registry (the chunk installs here)
    documents.ts       documentOf / libraryOf (reads, memoized per store revision)
    resolve.ts         Artwork → ResolvedSkin (pure, identity-memoized)
    session.ts         LIVE wardrobe: activeSkin, bestSkin, skinFor,
                       chooseSkin, saveAssignments, installCatalog, onSkinChange
    validate.ts        invariant check — no runtime caller; `test/artwork.test.ts`
                       runs it over every built-in
    catalog.ts         built-in artwork (15 MB, frozen, hand-edited)
  player/                              pure playback policy
    rotation.ts        which animation, how long it is held
    timeline.ts        tick reducer: elapsed → frame (pure, unit-testable)
    sync.ts            lead/follow channel
  platform/                            host adapter layer
    deps.ts            bare-specifier injection (react / primitives)
    clock.ts           shared rAF + visibilitychange
    visibility.ts      ONE IntersectionObserver: off-screen canvases are not
                       even called (they detach from the clock)
    raster.ts          sprite → canvas (ImageData / fallback)
    bitmap.ts          pre-rendered sprite bitmaps
    surface.ts         per-canvas driver (sizing, dirty-check, drawImage)
    theme.ts           stylesheet (inlined <style>)
  view/                                React components
    pet-canvas.ts      <PetCanvas> — the ONE playing element
    line.ts            useLine — the pure text policy on a self-driving timer
    line-scroll.ts     the line box: FIXED width + in-box scroll (planScroll + hook)
    reduce-motion.ts   useReducedMotion
    reaction.ts        useReaction
    seat.ts            usePetStatus
    dock/              pill.ts (the dock button + her line), popup.ts (click popup)
    settings/          page.ts, skin-cards.ts, dock-text.ts (关闭/左/右 + 窄/中/宽),
                       action-panel.ts, action-picker.ts,
                       action-thumb.ts, assignment-list.ts, board.ts, filmstrip.ts,
                       frame-canvas.ts, field.ts, confirm.ts
test/                                    the gate (node --test, no browser, no deps)
  labels.test.ts     zh/en symmetry, pool ↔ dictionary bijection, settings keys
  lines.test.ts      every line reads with every variable missing; the var renderer
  pools.test.ts      sequence integrity, bridge keys, event/topic coverage
  discourse.test.ts  the engine: blank beats, window, LRU fallback, sequences, edges
  facts.test.ts      the 22-state truth table, priority, host shape guards
  artwork.test.ts    validateArtwork over the catalog, tones, resolution, registry
  skin.test.ts       pixel codec, 4× face fallback, diff sanitizer, library, storage
  player.test.ts     the pure tick reducer and the rotation policy
  scroll.test.ts     planScroll + the spec-equals-CSS pin
```

`bench/` and `docs/` were **deleted deliberately** — they had no runtime effect (only
`src/` is built) and they were the copy pipeline.  Three consequences, so nobody is
surprised later:

- **The generator is gone.**  `src/behavior/line-pools.ts`, `src/labels/lines/{zh,en}.ts`
  and `src/skin/tones.ts` still carry a `GENERATED … Do not hand-edit` header, but that
  generator does not exist — those files ARE the source, so edit them directly.  The
  zh/en key sets must stay identical, and `test/labels.test.ts` fails if they drift.
- **The contract is enforced by the suite, not by the pipeline.**  `pnpm test` checks the
  zh/en symmetry, the pool ↔ dictionary bijection, sequence integrity, action-tone
  coverage and "every line still reads with every variable missing".
- **The SPEC baseline and the browser perf lab are gone** with `docs/`/`bench/`; the
  tracked sources are recoverable from git history, the untracked ones are simply gone
  (there is no `.deleted-sources-backup.tar.gz` — it was never committed).

---

## Architecture

### Layers (dependency direction ↓)

```
behavior  ←  skin  ←  player  ←  platform  ←  view  ←  entry
```

- **behavior / labels / skin / player** — pure, no DOM, importable in Node.
- **platform** — the only layer that touches `window`, `document`, `requestAnimationFrame`, `canvas`.  `deps.ts` is the sole injection point.
- **view** — React components.  Stateless fragments are plain functions (e.g. `field.ts`), not components, so the rendered element tree stays flat.
- **entry** — `index.ts` registers with the module loader; `plugin.ts` assembles `skinTools` + slot registrations.  `skinTools` is deliberately small and honest — names, geometry, storage, the live wardrobe and the two UI components, with no aliases (`GRIDS`, `cellFor`), no no-op stubs and no `PixelEditor: undefined` carried "for the tests" (the suite imports those modules directly).

### How it loads

1. The bundle loader fetches `client.js`.  The factory receives `require`, seeds `platform/deps.ts`, requests `./client.artwork.js` in the background, and returns `{ inject: ['slots','locale'], skinTools, apply }`.
2. Until the artwork chunk lands, the registry is empty and the pet draws a blank canvas.  The loader retries the chunk once and then warns on the console — a missing chunk degrades to a blank pet, never to a `.catch(() => {})` silence.
3. When the chunk lands, `session.installCatalog` swaps the registry, re-resolves ACTIVE, and broadcasts — every canvas picks pixels up on the next rAF frame.

### Status sources

| Prop | Reads | Cost |
|---|---|---|
| `useSessionStatus` | the whole `pendingInteraction` instance (kind + `toolName`/`reason`/`questions`), `completionUnread` | lowest |
| `useSession` | `running`, `pendingSubmissions`, `openState`, `lastAgentError`, `promptError` | low |
| `useChat` | `legacy.runningCalls` (name, `argsRaw`, phase, turn/step, time, subCalls) and `legacy.partial.blocks` (last block kind) | forces Chat assembly |

**Selectors must return reference-stable values.**  `useChat` is a store subscription: a
freshly built array per call re-renders forever.  So `seat.ts` selects the store's own
sub-objects (which the store keeps identity-stable) or primitives, and derives the rest in
plain code.  It deliberately does NOT subscribe to `legacy.turnTimings` — that Map's
identity churns with the timeline, which would re-render the dock during streaming.

Fallbacks keep the hook count stable — a contract change degrades to a decorative pet, not a blank slot.

### Slot

```
conversation.composer.dock  id=status-pet  order=−1000
settings.section             id=status-pet  order=30
```

Fixed at the far left; position is deliberately not configurable.

---

## Artwork Model

```
Drawing   = { rows: string[]; prop?: { x, y, rows } }
FrameArt  = { avatar: Drawing; body?: Drawing }
Frame     = { ms?, dx?, dy?, art: FrameArt }
Action    = { id, name, origin?, frameMs, frames: Frame[] }
Artwork   = { palette: string[], actions: Action[], states: StateTable }
```

- `art.avatar` is **required** — the dock's face every action must carry.
- `art.body` is **optional** — a missing body is derived at 4× from the avatar (`face.ts`).
- Offsets are authored in avatar units; the body renders `dx × 4`, so one gesture is the same hop on both faces.
- Everything not a pixel is SINGLE SOURCE — frame count, `frameMs`, `ms`, `dx`/`dy` are shared.

### The catalog

The built-in artwork is **baked and frozen**.  It was generated once from source gif material (now deleted), then paired into the canonical shape by a one-shot codemod (also deleted).  `src/skin/catalog.ts` is the source of truth, hand-edited; `test/artwork.test.ts` runs `skin/validate.ts` over every built-in, so a botched edit fails `pnpm test` instead of failing in the popup.  Every action carries `name` (human label) and `origin` (provenance string — the source gif it was baked from).

### Palette

Up to 255 colours + `transparent` at slot 0.  Two-character per pixel: `..` = transparent, any other pair = hex index.  The palette belongs to the artwork and is never mutated.

---

## The Workshop

```
皮肤                    ← one card per built-in (live portrait at 2×)
[状态 | 动作]            ← the only navigation

状态   22 states + 2 reactions, and what each plays   (WRITES the assignment)
动作   the whole library, one action at a time   (only LOOKS)
```

**皮肤.**  `SkinCards` renders one card per `BUILTIN_SKINS`.  Selecting applies instantly: `chooseSkin(name)` persists and re-resolves ACTIVE.  The Workshop re-reads the document on every `onSkinChange`, not only when the name moves: the artwork chunk landing keeps the same skin NAME, so a `setSkin(equal)` would bail out and leave the panel empty — `page.ts` bumps a revision to make that change visible, and `assignment-list.ts` re-reads the same way.

**状态.**  Left column: 24 one-line rows — 22 states then the 2 reactions (name + read-out).  Right column: `StateAssignments` — a compact header (80 px live picture at the body face) that plays the chosen state, or the hovered row's action while a row is hovered (`headerSource`), then the library as a checkbox per action, with search + 全选 + 清空.  Display order is two groups (ticked first, then the rest), each in library order; stored order is pure library order so the rotation never shifts.  **One knob, `--status-pet-scroll-h`, on `.status-pet-columns`** (44 vh / 360 px; 38 vh / 300 px once the two columns stack): the right column's library reads it as its `max-height`, the left column's frame reads it as its **floor** (`min-height`) — 24 rows are far taller than the page wants to be, and two separately-written caps drift apart.  The left column's FRAME is a separate element, `align-self:stretch`, so the vertical divider runs the whole column: it is a frame, not the scroller.  The frame's scroller (`.status-pet-state-scroll`) is **absolutely positioned to the frame's edges** (`inset:0 14px 0 0`): that keeps the 24 rows out of the frame's intrinsic height (the row height comes from the right column, so the page never grows) and makes the scroller **fill the column** — its bottom edge IS the library's bottom edge, so no blank band is left under it.  It is deliberately taller than the library: the library has the avatar header above it, the state list has nothing.  Once the two columns stack, the frame is content-sized again and the scroller returns to normal flow with the knob as its `max-height`.

**动作.**  A picker that searches and selects, a 1:1 pixel board beside the action's live preview (at `LIVE_ZOOM`), and a filmstrip.  Nothing writes — the artwork is authored.

---

## The text layer (V2) + the discourse layer (V3)

Two kinds of text, deliberately not the same thing:

| | **status** (truth) | **line** (voice) |
|---|---|---|
| Where | tooltip, `aria-label`, the dock's hidden live region | the dock's label + the popup's caption |
| Source | `t(state)` / `t('toolNamed')` — 22 keys + 1 | **five layers** per locale: state pools (2105), bridges (527), continuers (200), events (240), topics (120) |
| Chosen by | `deriveState(facts)` | `stepDiscourse` (V3): state + facts + events + topic + recency + beats + mood + tone |
| Rendered with | nothing | live variables (`{file}` `{cmd}` `{pat}` `{q}` `{url}` `{secs}` `{n}` `{turn}` `{step}` `{nq}` `{why}` `{name}` …) |
| Must be accurate | yes — a skin change may never move it | no, it is flavour |
| Can rotate | no | yes — every 7–9.5 s while things change, stretching to 21–28.5 s once the state has been still for a while (never silent: a beat always shows a line) |

**The dock owns the line.**  `useLine` runs in `pill.ts`; the popup is handed the very
same string as a prop, so the two cannot drift — there is no second rotation.  Petting
in the popup calls back into the dock (`onPet`), so animation, caption and dock label
all change together.

**The line box is FIXED width, and long lines scroll inside it.**  The dock row is a
centered flex (the host's `.yhfFVG_dock` is `justify-content:center`), so a label whose
width followed its text re-centered the entire status bar on every beat — and the longer
the line, the more room it took from the dock's other items.  `view/line-scroll.ts` owns
the fix: `planScroll` (pure: whether to scroll, how long one pass takes) plus
`useLineScroll` (measure `run.scrollWidth` vs the box, then hand the run a duration).
**Where it lands is NOT a JS number** — the keyframe ends at
`translateX(min(0px, calc(var(--status-pet-line-w) - 100%)))`, i.e. "the text's right edge
against the box's right edge", computed by the browser from the real layout.  That is
deliberate: a JS-computed `--status-pet-shift` has to be maintained *during* the animation,
and changing it does not re-aim the animation — it swaps the target value, which stalls the
text mid-pass or jerks it after the fill (`forwards`) lands.  A layout expression cannot
over- or under-shoot, however stale the measurement gets.
The run's `key` is `text + geometry + measured duration`, so a new line (or a changed box
or cadence) remounts it and the pass always starts at the left edge with its final speed;
**one pass only** (`animation-iteration-count:1`, filled at the tail), because a line that
is not changing must never replay itself.  No `ResizeObserver` / `fonts.ready` re-measure —
that is exactly the "swap the target mid-animation" hazard.  `prefers-reduced-motion` never
scrolls — it falls back to an ellipsis, still inside the same fixed box.  The popup's caption uses the
very same box, so the anchored panel does not breathe either.

**How wide that box is, the user picks** — 窄 / 中 / 宽 = 48 / 66 / 100 px (default
**中**), stored as `dockLineWidth` and offered beside the placement.  The dock writes the
chosen px onto the label as `--status-pet-line-w` (`theme.ts` carries `medium` as the
pre-paint fallback); the width is therefore a CONSTANT, never derived from the viewport or
the text.  It is a trade-off the user owns: wider says more at once, narrower takes less
room and scrolls more.

**Where the context comes from.**  `seat.ts` folds DSH's real signals into `PetFacts`
(§Status sources above); `deriveState` names the WORK; `context.ts` turns a running
call's `argsRaw` into variables; `renderLine` substitutes them and, when one is missing,
**fills a generic noun in its place** (`VARS_FALLBACK`, zh or en chosen by whether the
TEMPLATE contains Han characters — the component never learns the host's locale).  Every
sentence must still stand when every variable is empty, and `test/lines.test.ts` asserts it
for all ~3,200 × 2 lines.  Shell commands and URLs are also run through `redactSecrets`,
which blanks the value of `--token=x` / `Authorization: Bearer x` / `API_KEY=x` — clipping
length is NOT a privacy measure and the code no longer pretends it is.

**Pools are state-bound; actions only narrow.**  Never bind a line to an ACTION: one
action can be ticked for several states, and `catalog.ts` action names are hard-coded
Chinese in a 15 MB frozen chunk.  `skin/tones.ts` tags each of the 106 actions with one
of five tones, and the surface reports the action on a **roll** (not per frame) so the
next draw prefers that tone.  A tone change does NOT re-draw — otherwise the text would
flap with the animation.

**Sequences and bridges are what make her sound like she is following along.**

- A **sequence** is 2–4 lines of ONE thought, written contiguously.  When the dwell
  expires and the current line has a next one, the engine continues it — no dice roll.
  A fresh draw only ever starts at a standalone line or a sequence's first line.
- A **bridge** is a pool keyed `from>to`: on a state change the pet speaks the bridge
  (if one is written for that transition) *before* the new state's own line.  101
  transitions, 527 bridges — and a bridge may itself be a 2-line sequence.  (A `from>to`
  key with `from === to` is unreachable: the engine only consults a bridge when the state
  CHANGED.  Two such self-bridges were deleted, and `test/pools.test.ts` now fails if one
  comes back.)

### The discourse engine (V3)

Independent draws read as "reading a line every 8 seconds" no matter how much copy you
write.  `behavior/discourse.ts` replaces the draw with a **conversation advance** — pure,
with the tables and the random source injectable, so the whole policy is testable without
a single real line:

| rule | what it fixes |
|---|---|
| **recency window** (`lineRecentWindow = 24`) | she stops repeating herself; the pool is a shuffle-bag, not dice.  When the tone/mood subset is SMALLER than the window the bag cannot cover it, so the engine hands back the least-recently-used lines — the repeat gap becomes the subset size instead of collapsing to "exclude the last 4" |
| **bursts** (`beat`, `lineBurstChance`, `lineBurstMs`) | the rhythm stops being a metronome — a thought can arrive in two quick beats |
| **continuers** (200 murmurs) | she has something to say between sentences — and a murmur **does not break sequence memory**, so she interrupts herself and then finishes the thought.  Its `source` deliberately stays on the thing being talked about, so `LineSource` has no `continuer` variant at all |
| **越久越稀** (`still`, `lineIdleStretch`, `lineIdleMax`) | 状态一直不换时，停顿逐级 ×1.5、×2、×2.5、封顶 ×3（7–9.5 s → 21–28.5 s）。 开场那种"有活干"的节奏是对的，但一个长工具跑几分钟之后它就只剩噪音；换状态/事实立刻归零重启 |
| **events** (10 fact edges) | she reacts to what YOU just did (queued a message, approved, answered, failed, opened her) instead of narrating her own state; each `failed` occurrence bumps `failStreak`, and `cleared`/`retry` reset it |
| **topics** (3 pools) | she notices the target changed / came back / that this is the Nth one — spoken **once per change**, never every beat |
| **mood** (`failStreak`, `spoken`) | a losing streak biases worry, a fresh start biases bright, a long clean run biases calm |

Order matters and is asserted: **topic edge → continuer → sequence continuation → state
pool**.  A changed subject makes the old sentence stale; an interjection must not lose the
thought; only then do we continue or start fresh.

**Fact edges** are computed in `seat.ts` (`detectEdges`, covered kind by kind in
`test/facts.test.ts`) and the UI edges (popup open/close) in `pill.ts`.  They are fed to the
engine **through two independent sequence numbers** (`view/line.ts` → `freshEdges`), so one
"you queued a message" is spoken once and never on every later beat.  Sharing one sequence
number between the two streams was a real bug: opening the popup re-fed the last FACT edge,
so `popupOpen` could never win and a stale `failed` inflated `failStreak` on every toggle.

**Rotating text is not allowed in a live region.**  The DOCK owns the one live region — a
visually hidden, always-mounted `role="status"` node (the popup used to own it, which meant
a state change was announced only while the popup happened to be open, and owning it in both
places would announce everything twice).  The line rotates outside it, and the dock label is
`aria-hidden`; the popup's visible caption is not hidden (hiding visible text is an
anti-pattern).  The popup is `aria-modal`, takes focus on open, and Escape returns focus to
the dock button.  The action picker exposes `aria-activedescendant` / `aria-controls` (arrow
keys move a class, not a focusable row), and the clear-confirm dialog moves focus to its
Cancel button and handles Escape.

**The line's placement and its width are the second thing a user owns**: `off` / `left` /
`right` (default `right`) as `dockText`, and `narrow` / `medium` / `wide` (default
`medium`) as `dockLineWidth` — both via `skin/display.ts`, both offered by
`view/settings/dock-text.ts`.  `off` arms no timer at all.

**Editing copy.**  The generator and the documents are GONE.  `src/labels/lines/zh.ts` +
`src/labels/lines/en.ts` (the entries), `src/behavior/line-pools.ts` (the pool structure)
and `src/skin/tones.ts` (action → tone) are the source now, even though their headers still
say `GENERATED`:

- Edit the entries in BOTH locale files and keep the key sets identical — the same
  `<state>.<NN>` and `bridge.<from>.<to>.<NN>` keys must exist in each.
- A new entry also needs its id in the pool structure (`line-pools.ts`) and the label
  dictionary, or it will never be drawn.
- `pnpm test` is the check: `test/labels.test.ts` fails on a missing counterpart, an
  unreferenced entry, or a placeholder the renderer cannot fill.

---

## Rendering

### Geometry

```
FACES = {
  avatar: { size:32, canvasH:40, baseY:4, padX:4, maxOffset:4, canvasW:40 },
  body:   { size:128, canvasH:160, baseY:16, padX:16, maxOffset:16, canvasW:160 },
}
LIVE_ZOOM = 1/2
BODY_SCALE = 4
```

**Integer ratios only.**  The dock and popup render into their full backing store and set the CSS box to half — the sprite is never re-rendered smaller, only the element shrinks, so `pixelated` stays crisp.

### The player

- **Pure reducer** (`player/timeline.ts`): `stepPlayback(state, input)` → the frame to draw.  State-change dwell, hold/re-roll, and lead/follow mirroring are all pure, unit-testable logic.
- **`<PetCanvas>` reads the shared geometry** (`FACES` from `skin/geometry.ts`) instead of re-declaring it, so a canvas' backing store can never disagree with the surface's, and it re-binds when `interactive` flips (the element swaps between a bare `<canvas>` and a `<button><canvas>`).
- **Shared rAF ticker** (`platform/clock.ts`): many surfaces, one rAF.  Hidden tabs pause it.  The
  iteration order is a snapshot rebuilt only when the ticker SET changes, so the steady state allocates
  nothing per frame.  A ticker that registers DURING a frame does not arm a second rAF (`inFrame`
  guard).
- **Visibility gate** (`platform/visibility.ts`): ONE `IntersectionObserver` for every pet canvas.  The
  Workshop mounts 200+ canvases (106 library rows, the picker, the header, the skin card) and almost
  none are on screen; a canvas outside the viewport **detaches from the clock entirely** — not
  "entered and returned early", never called.  A 320 px warm-up margin means the next row is already
  parsed before it is visible, so scrolling never pays a first-frame parse.  No
  `IntersectionObserver` (an old host) means "always visible" — the exact old behaviour.
- **Surface driver** (`platform/surface.ts`): the skin is resolved **once per change**, not per frame —
  the change event (a write, the chunk landing, another tab) is the only thing that can move it, so
  the 110 `localStorage` reads *per rAF frame* the Workshop used to pay are gone.  (`readStored()`
  still runs on each React render of the dock/settings — it is an ordinary `getItem` on a small
  string, and it is what makes a cross-tab write visible without an event.)  Then: canvas sizing,
  a dirty check on sprite identity **and** the frame's `dx`/`dy` (two frames can share one `Drawing`
  and still move), drawImage through the bitmap cache.  `getContext('2d')` is guarded here and in
  `settings/frame-canvas.ts` — a host that refuses the context gets a blank canvas, not a throw.
- **One reduced-motion query** (`view/reduce-motion.ts`): every canvas used to build its own
  `MediaQueryList` and listener for the same question; they now share one ref, and the shared query
  only latches once it really installed (a host without `matchMedia` never marks itself handled).
- **The 1:1 pixel board is ONE canvas** + a CSS graticule (`.status-pet-grid::after`, pitch
  `100% / n`), not 16,384 `<div>`s — see the Workshop section.
- **Take channel** (`player/sync.ts`): the dock publishes; the popup mirrors.  A stale leader (> 250 ms) is treated as absent.

---

## Storage

```json
{ "v": 1,
  "skin": "whale-chan",
  "assignments": { "whale-chan": { "tool": ["xie-daima"] } },
  "dockText": "right",
  "dockLineWidth": "medium" }
```

`dockText` (`off` / `left` / `right`) and `dockLineWidth` (`narrow` / `medium` / `wide`)
are both optional; an unknown or absent value reads as the default, and an invalid one is
never written.  The schema version does not move.

The artwork is never stored — only ids.  Writes go through synchronously; the in-memory document is memoized by the raw storage text, and every cache downstream is keyed by object identity.  A foreign payload (an older install's document) is deliberately not interpreted — it reads as an empty store, and the next write replaces it.

---

## Interactions

| Trigger | Reaction |
|---|---|
| Click the dock pill | opens/closes the popup — no `petted` |
| Click anywhere in the popup | `petted` — in the popup AND in the dock, so the line and the caption stay identical |
| mouseenter / focus while asleep | `woken` |

The dock is a read-out; the popup is the toy.  Without the popup primitives (`POPUP_OK` = false), the pill keeps `petted`.

---

## Tuning

```
// behavior/tuning.ts
TUNING = { reactToStatus: true, sleepAfterMs: 60_000, stateMinDwellMs: 150,
           minPlays: 3, playJitter: 2,
           lineDwellMs: 7000, lineJitterMs: 2500, slowToolMs: 45_000,
           lineIdleStretch: 0.5, lineIdleMax: 3,
           lineRecentWindow: 24, lineMaxBeat: 3,
           lineBurstChance: 0.25, lineBurstMs: [1200, 2600],
           lineContinuerChance: 0.22, lineContinuerMs: [2500, 5000],
           lineEventMs: [1500, 3000], topicManyAt: 4 }
```

`lineDwellMs` is deliberately its own knob: an animation cycle is 1.2–3.4 s, and text
that fast cannot be read.  A state change and a facts-signature change bypass it;
`prefers-reduced-motion` stops the rotation entirely.  `slowToolMs` is when "waiting"
becomes the honest story and the pet switches from the work (`shell`) to the wait (`slow`).
The V3 knobs above shape the *rhythm of the conversation*: how long before a line may
repeat, how long a burst may run, how often a murmur slips in, how fast a reaction lands.

`lineIdleStretch` / `lineIdleMax` are the **lean-back**: `still` counts the beats advanced
inside ONE state, and the normal dwell is multiplied by `1 + lineIdleStretch × still`,
capped at `lineIdleMax`.  A state or fact change resets it, so the 7–9.5 s cadence is what
you get whenever something is actually happening; a long tool that just sits there decays
to 21–28.5 s.  Measured on the real tables, 60 virtual minutes with one long tool running
(no state change): **6.9 → 2.9 lines/min**.  The lean-back is the ONLY thing that thins the
talk out — every beat that lands still says a line; there is no silent beat.

---

## Development

### Build

`pnpm build` → tsdown (IIFE, two artifacts).  `pnpm dev` adds `--watch`.

### Edit cycle

`src/` → rebuild → refresh.  `cordis.patch.yml` / `package.json` → reinstall bundle.

### Adding a skin

1. Add its `Artwork` to `src/skin/catalog.ts`.
2. Add its name to `BUILTIN_SKINS` in `registry.ts`.
3. Add `settings.skin.<name>` to both locale files (`src/labels/en.ts`, `zh.ts`).
4. `pnpm build`, run `pnpm test` (the artwork gate picks up the new skin automatically), then
   refresh and check it by hand.

### Adding a state

1. **Find the signal first.**  A state without a real fact that reaches it is decoration.
   `test/facts.test.ts` asserts that every state is reachable from a constructed fact
   combination, so a state you add without a signal fails the suite.
2. Add `PetState` to `vocabulary.ts`, plus `STATES` and `STATE_NAMES`.
3. Add a `deriveState` branch in `facts.ts` (and, if it is a tool category, a row in
   `tool-catalog.ts`).
4. Add copy directly to `src/labels/lines/zh.ts` and `en.ts` (same keys), wire the ids into
   `src/behavior/line-pools.ts`, and tag any new action in `src/skin/tones.ts`.
5. Give it artwork: assign actions in `src/skin/catalog.ts`'s state table (every action
   must belong to at least one state, and every state to at least one action —
   `test/artwork.test.ts` enforces both); tag any new action in `src/skin/tones.ts`; add the
   `settings.hint.<state>` key and the status label to both locales.  (`library.assign`
   refuses an unknown state name, so a typo cannot mint a phantom state row.)
6. `pnpm test` (the copy contract, the truth table and the tone coverage all re-check), then
   `pnpm build` and exercise it by hand.

---

## Testing

`pnpm test` runs the whole gate — nine files, 102 tests, all green in ~0.4 s; plain `node --test` with type stripping, no browser, no test framework, no extra dependency:

```bash
pnpm typecheck   # tsc --noEmit (src AND test)
pnpm test        # node --experimental-strip-types --test test/*.test.ts
pnpm check       # both
pnpm build       # then refresh the DSH web GUI
```

What it covers, in the order the old suite used to cost the most:

- **the state truth table** (`facts.test.ts`): all 22 states reachable from a constructed
  fact combination, the priority order, and the shape guards around DSH's undocumented
  objects (`toPendingFact` / `toRunningTools` / `toStreamKind` / `detectEdges`);
- **the copy contract** (`labels.test.ts`, `lines.test.ts`): zh/en key symmetry, the pool ↔
  dictionary bijection, no unreachable entry, no unfillable placeholder, and the rule that
  **every line still reads with every variable missing**;
- **the pool structure** (`pools.test.ts`): sequences contiguous `1..of` with one tone,
  every fact-edge name has a pool, no duplicate ids, no unreachable self-bridge;
- **the discourse engine** (`discourse.test.ts`): no blank beat in any state, every drawn
  id belongs to a pool, the recency window and its least-recently-used fallback, sequence
  completion across a murmur, event priority, the mood counter, reduced motion;
- **the artwork** (`artwork.test.ts`): `skin/validate.ts` over the whole catalog, tone
  coverage, no orphan action, resolution totality and memoization, the registry's
  refuse-to-half-install rule;
- **the wardrobe** (`skin.test.ts`): the pixel codec, the 4× body fallback, the assignment
  sanitizer, the library rules, storage identity and the refused-write path;
- **the player and the line box** (`player.test.ts`, `scroll.test.ts`): the pure tick
  reducer, the rotation policy, and `planScroll`'s endpoint pinned to exactly what the CSS
  expression computes.

It is a gate on the *pure* layers.  A browser-only behaviour — the shared rAF, the
visibility gate, the surface lifecycle — is argued in the code and has to be exercised by
hand; if you touch it, add the assertion where it can run (the modules are structured so
that most of it can).

Verification is therefore **suite + build + manual**:

```bash
pnpm typecheck   # tsc --noEmit
pnpm test        # the gate
pnpm build       # then refresh the DSH web GUI
```

### Manual checklist

1. Whale-chan at the far left, bobbing and blinking.  Hover → instant tooltip; focus → ring.
2. Click → popup above the pet (64 CSS px of body), same animation and frame.  Click panel → hearts.  Escape / outside click closes.
3. Send message: `think` → `reasoning` → `preparing` → a tool state (`shell` on a command,
   `read` on a file, `search` on grep, `write` on an edit) → `stream` → `done` → `sleep`.
   A stuck step past 45 s flips to `slow` on its own.
4. Settings → skin cards, 状态/动作 axis, 状态 opens as two columns.  The header plays the selected state's rotation; hovering a row previews that action.  The 24-row state column **scrolls inside its own box** (it must not grow with its content): scroll it to the bottom, pick one of the 2 reactions, and the page itself must not have jumped; the vertical divider still reaches the bottom of the right column, **and the scroll box itself reaches it too** — no blank band under the state list while the library beside it runs to the bottom.
5. 动作 view: picker, 1:1 board, live preview, filmstrip — nothing writes.
6. Change assignment → dock and popup play it.  Reload → assignment persists.
7. The line sits to the RIGHT of the avatar, changes every 7–9.5 s, never repeating the
   previous one — and it names the real thing: the file on a `read`, the command on a
   `shell`, the pattern on a `search`, the seconds on a `slow`.  Run a command with a
   long name, and with a very long one: the pill must not get wider, the line must scroll
   inside its box instead of truncating mid-word, and the dock's neighbours must not move.
8. Open the popup: the caption is the SAME line the dock is showing, and it follows the
   dock's rotation — then click the panel: hearts AND the caption/label switch to a
   `petted` line together.
9. Settings → 关闭 / 左侧 / 右侧 flips it instantly and survives a reload; 台词宽度
   窄 / 中 / 宽 changes the box at once.  With 关闭, only the hover tooltip remains.  With
   VoiceOver on: a state change is announced once, and rotating lines are never spoken.
10. Watch one thing through several states (e.g. read → edit → shell → done): at each
    transition she should say something that **picks up the previous line** (a bridge),
    not something unrelated.
11. Let one state sit: she should finish a **sequence** (2–4 lines reading as one
    thought) before drawing an unrelated line.  Nothing should ever sound like it was
    cut off mid-sentence, and she must not repeat a line she used minutes ago.
12. Send a message while she is working: she should react **immediately** ("收到，排上队了")
    rather than waiting for her next beat.  Same for approving, answering, a failure, and
    opening/closing the popup.
13. Point her at three or four different files in one turn: at the first switch she should
    say something about the target changing, and at the fourth something about the count —
    and she must **not** repeat that comment on every subsequent line.
14. Watch the rhythm: most lines land 7–9.5 s apart **while things are changing**, but
    sometimes two arrive close together; leave one state running and the gaps should
    stretch out (×1.5, ×2, … up to ×3 = 21–28.5 s) instead of tapping along at the same
    cadence for an hour.  While a long tool runs, a short murmur ("嗯…") should slip in
    between real sentences — and the thought should still finish afterwards.
15. **No blank beat**: leave one state running for a few minutes — the label (and the popup
    caption, if open) never goes blank and never shrinks; every beat that lands is a real
    line, and the dock's neighbours never shift.
