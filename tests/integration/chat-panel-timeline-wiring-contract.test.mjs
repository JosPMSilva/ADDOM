import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const source = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src/renderer/components/ChatPanel.jsx'),
  'utf8',
)

test('ChatPanel forwards timeline metadata instead of hardcoding a null timelineBlockMeta', () => {
  assert.match(source, /buildTimelineBlocksWithMeta/)
  assert.match(source, /const \{ timelineBlocks, timelineBlockMeta \} = useMemo\(\(\) => \{/)
  assert.doesNotMatch(source, /const timelineBlockMeta = null/)
})

test('interrupted turn continuation is wired from ChatPanel to every execution stream', () => {
  const viewSource = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src/renderer/components/chat/ChatPanelView.jsx'),
    'utf8',
  )
  const timelineSource = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src/renderer/components/chat/ChatPanelTimelineArea.jsx'),
    'utf8',
  )
  assert.match(source, /handleContinueInterruptedTurn/)
  assert.match(viewSource, /onContinueInterruptedTurn=\{handleContinueInterruptedTurn\}/)
  assert.equal((timelineSource.match(/onContinueInterruptedTurn=\{onContinueInterruptedTurn\}/g) || []).length, 4)
})

test('execution streams receive final-answer transition state and replace legacy runbooks', () => {
  const timelineSource = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src/renderer/components/chat/ChatPanelTimelineArea.jsx'),
    'utf8',
  )
  const shellSource = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src/renderer/components/chat/TurnShell.jsx'),
    'utf8',
  )
  assert.match(timelineSource, /import TurnShell from '\.\/TurnShell\.jsx'/)
  assert.doesNotMatch(timelineSource, /RuntimeRoleTurnShell/)
  assert.match(timelineSource, /finalAnswerStarted=\{hasVisibleMessageContent\(entry\.message\)\}/)
  assert.match(timelineSource, /finalAnswerStarted=\{hasVisibleMessageContent\(streamingMessage\)\}/)
  assert.match(timelineSource, /dockSource="timeline"/)
  assert.match(timelineSource, /dockSource="streaming"/)
  assert.match(timelineSource, /const shouldRenderRunbook = !isLiveRunbook && !liveTurn/)
  assert.match(timelineSource, /const streamingFooterActive = streamingMessageIsActive/)
  assert.match(shellSource, /data-turn-shell-slot="execution"/)
  assert.match(shellSource, /data-turn-shell-slot="answer"/)
  assert.match(shellSource, /data-turn-shell-slot="files"/)
  assert.match(shellSource, /shouldRenderExecutionTurn/)
})

test('timeline and composer use non-overlapping sibling layout without a measured safe inset', () => {
  const viewSource = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src/renderer/components/chat/ChatPanelView.jsx'),
    'utf8',
  )
  const timelineSource = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src/renderer/components/chat/ChatPanelTimelineArea.jsx'),
    'utf8',
  )
  const virtualizationSource = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src/renderer/components/chat/use-timeline-virtualization.jsx'),
    'utf8',
  )
  const bottomAnchorSource = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src/renderer/components/chat/use-chat-panel-bottom-anchor.mjs'),
    'utf8',
  )

  assert.match(viewSource, /data-ui="chat-timeline-region"/)
  assert.match(viewSource, /data-ui="chat-composer-region"/)
  assert.match(viewSource, /key=\{activeThreadId \|\| 'no-thread'\}/)
  assert.match(viewSource, /className="relative min-h-0 flex-1"/)
  assert.match(viewSource, /className="relative z-20 shrink-0"/)
  assert.match(timelineSource, /data-ui="chat-timeline-scroll"/)
  assert.match(timelineSource, /useTimelineVirtualization\(\{ timelineBlocks, scrollContainerRef \}\)/)
  assert.match(virtualizationSource, /const shouldTrackScrollMetrics = timelineBlocks\.length >= TIMELINE_BLOCK_VIRTUALIZE_MIN_COUNT/)
  assert.match(timelineSource, /blockLayout\.entries\[blockIndex - 1\]/)
  assert.match(timelineSource, /blockLayout\.entries\[blockIndex \+ 1\]/)
  assert.doesNotMatch(virtualizationSource, /const shouldTrackScrollMetrics = \([\s\S]*!isStreaming/)
  assert.doesNotMatch(viewSource, /composerOverlayRef|chat-bottom-safe-inset/)
  assert.doesNotMatch(timelineSource, /chat-bottom-safe-inset/)
  assert.doesNotMatch(bottomAnchorSource, /resolveChatBottomSafeInsetPx|chat-bottom-safe-inset/)
})

test('timeline content dissolves into the composer boundary without painting or blurring the surface', () => {
  const viewSource = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src/renderer/components/chat/ChatPanelView.jsx'),
    'utf8',
  )
  const runtimeStyles = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src/renderer/styles/globals-runtime.css'),
    'utf8',
  )

  assert.doesNotMatch(viewSource, /data-ui="chat-composer-transcript-fade"/)
  const fadeRule = runtimeStyles.match(
    /\[data-ui=['"]chat-timeline-scroll['"]\]\s*\{([^}]*)\}/s,
  )?.[1] || ''
  assert.match(fadeRule, /mask-image:\s*linear-gradient\(to bottom, black calc\(100% - 32px\), transparent 100%\)/)
  assert.doesNotMatch(fadeRule, /backdrop-filter:/)
  assert.doesNotMatch(fadeRule, /(?:^|\s)background(?:-color)?\s*:/)
})

test('jump-to-latest stays above the masked timeline content', () => {
  const viewSource = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src/renderer/components/chat/ChatPanelView.jsx'),
    'utf8',
  )

  assert.match(viewSource, /data-ui="chat-jump-to-latest"/)
  assert.match(viewSource, /className="[^"]*z-30[^"]*shadow-\[0_4px_12px_rgb\(var\(--theme-shadow-rgb\)_\/_0\.18\)\][^"]*"/)
})

test('bottom-anchor observers rebind when a keyed thread timeline is replaced', () => {
  const bottomAnchorSource = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src/renderer/components/chat/use-chat-panel-bottom-anchor.mjs'),
    'utf8',
  )

  const scrollListenerEffect = bottomAnchorSource.match(
    /useEffect\(\(\) => \{[\s\S]*?timelineNode\.addEventListener\('scroll',[\s\S]*?\n\s*\}, \[([^\]]*)\]\)/,
  )?.[1] || ''
  assert.match(scrollListenerEffect, /activeThreadId/)
})
