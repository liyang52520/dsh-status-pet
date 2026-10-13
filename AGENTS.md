# Status Pet — AGENTS.md

Whale-chan (鲸鱼娘) — a tiny pixel-art whale maid — lives in the DSH conversation
composer dock (the status bar above the chat input). **It shows what the agent is
doing** — sleeping when nothing happens, working while a tool runs, bowing up when
something needs your approval, sheepish when a turn fails. Click it and the **big
picture pops up**: an anchored, animated, pettable panel. The Settings tab swaps
**skins**, shows her whole **action library** one animation at a time, and lets you change
**which of a skin's own actions each state plays**.

### The three layers

Every feature belongs to exactly one layer:

| Layer | Where | What lives here | Rendering |
|---|---|---|---|
| Resident | dock, far left | the pet itself — a pure read-out, no interactions of its own | the 32px **avatar** face, backing 40×40, at `LIVE_ZOOM` → **16 CSS px of art** |
| Peek | the click popup | the big animated **full body** + every interaction, petting first | the 128px **body** face, backing 160×160, at `LIVE_ZOOM` → **64 CSS px of art** |
| Workshop | Settings → Status Pet | the skin cards, then ONE axis — **状态** / **动作**: the eleven states beside their edit (the state's header, an 80px live picture at the most detailed face, and one checkbox per action), and the library one action at a time on a 1:1 board that only LOOKS | the 状态 header picture and the 动作 preview at `LIVE_ZOOM`; the 动作 board at 1:1; every library row a PLAYING thumbnail at 1:1 |

A skin is one character as **two faces of every action**: the 32px avatar (dock,
REQUIRED) and the optional 128px full body (popup); a missing body face falls back
to that action's avatar at a crisp 4× integer upscale. The pixels are **authored
and frozen** — the user's one lever is the STATE ASSIGNMENT (which of a built-in's
own actions each state plays). The pet sits at the **far left of the dock, fixed** —
position is deliberately not configurable (see *Position: fixed at the far left*). The
**动作** view LOOKS and the **状态** view owns the assignment: nothing on the page can
change a pixel.

---

## Project Overview

| Field | Value |
|---|---|
| Package | `@local/dsh-status-pet` — client-plugin bundle with a no-op Host half, flat root |
| Mount points | `conversation.composer.dock` (id `status-pet`, order **−1000**, far left); `settings.section` (order 30, after plugins/agent-presets) |
| Rendering | Canvas 2D, **integer ratios only** (see *Rendering*) |
| Sprite model | **one PAIRED action library** (v9): 1–128 named actions, each ONE animation with TWO FACES — `cells[32]` (avatar, required) and `cells[128]` (body, optional; a missing face renders as the avatar at an exact 4×), 1–8 frames, and the frame settings (`ms`, `dx`/`dy` in avatar units) are SINGLE SOURCE for both faces. Every state holds a LIST OF ACTION IDS it plays (≤64; empty/absent = follow idle), and there is ONE such list for the whole artwork. One of a state's actions is rolled and held — the dock leads, the popup mirrors (see *The player*) |
| Dependencies | `react` + the seeded `@deepseek-ai/dsh-client-ui-primitives` (guarded; see *Hover tooltip*), both from the web shell |
| Build | **tsdown**, two IIFE builds: `src/main.ts` → `client.js` (plugin, code only) and `src/artwork-chunk.ts` → `client.artwork.js` (frames, 15.6MB, fetched on demand). TypeScript is compile-time only |

`1:1` is load-bearing: one sprite pixel = one **canvas** pixel, and the real rule is
**integer ratios only** — see *Rendering* for what that means at each stage.

---

## File Structure

`pet/` holds the pet itself (pure data + pure functions — no DOM, no React, node
runs it directly); `renderer/` is the draw/animate engine; `ui/` is where it
lives; the root files are plumbing.

```
├── package.json / cordis.patch.yml   bundle metadata + the one plugin row
├── index.js                          Host half (empty stub — everything is client-side)
├── client.js, client.artwork.js      BUILD ARTIFACTS (gitignored)
├── tsdown.config.ts / tsconfig.json  one IIFE build per artifact (never a splitting build)
├── src/
│   ├── main.ts                       loader wrapper + apply(ctx); owns DOCK_ORDER (−1000)
│   ├── host-deps.ts                  the ONLY place bare specifiers resolve (React, Tooltip,
│   │                                 createPortal); main.ts forwards `require` into it
│   ├── artwork.gen.ts                the built-in artwork: FROZEN baked data, hand-maintained,
│   │                                 still in the v8 shape (one library per crop) and PAIRED
│   │                                 through `upgradeArtwork` when the chunk is installed
│   ├── artwork-chunk.ts              chunk entry: registers the artwork with the loader
│   ├── pet/                          THE PET (pure: no DOM, no React)
│   │   ├── behavior.ts                 TUNING + derivePetState + STATES/REACTIONS/STATE_NAMES
│   │   ├── grids.ts                    GRIDS (32/128 geometry, maxOffset, canvasW) + LIVE_ZOOM
│   │   ├── labels.ts                   LABELS (en/zh) + namespace + translatorOrFallback
│   │   └── skins/                      the wardrobe — one concern, one invalidation rule each
│   │       ├── compose.ts        the PAIRED model (one action, two faces) + the baked v8
│   │       │                     shape + the ONE shape door (upgradeArtwork/pairArtwork)
│   │       │                     + parseFrame/spriteFor + cellFor/upscaleCell
│   │       ├── library.ts        the library reads (usedBy/libraryInfo/usageIndex) + the
│   │       │                     state assignment (assignTake/setStateSelection)
│   │       ├── validate.ts       validateArtwork — the authored chunk's invariant check,
│   │       │                     run by the suite (nothing validates at runtime)
│   │       ├── storage.ts        schema v10 + load/save + the v8→v10 migration
│   │       ├── documents.ts      artworkDoc/skinArtwork reads + the withOverrides DIFF
│   │       │                     (and the ONLY sanitizer an untrusted list of ids meets)
│   │       ├── built-ins.ts      BUILTIN_NAMES — the registry the artwork chunk fills
│   │       ├── resolve.ts        artwork → ResolvedSkin (identity-keyed) + ACTIVE + broadcast
│   │       └── store.ts          the FACADE: re-exports the public surface (one entry point)
│   ├── renderer/                     the engine: draws and animates the pet
│   │   ├── draw.ts / sprite-cache.ts the pixel plotter; per-frame offscreen bitmaps
│   │   ├── take-rotation.ts          the pure hold policy (which take, how many plays)
│   │   └── loop.ts                   ONE shared rAF ticker: frame player + the LEAD/FOLLOW
│   │                                 take channel + useReducedMotion
│   └── ui/                           where the pet lives (the three layers)
│       ├── hooks.ts / dock-pet.ts / dock-popup.ts / pet-preview.ts / styles.ts
│       └── settings/                 page.ts (the shell: skin cards, the 状态/动作
│                                     axis, the state list + its edit and the viewer),
│                                     skin-picker.ts (cards + activateSkin),
│                                     assignments.ts (the state's edit surface),
│                                     action-viewer.ts (the read-only 动作 view),
│                                     action-combo.ts (its searchable picker),
│                                     action-thumb.ts (a PLAYING row thumbnail),
│                                     frame-canvas.ts (a filmstrip still),
│                                     field.ts (one labelled row)
├── README.md / LICENSE / .gitignore   human overview / MIT / ignores the artifacts + node_modules
├── bench/        the perf harness (NOT shipped): store.mjs prices the hot paths,
│                harness.mjs stubs window and times a run
├── docs/media/   README imagery (frozen snapshots of the shipped artwork)
└── test/         node:test suite, TypeScript (see *Testing*)
```

`package.json` essentials: `dsh.bundle.patch`, `dsh.client = { platform: 'web',
immediately: true, inject: ['@deepseek-ai/dsh-client-ui-conversation'] }`,
`meta.title`/`description`. `cordis.patch.yml` inserts one row
`{ id: status-pet, name: '@local/dsh-status-pet' }` (the id is unique among
plugin rows; `name` must match package.json). Scripts: `build` (tsdown), `dev`
(tsdown --watch), `typecheck`, `test` (its `pretest` rebuilds first), `bench`.

---

## Architecture

### How it loads

1. `cordis.patch.yml` inserts the row; `package.json` → `dsh.client` makes the client
   loader fetch `client.js` immediately and inject it into the conversation package.
2. `client.js` calls `window.__ModuleLoader__.load()` and returns
   `{ inject: ['slots', 'locale'], apply(ctx) }`; `apply` registers the locale
   dictionaries, then `DockPet` into the dock slot and `SettingsPage` into `settings.section`.
3. `client.js` never contains a frame: it calls `require.async('./client.artwork.js')`
   (the loader serves siblings matching `/^client\.[\w.-]+\.js$/`) and hands the result
   to `installSkinArtwork`, which PAIRS the chunk, re-resolves the active skin and
   broadcasts. Until then the pet draws an empty canvas.

### Status sources — what makes it a *status* pet

The slot declares **no `owner`**, so `renderSlot(...)` passes `{}`; everything
arrives as the seat's standard session props:

| Prop | Reads | Cost |
|---|---|---|
| `useSessionStatus` | `pendingInteraction.kind`, `completionUnread` | lowest |
| `useSession` | `running`, `pendingSubmissions` (a send in flight = busy), `openState`, `lastAgentError`, `promptError` | low |
| `useChat` | `legacy.runningCalls` (`phase: 'start'` = executing, its `name` feeds the tooltip; `'preparing'` reads as streaming), `legacy.partial` (streaming) | forces Chat assembly |
| `sessionId` / `t` | status-map key / locale binding | — |

- **Do not poll.** No plugin-facing event exists for streaming or tool deltas;
  `SnapshotSelectorHook` is the mechanism, and every selector is narrow and primitive, so
  a re-render happens on a real transition, never per token.  `ConversationSnapshot` is
  useless here (only `views`/`activeTargets`), and `ConversationPhase === 'active'` means
  the transcript has content, *not* that it is busy.
- **`useChat` is the only costly source** — acceptable because the shipped `stats` pill at
  this seat already subscribes to it.
- **A missing prop must not crash.** `useNoSession`/`useNoStatus`/`useNoChat` keep the
  hook count stable, so a contract change degrades to a decorative pet, not a blank slot.

### Slot

The dock entry is registered at `DOCK_ORDER` = −1000 (`main.ts`), below every shipped
entry, so the pet is at the far left of the flex row (`stats` is at 0).

---

## Artwork

### Where the pixels live

The built-in artwork is **baked data, and FROZEN**. It was generated once, from
source gifs plus a recipe mapping each state to them, into `src/artwork.gen.ts` —
and the whole pipeline (the gifs, the recipe `gif-map.json`, the generator) is now
**DELETED from this repo**. The generated file is the source of truth and is
edited by hand if a built-in action needs a fix. The provenance comment above
every action (source gif, frame indices, gloss) is the surviving record of how it
was made, and the per-action ids/names/origins are the catalog.

It ships as its own chunk so `client.js` stays code-only (**84KB** against 15.6MB of
frames) — and it is left in the **v8 shape** (one library per crop) on purpose:
the 15.9MB of frozen pixels are hand-maintained and their provenance comments are
the catalog, so a codemod rewrite would risk the record for no runtime gain.
`installArtwork` runs the chunk through `upgradeArtwork` instead — a pass over 106
actions that SHARES every row string by reference and costs ~2ms. The pairing
therefore depends on the two crops' libraries staying in step in this file: the
same ids, in the same order, with the same `frameMs`, frame counts and offsets
(see *The paired model*).

Two editing paths: a **hand-edit** of `src/artwork.gen.ts` for a genuine fix, keeping
the provenance comment truthful; or **restoring the raw art**, the only route back to the
source: `git log` has `assets/*.gif`, `tools/gif-map.json` and `tools/gen-artwork.py`;
`git checkout <rev> -- assets tools`, put the gifs back under their original names, and
`python3 tools/gen-artwork.py` runs again unchanged (needs Python 3 + pillow + numpy).
Every action then stores `FRAMES` frames (currently 4) sampled evenly across the gif's
loop. `docs-media/` imagery is frozen the same way — its renderer
(`tools/gen-readme-media.py`, with `tools/dump-artwork.mjs`) survives only in `git log`.

The shipped DEFAULTS were re-aimed by hand: every state names 1–4 actions chosen for what
the state MEANS (`settings.hint.*`), not for what the old recipe left. That is an
authoring convention, NOT a cap — the store and renderer still accept up to `MAX_TAKES`
per state.

### The paired model — one shape for every skin

```js
cell    = { rows, prop? }                     // ONE FACE: a full grid of two-char pixels
frame   = { ms?, dx?, dy?, cells: { 32: cell, 128?: cell } }   // settings SHARED, pixels per face
action  = { id, name?, origin?, frameMs, frames: [frame, …] }  // ONE animation, TWO faces
artwork = { palette: ['transparent', …], actions: [action, …], states: { idle: [id, …], … } }
```

**This is the only artwork there is.** A built-in is exactly this shape, `pairArtwork`
produces it once at install, and there is exactly one path from an `Artwork` to
render-ready states. (The old
`top`/`flanks`/`faces`/`bottom` blocks and the `RECIPES` motion script were removed
with the gif pipeline: the gifs already carried the motion and the expressions, and
storing real frames is what let the artwork be 1:1 with the source at 128px.)

**Two crops ship, and they are TWO FACES OF ONE ACTION.** The **32px avatar** (a
64px square around the head, downscaled 2:1) is the dock, the **128px body** (a
128px square around the character, 1:1 with the gif) is the popup. The v8 model
kept one library per crop with no link between them, so the two layers could play
different animations; v9 makes that impossible:

- **`cells[32]` is REQUIRED, `cells[128]` is OPTIONAL.** A missing body face is
  DERIVED as its avatar at an exact 4× upscale (`upscaleCell`/`cellFor` — the ONE
  definition the renderer and the row thumbnails share), memoized per (frame, face);
  a skin whose actions ALL lack a body resolves its popup from the avatar grid at 4×
  (the cheap path). The body is optional PER ACTION, and in practice all-or-nothing:
  the baked chunk carries every face, and `pairArtwork` fills a blank avatar for a
  body-only action.
- **Everything that is not a pixel is SINGLE SOURCE.** Frame count, `frameMs`, the
  per-frame `ms` and the whole-frame offset live on the ACTION/FRAME and describe
  both faces, so there is no way to draw four frames for the head and five for the body.
- **Offsets are authored in AVATAR units**, rendered `× offsetScale(grid)` (×4 on the
  body): `GRIDS[128].maxOffset` is exactly `GRIDS[32].maxOffset × 4` — what that
  headroom was for.
- **One state table.** `states` names ids once for the whole artwork, so the dock and
  the popup roll from the same action set (two states naming the same set still share
  ONE resolved object by identity).

### The action library — why a state owns no pixels

The model flipped in v8 and gained its second face in v9, and this is the one
thing to understand before touching any of it: **an action belongs to the ARTWORK,
never to a state — and an action is ONE animation with TWO faces.** A state stores
a list of `id`s (`states.tool = ['xie-daima', 'hop']`), and `resolveStateTakes`
maps those ids through the library. The renderer only ever sees the resolved
`states[state].takes`, so **not one line of `renderer/` changed** — the flip is
entirely in the store, the Workshop and the data.

What that buys, and what to keep true:

- **Reuse is a reference.**  One action ticked in four states is still ONE
  definition: the pixels are stored once, and every surface reports the sharing —
  each row of the assignment list reads out `被 N 个状态在用` (`usedBy`), and two
  states that play the same set resolve to ONE object.
- **Ids, not indices.**  A state holds ids, so re-pointing a state can never shift
  what another state plays. Ids come from the chunk (`freeTakeId` and the
  content-dedupe are gone with the editor — nothing mints an id at runtime).
- **One representation of "unset".**  An empty/absent state list FOLLOWS IDLE —
  that is `settings.followIdle`, and `setStateSelection` deletes the key rather
  than storing `[]`. There is no "take over this state" step: ticking a checkbox
  IS taking it over.
- **An action's pace is shared.**  `frameMs` lives on the action, so an animation
  cannot tick at two speeds for two states.
- **Identity sharing in resolution.**  Two states that play the same set share ONE
  resolved object (`states.a === states.b`), and an unassigned state IS
  `states.idle`; the memo key is the SELECTION, not the state name.
- **The shape door is one function.**  `upgradeArtwork(input)` takes the baked v8
  chunk (or a v9 document, which it returns unchanged) and produces a v9 `Artwork`;
  `pairArtwork` folds the two crops' libraries into the one paired library, taking
  the AVATAR crop as the authority (action order, `frameMs`/`ms`/offsets/name, and
  the state assignment) and keeping any body-only action behind a blank avatar.
  It is memoized by the input object (a WeakMap) so a re-read gives back the SAME
  artwork identity the resolution caches are keyed on, and it shares row strings by
  reference throughout — upgrading 15.6MB of artwork is a pass over 106 objects,
  not a copy.

### Palette

The generator collected every colour its selected frames use and quantised to at
most 255 slots (`transparent` is slot 0, the two-character format's ceiling), so a
palette is not hand-authored. A palette belongs to the ARTWORK and is read
everywhere (the dock, the cards, the previews, the row thumbnails) — nothing
mutates it, and painting into it no longer exists.

---

## The Workshop

The Settings tab is **three things**:

    皮肤                    ← one card per built-in, a live portrait pinned by name
    [状态 | 动作]           ← the only navigation
    状态   the eleven states, and what each plays   (WRITES the assignment)
    动作   the whole library, one action at a time  (only LOOKS)

**皮肤.**  `SkinPicker` renders one card per `BUILTIN_NAMES` entry, each a
`PetPreview` at `scale: 2` (the avatar at 2×). Selecting applies instantly:
`activateSkin` writes `{ skin }` and the store re-resolves ACTIVE synchronously and
broadcasts. A name we do not ship is ignored — the card list and the store agree on
what exists.

**状态 — a light list beside its edit.**

- The left column is **eleven rows**, ONE LINE each: the state's name and its read-out
  (`{n} 个动作` / `跟随空闲`), grouped 状态 / 反应 because a reaction is not something the
  pet is *doing*. There is **no search** (eleven rows do not need one) and **no picture**:
  eleven copies of the same face was the visual noise the second build was reported for,
  and the state's picture is the right column's job.
- The right column is the state's **edit** (`StateAssignments`): a compact header (an
  80px live picture at the most detailed face, the name, and what the state MEANS) and
  then the library as a checkbox per action, with the **search box, 全选 and 清空 on
  ONE row** (they must not wrap: the box may shrink below its placeholder, and the ops
  are `flex:none`).  There is **no tick count** — "已勾选 1 个" says nothing the
  checkboxes do not; it appears only when the selection hits `MAX_TAKES`, which is
  news.  The list is DISPLAYED as two groups (this state's ticks
  first, then 其他动作, each in library order) while the STORED selection keeps library
  order, so a tick never re-orders the rotation; 全选 ADDS every action currently
  LISTED (capped at `MAX_TAKES`).
- **Every row PLAYS its action, and pointing at one plays it big.**  106 actions are
  106 different animations, so a list of names is a list you cannot read — and a still of
  frame 0 is the least informative frame there is (a bob, a blink and a prop all arrive
  later).  So the row's thumbnail is a live one-action player at **1:1** (`ActionThumb`,
  a 40px box holding 32px of art, so the frame's own `dx`/`dy` is visible too) — and while
  the pointer (or the keyboard focus) is on a row, the HEADER plays THAT action live at
  the popup's size (`takeId` pinned, `LIVE_ZOOM`), with `正在预览「…」` in place of the
  state's meaning.  A row is for finding it; the header is for judging it.
- The two columns are 176px + 16px + the rest of the pane (~555px in practice, so the
  checklist keeps ~363px — a checkbox, a thumbnail, a name and a read-out).  They stack
  only below 480px.  The difference between the two lists is the POINT: the eleven
  STATES are one character eleven times (no picture), while the library is 106 DIFFERENT
  animations (each one pictured, and playable on hover).

**动作 — the library, one action at a time, full width.**

- `ActionViewer` shows the skin's whole animation library with ONE action on the
  board, and it is a **VIEWER**: the pixels are authored, so nothing here writes
  and nothing here copies.
- The **picker** (`ActionCombo`) is the only control that changes what you see:
  closed it reads out the action on the board, focused it opens a filtered list
  where every row is a PLAYING thumbnail (`ActionThumb`, same ticker as the pet)
  plus its read-out (`{n} 帧 · 被 N 个状态在用`), ↑/↓ move the highlight, Enter
  picks, Esc closes.
- **画布** is the face switch (头像 / 全身 — a full-width row ON TOP of the
  board, so the board always starts on its own line) and then the board beside
  the action's own live preview at the popup's display size (`LIVE_ZOOM`).  The
  board draws the artwork 1:1 and is a PICTURE: `grid × grid` plain cells
  carrying a colour and **no pointer handler at all**, so a stray click cannot
  start a stroke on a frozen library.  (`status-pet-board-readonly` is the class
  that says so; it exists so the cursor rule has something to hang from.)
- **帧** is that action's filmstrip: a still per frame, which SELECTS one.
  Looking at a frame in order is how an animation is read — there is no frame
  CRUD.
- **The writing controls are absent BY CONSTRUCTION, not behind a flag**:
  `action-viewer.ts` simply does not render 新建动作 / 删除动作 / 批量删除,
  复制一帧 / 空白帧 / 删除帧, the 画笔 box, 当前帧's numbers (时长 / 整幅挪动 /
  装饰) or the 128 draft buttons.  A built-in has no `editable` switch to get
  wrong, and the studio that had one no longer exists.
- The stage is a **grid**: one column, two from 380px of PANE up (an `@container`
  query on `.status-pet-studio`), because the preview is only 80px wide — so the
  pair makes ONE row at every real pane width.
- **The 动作 view is where an action is chosen; the 状态 view is where it is
  assigned.**  They are the two halves of one axis and neither duplicates the
  other: 动作 has no checkboxes, and 状态 has no board.

Invariants:

- **The assignment is a DIFF beside the frozen artwork.**  `saveSkinStates` writes
  `builtinStates: { 'whale-chan': { tool: ['xie-daima'] } }` — one flat `{state: ids}`
  table.  An ABSENT state key means "no opinion, use the authored assignment" (so a
  later artwork update still moves the states the user never touched), while a
  PRESENT-BUT-EMPTY list means "this state deliberately plays nothing, it follows
  idle".  A diff that ends where it started is not written at all, and an empty table
  is dropped rather than stored.
- **The diff is the only untrusted input the renderer can see**, and
  `withOverrides` is where it is sanitized: unknown states are ignored, ids the
  library does not carry are dropped, duplicates collapse, the list is capped at
  `MAX_TAKES`, and `idle` falls back to the authored assignment rather than being left
  empty.  A corrupt store must never blank the pet.
- **`idle` can never be emptied — but 清空 still works on it.**  It is the anchor every
  unassigned state falls back to, and resolution requires it to play something.  清空 on
  空闲 clears down to its FIRST action — and because that rule applies to ONE of eleven
  states, it is **asked for** (`clearIdleTitle` + `clearIdleHint` in a confirm card)
  instead of being printed on every visit; every other state clears to empty at once,
  because an empty selection IS the idle fallback.  The button keeps the rule as its
  `title`.
- **There is exactly ONE door per selection.**  `page.ts` owns both the state (for 状态)
  and the action (for 动作), and hands them down; each surface owns nothing but its own
  rows.  There is no state dropdown, no per-row ✎ and no second picker — the master list
  IS the selector, and the viewer's picker IS the way to another action.
- **The state list is 176px, and the two columns stack only below 480px.**  The pane is
  ~555 CSS px wide in practice (measured off a full-dialog screenshot), so 176 + 16 +
  ~363 is the split that fits; an earlier build used 216px with a 700px stacking
  threshold and ended up as two full-width blocks.  The list is LIGHT on purpose — no
  border box, no search, no 90px cards — because that weight, not the two-column idea,
  was what looked wrong.
- **The library is a SCROLL REGION.**  106 rows as a plain column made the card several
  screens tall and pushed 全选 out of reach: it is `max-height: min(44vh, 360px)` with
  `overflow: auto`, so the search line above it stays put while the rows move under it.

### Storage — localStorage

A loader plugin cannot declare a Cordis `Config`, so state lives in
`localStorage["status-pet:skin"]`:

```jsonc
{ "v": 10,                      // schema version — see migrate below
  "skin": "whale-chan",
  "builtinStates": { "whale-chan": { "tool": ["xie-daima"] } } }
                                // per-built-in state-assignment DIFF, ONE flat
                                // table (absent = authored; []=follow idle)
```

That is ALL of it.  The artwork is authored data and is never stored: it ships as its
own lazily-loaded chunk.  What the user owns is a handful of ids, so the payload is a
few hundred bytes.

Rules to keep:

- **The diff is the only thing stored that the renderer did not author**, and
  `withOverrides` (documents.ts) is the only place it becomes a state table — unknown
  states ignored, ids the library does not carry dropped, duplicates collapsed,
  capped at `MAX_TAKES`, `idle` never left empty.  `validateArtwork` (validate.ts) is a
  separate, TEST-ONLY check of the authored chunk: nothing validates on a hot path any
  more, because nothing untrusted reaches the renderer.
- **An older payload is MIGRATED, not dropped.**  `migrate` keeps the skin choice
  (version-independent), flattens a v8 per-crop `builtinStates` diff into the flat one
  (the avatar crop's diff wins — it is the face that is always required), and DROPS the
  keys the customisation build wrote (`custom`, `brushes`): a build that cannot render
  those pixels has no meaning for them.  A payload from a NEWER version keeps the skin
  choice and nothing else.  Anything that is not a JSON object is dropped.
- **A stale skin name falls back.**  `storedName` resolves any name that is not a
  `BUILTIN_NAMES` entry (an old `'custom'`, a hand-edited store) to the default skin —
  the pet lights up instead of blanking.
- **Memory is a memo, storage is the truth.**  `loadStored` parses once per raw TEXT,
  so a write of ours (or another tab's) is noticed exactly once, and a `storage` event
  re-resolves ACTIVE and re-broadcasts.  `saveStored` merges, writes through
  SYNCHRONOUSLY (the payload is tiny — there is no coalescing window, no flush timer,
  nothing to lose on `pagehide`), then re-resolves ACTIVE and notifies.  A REFUSED
  write (quota, private mode) drops the in-memory document so the next read re-parses
  what storage actually holds instead of serving a lie.
- **Resolution is lazy and cached BY ARTWORK IDENTITY.**  A skin resolves states on
  first access (a state that plays nothing follows idle BY IDENTITY, and two states
  with the same selection share one object — the memo key is the SELECTION, not the
  state name), and every resolution is memoized on the `Artwork` object itself.  The
  artwork is immutable and `withOverrides` shares the action library by reference, so a
  write that re-points a state resolves a new skin through the SAME action objects —
  and every sprite, and therefore every pre-rendered bitmap, survives it.  Faces are
  parsed through `spriteFor`, memoized per CELL object (and the 4× body draft per
  frame+face).
- **The store owns ACTIVE — broadcast is notification only.**  `saveStored`
  re-resolves the module-level `ACTIVE` synchronously on every write, then dispatches
  `status-pet:skin-changed`; a module-level `storage` listener does the same for
  other tabs.  `onSkinChange` is only for components holding their own resolved copy
  or selection state.
- **A write that changes nothing is not a write.**  `saveSkinStates` compares the
  resulting table with the stored one and returns early, so re-ticking an action or
  clearing a state that was already following idle costs no serialization, no
  re-resolve and no broadcast.

---

## Behaviour

### State machine

`derivePetState(facts)` is a **pure** function, so its priority order is verifiable
without a browser. Highest priority first: what the user owes the agent, then what
the agent is doing, then the outcome.

| State | Condition |
|---|---|
| `approval` | `pendingInteraction.kind === 'approval'` |
| `question` | `pendingInteraction.kind === 'question'` |
| `tool` | busy and a dispatched tool call (`phase: 'start'`) is executing |
| `stream` | busy and output is arriving (assistant text, or tool-call arguments still being generated — `phase: 'preparing'`) |
| `think` | busy, no output yet — *busy* means `running` **or** a submission echo still in flight (`pendingSubmissions`), so the pet reacts the instant you hit send |
| `error` | not busy and (`lastAgentError`, `promptError`, or `openState === 'error'`) |
| `done` | not busy and `completionUnread` |
| `sleep` | idle for `TUNING.sleepAfterMs` |
| `idle` | otherwise |

`TUNING.reactToStatus === false` short-circuits to `idle`, giving a purely
decorative pet.

### Registries — how to extend

```js
const STATES = { idle:{}, sleep:{}, think:{}, stream:{}, tool:{},
  approval:{ pill:' attention' }, question:{ pill:' attention' },
  error:{ pill:' error' }, done:{} };                    // vocabulary + seat accent
const REACTIONS = { petted:{ durationMs:900 }, woken:{ durationMs:1200 } };
```

Motion is **artwork**, not config: the system owns only the vocabulary (`STATE_NAMES` =
9 states + 2 reactions), the pill accent on the dock seat, and reaction durations.
Adding a state means a `STATES` entry, a label in both locales, a `derivePetState`
branch, and artwork: an action in `src/artwork.gen.ts` (both crops), ticked onto the new
state in the state list.

### Interactions

`react(name)` sets a transient override with the reaction's own duration; the
override outranks the derived state while it lasts and then expires on its own.

| Trigger | Reaction |
|---|---|
| click the dock pill | opens the popup, or closes it when open — deliberately **no** `petted`: the pill is a peephole, so wanting to look at the pet never plays a reaction at it |
| click **anywhere in the popup** | `petted` — the panel owns it (padding and caption included, not just the 64px sprite), feeds it to the big canvas and echoes it in the caption; the sprite's own button pets too, so the paths agree |
| `mouseenter` while asleep | `woken` |
| keyboard `focus` while asleep | `woken` |

Adding one is a `REACTIONS` entry plus a trigger calling `react(name)`; `woken` is wired
to `focus` as well as pointer entry, so the pet is not mouse-only. **Interaction work goes
in the popup**: the dock is the status read-out, the popup is the toy. The one exception is
a host where `POPUP_OK` is false — with no popup to open the pill keeps `petted` so it is
not inert. Anything more involved belongs behind the popup.

### Hover tooltip

The state tooltip is the host's own design-system `Tooltip` (seeded statically, like the
"context used" meter), with `delayMs: 0` so it appears the instant the pointer lands
rather than after the native `title` dwell. `Tooltip` clones the button and chains its
handlers, so the wake and pet triggers keep firing. The require is guarded: a host without
the seed degrades to native `title`, set **only** in that fallback — otherwise a delayed
native bubble stacks on the instant one. The same wrapper covers the settings preview, and
the tooltip is `disabled` while the popup is open.

### Click popup

Clicking the pet opens a **popup with the big picture** — the meter panel's mechanism:
primitives' `useAnchoredPosition` (anchored above the pet) + `useDismissOnOutsidePointer`
+ an Escape listener, the panel portal-ed to `document.body` via `createPortal`. All three
are seeded by the web shell; if any is missing `POPUP_OK` is false and the pill falls back
to plain click-to-pet. `POPUP_OK` is decided once at module load, so the conditional hook
calls are stable per render.

The popup always shows the **most detailed version** of the current skin
(`resolveBestSkin`: the 128px body face when the skin carries one, else its own
avatar — drawn at 4×, an integer upscale stays crisp). It is a live animated preview
— same loop, pinned via `skinRef`, shared component `PetPreview` (`best: true`,
`zoom: LIVE_ZOOM`, `follow: true`) — **pinned to the dock's derived state and
mirroring the dock's take and phase**, with the current state's name as its caption:
the big picture is the animation the pet is actually doing, not a second roll. The
reaction is the one thing that outranks the pin — petting belongs to the popup, so a
`petted`/`woken` face plays there and the dock keeps its status read-out.
The anchor ref sits on a wrapper `span`, because `Tooltip` clones the button and may
attach its own ref.

The **panel** is the petting target, not just the sprite: `DockPopup` owns one
`usePetReaction`, hands it to `PetPreview` as a `reaction` prop (so the ONE canvas plays
it) and echoes it in the caption — a click on the padding or caption must answer too, or
the popup reads as dead. `PetPreview` keeps its own click reaction for the skin cards;
the prop outranks it.

Click semantics: the dock pill is a **peephole** — where the popup primitives exist, a
click only opens it (a second click, Escape or an outside pointer closes it) and never
plays `petted`; only in a host without the primitives does the pill keep `petted`, since
there is nowhere else for it to live.

---

## Rendering

### Geometry and the sizing rule

Sprite geometry lives in `GRIDS` (`pet/grids.ts`):

```js
const GRIDS = {
  32:  { grid: 32,  canvasH: 40,  baseY: 4,  padX: 4,  maxOffset: 4,  canvasW: 40 },
  128: { grid: 128, canvasH: 160, baseY: 16, padX: 16, maxOffset: 16, canvasW: 160 },
};
```

The canvas is LARGER than the grid on **both axes**, giving frames headroom for their
`dx`/`dy`: `baseY` above, `canvasH - baseY - grid` below, `padX` on each side (the sprite
draws at `padX + dx`). The suite recomputes `maxOffset = padX` and
`canvasW === grid + 2 × padX`, and fails on a clipped pixel in EITHER axis, accents
included. The 128px headroom is deliberately 16 — `maxOffset` is `4 ×` the avatar's — so
the same hop is legal at both faces.

The sizing rule is **integer ratios only**, read at two stages:

- **The rendered face (1:1).**  `GRIDS` is the size the artwork is DRAWN at: one sprite
  pixel per canvas pixel, plus the headroom above, and a face with no 128px block is
  drawn from its own avatar at 4× (128 = 32 × 4). The skin cards show the avatar at 2×
  (an 80px canvas); a library row plays its action at **1:1** — `ActionThumb` renders the
  avatar crop at `scale: 1`, which is a 40 CSS px box around 32 px of art, and that
  headroom is deliberate: a frame's `dx`/`dy` needs it, so a bob is visible in the row
  instead of clipped.  The eleven-row STATE list carries no picture at all: that is one
  face eleven times, and its picture is the header's.  The 动作 board draws the artwork
  at 1:1 too (the same authored size), with its live preview beside it at `LIVE_ZOOM`.
- **The live layers (rendered 1:1, displayed at `LIVE_ZOOM = 1/2`).**  The dock and the
  popup render into a 40×40 / 160×160 backing store and set the **CSS box** to half that
  (20 / 80) — **16 CSS px of avatar art**, **64 CSS px of body art**. `LIVE_ZOOM` is an
  exact 1:2 against an artwork that is an exact 2× fill of its crops, so `pixelated` maps
  one destination pixel to one source pixel. The sprite is **never re-rendered smaller**:
  `startLoop` scales only `canvas.style.width/height` (`PetPreview` takes the same `zoom`
  prop, default 1). `DockPopup` and `DockPet` pass `LIVE_ZOOM`; the skin cards pass
  `scale: 2`, the library rows play at 1:1, and the state's header picture is the popup's
  `LIVE_ZOOM`.

A filmstrip still (`FrameCanvas`, `THUMB_CSS` = 64 on screen) backs one pixel per grid
pixel (32 → 2× up, 128 → 2:1 down) — both exact.  It is the one place a still is RIGHT: a
filmstrip thumbnail stands for exactly one frame, and stepping through them is how an
animation is read.

### The player

**One shared `requestAnimationFrame` ticker** (`renderer/loop.ts`) drives every pet
canvas. Each canvas's player reads the current state through a ref, so state changes
never restart anything. The player model:

```js
function tick(now) {
  const skin = /* skinRef pin, explicit blank, or the store's ACTIVE */;
  const entry = skin.states[faceRef.current] || skin.states.idle;   // one state table
  if (state changed) { cycleStart = now; rotation = startTake(takes); }  // switches at once
  let take = takeOf(rotation);                                       // held take
  if (cycle wrapped) {                                               // hold, then roll
    cycleStart = now; rotation = advanceTake(rotation, takes);       // TUNING.takeMinPlays
    take = takeOf(rotation);                                         // never the one just played
  }
  const frame = reducedMotion ? frames[0] : take.frames[elapsed / ms];
  if (role === 'lead') publishTake(skin.name, state, index, cycleStart, now);   // the dock
  if (skin === drawn && frame.sprite === drawnSprite && scale unchanged) return; // dirty
  ctx.drawImage(spriteBitmap(frame.sprite, skin.palette, scale),        // ONE bitmap/frame
    (GRIDS[skin.grid].padX + frame.dx) * scale,   // the FRAME's offset, already ×offsetScale
    (GRIDS[skin.grid].baseY + frame.dy) * scale);
}
```

**A take is held, not re-rolled per cycle** (`renderer/take-rotation.ts`, pure and
injectable-random so the suite drives it): `startTake` rolls one take and gives it
`TUNING.takeMinPlays + 0…takePlayJitter` plays; `advanceTake` counts them down on each
wrap and only then rolls the next — never the one just played (a roll per cycle, and a
cycle is only 1.2–3.4 s, read as frantic switching). A **state change ignores the hold**
entirely: the new state's take is rolled and starts at frame 0 at once (`stateMinDwellMs`
still decides whether a *flapping* state restarts the phase). The roll happens BEFORE the
take is read, so a rolled take starts on its own first frame.

**The two live layers share ONE take.**  A player is a LEADER, a FOLLOWER or free
(`LoopRole`): the dock LEADS — every tick it publishes the take it is playing and the
instant its cycle started — and the click popup FOLLOWS, drawing the leader's take
AND phase whenever it is showing the same state of the same skin (otherwise, or when
the leader has been silent for 250 ms, it rolls its own). The paired model already
guarantees the two faces resolve the same action SET; the channel is what stops the
PLAYER rolling a different one, and it also fixes the phase. A pinned preview (a skin
card, the state's header) is free, so previews never synchronise with the dock.

**Many small players are cheap, because a tick that changes nothing draws nothing.**
Every library row is a live player (`ActionThumb`), so the checklist alone can hold 106
of them and the picker's open list another 106 — measured, that is **0.016 ms per rAF
tick for 212 players, ~0.1% of a 60fps frame**: the shared ticker does the rotation
arithmetic and the frame walk, then the sprite-identity dirty check returns before any
canvas work, and only the rows whose frame actually changed (every 400 ms) touch a
pre-rendered 40×40 bitmap. Reduced motion freezes them on their first frame, a hidden
tab stops the ticker, and unmounting returns the player to the pool.

The whole-frame offset lives on the RESOLVED FRAME (`dx`/`dy`, already multiplied by
`offsetScale(grid)`), not on the sprite: that is what makes one `整幅挪动` the same
hop on both faces. Every sprite is pre-rendered to an offscreen bitmap once per skin
(`renderer/sprite-cache.ts`, keyed by sprite identity).

### Resource hygiene

All three are required, not optional:

- **Hidden tab** — `visibilitychange` cancels the rAF loop; the phase is absolute, so
  resuming is smooth.
- **Reduced motion** — tracked in a ref: the loop freezes on each take's first frame and
  the CSS disables the pulse.
- **Cleanup** — every effect returns its own disposer. The sleep timer is a single
  `setTimeout` armed when activity ends (`ui/hooks.ts`) — nothing polls.

---

## Tuning, and why there is no `Config`

Every behavioural knob lives in one flat `TUNING` object at the top of
`src/pet/behavior.ts`: `reactToStatus`, `sleepAfterMs`, `stateMinDwellMs` (a state
change always switches the ARTWORK at once, but restarts the playback cycle at its
first take/frame only once the state has been stable that long — `think`/`stream`/
`tool` flap while a tool call's arguments stream, and restarting on every flap
played only frame 0, which read as a twitch), and `takeMinPlays` / `takePlayJitter`.
The fixed dock order is NOT a pet-behaviour knob — it lives beside its only consumer
as `DOCK_ORDER` in `src/main.ts`. Sprite geometry lives in `GRIDS`.

---

## CSS

Inlined via a `<style>` element rendered inside the fragment, so unmounting removes
it. Tokens only (plus literal colours for artwork):

| Token | Usage |
|---|---|
| `--dsw-alias-label-tertiary` | text/icon colour |
| `--dsw-alias-interactive-bg-hover` | hover & active background |
| `--dsw-alias-state-business-primary` | focus-visible outline |
| `--dsw-alias-state-warn-primary` | attention pulse (`color-mix`) |
| `--dsw-alias-state-error-primary` | error pill tint (`color-mix`) |

| Class | State | Effect |
|---|---|---|
| `.attention` | `approval`, `question` | 1.6 s warn-coloured pulse |
| `.error` | `error` | static error-coloured tint |

State accents come **after** `:hover` (at equal specificity the state colour persists
while hovered), are colour-only, and are wrapped in `color-mix(…, transparent)`, so a
renamed token — or an engine without `color-mix` — degrades to an untinted pill.

---

## Registration

```js
const NS = 'status-pet';
return {
  inject: ['slots', 'locale'],
  // Exposed for the bundle smoke test and embedders: the store's public surface
  // plus the components.  The host ignores unknown fields.
  skinTools: { /* the store's public surface + ui: { SkinPicker, ActionViewer, PetPreview } */ },
  apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, LABELS));   // unloading removes it
    const t = ctx.locale.bind(NS);                       // serves the label thunk
    // `slots.inject` re-runs the callback whenever the slot collapses and is
    // re-declared (composer remounts, view switches).  The DOCK row carries the
    // fixed DOCK_ORDER (−1000); the settings row carries order 30 (general 0,
    // models 10, plugins 15, agent-presets 20).  If the settings UI package is
    // absent the inject never fires and the pet keeps working.
    ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
      name: 'conversation.composer.dock', id: 'status-pet', order: DOCK_ORDER,
      label: () => t('label'), locale: NS,
    }, DockPet));
    ctx.slots.inject('settings.section', () => ctx.slots.register({
      name: 'settings.section', id: 'status-pet', order: 30,
      label: () => t('settings.nav'), locale: NS,
    }, SettingsPage));
  },
};
```

- `ctx.effect(fn)` owns the dictionary registration, so unloading removes it; `LABELS`
  supplies **both** `en` and `zh` in one call.
- `ctx.locale.bind(NS)` and `locale: NS` are two halves of one thing: the binding serves
  the registration-time `label` thunk, while `locale: NS` makes the slot hand the component
  its own `t` prop.
- `label` is a **thunk**, re-read on every projection, so it follows the active locale
  without re-registering.
- **Every user-visible string goes through the namespace** — the `title`, `aria-label`,
  `label` and every `settings.*` key. Never hardcode copy.

---

## Position: fixed at the far left

A user-configurable position was tried and removed: the dock's trailing **"context used"
meter is hardcoded by the host OUTSIDE the slot** (a fixed sibling in a `display:flex`
row), so "far right" could never be rightmost — the setting's extremes were unreachable by
construction.

The position is therefore fixed: `DOCK_ORDER = −1000` (`main.ts`), below every shipped
dock entry, so the pet is at the far left of the slot row, left of the `stats` pill
(order 0). No position store, no Settings → General row, no drag.

---

## Development Workflow

### Edit cycle

`client.js` is a **build artifact**, so the cycle is always: edit `src/`, rebuild,
reload.

1. **Any `src/` change** — `pnpm build` (or keep `pnpm dev` watching), then refresh the
   page (HMR may reload it without one when `dev:web` runs from the DSH checkout).
2. **`cordis.patch.yml` / `package.json` `meta`/`dsh`** — the patch applies at install
   time only: remove and reinstall the bundle.
3. **`pnpm test`** rebuilds first (`pretest`), so the suite always runs fresh source.

### Performance harness — `pnpm bench`

`bench/store.mjs` runs the store hot paths against the REAL modules (type-stripped by
node, localStorage stubbed) and prints wall-clock times: the chunk landing + first
resolve, a cold and a warm resolve, the assignment list's 106 pinned previews, one state
tick (assign + persist + re-resolve + broadcast), a burst of ticks and what it costs
localStorage in bytes, a skin switch, and the row read-outs. `bench/harness.mjs` stubs
`window` and times a run. Run it before and after touching the store, the resolution
caches or the draw path — this file's numbers come from it.

It used to price a 15 MB document load, a painted pixel and a coalesced snapshot. Those
paths are gone with the customisation pipeline, which is exactly why the numbers here are
now tens of MICROseconds and a burst of 40 ticks costs ~11 KB of storage in total.

### Adding / changing artwork (built-in)

See *Artwork → Where the pixels live* for the two paths (hand-edit
`src/artwork.gen.ts`; restore `assets/` + `tools/` from `git log` and re-run the
generator). A genuine fix to a built-in action is path 1: keep the provenance
comment above the entry truthful, edit THAT ACTION IN BOTH CROPS (same id, same
`frameMs`, same frame count, same offsets — the pairing door trusts the avatar crop
and would otherwise pair a stale body), then `pnpm build` and reload. `pnpm test`
checks the two crops' libraries against each other, so a one-sided edit fails the
suite rather than the popup.

### Adding an interaction

1. Add the `REACTIONS` entry (`durationMs`), plus an action in the library if the
   two default reactions are not enough.
2. Add both labels, and the name to `ReactionName` + `STATE_NAMES`.
3. Wire a trigger that calls `react(name)`.
4. Run `pnpm test`.

### Adding a skin

A skin is one `Artwork` document. To ship another built-in:

1. add its `Artwork` document to `src/artwork.gen.ts` and export it from that file's
   `ARTWORK` record — in the v8 shape (one library per crop, matching ids), which the
   runtime pairs at install;
2. add its name to `BUILTIN_NAMES` in `src/pet/skins/built-ins.ts` — the registry the
   artwork chunk fills;
3. add `settings.skin.<name>` to **both** `LABELS.en` and `LABELS.zh`;
4. run `pnpm test` and look at it in the Settings tab.

Nothing else: there is no per-skin composition, palette or symmetry rule.

### Changing the display size

There is no user-facing size control. Sizes live in `GRIDS` (with `LIVE_ZOOM` beside
it on the same rule — see *Rendering*); adding a new grid size means a `GRIDS` entry
(with `maxOffset` derived from its headroom), plus artwork on skins that support it.
Any change to `canvasH`/`baseY`/`maxOffset` is checked by the suite.

### Changing the slot position

The position is fixed at `DOCK_ORDER` (−1000 in `main.ts`, far left — lower is
further left; the `stats` pill uses 0). Moving the pet is a one-line edit plus a page
refresh; there is no user-facing control.

---

## Testing

`pnpm test` runs Node's built-in runner — no framework; Node 24 type-strips the `.ts`
files in place, and `pretest` rebuilds `client.js` so the bundle smoke test runs against
fresh source. No browser, no DOM, and it never scrapes source text: every assertion runs
against a real module or the real artifact.

Two halves: **pure modules imported directly** (`behavior`, `labels`, `skins`,
`skin-store`, `take-rotation`) with no stub beyond a localStorage-shaped `window`; and
**UI / bundle / loop**, driving the real components (stubbed React + slot props, host deps
through the same `initHostDeps(require)` the loader uses), the built `client.js` (stubbed
`window.__ModuleLoader__`) and the real player (stubbed canvas/ctx, stubbed rAF, a
hand-driven clock).

| File | Covers |
|---|---|
| `behavior.test.ts` | the nine-state truth table, all three error paths, the send echo → `think`, `preparing` → `stream`, the sleep boundary (59999 → idle / 60001 → sleep), priority order, and tool-name interpolation (a `phase: 'start'` call names itself via `toolNamed`'s `{name}`; a nameless call keeps the generic `tool` label) |
| `labels.test.ts` | dictionary shape, locale fallback |
| `skins.test.ts` | the PAIRED built-in through `validateArtwork`: both faces present and correctly sized, the shared frame count / pace / `ms` / offsets, no clipping at EITHER face, both crops' libraries identical and in the same order (the pairing guarantee starts here), every action named and traceable, the palette covering every painted pixel |
| `skin-store.test.ts` | the pairing door (v8 → v9, the avatar crop's authority, body-only actions kept, rows shared by reference, the door memoized); the assignment DIFF (no-op diffs not stored, `idle` never emptied, unknown skins ignored) and its sanitizing (`withOverrides` dropping unknown ids/states, deduping, capping); `assignTake`/`setStateSelection`/`usedBy`/`libraryInfo`; resolution fallbacks (unknown skin name → default, no-body → 4× avatar) and identity sharing; the migration (v9 → v10 dropping `custom`/`brushes`, v8 per-crop diffs, newer payloads, corrupt ones); the pixel format; grid/state invariants |
| `performance.test.ts` | the hot-path contracts: resolution memoized by artwork identity, the derived 128 face memoized per (frame, face), the assignment sharing the library BY REFERENCE, one write-through snapshot per tick — and the assertion that the payload never contains artwork |
| `take-rotation.test.ts` | the pure hold policy under a seeded random |
| `loop.test.ts` | the real player: held takes, an immediate switch at frame 0, flapping states, the offset read from the resolved FRAME, and the TAKE CHANNEL (a follower draws the leader's exact frame; a different state or a dead leader rolls its own) |
| `draw.test.ts` | the ImageData rasterizer: colour packing, transparency, the scaled scratch-canvas path, the palette table |
| `bundle.test.ts` | the built `client.js` under a stubbed loader |
| `ui.test.ts` | registration (one dock entry, **no `settings.general.item` row**, the settings entry, label thunk); the Workshop (skin cards, ONE axis and no tab row; the 状态 view as two columns with eleven ONE-LINE rows (name + read-out, no picture, reactions in their own group, **no search**) beside an edit surface whose header names the state once, at the most detailed face, with the search box, 全选 and 清空 on ONE line, each row a live 1:1 thumbnail pinned to ITS action (a one-action skin whose playhead advances) and the header playing the hovered action live; **the 动作 view as a VIEWER** — the picker opens with a thumbnail and a read-out per row, filters as you type and Enter picks, the face switch sits on the canvas row and nowhere else, a board cell carries its colour and NO handler, the preview is pinned to the action on the board at `LIVE_ZOOM`, the filmstrip selects a frame, and every writing control is absent); the assignment surface on the REAL 106-action library (a tick writes a REFERENCE and lands in the stored diff, 全选 reaches exactly `MAX_TAKES` and announces the cap, 清空 stores a present-but-empty list so the state follows idle, and 清空 on 空闲 asks for confirmation and keeps one action); the live sizes (dock 16px of avatar, popup 64px of body); the stylesheet (balanced, the two columns, the stage GRID and its container query, the scroll region — and the writing controls' rules absent); interactions end to end; the popup (open/close, `aria-haspopup`/`aria-expanded`, tooltip disabled, panel-wide petting); registry/locale integrity |

**Four traps the React stub has already fallen into — do not reintroduce them:** the
component closes over the React instance passed to `factory(require)`, so the stub must be
a **single** instance (a fresh one per render silently empties the `useState` queue and
every `idleMs` case passes vacuously); hook storage must be reset **per mount** (or one
test's `reaction` leaks into the next and the locale assertions fail for the wrong
reason); the `useState` stub must run **lazy initializers** (the editors seed state
with `useState(() => …)`, and storing the function verbatim makes every editor test fail
in confusing ways); and a NESTED component is an unreduced ELEMENT in the tree — the stub
does not render children components, so a page test reads `StateAssignments`,
`ActionViewer` and `ActionCombo` output through the `expand()` helper
(`el.type(el.props)`), which starts at the page's own hook count and therefore leaves the
page's state alone (the same move the popup tests make).  `findDeep` does not flatten
children arrays either — use `findAllDeep` for anything rendered inside a `map`, and
expand the nested component at the SAME hook base every call or its own state moves under
it.

### What the suite cannot verify

No real canvas or real clock, so **appearance is untested**: the actual look, whether the
bob reads well, whether the pulse is too noisy, whether an 11 s hold feels too long,
whether the expressions are legible at 32 px. Those need eyes on a running instance. (The
player's *timing* IS tested — `loop.test.ts` drives the real `startLoop`.)

### Manual checklist

Run through this after a change that touches appearance or layout:

1. Whale-chan sits at the **far left** of the dock, bobbing perceptibly (not a shimmer)
   and blinking. Hover lightens the background and the tooltip appears instantly (no
   native dwell), naming the state — and the tool while one executes — in the UI
   language; tab-focus draws the ring; hover/focus while asleep wakes it; dragging does
   nothing; Settings → General has **no** position row.
2. Click: the **big-picture popup** opens above the pet (64 CSS px of body) showing the
   SAME action and frame as the dock, and the dock pet does **not** react. Click anywhere
   in the panel and it hops with hearts, the caption echoing the reaction; a second click,
   Escape or an outside click closes it, and while open the tooltip stays out of the way.
3. Send a message: `think` the instant you hit send, then `stream` → `done` → `sleep`
   after ~60 s idle. A tool approval pulses the pill. Reduced motion: no bob, no pulse,
   no jump. Hidden tab: the loop stops. Idle for a minute: each take plays 3–5 whole
   loops (6–11 s) before another is rolled — no flicker every couple of seconds.
4. In DSH Settings, the "状态宠物" tab shows the skin cards (each a live portrait at 2×),
   then ONE axis — 状态 / 动作 — and NO tab row. 状态 opens first, as TWO columns at the
   pane's real width: eleven LIGHT one-line rows on the left (name + what it plays; no
   picture, no search box, no bordered panel, the reactions under a 反应 caption) and the
   state's edit on the right (one 80px live picture + name + meaning, then the checklist,
   whose every row PLAYS its action and whose header plays the one you point at, big).
   Click a row and the right half follows it. There must be no second 「状态」 heading, no state
   dropdown and no tick count; 全选 / 清空 sit on the search line, and 清空 on 空闲 asks
   for confirmation instead of the page carrying the rule as text.  A page reload must
   bring the same assignment back.
5. Switch to 动作: the board takes the pane, its face switch (头像 / 全身) sits ON TOP of
   it, the action's live preview sits beside it, and the filmstrip under it steps through
   the action's frames. The picker opens the whole library with PLAYING thumbnails,
   filters as you type, and Enter moves the board. **Nothing gets written**: a click on a cell does
   nothing at all (there is no handler to fire), and there is no 新建/删除动作, no
   frame op, no 画笔 box and no 当前帧 numbers anywhere on the page. Move the pane from
   ~400 px to ~1200 px: the board stays a complete square beside its preview, and the 状态
   columns stack only under 480 px.
6. Change one assignment — tick an action onto `tool` that the default did not name, then
   run a tool: the dock and the popup play it, in the same frame. Untick it and the state
   falls back to the artwork.  Clear 空闲 down to one action and confirm it never empties.
   A corrupted `localStorage["status-pet:skin"]` (or one left by the customisation build)
   falls back to the default skin.  There is no 我的创作 card, no 撤销 / 重做, no
   导入 / 导出 JSON, no 导入动作 and no drawing surface anywhere on the page.

### Common issues

| Symptom | Likely cause |
|---|---|
| Pet not visible | slot registration failed, or `client.artwork.js` 404s — check the console |
| Pet frozen | `requestAnimationFrame` stopped; check `tick()` |
| Pet never leaves `idle` | the seat stopped passing status props; the `useNo*` fallbacks mask it — log `Object.keys(props)` |
| Pet dimmed and barely moving | correct: that is `sleep` |
| Pill pulses while the agent is idle | stale `pendingInteraction`; inspect `useSessionStatus` |
| Movement invisible | an amplitude was set below what the headroom allows |
| Canvas blurry or juddering | `displayWidth !== canvasWidth`, or a non-integer displacement |
| Click does nothing | `onClick` not firing; check the button render |
| Pill square, not rounded | CSS not injected; check the `<style>` in the output |
| Tooltip shows a bare key (`idle`) | dictionary not registered; check `inject: ['slots','locale']` |
| Tooltip is slow (native dwell) | the design-system seed was missing, so the guarded `require` fell back to `title`; check the console |
| Settings tab missing | `settings.section` never declared — the settings UI package is absent/disabled; the pet itself still works |
| Pet not at the far left | another entry registered below −1000; `DOCK_ORDER` (main.ts) is the fixed order |

---

## Bundle Lifecycle

With the **absolute path of this checkout**: `plugin_manager install_bundle <path>`,
`remove_bundle @local/dsh-status-pet`, `set_bundle @local/dsh-status-pet
enabled=true|false`, `list_bundles`.  Without it: `dsh plugin --profile <name> add
<path>`, then the profile row `{ id: status-pet, name: '@local/dsh-status-pet' }`.

---

## Design Decisions

- **Status-driven, not decorative** — an ambient indicator of agent activity. State
  comes only from the seat's standard props, through narrow selectors; nothing polls.
- **Motion is artwork, and the artwork is authored** — every state is a frame animation
  from the baked chunk, each take held for a minimum number of plays before the next is
  rolled, so an activity reads as something the pet is doing and a blink stays organic.
  The system owns only the vocabulary, the pill accent, and reaction durations; what the
  user owns is WHICH action each state plays.
- **DRAWING was given up on purpose; looking was not.**  An in-app pixel studio was built,
  reworked three times and then removed (schema v10): it was ~38% of the hand-written
  source, and it forced a migration/import/validation pipeline, a 15 MB coalesced write
  policy and a mutate-and-invalidate model on every other feature, while its value was
  unverifiable.  What survived is the part with daily value — the state assignment — and
  the 动作 view, which came back as a **viewer**: the same picker, board and filmstrip,
  with every writing control simply not rendered.  Measured against the commit before the
  removal: `src/` 6535 → 4522 lines, `test/` 4258 → 2746 lines, 179 → 135 tests, the
  shipped `client.js` 168.2 kB → 99.6 kB (gzip 46.1 → 27.8 kB), `paint.ts` and `convert.ts`
  deleted outright (the pixel primitives and the any-shape door), and a stored payload of
  a few hundred bytes instead of 15 MB.  `git log` keeps the studio if it is ever wanted
  back.
- **One action, two faces** — the dock and the popup are two CROPS of one character, so
  they are two faces of one action, not two libraries: the frame count, the pace, the
  per-frame timing, the offset and the state assignment are single source, and the
  player couples them too (the dock leads the take channel, the popup follows). A
  missing body face is DERIVED (the avatar at 4×) rather than invented, so the body
  stays optional without ever breaking the pairing.
- **Integer ratios only** — every render is 1:1 (the skin cards at 2×, the row
  thumbnails at 1×) or an exact integer ratio (the popup's 4× upscale, the dock's 1:2
  `LIVE_ZOOM`). Fractional geometry is what made movement invisible and pixel art blurry;
  **whole-pixel displacement** goes with it, because fractional offsets make `pixelated`
  snap rows unevenly.
- **The dock is a read-out; the popup is the toy** — see *Interactions* / *Click popup*.
  A reaction reachable only by hitting a 64px sprite reads as a dead popup.
- **Declarative registries; invariants as tests** — adding a state, skin or interaction is
  an entry plus a label, and clipping headroom, library integrity (both crops in step) and
  registry completeness are asserted, so a future edit cannot quietly break them.
- **Fail soft on a contract change** — `useNo*` fallbacks keep the hook count stable, so
  a missing prop yields a plain pet rather than a crashed slot entry. The stored
  assignment is sanitized on the way in for the same reason, and a refused write (quota,
  private mode) falls back to what storage actually holds rather than serving a lie.
- **Locale from the start** — every visible string goes through the `status-pet`
  namespace (`en` + `zh`).
- **Fixed position over a broken choice** — a user-configurable position was tried and
  removed; see *Position: fixed at the far left*.
- **No Host logic** — `index.js` is an empty stub; the bundle needs a Host entry point to
  resolve, and nothing more.

### Known gaps

- **The Settings tab has not been seen on screen since the viewer was rebuilt.** The
  structure is asserted from the rendered tree (the tests above), but the two-column state
  list beside its edit, and the board beside its preview at a real pane width, are
  appearance questions — checklist 4–6 is the gap.
- **The pet renders ~14 CSS px wide** — the avatar's content spans columns 1–14 of the
  authored 16 (1–28 of the 32px grid) at `LIVE_ZOOM`: the dock's quiet layer next to the
  host's ~14px pill icons, while the popup is the big one (64 CSS px of body art).
- **The two-layer sync has not been seen on screen.** `loop.test.ts` drives two real
  players through one ticker and asserts the follower paints the leader's exact frame,
  but "the dock and the peek read as the same pet" is an appearance question (checklist
  items 1–2).
- **Nothing keeps the class list honest but the tests.** Two of this project's rewrites
  silently lost CSS rules, which is why the stylesheet is asserted — and why the suite
  asserts both that the viewer's rules are PRESENT and that the writing controls' rules
  are absent.
