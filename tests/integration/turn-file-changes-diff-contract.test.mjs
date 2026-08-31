import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readSource(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

test('TurnFileChangesCard uses the shared diff helper and accessible preview toggles', () => {
  const cardSource = readSource('src/renderer/components/chat/TurnFileChangesCard.jsx')
  const previewSource = readSource('src/renderer/components/chat/TurnFileChangeExpandedPreview.jsx')
  const diffPreviewSource = readSource('src/renderer/components/chat/turn-file-change-diff-preview.mjs')

  assert.match(cardSource, /import TurnFileChangeExpandedPreview from '\.\/TurnFileChangeExpandedPreview\.jsx'/)
  assert.match(cardSource, /<TurnFileChangeExpandedPreview row=\{row\}/)
  assert.match(previewSource, /from '\.\/turn-file-change-diff-preview\.mjs'/)
  assert.match(previewSource, /buildPreviewRows: buildSharedDiffPreviewRows/)
  assert.doesNotMatch(previewSource, /^export function buildSharedDiffPreviewRows/m)
  assert.match(diffPreviewSource, /from '\.\.\/diff\/line-diff\.mjs'/)
  assert.match(diffPreviewSource, /computeLineDiff\(/)
  assert.match(diffPreviewSource, /flattenLineDiffSegmentsToPreviewRows\(/)
  assert.match(diffPreviewSource, /export function buildSharedDiffPreviewRows\(beforeText, afterText, maxRows = null\)/)
  assert.match(previewSource, /from '\.\.\/diff\/diff-hunk-grouping\.mjs'/)
  assert.match(previewSource, /groupConsecutiveDiffHunks/)
  assert.match(previewSource, /DIFF_HUNK_BACKGROUND/)
  assert.match(previewSource, /data-ui=\{hunkBg \? 'diff-hunk' : undefined\}/)
  assert.match(previewSource, /paintBackground=\{!hunkBg\}/)
  assert.match(previewSource, /import \{ DiffLine \} from '\.\.\/diff\/DiffComponents\.jsx'/)
  assert.match(previewSource, /<DiffLine/)
  assert.doesNotMatch(previewSource, /truncateLine\(/)
  assert.match(previewSource, /TURN_FILE_DIFF_MAX_HIGHLIGHT_CHARS/)
  assert.match(previewSource, /TURN_FILE_DIFF_MAX_HIGHLIGHT_LINES/)
  assert.match(previewSource, /const maxContentColumns = useMemo\(/)
  assert.match(previewSource, /style=\{\{ width: codeWidth \}\}/)
  assert.match(previewSource, /fullRowBackground/)
  assert.match(previewSource, /max-h-\[min\(28rem,50vh\)\]/)
  assert.match(previewSource, /scrollForMore/)
  assert.match(previewSource, /readDisplayedLineTotals|countPreviewChangedLines/)
  assert.match(previewSource, /hiddenLines/)
  assert.match(previewSource, /toggleExpand/)
  assert.match(previewSource, /expandable=\{entry\.expandable\}/)
  assert.match(previewSource, /onToggleExpand=\{entry\.expandable \? \(\) => toggleExpand\(entry\.sourceIndex\) : undefined\}/)
  assert.doesNotMatch(cardSource, /function buildDiffPreviewRows/)
  assert.doesNotMatch(cardSource, /aria-label=\{diffOpen \? 'Hide diff preview' : 'Show diff preview'\}/)
  assert.match(cardSource, /aria-expanded=\{open\}/)
  assert.match(cardSource, /aria-label=\{open[\s\S]*core:chat\.fileChanges\.preview\.collapseForFile[\s\S]*core:chat\.fileChanges\.preview\.expandForFile/s)
})

test('DiffLine rows grow to the full code width so diff backgrounds track horizontal overflow', () => {
  const source = readSource('src/renderer/components/diff/DiffComponents.jsx')

  assert.match(source, /const rowClass = fullRowBackground/)
  assert.match(source, /grid w-full min-w-0 items-stretch/)
  assert.match(source, /fullRowBackground = false/)
  assert.match(source, /paintBackground = true/)
  assert.match(source, /from '\.\/diff-hunk-grouping\.mjs'/)
})

test('DiffLine uses a semantic change rail instead of +/− marker glyphs', () => {
  const source = readSource('src/renderer/components/diff/DiffComponents.jsx')
  const grouping = readSource('src/renderer/components/diff/diff-hunk-grouping.mjs')

  assert.doesNotMatch(source, /marker:\s*'\+'/)
  assert.doesNotMatch(source, /marker:\s*'-'/)
  assert.doesNotMatch(source, /\{style\.marker\}/)
  assert.match(source, /data-ui="diff-change-rail"/)
  assert.match(source, /paintChangeRail/)
  assert.match(grouping, /DIFF_HUNK_RAIL/)
  assert.match(grouping, /added:.*border-l-2/)
  assert.match(grouping, /removed:.*border-l-2/)
})

test('turn file hunk wrappers paint a continuous change rail across affected lines', () => {
  const previewSource = readSource('src/renderer/components/chat/TurnFileChangeExpandedPreview.jsx')

  assert.match(previewSource, /DIFF_HUNK_RAIL/)
  assert.match(previewSource, /data-ui=\{hunkBg \? 'diff-hunk' : undefined\}/)
  assert.match(
    previewSource,
    /paintChangeRail=\{!hunkBg\}/,
    'per-line rails yield to the continuous hunk rail',
  )
  assert.match(
    previewSource,
    /calc\(\$\{lineNumberDigits\}ch \+ 1\.75rem\) \$\{DIFF_LINE_RAIL_TRACK\}/,
    'marker column shrinks to a thin rail track',
  )
  assert.match(
    readSource('src/renderer/components/diff/diff-hunk-grouping.mjs'),
    /DIFF_LINE_RAIL_TRACK = '0\.125rem'/,
  )
})

test('groupConsecutiveDiffHunks merges adjacent added/removed runs', async () => {
  const { groupConsecutiveDiffHunks } = await import('../../src/renderer/components/diff/diff-hunk-grouping.mjs')
  const groups = groupConsecutiveDiffHunks([
    { key: '1', type: 'unchanged' },
    { key: '2', type: 'removed' },
    { key: '3', type: 'removed' },
    { key: '4', type: 'added' },
    { key: '5', type: 'added' },
    { key: '6', type: 'unchanged' },
    { key: '7', type: 'removed' },
  ])

  assert.deepEqual(groups.map((group) => [group.hunkType, group.entries.map((entry) => entry.key)]), [
    [null, ['1']],
    ['removed', ['2', '3']],
    ['added', ['4', '5']],
    [null, ['6']],
    ['removed', ['7']],
  ])
})

test('code block rendering exports a dedicated file-diff highlight budget', () => {
  const source = readSource('src/renderer/components/chat/code-block-rendering.mjs')

  assert.match(source, /export const TURN_FILE_DIFF_MAX_HIGHLIGHT_CHARS = 120000/)
  assert.match(source, /export const TURN_FILE_DIFF_MAX_HIGHLIGHT_LINES = 2000/)
})

test('EditorPanel tab controls use accessible buttons and keyboard-visible close affordances', () => {
  const panelSource = readSource('src/renderer/components/EditorPanel.jsx')
  const panelViewSource = readSource('src/renderer/components/editor/EditorPanelView.jsx')
  const tabBarSource = readSource('src/renderer/components/editor/EditorTabBar.jsx')

  assert.match(panelViewSource, /import EditorTabBar from '\.\/EditorTabBar\.jsx'/)
  assert.match(panelViewSource, /<EditorTabBar/)
  assert.match(panelSource, /currentLanguageServiceNoticeVisible/)
  assert.match(panelSource, /setDismissedServiceNoticeByTabKey/)
  assert.match(panelSource, /const formatSupportedForCurrentTab = !!currentCapabilities\.formatting\?\.available/)
  assert.match(panelSource, /const fixSupportedForCurrentTab = !!currentCapabilities\.codeActions\?\.available/)
  assert.match(panelViewSource, /canFormatActive=\{formatSupportedForCurrentTab\}/)
  assert.match(panelViewSource, /canFixActive=\{fixSupportedForCurrentTab\}/)
  assert.match(panelSource, /currentLanguageServiceNoticeVisible/)
  assert.match(panelViewSource, /t\('editor\.panel\.dismiss', \{ defaultValue: 'Dismiss' \}\)/)
  assert.match(tabBarSource, /editor\.tabBar\.saveTabAriaLabel[\s\S]*defaultValue: 'Save \{\{fileLabel\}\}'/s)
  assert.match(tabBarSource, /focus-visible:opacity-100/)
  assert.match(tabBarSource, /editor\.tabBar\.closeTabAriaLabel[\s\S]*defaultValue: 'Close \{\{tabLabel\}\}'/s)
})

test('EditorPanel suppresses the optional missing-Biome-config warning from the degraded service banner', () => {
  const panelSource = readSource('src/renderer/components/EditorPanel.jsx')
  const panelStateSource = readSource('src/renderer/components/editor/editor-panel-state-helpers.mjs')

  assert.match(panelStateSource, /function getActionableServiceNotice\(serviceState = null\)/)
  assert.match(panelStateSource, /const OPTIONAL_EDITOR_SERVICE_WARNING_PROVIDER_IDS = new Set\(\[/)
  assert.match(panelStateSource, /'biome'/)
  assert.match(panelSource, /buildLocalizedEditorServiceNotice\(\{/)
  assert.match(panelSource, /serviceState: getActionableServiceNotice\(currentServiceState\)/)
  assert.match(panelSource, /optionalUnavailableProviderIds: OPTIONAL_EDITOR_SERVICE_WARNING_PROVIDER_IDS/)
})
