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
  pet/         pure domain: state machine, tuning, i18n
  skin/        artwork model + wardrobe: geometry, codec, faces, library,
               assignment diff, persistence, resolution, built-in catalog (15 MB)
  player/      pure playback: rotation policy, tick reducer, lead/follow channel
  platform/    host adapters: clock (rAF), raster (canvas), bitmaps, theme
  view/        React: PetCanvas (the ONE playing element), dock, popup, settings
```

One dependency direction: `pet ← skin ← player ← platform ← view ← entry`.

---

## Quick start

```bash
pnpm build      # → client.js (95 kB) + client.artwork.js (15.6 MB)
pnpm typecheck  # tsc --noEmit
pnpm test       # 80 tests (rebuilds first via pretest)
pnpm dev        # build --watch
```

---

## Storage

```json
{ "v": 1, "skin": "whale-chan",
  "assignments": { "whale-chan": { "tool": ["xie-daima"] } } }
```

The artwork (15 MB of pixel data) is never stored — only a handful of action ids.
The diff is written against the authored assignment, so a state the user never
touched keeps following the artwork.

---

## License

MIT