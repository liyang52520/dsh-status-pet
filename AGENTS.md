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
streak.  ~3200 lines per locale.  Click it and the **big picture pops up**:
an anchored, animated, pettable panel.  The Settings tab swaps **skins**, shows her
whole **action library** one animation at a time, and lets you change **which of a
skin's own actions each state plays**.

### The three layers

| Layer | Where | What lives here | Rendering |
|---|---|---|---|
| Resident | dock, far left | the pet itself, plus her **speech line** when enabled | the 32 px **avatar** face, backing 40×40, at `LIVE_ZOOM` → **16 CSS px of art**; the line is plain 12 px text |
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
| Text model | TWO kinds of text, deliberately separate — the **status** (22 keys + `toolNamed`, tooltip + `aria-label`, derived from facts, never moved by artwork) and the **line** (~3200 per locale across five layers: state pools with **sequences**, **bridges** per transition, **continuers** (murmurs), **events** (edge reactions) and **topics** (target continuity), rendered with live context variables). The dock OWNS the line and hands the same string to the popup. |
| Discourse model | `stepDiscourse` is a pure fold: recency window (shuffle-bag), bursts (`beat`), continuers that **do not break sequence memory**, event preemption on fact edges, topic edges that speak once per change, and tone choice biased by mood. Every rule is unit-tested against synthetic tables AND smoke-tested against the real ones. |
| State model | 22 states + 2 reactions, every one backed by a real signal: pending interaction kind (incl. `plan-review`), running tool calls (name→category, raw args, turn/step, start time, concurrency), assistant stream block kind (text/reasoning/tool-call). |
| Dependencies | `react` + seeded `@deepseek-ai/dsh-client-ui-primitives` (guarded; native `title` fallback), both from the web shell |
| Build | **tsdown**, two IIFE builds: `src/index.ts` → `client.js` (628 kB, gzip 141 kB), `src/artwork.ts` → `client.artwork.js` (15.6 MB, fetched on demand) |

---

## File Structure

```
src/
  index.ts / artwork.ts / plugin.ts   entry (thin)
  behavior/                                 pure domain (no DOM, no React)
    tuning.ts          rhythm knobs (artwork AND text)
    facts.ts           PetFacts + deriveState (state machine)
    vocabulary.ts      STATES / REACTIONS / STATE_NAMES / TONES
    lines.ts           the pool layer: LINE_POOLS, poolFor, bridgeFor, candidates
    discourse.ts       the speech ENGINE (V3): recent window, beats, continuers,
                       events, topics, mood — pure, tables and random injectable
    line-pools.ts      the pool STRUCTURE: state lines + bridges + continuers +
                       events + topics (GENERATED)
    tool-catalog.ts    wire tool name → work category (shell/read/search/write/web/agent/plan/deliver)
    context.ts         argsRaw → line variables; varsForFacts; renderLine (the `{var}` renderer)
  labels/                              i18n (shared across layers)
    en.ts  zh.ts       the two shipped locales + the settings copy
    index.ts           NS + LABELS (state copy + ~3200 lines) + translatorOrFallback
    lines/zh.ts        every line entry, zh (GENERATED)
    lines/en.ts        every line entry, en (GENERATED)
  skin/                                artwork model + wardrobe
    geometry.ts        FACES (avatar 32 / body 128) + headroom + LIVE_ZOOM
    pixels.ts          two-char pixel codec (NIBBLE, parse, serialize, blanks)
    model.ts           Drawing / Frame / Action / Artwork + limits
    face.ts            faceFor (body 4× fallback) / hasBody / offsetScale
    library.ts         action library reads + assignment mutations
    overrides.ts       user diff + sanitizer (applyDiff)
    storage.ts         schema 1 + read/write (memoized by raw text); `dockText`
    display.ts         dockText() / setDockText() / onDockTextChange() — the line's placement
    tones.ts           action → tone side table (GENERATED), 106 entries
    registry.ts        built-in registry (the chunk installs here)
    documents.ts       documentOf / libraryOf (reads, memoized per store revision)
    resolve.ts         Artwork → ResolvedSkin (pure, identity-memoized)
    session.ts         LIVE wardrobe: activeSkin, bestSkin, skinFor,
                       chooseSkin, saveAssignments, installCatalog, onSkinChange
    validate.ts        invariant check (test-time only)
    catalog.ts         built-in artwork (15 MB, frozen, hand-edited)
  player/                              pure playback policy
    rotation.ts        which animation, how long it is held
    timeline.ts        tick reducer: elapsed → frame (pure, unit-testable)
    sync.ts            lead/follow channel
  platform/                            host adapter layer
    deps.ts            bare-specifier injection (react / primitives)
    clock.ts           shared rAF + visibilitychange
    raster.ts          sprite → canvas (ImageData / fallback)
    bitmap.ts          pre-rendered sprite bitmaps
    surface.ts         per-canvas driver (sizing, dirty-check, drawImage)
    theme.ts           stylesheet (inlined <style>)
  view/                                React components
    pet-canvas.ts      <PetCanvas> — the ONE playing element
    line.ts            useLine — the pure text policy on a self-driving timer
    reduce-motion.ts   useReducedMotion
    reaction.ts        useReaction
    seat.ts            usePetStatus
    dock/              pill.ts (the dock button + her line), popup.ts (click popup)
    settings/          page.ts, skin-cards.ts, dock-text.ts (关闭/左/右),
                       action-panel.ts, action-picker.ts,
                       action-thumb.ts, assignment-list.ts, board.ts, filmstrip.ts,
                       frame-canvas.ts, field.ts, confirm.ts
test/                  node:test suite (18 files, 158 tests)
docs/                  dialogue-v3.md (the V3 contract: discourse engine + the new layers)
                       v3-copy-brief.md / v3-topup-brief.md (writer briefs)
                       context-states-v2.md (V2) · text-layer-design.md (V1)
                       text-layer-copy-{zh,en}.md (the merged copy) · v2/ + v3/ (drafts)
bench/                 v2-spec.ts + v3-spec.ts (the copy CONTRACT; one implementation,
                       imported by BOTH the CLIs and the test suite)
                       check-v2-copy.mjs / check-v3-copy.mjs (per-file self-check)
                       check-v3-merged.mjs (the whole-pool gate: sequences + variety)
                       merge-v2-copy.mjs (drafts → canonical doc; --update-baseline freezes
                       the SPEC table) · port-lines.mjs (doc → GENERATED source)
                       assign-states.mjs (artwork redistribution) · asar.mjs · harness.mjs · store.mjs
```

---

## Architecture

### Layers (dependency direction ↓)

```
behavior  ←  skin  ←  player  ←  platform  ←  view  ←  entry
```

- **behavior / labels / skin / player** — pure, no DOM, importable in Node.
- **platform** — the only layer that touches `window`, `document`, `requestAnimationFrame`, `canvas`.  `deps.ts` is the sole injection point.
- **view** — React components.  Stateless fragments are plain functions (e.g. `field.ts`), not components, so the rendered element tree stays flat and the test stub stays simple.
- **entry** — `index.ts` registers with the module loader; `plugin.ts` assembles `skinTools` + slot registrations.

### How it loads

1. The bundle loader fetches `client.js`.  The factory receives `require`, seeds `platform/deps.ts`, requests `./client.artwork.js` in the background, and returns `{ inject: ['slots','locale'], skinTools, apply }`.
2. Until the artwork chunk lands, the registry is empty and the pet draws a blank canvas.
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

The built-in artwork is **baked and frozen**.  It was generated once from source gif material (now deleted), then paired into the canonical shape by a one-shot codemod (also deleted).  `src/skin/catalog.ts` is the source of truth, hand-edited; `validate.ts` re-checks it.  Every action carries `name` (human label) and `origin` (provenance string — the source gif it was baked from).

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

**皮肤.**  `SkinCards` renders one card per `BUILTIN_SKINS`.  Selecting applies instantly: `chooseSkin(name)` persists and re-resolves ACTIVE.

**状态.**  Left column: 24 one-line rows — 22 states then the 2 reactions (name + read-out).  Right column: `StateAssignments` — a compact header (80 px live picture at the body face) that plays the chosen state, or the hovered row's action while a row is hovered (`headerSource`), then the library as a checkbox per action, with search + 全选 + 清空.  Display order is two groups (ticked first, then the rest), each in library order; stored order is pure library order so the rotation never shifts.

**动作.**  A picker that searches and selects, a 1:1 pixel board beside the action's live preview (at `LIVE_ZOOM`), and a filmstrip.  Nothing writes — the artwork is authored.

---

## The text layer (V2) + the discourse layer (V3)

Two kinds of text, deliberately not the same thing:

| | **status** (truth) | **line** (voice) |
|---|---|---|
| Where | tooltip, `aria-label`, the popup's hidden live region | the dock's label + the popup's caption |
| Source | `t(state)` / `t('toolNamed')` — 22 keys + 1 | **five layers** per locale: state pools (2105), bridges (533), continuers (200), events (240), topics (120) |
| Chosen by | `deriveState(facts)` | `stepDiscourse` (V3): state + facts + events + topic + recency + beats + mood + tone |
| Rendered with | nothing | live variables (`{file}` `{cmd}` `{pat}` `{q}` `{url}` `{secs}` `{n}` `{turn}` `{step}` `{nq}` `{why}` `{name}` …) |
| Must be accurate | yes — a skin change may never move it | no, it is flavour |
| Can rotate | no | yes, every 7–9.5 s |

**The dock owns the line.**  `useLine` runs in `pill.ts`; the popup is handed the very
same string as a prop, so the two cannot drift — there is no second rotation.  Petting
in the popup calls back into the dock (`onPet`), so animation, caption and dock label
all change together.

**Where the context comes from.**  `seat.ts` folds DSH's real signals into `PetFacts`
(§Status sources above); `deriveState` names the WORK; `context.ts` turns a running
call's `argsRaw` into variables; `renderLine` substitutes them and **cleans up after a
missing one** — every sentence must still stand when every variable is empty (a test
asserts exactly that, on every line × 2 locales).

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
  (if one is written for that transition) *before* the new state's own line.  ~100
  transitions, 533 bridges — and a bridge may itself be a 2-line sequence.

### The discourse engine (V3)

Independent draws read as "reading a line every 8 seconds" no matter how much copy you
write.  `behavior/discourse.ts` replaces the draw with a **conversation advance** — pure,
with the tables and the random source injectable, so the whole policy is testable without
a single real line:

| rule | what it fixes |
|---|---|
| **recency window** (`lineRecentWindow = 24`) | she stops repeating herself; the pool is a shuffle-bag, not dice |
| **bursts** (`beat`, `lineBurstChance`, `lineBurstMs`) | the rhythm stops being a metronome — a thought can arrive in two quick beats |
| **continuers** (200 murmurs) | she has something to say between sentences — and a murmur **does not break sequence memory**, so she interrupts herself and then finishes the thought |
| **events** (10 fact edges) | she reacts to what YOU just did (queued a message, approved, answered, failed, opened her) instead of narrating her own state |
| **topics** (3 pools) | she notices the target changed / came back / that this is the Nth one — spoken **once per change**, never every beat |
| **mood** (`failStreak`, `spoken`) | a losing streak biases worry, a fresh start biases bright, a long clean run biases calm |

Order matters and is asserted: **topic edge → continuer → sequence continuation → state
pool**.  A changed subject makes the old sentence stale; an interjection must not lose the
thought; only then do we continue or start fresh.

**Fact edges** are computed in `seat.ts` (`detectEdges`, tested against every kind) and the
UI edges (popup open/close) in `pill.ts`; they are fed to the engine **by sequence number**,
so one "you queued a message" is spoken once, not on every later beat.

**Rotating text is not allowed in a live region.**  The popup's truth lives in a
visually hidden `role="status"` node; the line rotates outside it.  The dock label is
`aria-hidden` (the button already announces the truth); the popup's visible caption is
not hidden (hiding visible text is an anti-pattern).

**The line's placement is the second thing a user owns**: `off` / `left` / `right`
(default `right`), persisted as `dockText` via `skin/display.ts`, offered by
`view/settings/dock-text.ts`.  `off` arms no timer at all.

**Editing copy.**  The documents are the source; the TS is generated:

```bash
# drafts live in docs/v2/*.md (state pools) and docs/v3/*.md (sequences, bridges,
# continuers, events, topics).  Write a new group file — do NOT hand-edit the merged doc.
node bench/check-v3-copy.mjs docs/v3/<file>.md      # per-file self-check (writers)
node bench/merge-v2-copy.mjs                        # drafts → docs/text-layer-copy-{zh,en}.md
                                                    #   + global dedupe report
node bench/check-v3-merged.mjs                      # whole-pool gate: sequences + variety
node bench/port-lines.mjs                           # docs → line-pools.ts + labels/lines/*
node bench/merge-v2-copy.mjs --update-baseline      # freeze the SPEC table (explicit, rare)
pnpm test                                           # test/lines.test.ts: the SAME contract,
                                                    #   the merged-pool gate, and the drift guard
```

`bench/v2-spec.ts` + `bench/v3-spec.ts` are the contract's only implementation — both CLIs
and the test suite import them, so "the checker passed but the tests failed" cannot happen.
**The SPEC table is a frozen snapshot**: `--update-baseline` rewrites it from the delivered
copy, and it is deliberate that this is a separate, rare, human-invoked step — any copy
change that alters counts or tone mixes without re-freezing turns the suite red.

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
- **Shared rAF ticker** (`platform/clock.ts`): many surfaces, one rAF.  Hidden tabs pause it.
- **Surface driver** (`platform/surface.ts`): canvas sizing, sprite-identity dirty check (a tick that changes nothing draws nothing), drawImage through the bitmap cache.
- **Take channel** (`player/sync.ts`): the dock publishes; the popup mirrors.  A stale leader (> 250 ms) is treated as absent.

---

## Storage

```json
{ "v": 1,
  "skin": "whale-chan",
  "assignments": { "whale-chan": { "tool": ["xie-daima"] } },
  "dockText": "right" }
```

`dockText` is optional (`off` / `left` / `right`); an unknown or absent value reads as
the default, and an invalid one is never written.  The schema version does not move.

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

---

## Development

### Build

`pnpm build` → tsdown (IIFE, two artifacts).  `pnpm dev` adds `--watch`.

### Edit cycle

`src/` → rebuild → refresh.  `cordis.patch.yml` / `package.json` → reinstall bundle.

### Adding a skin

1. Add its `Artwork` to `src/skin/catalog.ts`.
2. Add its name to `BUILTIN_SKINS` in `registry.ts`.
3. Add `settings.skin.<name>` to both locale files.
4. `pnpm test`.

### Adding a state

1. **Find the signal first.**  A state without a real fact that reaches it is decoration;
   `test/pet.test.ts` asserts every state name is reachable, so an unreachable one fails.
2. Add `PetState` to `vocabulary.ts`, plus `STATES` and `STATE_NAMES`.
3. Add a `deriveState` branch in `facts.ts` (and, if it is a tool category, a row in
   `tool-catalog.ts`).
4. Add copy: a `## <state> — …` section to `docs/text-layer-copy-zh.md`
   AND `-en.md` (same counts, same tones, same seq), a row in `bench/v2-spec.ts`'s
   `SPEC`/`TOKENS`/`SEQ_GROUPS`, then `node bench/merge-v2-copy.mjs && node bench/port-lines.mjs`.
5. Give it artwork: add it to `bench/assign-states.mjs`'s `MAP` (it verifies every action
   belongs to exactly one state) and re-run it; add the `settings.hint.<state>` key and
   the status label to both locales.
6. `pnpm test`.

---

## Testing

`pnpm test` — Node built-in runner; `pretest` rebuilds first.

| File | Covers |
|---|---|
| `pet.test.ts` | the 22-state truth table, priority, reachability, and the shape guards over DSH's real objects |
| `labels.test.ts` | dictionary shape, locale fallback |
| `pixels.test.ts` | two-char codec roundtrips, spriteFor memoization |
| `face.test.ts` | authored face, 4× fallback, memo identity |
| `rotation.test.ts` | hold policy, re-roll, seeded random |
| `timeline.test.ts` | pure tick reducer: state change, dwell, mirror channel |
| `clock.test.ts` | shared rAF: add, stop, visibility |
| `raster.test.ts` | sprite → canvas pixel painting |
| `catalog.test.ts` | catalog validation (face sizes, ids, state references) |
| `skin.test.ts` | storage, session, library, assignments, overrides |
| `preview.test.ts` | the state header's preview source: its shape, and that it paints |
| `performance.test.ts` | identity-keyed caches, reference sharing, tiny payload |
| `bundle.test.ts` | built `client.js` registration, apply(), artwork chunk |
| `lines.test.ts` | the copy contract (shared with the CLI), zh/en symmetry, **docs ↔ source drift guard**, variables, sequences, bridges, action tones, artwork coverage |
| `discourse.test.ts` | the V3 engine on synthetic tables (recency, beats, continuers that keep the sequence alive, events, topic edges, mood, reduced motion, reproducibility) **and** a smoke test on the real tables |
| `display.test.ts` | the dock-line setting: default, sanitizing, no redundant writes, foreign schema |
| `context.test.ts` | `argsRaw` → variables, truncation, the `{var}` renderer, and the "all variables empty" rule |
| `tool-catalog.test.ts` | wire tool name → category, the total fallback, one category per tool |

### Manual checklist

1. Whale-chan at the far left, bobbing and blinking.  Hover → instant tooltip; focus → ring.
2. Click → popup above the pet (64 CSS px of body), same animation and frame.  Click panel → hearts.  Escape / outside click closes.
3. Send message: `think` → `reasoning` → `preparing` → a tool state (`shell` on a command,
   `read` on a file, `search` on grep, `write` on an edit) → `stream` → `done` → `sleep`.
   A stuck step past 45 s flips to `slow` on its own.
4. Settings → skin cards, 状态/动作 axis, 状态 opens as two columns.  The header plays the selected state's rotation; hovering a row previews that action.
5. 动作 view: picker, 1:1 board, live preview, filmstrip — nothing writes.
6. Change assignment → dock and popup play it.  Reload → assignment persists.
7. The line sits to the RIGHT of the avatar, changes every 7–9.5 s, never repeating the
   previous one — and it names the real thing: the file on a `read`, the command on a
   `shell`, the pattern on a `search`, the seconds on a `slow`.  Run a command with a
   long name: the line must truncate, not overflow.
8. Open the popup: the caption is the SAME line the dock is showing, and it follows the
   dock's rotation — then click the panel: hearts AND the caption/label switch to a
   `petted` line together.
9. Settings → 关闭 / 左侧 / 右侧 flips it instantly and survives a reload.  With 关闭,
   only the hover tooltip remains.  With VoiceOver on: a state change is announced once,
   and rotating lines are never spoken.
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
14. Watch the rhythm: most lines land 7–9.5 s apart, but sometimes two arrive close
    together.  While a long tool runs, a short murmur ("嗯…") should slip in between real
    sentences — and the thought should still finish afterwards.