import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

import { registerChatCancelHandler } from '../../src/main/chat/chat-cancel-handler.mjs'
import { createChatRunRegistry } from '../../src/main/chat/chat-run-registry.mjs'

function createIpcMainMock() {
  const emitter = new EventEmitter()
  return {
    on(channel, handler) {
      emitter.on(channel, handler)
    },
    emit(channel, event, payload) {
      emitter.emit(channel, event, payload)
    },
  }
}

function createSender(id, { destroyed = false } = {}) {
  const sent = []
  return {
    id,
    send(channel, payload) {
      sent.push({ channel, payload })
    },
    isDestroyed() {
      return destroyed
    },
    sent,
  }
}

function registerLoop(runRegistry, sender, loop) {
  return runRegistry.register({
    cancelled: false,
    cancelReason: '',
    cancellationSent: false,
    cancellationLogged: false,
    windowId: String(sender.id),
    loopKey: `${sender.id}:${loop.threadId}`,
    ...loop,
  })
}

test('chat cancel aborts the active loop, emits cancellation events, and appends timeline markers', () => {
  const ipcMain = createIpcMainMock()
  const runRegistry = createChatRunRegistry({ settleTimeoutMs: 1 })
  const appendCalls = []
  let abortCount = 0
  const sender = createSender(42)

  registerChatCancelHandler({
    ipcMain,
    runRegistry,
    appendEvent: (threadId, event) => appendCalls.push({ threadId, event }),
  })

  const loop = registerLoop(runRegistry, sender, {
    abortController: { abort: () => { abortCount += 1 } },
    threadId: 'thread-1',
    turnId: 'turn-1',
  })

  ipcMain.emit('v1:chat:cancel', { sender })

  assert.equal(loop.cancelled, true)
  assert.equal(loop.cancelReason, 'Stop requested. Stopping after current action.')
  assert.equal(loop.cancellationSent, true)
  assert.equal(loop.cancellationLogged, true)
  assert.equal(abortCount, 1)
  assert.deepEqual(sender.sent.map((row) => row.channel), ['v1:chat:cancelled', 'v1:chat:turn-state'])
  assert.equal(appendCalls.length, 2)
  assert.equal(appendCalls[0].threadId, 'thread-1')
  assert.equal(appendCalls[0].event.kind, 'turn_cancelled')
  assert.equal(appendCalls[1].event.kind, 'chat_cancelled')
})

test('chat cancel is a no-op when no active loop exists for the sender', () => {
  const ipcMain = createIpcMainMock()
  const runRegistry = createChatRunRegistry({ settleTimeoutMs: 1 })
  const sender = createSender(77)
  let appendCount = 0

  registerChatCancelHandler({
    ipcMain,
    runRegistry,
    appendEvent: () => { appendCount += 1 },
  })

  ipcMain.emit('v1:chat:cancel', { sender })

  assert.equal(sender.sent.length, 0)
  assert.equal(appendCount, 0)
})

test('chat cancel finalizes stale restored turns when no active loop exists', () => {
  const ipcMain = createIpcMainMock()
  const runRegistry = createChatRunRegistry({ settleTimeoutMs: 1 })
  const sender = createSender(78)
  const appendCalls = []

  registerChatCancelHandler({
    ipcMain,
    runRegistry,
    appendEvent: (threadId, event) => appendCalls.push({ threadId, event }),
  })

  ipcMain.emit('v1:chat:cancel', { sender }, {
    threadId: 'thread-stale',
    turnId: 'turn-stale',
  })

  assert.deepEqual(sender.sent.map((row) => row.channel), ['v1:chat:cancelled', 'v1:chat:turn-state'])
  assert.equal(sender.sent[0].payload.threadId, 'thread-stale')
  assert.equal(sender.sent[0].payload.turnId, 'turn-stale')
  assert.equal(sender.sent[1].payload.state, 'cancelled')
  assert.equal(appendCalls.length, 2)
  assert.equal(appendCalls[0].threadId, 'thread-stale')
  assert.equal(appendCalls[0].event.kind, 'turn_cancelled')
  assert.equal(appendCalls[0].event.turnId, 'turn-stale')
  assert.equal(appendCalls[1].event.kind, 'chat_cancelled')
})

test('chat cancel does not duplicate notifications or timeline events on repeated cancel requests', () => {
  const ipcMain = createIpcMainMock()
  const runRegistry = createChatRunRegistry({ settleTimeoutMs: 1 })
  const appendCalls = []
  const sender = createSender(91)

  registerChatCancelHandler({
    ipcMain,
    runRegistry,
    appendEvent: (threadId, event) => appendCalls.push({ threadId, event }),
  })

  registerLoop(runRegistry, sender, {
    abortController: { abort: () => {} },
    threadId: 'thread-repeat',
    turnId: 'turn-repeat',
  })

  ipcMain.emit('v1:chat:cancel', { sender })
  ipcMain.emit('v1:chat:cancel', { sender })

  assert.equal(sender.sent.length, 2)
  assert.equal(appendCalls.length, 2)
  assert.equal(appendCalls[0].event.kind, 'turn_cancelled')
  assert.equal(appendCalls[1].event.kind, 'chat_cancelled')
})

test('chat cancel still records timeline cancellation when the sender is already destroyed', () => {
  const ipcMain = createIpcMainMock()
  const runRegistry = createChatRunRegistry({ settleTimeoutMs: 1 })
  const appendCalls = []
  let abortCount = 0
  const sender = createSender(123, { destroyed: true })

  registerChatCancelHandler({
    ipcMain,
    runRegistry,
    appendEvent: (threadId, event) => appendCalls.push({ threadId, event }),
  })

  const loop = registerLoop(runRegistry, sender, {
    abortController: { abort: () => { abortCount += 1 } },
    threadId: 'thread-dead-sender',
    turnId: 'turn-dead-sender',
  })

  ipcMain.emit('v1:chat:cancel', { sender })

  assert.equal(loop.cancelled, true)
  assert.equal(loop.cancellationSent, false)
  assert.equal(loop.cancellationLogged, true)
  assert.equal(abortCount, 1)
  assert.equal(sender.sent.length, 0)
  assert.equal(appendCalls.length, 2)
})

test('chat cancel annotates write-intent turns that were stopped before any file changes landed', () => {
  const ipcMain = createIpcMainMock()
  const runRegistry = createChatRunRegistry({ settleTimeoutMs: 1 })
  const appendCalls = []
  const sender = createSender(222)

  registerChatCancelHandler({
    ipcMain,
    runRegistry,
    appendEvent: (threadId, event) => appendCalls.push({ threadId, event }),
  })

  registerLoop(runRegistry, sender, {
    abortController: { abort: () => {} },
    threadId: 'thread-no-write',
    turnId: 'turn-no-write',
    errorDiagnostics: {
      mode: 'execute',
      toolCallCount: 2,
      toolWorkflowWriteIntentDetected: true,
      toolWorkflowSuccessfulMutationCount: 0,
    },
  })

  ipcMain.emit('v1:chat:cancel', { sender })

  const turnStatePayload = sender.sent.find((row) => row.channel === 'v1:chat:turn-state')?.payload
  assert.match(String(turnStatePayload?.reason || ''), /^Stop requested\. Stopping after current action\./)
  assert.match(String(turnStatePayload?.reason || ''), /No file changes were applied before the turn was stopped\./)
  assert.equal(turnStatePayload?.writeIntentWithoutMutation, true)
  assert.equal(
    appendCalls[0]?.event?.meta?.recoveryNote,
    'No file changes were applied before the turn was stopped.',
  )
})
