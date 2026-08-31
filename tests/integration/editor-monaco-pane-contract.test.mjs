import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readSource(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

test('EditorMonacoPane delegates mount setup to shared helpers and uses primitive tab dependencies', () => {
  const source = readSource('src/renderer/components/editor/EditorMonacoPane.jsx')

  assert.match(source, /from '\.\/editor-monaco-mount-helpers\.mjs'/)
  assert.match(source, /attachMonacoAnalysisObservers/)
  assert.match(source, /registerInlineCompletionProvider/)
  assert.match(source, /registerMonacoEditorCommands/)
  assert.match(source, /const tabId = String\(tab\?\.id \|\| ''\)/)
  assert.match(source, /const tabFilePath = String\(tab\?\.filePath \|\| ''\)\.trim\(\)/)
  assert.match(source, /const tabLanguage = String\(tab\?\.language \|\| ''\)\.trim\(\)/)
  assert.match(source, /const relayout = useCallback\(\(sizeOverride\) =>/)
  assert.match(source, /\}, \[onEditorApiChange, onOutlineChange, onProblemsChange, onServiceStateChange, relayout, t, tabFilePath, tabId, tabLanguage, updateGitScopeChipRightOffset\]\)/)
})

test('EditorMonacoPane renders git scope as a compact bottom chip without changing Monaco layout sizing', () => {
  const source = readSource('src/renderer/components/editor/EditorMonacoPane.jsx')

  assert.doesNotMatch(source, /absolute right-3 top-3/)
  assert.match(source, /aria-haspopup="menu"/)
  assert.match(source, /bottom-6/)
  assert.match(source, /const gitScopeLabel = gitScope === 'staged'/)
  assert.match(source, /core:editor\.git\.scope\.staged/)
  assert.match(source, /core:editor\.git\.scope\.unstaged/)
  assert.match(source, /GIT_SCOPE_CHIP_MINIMAP_GAP_PX = 12/)
  assert.match(source, /editor\?\.getLayoutInfo\?\.\(\)/)
  assert.match(source, /layoutInfo\.width - minimapLeft \+ GIT_SCOPE_CHIP_MINIMAP_GAP_PX/)
  assert.match(source, /style=\{\{ right: gitScopeChipRightOffset \}\}/)
  assert.match(source, /editorRef\.current\?\.layout\(nextSize\)/)
  assert.match(source, /width=\{editorWidth\}/)
  assert.match(source, /height=\{editorHeight\}/)
})

test('EditorMonacoPane resyncs the mounted Monaco model when external reloads change the active initial value', () => {
  const source = readSource('src/renderer/components/editor/EditorMonacoPane.jsx')

  assert.match(
    source,
    /useEffect\(\(\) => \{[\s\S]*const model = editorRef\.current\?\.getModel\?\.\(\)[\s\S]*if \(!model\) return[\s\S]*const nextValue = String\(activeInitialValue \?\? ''\)[\s\S]*const currentValue = typeof model\.getValue === 'function'[\s\S]*if \(currentValue === nextValue\) return[\s\S]*model\.setValue\(nextValue\)/,
  )
})

test('EditorMonacoPane auto-dismisses the no-repo Git warning and suppresses it per thread', () => {
  const source = readSource('src/renderer/components/editor/EditorMonacoPane.jsx')

  assert.match(source, /GIT_NO_REPO_NOTICE_AUTO_DISMISS_MS = 3_000/)
  assert.match(source, /return \{ id: 'no_repo', tone: 'warning', text: t\(/)
  assert.match(source, /activeThreadId,/)
  assert.match(source, /gitNoRepoNoticeSeenForThread,/)
  assert.match(source, /markGitNoRepoNoticeSeenForThread,/)
  assert.match(source, /const resolvedThreadId = String\(activeThreadId \|\| ''\)\.trim\(\) \|\| '__no_thread__'/)
  assert.match(source, /gitOverlayMessage\.id !== 'no_repo'/)
  assert.match(source, /visibleGitNoRepoNoticeThreadId === resolvedThreadId/)
  assert.match(source, /markGitNoRepoNoticeSeenForThread\?\.\(resolvedThreadId\)/)
  assert.match(source, /}, GIT_NO_REPO_NOTICE_AUTO_DISMISS_MS\)/)
  assert.match(source, /setVisibleGitNoRepoNoticeThreadId\(\(prev\) => \(\s*prev === resolvedThreadId \? '' : prev\s*\)\)/)
})
