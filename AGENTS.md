# Status Pet — AGENTS.md

Whale-chan (鲸鱼娘) — a tiny pixel-art whale maid — lives in the DSH conversation
composer dock (the status bar above the chat input). **It shows what the agent is
doing** — sleeping when nothing happens, working while a tool runs, bowing up when
something needs your approval, sheepish when a turn fails. Click it and the **big
picture pops up**: an anchored, animated, pettable panel. The Settings tab swaps
**skins** and hosts a **pixel board** for drawing your own.

### The three layers

Every feature belongs to exactly one layer:

| Layer | Where | What lives here | Rendering |
|---|---|---|---|
| Resident | dock, far left | the pet itself — a pure read-out, no interactions of its own | the 32px **avatar** face, backing 40×40, at `LIVE_ZOOM` → **16 CSS px of art** |
| Peek | the click popup | the big animated **full body** + every interaction, petting first | the 128px **body** face, backing 160×160, at `LIVE_ZOOM` → **64 CSS px of art** |
| Workshop | Settings → Status Pet | skin cards, then two tabs — 预览 (look) and 编辑 (change) — each with its own 按状态 / 按动作 mode, sharing one **32 / 128 face switch** on the tab row | the galleries at `LIVE_ZOOM`; the studio board and its stage preview 1:1 |

A skin is one character as **two faces of every action**: the 32px avatar (dock,
REQUIRED) and the optional 128px full body (popup). Users draw both in the pixel
studio; a missing body face falls back to that action's avatar at a crisp 4×
integer upscale. The pet sits at the
**far left of the dock, fixed** — position is deliberately not configurable (see
*Position: fixed at the far left*). Every skin can have its STATE ASSIGNMENTS
changed; only 我的创作 can have its PIXELS drawn.

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
│   │       ├── compose.ts        the PAIRED model (one action, two faces) + the v7/v8 shapes
│   │       │                     + the ONE upgrade door (upgradeArtwork/pairArtwork) + actionKey/
│   │       │                     addToLibrary + parseFrame/spriteFor + cellFor/upscaleCell
│   │       ├── validate.ts       validateArtwork (fused, allocation-free) + MAX_* + the memos
│   │       ├── convert.ts        convertArtwork: any stored shape → a VALID v9 document
│   │       ├── paint.ts          blankRows/findOrAdd/adoptRows/paintCell/shiftRows
│   │       ├── library.ts        reference maintenance (assign|rename|replace|remove|
│   │       │                     removeLibraryTakes|replaceFrameCell) + usageIndex + libraryInfo
│   │       ├── storage.ts        schema v9 + load/save + the v7/v8 migrations + the
│   │       │                     coalesced write policy + paint box
│   │       ├── documents.ts      artworkDoc/skinArtwork reads + the withOverrides DIFF
│   │       │                     + seedArtworkFrom + serializeArtwork/parseArtworkExport
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
│       └── settings/                 page.ts (tabs + crop switch), skin-picker.ts,
│                                     assignments.ts (编辑·按状态), pixel-editor.ts (studio),
│                                     frame-canvas.ts, field.ts
├── README.md / LICENSE / .gitignore   human overview / MIT / ignores the artifacts + node_modules
├── bench/        the perf harness (NOT shipped): store.mjs/board.mjs price the hot paths,
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

It ships as its own chunk so `client.js` stays code-only (~180KB against 15.6MB of
frames) — and it is left in the **v8 shape** (one library per crop) on purpose:
the 15.9MB of frozen pixels are hand-maintained and their provenance comments are
the catalog, so a codemod rewrite would risk the record for no runtime gain.
`installArtwork` runs the chunk through `upgradeArtwork` instead — a pass over 106
actions that SHARES every row string by reference and costs ~2ms. The pairing
therefore depends on the two crops' libraries staying in step in this file: the
same ids, in the same order, with the same `frameMs`, frame counts and offsets
(see *The paired model*).

Three editing paths: a **custom skin** — the normal one, pick 我的创作 and import the
built-in library; a **hand-edit** of `src/artwork.gen.ts` for a genuine fix, keeping the
provenance comment truthful; or **restoring the raw art**, the only route back to the
source: `git log` has `assets/*.gif`, `tools/gif-map.json` and `tools/gen-artwork.py`;
`git checkout <rev> -- assets tools`, put the gifs back under their original names, and
`python3 tools/gen-artwork.py` runs again unchanged (needs Python 3 + pillow + numpy).
Every action then stores `FRAMES` frames (currently 4) sampled evenly across the gif's
loop. `docs/media/` imagery is frozen the same way — its renderer
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

A **built-in is exactly this** — the same object 我的创作 is, and there is exactly
one path from an `Artwork` to render-ready states. (The old
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
  definition the renderer, the thumbnails and the studio share), memoized per
  (frame, face); a skin whose actions ALL lack a body resolves its popup from the
  avatar grid at 4× (the cheap path). The body is optional PER ACTION: the 128 board
  offers a draft (this action, or every action at once) or a blank grid, and a
  body-carrying action can drop its 128 face again. Within one action the mutators
  keep it all-or-nothing (复制一帧/空白帧 carry the face along), so a mixed action
  can only arrive from hand-written JSON.
- **Everything that is not a pixel is SINGLE SOURCE.** Frame count, `frameMs`, the
  per-frame `ms` and the whole-frame offset live on the ACTION/FRAME and describe
  both faces, so there is no way to draw four frames for the head and five for the body.
- **Offsets are authored in AVATAR units**, rendered `× offsetScale(grid)` (×4 on the
  body): one `整幅挪动` is the same hop on both faces, and `GRIDS[128].maxOffset` is
  exactly `GRIDS[32].maxOffset × 4` — what that headroom was for.
- **One state table.** `states` names ids once for the whole artwork, so the dock and
  the popup roll from the same action set (two states naming the same set still share
  ONE resolved object by identity).

### The action library — why a state owns no pixels

The model flipped in v8 and gained its second face in v9, and this is the one
thing to understand before touching any of it: **an action belongs to the ARTWORK,
never to a state — and an action is ONE animation with TWO faces.** A state stores
a list of `id`s (`states.tool = ['xie-daima', 'hop']`), and `resolveStateTakes`
maps those ids through the crop's `library`. The renderer only ever sees the
resolved `states[state].takes`, so **not one line of `renderer/` changed** — the
flip is entirely in the store, the Workshop and the data.

What that buys, and what to keep true:

- **Reuse is a reference.**  One action ticked in four states is still one
  definition: editing it once changes all four. Both halves must keep the sharing
  VISIBLE — 按动作's dropdown options, 按状态's rows and the delete button all
  report `被 N 个状态在用`, and deleting an action strips it from every state that
  referenced it (`removeLibraryTake`), so a dangling id cannot exist.
- **Ids, not indices.**  Deleting an action used to shift every later take's index,
  silently re-pointing a state at its neighbour's animation. Ids are minted by
  `freeTakeId` (a readable base, `-2` on collision) and validated unique.
- **One representation of "unset".**  An empty/absent state list FOLLOWS IDLE —
  that is `settings.followIdle`, and `setStateSelection` deletes the key rather
  than storing `[]`. There is no "take over this state" step: ticking a checkbox
  IS taking it over.
- **Sharing is by content, or by choice.**  `addToLibrary` dedupes by content
  (`actionKey`: both faces + the shared settings) so a merge never stores the same
  animation twice; `meta.unique` opts out, which is what 新建动作 needs — an identical
  blank is already in the library and sharing it would make the button look broken.
- **An action's pace is shared.**  `frameMs` lives on the action, so a shared animation
  cannot tick at four speeds — a per-state override would reintroduce the drift.
- **Identity sharing in resolution.**  Two states that play the same set share ONE
  resolved object (`states.a === states.b`), and an unassigned state IS `states.idle`;
  the memo key is the SELECTION, not the state name.
- **The upgrade door is one function.**  `upgradeArtwork(input)` takes ANY older
  shape and returns a v9 document: a v7 one (a state owning its takes) goes through
  `libraryFromLegacy`, a v8 one (one library per crop) through `pairArtwork`, and a
  v9 one comes back unchanged. It is the single entrance for a stored document, an
  import AND the generated built-in chunk, and it is memoized by the input object
  (a WeakMap) so a re-read gives back the SAME artwork identity the resolution
  caches are keyed on. It shares row strings by reference throughout, so upgrading
  15MB of artwork is a pass over 106 objects, not a copy.
  `pairArtwork` takes the AVATAR crop as the authority (action order,
  `frameMs`/`ms`/offsets/name, and the state assignment) and keeps any body-only
  action with a blank avatar face — a migration may lose an assignment, never
  artwork. `actionKey`/`takeKey` are memoized per object (a WeakMap); every mutator
  builds a fresh object, so a cached key can never describe edited pixels.

### Palette

The generator collected every colour its selected frames use and quantised to at
most 255 slots (`transparent` is slot 0, the two-character format's ceiling), so a
built-in's palette is not hand-authored. A custom `palette` is a private dedup table:
`applyPaint` appends a slot for a new brush colour and reuses an existing one, and the
dock, the cards, the previews and the studio all read that one table. (Per-built-in
colour overrides were dropped in v4: a built-in renders exactly as authored.)

---

## Custom skins

The Settings tab is **one page with two tabs** — 预览 (look) and 编辑 (change) — and
**each carries the same 按状态 / 按动作 switch**, because the two ways of looking at the
artwork are the two ways of working on it. The **32 / 128 crop switch lives on the tab row**
and belongs to BOTH tabs (the crop you look at *and* edit), so neither owns it: `page.ts`
owns it as `crop` and passes it to `PetPreview` in the galleries and to `PixelEditor` /
`StateAssignments` as `grid`.

**预览 (the default tab), read-only.**

- **按状态** (the default) shows the RESULT: one LIVE `PetPreview` per state, tooltipped
  with what the state means and badged with its assignment (`{n} 个动作` / `跟随空闲`) —
  the only place an unassigned state is visible.
- **按动作** shows the MATERIAL: one cell per library action (`takeId`-pinned), labelled
  with the states that play it — unplayed ones included — paged (106 live canvases), with
  a quiet line counting the unplayed.
- BOTH modes carry their own **search box** — 按状态 matches a state by name, by its
  `settings.hint.*` meaning, or by an action it plays; 按动作 matches name/origin/id.
- Outside 批量删除 mode a cell is **inert**: a floating **✎** top-right is the whole edit
  affordance — on every state cell (an assignment is editable on any skin) and on action
  cells only for 我的创作 (a built-in's pixels are frozen). Looking at the pet never
  changes it.
- On 我的创作, 按动作's bar also carries **批量删除**: tiles become checkboxes, 全选 /
  清空 / 删除选中 and a tick count appear, and the ticked actions leave in ONE write.
  全选 takes every action the GALLERY's search matched. Removal takes a **confirm
  overlay** (the count, 取消 / 删除) because there is no history stack: nothing is
  written until 删除.

**编辑 — each mode is exactly ONE job.**

- **按动作** (`PixelEditor`), the pixel studio: an **action dropdown** (each option
  carrying its frame count, whether it carries a body face, and how many states play
  it) picks the ONE action on the board, and the field spine under it is 动作 → 画布 →
  画笔 → 帧 → 当前帧, then the undo/redo + IO bar. The crop switch picks which FACE of
  that action the board draws — never which library. Nothing here mentions a state.
- **按状态** (`StateAssignments`), the assignment surface: a **state dropdown** (how
  many actions that state plays, or 跟随空闲) picks WHICH STATE YOU ARE TICKING FOR,
  and the ONE library follows as one checkbox per action — "this state plays it" — with
  a **search box** and 全选 / 清空 beside it. The list is DISPLAYED as two groups (this
  state's ticks first, then 其他动作, each in library order) while the STORED selection
  keeps library order, so a tick never re-orders the rotation; 全选 ADDS every action
  currently LISTED, because replacing would drop ticks the filter is hiding. Nothing here
  draws a pixel; both halves are ONE column of labelled FIELDS (`field.ts`), 按状态's
  being just 状态 → 动作库.

Invariants:

- **A built-in may be re-ASSIGNED, never re-drawn.**  Its 编辑 tab exists but only the
  按状态 half — no 按动作 in the switch, a quiet line pointing at 我的创作, and no ✎ on
  its action cells. The assignment is stored as a DIFF beside the skin
  (`saveSkinStates` → `builtinStates`, one flat `{state: ids}` table), so the built-in keeps its pixels, a state nobody
  touched keeps following the artwork, and **nothing forks** (the old studio forked to
  我的创作 on the first stroke, which made the page seem to edit one thing and save
  another).
- **`idle` can never be emptied — but 清空 still works on it.**  It is the anchor every
  unassigned state falls back to, and validation/resolution require it to play
  something, so an emptied idle would invalidate the document and blank the pet.
  清空 on 空闲 clears down to its FIRST action, and the rule is PRINTED as a hint under
  the ops row (`clearIdleHint`) rather than hidden in a `title`. Every other state
  clears to empty — that IS the idle fallback.
- **The seam between the tabs is the corner ✎**, which opens 编辑 in the matching mode
  ALREADY POINTING AT THAT CELL. `page.ts` owns both targets (`editAction`,
  `editState`); opening 编辑 from the tab row clears `editAction`, so the ordinary way
  in starts on the library's first action.
- **The library is a small curated set of slots**: 新建动作, 删除, 批量删除, and
  **导入动作** — an OVERWRITE, not a merge. The picker offers the built-in's library
  (search + thumbnails, 106 entries) or this artwork's own actions; picking one replaces
  the WHOLE action — both faces, its name, its frame count and its pace — while
  KEEPING ITS ID so every reference survives (`overwriteLibraryTake`), re-points the
  source's colours at this document's palette (`adoptRows`), and one 撤销 restores.
  There is no crop isolation any more: an action is one thing, and the row's thumbnail
  shows the face you are drawing. No 复制动作 (that is 新建动作 + 导入) and no bulk
  import.
- **Deleting is guarded, singly and in bulk.**  Both surfaces (the studio's ✕ and
  删除选中) refuse the two deletions that would invalidate the document: the last action
  in the library, and the only action a crop's `idle` plays (an invalid document is
  dropped on the next read — losing a whole drawing to a stray click). `removalIsBlocked`
  is shared: the button DISABLES on it and the mutator REFUSES on it.
- **Import/export** round-trips the whole document as JSON. The export carries `v`; the
  IMPORT goes by SHAPE, so a v9 document reads as itself, a v7 or v8 one is upgraded
  through `upgradeArtwork`, and a payload from a NEWER version is refused with a
  message.

Studio mechanics:

- **The board is a SQUARE that can only ever be as large as its column** —
  `min(100%, 52vh, 512px)`, `aspect-ratio:1`, cells `flex:1 1 0` — so the 128×128 face is
  complete at any pane width and never scrolls, while the 32×32 gets larger cells.
- **No wrapped-flex trap**: an earlier main row laid out as wrapping flex sized its first
  column by max-content, which put a blank block beside the state list and the canvas
  BELOW it. There is no second column to fall into that now.
- **Container-responsive, not viewport-responsive**: `.status-pet-studio` is a
  `container-type:inline-size` container, so regions follow the *settings pane*; one
  `@container` query at ≥700px puts the take preview beside the board, else a strip below.
- **The preview is the preview, and the frame's numbers live with the frames**: the
  action's live preview sits in its own stage cell — always PINNED to `takeId`, so there
  is no shuffle toggle (the state rotation belongs to the pet) — while 时长 and
  整幅挪动 live in 当前帧, under the filmstrip they describe.
- **The animation story is: draw a frame → duplicate it → nudge it.**  The filmstrip
  leads with `⧉ 复制一帧` (clone, insert after, select the copy) and `+ 空白帧`; the one
  clipboard button renames itself `复制到剪贴板` / `粘贴`.
- **There is exactly ONE move control: 整幅挪动**, a direction pad writing the frame's
  `dx`/`dy` (avatar units, clamped to `GRIDS[AVATAR_GRID].maxOffset`; the body face
  renders them ×4) at draw time with the pixels untouched — one press is the same hop
  on both faces.
  The label carries the read-out (`整幅挪动 ↓1`) and 归零 appears while moved. The
  destructive sibling `shiftRows` (moves the drawn pixels, drops what falls off the
  edge) is deliberately NOT in the UI — two near-identical "move" controls made the studio
  unreadable — and stays in the store for a future board-level affordance.
- **Undo/redo** is a per-mount snapshot stack (50 deep), also on ⌘/Ctrl+Z. **Renaming
  is deliberately not undoable** (one entry per keystroke); the name field is
  uncontrolled and commits on blur. The frame clipboard lives in 按动作; 按状态 has none.
- **The 128 face is optional, PER ACTION.** With no body face the board shows an
  empty-state card offering a 4× draft (this action, or every action at once), a blank
  grid, or nothing; a body-carrying action can drop its 128 face again (移除 128 面) and
  the popup goes back to the 4× draft. A draft is `upscaleCell` of the avatar face, and
  within one action 复制一帧 / 空白帧 carry the body face along — the action is never
  left half-bodied.
- **Every mutator reads `artRef` at call time**, so rapid clicks and drag strokes never
  lose work; drag-painting requires a held button; right-click is the eyedropper.
- **The brushes ARE the paint box**: six native colour-picker wells — click one to paint
  with it, click it again to recolour — plus the `×` eraser. No add, no reset, because a
  brush is not a palette slot: `applyPaint` looks the colour up in the artwork's palette
  (appending at most one slot) and writes that slot into the pixels, so a brush edit can
  never repaint the board. The box lives in `brushes` in the store, so it survives a
  reload.
- The helpers and the editor components are exposed as `skinTools` on the loader return
  value; the bundle smoke test drives them. The host ignores the extra field.

### Storage — localStorage

A loader plugin cannot declare a Cordis `Config`, so state lives in
`localStorage["status-pet:skin"]`:

```jsonc
{ "v": 9,                       // schema version — see migrate below
  "skin": "whale-chan" | "custom",
  "brushes": ["#rrggbb", …6…],  // the paint box (UI state)
  "builtinStates": { "whale-chan": { "tool": ["xie-daima"] } },
                                // per-built-in state-assignment DIFF, ONE flat
                                // table (absent = authored; []=follow idle)
  "custom": { "palette": ["transparent", …up to 255 colours…],
              "actions": [ { "id": "chi-niangao", "name": "吃年糕",
                             "origin": "chi-niangao", "frameMs": 550,
                             "frames": [ { "ms"?: 400, "dx"?: 0, "dy"?: 0,
                                           "cells": { "32": { "rows": [32行] },
                                                      "128"?: { "rows": [128行] } } } ] } ],
              // ONE state table for both faces; absent key = follow idle
              "states":  { "idle": ["chi-niangao"] } }
```

Rules to keep:

- **Every read goes through validation, and validation is MEMOIZED BY IDENTITY.**
  `validateArtwork` requires a non-empty `idle` assignment and legal shapes everywhere:
  full-grid rows (NO symmetry requirement), ≤8 frames, ≤`MAX_LIBRARY` actions, ≤`MAX_TAKES`
  per state, unique ids, **every id a state names must exist** and none twice, offsets
  inside the AVATAR headroom, ms in range, props rectangular/in-grid/palette-legal,
  `cells[32]` present with `cells[128]` optional but correctly sized, and a palette of
  transparency + 1–255 colours every painted pixel names. The scan is allocation-free (one
  fused pass per row through a nibble table), and `artworkErrors` is keyed by the DOCUMENT
  and built from per-ACTION verdicts, so a stroke re-checks the one action it rewrote and
  re-uses the other 105. A full 15 MB document is ~21 ms the first time and free
  afterwards. Any inconsistency makes resolution fall back — a corrupt store must never
  blank the pet.
- **An older document is UPGRADED, not dropped.**  `migrate` keeps the skin choice
  and the paint box (both version-independent), flattens a v8 per-crop
  `builtinStates` diff into the v9 one (the avatar crop's diff wins — it is the face
  that is always required), and runs the artwork through `convertArtwork` /
  `upgradeArtwork`: a v8 document (one library per crop) is PAIRED, a v7 one (a
  `states` value holding take OBJECTS rather than ids) goes through the library door
  first, and anything older than v7, or from a NEWER version, is dropped so the pet
  falls back instead of half-reading it.
- **The document lives in memory; localStorage is a snapshot.**  `loadStored` serves
  the in-memory document (memoized by the raw text while clean or while a write is
  pending) and re-reads storage otherwise, so an external writer is noticed;
  `saveStored` merges, re-resolves ACTIVE and broadcasts SYNCHRONOUSLY, and
  `storage.ts` decides when the snapshot goes out: **small payloads write through** (a
  skin choice, the paint box, an assignment diff), **large ones are COALESCED** (one
  serialization per editing burst, forced out after a short idle, hard-capped, flushed
  on `pagehide`/hidden tab). A refused write (quota, private mode) drops the in-memory
  document so the next read re-parses what storage holds instead of serving a lie.
  `flushStored()` forces it out; the suite's resets go through it.
- **Resolution is lazy and cached BY ARTWORK IDENTITY.**  A skin resolves states on
  first access (an unassigned state IS the idle object, and two states with the same
  selection share one object — the memo key is the SELECTION, not the state name),
  and every resolution is memoized on the `Artwork` object itself. Artwork is
  immutable, so a write that changed the document resolves through a new object
  while a write that did not is served from the memo — which is why
  `refreshActiveSkin` no longer clears anything. Faces are parsed through
  `spriteFor`, memoized per CELL object (and the 4× body draft per frame+face), so an
  untouched face keeps its `Sprite` and therefore its pre-rendered bitmap — painting
  the head never re-rasterises the body.
- **The store owns ACTIVE — broadcast is notification only.**  `saveStored`
  re-resolves the module-level `ACTIVE` synchronously on every write, then dispatches
  `status-pet:skin-changed`; a module-level `storage` listener does the same for
  other tabs. `onSkinChange` is only for components holding their own resolved copy
  or selection state.
- **The custom slot is never blank** — selecting it with no data seeds it from the
  active skin's WHOLE library (ids, names, provenance and state assignments
  included), so 我的创作 starts as a working copy rather than an empty page.

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
branch, and artwork (custom skins: drawable in the studio and ticked onto the new state;
a built-in would need `src/artwork.gen.ts` hand-edited).

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
  drawn from its own avatar at 4× (128 = 32 × 4). The studio BOARD stays 1:1 (you are
  judging a pixel you just placed); the cards keep the avatar at 1× (a 40px canvas).
- **The live layers (rendered 1:1, displayed at `LIVE_ZOOM = 1/2`).**  The dock and the
  popup render into a 40×40 / 160×160 backing store and set the **CSS box** to half that
  (20 / 80) — **16 CSS px of avatar art**, **64 CSS px of body art**. `LIVE_ZOOM` is an
  exact 1:2 against an artwork that is an exact 2× fill of its crops, so `pixelated` maps
  one destination pixel to one source pixel. The sprite is **never re-rendered smaller**:
  `startLoop` scales only `canvas.style.width/height` (`PetPreview` takes the same `zoom`
  prop, default 1 — which the studio's board-side preview relies on). `DockPopup`, both
  galleries and `DockPet` pass `LIVE_ZOOM`; the studio's BOARD and its stage preview stay
  1:1.

Filmstrip thumbnails are unchanged: `THUMB_CSS` = 64 on screen, canvas backing one
pixel per grid pixel (32 → 2× up, 128 → 2:1 down), both exact.

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
PLAYER rolling a different one, and it also fixes the phase. Galleries and the editor
stay free (the editor pins one take via `takePinRef`), so previews never synchronise
with the dock.

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
  // Exposed for the bundle smoke test and embedders: the pure skin helpers plus
  // the customisation components.  The host ignores unknown fields.
  skinTools: { /* the store's public surface + ui: { SkinPicker, PixelEditor, PetPreview } */ },
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

`bench/store.mjs` runs the store/editing hot paths against the REAL modules
(type-stripped by node, localStorage stubbed) and prints wall-clock times: the first look
at a 15 MB document, one paint stroke, a 100-stroke drag (and how many writes it cost), a
skin switch, the library read-outs. `bench/board.mjs` prices the JS half of building the
DOM board, and `bench/harness.mjs` stubs `window` and times a run. Run it before and after
touching the store, the resolution caches or the draw path — this file's numbers come from
it.

### Adding / changing artwork (built-in)

See *Artwork → Where the pixels live* for the three paths (custom skin; hand-edit
`src/artwork.gen.ts`; restore `assets/` + `tools/` from `git log` and re-run the
generator). A genuine fix to a built-in action is path 2: keep the provenance
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
| `skins.test.ts` | the PAIRED built-in: validation through the store's own validator, both faces present and correctly sized, the shared frame count / pace / `ms` / offsets, no clipping at EITHER face, both crops' libraries identical and in the same order (the pairing guarantee starts here) |
| `skin-store.test.ts` | validation on every read (caps, offsets/ms, props, palette, `cells[32]` required and `cells[128]` sized, mandatory `idle`, unique ids, references resolve); BOTH upgrade doors (v7 → library, v8 → paired, lossless — the baked chunk included); the library ops (reference vs copy, dedupe, collision suffixing, removal stripping references, `replaceFrameCell`); the paint primitives; export/import; the paint box; resolution fallbacks and identity sharing; the 4× body fallback and the ×4 offset; load/save and broadcast |
| `performance.test.ts` | the hot-path contracts: reference-stable edits (the other FACE included), memoized validation/resolution/derived face, one snapshot per edit burst, `usedBy` as an index |
| `take-rotation.test.ts` | the pure hold policy under a seeded random |
| `loop.test.ts` | the real player: held takes, an immediate switch at frame 0, pinned takes, flapping states, the offset read from the resolved FRAME, and the TAKE CHANNEL (a follower draws the leader's exact frame; a different state or a dead leader rolls its own) |
| `draw.test.ts` | the ImageData rasterizer: colour packing, transparency, the scaled scratch-canvas path, the palette table |
| `bundle.test.ts` | the built `client.js` under a stubbed loader |
| `ui.test.ts` | registration (one dock entry, **no `settings.general.item` row**, the settings entry, label thunk); the settings page (tabs, crop switch, previews with meaning tooltips, corner-✎ targets, `actionId`, the two edit modes kept apart — the studio's selector is `status-pet-action-select`, 按状态's is `status-pet-state-select`); both halves (a tick writes a REFERENCE, search scopes 全选, 清空 stops at one action on 空闲, a built-in stores a flat DIFF and never forks, a dangling id is dropped); the studio (selection/fallback, shared-action re-resolution, free painting with no lost strokes, 新建/删除/批量删除 in one write behind a confirm plus both guards, import replacing the whole action, frame CRUD, duplicate → one 整幅挪动 ↑ gives `dy: -1` with the pixels untouched → 归零, the per-action 128 draft + 为所有动作生成草稿, undo/redo); interactions end to end; the popup (open/close, `aria-haspopup`/`aria-expanded`, tooltip disabled, panel-wide petting); the paint box (twenty colours → twenty palette slots); registry/locale integrity; the layout invariants |

**Three traps the React stub has already fallen into — do not reintroduce them:** the
component closes over the React instance passed to `factory(require)`, so the stub must be
a **single** instance (a fresh one per render silently empties the `useState` queue and
every `idleMs` case passes vacuously); hook storage must be reset **per mount** (or one
test's `reaction` leaks into the next and the locale assertions fail for the wrong
reason); and the `useState` stub must run **lazy initializers** (the editors seed state
with `useState(() => …)`, and storing the function verbatim makes every editor test fail
in confusing ways).

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
4. In DSH Settings, the "状态宠物" tab shows the skin cards, then 预览 and 编辑 — each
   with its own 按状态 / 按动作 switch, sharing a 32 / 128 FACE switch on the tab row (32
   = the avatar face, drawn at 4× and the DEFAULT; 128 = the body face). 预览 holds
   eleven LIVE pets with no big preview block, no recolour row and no position control;
   on a **built-in**, 编辑 opens on 按状态 with no 按动作 and only state cells carry a ✎;
   on 我的创作 it opens on 按动作 with ✎ on action cells too. Press 32 / 128 and every
   cell changes face at once (both halves of 编辑 with it); a corner ✎ opens 编辑 on that
   cell.
5. In 编辑 · 按动作 paint a few cells (draw a wink to prove strokes are not mirrored),
   hit 复制一帧 and 整幅挪动 ↓ once, tick the action for `tool` in 按状态, then run a tool:
   the dock plays YOUR animation, and editing it again moves both states because a tick is
   a reference. Move the pane from ~400 px to ~1200 px — the board stays a complete
   square, the preview moves beside it at ~700 px, nothing wraps one character per line.
6. Paste garbage into the import box — a localized error; a valid export applies as
   我的创作; the 128 draft makes the popup show your body crop instead of the 4× upscale
   (dock untouched), and 移除 128 面 puts it back; a corrupted
   `localStorage["status-pet:skin"]` falls back to the default skin; editing a brush
   leaves earlier pixels alone; the paint box survives a reload.

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
- **Motion is artwork** — every state is a user-drawable frame animation, each take held for a
  minimum number of plays before the next is rolled, so an activity reads as something
  the pet is doing and a blink stays organic. The system owns only the vocabulary, the
  pill accent, and reaction durations.
- **One action, two faces** — the dock and the popup are two CROPS of one character, so
  they are two faces of one action, not two libraries: the frame count, the pace, the
  per-frame timing, the offset and the state assignment are single source, and the
  player couples them too (the dock leads the take channel, the popup follows). A
  missing body face is DERIVED (the avatar at 4×) rather than invented, so the body
  stays optional without ever breaking the pairing.
- **Integer ratios only** — the render is 1:1 (the studio board, skin cards, stage
  preview) or an exact integer ratio (the popup's 4× upscale, the galleries' 1:2
  `LIVE_ZOOM`). Fractional geometry is what made movement invisible and pixel art blurry;
  **whole-pixel displacement** goes with it, because fractional offsets make `pixelated`
  snap rows unevenly.
- **The user owns the artwork** — taste is unarguable. Custom data is validated on every
  read and falls back to the default skin; the editor NEVER rejects a stroke and does not
  mirror one either; a pixel carries its own colour (the palette is a private dedup table
  the editor grows), so there is no palette to manage and editing a brush can never
  repaint the board; the display size is a viewing preference, never part of the artwork.
  Built-in skins stay machine-checked, and they are the only fixed-palette artwork.
- **The dock is a read-out; the popup is the toy** — see *Interactions* / *Click popup*.
  A reaction reachable only by hitting a 64px sprite reads as a dead popup.
- **Declarative registries; invariants as tests** — adding a state, skin or interaction is
  an entry plus a label, and clipping headroom, library integrity (both crops in step) and
  registry completeness are asserted, so a future edit cannot quietly break them.
- **Fail soft on a contract change** — `useNo*` fallbacks keep the hook count stable, so
  a missing prop yields a plain pet rather than a crashed slot entry.
- **Locale from the start** — every visible string goes through the `status-pet`
  namespace (`en` + `zh`).
- **Fixed position over a broken choice** — a user-configurable position was tried and
  removed; see *Position: fixed at the far left*.
- **No Host logic** — `index.js` is an empty stub; the bundle needs a Host entry point to
  resolve, and nothing more.

### Known gaps

- **The dock pet itself is still unobserved.** The bundle is installed and both
  registrations are live; the Settings tab has been seen rendering. Checklist 1–4 is the
  gap.
- **The pet renders ~14 CSS px wide** — the avatar's content spans columns 1–14 of the
  authored 16 (1–28 of the 32px grid) at `LIVE_ZOOM`: the dock's quiet layer next to the
  host's ~14px pill icons, while the popup is the big one (64 CSS px of body art).
- **The studio's feel is unverified.** Its layout was measured once with a throwaway
  headless harness (400–1200px of pane, both faces, empty-body too) and its interactions
  are unit-tested — not a regression guard; the structural layout tests are.
- **The two-layer sync has not been seen on screen.** `loop.test.ts` drives two real
  players through one ticker and asserts the follower paints the leader's exact frame,
  but "the dock and the peek read as the same pet" is an appearance question (checklist
  items 1–2).
