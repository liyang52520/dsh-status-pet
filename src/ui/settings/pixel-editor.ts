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
// ── the PAIRED model (v9) ──
//
// An action is ONE animation with TWO FACES: `cells[32]` (the dock avatar,
// required) and `cells[128]` (the full body, optional — a body-less face is
// rendered as the avatar at an exact 4× upscale, which is why the popup still
// shows something sensible).  The crop switch on the page's tab row therefore
// means "which FACE of THIS ACTION am I drawing", NOT "which library":
//
//   * frame count, `ms`, the per-frame `ms` and 整幅挪动 are SINGLE SOURCE —
//     there is no way to draw four frames for the head and five for the body,
//     and no way for the two faces to drift apart;
//   * 整幅挪动 is authored in AVATAR units and rendered ×4 on the body, so one
//     press is the same hop on both faces (that is what the 128 headroom is
//     for);
//   * 复制一帧 / 空白帧 / 删除帧 act on the ACTION, so both faces stay in step;
//   * 导入 replaces the whole action — both faces, its pace and its name —
//     because an action is one thing and its frame count cannot come from two
//     sources.
//
// The body face is optional: the 128 board shows an empty-state card offering a
// 4× draft drawn from the avatar, a blank grid, or the same draft for every
// action at once, and a body-carrying action can give its 128 face up again
// (the popup falls back to the 4× upscale).
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

import { React, h } from '../../host-deps.ts';
import { GRIDS, AVATAR_GRID, BODY_GRID } from '../../pet/grids.ts';
import { BUILTIN_NAMES, DEFAULT_SKIN, builtinArtwork } from '../../pet/skins/built-ins.ts';
import {
  actionsOf,
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
  cellFor,
  upscaleCell,
  hexPixel,
  pixelAt,
  usedBy,
  hasActionBody,
  overwriteLibraryTake,
  setStateSelection,
  addLibraryTake,
  removeLibraryTake,
  renameLibraryTake,
  replaceLibraryTake,
  replaceFrameCell,
  dropFrameCell,
  TRANSPARENT,
  MAX_LIBRARY,
  MAX_FRAMES,
  DEFAULT_FRAME_MS,
} from '../../pet/skins/store.ts';
import type {
  Action, ActionFrame, CustomArtwork, FrameCells, PropArt,
} from '../../pet/skins/store.ts';
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

/** A face as the board and the thumbnails want it: rows plus an optional
 *  accent.  The same shape a v9 `Cell` has. */
type Face = { rows: string[]; prop?: PropArt };

// The frame clipboard is its own thing: a frame copied from one action and
// pasted into another (or the same one, later).  A frame carries BOTH faces, so
// the clipboard is crop-independent — pasting into a body-carrying action gives
// the pasted frame a 128 face too (see fitFrame).
let clipboard: ActionFrame | null = null;

function blankFace(grid: number): Face {
  return { rows: blankRows(grid) };
}

function cloneFace(face: Face): Face {
  return {
    rows: face.rows.slice(),
    prop: face.prop ? { x: face.prop.x, y: face.prop.y, rows: face.prop.rows.slice() } : undefined,
  };
}

/** The 4× body draft of an avatar face — `upscaleCell`, spelled for this
 *  file's vocabulary (the same picture the popup shows while the action has no
 *  body artwork of its own). */
function upscaleFace(face: Face): Face {
  return upscaleCell(face);
}

/** One frame with, at least, its avatar face — and a body face when the action
 *  carries one, so a new frame never lands half-bodied inside a full-bodied
 *  action. */
function blankFrame(body: boolean): ActionFrame {
  const cells: FrameCells = { [AVATAR_GRID]: blankFace(AVATAR_GRID) };
  if (body) cells[BODY_GRID] = blankFace(BODY_GRID);
  return { cells };
}

function cloneFrame(f: ActionFrame): ActionFrame {
  const cells: FrameCells = { [AVATAR_GRID]: cloneFace(f.cells[AVATAR_GRID]) };
  for (const key of Object.keys(f.cells)) {
    const g = Number(key);
    if (g === AVATAR_GRID) continue;
    const face = f.cells[g];
    if (face) cells[g] = cloneFace(face);
  }
  const out: ActionFrame = { cells };
  if (f.ms !== undefined) out.ms = f.ms;
  if (f.dx) out.dx = f.dx;
  if (f.dy) out.dy = f.dy;
  return out;
}

/** Give a frame the body face an action needs, by 4×-upscaling its avatar
 *  face.  Used by 粘贴 and by the draft buttons: within one ACTION the body is
 *  all-or-nothing. */
function fitFrame(f: ActionFrame, body: boolean): ActionFrame {
  if (!body || f.cells[BODY_GRID]) return f;
  const avatar = f.cells[AVATAR_GRID];
  if (!avatar) return f;
  return { ...f, cells: { ...f.cells, [BODY_GRID]: upscaleFace(avatar) } };
}

/** The face to DRAW for a frame at `grid` — `cellFor`, which is the ONE
 *  definition of "the authored cell, else the avatar's 4× draft" the renderer
 *  and the galleries use too. */
function faceFor(f: ActionFrame, grid: number): Face {
  return cellFor(f, grid);
}

/** The same frames with a materialised (or emptied) body face — the 128 draft
 *  and the blank body, per action. */
function withBodyFace(action: Action, mode: 'draft' | 'blank'): ActionFrame[] {
  return action.frames.map((f) => ({
    ...f,
    cells: {
      ...f.cells,
      [BODY_GRID]: mode === 'draft' ? upscaleFace(f.cells[AVATAR_GRID]) : blankFace(BODY_GRID),
    },
  }));
}

// The artwork for a skin name: the stored custom document, or the built-in
// skin baked into the same (paired) shape.
function artworkFor(name: string): CustomArtwork {
  if (name === 'custom') {
    return loadCustomArtwork() || seedArtworkFrom(DEFAULT_SKIN);
  }
  return seedArtworkFrom(BUILTIN_NAMES.includes(name) ? name : DEFAULT_SKIN);
}

/** Open the studio with `target` on the board when it exists (a jump from
 *  预览 · 按动作), else the first action.  The crop is NOT part of the studio's
 *  state any more: it only decides which FACE of the selected action is drawn,
 *  so switching it never switches the action. */
function loadStudio(target?: string): Studio {
  const name = activeSkin().name;
  const art = artworkFor(name);
  const library = actionsOf(art);
  const wanted = target && library.some((a) => a.id === target) ? target : '';
  return { skinName: name, art, actionId: wanted || (library[0] ? library[0].id : ''), frame: 0 };
}

function FrameThumb(props: { face: Face; palette: string[]; grid: GridKey; active: boolean; label: string; onClick: () => void }) {
  return h('button', {
    type: 'button',
    className: 'status-pet-frame-thumb' + (props.active ? ' active' : ''),
    'aria-pressed': props.active ? 'true' : 'false',
    'aria-label': props.label,
    onClick: props.onClick,
  }, h(FrameCanvas, { frame: props.face, palette: props.palette, grid: props.grid, css: THUMB_CSS }));
}

export function PixelEditor(props: {
  t: (key: string, params?: Record<string, unknown>) => string;
  /** Which FACE the studio draws.  Owned by the page's tab row, so 预览 and
   * 编辑 always agree on the face being looked at / drawn on.  Both faces
   * belong to the SAME action (one library, one frame list). */
  grid?: GridKey;
  /** The action to put on the board when the studio mounts — a jump from
   * 预览 · 按动作.  Absent (the ordinary way in) means the first action. */
  actionId?: string;
}) {
  const t = props.t;
  const grid: GridKey = props.grid === BODY_GRID ? BODY_GRID : AVATAR_GRID;
  const [studio, setStudio] = React.useState<Studio>(() => loadStudio(props.actionId));
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
  // The board is grid×grid cells — 16,384 of them at the 128px face — and a
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
      const first = actionsOf(fresh)[0];
      skinNameRef.current = name;
      artRef.current = fresh;
      undoRef.current = [];
      redoRef.current = [];
      setStudio({ skinName: name, art: fresh, actionId: first ? first.id : '', frame: 0 });
    });
  }, []);

  // A jump from 预览 · 按动作 arrives as a prop while the studio may already be
  // mounted (the mode switch keeps it alive).  Selecting the target must not
  // restart the undo history — it is the same session, different action.
  React.useEffect(() => {
    const want = props.actionId;
    if (!want || want === studio.actionId) return;
    if (!actionsOf(artRef.current).some((a) => a.id === want)) return;
    setStudio({ ...studio, actionId: want, frame: 0 });
  }, [props.actionId]);

  const art = studio.art;
  const isCustom = studio.skinName === 'custom';
  const library = actionsOf(art);
  // The selection SELF-HEALS: deleting the selected action or importing a
  // library must never leave the board pointing at nothing.
  const selectedId = library.some((a) => a.id === studio.actionId)
    ? studio.actionId
    : (library[0] ? library[0].id : '');
  const action = library.find((a) => a.id === selectedId) || null;
  const frames = action ? action.frames : [];
  const frameIdx = Math.min(studio.frame, Math.max(0, frames.length - 1));
  const frame = frames[frameIdx];
  const actionUses = action ? usedBy(art, action.id) : [];
  const spec = GRIDS[AVATAR_GRID];
  const hasBody = !!action && hasActionBody(action);
  // The 128 board is EMPTY when this frame carries no body face: the action is
  // body-less (the normal case — the popup shows the 4× draft) or this one
  // frame is (a hand-written document), and either way the honest thing to show
  // is the card that can create one.
  const faceGap = grid === BODY_GRID && !!action && !(frame && frame.cells[BODY_GRID]);
  const shownFace = frame ? faceFor(frame, grid) : blankFace(grid);
  // 整幅挪动 is authored in AVATAR units (the body renders ×4), so the avatar's
  // headroom is the one ceiling on both boards.
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
  // One option per action: its name, how long its loop is, whether it carries a
  // body face, and who plays it — the sharing read-out, so the compact dropdown
  // still warns what an edit (or a delete) reaches.
  const actionOption = (a: Action, i: number) =>
    actionLabel(a, i)
      + ' · ' + t('settings.actionFrames', { n: a.frames.length })
      + (hasActionBody(a) ? '' : ' · ' + t('settings.noBody'))
      + ' · ' + (usedBy(art, a.id).length
        ? t('settings.usedByN', { n: usedBy(art, a.id).length })
        : t('settings.unusedAction'));

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
    const list = actionsOf(cur);
    const id = list.some((a) => a.id === studio.actionId)
      ? studio.actionId
      : (list[0] ? list[0].id : '');
    const act = list.find((a) => a.id === id) || null;
    return { cur, id, action: act, frames: act ? act.frames : [] };
  }

  // ── the library ──

  function selectAction(id: string) {
    setStudio({ ...studio, actionId: id, frame: 0 });
  }

  /** A fresh, empty action.  `unique` matters: an identical blank already in
   *  the library would otherwise be shared by the dedupe, and the button would
   *  look broken the second time it is pressed.  A new action gets a body face
   *  only when the artwork already carries bodies, so it matches the character
   *  it is joining. */
  function newAction() {
    const { cur, action: act } = current();
    const list = actionsOf(cur);
    if (list.length >= MAX_LIBRARY) return;
    const body = !!act && hasActionBody(act);
    const res = addLibraryTake(cur, { id: '', frameMs: DEFAULT_FRAME_MS, frames: [blankFrame(body)] },
      { unique: true });
    // A library always needs an idle assignment to be valid, so the very first
    // action in an empty library becomes the idle one.
    const next = list.length ? res.art : setStateSelection(res.art, 'idle', [res.id]);
    commit(next, { actionId: res.id, frame: 0 });
  }

  /** Deleting is refused when it would leave the artwork without an idle
   *  action: `validateArtwork` requires one, and a document that fails
   *  validation is dropped on the next read — losing the whole drawing to a
   *  stray click. */
  function canDeleteAction(): boolean {
    const { cur, id } = current();
    if (actionsOf(cur).length <= 1) return false;
    const idle = cur.states.idle || [];
    return !(idle.length <= 1 && idle.includes(id));
  }

  function deleteAction() {
    const { cur, id } = current();
    if (!canDeleteAction()) return;
    const next = removeLibraryTake(cur, id);
    const first = actionsOf(next)[0];
    commit(next, { actionId: first ? first.id : '', frame: 0 });
  }

  /** Renaming is deliberately NOT an undo step: typing a name would otherwise
   *  flood the 50-deep history with one entry per keystroke.  The field is
   *  UNCONTROLLED and commits on blur/Enter for the same reason — a commit
   *  serialises the whole artwork (up to ~15MB once the built-in library is
   *  imported), which is far too much work to do per character.  Its `key` is
   *  the selected id, so choosing another action remounts it with that action's
   *  name instead of leaving the previous one on screen. */
  function renameAction(name: string) {
    const { cur, id } = current();
    if (!id) return;
    const next = renameLibraryTake(cur, id, name);
    artRef.current = next;
    skinNameRef.current = 'custom';
    saveStored({ skin: 'custom', custom: next });
    setStudio({ ...studio, skinName: 'custom', art: next });
  }

  /** 导入: overwrite the action being edited with a chosen one — a built-in
   *  animation, or one of this artwork's OWN actions.
   *
   *  The ID stays, so every state that plays this action keeps playing it; only
   *  the content changes.  That is what makes 导入 the natural way to fill a
   *  slot: 新建动作 → 导入 → draw.  An action is ONE thing, so BOTH FACES come
   *  along, together with its frame count, pace and name — importing a built-in
   *  body into an action that had none is exactly how a full-bodied action is
   *  born.  The source's colours are re-pointed at THIS artwork's palette
   *  (`adoptRows`), because a built-in's slot 7 is not this document's slot 7;
   *  one 撤销 brings the previous drawing back. */
  function importAction(source: Action, srcArt: CustomArtwork, label: string) {
    const { cur, id, action: act } = current();
    if (!act || !id) return;
    let palette = cur.palette;
    const adoptFace = (face: Face): Face => {
      const adopted = adoptRows(face.rows, srcArt.palette, palette);
      palette = adopted.palette;
      let prop: PropArt | undefined;
      if (face.prop) {
        const p = adoptRows(face.prop.rows, srcArt.palette, palette);
        palette = p.palette;
        prop = { ...face.prop, rows: p.rows };
      }
      return prop ? { rows: adopted.rows, prop } : { rows: adopted.rows };
    };
    const frames = source.frames.map((f) => {
      const cells: FrameCells = { [AVATAR_GRID]: adoptFace(f.cells[AVATAR_GRID]) };
      for (const key of Object.keys(f.cells)) {
        const g = Number(key);
        if (g === AVATAR_GRID) continue;
        const face = f.cells[g];
        if (face) cells[g] = adoptFace(face);
      }
      const out: ActionFrame = { cells };
      if (f.ms !== undefined) out.ms = f.ms;
      if (f.dx) out.dx = f.dx;
      if (f.dy) out.dy = f.dy;
      return out;
    });
    commit(
      overwriteLibraryTake({ ...cur, palette }, id, {
        frameMs: source.frameMs,
        frames,
        name: source.name,
        origin: source.origin,
      }),
      { frame: 0 },
    );
    setNotice(t('settings.importedOne', { name: label }));
  }

  // ── the body face (per action) ──

  function generateBodyDraft() {
    const { cur, id, action: act } = current();
    if (!act || !id) return;
    commit(replaceLibraryTake(cur, id, { frameMs: act.frameMs, frames: withBodyFace(act, 'draft') }));
  }

  function blankBody() {
    const { cur, id, action: act } = current();
    if (!act || !id) return;
    commit(replaceLibraryTake(cur, id, { frameMs: act.frameMs, frames: withBodyFace(act, 'blank') }));
  }

  /** …or the same draft for EVERY action, which is what a user with a drawn
   *  avatar library actually wants before touching the body. */
  function generateAllBodies() {
    const { cur } = current();
    let next = cur;
    for (const a of actionsOf(cur)) {
      if (!hasActionBody(a)) next = replaceLibraryTake(next, a.id, { frameMs: a.frameMs, frames: withBodyFace(a, 'draft') });
    }
    commit(next);
    setNotice(t('settings.genBodyAllDone'));
  }

  /** Give this action's 128 face up again: the popup goes back to the avatar at
   *  4×, and nothing else about the action changes. */
  function removeBody() {
    const { cur, id, action: act } = current();
    if (!act || !id) return;
    let next = cur;
    for (let i = 0; i < act.frames.length; i++) next = dropFrameCell(next, id, i, BODY_GRID);
    commit(next);
  }

  // ── frames ──

  function withFrames(nextFrames: ActionFrame[], patch?: Partial<Studio>) {
    const { cur, id, action: act } = current();
    if (!act || !id) return;
    commit(replaceLibraryTake(cur, id, { frameMs: act.frameMs, frames: nextFrames }), patch);
  }

  function addBlankFrame() {
    const { frames: curFrames, action: act } = current();
    if (curFrames.length >= MAX_FRAMES) return;
    const body = !!act && hasActionBody(act);
    withFrames(curFrames.slice(0, frameIdx + 1).concat([blankFrame(body)], curFrames.slice(frameIdx + 1)),
      { frame: frameIdx + 1 });
  }

  function addFrame() {
    const { frames: curFrames, action: act } = current();
    if (curFrames.length >= MAX_FRAMES) return;
    const body = !!act && hasActionBody(act);
    const f = fitFrame(curFrames[Math.min(frameIdx, curFrames.length - 1)], body);
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

  // 整幅挪动 — move this whole frame as one, one AVATAR cell per press (the
  // body renders ×4, so the two faces hop together).  Not a redraw: the pixels
  // are untouched, which is what makes a bob easy.
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
  // studio can do with one is say it exists and drop it — from the FACE whose
  // frame carries it.
  function clearProp() {
    const { cur, id, frames: curFrames } = current();
    const f = curFrames[frameIdx];
    const base = f && f.cells[grid];
    if (!f || !id || !base) return;
    commit(replaceFrameCell(cur, id, frameIdx, grid, { rows: base.rows }));
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
    commit(replaceLibraryTake(cur, id, { frameMs: v, frames: curFrames }));
  }

  // ── clipboard (frames) ──

  function copyFrame() {
    const { frames: curFrames } = current();
    if (!curFrames[frameIdx]) return;
    clipboard = cloneFrame(curFrames[frameIdx]);
    setClipTick((v) => v + 1);
  }

  function paste() {
    if (!clipboard) return;
    const { frames: curFrames, action: act } = current();
    if (curFrames.length >= MAX_FRAMES) return;
    const body = !!act && hasActionBody(act);
    const f = fitFrame(clipboard, body);
    withFrames(curFrames.slice(0, frameIdx + 1).concat([cloneFrame(f)], curFrames.slice(frameIdx + 1)),
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
    const { id, action: act, frames: curFrames } = current();
    if (!act || !id) return;
    const f = curFrames[frameIdx];
    const base = f && f.cells[grid];
    // A face that does not exist is never painted into: the board shows the
    // empty-state card instead (see faceGap), so this is unreachable in the UI —
    // but it must never mint a half face for a hand-written document.
    if (!f || !base) return;
    let palette = cur.palette;
    let tok = TRANSPARENT;
    if (!erasing) {
      const add = findOrAdd(palette, brushes[brushIdx] || '#000000');
      palette = add.palette;
      tok = hexPixel(add.idx);
    }
    const next: Face = { rows: paintCell(base.rows, y, x, tok) };
    if (base.prop) next.prop = base.prop;
    commit(replaceFrameCell({ ...cur, palette }, id, frameIdx, grid, next));
  }

  // Eyedropper: the pixel's colour becomes the current brush's colour.
  function pickColour(y: number, x: number) {
    const f = current().frames[frameIdx];
    const base = f && f.cells[grid];
    if (!base) return;
    const tok = pixelAt(base.rows[y], x);
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
    const first = actionsOf(res.data)[0];
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
  const canPaste = !!clipboard;
  const libraryFull = library.length >= MAX_LIBRARY;
  const faceLabel = t('settings.grid.' + grid);
  const faceProp = frame && frame.cells[grid] ? frame.cells[grid]!.prop : undefined;

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
  // large as the column it lives in, so the 128×128 face is always complete.
  const board = faceGap
    ? h('div', { className: 'status-pet-empty-body' },
        h('div', null, t('settings.emptyBody')),
        h('div', { className: 'status-pet-colors' },
          h('button', { type: 'button', className: miniBtn, onClick: generateBodyDraft }, t('settings.genBody')),
          h('button', { type: 'button', className: miniBtn, onClick: blankBody }, t('settings.blankBody')),
          h('button', {
            type: 'button', className: miniBtn, onClick: generateAllBodies,
            title: t('settings.genBodyAllHint'),
          }, t('settings.genBodyAll')),
        ))
    : h('div', { className: 'status-pet-board-wrap' },
        h('div', { className: 'status-pet-grid' },
          shownFace.rows.map((row, y) => boardRow(row, y))
        ),
        !action
          ? h('div', { className: 'status-pet-takeover' },
              h('button', { type: 'button', className: miniBtn, onClick: newAction }, t('settings.newAction')))
          : null
      );

  // ── 导入 ── the picker.  Two sources — the built-in's library (whale-chan is
  // the only built-in) and this artwork's OWN actions — and NEITHER is filtered
  // by the current face, because an ACTION carries both of them: the thumbnail
  // shows the face you are drawing, and picking a row replaces the whole action.
  // A row is a button (see importAction).  Rows are thumbnails because pixel
  // animations are recognised by eye, and 106 built-in actions need the search
  // box above them.
  function importPanel() {
    const q = importQuery.trim().toLowerCase();
    const matches = (a: Action, i: number) =>
      !q || (actionLabel(a, i) + ' ' + a.origin + ' ' + a.id).toLowerCase().includes(q);
    const builtin = builtinArtwork(DEFAULT_SKIN) || null;
    const groups = [
      { key: 'builtin', label: t('settings.importSource.builtin'), src: builtin, list: builtin ? actionsOf(builtin) : [] },
      { key: 'mine', label: t('settings.importSource.mine'), src: art, list: library },
    ];
    const row = (a: Action, src: CustomArtwork, index: number) => {
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
        h(FrameCanvas, { frame: faceFor(a.frames[0], grid), palette: src.palette, grid, css: ROW_THUMB_CSS }),
        h('span', { className: 'status-pet-library-name' }, text),
        h('span', { className: 'status-pet-library-meta' },
          t('settings.actionFrames', { n: a.frames.length })
            + (hasActionBody(a) ? '' : ' · ' + t('settings.noBody'))
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
      // whole library, plus the ops that belong to an action (its name, and
      // new / delete / import / its body face).  It never mentions a state —
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
        // The body face belongs to the ACTION: it can be drawn, and it can be
        // given up again (the popup then shows the avatar at 4×).
        isCustom && action && hasBody
          ? h('button', {
              type: 'button', className: miniBtn, onClick: removeBody,
              'aria-label': t('settings.removeBody'),
              title: t('settings.removeBodyHint'),
            }, '⊖ ' + t('settings.removeBody'))
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
      // stage only labels the FACE it is showing.
      field('canvas', t('settings.region.canvas'), undefined,
        h('div', { className: 'status-pet-stage' },
          h('div', { className: 'status-pet-stage-cell' },
            h('span', { className: 'status-pet-stage-caption' },
              faceLabel + (grid === BODY_GRID && !hasBody ? ' · ' + t('settings.bodyFromAvatar') : '')),
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
            // is on screen and nothing has to be shuffled.  No `scale` prop:
            // each face lands on its own ratio (32 drawn at 4×, 128 at 1×), so a
            // body-less action previews exactly the 4× draft the popup shows.
            h(PetPreview, {
              skinName: studio.skinName,
              grid: grid,
              takeId: selectedId,
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

      // ── 帧 ── the filmstrip of the SELECTED ACTION (ONE list — both faces
      // share it), the two ways to add a frame, and the ops on the frame LIST.
      // Duplicating the frame you are looking at IS how an animation gets made
      // ("draw one, copy it, nudge it"), so it leads.
      action
        ? field('frames', t('settings.field.frames'), t('settings.region.frames'),
            h('div', { className: 'status-pet-filmstrip' },
              frames.map((f, i) =>
                h(FrameThumb, {
                  key: i,
                  face: faceFor(f, grid),
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
      // Every one of them is SHARED by the two faces, which is the point of the
      // paired model: 「整幅挪动」 is authored in avatar cells and the body renders
      // it ×4, so one press is the same hop on both.
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
            // 整幅挪动 — press an arrow, the whole frame moves one avatar cell
            // (four at the body face).  The label carries the read-out (e.g.
            // 整幅挪动 ↓1) so the current move is visible without any x/y
            // notation.
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
            faceProp
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
