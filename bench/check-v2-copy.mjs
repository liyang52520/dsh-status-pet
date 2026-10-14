// 台词契约的命令行外壳。 规则本身在 bench/v2-spec.mjs（测试与它共用同一份实现）。
//
//   node bench/check-v2-copy.mjs <doc.md>            单文件：条数/音区/序列/变量/文风
//   node bench/check-v2-copy.mjs --pair <zh> <en>    两份文档是否逐行对齐
//
// 写手交付前必须清零。 退出码非 0 表示有问题。

import { SPEC, checkDoc, checkPair, parseDoc } from './v2-spec.ts';

const TARGET = Object.values(SPEC).reduce((s, v) => s + v[0], 0);
const argv = process.argv.slice(2);

if (argv[0] === '--pair') {
  const bad = checkPair(parseDoc(argv[1]), parseDoc(argv[2]));
  console.log(bad.length ? `❌ pair mismatch (${bad.length})\n` + bad.join('\n') : '✅ pair aligned (states, counts, tones, seq, bridges)');
  process.exit(bad.length ? 1 : 0);
}

if (argv.length !== 1) {
  console.error('usage: check-v2-copy.mjs <doc.md> | --pair <zh> <en>');
  process.exit(2);
}

const doc = parseDoc(argv[0]);
const bad = checkDoc(doc);
const total = Object.keys(doc.states).reduce((s, k) => s + doc.states[k].length, 0);
console.log(`doc ${doc.path}  [${doc.lang}]  ${total} 台词 + ${doc.bridges.length} 桥接  (全量目标 ${TARGET})`);
if (bad.length) {
  console.log(`\n❌ ${bad.length} 个问题：`);
  console.log(bad.slice(0, 80).join('\n'));
  if (bad.length > 80) console.log(`… 另有 ${bad.length - 80} 个`);
  process.exit(1);
}
console.log('✅ 全部通过（条数、音区、序列、变量、文风、查重）');
