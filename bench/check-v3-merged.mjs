// 成品池的 V3 门禁：序列占比 / 组数 / 多样性六条。
//
//   node bench/check-v3-merged.mjs
//
// 它跑的是**合稿后**的 docs/text-layer-copy-{zh,en}.md —— 单个写手的追加文件管不了
// 这些指标（它们是"整池"的性质），所以只能在合稿之后查。test/lines.test.ts 也调同一份
// 实现（bench/v3-spec.ts 的 checkMergedPool）。

import { parseDoc, STATES } from './v2-spec.ts';
import { checkMergedPool } from './v3-spec.ts';

let total = 0;
for (const lang of ['zh', 'en']) {
  const doc = parseDoc(`docs/text-layer-copy-${lang}.md`);
  const bad = [];
  for (const state of STATES) bad.push(...checkMergedPool(state, doc.states[state] || [], lang));
  total += bad.length;
  console.log(`[${lang}] ${bad.length} 个问题`);
  if (bad.length) console.log(bad.slice(0, 40).join('\n') + (bad.length > 40 ? `\n… 另有 ${bad.length - 40} 个` : ''));
}
console.log(total ? `\n❌ 合计 ${total} 个问题` : '\n✅ 成品池全部通过（序列组数、序列占比、多样性六条）');
process.exit(total ? 1 : 0);
