// The CSS, inlined into the components as a <style> element so unmounting
// removes it.  Two copies are harmless (the dock and the settings page may each
// mount one), and states accents come last so they outrank :hover at equal
// specificity.
//
// Tokens only — colours, radii and fonts are the host's design system.  State
// accents are wrapped in `color-mix(…, transparent)` so a renamed token degrades
// to an untinted pill instead of breaking the render.

/** 弹窗字幕的框宽 —— 和 `.status-pet-popup-title` 的 CSS **同一个值**，所以这里
 *  导出它：popup 的滚动 hook 要拿它当"几何记号"（框宽变了才重量），两边写两遍
 *  就会悄悄错开。 悬浮层不跟 dock 的窄/中/宽走，也不跟台词内容走（内容一变宽，
 *  锚在宠物上的面板就跟着一胀一缩）。 它同时**决定面板有多宽**：预览是 80px 的
 *  身体，字幕框是面板里最宽的东西，所以框收窄 = 面板收窄，两侧的空白也跟着收。 */
export const POPUP_LINE_W = 'min(120px,50vw)';

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
  // 从左边开始；宽度改动也不会让它再动一次。
  '.status-pet-line-run.scrolling{max-width:none;overflow:visible;animation-name:statusPetScroll;animation-duration:4000ms;animation-timing-function:linear;animation-iteration-count:1;animation-fill-mode:forwards;}',
  // 12% / 88% 与 line-scroll.ts 的 `SCROLL.holdPct` 配对：两端各停一拍，中间匀速走完。
  //
  // 终点是**布局表达式**，不是 JS 量的数字：`--status-pet-line-w` 是框宽（继承下来），
  // `100%` 是 run 自己的宽度 = 内容宽度，所以 `min(0px, 框宽 - 内容宽)` 正好是"内容
  // 右缘贴住框右缘"——内容够宽时取 0（不动），溢出时取负的溢出量。 浏览器按真实排版
  // 算，量错、换字体、动画途中重排都不可能让它多滚或少滚，更不会在动画结束后把文字
  // 再推一下（旧写法把位移放进 CSS 变量，一改就等于改动画目标值）。
  '@keyframes statusPetScroll{0%,12%{transform:translateX(0)}88%,100%{transform:translateX(min(0px,calc(var(--status-pet-line-w) - 100%)))}}',
  // Visually hidden, still announced: the popup's live region.
  '.status-pet-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;}',
  '.status-pet-popup{position:fixed;z-index:70;box-sizing:border-box;cursor:pointer;user-select:none;background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);box-shadow:var(--dsw-elevation-panel);padding:9px 9px 8px;display:flex;flex-direction:column;align-items:center;gap:5px;}',
  '.status-pet-popup-preview{border:none;background:transparent;cursor:pointer;line-height:0;border-radius:var(--dsw-radius-md);padding:4px;font-family:inherit;}',
  '.status-pet-popup-preview:hover{background:var(--dsw-alias-interactive-bg-hover);}',
  '.status-pet-popup-preview:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;}',
  // 弹窗字幕：和 dock 一样是固定宽度 —— 台词在弹窗里也每 7~9 秒换一次，宽度跟
  // 着内容走的话，锚在宠物上的面板会跟着一胀一缩。 悬浮层不跟 dock 的窄/中/宽走，
  // 但它**是面板里最宽的东西**：预览只有 80px 的身体，字幕框却曾经是 200px，于是
  // 面板比它展示的宠物宽出一大截，左右各空 60 多像素。 所以框收窄到 `POPUP_LINE_W`
  // ——面板跟着收，宠物在面板里的占比就上来了。 短句居中（`margin:0 auto`），长句
  // 解掉钳制后从左滚（`line-height` 与 dock 的 16px 一致）。
  '.status-pet-popup-title{--status-pet-line-w:' + POPUP_LINE_W + ';box-sizing:border-box;width:var(--status-pet-line-w);overflow:hidden;font-size:12px;line-height:16px;white-space:nowrap;color:var(--dsw-alias-label-secondary);}',
  '.status-pet-popup-title .status-pet-line-run{margin:0 auto;}',
  // 「等你批准」的呼吸：动画只碰 `opacity`，一行合成就够 —— 它挂在 `::after` 上，
  // 所以主线程每帧什么都不用做。 以前直接动 `background`，而背景色**不在合成器**
  // 的名单里：于是只要有东西在等你，整条 dock 就每帧重算样式 + 重绘一次，一直不停。
  '@keyframes statusPetPulse{0%,100%{opacity:0}50%{opacity:1}}',
  // `isolation:isolate` 让伪元素能待在 `z-index:-1`：涂层落在按钮自己的背景之上、
  // 内容（头像和台词）之下 —— 和以前"把背景色染上"是同一个观感，一行没差。
  '.status-pet-pill{position:relative;isolation:isolate;}',
  '.status-pet-pill.attention::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;pointer-events:none;background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 24%, transparent);animation:statusPetPulse 1.6s ease-in-out infinite;}',
  '.status-pet-pill.error{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 18%, transparent);}',
  '@media (prefers-reduced-motion: reduce){.status-pet-pill.attention::before{animation:none;opacity:1;}.status-pet-line-run.scrolling{animation:none;max-width:100%;overflow:hidden;}}',
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
  // 状态两栏：左栏是 24 行状态（比右栏高得多），右栏是动作库。 两边**同一个旋钮**
  // ——`--status-pet-scroll-h`：右栏的库拿它限高，左栏的外框拿它兜底，窄容器里
  // 它一起收窄，不需要第二套数字。 左栏的滚动窗口比右栏的库高（右栏顶上还有头像
  // 和搜索行），但两边**底边齐平**，左栏不会在下面空出一条。
  // 左栏分成「外框 + 滚动区」两层：外框 `align-self:stretch` 撑满整行（那道竖直分隔线
  // 因此和右栏一样长），滚动区**占满外框**、自己滚，行数再多也不把整页拉长。
  // 滚动区是绝对定位的 `inset:0`：一是它因此不参与外框的固有高度（行高由右栏决定，
  // 而不是让 24 行的内容把整页顶长），二是它上边贴外框顶、下边贴外框底 —— 右栏的
  // 库底下到哪儿，左栏的滚动窗口就下到哪儿，两栏底边齐平，下面不会剩一条空白带。
  // 外框自己带 `min-height:var(--status-pet-scroll-h)`：右栏被搜索过滤短了的时候，
  // 左栏也不会矮于那个旋钮。
  '.status-pet-columns{--status-pet-scroll-h:min(44vh,360px);display:grid;grid-template-columns:176px minmax(0,1fr);gap:0;align-items:start;min-width:0;margin:14px 0;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);padding:14px;}',
  '.status-pet-state-list{position:relative;align-self:stretch;display:flex;flex-direction:column;gap:1px;min-width:0;min-height:var(--status-pet-scroll-h);padding-right:14px;border-right:.5px solid var(--dsw-alias-border-l2);}',
  '.status-pet-state-scroll{position:absolute;inset:0 14px 0 0;display:flex;flex-direction:column;gap:1px;min-width:0;overflow:auto;overscroll-behavior:contain;}',
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
  '@container (max-width:479px){.status-pet-columns{grid-template-columns:minmax(0,1fr);gap:12px;--status-pet-scroll-h:min(38vh,300px);}',
  // 堆叠之后外框回到文档流：高度就是滚动区的高度，所以取消 stretch、取消那个
  // min-height，滚动区也回到普通流并重新用旋钮限高 —— 24 行照样不把页面顶长。
  '.status-pet-state-list{align-self:auto;min-height:0;padding-right:0;padding-bottom:12px;border-right:none;border-bottom:.5px solid var(--dsw-alias-border-l2);}',
  '.status-pet-state-scroll{position:static;max-height:var(--status-pet-scroll-h);}',
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
  '.status-pet-library{flex:1 1 100%;display:flex;flex-direction:column;gap:1px;min-width:0;max-height:var(--status-pet-scroll-h,min(44vh,360px));overflow:auto;overscroll-behavior:contain;}',
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
  // 画板只画两层：底下是**一张画布**（原分辨率、1:1 绘制，交给合成器 `pixelated`
  // 放大），上面是一层 CSS 网格（`::after`）。 以前这里是一格一个 div —— 一张
  // 128×128 的脸就是 16384 个节点、每格一条内阴影，切到「全身」要一百毫秒才提交完，
  // 整页卡住。 网格间距写成 `100% / n`，`n` 由 board.ts 内联给出（头像 32 / 全身
  // 128），所以画板不管被 flex 拉成多大，网格永远是一根 1 CSS px 的网线。
  '.status-pet-grid{--status-pet-grid-n:32;position:relative;flex:1 1 auto;min-width:0;min-height:0;contain:layout style;}',
  '.status-pet-grid>canvas{position:absolute;inset:0;width:100%;height:100%;}',
  '.status-pet-grid::after{content:"";position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(to right,var(--dsw-alias-border-l2,rgba(127,127,127,.45)) 1px,transparent 1px),linear-gradient(to bottom,var(--dsw-alias-border-l2,rgba(127,127,127,.45)) 1px,transparent 1px);background-size:calc(100% / var(--status-pet-grid-n)) calc(100% / var(--status-pet-grid-n));}',
  '.status-pet-empty-body{border:.5px dashed var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);padding:16px;width:min(100%,52vh,512px);box-sizing:border-box;display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;text-align:center;font-size:12px;color:var(--dsw-alias-label-secondary);}',
  '.status-pet-filmstrip{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:2px 0;min-width:0;}',
  '.status-pet-frame-thumb{padding:2px;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;cursor:pointer;line-height:0;flex:none;}',
  '.status-pet-frame-thumb.active{border-color:var(--dsw-alias-state-business-primary);outline:1px solid var(--dsw-alias-state-business-primary);}',
  '.status-pet-frame-thumb canvas{border-radius:3px;}',
  '@container (min-width:380px){.status-pet-stage{grid-template-columns:minmax(0,512px) auto;justify-content:center;}}',
].join('');
