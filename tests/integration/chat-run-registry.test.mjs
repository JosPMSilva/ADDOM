import test from 'node:test'
import assert from 'node:assert/strict'

import { createChatRunRegistry } from '../../src/main/chat/chat-run-registry.mjs'
import { createLoopState } from '../../src/main/chat/chat-turn-state.mjs'

function createRun({
  loopKey,
  projectId,
  threadId,
  turnId,
  providerId = 'openai',
  model = 'gpt-5',
} = {}) {
  return createLoopState({
    activeProjectId: projectId,
    activeThreadId: threadId,
    activeTurnId: turnId,
    windowId: '1',
    loopKey,
    providerId,
    model,
    permissionMode: 'ask',
    abortController: new AbortController(),
  })
}

test('chat run registry keeps different thread owners active at the same time', () => {
  const registry = createChatRunRegistry()
  const runA = createRun({
    loopKey: '1:thread-a',
    projectId: 'project-a',
    threadId: 'thread-a',
    turnId: 'turn-a',
  })
  const runB = createRun({
    loopKey: '1:thread-b',
    projectId: 'project-b',
    threadId: 'thread-b',
    turnId: 'turn-b',
    providerId: 'anthropic',
    model: 'claude-sonnet-4-5',
  })

  registry.register(runA)
  registry.register(runB)

  assert.deepEqual(registry.list(), [
    {
      loopKey: '1:thread-a',
      windowId: '1',
      projectId: 'project-a',
      threadId: 'thread-a',
      turnId: 'turn-a',
      providerId: 'openai',
      model: 'gpt-5',
      permissionMode: 'ask',
    },
    {
      loopKey: '1:thread-b',
      windowId: '1',
      projectId: 'project-b',
      threadId: 'thread-b',
      turnId: 'turn-b',
      providerId: 'anthropic',
      model: 'claude-sonnet-4-5',
      permissionMode: 'ask',
    },
  ])
  assert.equal(runA.abortController.signal.aborted, false)
  assert.equal(runB.abortController.signal.aborted, false)
})

test('registering a newer run only replaces the same loop key', () => {
  const registry = createChatRunRegistry()
  const oldA = createRun({
    loopKey: '1:thread-a',
    projectId: 'project-a',
    threadId: 'thread-a',
    turnId: 'turn-a-old',
  })
  const runB = createRun({
    loopKey: '1:thread-b',
    projectId: 'project-b',
    threadId: 'thread-b',
    turnId: 'turn-b',
  })
  const newA = createRun({
    loopKey: '1:thread-a',
    projectId: 'project-a',
    threadId: 'thread-a',
    turnId: 'turn-a-new',
  })

  registry.register(oldA)
  registry.register(runB)
  registry.register(newA)

  assert.equal(oldA.cancelled, true)
  assert.equal(oldA.abortController.signal.aborted, true)
  assert.equal(runB.cancelled, false)
  assert.equal(runB.abortController.signal.aborted, false)
  assert.deepEqual(registry.list().map((run) => run.turnId), ['turn-a-new', 'turn-b'])
})

test('targeted cancellation waits for the matched run and leaves other runs active', async () => {
  const registry = createChatRunRegistry({ settleTimeoutMs: 100 })
  const runA = createRun({
    loopKey: '1:thread-a',
    projectId: 'project-a',
    threadId: 'thread-a',
    turnId: 'turn-a',
  })
  const runB = createRun({
    loopKey: '1:thread-b',
    projectId: 'project-b',
    threadId: 'thread-b',
    turnId: 'turn-b',
  })
  registry.register(runA)
  registry.register(runB)

  const cancellation = registry.cancelAndWait(
    { projectId: 'project-b', threadId: 'thread-b' },
    { reason: 'Stopped for test.' },
  )
  assert.equal(runA.abortController.signal.aborted, false)
  assert.equal(runB.abortController.signal.aborted, true)

  registry.settle(runB.loopKey, runB)
  const result = await cancellation

  assert.equal(result.ok, true)
  assert.equal(result.matched, 1)
  assert.equal(result.settled, 1)
  assert.equal(result.timedOut, 0)
  assert.deepEqual(registry.list().map((run) => run.threadId), ['thread-a'])
})

test('settling an older replaced run never removes its replacement', async () => {
  const registry = createChatRunRegistry()
  const oldRun = createRun({
    loopKey: '1:thread-a',
    projectId: 'project-a',
    threadId: 'thread-a',
    turnId: 'turn-old',
  })
  const replacement = createRun({
    loopKey: '1:thread-a',
    projectId: 'project-a',
    threadId: 'thread-a',
    turnId: 'turn-new',
  })
  registry.register(oldRun)
  registry.register(replacement)

  registry.settle(oldRun.loopKey, oldRun)

  assert.deepEqual(registry.list().map((run) => run.turnId), ['turn-new'])
  assert.equal(await oldRun.settledPromise, undefined)
})
