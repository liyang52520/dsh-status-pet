// The skin-layer hot paths: chunk landing, resolution, assignment ticks, skin
// switch, and library reads — measured against the real modules.
import { stubWindow, time, section } from './harness.mjs';

const net = stubWindow();

// ── imports (new module paths) ──
const session = await import('../src/skin/session.ts');
const documents = await import('../src/skin/documents.ts');
const library = await import('../src/skin/library.ts');
const { CATALOG } = await import('../src/skin/catalog.ts');
const { DEFAULT_SKIN } = await import('../src/skin/registry.ts');
const { AVATAR_FACE } = await import('../src/skin/geometry.ts');

// ── cold: the chunk lands ──
section('cold: the artwork chunk lands');
time('installCatalog + bestSkin', () => {
  session.installCatalog(CATALOG);
  session.bestSkin();
}, 3);

const SKIN = DEFAULT_SKIN;

// ── resolution ──
section('resolution (the dock asks every tick, the page asks per row)');
const stored = { v: 1, skin: SKIN };
time('activeSkin — warm (memoized by artwork identity)', () => session.activeSkin(), 100);
time('bestSkin — the popup', () => session.bestSkin(), 100);

const info = documents.libraryOf(SKIN);
const actions = info.map(a => a.id);
time(`skinFor × ${info.length} — every row of the assignment list`, () => {
  for (const a of info) session.skinFor(SKIN, AVATAR_FACE);
}, 3);
time('the same asks again (warm)', () => {
  for (const a of info) session.skinFor(SKIN, AVATAR_FACE);
}, 20);

// ── one state tick ──
section('one state tick (the only write path)');
const art = documents.documentOf(SKIN);
const first = art.actions[0].id;
const second = art.actions[1].id;
let flip = false;
time('assign + saveAssignments (persist + re-resolve + broadcast)', () => {
  flip = !flip;
  session.saveAssignments(SKIN, { ...art.states, idle: [flip ? second : first] });
}, 20);

// ── burst of ticks ──
section('a burst of ticks (a user clicking down the list)');
const ids = art.actions.slice(0, 40).map((a) => a.id);
let wrote = 0;
net.reset();
time('40 ticks', () => {
  const before = net.stats().writes;
  for (const id of ids) session.saveAssignments(SKIN, { ...art.states, idle: [id] });
  wrote = net.stats().writes - before;
}, 3);
console.log(`  ${'→ localStorage writes for those 40 ticks'.padEnd(52)} ${String(wrote).padStart(9)}`);
console.log(`  ${'→ bytes handed to localStorage'.padEnd(52)} ${String(net.stats().bytesWritten).padStart(9)}`);

// ── switching skin ──
section('switching skin');
time('chooseSkin', () => session.chooseSkin(SKIN), 20);

// ── assignment reads ──
section('the assignment reads the page renders');
time(`libraryOf × 11 states (the row read-outs)`, () => {
  for (let i = 0; i < 11; i++) documents.libraryOf(SKIN);
}, 20);
time('usedBy for every action', () => {
  const a = documents.documentOf(SKIN);
  for (const t of a.actions) library.usedBy(a, t.id);
}, 20);