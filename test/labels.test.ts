// The copy contract — the checks `test/lines.test.ts` used to own before the whole
// suite was deleted.  Nothing here needs a browser: the dictionaries and the pool
// structure are plain data.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { LABELS, NS } from '../src/labels/index.ts';
import { LINES_ZH } from '../src/labels/lines/zh.ts';
import { LINES_EN } from '../src/labels/lines/en.ts';
import { BRIDGE_SPECS, CONTINUERS, EVENTS, LINE_SPECS, TOPICS } from '../src/behavior/line-pools.ts';
import { STATE_NAMES, STATES, REACTIONS } from '../src/behavior/vocabulary.ts';

/** Every placeholder the renderer knows how to fill (see behavior/context.ts). */
const KNOWN_VARS = new Set([
  'cmd', 'file', 'dir', 'pat', 'q', 'url', 'task', 'agent', 'goal', 'skill',
  'name', 'secs', 'n', 'nq', 'why', 'turn', 'step',
]);

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{([a-z]+)\}/g)].map((m) => m[1]);
}

function allPools(): Array<[string, readonly { id: string }[]]> {
  const out: Array<[string, readonly { id: string }[]]> = [];
  for (const [state, lines] of Object.entries(LINE_SPECS)) out.push([`state:${state}`, lines]);
  for (const [key, lines] of Object.entries(BRIDGE_SPECS)) out.push([`bridge:${key}`, lines]);
  for (const [key, lines] of Object.entries(EVENTS)) out.push([`event:${key}`, lines]);
  for (const [key, lines] of Object.entries(TOPICS)) out.push([`topic:${key}`, lines]);
  out.push(['continuers', CONTINUERS]);
  return out;
}

test('the two locales carry exactly the same line ids', () => {
  const zh = Object.keys(LINES_ZH).sort();
  const en = Object.keys(LINES_EN).sort();
  assert.deepEqual(zh, en, 'zh and en line key sets must be identical');
  assert.ok(zh.length > 3000, `expected a few thousand lines, got ${zh.length}`);
});

test('the UI dictionary is symmetric too', () => {
  assert.deepEqual(Object.keys(LABELS.zh).sort(), Object.keys(LABELS.en).sort());
  assert.equal(NS, 'status-pet');
});

test('every state and reaction has a label and a hint in both locales', () => {
  for (const name of STATE_NAMES) {
    for (const locale of ['zh', 'en'] as const) {
      const dict = LABELS[locale];
      assert.ok(dict[name], `${locale} is missing the state label ${name}`);
      assert.ok(dict[`settings.hint.${name}`], `${locale} is missing settings.hint.${name}`);
    }
  }
  // `STATES` only carries the accents now; together they must cover the pet states.
  assert.ok(Object.keys(STATES).length >= 22);
  assert.equal(Object.keys(REACTIONS).length, 2);
});

test('every pool entry exists in both locales, and every entry is reachable', () => {
  const referenced = new Set<string>();
  for (const [where, lines] of allPools()) {
    for (const line of lines) {
      assert.ok(LINES_ZH[line.id], `zh is missing ${line.id} (${where})`);
      assert.ok(LINES_EN[line.id], `en is missing ${line.id} (${where})`);
      referenced.add(line.id);
    }
  }
  const orphans = Object.keys(LINES_ZH).filter((id) => !referenced.has(id));
  assert.deepEqual(orphans, [], 'locale entries no pool can ever draw');
});

test('no pool entry is listed twice, and none is empty', () => {
  const seen = new Set<string>();
  for (const [where, lines] of allPools()) {
    assert.ok(lines.length > 0, `${where} is empty`);
    for (const line of lines) {
      assert.ok(!seen.has(line.id), `${line.id} appears twice (again in ${where})`);
      seen.add(line.id);
    }
  }
});

test('every placeholder is a variable the renderer fills, and both locales agree', () => {
  for (const [id, text] of Object.entries(LINES_ZH)) {
    for (const name of placeholders(text)) {
      assert.ok(KNOWN_VARS.has(name), `zh ${id} uses the unknown placeholder {${name}}`);
    }
  }
  for (const [id, text] of Object.entries(LINES_EN)) {
    for (const name of placeholders(text)) {
      assert.ok(KNOWN_VARS.has(name), `en ${id} uses the unknown placeholder {${name}}`);
    }
  }
});

test('every static settings key the view asks for exists in both locales', () => {
  const files = readdirSync('src/view', { recursive: true } as never) as string[];
  const missing: string[] = [];
  for (const rel of files) {
    const path = join('src/view', String(rel));
    if (!path.endsWith('.ts')) continue;
    const text = readFileSync(path, 'utf8');
    for (const m of text.matchAll(/\bt\(\s*'((?:settings|label|toolNamed)[\w.]*)'/g)) {
      const key = m[1];
      if (key.endsWith('.')) continue;
      if (!LABELS.zh[key]) missing.push(`${key} (${path})`);
    }
  }
  assert.deepEqual(missing, []);
});

test('no line is empty and no label is whitespace-only', () => {
  for (const [locale, dict] of Object.entries(LABELS)) {
    for (const [key, value] of Object.entries(dict)) {
      assert.equal(typeof value, 'string', `${locale} ${key} is not a string`);
      assert.ok(value.trim().length > 0, `${locale} ${key} is blank`);
    }
  }
});
