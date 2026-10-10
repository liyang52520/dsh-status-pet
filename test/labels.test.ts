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
    'settings.nav', 'settings.previewHint', 'settings.tab.preview', 'settings.tab.edit',
    'settings.skins', 'settings.grid.32', 'settings.grid.128',
    'settings.brushN', 'settings.eraser',
    'settings.export', 'settings.import',
    'settings.io', 'settings.importError',
    'settings.undo', 'settings.redo', 'settings.paste',
    'settings.genBody', 'settings.copyFrame', 'settings.delFrame', 'settings.frameMs',
    'settings.followIdle', 'settings.addFrame', 'settings.emptyBody',
    'settings.blankBody', 'settings.region.states', 'settings.region.action', 'settings.region.canvas',
    'settings.region.frames', 'settings.region.palette', 'settings.field.frames',
    // The assignment surface (编辑 · 按状态): its dropdown, its list and its ops.
    'settings.region.library', 'settings.libraryHint', 'settings.actionCount', 'settings.actionN',
    'settings.actionName', 'settings.actionNameHint', 'settings.actionMs', 'settings.actionMsHint',
    'settings.newAction', 'settings.deleteAction', 'settings.deleteUsed',
    'settings.importAction', 'settings.importSearch', 'settings.importHint',
    'settings.importSource.builtin', 'settings.importSource.mine', 'settings.importCurrent',
    'settings.importedOne', 'settings.usedByN', 'settings.unusedAction',
    'settings.playedHere', 'settings.emptyLibrary',
    'settings.libraryFull', 'settings.selectAll', 'settings.clearSelection',
    // Finding an action in a 106-entry library, and editing several at once.
    'settings.searchActions', 'settings.searchStates', 'settings.searchMatches', 'settings.searchEmpty',
    'settings.selectAllHint', 'settings.confirmDeleteTitle', 'settings.confirmDeleteHint',
    'settings.cancel', 'settings.confirmDelete',
    'settings.selectedCount', 'settings.selectedMax',
    'settings.manageActions', 'settings.bulkHint', 'settings.deleteSelected',
    'settings.deleteBlocked', 'settings.actionsRemoved',
    // The seam between the two tabs: the corner ✎ and what it opens.
    'settings.editAction', 'settings.editState', 'settings.actionHint', 'settings.assignCropMissing',
    'settings.builtinStatesOnly', 'settings.clearIdleHint',
    // The gallery's two ways of looking at the same artwork.
    'settings.view', 'settings.view.states', 'settings.view.actions', 'settings.unusedCount',
    'settings.showMore', 'settings.actionFrames',
    ...['idle','sleep','think','stream','tool','approval','question','error','done','petted','woken'].map((n) => 'settings.hint.' + n),
    ...BUILTIN_NAMES.map((n) => 'settings.skin.' + n),
    'settings.skin.custom',
  ];
  const missing: string[] = [];
  for (const key of required) {
    if (!en.has(key)) missing.push('en:' + key);
    if (!zh.has(key)) missing.push('zh:' + key);
  }
  assert.deepEqual(missing, []);
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
