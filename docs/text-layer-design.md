# 文字层设计：状态说真话，台词说人话

> **⚠ V1 文档。** 状态与台词池的部分已被 `docs/context-states-v2.md` 取代（V2 把状态从 9 个扩到 22 个、台词从 328 条扩到 1206 条，并引入了上下文变量、序列与桥接）。
> 仍然有效的是**基础层**：状态真话 / 台词池分离、dock 拥有台词、三态落点设置、音区收窄、a11y 拆 live region。
>
> 设计文档。**本文不改 `src/` 任何代码**，只定方案与验收标准。
> 配套词库：`docs/text-layer-copy-zh.md`、`docs/text-layer-copy-en.md`。

---

## 0. 结论速览

| | 现在 | 本方案之后 |
|---|---|---|
| 文字条数 | 每个状态 **1** 条，共 11 条（+`toolNamed` 变体） | 台词池 **328** 条（11 池，20~40 条/池） |
| 文字出口 | tooltip、`aria-label`、弹窗标题，**三处同一句话** | tooltip / `aria-label` 仍是状态真话；弹窗正文改为轮换台词 |
| 归属 | 状态（单条） | **状态（池）**；动作只能通过「音区标签」收窄筛选 |
| 用户能改吗 | — | v1 不能（与动作库一致：只读 + 试听）；v3 可选自定义 |
| 存储 | `v:1` | **不变**（台词全部是编译期数据） |
| 新增依赖 | — | 无 |
| 新增轴 | — | **不加**。工作台仍是「状态 / 动作」两根 |

一句话：**把现在这条同时干两件事的文字，拆成「状态真话」和「台词池」两条；台词归状态，动作只有收窄权。**

---

## 0.1 实现现状（已落地）

| 项 | 状态 |
|---|---|
| 台词池 11 个 / 328 条 × 中英 | ✅ 已落地（`src/behavior/line-pools.ts`、`src/labels/lines/{zh,en}.ts`，由 `bench/port-lines.mjs` 从 `docs/text-layer-copy-*.md` 生成） |
| 选择与轮换 R1–R6 | ✅ 已落地（`src/behavior/lines.ts` + `src/view/line.ts`），`test/lines-rotation.test.ts` |
| 音区收窄 | ✅ 已落地（`src/skin/tones.ts` 106 条动作侧表；`platform/surface.ts` 只在**换动作**时回报，不逐帧） |
| 弹窗正文显示台词 | ✅ 已落地（`src/view/dock/popup.ts`），真话移入视觉隐藏的 live region |
| **状态栏台词（宠物左侧 / 右侧 / 关闭）** | ✅ 已落地（`src/view/dock/pill.ts` + `src/skin/display.ts` + `src/view/settings/dock-text.ts`），见 §6.4 |
| 用户偏好持久化 | ✅ `schema 1` 增加一个可选字段 `dockText`，不升版本 |
| 测试 | 83 → **109**（新增 `lines` / `lines-rotation` / `display` 三个文件） |
| 主包体积 | `client.js` 95 kB → **137 kB**（两份 328 条词条 ≈ +42 kB） |

与本设计的三处**偏差**（都是实现逼出来的，代码为准）：

1. **词条并入了 `labels/` 字典**（§4.1 原文说不要）。原因：池的**结构**是数组、可以独立，但池**条目**要在渲染时按 id 取文案，而 slot API 唯一能感知当前语言的入口就是 `t`——没有「当前 locale」这个 prop。所以条目并入字典，结构与文案仍然分在两个模块里。
2. **音区只影响「下一次抽取」**，不触发立即重抽。否则文字会跟着每 4~17 s 一次的动作轮换一起跳，读不成句。规则见 §5.2。
3. **弹窗里可见的台词不 `aria-hidden`**：它是可见正文，对读屏隐藏可见文字是反模式。被藏起来的是 **dock 上的文字标签**（按钮已有真名）与**轮换本身**（真话单独放在隐藏 live region，台词不在任何 live region 里）。

---

## 1. 现状：一句话，三个出口

今天文字只长在两个地方（tooltip 和弹窗正文），但同一句话被喂给了三个出口（tooltip、`aria-label`、弹窗标题）：

```
① 悬停状态栏的小宠物
        ┌──────────┐
        │ 思考中…   │   ← tooltip
        └────┬─────┘
            [🐋]          ← 32px 头像（src/view/dock/pill.ts）

② 点一下弹出面板
        ┌──────────────────┐
        │      🐋           │   ← 128px 全身
        │                  │
        │     思考中…       │   ← 12px 灰字，代码里叫 caption
        └──────────────────┘     （src/view/dock/popup.ts）
```

代码事实：

| 位置 | 代码 | 说明 |
|---|---|---|
| `src/view/dock/pill.ts:64-65` | `const title = named ? t('toolNamed', {name}) : t(face)` | 一句话同时喂给 `aria-label`、tooltip、弹窗 |
| `src/view/dock/popup.ts` | `h('div', {className:'status-pet-popup-title','aria-live':'polite'}, caption)` | 弹窗正文；`caption = reaction ? t(reaction) : props.title` |
| `src/labels/zh.ts` | `idle/sleep/think/…/woken` + `toolNamed` | 全量 12 个键 |

### 诊断：不是"绑错了"，是"一个槽位干了两件事"

这条字符串同时在承担：

- **(a) 机器真话** —— 屏幕阅读器用户唯一能知道"agent 正在等你批准"的通道。它由 `behavior/facts.ts` 的纯函数推导，有九状态真值表测试兜底。
- **(b) 宠物口吻** —— "害羞了""被叫醒了"这种卖萌。

要 (a) 就必须短、准、不许玩梗；要 (b) 就必须多、活、有性格。**一个槽位满足不了两边**——这就是"文字太少、不够生动"的真正成因。而且它已经在跟着事实变了（`toolNamed` 会插工具名），说明它本来就不是"状态名"，只是碰巧只有一条。

---

## 2. 两条文字，两种职责

| | ① 状态行（真话） | ② 台词（口吻） |
|---|---|---|
| 条数 | 11（状态数） | 328（池） |
| 谁写 | 系统 | 系统（v1）/ 用户（v3） |
| 依据 | `deriveState(facts)` | 状态池 + 事实 + 音区 + 轮换 |
| 必须准确 | **是**，是 App 对外的状态声明 | 否，是氛围 |
| 出现位置 | tooltip、`aria-label` | 弹窗正文 **+ 状态栏宠物旁边**（左/右/关，见 §6.4） |
| 会变吗 | 只在状态变时变 | 同一状态内也会轮换 |
| 可否本地化 | 是（`labels/`） | 是（沿同一机制） |
| 可否被换皮影响 | **绝不可以** | 可以（音区标签） |

红线：**台词永远不能是某个状态信息的唯一来源。** 台词轮换、缺席、本地化失败，都必须不影响用户判断 agent 在干什么。

---

## 3. 绑定决策：归状态，不归动作

### 3.1 结论

```
状态 ──决定──▶ 台词池  （池是一整串，不是一条）
动作 ──收窄──▶ 筛选范围（可选音区标签，不拥有任何文字）
事实 ──微调──▶ 具体哪一条（如 {name}）
```

### 3.2 为什么不能绑到动作上

**反例一：一个动作能被多个状态勾选。**
`src/labels/zh.ts` 的分配说明原文：「同一动作可被多个状态勾选」。默认表里 `gongzuozhuangtai-sikao-maopao`（思考冒泡）同时被 `think` 和 `question` 勾选。若文字挂在动作上，这一条文案要同时描述"正在思考"和"在等你回答"——只能写成不粘锅的废话；要么就得给每个状态复制一份动作，把「一个库 × 多状态勾选」的模型直接打碎。

**反例二：换皮会改掉 App 声称的状态。**
动作是**用户可换的衣服**（工作台「状态」轴就是干这个的）。文字若住在 artwork 数据里，用户把 `sleep` 的动画勾给 `approval`，tooltip 就可能变成"睡着啦"——而 agent 其实在等批准。这是正确性缺陷，不是审美问题。

**反例三：动作数据本身就不适合承载文案。**

| 事实 | 证据 |
|---|---|
| 动作的 `name` 是**硬编码中文**，不本地化 | `catalog.ts` 里 106 条：`待机呼吸循环`、`女仆屈膝礼`… |
| artwork 是**冻结、单行、15 MB**、按需拉取的分块 | AGENTS.md：`client.artwork.js` 15.6 MB |
| artwork 未到达时宠物照常显示 | 分块加载期间注册表为空，画布是空的但 UI 在 |
| 文案真源有对称性测试保护 | `test/labels.test.ts` 断言两语言键集完全相同 |

把 328 条文案塞进冻结的 15 MB 单行数据，等于：双份语言、无法 review、改一个字要动 15 MB 的文件，而且**第一批 tooltip 会在分块到达前是空的**。而 `labels/` 在 `client.js`（95 kB）里，永远可用。

**反例四：量根本不需要动作绑定。**
11 状态 × 20~40 条 = 328 条，中英各一份，体积不过几 kB。这个量级完全由「状态轴」提供。

### 3.3 动作保留"收窄权"：音区标签

想实现"换个动作，说话的口气也跟着变"，不需要转移所有权——**给动作打一个音区标签**，让状态池按音区筛。

五个音区（与词库一致）：

| 音区 | 含义 | 典型动作 |
|---|---|---|
| `calm` | 安静、飘、半睡、哼歌 | 待机呼吸循环、撸猫、原地小憩沉眠 |
| `bright` | 活泼、蹦跳、得意、庆祝 | 抽陀螺、雀跃庆祝、可爱宅舞 |
| `busy` | 专注、边干活边碎碎念 | 写代码、思考冒泡、清点归档 |
| `formal` | 女仆礼仪、端庄、恭敬 | 女仆屈膝礼、优雅女仆舞、变鸽子 |
| `worry` | 不安、等待、愧疚、缩成一团 | 踱步张望、垂头叹气、袋空如洗 |

- 池里的**每一条台词**带音区；**每个动作**带音区。
- 选择时：当前播放的动作音区为 `T` → 优先只在 `T` 的条目里抽；`T` 交为空 → 退回整个池；动作无标签 → 不筛。
- 于是 `approval` 配「女仆屈膝礼」说的是正经台词，配「被吓一跳炸毛」说的是慌张台词，**但"在等你批准"这个事实永远由状态行保证**。

**标签放哪：不进 `catalog.ts`，另立侧表 `src/skin/tones.ts`。**

```ts
// 侧表：皮肤 → 动作 id → 音区
export const ACTION_TONES: Record<string, Record<string, Tone>> = {
  'whale-chan': { 'xie-daima': 'busy', 'nvpu-quxi-liyi': 'formal', /* … */ },
};
```

理由：`catalog.ts` 是 15 MB 单行冻结数据，为加一个字段去改它得不偿失；音区是**策略**不是**素材**，侧表可 review、可 diff、可整体替换。附录 A 给出 106 条动作的完整音区草案。

### 3.4 第三个维度：事实

`toolNamed` 已经证明文字该跟着事实走。台词的最终形态是：

```
台词 = pick( 状态池, 音区筛选, 事实, 轮换状态 )
```

v1 允许的事实占位符白名单（**只有这一个**）：

| 占位符 | 来源 | 允许出现在 |
|---|---|---|
| `{name}` | `usePetStatus().toolName` | 仅 `tool` 池 |

之后的扩展点（本方案不实现，但结构留好）：已耗时、第几轮、是否首次进入该状态。

---

## 4. 数据结构

### 4.1 关键决策：**结构**与**文案**分开，但条目并入字典

`labels/` 是「一个键 → 一句话」的消息字典，经宿主 locale 服务注册（`NS='status-pet'`）。

- **池的结构**（顺序 + 音区 + 段长）住在 `behavior/line-pools.ts`：它是有序数组，属于策略，不是消息。
- **池的条目**（id → 文案）住在 `labels/lines/{zh,en}.ts`，并在 `labels/index.ts` 里并入 `LABELS`。

并入是被逼的，不是偏好：渲染时按 id 取文案，而 slot API **唯一**能感知当前语言的入口就是那个 `t` prop——没有「当前 locale"这个 prop。代价是两份词条都进主包（`client.js` +42 kB，95 kB → 137 kB），换来的是零新机制、零分块、以及沿用 `labels.test.ts` 已经存在的键集对称断言。

保留的分离仍有价值：**带着 328 条文案去改结构，和带着结构去改文案，是两件互不相干的事。**

### 4.2 形状

```ts
// behavior/lines.ts —— 只读结构，不含任何语言文案
export type Tone = 'calm' | 'bright' | 'busy' | 'formal' | 'worry';

export interface LineSpec {
  /** 词条 id，也是翻译字典的键，形如 'idle.01'。 */
  id: string;
  tone: Tone;
}

/** 每个状态一串；顺序即轮换顺序。空池 = 跟随 idle。 */
export const LINE_POOLS: Record<StateName, readonly LineSpec[]>;

/** 任意状态实际会用的池：空则回落 idle。 */
export function poolFor(name: StateName): readonly LineSpec[];
```

```ts
// labels/lines/zh.ts / en.ts —— 只有文本
export const LINES_ZH: Record<string, string>; // 'idle.01' → '就在这里飘着…'
export const LINES_EN: Record<string, string>;
```

不变量（测试强制）：

1. 两语言键集**完全相同**（沿用 `labels.test.ts` 的做法）。
2. 键集与 `LINE_POOLS` 的 id 集合**双向包含**：池里有的必须有文案，文案里有的必须在池里。
3. `poolFor(s)` 的长度等于该状态池长度；`idle` 池非空。

> 为什么不用「两个数组按下标对齐」：下标对齐在漏一条时就静默错位，而键集对称是这套代码库已经验证过的模式。

### 4.3 明确不做的事

- **不动 artwork 模型**（`skin/model.ts`）：`Action` 不加 `tone` 字段。
- **不动存储**（`schema 1`）：v1 的台词是编译期数据，`assignments` 里不存任何文字。
- **不动状态机**（`behavior/facts.ts`）：台词是渲染层的选择，不参与 `deriveState`。

---

## 5. 选择与轮换策略（纯函数）

放在 `behavior/lines.ts`，无 DOM、无 React、`random` 可注入——和 `player/rotation.ts` 同一套路子，可在 node 直接测。

### 5.1 状态

```ts
export interface LineRotation {
  /** LINE_POOLS 内的下标。 */
  index: number;
  /** 距离下一次重抽还剩多少毫秒。 */
  remainingMs: number;
}
```

### 5.2 规则

| # | 规则 | 理由 |
|---|---|---|
| R1 | **进入新状态**：立刻重抽，无视残留计时 | 状态变了，话必须跟着变 |
| R2 | 同一状态内 `remainingMs` 耗尽 → 重抽，并重置计时 | 台词要有自己的节奏 |
| R3 | 重抽**永不选中刚刚那条**（池长 > 1 时） | 与 `rotation.ts` 的 `rollAnimation` 同一策略 |
| R4 | **事实显著变化 → 立即重抽**：`toolName` 变化、`unread` 翻转、`errored` 翻转 | 让文字"活"起来的关键 |
| R5 | 音区筛选交为空 → 退回全池；全池为空 → **不显示台词**，正文显示状态行 | 永不显示空白 |
| R6 | `prefers-reduced-motion` → **停止自动轮换**，只在 R1 / R4 换 | 见 §7 |

### 5.2.1 音区不触发重抽

音区是**抽取时**的候选滤镜，不是重抽的触发条件。正在播的动作换成另一路口气时，当前这句台词**留着说完**，下一句才按新音区抽。

理由：动作每 4~17 s 就换一个（`minPlays 3` + `playJitter 2`），若音区一变就换字，文字会以动画的节奏乱跳，读不成句；而「口气」本来也不该快到那个程度。代价是台词可能与当前动作口气不同步几秒——可以接受，因为**事实由状态行保证，口气只是偏好**。

### 5.3 节奏参数（`behavior/tuning.ts` 追加）

```ts
/** 台词在同一状态内停留多久才换下一条。 */
lineDwellMs: 7000,
/** 每条额外随机 0~lineJitterMs，避免节拍器感。 */
lineJitterMs: 2500,
```

刻意与动画分开：动画一轮 1.2~3.4 s（`minPlays: 3` + `playJitter: 2`），文字用那个速度没人读得完。**台词最慢也要比一次呼吸慢。** 只在状态入口 + 事实变化处换，已经足够生动。

### 5.4 伪代码

```ts
export function stepLines(
  prev: LineRotation | null,
  input: {
    state: StateName;
    pool: readonly LineSpec[];
    tone: Tone | null;          // 当前动作的音区
    factsKey: string;           // 参与 R4 的事实的序列化
    elapsedMs: number;
    reducedMotion: boolean;
  },
  random = Math.random,
): { rotation: LineRotation; line: LineSpec | null } {
  // R1 状态变 / 首次 → 重抽
  // R4 factsKey 变      → 重抽
  // R2 计时耗尽（且非 reducedMotion）→ 重抽
  // 否则维持，只推进 remainingMs
  // 抽取：候选取 tone 命中项；空则全池（R5）
  //       长度 > 1 时排除 prev.index（R3）
  //       计时 = lineDwellMs + random()*lineJitterMs
}
```

---

## 6. 渲染落点

### 6.1 三个候选

| 落点 | 改动量 | 生动度 | 风险 |
|---|---|---|---|
| **A. 弹窗正文那行灰字**（推荐） | 极小——`popup.ts` 的 `caption` 换成台词即可 | 中高 | 只有 popup 打开时可见 |
| B. 弹窗里加气泡对话框 | 中——新样式 + 换行 + 窄屏截断 | 高 | 面板变高，锚定位置要重算 |
| C. 状态栏 dock 上也显示短句 | 大 | 最高 | 状态栏空间极窄，会和宿主 UI 抢地方 |

**v1 走 A**：改动最小、立刻可见，而且那行字**本来就是"说话的位置"**。B 作为 P3 增量——A 的台词渲染函数可以直接复用，气泡只是第二个宿主元素。

tooltip **永远显示状态行真话**（`title = t('toolNamed')` 或 `t(state)` 不变）。

### 6.2 文本规格（硬约束，测试强制）

| 项 | 中文 | 英文 |
|---|---|---|
| 单条长度上限 | ≤ 16 汉字 | ≤ 48 字符 |
| 面板内最多 | 2 行 | 2 行 |
| 超出 | CSS `-webkit-line-clamp:2` 省略 | 同 |
| 字体 | 沿用 `.status-pet-popup-title`（12px/18px） | 同 |

### 6.3 时序

```
agent 状态变
   └─▶ deriveState(facts) ──▶ 'approval'
         ├─▶ 状态行（真话）：「等待你批准」 ──▶ tooltip / aria-label
         └─▶ stepLines(state='approval', tone=当前动作音区)
               └─▶ LineSpec('approval.07')
                     └─▶ t('approval.07') ──▶ 弹窗正文（12px 灰字）
                                                7~9.5 s 后换下一条
```

---

### 6.4 状态栏台词：宠物旁边的 左 / 右 / 关（已落地）

**要求**：状态栏宠物旁边显示台词，**与点击弹窗里显示的完全一致**，而且这个设置可以关。

#### 一致性是结构保证的，不是靠同步

```
dock（唯一拥有者）
  ├─ useLine(state, factsKey, tone) ──▶ 一句台词的 id ──▶ t(id) ──▶ 一个字符串
  │                                                              │
  ├─▶ 宠物左边的 <span class="status-pet-line">  ◀──────────────┤  同一个字符串
  └─▶ <DockPopup line={...}>  ──▶ 弹窗正文（那行 12px 灰字）      ←┘
```

弹窗**不**自己抽台词：它收到的就是 dock 算好的那个字符串。所以两边不可能漂移——不存在「第二条轮换」。

点弹窗时宠一下的那个反应（害羞/被叫醒）也回传给 dock（`onPet`），于是**动画、弹窗正文、dock 标签三者同拍**——今天的行为是弹窗自己播反应、dock 标签不动，那才是唯一会分叉的角落。

#### 三态设置

| 值 | 行为 |
|---|---|
| `right`（默认） | 台词在头像右边 |
| `left` | 台词在头像左边 |
| `off` | 不抽、不计时、不渲染——连 `useLine` 的计时器都不武装，一点开销都没有 |

- 落点：Settings → 状态宠物，皮肤卡下面一行（`view/settings/dock-text.ts`）。**不进工作台那根轴**：它既不是「状态」也不是「动作」。
- 持久化：`skin/display.ts` → `storage.ts` 的 `dockText`。**`schema 1` 不升版本**，只多一个可选字段；不认识的值读成默认值，非法值写不进去（`test/display.test.ts`）。
- 广播复用 `onSkinChange`（它就是「文档变了」这条通道），所以另一标签页改了也跟随。

#### 视觉与可达性

- 台词在 **pill 按钮内部**：点文字也能开弹窗，热区变大。
- 12px、`nowrap` + 省略号、`max-width: min(200px, 26vw)`——状态栏很窄，宁可截断也不挤压宿主 UI。
- 文字标签 `aria-hidden="true"`：按钮的 `aria-label` 已经是状态真话，**一个定时变化的字符串绝不能当可访问名**。
- 悬停 tooltip **仍然是状态真话**，不受这个设置影响。

---

## 7. 无障碍（这一节最容易写错，必须照做）

1. **拆分 live region。** 现在 `.status-pet-popup-title` 带 `aria-live="polite"`。**轮换的台词绝不能待在 live region 里**——否则读屏会把每一句台词都念一遍，这是骚扰级缺陷。
   - 新增一个**视觉隐藏**的 `role="status"` 节点（`.status-pet-sr`），只装**状态行真话**；状态变时朗读一次。
   - **dock 上的台词标签加 `aria-hidden="true"`**（按钮的 `aria-label` 已是真话）。弹窗里可见的台词**不**隐藏：它是可见正文，对读屏隐藏可见文字是反模式；它只是不在任何 live region 里。
2. **tooltip / `aria-label` 不换成台词。** 保持 `t(state)` / `t('toolNamed')`，一个字都不动。
3. **台词不承载唯一信息：** 任何"必须知道"的事（等你批准、出错了）都必须能从状态行 + 面板强调态（`STATES[...].pill` 的呼吸/报错样式）获得。
4. **`prefers-reduced-motion`（R6）：** 停止自动轮换。文字轮换虽然不是动画，但对注意力敏感用户同样是持续干扰；只在状态/事实变化时换。
5. 弹窗 `aria-label` 保持与状态行一致，不用台词。

---

## 8. 工作台（Settings → 状态宠物）

**不加第三根轴。** 台词属于状态——"她演什么 + 她说什么"，都在「状态」这一行里。

- 「状态」左栏 11 行**不动**；右侧面板在现有「这个状态播哪些动作」之上，加一块 **「她说什么」**：一个小标题 + 一个轮换播放的台词预览（复用现有 header 预览的 `headerSource` 机制，悬停某行即预览该状态的第一条台词）。
- **v1 只读**，与「动作」视图一致（"只有 LOOKS"）：池是编译期数据，工作台只展示与试听，不提供编辑。
- 显示"共 N 条 / 含几个音区"的元信息，便于日后扩写。

**P3（可选）用户自定义台词**才需要动存储：
```jsonc
{ "v": 2, "skin": "whale-chan", "assignments": {...},
  "lines": { "whale-chan": { "approval": ["……"] } } }   // 追加，不覆盖内置
```
届时要按 `skin/overrides.ts` 的既有做法写净化器（长度上限、去重、条数上限），并保持"老 payload 读成空 store"的既有行为。

---

## 9. 词条写作规范（中文池 / 英文池共用）

| 项 | 规则 |
|---|---|
| 人称 | 第一人称，对"你"说话 |
| 口吻 | 温软的小女仆，轻微傲娇。不卖惨、不说教、不自责过度 |
| 长度 | 中文 ≤ 16 字；英文 ≤ 48 字符。**大部分 8~14 字** |
| 结尾 | 不加句号。用 `…` `！` `～` `♪` 或直接结束 |
| 颜文字 | 允许，但**每池 ≤ 1/4 条目**含颜文字；禁止 emoji（🐋 ✨ 💤 一律不许） |
| 占位符 | 只有 `{name}`，只出现在 `tool` 池（≤ 8 条） |
| 音区 | 每条必须属于 5 个音区之一，且与状态的动作音区分布匹配 |
| 重复 | 同一句不得出现在两个状态（测试查重） |
| 英文本地化 | **语义等值，不是直译**；英文条目按英文语感独立写 |

各状态的 `worry` 台词必须区分语义：`approval`/`question` 的 worry 是**在等你**；`error` 的 worry 是**我搞砸了、想重来**。

---

## 10. 量级目标与音区分布

| 状态 | 条数 | calm | bright | busy | formal | worry |
|---|---|---|---|---|---|---|
| `idle` | 40 | 20 | 10 | 2 | 6 | 2 |
| `sleep` | 26 | 20 | 3 | 0 | 0 | 3 |
| `think` | 32 | 6 | 2 | 22 | 0 | 2 |
| `stream` | 32 | 6 | 2 | 22 | 0 | 2 |
| `tool` | 34 | 0 | 2 | 26 | 4 | 2 |
| `approval` | 32 | 2 | 6 | 0 | 12 | 12 |
| `question` | 30 | 4 | 0 | 10 | 4 | 12 |
| `error` | 28 | 5 | 0 | 0 | 3 | 20 |
| `done` | 28 | 4 | 18 | 0 | 6 | 0 |
| `petted` | 26 | 4 | 18 | 0 | 2 | 2 |
| `woken` | 20 | 10 | 2 | 0 | 2 | 6 |
| **合计** | **328** | 81 | 63 | 82 | 39 | 63 |

分布不是随便定的：**每个状态的音区配比，跟它默认播放的动作的音区对上了**，这样台词一开箱就跟动画同调。例如 `approval` 的默认动作是「女仆屈膝礼」（formal）＋「点击回应·害羞惊讶」（bright）＋「踱步张望 / 被吓一跳炸毛」（worry）——所以它的池里 formal 与 worry 各 12 条。

词库正文见 `docs/text-layer-copy-zh.md` / `docs/text-layer-copy-en.md`。

---

## 11. 测试与验收

### 11.1 新增单测

| 文件 | 断言 |
|---|---|
| `test/lines.test.ts` | ① 每个状态的条数与音区分布 = §10 的那张表；② 池结构与 `POOL_SHAPE` 一致；③ id 形如 `<状态>.<两位>` 且全局唯一；④ 两语言键集完全相同，且与池 id 双向覆盖；⑤ **词条与 `docs/text-layer-copy-*.md` 逐条一致**（漂移守卫）；⑥ 每条的写作规范（长度、无句号结尾、无 emoji、颜文字 ≤ 1/4、占位符白名单）；⑦ 全局无重复文案；⑧ 106 个动作每个都有音区、且没有多余的分档；⑨ 音区收窄与「交空回退整池」 |
| `test/lines-rotation.test.ts` | R1 状态变必重抽（**状态由纯函数自己持有，不靠调用方的 key**）；R2 计时耗尽重抽并重置、计时内只走时钟；R3 连续 300 次抽取不重复上一条；R4 事实签名变即重抽；R5 音区交空退回全池、结果永不越出池外；R6 reduced-motion 不自动轮换（且连新抽的一条也只报 0）；同一 random 流可复现 |
| `test/display.test.ts` | 默认 `right` 且不产生写入；三态往返；重复写不产生第二次写入；手改的垃圾值读成默认且不被回写；非法值写不进去；`v:2` 的文档不被解释 |

### 11.2 既有测试必须继续通过

`pnpm test`（16 文件 **109** 测试，原型为 13 文件 83 测试）全绿，特别是 `labels.test.ts`（状态真话键集不动，现在还要连带 328 条台词一起对称）与 `performance.test.ts`（identity 缓存、存储载荷仍 < 2000 字节——台词是编译期常量，不进存储）。`pnpm typecheck` 亦须干净。

### 11.3 手工清单

1. 悬停 dock 宠物 → tooltip 仍是「思考中…」这类**真话**，不出现台词。
2. 点开弹窗 → 正文是台词；停留 7~10 s 换下一条，且**不重复上一条**。
3. 发一条消息：进入 `think` 立刻换一句 `think` 台词；工具开始时 `{name}` 被替换成真实工具名。
4. 触发审批：tooltip / `aria-label` 是「等待你批准」，正文是 `approval` 池的台词。
5. 系统设置里打开「减少动态效果」→ 台词不再自动轮换，只随状态/事实变化。
6. 读屏（VoiceOver）打开：**状态变化朗读一次真话**，台词轮换**不发声**。
7. Settings → 状态宠物 → 状态：悬停某状态行，右侧「她说什么」预览跟着换，且不写任何存储。

---

## 12. 分期实施

| 期 | 内容 | 触碰文件 | 可交付信号 |
|---|---|---|---|
| **P1 管道** | `LINE_POOLS` + `stepLines` + `tuning` 两个参数 + 弹窗正文渲染 + live region 拆分 + `lines.test.ts` / `lines-rotation.test.ts`。先接 `idle`/`think`/`approval` 三池 | `behavior/lines.ts`、`behavior/tuning.ts`、`labels/lines/{zh,en}.ts`、`view/dock/popup.ts`、`view/pet-canvas.ts`（取 factsKey）、`test/` | 三池轮换跑通，读屏不再念台词 |
| **P2 全量** | 补齐 11 池 328 条；`skin/tones.ts` 音区侧表接入筛选；`copy-style.test.ts` | 词库、`skin/tones.ts` | 全状态生动，口气跟动作走 |
| **P3 增量（可选）** | 气泡对话框；工作台「她说什么」试听面板；用户自定义台词（storage v2） | `platform/theme.ts`、`view/dock/popup.ts`、`view/settings/`、`skin/storage.ts` | 可编辑、可气泡 |

P1 与 P2 的词库是同一份数据，可以一次写完、分两次接线。

**本次实际交付 = P1 + P2 + 用户要的「状态栏台词」**（§6.4）。P3 仍未做：气泡对话框、工作台里的「她说什么」试听面板、用户自定义台词（storage v2）。

---

## 13. 已决与待办

| # | 问题 | 结论 |
|---|---|---|
| 1 | 台词直接替换弹窗那行灰字，还是保留真话、台词另起一行？ | ✅ **替换**（真话移到隐藏 live region + tooltip）。已实现 |
| 2 | 台词池要不要"随机"而不是"顺序轮换"？ | ✅ **顺序轮换 + 不重复上一条**，可复现。已实现 |
| 3 | 中文池的"颜文字"要不要更收敛？ | ✅ 保持 §9 的 ≤ 1/4，测试强制 |
| 4 | 音区是否直接写死在侧表，还是也允许用户改？ | ✅ v1 写死侧表。已实现 |
| 5 | 英文池是否需要人工润色一轮？ | ⏳ **待办**。现有英文是起草稿，按 §9 的"语义等值非直译"标准应人工过一遍 |
| 6 | 状态栏台词要不要「左侧 / 右侧」都支持？ | ✅ 三态 `off / left / right`，默认 `right`。已实现（§6.4） |
| 7 | 台词要不要做成气泡对话框？ | ⏳ **待办**（P3）。§6.4 的渲染函数可直接复用 |
| 8 | 附录 A 的 `dianji-huiying-haixiu-jingya` 归 `worry` 还是 `bright`？ | ⏳ **待办**。现按 `worry` 落地，改一行侧表即可切换 |

---

## 附录 A：动作音区标签草案（106 条）

```ts
// 供 src/skin/tones.ts 使用；id 取自 catalog.ts
```

| 音区 | 动作 id（`name`） |
|---|---|
| `calm` | `daiji-huxi-xiuxian`(待机呼吸循环)、`jingyu-tu-paopao-texiao`(吐泡泡特效)、`duixueren`(堆雪人)、`lu-mao`(撸猫)、`yaoshan-naliang`(摇扇纳凉)、`sanqiu-paojie`(泡脚)、`menghua-xiaoyouling`(梦华小幽灵)、`fanghedeng`(放河灯)、`fang-kongmingdeng`(放孔明灯)、`yuandi-piaofu-tabu`(原地漂浮踏步)、`chi-baifan`(吃白饭)、`chi-changshoumian`(吃长寿面)、`chi-chongyanggao`(吃重阳糕)、`chi-labazhou`(吃腊八粥)、`chi-niangao`(吃年糕)、`chi-qingtuan`(吃青团)、`chi-wancan`(吃晚餐)、`chi-wucan`(吃午餐)、`chi-zaocan`(吃早餐)、`chi-zongzi`(吃粽子)、`chijiaozi`(吃饺子)、`chitangyuan`(吃汤圆)、`zhongqiu-shangyue-chi-yuebing`(中秋赏月吃月饼)、`cha-zhuyu-shangju`(重阳赏菊插茱萸)、`yuandi-xiaoqi-chenmian`(原地小憩沉眠)、`haqian-liantian`(哈欠连天)、`beiluoye-yanmo`(被落叶掩埋)、`youxian-hengga`(悠闲哼歌)、`chui-dizi`(吹笛子) |
| `bright` | `lanjing-xianshi`(蓝鲸出场)、`chenjian-shuaya`(晨间刷牙)、`chaoda-shenlanyao`(喝超大杯药水)、`chou-tuoluo`(抽陀螺)、`dangqiuqian`(荡秋千)、`qi-muma`(骑木马)、`ti-jianzi`(踢毽子)、`pangxie-zoulu`(螃蟹走路)、`hudie-mifeng-huanrao-touding-kaihua`(头顶开花)、`dongwu-huanrao`(小动物环绕)、`jin-dai-ding-dang`(锦袋叮当)、`wan-shuiqiang`(玩水枪)、`wan-youxi-qijibaituai`(玩游戏·百态)、`chui-qiqiu`(吹气球)、`fang-fengzheng`(放风筝)、`taotang-nanguadeng`(掏糖·南瓜灯)、`zhuangdian-shengdanshu`(装饰圣诞树)、`yuandi-zuozhuan-benpao`(原地左转奔跑)、`yuandi-dunxia-wan-wanju-qiche`(蹲下玩玩具车)、`chi-bingqilin-ronghua`(吃冰淇淋融化)、`chi-dazhaxie`(吃大闸蟹)、`chi-tanghulu`(吃糖葫芦)、`chi-xigua`(吃西瓜)、`dakou-chi-lingshi`(大口吃零食)、`shuan-huoguo`(涮火锅)、`gongzuozhuangtai-queyue-qingzhu`(雀跃庆祝)、`fang-yanhua`(放烟花)、`yuandi-tiaoyue-zhuasui-touding-wupin`(跳跃抓碎头顶物品)、`shou-hongbao`(收红包)、`qian-dai-man-yi`(钱袋满溢)、`qian-dai-ru-chang`(钱袋入账)、`chai-liwu`(拆礼物)、`dianji-huiying-kaixin-yuedong`(点击回应·开心跃动)、`dianji-huiying-naoyang-gegexiao`(点击回应·挠痒咯咯笑)、`dianji-huiying-yuanqi-huishou`(点击回应·元气挥手)、`dianji-huiying-aojiao-shengqi-ceshen-zhanshi`(点击回应·傲娇生气)、`qingkuai-yaobaiwu`(轻快摇摆舞)、`keai-zhaiwu`(可爱宅舞) |
| `busy` | `xiawuziqi`(下五子棋)、`chuanzhenqiqiao`(穿针乞巧)、`yuandi-zhongli-xiadun-yasuo`(原地重力下蹲)、`gongzuozhuangtai-sikao-maopao`(思考冒泡)、`shendu-sikao-suisuinian`(深度思考碎碎念)、`yuandi-zhuanxin-wan-mofang`(专心玩魔方)、`suisuinian-cazhuo-suisuinian`(碎碎念·擦桌)、`suisuinian-duiping-suisuinian`(碎碎念·对屏)、`suisuinian-fadai-suisuinian`(碎碎念·发呆)、`xie-daima`(写代码)、`gongzuozhuangtai-manglu-dianan`(忙碌点按)、`gongzuozhuangtai-qingdian-guidang`(清点归档)、`qingkuai-jilu`(轻快记录)、`yuandi-qiaoji-zhuomian-hudong`(敲击桌面)、`chi-token`(吃 token) |
| `formal` | `zhao-jingzi`(照镜子)、`youya-nvpuwu`(优雅女仆舞)、`nvpu-quxi-liyi`(女仆屈膝礼)、`puke-moshu`(扑克魔术)、`xiaotiqin-yanzou`(小提琴演奏)、`zhengti-huanzhuang-shise`(整体换装)、`xie-fuzi`(写福字)、`pingkong-shenghua`(凭空生花)、`bian-gezi`(变鸽子)、`xiaofudu-yuandi-360du-xuanzhuan-zhanshi`(原地360°旋转展示) |
| `worry` | `shu-jin-zhou-mei`(数金皱眉)、`wu-shitou`(捂石头)、`beixiayitiao-zhamao`(被吓一跳炸毛)、`gongzuozhuangtai-yuandi-duobu-zhangwang`(踱步张望)、`dongzhangxiwang`(东张西望)、`shia-chishenme`(吃什么呢)、`gongzuozhuangtai-chuitou-tanqi-maohan`(垂头叹气冒汗)、`fen-wen-bu-sheng`(愤愤不平)、`dai-kong-ru-xi`(袋空如洗)、`yong-jingyu-weiba-paidadi`(鲸鱼尾巴拍地)、`beishubiao-tuozhuai-xuankong-fankui`(被鼠标拖拽悬空)、`da-keshui-bei-jingxing`(打瞌睡被惊醒)、`touchi-lingshi-bei-zhuazhu`(偷吃零食被抓住)、`dianji-huiying-haixiu-jingya`(点击回应·害羞惊讶)† |

† `dianji-huiying-haixiu-jingya` 在默认表中被 `approval` 使用，语义偏"害羞＋惊讶"，也可以归 `bright`；标成 `worry` 是让"等待批准"时的动作多一句慌张台词可用。这一条请人工定夺。

分档合计：calm 29 + bright 38 + busy 15 + formal 10 + worry 14 = **106**，与 `catalog.ts` 的动作总数一致（`test/catalog` 同源的 id 集合，可由脚本逐条核对）。

---

## 附录 B：文件布局与 id 命名

```
src/
  behavior/
    lines.ts            ← 逻辑：LineSpec / LINE_POOLS / poolFor / candidates / stepLines
    line-pools.ts       ← 结构（GENERATED）：POOL_SHAPE，每个状态的音区分段
    tuning.ts           ← 追加 lineDwellMs / lineJitterMs
    vocabulary.ts       ← 追加 Tone / TONES
  labels/
    lines/
      zh.ts             ← 文案（GENERATED）：LINES_ZH（'idle.01' → 台词）
      en.ts             ← 文案（GENERATED）：LINES_EN
    index.ts            ← 把两份词条并入 LABELS（原因见 §4.1）
  skin/
    tones.ts            ← 动作音区侧表（GENERATED，附录 A）
    display.ts          ← dockText() / setDockText() / onDockTextChange()
    storage.ts          ← Stored 增加可选 dockText 字段（schema 仍为 1）
  view/
    line.ts             ← useLine()：把纯策略接上 React 计时器
    dock/pill.ts        ← 拥有台词；渲染左/右标签；把同一个字符串交给弹窗
    dock/popup.ts       ← 正文显示台词；真话进隐藏 live region
    settings/dock-text.ts ← 关闭 / 左侧 / 右侧 三态控件
  platform/
    surface.ts          ← 换动作时回报 actionId（不逐帧）
docs/
  text-layer-design.md  ← 本文
  text-layer-copy-zh.md ← 中文词库全文（文案真源）
  text-layer-copy-en.md ← 英文词库全文（文案真源）
bench/
  port-lines.mjs        ← 从上面三份文档生成四个 GENERATED 源码文件
```

**改文案的流程**：改 `docs/text-layer-copy-*.md` → `node bench/port-lines.mjs` → `pnpm test`。
`test/lines.test.ts` 会重新解析那两份文档逐条比对，所以「文档改了但忘了重新生成」会立刻红灯。

- id 命名：`<状态>.<两位序号>`，从 `01` 起，与词库中的 `#` 列一致（例如 `approval.07`）。
- **id 一经发布不得复用**：改文案只改 `LINES_*` 的值，不改 key；删条目才删 key。
- 词库文档中的 `#` 列就是 id 的序号，便于文档与源码逐条对照。

---

## 附录 C：为什么这份设计不改存储、不加轴、不动状态机

| 约束 | 本方案为何满足 |
|---|---|
| 存储 `v:1` 不变 | 台词是编译期常量；`assignments` 只存动作 id。**唯一的新字段 `dockText` 是显示偏好，也是可选字段，不升版本** |
| 工作台只有「状态 / 动作」两根轴 | 台词挂在「状态」行内，作为该状态的读出信息 |
| 状态机可纯函数测试 | `deriveState` 一字不动；台词选择是独立纯函数 |
| 换皮不能改语义 | 动作只提供音区（筛选偏好），状态行真话与 pool 都在 `labels`/`behavior` 层 |
| 分块加载期间宠物可用 | 台词在 `client.js`（95 kB）里，不依赖 15 MB artwork 分块 |
| identity 缓存与微小载荷 | `LINE_POOLS` 是模块常量；存储载荷不变 |
