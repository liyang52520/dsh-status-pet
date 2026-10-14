// English copy.  Every user-visible string lives here — the dock tooltip and
// aria-label, the settings nav entry, and every caption on the Workshop page.
//
// Keys are state names and reaction names (plus `toolNamed`, the tool state's
// `{name}` variant), so the dictionary and the vocabulary in pet/vocabulary.ts
// cannot drift: `labels.test.ts` asserts both locales carry identical key sets
// and cover every registry entry.

export const en = {
  label: 'Status Pet',
  idle: 'Idle', sleep: 'Sleeping', think: 'Thinking…', stream: 'Responding…',
  tool: 'Running a tool…', toolNamed: 'Running {name}…',
  approval: 'Waiting for your approval',
  question: 'Waiting for your answer', error: 'Something went wrong',
  done: 'Done', petted: 'Blushing', woken: 'Woken up',

  'settings.nav': 'Status Pet',
  'settings.previewHint': 'Click to pet it',
  'settings.skins': 'Skin',
  'settings.skin.whale-chan': 'Whale-chan',

  // ── the ONE axis: the two things this page works on ──
  'settings.view': 'Workshop view',
  'settings.view.states': 'States',
  'settings.view.actions': 'Actions',

  // ── the two faces of an action: the switch lives WITH the picture it
  // changes, never on the page's navigation row ──
  'settings.face': 'Face',
  'settings.face.avatar': 'Avatar',
  'settings.face.body': 'Body',
  'settings.face.avatarHint': 'The 32×32 face the composer dock draws',
  'settings.face.bodyHint': 'The 128×128 face the click popup draws',

  // ── the master list ──
  'settings.master.states': 'States',
  'settings.master.reactions': 'Reactions',
  'settings.previewing': 'Previewing {name}',
  'settings.comboPlaceholder': 'Search or pick an action…',
  'settings.comboEmpty': 'No action matches “{q}”.',
  'settings.actionFrames': '{n} frames',

  // ── the 动作 view: the library, one action at a time ──
  'settings.region.action': 'Action',
  'settings.actionHint': 'The one action on the board. Which states play it is ticked in the state list.',
  'settings.region.canvas': 'Canvas',
  'settings.region.frames': 'Frames (played in order)',
  'settings.field.frames': 'Frames',
  'settings.frameN': 'Frame {n}',
  'settings.noBody': 'avatar only',
  'settings.emptyBody': 'No full-body face on this action — the popup shows the avatar at 4×.',

  // ── the assignment surface ──
  'settings.region.library': 'Actions',
  'settings.libraryHint': 'Every animation this skin owns. Ticking one means the selected state plays it — an action can be ticked in several states, and a state with nothing ticked follows Idle.',
  'settings.clearIdleTitle': 'Clear Idle?',
  'settings.clearIdleHint': 'Idle must keep at least one action: every state with nothing ticked falls back to it. None therefore keeps the FIRST one instead of leaving Idle empty.',
  'settings.actionCount': '{n} action(s)',
  'settings.actionN': 'Action {n}',
  'settings.usedByN': '{n} state(s) play this',
  'settings.unusedAction': 'no state plays this yet',
  'settings.playedHere': 'This state plays it',
  'settings.emptyLibrary': 'The library is empty.',

  // ── the list is two groups: what this state ticks comes first ──
  'settings.libraryTickedGroup': 'Ticked for this state ({n})',
  'settings.libraryRestGroup': 'Other actions ({n})',
  'settings.selectAll': 'All',
  'settings.clearSelection': 'None',
  'settings.searchActions': 'Search actions…',
  'settings.searchMatches': '{n} of {total}',
  'settings.searchEmpty': 'Nothing matches “{q}”.',
  'settings.selectedMax': '{n} ticked (the limit)',
  'settings.cancel': 'Cancel',
  'settings.followIdle': 'follows Idle',

  'settings.hint.idle': 'At rest, nothing running',
  'settings.hint.sleep': 'After a minute idle',
  'settings.hint.think': 'Message sent, no output yet',
  'settings.hint.stream': 'Output is arriving',
  'settings.hint.tool': 'A tool is executing',
  'settings.hint.approval': 'Waiting for your approval',
  'settings.hint.question': 'Waiting for your answer',
  'settings.hint.error': 'The last turn failed',
  'settings.hint.done': 'Finished, not yet seen',
  'settings.hint.petted': 'Right after a click',
  'settings.hint.woken': 'Hover or focus while asleep',
};
