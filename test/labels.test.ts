// Labels: dictionary shape, key-set symmetry, fallback translator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LABELS, NS, LABEL_FALLBACK, translatorOrFallback } from '../src/labels/index.ts';

test('NS is the string "status-pet"', () => {
  assert.equal(NS, 'status-pet');
});

test('both locales carry the same keys', () => {
  assert.ok('en' in LABELS && 'zh' in LABELS, 'en and zh exist');
  for (const locale of Object.keys(LABELS)) {
    const d = LABELS[locale as 'en'|'zh'];
    assert.deepEqual(Object.keys(d).slice().sort(), Object.keys(LABEL_FALLBACK).slice().sort());
  }
});

test('every state and reaction has a label', () => {
  // Test that the dictionary covers the state-name keys used by the tooltip.
  for (const name of ['idle','sleep','think','stream','tool','approval','question','error','done','petted','woken','toolNamed']) {
    for (const locale of Object.keys(LABELS)) {
      assert.ok(typeof LABELS[locale as 'en'|'zh'][name] === 'string', `${locale}:${name} is labelled`);
    }
  }
});

test('translatorOrFallback falls back to English with {param} interpolation', () => {
  const t = translatorOrFallback(null);
  assert.equal(t('idle'), 'Idle');
  assert.equal(t('not.a.key'), 'not.a.key');
  assert.equal(t('toolNamed', { name: 'bash' }), 'Running bash…');
});

test('the real en and zh labels are not identical', () => {
  assert.notEqual(LABELS.en.idle, LABELS.zh.idle);
});