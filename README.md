# Status Pet 🐳

A tiny pixel-art whale maid who lives in the DSH composer dock and shows you
what your agent is doing — sleeping, thinking, running tools, waiting for your
approval, or just being done.  Click her and the big picture pops up: a pettable
panel with the full-body animation.

---

## Layers

| Where | Size | What |
|---|---|---|
| Dock pill | 16 CSS px of art | the pet as a pure status read-out |
| Click popup | 64 CSS px of art | the full animated body + every interaction |
| Settings tab | 1:1 / LIVE_ZOOM | skin cards, state ↔ action assignment, the action viewer |

---

## Architecture

```
src/
  behavior/    pure domain: state machine (22 states), the discourse engine
               (sequences, bridges, murmurs, events, topics, mood), i18n context,
               the pool structure, tuning
  labels/      the two locales: ~3,200 speech lines each + the settings copy
  skin/        artwork model + wardrobe: geometry, pixel codec, faces, library,
               assignment diff, persistence, resolution, built-in catalog (15 MB)
  player/      pure playback: rotation policy, tick reducer, lead/follow channel
  platform/    host adapters: clock (rAF), visibility, raster, bitmaps, theme
  view/        React: PetCanvas (the ONE playing element), dock, popup, settings
test/          the gate: node --test over the pure layers (no browser)
```

One dependency direction: `behavior ← skin ← player ← platform ← view ← entry`.

---

## Quick start

```bash
pnpm build      # → client.js (≈648 kB, ≈150 kB gzip) + client.artwork.js (15.6 MB)
pnpm typecheck  # tsc --noEmit
pnpm test       # node --test over test/*.test.ts (no browser, no deps)
pnpm check      # typecheck + test
pnpm dev        # build --watch
```

`pnpm test` is the gate for everything that can be checked without a browser:
the zh/en copy contract, "every line still reads with every variable missing",
sequence and bridge integrity, the state truth table, the discourse rhythm, the
artwork's own invariants (via `skin/validate.ts`) and the pure playback/scroll
maths.  What it cannot see — how she actually moves — is the manual checklist in
`AGENTS.md`.

---

## Storage

```json
{ "v": 1, "skin": "whale-chan",
  "assignments": { "whale-chan": { "tool": ["xie-daima"] } },
  "dockText": "right", "dockLineWidth": "medium" }
```

The artwork (15 MB of pixel data) is never stored — only a handful of action ids.
The diff is written against the authored assignment, so a state the user never
touched keeps following the artwork.

---

## License

MIT
