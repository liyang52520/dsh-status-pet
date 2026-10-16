// The skin cards: one card per built-in, each a live portrait of that skin.
// Selecting applies instantly — the session re-resolves ACTIVE synchronously.

import { React, h } from '../../platform/deps.ts';
import { BUILTIN_SKINS } from '../../skin/registry.ts';
import { activeSkin, chooseSkin, onSkinChange } from '../../skin/session.ts';
import { PetCanvas } from '../pet-canvas.ts';

export function SkinCards(props: { t: (key: string) => string }) {
  const t = props.t;
  const [active, setActive] = React.useState(() => activeSkin().name);
  const [, setVersion] = React.useState(0);
  React.useEffect(() => onSkinChange(() => {
    setActive(activeSkin().name);
    setVersion((v) => v + 1);
  }), []);

  return h('div', null,
    h('div', { className: 'status-pet-gallery-title' }, t('settings.skins')),
    h('div', { className: 'status-pet-skins' },
      BUILTIN_SKINS.map((name) =>
        h('button', {
          key: name,
          type: 'button',
          className: 'status-pet-skin-card' + (active === name ? ' active' : ''),
          'aria-pressed': active === name ? 'true' : 'false',
          onClick: () => { chooseSkin(name); setActive(activeSkin().name); },
        },
          h(PetCanvas, { source: { kind: 'skin', name }, scale: 2, interactive: false }),
          h('span', { className: 'status-pet-skin-name' }, t('settings.skin.' + name))
        )
      )
    )
  );
}
