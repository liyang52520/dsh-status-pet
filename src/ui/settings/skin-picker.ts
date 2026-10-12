// The skin row: one card per built-in plus the custom slot, each a live
// portrait of that skin (a PetPreview pinned by name).  Selecting applies
// instantly — the store re-resolves ACTIVE synchronously on save, then notifies
// subscribers (same tab via SKIN_EVENT, other tabs via `storage`).
//
// It is the WHO choice, and it is the only control above the page's one axis
// (状态 / 动作), because everything below it is about the skin you just picked.
//
// `activateSkin` is exported because one other place switches skins: the
// read-only 动作 detail of a built-in offers 「复制到我的创作」, which is the
// honest way out of a frozen artwork.  Two callers, ONE implementation of the
// seed-on-first-use rule.

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

/** Make `name` the active skin.  Selecting the custom slot with no (or an
 *  invalid) document SEEDS it from the active skin's whole artwork — every
 *  state, both faces — so the card is never blank and the studio starts from a
 *  complete, living pet.  That seed writes a whole library, so it reports
 *  itself: the caller says so out loud instead of silently replacing 16MB.
 *
 *  Returns the skin the document was copied FROM when it seeded, else null. */
export function activateSkin(name: string): string | null {
  if (name === 'custom') {
    const stored = loadStored();
    if (!(stored.custom && validateArtwork(stored.custom).length === 0)) {
      const from = activeSkin().name;
      saveStored({ skin: 'custom', custom: seedArtworkFrom(from) });
      return from;
    }
  }
  saveStored({ skin: name });
  return null;
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
          onClick: () => { activateSkin(name); setActive(activeSkin().name); },
        },
          // The card shows the avatar at 2× — a portrait, not a 16px dock
          // pill: the picker is the most consequential choice on the page, and
          // the live pet itself now has the detail pane (see page.ts).
          h(PetPreview, { skinName: name, scale: 2, interactive: false }),
          // 「我的创作」 starts as a COPY of a built-in, so the two cards show the
          // same face; this badge is what says which one is drawable.
          name === 'custom'
            ? h('span', { className: 'status-pet-skin-badge', title: t('settings.skin.customHint') },
                t('settings.skin.customHint'))
            : null,
          h('span', { className: 'status-pet-skin-name' }, t('settings.skin.' + name))
        )
      )
    )
  );
}
