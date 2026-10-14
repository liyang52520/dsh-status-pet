# V3 补写简报（精准补足，不是重写）

> 规则与格式先看 `docs/v3-copy-brief.md`（§1 追加序列、§3 多样性、§5 自检）。
> 这一轮**只补**：① 序列占比不够的池 ② 英文的短句/开头指标。

## 1. 为什么要补（机器算出来的，不是感觉）

合稿后跑 `node bench/check-v3-merged.mjs` 会得到每个池的"序列句占比"。V3 的标准是 **≥45%**，
当前 16 个池在 38~44% 之间。差距已经算好，见下表——**照着组数补就行，不用自己算百分比**。

## 2. 补写方式

**新建一个文件**（不要改已有的 v3 文件），格式与 `docs/v3-copy-brief.md` §1 完全一样：

```markdown
## shell — 追加序列 (10 条)

| # | tone | seq | line |
|---|---|---|---|
| 1 | busy | 1/3 | 先看一眼它怎么起 |
| 2 | busy | 2/3 | …行，心里有数了 |
| 3 | busy | 3/3 | 那就敲下去 |
```

要点（与上一轮相同，再强调一遍）：

- 每组 **2~4 句**；组内音区一致；变量只在第 1 句；不加句号；无 emoji。
- 变量白名单与该状态一致（`read` `{file}{dir}`；`shell` `{cmd}{n}{secs}`；`search` `{file}{pat}{q}`；
  `write` `{file}{dir}`；`tool` `{skill}{n}{name}`；`multi` `{n}`；`web` `{q}{url}{secs}`；
  `deliver` 无；`approval` `{why}{name}`；`question`/`planReview` `{nq}`；`error`/`done` 无；
  `think`/`reasoning`/`stream` `{turn}{step}`）。
- **不要与已有任何一行重复**（已有的是 `docs/text-layer-copy-zh.md` 里的全部内容，包括 V2 老句；
  改完跑合稿会查）。
- **一组只讲一件事**：第 2 句起要读得出是第 1 句的继续。
- 中英两份**逐行对齐**（同条数、同 tone、同 seq）。

## 3. 各池要补多少（每语言）

| 状态 | 当前条数 | 当前序列句 | 占比 | 需补序列句 | **至少补几组** |
|---|---|---|---|---|---|
| `shell` | 86 | 34 | 40% | 10 | **4 组** |
| `tool` | 82 | 31 | 38% | 12 | **4 组** |
| `multi` | 66 | 25 | 38% | 10 | **4 组** |
| `approval` | 78 | 31 | 40% | 8 | **3 组** |
| `question` | 84 | 34 | 40% | 8 | **3 组** |
| `error` | 84 | 34 | 40% | 8 | **3 组** |
| `done` | 84 | 34 | 40% | 8 | **3 组** |
| `read` | 82 | 34 | 41% | 6 | **2 组** |
| `write` | 82 | 34 | 41% | 6 | **2 组** |
| `search` | 78 | 33 | 42% | 5 | **2 组** |
| `planReview` | 80 | 34 | 43% | 5 | **2 组** |
| `think` | 78 | 34 | 44% | 3 | **1 组** |
| `reasoning` | 78 | 34 | 44% | 3 | **1 组** |
| `stream` | 78 | 34 | 44% | 3 | **1 组** |
| `web` | 70 | 31 | 44% | 2 | **1 组** |
| `deliver` | 58 | 25 | 43% | 3 | **1 组** |

（其余 8 个池已经达标，**不要动**。）

## 4. 顺带修英文的三个指标（只有 en 有问题）

| 池 | 问题 | 怎么修 |
|---|---|---|
| `idle` | 短句（≤20 字符）只占 11%，要 ≥15% | 补一组 **3 句都是短句**（≤20 字符，如 `Bubbles…` `Mm.` `Still here`） |
| `petted` | `I ` 开头的行有 14 条（23%），要 ≤20% | 把其中 **3 条**改成不以 `I ` 开头（用 `Aww` `That tickles` `So warm` 这类），**只改 en**，行的位置/tone/seq 不动 |
| `read` / `web` | 短句刚好卡在 15%/14% | 各补 **2 句短句**（≤20 字符）进已有或新增的组里 |

## 5. 自检

```bash
cd /Users/liyang/WebstormProjects/dsh-status-pet
node bench/check-v3-copy.mjs docs/v3/<你的中文>.md
node bench/check-v3-copy.mjs docs/v3/<你的英文>.md
node bench/check-v3-copy.mjs --pair docs/v3/<中文>.md docs/v3/<英文>.md
node bench/merge-v2-copy.mjs            # 看有没有跨池重复（必须 ✅ 无跨池重复）
node bench/check-v3-merged.mjs          # 看你负责的池是否已 ≥45%
```

注意：`check-v3-merged.mjs` 是看**整池**（合稿后）的，所以必须先 `merge` 再跑；你只改自己负责的池，别的池的报错忽略。
