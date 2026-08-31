import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import useAppStore from '../../src/renderer/store/useAppStore.js'
import useEditorStore from '../../src/renderer/store/useEditorStore.js'
import useSourceControlStore, {
  getSourceControlEntryLineStats,
  groupSourceControlEntries,
  resolveSourceControlNavigation,
} from '../../src/renderer/store/useSourceControlStore.js'

const originalWindow = global.window

function resetStores() {
  useSourceControlStore.getState().clear()
  useEditorStore.getState().clearAllTabs()
  useAppStore.setState({
    activePanel: 'chat',
    projectFolder: null,
  })
}

beforeEach(() => {
  resetStores()
})

afterEach(() => {
  global.window = originalWindow
  resetStores()
})

test('groupSourceControlEntries keeps staged and unstaged files separated and sorted', () => {
  const grouped = groupSourceControlEntries([
    { key: 'b', projectRelativePath: 'src/b.js', hasUnstagedChanges: true, hasStagedChanges: false },
    { key: 'a', projectRelativePath: 'src/a.js', hasUnstagedChanges: true, hasStagedChanges: true },
    { key: 'c', projectRelativePath: 'src/c.js', hasUnstagedChanges: false, hasStagedChanges: true },
    { key: 'u', projectRelativePath: 'src/conflict.js', hasUnstagedChanges: true, hasStagedChanges: true, isConflicted: true },
  ])

  assert.deepEqual(
    grouped.unstaged.map((entry) => entry.projectRelativePath),
    ['src/a.js', 'src/b.js'],
  )
  assert.deepEqual(
    grouped.staged.map((entry) => entry.projectRelativePath),
    ['src/a.js', 'src/c.js'],
  )
  assert.deepEqual(
    grouped.conflicted.map((entry) => entry.projectRelativePath),
    ['src/conflict.js'],
  )
})

test('getSourceControlEntryLineStats returns scope-specific line totals', () => {
  assert.deepEqual(
    getSourceControlEntryLineStats({
      stagedAddedLines: 3,
      stagedDeletedLines: 1,
      unstagedAddedLines: 8,
      unstagedDeletedLines: 2,
    }, 'staged'),
    {
      addedLines: 3,
      deletedLines: 1,
      changedLines: 4,
    },
  )

  assert.deepEqual(
    getSourceControlEntryLineStats({
      stagedAddedLines: 3,
      stagedDeletedLines: 1,
      unstagedAddedLines: 8,
      unstagedDeletedLines: 2,
    }, 'unstaged'),
    {
      addedLines: 8,
      deletedLines: 2,
      changedLines: 10,
    },
  )
})

test('resolveSourceControlNavigation routes advanced SCM states into panel detail mode explicitly', () => {
  assert.deepEqual(
    resolveSourceControlNavigation({ isBinary: true, projectRelativePath: 'image.bin' }, 'unstaged'),
    {
      ok: true,
      mode: 'detail',
      filePath: 'image.bin',
      scope: 'unstaged',
    },
  )

  assert.deepEqual(
    resolveSourceControlNavigation({ isDeleted: true, projectRelativePath: 'src/deleted.js' }, 'staged'),
    {
      ok: true,
      mode: 'detail',
      filePath: 'src/deleted.js',
      scope: 'staged',
    },
  )
})

test('refreshStatus stores repo-wide SCM state including branch metadata', async () => {
  global.window = {
    addom: {
      git: {
        getRepositoryStatus: async () => ({
          ok: true,
          status: 'ok',
          repoRoot: 'C:/repo',
          branch: 'main',
          entries: [{
            key: 'src/app.js::',
            projectRelativePath: 'src/app.js',
            hasStagedChanges: false,
            hasUnstagedChanges: true,
            unstagedAddedLines: 4,
            unstagedDeletedLines: 1,
          }],
          totals: {
            staged: 0,
            unstaged: 1,
            conflicted: 0,
            unsupported: 0,
          },
        }),
      },
    },
  }

  const result = await useSourceControlStore.getState().refreshStatus('C:/repo')
  assert.equal(result.ok, true)
  assert.equal(useSourceControlStore.getState().status, 'ok')
  assert.equal(useSourceControlStore.getState().repoRoot, 'C:/repo')
  assert.equal(useSourceControlStore.getState().branch, 'main')
})

test('refreshStatus clears selected SCM detail when switching workspaces', async () => {
  global.window = {
    addom: {
      git: {
        getRepositoryStatus: async () => ({
          ok: true,
          status: 'ok',
          repoRoot: 'C:/other-repo',
          branch: 'main',
          entries: [{
            key: 'src/app.js::',
            projectRelativePath: 'src/app.js',
            hasStagedChanges: false,
            hasUnstagedChanges: true,
          }],
          totals: {
            staged: 0,
            unstaged: 1,
            conflicted: 0,
            unsupported: 0,
          },
        }),
      },
    },
  }

  useSourceControlStore.setState({
    projectFolder: 'C:/repo',
    selectedKey: 'src/app.js::',
    selectedDetail: {
      detailKind: 'deleted_file',
      detail: {
        projectRelativePath: 'src/app.js',
        canRestore: true,
      },
    },
    selectedDetailKey: 'unstaged::src/app.js',
    detailLoading: true,
    detailError: 'stale detail',
    detailActionPending: 'restore_file',
    detailActionError: 'stale action',
    indexActionPending: 'stage:src/app.js::',
    indexActionError: 'stale index action',
  })

  const result = await useSourceControlStore.getState().refreshStatus('C:/other-repo')
  assert.equal(result.ok, true)
  assert.equal(useSourceControlStore.getState().projectFolder, 'C:/other-repo')
  assert.equal(useSourceControlStore.getState().selectedKey, '')
  assert.equal(useSourceControlStore.getState().selectedDetail, null)
  assert.equal(useSourceControlStore.getState().selectedDetailKey, '')
  assert.equal(useSourceControlStore.getState().detailLoading, false)
  assert.equal(useSourceControlStore.getState().detailError, '')
  assert.equal(useSourceControlStore.getState().detailActionPending, '')
  assert.equal(useSourceControlStore.getState().detailActionError, '')
  assert.equal(useSourceControlStore.getState().indexActionPending, '')
  assert.equal(useSourceControlStore.getState().indexActionError, '')
})

test('navigateEntry keeps advanced SCM states in Source Control detail mode', async () => {
  global.window = {
    addom: {
      git: {
        getFileDiff: async () => ({
          ok: true,
          scope: 'staged',
          status: 'detail',
          detailKind: 'merge_conflict',
          detail: {
            title: 'Merge conflict',
            summary: 'Conflict resolution is not implemented inline yet.',
            unmergedStages: [{ stage: 1, oid: 'abc', label: 'base' }],
          },
        }),
      },
    },
  }

  const result = await useSourceControlStore.getState().navigateEntry('C:/repo', {
    key: 'src/app.js::',
    projectRelativePath: 'src/app.js',
    isConflicted: true,
    hasStagedChanges: true,
    hasUnstagedChanges: true,
  }, 'staged')

  assert.equal(result.ok, true)
  assert.equal(result.mode, 'detail')
  assert.equal(useAppStore.getState().activePanel, 'chat')
  assert.equal(useSourceControlStore.getState().selectedDetail?.detailKind, 'merge_conflict')
})

test('Source Control search and filter state survives main-panel navigation', () => {
  useSourceControlStore.getState().setSearchValue('renderer')
  useSourceControlStore.getState().setActiveFilter('unstaged')
  useAppStore.getState().setActivePanel('artifacts')

  assert.equal(useSourceControlStore.getState().searchValue, 'renderer')
  assert.equal(useSourceControlStore.getState().activeFilter, 'unstaged')
})

test('navigateEntry opens diffable files in the editor and switches SCM scope', async () => {
  global.window = {
    addom: {
      file: {
        readFile: async () => ({ ok: true, content: 'const value = 1\n', encoding: 'utf8' }),
      },
      git: {
        getFileDiff: async (_projectFolder, filePath, options = {}) => ({
          ok: true,
          scope: String(options?.scope || 'unstaged').trim() || 'unstaged',
          status: 'no_diff',
          insideWorkTree: true,
          repoRoot: 'C:/repo',
          relativePath: String(filePath || '').replace(/\\/g, '/'),
          projectRelativePath: String(filePath || '').replace(/\\/g, '/'),
          absolutePath: `C:/repo/${String(filePath || '').replace(/\\/g, '/')}`,
          hasDiff: false,
          dirtyBufferBlocked: false,
          editorRenderable: true,
          editorBlockedReason: '',
          unsupportedReason: '',
          hunks: [],
          hunkCount: 0,
          addedLineCount: 0,
          deletedLineCount: 0,
          rawDiff: '',
          fileStatus: {
            hasStagedChanges: true,
            hasUnstagedChanges: true,
          },
        }),
      },
    },
  }

  const result = await useSourceControlStore.getState().navigateEntry('C:/repo', {
    key: 'src/app.js::',
    projectRelativePath: 'src/app.js',
    hasStagedChanges: true,
    hasUnstagedChanges: true,
  }, 'staged')

  assert.equal(result.ok, true)
  assert.equal(useAppStore.getState().activePanel, 'editor')
  assert.equal(useEditorStore.getState().getTabGitScope(result.tabId), 'staged')
  assert.equal(useEditorStore.getState().getTabSnapshot(result.tabId)?.filePath, 'src/app.js')
})

test('selected detail file actions call git APIs and refresh SCM/editor state', async () => {
  const calls = []
  let editorRefreshCount = 0
  const originalRefreshProjectGitDiffs = useEditorStore.getState().refreshProjectGitDiffs

  global.window = {
    addom: {
      git: {
        getRepositoryStatus: async () => ({
          ok: true,
          status: 'ok',
          repoRoot: 'C:/repo',
          branch: 'main',
          entries: [],
          totals: {
            staged: 0,
            unstaged: 0,
            conflicted: 0,
            unsupported: 0,
          },
        }),
        restoreFile: async (projectFolder, filePath) => {
          calls.push(['restoreFile', projectFolder, filePath])
          return { ok: true, status: 'ok' }
        },
        unstageFile: async (projectFolder, filePath, payload) => {
          calls.push(['unstageFile', projectFolder, filePath, payload])
          return { ok: true, status: 'ok' }
        },
      },
    },
  }

  try {
    useEditorStore.setState({
      refreshProjectGitDiffs: async () => {
        editorRefreshCount += 1
        return []
      },
    })

    useSourceControlStore.setState({
      selectedDetail: {
        detailKind: 'deleted_file',
        detail: {
          projectRelativePath: 'src/deleted.js',
          canRestore: true,
        },
      },
      selectedDetailKey: 'unstaged::src/deleted.js',
    })

    const restoreResult = await useSourceControlStore.getState().restoreSelectedDetailFile('C:/repo')
    assert.equal(restoreResult.ok, true)
    assert.deepEqual(calls[0], ['restoreFile', 'C:/repo', 'src/deleted.js'])

    useSourceControlStore.setState({
      selectedDetail: {
        detailKind: 'rename',
        detail: {
          projectRelativePath: 'src/new.js',
          previousProjectRelativePath: 'src/old.js',
          canUnstage: true,
        },
      },
      selectedDetailKey: 'staged::src/new.js',
    })

    const unstageResult = await useSourceControlStore.getState().unstageSelectedDetailFile('C:/repo')
    assert.equal(unstageResult.ok, true)
    assert.deepEqual(calls[1], ['unstageFile', 'C:/repo', 'src/new.js', { previousFilePath: 'src/old.js' }])
    assert.equal(editorRefreshCount, 2)
    assert.equal(useSourceControlStore.getState().selectedDetail, null)
  } finally {
    useEditorStore.setState({ refreshProjectGitDiffs: originalRefreshProjectGitDiffs })
  }
})

test('whole-file and repository staging actions refresh SCM/editor state and preserve filters', async () => {
  const calls = []
  let editorRefreshCount = 0
  const originalRefreshProjectGitDiffs = useEditorStore.getState().refreshProjectGitDiffs
  const statusResult = {
    ok: true,
    status: 'ok',
    repoRoot: 'C:/repo',
    branch: 'main',
    entries: [],
    totals: { staged: 0, unstaged: 0, conflicted: 0, unsupported: 0 },
  }

  global.window = {
    addom: {
      git: {
        getRepositoryStatus: async () => statusResult,
        stageFile: async (...args) => { calls.push(['stageFile', ...args]); return { ok: true } },
        unstageFile: async (...args) => { calls.push(['unstageFile', ...args]); return { ok: true } },
        stageAll: async (...args) => { calls.push(['stageAll', ...args]); return { ok: true } },
        unstageAll: async (...args) => { calls.push(['unstageAll', ...args]); return { ok: true } },
      },
    },
  }

  try {
    useEditorStore.setState({
      refreshProjectGitDiffs: async () => {
        editorRefreshCount += 1
        return []
      },
    })
    useSourceControlStore.setState({ activeFilter: 'unstaged', searchValue: 'renderer' })
    const entry = {
      key: 'src/new.js::src/old.js',
      projectRelativePath: 'src/new.js',
      previousProjectRelativePath: 'src/old.js',
    }

    assert.equal((await useSourceControlStore.getState().setEntryStaged('C:/repo', entry, true)).ok, true)
    assert.equal((await useSourceControlStore.getState().setEntryStaged('C:/repo', entry, false)).ok, true)
    assert.equal((await useSourceControlStore.getState().setAllStaged('C:/repo', true)).ok, true)
    assert.equal((await useSourceControlStore.getState().setAllStaged('C:/repo', false)).ok, true)

    assert.deepEqual(calls, [
      ['stageFile', 'C:/repo', 'src/new.js', { previousFilePath: 'src/old.js' }],
      ['unstageFile', 'C:/repo', 'src/new.js', { previousFilePath: 'src/old.js' }],
      ['stageAll', 'C:/repo'],
      ['unstageAll', 'C:/repo'],
    ])
    assert.equal(editorRefreshCount, 4)
    assert.equal(useSourceControlStore.getState().activeFilter, 'unstaged')
    assert.equal(useSourceControlStore.getState().searchValue, 'renderer')
    assert.equal(useSourceControlStore.getState().indexActionPending, '')
    assert.equal(useSourceControlStore.getState().indexActionError, '')
  } finally {
    useEditorStore.setState({ refreshProjectGitDiffs: originalRefreshProjectGitDiffs })
  }
})

test('staging failures clear pending state and surface restrained inline errors', async () => {
  global.window = {
    addom: {
      git: {
        getRepositoryStatus: async () => ({ ok: true, entries: [], totals: {} }),
        stageFile: async () => ({ ok: false, error: 'stage_file_failed', message: 'Could not stage file.' }),
      },
    },
  }

  const result = await useSourceControlStore.getState().setEntryStaged('C:/repo', {
    key: 'src/app.js::',
    projectRelativePath: 'src/app.js',
  }, true)

  assert.equal(result.ok, false)
  assert.equal(useSourceControlStore.getState().indexActionPending, '')
  assert.equal(useSourceControlStore.getState().indexActionError, 'Could not stage file.')
})

test('commitStaged refreshes repo and editor git state after a successful staged-only commit', async () => {
  let refreshCount = 0
  let commitCount = 0
  let editorRefreshCount = 0
  const originalRefreshProjectGitDiffs = useEditorStore.getState().refreshProjectGitDiffs

  global.window = {
    addom: {
      git: {
        getRepositoryStatus: async () => {
          refreshCount += 1
          return {
            ok: true,
            status: 'ok',
            repoRoot: 'C:/repo',
            branch: 'main',
            entries: [],
            totals: {
              staged: 0,
              unstaged: 0,
              conflicted: 0,
              unsupported: 0,
            },
          }
        },
        commitStaged: async () => {
          commitCount += 1
          return {
            ok: true,
            status: 'ok',
            summary: 'abc123 2026-04-11 staged commit (ADDOM Test)',
          }
        },
      },
    },
  }

  try {
    useEditorStore.setState({
      refreshProjectGitDiffs: async () => {
        editorRefreshCount += 1
        return []
      },
    })

    useSourceControlStore.setState({
      projectFolder: 'C:/repo',
      entries: [{ key: 'src/app.js::', projectRelativePath: 'src/app.js', hasStagedChanges: true, hasUnstagedChanges: false }],
      totals: {
        staged: 1,
        unstaged: 0,
        conflicted: 0,
        unsupported: 0,
      },
      commitMessage: 'staged commit',
    })

    const result = await useSourceControlStore.getState().commitStaged('C:/repo')
    assert.equal(result.ok, true)
    assert.equal(commitCount, 1)
    assert.equal(refreshCount >= 1, true)
    assert.equal(editorRefreshCount, 1)
    assert.equal(useSourceControlStore.getState().commitMessage, '')
    assert.match(useSourceControlStore.getState().lastCommitSummary, /staged commit/)
  } finally {
    useEditorStore.setState({ refreshProjectGitDiffs: originalRefreshProjectGitDiffs })
  }
})
