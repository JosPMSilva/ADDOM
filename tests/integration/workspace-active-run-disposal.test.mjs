import test from 'node:test'
import assert from 'node:assert/strict'

import {
  disposeWorkspaceScope,
  getWorkspaceDisposalImpact,
  settleWorkspaceScope,
} from '../../src/main/ipc-handlers/workspace-disposal-handler.mjs'
import { registerWorkspaceHandlers } from '../../src/main/ipc-handlers/workspace.mjs'
import {
  prepareWorkspaceDisposalIntent,
  resolveWorkspaceDisposalIntent,
} from '../../src/renderer/components/workspace/workspace-disposal-intent.mjs'
import { createChatRunRegistry } from '../../src/main/chat/chat-run-registry.mjs'

const PROJECT_A_RUN = {
  projectId: 'project-a',
  threadId: 'thread-a',
  turnId: 'turn-a',
  providerId: 'openai',
  model: 'gpt-5',
}

function createRegistry({ runs = [], settleResult = null } = {}) {
  const calls = []
  return {
    calls,
    list(filter) {
      calls.push(['list', filter])
      return runs.filter((run) => Object.entries(filter).every(([key, value]) => run[key] === value))
    },
    async cancelAndWait(filter, options) {
      calls.push(['cancelAndWait', filter, options])
      return settleResult || { ok: true, matched: runs.length, settled: runs.length, timedOut: 0, runs }
    },
  }
}

test('disposal impact reports only active runs inside the requested scope', () => {
  const registry = createRegistry({
    runs: [PROJECT_A_RUN, { ...PROJECT_A_RUN, projectId: 'project-b', threadId: 'thread-b' }],
  })

  assert.deepEqual(getWorkspaceDisposalImpact({
    runRegistry: registry,
    scope: 'project',
    projectId: 'project-a',
  }), {
    ok: true,
    requiresStop: true,
    activeRuns: [PROJECT_A_RUN],
  })
})

test('active work blocks mutation until stop is explicitly authorized', async () => {
  const registry = createRegistry({ runs: [PROJECT_A_RUN] })
  let mutationCalls = 0

  const result = await disposeWorkspaceScope({
    runRegistry: registry,
    scope: 'project',
    projectId: 'project-a',
    stopActive: false,
    mutate: async () => { mutationCalls += 1 },
  })

  assert.deepEqual(result, {
    ok: false,
    error: 'active_work_requires_stop',
    activeRuns: [PROJECT_A_RUN],
  })
  assert.equal(mutationCalls, 0)
  assert.equal(registry.calls.some(([name]) => name === 'cancelAndWait'), false)
})

test('authorized disposal awaits scoped settlement before mutation', async () => {
  const registry = createRegistry({
    runs: [PROJECT_A_RUN, { ...PROJECT_A_RUN, projectId: 'project-b', threadId: 'thread-b' }],
  })
  const order = []
  const originalCancelAndWait = registry.cancelAndWait
  registry.cancelAndWait = async (...args) => {
    order.push('cancel')
    const result = await originalCancelAndWait(...args)
    order.push('settled')
    return result
  }

  const result = await disposeWorkspaceScope({
    runRegistry: registry,
    scope: 'project',
    projectId: 'project-a',
    stopActive: true,
    mutate: async () => {
      order.push('mutate')
      return { ok: true, deletedProjectId: 'project-a' }
    },
  })

  assert.deepEqual(result, { ok: true, deletedProjectId: 'project-a' })
  assert.deepEqual(order, ['cancel', 'settled', 'mutate'])
  assert.deepEqual(registry.calls.find(([name]) => name === 'cancelAndWait')[1], { projectId: 'project-a' })
})

test('reversible workspace settlement stops scoped work without a mutation', async () => {
  const registry = createRegistry({
    runs: [PROJECT_A_RUN, { ...PROJECT_A_RUN, projectId: 'project-b', threadId: 'thread-b' }],
  })

  const result = await settleWorkspaceScope({
    runRegistry: registry,
    scope: 'project',
    projectId: 'project-a',
    stopActive: true,
  })

  assert.deepEqual(result, { ok: true, activeRuns: [PROJECT_A_RUN] })
  assert.deepEqual(registry.calls.find(([name]) => name === 'cancelAndWait')[1], { projectId: 'project-a' })
})

test('thread disposal settles only the owned run and leaves unrelated work active', async () => {
  const registry = createChatRunRegistry({ settleTimeoutMs: 250 })
  const ownedRun = registry.register({
    ...PROJECT_A_RUN,
    abortController: new AbortController(),
    loopKey: 'owned-loop',
  })
  const unrelatedRun = registry.register({
    ...PROJECT_A_RUN,
    abortController: new AbortController(),
    loopKey: 'unrelated-loop',
    projectId: 'project-b',
    threadId: 'thread-b',
  })
  ownedRun.abortController.signal.addEventListener('abort', () => {
    registry.settle(ownedRun.loopKey, ownedRun)
  }, { once: true })

  const result = await disposeWorkspaceScope({
    runRegistry: registry,
    scope: 'thread',
    threadId: ownedRun.threadId,
    stopActive: true,
    mutate: async () => ({ ok: true }),
  })

  assert.deepEqual(result, { ok: true })
  assert.equal(ownedRun.abortController.signal.aborted, true)
  assert.equal(unrelatedRun.abortController.signal.aborted, false)
  assert.deepEqual(registry.list().map((run) => run.loopKey), ['unrelated-loop'])
  registry.settle(unrelatedRun.loopKey, unrelatedRun)
})

test('settlement timeout preserves workspace data', async () => {
  const registry = createRegistry({
    runs: [PROJECT_A_RUN],
    settleResult: { ok: false, matched: 1, settled: 0, timedOut: 1, runs: [PROJECT_A_RUN] },
  })
  let mutationCalls = 0

  const result = await disposeWorkspaceScope({
    runRegistry: registry,
    scope: 'thread',
    threadId: 'thread-a',
    stopActive: true,
    mutate: async () => { mutationCalls += 1 },
  })

  assert.deepEqual(result, {
    ok: false,
    error: 'active_work_settlement_timeout',
    activeRuns: [PROJECT_A_RUN],
  })
  assert.equal(mutationCalls, 0)
})

test('workspace IPC exposes structured preflight and blocks cleanup before database mutation', async () => {
  const handlers = new Map()
  const disposed = []
  registerWorkspaceHandlers({
    ipcMainImpl: {
      handle(channel, listener) { handlers.set(channel, listener) },
    },
    runRegistry: createRegistry({ runs: [PROJECT_A_RUN] }),
    onThreadDisposed: (payload) => disposed.push(payload),
  })

  const impact = await handlers.get('v1:workspace:get-disposal-impact')({}, {
    scope: 'thread',
    threadId: 'thread-a',
  })
  const blocked = await handlers.get('v1:workspace:delete-thread')({}, {
    threadId: 'thread-a',
    stopActive: false,
  })

  assert.equal(impact.requiresStop, true)
  assert.deepEqual(blocked, {
    ok: false,
    error: 'active_work_requires_stop',
    activeRuns: [PROJECT_A_RUN],
  })
  assert.deepEqual(disposed, [])
})

test('workspace IPC exposes non-mutating active-work settlement for project archive', async () => {
  const handlers = new Map()
  const registry = createRegistry({ runs: [PROJECT_A_RUN] })
  registerWorkspaceHandlers({
    ipcMainImpl: {
      handle(channel, listener) { handlers.set(channel, listener) },
    },
    runRegistry: registry,
  })

  const result = await handlers.get('v1:workspace:stop-active-work')({}, {
    scope: 'project',
    projectId: 'project-a',
    stopActive: true,
  })

  assert.deepEqual(result, { ok: true, activeRuns: [PROJECT_A_RUN] })
  assert.equal(registry.calls.some(([name]) => name === 'cancelAndWait'), true)
})

test('workspace IPC exposes Remove from ADDOM and drops the obsolete delete-project channel', async () => {
  const handlers = new Map()
  registerWorkspaceHandlers({
    ipcMainImpl: {
      handle(channel, listener) { handlers.set(channel, listener) },
    },
    runRegistry: createRegistry({ runs: [PROJECT_A_RUN] }),
  })

  const blocked = await handlers.get('v1:workspace:remove-project')({}, {
    projectId: 'project-a',
    stopActive: false,
  })

  assert.equal(blocked.ok, false)
  assert.equal(blocked.error, 'active_work_requires_stop')
  assert.equal(handlers.has('v1:workspace:delete-project'), false)
})

test('renderer disposal intent switches to one focused stop action only when needed', async () => {
  assert.deepEqual(resolveWorkspaceDisposalIntent({
    action: 'delete-thread',
    scope: 'thread',
    threadId: 'thread-a',
    activeRuns: [PROJECT_A_RUN],
  }), {
    action: 'delete-thread',
    scope: 'thread',
    projectId: '',
    threadId: 'thread-a',
    stopActive: true,
    requiresStop: true,
    confirmLabel: 'Stop and delete',
    message: 'Active work in this thread will stop before deletion.',
  })

  const prepared = await prepareWorkspaceDisposalIntent({
    workspaceApi: {
      getDisposalImpact: async () => ({ ok: true, requiresStop: false, activeRuns: [] }),
    },
    action: 'remove-project',
    scope: 'project',
    projectId: 'project-a',
  })
  assert.equal(prepared.stopActive, false)
  assert.equal(prepared.confirmLabel, 'Remove')

  assert.equal(resolveWorkspaceDisposalIntent({
    action: 'remove-project',
    scope: 'project',
    projectId: 'project-a',
    activeRuns: [PROJECT_A_RUN],
  }).confirmLabel, 'Stop and remove')
})
