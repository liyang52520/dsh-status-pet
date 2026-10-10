// One card per built-in skin plus the custom slot, each showing a live
// portrait of that skin (a PetPreview pinned by name, recolouring applied).
// Selecting applies instantly — the store re-resolves ACTIVE synchronously
// on save, then notifies subscribers (same tab via SKIN_EVENT, other tabs
// via `storage`).

import { React, h } from '../../host-deps.ts';
import { seedArtworkFrom } from '../../pet/skins/store.ts';
import { BUILTIN_NAMES } from '../../pet/skins/built-ins.ts';
import {
  activeSkin,
  loadStored,
  onSkinChange,
  saveStored,
  validateArtwork,
} from '../../pet/skins/store.ts';
import { PetPreview } from '../pet-preview.ts';

export function SkinPicker(props: { t: (key: string) => string }) {
  const t = props.t;
  const [active, setActive] = React.useState(() => activeSkin().name);
  // Re-render on ANY skin change: a recolour keeps the active name but must
  // still re-resolve every card's pinned skin, so bump a version alongside.
  const [, setVersion] = React.useState(0);
  React.useEffect(() => onSkinChange(() => {
    setActive(activeSkin().name);
    setVersion((v) => v + 1);
  }), []);

  function select(name: string) {
    if (name === 'custom') {
      const stored = loadStored();
      if (!(stored.custom && validateArtwork(stored.custom).length === 0)) {
        // Seed "My Creation" from the ACTIVE skin's full artwork (every
        // state, both crops), so the card is never blank and the studio
        // starts from a complete, living pet.
        saveStored({ skin: 'custom', custom: seedArtworkFrom(activeSkin().name) });
        setActive('custom');
        return;
      }
    }
    saveStored({ skin: name });
    setActive(name);
  }

  const names = BUILTIN_NAMES.concat(['custom']);
  return h('div', null,
    h('div', { className: 'status-pet-gallery-title' }, t('settings.skins')),
    h('div', { className: 'status-pet-skins' },
      names.map((name) =>
        h('button', {
          key: name,
          type: 'button',
          className: 'status-pet-skin-card' + (active === name ? ' active' : ''),
          'aria-pressed': active === name ? 'true' : 'false',
          onClick: () => select(name),
        },
          // The card shows the avatar at its true dock size (the 32px grid at
          // 1×), so the picker reads as a row of pet-sized portraits.
          h(PetPreview, { skinName: name, scale: 1, interactive: false }),
          h('span', { className: 'status-pet-skin-name' }, t('settings.skin.' + name))
        )
      )
    )
  );
}
