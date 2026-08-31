import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

const { registerMemoryHandlers } = await import('../../src/main/ipc-handlers/memory.mjs')

function createIpcMainHarness() {
  const handlers = new Map()
  return {
    ipcMain: {
      handle(channel, listener) {
        handlers.set(String(channel), listener)
      },
    },
    async invoke(channel, event = {}, payload) {
      const handler = handlers.get(String(channel))
      if (!handler) throw new Error(`No handler registered for ${channel}`)
      return handler(event, payload)
    },
  }
}

function createMemoryStoreStub() {
  const calls = []
  return {
    calls,
    listNodes(project, options = {}) {
      calls.push({ method: 'listNodes', project, options })
      return [{ id: 'node_list', project, scope: options.scopeFilter || 'project' }]
    },
    async searchNodes(project, query, options = {}) {
      calls.push({ method: 'searchNodes', project, query, options })
      return [{ id: 'node_search', project, query, scope: options.scopeFilter || 'project' }]
    },
    async addNode(payload = {}) {
      calls.push({ method: 'addNode', payload })
      return 'node_added'
    },
    promoteNode(id, options = {}) {
      calls.push({ method: 'promoteNode', id, options })
      return { id, scope: options.targetScope || 'project' }
    },
    demoteNode(id, options = {}) {
      calls.push({ method: 'demoteNode', id, options })
      return { id, scope: options.targetScope || 'thread' }
    },
    invalidateNode(id, options = {}) {
      calls.push({ method: 'invalidateNode', id, options })
      return { id, invalidatedAt: 1234, supersededBy: options.supersededBy || null }
    },
    updateNode() {},
    deleteNode() { return true },
    clearNodes() { return 0 },
  }
}

test('memory IPC forwards scoped list, search, and add payloads to the store contract', async () => {
  const harness = createIpcMainHarness()
  const storeImpl = createMemoryStoreStub()
  const embedderImpl = new EventEmitter()
  embedderImpl.isReady = true

  registerMemoryHandlers(() => null, {
    ipcMainImpl: harness.ipcMain,
    dialogImpl: { showSaveDialog: async () => ({ canceled: true }) },
    storeImpl,
    embedderImpl,
  })

  const listed = await harness.invoke('v1:memory:list', {}, {
    project: 'project-ipc',
    includeCompressed: true,
    includeDeletedThreads: true,
    includeGlobal: true,
    includeProject: false,
    scope: 'thread',
    threadId: 'thread-ipc',
  })
  const searched = await harness.invoke('v1:memory:search', {}, {
    project: 'project-ipc',
    query: 'thread note',
    topK: 5,
    threshold: 0.7,
    includeCompressed: true,
    includeDeletedThreads: true,
    includeGlobal: true,
    includeProject: false,
    threadId: 'thread-ipc',
  })
  const added = await harness.invoke('v1:memory:add', {}, {
    project: 'project-ipc',
    topic: 'Thread note',
    content: 'Only for this thread',
    scope: 'thread',
    threadId: 'thread-ipc',
    originThreadId: 'thread-ipc',
    durability: 'ephemeral',
    confidence: 0.9,
  })

  assert.deepEqual(listed, [{ id: 'node_list', project: 'project-ipc', scope: 'thread' }])
  assert.deepEqual(searched, [{ id: 'node_search', project: 'project-ipc', query: 'thread note', scope: 'project' }])
  assert.deepEqual(added, { id: 'node_added' })

  assert.deepEqual(storeImpl.calls[0], {
    method: 'listNodes',
    project: 'project-ipc',
    options: {
      includeCompressed: true,
      includeDeletedThreads: true,
      includeGlobal: true,
      includeProject: false,
      globalOnly: false,
      scopeFilter: 'thread',
      threadId: 'thread-ipc',
    },
  })
  assert.deepEqual(storeImpl.calls[1], {
    method: 'searchNodes',
    project: 'project-ipc',
    query: 'thread note',
    options: {
      topK: 5,
      threshold: 0.7,
      includeCompressed: true,
      includeDeletedThreads: true,
      includeGlobal: true,
      includeThread: true,
      includeProject: false,
      scopeFilter: '',
      threadId: 'thread-ipc',
    },
  })
  assert.deepEqual(storeImpl.calls[2], {
    method: 'addNode',
    payload: {
      project: 'project-ipc',
      topic: 'Thread note',
      content: 'Only for this thread',
      scope: 'thread',
      threadId: 'thread-ipc',
      originThreadId: 'thread-ipc',
      durability: 'ephemeral',
      confidence: 0.9,
      isGlobal: false,
    },
  })
})

test('memory IPC exposes promote, demote, and invalidate mutations', async () => {
  const harness = createIpcMainHarness()
  const storeImpl = createMemoryStoreStub()
  const embedderImpl = new EventEmitter()
  embedderImpl.isReady = true

  registerMemoryHandlers(() => null, {
    ipcMainImpl: harness.ipcMain,
    dialogImpl: { showSaveDialog: async () => ({ canceled: true }) },
    storeImpl,
    embedderImpl,
  })

  const promoted = await harness.invoke('v1:memory:promote', {}, {
    id: 'node-1',
    targetScope: 'project',
    project: 'project-ipc',
    threadId: 'thread-ipc',
    originThreadId: 'thread-origin',
  })
  const demoted = await harness.invoke('v1:memory:demote', {}, {
    id: 'node-2',
    targetScope: 'thread',
    project: 'project-ipc',
    threadId: 'thread-ipc',
  })
  const invalidated = await harness.invoke('v1:memory:invalidate', {}, {
    id: 'node-3',
    supersededBy: 'node-4',
  })

  assert.deepEqual(promoted, {
    ok: true,
    node: { id: 'node-1', scope: 'project' },
  })
  assert.deepEqual(demoted, {
    ok: true,
    node: { id: 'node-2', scope: 'thread' },
  })
  assert.deepEqual(invalidated, {
    ok: true,
    node: { id: 'node-3', invalidatedAt: 1234, supersededBy: 'node-4' },
  })

  assert.deepEqual(storeImpl.calls[0], {
    method: 'promoteNode',
    id: 'node-1',
    options: {
      targetScope: 'project',
      project: 'project-ipc',
      threadId: 'thread-ipc',
      originThreadId: 'thread-origin',
    },
  })
  assert.deepEqual(storeImpl.calls[1], {
    method: 'demoteNode',
    id: 'node-2',
    options: {
      targetScope: 'thread',
      project: 'project-ipc',
      threadId: 'thread-ipc',
      originThreadId: undefined,
    },
  })
  assert.deepEqual(storeImpl.calls[2], {
    method: 'invalidateNode',
    id: 'node-3',
    options: {
      supersededBy: 'node-4',
    },
  })
})
