# 上下文与状态扩张（V2）—— 设计契约

> 本文是 V2 的**唯一契约**：状态表、上下文变量、台词结构、量级、人设圣经、词库格式、验收。
> V1（文字层基础：状态真话 / 台词池 / 轮换 / dock 落点）仍见 `docs/text-layer-design.md`。
>
> 动机：V1 的台词「与用户在做的事情关系不大」——因为它只看得见 11 个状态名。
> V2 把它接到 DSH **真实可观测的上下文**上，并把状态从 9 个扩到 23 个。

---

## 0. 结论速览

| | V1（现状） | V2 |
|---|---|---|
| 状态 | 9 + 2 反应 | **22 + 2 反应** |
| 台词池 | 11 池 / 328 条 | **24 池 + 66 个桥接池 / 946 + 260 = 1206 条**（中英各一份） |
| 上下文 | 工具名 | 工具名→**类别**、**参数**（文件/命令/搜索词/URL/目标）、轮次、步号、耗时、并发、审批理由、提问内容、计划评审 |
| 连贯性 | 无（每条独立随机） | **序列**（同一状态里连着说）+ **桥接**（状态切换时的接话） |
| 音区 | 5 类，收窄候选 | 不变，仍是 5 类 |
| 落点 | dock 左/右/关 + 弹窗 | 不变 |

### 实现现状（已全部落地）

| 项 | 状态 | 位置 |
|---|---|---|
| 事实层（工具名→类别） | ✅ | `src/behavior/tool-catalog.ts`（54 个工具，未知一律兜底 `tool`） |
| 事实层（参数 → 变量） | ✅ | `src/behavior/context.ts`：`varsFromCall` / `varsForFacts` / `renderLine` |
| 事实采集（DSH 真信号） | ✅ | `src/view/seat.ts`：`toRunningTools` / `toPendingFact` / `toStreamKind`，全部带形状守卫 |
| 22 状态机 | ✅ | `src/behavior/facts.ts`，`test/pet.test.ts` 真值表 + **可达性**断言 |
| 台词 946 + 桥接 260 | ✅ | `docs/text-layer-copy-{zh,en}.md`（词源）→ `src/behavior/line-pools.ts` + `src/labels/lines/*`（生成） |
| 序列与桥接选择 | ✅ | `src/behavior/lines.ts` 的 `stepLines`，`test/lines-rotation.test.ts` |
| 默认美术分派 | ✅ | `bench/assign-states.mjs` → `catalog.ts` 的 `states` 表（106 个动作分给 24 个状态） |
| 契约与门禁 | ✅ | `bench/v2-spec.ts` 是唯一实现，CLI 与 `pnpm test` 共用；`test/lines.test.ts` 另加"文档↔源码不漂移" |
| 主包体积 | ⚠ 137 kB → **309 kB**（gzip 82 kB） | 1206 × 2 条文案进了 `client.js`；若日后嫌大，可照 artwork 的做法拆成懒加载分块 |

**三处与设计不同的实现决定**（以代码为准）：

1. **不订阅 `legacy.turnTimings`。** `{secs}` 只从"正在跑的那次调用"的 `time` 算——它出现的地方（`slow`/`shell`/`agent`/`web`）必然有一次带 `time` 的调用。那个 Map 的引用随 timeline 变动，订阅它等于让 dock 在流式过程中反复重渲染。
2. **`plan-review` 归一化成 `planReview`。** DSH 的 `PendingQuestion.kind` 是 `'question' | 'plan-review'`，事实层统一成状态名，`deriveState` 里不再出现连字符。
3. **音区只影响"下一次抽取"**（V1 已定），序列与桥接不受音区收窄影响——桥接自带音区，序列在写作时就锁定了组内音区一致。

---

## 1. 事实层（每一项都有代码证据）

### 1.1 来源与字段

| # | 来源 | 字段 | 证据 |
|---|---|---|---|
| F1 | `useChat(s => s.legacy.runningCalls)` | 数组。每项 `{phase:'preparing'\|'start'\|'result', callId, name, argsRaw?, turn, step, time, subCalls[]}` | `chat` bundle `rootCall()`：`phase/logical start + name + argsRaw + turn + step + time + subCalls` |
| F2 | `useChat(s => s.legacy.partial)` | `{turn, step, blocks[]}` 或 null。block.kind ∈ `text \| reasoning \| tool-call \| image` | `toAssistantBlock()` / 流式 chunk 累积 |
| F3 | `useChat(s => s.legacy.turnTimings)` | `Map<turn, {startTime, endTime?}>` | `LegacySliceBuilder.updateTimeline` |
| F4 | `useSessionStatus` map | `{running, pendingInteraction, completionUnread}`，`pendingInteraction` 是**实例** | `ui-session` `publishStatus()` |
| F4a | ↳ 审批 | `PendingApproval{kind:'approval', toolName, callId, reason, displayReason, key}` | `ui-approval` 类字段 |
| F4b | ↳ 提问 | `PendingQuestion{kind:'question', questions[], callId, key}` | `ui-user-questions` 类字段 |
| F4c | ↳ **计划评审** | `PendingQuestion{kind:'plan-review', …}` | `this.kind = planReviewOf(questions) === undefined ? "question" : "plan-review"` |
| F5 | `useSession` | `running`, `pendingSubmissions[]`, `openState`, `lastAgentError`, `promptError` | 既有用法 |

**铁律**：以上全部是**只读的、可缺席的**。任何一个字段缺失都必须退化成 V1 的行为，绝不抛错、绝不留白。读取一律走「形状守卫」（`typeof x === 'string'`、`Array.isArray`）。

### 1.2 工具全集（48 + 4）

`tool.call.toolview` 的注册键即 wire 工具名：

```
ask_user_question bash cordis_inspect_list cordis_inspect_query cordis_inspect_self
create_goal edit get_goal glob grep interrupt_agent job_kill job_list job_output
list_agents list_subagent_models lsp ralph read read_image schedule_create
schedule_delete schedule_list schedule_update send_message session_event_read
session_event_search session_event_trace session_search session_trace spawn_teammate
subagent team_task_create team_task_get team_task_list team_task_update terminal_close
terminal_list terminal_open terminal_read terminal_signal todo_write update_goal
wait_agent web_fetch web_search workflow write
```
另有：`present`（deliverables）、`skill`、`cordis_define/run/stop/undefine`。
**未知名字必须落到 `tool` 状态**——工具集会继续长。

### 1.3 参数抽取（`argsRaw` → 变量）

`argsRaw` 是 JSON 字符串。解析失败（截断/流式）→ 所有变量为空，绝不抛错。

| 变量 | 抽取规则 | 备注 |
|---|---|---|
| `{cmd}` | `command` → 单行化、截断 34 字符 | bash / pwsh / terminal_* |
| `{file}` | `file_path` \| `path` → **basename** | read / write / edit / read_image / lsp |
| `{dir}` | 同上的目录部分（相对 cwd 时保留相对路径） | |
| `{pat}` | `pattern` \| `glob` | grep / glob |
| `{q}` | `query` \| `queries[0]` | web_search / session_search |
| `{url}` | `url` → 去掉协议、截断 28 字符 | web_fetch |
| `{task}` | `subject` \| `description`（截断 18 字符） | team_task_* / job_* |
| `{agent}` | `target` \| `name` | spawn_teammate / send_message |
| `{goal}` | `objective`（截断 16 字符） | create_goal |
| `{skill}` | `name` | skill |
| `{n}` | 正在跑的工具数；`{turn}`；`{step}` | 来自 F1/F2 |
| `{secs}` | `now - time`（F1）或 `now - turnTimings[turn].startTime`（F3），整数秒 | |
| `{nq}` | `questions.length` | 审批/提问 |
| `{why}` | `reason` \| `displayReason`（截断 20 字符） | 审批 |

**长度上限同样是硬约束**：所有变量替换后，整句仍须满足长度上限（见 §7）。

---

## 2. 状态表（22 + 2）

优先级**从上到下**，第一个命中即状态。每一条都有真实信号。

### A. 你欠她一个回答（最高）
| # | 状态 | 信号 | 身体语言 |
|---|---|---|---|
| 1 | `approval` | F4a `kind==='approval'` | 举牌/屈膝礼：**停下来等你点头** |
| 2 | `question` | F4b `kind==='question'` | 歪头/冒问号：**等你回答** |
| 3 | `planReview` | F4c `kind==='plan-review'` | 双手摊开计划书：**请你过目计划** |

### B. 她在做（按"动作的性质"分家）
| # | 状态 | 信号 | 身体语言 |
|---|---|---|---|
| 4 | `multi` | F1 长度 ≥ 2 | 手忙脚乱，同时照看几件事 |
| 5 | `preparing` | 首个 running call `phase==='preparing'`，或 F2 末块 `tool-call` | 数工具、卷袖子：**参数还没凑齐** |
| 6 | `shell` | name ∈ shell 类 | 敲键盘/敲桌面：**跑命令** |
| 7 | `read` | name ∈ read 类 | 凑近看：**读东西** |
| 8 | `search` | name ∈ search 类 | 东张西望：**找东西** |
| 9 | `write` | name ∈ write 类 | 提笔：**改文件** |
| 10 | `web` | name ∈ web 类 | 放线/变戏法：**从网上取回来** |
| 11 | `agent` | name ∈ agent 类 | 招呼小动物：**派人去做** |
| 12 | `plan` | name ∈ plan 类 | 摆棋/放灯：**记下来、排计划** |
| 13 | `deliver` | name === `present` | 双手递上：**交到你手上** |
| 14 | `tool` | 其余任何工具（含未知） | 通用干活 |
| 15 | `slow` | 首个 running call 已跑 ≥ `TUNING.slowToolMs`（45 s） | 抖腿/看钟：**这一步有点久** |
| 16 | `reasoning` | F2 末块 `reasoning` | 碎碎念/转圈：**在想** |
| 17 | `stream` | F2 末块 `text` | 打字：**在说** |
| 18 | `think` | running 但既无调用也无输出 | 发呆/冒泡：**刚收到，还没开口** |

> `multi` 与 `preparing` 在类别之前：同时跑两件事时，"她忙不过来"比"她在读第 2 个文件"更像话。
> `slow` 在类别之后但**覆盖**类别——超过 45 秒，"等待"才是当下的事实；类别仍作为变量进入台词（`{tool}` / `{secs}`）。

### C. 结果与休息
| # | 状态 | 信号 | 身体语言 |
|---|---|---|---|
| 19 | `error` | `errored`（F5） | 垂头/叹气 |
| 20 | `done` | `completionUnread` 且未在跑 | 雀跃/撒花 |
| 21 | `sleep` | 空闲 ≥ sleepAfterMs | 睡 |
| 22 | `idle` | 兜底 | 待机 |
| 23 | （`woken` 反应） | 睡眠时悬停/聚焦 | 惊醒 |
| 24 | （`petted` 反应） | 点击 | 害羞 |
| 25 | `enabled===false` → `idle` | 装饰模式 | |

**状态名规范**：小写字母或 camelCase（`planReview`），必须能当对象键与 CSS 类名。

### 2.1 类别归属表（工具 → 状态）

| 状态 | 工具名（wire） |
|---|---|
| `shell` | `bash` `terminal_open` `terminal_read` `terminal_signal` `terminal_close` `terminal_list` `job_kill` `job_output` `job_list` |
| `read` | `read` `read_image` `lsp` `session_event_read` `session_event_search` `session_event_trace` `session_search` `session_trace` `list_subagent_models` `get_goal` `team_task_get` `team_task_list` `list_agents` `job_output` |
| `search` | `grep` `glob` |
| `write` | `edit` `write` `session_event_*`（写回？否——见下） `todo_write`（否，见 plan） |
| `web` | `web_fetch` `web_search` |
| `agent` | `subagent` `spawn_teammate` `send_message` `wait_agent` `interrupt_agent` `team_task_create` `team_task_update` `list_agents`（重复则取先声明者） |
| `plan` | `todo_write` `create_goal` `update_goal` `get_goal` `schedule_create` `schedule_update` `schedule_list` `schedule_delete` |
| `deliver` | `present` |
| `tool` | 其余全部（`workflow` `ralph` `skill` `cordis_*` `ask_user_question` …） |

**一个工具只能属于一个类别**，重复出现以后者为准由测试抓（`toolCategories` 的逆映射必须无重复）。上表里的重复项在实现时只保留一处（标注处即取舍）。

---

## 3. 台词结构

一条台词有三种身份，池文档用一列区分：

| 身份 | 含义 | 例 |
|---|---|---|
| **独立**（standalone） | 说完就完，任何时候都能说 | `就在这里飘着…` |
| **序列**（sequence） | 属于一串连续的短句，按序说；同一状态、同一事实签名下优先接上一条 | seq `read-1`：`① 正在翻 {file}…` → `② …嗯，找到了` → `③ 再看看下一处` |
| **桥接**（bridge） | 状态**切换**时说的话，把上一句接住 | `think>shell`：`想好了，动手～` |

### 3.1 选择算法（`stepLines` 扩展）

```
输入：state, prevState, key(事实签名), tone, vars, elapsedMs, reducedMotion, rotation

R0  reducedMotion → 只在 state/key 变时抽
R1  state 变：
      if BRIDGE[prevState>state] 非空 → 从桥接池抽（不参与音区收窄，桥接自带音区）
      else → 从 state 池抽，且**不**接着上一句的序列
R2  key 变（同状态）→ 从 state 池抽，序列重新开始（事实变了，话头要换）
R3  计时耗尽（同状态同 key）：
      if 上一条属于某序列且该序列有下一条 → **接上**（概率 1，除非该序列标了 jitter）
      else → 从"独立 + 序列首句"里抽，排除上一条与刚说过的
R4  音区：候选 = 池中 tone 命中项；交空 → 整池（**不退而求其次到别的状态**）
R5  永不重复上一条（池长 > 1）
```

**为什么 R3 的序列用概率 1**：连接感来自"必然接上"。随机中断会立刻露馅。序列只有 2~3 句，说完自然回到独立句。

### 3.2 序列的写作规矩

- 序列是**同一个状态、同一个话头**的推进，不跨状态（跨状态用桥接）。
- 第 2 句起必须能独立成立为"上一句的继续"：多用 `…`、`嗯`、`再`、破折号。
- 一个序列 2~3 句，**不得**用到不同的事实变量（`{file}` 在第一句定下，后面不再重复）。
- 序列内的音区必须一致。

### 3.3 桥接的写作规矩

- 只写"接话 + 进入下一件事"，不重复新状态的信息（那句由状态池说）。
- 长度 ≤ 12 汉字 / ≤ 36 字符。
- 每对重要转移写 3~6 条；穷举 23×23 不现实，只覆盖下表列出的对子，其余无桥接池 = 直接说状态台词。

**必须覆盖的转移对**（其余可选）：
`think>shell` `think>read` `think>write` `think>search` `think>web` `think>plan` `think>agent`
`read>write` `read>search` `search>read` `shell>read` `shell>write` `write>shell` `write>done`
`agent>done` `web>write` `plan>shell` `preparing>shell` `preparing>read` `preparing>write`
`multi>*`（只写 `multi>read` `multi>shell` `multi>write`）`slow>done` `slow>error`
`stream>done` `reasoning>stream` `reasoning>shell` `done>idle` `idle>think` `error>think`

---

## 4. 上下文变量白名单（**测试强制**）

| 变量 | 允许出现的池 |
|---|---|
| `{cmd}` | `shell` |
| `{file}` | `read` `write` `search`（grep 的目标文件） |
| `{dir}` | `read` `write` |
| `{pat}` | `search` |
| `{q}` | `search` `web` |
| `{url}` | `web` |
| `{task}` | `agent` `plan` |
| `{agent}` | `agent` |
| `{goal}` | `plan` |
| `{skill}` | `tool` |
| `{n}` | `multi` `tool` `shell` `agent` |
| `{turn}` `{step}` | 任意池（低优先，建议只在 `think` / `stream` / `done` 用） |
| `{secs}` | `slow` `shell` `agent` `web`（长任务） |
| `{nq}` | `question` `planReview` |
| `{why}` | `approval` |
| `{name}` | `tool` `approval`（V1 遗留；= 工具名。审批池用它指"要批准的是哪个工具"） |

- 变量缺失时**整句仍然成立**：抽取器把空变量替换为空串并做**空白收敛**（连续空格、`（）`、`「」` 空对、行首尾标点重复都要处理）。因此禁止写「只有变量撑得住」的句子：
  - ❌ `正在读 {file}` → 缺 file 时变成 `正在读 `（难看）
  - ✅ `正在读 {file}` 这类句式只允许出现在 `read` 池，且 `read` 一定有 file；但保险起见写作 `读 {file}` / `正在读文件 {file}`，并**在测试里对"变量全空"跑一遍渲染**，断言无空括号、无连续空格、无行尾孤立标点。

---

## 5. 量级目标

| 池 | 条数 | 其中序列 | 音区配比（calm/bright/busy/formal/worry） |
|---|---|---|---|
| `idle` | 56 | 3 组 ×3 | 28/16/4/6/2 |
| `sleep` | 30 | 1 组 ×3 | 24/3/0/0/3 |
| `woken` | 20 | — | 10/2/0/2/6 |
| `petted` | 28 | — | 4/20/0/2/2 |
| `think` | 44 | 3 组 ×3 | 8/4/28/2/2 |
| `reasoning` | 44 | 3 组 ×3 | 6/2/32/0/4 |
| `preparing` | 36 | 3 组 ×3 | 4/8/20/4/0 |
| `stream` | 44 | 3 组 ×3 | 6/4/30/2/2 |
| `shell` | 52 | 3 组 ×3 | 2/6/30/4/10 |
| `read` | 48 | 3 组 ×3 | 10/4/28/4/2 |
| `search` | 44 | 3 组 ×3 | 4/6/28/2/4 |
| `write` | 48 | 3 组 ×3 | 6/6/30/4/2 |
| `web` | 36 | 2 组 ×3 | 4/6/20/4/2 |
| `agent` | 40 | 3 组 ×3 | 4/8/22/6/0 |
| `plan` | 40 | 3 组 ×3 | 8/8/18/6/0 |
| `deliver` | 24 | — | 2/12/2/8/0 |
| `tool` | 48 | 2 组 ×3 | 4/6/30/4/4 |
| `slow` | 32 | 2 组 ×3 | 6/4/10/4/8 |
| `multi` | 32 | — | 2/10/16/4/0 |
| `approval` | 44 | 2 组 ×3 | 2/8/0/16/18 |
| `question` | 40 | — | 6/2/10/6/16 |
| `planReview` | 36 | — | 6/4/6/12/8 |
| `error` | 40 | — | 6/0/0/6/28 |
| `done` | 40 | — | 6/24/0/8/2 |
| **小计** | **~1000** | **53 组序列** | |
| `bridges` | **~120** | — | 按转移对分配（见 §3.3） |

中英两份，共 **约 2200 条**。允许 ±10% 偏差，但**每个池不得低于上表**。

---

## 6. 人设圣经（**所有写手必须遵守**）

**她是谁**：鲸鱼娘，一条住在状态栏里的小女仆鲸鱼。给一个正在干活的 agent 打下手。
**她对你**：称"你"（英文 `you`），不做作、不撒娇过度，偶尔一点点得意和一点点委屈。
**她在干什么**：把 agent 正在做的事，用自己的话复述一遍——**这是她的全部工作**。

| 规则 | 要求 |
|---|---|
| 长度 | 中文 ≤ 16 字（含变量占位符按**替换后的上限**估：`{file}` 记 4 字、`{cmd}` 记 6 字）；英文 ≤ 48 字符 |
| 结尾 | 不加句号。用 `…` `！` `～` `♪` 或直接结束 |
| 人称 | 第一人称；对"你"说话；不说"用户" |
| 口吻 | 温软、利落、有分寸。**不许**：卖惨、自责过度、说教、翻译腔、网络烂梗、颜文字堆砌 |
| 颜文字 | 允许，但**每池 ≤ 1/5 条目**；只准用 `(・ω・)` `(๑•̀ㅂ•́)` `>_<` `(´･ω･`)` `(・_・;)` `(๑˃̵ᴗ˂̵)` |
| emoji | **绝对禁止**（🐋 ✨ 💤 一律不许）。`…` `～` `♪` `！` 可以 |
| 具体性 | **每条都必须提到"她正在做的那件事"**。禁止"我努力着呢"这种放之四海皆可的空话——这是 V1 最大的毛病 |
| 变量 | 只使用 §4 允许的变量；**不许**发明变量 |
| 重复 | 同一句不得跨池重复（测试全局查重） |
| 事实诚实 | 她**可以说错语气，不可以陈述错事实**：`search` 池不许说"读完了"；`shell` 池不许说"改好了"；`error` 池不许说成功 |
| 序列 | 一个序列内音区一致、话头一致、变量只在首句出现 |
| 英文 | **按英语语感独立写**，不是直译；长度与语气对齐，不要求逐字对应 |

**五路口气（音区）**，每一条必须属于其一：

- `calm` 安静飘着、哼歌、慢半拍
- `bright` 雀跃、得意、快活、被摸
- `busy` 专注、边干边碎碎念、报进度
- `formal` 女仆礼仪、恭敬、请示、报告
- `worry` 不安、等你、怕做错、失败

**写作示范（`shell` 池，注意"具体"与"变量"）**

| tone | seq | 中文 | English |
|---|---|---|---|
| busy | | 正在跑 `{cmd}` | Running `{cmd}` |
| busy | | 命令发出去了，等它回来 | Sent the command, waiting on it |
| busy | 1/3 | 敲下去了… | Hit enter… |
| busy | 2/3 | …它还在跑 | …still going |
| busy | 3/3 | 快出结果了 | Almost out |
| formal | | 遵命，这就去执行 | As you wish, running it now |
| worry | | 这个命令好像卡住了 | This command looks stuck |
| calm | | 听着它噼里啪啦 | Listening to it clatter |

---

## 7. 词库文档格式（写手交付物）

每个池一节，一张表；`seq` 列为空 = 独立句，`1/3` = 该序列第 1 句（序列号用状态内序号）。

```markdown
## shell — 正在跑命令 (52 条)

| # | tone | seq | line |
|---|---|---|---|
| 1 | busy |  | 正在跑 {cmd} |
| 2 | busy | 1/3 | 敲下去了… |
| 3 | busy | 2/3 | …它还在跑 |
```

桥接单独一节：

```markdown
## bridges — 状态之间的接话 (120 条)

| from | to | tone | line |
|---|---|---|---|
| think | shell | bright | 想好了，动手～ |
```

- `#` 从 1 连续编号，是 id 的来源（`shell.07`）；桥接用 `bridge.<from>.<to>.<n>`。
- 中英两份文档**逐行对齐**：状态顺序、条数、tone、seq、from/to 完全一致，只有 `line` 不同（测试强制）。

---

## 8. 验收（测试断言清单）

| # | 断言 |
|---|---|
| A1 | 25 池的条数 ≥ §5 表；音区配比与表一致（±0，表就是标准） |
| A2 | 中英两份文档逐行对齐（条数 / tone / seq / from-to） |
| A3 | 文档 ↔ 源码不漂移（重解析文档比对生成的 TS） |
| A4 | 变量白名单：每个池只出现 §4 允许的变量 |
| A5 | 长度上限（含变量按替换上限估算）、无句号结尾、无 emoji、颜文字 ≤ 1/5 |
| A6 | 全局查重（跨池、跨语言各自查） |
| A7 | 序列完整性：每组序列 2~3 句、序号连续、音区一致、变量只在首句 |
| A8 | 桥接：`from`/`to` 必须是真状态名；§3.3 的必覆盖对子全部存在；每对 ≥ 3 条 |
| A9 | 变量全空渲染：每句在"所有变量替换为空"后仍然合法（无连续空格、无空括号、无孤立标点） |
| A10 | `deriveState` 真值表：每个状态的信号组合都能命中，且优先级不回归 |
| A11 | 类别映射：48+4 个工具名落在预期状态，逆映射无重复 |
| A12 | 状态完整性：每个状态在 `catalog.states` 里至少 1 个动作；每个状态在 `LINE_POOLS` 里非空 |
| A13 | V1 既有断言不回归（状态真话键集、dock 三态设置、轮换 R1–R6） |

---

## 9. 分期

| 期 | 内容 |
|---|---|
| **S1 事实层** | ✅ `tool-catalog.ts` + `context.ts`（纯函数，`context.test.ts` / `tool-catalog.test.ts`） |
| **S2 状态机** | ✅ 22+2 状态；`deriveState` 新优先级；`pet.test.ts` 真值表 + 可达性 |
| **S3 美术默认分配** | ✅ `bench/assign-states.mjs`（每个动作恰好归一个状态，共享白名单显式声明） |
| **S4 台词层** | ✅ 序列/桥接结构 + `stepLines` 扩展 + `renderLine` + 生成器升级 + 契约模块 |
| **S5 落点** | ✅ dock/弹窗照旧；`view/line.ts` 传入新事实；三态设置与轮换不变 |
| **S6 文档** | ✅ AGENTS.md + 本文件 + V1 文档的现状表 |

---

## 10. 与 V1 的关系

- V1 的**状态真话 / 台词池分离、dock 拥有台词、三态设置、音区收窄**全部保留且不动。
- V1 的 11 个池被 V2 **重写并扩容**（`think`/`stream`/`tool` 等被细分），旧词条凡符合新规范的可以留用，但**必须按 V2 的"具体性"标准过一遍**：只描述状态名、不描述在做的事的句子一律重写。
- 旧状态名的兼容：`tool` 仍是状态（兜底类别），因此老词条不退化为孤儿。
