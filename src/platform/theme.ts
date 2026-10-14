// The CSS, inlined into the components as a <style> element so unmounting
// removes it.  Two copies are harmless (the dock and the settings page may each
// mount one), and states accents come last so they outrank :hover at equal
// specificity.
//
// Tokens only — colours, radii and fonts are the host's design system.  State
// accents are wrapped in `color-mix(…, transparent)` so a renamed token degrades
// to an untinted pill instead of breaking the render.

export const THEME = [
  '.status-pet-pill{box-sizing:border-box;border-radius:999px;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);display:inline-flex;align-items:center;justify-content:center;padding:1px 7px;cursor:pointer;line-height:0;flex:none;transition:background .15s ease;}',
  '.status-pet-pill:hover{background:var(--dsw-alias-interactive-bg-hover);}',
  '.status-pet-pill:active{background:var(--dsw-alias-interactive-bg-hover);}',
  '.status-pet-pill:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;}',
  '.status-pet-anchor{display:inline-flex;line-height:0;}',
  // The dock's line: a FIXED-width box inside the pill — never wider or narrower
  // than `--status-pet-line-w`, whatever she is saying.  The dock row is a
  // centered flex (the host's `.yhfFVG_dock`), so a box that followed its text
  // would re-center the whole status bar on every beat; the width is the fix.
  // `.left` / `.right` only move it to the other side of the avatar — the margin
  // is what keeps the text off the sprite.
  //
  // `--status-pet-line-w` is the width knob — a FIXED px value, set inline by the
  // dock from the user's 窄 / 中 / 宽 setting (skin/display.ts); the value here is
  // the same as the `medium` preset, so the box is right before the first paint.
  // What does not fit scrolls: see view/line-scroll.ts.
  '.status-pet-line{--status-pet-line-w:66px;box-sizing:border-box;display:block;flex:none;width:var(--status-pet-line-w);overflow:hidden;font-size:12px;line-height:16px;white-space:nowrap;}',
  '.status-pet-line.left{margin-right:6px;}',
  '.status-pet-line.right{margin-left:6px;}',
  // 台词本体：先按内容宽度排（`max-content`），装不下就省略号裁掉 —— 这是"不滚"
  // 时的样子，也是还没量过时的样子。 滚动时解掉裁剪与钳制，交给外面那个固定宽度的
  // 框去裁（否则位移出去的部分会被自己裁掉，右边反而留白）。
  '.status-pet-line-run{display:block;width:max-content;max-width:100%;overflow:hidden;text-overflow:ellipsis;}',
  // 一句**只滚一趟**：放完停在末尾（`forwards`），而末尾是贴着右缘的（位移 = 溢出量）
  // ——右边不会剩下一条空白。 循环播放等于把同一句话一遍遍重放
  // ——台词还没换它就一直重头来，看的人烦。 换台词时 `key={line}` 重挂 run，自然又
  // 从左边开始；留白（同一句）和宽度改动都不会让它再动一次。
  '.status-pet-line-run.scrolling{max-width:none;overflow:visible;animation-name:statusPetScroll;animation-duration:4000ms;animation-timing-function:linear;animation-iteration-count:1;animation-fill-mode:forwards;}',
  // 12% / 88% 与 line-scroll.ts 的 `SCROLL.holdPct` 配对：两端各停一拍，中间匀速走完。
  //
  // 终点是**布局表达式**，不是 JS 量的数字：`--status-pet-line-w` 是框宽（继承下来），
  // `100%` 是 run 自己的宽度 = 内容宽度，所以 `min(0px, 框宽 - 内容宽)` 正好是"内容
  // 右缘贴住框右缘"——内容够宽时取 0（不动），溢出时取负的溢出量。 浏览器按真实排版
  // 算，量错、换字体、动画途中重排都不可能让它多滚或少滚，更不会在动画结束后把文字
  // 再推一下（旧写法把位移放进 CSS 变量，一改就等于改动画目标值）。
  '@keyframes statusPetScroll{0%,12%{transform:translateX(0)}88%,100%{transform:translateX(min(0px,calc(var(--status-pet-line-w) - 100%)))}}',
  // 留白：她这一拍不说话。 只隐藏、不卸载 —— 盒子还在（宽度也还在），dock 的其余
  // 部分不会因为"她说不说话"而整体左右跳。（popup 的同一句同理。）
  '.status-pet-line.silent,.status-pet-popup-title.silent{visibility:hidden;}',
  // Visually hidden, still announced: the popup's live region.
  '.status-pet-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;}',
  '.status-pet-popup{position:fixed;z-index:70;box-sizing:border-box;cursor:pointer;user-select:none;background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);box-shadow:var(--dsw-elevation-panel);padding:12px;display:flex;flex-direction:column;align-items:center;gap:8px;}',
  '.status-pet-popup-preview{border:none;background:transparent;cursor:pointer;line-height:0;border-radius:var(--dsw-radius-md);padding:4px;font-family:inherit;}',
  '.status-pet-popup-preview:hover{background:var(--dsw-alias-interactive-bg-hover);}',
  '.status-pet-popup-preview:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;}',
  // 弹窗字幕：和 dock 一样是固定宽度 —— 台词在弹窗里也每 7~9 秒换一次，宽度跟
  // 着内容走的话，锚在宠物上的面板会跟着一胀一缩。 面板是悬浮层、地方够，所以它
  // 不跟 dock 的三档宽度走。 短句居中（`margin:0 auto`），长句解掉钳制后从左滚。
  '.status-pet-popup-title{--status-pet-line-w:min(200px,60vw);box-sizing:border-box;width:var(--status-pet-line-w);overflow:hidden;font-size:12px;line-height:18px;white-space:nowrap;color:var(--dsw-alias-label-secondary);}',
  '.status-pet-popup-title .status-pet-line-run{margin:0 auto;}',
  '@keyframes statusPetPulse{0%,100%{background:transparent}50%{background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 24%, transparent)}}',
  '.status-pet-pill.attention{animation:statusPetPulse 1.6s ease-in-out infinite;}',
  '.status-pet-pill.error{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 18%, transparent);}',
  '@media (prefers-reduced-motion: reduce){.status-pet-pill.attention{animation:none;background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 24%, transparent);}.status-pet-line-run.scrolling{animation:none;max-width:100%;overflow:hidden;}}',
  '.status-pet-section{flex-direction:column;width:100%;display:flex;}',
  '.status-pet-preview-button{border:none;background:transparent;cursor:pointer;line-height:0;border-radius:var(--dsw-radius-md);padding:8px;font-family:inherit;}',
  '.status-pet-preview-button:hover{background:var(--dsw-alias-interactive-bg-hover);}',
  '.status-pet-preview-button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;}',
  '.status-pet-gallery-title{font-size:14px;line-height:20px;padding:16px 0 8px;}',
  '.status-pet-docktext{display:flex;flex-direction:column;gap:6px;padding:12px 0 6px;border-bottom:.5px solid var(--dsw-alias-border-l2);}',
  '.status-pet-docktext-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}',
  '.status-pet-docktext-title{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary);flex:none;}',
  '.status-pet-axis{display:flex;gap:4px;align-items:center;padding:12px 0 8px;border-bottom:.5px solid var(--dsw-alias-border-l2);}',
  '.status-pet-axis .status-pet-mini-button{font-size:13px;line-height:20px;padding:3px 14px;}',
  '.status-pet-workshop{display:flex;flex-direction:column;gap:2px;min-width:0;}',
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
  '.status-pet-edit{display:flex;flex-direction:column;gap:12px;min-width:0;padding-left:14px;}',
  '.status-pet-edit-head{display:flex;align-items:center;gap:10px;min-width:0;padding-bottom:12px;border-bottom:.5px solid var(--dsw-alias-border-l2);}',
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
  '.status-pet-mini-button{font-size:12px;line-height:18px;padding:2px 10px;white-space:nowrap;flex:none;border-radius:var(--dsw-radius-md);border:.5px solid var(--dsw-alias-border-l2);background:transparent;cursor:pointer;font-family:inherit;color:inherit;}',
  '.status-pet-mini-button:hover{background:var(--dsw-alias-interactive-bg-hover);}',
  '.status-pet-mini-button:disabled,.status-pet-mini-button[aria-disabled=true]{opacity:.45;cursor:not-allowed;}',
  '.status-pet-mini-button:disabled:hover,.status-pet-mini-button[aria-disabled=true]:hover{background:transparent;}',
  '.status-pet-mini-button.active{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent);}',
  '.status-pet-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);}',
  '.status-pet-field{display:flex;align-items:flex-start;gap:10px;min-width:0;}',
  '.status-pet-field-label{flex:0 0 40px;font-size:12px;line-height:18px;padding-top:3px;color:var(--dsw-alias-label-tertiary);}',
  '.status-pet-field-body{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}',
  '.status-pet-library{flex:1 1 100%;display:flex;flex-direction:column;gap:1px;min-width:0;max-height:min(44vh,360px);overflow:auto;overscroll-behavior:contain;}',
  '.status-pet-library-row{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:6px;min-width:0;cursor:pointer;}',
  '.status-pet-library-check{flex:none;margin:0;cursor:pointer;}',
  '.status-pet-library-row canvas{flex:none;border-radius:3px;}',
  '.status-pet-library-name{font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}',
  '.status-pet-library-row.assigned .status-pet-library-name{color:inherit;font-weight:600;}',
  '.status-pet-library-row:hover{background:var(--dsw-alias-interactive-bg-hover);}',
  '.status-pet-library-meta{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);margin-left:auto;flex:none;}',
  '.status-pet-import-search{box-sizing:border-box;width:100%;font-family:inherit;font-size:12px;line-height:16px;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;padding:4px 8px;background:transparent;color:inherit;}',
  '.status-pet-search-row{flex:1 1 100%;display:flex;gap:8px;align-items:center;flex-wrap:wrap;min-width:0;}',
  '.status-pet-search-row .status-pet-import-search{flex:1 1 100px;width:auto;min-width:0;}',
  '.status-pet-search-row .status-pet-bulk-ops{margin-left:auto;flex:none;}',
  '.status-pet-bulk-ops{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}',
  '.status-pet-full{color:var(--dsw-alias-state-warn-primary);}',
  '.status-pet-library-group{padding:4px 4px 0;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);}',
  '.status-pet-row{display:flex;align-items:center;gap:8px;min-width:0;padding:4px 6px;border:.5px solid transparent;border-radius:6px;background:transparent;color:inherit;font-family:inherit;text-align:left;cursor:pointer;width:100%;box-sizing:border-box;}',
  '.status-pet-row:hover{background:var(--dsw-alias-interactive-bg-hover);}',
  '.status-pet-row.active{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent);}',
  '.status-pet-row.hi{background:var(--dsw-alias-interactive-bg-hover);}',
  '.status-pet-row canvas{flex:none;border-radius:3px;}',
  '.status-pet-row-text{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1 1 auto;}',
  '.status-pet-row-name{font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
  '.status-pet-row.active .status-pet-row-name{color:inherit;font-weight:600;}',
  '.status-pet-row-meta{font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
  '.status-pet-combo{position:relative;flex:1 1 220px;min-width:0;}',
  '.status-pet-combo-input{box-sizing:border-box;width:100%;font-family:inherit;font-size:13px;line-height:18px;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;padding:5px 24px 5px 9px;background:transparent;color:inherit;cursor:pointer;}',
  '.status-pet-combo-input:focus{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;cursor:text;}',
  '.status-pet-combo-caret{position:absolute;right:9px;top:50%;width:0;height:0;margin-top:-2px;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid var(--dsw-alias-label-tertiary);pointer-events:none;}',
  '.status-pet-combo-pop{position:absolute;z-index:30;top:calc(100% + 4px);left:0;right:0;display:flex;flex-direction:column;min-width:260px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-specific-menu, transparent);box-shadow:var(--dsw-elevation-panel);padding:4px;gap:4px;}',
  '.status-pet-combo-list{display:flex;flex-direction:column;gap:1px;max-height:264px;overflow:auto;min-width:0;}',
  '.status-pet-studio{display:flex;flex-direction:column;gap:12px;margin:14px 0;container-type:inline-size;}',
  '.status-pet-canvas-card{border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);padding:12px;display:flex;flex-direction:column;gap:12px;min-width:0;}',
  '.status-pet-face-switch{display:flex;gap:4px;align-items:center;flex:1 1 100%;}',
  '.status-pet-action-row{flex:1 1 100%;display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap;}',
  '.status-pet-action-row .status-pet-combo{flex:1 1 180px;min-width:0;}',
  '.status-pet-stage{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:start;min-width:0;flex:1 1 100%;}',
  '.status-pet-stage-cell{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0;width:100%;}',
  '.status-pet-inspect{width:auto;}',
  '.status-pet-board-wrap{position:relative;display:flex;width:min(100%,52vh,512px);aspect-ratio:1;}',
  '.status-pet-grid{flex:1 1 auto;display:flex;flex-direction:column;gap:1px;min-width:0;min-height:0;contain:layout style;}',
  '.status-pet-grid-row{display:flex;gap:1px;flex:1 1 0;min-height:0;contain:layout style paint;}',
  '.status-pet-cell{flex:1 1 0;min-width:0;contain:layout style paint;box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l2);}',
  '.status-pet-board-readonly .status-pet-cell{cursor:default;}',
  '.status-pet-empty-body{border:.5px dashed var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);padding:16px;width:min(100%,52vh,512px);box-sizing:border-box;display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;text-align:center;font-size:12px;color:var(--dsw-alias-label-secondary);}',
  '.status-pet-filmstrip{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:2px 0;min-width:0;}',
  '.status-pet-frame-thumb{padding:2px;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;cursor:pointer;line-height:0;flex:none;}',
  '.status-pet-frame-thumb.active{border-color:var(--dsw-alias-state-business-primary);outline:1px solid var(--dsw-alias-state-business-primary);}',
  '.status-pet-frame-thumb canvas{border-radius:3px;}',
  '@container (min-width:380px){.status-pet-stage{grid-template-columns:minmax(0,512px) auto;justify-content:center;}}',
].join('');