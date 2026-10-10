#!/usr/bin/env python3
"""gen-readme-media.py — render the README's imagery from the SHIPPED artwork.

    python3 tools/gen-readme-media.py            # → docs/media/
    python3 tools/gen-readme-media.py --skin custom-not-yet

Nothing here is a mockup or a hand-drawn illustration: every pixel comes from
`src/artwork.gen.ts` — the same rows the running pet draws — rasterised with
the same geometry the renderer uses (the sprite at `padX + dx`, `baseY + dy`
on the canvas, its accent stamped over the body), then scaled by an INTEGER
factor (or the live layers' exact 1:2, which the built-in artwork survives
because it is an exact 2× fill of its authored crops).  Re-run it whenever the
artwork is regenerated.

Output (docs/media/):

    hero.gif              the pet walking through the states, captioned
    states/<state>.gif    one loop per state, at the popup's true display size
    sizes.png             the two crops, and the size each one is shown at
    skins.png             every built-in skin, at both crops

Requires Pillow (the same dependency tools/gen-artwork.py has) and node (to
read the TypeScript artwork data).
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# ── knobs ──────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / "docs" / "media"

SKIN = "whale-chan"
BODY_GRID = "128"          # the full-body crop — what the popup shows
AVATAR_GRID = "32"         # the head crop — what the dock shows

BG = (18, 20, 26, 255)     # the dark card the media sits on
INK = (232, 235, 242, 255)
DIM = (150, 157, 172, 255)
ACCENT = (109, 142, 255, 255)
LINE = (44, 48, 60, 255)
CARD = (26, 29, 37, 255)

FONT_DIR = Path("/System/Library/Fonts")
FONT_BOLD = FONT_DIR / "Supplemental/Arial Bold.ttf"
FONT_REG = FONT_DIR / "Supplemental/Arial.ttf"
FONT_MONO = FONT_DIR / "Menlo.ttc"
FONT_CJK = FONT_DIR / "Hiragino Sans GB.ttc"

# The hero walks through the story the dock tells: nothing running → you sent
# something → a tool runs → it needs you → it is done → it failed → it naps.
# One take (four frames) per state, in the state's own pace.
HERO_STATES = ["idle", "think", "stream", "tool", "approval", "done", "error", "sleep"]
HERO_SCALE = 3
HERO_CAPTION_H = 46

# The state loops in the README table: the canvas at 1:1 — the size the
# Workshop (settings gallery, studio) draws it at, so every pixel is visible.
STATE_GIF_PX = 160


def font(path: Path, size: int, index: int = 0) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(str(path), size, index=index)
    except OSError:
        return ImageFont.load_default(size)


def font_for(text: str, size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    """Arial has no CJK, and Pillow has no font fallback: pick the CJK face for
    any string that needs it (it covers Latin too, so mixed copy is fine)."""
    if any(ord(ch) > 0x2500 for ch in text):
        return font(FONT_CJK, size, 1 if bold else 0)
    return font(FONT_BOLD if bold else FONT_REG, size)


# ── the artwork: rows → pixels ─────────────────────────────────────────


def load_artwork(skin: str) -> dict:
    node = os.environ.get("NODE") or shutil.which("node")
    if not node:
        sys.exit("gen-readme-media.py: node is required (it reads the artwork data)")
    out = subprocess.run(
        [node, str(ROOT / "tools" / "dump-artwork.mjs"), skin],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        sys.exit("dump-artwork.mjs failed:\n" + (out.stderr or out.stdout))
    return json.loads(out.stdout)


def hex_rgba(colour: str) -> tuple:
    if colour == "transparent" or not colour.startswith("#"):
        return (0, 0, 0, 0)
    v = colour.lstrip("#")
    return (int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16), 255)


def render_frame(spec: dict, palette: list, frame: dict, scale: int = 1) -> Image.Image:
    """One frame on its full canvas (grid + headroom), exactly as draw.ts plots
    it: `padX + dx` / `baseY + dy`, with the accent stamped over the body."""
    w, h = spec["canvasW"], spec["canvasH"]
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    colours = [hex_rgba(c) for c in palette]

    def stamp(rows: list, ox: int, oy: int) -> None:
        for y, row in enumerate(rows):
            for x in range(len(row) // 2):
                token = row[2 * x:2 * x + 2]
                if token == "..":
                    continue
                tx, ty = ox + x, oy + y
                if 0 <= tx < w and 0 <= ty < h:
                    px[tx, ty] = colours[int(token, 16)]

    ox = spec["padX"] + frame.get("dx", 0)
    oy = spec["baseY"] + frame.get("dy", 0)
    stamp(frame["rows"], ox, oy)
    prop = frame.get("prop")
    if prop:
        stamp(prop["rows"], ox + prop["x"], oy + prop["y"])
    if scale != 1:
        img = img.resize((w * scale, h * scale), Image.NEAREST)
    return img


def on_card(frame_img: Image.Image, bg=BG) -> Image.Image:
    """Composite a transparent frame onto the dark card, opaque (GIFs need it)."""
    out = Image.new("RGBA", frame_img.size, bg)
    out.alpha_composite(frame_img)
    return out


def palette_image(images: list) -> Image.Image:
    """One shared palette, so a GIF's colours never shimmer between frames."""
    seen = []
    for im in images:
        for _, colour in im.convert("RGB").getcolors(maxcolors=1 << 24) or []:
            if colour not in seen:
                seen.append(colour)
    p = Image.new("P", (1, 1))
    flat = []
    for colour in seen[:255]:
        flat += list(colour)
    flat += [0, 0, 0] * (256 - len(flat) // 3)
    p.putpalette(flat)
    return p


def save_gif(frames: list, durations: list, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pal = palette_image(frames)
    converted = [f.convert("RGB").quantize(palette=pal, dither=Image.Dither.NONE) for f in frames]
    converted[0].save(
        path, save_all=True, append_images=converted[1:],
        duration=durations, loop=0, disposal=2, optimize=True,
    )
    print(f"  {path.relative_to(ROOT)}  {path.stat().st_size // 1024} KB")


def state_take(art: dict, grid: str, state: str, take: int = 0) -> dict:
    return art["grids"][grid]["states"][state][take]


# ── the images ─────────────────────────────────────────────────────────


def make_state_gifs(art: dict) -> None:
    spec = art["grids"][BODY_GRID]
    for state, takes in spec["states"].items():
        take = takes[0]
        frames = [on_card(render_frame(spec, art["palette"], f)) for f in take["frames"]]
        half = STATE_GIF_PX / spec["canvasW"]
        frames = [f.resize((STATE_GIF_PX, round(f.height * half)), Image.NEAREST) for f in frames]
        durations = [f.get("ms", take["frameMs"]) for f in take["frames"]]
        save_gif(frames, durations, MEDIA / "states" / f"{state}.gif")


def make_hero(art: dict) -> None:
    spec = art["grids"][BODY_GRID]
    labels = art["labels"]["en"]
    frames, durations = [], []
    for state in HERO_STATES:
        take = state_take(art, BODY_GRID, state)
        for frame in take["frames"]:
            sprite = render_frame(spec, art["palette"], frame, HERO_SCALE)
            w = spec["canvasW"] * HERO_SCALE
            card = on_card(sprite)
            canvas = Image.new("RGBA", (w, card.height + HERO_CAPTION_H), BG)
            canvas.alpha_composite(card, (0, 0))
            draw = ImageDraw.Draw(canvas)
            draw.line([(0, card.height), (w, card.height)], fill=LINE, width=1)
            draw.text((w // 2, card.height + HERO_CAPTION_H // 2), labels.get(state, state),
                      font=font(FONT_BOLD, 20), fill=INK, anchor="mm")
            frames.append(canvas)
            durations.append(frame.get("ms", take["frameMs"]))
    save_gif(frames, durations, MEDIA / "hero.gif")


def panel(draw: ImageDraw.ImageDraw, box: tuple, title: str, note: str) -> None:
    x0, y0, x1, y1 = box
    draw.rounded_rectangle(box, radius=14, fill=CARD, outline=LINE, width=1)
    draw.text((x0 + 22, y0 + 16), title, font=font_for(title, 22, bold=True), fill=INK)
    draw.text((x0 + 22, y0 + 46), note, font=font_for(note, 15), fill=DIM)


def checker(size: tuple, cell: int = 4) -> Image.Image:
    """A quiet checkerboard, so the transparent headroom around a sprite reads
    as canvas rather than as a black box."""
    img = Image.new("RGBA", size, (30, 33, 42, 255))
    px = img.load()
    for y in range(size[1]):
        for x in range(size[0]):
            if (x // cell + y // cell) % 2:
                px[x, y] = (37, 41, 51, 255)
    return img


def place(canvas: Image.Image, sprite: Image.Image, xy: tuple) -> None:
    """Paste a sprite centred on a checkerboard."""
    plate = checker(sprite.size, max(3, min(6, sprite.width // 20)))
    plate.alpha_composite(sprite)
    canvas.alpha_composite(plate, (xy[0] - sprite.width // 2, xy[1] - sprite.height // 2))


def make_sizes(art: dict) -> None:
    W, H = 1180, 720
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw.text((40, 32), "Two crops, two sizes", font=font(FONT_BOLD, 34), fill=INK)
    draw.text((40, 78),
              "The dock and the popup draw the SAME pixels; the Workshop shows them 1:1. "
              "Every step is an integer ratio, so nothing blurs.",
              font=font(FONT_REG, 17), fill=DIM)

    avatar = art["grids"][AVATAR_GRID]
    body = art["grids"][BODY_GRID]
    a_full = render_frame(avatar, art["palette"], state_take(art, AVATAR_GRID, "idle")["frames"][0], 1)
    b_full = render_frame(body, art["palette"], state_take(art, BODY_GRID, "idle")["frames"][0], 1)
    a_live = a_full.resize((avatar["canvasW"] // 2, avatar["canvasH"] // 2), Image.NEAREST)
    b_live = b_full.resize((body["canvasW"] // 2, body["canvasH"] // 2), Image.NEAREST)

    def sample(x: int, y: int, sprite: Image.Image, caption: str, cap_y: int) -> None:
        place(img, sprite, (x, y))
        draw.text((x, cap_y), caption, font=font(FONT_MONO, 13), fill=DIM, anchor="mm")

    panel(draw, (40, 118, 590, 388), "In the dock", "the 32×32 avatar crop, on a 40px canvas")
    sample(120, 250, a_live, "20 px chip", 358)
    sample(280, 250, a_full, "canvas 1:1", 358)
    sample(450, 250, a_full.resize((a_full.width * 2, a_full.height * 2), Image.NEAREST), "×2, for detail", 358)

    panel(draw, (600, 118, 1140, 388), "In the popup", "the 128×128 body crop, on a 160px canvas")
    sample(710, 250, b_live, "80 px chip", 358)
    sample(960, 250, b_full, "canvas 1:1", 358)

    panel(draw, (40, 408, 1140, 700), "Why two crops, not two scalings",
          "The avatar is a bust — the framing a favicon would use. The body is the whole character, tail fluke included.")
    sample(120, 580, a_full, "avatar 1×", 676)
    sample(300, 580, a_full.resize((a_full.width * 4, a_full.height * 4), Image.NEAREST), "avatar 4×", 676)
    sample(540, 580, b_full, "body 1×", 676)
    draw.text((730, 470), "crisp at every step", font=font(FONT_BOLD, 16), fill=INK)
    for i, line in enumerate([
        "1:1 — one sprite pixel per canvas pixel",
        "1:2 — the live dock and popup (an exact half)",
        "×3 / ×4 — the upscale when a skin has no body crop",
    ]):
        draw.text((730, 504 + i * 24), "· " + line, font=font(FONT_REG, 14), fill=DIM)

    img.convert("RGB").save(MEDIA / "sizes.png")
    print(f"  docs/media/sizes.png  {(MEDIA / 'sizes.png').stat().st_size // 1024} KB")


def make_skins(art: dict) -> None:
    W, H = 1180, 400
    img = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw.text((40, 30), "Skins", font=font(FONT_BOLD, 30), fill=INK)
    draw.text((40, 70), "Whale-chan ships with the plugin. 我的创作 is whatever you draw.",
              font=font_for("Whale-chan ships with the plugin. 我的创作 is whatever you draw.", 17), fill=DIM)

    body = render_frame(art["grids"][BODY_GRID], art["palette"],
                        state_take(art, BODY_GRID, "idle")["frames"][0], 1)
    head = render_frame(art["grids"][AVATAR_GRID], art["palette"],
                        state_take(art, AVATAR_GRID, "idle")["frames"][0], 1)
    head = head.resize((head.width * 2, head.height * 2), Image.NEAREST)

    # The one built-in.
    draw.rounded_rectangle((40, 118, 560, 368), radius=14, fill=CARD, outline=LINE, width=1)
    draw.text((62, 134), "Whale-chan", font=font(FONT_BOLD, 22), fill=INK)
    draw.text((62, 164), "鲸鱼娘 · the built-in", font=font_for("鲸鱼娘 · the built-in", 15), fill=DIM)
    place(img, head, (140, 270))
    draw.text((140, 336), "avatar ×2", font=font(FONT_MONO, 13), fill=DIM, anchor="mm")
    place(img, body, (390, 262))
    draw.text((390, 336), "body 1×", font=font(FONT_MONO, 13), fill=DIM, anchor="mm")

    # The empty custom slot, drawn the way the studio's blank board looks.
    draw.rounded_rectangle((600, 118, 1140, 368), radius=14, fill=CARD, outline=LINE, width=1)
    draw.text((622, 134), "My Creation", font=font(FONT_BOLD, 22), fill=INK)
    draw.text((622, 164), "我的创作 · every pixel is yours",
              font=font_for("我的创作 · every pixel is yours", 15), fill=DIM)
    cell, cols = 14, 8  # an 8×8 sketch of the studio's blank board
    bx, by = 870 - cols * cell // 2, 200
    for gy in range(cols):
        for gx in range(cols):
            draw.rectangle((bx + gx * cell, by + gy * cell,
                            bx + gx * cell + cell - 1, by + gy * cell + cell - 1),
                           fill=(33, 37, 46, 255), outline=LINE)
    draw.text((870, 350), "a blank 128×128 board", font=font(FONT_MONO, 13), fill=DIM, anchor="mm")

    img.convert("RGB").save(MEDIA / "skins.png")
    print(f"  docs/media/skins.png  {(MEDIA / 'skins.png').stat().st_size // 1024} KB")


def main() -> None:
    skin = sys.argv[1] if len(sys.argv) > 1 else SKIN
    art = load_artwork(skin)
    art["skins"] = [skin]  # the registry, for the skins poster
    MEDIA.mkdir(parents=True, exist_ok=True)
    print(f"gen-readme-media.py — {skin}")
    make_state_gifs(art)
    make_hero(art)
    make_sizes(art)
    make_skins(art)


if __name__ == "__main__":
    main()
