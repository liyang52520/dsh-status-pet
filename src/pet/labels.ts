// Labels — every visible string, in every shipped locale.  Keys are state
// and reaction names (plus `toolNamed`, the tool state's `{name}` variant),
// so the dictionaries and the registries cannot drift — the test suite
// asserts both locales carry identical key sets and cover every registry
// entry.

export const NS = 'status-pet';

export type LabelDict = Record<string, string>;

export const LABELS: Record<'en' | 'zh', LabelDict> = {
  en: {
    label: 'Status Pet',
    idle: 'Idle', sleep: 'Sleeping', think: 'Thinking…', stream: 'Responding…',
    tool: 'Running a tool…', toolNamed: 'Running {name}…',
    approval: 'Waiting for your approval',
    question: 'Waiting for your answer', error: 'Something went wrong',
    done: 'Done', petted: 'Blushing', woken: 'Woken up',
    'settings.nav': 'Status Pet',
    'settings.previewHint': 'Click to pet it',
    'settings.skins': 'Skin',
    'settings.skin.whale-chan': 'Whale-chan',
    // ── the ONE axis: the two things this page works on ──
    'settings.view': 'Workshop view',
    'settings.view.states': 'States',
    'settings.view.actions': 'Actions',
    // ── the two faces of an action: the switch lives WITH the picture it
    // changes, never on the page's navigation row ──
    'settings.face': 'Face',
    'settings.grid.32': 'Avatar',
    'settings.grid.128': 'Body',
    'settings.grid.32Hint': 'The 32×32 face the composer dock draws',
    'settings.grid.128Hint': 'The 128×128 face the click popup draws',
    // ── the master list ──
    'settings.master.states': 'States',
    'settings.master.reactions': 'Reactions',
    'settings.previewing': 'Previewing {name}',
    'settings.comboPlaceholder': 'Search or pick an action…',
    'settings.comboEmpty': 'No action matches “{q}”.',
    'settings.actionFrames': '{n} frames',
    // ── the 动作 view: the library, one action at a time ──
    'settings.region.action': 'Action',
    'settings.actionHint': 'The one action on the board. Which states play it is ticked in the state list.',
    'settings.region.canvas': 'Canvas',
    'settings.region.frames': 'Frames (played in order)',
    'settings.field.frames': 'Frames',
    'settings.frameN': 'Frame {n}',
    'settings.noBody': 'avatar only',
    'settings.emptyBody': 'No full-body face on this action — the popup shows the avatar at 4×.',
    // ── the assignment surface ──
    'settings.region.library': 'Actions',
    'settings.libraryHint': 'Every animation this skin owns. Ticking one means the selected state plays it — an action can be ticked in several states, and a state with nothing ticked follows Idle.',
    'settings.clearIdleTitle': 'Clear Idle?',
    'settings.clearIdleHint': 'Idle must keep at least one action: every state with nothing ticked falls back to it. None therefore keeps the FIRST one instead of leaving Idle empty.',
    'settings.actionCount': '{n} action(s)',
    'settings.actionN': 'Action {n}',
    'settings.usedByN': '{n} state(s) play this',
    'settings.unusedAction': 'no state plays this yet',
    'settings.playedHere': 'This state plays it',
    'settings.emptyLibrary': 'The library is empty.',
    // ── the list is two groups: what this state ticks comes first ──
    'settings.libraryTickedGroup': 'Ticked for this state ({n})',
    'settings.libraryRestGroup': 'Other actions ({n})',
    'settings.selectAll': 'All',
    'settings.clearSelection': 'None',
    'settings.searchActions': 'Search actions…',
    'settings.searchMatches': '{n} of {total}',
    'settings.searchEmpty': 'Nothing matches “{q}”.',
    'settings.selectedMax': '{n} ticked (the limit)',
    'settings.cancel': 'Cancel',
    'settings.followIdle': 'follows Idle',
    'settings.hint.idle': 'At rest, nothing running',
    'settings.hint.sleep': 'After a minute idle',
    'settings.hint.think': 'Message sent, no output yet',
    'settings.hint.stream': 'Output is arriving',
    'settings.hint.tool': 'A tool is executing',
    'settings.hint.approval': 'Waiting for your approval',
    'settings.hint.question': 'Waiting for your answer',
    'settings.hint.error': 'The last turn failed',
    'settings.hint.done': 'Finished, not yet seen',
    'settings.hint.petted': 'Right after a click',
    'settings.hint.woken': 'Hover or focus while asleep',
  },
  zh: {
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
    'settings.grid.32': '头像',
    'settings.grid.128': '全身',
    'settings.grid.32Hint': '状态栏里显示的那张 32×32 的脸',
    'settings.grid.128Hint': '点开后弹窗里显示的 128×128 全身',
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
  },
};

// Only used when the slot supplies no locale translator at all.
export const LABEL_FALLBACK = LABELS.en;

/** The `t` prop type the host hands every slot component. */
export type Translator = ((key: string, params?: Record<string, unknown>) => string) | null | undefined;

/** Resolve a translator prop into a guaranteed callable, with `{param}`
 *  interpolation even on the English fallback path. */
export function translatorOrFallback(
  t: Translator,
): (key: string, params?: Record<string, unknown>) => string {
  if (typeof t === 'function') return t;
  return (key, params) => {
    let s = LABEL_FALLBACK[key] || key;
    if (params) {
      for (const name in params) s = s.replace('{' + name + '}', String(params[name]));
    }
    return s;
  };
}
