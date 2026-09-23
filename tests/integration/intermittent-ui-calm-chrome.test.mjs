import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(import.meta.dirname, '..', '..')
const readSource = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('timeline history controls share one calm presentation without redundant summary copy', () => {
  const timeline = readSource('src/renderer/components/chat/ChatPanelTimelineArea.jsx')
  const execution = readSource('src/renderer/components/chat/LiveExecutionStreamBlock.jsx')
  const typography = readSource('src/renderer/styles/chat-typography-map.css')

  assert.match(timeline, /HistoryRevealControl/)
  assert.match(execution, /HistoryRevealControl/)
  assert.doesNotMatch(execution, /hiddenSummaryPinned|hiddenSummary/)
  assert.doesNotMatch(execution, /uppercase tracking-wide/)
  assert.doesNotMatch(typography, /\.chat-typo-exec-compaction-label[\s\S]*?letter-spacing:\s*0\.08em/)
  assert.doesNotMatch(typography, /\.chat-typo-exec-compaction-label[\s\S]*?text-transform:\s*uppercase/)
})

test('secondary intermittent surfaces avoid tracked uppercase labels and nested card hierarchy', () => {
  const sourcePaths = [
    'src/renderer/components/AppErrorBoundary.jsx',
    'src/renderer/components/PanelErrorBoundary.jsx',
    'src/renderer/components/editor/EditorDiagnosticsPanels.jsx',
    'src/renderer/components/chat/TerminalMemorySuggestionCard.jsx',
    'src/renderer/components/chat/ChatTerminalDockBrowser.jsx',
    'src/renderer/components/chat/ChatTerminalDockGlobalIndicator.jsx',
  ]

  for (const sourcePath of sourcePaths) {
    const source = readSource(sourcePath)
    assert.doesNotMatch(source, /uppercase|tracking-\[/, sourcePath)
  }

  const memorySuggestion = readSource('src/renderer/components/chat/TerminalMemorySuggestionCard.jsx')
  assert.match(memorySuggestion, /Save insight/)
  assert.match(memorySuggestion, /terminal\.memorySuggestion\.scopeLabel/)
  assert.doesNotMatch(memorySuggestion, /memoryCandidateReason/)
  assert.doesNotMatch(memorySuggestion, /rounded-lg border border-surface-border bg-surface/)
})

test('terminal browser keeps metadata inline and reserves badges for session state', () => {
  const source = readSource('src/renderer/components/chat/ChatTerminalDockBrowser.jsx')

  assert.match(source, /data-ui="chat-terminal-browser-metadata"/)
  assert.match(source, /<section className="flex min-h-0 min-w-0 flex-1 flex-col">/)
  assert.doesNotMatch(source, /function BrowserDetailField/)
  assert.doesNotMatch(source, /md:grid-cols-2 xl:grid-cols-3/)
})

test('Problems keeps its default-state preference in a compact accessible overflow menu', () => {
  const source = readSource('src/renderer/components/editor/EditorDiagnosticsPanels.jsx')

  assert.match(source, /aria-haspopup="menu"/)
  assert.match(source, /data-ui="editor-problems-preferences-menu"/)
  assert.match(source, /role="menuitemcheckbox"/)
})

test('error recovery subordinates technical detail and uses the shared action control', () => {
  for (const sourcePath of [
    'src/renderer/components/AppErrorBoundary.jsx',
    'src/renderer/components/PanelErrorBoundary.jsx',
  ]) {
    const source = readSource(sourcePath)
    assert.match(source, /ActionButton/)
    assert.match(source, /<details/)
    assert.match(source, /useRendererTranslation/)
  }
})

test('outer timeline history copy uses the renderer locale catalog', () => {
  const source = readSource('src/renderer/components/chat/ChatPanelTimelineArea.jsx')

  assert.match(source, /chat\.timeline\.showEarlier/)
  assert.match(source, /chat\.timeline\.showEarlierAriaLabel/)
})

test('question prompts only expose freeform input when it is needed', () => {
  const source = readSource('src/renderer/components/chat/QuestionUserCard.jsx')
  assert.match(source, /showCustomAnswer/)
  assert.match(source, /\{showCustomAnswer\s*&&/)
})

test('write conflict labels use normal tracking', () => {
  const source = readSource('src/renderer/components/chat/WriteConflictCard.jsx')
  assert.doesNotMatch(source, /uppercase tracking-wider/)
})
