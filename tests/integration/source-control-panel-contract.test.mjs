import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readSource(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

test('workspace shell exposes Git only as a Chat companion', () => {
  const appSource = readSource('src/renderer/App.jsx')
  const sidebarSource = readSource('src/renderer/components/Sidebar.jsx')
  const loaderSource = readSource('src/renderer/workspace-panel-loaders.mjs')
  const appStoreSource = readSource('src/renderer/store/useAppStore.js')

  assert.match(appSource, /loadSourceControlPanel/)
  assert.match(appSource, /const SourceControlPanelLazy = lazy\(loadSourceControlPanel\)/)
  assert.match(appSource, /view\.type === CHAT_COMPANION_GIT/)
  assert.doesNotMatch(appSource, /case 'source-control':/)

  assert.doesNotMatch(sidebarSource, /id: 'source-control'/)
  assert.doesNotMatch(sidebarSource, /label: 'Changes'/)
  assert.doesNotMatch(sidebarSource, /'source-control': loadSourceControlPanel/)

  assert.match(loaderSource, /export const loadSourceControlPanel = \(\) => import\('\.\/components\/SourceControlPanel\.jsx'\)/)
  const criticalLoader = loaderSource.match(/preloadCriticalWorkspacePanelChunks\(\)[\s\S]*?\n\}/)?.[0] || ''
  assert.doesNotMatch(criticalLoader, /loadSourceControlPanel\(\)/)

  assert.doesNotMatch(appStoreSource, /'source-control'/)
})

test('Source Control panel stays wired to the dedicated store helpers', () => {
  const panelSource = readSource('src/renderer/components/SourceControlPanel.jsx')
  const partsSource = readSource('src/renderer/components/source-control-panel-parts.jsx')
  const storeSource = readSource('src/renderer/store/useSourceControlStore.js')

  assert.match(panelSource, /useSourceControlStore/)
  assert.match(panelSource, /groupSourceControlEntries/)
  assert.match(panelSource, /navigateEntry/)
  assert.match(panelSource, /commitStaged/)
  assert.match(panelSource, /setEntryStaged/)
  assert.match(panelSource, /setAllStaged/)
  assert.match(panelSource, /CommitComposer/)
  assert.match(panelSource, /BranchSummary/)
  assert.match(panelSource, /DetailCard/)
  assert.match(panelSource, /ListToolbar/)
  assert.match(panelSource, /scope="unstaged"/)
  assert.match(panelSource, /scope="staged"/)
  assert.match(partsSource, /DetailActions/)
  assert.match(partsSource, /Search changed files/)
  assert.match(partsSource, /describeSourceControlEntryForScope/)
  assert.match(partsSource, /getSourceControlEntryLineStats/)
  assert.match(partsSource, /Restore file/)
  assert.match(partsSource, /Unstage deletion/)
  assert.match(partsSource, /Unstage rename/)
  assert.match(partsSource, /const hasStagedEntries = groupedEntries\.staged\.length > 0/)
  assert.match(partsSource, /Stage files to enable commit authoring/)
  assert.match(partsSource, /Stage file/)
  assert.match(partsSource, /Unstage file/)
  assert.match(partsSource, /Stage all/)
  assert.match(partsSource, /Unstage all/)
  assert.match(partsSource, /onIndexAction/)
  assert.match(partsSource, /entry\?\.isConflicted/)

  assert.match(storeSource, /getRepositoryStatus/)
  assert.match(storeSource, /setTabGitScope/)
  assert.match(storeSource, /commitStaged/)
  assert.match(storeSource, /restoreSelectedDetailFile/)
  assert.match(storeSource, /unstageSelectedDetailFile/)
  assert.match(storeSource, /setEntryStaged/)
  assert.match(storeSource, /setAllStaged/)
  assert.match(storeSource, /loadEntryDetail/)
  assert.match(storeSource, /setActivePanel\('editor'\)/)
  assert.match(storeSource, /resolveSourceControlNavigation/)
})

test('Source Control panel uses one companion list with drill-in detail', () => {
  const panelSource = readSource('src/renderer/components/SourceControlPanel.jsx')
  const partsSource = readSource('src/renderer/components/source-control-panel-parts.jsx')

  assert.match(panelSource, /data-source-control-layout="git-companion"/)
  assert.match(panelSource, /data-source-control-view=\{detailOpen \? 'detail' : 'list'\}/)
  assert.match(panelSource, /onClose/)
  assert.match(panelSource, /clearSelectedDetail/)
  assert.doesNotMatch(panelSource, /data-source-control-region="review-pane"/)
  assert.doesNotMatch(panelSource, /<ReviewEmptyState/)

  const toolbarIndex = panelSource.indexOf('<ListToolbar')
  const commitIndex = panelSource.indexOf('<CommitComposer')
  assert.ok(toolbarIndex >= 0)
  assert.ok(commitIndex > toolbarIndex)

  assert.match(partsSource, /aria-label=\{t\('core:sourceControl\.refresh'/)
  assert.match(partsSource, /CompanionDetailHeader/)
  assert.match(partsSource, /aria-pressed=\{active\}/)
  assert.doesNotMatch(partsSource, /w-full rounded-lg border px-3 py-2 text-left/)
  assert.doesNotMatch(partsSource, /bg-danger-bg/)
  assert.doesNotMatch(panelSource, /max-h-\[58%\]/)
})

test('larger Git branch surfaces share the size-tuned SVG without changing Memory metadata', () => {
  const headerSource = readSource('src/renderer/components/chat/ChatPanelHeaderBar.jsx')
  const partsSource = readSource('src/renderer/components/source-control-panel-parts.jsx')
  const memorySource = readSource('src/renderer/components/memory/MemoryPanelLeafComponents.jsx')
  const iconSource = readSource('src/renderer/components/ui/GitBranchIcon.jsx')

  assert.match(headerSource, /import GitBranchIcon from '\.\.\/ui\/GitBranchIcon\.jsx'/)
  assert.match(headerSource, /<GitBranchIcon className="h-3\.5 w-3\.5" \/>/)
  assert.match(partsSource, /import GitBranchIcon from '\.\/ui\/GitBranchIcon\.jsx'/)
  assert.match(partsSource, /<GitBranchIcon className="h-\[15px\] w-\[15px\] text-text-tertiary" \/>/)
  assert.match(memorySource, /<Icon name="git-branch" size=\{10\} \/>/)
  assert.match(iconSource, /<path d="M4 4\.5v7" \/>/)
  assert.match(iconSource, /<path d="M12 4\.5v\.75A2\.75 2\.75 0 0 1 9\.25 8H4" \/>/)
})
