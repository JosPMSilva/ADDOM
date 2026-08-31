import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

import {
  createRequestApprovalHandler,
  getApprovalTimeoutMs,
} from '../../src/main/chat/approval-flow.mjs'

function createIpcMainMock() {
  const emitter = new EventEmitter()
  return {
    on(channel, handler) {
      emitter.on(channel, handler)
    },
    removeListener(channel, handler) {
      emitter.removeListener(channel, handler)
    },
    emit(channel, event, payload) {
      emitter.emit(channel, event, payload)
    },
  }
}

function createSender(id) {
  const sender = new EventEmitter()
  sender.id = id
  sender.sent = []
  sender.send = (channel, payload) => {
    sender.sent.push({ channel, payload })
  }
  return sender
}

function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve))
}

function installFakeTimers() {
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  const scheduled = new Map()
  let nextId = 1

  globalThis.setTimeout = (callback, delay = 0, ...args) => {
    const id = nextId++
    scheduled.set(id, {
      callback,
      delay: Number(delay || 0) || 0,
      args,
    })
    return id
  }

  globalThis.clearTimeout = (id) => {
    scheduled.delete(id)
  }

  return {
    runAll() {
      const entries = [...scheduled.entries()].sort((a, b) => a[1].delay - b[1].delay)
      for (const [id, job] of entries) {
        if (!scheduled.has(id)) continue
        scheduled.delete(id)
        job.callback(...job.args)
      }
    },
    restore() {
      globalThis.setTimeout = originalSetTimeout
      globalThis.clearTimeout = originalClearTimeout
      scheduled.clear()
    },
  }
}

test('requestApproval resolves approved responses and preserves approval metadata', async () => {
  const ipcMainMock = createIpcMainMock()
  const lifecycle = []
  const requestApproval = createRequestApprovalHandler({
    ipcMainRef: ipcMainMock,
    getToolMetaFn: () => ({ label: 'Run Command' }),
    sendVersionedFn: (sender, channel, payload) => {
      sender.send(channel, payload)
    },
    toVersionedChannelFn: (channel) => `v1:${channel}`,
  })

  const sender = createSender(7)
  const approvalPromise = requestApproval(
    sender,
    'approval_ok',
    'run_command',
    { command: 'echo ok' },
    process.cwd(),
    null,
    null,
    (phase, payload) => lifecycle.push({ phase, payload }),
    { policyDecision: 'prompt' },
  )

  assert.equal(sender.sent.length, 1)
  assert.equal(sender.sent[0].channel, 'tool:approval-request')
  assert.equal(sender.sent[0].payload.approvalId, 'approval_ok')
  assert.equal(sender.sent[0].payload.responseChannel, 'tool:approval-response:approval_ok')
  assert.equal(lifecycle.length, 1)
  assert.equal(lifecycle[0].phase, 'start')

  ipcMainMock.emit('v1:tool:approval-response:approval_ok', { sender }, {
    decision: 'approved',
    approvalMeta: { trusted: true },
  })

  const outcome = await approvalPromise
  assert.deepEqual(outcome, {
    decision: 'approved',
    denyReason: '',
    approvalMeta: { trusted: true },
  })
})

test('requestApproval forwards thread scope and account-native file review payload fields', async () => {
  const ipcMainMock = createIpcMainMock()
  const requestApproval = createRequestApprovalHandler({
    ipcMainRef: ipcMainMock,
    getToolMetaFn: () => ({ label: 'Review File Changes' }),
    sendVersionedFn: (sender, channel, payload) => {
      sender.send(channel, payload)
    },
    toVersionedChannelFn: (channel) => `v1:${channel}`,
  })

  const sender = createSender(27)
  const approvalPromise = requestApproval(
    sender,
    'approval_file_change',
    'file_change',
    {
      grantRoot: 'C:\\repo',
      changes: [{ path: 'C:\\repo\\src\\app.mjs', kind: 'modify', diff: '@@ -1 +1 @@' }],
    },
    'C:\\repo',
    null,
    null,
    () => {},
    {
      threadId: 'thread_approval_scope',
      turnId: 'turn_approval_scope',
      availableDecisions: ['accept', 'acceptForSession', 'decline', 'cancel'],
      approvalKind: 'file_change',
      grantRoot: 'C:\\repo',
      changes: [{ path: 'C:\\repo\\src\\app.mjs', kind: 'modify', diff: '@@ -1 +1 @@' }],
    },
  )

  assert.equal(sender.sent.length, 1)
  assert.deepEqual(sender.sent[0].payload.changes, [{ path: 'C:\\repo\\src\\app.mjs', kind: 'modify', diff: '@@ -1 +1 @@' }])
  assert.equal(sender.sent[0].payload.grantRoot, 'C:\\repo')
  assert.equal(sender.sent[0].payload.threadId, 'thread_approval_scope')
  assert.equal(sender.sent[0].payload.turnId, 'turn_approval_scope')
  assert.deepEqual(sender.sent[0].payload.availableDecisions, ['accept', 'acceptForSession', 'decline', 'cancel'])
  assert.equal(sender.sent[0].payload.approvalKind, 'file_change')

  ipcMainMock.emit('v1:tool:approval-response:approval_file_change', { sender }, {
    decision: 'approved',
  })

  const outcome = await approvalPromise
  assert.deepEqual(outcome, {
    decision: 'approved',
    denyReason: '',
  })
})

test('requestApproval resolves denied responses with the deny reason', async () => {
  const ipcMainMock = createIpcMainMock()
  const requestApproval = createRequestApprovalHandler({
    ipcMainRef: ipcMainMock,
    getToolMetaFn: () => ({ label: 'Write File' }),
    sendVersionedFn: (sender, channel, payload) => {
      sender.send(channel, payload)
    },
    toVersionedChannelFn: (channel) => `v1:${channel}`,
  })

  const sender = createSender(9)
  const approvalPromise = requestApproval(
    sender,
    'approval_deny',
    'write_file',
    { path: 'src/app.js' },
    process.cwd(),
  )

  ipcMainMock.emit('tool:approval-response:approval_deny', { sender }, {
    decision: 'denied',
    denyReason: 'user_denied',
  })

  const outcome = await approvalPromise
  assert.deepEqual(outcome, { decision: 'denied', denyReason: 'user_denied' })
})

test('requestApproval times out and emits lifecycle warning/timeout callbacks', async () => {
  const timers = installFakeTimers()
  try {
    const ipcMainMock = createIpcMainMock()
    const lifecycle = []
    const requestApproval = createRequestApprovalHandler({
      ipcMainRef: ipcMainMock,
      getToolMetaFn: () => ({ label: 'Run Command' }),
      sendVersionedFn: (sender, channel, payload) => {
        sender.send(channel, payload)
      },
      toVersionedChannelFn: (channel) => `v1:${channel}`,
    })

    const sender = createSender(13)
    const approvalPromise = requestApproval(
      sender,
      'approval_timeout',
      'run_command',
      { command: 'sleep 1' },
      process.cwd(),
      null,
      null,
      (phase, payload) => lifecycle.push({ phase, payload }),
    )

    timers.runAll()
    const outcome = await approvalPromise

    assert.deepEqual(outcome, { decision: 'denied', denyReason: 'timeout' })
    assert.deepEqual(lifecycle.map((row) => row.phase), ['start', 'warning', 'timeout'])
    assert.equal(lifecycle[0].payload.timeoutMs, getApprovalTimeoutMs())
    assert.equal(lifecycle[2].payload.remainingMs, 0)
  } finally {
    timers.restore()
  }
})

test('requestApproval resolves cancelled when the loop abort signal fires', async () => {
  const ipcMainMock = createIpcMainMock()
  const requestApproval = createRequestApprovalHandler({
    ipcMainRef: ipcMainMock,
    getToolMetaFn: () => ({ label: 'Run Command' }),
    sendVersionedFn: (sender, channel, payload) => {
      sender.send(channel, payload)
    },
    toVersionedChannelFn: (channel) => `v1:${channel}`,
  })

  const sender = createSender(17)
  const abortController = new AbortController()
  const loop = {
    cancelled: false,
    cancelReason: '',
    abortController,
  }

  const approvalPromise = requestApproval(
    sender,
    'approval_abort',
    'run_command',
    { command: 'echo ok' },
    process.cwd(),
    null,
    loop,
  )

  abortController.abort()
  const outcome = await approvalPromise

  assert.equal(loop.cancelled, true)
  assert.equal(loop.cancelReason, 'Cancelled by user.')
  assert.deepEqual(outcome, { decision: 'denied', denyReason: 'cancelled' })
})

test('requestApproval resolves renderer_unavailable when the sender is destroyed', async () => {
  const ipcMainMock = createIpcMainMock()
  const requestApproval = createRequestApprovalHandler({
    ipcMainRef: ipcMainMock,
    getToolMetaFn: () => ({ label: 'Run Command' }),
    sendVersionedFn: (sender, channel, payload) => {
      sender.send(channel, payload)
    },
    toVersionedChannelFn: (channel) => `v1:${channel}`,
  })

  const sender = createSender(19)
  const loop = {
    cancelled: false,
    cancelReason: '',
  }

  const approvalPromise = requestApproval(
    sender,
    'approval_destroyed',
    'run_command',
    { command: 'echo ok' },
    process.cwd(),
    null,
    loop,
  )

  sender.emit('destroyed')
  const outcome = await approvalPromise

  assert.equal(loop.cancelled, false)
  assert.equal(loop.cancelReason, '')
  assert.deepEqual(outcome, { decision: 'denied', denyReason: 'renderer_unavailable' })
})

test('requestApproval ignores approval responses from other renderer senders', async () => {
  const ipcMainMock = createIpcMainMock()
  const requestApproval = createRequestApprovalHandler({
    ipcMainRef: ipcMainMock,
    getToolMetaFn: () => ({ label: 'Write File' }),
    sendVersionedFn: (sender, channel, payload) => {
      sender.send(channel, payload)
    },
    toVersionedChannelFn: (channel) => `v1:${channel}`,
  })

  const sender = createSender(101)
  const otherSender = createSender(202)
  const approvalPromise = requestApproval(
    sender,
    'approval_1',
    'write_file',
    { path: 'src/app.js' },
    process.cwd(),
  )

  assert.equal(sender.sent.length, 1)
  assert.equal(sender.sent[0].channel, 'tool:approval-request')
  assert.equal(sender.sent[0].payload.responseChannel, 'tool:approval-response:approval_1')

  let settled = false
  approvalPromise.then(() => {
    settled = true
  })

  ipcMainMock.emit('v1:tool:approval-response:approval_1', { sender: otherSender }, { decision: 'approved' })
  await flushMicrotasks()
  assert.equal(settled, false)

  ipcMainMock.emit('v1:tool:approval-response:approval_1', { sender }, { decision: 'approved' })
  const outcome = await approvalPromise
  assert.deepEqual(outcome, { decision: 'approved', denyReason: '' })
})
