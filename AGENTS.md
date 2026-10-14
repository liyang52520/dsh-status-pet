# Status Pet — AGENTS.md

Whale-chan (鲸鱼娘) — a tiny pixel-art whale maid — lives in the DSH conversation
composer dock (the status bar above the chat input).  **It shows what the agent is
doing** — sleeping when nothing happens, working while a tool runs, bowing up when
something needs your approval, sheepish when a turn fails.  Click it and the **big
picture pops up**: an anchored, animated, pettable panel.  The Settings tab swaps
**skins**, shows her whole **action library** one animation at a time, and lets you
change **which of a skin's own actions each state plays**.

### The three layers

| Layer | Where | What lives here | Rendering |
|---|---|---|---|
| Resident | dock, far left | the pet itself — a pure read-out, no interactions | the 32 px **avatar** face, backing 40×40, at `LIVE_ZOOM` → **16 CSS px of art** |
| Peek | the click popup | the big animated **full body** + every interaction | the 128 px **body** face, backing 160×160, at `LIVE_ZOOM` → **64 CSS px of art** |
| Workshop | Settings → Status Pet | skin cards, ONE axis **状态** / **动作** | 状态 header at `LIVE_ZOOM`; 动作 board at 1:1; every library row a PLAYING thumbnail at 1:1 |

---

## Project Overview

| Field | Value |
|---|---|
| Package | `@local/dsh-status-pet` — client-plugin bundle, flat root |
| Mount points | `conversation.composer.dock` (id `status-pet`, order **−1000**, far left); `settings.section` (order 30, after agent-presets) |
| Rendering | Canvas 2D, **integer ratios only** |
| Sprite model | One action = one animation with TWO faces — `art.avatar` (required) and `art.body` (optional, falls back to avatar at 4×), 1–8 frames. Frame `ms` / `dx` / `dy` are SINGLE SOURCE. A state holds a list of action ids (≤64); empty/absent = follow idle. The dock leads, the popup mirrors. |
| Dependencies | `react` + seeded `@deepseek-ai/dsh-client-ui-primitives` (guarded; native `title` fallback), both from the web shell |
| Build | **tsdown**, two IIFE builds: `src/index.ts` → `client.js` (95 kB), `src/artwork.ts` → `client.artwork.js` (15.6 MB, fetched on demand) |

---

## File Structure

```
src/
  index.ts / artwork.ts / plugin.ts   entry (thin)
  behavior/                                 pure domain (no DOM, no React)
    tuning.ts          rhythm knobs
    facts.ts           PetFacts + deriveState (state machine)
    vocabulary.ts      STATES / REACTIONS / STATE_NAMES
  labels/                              i18n (shared across layers)
    en.ts  zh.ts       the two shipped locales
    index.ts           NS + LABELS + translatorOrFallback
  skin/                                artwork model + wardrobe
    geometry.ts        FACES (avatar 32 / body 128) + headroom + LIVE_ZOOM
    pixels.ts          two-char pixel codec (NIBBLE, parse, serialize, blanks)
    model.ts           Drawing / Frame / Action / Artwork + limits
    face.ts            faceFor (body 4× fallback) / hasBody / offsetScale
    library.ts         action library reads + assignment mutations
    overrides.ts       user diff + sanitizer (applyDiff)
    storage.ts         schema 1 + read/write (memoized by raw text)
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
    reduce-motion.ts   useReducedMotion
    reaction.ts        useReaction
    seat.ts            usePetStatus
    dock/              pill.ts (the dock button), popup.ts (click popup)
    settings/          page.ts, skin-cards.ts, action-panel.ts, action-picker.ts,
                       action-thumb.ts, assignment-list.ts, board.ts, filmstrip.ts,
                       frame-canvas.ts, field.ts, confirm.ts
test/                  node:test suite (13 files, 83 tests)
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
| `useSessionStatus` | `pendingInteraction.kind`, `completionUnread` | lowest |
| `useSession` | `running`, `pendingSubmissions`, `openState`, `lastAgentError`, `promptError` | low |
| `useChat` | `legacy.runningCalls`, `legacy.partial` | forces Chat assembly |

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

状态   eleven states, and what each plays   (WRITES the assignment)
动作   the whole library, one action at a time   (only LOOKS)
```

**皮肤.**  `SkinCards` renders one card per `BUILTIN_SKINS`.  Selecting applies instantly: `chooseSkin(name)` persists and re-resolves ACTIVE.

**状态.**  Left column: eleven one-line rows (name + read-out).  Right column: `StateAssignments` — a compact header (80 px live picture at the body face) that plays the chosen state, or the hovered row's action while a row is hovered (`headerSource`), then the library as a checkbox per action, with search + 全选 + 清空.  Display order is two groups (ticked first, then the rest), each in library order; stored order is pure library order so the rotation never shifts.

**动作.**  A picker that searches and selects, a 1:1 pixel board beside the action's live preview (at `LIVE_ZOOM`), and a filmstrip.  Nothing writes — the artwork is authored.

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
  "assignments": { "whale-chan": { "tool": ["xie-daima"] } } }
```

The artwork is never stored — only ids.  Writes go through synchronously; the in-memory document is memoized by the raw storage text, and every cache downstream is keyed by object identity.  A foreign payload (an older install's document) is deliberately not interpreted — it reads as an empty store, and the next write replaces it.

---

## Interactions

| Trigger | Reaction |
|---|---|
| Click the dock pill | opens/closes the popup — no `petted` |
| Click anywhere in the popup | `petted` |
| mouseenter / focus while asleep | `woken` |

The dock is a read-out; the popup is the toy.  Without the popup primitives (`POPUP_OK` = false), the pill keeps `petted`.

---

## Tuning

```
// behavior/tuning.ts
TUNING = { reactToStatus: true, sleepAfterMs: 60_000, stateMinDwellMs: 150,
           minPlays: 3, playJitter: 2 }
```

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

1. Add `PetState` to `vocabulary.ts`, plus `STATES` and `STATE_NAMES`.
2. Add a `deriveState` branch in `facts.ts`.
3. Add labels and artwork.

---

## Testing

`pnpm test` — Node built-in runner; `pretest` rebuilds first.

| File | Covers |
|---|---|
| `pet.test.ts` | nine-state truth table, priority, sleep boundary |
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

### Manual checklist

1. Whale-chan at the far left, bobbing and blinking.  Hover → instant tooltip; focus → ring.
2. Click → popup above the pet (64 CSS px of body), same animation and frame.  Click panel → hearts.  Escape / outside click closes.
3. Send message: `think` immediately, then `stream` → `done` → `sleep` after ~60 s.
4. Settings → skin cards, 状态/动作 axis, 状态 opens as two columns.  The header plays the selected state's rotation; hovering a row previews that action.
5. 动作 view: picker, 1:1 board, live preview, filmstrip — nothing writes.
6. Change assignment → dock and popup play it.  Reload → assignment persists.