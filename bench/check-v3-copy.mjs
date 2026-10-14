// V3 交付文件的命令行校验：
//
//   node bench/check-v3-copy.mjs <file.md>        自动识别文件里有哪些层并逐条校验
//   node bench/check-v3-copy.mjs --pair <zh> <en> 两份文件是否逐行对齐
//
// 规则实现全在 bench/v3-spec.ts（测试与它共用）。写手交付前必须清零。

import {
  EVENT_NAMES, EVENT_TOKENS, TOPIC_TOKENS, V3_SIZE,
  checkAdditions, checkBridges, checkContinuers, checkKeyed, checkV3Pair, parseV3Doc,
} from './v3-spec.ts';
import { STATES as STATE_NAMES, TOKENS } from './v2-spec.ts';

const argv = process.argv.slice(2);

if (argv[0] === '--pair') {
  const bad = checkV3Pair(parseV3Doc(argv[1]), parseV3Doc(argv[2]));
  console.log(bad.length ? `❌ pair mismatch (${bad.length})\n` + bad.join('\n') : '✅ pair aligned');
  process.exit(bad.length ? 1 : 0);
}

if (argv.length !== 1) {
  console.error('usage: check-v3-copy.mjs <file.md> | --pair <zh> <en>');
  process.exit(2);
}

const path = argv[0];
const doc = parseV3Doc(path);
const bad = [];
const parts = [];

if (doc.continuers.length) {
  parts.push(`continuers ${doc.continuers.length}（全量目标 ${V3_SIZE.continuers}，这里是本文件）`);
  bad.push(...checkContinuers(doc.continuers, doc.lang));
}
const eventNames = Object.keys(doc.events);
if (eventNames.length) {
  parts.push(`events ${eventNames.map((n) => `${n}:${doc.events[n]?.length ?? 0}`).join(' ')}`);
  bad.push(...checkKeyed('event', doc.events, eventNames, (n) => EVENT_TOKENS[n] || [], doc.lang));
}
const topicNames = Object.keys(doc.topics);
if (topicNames.length) {
  parts.push(`topics ${topicNames.join(' ')}`);
  bad.push(...checkKeyed('topic', doc.topics, topicNames, () => TOPIC_TOKENS, doc.lang));
}
const addStates = Object.keys(doc.additions);
if (addStates.length) {
  parts.push(`additions ${addStates.join(',')}`);
  // 只做结构校验：组数下限=1，真正的"≥8 组 / ≥45%"由 check-v3-merged 在合稿后查。
  bad.push(...checkAdditions(doc, STATE_NAMES, (s) => TOKENS[s] || [], 1));
}
if (doc.bridges.length) {
  parts.push(`bridges ${doc.bridges.length}`);
  bad.push(...checkBridges(doc.bridges, STATE_NAMES, doc.lang));
}
if (!parts.length) {
  bad.push('文件里没有任何可识别的层（小节标题要用 `## continuers — ` / `## events — ` / '
    + '`## topics — ` / `## <state> — ` / `## bridges — `）');
}

console.log(`[${doc.lang}] ${path}  ${parts.join(' | ') || '（空）'}`);
if (bad.length) {
  console.log(`\n❌ ${bad.length} 个问题：`);
  console.log(bad.slice(0, 60).join('\n'));
  if (bad.length > 60) console.log(`… 另有 ${bad.length - 60} 个`);
  process.exit(1);
}
console.log(`✅ 通过（continuers 目标 ${V3_SIZE.continuers}，每事件 ${V3_SIZE.event}，每话题 ${V3_SIZE.topic}）`);
