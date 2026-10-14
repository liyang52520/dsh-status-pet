# 对话层 V3 —— 让她"在跟你说话"，而不是"每 8 秒念一句"

> 契约。V1 = 文字层基础（`text-layer-design.md`），V2 = 上下文与状态扩张（`context-states-v2.md`），
> **V3 = 话语层**：让句子之间有记忆、有顿挫、有回应、有话题。
>
> 动机（用户原话）："对话还是不够自然，台词的切换也不够自然流畅。"
> ——这不是文案量的问题。V2 已经 1206 条/语言，但它**每次都是独立抽签**。

---

## 0. 诊断：不自然的六个结构成因

用数字说话（V2 实测）：

| # | 成因 | 证据 | V3 的修法 |
|---|---|---|---|
| 1 | **没有近期记忆**，会复读 | 轮换只知道"上一条是什么"，40 条的池子约 5 分钟就绕回来 | **近期窗口（shuffle-bag）**：24 条之内不重复 |
| 2 | **只有 13% 是序列句** | 946 条里只有 123 条属于序列；`error/done/question/planReview/multi/deliver/woken/petted` **零序列** | 每池 **≥8 组**序列，长度 2~4，序列句占比 **≥45%** |
| 3 | **节拍是节拍器** | 每条都停 7~9.5 秒，均匀 | **顿挫与成串**：25% 的情况下 1.2~2.6 秒就接第二拍；串长上限 3 |
| 4 | **没有话语填充词** | 池里全是"实句"，没有"嗯/…好/（点头）" | 新层 **continuers**（≤5 字），夹在实句之间，不打断序列 |
| 5 | **不回应你的动作** | 你排队发言、批准、回答、点开它——她照旧念状态台词 | 新层 **events**：事实的**边沿**触发，抢占当前轮换 |
| 6 | **没有话题连续** | 换了文件、又回到同一个文件，话不变 | 新层 **topics**：同一个目标 / 换了目标 / 第 n 个目标 |

另外两条"久了就腻"的成因：
- **句式与长度单一**：全池都是 8~16 字、结尾都是 `…` → 契约新增**多样性约束**（长度分布、结尾分布、开头重复上限）。
- **桥接是一次性的**：换状态说一句就没了 → 桥接池现在**可以是 2 行序列**（接话 + 续一句）。

---

## 0.1 实现现状（已落地）

| 项 | 状态 | 位置 |
|---|---|---|
| 话语引擎（纯函数） | ✅ | `src/behavior/discourse.ts`：`stepDiscourse` / `topicEdge` / `moodTone` / `detectEdges` 的输入侧 |
| 近期窗口（shuffle-bag） | ✅ | `TUNING.lineRecentWindow = 24`，池子小于窗口也不空手（逐级放宽） |
| 顿挫与成串 | ✅ | `lineMaxBeat` / `lineBurstChance` / `lineBurstMs` |
| 填充词夹层 | ✅ | `TUNING.lineContinuerChance`，**不打断序列记忆**（`keepGroup`） |
| 事件抢占（10 个边沿） | ✅ | `view/seat.ts` 的 `detectEdges` + dock 的 popupOpen/Close；引擎 E0 |
| 话题连续（3 个） | ✅ | `topicEdge` + `lastTopicSpoken`（**说过就不再啰嗦**） |
| 心情与连击 | ✅ | `moodTone`（连败偏 worry / 开场偏 bright / 做久了偏 calm） |
| 桥接可带续句 | ✅ | 桥接池走同一条序列规则（`sourceCanSequence`） |
| 契约 | ✅ | `bench/v3-spec.ts`（新增四层 + 多样性六条）；CLI `check-v3-copy.mjs` / `check-v3-merged.mjs` |
| 测试 | ✅ | `test/discourse.test.ts`：31 项，含**真实数据**的四层冒烟与序列接续 |

**数据（每语言，合稿后）**

| 层 | 量 |
|---|---|
| 状态池 | **2105** 条 / 24 池（`idle` 113、`read` 122、`tool` 105…） |
| 序列组 | 每池 **10~29 组**（V2 是 0~3 组），序列句占比 **≥45%**（V2 全局 13%） |
| 桥接 | **533** 条 / 103 个转移对，其中一部分是 2 行接话 |
| 填充词 | **200** 条 |
| 事件 | **240** 条（10 个边沿 × 24） |
| 话题 | **120** 条（3 个 × 40） |
| **合计** | **3198 条/语言**（6396 条文案） |

逐池条数与音区配比的标准值在 `bench/v2-spec.ts` 的 `SPEC`（冻结基线，`--update-baseline` 写入一次）。
文风、变量、音区、序列、中英对齐、跨层查重，全部由 `test/lines.test.ts` 在 `pnpm test` 里强制；
**18 个测试文件、158 项测试**。

---
---

## 1. 数据模型（新增四层）

```
PoolLine = { id, tone, group?, at?, of? }          // 序列用 group/at/of（of 可到 4）
CONTINUERS : readonly PoolLine[]                    // 填充词，任何状态都能说
EVENTS     : Record<EventName, readonly PoolLine[]> // 按"边沿"触发
TOPICS     : Record<TopicName, readonly PoolLine[]> // 按"话题变了没"触发
BRIDGE_SPECS : Record<'from>to', readonly PoolLine[]>  // 现在可含序列
```

id 规则不变：`<池>.<两位序号>`；桥接 `bridge.<from>.<to>.<两位>`；新增
`continuer.<两位>`、`event.<name>.<两位>`、`topic.<name>.<两位>`。

## 2. 量级目标（**每语言**）

| 层 | 池 | 条数 | 说明 |
|---|---|---|---|
| 状态池追加序列 | 24 | **≈650** | 每池补到 **≥8 组**序列（2~4 句），追加在各自文件里 |
| `continuers` | 1 | **200** | ≤5 字 / ≤18 字符，无变量，tone ∈ calm/busy/formal |
| `events` | 10 | **240** | 每事件 24 条 |
| `topics` | 3 | **120** | 每话题 40 条 |
| `bridges` | 66→**~110** | 260 → **520** | 覆盖更多转移 + 重要转移带 2 行序列 |
| **新增小计** | | **≈1730** | |
| **合计** | | **≈2680** | V2 的 1206 + 新增 |

### 2.1 十个事件（= 事实的边沿）

| id | 边沿 | 她该说的话 |
|---|---|---|
| `greet` | 本次页面里第一次看到她 | 初次照面（她刚"上线"） |
| `queue` | `pendingSubmissions` 0→N | "收到，我先把手头这个收尾" |
| `approvalDone` | 审批等待消失（**结果中性**：分不清批准/拒绝） | "好，那我继续" / "行，我停下" |
| `answered` | 提问 / 计划评审消失 | "明白了" |
| `failed` | `errored` false→true | 立刻承认失败 |
| `cleared` | `errored` true→false | 松一口气 |
| `retry` | `errored` 清了**且**又跑起来 | "这次我小心点" |
| `firstTool` | 本轮第一个工具开始 | 开工宣言 |
| `popupOpen` | 你点开了弹窗 | 被注意到 |
| `popupClose` | 你关上了 | 目送 |

> `approvalDone` 必须**结果中性**：客户端只能观察到"等待消失了"，观察不到你点了哪个按钮。她不许假装看见你的选择。

### 2.2 三个话题

| id | 何时说 | 例 |
|---|---|---|
| `topicNew` | 当前目标（`{file}`/`{cmd}`/`{pat}`/`{q}`）与她上次说的目标**不同** | "换下一个了" |
| `topicSame` | 与上次说的**相同** | "又回到 {file}" |
| `topicMany` | 本轮第 4 个以上目标（`{n}` ≥ 4） | "这个已经是第 {n} 个了" |

话题只在 `read / write / search / shell / web / tool` 六个池适用（只有它们有目标）。

## 3. 选择算法（`stepDiscourse`，纯函数）

```
输入：state, key, tone, vars, now, events[], running, errored
状态：lastId, recent[24], lastGroup, beat, state, key, remainingMs,
      topic, spokenCount, failStreak, greeted

E0 事件抢占   events 非空 → 取第一个事件的池（排除 recent）→ layer=event, beat=0
              停顿 1.5~3.0 s（反应要快）
E1 状态切换   prev.state !== state → 有桥接就抽桥接（layer=bridge），否则状态池
              beat=1；停顿 7.0~9.5 s
E2 停顿耗尽   **顺序很重要**（实现顺序 = 优先级）：
              ① 话题边沿  目标都换了 → 旧话已经过期 → 先说她注意到了
              ② 填充词    "嗯…"（插话）—— 见下
              ③ 序列      上一条还有下一句 → **必然**接上（层不变），beat++
              ④ 状态池    新话头（只从独立句/序列首句里挑）
E3 填充词     beat ≥ 1 且状态是"长时间在跑"的（shell/read/write/web/agent/slow/multi）
              且 random < 0.22 → 抽 continuers
              **两个关键点**：keepGroup（填充词之后序列还能接着说完）
                             source 不变（填充词是**插在**当前这件事里，不是换了一件事）
E4 成串       beat < 3 且 random < 0.25 → 停顿缩到 1.2~2.6 s（第二拍）
E5 近期窗口   候选里排除 recent 里的 id；排除到空 → 只排除最近 4 条
E6 音区       候选 = 动作音区 ∩（心情偏好音区）→ 退动作音区 → 退心情偏好 → 整池
E7 心情       failStreak ≥ 2 → 偏好 worry；spokenCount < 3 → 偏好 bright（新鲜）
              spokenCount > 120 且 failStreak = 0 → 偏好 calm（做久了，稳一点）
E8 新话头     抽取只在「独立句 + 序列首句」里挑 —— 绝不从半截开始（V2 规矩不变）
```

**为什么填充词不碰 `lastGroup`**：这是这一层最"像人"的地方。真实对话里你说到一半会插一句"嗯…"，然后**接着把话说完**。允许填充词穿插而序列记忆不断，才有这个效果。

## 4. 多样性约束（**机器强制**，接进唯一的契约实现）

每条按池检查：

| 约束 | 阈值 | 为什么 |
|---|---|---|
| 短句占比 | ≥15% 的条目 ≤6 字（zh）/ ≤20 字符（en） | 全池等长读起来像播报 |
| 结尾分布 | `…` 结尾 ≤30%；**完全不带结尾标点 ≥30%** | V2 的池子 `…` 泛滥，读久了有气无力 |
| 开头重复 | 任意「前 2 字」开头不得超过池内 20% | 防"正在…正在…正在…" |
| 序列占比 | ≥45%（`<状态>` 池） | 见 §0 成因 #2 |
| 序列组数 | ≥8 组（`<状态>` 池，V2 已有的算在内） | 同上 |
| 序列长度 | 2~4 句 | 4 句是给"一个完整的小观察"留的空间 |
| continuers | ≤5 字 / ≤18 字符，无变量，无结尾标点 | 填充词就得短 |

## 5. 人设（**不变**，见 V2 §6）

同一套人设圣经、同一套五路音区、同一套长度上限（正文 16 字 / 48 字符）。
V3 只加一条：**每个序列内部必须像同一个人的一口气**——第 2 句起多用 `…`、`嗯`、`再`、`还`、`然后`衔接，不许把两件不相干的事塞进一组。

## 6. 交付格式

**追加序列**（写手交付，文件名 `docs/v3/<state>-seq-{zh,en}.md`）：

```markdown
## error — 追加序列 (27 条)

| # | tone | seq | line |
|---|---|---|---|
| 1 | worry | 1/3 | 我把日志翻出来… |
| 2 | worry | 2/3 | …越看越心虚 |
| 3 | worry | 3/3 | 呜，是我干的 |
```

`#` 从 1 本地编号（合稿时会重排）；`seq` 的分母 2~4；组内音区一致；变量只在首句。

**新层**（文件名 `docs/v3/continuer-{zh,en}.md` 等）：

```markdown
## continuers — 填充词 (200 条)
| # | tone | line |
| 1 | calm | 嗯… |
```
```markdown
## events — 边沿反应 (240 条)
| # | event | tone | line |
| 1 | queue | bright | 收到，排上队了 |
```
```markdown
## topics — 话题连续 (120 条)
| # | topic | tone | line |
| 1 | topicNew | busy | 换下一个了 |
```

`## bridges` 沿用 V2 格式，但**允许 seq 列**（2 行桥接）。

## 7. 验收

| # | 断言 |
|---|---|
| B1 | 每池 ≥8 组序列、序列句占比 ≥45%、组长度 2~4 |
| B2 | 多样性六条（§4）全部满足 |
| B3 | continuers 200 / events 10×24 / topics 3×40 / bridges ≥520，且中英逐行对齐 |
| B4 | 变量白名单扩展到新层：continuers 无变量；events 见下表；topics 只用 `{file}` `{cmd}` `{pat}` `{q}` `{n}` |
| B5 | 三个话题池按"目标有没有变"被真正触发（纯函数测试：话题边沿 → 抽 topic 池） |
| B6 | 事件抢占：边沿触发时**不等到停顿**就换话，且用 event 池 |
| B7 | 近期窗口：连续 60 次抽取不出现 24 条以内的重复；池子小于窗口时不空手 |
| B8 | 成串：`beat < 3` 时可能 1.2~2.6 s 就接第二拍；`beat ≥ 3` 必回长停顿 |
| B9 | 填充词：只出现在长状态；出现后**序列仍能接上**（关键断言） |
| B10 | 心情：failStreak ≥2 偏好 worry；开头 3 条偏好 bright；≥120 条且无失败偏好 calm |
| B11 | 文档 ↔ 源码不漂移；中英逐行对齐；零 emoji、零重复、变量全空可渲染 |
| B12 | V2 既有断言与测试不回归（137 → 更多） |

### 4.1 events 的变量白名单

| 事件 | 允许 |
|---|---|
| `queue` | `{n}` |
| `approvalDone` | `{name}` `{why}` |
| `answered` | `{nq}` |
| `failed` / `cleared` / `retry` | 无 |
| `firstTool` | `{name}` |
| `popupOpen` / `popupClose` / `greet` | 无 |

## 8. 分期

| 期 | 内容 |
|---|---|
| **T1 契约** | 本文件 + `bench/v3-spec.ts`（新增四层 + 多样性六条 + 追加序列模式） |
| **T2 引擎** | `behavior/discourse.ts`（纯）：近期窗口 / 顿挫 / 填充 / 事件 / 话题 / 心情；`lines.ts` 变薄；`test/discourse.test.ts` |
| **T3 采集** | `view/seat.ts` 增加**边沿检测**（事件）与话题快照 |
| **T4 文案** | 追加序列 24 池 + continuers + events + topics + 扩展桥接（中英） |
| **T5 接线** | `view/line.ts` 换成话语引擎；dock/弹窗落点不变 |
| **T6 文档** | AGENTS.md + 本文件"实现现状" + V2 文档状态 |
