// 编辑 · 按动作 — the pixel studio: everything about ONE library action.
//
// This is the half of 编辑 that DRAWS.  It never asks which state anything
// belongs to, and it never shows a checkbox: the 动作 dropdown picks the one
// action on the board, and the rows below describe that action — 画布 (the
// board + its live preview) → 帧 (the filmstrip) → 画笔 (the paint box) →
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
// shows something sensible).  The 头像 / 全身 switch on the canvas row therefore
// means "which FACE of THIS ACTION am I drawing", NOT "which library":
//
//   * frame count, `ms`, the per-frame `ms` and 整幅挪动 are SINGLE SOURCE —
//     there is no way to draw four frames for the head and five for the body,
//     and no way for the two faces to drift apart;
//   * 整幅挪动 is authored in AVATAR units and rendered ×4 on the body, so one
//     press is the same hop on both faces (that is what the 128 headroom is
//     for);
//   * 复制一帧 / 空白帧 / 删除帧 act on the ACTION, so both faces stay in step.
//
// The body face is optional: the 128 board shows an empty-state card offering a
// 4× draft drawn from the avatar, a blank grid, or the same draft for every
// action at once.
//
// THE LIBRARY MODEL still shapes this file: an ACTION belongs to the artwork,
// not to a state, so this editor edits a shared definition —
//
//   * editing an action that four states play changes all four, on purpose.
//     The picker's rows say 「被 4 个状态在用」 and the delete button asks the
//     same question, so the sharing is VISIBLE instead of surprising;
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
// Selecting another skin reloads the whole studio.
//
// ── a built-in is READ-ONLY here ──
//
// A built-in's 动作 page is the SAME studio — same picker, same board, same
// filmstrip — with every WRITE gated off: you look through its actions, and that
// is all.  This page neither edits the frozen document nor copies it anywhere.
// To draw, pick 我的创作 in the skin cards: that slot seeds itself from the
// active skin (the WHOLE library, both faces and the state assignments), so the
// single door into editing is the skin picker, where "which skin am I working
// on" is the question being asked anyway.
//
// An earlier build forked on the FIRST EDIT instead — a stray click on the board
// silently copied 15 MB of pixels into 我的创作 AND switched the active skin.
// Nothing on this page writes now, and nothing here forks.
//
// TWO things it does NOT own itself, because the page owns the context:
//
//   * `actionId` — the action on the board is the page's `动作` selection (the
//     master list is the other door to it), so the studio reports every change
//     through `onActionChange` instead of keeping a private copy;
//   * `rev` — a write that came from OUTSIDE (the library pane's bulk delete,
//     the skin picker) must not leave this editor holding a stale document: it
//     would show a deleted action, and its next commit would write the deleted
//     action back.  The page bumps `rev`; an artifact-derived document is
//     re-read (and the frozen sessions dropped) when the identity changed.

import { React, h } from '../../host-deps.ts';
import { GRIDS, AVATAR_GRID, BODY_GRID, LIVE_ZOOM } from '../../pet/grids.ts';
import { BUILTIN_NAMES, DEFAULT_SKIN } from '../../pet/skins/built-ins.ts';
import {
  actionsOf,
  activeSkin,
  libraryInfo,
  removalIsBlocked,
  removeLibraryTakes,
  onSkinChange,
  saveStored,
  loadCustomArtwork,
  loadBrushes,
  seedArtworkFrom,
  paintCell,
  blankRows,
  findOrAdd,
  cellFor,
  upscaleCell,
  hexPixel,
  pixelAt,
  usedBy,
  hasActionBody,
  setStateSelection,
  addLibraryTake,
  removeLibraryTake,
  renameLibraryTake,
  replaceLibraryTake,
  replaceFrameCell,
  TRANSPARENT,
  MAX_LIBRARY,
  MAX_FRAMES,
  DEFAULT_FRAME_MS,
} from '../../pet/skins/store.ts';
import type {
  Action, ActionFrame, CustomArtwork, FrameCells, PropArt,
} from '../../pet/skins/store.ts';
import { PetPreview } from '../pet-preview.ts';
import { ActionCombo } from './action-combo.ts';
import { FrameCanvas, THUMB_CSS } from './frame-canvas.ts';
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

// The studio SESSION: the action and the frame you were on, kept across a
// mount.  The page swaps the studio for the 状态 view, and "look at the states"
// must not throw away your place — the old page unmounted the editor on every
// view switch, so it did.
//
// It is keyed by ARTWORK IDENTITY, which is exactly right: the store serves the
// same in-memory document object while the document is unchanged, so a plain
// remount finds its session; ANY write (another pane's, another skin's, a
// reload) produces a new object and the session is dropped, because a position
// in a document that no longer exists is worse than none.
interface StudioSession {
  art: CustomArtwork;
  /** The action the board was on — so coming back from 状态 resumes it. */
  actionId: string;
  frame: number;
}
let session: StudioSession | null = null;

/** Drop the session (a different document is on screen now). */
function resetSession(): void {
  session = null;
}

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
 *  face.  Used by 复制一帧: within one ACTION the body is all-or-nothing. */
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

/** Open the studio with `target` on the board when it exists (the 动作 master
 *  list), else the current selection, else the first action.  The face is NOT
 *  part of the studio's state: it only decides which FACE of the selected
 *  action is drawn, so switching it never switches the action.
 *
 *  A remount of the SAME document (the page switching to 状态 and back) resumes
 *  the session — same action, same frame — see `session`. */
function loadStudio(target?: string): Studio {
  const name = activeSkin().name;
  const art = artworkFor(name);
  const library = actionsOf(art);
  if (session && session.art !== art) resetSession();
  if (!session) session = { art, actionId: '', frame: 0 };
  const hold = session!;
  const fallback = library.some((a) => a.id === hold.actionId)
    ? hold.actionId
    : (library[0] ? library[0].id : '');
  const wanted = target && library.some((a) => a.id === target) ? target : fallback;
  return { skinName: name, art, actionId: wanted, frame: target ? 0 : hold.frame };
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
  /** Which FACE the studio draws.  The switch lives ON THE CANVAS ROW, because
   * that is the only place the answer changes anything you do.  Both faces
   * belong to the SAME action (one library, one frame list). */
  grid?: GridKey;
  onGridChange?: (grid: number) => void;
  /** The action on the board.  Owned by the PAGE (its 动作 master list is the
   * ordinary way in), so the selection survives a view switch; the studio
   * reports every change back through `onActionChange`.  Absent in a plain
   * mount (the tests, an embedder): the studio keeps its own then, seeded by
   * `loadStudio`. */
  actionId?: string;
  onActionChange?: (id: string) => void;
  /** Bumped by the page after a write that did not come from here (the library
   * pane's bulk delete).  The document is re-read when its identity changed —
   * see the header. */
  rev?: number;
  /** Called after every write this editor makes, so the page's master list
   * re-reads the library it is showing. */
  onWritten?: () => void;
}) {
  const t = props.t;
  const grid: GridKey = props.grid === BODY_GRID ? BODY_GRID : AVATAR_GRID;
  const [studio, setStudio] = React.useState<Studio>(() => loadStudio(props.actionId));
  // The paint box: six free colour wells, persisted.  They are brushes, not
  // palette slots — what a brush paints with is fixed into the pixels.
  const [brushes, setBrushes] = React.useState(() => loadBrushes());
  const [brushIdx, setBrushIdx] = React.useState(0);
  const [erasing, setErasing] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  // The synchronous mirror of studio.art — strokes never read a stale copy.
  const artRef = React.useRef(studio.art);
  // Guards the reload-on-skin-change subscription against our own commits (a
  // write re-broadcasts, and the studio must not reload out from under itself).
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
      // Another skin = another document: no session crosses over.
      resetSession();
      session = { art: fresh, actionId: first ? first.id : '', frame: 0 };
      setStudio({ skinName: name, art: fresh, actionId: first ? first.id : '', frame: 0 });
    });
  }, []);

  // A jump from 预览 · 按动作 arrives as a prop while the studio may already be
  // mounted (the mode switch keeps it alive).  Selecting the target must not
  // restart the session — it is the same document, different action.
  React.useEffect(() => {
    const want = props.actionId;
    if (!want || want === studio.actionId) return;
    if (!actionsOf(artRef.current).some((a) => a.id === want)) return;
    setStudio({ ...studio, actionId: want, frame: 0 });
  }, [props.actionId]);

  // A write from OUTSIDE (the library pane's bulk delete, the skin picker):
  // re-read the document when its identity differs from ours, and drop a session
  // that describes a document nobody has any more.  Skipped when the store hands
  // back the object we already hold, so our own writes are no-ops.
  React.useEffect(() => {
    if (props.rev === undefined) return;
    const fresh = artworkFor(activeSkin().name);
    if (fresh === artRef.current) return;
    const name = activeSkin().name;
    const library = actionsOf(fresh);
    const keep = library.some((a) => a.id === studio.actionId) ? studio.actionId : '';
    skinNameRef.current = name;
    artRef.current = fresh;
    resetSession();
    session = { art: fresh, actionId: keep, frame: 0 };
    setStudio({ skinName: name, art: fresh, actionId: keep || (library[0] ? library[0].id : ''), frame: 0 });
  }, [props.rev]);

  const art = studio.art;
  // The session follows what is on screen, so a remount resumes exactly here.
  if (session) {
    session.art = art;
    session.actionId = studio.actionId;
    session.frame = studio.frame;
  }
  /** Whether the document on the board may be WRITTEN.  A built-in is a
   *  VIEWER: its pixels are frozen, every writing control is gated off, and
   *  nothing here copies the artwork either — 我的创作 seeds itself from the
   *  active skin when you pick it. */
  const editable = studio.skinName === 'custom';
  const library = actionsOf(art);
  // The picker's rows want the SAME read-outs the page's library uses (frames,
  // body frames, who plays it), so it gets LibraryEntryInfo, not raw actions.
  const libraryRows = libraryInfo(art);
  // The selection SELF-HEALS: deleting the selected action, or a bulk delete
  // from the picker's footer, must never leave the board pointing at nothing.
  const selectedId = library.some((a) => a.id === studio.actionId)
    ? studio.actionId
    : (library[0] ? library[0].id : '');
  const action = library.find((a) => a.id === selectedId) || null;
  const frames = action ? action.frames : [];
  const frameIdx = Math.min(studio.frame, Math.max(0, frames.length - 1));
  const frame = frames[frameIdx];
  const actionUses = action ? usedBy(art, action.id) : [];
  const spec = GRIDS[AVATAR_GRID];
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
  /** Store a new document.  `silent` opts OUT of the page notification: a
   *  pixel stroke changes no read-out in the library master list, and the page
   *  re-rendering (and re-rendering this studio with it) on every painted cell
   *  is exactly the cost a drag must not pay. */
  function commit(nextArt: CustomArtwork, patch?: Partial<Studio>, opts?: { silent?: boolean }) {
    // A built-in is a VIEW.  Nothing on this page writes to it, and nothing
    // copies it either: editing a built-in means picking 我的创作, which seeds
    // itself from the active skin (see `skin-picker.ts`).  This guard is the
    // last line of that promise — a mutator that slipped past the gated
    // controls still cannot touch the frozen document.
    if (!editable) return;
    artRef.current = nextArt;
    saveStored({ skin: 'custom', custom: nextArt });
    const patch2 = patch || {};
    hold(nextArt, patch2.actionId || studio.actionId, patch2.frame !== undefined ? patch2.frame : studio.frame);
    setStudio({ ...studio, art: nextArt, ...patch });
    if (patch && patch.actionId) announce(patch.actionId);
    setNotice('');
    if (!(opts && opts.silent)) wrote();
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

  /** Tell the page which action is on the board (it owns the selection; its
   *  master list is the other door to the same value). */
  function announce(id: string) {
    if (props.onActionChange && id) props.onActionChange(id);
  }

  /** Tell the page the library changed, so its master list re-reads it. */
  function wrote() {
    if (props.onWritten) props.onWritten();
  }

  /** Point the SESSION at the document now on screen.  This happens at WRITE
   *  time, not on the next render: a stroke followed by a view switch (or a
   *  remount) must find the session even if React has not rendered again yet —
   *  the store has already accepted the document at this point. */
  function hold(nextArt: CustomArtwork, actionId: string, frame: number) {
    if (!session) return;
    session.art = nextArt;
    session.actionId = actionId;
    session.frame = frame;
  }

  function selectAction(id: string) {
    setStudio({ ...studio, actionId: id, frame: 0 });
    announce(id);
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

  /** 批量删除, from the picker's footer.  ONE write for the whole selection, and
   * the board lands on an action that still exists. */
  function removeActions(ids: string[]) {
    const { cur, id } = current();
    if (!ids.length || removalIsBlocked(cur, ids)) return;
    const next = removeLibraryTakes(cur, ids);
    if (next === cur) return;
    const list = actionsOf(next);
    const keep = list.some((a) => a.id === id) ? id : (list[0] ? list[0].id : '');
    commit(next, { actionId: keep, frame: 0 });
    setNotice(t('settings.actionsRemoved', { n: ids.length }));
  }

  /** Renaming is deliberately NOT a step of its own in the commit path: the
   *  field is UNCONTROLLED and commits on blur/Enter, because a commit
   *  serialises the whole artwork (up to ~15MB), which is far too much work to
   *  do per character.  Its `key` is the selected id, so choosing another
   *  action remounts it with that action's name instead of leaving the previous
   *  one on screen. */
  function renameAction(name: string) {
    const { cur, id } = current();
    if (!id) return;
    const next = renameLibraryTake(cur, id, name);
    artRef.current = next;
    skinNameRef.current = 'custom';
    saveStored({ skin: 'custom', custom: next });
    hold(next, studio.actionId, studio.frame);
    setStudio({ ...studio, skinName: 'custom', art: next });
    wrote();
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

  // An accent that came with a built-in action rides OVER the body: it is not
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

  // ── pixels ──
  //
  // A pixel stores the COLOUR it was painted with, not a reference to a brush:
  // the artwork's palette is a private dedup table that grows as needed.  So
  // changing a brush later cannot repaint anything — there is no operation that
  // would.

  function applyPaint(y: number, x: number) {
    if (!editable) return;
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
    commit(replaceFrameCell({ ...cur, palette }, id, frameIdx, grid, next), undefined, { silent: true });
  }

  // Eyedropper: the pixel's colour becomes the current brush's colour.
  function pickColour(y: number, x: number) {
    if (!editable) return;
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

  // ── render ──

  const miniBtn = 'status-pet-mini-button';
  const libraryFull = library.length >= MAX_LIBRARY;
  const faceProp = frame && frame.cells[grid] ? frame.cells[grid]!.prop : undefined;

  // Point the cache at THIS render's mutators, and drop it when the palette
  // array is replaced (a new colour, a seed, a document swap): a built cell's
  // colour is the one thing it cannot re-check by itself.
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
        editable
          ? h('div', { className: 'status-pet-colors' },
              h('button', { type: 'button', className: miniBtn, onClick: generateBodyDraft }, t('settings.genBody')),
              h('button', { type: 'button', className: miniBtn, onClick: blankBody }, t('settings.blankBody')),
              h('button', {
                type: 'button', className: miniBtn, onClick: generateAllBodies,
                title: t('settings.genBodyAllHint'),
              }, t('settings.genBodyAll')),
            )
          : null)
    : h('div', { className: 'status-pet-board-wrap' + (editable ? '' : ' status-pet-board-readonly') },
        h('div', { className: 'status-pet-grid' },
          shownFace.rows.map((row, y) => boardRow(row, y))
        ),
        !action && editable
          ? h('div', { className: 'status-pet-takeover' },
              h('button', { type: 'button', className: miniBtn, onClick: newAction }, t('settings.newAction')))
          : null
      );

  // No role="tabpanel" here: the PAGE owns the panel for whichever mode the
  // 编辑 tab is showing, so mounting the studio directly never nests two
  // tabpanels.
  return h('div', { className: 'status-pet-studio' },
    h('div', { className: 'status-pet-canvas-card' },

      // ── 动作 ── WHICH action the board edits: ONE row that picks it, and a
      // second row that names it and carries the two verbs that belong to the
      // library (新建动作 / 删除动作).  It never mentions a state — deciding what
      // a state plays is 按状态's job.
      field('action', t('settings.region.action'), t('settings.actionHint'),
        h('div', { className: 'status-pet-action-row' },
          // The list IS the picker: search, preview and selection in one control,
          // so the studio keeps the pane's full width for the board.  批量删除 is
          // its footer — the library's destructive op still lives beside the
          // library.
          library.length
            ? h(ActionCombo, {
                t,
                library: libraryRows,
                art,
                grid,
                value: selectedId,
                onSelect: selectAction,
                canManage: editable,
                removalBlocked: (ids: string[]) => removalIsBlocked(artRef.current, ids),
                onRemove: removeActions,
              })
            : h('span', { className: 'status-pet-hint' }, t('settings.emptyLibrary')),
        ),
        // The name and the verbs are about the action you PICKED, not about
        // picking one: they share the second row, and a built-in (a viewer) has
        // neither.
        editable
          ? h('div', { className: 'status-pet-action-row' },
              action
                ? h('div', { className: 'status-pet-num-field status-pet-action-name-field' },
                    h('span', { className: 'status-pet-prop-label', title: t('settings.actionNameHint') },
                      t('settings.actionName')),
                    h('input', {
                      // The key carries the NAME as well as the id: a rename while
                      // the id stays would leave an uncontrolled input showing the
                      // old one.
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
              h('button', {
                type: 'button', className: miniBtn, onClick: newAction, disabled: libraryFull,
                'aria-label': t('settings.newAction'),
                title: libraryFull ? t('settings.libraryFull') : t('settings.newAction'),
              }, '+ ' + t('settings.newAction')),
              action
                ? h('button', {
                    type: 'button', className: miniBtn, onClick: deleteAction, disabled: !canDeleteAction(),
                    'aria-label': t('settings.deleteAction'),
                    title: actionUses.length
                      ? t('settings.deleteUsed', { n: actionUses.length })
                      : t('settings.deleteAction'),
                  }, '× ' + t('settings.deleteAction'))
                : null,
            )
          : null,
      ),

      // ── 画布 ── the board and, beside it, the ACTION's live preview.  The
      // face switch belongs to whatever picture is in front of you, so it sits
      // ON the canvas row and the stage only labels the face it is showing.
      field('canvas', t('settings.region.canvas'), undefined,
        // 头像 / 全身 sits ON TOP of the canvas, because it decides which face of
        // the action the board draws — and it is the only thing it ever changes.
        h('div', { className: 'status-pet-face-switch', role: 'group', 'aria-label': t('settings.face') },
          [AVATAR_GRID, BODY_GRID].map((g) =>
            h('button', {
              key: g,
              type: 'button',
              className: 'status-pet-mini-button' + (grid === g ? ' active' : ''),
              'aria-pressed': grid === g ? 'true' : 'false',
              title: t('settings.grid.' + g + 'Hint'),
              onClick: () => { if (props.onGridChange) props.onGridChange(g); },
            }, t('settings.grid.' + g))
          )
        ),
        h('div', { className: 'status-pet-stage' },
          h('div', { className: 'status-pet-stage-cell' }, board),
          // The preview is a PICTURE and nothing else: no caption, no link, no
          // numbers — the picker's rows already say who plays what.  It is
          // small (the popup's own 1:2 display size) so the pair always fits on
          // ONE row beside the board.
          h('div', { className: 'status-pet-stage-cell status-pet-inspect' },
            h(PetPreview, {
              skinName: studio.skinName,
              grid: grid,
              takeId: selectedId,
              zoom: LIVE_ZOOM,
              interactive: false,
            })
          )
        )
      ),

      // ── 帧 ── the filmstrip of the SELECTED ACTION (ONE list — both faces
      // share it) and, at its end, the frame ops.  Duplicating the frame you are
      // looking at IS how an animation gets made ("draw one, copy it, nudge
      // it"), so it leads the group.  All of it is a WRITE: a built-in keeps the
      // filmstrip — which is how you LOOK at its frames — and loses the ops.
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
              // The three ops are ONE group that stays together wherever the
              // strip wraps, instead of 删除此帧 living on a row of its own.
              editable
                ? h('div', { className: 'status-pet-frame-ops' },
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
                    frames.length > 1
                      ? h('button', {
                          type: 'button', className: miniBtn,
                          'aria-label': t('settings.delFrame'), title: t('settings.delFrame'),
                          onClick: deleteFrame,
                        }, '× ' + t('settings.delFrame'))
                      : null,
                  )
                : null,
            )
          )
        : null,

      // ── 画笔 ── the paint box.  Each well IS a brush: click it to paint with
      // it, click the well again to change its colour (native picker).  What a
      // brush paints with is baked into the pixels, so editing a brush never
      // touches the board, and there is nothing to add or reset.  A built-in
      // has no board to paint, so it has no brushes.
      editable ? field('brushes', t('settings.region.palette'), undefined,
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
      ) : null,

      // ── 当前帧 ── the selected frame's own numbers: how long it is shown, and
      // where the whole frame sits (整幅挪动 — the pixels are never redrawn).
      // Every one of them is SHARED by the two faces, which is the point of the
      // paired model: 「整幅挪动」 is authored in avatar cells and the body renders
      // it ×4, so one press is the same hop on both.  All of it is a WRITE, so a
      // built-in does not carry the row.
      editable && action && frame
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
            // notation.  It is a LABELLED ROW like the two above it — name on
            // the left, the pad in the value column — so 当前帧's three rows
            // line up instead of the pad floating under the numbers.
            h('div', { className: 'status-pet-num-field status-pet-offset-row' },
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
            ),
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

    notice ? h('div', { className: 'status-pet-hint' }, notice) : null,
  );
}
