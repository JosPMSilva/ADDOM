import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readSource(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

test('project entry is composer-only and delegates folder opening to the shell', () => {
  const source = readSource('src/renderer/components/WorkspaceProjectEntry.jsx')
  assert.match(source, /data-ui="workspace-project-entry"/)
  assert.match(source, /<ProjectEntryHomeSurface/)
  assert.doesNotMatch(source, /WorkspaceProjectTree|project-entry-side-panel|project-thread-rail/)
})

test('new project folder selection enters through the guarded target boundary', () => {
  const appSource = readSource('src/renderer/App.jsx')
  const transitionSource = readSource('src/renderer/use-workspace-target-transition.js')
  assert.match(appSource, /const handleCreateProject = useCallback/)
  assert.match(appSource, /const folder = await openFolder\(\)/)
  assert.match(appSource, /requestWorkspaceTarget\(\{ projectPath: folder, createThread: true \}\)/)
  assert.doesNotMatch(appSource, /if \(projectFolder\) return window\.addom\?\.shell\?\.openPath/)
  assert.doesNotMatch(appSource, /folder \? openProjectPath\(folder\) : null/)
  assert.match(transitionSource, /clearActiveProject\(\{ notifyRenderer: false \}\)/)
  assert.match(transitionSource, /try \{[\s\S]*clearActiveProject[\s\S]*\} catch \{[\s\S]*\}[\s\S]*leaveToProjectEntry\(\)/)
  assert.match(transitionSource, /leaveToProjectEntry\(\)/)
})

test('canonical rail owns project creation and each project row owns thread creation', () => {
  const source = readSource('src/renderer/components/WorkspaceProjectEntry.jsx')
  const railSource = readSource('src/renderer/components/workspace/WorkspaceRail.jsx')
  const treeSource = readSource('src/renderer/components/workspace/WorkspaceProjectTree.jsx')
  const projectGroupStart = treeSource.indexOf('function WorkspaceProjectGroup')
  const projectGroupEnd = treeSource.indexOf('function ProjectThreadState', projectGroupStart)
  const projectGroupSource = treeSource.slice(projectGroupStart, projectGroupEnd)
  const emptyStateStart = treeSource.indexOf('function ProjectRailEmpty()')
  const emptyStateEnd = treeSource.indexOf('function ProjectRailSkeleton', emptyStateStart)
  const emptyStateSource = treeSource.slice(emptyStateStart, emptyStateEnd)
  assert.doesNotMatch(source, /WorkspaceProjectTree|project-entry-open-folder/)
  assert.match(railSource, /data-ui="workspace-rail-new-project"/)
  assert.doesNotMatch(railSource, /data-ui="workspace-rail-open-folder"/)
  assert.match(treeSource, /data-ui="project-entry-new-thread"/)
  assert.match(projectGroupSource, /data-ui="project-entry-controls"/)
  assert.equal(
    projectGroupSource.indexOf('data-ui="project-entry-actions-trigger"')
      < projectGroupSource.indexOf('data-ui="project-entry-new-thread"'),
    true,
  )
  assert.match(treeSource, /name="chat-circle-dots"/)
  assert.match(treeSource, /onClick=\{\(\) => onCreateThread\(project\.id\)\}/)
  assert.match(treeSource, /group-focus-within\/project:opacity-100/)
  assert.match(treeSource, /menuOpen\s*\?\s*'opacity-100/)
  assert.match(treeSource, /\{tree\.projects\.length > 0 && \(/)
  assert.doesNotMatch(emptyStateSource, /projectEntry\.openFolder/)
  assert.doesNotMatch(emptyStateSource, /<button/)
})

test('project entry home surface is a work-first composer with draft handoff', () => {
  const entrySource = readSource('src/renderer/components/WorkspaceProjectEntry.jsx')
  const homeSource = readSource('src/renderer/components/ProjectEntryHomeSurface.jsx')

  assert.match(entrySource, /import ProjectEntryHomeSurface from '\.\/ProjectEntryHomeSurface\.jsx'/)
  assert.match(entrySource, /<ProjectEntryHomeSurface/)

  assert.match(homeSource, /data-ui="project-entry-home"/)
  assert.match(homeSource, /data-ui="project-entry-home-composer"/)
  assert.match(homeSource, /data-ui="project-entry-home-input"/)
  assert.match(homeSource, /data-ui="project-entry-home-project-trigger"/)
  assert.match(homeSource, /data-ui="project-entry-home-send"/)

  assert.match(homeSource, /queueChatDraftInjection\(\{/)
  assert.match(homeSource, /source: 'project_entry_home'/)
  assert.match(homeSource, /clearPendingChatDraftInjection\(\)/)

  assert.doesNotMatch(homeSource, /project-entry-home-open-folder/)

  assert.doesNotMatch(homeSource, /\b(?:bg|text|border)-(?:blue|sky|cyan|indigo|slate)-/)
  assert.doesNotMatch(homeSource, /gradient/)
})

test('project entry expands projects explicitly and loads only requested thread previews', () => {
  const source = readSource('src/renderer/components/workspace/useWorkspaceProjectTree.js')

  assert.doesNotMatch(source, /PROJECT_THREAD_PREFETCH_LIMIT/)
  assert.match(source, /const \[expandedProjectIds, setExpandedProjectIds\] = useState/)
  assert.match(source, /resolveInitialExpandedProjectIds\(recentProjects\)/)
  assert.match(source, /expansionInitializedRef\.current = true/)
  assert.match(source, /setExpandedProjectIds\(new Set\(resolveInitialExpandedProjectIds\(recentProjects\)\)\)/)
  assert.match(source, /threadStateByProject/)
  assert.match(source, /expandedProjectIds/)
  assert.match(source, /resolveProjectThreadLoadState\(undefined, loadError, cached\?\.threads\)/)
})

test('thread preview rows do not repeat project activity timestamps', () => {
  const rowSource = readSource('src/renderer/components/workspace/WorkspaceThreadRow.jsx')

  assert.doesNotMatch(rowSource, /formatRelativeTime|tabular-nums|relative/)
  assert.match(rowSource, /preview \|\| title/)
})

test('expanded thread lists do not render a vertical guide beside thread rows', () => {
  const treeSource = readSource('src/renderer/components/workspace/WorkspaceProjectTree.jsx')
  const projectGroupStart = treeSource.indexOf('function WorkspaceProjectGroup')
  const projectGroupEnd = treeSource.indexOf('function ProjectThreadState', projectGroupStart)
  const projectGroupSource = treeSource.slice(projectGroupStart, projectGroupEnd)

  assert.match(projectGroupSource, /<div id=\{regionId\} className="ml-3\.5 mt-0\.5 space-y-px pl-1\.5">/)
  assert.doesNotMatch(projectGroupSource, /space-y-px border-l/)
})

test('selected thread rows do not render a vertical left accent', () => {
  const styleSource = readSource('src/renderer/styles/globals-runtime.css')

  assert.doesNotMatch(
    styleSource,
    /data-ui='project-entry-thread-row'\]\[data-active='true'\]\s*\{[^}]*inset 2px 0/,
  )
})

test('project entry keeps older projects in a collapsed searchable Archive group', () => {
  const source = readSource('src/renderer/components/workspace/WorkspaceProjectTree.jsx')
  const controllerSource = readSource('src/renderer/components/workspace/useWorkspaceProjectTree.js')

  assert.match(controllerSource, /const \[archiveExpanded, setArchiveExpanded\] = useState\(false\)/)
  assert.match(source, /archivedProjects/)
  assert.match(source, /data-ui="project-entry-archive"/)
  assert.match(source, /data-ui="project-entry-archive-toggle"/)
  assert.match(controllerSource, /resolveArchiveDisclosure\(archiveExpanded, query\)/)
  assert.match(source, /aria-expanded=\{tree\.archiveVisible\}/)
  assert.match(source, /disabled=\{Boolean\(tree\.query\.trim\(\)\)\}/)
  assert.match(source, /onClick=\{tree\.toggleArchiveExpanded\}/)
  assert.doesNotMatch(source, /onClick=\{\(\) => tree\.setArchiveExpanded/)
  assert.match(source, /tree\.archivedProjects\.map/)
})

test('project actions archive or restore without exposing transcript clearing', () => {
  const source = readSource('src/renderer/components/workspace/useWorkspaceProjectTree.js')
  const treeSource = readSource('src/renderer/components/workspace/WorkspaceProjectTree.jsx')
  const menuSource = readSource('src/renderer/components/ProjectEntryActionsMenu.jsx')

  assert.match(source, /restoreProjectToRecent: state\.restoreProjectToRecent/)
  assert.match(source, /archiveProjectById: state\.archiveProjectById/)
  assert.match(source, /restoreProjectToRecent\(projectId\)/)
  assert.match(source, /archiveProjectById\(projectId/)
  assert.match(treeSource, /onRestore=\{\(projectId\)/)
  assert.match(treeSource, /onArchive=\{\(projectId\)/)
  assert.match(menuSource, /onRestore\?\.\(project\.id\)/)
  assert.match(menuSource, /onArchive\?\.\(project\.id\)/)
  assert.match(menuSource, /projectActions\.restoreToRecent/)
  assert.match(menuSource, /projectActions\.archiveProject/)
  assert.match(menuSource, /Remove from ADDOM/)
  assert.doesNotMatch(menuSource, /projectActions\.clearHistory|onClearHistory/)
})

test('failed project removal stays visible as a retryable app decision', () => {
  const source = readSource('src/renderer/components/workspace/useWorkspaceProjectTree.js')

  assert.match(source, /requestAppAlert/)
  assert.match(source, /removeProjectDialog\.failureTitle/)
  assert.match(source, /removeProjectDialog\.failureMessage/)
  assert.match(source, /result\?\.retryable/)
})

test('project activity timestamp remains visible through hover, focus, and menu interaction', () => {
  const source = readSource('src/renderer/components/workspace/WorkspaceProjectTree.jsx')
  const groupStart = source.indexOf('function WorkspaceProjectGroup')
  const groupEnd = source.indexOf('function ProjectThreadState', groupStart)
  const groupSource = source.slice(groupStart, groupEnd)

  assert.equal(groupStart >= 0, true)
  assert.doesNotMatch(groupSource, /group-hover\/project:opacity-0/)
  assert.doesNotMatch(groupSource, /group-focus-within\/project:opacity-0/)
  assert.doesNotMatch(groupSource, /menuOpen \? 'opacity-0'/)
})

test('project actions use an opaque portaled menu above the project rail', () => {
  const menuPath = 'src/renderer/components/ProjectEntryActionsMenu.jsx'
  assert.equal(fs.existsSync(path.resolve(menuPath)), true)
  const menuSource = readSource(menuPath)
  const entrySource = readSource('src/renderer/components/workspace/WorkspaceProjectTree.jsx')

  assert.match(menuSource, /createPortal/)
  assert.match(menuSource, /document\.body/)
  assert.match(menuSource, /MenuSurface/)
  assert.match(menuSource, /fixed z-\[120\]/)
  assert.match(entrySource, /<ProjectEntryActionsMenu/)
})

test('project tree caches complete arrays and reveals every cached thread locally', () => {
  const controllerSource = readSource('src/renderer/components/workspace/useWorkspaceProjectTree.js')
  const treeSource = readSource('src/renderer/components/workspace/WorkspaceProjectTree.jsx')

  assert.match(controllerSource, /resolveProjectThreadLoadState\(rows\)/)
  assert.doesNotMatch(controllerSource, /rows\.slice/)
  assert.match(controllerSource, /DEFAULT_VISIBLE_PROJECT_THREAD_COUNT/)
  assert.match(controllerSource, /\[projectId\]: threads\.length/)
  assert.match(treeSource, /remaining/)
  assert.match(treeSource, /onRevealAllThreads\(project\.id\)/)
})

test('project tree synchronizes its active-project cache after an automatic thread title update', () => {
  const controllerSource = readSource('src/renderer/components/workspace/useWorkspaceProjectTree.js')
  const workspaceStoreSource = readSource('src/renderer/store/useWorkspaceStore.js')

  assert.match(workspaceStoreSource, /threads: state\.threads\.map/)
  assert.match(controllerSource, /activeProjectId: state\.activeProjectId/)
  assert.match(controllerSource, /updateThreadState\(activeProjectId, resolveProjectThreadLoadState\(threads\)\)/)
})

test('project tree project rows disclose only and thread or New actions keep project ownership', () => {
  const treeSource = readSource('src/renderer/components/workspace/WorkspaceProjectTree.jsx')
  const threadRowSource = readSource('src/renderer/components/workspace/WorkspaceThreadRow.jsx')
  const projectRowStart = treeSource.indexOf('function WorkspaceProjectGroup')
  const projectRowEnd = treeSource.indexOf('function ProjectThreadState', projectRowStart)
  const projectRowSource = treeSource.slice(projectRowStart, projectRowEnd)

  assert.match(projectRowSource, /onToggleExpanded\(project\.id\)/)
  assert.doesNotMatch(projectRowSource, /onSelectThread/)
  assert.match(treeSource, /onThreadSelect\(project\.id, thread\.id\)/)
  assert.match(treeSource, /onCreateThread\(project\.id\)/)
  assert.match(threadRowSource, /aria-current=\{active \? 'page' : undefined\}/)
})

test('project tree search uses bounded settled loading and exposes retry without permanent loading', () => {
  const controllerSource = readSource('src/renderer/components/workspace/useWorkspaceProjectTree.js')
  const treeSource = readSource('src/renderer/components/workspace/WorkspaceProjectTree.jsx')

  assert.match(controllerSource, /runBoundedProjectThreadLoads/)
  assert.match(controllerSource, /MAX_PROJECT_THREAD_SEARCH_CONCURRENCY/)
  assert.match(controllerSource, /resolveProjectThreadLoadState\(undefined, loadError, cached\?\.threads\)/)
  assert.match(treeSource, /onRetryThreads\(project\.id\)/)
  assert.match(treeSource, /core:threadDrawer\.retry/)
})
