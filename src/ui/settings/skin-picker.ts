// The skin row: one card per built-in, each a live portrait of that skin (a
// PetPreview pinned by name).  Selecting applies instantly — the store
// re-resolves ACTIVE synchronously on save, then notifies subscribers (same tab
// via SKIN_EVENT, other tabs via `storage`).
//
// It is the WHO choice, and it is the only control above the page's body,
// because everything below it is about the skin you just picked.

import { React, h } from '../../host-deps.ts';
import { BUILTIN_NAMES } from '../../pet/skins/built-ins.ts';
import { activeSkin, onSkinChange, saveStored } from '../../pet/skins/store.ts';
import { PetPreview } from '../pet-preview.ts';

/** Make `name` the active skin.  A name we do not ship is ignored — the store
 *  falls back to the default skin anyway, and persisting a name nothing can
 *  resolve would only leave a stale choice behind. */
export function activateSkin(name: string): void {
  if (!BUILTIN_NAMES.includes(name)) return;
  saveStored({ skin: name });
}

export function SkinPicker(props: { t: (key: string) => string }) {
  const t = props.t;
  const [active, setActive] = React.useState(() => activeSkin().name);
  // Re-render on ANY skin change: our own write does not change the name it
  // already shows, but it must still re-resolve every card's pinned skin.
  const [, setVersion] = React.useState(0);
  React.useEffect(() => onSkinChange(() => {
    setActive(activeSkin().name);
    setVersion((v) => v + 1);
  }), []);

  return h('div', null,
    h('div', { className: 'status-pet-gallery-title' }, t('settings.skins')),
    h('div', { className: 'status-pet-skins' },
      BUILTIN_NAMES.map((name) =>
        h('button', {
          key: name,
          type: 'button',
          className: 'status-pet-skin-card' + (active === name ? ' active' : ''),
          'aria-pressed': active === name ? 'true' : 'false',
          onClick: () => { activateSkin(name); setActive(activeSkin().name); },
        },
          // The card shows the avatar at 2× — a portrait, not a 16px dock
          // pill: the picker is the most consequential choice on the page.
          h(PetPreview, { skinName: name, scale: 2, interactive: false }),
          h('span', { className: 'status-pet-skin-name' }, t('settings.skin.' + name))
        )
      )
    )
  );
}
