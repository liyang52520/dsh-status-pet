// 编辑 · 按动作 — the pixel studio: everything about ONE library action.
//
// This is the half of 编辑 that DRAWS.  It never asks which state anything
// belongs to, and it never shows a checkbox: the 动作 dropdown picks the one
// action on the board, and the rows below describe that action — 画布 (the
// board + its live preview) → 画笔 (the paint box) → 帧 (the filmstrip) →
// 当前帧 (the selected frame's own numbers).  Assigning a state is the OTHER
// mode of the tab (按状态, `assignments.ts`), and keeping the two apart is the
// whole point: one dropdown decides what is drawn, the other decides what is
// ticked, and neither can be mistaken for the other.
//
// THE LIBRARY MODEL still shapes this file: an ACTION belongs to the artwork,
// not to a state, so this editor edits a shared definition —
//
//   * editing an action that four states play changes all four, on purpose.
//     The preview's caption says 「被 4 个状态在用」 and the delete button asks
//     the same question, so the sharing is VISIBLE instead of surprising;
//   * deleting strips the action from every state that referenced it, and the
//     two deletions that would invalidate the document (the last action, and
//     the only action idle plays) are refused.
//
// Colour model: a pixel stores the colour it was painted with, and the
// artwork's palette is a private dedup table the editor grows on demand
// (`findOrAdd`).  The 画笔 strip is therefore just a set of brushes — editing
// one changes the NEXT stroke, never the board — and there is no palette for
// the user to manage, extend or reset.
//
// The studio FOLLOWS the skin picker: it shows the ACTIVE skin's artwork.
// Built-ins are fully baked; the first stroke forks to 我的创作 automatically.
// Selecting another skin reloads the whole studio.
//
// Progressive disclosure: with only the built-in library imported there is no
// frame UI until an action exists, and the rename field only shows with a
// selected action.

import { React, h } from '../../host-deps.ts';
import { GRIDS, AVATAR_GRID, BODY_GRID, BODY_FALLBACK_SCALE } from '../../pet/grids.ts';
import { BUILTIN_NAMES, DEFAULT_SKIN, builtinArtwork } from '../../pet/skins/built-ins.ts';
import {
  activeSkin,
  onSkinChange,
  saveStored,
  serializeArtwork,
  parseArtworkExport,
  loadCustomArtwork,
  loadBrushes,
  seedArtworkFrom,
  paintCell,
  blankRows,
  findOrAdd,
  adoptRows,
  upscalePixels,
  hexPixel,
  pixelAt,
  usedBy,
  overwriteLibraryTake,
  setStateSelection,
  addLibraryTake,
  removeLibraryTake,
  renameLibraryTake,
  replaceLibraryTake,
  gridArtwork,
  TRANSPARENT,
  MAX_LIBRARY,
  MAX_FRAMES,
  DEFAULT_FRAME_MS,
} from '../../pet/skins/store.ts';
import type { CustomArtwork, Frame, LibraryTake } from '../../pet/skins/store.ts';
import { PetPreview } from '../pet-preview.ts';
import { FrameCanvas, ROW_THUMB_CSS, THUMB_CSS } from './frame-canvas.ts';
import { field } from './field.ts';

type GridKey = typeof AVATAR_GRID | typeof BODY_GRID;

interface Studio {
  skinName: string; // the skin being viewed/edited ('whale-chan' | 'custom')
  art: CustomArtwork;
  /** The library action the board edits — the only thing this mode selects. */
  actionId: string;
  frame: number;
}

type Clip = { kind: 'frame'; grid: GridKey; frame: Frame };

// The frame clipboard is its own thing: a frame copied from one action and
// pasted into another (or the same one, later).
let clipboard: Clip | null = null;

function blankFrame(grid: GridKey): Frame {
  return { rows: blankRows(grid) };
}

function cloneFrame(f: Frame): Frame {
  return { rows: f.rows.slice(), dx: f.dx, dy: f.dy, ms: f.ms };
}

// The artwork for a skin name: the stored custom document, or the built-in
// skin baked into the same shape.
function artworkFor(name: string): CustomArtwork {
  if (name === 'custom') {
    return loadCustomArtwork() || seedArtworkFrom(DEFAULT_SKIN);
  }
  return seedArtworkFrom(BUILTIN_NAMES.includes(name) ? name : DEFAULT_SKIN);
}

/** Open the studio on the crop the page picked, with `target` on the board when
 * it exists there (a jump from 预览 · 按动作), else that crop's first action. */
function loadStudio(grid: GridKey, target?: string): Studio {
  const name = activeSkin().name;
  const art = artworkFor(name);
  const library = gridArtwork(art, grid).library;
  const wanted = target && library.some((a) => a.id === target) ? target : '';
  return { skinName: name, art, actionId: wanted || (library[0] ? library[0].id : ''), frame: 0 };
}

function FrameThumb(props: { frame: Frame; palette: string[]; grid: GridKey; active: boolean; label: string; onClick: () => void }) {
  return h('button', {
    type: 'button',
    className: 'status-pet-frame-thumb' + (props.active ? ' active' : ''),
    'aria-pressed': props.active ? 'true' : 'false',
    'aria-label': props.label,
    onClick: props.onClick,
  }, h(FrameCanvas, { frame: props.frame, palette: props.palette, grid: props.grid, css: THUMB_CSS }));
}

export function PixelEditor(props: {
  t: (key: string, params?: Record<string, unknown>) => string;
  /** Which crop the studio edits.  Owned by the page's tab row, so 预览 and
   * 编辑 always agree on the crop being looked at / drawn on. */
  grid?: GridKey;
  /** The action to put on the board when the studio mounts — a jump from
   * 预览 · 按动作.  Absent (the ordinary way in) means the crop's first action. */
  actionId?: string;
}) {
  const t = props.t;
  const grid: GridKey = props.grid === BODY_GRID ? BODY_GRID : AVATAR_GRID;
  const [studio, setStudio] = React.useState<Studio>(() => loadStudio(grid, props.actionId));
  // The paint box: six free colour wells, persisted.  They are brushes, not
  // palette slots — what a brush paints with is fixed into the pixels.
  const [brushes, setBrushes] = React.useState(() => loadBrushes());
  const [brushIdx, setBrushIdx] = React.useState(0);
  const [erasing, setErasing] = React.useState(false);
  const [ioText, setIoText] = React.useState('');
  const [showIo, setShowIo] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  // The 导入 panel (see importAction): an inline picker, not a dialog, because
  // choosing is a browse-by-thumbnail job and a modal would hide the board you
  // are about to overwrite.
  const [showImport, setShowImport] = React.useState(false);
  const [importQuery, setImportQuery] = React.useState('');
  const [error, setError] = React.useState('');
  const [, setClipTick] = React.useState(0);
  // The synchronous mirror of studio.art — strokes never read a stale copy.
  const artRef = React.useRef(studio.art);
  // Undo history is per mount: opening the studio starts a clean session.
  const undoRef = React.useRef<CustomArtwork[]>([]);
  const redoRef = React.useRef<CustomArtwork[]>([]);
  // Guards the reload-on-skin-change subscription against our own commits
  // (a fork writes custom synchronously, then the event fires).
  const skinNameRef = React.useRef(studio.skinName);
  // ── The board's cell cache ──
  // The board is grid×grid cells — 16,384 of them at the 128px crop — and a
  // stroke replaces exactly ONE row's pixels: `paintCell` keeps every other row
  // string BY IDENTITY.  Caching each row's built cells is therefore what keeps
  // drag-painting cheap at that size (React sees the same element object and
  // skips the whole subtree).  It lives in a ref, so it is per mount and two
  // editors can never share a row; the handlers go through the ref, so a reused
  // row is never a stale closure; and the palette's ARRAY IDENTITY is the
  // invalidation key — a cell's colour is the only thing besides its own row
  // that a built cell depends on.
  const boardRef = React.useRef<{
    paint: (y: number, x: number) => void;
    pick: (y: number, x: number) => void;
    palette: string[] | null;
    rows: Map<string, unknown>;
  }>({ paint: () => {}, pick: () => {}, palette: null, rows: new Map() });

  // Follow the skin picker: another active skin → reload the whole studio.
  React.useEffect(() => {
    return onSkinChange(() => {
      const name = activeSkin().name;
      if (name === skinNameRef.current) return; // our own commit
      const fresh = artworkFor(name);
      const first = gridArtwork(fresh, grid).library[0];
      skinNameRef.current = name;
      artRef.current = fresh;
      undoRef.current = [];
      redoRef.current = [];
      setStudio({ skinName: name, art: fresh, actionId: first ? first.id : '', frame: 0 });
    });
  }, [grid]);

  // A jump from 预览 · 按动作 arrives as a prop while the studio may already be
  // mounted (the mode switch keeps it alive).  Selecting the target must not
  // restart the undo history — it is the same session, different action.
  React.useEffect(() => {
    const want = props.actionId;
    if (!want || want === studio.actionId) return;
    if (!gridArtwork(artRef.current, grid).library.some((a) => a.id === want)) return;
    setStudio({ ...studio, actionId: want, frame: 0 });
  }, [props.actionId]);

  const art = studio.art;
  const isCustom = studio.skinName === 'custom';
  const gridArt = gridArtwork(art, grid);
  const library = gridArt.library;
  // The selection SELF-HEALS: switching crop, deleting the selected action or
  // importing a library must never leave the board pointing at nothing.
  const selectedId = library.some((a) => a.id === studio.actionId)
    ? studio.actionId
    : (library[0] ? library[0].id : '');
  const action = library.find((a) => a.id === selectedId) || null;
  const frames = action ? action.frames : [];
  const frameIdx = Math.min(studio.frame, Math.max(0, frames.length - 1));
  const frame = frames[frameIdx];
  const actionUses = action ? usedBy(art, grid, action.id) : [];
  const spec = GRIDS[grid];
  const bodyEmpty = !art.grids[BODY_GRID];
  const offX = frame ? frame.dx || 0 : 0;
  const offY = frame ? frame.dy || 0 : 0;
  const moved = offX !== 0 || offY !== 0;
  // "↓1 ←2" — the same arrow vocabulary as the pad, no x/y jargon
  const offsetReadout = () =>
    !moved ? ''
      : ' ' + (offY < 0 ? '↑' + -offY : offY > 0 ? '↓' + offY : '')
        + (offX < 0 ? '←' + -offX : offX > 0 ? '→' + offX : '');
  const actionLabel = (a: { id: string; name?: string }, i: number) =>
    a.name || t('settings.actionN', { n: i + 1 });
  // One option per action: its name, how long its loop is, and who plays it —
  // the sharing read-out, so the compact dropdown still warns what an edit (or
  // a delete) reaches.
  const actionOption = (a: (typeof library)[number], i: number) => {
    const used = usedBy(art, grid, a.id);
    return actionLabel(a, i)
      + ' · ' + t('settings.actionFrames', { n: a.frames.length })
      + ' · ' + (used.length
        ? t('settings.usedByN', { n: used.length })
        : t('settings.unusedAction'));
  };

  function commit(nextArt: CustomArtwork, patch?: Partial<Studio>) {
    undoRef.current.push(artRef.current);
    if (undoRef.current.length > 50) undoRef.current.shift();
    redoRef.current.length = 0;
    artRef.current = nextArt;
    // Mark the fork BEFORE the event fires, so the subscription ignores it.
    skinNameRef.current = 'custom';
    saveStored({ skin: 'custom', custom: nextArt });
    setStudio({ ...studio, skinName: 'custom', art: nextArt, ...patch });
    setError('');
    setNotice('');
  }

  function undo() {
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current.push(artRef.current);
    artRef.current = prev;
    saveStored({ skin: 'custom', custom: prev });
    setStudio({ ...studio, skinName: 'custom', art: prev, frame: 0 });
  }

  function redo() {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(artRef.current);
    artRef.current = next;
    saveStored({ skin: 'custom', custom: next });
    setStudio({ ...studio, skinName: 'custom', art: next, frame: 0 });
  }

  // The live selection at CALL TIME (never the render closure, so rapid
  // repeated clicks and drag strokes never read stale data).
  function current() {
    const cur = artRef.current;
    const g = gridArtwork(cur, grid);
    const id = g.library.some((a) => a.id === studio.actionId)
      ? studio.actionId
      : (g.library[0] ? g.library[0].id : '');
    const act = g.library.find((a) => a.id === id) || null;
    return { cur, g, id, action: act, frames: act ? act.frames : [] };
  }

  // ── the library ──

  function selectAction(id: string) {
    setStudio({ ...studio, actionId: id, frame: 0 });
  }

  /** A fresh, empty action.  `unique` matters: an identical blank already in
   * the library would otherwise be shared by the dedupe, and the button would
   * look broken the second time it is pressed. */
  function newAction() {
    const { cur, g } = current();
    if (g.library.length >= MAX_LIBRARY) return;
    const res = addLibraryTake(cur, grid, { frameMs: DEFAULT_FRAME_MS, frames: [blankFrame(grid)] },
      { unique: true });
    let next = res.art;
    // A library always needs the avatar grid's idle assignment to be valid, so
    // the very first action in an empty library becomes the idle one.
    if (!g.library.length && grid === AVATAR_GRID) next = setStateSelection(next, grid, 'idle', [res.id]);
    commit(next, { actionId: res.id, frame: 0 });
  }

  /** Deleting is refused when it would leave the crop without an idle action:
   * `validateArtwork` requires one, and a document that fails validation is
   * dropped on the next read — losing the whole drawing to a stray click. */
  function canDeleteAction(): boolean {
    const { g, id } = current();
    if (g.library.length <= 1) return false;
    const idle = g.states.idle || [];
    return !(idle.length <= 1 && idle.includes(id));
  }

  function deleteAction() {
    const { cur, id } = current();
    if (!canDeleteAction()) return;
    const next = removeLibraryTake(cur, grid, id);
    const first = gridArtwork(next, grid).library[0];
    commit(next, { actionId: first ? first.id : '', frame: 0 });
  }

  /** Renaming is deliberately NOT an undo step: typing a name would otherwise
   * flood the 50-deep history with one entry per keystroke.  The field is
   * UNCONTROLLED and commits on blur/Enter for the same reason — a commit
   * serialises the whole artwork (up to ~15MB once the built-in library is
   * imported), which is far too much work to do per character.  Its `key` is
   * the selected id, so choosing another action remounts it with that action's
   * name instead of leaving the previous one on screen. */
  function renameAction(name: string) {
    const { cur, id } = current();
    if (!id) return;
    const next = renameLibraryTake(cur, grid, id, name);
    artRef.current = next;
    skinNameRef.current = 'custom';
    saveStored({ skin: 'custom', custom: next });
    setStudio({ ...studio, skinName: 'custom', art: next });
  }

  /** 导入: overwrite the action being edited with a chosen one — a built-in
   * animation, or one of this artwork's OWN actions at this crop (the two crops
   * are isolated: a 128px frame is not a 32px frame).
   *
   * The ID stays, so every state that plays this action keeps playing it; only
   * the content changes.  That is what makes 导入 the natural way to fill a
   * slot: 新建动作 → 导入 → draw.  The source's colours are re-pointed at THIS
   * artwork's palette (`adoptRows`), because a built-in's slot 7 is not this
   * document's slot 7; one 撤销 brings the previous drawing back. */
  function importAction(source: LibraryTake, srcArt: CustomArtwork, label: string) {
    const { cur, id, action: act } = current();
    if (!act || !id) return;
    let palette = cur.palette;
    const frames = source.frames.map((f) => {
      const body = adoptRows(f.rows, srcArt.palette, palette);
      palette = body.palette;
      const prop = f.prop ? adoptRows(f.prop.rows, srcArt.palette, palette) : null;
      if (prop) palette = prop.palette;
      return {
        ...f,
        rows: body.rows,
        prop: prop && f.prop ? { ...f.prop, rows: prop.rows } : undefined,
      };
    });
    commit(
      overwriteLibraryTake({ ...cur, palette }, grid, id, {
        frameMs: source.frameMs,
        frames,
        name: source.name,
        origin: source.origin,
      }),
      { frame: 0 },
    );
    setNotice(t('settings.importedOne', { name: label }));
  }

  function generateBodyDraft() {
    const src = gridArtwork(art, AVATAR_GRID);
    if (!src.library.length) return;
    // Ids carry over, so switching the crop switch keeps editing the same
    // action — the two crops are one character.
    const libraryNext = src.library.map((t2) => ({
      id: t2.id,
      name: t2.name,
      origin: t2.origin,
      frameMs: t2.frameMs,
      frames: t2.frames.map((f) => ({
        rows: upscalePixels(f.rows, BODY_FALLBACK_SCALE),
        dx: f.dx === undefined ? undefined : f.dx * BODY_FALLBACK_SCALE,
        dy: f.dy === undefined ? undefined : f.dy * BODY_FALLBACK_SCALE,
        ms: f.ms,
      })),
    }));
    const states: Record<string, string[]> = {};
    for (const name of Object.keys(src.states)) states[name] = src.states[name].slice();
    commit({ ...art, grids: { ...art.grids, [BODY_GRID]: { library: libraryNext, states } } });
  }

  function blankBody() {
    commit({
      ...art,
      grids: {
        ...art.grids,
        [BODY_GRID]: {
          library: [{ id: 'blank', frameMs: DEFAULT_FRAME_MS, frames: [blankFrame(BODY_GRID)] }],
          states: { idle: ['blank'] },
        },
      },
    });
  }

  // ── frames ──

  function withFrames(nextFrames: Frame[], patch?: Partial<Studio>) {
    const { cur, id, action: act } = current();
    if (!act || !id) return;
    commit(replaceLibraryTake(cur, grid, id, { frameMs: act.frameMs, frames: nextFrames }), patch);
  }

  function addBlankFrame() {
    const { frames: curFrames } = current();
    if (curFrames.length >= MAX_FRAMES) return;
    withFrames(curFrames.slice(0, frameIdx + 1).concat([blankFrame(grid)], curFrames.slice(frameIdx + 1)),
      { frame: frameIdx + 1 });
  }

  function addFrame() {
    const { frames: curFrames } = current();
    if (curFrames.length >= MAX_FRAMES) return;
    const f = curFrames[Math.min(frameIdx, curFrames.length - 1)];
    withFrames(curFrames.slice(0, frameIdx + 1).concat([cloneFrame(f)], curFrames.slice(frameIdx + 1)),
      { frame: frameIdx + 1 });
  }

  function deleteFrame() {
    const { frames: curFrames } = current();
    if (curFrames.length <= 1) return;
    withFrames(curFrames.filter((_, i) => i !== frameIdx), { frame: Math.max(0, frameIdx - 1) });
  }

  function moveFrame(dir: -1 | 1) {
    const { frames: curFrames } = current();
    const j = frameIdx + dir;
    if (j < 0 || j >= curFrames.length) return;
    const next = curFrames.slice();
    next[frameIdx] = next[j];
    next[j] = curFrames[frameIdx];
    withFrames(next, { frame: j });
  }

  // 整幅挪动 — move this whole frame as one, one grid cell per press.  Not a
  // redraw: the pixels are untouched, which is what makes a bob easy.
  function setOffset(axis: 'dx' | 'dy', v: number) {
    const clamped = Math.max(-spec.maxOffset, Math.min(spec.maxOffset, Math.round(v) || 0));
    const { frames: curFrames } = current();
    withFrames(curFrames.map((f, i) =>
      i === frameIdx ? { ...f, [axis]: clamped === 0 ? undefined : clamped } : f));
  }

  function nudgeOffset(axis: 'dx' | 'dy', delta: number) {
    const cur = frame ? (frame[axis] || 0) : 0;
    setOffset(axis, cur + delta);
  }

  function resetOffset() {
    const { frames: curFrames } = current();
    withFrames(curFrames.map((f, i) =>
      i === frameIdx ? { ...f, dx: undefined, dy: undefined } : f));
  }

  // An accent imported with a built-in action rides OVER the body: it is not
  // part of the board (the studio paints `rows`), so the only honest thing the
  // studio can do with one is say it exists and drop it.
  function clearProp() {
    const { frames: curFrames } = current();
    withFrames(curFrames.map((f, i) => (i === frameIdx ? { ...f, prop: undefined } : f)));
  }

  function setFrameMs(v: number) {
    if (!Number.isFinite(v) || v <= 0) return;
    const { frames: curFrames } = current();
    withFrames(curFrames.map((f, i) => (i === frameIdx ? { ...f, ms: v } : f)));
  }

  function setActionMs(v: number) {
    if (!Number.isFinite(v) || v <= 0) return;
    const { cur, id, action: act, frames: curFrames } = current();
    if (!act || !id) return;
    commit(replaceLibraryTake(cur, grid, id, { frameMs: v, frames: curFrames }));
  }

  // ── clipboard (frames) ──

  function copyFrame() {
    clipboard = { kind: 'frame', grid, frame: cloneFrame(current().frames[frameIdx]) };
    setClipTick((v) => v + 1);
  }

  function paste() {
    if (!clipboard || clipboard.grid !== grid) return;
    if (clipboard.kind !== 'frame') return;
    const { frames: curFrames } = current();
    if (curFrames.length >= MAX_FRAMES) return;
    withFrames(curFrames.slice(0, frameIdx + 1).concat([cloneFrame(clipboard.frame)], curFrames.slice(frameIdx + 1)),
      { frame: frameIdx + 1 });
  }

  // ── pixels ──
  //
  // A pixel stores the COLOUR it was painted with, not a reference to a brush:
  // the artwork's palette is a private dedup table that grows as needed.  So
  // changing a brush later cannot repaint anything — there is no operation that
  // would.

  function applyPaint(y: number, x: number) {
    const cur = artRef.current;
    let palette = cur.palette;
    let tok = TRANSPARENT;
    if (!erasing) {
      const add = findOrAdd(palette, brushes[brushIdx] || '#000000');
      palette = add.palette;
      tok = hexPixel(add.idx);
    }
    const { id, action: act, frames: curFrames } = current();
    if (!act || !id) return;
    const nextFrames = curFrames.map((f, i) =>
      i === frameIdx ? { ...f, rows: paintCell(f.rows, y, x, tok) } : f);
    commit(replaceLibraryTake({ ...cur, palette }, grid, id, { frameMs: act.frameMs, frames: nextFrames }));
  }

  // Eyedropper: the pixel's colour becomes the current brush's colour.
  function pickColour(y: number, x: number) {
    if (!frame) return;
    const tok = pixelAt(frame.rows[y], x);
    if (tok === TRANSPARENT) { setErasing(true); return; }
    const colour = artRef.current.palette[parseInt(tok, 16)];
    if (colour) setBrush(brushIdx, colour);
  }

  // ── the paint box ──
  // Six free colour wells.  Editing one is local to the brush: it changes what
  // the NEXT stroke paints with, and nothing already on the board.

  function saveBrushes(next: string[]) {
    setBrushes(next);
    saveStored({ brushes: next });
  }

  function setBrush(i: number, value: string) {
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) return;
    const next = brushes.slice();
    next[i] = value.toLowerCase();
    setErasing(false);
    setBrushIdx(i);
    saveBrushes(next);
  }

  // ── import / export ──

  function doExport() {
    setIoText(serializeArtwork(art));
    setError('');
  }

  function doImport() {
    const res = parseArtworkExport(ioText);
    if (res.errors) {
      setError(t('settings.importError'));
      return;
    }
    const first = gridArtwork(res.data, grid).library[0];
    commit(res.data, { actionId: first ? first.id : '', frame: 0 });
  }

  // ── keyboard: mod+z / mod+shift+z ──

  function onKeyDown(e: { key?: string; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; preventDefault?: () => void }) {
    if (!(e.metaKey || e.ctrlKey) || (e.key || '').toLowerCase() !== 'z') return;
    if (e.preventDefault) e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  }

  // ── render ──

  const miniBtn = 'status-pet-mini-button';
  const canPaste = clipboard && clipboard.grid === grid;
  const libraryFull = library.length >= MAX_LIBRARY;

  // Point the cache at THIS render's mutators, and drop it when the palette
  // array is replaced (a new colour, a seed, an import): a built cell's colour
  // is the one thing it cannot re-check by itself.
  boardRef.current.paint = applyPaint;
  boardRef.current.pick = pickColour;
  if (boardRef.current.palette !== art.palette) {
    boardRef.current.palette = art.palette;
    boardRef.current.rows.clear();
  }

  // Build (or reuse) one board row.  The whole row element is cached — cells
  // included — so React sees an identical element for every row the stroke did
  // not touch and skips that subtree entirely.  The handlers call through
  // `cache`, so a row built several strokes ago still paints into the CURRENT
  // action.
  function boardRow(row: string, y: number): unknown {
    const cache = boardRef.current;
    const key = y + ':' + row;
    const hit = cache.rows.get(key);
    if (hit) return hit;
    const cells = Array.from({ length: grid }, (_, x) => {
      const tok = pixelAt(row, x);
      const idx = tok === TRANSPARENT ? 0 : parseInt(tok, 16);
      return h('div', {
        key: x,
        className: 'status-pet-cell',
        // The cell is sized by the board, never by a pixel constant:
        // a fixed cell size is exactly what clipped the canvas.
        style: { background: idx === 0 ? 'transparent' : art.palette[idx] },
        onPointerDown: (e: { button?: number }) => {
          if (e && e.button === 2) cache.pick(y, x);
          else cache.paint(y, x);
        },
        onContextMenu: (e: { preventDefault?: () => void }) => {
          if (e && e.preventDefault) e.preventDefault();
        },
        onPointerEnter: (e: { buttons?: number }) => {
          if (e && (e.buttons ?? 0) >= 1) cache.paint(y, x);
        },
      });
    });
    const built = h('div', { className: 'status-pet-grid-row', key: y }, cells);
    // Two frames' worth of rows is plenty: they are only reused when stepping
    // back and forth, and the cache must not grow without bound.
    if (cache.rows.size > 256) cache.rows.clear();
    cache.rows.set(key, built);
    return built;
  }

  // The board (or the empty-body card) — a square that can only ever be as
  // large as the column it lives in, so the 128×128 crop is always complete.
  const board = grid === BODY_GRID && bodyEmpty
    ? h('div', { className: 'status-pet-empty-body' },
        h('div', null, t('settings.emptyBody')),
        h('div', { className: 'status-pet-colors' },
          h('button', { type: 'button', className: miniBtn, onClick: generateBodyDraft }, t('settings.genBody')),
          h('button', { type: 'button', className: miniBtn, onClick: blankBody }, t('settings.blankBody')),
        ))
    : h('div', { className: 'status-pet-board-wrap' },
        h('div', { className: 'status-pet-grid' },
          (frame ? frame.rows : blankRows(grid)).map((row, y) => boardRow(row, y))
        ),
        !action
          ? h('div', { className: 'status-pet-takeover' },
              h('button', { type: 'button', className: miniBtn, onClick: newAction }, t('settings.newAction')))
          : null
      );

  // ── 导入 ── the picker.  Two sources, both at THIS crop: the built-in's
  // library (whale-chan is the only built-in) and this artwork's OWN actions —
  // the crops are isolated, so a 128px frame is never offered to a 32px board.
  // A row is a button; clicking it overwrites the action being edited (see
  // importAction).  Rows are thumbnails because pixel animations are recognised
  // by eye, and 106 built-in actions need the search box above them.
  function importPanel() {
    const q = importQuery.trim().toLowerCase();
    const matches = (a: LibraryTake, i: number) =>
      !q || (actionLabel(a, i) + ' ' + a.origin + ' ' + a.id).toLowerCase().includes(q);
    const builtin = builtinArtwork(DEFAULT_SKIN) || null;
    const builtinLibrary = builtin ? gridArtwork(builtin, grid).library : [];
    const groups = [
      { key: 'builtin', label: t('settings.importSource.builtin'), src: builtin, list: builtinLibrary },
      { key: 'mine', label: t('settings.importSource.mine'), src: art, list: library },
    ];
    const row = (a: LibraryTake, src: CustomArtwork, index: number) => {
      const text = actionLabel(a, index);
      const current = src === art && !!action && a.id === action.id;
      return h('button', {
        key: (src === art ? 'mine:' : 'builtin:') + a.id,
        type: 'button',
        className: 'status-pet-library-row status-pet-import-row',
        'aria-label': text,
        title: a.origin ? text + ' · ' + a.origin : text,
        onClick: () => importAction(a, src, text),
      },
        h(FrameCanvas, { frame: a.frames[0], palette: src.palette, grid, css: ROW_THUMB_CSS }),
        h('span', { className: 'status-pet-library-name' }, text),
        h('span', { className: 'status-pet-library-meta' },
          t('settings.actionFrames', { n: a.frames.length })
            + (current ? ' · ' + t('settings.importCurrent') : ''))
      );
    };
    const shown = groups.map((g) => {
      const list = g.src ? g.list.filter(matches) : [];
      if (!g.src || !list.length) return null;
      return h('div', { key: g.key, className: 'status-pet-import-group' },
        h('div', { className: 'status-pet-import-group-title' }, g.label),
        h('div', { className: 'status-pet-import-list' },
          list.map((a) => row(a, g.src as CustomArtwork, g.list.indexOf(a))))
      );
    });
    return h('div', { className: 'status-pet-import' },
      h('input', {
        type: 'search',
        className: 'status-pet-import-search',
        value: importQuery,
        placeholder: t('settings.importSearch'),
        'aria-label': t('settings.importSearch'),
        onChange: (e: { target: { value: string } }) => setImportQuery(e.target.value),
      }),
      h('div', { className: 'status-pet-import-body' }, ...shown),
      h('div', { className: 'status-pet-hint' }, t('settings.importHint'))
    );
  }

  // No role="tabpanel" here: the PAGE owns the panel for whichever mode the
  // 编辑 tab is showing, so mounting the studio directly never nests two
  // tabpanels (and the keyboard undo handler stays with the board).
  return h('div', { className: 'status-pet-studio', onKeyDown },
    h('div', { className: 'status-pet-canvas-card' },

      // ── 动作 ── WHICH action the board edits: one native dropdown over the
      // crop's whole library, plus the ops that belong to an action (its name,
      // and new / duplicate / delete / import).  It never mentions a state —
      // deciding what a state plays is 按状态's job.
      field('action', t('settings.region.action'), t('settings.actionHint'),
        library.length
          ? h('select', {
              className: 'status-pet-select status-pet-action-select',
              value: selectedId,
              'aria-label': t('settings.region.action'),
              onChange: (e: { target: { value: string } }) => selectAction(e.target.value),
            },
              library.map((a, i) => h('option', { key: a.id, value: a.id }, actionOption(a, i)))
            )
          : h('span', { className: 'status-pet-hint' }, t('settings.emptyLibrary')),
        isCustom
          ? h('button', {
              type: 'button', className: miniBtn, onClick: newAction, disabled: libraryFull,
              'aria-label': t('settings.newAction'),
              title: libraryFull ? t('settings.libraryFull') : t('settings.newAction'),
            }, '+ ' + t('settings.newAction'))
          : null,
        isCustom && action
          ? h('button', {
              type: 'button', className: miniBtn, onClick: deleteAction, disabled: !canDeleteAction(),
              'aria-label': t('settings.deleteAction'),
              title: actionUses.length
                ? t('settings.deleteUsed', { n: actionUses.length })
                : t('settings.deleteAction'),
            }, '× ' + t('settings.deleteAction'))
          : null,
        isCustom && action
          ? h('div', { className: 'status-pet-num-field' },
              h('span', { className: 'status-pet-prop-label', title: t('settings.actionNameHint') },
                t('settings.actionName')),
              h('input', {
                // The key carries the NAME as well as the id: an import
                // rewrites the name while the id stays, and an uncontrolled
                // input would otherwise keep showing the old one.
                key: selectedId + '|' + (action.name || ''),
                type: 'text',
                className: 'status-pet-number status-pet-action-name',
                defaultValue: action.name || '',
                maxLength: 40,
                placeholder: t('settings.actionN', { n: library.indexOf(action) + 1 }),
                'aria-label': t('settings.actionName'),
                onBlur: (e: { target: { value: string } }) => renameAction(e.target.value),
                onKeyDown: (e: { key?: string; target?: { blur?: () => void } }) => {
                  if (e.key === 'Enter' && e.target && e.target.blur) e.target.blur();
                },
              }))
          : null,
        isCustom && action
          ? h('button', {
              type: 'button',
              className: miniBtn + (showImport ? ' active' : ''),
              'aria-expanded': showImport ? 'true' : 'false',
              'aria-label': t('settings.importAction'),
              title: t('settings.importHint'),
              onClick: () => { setShowImport(!showImport); setImportQuery(''); },
            }, '⤓ ' + t('settings.importAction'))
          : null,
        showImport && action ? importPanel() : null,
      ),

      // ── 画布 ── the board and, beside it, the ACTION's live preview.  The crop
      // switch stays on the page's tab row (it belongs to both tabs), so the
      // stage only labels the crop it is showing.
      field('canvas', t('settings.region.canvas'), undefined,
        h('div', { className: 'status-pet-stage' },
          h('div', { className: 'status-pet-stage-cell' },
            h('span', { className: 'status-pet-stage-caption' }, t('settings.grid.' + grid)),
            board
          ),
          h('div', { className: 'status-pet-stage-cell status-pet-inspect' },
            h('span', { className: 'status-pet-stage-caption' },
              t('settings.region.preview')
                + (action
                    ? ' · ' + (actionUses.length
                      ? t('settings.usedByN', { n: actionUses.length })
                      : t('settings.unusedAction'))
                    : '')),
            // The board edits ONE action, so the preview pins it: nothing else
            // is on screen and nothing has to be shuffled.
            h(PetPreview, {
              skinName: studio.skinName,
              grid: grid,
              takeId: selectedId,
              scale: grid === BODY_GRID ? 1 : 4,
              interactive: false,
            })
          )
        )
      ),

      // ── 画笔 ── the paint box.  Each well IS a brush: click it to paint with
      // it, click the well again to change its colour (native picker).  What a
      // brush paints with is baked into the pixels, so editing a brush never
      // touches the board, and there is nothing to add or reset.
      field('brushes', t('settings.region.palette'), undefined,
        h('button', {
          key: 'eraser',
          type: 'button',
          className: 'status-pet-swatch status-pet-swatch-picker' + (erasing ? ' active' : ''),
          'aria-label': t('settings.eraser'),
          'aria-pressed': erasing ? 'true' : 'false',
          title: t('settings.eraser'),
          style: { background: 'transparent' },
          onClick: () => setErasing(true),
        }, '×'),
        brushes.map((colour, i) =>
          h('input', {
            key: i,
            type: 'color',
            className: 'status-pet-swatch status-pet-swatch-picker'
              + (!erasing && brushIdx === i ? ' active' : ''),
            value: colour,
            'aria-label': t('settings.brushN', { n: i + 1 }),
            title: t('settings.brushN', { n: i + 1 }),
            onClick: () => { setErasing(false); setBrushIdx(i); },
            onChange: (e: { target: { value: string } }) => setBrush(i, e.target.value),
          })
        )
      ),

      // ── 帧 ── the filmstrip of the SELECTED ACTION, the two ways to add a
      // frame, and the ops on the frame LIST.  Duplicating the frame you are
      // looking at IS how an animation gets made ("draw one, copy it, nudge
      // it"), so it leads.
      action
        ? field('frames', t('settings.field.frames'), t('settings.region.frames'),
            h('div', { className: 'status-pet-filmstrip' },
              frames.map((f, i) =>
                h(FrameThumb, {
                  key: i,
                  frame: f,
                  palette: art.palette,
                  grid: grid,
                  active: i === frameIdx,
                  label: t('settings.frameN', { n: i + 1 }),
                  onClick: () => setStudio({ ...studio, frame: i }),
                })
              ),
              frames.length < MAX_FRAMES
                ? h('button', {
                    type: 'button', className: miniBtn,
                    'aria-label': t('settings.addFrame'), title: t('settings.addFrame'),
                    onClick: addFrame,
                  }, '⧉ ' + t('settings.addFrame'))
                : null,
              frames.length < MAX_FRAMES
                ? h('button', {
                    type: 'button', className: miniBtn,
                    'aria-label': t('settings.addBlankFrame'), title: t('settings.addBlankFrame'),
                    onClick: addBlankFrame,
                  }, '+ ' + t('settings.addBlankFrame'))
                : null,
            ),
            h('div', { className: 'status-pet-frame-nav' },
              frames.length > 1
                ? h('button', { type: 'button', className: miniBtn, onClick: deleteFrame }, '× ' + t('settings.delFrame'))
                : null,
              h('button', { type: 'button', className: miniBtn, 'aria-label': t('settings.framePrev'), title: t('settings.framePrev'), onClick: () => moveFrame(-1) }, '←'),
              h('button', { type: 'button', className: miniBtn, 'aria-label': t('settings.frameNext'), title: t('settings.frameNext'), onClick: () => moveFrame(1) }, '→'),
              // one button, one honest label: what is on the clipboard decides
              canPaste && frames.length < MAX_FRAMES
                ? h('button', { type: 'button', className: miniBtn, title: t('settings.paste'), onClick: paste }, t('settings.paste'))
                : (frames.length < MAX_FRAMES
                    ? h('button', { type: 'button', className: miniBtn, title: t('settings.copyFrame'), onClick: copyFrame }, t('settings.copyFrame'))
                    : null),
            )
          )
        : null,

      // ── 当前帧 ── the selected frame's own numbers: how long it is shown, and
      // where the whole frame sits (整幅挪动 — the pixels are never redrawn).
      action && frame
        ? field('frame', t('settings.region.frame'), undefined,
            h('div', { className: 'status-pet-num-field' },
              h('span', { className: 'status-pet-prop-label' }, t('settings.frameLen')),
              h('input', {
                type: 'number', className: 'status-pet-number',
                value: String(frame.ms ?? action.frameMs), min: 50, max: 5000, step: 50,
                'aria-label': t('settings.frameLen'),
                onChange: (e: { target: { value: string } }) => setFrameMs(Number(e.target.value)),
              }),
              h('span', { className: 'status-pet-hint' }, t('settings.frameMs'))
            ),
            // The action's own pace: one number shared by every state that
            // plays it — a shared action cannot tick at four speeds, and
            // pretending otherwise is how "why did my other state change"
            // starts.
            h('div', { className: 'status-pet-num-field' },
              h('span', { className: 'status-pet-prop-label', title: t('settings.actionMsHint') },
                t('settings.actionMs')),
              h('input', {
                type: 'number', className: 'status-pet-number',
                value: String(action.frameMs), min: 50, max: 5000, step: 50,
                'aria-label': t('settings.actionMs'),
                onChange: (e: { target: { value: string } }) => setActionMs(Number(e.target.value)),
              }),
              h('span', { className: 'status-pet-hint' }, t('settings.frameMs'))
            ),
            // 整幅挪动 — press an arrow, the whole frame moves one cell.  The
            // label carries the read-out (e.g. 整幅挪动 ↓1) so the current move
            // is visible without any x/y notation.
            h('span', { className: 'status-pet-prop-label', title: t('settings.frameOffsetHint') },
              t('settings.frameOffset') + offsetReadout()),
            h('div', { className: 'status-pet-nudge' },
              h('span', null),
              h('button', { type: 'button', className: miniBtn, 'aria-label': t('settings.moveUp'), title: t('settings.moveUp'), onClick: () => nudgeOffset('dy', -1) }, '↑'),
              h('span', null),
              h('button', { type: 'button', className: miniBtn, 'aria-label': t('settings.moveLeft'), title: t('settings.moveLeft'), onClick: () => nudgeOffset('dx', -1) }, '←'),
              h('button', { type: 'button', className: miniBtn, 'aria-label': t('settings.moveDown'), title: t('settings.moveDown'), onClick: () => nudgeOffset('dy', 1) }, '↓'),
              h('button', { type: 'button', className: miniBtn, 'aria-label': t('settings.moveRight'), title: t('settings.moveRight'), onClick: () => nudgeOffset('dx', 1) }, '→'),
            ),
            moved
              ? h('button', { type: 'button', className: miniBtn, title: t('settings.offsetReset'), onClick: resetOffset }, t('settings.offsetReset'))
              : null,
            // An imported accent (see clearProp): visible in the filmstrip and
            // the preview, invisible on the board — so it gets a row of its own.
            frame.prop
              ? h('div', { className: 'status-pet-num-field' },
                  h('span', { className: 'status-pet-prop-label', title: t('settings.framePropHint') },
                    t('settings.frameProp')),
                  h('button', {
                    type: 'button', className: miniBtn,
                    'aria-label': t('settings.framePropClear'),
                    title: t('settings.framePropHint'),
                    onClick: clearProp,
                  }, t('settings.framePropClear')))
              : null
          )
        : null,
    ),

    // ── footer: undo/redo + the IO fold ──
    h('div', { className: 'status-pet-footer' },
      h('button', { type: 'button', className: miniBtn, 'aria-label': t('settings.undo'), onClick: undo }, '↶ ' + t('settings.undo')),
      h('button', { type: 'button', className: miniBtn, 'aria-label': t('settings.redo'), onClick: redo }, '↷ ' + t('settings.redo')),
      h('button', {
        type: 'button', className: miniBtn, 'aria-expanded': showIo ? 'true' : 'false',
        'aria-label': t('settings.io'),
        onClick: () => setShowIo(!showIo),
      }, t('settings.io')),
    ),
    showIo
      ? h('div', null,
          h('textarea', {
            className: 'status-pet-io',
            value: ioText,
            'aria-label': t('settings.io'),
            onChange: (e: { target: { value: string } }) => setIoText(e.target.value),
          }),
          h('div', { className: 'status-pet-colors' },
            h('button', { type: 'button', className: miniBtn, onClick: doExport }, t('settings.export')),
            h('button', { type: 'button', className: miniBtn, onClick: doImport }, t('settings.import')),
          ))
      : null,
    notice ? h('div', { className: 'status-pet-hint' }, notice) : null,
    error ? h('div', { className: 'status-pet-error' }, error) : null,
  );
}
