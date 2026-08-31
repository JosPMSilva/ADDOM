import test from 'node:test'
import assert from 'node:assert/strict'

const memoryCalls = []

global.window = {
  addom: {
    memory: {
      async list(project, options = {}) {
        memoryCalls.push({ method: 'list', project, options })
        return []
      },
      async search(project, query, options = {}) {
        memoryCalls.push({ method: 'search', project, query, options })
        return []
      },
      async add(payload = {}) {
        memoryCalls.push({ method: 'add', payload })
        return { id: 'memory-added-1' }
      },
      async update(id, fields = {}) {
        memoryCalls.push({ method: 'update', id, fields })
        return { ok: true }
      },
      async delete(id, force = false) {
        memoryCalls.push({ method: 'delete', id, force })
        return { ok: true }
      },
      async pin(id, pinned) {
        memoryCalls.push({ method: 'pin', id, pinned })
        return { ok: true }
      },
      async promote(payload = {}) {
        memoryCalls.push({ method: 'promote', payload })
        return { ok: true, node: { id: payload.id, scope: payload.targetScope } }
      },
      async demote(payload = {}) {
        memoryCalls.push({ method: 'demote', payload })
        return { ok: true, node: { id: payload.id, scope: payload.targetScope } }
      },
      async invalidate(payload = {}) {
        memoryCalls.push({ method: 'invalidate', payload })
        return { ok: true, node: { id: payload.id, invalidatedAt: 1700000000000 } }
      },
      async embedderStatus() {
        return { ready: true }
      },
    },
  },
}

const { default: useMemoryStore } = await import('../../src/renderer/store/useMemoryStore.js')

function resetMemoryStore() {
  useMemoryStore.setState({
    nodes: [],
    loading: false,
    nodesProjectFolder: '',
    activeThreadId: '',
    activeScopeFilter: 'current_thread',
    loadError: '',
    includeCompressed: false,
    includeDeletedThreads: false,
    includeGlobal: false,
    lastCompressionEvent: null,
    searchQuery: '',
    searchResults: null,
    searching: false,
    embedderReady: false,
    embedderProgress: 0,
    embedderState: 'idle',
    editingNode: null,
  })
}

test.beforeEach(() => {
  memoryCalls.length = 0
  resetMemoryStore()
})

test.after(() => {
  delete global.window
})

test('useMemoryStore keeps current-thread scope as the default scoped list request', async () => {
  const store = useMemoryStore.getState()

  await store.loadNodes('project-scope-ui', { threadId: 'thread-scope-ui-1' })

  assert.equal(useMemoryStore.getState().activeScopeFilter, 'current_thread')
  assert.equal(useMemoryStore.getState().activeThreadId, 'thread-scope-ui-1')
  assert.deepEqual(memoryCalls[0], {
    method: 'list',
    project: 'project-scope-ui',
    options: {
      includeCompressed: false,
      includeDeletedThreads: false,
      includeGlobal: false,
      includeProject: false,
      scope: 'thread',
      threadId: 'thread-scope-ui-1',
    },
  })
})

test('useMemoryStore applies scope filters to search and scope mutation refreshes', async () => {
  const store = useMemoryStore.getState()

  store.setActiveScopeFilter('all')
  await store.search('project-scope-ui', 'memory search', { threadId: 'thread-scope-ui-2' })

  assert.deepEqual(memoryCalls[0], {
    method: 'search',
    project: 'project-scope-ui',
    query: 'memory search',
    options: {
      topK: 20,
      includeCompressed: false,
      includeDeletedThreads: false,
      includeGlobal: true,
      includeProject: true,
      scope: '',
      threadId: 'thread-scope-ui-2',
    },
  })

  memoryCalls.length = 0
  resetMemoryStore()
  useMemoryStore.getState().setActiveScopeFilter('project')
  useMemoryStore.setState({ activeThreadId: 'thread-scope-ui-2' })

  await useMemoryStore.getState().makeNodeGlobal('project-scope-ui', 'node-scope-ui-9', {
    originThreadId: 'thread-scope-ui-2',
  })

  assert.deepEqual(memoryCalls[0], {
    method: 'promote',
    payload: {
      id: 'node-scope-ui-9',
      targetScope: 'global',
      project: 'project-scope-ui',
      threadId: 'thread-scope-ui-2',
      originThreadId: 'thread-scope-ui-2',
    },
  })
  assert.deepEqual(memoryCalls[1], {
    method: 'list',
    project: 'project-scope-ui',
    options: {
      includeCompressed: false,
      includeDeletedThreads: false,
      includeGlobal: false,
      includeProject: true,
      scope: 'project',
      threadId: '',
    },
  })
})

test('Show archived requests compressed and deleted-thread Memory through distinct flags', async () => {
  const store = useMemoryStore.getState()

  store.setIncludeCompressed(true)
  await store.loadNodes('project-scope-ui', { threadId: 'thread-scope-ui-1' })

  assert.deepEqual(memoryCalls[0], {
    method: 'list',
    project: 'project-scope-ui',
    options: {
      includeCompressed: true,
      includeDeletedThreads: true,
      includeGlobal: false,
      includeProject: false,
      scope: 'thread',
      threadId: 'thread-scope-ui-1',
    },
  })
})
