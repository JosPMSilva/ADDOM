import test from 'node:test'
import assert from 'node:assert/strict'

function createMemoryLocalStorage() {
  const map = new Map()
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null
    },
    setItem(key, value) {
      map.set(String(key), String(value))
    },
    removeItem(key) {
      map.delete(String(key))
    },
    clear() {
      map.clear()
    },
  }
}

async function withWorkspaceStore(workspaceApi, testFn) {
  const prevWindow = globalThis.window
  const prevLocalStorage = globalThis.localStorage
  const localStorage = createMemoryLocalStorage()
  let injectedCrypto = false
  if (!globalThis.crypto) {
    globalThis.crypto = { randomUUID: () => `uuid_${Math.random().toString(36).slice(2, 10)}` }
    injectedCrypto = true
  }
  globalThis.window = {
    localStorage,
    addom: {
      workspace: {
        listTimeline: async () => [],
        listProjects: async () => ([{ id: 'project_1', path: 'C:/repo', name: 'Repo' }]),
        listThreads: async () => ([{ id: 'thread_a' }, { id: 'thread_b' }]),
        setActiveThread: async (_projectId, threadId) => ({ thread: { id: threadId } }),
        createThread: async () => ({ thread: { id: 'thread_new' } }),
        ...workspaceApi,
      },
    },
  }
  globalThis.localStorage = localStorage

  try {
    const chatMod = await import('../../src/renderer/store/useChatStore.js')
    const appMod = await import('../../src/renderer/store/useAppStore.js')
    const workspaceMod = await import('../../src/renderer/store/useWorkspaceStore.js')
    const useChatStore = chatMod.default
    const useAppStore = appMod.default
    const useWorkspaceStore = workspaceMod.default
    useChatStore.setState(useChatStore.getInitialState?.() || useChatStore.getState())
    useAppStore.setState({
      ...useAppStore.getState(),
      activeProjectId: 'project_1',
      activeThreadId: 'thread_a',
      projectFolder: 'C:/repo',
      workspaceViewMode: 'workspace',
    })
    useWorkspaceStore.setState({
      ...useWorkspaceStore.getState(),
      initialized: true,
      loadingProjects: false,
      projects: [{ id: 'project_1', path: 'C:/repo', name: 'Repo' }],
      activeProjectId: 'project_1',
      activeThreadId: 'thread_a',
      threads: [{ id: 'thread_a' }, { id: 'thread_b' }],
      error: '',
    })
    await testFn({ useWorkspaceStore, useAppStore, useChatStore })
  } finally {
    globalThis.window = prevWindow
    globalThis.localStorage = prevLocalStorage
    if (injectedCrypto) delete globalThis.crypto
  }
}

test('loadProjects({ quiet: true }) refreshes rows without flipping loadingProjects', async () => {
  const loadingSamples = []
  await withWorkspaceStore({}, async ({ useWorkspaceStore }) => {
    globalThis.window.addom.workspace.listProjects = async () => {
      loadingSamples.push(useWorkspaceStore.getState().loadingProjects)
      return [{ id: 'project_1', path: 'C:/repo', name: 'Repo', activeThreadId: 'thread_b' }]
    }
    assert.equal(useWorkspaceStore.getState().loadingProjects, false)
    await useWorkspaceStore.getState().loadProjects({ quiet: true })
    assert.equal(useWorkspaceStore.getState().loadingProjects, false)
    assert.equal(useWorkspaceStore.getState().projects[0]?.activeThreadId, 'thread_b')
    assert.ok(loadingSamples.every((value) => value === false))
  })
})

test('setActiveThread uses quiet project refresh so the rail never enters loadingProjects', async () => {
  const loadingSamples = []
  await withWorkspaceStore({}, async ({ useWorkspaceStore, useAppStore }) => {
    globalThis.window.addom.workspace.listProjects = async () => {
      loadingSamples.push(useWorkspaceStore.getState().loadingProjects)
      return [{ id: 'project_1', path: 'C:/repo', name: 'Repo' }]
    }
    globalThis.window.addom.workspace.setActiveThread = async (_projectId, threadId) => ({
      thread: { id: threadId, lastProvider: 'openai', lastModel: 'gpt-test' },
    })
    await useWorkspaceStore.getState().setActiveThread('thread_b')
    assert.equal(useWorkspaceStore.getState().activeThreadId, 'thread_b')
    assert.equal(useAppStore.getState().activeThreadId, 'thread_b')
    assert.equal(useWorkspaceStore.getState().loadingProjects, false)
    assert.ok(loadingSamples.length >= 1)
    assert.ok(loadingSamples.every((value) => value === false))
  })
})

test('workspace project tree only shows skeletons when no projects are loaded yet', async () => {
  const source = await import('node:fs').then((fs) => (
    fs.readFileSync('src/renderer/components/workspace/useWorkspaceProjectTree.js', 'utf8')
  ))
  assert.match(source, /showProjectsLoading = \(!initialized \|\| loadingProjects\) && projects\.length === 0/)
  assert.doesNotMatch(source, /const showProjectsLoading = !initialized \|\| loadingProjects\n/)
})

test('setActiveThread and createThread call quiet loadProjects', async () => {
  const source = await import('node:fs').then((fs) => (
    fs.readFileSync('src/renderer/store/useWorkspaceStore.js', 'utf8')
  ))
  assert.match(source, /loadProjects:\s*async \(options = \{\}\) =>/)
  assert.match(source, /const quiet = options\?\.quiet === true/)
  assert.match(source, /if \(!quiet\) set\(\{ loadingProjects: true, error: '' \}\)/)
  assert.match(source, /setActiveThread:[\s\S]*loadProjects\(\{ quiet: true \}\)/)
  assert.match(source, /createThread:[\s\S]*loadProjects\(\{ quiet: true \}\)/)
})
