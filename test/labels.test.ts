// Locale integrity: both dictionaries name identical keys and cover every
// registry entry, so no visible string can ever fall through to a raw key.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LABELS, LABEL_FALLBACK, NS, translatorOrFallback } from '../src/pet/labels.ts';
import { STATES, REACTIONS } from '../src/pet/behavior.ts';
import { BUILTIN_NAMES } from '../src/pet/skins/built-ins.ts';

const en = new Set(Object.keys(LABELS.en));
const zh = new Set(Object.keys(LABELS.zh));

test('both locale dictionaries exist under the status-pet namespace', () => {
  assert.equal(NS, 'status-pet');
  assert.ok(en.size > 0 && zh.size > 0);
  assert.equal(LABEL_FALLBACK, LABELS.en, 'the fallback is the English table');
});

test('every state and reaction is labelled in every locale', () => {
  const required = ['label', 'toolNamed', ...Object.keys(STATES), ...Object.keys(REACTIONS)];
  const missing: string[] = [];
  for (const key of required) {
    if (!en.has(key)) missing.push('en:' + key);
    if (!zh.has(key)) missing.push('zh:' + key);
  }
  assert.deepEqual(missing, []);
});

test('every settings string is labelled in every locale', () => {
  const required = [
    'settings.nav', 'settings.previewHint', 'settings.skins',
    // The ONE axis, the two faces, and the master / detail split.
    'settings.view', 'settings.view.states', 'settings.view.actions',
    'settings.face', 'settings.grid.32', 'settings.grid.128',
    'settings.grid.32Hint', 'settings.grid.128Hint',
    // The master list of the eleven states, and the picture in the edit header.
    'settings.master.states', 'settings.master.reactions', 'settings.previewing',
    // The 动作 view: the library, one action at a time — a picker, a board and
    // a filmstrip, and nothing that writes.
    'settings.region.action', 'settings.actionHint', 'settings.region.canvas',
    'settings.region.frames', 'settings.field.frames', 'settings.frameN',
    'settings.comboPlaceholder', 'settings.comboEmpty', 'settings.actionFrames',
    'settings.noBody', 'settings.emptyBody',
    // The assignment surface: its library, its groups and its ops.
    'settings.region.library', 'settings.libraryHint',
    'settings.actionCount', 'settings.actionN',
    'settings.usedByN', 'settings.unusedAction', 'settings.playedHere', 'settings.emptyLibrary',
    'settings.libraryTickedGroup', 'settings.libraryRestGroup',
    'settings.selectAll', 'settings.clearSelection',
    // Finding an action in a 106-entry library.
    'settings.searchActions', 'settings.searchMatches', 'settings.searchEmpty',
    'settings.selectedMax', 'settings.cancel', 'settings.followIdle',
    // The one rule that cannot be guessed: 空闲 keeps an action.
    'settings.clearIdleTitle', 'settings.clearIdleHint',
    ...['idle', 'sleep', 'think', 'stream', 'tool', 'approval', 'question', 'error', 'done', 'petted', 'woken']
      .map((n) => 'settings.hint.' + n),
    ...BUILTIN_NAMES.map((n) => 'settings.skin.' + n),
  ];
  const missing: string[] = [];
  for (const key of required) {
    if (!en.has(key)) missing.push('en:' + key);
    if (!zh.has(key)) missing.push('zh:' + key);
  }
  assert.deepEqual(missing, []);
});

test('the customisation keys left with the feature', () => {
  // Nothing may keep a string alive for a control that no longer exists.
  const gone = [
    // The studio's writing controls.
    'settings.brushN', 'settings.eraser', 'settings.region.palette', 'settings.region.preview',
    'settings.region.frame',
    'settings.newAction', 'settings.deleteAction', 'settings.deleteUsed', 'settings.actionName',
    'settings.actionNameHint', 'settings.actionMs', 'settings.actionMsHint',
    'settings.libraryFull', 'settings.manageActions', 'settings.bulkHint', 'settings.deleteSelected',
    'settings.deleteBlocked', 'settings.actionsRemoved', 'settings.confirmDeleteTitle',
    'settings.confirmDeleteHint', 'settings.confirmDelete', 'settings.selectedCount',
    'settings.addFrame', 'settings.addBlankFrame', 'settings.delFrame', 'settings.frameMs',
    'settings.frameLen', 'settings.frameOffset', 'settings.frameOffsetHint', 'settings.offsetReset',
    'settings.frameProp', 'settings.framePropClear', 'settings.framePropHint',
    'settings.moveUp', 'settings.moveDown', 'settings.moveLeft', 'settings.moveRight',
    'settings.genBody', 'settings.genBodyAll', 'settings.genBodyAllHint',
    'settings.genBodyAllDone', 'settings.blankBody',
    // …and the custom skin itself.
    'settings.skin.custom', 'settings.skin.customHint',
  ];
  for (const key of gone) {
    assert.equal(en.has(key), false, 'en:' + key + ' left with the studio');
    assert.equal(zh.has(key), false, 'zh:' + key + ' left with the studio');
  }
});

test('the dictionaries carry identical key sets', () => {
  assert.deepEqual([...en].sort(), [...zh].sort());
});

test('translatorOrFallback: a real translator passes through; the fallback interpolates', () => {
  const t = (k: string, p?: Record<string, unknown>) => 'T:' + k + (p ? '=' + p.name : '');
  assert.equal(translatorOrFallback(t)('toolNamed', { name: 'bash' }), 'T:toolNamed=bash');
  assert.equal(translatorOrFallback(null)('idle'), 'Idle');
  assert.equal(translatorOrFallback(null)('toolNamed', { name: 'bash' }), 'Running bash…',
    'the English fallback interpolates {name}');
  assert.equal(translatorOrFallback(undefined)('no.such.key'), 'no.such.key',
    'an unknown key falls through to the key itself');
});
