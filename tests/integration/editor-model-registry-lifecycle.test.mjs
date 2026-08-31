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
  let disposed = false
  return {
    getValue() {
      return value
    },
    setValue(nextValue) {
      value = String(nextValue ?? '')
    },
    dispose() {
      disposed = true
    },
    isDisposed() {
      return disposed
    },
  }
}

beforeEach(() => {
  resetEditorStore()
})

afterEach(() => {
  global.window = originalWindow
  resetEditorStore()
})

test('reopening the same workspace file reuses one stable model registry entry', async () => {
  let readCount = 0
  global.window = {
    addom: {
      file: {
        readFile: async () => {
          readCount += 1
          return { ok: true, content: 'export const count = 1\n' }
        },
      },
    },
  }

  const firstOpen = await useEditorStore.getState().openFile(
    'C:/Users/example/Documents/ADDOM',
    'src/main/index.mjs',
  )
  assert.equal(firstOpen.ok, true)
  assert.equal(readCount, 1)

  const firstTab = useEditorStore.getState().getTabSnapshot(firstOpen.tabId)
  const fakeModel = createFakeModel(firstTab.content)
  useEditorStore.getState().attachTabModel(firstOpen.tabId, fakeModel)

  const secondOpen = await useEditorStore.getState().openFile(
    'C:/Users/example/Documents/ADDOM',
    './src/main/index.mjs',
  )

  assert.equal(secondOpen.ok, true)
  assert.equal(secondOpen.existing, true)
  assert.equal(secondOpen.tabId, firstOpen.tabId)
  assert.equal(readCount, 1)
  assert.equal(useEditorStore.getState().tabs.length, 1)
  assert.equal(useEditorStore.getState().getTabModel(firstOpen.tabId), fakeModel)

  const registrySnapshot = useEditorStore.getState().getModelRegistrySnapshot()
  assert.equal(registrySnapshot.length, 1)
  assert.equal(registrySnapshot[0].uri, firstOpen.modelUri)
  assert.equal(registrySnapshot[0].hasModel, true)
})

test('openFile clears loading on the active tab after async read completion without requiring tab reselection', async () => {
  let resolveRead = null
  global.window = {
    addom: {
      file: {
        readFile: () => new Promise((resolve) => {
          resolveRead = resolve
        }),
      },
    },
  }

  const openPromise = useEditorStore.getState().openFile(
    'C:/Users/example/Documents/ADDOM',
    'src/async-open.js',
  )

  const pendingTab = useEditorStore.getState().tabs[0]
  assert.equal(useEditorStore.getState().activeTab, pendingTab.id)
  assert.equal(pendingTab.filePath, 'src/async-open.js')
  assert.equal(pendingTab.loading, true)
  assert.equal(useEditorStore.getState().getTabSnapshot(pendingTab.id)?.loading, true)

  resolveRead?.({ ok: true, content: 'export const ready = true\n' })
  const openResult = await openPromise
  assert.equal(openResult.ok, true)
  assert.equal(openResult.tabId, pendingTab.id)
  assert.equal(useEditorStore.getState().activeTab, pendingTab.id)

  const resolvedTab = useEditorStore.getState().tabs.find((tab) => tab.id === pendingTab.id)
  assert.equal(resolvedTab?.loading, false)
  assert.equal(resolvedTab?.error, null)
  assert.equal(useEditorStore.getState().getTabSnapshot(pendingTab.id)?.loading, false)
  assert.equal(useEditorStore.getState().getTabSnapshot(pendingTab.id)?.content, 'export const ready = true\n')
})

test('dirty state is derived from the registry-backed model and saves clear it', async () => {
  global.window = {
    addom: {
      file: {
        readFile: async () => ({ ok: true, content: 'const value = 1\n' }),
        saveFile: async (_project, _filePath, content) => ({ ok: true, content }),
      },
    },
  }

  const openResult = await useEditorStore.getState().openFile(
    'C:/Users/example/Documents/ADDOM',
    'src/example.js',
  )
  assert.equal(openResult.ok, true)

  const initialTab = useEditorStore.getState().getTabSnapshot(openResult.tabId)
  useEditorStore.getState().attachTabModel(openResult.tabId, createFakeModel(initialTab.content))

  assert.equal(useEditorStore.getState().isTabDirty(openResult.tabId), false)

  useEditorStore.getState().updateContent(openResult.tabId, 'const value = 2\n')

  const dirtyTab = useEditorStore.getState().getTabSnapshot(openResult.tabId)
  assert.equal(dirtyTab.dirty, true)
  assert.equal(dirtyTab.content, 'const value = 2\n')
  assert.equal(useEditorStore.getState().getDirtyTabs().length, 1)

  const saveResult = await useEditorStore.getState().saveTab(
    'C:/Users/example/Documents/ADDOM',
    openResult.tabId,
  )
  assert.equal(saveResult.ok, true)

  const savedTab = useEditorStore.getState().getTabSnapshot(openResult.tabId)
  assert.equal(savedTab.dirty, false)
  assert.equal(savedTab.savedContent, 'const value = 2\n')
})

test('saveAllDirtyTabs attempts every dirty file when one save rejects', async () => {
  const saveAttempts = []
  global.window = {
    addom: {
      file: {
        readFile: async (_project, filePath) => ({ ok: true, content: `// ${filePath}\n` }),
        saveFile: async (_project, filePath) => {
          saveAttempts.push(filePath)
          if (filePath === 'src/first.js') throw new Error('disk unavailable')
          return { ok: true }
        },
      },
    },
  }

  const first = await useEditorStore.getState().openFile('C:/work/project', 'src/first.js')
  const second = await useEditorStore.getState().openFile('C:/work/project', 'src/second.js')
  for (const opened of [first, second]) {
    const tab = useEditorStore.getState().getTabSnapshot(opened.tabId)
    useEditorStore.getState().attachTabModel(opened.tabId, createFakeModel(tab.content))
    useEditorStore.getState().updateContent(opened.tabId, `${tab.content}// changed\n`)
  }

  const results = await useEditorStore.getState().saveAllDirtyTabs('C:/work/project')

  assert.deepEqual(saveAttempts, ['src/first.js', 'src/second.js'])
  assert.equal(results.length, 2)
  assert.deepEqual(results.map((row) => row.ok), [false, true])
  assert.match(results[0].error, /disk unavailable/i)
})

test('updateContent avoids tab metadata churn once a tab is already dirty', async () => {
  global.window = {
    addom: {
      file: {
        readFile: async () => ({ ok: true, content: 'const value = 1\n' }),
      },
    },
  }

  const openResult = await useEditorStore.getState().openFile(
    'C:/Users/example/Documents/ADDOM',
    'src/perf-dirty.js',
  )
  assert.equal(openResult.ok, true)

  const initialTab = useEditorStore.getState().getTabSnapshot(openResult.tabId)
  useEditorStore.getState().attachTabModel(openResult.tabId, createFakeModel(initialTab.content))

  const cleanTabsRef = useEditorStore.getState().tabs
  useEditorStore.getState().updateContent(openResult.tabId, 'const value = 2\n')
  const firstDirtyTabsRef = useEditorStore.getState().tabs

  assert.notStrictEqual(firstDirtyTabsRef, cleanTabsRef)
  assert.equal(useEditorStore.getState().getTabSnapshot(openResult.tabId)?.dirty, true)

  useEditorStore.getState().updateContent(openResult.tabId, 'const value = 3\n')
  const secondDirtyTabsRef = useEditorStore.getState().tabs

  assert.strictEqual(secondDirtyTabsRef, firstDirtyTabsRef)
  assert.equal(useEditorStore.getState().getTabSnapshot(openResult.tabId)?.content, 'const value = 3\n')
  assert.equal(useEditorStore.getState().getTabSnapshot(openResult.tabId)?.dirty, true)
})

test('closing a dirty tab is blocked until the caller forces a discard', async () => {
  global.window = {
    addom: {
      file: {
        readFile: async () => ({ ok: true, content: 'const value = 1\n' }),
      },
    },
  }

  const openResult = await useEditorStore.getState().openFile(
    'C:/Users/example/Documents/ADDOM',
    'src/dirty-close.js',
  )
  assert.equal(openResult.ok, true)

  const tab = useEditorStore.getState().getTabSnapshot(openResult.tabId)
  const model = createFakeModel(tab.content)
  useEditorStore.getState().attachTabModel(openResult.tabId, model)
  useEditorStore.getState().updateContent(openResult.tabId, 'const value = 2\n')

  const blockedClose = useEditorStore.getState().closeTab(openResult.tabId)
  assert.deepEqual(blockedClose, {
    ok: false,
    reason: 'dirty_tab',
    tabId: openResult.tabId,
  })
  assert.equal(useEditorStore.getState().tabs.length, 1)
  assert.equal(model.isDisposed(), false)

  const forcedClose = useEditorStore.getState().closeTab(openResult.tabId, { force: true })
  assert.deepEqual(forcedClose, {
    ok: true,
    tabId: openResult.tabId,
  })
  assert.equal(useEditorStore.getState().tabs.length, 0)
  assert.equal(model.isDisposed(), true)
})

test('reopening a file retries after an earlier read failure', async () => {
  let attempt = 0
  global.window = {
    addom: {
      file: {
        readFile: async () => {
          attempt += 1
          if (attempt === 1) {
            return { ok: false, error: 'Temporary read failure' }
          }
          return { ok: true, content: 'export const recovered = true\n' }
        },
      },
    },
  }

  const firstOpen = await useEditorStore.getState().openFile(
    'C:/Users/example/Documents/ADDOM',
    'src/retry-open.js',
  )
  assert.equal(firstOpen.ok, false)
  assert.equal(useEditorStore.getState().getTabSnapshot(firstOpen.tabId)?.error, 'Temporary read failure')

  const secondOpen = await useEditorStore.getState().openFile(
    'C:/Users/example/Documents/ADDOM',
    'src/retry-open.js',
  )
  assert.equal(secondOpen.ok, true)
  assert.equal(secondOpen.tabId, firstOpen.tabId)
  assert.equal(useEditorStore.getState().getTabSnapshot(secondOpen.tabId)?.error, null)
  assert.equal(useEditorStore.getState().getTabSnapshot(secondOpen.tabId)?.content, 'export const recovered = true\n')
})

test('external file changes reload clean models and flag dirty models without overwriting edits', async () => {
  const diskReads = new Map([
    ['src/clean.js', 'export const clean = 1\n'],
    ['src/dirty.js', 'export const dirty = 1\n'],
  ])

  global.window = {
    addom: {
      file: {
        readFile: async (_project, filePath) => ({ ok: true, content: diskReads.get(filePath) || '' }),
      },
    },
  }

  const cleanOpen = await useEditorStore.getState().openFile(
    'C:/Users/example/Documents/ADDOM',
    'src/clean.js',
  )
  const dirtyOpen = await useEditorStore.getState().openFile(
    'C:/Users/example/Documents/ADDOM',
    'src/dirty.js',
  )

  useEditorStore.getState().attachTabModel(
    cleanOpen.tabId,
    createFakeModel(useEditorStore.getState().getTabSnapshot(cleanOpen.tabId).content),
  )
  useEditorStore.getState().attachTabModel(
    dirtyOpen.tabId,
    createFakeModel(useEditorStore.getState().getTabSnapshot(dirtyOpen.tabId).content),
  )

  useEditorStore.getState().updateContent(dirtyOpen.tabId, 'export const dirty = 99\n')
  diskReads.set('src/clean.js', 'export const clean = 2\n')
  diskReads.set('src/dirty.js', 'export const dirty = 2\n')

  const cleanChange = await useEditorStore.getState().handleExternalFileChange(
    'C:/Users/example/Documents/ADDOM',
    'src/clean.js',
    { source: 'watcher', changedAt: 123 },
  )
  const dirtyChange = await useEditorStore.getState().handleExternalFileChange(
    'C:/Users/example/Documents/ADDOM',
    'src/dirty.js',
    { source: 'watcher', changedAt: 456 },
  )

  assert.deepEqual(cleanChange, {
    handled: true,
    reloaded: true,
    dirty: false,
    reason: '',
  })
  assert.equal(useEditorStore.getState().getTabSnapshot(cleanOpen.tabId).content, 'export const clean = 2\n')
  assert.equal(useEditorStore.getState().getTabSnapshot(cleanOpen.tabId).externalChanged, false)

  assert.deepEqual(dirtyChange, {
    handled: true,
    reloaded: false,
    dirty: true,
    reason: 'dirty_tab',
  })
  const dirtyTab = useEditorStore.getState().getTabSnapshot(dirtyOpen.tabId)
  assert.equal(dirtyTab.content, 'export const dirty = 99\n')
  assert.equal(dirtyTab.externalChanged, true)
  assert.equal(dirtyTab.externalChangedAt, 456)
  assert.equal(dirtyTab.externalChangedSource, 'watcher')
})

test('closeTab blocks dirty tabs until the caller explicitly forces close', async () => {
  global.window = {
    addom: {
      file: {
        readFile: async () => ({ ok: true, content: 'const value = 1\n' }),
      },
    },
  }

  const openResult = await useEditorStore.getState().openFile(
    'C:/Users/example/Documents/ADDOM',
    'src/dirty-close.js',
  )
  assert.equal(openResult.ok, true)

  const initialTab = useEditorStore.getState().getTabSnapshot(openResult.tabId)
  const model = createFakeModel(initialTab.content)
  useEditorStore.getState().attachTabModel(openResult.tabId, model)
  useEditorStore.getState().updateContent(openResult.tabId, 'const value = 2\n')

  const blockedClose = useEditorStore.getState().closeTab(openResult.tabId)
  assert.deepEqual(blockedClose, {
    ok: false,
    reason: 'dirty_tab',
    tabId: openResult.tabId,
  })
  assert.equal(useEditorStore.getState().tabs.length, 1)
  assert.equal(model.isDisposed(), false)

  const forcedClose = useEditorStore.getState().closeTab(openResult.tabId, { force: true })
  assert.deepEqual(forcedClose, {
    ok: true,
    tabId: openResult.tabId,
  })
  assert.equal(useEditorStore.getState().tabs.length, 0)
  assert.equal(model.isDisposed(), true)
})

test('openFile retries transient read failures on an existing error tab', async () => {
  let readCount = 0
  global.window = {
    addom: {
      file: {
        readFile: async () => {
          readCount += 1
          if (readCount === 1) {
            return { ok: false, error: 'Temporary read failure' }
          }
          return { ok: true, content: 'export const recovered = true\n' }
        },
      },
    },
  }

  const firstOpen = await useEditorStore.getState().openFile(
    'C:/Users/example/Documents/ADDOM',
    'src/retry-open.js',
  )
  assert.equal(firstOpen.ok, false)
  assert.equal(useEditorStore.getState().tabs.length, 1)
  assert.equal(useEditorStore.getState().getTabSnapshot(firstOpen.tabId).error, 'Temporary read failure')

  const secondOpen = await useEditorStore.getState().openFile(
    'C:/Users/example/Documents/ADDOM',
    'src/retry-open.js',
  )
  assert.equal(secondOpen.ok, true)
  assert.equal(secondOpen.tabId, firstOpen.tabId)
  assert.equal(readCount, 2)

  const recoveredTab = useEditorStore.getState().getTabSnapshot(firstOpen.tabId)
  assert.equal(recoveredTab.error, null)
  assert.equal(recoveredTab.content, 'export const recovered = true\n')
})

test('getTabsSnapshot keeps tab-list snapshots metadata-only while preserving dirty state', async () => {
  global.window = {
    addom: {
      file: {
        readFile: async (_project, filePath) => ({ ok: true, content: `// ${filePath}\n` }),
      },
    },
  }

  const firstOpen = await useEditorStore.getState().openFile(
    'C:/Users/example/Documents/ADDOM',
    'src/list-a.js',
  )
  const secondOpen = await useEditorStore.getState().openFile(
    'C:/Users/example/Documents/ADDOM',
    'src/list-b.js',
  )

  useEditorStore.getState().attachTabModel(
    firstOpen.tabId,
    createFakeModel(useEditorStore.getState().getTabSnapshot(firstOpen.tabId).content),
  )
  useEditorStore.getState().attachTabModel(
    secondOpen.tabId,
    createFakeModel(useEditorStore.getState().getTabSnapshot(secondOpen.tabId).content),
  )
  useEditorStore.getState().updateContent(secondOpen.tabId, '// changed\n')

  const tabSnapshots = useEditorStore.getState().getTabsSnapshot()
  assert.equal(tabSnapshots.length, 2)
  assert.equal('content' in tabSnapshots[0], false)
  assert.equal('savedContent' in tabSnapshots[0], false)
  assert.equal(tabSnapshots.find((tab) => tab.id === firstOpen.tabId)?.dirty, false)
  assert.equal(tabSnapshots.find((tab) => tab.id === secondOpen.tabId)?.dirty, true)
})

test('setTabServiceState ignores equivalent service-state writes', async () => {
  global.window = {
    addom: {
      file: {
        readFile: async () => ({ ok: true, content: 'const value = 1\n' }),
      },
    },
  }

  const openResult = await useEditorStore.getState().openFile(
    'C:/Users/example/Documents/ADDOM',
    'src/service-state.js',
  )
  assert.equal(openResult.ok, true)

  let serviceStateChangeCount = 0
  const unsubscribe = useEditorStore.subscribe((state, previousState) => {
    if (state.serviceStateByTab !== previousState.serviceStateByTab) {
      serviceStateChangeCount += 1
    }
  })

  const serviceState = {
    capabilities: {
      formatting: { available: false, supported: true, reason: 'real_provider_missing', source: 'biome' },
    },
    diagnosticOwnership: { mode: 'syntax-only', owner: 'syntax-only', summary: 'Syntax only.' },
    health: { status: 'idle', message: '', providers: [] },
  }

  useEditorStore.getState().setTabServiceState(openResult.tabId, serviceState)
  useEditorStore.getState().setTabServiceState(openResult.tabId, {
    capabilities: {
      formatting: { available: false, supported: true, reason: 'real_provider_missing', source: 'biome' },
    },
    diagnosticOwnership: { mode: 'syntax-only', owner: 'syntax-only', summary: 'Syntax only.' },
    health: { status: 'idle', message: '', providers: [] },
  })
  unsubscribe()

  assert.equal(serviceStateChangeCount, 1)
})

test('closing and reopening a tab does not retain stale language-service state across model lifecycle resets', async () => {
  global.window = {
      addom: {
        file: {
        readFile: async () => ({ ok: true, content: 'def greet(name: str) -> str:\n    return f"Hello, {name}"\n' }),
      },
    },
  }

  const firstOpen = await useEditorStore.getState().openFile(
    'C:/Users/example/Documents/ADDOM',
    'src/example.py',
  )
  assert.equal(firstOpen.ok, true)

  useEditorStore.getState().setTabServiceState(firstOpen.tabId, {
    capabilities: {
      formatting: { available: true, supported: true, source: 'ruff', reason: '', message: 'Ready.' },
      codeActions: { available: true, supported: true, source: 'ruff', reason: '', message: 'Ready.' },
    },
    diagnosticOwnership: { mode: 'provider', owner: 'pyright', summary: 'pyright owns diagnostics for this file.' },
    health: {
      status: 'healthy',
      message: '',
      providers: [{ id: 'ruff', status: 'healthy', source: 'ruff', root: 'C:/Users/example/Documents/ADDOM', message: 'Ready.' }],
    },
  })
  assert.equal(useEditorStore.getState().getTabServiceState(firstOpen.tabId)?.capabilities?.formatting?.available, true)

  const closeResult = useEditorStore.getState().closeTab(firstOpen.tabId, { force: true })
  assert.deepEqual(closeResult, {
    ok: true,
    tabId: firstOpen.tabId,
  })
  assert.equal(useEditorStore.getState().getTabServiceState(firstOpen.tabId), null)

  const secondOpen = await useEditorStore.getState().openFile(
    'C:/Users/example/Documents/ADDOM',
    'src/example.py',
  )
  assert.equal(secondOpen.ok, true)
  assert.notEqual(secondOpen.tabId, firstOpen.tabId)
  assert.equal(useEditorStore.getState().getTabServiceState(secondOpen.tabId), null)
})
