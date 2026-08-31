import assert from 'node:assert/strict'
import test from 'node:test'

import {
  hydrateAgentNodeTranscript,
  registerAgentRunEventBridge,
} from '../../src/renderer/components/chat/chat-event-bridge-agents.mjs'
import useAgentRunStore from '../../src/renderer/store/useAgentRunStore.js'

function snapshot(lastRunSequence = 0) {
  return {
    schemaVersion: 1,
    run: {
      id: 'run_01',
      projectId: 'project_01',
      threadId: 'thread_01',
      rootNodeId: 'node_root',
      status: 'running',
      lastRunSequence,
    },
    nodes: [{
      id: 'node_root',
      runId: 'run_01',
      parentNodeId: null,
      rootNodeId: 'node_root',
      roleLabel: 'Primary agent',
      taskSummary: 'Coordinate work',
      depth: 0,
      branchPath: ['node_root'],
      status: 'running',
      childCount: 0,
      resultSummary: 'Summary is available before transcript detail.',
      errorSummary: null,
    }],
    attempts: [],
    approvals: [],
    artifacts: [],
    workspaces: [],
    mergeQueue: [],
    lastRunSequence,
    nodeSequences: { node_root: lastRunSequence },
  }
}

function appStore() {
  let state = { activeProjectId: 'project_01', activeThreadId: 'thread_01' }
  const listeners = new Set()
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set(next) {
      const previous = state
      state = { ...state, ...next }
      for (const listener of listeners) listener(state, previous)
    },
  }
}

test('agent event bridge hydrates once and batches a 100-event burst into bounded store updates', async () => {
  useAgentRunStore.getState().reset()
  let liveCallback = null
  let getCalls = 0
  const api = {
    async list() {
      return { runs: [{ id: 'run_01' }] }
    },
    async get() {
      getCalls += 1
      return snapshot(getCalls === 1 ? 0 : 100)
    },
    async subscribe(_scope, callback) {
      liveCallback = callback
      return async () => {}
    },
  }
  const app = appStore()
  const cleanup = registerAgentRunEventBridge({
    agentRunsApi: api,
    useAppStore: app,
    useAgentRunStore,
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(getCalls, 1)
  assert.equal(typeof liveCallback, 'function')

  let notifications = 0
  const unsubscribeStore = useAgentRunStore.subscribe(() => {
    notifications += 1
  })
  for (let sequence = 1; sequence <= 100; sequence += 1) {
    liveCallback({
      eventId: `event_${sequence}`,
      runId: 'run_01',
      nodeId: 'node_root',
      runSequence: sequence,
      nodeSequence: sequence,
      kind: 'agent_commentary_delta',
      payload: { delta: `chunk ${sequence}` },
      createdAt: sequence,
    })
  }
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(useAgentRunStore.getState().lastSequenceByRun.run_01, 100)
  assert.equal(notifications, 1)
  unsubscribeStore()
  cleanup()
})

test('agent event bridge reconciles a sequence gap from an authoritative snapshot', async () => {
  useAgentRunStore.getState().reset()
  useAgentRunStore.getState().hydrateRun(snapshot(10))
  let getCalls = 0
  let liveCallback = null
  const api = {
    async list() {
      return { runs: [{ id: 'run_01' }] }
    },
    async get() {
      getCalls += 1
      return snapshot(getCalls === 1 ? 10 : 13)
    },
    async subscribe(_scope, callback) {
      liveCallback = callback
      return async () => {}
    },
  }
  const cleanup = registerAgentRunEventBridge({
    agentRunsApi: api,
    useAppStore: appStore(),
    useAgentRunStore,
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  liveCallback({
    eventId: 'event_13',
    runId: 'run_01',
    nodeId: 'node_root',
    runSequence: 13,
    nodeSequence: 13,
    kind: 'agent_commentary_delta',
    payload: { delta: 'after gap' },
    createdAt: 13,
  })
  await new Promise((resolve) => setTimeout(resolve, 0))

  const state = useAgentRunStore.getState()
  assert.equal(getCalls, 2)
  assert.equal(state.lastSequenceByRun.run_01, 13)
  assert.equal(state.gapByRun.run_01, undefined)
  cleanup()
})

test('transcript hydration publishes node summary before requesting the first detail page', async () => {
  useAgentRunStore.getState().reset()
  const order = []
  await hydrateAgentNodeTranscript({
    agentRunsApi: {
      async get() {
        order.push('snapshot')
        return snapshot(2)
      },
      async getTranscriptPage() {
        order.push('transcript')
        return {
          items: [{ id: 'segment_1', content: 'Detailed transcript' }],
          hasMore: false,
          nextCursor: null,
        }
      },
    },
    scope: {
      projectId: 'project_01',
      threadId: 'thread_01',
      runId: 'run_01',
      nodeId: 'node_root',
    },
    useAgentRunStore,
    onSummary(summary) {
      order.push(`summary:${summary.resultSummary}`)
    },
  })

  assert.deepEqual(order, [
    'snapshot',
    'summary:Summary is available before transcript detail.',
    'transcript',
  ])
  assert.deepEqual(
    useAgentRunStore.getState().transcriptByNode['run_01:node_root'].itemIds,
    ['segment_1'],
  )
})

test('node transcript hydration keeps a bounded detail window', () => {
  useAgentRunStore.getState().reset()
  useAgentRunStore.getState().hydrateRun(snapshot(600))
  useAgentRunStore.getState().applyTranscriptPage({
    runId: 'run_01',
    nodeId: 'node_root',
    items: Array.from({ length: 600 }, (_, index) => ({
      id: `segment_${index + 1}`,
      nodeSequence: index + 1,
      content: `chunk ${index + 1}`,
    })),
    hasMore: false,
    nextCursor: null,
  })

  const transcript = useAgentRunStore.getState().transcriptByNode['run_01:node_root']
  assert.equal(transcript.itemIds.length, 500)
  assert.equal(transcript.itemIds[0], 'segment_101')
  assert.equal(Object.keys(transcript.itemsById).length, 500)
})

test('agent event bridge never lists with blank projectId or threadId across boot and transitions', async () => {
  useAgentRunStore.getState().reset()
  const listScopes = []
  const app = appStore()
  app.set({ activeProjectId: null, activeThreadId: null })
  const api = {
    async list(scope) {
      listScopes.push({
        projectId: String(scope?.projectId || ''),
        threadId: String(scope?.threadId || ''),
      })
      return { runs: [] }
    },
    async get() {
      return snapshot(0)
    },
    async subscribe() {
      return async () => {}
    },
  }
  const cleanup = registerAgentRunEventBridge({
    agentRunsApi: api,
    useAppStore: app,
    useAgentRunStore,
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  app.set({ activeProjectId: 'project_01', activeThreadId: null })
  await new Promise((resolve) => setTimeout(resolve, 0))
  app.set({ activeProjectId: 'project_01', activeThreadId: 'thread_01' })
  await new Promise((resolve) => setTimeout(resolve, 0))
  app.set({ activeProjectId: null, activeThreadId: null })
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.ok(listScopes.length >= 1)
  for (const scope of listScopes) {
    assert.ok(scope.projectId, `list called with blank projectId: ${JSON.stringify(scope)}`)
    assert.ok(scope.threadId, `list called with blank threadId: ${JSON.stringify(scope)}`)
  }
  assert.deepEqual(listScopes.at(-1), { projectId: 'project_01', threadId: 'thread_01' })
  cleanup()
})

test('agent event bridge keeps list/get/subscribe on a frozen scope when activate overlaps', async () => {
  useAgentRunStore.getState().reset()
  let releaseList = null
  const listWait = new Promise((resolve) => {
    releaseList = resolve
  })
  const listScopes = []
  const getScopes = []
  const subscribeScopes = []
  const app = appStore()
  const api = {
    async list(scope) {
      listScopes.push({
        projectId: String(scope?.projectId || ''),
        threadId: String(scope?.threadId || ''),
      })
      await listWait
      return { runs: [{ id: 'run_01' }] }
    },
    async get(scope) {
      getScopes.push({
        projectId: String(scope?.projectId || ''),
        threadId: String(scope?.threadId || ''),
        runId: String(scope?.runId || ''),
      })
      return snapshot(1)
    },
    async subscribe(scope) {
      subscribeScopes.push({
        projectId: String(scope?.projectId || ''),
        threadId: String(scope?.threadId || ''),
      })
      return async () => {}
    },
  }
  const cleanup = registerAgentRunEventBridge({
    agentRunsApi: api,
    useAppStore: app,
    useAgentRunStore,
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(listScopes.length, 1)

  app.set({ activeProjectId: '', activeThreadId: '' })
  await new Promise((resolve) => setTimeout(resolve, 0))
  releaseList()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))

  for (const scope of listScopes) {
    assert.equal(scope.projectId, 'project_01')
    assert.equal(scope.threadId, 'thread_01')
  }
  // Superseded activate must abort after list — never follow up with blank get/subscribe.
  for (const scope of [...getScopes, ...subscribeScopes]) {
    assert.equal(scope.projectId, 'project_01')
    assert.equal(scope.threadId, 'thread_01')
  }
  assert.equal(getScopes.length, 0)
  assert.equal(subscribeScopes.length, 0)
  cleanup()
})

test('agent event bridge reconcile uses a frozen scope and skips blank or drifted scopes', async () => {
  useAgentRunStore.getState().reset()
  useAgentRunStore.getState().hydrateRun(snapshot(10))
  let releaseGet = null
  const getWait = new Promise((resolve) => {
    releaseGet = resolve
  })
  const getScopes = []
  let liveCallback = null
  const app = appStore()
  const api = {
    async list() {
      return { runs: [{ id: 'run_01' }] }
    },
    async get(scope) {
      getScopes.push({
        projectId: String(scope?.projectId || ''),
        threadId: String(scope?.threadId || ''),
        runId: String(scope?.runId || ''),
      })
      if (getScopes.length === 1) return snapshot(10)
      await getWait
      return snapshot(13)
    },
    async subscribe(_scope, callback) {
      liveCallback = callback
      return async () => {}
    },
  }
  const cleanup = registerAgentRunEventBridge({
    agentRunsApi: api,
    useAppStore: app,
    useAgentRunStore,
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  liveCallback({
    eventId: 'event_13',
    runId: 'run_01',
    nodeId: 'node_root',
    runSequence: 13,
    nodeSequence: 13,
    kind: 'agent_commentary_delta',
    payload: { delta: 'after gap' },
    createdAt: 13,
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(getScopes.length, 2)

  app.set({ activeProjectId: '', activeThreadId: '' })
  await new Promise((resolve) => setTimeout(resolve, 0))
  releaseGet()
  await new Promise((resolve) => setTimeout(resolve, 0))

  for (const scope of getScopes) {
    assert.equal(scope.projectId, 'project_01')
    assert.equal(scope.threadId, 'thread_01')
  }
  assert.equal(useAgentRunStore.getState().lastSequenceByRun.run_01, 10)
  cleanup()
})
