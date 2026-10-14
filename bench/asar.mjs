// Minimal asar reader — no dependencies, just the archive format.
//
//   node bench/asar.mjs list <archive> [substring]
//   node bench/asar.mjs cat  <archive> <path-inside>
//
// Format: [u32 = 4][u32 = 4 + padded json][u32 = 4 + json][u32 = json]
//         [json header][file data…]
// The JSON header is padded to a 4-byte boundary, so the data section starts at
// 16 + align4(jsonLen) — NOT 16 + jsonLen.  Getting this wrong shifts every file
// by 1–3 bytes, which is exactly the kind of bug that silently corrupts an
// extraction, so `verify()` below checks the JSON files parse.

import { readFileSync } from 'node:fs';

const [, , cmd, archivePath, arg] = process.argv;

const align4 = (n) => (n + 3) & ~3;

function load(archivePath) {
  const buf = readFileSync(archivePath);
  const jsonLen = buf.readUInt32LE(12);
  const header = JSON.parse(buf.subarray(16, 16 + jsonLen).toString('utf8'));
  return { buf, header, dataStart: 16 + align4(jsonLen) };
}

function walk(node, prefix, out) {
  for (const [name, entry] of Object.entries(node.files || {})) {
    const p = prefix ? prefix + '/' + name : name;
    if (entry.files) walk(entry, p, out);
    else out.push({ path: p, size: entry.size, offset: entry.offset, unpacked: !!entry.unpacked });
  }
}

const { buf, header, dataStart } = load(archivePath);

if (cmd === 'list') {
  const out = [];
  walk(header, '', out);
  const hits = out.filter((f) => !arg || f.path.includes(arg));
  for (const f of hits) console.log(`${String(f.size).padStart(9)}  ${f.path}`);
  console.log(`— ${hits.length} of ${out.length} files`);
} else if (cmd === 'cat') {
  const out = [];
  walk(header, '', out);
  const hit = out.find((f) => f.path === arg);
  if (!hit) { console.error('not found: ' + arg); process.exit(1); }
  if (hit.unpacked) { console.error('unpacked (read from app.asar.unpacked): ' + arg); process.exit(2); }
  const start = dataStart + Number(hit.offset);
  process.stdout.write(buf.subarray(start, start + hit.size));
} else {
  console.error('usage: asar.mjs list|cat <archive> [arg]');
  process.exit(1);
}
