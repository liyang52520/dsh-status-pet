// ActionThumb — a PLAYING thumbnail of one action, at row size.
//
// Both lists that show the library (the 状态 checkboxes and the 动作 picker) used
// to show a still of frame 0.  106 actions are 106 different ANIMATIONS, and a
// still of the first frame of a 4-frame loop is the least informative frame
// there is — a bob, a blink and a prop appear only later.  So a row plays its
// action, on the same shared ticker as every other pet canvas:
//
//   * the action is resolved as a ONE-ACTION skin (`resolveTakeSkin`, memoized
//     per artwork+grid+id) and handed to `PetPreview`, so the thumbnail is the
//     SAME player, the same sprites and the same pre-rendered bitmaps the dock
//     and the popup use — no second animation path;
//   * `scale: 1` renders the avatar crop at 1:1.  That is a 40 CSS px box
//     holding 32 px of art: the 4px headroom on each side is what lets the
//     frame's own `dx`/`dy` move without eating a column of pixels, which is
//     exactly what a still could not show;
//   * reduced motion freezes it on the first frame, a hidden tab stops it, and
//     the loop's dirty check means a row redraws only when its frame changes.
//
// The cost is measured, not assumed: 212 of these (the 106-row checklist with
// the picker's list open on top of it) cost ~0.016 ms per rAF tick — 0.1% of a
// 60fps frame — because a tick that changes nothing draws nothing.
//
// `interactive: false` keeps it a picture: the row's own label/button owns the
// click, so the thumbnail never swallows a tick or a selection.

import { h } from '../../host-deps.ts';
import { AVATAR_GRID, BODY_GRID } from '../../pet/grids.ts';
import { PetPreview } from '../pet-preview.ts';

export function ActionThumb(props: { skin: string; actionId: string; grid?: number }) {
  return h(PetPreview, {
    skinName: props.skin,
    takeId: props.actionId,
    grid: props.grid === BODY_GRID ? BODY_GRID : AVATAR_GRID,
    scale: 1,
    interactive: false,
  });
}
