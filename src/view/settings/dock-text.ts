// 状态栏台词的落点：关闭 / 左侧 / 右侧。
//
// 这是工作台里唯一的「显示设置」。它既不属于「状态」也不属于「动作」，所以它不
// 进那根轴、也不写任何分配——它只改一个用户偏好（skin/display.ts），和皮肤卡
// 一样「选了立刻生效」。

import { React, h } from '../../platform/deps.ts';
import { translatorOrFallback } from '../../labels/index.ts';
import type { Translator } from '../../labels/index.ts';
import { DOCK_TEXT_VALUES, dockText, onDockTextChange, setDockText } from '../../skin/display.ts';
import type { DockText } from '../../skin/display.ts';

export function DockTextSetting(props: { t?: Translator; onChanged?: () => void }) {
  const t = translatorOrFallback(props.t);
  const [place, setPlace] = React.useState<DockText>(() => dockText());
  React.useEffect(() => onDockTextChange(() => setPlace(dockText())), []);

  return h('div', { className: 'status-pet-docktext' },
    h('div', { className: 'status-pet-docktext-row' },
      h('span', { className: 'status-pet-docktext-title' }, t('settings.dockText')),
      ...DOCK_TEXT_VALUES.map((value) => h('button', {
        key: value,
        type: 'button',
        className: 'status-pet-mini-button' + (place === value ? ' active' : ''),
        'aria-pressed': place === value ? 'true' : 'false',
        onClick: () => {
          setDockText(value);
          if (props.onChanged) props.onChanged();
        },
      }, t('settings.dockText.' + value)))
    ),
    h('div', { className: 'status-pet-hint' }, t('settings.dockTextHint'))
  );
}
