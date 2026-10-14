// The LIVE wardrobe: the skin the dock and popup are showing right now, plus the
// write path (the one change a user can make to a skin).
//
//   activeSkin()    the dock's face (always the avatar crop)
//   bestSkin()      the popup's face (the body when the skin carries one,
//                   else the avatar at 4×)
//   skinFor()       a named skin at one face, for cards and previews
//   actionSkinFor() one action as a whole skin, for the header's live preview
//                   and every row thumbnail
//   chooseSkin()    make one built-in the active skin
//   saveAssign()    store the assignment diff for one skin
//   installCatalog() the artwork chunk has landed — swap the registry in and
//                   re-resolve
//   onSkinChange()  subscribe to any skin change (same-tab writes + cross-tab
//                   storage events)
//
// Resolution is lazy and cached by object identity, so a write that moved
// nothing is free: the stored object stays the same, and `activeSkin()` returns
// the same cached value.  A write that changed something produces a fresh stored
// object, the cache misses, and the skin re-resolves — through the very same
// pixel objects, so the renderer's bitmap cache survives it.

import { STATE_NAMES } from '../behavior/vocabulary.ts';
import { MAX_SELECTION } from './model.ts';
import type { StateTable } from './model.ts';
import type { AssignmentDiff } from './overrides.ts';
import { documentOf, clearDocumentCache } from './documents.ts';
import { AVATAR_FACE, BODY_FACE } from './geometry.ts';
import type { FaceName } from './geometry.ts';
import {
  artworkOf,
  DEFAULT_SKIN,
  installCatalog as installRegistry,
  isBuiltin,
} from './registry.ts';
import { blankSkin, resolveActionSkin, resolveSkin } from './resolve.ts';
import type { ResolvedSkin } from './resolve.ts';
import { CHANGE_EVENT, KEY, onWrite, readStored, writeStored } from './storage.ts';
import type { Stored } from './storage.ts';

// ── internal: turn a stored document into a rendered skin ──

function storedSkinName(stored: Stored): string {
  return isBuiltin(stored.skin) ? stored.skin : DEFAULT_SKIN;
}

/** The default skin at one face — the last resort before a blank canvas. */
function defaultSkin(face: FaceName): ResolvedSkin {
  const doc = documentOf(DEFAULT_SKIN);
  if (doc) {
    const hit = resolveSkin(doc, DEFAULT_SKIN, face);
    if (hit) return hit;
  }
  return blankSkin(DEFAULT_SKIN, face);
}

/** The store → a rendered skin.  Falls back from the named skin to the default,
 *  then to a blank canvas — never to another skin's artwork. */
function resolveFor(stored: Stored, name: string, face: FaceName): ResolvedSkin {
  const doc = documentOf(name);
  if (doc) {
    const hit = resolveSkin(doc, name, face);
    if (hit) return hit;
  }
  return name === DEFAULT_SKIN ? blankSkin(name, face) : defaultSkin(face);
}

// ── the active skin ──

let activeCache: { stored: Stored; skin: ResolvedSkin } | null = null;

/** The dock's face: always the avatar.  Cached until the store object changes;
 *  subscribers are notified via `onSkinChange` whenever the stored document
 *  actually moves. */
export function activeSkin(): ResolvedSkin {
  const stored = readStored();
  if (!activeCache || activeCache.stored !== stored) {
    activeCache = { stored, skin: resolveFor(stored, storedSkinName(stored), AVATAR_FACE) };
  }
  return activeCache.skin;
}

/** The popup's face: the body when the skin carries one, else the avatar at
 *  4×. */
export function bestSkin(): ResolvedSkin {
  const stored = readStored();
  return resolveFor(stored, storedSkinName(stored), BODY_FACE);
}

/** A named skin for a preview — the cards, the state header.  Returns `null`
 *  only when the name is not a built-in.  A known built-in whose chunk has not
 *  landed yet returns a blank skin (empty canvas) rather than crashing. */
export function skinFor(name: string, face: FaceName = AVATAR_FACE): ResolvedSkin | null {
  if (!isBuiltin(name)) return null;
  return resolveFor(readStored(), name, face);
}

/** One action as a whole skin — the header's live preview of the hovered row,
 *  and every row thumbnail.  The action is resolved once per (document, face,
 *  id), so 106 rows cost the same resolution as one. */
export function actionSkinFor(name: string, face: FaceName, actionId: string): ResolvedSkin | null {
  const doc = documentOf(name);
  if (!doc) return null;
  return resolveActionSkin(doc, name, face, actionId);
}

// ── writes ──

/** Make one built-in the active skin.  A name we do not ship is ignored. */
export function chooseSkin(name: string): void {
  if (!isBuiltin(name)) return;
  writeStored({ skin: name });
}

/** Store the assignment diff for one skin.  Only the states that actually
 *  changed from the authored assignment are persisted, and an idle diff that
 *  would empty the anchor is refused — so a corrupt store can never blank the
 *  pet.  A write that ends where it started costs nothing at all. */
export function saveAssignments(name: string, states: StateTable): void {
  if (!isBuiltin(name)) return;
  const art = artworkOf(name);
  if (!art) return;
  const known = new Set(art.actions.map((a) => a.id));
  const clean = (ids: string[] | undefined): string[] =>
    Array.isArray(ids)
      ? ids
          .filter((id, i) => typeof id === 'string' && known.has(id) && ids.indexOf(id) === i)
          .slice(0, MAX_SELECTION)
      : [];
  const diff: AssignmentDiff = {};
  for (const state of STATE_NAMES) {
    const ids = clean(states[state]);
    const authored = art.states[state] || [];
    if (ids.join('\u0000') !== authored.join('\u0000')) diff[state] = ids;
  }
  // The idle anchor: never store an empty list for it.
  if (!(diff.idle && diff.idle.length)) delete diff.idle;
  const stored = readStored();
  const current = stored.assignments || {};
  const next: Record<string, Record<string, string[]>> = { ...current };
  if (Object.keys(diff).length) next[name] = diff;
  else delete next[name];
  // Nothing moved: do not write, do not re-resolve, do not broadcast.
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  writeStored({ assignments: Object.keys(next).length ? next : undefined });
}

// ── the chunk landing ──

/** The artwork chunk has landed.  Called once by the plugin's lazy loader:
 *  swap the registry in, clear the document cache (a name that was null is now
 *  a real skin), and notify every subscriber so the canvases pick the pixels up
 *  on their next frame. */
export function installCatalog(docs: Record<string, unknown>): void {
  installRegistry(docs);
  activeCache = null;
  clearDocumentCache();
  emitChange();
}

// ── subscriptions ──

function emitChange(): void {
  try {
    if (typeof window !== 'undefined'
      && typeof window.dispatchEvent === 'function'
      && typeof window.CustomEvent === 'function') {
      window.dispatchEvent(new window.CustomEvent(CHANGE_EVENT));
    }
  } catch {
    // best effort
  }
}

/** Subscribe to skin changes (same-tab writes + cross-tab storage events).
 *  Returns the disposer. */
export function onSkinChange(fn: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {};
  }
  window.addEventListener(CHANGE_EVENT, fn);
  return () => window.removeEventListener(CHANGE_EVENT, fn);
}

// ── side-effects: keep ACTIVE in step ──

// A local write re-resolves and notifies.
onWrite(() => {
  activeCache = null;
  emitChange();
});

// A write from another tab lands here: re-read the store and re-emit.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (e: StorageEvent) => {
    if (!e || !e.key || e.key === KEY) {
      activeCache = null;
      emitChange();
    }
  });
}