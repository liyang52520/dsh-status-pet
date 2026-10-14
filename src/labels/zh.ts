// Chinese copy — the shipped default for this UI.  See en.ts for the key rules.

export const zh = {
  label: '状态宠物',
  idle: '空闲', sleep: '睡觉中', think: '思考中…', stream: '回复中…',
  tool: '正在执行工具…', toolNamed: '正在执行 {name}…',
  approval: '等待你批准',
  question: '等待你回答', error: '出错了',
  done: '已完成', petted: '害羞了', woken: '被叫醒了',

  'settings.nav': '状态宠物',
  'settings.previewHint': '点一下，摸摸它',
  'settings.skins': '皮肤',
  'settings.skin.whale-chan': '鲸鱼娘',

  // ── 唯一的轴：这个页面只处理两样东西 ──
  'settings.view': '工作区视图',
  'settings.view.states': '状态',
  'settings.view.actions': '动作',

  // ── 一个动作的两张脸：开关跟着它所改变的画面走，不挂在页面导航行上 ──
  'settings.face': '面',
  'settings.face.avatar': '头像',
  'settings.face.body': '全身',
  'settings.face.avatarHint': '状态栏里显示的那张 32×32 的脸',
  'settings.face.bodyHint': '点开后弹窗里显示的 128×128 全身',

  // ── 主列表 ──
  'settings.master.states': '状态',
  'settings.master.reactions': '反应',
  'settings.previewing': '正在预览「{name}」',
  'settings.comboPlaceholder': '搜索或选择一个动作…',
  'settings.comboEmpty': '没有匹配「{q}」的动作。',
  'settings.actionFrames': '{n} 帧',

  // ── 动作视图：一次看一个动作 ──
  'settings.region.action': '动作',
  'settings.actionHint': '画板上正在看的这一个动作。哪些状态播放它，到「状态」里勾选。',
  'settings.region.canvas': '画布',
  'settings.region.frames': '帧（按顺序播放）',
  'settings.field.frames': '帧',
  'settings.frameN': '第 {n} 帧',
  'settings.noBody': '仅头像',
  'settings.emptyBody': '这个动作还没有全身像——弹窗里暂时显示头像的 4 倍放大。',

  // ── 分配界面 ──
  'settings.region.library': '动作库',
  'settings.libraryHint': '这只皮肤自带的全部动作。勾选 = 选中的状态播放它——同一个动作可以勾给多个状态；一个都没勾的状态跟随「空闲」。',
  'settings.clearIdleTitle': '清空「空闲」？',
  'settings.clearIdleHint': '「空闲」至少要保留一个动作：没有勾选任何动作的状态都跟随它。所以「清空」会留下第一个动作，不会真的清成空的。',
  'settings.actionCount': '{n} 个动作',
  'settings.actionN': '动作 {n}',
  'settings.usedByN': '{n} 个状态在用',
  'settings.unusedAction': '还没有状态在用',
  'settings.playedHere': '本状态播放它',
  'settings.emptyLibrary': '动作库是空的。',

  // ── 分配列表分两段：先列已勾给该状态的动作，再列其余 ──
  'settings.libraryTickedGroup': '已勾给该状态（{n}）',
  'settings.libraryRestGroup': '其他动作（{n}）',
  'settings.selectAll': '全选',
  'settings.clearSelection': '清空',
  'settings.searchActions': '搜索动作…',
  'settings.searchMatches': '{total} 个动作里匹配 {n} 个',
  'settings.searchEmpty': '没有匹配「{q}」的项。',
  'settings.selectedMax': '已勾选 {n} 个（已到上限）',
  'settings.cancel': '取消',
  'settings.followIdle': '跟随空闲',

  'settings.hint.idle': '平时待命',
  'settings.hint.sleep': '闲置约 1 分钟后',
  'settings.hint.think': '刚发出消息，还没开始回复',
  'settings.hint.stream': '正在输出内容',
  'settings.hint.tool': '正在执行工具',
  'settings.hint.approval': '等待你批准操作',
  'settings.hint.question': '等待你回答问题',
  'settings.hint.error': '上一次执行失败',
  'settings.hint.done': '完成了，你还没看',
  'settings.hint.petted': '被点了一下的瞬间',
  'settings.hint.woken': '睡觉时 hover 或聚焦',
};
