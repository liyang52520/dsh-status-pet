// Styles — inlined into the components as a <style> element so unmounting
// removes them.  (The dock pet and the settings page can each mount one
// copy; two identical <style> nodes are harmless, and either one unmounting
// never strips the other's styles.)  State accents come last so they
// outrank :hover at equal specificity, and they are colour-only via theme
// tokens, so a renamed token degrades to an untinted pill instead of
// breaking the render.
export const CSS = [
  '.status-pet-pill{box-sizing:border-box;border-radius:999px;border:none;background:transparent;',
  'color:var(--dsw-alias-label-tertiary);display:inline-flex;align-items:center;justify-content:center;',
  'padding:1px 7px;cursor:pointer;line-height:0;flex:none;transition:background .15s ease;}',
  '.status-pet-pill:hover{background:var(--dsw-alias-interactive-bg-hover);}',
  '.status-pet-pill:active{background:var(--dsw-alias-interactive-bg-hover);}',
  '.status-pet-pill:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;}',
  '.status-pet-anchor{display:inline-flex;line-height:0;}',
  // The click popup: an anchored panel with the big animated pet.  The panel
  // itself is the petting target (its padding included), so it reads as
  // clickable.
  '.status-pet-popup{position:fixed;z-index:70;box-sizing:border-box;cursor:pointer;',
  'user-select:none;',
  'background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);',
  'border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);',
  'box-shadow:var(--dsw-elevation-panel);padding:12px;display:flex;flex-direction:column;',
  'align-items:center;gap:8px;}',
  '.status-pet-popup-preview{border:none;background:transparent;cursor:pointer;line-height:0;',
  'border-radius:var(--dsw-radius-md);padding:4px;font-family:inherit;}',
  '.status-pet-popup-preview:hover{background:var(--dsw-alias-interactive-bg-hover);}',
  '.status-pet-popup-preview:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;}',
  '.status-pet-popup-title{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);}',
  '@keyframes statusPetPulse{0%,100%{background:transparent}',
  '50%{background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 24%, transparent)}}',
  '.status-pet-pill.attention{animation:statusPetPulse 1.6s ease-in-out infinite;}',
  '.status-pet-pill.error{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 18%, transparent);}',
  '@media (prefers-reduced-motion: reduce){',
  '.status-pet-pill.attention{animation:none;background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 24%, transparent);}}',
  // Settings section page (its own tab).  Matches the shipped sections: a
  // flex column inside the content column, rows separated by hairlines.
  '.status-pet-section{flex-direction:column;width:100%;display:flex;}',
  '.status-pet-preview-button{border:none;background:transparent;cursor:pointer;line-height:0;',
  'border-radius:var(--dsw-radius-md);padding:8px;font-family:inherit;}',
  '.status-pet-preview-button:hover{background:var(--dsw-alias-interactive-bg-hover);}',
  '.status-pet-preview-button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;}',
  '.status-pet-gallery-title{font-size:14px;line-height:20px;padding:16px 0 8px;}',
  // The page is two tabs — 预览 (the gallery) and 编辑 (the studio) — with the
  // 32 / 128 crop switch on the right of the SAME row, because both tabs work on
  // that one crop.
  '.status-pet-tabs{display:flex;align-items:center;justify-content:space-between;',
  'gap:8px;flex-wrap:wrap;padding:16px 0 8px;border-bottom:.5px solid var(--dsw-alias-border-l2);}',
  '.status-pet-tab-list,.status-pet-view-switch{display:flex;gap:4px;align-items:center;}',
  '.status-pet-tab{font-size:14px;line-height:20px;padding:2px 10px;border:none;',
  'border-bottom:2px solid transparent;border-radius:var(--dsw-radius-md) var(--dsw-radius-md) 0 0;',
  'background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-family:inherit;}',
  '.status-pet-tab:hover{background:var(--dsw-alias-interactive-bg-hover);}',
  '.status-pet-tab.active{color:inherit;font-weight:600;',
  'border-bottom-color:var(--dsw-alias-state-business-primary);}',
  '.status-pet-tabs .status-pet-grid-toggle{padding:0;}',
  // A gallery CELL is a compact TILE: the pet (displayed at LIVE_ZOOM, so 80 CSS
  // px of canvas = 64px of art) with the state name and its badge UNDER it.  It
  // used to be a row holding a 160px sprite, which in a ~530px settings pane is
  // two columns of ~260px and left the text ~70px — the badge and the state name
  // both wrapped.  Tiles also let auto-fill pack 4 in that pane instead of 2.
  '.status-pet-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));',
  'gap:8px;padding:0 0 16px;}',
  '.status-pet-gallery-cell{position:relative;display:flex;flex-direction:column;align-items:center;',
  'justify-content:flex-start;gap:4px;padding:10px 8px;min-width:0;text-align:center;',
  'border-radius:var(--dsw-radius-md);border:.5px solid var(--dsw-alias-border-l2);}',
  // The corner ✎: the ONLY way from 预览 into 编辑 (the cell itself stays inert,
  // so looking at the pet never edits it).  It floats over the tile at low
  // opacity instead of appearing on hover only, so it is discoverable on a
  // touch screen too, and it brightens on hover/focus.
  '.status-pet-gallery-edit{position:absolute;top:4px;right:4px;width:22px;height:22px;padding:0;',
  'display:inline-flex;align-items:center;justify-content:center;line-height:1;font-size:12px;',
  'border-radius:6px;border:.5px solid var(--dsw-alias-border-l2);font-family:inherit;',
  'background:var(--dsw-specific-menu);color:var(--dsw-alias-label-tertiary);cursor:pointer;',
  'opacity:.55;transition:opacity .12s ease;}',
  '.status-pet-gallery-cell:hover .status-pet-gallery-edit,',
  '.status-pet-gallery-edit:hover,.status-pet-gallery-edit:focus-visible{opacity:1;color:inherit;',
  'background:var(--dsw-alias-interactive-bg-hover);}',
  '.status-pet-gallery-edit:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;}',
  '.status-pet-gallery-text{display:flex;flex-direction:column;align-items:center;',
  'gap:2px;min-width:0;width:100%;}',
  '.status-pet-gallery-label{color:var(--dsw-alias-label-secondary);font-size:12px;',
  'line-height:18px;max-width:100%;}',
  // The state's assignment read-out: how many actions it plays, or the italic
  // reminder that it plays none (and therefore follows Idle).
  '.status-pet-gallery-meta{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;}',
  '.status-pet-gallery-meta.idle-fallback{font-style:italic;}',
  // The 按状态 / 按动作 switch + the unused-action count, above the gallery.
  '.status-pet-gallery-wrap{display:flex;flex-direction:column;}',
  // 12px BELOW the switch too: with `padding:12px 0 0` the switch sat flush on
  // the first row of tiles.
  '.status-pet-gallery-bar{display:flex;align-items:center;justify-content:space-between;',
  'gap:8px;flex-wrap:wrap;padding:12px 0;}',
  // Customisation sections on the settings page.
  '.status-pet-skins{display:flex;gap:8px;flex-wrap:wrap;padding:4px 0 8px;}',
  '.status-pet-skin-card{display:flex;flex-direction:column;align-items:center;gap:6px;',
  'padding:10px 14px;border:.5px solid var(--dsw-alias-border-l2);',
  'border-radius:var(--dsw-radius-md);background:transparent;cursor:pointer;',
  'font-family:inherit;color:inherit;}',
  '.status-pet-skin-card:hover{background:var(--dsw-alias-interactive-bg-hover);}',
  '.status-pet-skin-card.active{border-color:var(--dsw-alias-state-business-primary);',
  'background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent);}',
  '.status-pet-skin-name{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);}',
  '.status-pet-colors{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}',
  '.status-pet-swatch{width:24px;height:24px;border-radius:6px;padding:0;cursor:pointer;',
  'border:.5px solid var(--dsw-alias-border-l2);background:transparent;font-family:inherit;',
  'color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1;flex:none;}',
  '.status-pet-swatch-picker.active{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;}',
  // The studio's colour well is a native <input type="color"> dressed as a
  // swatch: no OS chrome (padding, inner border) may break the 24px square.
  '.status-pet-swatch[type=color]{overflow:hidden;}',
  '.status-pet-swatch[type=color]::-webkit-color-swatch-wrapper{padding:0;}',
  '.status-pet-swatch[type=color]::-webkit-color-swatch{border:none;}',
  // A mini button never squeezes: without `nowrap` + `flex:none` a long label in
  // a narrow row wrapped one character per line (the reported filmstrip mess) —
  // rows WRAP instead, so every control keeps its shape.
  '.status-pet-mini-button{font-size:12px;line-height:18px;padding:2px 10px;white-space:nowrap;flex:none;',
  'border-radius:var(--dsw-radius-md);border:.5px solid var(--dsw-alias-border-l2);',
  'background:transparent;cursor:pointer;font-family:inherit;color:inherit;}',
  '.status-pet-mini-button:hover{background:var(--dsw-alias-interactive-bg-hover);}',
  '.status-pet-mini-button.active{border-color:var(--dsw-alias-state-business-primary);',
  'background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent);}',
  '.status-pet-grid-toggle{display:flex;gap:8px;align-items:center;padding:4px 0 8px;}',
  '.status-pet-io{box-sizing:border-box;width:100%;min-height:56px;font-family:monospace;font-size:11px;',
  'border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);',
  'padding:6px 8px;background:transparent;color:inherit;}',
  '.status-pet-error{font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary);padding-top:4px;}',
  // ── The pixel studio ──
  // ONE column, always, and every region is a labelled FIELD row: a fixed
  // label column gives the page a spine, so the controls under the canvas read
  // as a list of settings instead of loose buttons.  The studio is still a size
  // container, for the one thing that genuinely needs the pane's width — the
  // board/preview stage.
  '.status-pet-studio{display:flex;flex-direction:column;gap:12px;padding-bottom:16px;container-type:inline-size;}',
  '.status-pet-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);}',
  // the edit card: 状态 → 画布 → 画笔 → 动作库 → 帧 → 当前帧
  '.status-pet-canvas-card{border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);padding:12px;display:flex;flex-direction:column;gap:12px;min-width:0;}',
  '.status-pet-field{display:flex;align-items:flex-start;gap:10px;min-width:0;}',
  '.status-pet-field-label{flex:0 0 40px;font-size:12px;line-height:18px;padding-top:3px;color:var(--dsw-alias-label-tertiary);}',
  '.status-pet-field-body{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}',
  '.status-pet-field-wide{flex:1 1 100%;}',
  // The one control at the top-left of either half of 编辑: a native dropdown.
  // `.status-pet-select` is the shared look; the two semantic classes
  // (`.status-pet-state-select` in 按状态, `.status-pet-action-select` in 按动作)
  // are what the suite hooks, and they never appear in the same tree.
  '.status-pet-select{font-family:inherit;font-size:14px;line-height:20px;font-weight:600;color:inherit;',
  'background:transparent;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);',
  'padding:3px 8px;cursor:pointer;max-width:100%;}',
  '.status-pet-select:hover{background:var(--dsw-alias-interactive-bg-hover);}',
  '.status-pet-action-select{max-width:min(100%,420px);font-weight:400;}',
  '.status-pet-select:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;}',
  '.status-pet-state-ops{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto;}',
  // ── the canvas stage: the board — a SQUARE that always fits — and the take's
  // live preview.  The board's side is `min(column, 52vh, 512px)`, so the 128×128
  // crop is complete at any pane width instead of being clipped by fixed 6px
  // cells (the reported bug), and the 32×32 crop simply gets bigger cells.
  // `aspect-ratio` keeps it square, so the edit surface can never overflow its
  // column and never needs a horizontal scrollbar.
  '.status-pet-stage{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:start;min-width:0;flex:1 1 100%;}',
  '.status-pet-stage-cell{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0;width:100%;}',
  '.status-pet-stage-caption{font-size:12px;line-height:16px;color:var(--dsw-alias-label-tertiary);}',
  // the board's own percentage resolves against the CELL, so the square can only
  // ever be as large as the column the stage gave it
  '.status-pet-board-wrap{position:relative;display:flex;width:min(100%,52vh,512px);aspect-ratio:1;}',
  '.status-pet-grid{flex:1 1 auto;display:flex;flex-direction:column;gap:1px;min-width:0;min-height:0;contain:layout style;}',
  // `contain` on a row and a cell keeps the 16,384-element 128px board from
  // invalidating layout and paint outside itself on every stroke: the browser
  // may treat each row as its own layout unit, so a repainted row never
  // re-measures the board.  It is the cheapest available fix for the one
  // genuinely expensive thing the studio does — a full 128×128 DOM grid.
  '.status-pet-grid-row{display:flex;gap:1px;flex:1 1 0;min-height:0;contain:layout style paint;}',
  '.status-pet-cell{flex:1 1 0;min-width:0;cursor:crosshair;contain:layout style paint;',
  'box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l2);}',
  '.status-pet-ghost{opacity:.35;pointer-events:none;}',
  '.status-pet-takeover{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;}',
  '.status-pet-takeover button{box-shadow:var(--dsw-elevation-panel);}',
  // the action preview: its own column beside the board — but ONLY once the board
  // is at its own ceiling anyway (700px ≈ the cap + the label column + the
  // preview column), so a narrower pane gives the board the room instead.  The
  // preview holds the preview and nothing else: the selected frame's numbers
  // belong WITH the frames.
  '.status-pet-inspect{width:auto;}',
  '.status-pet-num-field{display:flex;align-items:center;gap:6px;flex:none;}',
  // ── the action library (编辑 · 按状态 only) ──
  // The library is a REFERENCE TABLE you tick, so it is a scrollable list of
  // rows rather than a grid of cards: each row is one action (checkbox · thumb ·
  // name · who plays it), the whole row is the label so a click anywhere on it
  // toggles, and a row whose checkbox is ticked is bolded.  The max-height is
  // what keeps a 106-action built-in library from pushing the page off the
  // screen — the studio (按动作) no longer renders it at all.
  '.status-pet-library{flex:1 1 100%;display:flex;flex-direction:column;gap:2px;min-width:0;',
  'max-height:280px;overflow:auto;border:.5px solid var(--dsw-alias-border-l2);',
  'border-radius:var(--dsw-radius-md);padding:4px;}',
  '.status-pet-library-row{display:flex;align-items:center;gap:6px;padding:2px 4px;',
  'border-radius:6px;min-width:0;}',
  '.status-pet-library-check{flex:none;margin:0;cursor:pointer;}',
  '.status-pet-library-row{cursor:pointer;}',
  '.status-pet-library-row canvas{flex:none;border-radius:3px;}',
  '.status-pet-library-name{font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary);',
  'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}',
  '.status-pet-library-row.assigned .status-pet-library-name{color:inherit;font-weight:600;}',
  '.status-pet-library-meta{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);',
  'margin-left:auto;flex:none;}',
  '.status-pet-action-name{width:140px;}',
  // ── 导入 (编辑 · 按动作) ── an inline picker under the 动作 row.  A row is a
  // BUTTON (click = overwrite the action being edited), so it resets the button
  // chrome the assignment list's <label> rows never had.
  '.status-pet-import{flex:1 1 100%;display:flex;flex-direction:column;gap:6px;min-width:0;}',
  '.status-pet-import-search{box-sizing:border-box;width:100%;font-family:inherit;font-size:12px;',
  'line-height:16px;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;',
  'padding:4px 8px;background:transparent;color:inherit;}',
  '.status-pet-import-body{display:flex;flex-direction:column;gap:8px;min-width:0;',
  'max-height:260px;overflow:auto;border:.5px solid var(--dsw-alias-border-l2);',
  'border-radius:var(--dsw-radius-md);padding:4px;}',
  '.status-pet-import-group{display:flex;flex-direction:column;gap:2px;min-width:0;}',
  '.status-pet-import-group-title{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);',
  'padding:2px 4px;}',
  '.status-pet-import-list{display:flex;flex-direction:column;gap:2px;min-width:0;}',
  '.status-pet-import-row{width:100%;border:none;background:transparent;color:inherit;',
  'font-family:inherit;text-align:left;}',
  '.status-pet-import-row:hover{background:var(--dsw-alias-interactive-bg-hover);}',
  // takes + frames
  '.status-pet-filmstrip{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:2px 0;min-width:0;}',
  '.status-pet-frame-thumb{padding:2px;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;cursor:pointer;line-height:0;flex:none;}',
  '.status-pet-frame-thumb.active{border-color:var(--dsw-alias-state-business-primary);outline:1px solid var(--dsw-alias-state-business-primary);}',
  '.status-pet-frame-thumb canvas{border-radius:3px;}',
  '.status-pet-frame-nav{flex:1 1 100%;display:flex;gap:6px;align-items:center;flex-wrap:wrap;min-width:0;}',
  // the selected frame's own numbers
  '.status-pet-prop-label{font-size:12px;line-height:16px;color:var(--dsw-alias-label-tertiary);flex:none;cursor:help;}',
  '.status-pet-nudge{display:grid;grid-template-columns:repeat(3,24px);grid-template-rows:repeat(2,24px);gap:2px;}',
  // a number input (pacing): the io textarea is a different, taller thing
  '.status-pet-number{box-sizing:border-box;width:72px;font-family:inherit;font-size:12px;line-height:16px;',
  'border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;padding:2px 6px;background:transparent;color:inherit;}',
  // empty body state — as wide as the board would have been (the stage keeps
  // its column) but only as tall as its message; generating the draft grows it
  '.status-pet-empty-body{border:.5px dashed var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);padding:16px;',
  'width:min(100%,52vh,512px);box-sizing:border-box;display:flex;flex-direction:column;gap:8px;',
  'align-items:center;justify-content:center;text-align:center;font-size:12px;color:var(--dsw-alias-label-secondary);}',
  '.status-pet-ghost-link{border:none;background:transparent;padding:0;color:var(--dsw-alias-label-tertiary);font-size:12px;cursor:pointer;text-decoration:underline;font-family:inherit;}',
  '.status-pet-ghost-link:hover{color:inherit;}',
  '.status-pet-footer{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}',
  // A pane wide enough for the preview to sit BESIDE the board (its column is
  // the preview's own width); below that the stage stays one column, the board
  // keeps the whole width, and the preview turns into a compact strip under it.
  '@container (min-width:700px){',
  '.status-pet-stage{grid-template-columns:minmax(0,1fr) auto;}',
  '}',
  '@container (max-width:699px){',
  '.status-pet-inspect{flex-direction:row;flex-wrap:wrap;justify-content:center;width:100%;}',
  '}',
].join('');
