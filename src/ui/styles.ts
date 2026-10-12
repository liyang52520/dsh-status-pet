// Styles — inlined into the components as a <style> element so unmounting
// removes them.  (The dock pet and the settings page can each mount one
// copy; two identical <style> nodes are harmless, and either one unmounting
// never strips the other's styles.)  State accents come last so they
// outrank :hover at equal specificity, and they are colour-only via theme
// tokens, so a renamed token degrades to an untinted pill instead of
// breaking the render.
export const CSS = [
  '.status-pet-pill{box-sizing:border-box;border-radius:999px;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);display:inline-flex;align-items:center;justify-content:center;padding:1px 7px;cursor:pointer;line-height:0;flex:none;transition:background .15s ease;}',
  '.status-pet-pill:hover{background:var(--dsw-alias-interactive-bg-hover);}',
  '.status-pet-pill:active{background:var(--dsw-alias-interactive-bg-hover);}',
  '.status-pet-pill:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;}',
  '.status-pet-anchor{display:inline-flex;line-height:0;}',
  '.status-pet-popup{position:fixed;z-index:70;box-sizing:border-box;cursor:pointer;user-select:none;background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);box-shadow:var(--dsw-elevation-panel);padding:12px;display:flex;flex-direction:column;align-items:center;gap:8px;}',
  '.status-pet-popup-preview{border:none;background:transparent;cursor:pointer;line-height:0;border-radius:var(--dsw-radius-md);padding:4px;font-family:inherit;}',
  '.status-pet-popup-preview:hover{background:var(--dsw-alias-interactive-bg-hover);}',
  '.status-pet-popup-preview:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;}',
  '.status-pet-popup-title{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);}',
  '@keyframes statusPetPulse{0%,100%{background:transparent}50%{background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 24%, transparent)}}',
  '.status-pet-pill.attention{animation:statusPetPulse 1.6s ease-in-out infinite;}',
  '.status-pet-pill.error{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 18%, transparent);}',
  '@media (prefers-reduced-motion: reduce){.status-pet-pill.attention{animation:none;background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 24%, transparent);}}',
  '.status-pet-section{flex-direction:column;width:100%;display:flex;}',
  '.status-pet-preview-button{border:none;background:transparent;cursor:pointer;line-height:0;border-radius:var(--dsw-radius-md);padding:8px;font-family:inherit;}',
  '.status-pet-preview-button:hover{background:var(--dsw-alias-interactive-bg-hover);}',
  '.status-pet-preview-button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;}',
  '.status-pet-gallery-title{font-size:14px;line-height:20px;padding:16px 0 8px;}',
  '.status-pet-axis{display:flex;gap:4px;align-items:center;padding:12px 0 8px;border-bottom:.5px solid var(--dsw-alias-border-l2);}',
  '.status-pet-axis .status-pet-mini-button{font-size:13px;line-height:20px;padding:3px 14px;}',
  '.status-pet-workshop{display:flex;flex-direction:column;gap:2px;min-width:0;}',
  // ONE card around the whole 状态 body — the list and its edit inside a single
  // boundary, divided by a hairline.  Nothing floats under the axis any more.
  '.status-pet-columns{display:grid;grid-template-columns:176px minmax(0,1fr);gap:0;align-items:start;min-width:0;margin:14px 0;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);padding:14px;}',
  '.status-pet-state-list{display:flex;flex-direction:column;gap:1px;min-width:0;padding-right:14px;border-right:.5px solid var(--dsw-alias-border-l2);}',
  '.status-pet-list-caption{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);padding:10px 8px 3px;}',
  '.status-pet-list-caption:first-child{padding-top:2px;}',
  '.status-pet-state-row{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;min-width:0;padding:5px 8px;border:none;border-radius:6px;background:transparent;color:inherit;font-family:inherit;text-align:left;cursor:pointer;}',
  '.status-pet-state-row:hover{background:var(--dsw-alias-interactive-bg-hover);}',
  '.status-pet-state-row.active{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent);}',
  '.status-pet-state-name{font-size:13px;line-height:18px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
  '.status-pet-state-row.active .status-pet-state-name{color:inherit;font-weight:600;}',
  '.status-pet-state-meta{margin-left:auto;flex:none;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);}',
  '.status-pet-row{display:flex;align-items:center;gap:8px;min-width:0;padding:4px 6px;border:.5px solid transparent;border-radius:6px;background:transparent;color:inherit;font-family:inherit;text-align:left;cursor:pointer;width:100%;box-sizing:border-box;}',
  '.status-pet-row:hover{background:var(--dsw-alias-interactive-bg-hover);}',
  '.status-pet-row.active{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent);}',
  '.status-pet-row.hi{background:var(--dsw-alias-interactive-bg-hover);}',
  '.status-pet-row.on{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 6%, transparent);}',
  '.status-pet-row canvas{flex:none;border-radius:3px;}',
  '.status-pet-row-check{flex:none;margin:0;cursor:pointer;}',
  '.status-pet-row-text{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1 1 auto;}',
  '.status-pet-row-name{font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
  '.status-pet-row.active .status-pet-row-name{color:inherit;font-weight:600;}',
  '.status-pet-row-meta{font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
  '.status-pet-row-meta.idle-fallback{font-style:italic;}',
  '.status-pet-combo{position:relative;flex:1 1 220px;min-width:0;}',
  '.status-pet-combo-input{box-sizing:border-box;width:100%;font-family:inherit;font-size:13px;line-height:18px;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;padding:5px 24px 5px 9px;background:transparent;color:inherit;cursor:pointer;}',
  '.status-pet-combo-input:focus{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;cursor:text;}',
  '.status-pet-combo-caret{position:absolute;right:9px;top:50%;width:0;height:0;margin-top:-2px;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid var(--dsw-alias-label-tertiary);pointer-events:none;}',
  '.status-pet-combo-pop{position:absolute;z-index:30;top:calc(100% + 4px);left:0;right:0;display:flex;flex-direction:column;min-width:260px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-specific-menu, transparent);box-shadow:var(--dsw-elevation-panel);padding:4px;gap:4px;}',
  '.status-pet-combo-list{display:flex;flex-direction:column;gap:1px;max-height:264px;overflow:auto;min-width:0;}',
  '.status-pet-combo-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:4px;border-top:.5px solid var(--dsw-alias-border-l2);}',
  '.status-pet-edit{display:flex;flex-direction:column;gap:12px;min-width:0;padding-left:14px;}',
  // …and the header is its title bar: a hairline is the least that separates
  // "which state" from "what it plays".
  '.status-pet-edit-head{display:flex;align-items:center;gap:10px;min-width:0;',
  'padding-bottom:12px;border-bottom:.5px solid var(--dsw-alias-border-l2);}',
  '.status-pet-edit-text{display:flex;flex-direction:column;gap:2px;min-width:0;}',
  '.status-pet-edit-title{font-size:15px;line-height:22px;font-weight:600;}',
  '.status-pet-confirm{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:16px;background:color-mix(in srgb, #000 42%, transparent);}',
  '.status-pet-confirm-card{display:flex;flex-direction:column;gap:10px;max-width:320px;width:100%;padding:14px 16px;border-radius:var(--dsw-radius-md);border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-specific-menu);box-shadow:var(--dsw-elevation-panel);}',
  '.status-pet-confirm-title{font-size:14px;line-height:20px;font-weight:600;}',
  '@container (max-width:479px){.status-pet-columns{grid-template-columns:minmax(0,1fr);gap:12px;}',
  '.status-pet-state-list{max-height:min(38vh,300px);overflow:auto;padding-right:0;padding-bottom:12px;border-right:none;border-bottom:.5px solid var(--dsw-alias-border-l2);}',
  '.status-pet-edit{padding-left:0;}}',
  '.status-pet-workshop{container-type:inline-size;}',
  '.status-pet-skins{display:flex;gap:8px;flex-wrap:wrap;padding:4px 0 8px;}',
  '.status-pet-skin-card{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 14px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:transparent;cursor:pointer;font-family:inherit;color:inherit;}',
  '.status-pet-skin-card:hover{background:var(--dsw-alias-interactive-bg-hover);}',
  '.status-pet-skin-card.active{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent);}',
  '.status-pet-skin-name{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);}',
  '.status-pet-skin-badge{position:absolute;top:6px;right:6px;font-size:11px;line-height:14px;padding:0 4px;border-radius:4px;color:var(--dsw-alias-label-tertiary);border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-specific-menu);}',
  '.status-pet-colors{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}',
  '.status-pet-swatch{width:24px;height:24px;border-radius:6px;padding:0;cursor:pointer;border:.5px solid var(--dsw-alias-border-l2);background:transparent;font-family:inherit;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1;flex:none;}',
  '.status-pet-swatch-picker.active{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;}',
  '.status-pet-swatch[type=color]{overflow:hidden;}',
  '.status-pet-swatch[type=color]::-webkit-color-swatch-wrapper{padding:0;}',
  '.status-pet-swatch[type=color]::-webkit-color-swatch{border:none;}',
  '.status-pet-mini-button{font-size:12px;line-height:18px;padding:2px 10px;white-space:nowrap;flex:none;border-radius:var(--dsw-radius-md);border:.5px solid var(--dsw-alias-border-l2);background:transparent;cursor:pointer;font-family:inherit;color:inherit;}',
  '.status-pet-mini-button:hover{background:var(--dsw-alias-interactive-bg-hover);}',
  '.status-pet-mini-button:disabled,.status-pet-mini-button[aria-disabled=true]{opacity:.45;cursor:not-allowed;}',
  '.status-pet-mini-button:disabled:hover,.status-pet-mini-button[aria-disabled=true]:hover{background:transparent;}',
  '.status-pet-mini-button.active{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent);}',
  '.status-pet-studio{display:flex;flex-direction:column;gap:12px;margin:14px 0;container-type:inline-size;}',
  '.status-pet-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);}',
  // 头像 / 全身: a row ON TOP of the canvas, full width, so the board always
  // starts on its own line and the switch can never sit beside it.
  '.status-pet-face-switch{display:flex;gap:4px;align-items:center;flex:1 1 100%;}',
  '.status-pet-canvas-card{border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);padding:12px;display:flex;flex-direction:column;gap:12px;min-width:0;}',
  '.status-pet-field{display:flex;align-items:flex-start;gap:10px;min-width:0;}',
  '.status-pet-field-label{flex:0 0 40px;font-size:12px;line-height:18px;padding-top:3px;color:var(--dsw-alias-label-tertiary);}',
  '.status-pet-field-body{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}',
  '.status-pet-stage-cell{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0;width:100%;}',
  '.status-pet-board-wrap{position:relative;display:flex;width:min(100%,52vh,512px);aspect-ratio:1;}',
  '.status-pet-grid{flex:1 1 auto;display:flex;flex-direction:column;gap:1px;min-width:0;min-height:0;contain:layout style;}',
  '.status-pet-grid-row{display:flex;gap:1px;flex:1 1 0;min-height:0;contain:layout style paint;}',
  '.status-pet-cell{flex:1 1 0;min-width:0;cursor:crosshair;contain:layout style paint;box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l2);}',
  '.status-pet-takeover{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;}',
  '.status-pet-takeover button{box-shadow:var(--dsw-elevation-panel);}',
  '.status-pet-inspect{width:auto;}',
  '.status-pet-num-field{display:flex;align-items:center;gap:6px;flex:none;}',
  // The 动作 row is TWO explicit lines — the picker alone, then the action's
  // name beside 新建/删除 — instead of one wrapping row where five controls of
  // three different kinds fell wherever they fit.
  '.status-pet-action-row{flex:1 1 100%;display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap;}',
  '.status-pet-action-row .status-pet-combo{flex:1 1 180px;min-width:0;}',
  // 整幅挪动 is a labelled row of 当前帧: the name on the left, the pad in the
  // value column, so it lines up with the two number rows above it.
  '.status-pet-offset-row{align-items:center;flex:1 1 100%;}',
  // The library is 106 rows and grows without end: as a plain column it made the
  // card several screens tall and pushed 全选 / the studio out of reach.  It is a
  // SCROLL REGION instead — the search line above it stays put (it is the list's
  // filter, and it is what makes a 106-row window workable by hand) while the rows
  // move under it.  `overscroll-behavior:contain` keeps a hard flick from chaining
  // out to the settings page behind it.
  '.status-pet-library{flex:1 1 100%;display:flex;flex-direction:column;gap:1px;min-width:0;max-height:min(44vh,360px);overflow:auto;overscroll-behavior:contain;}',
  '.status-pet-library-row{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:6px;min-width:0;}',
  '.status-pet-library-check{flex:none;margin:0;cursor:pointer;}',
  '.status-pet-library-row{cursor:pointer;}',
  '.status-pet-library-row canvas{flex:none;border-radius:3px;}',
  '.status-pet-library-name{font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}',
  '.status-pet-library-row.assigned .status-pet-library-name{color:inherit;font-weight:600;}',
  '.status-pet-library-row canvas{flex:none;border-radius:3px;}',
  // …and the row you are pointing at is the one playing in the header.
  '.status-pet-library-row:hover{background:var(--dsw-alias-interactive-bg-hover);}',
  '.status-pet-library-meta{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);margin-left:auto;flex:none;}',
  // The name gets the row's spare width instead of a cramped 140px box that
  // clipped most of a Chinese name.  The WRAPPER has to be the flexible one:
  // `.status-pet-num-field` is `flex:none` (sized by its content), so an input
  // asking to grow inside it never could — it stayed at the input's intrinsic
  // ~20-character width.  The two verbs follow the field, not the row's edge.
  '.status-pet-action-name-field{flex:1 1 240px;min-width:0;max-width:420px;}',
  '.status-pet-action-name{flex:1 1 auto;width:100%;min-width:0;}',
  '.status-pet-import-search{box-sizing:border-box;width:100%;font-family:inherit;font-size:12px;line-height:16px;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;padding:4px 8px;background:transparent;color:inherit;}',
  '.status-pet-search-row{flex:1 1 100%;display:flex;gap:8px;align-items:center;flex-wrap:wrap;min-width:0;}',
  // The box must be able to SHRINK below its placeholder, or the ops beside it
  // get pushed onto a second line (the reported bug).
  '.status-pet-search-row .status-pet-import-search{flex:1 1 100px;width:auto;min-width:0;}',
  '.status-pet-search-row .status-pet-bulk-ops{margin-left:auto;flex:none;}',
  '.status-pet-bulk-ops{display:flex;gap:6px;align-items:center;flex-wrap:nowrap;}',
  '.status-pet-full{color:var(--dsw-alias-state-warn-primary);}',
  '.status-pet-bulk{flex:1 1 100%;display:flex;flex-direction:column;gap:6px;min-width:0;}',
  '.status-pet-bulk-ops{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}',
  '.status-pet-danger{color:var(--dsw-alias-state-error-primary);}',
  '.status-pet-filmstrip{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:2px 0;min-width:0;}',
  '.status-pet-frame-thumb{padding:2px;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;cursor:pointer;line-height:0;flex:none;}',
  '.status-pet-frame-thumb.active{border-color:var(--dsw-alias-state-business-primary);outline:1px solid var(--dsw-alias-state-business-primary);}',
  '.status-pet-frame-thumb canvas{border-radius:3px;}',
  // The frame ops are ONE group at the end of the filmstrip: `margin-left:auto`
  // keeps them together (and right-aligned) on whatever line the strip ends, so
  // 复制一帧 / 空白帧 / 删除此帧 never split up.
  // The frame ops are ONE group at the end of the filmstrip, so 复制一帧 / 空白帧 /
  // 删除此帧 never split up; when the strip wraps they start at the strip's own
  // left edge (no `margin-left:auto`, which pushed them off to the right).
  '.status-pet-frame-ops{display:flex;align-items:center;gap:6px;flex:none;}',
  '.status-pet-prop-label{font-size:12px;line-height:16px;color:var(--dsw-alias-label-tertiary);flex:none;cursor:help;}',
  '.status-pet-nudge{display:grid;grid-template-columns:repeat(3,24px);grid-template-rows:repeat(2,24px);gap:2px;}',
  '.status-pet-number{box-sizing:border-box;width:72px;font-family:inherit;font-size:12px;line-height:16px;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;padding:2px 6px;background:transparent;color:inherit;}',
  '.status-pet-empty-body{border:.5px dashed var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);padding:16px;width:min(100%,52vh,512px);box-sizing:border-box;display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;text-align:center;font-size:12px;color:var(--dsw-alias-label-secondary);}',
  '.status-pet-ghost-link{border:none;background:transparent;padding:0;color:var(--dsw-alias-label-tertiary);font-size:12px;cursor:pointer;text-decoration:underline;font-family:inherit;}',
  '.status-pet-ghost-link:hover{color:inherit;}',
  // The pane is ~555px, so a 700px threshold meant the preview was ALWAYS
  // stacked under the board.  460px is the honest floor: a board of ≥288px, a
  // gap, and the preview's 160px.  Wide panes cap the board column and CENTRE
  // the pair, instead of pushing the preview to the far edge across a gulf.
  // The stage is a GRID: one column by default, two from 460px of pane up (the
  // @container override below).  It is also a flex ITEM of the field body, hence
  // the 100% basis.
  '.status-pet-stage{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:start;min-width:0;flex:1 1 100%;}',
  // a full-width hint inside a field row (the built-in note)
  '.status-pet-field-wide{flex:1 1 100%;}',
  // A built-in's 动作 page is READ-ONLY: the board keeps its picture but is not a
  // drawing surface, so the crosshair (and the drag affordance behind it) goes
  // away.
  '.status-pet-board-readonly .status-pet-cell{cursor:default;}',
  // the checklist's two group captions (已勾给该状态 / 其他动作)
  '.status-pet-library-group{padding:4px 4px 0;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);}',
  // The preview is 80px (LIVE_ZOOM), so the pair fits on ONE row from 380px of
  // pane up — which is every settings pane in practice.
  '@container (min-width:380px){.status-pet-stage{grid-template-columns:minmax(0,512px) auto;justify-content:center;}}',
].join('');
