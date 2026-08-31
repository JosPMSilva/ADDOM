import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import useEditorStore from '../../src/renderer/store/useEditorStore.js'

const originalWindow = global.window

function resetEditorStore() {
  useEditorStore.getState().clearAllTabs()
  useEditorStore.setState({
    tree: [],
    expandedDirs: new Set(),
    treeLoading: false,
    treeProjectFolder: '',
    treeError: '',
  })
}

function createFakeModel(initialValue = '') {
  let value = String(initialValue || '')
  return {
    getValue() {
      return value
    },
    setValue(nextValue) {
      value = String(nextValue ?? '')
    },
    dispose() {},
  }
}

function createOkGitDiff(overrides = {}) {
  return {
    ok: true,
    status: 'ok',
    insideWorkTree: true,
    repoRoot: 'C:/Users/example/Documents/ADDOM',
    relativePath: 'src/example.js',
    projectRelativePath: 'src/example.js',
    absolutePath: 'C:/Users/example/Documents/ADDOM/src/example.js',
    hasDiff: true,
    dirtyBufferBlocked: false,
    unsupportedReason: '',
    hunks: [{
      id: 'hunk:1:1,1:1,1',
      header: '@@ -1,1 +1,1 @@',
      kind: 'modified',
      oldStart: 1,
      oldCount: 1,
      newStart: 1,
      newCount: 1,
      lines: [
        { type: 'delete', text: 'const value = 1' },
        { type: 'add', text: 'const value = 2' },
      ],
      previewText: '-const value = 1\n+const value = 2',
      patchText: 'diff --git a/src/example.js b/src/example.js\n@@ -1,1 +1,1 @@\n-const value = 1\n+const value = 2\n',
      addedLineCount: 1,
      deletedLineCount: 1,
    }],
    hunkCount: 1,
    addedLineCount: 1,
    deletedLineCount: 1,
    ...overrides,
  }
}

beforeEach(() => {
  resetEditorStore()
})

afterEach(() => {
  global.window = originalWindow
  resetEditorStore()
})

test('refreshTabGitDiff blocks dirty tabs instead of showing on-disk git overlays', async () => {
  global.window = {
    addom: {
      file: {
        readFile: async () => ({ ok: true, content: 'const value = 1\n' }),
      },
      git: {
        getFileDiff: async () => createOkGitDiff(),
      },
    },
  }

  const openResult = await useEditorStore.getState().openFile(
    'C:/Users/example/Documents/ADDOM',
    'src/example.js',
  )
  const initialTab = useEditorStore.getState().getTabSnapshot(openResult.tabId)
  useEditorStore.getState().attachTabModel(openResult.tabId, createFakeModel(initialTab.content))
  useEditorStore.getState().updateContent(openResult.tabId, 'const value = 9\n')

  const refreshResult = await useEditorStore.getState().refreshTabGitDiff(
    'C:/Users/example/Documents/ADDOM',
    openResult.tabId,
  )

  assert.equal(refreshResult.ok, false)
  assert.equal(refreshResult.reason, 'dirty_tab')
  assert.equal(useEditorStore.getState().getTabGitDiff(openResult.tabId)?.status, 'blocked_dirty')
  assert.equal(useEditorStore.getState().getTabGitDiff(openResult.tabId)?.dirtyBufferBlocked, true)
  assert.equal(useEditorStore.getState().getTabGitDiff(openResult.tabId)?.hunks.length, 0)
})

test('refreshTabGitDiff stores current-file git state and closeTab cleans it up', async () => {
  global.window = {
    addom: {
      file: {
        readFile: async () => ({ ok: true, content: 'const value = 1\n' }),
      },
      git: {
        getFileDiff: async () => createOkGitDiff(),
      },
    },
  }

  const openResult = await useEditorStore.getState().openFile(
    'C:/Users/example/Documents/ADDOM',
    'src/example.js',
  )
  const initialTab = useEditorStore.getState().getTabSnapshot(openResult.tabId)
  useEditorStore.getState().attachTabModel(openResult.tabId, createFakeModel(initialTab.content))

  const refreshResult = await useEditorStore.getState().refreshTabGitDiff(
    'C:/Users/example/Documents/ADDOM',
    openResult.tabId,
  )
  assert.equal(refreshResult.ok, true)
  assert.equal(useEditorStore.getState().getTabGitDiff(openResult.tabId)?.status, 'ok')

  const closeResult = useEditorStore.getState().closeTab(openResult.tabId, { force: true })
  assert.deepEqual(closeResult, { ok: true, tabId: openResult.tabId })
  assert.equal(useEditorStore.getState().getTabGitDiff(openResult.tabId), null)
})

test('stageTabGitHunk refreshes the current-file diff after a successful hunk mutation', async () => {
  let getFileDiffCallCount = 0
  let stageCallCount = 0

  global.window = {
    addom: {
      file: {
        readFile: async () => ({ ok: true, content: 'const value = 1\n' }),
      },
      git: {
        getFileDiff: async () => {
          getFileDiffCallCount += 1
          return stageCallCount === 0
            ? createOkGitDiff()
            : createOkGitDiff({
              status: 'no_diff',
              hasDiff: false,
              hunks: [],
              hunkCount: 0,
              addedLineCount: 0,
              deletedLineCount: 0,
            })
        },
        stageHunk: async () => {
          stageCallCount += 1
          return { ok: true, status: 'ok' }
        },
      },
    },
  }

  const openResult = await useEditorStore.getState().openFile(
    'C:/Users/example/Documents/ADDOM',
    'src/example.js',
  )
  const initialTab = useEditorStore.getState().getTabSnapshot(openResult.tabId)
  useEditorStore.getState().attachTabModel(openResult.tabId, createFakeModel(initialTab.content))

  await useEditorStore.getState().refreshTabGitDiff('C:/Users/example/Documents/ADDOM', openResult.tabId)
  const firstHunkId = useEditorStore.getState().getTabGitDiff(openResult.tabId)?.hunks?.[0]?.id
  assert.equal(Boolean(firstHunkId), true)

  const stageResult = await useEditorStore.getState().stageTabGitHunk(
    'C:/Users/example/Documents/ADDOM',
    openResult.tabId,
    firstHunkId,
  )

  assert.equal(stageResult.ok, true)
  assert.equal(stageCallCount, 1)
  assert.equal(getFileDiffCallCount >= 2, true)
  assert.equal(useEditorStore.getState().getTabGitDiff(openResult.tabId)?.status, 'no_diff')
  assert.equal(useEditorStore.getState().getTabGitUi(openResult.tabId).selectedHunkId, '')
})

test('refreshTabGitDiff caches staged and unstaged scope separately and setTabGitScope switches between them', async () => {
  const requestedScopes = []

  global.window = {
    addom: {
      file: {
        readFile: async () => ({ ok: true, content: 'const value = 1\n' }),
      },
      git: {
        getFileDiff: async (_projectFolder, _filePath, options = {}) => {
          const scope = String(options?.scope || 'unstaged').trim() || 'unstaged'
          requestedScopes.push(scope)
          return createOkGitDiff({
            scope,
            rawDiff: scope === 'staged' ? 'staged diff' : 'unstaged diff',
            fileStatus: {
              hasStagedChanges: true,
              hasUnstagedChanges: true,
            },
          })
        },
      },
    },
  }

  const openResult = await useEditorStore.getState().openFile(
    'C:/Users/example/Documents/ADDOM',
    'src/example.js',
  )
  const initialTab = useEditorStore.getState().getTabSnapshot(openResult.tabId)
  useEditorStore.getState().attachTabModel(openResult.tabId, createFakeModel(initialTab.content))

  await useEditorStore.getState().refreshTabGitDiff('C:/Users/example/Documents/ADDOM', openResult.tabId)
  assert.deepEqual([...new Set(requestedScopes)].sort(), ['staged', 'unstaged'])
  assert.equal(useEditorStore.getState().getTabGitDiff(openResult.tabId)?.scope, 'unstaged')

  useEditorStore.getState().setTabGitScope(openResult.tabId, 'staged')
  assert.equal(useEditorStore.getState().getTabGitScope(openResult.tabId), 'staged')
  assert.equal(useEditorStore.getState().getTabGitDiff(openResult.tabId)?.scope, 'staged')
  assert.equal(
    useEditorStore.getState().getTabGitDiffForScope(openResult.tabId, 'unstaged')?.rawDiff,
    'unstaged diff',
  )
})

test('getTabGitPreviewState exposes index-backed staged preview metadata for mixed files', async () => {
  global.window = {
    addom: {
      file: {
        readFile: async () => ({ ok: true, content: 'const value = 1\n' }),
      },
      git: {
        getFileDiff: async (_projectFolder, _filePath, options = {}) => {
          const scope = String(options?.scope || 'unstaged').trim() || 'unstaged'
          return createOkGitDiff({
            scope,
            contentSource: scope === 'staged' ? 'index' : 'worktree',
            previewContent: scope === 'staged' ? 'const value = 2\n' : '',
            previewReadOnly: scope === 'staged',
            previewNotice: scope === 'staged' ? 'Showing staged content from the git index.' : '',
            fileStatus: {
              hasStagedChanges: true,
              hasUnstagedChanges: true,
            },
          })
        },
      },
    },
  }

  const openResult = await useEditorStore.getState().openFile(
    'C:/Users/example/Documents/ADDOM',
    'src/example.js',
  )
  const initialTab = useEditorStore.getState().getTabSnapshot(openResult.tabId)
  useEditorStore.getState().attachTabModel(openResult.tabId, createFakeModel(initialTab.content))

  await useEditorStore.getState().refreshTabGitDiff('C:/Users/example/Documents/ADDOM', openResult.tabId)
  useEditorStore.getState().setTabGitScope(openResult.tabId, 'staged')

  const previewState = useEditorStore.getState().getTabGitPreviewState(openResult.tabId, 'staged')
  assert.equal(Boolean(previewState), true)
  assert.equal(previewState.contentSource, 'index')
  assert.equal(previewState.previewReadOnly, true)
  assert.match(previewState.modelUri, /addomGitPreview=1/)
  assert.equal(previewState.previewContent, 'const value = 2\n')
})

test('getTabGitPreviewState keeps empty index-backed staged previews renderable', async () => {
  global.window = {
    addom: {
      file: {
        readFile: async () => ({ ok: true, content: 'const value = 1\n' }),
      },
      git: {
        getFileDiff: async (_projectFolder, _filePath, options = {}) => {
          const scope = String(options?.scope || 'unstaged').trim() || 'unstaged'
          return createOkGitDiff({
            scope,
            contentSource: scope === 'staged' ? 'index' : 'worktree',
            previewContent: '',
            previewReadOnly: scope === 'staged',
            fileStatus: {
              hasStagedChanges: true,
              hasUnstagedChanges: true,
            },
          })
        },
      },
    },
  }

  const openResult = await useEditorStore.getState().openFile(
    'C:/Users/example/Documents/ADDOM',
    'src/example.js',
  )
  const initialTab = useEditorStore.getState().getTabSnapshot(openResult.tabId)
  useEditorStore.getState().attachTabModel(openResult.tabId, createFakeModel(initialTab.content))

  await useEditorStore.getState().refreshTabGitDiff('C:/Users/example/Documents/ADDOM', openResult.tabId)
  useEditorStore.getState().setTabGitScope(openResult.tabId, 'staged')

  const previewState = useEditorStore.getState().getTabGitPreviewState(openResult.tabId, 'staged')
  assert.equal(Boolean(previewState), true)
  assert.equal(previewState.contentSource, 'index')
  assert.equal(previewState.previewReadOnly, true)
  assert.equal(previewState.previewContent, '')
})

test('unstageTabGitHunk uses staged scope action state and refreshes after success', async () => {
  let unstageCallCount = 0

  global.window = {
    addom: {
      file: {
        readFile: async () => ({ ok: true, content: 'const value = 1\n' }),
      },
      git: {
        getFileDiff: async (_projectFolder, _filePath, options = {}) => {
          const scope = String(options?.scope || 'unstaged').trim() || 'unstaged'
          return createOkGitDiff({
            scope,
            status: unstageCallCount === 0 || scope === 'unstaged' ? 'ok' : 'no_diff',
            hasDiff: unstageCallCount === 0 || scope === 'unstaged',
            hunks: unstageCallCount === 0 || scope === 'unstaged' ? createOkGitDiff().hunks : [],
            hunkCount: unstageCallCount === 0 || scope === 'unstaged' ? 1 : 0,
            addedLineCount: unstageCallCount === 0 || scope === 'unstaged' ? 1 : 0,
            deletedLineCount: unstageCallCount === 0 || scope === 'unstaged' ? 1 : 0,
          })
        },
        unstageHunk: async () => {
          unstageCallCount += 1
          return { ok: true, status: 'ok' }
        },
      },
    },
  }

  const openResult = await useEditorStore.getState().openFile(
    'C:/Users/example/Documents/ADDOM',
    'src/example.js',
  )
  const initialTab = useEditorStore.getState().getTabSnapshot(openResult.tabId)
  useEditorStore.getState().attachTabModel(openResult.tabId, createFakeModel(initialTab.content))

  await useEditorStore.getState().refreshTabGitDiff('C:/Users/example/Documents/ADDOM', openResult.tabId)
  useEditorStore.getState().setTabGitScope(openResult.tabId, 'staged')
  const hunkId = useEditorStore.getState().getTabGitDiffForScope(openResult.tabId, 'staged')?.hunks?.[0]?.id

  const result = await useEditorStore.getState().unstageTabGitHunk(
    'C:/Users/example/Documents/ADDOM',
    openResult.tabId,
    hunkId,
  )

  assert.equal(result.ok, true)
  assert.equal(unstageCallCount, 1)
  assert.equal(useEditorStore.getState().getTabGitDiffForScope(openResult.tabId, 'staged')?.status, 'no_diff')
})
