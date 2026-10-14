// 把 106 个现成动作重新分派给 24 个状态（V2），并改写 catalog.ts 的 `states` 表。
//
//   node bench/assign-states.mjs --check    只看校验结果，不写文件
//   node bench/assign-states.mjs            校验通过后改写 src/skin/catalog.ts
//
// 为什么改 catalog：状态从 9 个扩到 23 个（+2 反应），新状态若没有动作就一律回落到
// idle 的动画——她会"看起来没在做事"，那这次扩张就白做了。catalog 是**冻结的手改数据**，
// `states` 表在文件末尾，所以这里做定点替换，不碰 15 MB 的像素数据。
//
// 分派原则：每个动作落到"它的动作语义最像的那件事"上，不是按名字平均分。
// 允许**故意共享**的动作：一个动作可以同时被多个状态播放（设计上就支持）。

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = join(ROOT, 'src/skin/catalog.ts');
const CHECK_ONLY = process.argv.includes('--check');

/** 允许被多个状态共享的动作（其余必须恰好一次）。 */
const SHARED = new Set(['haqian-liantian']);

const MAP = {
  idle: [
    'daiji-huxi-xiuxian', 'jingyu-tu-paopao-texiao', 'chenjian-shuaya', 'chaoda-shenlanyao',
    'dangqiuqian', 'lu-mao', 'yaoshan-naliang', 'sanqiu-paojie', 'wan-youxi-qijibaituai',
    'chi-baifan', 'chi-chongyanggao', 'chi-labazhou', 'chi-niangao', 'chi-qingtuan',
    'chi-tanghulu', 'chi-wancan', 'chi-wucan', 'chi-zaocan', 'chi-xigua', 'chi-zongzi',
    'chijiaozi', 'chitangyuan', 'zhongqiu-shangyue-chi-yuebing', 'cha-zhuyu-shangju', 'chui-dizi',
  ],
  sleep: ['yuandi-xiaoqi-chenmian', 'haqian-liantian', 'beiluoye-yanmo', 'menghua-xiaoyouling'],
  woken: ['da-keshui-bei-jingxing', 'haqian-liantian'],
  petted: [
    'dianji-huiying-kaixin-yuedong', 'dianji-huiying-naoyang-gegexiao', 'dianji-huiying-yuanqi-huishou',
    'dianji-huiying-aojiao-shengqi-ceshen-zhanshi', 'beishubiao-tuozhuai-xuankong-fankui',
  ],
  think: ['lanjing-xianshi', 'yuandi-piaofu-tabu', 'gongzuozhuangtai-sikao-maopao', 'suisuinian-fadai-suisuinian'],
  reasoning: ['shu-jin-zhou-mei', 'shendu-sikao-suisuinian', 'yuandi-zhuanxin-wan-mofang', 'suisuinian-cazhuo-suisuinian'],
  preparing: ['jin-dai-ding-dang', 'chui-qiqiu', 'chuanzhenqiqiao', 'zhengti-huanzhuang-shise'],
  stream: ['xiaotiqin-yanzou', 'suisuinian-duiping-suisuinian', 'youxian-hengga', 'chi-token'],
  shell: ['gongzuozhuangtai-manglu-dianan', 'yuandi-qiaoji-zhuomian-hudong'],
  read: ['zhao-jingzi', 'wu-shitou', 'chi-changshoumian'],
  search: ['pangxie-zoulu', 'gongzuozhuangtai-qingdian-guidang', 'dongzhangxiwang'],
  write: ['zhuangdian-shengdanshu', 'yuandi-zhongli-xiadun-yasuo', 'xie-fuzi', 'xie-daima', 'qingkuai-jilu'],
  web: ['fang-fengzheng', 'bian-gezi'],
  agent: ['dongwu-huanrao', 'hudie-mifeng-huanrao-touding-kaihua'],
  plan: ['xiawuziqi', 'fang-kongmingdeng'],
  deliver: ['youya-nvpuwu', 'pingkong-shenghua', 'keai-zhaiwu', 'puke-moshu'],
  tool: ['yuandi-dunxia-wan-wanju-qiche', 'chi-dazhaxie', 'shuan-huoguo', 'yuandi-tiaoyue-zhuasui-touding-wupin'],
  slow: ['chi-bingqilin-ronghua', 'beixiayitiao-zhamao', 'gongzuozhuangtai-yuandi-duobu-zhangwang', 'yong-jingyu-weiba-paidadi'],
  multi: ['chou-tuoluo', 'qi-muma', 'ti-jianzi', 'wan-shuiqiang', 'yuandi-zuozhuan-benpao'],
  approval: ['nvpu-quxi-liyi', 'dianji-huiying-haixiu-jingya'],
  question: ['shia-chishenme', 'fanghedeng'],
  planReview: ['duixueren', 'xiaofudu-yuandi-360du-xuanzhuan-zhanshi'],
  error: ['gongzuozhuangtai-chuitou-tanqi-maohan', 'fen-wen-bu-sheng', 'dai-kong-ru-xi', 'touchi-lingshi-bei-zhuazhu'],
  done: [
    'gongzuozhuangtai-queyue-qingzhu', 'fang-yanhua', 'shou-hongbao', 'qian-dai-man-yi',
    'qian-dai-ru-chang', 'chai-liwu', 'qingkuai-yaobaiwu', 'taotang-nanguadeng', 'dakou-chi-lingshi',
  ],
};

// ── 校验：catalog 里每个动作恰好被分派一次（共享的除外） ──
const raw = readFileSync(CATALOG, 'utf8');
const catalogIds = [...raw.matchAll(/"id":"([^"]*)"/g)].map((m) => m[1]);
const counts = new Map();
for (const [state, ids] of Object.entries(MAP)) {
  for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
}
const unknown = [...counts.keys()].filter((id) => !catalogIds.includes(id));
const unassigned = catalogIds.filter((id) => !counts.has(id));
const twice = [...counts].filter(([id, n]) => n > 1 && !SHARED.has(id)).map(([id]) => id);
const badState = Object.keys(MAP).filter((s) => !Array.isArray(MAP[s]) || MAP[s].length === 0);

console.log(`catalog 动作 ${catalogIds.length}；分派条目 ${[...counts.values()].reduce((a, b) => a + b, 0)}；状态 ${Object.keys(MAP).length}`);
for (const [state, ids] of Object.entries(MAP)) console.log(`  ${state.padEnd(11)} ${String(ids.length).padStart(2)}  ${ids.length ? '' : '⚠ 空'}`);
if (unknown.length) console.log(`❌ 不存在的 id：${unknown.join(' ')}`);
if (unassigned.length) console.log(`❌ 没被分派：${unassigned.join(' ')}`);
if (twice.length) console.log(`❌ 重复分派（未列入 SHARED）：${twice.join(' ')}`);
if (badState.length) console.log(`❌ 空状态：${badState.join(' ')}`);
if (unknown.length || unassigned.length || twice.length || badState.length) process.exit(1);
console.log('✅ 每个动作恰好归属一个状态（共享项除外），无空状态');

if (CHECK_ONLY) process.exit(0);

// ── 定点替换文件末尾的 states 表 ──
const at = raw.indexOf(',"states":');
if (at < 0) { console.error('❌ 找不到 ,"states": 段'); process.exit(1); }
const head = raw.slice(0, at);
const next = head + ',"states":' + JSON.stringify(MAP) + '}};\n';
writeFileSync(CATALOG, next);
console.log(`✅ 已改写 ${CATALOG}（${raw.length} → ${next.length} 字节）`);
