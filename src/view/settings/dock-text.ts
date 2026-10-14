// 状态栏台词的两项显示设置：落点（关闭 / 左侧 / 右侧）与框宽（窄 / 中 / 宽）。
//
// 这是工作台里唯一的「显示设置」。它既不属于「状态」也不属于「动作」，所以它不
// 进那根轴、也不写任何分配——它只改用户偏好（skin/display.ts），和皮肤卡一样
// 「选了立刻生效」。
//
// 框宽为什么是一个设置：dock 那行是居中 flex，框宽必须是常数（否则台词一长一短就
// 把整条状态栏推来推去），而"常数取多少"是取舍 —— 宽一点一次说得完整，窄一点占的
// 地方少、长台词在里面滚动。 这个取舍交给用户，默认取「中」。

import { React, h } from '../../platform/deps.ts';
import { translatorOrFallback } from '../../labels/index.ts';
import type { Translator } from '../../labels/index.ts';
import {
  DOCK_LINE_WIDTH_VALUES, DOCK_TEXT_VALUES,
  dockLineWidth, dockText,
  onDockLineWidthChange, onDockTextChange,
  setDockLineWidth, setDockText,
} from '../../skin/display.ts';
import type { DockLineWidth, DockText } from '../../skin/display.ts';

export function DockTextSetting(props: { t?: Translator; onChanged?: () => void }) {
  const t = translatorOrFallback(props.t);
  const [place, setPlace] = React.useState<DockText>(() => dockText());
  React.useEffect(() => onDockTextChange(() => setPlace(dockText())), []);
  const [width, setWidth] = React.useState<DockLineWidth>(() => dockLineWidth());
  React.useEffect(() => onDockLineWidthChange(() => setWidth(dockLineWidth())), []);

  function pickRow<T extends string>(
    title: string,
    values: readonly T[],
    current: T,
    label: (value: T) => string,
    apply: (value: T) => void,
  ) {
    return h('div', { className: 'status-pet-docktext-row' },
      h('span', { className: 'status-pet-docktext-title' }, title),
      ...values.map((value) => h('button', {
        key: value,
        type: 'button',
        className: 'status-pet-mini-button' + (current === value ? ' active' : ''),
        'aria-pressed': current === value ? 'true' : 'false',
        onClick: () => {
          apply(value);
          if (props.onChanged) props.onChanged();
        },
      }, label(value)))
    );
  }

  return h('div', { className: 'status-pet-docktext' },
    pickRow(t('settings.dockText'), DOCK_TEXT_VALUES, place, (v) => t('settings.dockText.' + v), setDockText),
    pickRow(t('settings.dockLineWidth'), DOCK_LINE_WIDTH_VALUES, width, (v) => t('settings.dockLineWidth.' + v), setDockLineWidth)
  );
}
