#!/usr/bin/env python3
"""gen-artwork.py — turn assets/*.gif into the pet's artwork data.

!! IT CANNOT RUN IN THIS CHECKOUT ANY MORE.  Both of its inputs —
!! `assets/*.gif` and `tools/gif-map.json` — were deleted (the baked frames
!! in `src/artwork.gen.ts` are all that is left of them), so that file is now
!! the source of truth and is edited by hand.  This script survives as the
!! FORMAT REFERENCE: the shape it emits, the crop boxes it used, the
!! provenance comments it wrote.  `git log` still has the deleted inputs;
!! restore them and this script runs again unchanged.

THE PIPELINE (one direction, three files):

    assets/*.gif  +  tools/gif-map.json        <- the raw art + the recipe
              |
              v   python3 tools/gen-artwork.py
    src/artwork.gen.ts   the data the plugin loads, with provenance comments
    tools/ARTWORK.md     the same thing, human-readable, regenerated each run

`tools/gif-map.json` is the ONLY file you edit by hand: one entry per state,
listing the gifs that state draws from.  EVERY entry becomes one LIBRARY
ENTRY (an action the artwork owns, with a stable id, its gloss as `name` and
its gif as `origin`), and `states` records which ids that state plays — the
renderer picks one of them at random on every animation cycle.  Writing the
same gif under a second state lists it twice, and the two entries then share
nothing; they are separate actions that happen to look alike.

TO ADD A STATE
  1. add it to STATES / STATE_NAMES (src/pet/behavior.ts) and to both locales
     (src/pet/labels.ts);
  2. add one line to tools/gif-map.json:
         "my-state": [["xie-daima", "写代码"], ["chi-token", "吃 token"]]
     each pair is [gif file name without .gif, a one-line description];
  3. run this script, reload the page.  Nothing else changes.
  To drop a take, delete its pair.  To reorder, move it.  There is no other
  wiring: the state names in behavior.ts and the keys here are the same name.

TO RE-GENERATE: put the gifs back under the SAME file names (that name is the
only link between the map and the raw art) and run the script again.

THE GIFS ARE RAW MATERIAL: the generated data is baked into the artwork chunk,
so deleting assets/*.gif never breaks the running pet — it only stops you
re-generating that take (the script prints which ones it could not find).

Requires Python 3 with numpy and Pillow (the DSH runtime ships both; otherwise
`pip install pillow numpy`).
"""
import json
import os
from collections import OrderedDict

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')
MAP = os.environ.get('ARTWORK_MAP', os.path.join(ROOT, 'tools', 'gif-map.json'))
OUT_TS = os.environ.get('ARTWORK_TS', os.path.join(ROOT, 'src', 'artwork.gen.ts'))
OUT_MD = os.environ.get('ARTWORK_MD', os.path.join(ROOT, 'tools', 'ARTWORK.md'))
# Optional: ARTWORK_PNG=/tmp/sheet.png writes a contact sheet of every take's
# first frame (body 1:1, dock crop at 4x) so the result can be eyeballed.
OUT_PNG = os.environ.get('ARTWORK_PNG')

# ── knobs ──────────────────────────────────────────────────────────────
FRAMES = 4              # frames stored per take (one take = one short loop)
BODY_GRID = 128         # the popup crop
AVATAR_GRID = 32        # the dock crop
MAX_COLOURS = 255       # palette slots after 'transparent' (the pixel format)
BG_TOL = 40             # green-screen chroma tolerance
# The body crop: a BODY_GRID square in SOURCE pixels, centred on the character
# (the sprite is 72x92 at (74,22)-(146,114)), leaving room for the small
# effects these gifs animate.  Anything drawn further out is clipped; the
# coverage report at the end lists those takes.
BODY_BOX = (46, 4, 46 + BODY_GRID, 4 + BODY_GRID)
# The dock crop: a 64px square around the head, downscaled 2:1 to the 32 grid.
HEAD_BOX = (78, 20, 78 + 64, 20 + 64)
# One full cycle per state, in ms; per-frame ms is this divided by FRAMES.
STATE_CYCLE = {
    'idle': 2200, 'sleep': 3400, 'think': 2200, 'stream': 1400, 'tool': 1200,
    'approval': 1200, 'question': 2000, 'error': 2000, 'done': 1400,
    'petted': 1200, 'woken': 1200,
}
DEFAULT_CYCLE = 2000


# ── image helpers (numpy, so a full re-generation stays a few seconds) ──
def matte(a):
    """Green screen -> alpha 0."""
    r = a[:, :, 0].astype(np.int16)
    g = a[:, :, 1].astype(np.int16)
    b = a[:, :, 2].astype(np.int16)
    out = a.copy()
    out[(g - r > BG_TOL) & (g - b > BG_TOL), 3] = 0
    return out


def pad_to(a, min_w, min_h):
    h, w = a.shape[:2]
    if w >= min_w and h >= min_h:
        return a
    out = np.zeros((max(h, min_h), max(w, min_w), 4), np.uint8)
    out[:h, :w] = a
    return out


def crop(a, box):
    x0, y0, x1, y1 = box
    return a[y0:y1, x0:x1]


# Pixel tokens: index 0 is transparency and MUST be written as '..' — the
# store's validator accepts either '..' or a slot 1..255, never '00'.
TOKENS = ['..'] + ['%02x' % i for i in range(1, 256)]


def pack(a):
    return ((a[:, :, 0].astype(np.uint32) << 16)
            | (a[:, :, 1].astype(np.uint32) << 8) | a[:, :, 2])


def js_str(s):
    """A JSON string literal (valid TypeScript), safe for any gloss text."""
    return json.dumps(str(s), ensure_ascii=False)


def downscale(a, tw, th):
    """Area-majority downscale: each target pixel takes the most common opaque
    colour in its source box (transparent when the box is mostly empty)."""
    h, w = a.shape[:2]
    out = np.zeros((th, tw, 4), np.uint8)
    yedge = (np.arange(th) * h // th, np.arange(th + 1) * h // th)
    xedge = (np.arange(tw) * w // tw, np.arange(tw + 1) * w // tw)
    packed = pack(a)
    for ty in range(th):
        y0, y1 = yedge[0][ty], max(yedge[0][ty] + 1, yedge[1][ty])
        for tx in range(tw):
            x0, x1 = xedge[0][tx], max(xedge[0][tx] + 1, xedge[1][tx])
            p = packed[y0:y1, x0:x1].ravel()
            op = a[y0:y1, x0:x1, 3].ravel() > 127
            if op.sum() * 2 < p.size:
                continue
            v, c = np.unique(p[op], return_counts=True)
            best = int(v[np.argmax(c)])
            out[ty, tx, :3] = ((best >> 16) & 255, (best >> 8) & 255, best & 255)
            out[ty, tx, 3] = 255
    return out


def coverage(a):
    m = a[:, :, 3] > 127
    if not m.any():
        return None
    ys, xs = np.where(m)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


# ── main ───────────────────────────────────────────────────────────────
def main():
    with open(MAP, encoding='utf8') as fh:
        mapping = json.load(fh, object_pairs_hook=OrderedDict)

    takes, clipped, missing = [], [], []
    for state, items in mapping.items():
        for name, gloss in items:
            path = os.path.join(ASSETS, name + '.gif')
            if not os.path.exists(path):
                missing.append((state, name))
                print('  !! missing %s.gif — take skipped.  Put the file back '
                      'under this exact name to restore it.' % name)
                continue
            im = Image.open(path)
            n = getattr(im, 'n_frames', 1)
            picks = [int(round(i * n / FRAMES)) % n for i in range(FRAMES)]
            body, avatar, box = [], [], None
            for fr in picks:
                im.seek(fr)
                a = pad_to(matte(np.array(im.convert('RGBA'), dtype=np.uint8)),
                           BODY_BOX[2], BODY_BOX[3])
                body.append(crop(a, BODY_BOX))
                cov = coverage(a)
                if cov:
                    box = cov if box is None else (
                        min(box[0], cov[0]), min(box[1], cov[1]),
                        max(box[2], cov[2]), max(box[3], cov[3]))
                avatar.append(downscale(crop(a, HEAD_BOX), AVATAR_GRID, AVATAR_GRID))
            if box and (box[0] < BODY_BOX[0] or box[1] < BODY_BOX[1]
                        or box[2] > BODY_BOX[2] or box[3] > BODY_BOX[3]):
                clipped.append((state, name, box))
            takes.append({'state': state, 'gif': name, 'gloss': gloss,
                          'frames': body, 'avatar': avatar, 'picks': picks})
            print('  %-9s %-42s %s' % (state, name, gloss))

    # ── palette: every colour used, quantised into MAX_COLOURS slots ──
    hist = {}
    for t in takes:
        for a in t['frames'] + t['avatar']:
            v, c = np.unique(pack(a)[a[:, :, 3] > 127], return_counts=True)
            for k, n in zip(v.tolist(), c.tolist()):
                hist[k] = hist.get(k, 0) + n
    keys = sorted(hist)
    print('\n%d distinct colours across %d takes' % (len(keys), len(takes)))
    if len(keys) > MAX_COLOURS:
        # Weight by frequency but cap each colour, so one huge flat area (the
        # hair) cannot starve the face, then median-cut.
        sample = bytearray()
        for k in keys:
            sample.extend(bytes(((k >> 16) & 255, (k >> 8) & 255, k & 255)) * min(hist[k], 8))
        q = Image.frombytes('RGB', (len(sample) // 3, 1), bytes(sample))
        pal = q.quantize(colors=MAX_COLOURS, method=Image.MEDIANCUT).getpalette()[:MAX_COLOURS * 3]
        palette = [(pal[i * 3], pal[i * 3 + 1], pal[i * 3 + 2]) for i in range(MAX_COLOURS)]
    else:
        palette = [((k >> 16) & 255, (k >> 8) & 255, k & 255) for k in keys]
    print('palette slots: %d' % len(palette))

    pal_arr = np.array(palette, dtype=np.int32)
    slot_of = {}

    def slot(rgb):
        hit = slot_of.get(rgb)
        if hit is None:
            d = ((pal_arr - np.array(rgb, dtype=np.int32)) ** 2).sum(1)
            hit = int(np.argmin(d)) + 1
            slot_of[rgb] = hit
        return hit

    # ── emit the data ──
    #
    # The shape is the ACTION LIBRARY model (v8): each crop carries ONE library
    # of animations with stable ids, and `states` maps a state name to the ids
    # it plays.  A state owns nothing, so an action can be shared; here every
    # gif becomes exactly one library entry, referenced by the one state the
    # map put it under.  `name` is the map's gloss and `origin` the gif name,
    # which is also the merge key when this library is imported into 我的创作.
    hexes = ['transparent'] + ['#%02x%02x%02x' % c for c in palette]
    out = [
        '// GENERATED FILE — do not edit by hand.',
        '//',
        '// Produced by:     python3 tools/gen-artwork.py',
        '// Source of truth: assets/*.gif + tools/gif-map.json — BOTH DELETED; this',
        '// file is now hand-maintained.  See tools/gen-artwork.py.',
        '// Human-readable catalog: tools/ARTWORK.md',
        '//',
        '// One LIBRARY ENTRY per gif listed in the map: an action the artwork',
        '// owns, with a stable id.  `states` maps each state to the ids it',
        '// plays, and the renderer picks one of them at random per cycle.',
        '// Each entry records the gif and the frame indices it was built from,',
        '// so it can be traced and re-generated.',
        '',
        "import type { Artwork } from './pet/skins/compose.ts';",
        '',
        'export const WHALE_CHAN: Artwork = {',
        '  palette: [',
    ]
    for i in range(0, len(hexes), 8):
        out.append('    ' + ', '.join("'%s'" % h for h in hexes[i:i + 8]) + ',')
    out.append('  ],')
    out.append('  grids: {')
    for grid, key in ((AVATAR_GRID, 'avatar'), (BODY_GRID, 'frames')):
        out.append('    %d: {' % grid)
        out.append('      // The action library: every animation this crop owns.  States')
        out.append('      // reference these by id, so one action can serve several states.')
        out.append('      library: [')
        used_ids = set()
        for t in takes:
            tid, n = t['gif'], 2
            while tid in used_ids:
                tid = '%s-%d' % (t['gif'], n)
                n += 1
            used_ids.add(tid)
            t['id'] = tid
            ms = max(50, int(round(STATE_CYCLE.get(t['state'], DEFAULT_CYCLE) / FRAMES)))
            out.append('        // %s · assets/%s.gif frames [%s] · %s'
                       % (t['state'], t['gif'],
                          ','.join(map(str, t['picks'])), t['gloss']))
            out.append('        { id: %s, name: %s, origin: %s, frameMs: %d, frames: ['
                       % (js_str(tid), js_str(t['gloss']), js_str(t['gif']), ms))
            for a in t[key]:
                p = pack(a)
                opaque = a[:, :, 3] > 127
                uniq = np.unique(p[opaque])
                mapped = np.array([slot(((int(v) >> 16) & 255, (int(v) >> 8) & 255, int(v) & 255))
                                   for v in uniq], np.uint8)
                at = np.clip(np.searchsorted(uniq, p), 0, len(uniq) - 1)
                out.append('          { rows: [')
                for y in range(a.shape[0]):
                    row = np.where(opaque[y], mapped[at[y]], 0)
                    out.append("            '%s'," % ''.join(TOKENS[v] for v in row.tolist()))
                out.append('          ] },')
            out.append('        ], },')
        out.append('      ],')
        out.append('      // Which library ids each state plays.  A state left out — or')
        out.append('      // listed empty — follows idle.')
        out.append('      states: {')
        by_state = OrderedDict()
        for t in takes:
            by_state.setdefault(t['state'], []).append(t)
        for state, group in by_state.items():
            out.append("        %s: [%s],"
                       % (state, ', '.join(js_str(t['id']) for t in group)))
        out.append('      },')
        out.append('    },')
    out.append('  },')
    out.append('};')
    out.append('')
    out.append("export const ARTWORK: Record<string, Artwork> = { 'whale-chan': WHALE_CHAN };")
    with open(OUT_TS, 'w', encoding='utf8') as fh:
        fh.write('\n'.join(out) + '\n')

    # ── catalog ──
    rows = ['# Artwork catalog (generated)', '',
            'Produced by `python3 tools/gen-artwork.py` from `tools/gif-map.json`',
            'and `assets/*.gif` — both since deleted, so this catalog is a frozen',
            'record rather than a regenerable artifact.', '',
            'Every row is one LIBRARY ENTRY — an action the artwork owns.  The id is',
            'what a state references, so one action can serve several states.', '',
            '| state | id | take | gif | frame indices | meaning |',
            '|---|---|---|---|---|---|']
    for state, group in OrderedDict(
            (s, [t for t in takes if t['state'] == s]) for s in mapping).items():
        for idx, t in enumerate(group):
            rows.append('| `%s` | `%s` | %02d/%d | `%s.gif` | %s | %s |'
                        % (state, t['id'], idx + 1, len(group), t['gif'],
                           ','.join(map(str, t['picks'])), t['gloss']))
    for state, name in missing:
        rows.append('| `%s` | — | — | `%s.gif` | — | **missing file — take skipped** |' % (state, name))
    rows += ['', '## Coverage', '',
             'Body crop: `%s` (a %dpx square in source pixels).  The dock crop is a'
             % (str(BODY_BOX), BODY_GRID),
             '64px square around the head, downscaled 2:1 to %dpx.' % AVATAR_GRID, '']
    if clipped:
        rows.append('These takes draw outside the body crop, so those pixels are clipped:')
        rows.append('')
        for state, name, box in clipped:
            rows.append('- `%s` (%s): content box %s' % (name, state, str(box)))
        rows.append('')
        rows.append('Widen `BODY_BOX` in the generator (and re-run) if one of them matters.')
    else:
        rows.append('Every take fits inside the body crop.')
    with open(OUT_MD, 'w', encoding='utf8') as fh:
        fh.write('\n'.join(rows) + '\n')

    if OUT_PNG:
        cols = 8
        cell = BODY_GRID
        rows_n = (len(takes) + cols - 1) // cols
        sheet = np.zeros((rows_n * cell, cols * cell, 3), np.uint8)
        sheet[:, :] = (28, 30, 42)
        for i, t in enumerate(takes):
            a = t['frames'][0]
            r, c = divmod(i, cols)
            m = a[:, :, 3] > 127
            sheet[r * cell:(r + 1) * cell, c * cell:(c + 1) * cell][m] = a[:, :, :3][m]
        Image.fromarray(sheet).save(OUT_PNG)
        print('wrote %s (contact sheet, %d takes)' % (OUT_PNG, len(takes)))

    print('\nwrote %s (%.1f MB)' % (os.path.relpath(OUT_TS, ROOT), os.path.getsize(OUT_TS) / 1e6))
    print('wrote %s  (%d takes, %d clipped, %d missing)'
          % (os.path.relpath(OUT_MD, ROOT), len(takes), len(clipped), len(missing)))


if __name__ == '__main__':
    main()
