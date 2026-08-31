import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readSource(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

const composerSource = readSource('src/renderer/components/chat/ChatComposer.jsx')
const advancedEditorModalSource = readSource('src/renderer/components/chat/ComposerCodeBlockAdvancedEditorModal.jsx')
const draftTextareaSource = readSource('src/renderer/components/chat/ChatComposerDraftTextarea.jsx')
const resizeSource = readSource('src/renderer/components/chat/use-chat-composer-resize.mjs')
const slashRegistrySource = readSource('src/renderer/components/chat/slash-command-registry.mjs')
const slashMenuSource = readSource('src/renderer/components/chat/SlashCommandMenu.jsx')

test('chat composer keeps advanced Monaco editor wiring for code blocks', () => {
  assert.match(composerSource, /import\s+ComposerCodeBlockAdvancedEditorModal\s+from\s+'\.\/ComposerCodeBlockAdvancedEditorModal\.jsx'/)
  assert.match(composerSource, /data-ui="chat-composer-code-open-advanced"/)
  assert.match(composerSource, /<ComposerCodeBlockAdvancedEditorModal/)
  assert.match(composerSource, /onApply=\{applyAdvancedCodeEditor\}/)
  assert.match(composerSource, /onCancel=\{closeAdvancedCodeEditor\}/)
  assert.match(advancedEditorModalSource, /import\s+\{\s*createPortal\s*\}\s+from\s+'react-dom'/)
  assert.match(advancedEditorModalSource, /return createPortal\(modal, document\.body\)/)
})

test('chat composer delegates resize orchestration to the dedicated resize hook contract', () => {
  assert.match(composerSource, /import\s+useChatComposerResize\s+from\s+'\.\/use-chat-composer-resize\.mjs'/)
  assert.match(composerSource, /import\s+ChatComposerDraftTextarea\s+from\s+'\.\/ChatComposerDraftTextarea\.jsx'/)
  assert.match(composerSource, /const\s+\{\s*activeDraftTextareaMaxHeight,[\s\S]*handleDraftResizePointerDown,[\s\S]*explicitDraftTextareaHeight,[\s\S]*setPrimaryComposerRef,/)
  assert.match(composerSource, /}\s*=\s*useChatComposerResize\(\{/)
  assert.match(composerSource, /normalizedBlocksLength:\s*normalizedBlocks\.length/)
  assert.match(composerSource, /<ChatComposerDraftTextarea/)
  assert.match(composerSource, /composerBlocksSyncVersion = 0/)
  assert.match(composerSource, /composerDraftSyncVersion=\{composerDraftSyncVersion\}/)
  assert.match(composerSource, /slashCommandsEnabled=\{normalizedBlocks\.length === 0\}/)
  assert.match(composerSource, /slashMenuExtraWidthPx=\{composerActionsWidth > 0 \? composerActionsWidth \+ 12 : 0\}/)
})

test('chat composer keeps snippet block editing local to memoized row components', () => {
  assert.match(composerSource, /const \[liveComposerBlocks, setLiveComposerBlocks\] = React\.useState/)
  assert.match(composerSource, /\}, \[composerBlocksSyncVersion, composerBlocks\]\)/)
  assert.match(composerSource, /const MemoChatComposerCodeBlockRow = React\.memo\(ChatComposerCodeBlockRow\)/)
  assert.match(composerSource, /const MemoChatComposerTextBlockRow = React\.memo\(ChatComposerTextBlockRow\)/)
  assert.match(composerSource, /const deferredCode = React\.useDeferredValue\(String\(block\.code \|\| ''\)\)/)
  assert.match(composerSource, /const \[highlightHtml, setHighlightHtml\] = React\.useState\(null\)/)
  assert.match(composerSource, /const cancelScheduledHighlight = scheduleComposerHighlightWork\(\(\) => \{/)
  assert.match(composerSource, /const nextHighlightHtml = deriveCodeBlockHighlightHtml\(deferredCode, deferredLanguage\)/)
  assert.doesNotMatch(composerSource, /React\.useState\(\(\s*deriveCodeBlockHighlightHtml\(block\.code, block\.language\)/)
  assert.match(composerSource, /commitLocalBlocks\(nextBlocks, \{ source: 'code_block_keymap' \}\)/)
})

test('chat composer draft textarea wires the local slash command menu and keyboard interception', () => {
  assert.match(draftTextareaSource, /import SlashCommandMenu from '\.\/SlashCommandMenu\.jsx'/)
  assert.match(draftTextareaSource, /resolveSlashCommandMenuState/)
  assert.match(draftTextareaSource, /applySlashCommandSelection/)
  assert.match(draftTextareaSource, /const \[slashSelectionIndex, setSlashSelectionIndex\] = React\.useState\(0\)/)
  assert.match(draftTextareaSource, /const \[dismissedSlashToken, setDismissedSlashToken\] = React\.useState\(''\)/)
  assert.match(draftTextareaSource, /if \(slashMenuOpen && slashItems\.length > 0\)/)
  assert.match(draftTextareaSource, /e\.key === 'ArrowDown'/)
  assert.match(draftTextareaSource, /e\.key === 'ArrowUp'/)
  assert.match(draftTextareaSource, /e\.key === 'Enter' \|\| e\.key === 'Tab'/)
  assert.match(draftTextareaSource, /e\.key === 'Escape'/)
  assert.match(draftTextareaSource, /<SlashCommandMenu/)
  assert.match(draftTextareaSource, /extraWidthPx=\{slashMenuExtraWidthPx\}/)
  assert.match(slashMenuSource, /data-ui="chat-composer-slash-menu"/)
})

test('slash command menu scrolls the active option into view and expands to the full composer width', () => {
  assert.match(slashMenuSource, /const listRef = React\.useRef\(null\)/)
  assert.match(slashMenuSource, /querySelector\(`\[data-slash-item-index="\$\{selectedIndex\}"\]`\)/)
  assert.match(slashMenuSource, /scrollIntoView\(\{ block: 'nearest' \}\)/)
  assert.match(slashMenuSource, /extraWidthPx = 0/)
  assert.match(slashMenuSource, /width: resolvedExtraWidthPx > 0/)
})

test('slash command registry keeps the expected chat command templates', () => {
  assert.match(slashRegistrySource, /label: '\/compact'/)
  assert.match(slashRegistrySource, /label: '\/compact-threshold'/)
  assert.match(slashRegistrySource, /label: '\/agent'/)
  assert.match(slashRegistrySource, /label: '\/agents'/)
  assert.match(slashRegistrySource, /label: '\/createrole'/)
  assert.match(slashRegistrySource, /label: '\/dispatch'/)
  assert.match(slashRegistrySource, /label: '\/pipeline'/)
  assert.match(slashRegistrySource, /label: '\/council'/)
  assert.match(slashRegistrySource, /label: '\/review'/)
})

test('chat composer resize hook commits draft resize preference after drag completes', () => {
  const moveStart = resizeSource.indexOf('const handleDraftResizePointerMove =')
  const moveEnd = resizeSource.indexOf('React.useEffect(() => {', moveStart)
  const moveSegment = resizeSource.slice(moveStart, moveEnd)
  assert.match(moveSegment, /const nextHeight = clampDraftTextareaMaxHeight\(drag\.startHeight \+ delta\)/)
  assert.match(moveSegment, /setDraftTextareaHeightOverride\(/)
  assert.doesNotMatch(moveSegment, /setDraftTextareaMaxHeight\(/)

  const endStart = resizeSource.indexOf('const endDraftResizeDrag')
  const endEnd = resizeSource.indexOf('React.useEffect(() => () => {', endStart)
  const endSegment = resizeSource.slice(endStart, endEnd)
  assert.match(endSegment, /const committedHeight = Math\.max\(\s*DEFAULT_DRAFT_TEXTAREA_MAX_HEIGHT,\s*clampDraftTextareaMaxHeight\(overrideHeight\),\s*\)/s)
  assert.match(endSegment, /setDraftTextareaMaxHeight\(/)
})

test('chat composer keeps live draft height sync local to the draft textarea child and keeps the draft handle out of the textarea overlay by default', () => {
  assert.match(resizeSource, /const DEFAULT_DRAFT_TEXTAREA_MAX_HEIGHT = 115/)
  assert.match(resizeSource, /const MIN_PERSISTED_DRAFT_TEXTAREA_MAX_HEIGHT = DEFAULT_DRAFT_TEXTAREA_MAX_HEIGHT/)
  assert.match(resizeSource, /const DRAFT_TEXTAREA_MAX_HEIGHT_STORAGE_KEY = 'addom\.chatComposer\.draftTextareaManualHeight'/)
  assert.match(resizeSource, /const \[draftTextareaMaxHeightLimit, setDraftTextareaMaxHeightLimit\] = React\.useState\(/)
  assert.match(resizeSource, /const hasManualDraftTextareaExpansion = Number\.isFinite\(resolvedDraftTextareaHeightOverride\)/)
  assert.match(resizeSource, /const explicitDraftTextareaHeight = hasManualDraftTextareaExpansion/)
  assert.match(draftTextareaSource, /const \[draftText, setDraftText\] = React\.useState\(\(\) => String\(composerDraftText \|\| ''\)\)/)
  assert.match(draftTextareaSource, /const \[layout, setLayout\] = React\.useState\(\(\) => \(\{/)
  assert.match(draftTextareaSource, /const contentHeight = Math\.max\(minHeight, Math\.ceil\(Number\(node\.scrollHeight\) \|\| 0\)\)/)
  assert.match(draftTextareaSource, /const nextShouldScroll = contentHeight > nextHeight/)
  assert.match(draftTextareaSource, /React\.useLayoutEffect\(\(\) => \{\s*measureLayout\(\)\s*\}, \[measureLayout, draftText\]\)/s)
  assert.match(draftTextareaSource, /if \(!node \|\| typeof ResizeObserver !== 'function'\) return undefined/)
  assert.match(draftTextareaSource, /const observer = new ResizeObserver\(\(\) => \{\s*measureLayout\(\)\s*\}\)/s)
  assert.match(draftTextareaSource, /rows=\{1\}/)
  assert.match(draftTextareaSource, /const rawNext = String\(event\?\.\s*target\?\.\s*value \|\| ''\)/)
  assert.match(draftTextareaSource, /setDraftText\(rawNext\)/)
  assert.match(draftTextareaSource, /overflow-y-hidden/)
  assert.match(draftTextareaSource, /overflow-y-auto/)
  assert.match(draftTextareaSource, /height: `\$\{Math\.round\(Number\(layout\.heightPx\) \|\| 0\)\}px`/)
  assert.match(draftTextareaSource, /scrollbarGutter: 'stable'/)
  assert.match(draftTextareaSource, /\}, \[composerDraftSyncVersion, composerDraftText\]\)/)
  assert.match(composerSource, /const showInlineDraftResizeHandle = hasSnippetBlocks && showDraftResizeHandle/)
  assert.match(composerSource, /const showShellTopResizeHandle = showBlocksResizeHandle \|\| \(!hasSnippetBlocks && showDraftResizeHandle\)/)
  assert.match(composerSource, /className=\{?[`"']relative w-full min-w-0 self-start min-h-0 flex flex-col overflow-visible[\s\S]*?\}?\s*>\s*\{attachedImages\.length > 0 && \(/s)
  assert.match(composerSource, /className="relative mb-1 min-h-3[\s\S]*?"/)
  assert.match(composerSource, /cursor-ns-resize[\s\S]*?hover:opacity-100 transition-opacity/)
  assert.match(composerSource, /pointer-events-none absolute inset-x-0 top-0 z-20 flex h-0 justify-center/)
})

test('chat composer resize hook uses plain pointer delta math with pointer capture', () => {
  assert.match(resizeSource, /const delta = drag\.startY - pointerY/)
  assert.match(resizeSource, /const nextHeight = clampDraftTextareaMaxHeight\(drag\.startHeight \+ delta\)/)
  assert.match(resizeSource, /const nextHeight = clampBlocksViewportHeight\(drag\.startHeight \+ delta\)/)
  assert.match(resizeSource, /resizeDragRef\.current = \{\s*startY: Number\(event\.clientY \|\| 0\),\s*startHeight: blocksViewportHeightRef\.current,\s*handleElement: event\.currentTarget \|\| null,\s*pointerId: Number\(event\.pointerId\),\s*\}/s)
  assert.match(resizeSource, /const startHeight = Math\.max\(DEFAULT_DRAFT_TEXTAREA_MAX_HEIGHT,\s*resolvedStartHeight\)/)
  assert.match(resizeSource, /event\.currentTarget\?\.setPointerCapture\?\.\(event\.pointerId\)/)
  assert.match(resizeSource, /drag\?\.handleElement\?\.releasePointerCapture\?\.\(drag\.pointerId\)/)
  assert.match(resizeSource, /drag\?\.handleElement\?\.releasePointerCapture\?\.\(drag\.pointerId\)/)
})

test('chat composer resize hook reserves snippet viewport space when resizing the draft area', () => {
  assert.match(resizeSource, /const reservedForBlocks = MIN_BLOCKS_VIEWPORT_HEIGHT \+ BLOCKS_VIEWPORT_BOTTOM_MARGIN_PX/)
  assert.match(resizeSource, /const shellHeightBudget = composerShellMaxHeight && composerShellMaxHeight > 0/)
  assert.match(resizeSource, /const shellLimited = Math\.max\(\s*MIN_DRAFT_TEXTAREA_MAX_HEIGHT,/s)
  assert.match(resizeSource, /const syncDraftTextareaMaxHeightLimit = React\.useCallback\(\(\) => \{/)
  assert.match(resizeSource, /const scheduleDraftTextareaMaxHeightLimitSync = React\.useCallback\(\(\) => \{/)
  assert.match(composerSource, /minHeight: `\$\{minBlocksViewportHeight\}px`/)
  assert.match(composerSource, /flexShrink: 0/)
})

test('chat composer resize hook keeps shell max-height on a stable viewport budget instead of feeding back from its own resized top edge', () => {
  assert.match(resizeSource, /const nextHeight = Math\.floor\(viewportHeight \* 0\.75\)/)
  assert.match(resizeSource, /nextHeight - COMPOSER_SHELL_VIEWPORT_BOTTOM_GAP_PX/)
  assert.doesNotMatch(resizeSource, /shellEl && typeof shellEl\.getBoundingClientRect === 'function'/)
  assert.doesNotMatch(resizeSource, /blocksViewportHeight,\s*draftTextareaMaxHeight,\s*draftTextareaHeightOverride,/s)
})

test('chat composer resize hook only reclamps stored draft heights when the structural limit changes', () => {
  assert.match(
    resizeSource,
    /React\.useEffect\(\(\) => \{\s*setDraftTextareaMaxHeight\(\(prev\) => \{\s*const next = clampDraftTextareaMaxHeight\(prev\)/s,
  )
  assert.match(
    resizeSource,
    /\}, \[draftTextareaMaxHeightLimit, clampDraftTextareaMaxHeight\]\)/,
  )
})

test('chat composer resize hook mounts a body-level drag shield while either resize handle owns the gesture', () => {
  assert.match(resizeSource, /const mountGlobalResizeOverlay = React\.useCallback\(\(\) => \{/)
  assert.match(resizeSource, /overlay\.setAttribute\('data-ui', 'chat-composer-global-resize-overlay'\)/)
  assert.match(resizeSource, /overlay\.style\.position = 'fixed'/)
  assert.match(resizeSource, /overlay\.style\.inset = '0'/)
  assert.match(resizeSource, /overlay\.style\.zIndex = '2147483647'/)
  assert.match(resizeSource, /document\.body\.appendChild\(overlay\)/)
  assert.match(resizeSource, /const unmountGlobalResizeOverlay = React\.useCallback\(\(\) => \{/)
  assert.match(resizeSource, /overlay\.remove\(\)/)
  assert.match(resizeSource, /mountGlobalResizeOverlay\(\)/)
  assert.match(resizeSource, /unmountGlobalResizeOverlay\(\)/)
})
