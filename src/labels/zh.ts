// Chinese copy — the shipped default for this UI.  See en.ts for the key rules.

export const zh = {
  label: '状态宠物',
  // ── 状态真话：tooltip / aria-label。 短、准、不玩梗，换皮绝不能改动它 ──
  idle: '空闲', sleep: '睡觉中',
  think: '思考中…', reasoning: '推理中…', preparing: '正在准备调用…', stream: '回复中…',
  shell: '正在跑命令…', read: '正在读文件…', search: '正在查找…', write: '正在改文件…',
  web: '正在取网页…', agent: '正在派任务…', plan: '正在记计划…', deliver: '正在交付…',
  tool: '正在执行工具…', toolNamed: '正在执行 {name}…',
  slow: '这一步有点久…', multi: '同时在忙几件事…',
  approval: '等待你批准', question: '等待你回答', planReview: '等待你审阅计划',
  error: '出错了', done: '已完成', petted: '害羞了', woken: '被叫醒了',
  /** `{name}` 缺失时的兜底（工具调用还没报出名字）。 */
  toolGeneric: '工具',

  'settings.nav': '宠物',
  'settings.previewHint': '点击与它互动',
  'settings.skins': '皮肤',
  'settings.skin.whale-chan': '鲸鱼娘',

  // ── 状态栏台词：宠物旁边说不说话，说在哪边 ──
  'settings.dockText': '状态栏台词',
  'settings.dockTextHint': '在状态栏宠物旁边显示它正在说的话，与点击弹窗里显示的完全一致；关闭后只保留悬停提示。',
  'settings.dockText.off': '关闭',
  'settings.dockText.left': '左侧',
  'settings.dockText.right': '右侧',

  // ── 唯一的轴：这个页面只处理两样东西 ──
  'settings.view': '工作台视图',
  'settings.view.states': '状态',
  'settings.view.actions': '动作',

  // ── 一个动作的两张脸：开关跟着它所改变的画面走，不挂在页面导航行上 ──
  'settings.face': '形象',
  'settings.face.avatar': '头像',
  'settings.face.body': '全身',
  'settings.face.avatarHint': '状态栏中显示的 32×32 头像',
  'settings.face.bodyHint': '点击后在弹窗中显示的 128×128 全身',

  // ── 主列表 ──
  'settings.master.states': '状态',
  'settings.master.reactions': '反应',
  'settings.previewing': '正在预览「{name}」',
  'settings.comboPlaceholder': '搜索或选择动作…',
  'settings.comboEmpty': '无匹配「{q}」的动作。',
  'settings.actionFrames': '{n} 帧',

  // ── 动作视图：一次看一个动作 ──
  'settings.region.action': '动作',
  'settings.actionHint': '画布上当前显示的动作；如需指定哪些状态播放它，请在「状态」中勾选。',
  'settings.region.canvas': '画布',
  'settings.region.frames': '帧（按顺序播放）',
  'settings.field.frames': '帧',
  'settings.frameN': '第 {n} 帧',
  'settings.noBody': '仅头像',
  'settings.emptyBody': '该动作暂无全身图，弹窗中将显示头像的 4 倍放大。',

  // ── 分配界面 ──
  'settings.region.library': '动作库',
  'settings.libraryHint': '该皮肤自带的全部动作。勾选后，当前状态即播放该动作；同一动作可被多个状态勾选，未勾选任何动作的状态跟随「空闲」。',
  'settings.clearIdleTitle': '清空「空闲」？',
  'settings.clearIdleHint': '「空闲」至少要保留一个动作：未勾选任何动作的状态均跟随它。因此「清空」将保留第一个动作，不会置空。',
  'settings.actionCount': '{n} 个动作',
  'settings.actionN': '动作 {n}',
  'settings.usedByN': '{n} 个状态在使用',
  'settings.unusedAction': '暂无状态使用',
  'settings.playedHere': '当前状态播放此动作',
  'settings.emptyLibrary': '动作库是空的。',

  // ── 分配列表分两段：先列已勾给该状态的动作，再列其余 ──
  'settings.libraryTickedGroup': '该状态已勾选（{n}）',
  'settings.libraryRestGroup': '其他动作（{n}）',
  'settings.selectAll': '全选',
  'settings.clearSelection': '清空',
  'settings.searchActions': '搜索动作…',
  'settings.searchMatches': '在 {total} 个动作中匹配到 {n} 个',
  'settings.searchEmpty': '无匹配「{q}」的项。',
  'settings.selectedMax': '已勾选 {n} 个（已达上限）',
  'settings.cancel': '取消',
  'settings.followIdle': '跟随空闲',

  'settings.hint.idle': '就绪待命',
  'settings.hint.sleep': '闲置约 1 分钟后',
  'settings.hint.think': '消息已发出，尚未开始回复',
  'settings.hint.reasoning': '模型正在内部推理',
  'settings.hint.preparing': '正在组装这次工具调用的参数',
  'settings.hint.stream': '正在输出内容',
  'settings.hint.shell': '正在执行命令或终端操作',
  'settings.hint.read': '正在读取文件或会话记录',
  'settings.hint.search': '正在按模式查找',
  'settings.hint.write': '正在改动文件内容',
  'settings.hint.web': '正在从网上抓取',
  'settings.hint.agent': '正在派子代理或队友去做',
  'settings.hint.plan': '正在记待办、目标或日程',
  'settings.hint.deliver': '正在把成品递给你',
  'settings.hint.tool': '正在执行工具',
  'settings.hint.slow': '一个工具已经跑了 45 秒以上',
  'settings.hint.multi': '同时有两个以上工具在跑',
  'settings.hint.approval': '等待你批准操作',
  'settings.hint.question': '等待你回答问题',
  'settings.hint.planReview': '等待你审阅一份计划',
  'settings.hint.error': '上一次执行失败',
  'settings.hint.done': '已完成，尚未查看',
  'settings.hint.petted': '被点击的瞬间',
  'settings.hint.woken': '睡眠时悬停或聚焦',
};
