# Status Pet — AGENTS.md

Whale-chan (鲸鱼娘) — a tiny pixel-art whale maid — lives in the DSH conversation composer dock (the status
bar above the chat input). **It shows what the agent is doing** — sleeping when
nothing happens, working while a tool runs, bowing up when something needs your
approval, sheepish when a turn fails. Click it and the **big picture pops up**:
an anchored panel with the full-body sprite, animated — and petted *there*, not
in the dock, which stays a status read-out. And if the whale is not to your taste: the Settings tab swaps
**skins** and hosts a **pixel board** for drawing your own — freehand, no forced
mirroring — with a free paint box of your own colours, both crops of it (see
*Custom skins*).

### The three layers

The project is one character living in three places; every feature belongs to
exactly one layer:

| Layer    | Where                     | What lives here                              | Size |
|----------|---------------------------|----------------------------------------------|------|
| Resident | the dock, far left        | the status pet itself — a pure read-out, no interactions of its own | the 32px **avatar** crop, rendered 1:1 and shown at `LIVE_ZOOM` = 1/2 — **16 CSS px of art** on a 20px canvas |
| Peek     | the click popup           | the big animated **full body** (HD or 4× upscale) + every interaction, petting first | the 128px body crop, rendered 1:1 and shown at `LIVE_ZOOM` = 1/2 — **64 CSS px of art** on an 80px canvas |
| Workshop | the Settings tab          | skin picker, then two tabs — 预览 (look) and 编辑 (change) — each with its own 按状态 / 按动作 mode, sharing one 32 / 128 crop switch on the tab row | both crops, side by side |

A skin is one character as **two crops**: the 32px avatar (dock) and the
optional 128px full body (popup). Users can draw **both** in the pixel studio;
a missing full body falls back to the avatar at a crisp 4× integer upscale.

The pet sits at the **far left of the dock, fixed** (registered at an order
below every shipped entry). Position is deliberately *not* user-configurable —
see *Position: fixed at the far left*. The pet keeps its own tab in DSH
Settings (`settings.section`, id `status-pet`): skin cards on top, then two
tabs — 预览 (look at the pet) and 编辑 (change it) — with the 32 / 128 crop
switch on the tab row, but no position control.  Every skin can have its STATE
ASSIGNMENTS changed; only 我的创作 can have its PIXELS drawn, so 编辑's 按动作 half
exists for 我的创作 alone.

---

## Project Overview

| Field           | Value                                                  |
|-----------------|--------------------------------------------------------|
| Package         | `@local/dsh-status-pet`                                |
| Directory       | Project root (flat, no subdirectory)                   |
| Bundle type     | Client-plugin bundle with a no-op Host half            |
| UI mount point  | `conversation.composer.dock` slot, order −1000 (far left) |
| Rendering       | Canvas 2D, **integer display scaling only** — the two LIVE layers render their crop 1:1 and display it at `LIVE_ZOOM` = 1/2: dock 40×40 backing (32px avatar + 4px headroom each side) shown as a 20×20 CSS box; popup 160×160 backing (128px body + 16px headroom) shown as an 80×80 CSS box (64px of art). The Workshop's PREVIEWS (both galleries) also display at `LIVE_ZOOM` — 64px of art, the same size the popup shows — while the studio's BOARD and its stage preview stay 1:1, and skin cards are 1:1 |
| Sprite          | **An action library per crop**: each crop owns 1–128 named actions (1–8 frames; frame = full grid + dx/dy + ms + optional prop accent), and every state holds a LIST OF ACTION IDS it plays (≤64; empty/absent = follow idle). Rendering is unchanged: one of a state's actions is rolled and held. Crops: the 32×32 avatar (dock) and the optional 128×128 body (popup) — see *Artwork*, *The action library* and *Custom skins* |
| Dependencies    | `react` + the seeded `@deepseek-ai/dsh-client-ui-primitives` (guarded; see *Hover tooltip*), both supplied by the DSH web shell |
| Build step      | **tsdown**, two IIFE builds: `src/main.ts` → `client.js` (the plugin) and `src/artwork-chunk.ts` → `client.artwork.js` (the generated frames, fetched on demand); TypeScript is compile-time only |

`1:1` is load-bearing where the artwork is drawn: one sprite pixel is one
**canvas** pixel, and the Workshop shows every one of them. An earlier
revision drew into a 64px canvas shown at 18 CSS px, which made a "2px" bob
0.56 CSS px — invisible — and downscaled pixel art 3.5:1. The rule is really
**integer ratios only**: a 4× upscale of the 32px avatar grid is just as crisp,
which is what the popup uses when a skin has no HD block — and `LIVE_ZOOM = 1/2`
(the two LIVE layers, and every gallery/preview tile) is the other exact ratio.
See *Rendering*.

---

## File Structure

The source is organized as a **pet system**, not as plugin plumbing: `pet/`
holds the pet itself (pure data + pure functions — no DOM, no React, node
runs it directly), `renderer/` is the engine that draws and animates it,
`ui/` is where it lives, and the two root files are the plumbing.

```
dsh-status-pet/
├── package.json        ← bundle metadata, exports, client injection config, scripts
├── cordis.patch.yml    ← Cordis patch inserting the plugin row
├── index.js            ← Host half (no-op — everything is client-side)
├── client.js           ← BUILD ARTIFACT (gitignored): the plugin; the loader fetches it (~118KB)
├── client.artwork.js   ← BUILD ARTIFACT (gitignored): the generated frames (15.6MB), fetched
│                         on demand by client.js via require.async (see *Artwork*)
├── tsdown.config.ts    ← bundler config: one IIFE build per artifact (never one splitting build)
├── tsconfig.json       ← typecheck config (pnpm typecheck)
├── src/                ← the real TypeScript source
│   ├── main.ts         ← window.__ModuleLoader__.load wrapper + apply(ctx) registration; owns DOCK_ORDER (fixed −1000, far left)
│   ├── host-deps.ts    ← the ONLY module touching the loader's require (React/Tooltip/createPortal injected here)
│   ├── artwork.gen.ts  ← the BUILT-IN ARTWORK, FROZEN: originally generated by
│   │                     tools/gen-artwork.py, now hand-maintained (its inputs
│   │                     were deleted); bundled into the client.artwork.js chunk,
│   │                     never into client.js
│   ├── artwork-chunk.ts ← the chunk entry: registers the data with the loader
│   ├── pet/            ← THE PET ITSELF (pure: no DOM, no React)
│   │   ├── behavior.ts    ← TUNING rhythm knobs + derivePetState (pure) + STATES (vocabulary + pill) + REACTIONS (durationMs) + STATE_NAMES
│   │   ├── grids.ts       ← GRIDS: body plan — 32px avatar / 128px body geometry + maxOffset + LIVE_ZOOM (the live layers' 1/2 CSS display), shared contract across skins/renderer/store
│   │   ├── labels.ts      ← LABELS (en + zh) + the locale namespace + translatorOrFallback
│   │   └── skins/         ← the wardrobe: one concern and ONE invalidation rule per module
│   │       ├── compose.ts     ← the model: Frame/Take/LibraryTake/GridArtwork/Artwork +
│   │       │                    the pre-v8 shape + upgradeArtwork/takeKey/addToLibrary +
│   │       │                    parseFrame/spriteFor (the frame→Sprite memo) +
│   │       │                    spriteToRows/upscalePixels + the pixel format
│   │       ├── validate.ts    ← validateArtwork (fused, allocation-free scan) +
│   │       │                    MAX_PALETTE + the identity-keyed memos: takeErrors
│   │       │                    per action, artworkErrors/artworkIsValid per document
│   │       ├── convert.ts     ← the ONE upgrade door: looksLegacy + convertArtwork
│   │       ├── paint.ts       ← the pure pixel primitives the studio draws with:
│   │       │                    blankRows/findOrAdd/adoptRows/paintCell/shiftRows
│   │       ├── library.ts     ← reference maintenance (assignTake/setStateSelection/
│   │       │                    add|remove|rename|replace|overwriteLibraryTake) +
│   │       │                    usageIndex (the memoized who-plays-what index) + libraryInfo
│   │       ├── storage.ts     ← schema v8, the StoredData document, load/save + the
│   │       │                    COALESCED write policy (small = write through, large =
│   │       │                    one snapshot per editing burst) + the paint box
│   │       ├── documents.ts   ← artwork document reads (artworkDoc/skinArtwork/
│   │       │                    loadCustomArtwork/skinLibrary) + the built-in override
│   │       │                    diff (withOverrides) + saveSkinStates + seedArtworkFrom
│   │       │                    + the import/export wire format
│   │       ├── resolve.ts     ← artwork → ResolvedSkin (identity-keyed, lazily per
│   │       │                    state) + the module-level ACTIVE + the change broadcast
│   │       └── store.ts       ← the FACADE: re-exports the public surface above, so
│   │                            every importer (and the suite) keeps one entry point
│   ├── renderer/       ← the engine: draws and animates the pet
│   │   ├── draw.ts        ← the pixel plotter (body + prop accent): one putImageData
│   │   │                    per blit when the platform has ImageData, the fillRect
│   │   │                    loop otherwise
│   │   ├── sprite-cache.ts ← per-frame offscreen bitmaps (a frame is one drawImage),
│   │   │                    keyed by the Sprite object and the palette
│   │   ├── take-rotation.ts ← the pure hold policy: which take plays, how many times before the next roll
│   │   └── loop.ts        ← ONE shared rAF ticker + startLoop: the frame player (held take, per-frame ms + dx/dy, dirty-checked) + useReducedMotion; its `zoom` scales only the canvas CSS box
│   └── ui/             ← where the pet lives (the three layers the user sees)
│       ├── hooks.ts       ← usePetStatus (seat props → PetFacts + sleep timer) + usePetReaction (shared)
│       ├── dock-pet.ts    ← Resident layer: the dock pill (main component, DockPet)
│       ├── dock-popup.ts  ← Peek layer: the dock pet's anchored click popup (DockPopup)
│       ├── pet-preview.ts ← PetPreview — the ONE pet-drawing component: animated or pinned to a state/skin, interactive or decorative (popup, settings previews, gallery, skin cards)
│       ├── styles.ts      ← the inlined stylesheet (CSS)
│       └── settings/      ← Workshop layer: page.ts (the tab: SettingsPage — skin
│                            cards + the 预览/编辑 tabs + each tab's own 按状态/按动作
│                            mode + the shared crop switch), skin-picker.ts,
│                            assignments.ts (编辑 · 按状态: the state dropdown and the
│                            checkbox library), pixel-editor.ts (编辑 · 按动作: the
│                            studio + its brushes), frame-canvas.ts (the shared
│                            one-frame thumbnail), field.ts (the labelled field row)
├── tools/              ← the artwork pipeline + the doc renderers (NOT shipped)
│   ├── gen-artwork.py     ← the (now unrunnable) generator, kept as the FORMAT
│   │                        reference — its inputs were deleted
│   ├── ARTWORK.md         ← FROZEN catalog: every action's id, gif, frames and gloss
│   ├── dump-artwork.mjs   ← prints one skin's shipped artwork as JSON (node)
│   └── gen-readme-media.py ← renders docs/media/ from that JSON (Pillow + node)
├── bench/              ← the performance harness (NOT shipped): `pnpm bench` runs the
│                          store/editing hot paths on the real modules; board.mjs prices
│                          the DOM pixel board; harness.mjs stubs window + times a run
├── docs/media/         ← README imagery — GENERATED by tools/gen-readme-media.py
├── test/               ← node:test suite (TypeScript, type-stripped by Node 24); pnpm test
│                          (ui.test.ts drives the components, loop.test.ts the player,
│                           draw.test.ts the ImageData rasterizer, performance.test.ts the
│                           hot-path contracts, bundle.test.ts the built artifact;
│                           labels/behavior/skins/skin-store/take-rotation match their modules)
├── AGENTS.md           ← this file
├── README.md           ← human-facing overview
├── LICENSE             ← MIT
└── .gitignore          ← ignores client.js (the artifact) and node_modules/
```

### package.json key fields

```jsonc
{
  "name": "@local/dsh-status-pet",     // must match cordis.patch.yml
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "immediately": true,             // load eagerly
      "inject": [
        "@deepseek-ai/dsh-client-ui-conversation"
      ]
    }
  },
  "meta": { "title": "Status Pet", "description": "…" }
}
```

### cordis.patch.yml

```yaml
- insert:
    - id: status-pet                   # unique among plugin rows
      name: '@local/dsh-status-pet'    # must match package.json "name"
```

---

## Architecture

### How it loads

1. `cordis.patch.yml` inserts the `status-pet` row.
2. `package.json` → `dsh.client` makes the client loader fetch `client.js`
   immediately and inject it into `@deepseek-ai/dsh-client-ui-conversation`.
3. `client.js` calls `window.__ModuleLoader__.load()` and returns
   `{ inject: ['slots', 'locale'], apply(ctx) }`.
4. `apply` registers the locale dictionaries, then registers the `DockPet`
   component into `conversation.composer.dock` and the `SettingsPage` page into
   `settings.section`.

### Status sources — what makes it a *status* pet

The slot declares **no `owner`**, so `renderSlot(...)` passes `{}`; everything
arrives as the seat's standard session props, read off `props`:

| Prop               | Reads                                                          | Cost |
|--------------------|----------------------------------------------------------------|------|
| `useSessionStatus` | `pendingInteraction.kind`, `completionUnread`                   | lowest |
| `useSession`       | `running`, `pendingSubmissions` (a send in flight = busy), `openState`, `lastAgentError`, `promptError` | low |
| `useChat`          | `legacy.runningCalls` (`phase: 'start'` = executing, its `name` feeds the tooltip; `'preparing'` reads as streaming), `legacy.partial` (streaming) | forces Chat assembly |
| `sessionId`        | keys into the status map                                        | — |
| `t`                | locale binding for the registered namespace                     | — |

Rules to keep:

- **Do not poll.** No plugin-facing event exists for streaming or tool deltas;
  `SnapshotSelectorHook` is the mechanism. Every selector is narrow and returns
  a primitive, so a re-render happens on a real transition, never per token.
- **`ConversationSnapshot` is useless here** — it holds only `views` and
  `activeTargets`. `ConversationPhase === 'active'` means the transcript merely
  has content; it is *not* a busy signal.
- **`useChat` is the only costly source.** Acceptable because the shipped
  `stats` pill at this same seat already subscribes to it.
- **A missing prop must not crash.** `useNoSession` / `useNoStatus` /
  `useNoChat` keep the hook call count stable, so a contract change degrades to
  a decorative pet instead of a blank slot entry.

### Slot

`conversation.composer.dock`, id `status-pet`, at a **fixed** order
(`DOCK_ORDER` = −1000 in `main.ts`), below every shipped entry — the pet sits
at the far left of the flex row. The `stats` pill sits at order 0. See
*Position: fixed at the far left*.

---

## Artwork

### Where the pixels live

The built-in artwork is **baked data, and FROZEN**.  It was generated once,
from `assets/*.gif` + `tools/gif-map.json`, into `src/artwork.gen.ts` — and all
three of those inputs are now **DELETED from this repo**, so the generated file
is the source of truth and is edited by hand if a built-in action needs a fix.
It ships as its own bundle chunk:

```
src/artwork.gen.ts                       the built-in artwork (frozen, hand-maintained)
tools/ARTWORK.md                         the frozen catalog of what it contains
        |
        v   pnpm build
  client.artwork.js                      a sibling chunk, served on demand
  client.js                              the plugin itself (code only)
```

`tools/gen-artwork.py` is kept as the FORMAT REFERENCE (what it emitted, the
crop boxes, the provenance comments) and carries a header saying it cannot run
here; `git log` still has the deleted inputs if a real re-generation is ever
wanted.  `src/artwork.gen.ts` carries a header saying the same thing.

`client.js` never contains a frame.  At startup it calls
`require.async('./client.artwork.js')` — the DSH module loader serves sibling
files whose name matches `/^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/` on demand,
with an immutable cache — and hands the result to
`installSkinArtwork(registry)`, which swaps the registry in, re-resolves the
active skin and broadcasts.  Until that promise settles the pet draws an empty
canvas (a few ms on a local server).

**The GIFs WERE raw material, and they are gone.**  They were deleted along
with the recipe, so the pet never breaks — nothing at runtime ever read them —
but the built-in artwork can no longer be re-generated, re-cropped or
re-ordered.  The provenance comment above every action (source gif, frame
indices, gloss) and `tools/ARTWORK.md` are the surviving record of how each one
was made.

### The recipe: `tools/gif-map.json` — DELETED, kept here as the record

The recipe was one entry per state, listing the gifs that state drew from
(the file itself is gone; every id/name/origin it produced is recorded in
`tools/ARTWORK.md` and in `src/artwork.gen.ts`).  Its shape was:

```json
{ "idle":  [["daiji-huxi-xiuxian", "待机呼吸循环"], ["chi-niangao", "吃年糕"]],
  "tool":  [["xie-daima", "写代码"]],
  "error": [["gongzuozhuangtai-chuitou-tanqi-maohan", "垂头叹气冒汗"]] }
```

**Every pair becomes one LIBRARY ACTION**, and the state listed it under
references that action's id.  The renderer rolls one of a state's actions at
random — but only after the current one has played its minimum (see *The
player*), so idle's 61 actions cycle through a different everyday activity every
6–11 s instead of every couple of seconds, while `approval` has two.  Each
action stores `FRAMES` frames (currently 4) sampled evenly across the gif's
loop, so the motion is the gif's own, and it carries the map's gloss as its
`name` and the gif name as its `origin` — which is what makes the built-in
library browsable and importable.  The generator's knobs (`FRAMES`, the two crop
boxes, the per-state cycle length) are documented at the top of the script.

Adding/removing an action, reordering, changing a gloss: edit the map and
re-run.  Writing the same gif under a SECOND state lists it twice — the two
become separate actions that happen to look alike; they are not shared, because
the map has no way to say "these two states play one action" (a custom skin
does: that is what the checkbox list is).  The generator writes the gif name,
the frame indices and the gloss as a comment above every action in
`src/artwork.gen.ts`, and lists them in `tools/ARTWORK.md` — that pair is the
memory of how the artwork was made.

### The data model — one shape for every skin

```js
frame   = { rows, dx?, dy?, ms?, prop? }      // a full grid of two-char pixels
action  = { id, name?, origin?, frameMs, frames: [frame, …] }  // = a library entry
grid    = { library: [action, …], states: { idle: [id, …], … } }
artwork = { palette: ['transparent', …], grids: { 32: grid, 128: grid } }
```

A **built-in is exactly this** — the same object 我的创作 is.  There is no
composition step, no authored-block upscale, no shared face vocabulary and no
mirror-symmetry requirement any more: `resolveArtwork()` in `store.ts` is the
single path from an `Artwork` to render-ready states, for built-ins and custom
alike.  (The old `top`/`flanks`/`faces`/`bottom` blocks and the `RECIPES`
motion script were removed — the gifs already carry the motion and the
expressions, and storing real frames is what let the artwork be 1:1 with the
source at 128px.)

Two crops ship: the **32px avatar** (a 64px square around the head, downscaled
2:1) for the dock, and the **128px body** (a 128px square around the character,
1:1 with the gif — no resampling at all) for the popup, which is why the
crops' authoring sizes are now genuine rather than upscaled.

### The action library — why a state owns no pixels

The model flipped in v8, and this is the one thing to understand before touching
any of it: **an action belongs to the ARTWORK, never to a state.**  A state
stores a list of `id`s (`states.tool = ['xie-daima', 'hop']`), and
`resolveStateTakes` maps those ids through the crop's `library`.  The renderer
only ever sees the resolved `states[state].takes`, so **not one line of
`renderer/` changed** — the flip is entirely in the store, the Workshop and the
generator.

What that buys, and what to keep true:

- **Reuse is a reference.**  Tick one action in four states and there is still
  one definition: editing it once changes all four.  Both halves must therefore
  keep the sharing VISIBLE — 按动作's dropdown options, 按状态's rows and the
  delete button all report `被 N 个状态在用`, and deleting an action strips it from
  every state that referenced it (`removeLibraryTake`), so a dangling id cannot
  exist.
- **Ids, not indices.**  Deleting an action used to shift every later take's
  index, silently re-pointing a state at its neighbour's animation.  Ids are
  minted by `freeTakeId` (a readable base, `-2` on collision) and validated
  unique per grid.
- **One representation of "unset".**  An empty/absent state list FOLLOWS IDLE —
  that is what `settings.followIdle` means, and `setStateSelection` deletes the
  key rather than storing `[]`.  There is no "take over this state" step any
  more; ticking a checkbox IS taking it over.
- **Sharing is by content, or by choice.**  `addToLibrary` dedupes by
  `takeKey` (every frame's rows, offsets, ms and prop) so a merge never stores
  the same animation twice; `meta.unique` opts out, which is what 新建动作 needs
  — an identical blank is already in the library and sharing it would make the
  button look broken.
- **An action's pace is shared.**  `frameMs` lives on the action, so a shared
  animation cannot tick at four speeds.  Deliberate: a per-state override would
  reintroduce exactly the drift the library removes.
- **Identity sharing in resolution.**  Two states that play the same set share
  ONE resolved object (`states.a === states.b`), and an unassigned state is
  `states.idle` by identity.  The memo key is the SELECTION, not the state name.
- **The upgrade door is one function.**  `upgradeArtwork(legacy)` converts the
  pre-v8 shape (state → its own takes), deduping by content — so a take that was
  copied into three states becomes one shared action.  It is used for BOTH a v7
  stored document and the generated built-in chunk, and it shares frame arrays
  by reference, so upgrading 15MB of artwork is a pass over 106 objects, not a
  copy.  `takeKey` is memoized per take object (a WeakMap): every mutator builds
  a fresh object, so a cached key can never describe edited pixels.

### Palette

The palette comes from the artwork: the generator collects every colour the
selected frames use and quantises to at most 255 slots (`transparent` is slot
0, being the two-character pixel format's ceiling).  A built-in's palette is
therefore not hand-authored — `tools/ARTWORK.md` is the record.

## Custom skins

The Settings tab is **one page with two tabs** — 预览 (look) and 编辑 (change) —
and **each tab carries the same 按状态 / 按动作 switch**, because the two ways of
looking at the artwork are also the two ways of working on it:

- **预览** (the default tab) — two READ-ONLY views.  **按状态** (the default) is
  the RESULT: one LIVE `PetPreview` per state, each cell tooltipped with what
  that state means and badged with its assignment (`{n} 个动作` or `跟随空闲`) —
  the only place a state nobody ticked anything for is visible.  **按动作** is
  the MATERIAL: one cell per library action (`PetPreview` pinned by `takeId`),
  labelled with the states that play it, including actions NO state plays — and
  paged, because the built-in library is 106 live canvases.  A quiet line above
  the grid counts the actions nothing plays.  The cell itself is **inert**: a
  small floating **✎** in its top-right corner is the whole edit affordance —
  every state cell has one (a state's assignment is editable on any skin), an
  action cell only on 我的创作 (a built-in's pixels are frozen) — so looking at
  the pet can never change it.
- **编辑** — the same two words and the same two modes, and here each mode is
  exactly ONE job:
  - **按动作** (`PixelEditor`) is the pixel studio: an **action dropdown** over the
    crop's whole library (each option carrying its frame count and how many
    states play it) picks the ONE action on the board, and the field spine under
    it is 画布 → 画笔 → 帧 → 当前帧.  Nothing on this page mentions a state.
  - **按状态** (`StateAssignments`) is the assignment surface: a **state dropdown**
    (each option carrying how many actions that state plays, or 跟随空闲) picks
    WHICH STATE YOU ARE TICKING FOR, and the crop's whole library follows as one
    checkbox per action — "this state plays it" — with 全选 / 清空 beside it.  Nothing on this page draws a pixel.
- **A built-in may be re-ASSIGNED, never re-drawn.**  Its 编辑 tab exists, but
  only the 按状态 half: the mode switch drops 按动作 (there is no board to draw
  on), a quiet line says the artwork is fixed and points at 我的创作, and the
  action cells in 预览 carry no ✎.  The assignment is stored as a DIFF beside the
  skin (`saveSkinStates` → `builtinStates`), so the built-in keeps its pixels, a
  state nobody touched keeps following the artwork, and **nothing forks**: the
  old studio forked to 我的创作 on the first stroke, which is what made the page
  seem to edit one thing and save another.
- **`idle` can never be emptied.**  It is the anchor every unassigned state falls
  back to, and both `validateArtwork` and resolution require it, so 清空 is
  disabled while 空闲 is the selected state (untick individually instead).
- **The seam between the tabs is the corner ✎.**  Clicking it opens 编辑 in the
  matching mode ALREADY POINTING AT THAT CELL — an action cell → 按动作 with that
  action on the board, a state cell → 按状态 with that state's boxes in front of
  you.  `page.ts` owns both targets (`editAction`, `editState`); opening 编辑 from
  the tab row clears `editAction`, so the ordinary way in starts on the crop's
  first action.
- The **32 / 128 crop switch lives on the tab row**, right of the two tab
  buttons: it belongs to BOTH tabs (it is the crop you look at *and* the crop you
  edit), so neither tab owns it.  `page.ts` owns it as `crop` and hands it to
  `PetPreview` in the galleries and to `PixelEditor` / `StateAssignments` as
  `grid` — neither half has a crop switch of its own any more.

There is **no separate recolour row and no palette to manage**: the studio
carries a 画笔 (brushes) strip — six free colour wells — and painting bakes the
brush's colour into the pixels, so editing a brush changes what the NEXT stroke
paints with and nothing already on the board.

Both halves are **ONE column of labelled FIELDS** (`field.ts`), which is the
page's spine: it makes a region read as a list of settings instead of a heap of
buttons.  按动作 is 动作 → 画布 → 画笔 → 帧 → 当前帧 and then the undo/redo + IO
bar; 按状态 is 状态 → 动作库 and nothing else.

The **library stays a small set of slots you curate** — 新建动作 makes one, 删除
removes one, and **导入动作 fills one**.  That last verb is the whole preset story
now, and it is an OVERWRITE, not a merge: the picker offers two sources at the
crop being edited — the built-in's library (whale-chan is the only built-in; a
search box and thumbnails, because it is 106 entries) and this artwork's OWN
actions — and picking one replaces the action on the board.  The picked action's
ID is kept, so every state that referenced it still does (`overwriteLibraryTake`
in the store); the name, frames and pace follow the source, its colours are
re-pointed at this document's palette (`adoptRows`), and one 撤销 restores the
previous drawing.  The crops are isolated: a 128px animation is never offered to
a 32px board.  There is deliberately no 复制动作 — a second slot with the same
content is 新建动作 + 导入 — and no bulk "import the whole library": a document no
longer grows by 106 unused entries.

Why the split: the old single studio put one state dropdown, a checkbox list and
a pixel board in the same card, so the dropdown decided only half of what the
user thought it decided and the action being drawn was chosen by clicking a
checkbox row.  Two modes, one job each, and the two dropdowns never overlap.

Studio mechanics that matter:

- **The board is a SQUARE that can only ever be as large as its column.**  Its
  side is `min(100%, 52vh, 512px)` with `aspect-ratio:1`, and the cells are
  `flex:1 1 0` inside it — so the 128×128 crop is COMPLETE at any pane width and
  never needs a horizontal scrollbar, while the 32×32 crop simply gets larger
  cells.  A fixed 6px cell for the body crop is what clipped the canvas in a
  ~580px pane; `52vh` keeps the square on screen in a normal window without
  letting a tall monitor inflate it.
- **The layout is container-responsive, not viewport-responsive.**
  `.status-pet-studio` is a `container-type:inline-size` size container, so the
  regions follow the width the *settings pane* gives them (a settings modal in
  a small window is ~580px of pane — the viewport says nothing about it).  One
  `@container` query decides whether the take preview sits beside the board
  (≥700px — the width at which the board is at its 512px ceiling anyway, so the
  preview column costs the canvas nothing) or as a compact horizontal strip
  under it (<700px, where the board keeps the whole width).
- **The preview is the preview, and the frame's numbers live with the frames.**
  The action's live preview sits in its own stage cell; it used to share a
  bordered strip with 当前帧's 时长 and 整幅挪动, which read as one confused
  control.  The numbers now sit in the 当前帧 field, under the filmstrip they
  describe.  The preview is always PINNED to the selected action (`takeId`), so
  there is no shuffle toggle to explain — the state rotation belongs to the pet,
  not to the editor.
- **A mini button never squeezes.**  `.status-pet-mini-button` is
  `white-space:nowrap;flex:none` and the rows WRAP instead: without it, the
  filmstrip's 复制一帧 / 空白帧 buttons shrank to min-content in a narrow column
  and stacked one character per line — the "混乱" bottom half reported from the
  running UI.  A new section starts on its own line
  (`.status-pet-frame-nav{flex:1 1 100%}`), and a label + input + unit wrap as a
  unit (`.status-pet-num-field`), so nothing is orphaned.
- **Earlier layout regressions to keep in mind:** a wrapped-flex main row sized
  its first column by **max-content** (a blank block beside a state list, the
  canvas *below* it), and an inspector on its own row read as debris.  There is
  no second column to fall into either trap now.  "跟随空闲" appears exactly
  twice: the 按状态 dropdown's option text and the 预览 badge.
- **The animation story is: draw a frame → duplicate it → nudge it.** The
  filmstrip leads with `⧉ 复制一帧` — it clones the selected frame, inserts the
  copy right after it and selects the copy — and `+ 空白帧` starts an empty one.
  (It used to be a bare `+` labelled "新建一帧" while the button that said
  "复制此帧" was a clipboard copy: the label lied about the behaviour, which is
  exactly what made the studio read as nonsense.)  The one clipboard button left
  in the frame row renames itself: `复制到剪贴板` when nothing is copied, `粘贴`
  when a frame is on it.
- **There is exactly ONE move control, and it is a direction pad.** 整幅挪动
  is the frame's `dx`/`dy` (clamped to `GRIDS[grid].maxOffset`): press `↑`/`↓`/
  `←`/`→` and this whole frame moves one grid cell at draw time, with the
  pixels untouched — that is how a bob or a sway is authored, and what the
  built-in RECIPES use.  The label carries the read-out (`整幅挪动 ↓1`) and a
  归零 button appears while the frame is moved, so the state is visible without
  any `dx`/`dy` notation.  The destructive sibling — `shiftRows`, which moves
  the drawn pixels inside the grid and drops what falls off the edge — is
  deliberately **not** in the UI: two near-identical "move" controls is what
  made the studio unreadable, and a user whose model is "I draw the frames"
  never needs it.  It stays in the store (and in the suite) for a future
  board-level affordance.
- **`idle` is the anchor, and the checkbox is the assignment.**  A state with
  nothing ticked follows idle (the dropdown says 跟随空闲); ticking one action
  takes the state over, unticking the last one hands it back.  There is no
  take-over button to explain and no ghosted board.
- **Deleting is guarded.**  `removeLibraryTake` strips the action from every
  state, but the studio refuses the two deletions that would invalidate the
  document: the last action in the library, and the only action a crop's `idle`
  plays (`validateArtwork` requires one, and a document that fails validation is
  dropped on the next read — losing the whole drawing to a stray click).
- **Undo/redo** is a per-mount snapshot stack (50 deep), also on ⌘/Ctrl+Z.  A
  **renaming edit is deliberately NOT undoable** (one entry per keystroke would
  flood the stack), and the name field is uncontrolled, committing on blur —
  a commit serialises the whole artwork, which is far too much work per
  character.  The frame **clipboard** lives in 按动作; 按状态 has no clipboard —
  a state IS its selection, so 全选 / 清空 cover the bulk moves and copying a
  selection onto another state (which read as "duplicate this state") is gone.
- **The 128px body crop** starts as an empty-state card offering "generate
  draft" (4× upscale of every avatar frame, offsets ×4) or a blank grid.  The
  draft keeps the avatar library's IDS, so the crop switch keeps editing the
  same action — the two crops are one character.
- **Import/export** round-trips the whole artwork document as JSON behind
  the IO fold (`serializeArtwork` / `parseArtworkExport`).  The export carries
  the schema `v`; the IMPORT goes by SHAPE, so a hand-written or pre-stamp
  document is read as itself, a pre-v8 one is upgraded (`upgradeArtwork`)
  instead of stranded, and a payload from a NEWER version is refused with a
  message rather than half-read.
- Right-click a cell to pick its colour (eyedropper); every mutator reads
  `artRef` at call time, so rapid clicks and drag strokes never lose work.
- **The brushes are the paint box, and nothing else.**  Six wells, each a
  native colour picker: click one to paint with it, click it again to change its
  colour.  There is no add button and no reset, because a brush is not a palette
  slot — `applyPaint` looks the colour up in the artwork's palette (appending it
  if new) and writes that slot into the pixels, so a brush edit can never
  repaint the board.  The eraser is the `×` well beside them, and right-clicking
  a pixel (the eyedropper) puts its colour on the current brush.  The paint box
  lives in `brushes` in the store, so it survives a reload.

Storage — localStorage (a loader plugin cannot declare a Cordis `Config`):

```jsonc
// localStorage["status-pet:skin"]
{ "v": 8,                                    // schema version — see migrate below
  "skin": "whale-chan" | "custom",
  "brushes": ["#rrggbb", …6…],                 // the paint box (UI state)
  "builtinStates": { "whale-chan": { "32": { "tool": ["xie-daima"] } } },
                                               // per-built-in state-assignment
                                               // DIFF (absent = authored; []=follow idle)
  "custom": { "palette": ["transparent", …up to 255 colours…],
              "grids": { "32": {
                 "library": [ { "id": "chi-niangao", "name": "吃年糕",
                                "origin": "chi-niangao", "frameMs": 550,
                                "frames": [ { "rows": [32行], "dx"?: 0, "dy"?: 0, "ms"?: 400 } ] } ],
                 "states":  { "idle": ["chi-niangao"], "tool": [] } },
                 "128": … } } }
```

Rules to keep:

- **Every read goes through validation, and validation is MEMOIZED BY
  IDENTITY.**  `validateArtwork` requires the avatar grid's non-empty `idle`
  assignment and legal shapes everywhere (full-grid rows — NO symmetry
  requirement, ≤8 frames, ≤`MAX_LIBRARY` actions per library, ≤`MAX_TAKES` per
  state, unique ids, **every id a state names must exist**, no id listed twice,
  offsets within `maxOffset`, ms in range, props rectangular, in-grid and
  palette-legal, and a palette of transparency plus 1–255 colours that every
  painted pixel names).  The scan is allocation-free — one fused pass per row
  through a nibble table, no per-pixel slice and no per-row regex.
  `artworkErrors` (what the store itself asks, via `artworkIsValid`) is keyed by
  the DOCUMENT object and built out of per-ACTION verdicts keyed by the action
  object, so a stroke re-checks the one action it rewrote and re-uses the
  verdicts for the other 105.  A full 15 MB document is ~20 ms the first time
  and free afterwards; before the memos it was ~35 ms on every resolution, of
  which there were dozens per interaction.  Any inconsistency makes resolution
  fall back — a corrupt store must never blank the pet.
- **The v7 document is UPGRADED, not dropped.**  `migrate` keeps the skin choice
  and the paint box (both version-independent) and runs the artwork through
  `convertArtwork`: a v8 document validates as itself, a pre-v8 one (detected by
  `looksLegacy` — a `states` value holding take OBJECTS rather than ids) is
  upgraded losslessly, and anything older than v7, or from a NEWER version, is
  dropped so the pet falls back instead of half-reading it.
- **The document lives in memory; localStorage is a snapshot.**  `loadStored`
  serves the in-memory document (memoized by the raw text when clean, and while
  a write is pending) and re-reads storage otherwise, so an external writer is
  noticed; `saveStored` merges, re-resolves ACTIVE and broadcasts
  SYNCHRONOUSLY, and `storage.ts` decides when the snapshot goes out: **small
  payloads write through** (a skin choice, the paint box, an assignment diff —
  never at risk), **large ones are COALESCED** (one serialization per editing
  burst, forced out after a short idle, hard-capped, and flushed on
  `pagehide`/hidden tab).  A refused write (quota, private mode) drops the
  in-memory document so the next read re-parses what storage actually holds
  rather than serving a lie.  `flushStored()` forces the snapshot out; the
  suite's storage resets go through it.
- **Resolution is lazy and cached BY ARTWORK IDENTITY.**  A skin resolves states
  on first access (an unassigned state IS the idle object, and two states with
  the same selection share one object — the memo key is the SELECTION, not the
  state name), and every resolution is memoized on the `Artwork` object itself.
  Artwork is immutable, so a write that changed the document resolves through a
  new object while a write that did not is served from the memo — which is why
  `refreshActiveSkin` no longer clears anything.  Frames are parsed through
  `spriteFor`, memoized per Frame object, so an untouched frame keeps its
  `Sprite` and therefore its pre-rendered bitmap.  Resolving every state
  eagerly, nine times, was ~220 ms when the gallery opened; a stroke used to
  cost ~95 ms and 24 action previews ~876 ms.
- **The palette is a private colour table, and the pixels own it.**  A custom
  artwork's `palette` is an implementation detail: the studio appends a slot
  when a brush brings a new colour and reuses the slot when the colour is
  already there, and the dock, the picker card, the previews and the studio all
  read that one table.  Built-ins are authored artwork with a fixed palette —
  earlier versions kept a per-built-in override layer (`colors.<name>`, and v2
  also `colors.custom`); v4 dropped it, so a built-in renders exactly as
  authored.
- **The store owns ACTIVE — broadcast is notification only.** `saveStored`
  re-resolves the module-level `ACTIVE` synchronously on every write, then
  dispatches `status-pet:skin-changed`; a module-level `storage` listener
  does the same for other tabs.  `onSkinChange` is only for components
  holding their own resolved copy or selection state.
- **The custom slot is never blank** — selecting it with no data seeds it from
  the active skin's WHOLE library (ids, names, provenance and state assignments
  included), so 我的创作 starts as a working copy rather than an empty page.
- The helpers and the editor components are exposed as `skinTools` on
  the loader return value; the bundle smoke test drives them. The host ignores
  the extra field.

---

## Behaviour

### State machine

`derivePetState(facts)` is a **pure** function, so its priority order is
verifiable without a browser. Highest priority first: what the user owes the
agent, then what the agent is doing, then the outcome.

| State      | Condition                                     |
|------------|-----------------------------------------------|
| `approval` | `pendingInteraction.kind === 'approval'`       |
| `question` | `pendingInteraction.kind === 'question'`       |
| `tool`     | busy and a dispatched tool call (`phase: 'start'`) is executing |
| `stream`   | busy and output is arriving (assistant text, or tool-call arguments still being generated — `phase: 'preparing'`) |
| `think`    | busy, no output yet — *busy* means `running` **or** a submission echo still in flight (`pendingSubmissions`), so the pet reacts the instant you hit send |
| `error`    | not busy and (`lastAgentError`, `promptError`, or `openState === 'error'`) |
| `done`     | not busy and `completionUnread`                |
| `sleep`    | idle for `TUNING.sleepAfterMs`                 |
| `idle`     | otherwise                                      |

`TUNING.reactToStatus === false` short-circuits to `idle`, giving a purely
decorative pet.

### Registries — how to extend

```js
const STATES = {                          // the state vocabulary + seat accent
  idle: {},  sleep: {},  think: {},  stream: {},  tool: {},
  approval: { pill: ' attention' },
  question: { pill: ' attention' },
  error:    { pill: ' error' },
  done: {},
};
const REACTIONS = {                       // transient user-interaction states
  petted: { durationMs: 900 },
  woken:  { durationMs: 1200 },
};
```

Motion is **artwork**, not config: a state's look and movement come from the
skin's frames (see *Artwork*).  The system only owns the vocabulary
(`STATE_NAMES` = 9 states + 2 reactions), the pill accent on the dock seat,
and reaction durations.  Adding a state means: a `STATES` entry, a label in
both locales, a `derivePetState` branch, and artwork (custom skins: drawable in
the studio and ticked onto the new state from the library; a built-in would need
`src/artwork.gen.ts` hand-edited, since the map that used to generate it is
gone).

### Interactions

`react(name)` sets a transient override with the reaction's own duration; the
override outranks the derived state while it lasts and then expires on its own.

| Trigger                          | Reaction  |
|----------------------------------|-----------|
| click the dock pill              | opens the popup, or closes it when open — deliberately **no** `petted`: the pill is a peephole, so wanting to look at the pet never plays a reaction at it |
| click **anywhere in the popup**  | `petted` — the panel owns the reaction (its padding and caption included, not just the 64px live sprite), feeds it to the big canvas and echoes it in the caption; the sprite's own button also pets, so the two paths agree |
| `mouseenter` while asleep        | `woken`   |
| keyboard `focus` while asleep    | `woken`   |

Adding one is a `REACTIONS` entry plus a trigger calling `react(name)`. The
`woken` reaction is wired to `focus` as well as pointer entry, so the pet is not
mouse-only.  **Interaction work goes in the popup**: the dock is the status
read-out, the popup is the toy.  The one exception is a host where `POPUP_OK` is
false — with no popup to open, the pill falls back to `petted` so it is not
inert.  Anything more involved (a treat, a scratch, a picker) belongs behind the
popup, not on the dock pill.

### Hover tooltip

The state tooltip is the host's own design-system `Tooltip`, required from the
seeded `@deepseek-ai/dsh-client-ui-primitives` module (the web shell seeds it
as a static module, so the require resolves synchronously — the same component
the "context used" meter uses, with `delayMs: 0`, so it appears the instant the
pointer lands rather than after the native `title` dwell of ~1 s). `Tooltip`
clones the button and chains its handlers, so the wake and pet triggers keep
firing. The require is guarded: a host without the seed degrades to the native
`title` attribute, and the `title` is set **only** in that fallback — with
`Tooltip` present it would stack a second, delayed native bubble on top of the
instant one. The same wrapper covers the settings-page preview. While the click
popup is open the tooltip is `disabled` (the meter does the same).

### Click popup

Clicking the pet opens a **popup with the big picture** — the same mechanism
as the meter's panel: primitives' `useAnchoredPosition` (anchored above the
pet) + `useDismissOnOutsidePointer` + an Escape listener, with the panel
portal-ed to `document.body` via react-dom's `createPortal`. All three pieces
are seeded by the web shell (`react-dom` is in the same static seed table);
if any is missing, `POPUP_OK` is false and the pill falls back to plain
click-to-pet (it has no popup to open).
`POPUP_OK` is decided once at module load, so the conditional hook calls are
stable per render.

The popup always shows the **most detailed version** of the current skin
(`resolveBestSkin`: the 128px full-body grid when present, else that skin's own
32px avatar — drawn at 4×, an integer upscale stays crisp). It is a live animated
preview — same loop, pinned via `skinRef`, shared component `PetPreview`
(`best: true`, `zoom: LIVE_ZOOM`) — with the current state's name as its
caption.  (It *renders* the crop 1:1 and zooms only the CSS box, so the peek is
64 CSS px of body art — see *Geometry and the sizing rule*.) The anchor ref
sits on a wrapper `span`, because `Tooltip` clones the button and may attach
its own ref.

The **panel** is the petting target, not just the sprite: `DockPopup` owns one
`usePetReaction`, its click pets, the reaction is handed to `PetPreview` as a
`reaction` prop (so the ONE canvas plays it), and the caption echoes the
reaction name while it lasts. That is deliberate — the sprite is only 64 CSS px
of body (rendered from the 128px crop), and a click on the panel's padding or
caption must answer too, or the popup
reads as dead. `PetPreview` keeps its own click reaction for standalone use
(skin cards); the prop simply outranks it.

Click semantics: the dock pill is a **peephole**.  Where the popup primitives
exist, a click only opens it (a second click, Escape, or an outside pointer
closes it) — it never plays `petted`, so wanting to *look* at the pet does not
make it react.  Petting lives inside the popup, on any click in the panel.  Only
in a host without the primitives (`POPUP_OK` false) does the pill keep
`petted`, because there is nowhere else for it to live.

---

## Rendering

### Geometry and the sizing rule

Sprite geometry lives in `GRIDS` (`pet/grids.ts`):

```js
const GRIDS = {
  32: { grid: 32, canvasH: 40, baseY: 4, padX: 4, maxOffset: 4, canvasW: 40 },
  128: { grid: 128, canvasH: 160, baseY: 16, padX: 16, maxOffset: 16, canvasW: 160 },
};
```

The canvas is LARGER than the grid on **both axes**, giving frames headroom for
their `dx`/`dy` offsets: `baseY` above and `canvasH - baseY - grid` below,
`padX` on each side horizontally (the sprite draws at `padX + dx`).  Before
`padX` existed the canvas was exactly `grid` wide, so the idle sway cut real
columns of artwork off the edge and a prop could leave the frame.  The suite
recomputes `maxOffset = padX` and `canvasW === grid + 2 × padX`, and fails on a
clipped pixel in EITHER axis, accents included.
The 128px headroom is deliberately 16: a 4px hop on the 32px avatar must
be the same hop at 128px (4 × 4 = 16), so the popup moves as much as the dock
does.

The sizing rule is **integer ratios only**, and the two stages read different
ratios:

- **The rendered crop (1:1).** `GRIDS` is the size the artwork is DRAWN at:
  the 32px avatar or the 128px body, one sprite pixel per canvas pixel, plus
  the headroom above.  A skin with no 128px block is drawn from its own 32px
  avatar at 4× (128 = 32 × 4).  **What the Workshop shows depends on the job:**
  the galley cells and the studio's stage preview are PREVIEWS, so they display
  at `LIVE_ZOOM` (both crops land on 80 CSS px of canvas = 64px of art, exactly
  what the popup shows — an integer 1:2, so `pixelated` stays crisp); the studio
  BOARD is the drawing surface and stays 1:1 (32×32 / 128×128 cells, every
  rendered pixel visible) because judging a pixel you just placed is the whole
  point of the bigger crop, and skin cards keep the avatar at 1× (a 40px
  canvas).  The gallery used to be 160 CSS px of art per cell, which in a ~530px
  settings pane is two columns of ~260px and left the name and its badge a ~70px
  column that wrapped both — recognition only needs 64px, judgement gets the
  board.
- **The live layers (rendered 1:1, displayed at `LIVE_ZOOM = 1/2`).** The dock
  pill (Resident) and the click popup (Peek) render exactly the same crop into
  the canvas backing store (40×40 and 160×160) and then set the **CSS box** to
  half that (20×20 and 80×80).  The dock therefore shows **16 CSS px of avatar
  art** and the popup **64 CSS px of body art** — the size the pet had before
  the grids grew.  `LIVE_ZOOM` is an exact 1:2 against a built-in artwork that
  is an exact 2× fill of its authored crops, so `image-rendering: pixelated`
  maps every destination pixel to one source pixel: the downscale is crisp,
  never blurry, and the built-in live pet is pixel-identical to its pre-growth
  rendering.  The sprite is **never re-rendered smaller** — `startLoop` takes a
  `zoom` parameter that scales only `canvas.style.width/height`, and the
  backing store is untouched.  `PetPreview` takes the same `zoom` prop and
  defaults to 1, which is what the studio's board-side preview relies on;
  `DockPopup` and BOTH GALLERIES pass `LIVE_ZOOM`, and `DockPet` passes it to
  `startLoop` and multiplies its initial canvas CSS size by it.

Consequences: the dock pill is back to roughly 22px tall / 34px wide (the
composer row no longer grows), and the popup panel is back to an 80×80 canvas.
Filmstrip thumbnails are unchanged: `THUMB_CSS` = 64 on screen, canvas backing
one pixel per grid pixel (32 → 2× up, 128 → 2:1 down), both exact.

### The player

**One shared `requestAnimationFrame` ticker** (`renderer/loop.ts`) drives every
pet canvas.  Each canvas's player reads the current state through a ref, so
state changes never restart anything.  The player model:

```js
function tick(now) {
  const skin = /* skinRef pin, explicit blank, or the store's ACTIVE */;
  const entry = skin.states[faceRef.current] || skin.states.idle;
  if (state changed) { cycleStart = now; rotation = startTake(takes); }  // switches at once
  let take = takeOf(rotation);                                          // held take
  if (cycle wrapped) {
    cycleStart = now;
    rotation = advanceTake(rotation, takes);  // holds for TUNING.takeMinPlays plays
    take = takeOf(rotation);                  // then rolls — never the take just played
  }
  const sprite = reducedMotion ? frames[0].sprite : take.frames[elapsed / frame.ms];
  if (skin === drawn && sprite === drawnSprite && scale unchanged) return;  // dirty check
  ctx.drawImage(spriteBitmap(sprite, skin.palette, scale),
                (GRIDS[skin.grid].padX + sprite.dx) * scale,
                (GRIDS[skin.grid].baseY + sprite.dy) * scale);
  // spriteBitmap caches body + prop as ONE bitmap, so a frame is still one drawImage
}
```

**A take is held, not re-rolled per cycle** (`renderer/take-rotation.ts`, pure
and injectable-random so the suite drives it): `startTake` rolls one take and
gives it `TUNING.takeMinPlays + 0…takePlayJitter` plays; `advanceTake` counts
them down on each wrap and only then rolls the next take — never the one just
played.  Before this, a 61-take state changed activity every cycle (a cycle is
only 1.2–3.4 s), which read as frantic switching.  A **state change ignores the
hold** entirely: the new state's take is rolled and starts at frame 0 at once
(`stateMinDwellMs` still decides whether a *flapping* state restarts the phase).
The roll happens BEFORE the take is read, so a rolled take starts on its own
first frame instead of inheriting the outgoing take's phase.

Every sprite is pre-rendered to an offscreen bitmap once per skin
(`renderer/sprite-cache.ts`, keyed by sprite identity).  The editor pins one
take via `takePinRef` to preview exactly the take being edited; a pinned take
ignores the rotation.

### Resource hygiene

All three are required, not optional:

- **Hidden tab** — `visibilitychange` cancels the rAF loop; the phase is
  absolute, so resuming is smooth.
- **Reduced motion** — `matchMedia('(prefers-reduced-motion: reduce)')` is
  tracked in a ref; the loop freezes on each take's first frame, and the CSS
  disables the pulse.
- **Cleanup** — every effect returns its own disposer (ticker registration,
  listener, timeout).  The sleep timer is a single `setTimeout` armed when
  activity ends (see `ui/hooks.ts`) — there is no polling interval
  anywhere.

---

## Tuning, and why there is no `Config`

Every behavioural knob lives in one flat `TUNING` object at the top of
`src/pet/behavior.ts`: `reactToStatus`, `sleepAfterMs`, `stateMinDwellMs` (a
state change always switches the ARTWORK at once, but restarts the playback
cycle at its first take/frame only once the state has been stable that long —
`think`/`stream`/`tool` flap while a tool call's arguments stream, and
restarting on every flap played only frame 0, which read as a twitch), and
`takeMinPlays` / `takePlayJitter` (how many full plays one take gets before the
player rolls the state's next animation — the fix for "a 61-take state switched
activity every couple of seconds"; a state change ignores the hold).  The
fixed dock order is NOT a pet-behaviour knob — it lives beside its only
consumer as `DOCK_ORDER` in `src/main.ts`.  Sprite geometry (grid, row
counts, `baseY`, `canvasH`, `padX`) lives in `GRIDS` (`src/pet/grids.ts`).

This is deliberately **not** a Cordis `Config`. A bundle can only declare
`Config` when its build bundles `@deepseek-ai/schemastery`
(`const Config = Schema.object({ … })`, then `exports.Config`), and that package
ships **no client artifact** — no `dsh.client` section, no `client.js` — so a
loader plugin cannot `require` it, and `dsh.client.external` only names
other *client* package rows. The shipped client plugins can use `Config`
precisely because their build inlines the dependency.

So: edit `TUNING`.  (The build now exists, so promoting it to `Config` is
possible — bundle `@deepseek-ai/schemastery` in `index.ts` and export it.)

---

## CSS

Inlined via a `<style>` element rendered inside the fragment, so unmounting
removes it. Tokens only (plus literal colours for artwork):

| Token                                | Usage                            |
|--------------------------------------|----------------------------------|
| `--dsw-alias-label-tertiary`         | text/icon colour                 |
| `--dsw-alias-interactive-bg-hover`   | hover & active background        |
| `--dsw-alias-state-business-primary` | focus-visible outline            |
| `--dsw-alias-state-warn-primary`     | attention pulse (`color-mix`)    |
| `--dsw-alias-state-error-primary`    | error pill tint (`color-mix`)    |

| Class        | State                  | Effect                       |
|--------------|------------------------|------------------------------|
| `.attention` | `approval`, `question` | 1.6 s warn-coloured pulse    |
| `.error`     | `error`                | static error-coloured tint   |

State accents come **after** `:hover`, so at equal specificity the state colour
persists while hovered. They are colour-only and wrapped in
`color-mix(…, transparent)`, so a renamed token — or an engine without
`color-mix` — degrades to an untinted pill instead of breaking the render.

---

## Registration

```js
const NS = 'status-pet';
return {
  inject: ['slots', 'locale'],
  // Exposed for the bundle smoke test and embedders: the pure skin helpers
  // plus the customisation components.  The host ignores unknown fields.
  skinTools: { validateSkinData, paintCell, serializeSkin, parseSkinExport,
               loadStored, saveStored, resolveSkin, activeSkin, ui: { … } },
  apply: function(ctx) {
    ctx.effect(function() { return ctx.locale.register(NS, LABELS); });
    const t = ctx.locale.bind(NS);

    // The dock entry, at the fixed far-left order.  `slots.inject` re-runs
    // the callback every time the dock slot collapses and is re-declared
    // (composer remounts, view switches).
    ctx.slots.inject('conversation.composer.dock', function() {
      return ctx.slots.register({
        name: 'conversation.composer.dock',
        id: 'status-pet',
        order: DOCK_ORDER, // −1000, below every shipped entry
        label: function() { return t('label'); },
        locale: NS,
      }, DockPet);
    });

    // The pet's own settings tab (skin cards, then the 预览/编辑 tabs — each
    // with its own 按状态/按动作 mode — sharing one crop switch).  If the
    // settings UI package is absent the inject never fires and the pet keeps
    // working.
    ctx.slots.inject('settings.section', function() {
      return ctx.slots.register({
        name: 'settings.section',
        id: 'status-pet',
        order: 30, // general 0, models 10, plugins 15, agent-presets 20
        label: function() { return t('settings.nav'); },
        locale: NS,
      }, SettingsPage);
    });
  },
};
```

- `ctx.effect(fn)` owns the dictionary registration, so unloading removes it.
  `LABELS` supplies **both** `en` and `zh` in one call.
- `ctx.locale.bind(NS)` and `locale: NS` are two halves of one thing: the
  binding serves the registration-time `label` thunk, while `locale: NS` makes
  the slot hand the component its own `t` prop.
- `label` is a **thunk**, re-read on every projection, so it follows the active
  locale without re-registering.
- **Every user-visible string goes through the namespace** — the `title`,
  `aria-label`, `label`, and every `settings.*` key. Never hardcode copy.

---

## Position: fixed at the far left

The pet used to offer a user-configurable dock position (a `localStorage`-backed
store, a Settings → General row, and drag-to-move). It was removed because the
dock's trailing **"context used" meter (`ContextMeter`) is hardcoded by the host
outside the slot** — `InputBar` renders `renderSlot("conversation.composer.dock")`
and then the meter as a fixed sibling, in a plain `display:flex` row. So:

- "far right" could never actually be rightmost — the meter always sat further
  right, which read as a bug;
- drag-to-move could never drop past it, for the same reason.

Rather than ship a setting whose extremes are unreachable, the position is
fixed: `DOCK_ORDER = −1000` (in `main.ts`), below every shipped dock entry, so
the pet sits
at the far left of the slot row — left of the `stats` pill (order 0). There is
no position store, no Settings → General row, no drag; the Settings tab keeps
only the skin cards and the two tabs (预览's two galleries; 编辑's assignment
list and studio, paint box included) with the crop switch they share.

---

## Development Workflow

### Performance harness — `pnpm bench`

`bench/store.mjs` runs the store/editing hot paths against the REAL modules
(type-stripped by node), with a localStorage stub, and prints wall-clock times:
the first look at a 15 MB document, one paint stroke, a 100-stroke drag (and how
many localStorage writes that actually cost), a skin switch, the library
read-outs.  `bench/board.mjs` prices the JS half of building the DOM pixel board.
Run it before and after touching the store, the resolution caches or the draw
path — the numbers in this file come from it.

### Edit cycle

The bundle is linked from this directory, and `client.js` is a **build
artifact**, so the cycle is always: edit `src/`, rebuild, reload:

1. **Any `src/` change** — `pnpm build` (or keep `pnpm dev` watching) to
   regenerate `client.js`, then refresh the browser page.  Client HMR may
   hot-reload the rebuilt `client.js` without a refresh when
   `@deepseek-ai/dsh-client-hmr` is active and `pnpm run dev:web` runs from
   the DSH checkout.
2. **`cordis.patch.yml`, or `package.json` `meta`/`dsh`** — the patch applies at
   install time only, so remove and reinstall the bundle.
3. **`pnpm test`** rebuilds first (the `pretest` script), so the suite always
   runs against fresh source.

### Adding / changing artwork (built-in)

**There are two (and a half) ways left, because the pipeline's inputs were
deleted.**

1. **A custom skin (the normal one).**  Pick 我的创作, import the built-in action
   library, draw or re-time anything you like there.  Nothing built-in is
touched and nothing needs the generator.
2. **Hand-edit `src/artwork.gen.ts`** for a genuine fix to a built-in action
   (a wrong pixel, a bad offset, a misleading gloss).  Keep the provenance
   comment above the entry truthful, then `pnpm build` and reload.  The shape is
   documented in that file's header and in *The action library* above.
3. **Restore the raw art and re-generate** (only if a real re-crop/re-order is
   wanted): `git log` has `assets/*.gif` and `tools/gif-map.json`; restore them
   with `git checkout <rev> -- assets tools/gif-map.json`, put the gifs back
   under their original names, and `python3 tools/gen-artwork.py` runs again
   unchanged (needs Python 3 + pillow + numpy).

Note that `tools/gen-readme-media.py` still works without the gifs: it renders
`docs/media/` from the artwork DATA via `tools/dump-artwork.mjs`.

### Adding an interaction

1. Add the `REACTIONS` entry (`durationMs`), plus artwork for it — an action in
   the action library — if the two default reactions are not enough.
2. Add both labels, and the name to `ReactionName` + `STATE_NAMES`.
3. Wire a trigger that calls `react(name)`.
4. Run `pnpm test`.

### Adding a skin

A skin is one `Artwork` document.  To ship another built-in:

1. add its `Artwork` document to `src/artwork.gen.ts` and export it from that
   file's `ARTWORK` record (hand-edited now — the generator's inputs were
   deleted; see *Where the pixels live*);
2. add its name to `BUILTIN_NAMES` in `src/pet/skins/built-ins.ts` — the
   registry the artwork chunk fills;
3. add `settings.skin.<name>` to **both** `LABELS.en` and `LABELS.zh`;
4. run `pnpm test` and look at it in the Settings tab.

Nothing else: there is no per-skin composition, palette or symmetry rule.

### Changing the display size

There is no user-facing size control: the dock always renders the 32px avatar
crop 1:1 and displays it at `LIVE_ZOOM` (16 CSS px of art), the popup renders
the best-resolution crop the same way and displays it at `LIVE_ZOOM` (64 CSS px
of body); inside the Workshop the studio's BOARD stays 1:1 while every
PREVIEW (both galleries, the studio's stage preview) displays at `LIVE_ZOOM`.
As a code change, sizes
live in `GRIDS` (with `LIVE_ZOOM` beside it): adding a new grid size means a
`GRIDS` entry (with `maxOffset` derived from its headroom), plus artwork on skins
that support it.  Any change to `canvasH`/`baseY`/`maxOffset` is checked by the
suite.

### Changing the slot position

The position is fixed at `DOCK_ORDER` (−1000 in `main.ts`, far left — lower
is further left; the `stats` pill uses 0). Moving the pet is a one-line edit
plus a page refresh; there is no user-facing control — see *Position: fixed
at the far left*.

---

## Testing

### Automated — `pnpm test` (node:test, TypeScript)

The suite lives in `test/` and runs on Node's built-in runner — no test
framework, and Node 24 type-strips the `.ts` files in place.  `pretest`
rebuilds `client.js` first, so the bundle smoke test always runs against
fresh source.  Two complementary halves:

- **Pure modules, imported directly** (`skins`, `behavior`, `labels`,
  `skin-store`, `take-rotation`) — no stub at all beyond a localStorage-shaped
  `window`.
- **UI** (`ui`) — the real components driven by a stubbed
  React and stubbed slot props, with host deps injected through the same
  `initHostDeps(require)` the loader uses.  And **bundle** (`bundle`) — the
  built `client.js` loaded with a stubbed `window.__ModuleLoader__`, then
  `factory` + `apply` driven to capture the registrations.  And **loop**
  (`loop`) — the real player driven with a stubbed canvas/ctx, a stubbed rAF and
  a hand-driven clock, so take holding and state switching are asserted on the
  artifact that runs, not only on the pure policy.

It needs no browser and no DOM, and it never scrapes source text — every
assertion runs against the real modules or the real artifact.  It covers:

- **Registration** — slot name, id, the fixed far-left order (below every
  shipped entry), exactly one dock registration, locale namespace, label thunk;
  **no** `settings.general.item` row; the settings-section registration — fresh
  id `status-pet`, order past every shipped section, locale namespace, label
  thunk, page component.
- **Settings section page** — the skin picker, **no recolour row** (the page
  carries no colour well), **no position control**, **no big preview block**
  (the two "in the dock / in the popup" portraits were removed); two tabs
  (预览 / 编辑) with the 32 / 128 crop switch on the SAME row, and only the active
  tab's content rendered; the 预览 tab holds one labelled gallery cell per
  `STATE_NAMES` entry (the nine states AND the two reactions), so a reaction
  drawn in the studio is previewable,
  each carrying a `PetPreview` pinned to that state (a LIVE pet showing the
  state's real motion, not a static frame) at the crop the tab row picked, and
  each cell's tooltip says what its state means, and a corner ✎ whose click is
  asserted to carry that cell's own state / action into the matching 编辑 mode —
  eleven of them on a built-in (state cells only; an action cell has none, since
  its pixels cannot be edited).  The 编辑 tab exists on BOTH skins, landing on
  按状态 for a built-in and on 按动作 for 我的创作, and both halves get **the crop
  the tab row owns** (neither has a switch of its own any more).  The two modes
  are asserted to stay apart: the studio's only
  selector is the 动作 `<select>` (`status-pet-action-select`) and its field
  spine is 动作/画布/画笔/帧/当前帧; `StateAssignments`' only selector is the 状态
  `<select>` (`status-pet-state-select`) with the checkbox library under it.
- **The two halves, separately and together** — 按状态's `StateAssignments` is
  driven directly: ticking writes the reference, 全选 / 清空 are the whole
  selection and exactly the idle fallback (`清空` is disabled while 空闲 is the
  selected state — it is the anchor the document cannot lose), and the list shows
  the SELECTED state's ticks rather than the library.  On a BUILT-IN the same
  surface writes a DIFF: it is asserted that nothing forks to 我的创作, that only
  the changed state is stored (per crop), that ACTIVE / `resolveNamedSkin` /
  `skinLibrary` and `seedArtworkFrom` all follow it, that an explicitly emptied
  state resolves to idle by identity, and that a stored id naming an action that
  does not exist is dropped rather than blanking the pet.  The studio is driven for the drawing
  half: its 动作 dropdown moves the board to that action (the stroke lands there
  and not on the previous one), an `actionId` prop mounts it on that action (and
  falls back rather than blanking on an unknown id), and the shared-action test
  ticks `hop` for two states in one component and paints it in the other,
  asserting both states re-resolve to the same object.
- **The full state truth table** — all nine states, all three error paths
  (`lastAgentError`, `openState`, `promptError`), the send echo bridging
  `running` (`pendingSubmissions` → `think`, outranking both `error` and
  `sleep`), the `preparing` → `stream` mapping, the sleep boundary (59999 →
  `idle`, 60001 → `sleep`), and the priority order (`running` beats `error`;
  `tool` beats `stream`; `approval` and `unread` beat `sleep`).
- **Tool-name label** — a `phase: 'start'` call names itself in the tooltip and
  aria-label via `toolNamed`'s `{name}` param; a nameless call keeps the
  generic `tool` label, a `preparing` call names nothing, and the English
  fallback table interpolates too.
- **Interactions end to end** — a click on the dock pill opens the popup and
  leaves the state alone (no `petted`);
  hovering or focusing a sleeping pet yields `woken`; hovering an awake pet
  changes nothing; without the popup primitives a click still yields `petted`, the one place that reaction remains reachable.
- **No dragging** — the pill wires no pointer handlers.
- **Pill modifiers** — only `approval`, `question` and `error` carry one.
- **Locale + resilience** — a resolved key is used verbatim; with no translator
  the English table is used; a slot that passes no props still renders.
- **Click popup** — closed by default; the pill carries `aria-haspopup` /
  `aria-expanded`; clicking opens the anchored dialog (big animated preview +
  state caption), disables the tooltip while open, and closes on a second
  click; the panel renders hidden until the anchored position resolves; a host
  without the popup hooks declares nothing and clicking just pets.  **A click
  anywhere in the panel pets**: the panel's own click handler runs the
  reaction (the live sprite is only 64 CSS px of body), the reaction reaches
  `PetPreview` as a prop, the caption plus the dialog's `aria-label` echo the
  reaction name while it lasts, and `PetPreview` is called with
  `zoom: LIVE_ZOOM`.
- **Integer-ratio rendering** — the canvas backing keeps every rendered pixel
  and `image-rendering: pixelated` is retained.  The live/Workshop split is
  asserted explicitly: `the dock renders the 32px avatar crop 1:1 and displays
  it at 16px` (a 40px backing in a 20px CSS box, and the box is exactly half the
  backing), and `the live pet is 16px of avatar and 64px of body; the Workshop
  stays 1:1` (`LIVE_ZOOM === 1 / 2` exactly, a 160×160 backing shown as an 80×80
  CSS box; a `PetPreview` with no `zoom` keeps a 160 CSS px display, which is
  what the studio's board-side preview relies on, while the GALLERY passes
  `zoom: LIVE_ZOOM` explicitly and is asserted to do so).
- **Artwork geometry** — `GRIDS` headroom bounds `maxOffset` at both grids on
  BOTH axes (`canvasW === grid + 2 × padX`), the 128px headroom expresses the
  avatar offsets at their true scale, and no LIBRARY ACTION of any built-in
  loses a painted pixel — or an accent — to its own `dx`/`dy` at either crop.
  `skins.test.ts` walks the LIBRARY rather than the assignments (an action no
  state plays is still shipped artwork and still has to be well-formed), asserts
  every action is named and traceable to its gif, that the ids are unique, and
  that both crops carry the SAME library in the same order — the crop switch
  must never change which action is selected.
- **Take rotation + the player** — `take-rotation.test.ts` drives the pure
  policy with a seeded random: a roll stays in range and never re-deals the
  take it replaces, a one-take state is index 0, each take holds
  `takeMinPlays…+jitter` plays, and `startTake` (a state change) begins a full
  quota.  `loop.test.ts` drives the REAL player with a stubbed canvas/ctx, a
  stubbed rAF and a hand-driven clock on a synthetic skin: a stable state keeps
  one take across cycles (the old per-cycle re-roll fails here), every run is
  within the hold bounds, a re-roll moves on, a state change switches on the
  very next tick (frame 0, not the take it was in), a pinned take never
  rotates, and the flapping pair — rapid state flips keep the take slot and the
  shared clock running (artwork switches every tick, no frame-0 twitch), while a
  state that outlives `stateMinDwellMs` restarts the cycle at frame 0.
- **Registry integrity** — every `face` exists; every reaction has a duration;
  every state, reaction **and `settings.*` key** (including every
  `settings.skin.<name>` and the size labels) is labelled in every locale; the
  dictionaries have identical key sets (quoted keys included).
- **Skin store** — validation enforces full-grid pixel frames (asymmetric ones
  are legal — drawing is free), the ACTION and per-state caps, offset bounds and
  ms ranges, prop shape/bounds/palette, a palette of transparency plus up to 255
  colours that every painted pixel names, the mandatory avatar `idle`
  assignment, unique library ids, and **references that resolve** (a state
  naming a missing id, or the same id twice, is refused rather than rendering
  one animation fewer).  The pre-v8 door has its own tests:
  `upgradeArtwork` collapses a take copied into three states into ONE shared
  action (sharing the frame objects by reference, never copying them),
  is deterministic, and `convertArtwork` reads both shapes and refuses neither
  by accident; a v7 payload in storage is upgraded ON READ (skin choice, paint
  box and all) while a payload from a newer version is dropped.  The library ops
  are driven directly: assignment is a reference (and unassigning an action
  removes the key rather than storing `[]`), `addLibraryTake` dedupes by content
  but mints a new action for 新建动作, a colliding id gets a legible suffix,
  a full library does not grow, removing an action strips every reference, and
  `takeKey` names an action by its content.  `paintCell` paints exactly one
  cell, `findOrAdd` reuses a colour or appends it, `adoptRows` re-points
  imported rows by colour, and `shiftRows` shifts literally; a broken prop is
  rejected instead of throwing out of `parseFrame` later; export is
  version-stamped, a bare or pre-v8 export still imports (upgraded), a newer one
  is refused; the paint box resolves to a full six wells or the default;
  `resolveSkin` falls back to the default skin on empty / unknown /
  custom-without-data and a corrupt store never blanks the pet; an unassigned
  state IS idle's resolution by identity (and two states with the same selection
  share one object); `resolveTakeSkin` plays ONE action — including one no state
  plays — and nulls for an unknown id; `skinLibrary` lists every action with its
  frame count and its players; `resolveBestSkin` prefers the 128px body and
  falls back to the SKIN'S OWN avatar when there is none; `resolveNamedSkin`
  resolves any skin by name regardless of the active skin, null for
  empty/unknown; `loadStored` serves the in-memory document and follows both a
  write and an external change without mutating a cached object; writes stamp
  the schema version and broadcast.  **performance.test.ts** owns the hot-path
  CONTRACTS — a one-action edit leaves every other action/frame/sprite identical
  by reference, validation answers from the memo, resolution is memoized by
  artwork identity, `usedBy` is an index, small writes land synchronously while
  a 15 MB document is coalesced (memory live, one flush) and thirty strokes cost
  exactly one snapshot — and **draw.test.ts** drives the ImageData rasterizer
  (colour packing, transparency, the scaled scratch-canvas path, the palette
  table) that the other suites cannot reach.
- **Customisation UI** — one card per skin plus the custom slot; the studio
  edits the FULL grid (expression rows unlocked), paints FREELY (one cell per
  stroke, no mirroring), drag-paints only with a button held, never loses rapid
  strokes (artRef); the library list IS the assignment surface (ticking a row
  adds the reference, unticking it hands the state back to idle, 全选/清空
  replace the whole selection) and **one edit to a shared action changes every
  state that plays it** (asserted through `resolveSkin`); 新建/复制/删除动作 keep
  the library honest and DELETE is refused for the last action or idle's only
  one; importing the built-in library arrives deduped, named and with the count
  reported; the frame CRUD honours the caps; **the animation flow end
  to end** (duplicate a frame → the copy is identical → one press of 整幅挪动 ↑
  gives it `dy: -1` with the pixels untouched → 归零 clears it); the 128px draft
  generates from the avatar; an imported accent gets its own row in 当前帧 with
  a 移除装饰 button (it draws over the body but is not on the board, so the
  studio must at least be able to drop it); undo/redo restores artwork; invalid imports show
  a localized error; export produces importable JSON.  **The paint box** — six
  brush wells (no add, no reset), each a colour picker that persists; a stroke
  bakes the brush's colour into the pixels while appending at
  most one palette slot, editing a brush leaves every painted pixel exactly as
  it was, twenty distinct colours produce twenty slots (past the old 15-colour
  ceiling), the eyedropper puts a pixel's colour on the current brush, and the
  eraser clears exactly one pixel; `resolveSkin` draws exactly the
  colour the studio painted.  **The studio's LAYOUT invariants** — a board cell
  carries its colour and nothing else (`Object.keys(cell.props.style)` is
  `['background']`), so the board can only ever be as wide as its column and the
  128×128 crop cannot be clipped again; every row of the edit card is a labelled
  `.status-pet-field` (状态, 画布, 画笔, 动作库, 帧, 当前帧); and the action
  preview's cell holds no inputs — the frame length, the action's shared pace
  and the 整幅挪动 pad live in 当前帧.  The GALLERY has its own pair: the 按状态
  cells badge every state with what it plays (or 跟随空闲), the 按动作 cells pin a
  `takeId` (never a state) and list the states that play it, the first page is
  bounded and 显示更多 extends it, and the unused-action count is on screen.

Two traps the component stub has already fallen into; do not reintroduce
them:

- The component closes over the React instance passed to `factory(require)`, so
  the stub must be a **single** instance. Creating a fresh one per render
  silently empties the `useState` queue and every `idleMs` case passes
  vacuously.
- Hook storage must be reset **per mount**, or one test's `reaction` leaks into
  the next and the locale assertions fail for the wrong reason.
- The `useState` stub must run **lazy initializers** — the editors seed state
  from the skin store with `useState(() => …)`. Storing the function verbatim
  makes every editor test fail in confusing ways.

### What the suite cannot verify

It deliberately does not emulate a real canvas or a real clock, so
**appearance is untested**: the actual look, whether the bob reads well,
whether the pulse is too noisy, whether an 11 s hold feels too long, and
whether the expressions are legible at 32 px. Those need eyes on a running
instance.  (The player's *timing* IS tested — `loop.test.ts` drives the real
`startLoop` with a stubbed ctx and a hand-driven clock.)

### Manual checklist

1. Whale-chan is visible in the composer dock, at the **far left** (left of
   the `stats` pill), and bobbing perceptibly (not a shimmer).
2. It blinks every few seconds (a short blink frame inside the idle cycle).
3. Click: where the host seeds the popup primitives, the **big-picture popup**
   opens above the pet (the 128px body crop or the 4× avatar upscale, rendered
   1:1 and shown at `LIVE_ZOOM` — 64 CSS px of body, animated) — and the
   dock pet itself does **not** react. Click anywhere in the open panel (the
   sprite, its padding, the caption): the pet hops with hearts and the caption
   flips to the reaction's name. Click the pill again, press Escape, or click
   outside: it closes. While it is open the hover tooltip stays out of the way.
4. Hover lightens the background; tab-focus draws the focus ring.
5. Hover or focus it while asleep — it wakes.
6. Send a message: the pet enters `think` the instant you hit send (before the
   first server event), then `stream` → `done`, then `sleep` after ~60 s idle.
7. Trigger a tool approval: the pill pulses.
8. Hover it: the tooltip appears the instant the pointer lands (the host's
   `Tooltip`, no dwell), names the state — and while a tool executes, names the
   tool itself — and follows the UI language.
9. Enable reduced motion: no bob, no pulse, no jump.
10. Hide the tab: the loop stops (no CPU use); show it and motion resumes.
11. Dragging the pet does nothing — there is no drag; a press is a click.
12. Open DSH Settings → General: there is **no** pet position row.
13. Open DSH Settings: a "状态宠物 / Status Pet" tab sits below Agent presets in
    the nav. Its page shows the skin cards, then two tabs — 预览 and 编辑 — each
    with its own 按状态 / 按动作 switch, and a 32 / 128 switch on the tab row
    (32 = the 32px avatar crop, drawn at 4× in the gallery, the default;
    128 = the 128px full body crop — the Workshop previews are 1:1 in the studio
    and `LIVE_ZOOM` (80 CSS px of canvas) in the galleries, so a gallery tile is a
    compact ~120px tile with the name and its badge under the sprite).  预览 holds
    eleven LIVE pets — the nine states plus the two reactions (`petted`, `woken`)
    — one per `STATE_NAMES` entry, each moving with its state's real motion (tool
    jitters, sleep dims and drifts).  There is no big preview block at the top, no
    recolour row and no position control.  With a **built-in** skin selected the
    tab row holds BOTH tabs, but its 编辑 opens on 按状态 with no 按动作 in the
    switch, and only its state cells carry a corner ✎; pick 我的创作 and 编辑 opens
    on 按动作 — the studio — and its action cells get a ✎ too.  That is the only
    skin whose pixels and colours are editable.
14. Settings → Status Pet: the skin card shows the live 鲸鱼娘; the chunk's
    frames arrive a frame after boot, so a slow first paint means the artwork
    chunk is still in flight.
15. In 预览, hover a gallery cell: the tooltip says what that state means.
    Press 32 / 128 on the tab row: every cell changes crop at once and nothing
    about the skin itself changes — and both halves of 编辑 switch with it.
    Click a cell's corner ✎: 编辑 opens in the matching mode with that state (or
    that action) already selected.  Switch 预览 to 按动作 first: the ✎ then takes
    you into 按动作 with that action on the board.
16. In 编辑 · 按动作: pick an action from the dropdown, paint a few cells (each
    stroke lands exactly where you click — draw a wink to prove nothing is
    mirrored, instantly live), hit 复制一帧 and press 整幅挪动 ↓ once with a short
    时长.  Switch to 按状态 and tick that action for `tool`; run a tool and watch
    the dock pet play YOUR animation.  Then edit the same action again: both
    states move with it, because a tick is a reference.
17. Paste garbage into the import box — a localized error appears; paste a
    valid export — it applies as 我的创作.
18. Corrupt `localStorage["status-pet:skin"]` (e.g. write `x` into it) — the
    pet falls back to the default skin instead of blanking.
19. Click "从头像生成 128×128 草稿" — the popup then shows your full-body crop
    instead of the 4× upscale, and the dock avatar is untouched.
20. With 我的创作 selected, open the 编辑 tab and paint with a brush, then change
    THAT brush's colour in the well and paint somewhere else: the first pixel
    keeps its colour and the second one is the new colour — a brush is a brush,
    not a palette slot.  Right-click a pixel to pick its colour onto the current
    brush; the `×` well erases.  Reload: your paint box is still there.
21. Read 编辑 · 按动作 top to bottom: every row starts with its label in the same
    column (动作, 画布, 画笔, 帧, 当前帧), and no row mentions a state.  In
    编辑 · 按状态 the spine is just 状态 → 动作库, with the selection ops at the
    right of the state row; the 当前帧 row holds the selected frame's 时长 / 整幅挪动
    right under the filmstrip; and the action's live preview is its own box
    (beside the board, or a strip under it in a narrow pane) holding no numbers.  Move the pane from
    ~400 px to ~1200 px: the board stays a complete square the whole way (never
    clipped, never a horizontal scrollbar), the preview moves beside it at ~700 px
    of pane, and no button ever wraps one character per line.  Watch for a fixed
    cell size (the board spills) and a squeezed mini button.
22. Leave the pet idle for a minute: each everyday activity now plays its whole
    loop 3–5 times (6–11 s) before another take is rolled — no flicker between
    activities every couple of seconds.  Send a message mid-activity: the
    artwork switches at once and the new state's take starts from its first
    frame.

### Common issues

| Symptom                            | Likely cause                                        |
|------------------------------------|-----------------------------------------------------|
| Pet not visible                    | slot registration failed, or `client.artwork.js` 404s — check the console |
| Pet frozen                         | `requestAnimationFrame` stopped; check `tick()`     |
| Pet never leaves `idle`            | the seat stopped passing status props; the `useNo*` fallbacks mask it — log `Object.keys(props)` |
| Pet dimmed and barely moving       | correct: that is `sleep`                            |
| Pill pulses while the agent is idle| stale `pendingInteraction`; inspect `useSessionStatus` |
| Movement invisible                 | an amplitude was set below what the headroom allows |
| Canvas blurry or juddering         | `displayWidth !== canvasWidth`, or a non-integer displacement |
| Click does nothing                 | `onClick` not firing; check the button render        |
| Pill square, not rounded           | CSS not injected; check the `<style>` in the output  |
| Tooltip shows a bare key (`idle`)  | dictionary not registered; check `inject: ['slots','locale']` |
| Tooltip is slow (native dwell)     | the design-system seed was missing, so the guarded `require` fell back to `title`; check the console for a require error |
| Settings tab missing               | `settings.section` never declared — the settings UI package is absent/disabled; the pet itself still works |
| Pet not at the far left            | another entry registered below −1000; `DOCK_ORDER` (main.ts) is the fixed order — see *Changing the slot position* |

---

## Bundle Lifecycle

Through the plugin manager, with the **absolute path of this checkout**:

```
plugin_manager install_bundle <absolute path to this project>
plugin_manager remove_bundle @local/dsh-status-pet
plugin_manager set_bundle @local/dsh-status-pet enabled=false
plugin_manager set_bundle @local/dsh-status-pet enabled=true
plugin_manager list_bundles
```

Without that tool, the CLI equivalent is
`dsh plugin --profile <name> add <absolute path>`, followed by the row in the
profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: status-pet
      name: '@local/dsh-status-pet'
```

---

## Design Decisions

- **Status-driven, not decorative** — an ambient indicator of agent activity.
  State comes only from the seat's standard props, through narrow selectors;
  nothing polls.
- **Motion is artwork** — every state is a user-drawable frame animation
  (each take is held for a minimum number of plays before the next is rolled,
  so an activity reads as something the pet is doing and a blink stays organic);
  the system owns only the vocabulary, the pill accent, and reaction durations.
- **One sprite pixel = one canvas pixel** — the render is always 1:1 (or an
  integer upscale), the only way movement reads and pixel art stays crisp.
  Refined by experience: the rule is **integer ratios only** — the popup's 4×
  upscale of a skin without an HD block is just as crisp, and the two live
  layers' exact 1:2 `LIVE_ZOOM` downscale is the other clean ratio.
- **Whole-pixel displacement** — fractional offsets make `pixelated` snap rows
  unevenly.
- **Composed, symmetric artwork (built-ins)** — a built-in block composes `flank + face
  + mirrored(flank)` between its `top` and `bottom` rows, so the character is
  symmetric by construction while each skin keeps its own face table (the
  whale maid's glossy blue eyes are not the cat's).  `RECIPES` supplies the
  motion (two takes per state), `props` supply the accent.  Mirror symmetry is
  machine-checked at both grids.  Custom artwork is not required to be
  symmetric — see *Symmetry: built-ins only*.  The two grids are two **crops** of the
  character: 32px is the bust shown in the dock, 128px is the full body shown
  in the popup; both are optional extras beyond `idle`.
- **The user owns the artwork** — taste is unarguable. Built-in skins stay
  machine-checked, and they are the only fixed-palette artwork; custom data is
  validated on every read and falls back to the default skin; the editor
  NEVER rejects a stroke, and it does not mirror one either — you draw exactly
  the pixel you clicked; a
  pixel carries its own colour (the artwork's palette is a private dedup table
  the editor grows), so there is no palette to manage and editing a brush can
  never repaint the board; the display size is a viewing preference, never part
  of the artwork.
- **The dock is a read-out; the popup is the toy** — the pill's click only
  opens the popup, so looking at the pet never plays a reaction at you; petting
  (and, from here on, any other interaction) happens inside, and the WHOLE panel
  is the target — a reaction you can only trigger by hitting a 64px live sprite
  reads as a dead popup.
  The only exception is a host with no popup primitives, where the pill keeps
  `petted` rather than being inert.
- **Declarative registries** — adding a state, expression, skin or interaction
  is an entry plus a label, not a change to the loop.
- **Invariants as tests** — symmetry, clipping headroom and registry
  completeness are asserted, so future edits cannot quietly break them.
- **Fail soft on a contract change** — `useNo*` fallbacks keep the hook count
  stable, so a missing prop yields a plain pet rather than a crashed slot entry.
- **Locale from the start** — every visible string goes through the `status-pet`
  namespace (`en` + `zh`).
- **Fixed position over a broken choice** — the pet is pinned to the far left of
  the dock. A user-configurable position was tried and removed: the host
  hardcodes the "context used" meter outside the slot, so "far right" could
  never actually be rightmost. See *Position: fixed at the far left*.
- **No Host logic** — `index.js` is an empty stub; the bundle needs a Host entry
  point to resolve, and nothing more.

### Known gaps

- **Installed and live; the dock itself is still unobserved.** The bundle is
  installed in the `web` profile and both registrations are live
  (`conversation.composer.dock` at −1000, `settings.section` at 30), and the
  Settings tab has been seen rendering in the running UI — the skin cards, the
  studio's dropdown/board/brushes/filmstrip, and the eleven-state gallery.  The
  composer dock pet itself has not been captured yet:
  checklist items 1–11 are the remaining gap.
- **The pet renders 14 CSS px wide on screen** (the avatar's content spans
  columns 1–14 of the authored 16, i.e. 1–28 of the 32px grid, rendered 1:1 and
  shown at `LIVE_ZOOM` = 1/2). That is the dock's
  quiet layer next to the host's ~14px pill icons: the popup is the big one (64
  CSS px of body art from the 128px crop, with props).
- **The studio's feel is unverified.** Its layout was measured with a throwaway
  headless harness (the real `SettingsPage`, screenshotted at 400–1200px of pane,
  both crops, empty-body too) and its interactions are unit-tested — but that
  evidence is not a regression guard; the two structural layout tests are.
