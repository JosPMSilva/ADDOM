import { EventEmitter } from 'node:events'
import assert from 'node:assert/strict'
import test from 'node:test'

import { registerTerminalSessionHandlers } from '../../src/main/ipc-handlers/terminal-session.mjs'
import { createTerminalSessionManager } from '../../src/main/tools/terminal-session-manager.mjs'

class FakePty extends EventEmitter {
  constructor(pid = 2468) {
    super()
    this.pid = pid
    this.writes = []
    this.resizes = []
    this.kills = []
  }

  onData(listener) {
    this.on('data', listener)
    return { dispose: () => this.off('data', listener) }
  }

  onExit(listener) {
    this.on('exit-event', listener)
    return { dispose: () => this.off('exit-event', listener) }
  }

  write(data) {
    this.writes.push(String(data))
  }

  resize(cols, rows) {
    this.resizes.push({ cols, rows })
  }

  kill(signal) {
    this.kills.push(signal ?? null)
  }

  emitData(data) {
    this.emit('data', String(data))
  }

  emitExit(exitCode = 0, signal = undefined) {
    this.emit('exit-event', { exitCode, signal })
  }
}

class FakeSender extends EventEmitter {
  constructor(id = 17) {
    super()
    this.id = id
    this.sent = []
    this.destroyed = false
  }

  send(channel, payload) {
    this.sent.push({ channel, payload })
  }

  isDestroyed() {
    return this.destroyed === true
  }

  destroy() {
    this.destroyed = true
    this.emit('destroyed')
  }
}

function createNowSequence(start = 2_000) {
  let value = start
  return () => {
    value += 1
    return value
  }
}

function createIpcMainHarness() {
  const handlers = new Map()
  return {
    ipcMain: {
      handle(channel, listener) {
        handlers.set(String(channel), listener)
      },
    },
    async invoke(channel, event, payload) {
      const handler = handlers.get(String(channel))
      if (!handler) throw new Error(`No handler registered for ${channel}`)
      return handler(event, payload)
    },
  }
}

test('terminal session IPC exposes deterministic lifecycle handlers and subscription cleanup', async () => {
  const harness = createIpcMainHarness()
  const sender = new FakeSender()
  const pty = new FakePty()
  const manager = createTerminalSessionManager({
    platform: 'linux',
    env: { SHELL: '/bin/bash' },
    now: createNowSequence(),
    generateSessionId: () => 'term_ipc_1',
    spawnTerminal: () => pty,
  })
  const registration = registerTerminalSessionHandlers({
    ipcMainImpl: harness.ipcMain,
    sessionManager: manager,
  })

  const created = await harness.invoke('v1:terminal:session:create', { sender }, {
    projectFolder: process.cwd(),
    cwd: '.',
    shell: 'default',
    cols: 80,
    rows: 24,
  })
  assert.equal(created.ok, true)
  assert.equal(created.session.id, 'term_ipc_1')
  assert.equal(created.approvalPolicy.type, 'terminal_session_policy_v1')

  const listed = await harness.invoke('v1:terminal:session:list', { sender }, {})
  assert.equal(listed.ok, true)
  assert.equal(listed.sessions.length, 1)

  const attached = await harness.invoke('v1:terminal:session:attach', { sender }, {
    sessionId: 'term_ipc_1',
  })
  assert.equal(attached.ok, true)
  assert.equal(attached.session.id, 'term_ipc_1')

  const readSnapshot = await harness.invoke('v1:terminal:session:read-snapshot', { sender }, {
    sessionId: 'term_ipc_1',
  })
  assert.equal(readSnapshot.ok, true)
  assert.equal(readSnapshot.sessionId, 'term_ipc_1')
  assert.match(readSnapshot.summary, /Read a terminal snapshot from term_ipc_1/i)
  assert.equal(readSnapshot.output.mode, 'buffer_tail')

  const publishedVisibleSnapshot = await harness.invoke('v1:terminal:session:publish-visible-snapshot', { sender }, {
    sessionId: 'term_ipc_1',
    text: 'visible prompt> ',
    capturedAt: 2222,
    cols: 80,
    rows: 24,
    surface: 'chat_dock',
    available: true,
  })
  assert.equal(publishedVisibleSnapshot.ok, true)
  assert.equal(publishedVisibleSnapshot.visibleSnapshot.text, 'visible prompt> ')

  const subscription = await harness.invoke('v1:terminal:session:subscribe', { sender }, {
    sessionId: 'term_ipc_1',
  })
  assert.equal(subscription.ok, true)
  assert.match(subscription.subscriptionId, /^term_sub_/)

  pty.emitData('ready\n')
  assert.equal(sender.sent.length, 1)
  assert.equal(sender.sent[0].channel, 'v1:terminal:session:event')
  assert.equal(sender.sent[0].payload.subscriptionId, subscription.subscriptionId)
  assert.equal(sender.sent[0].payload.event.type, 'data')

  const writeResult = await harness.invoke('v1:terminal:session:write', { sender }, {
    sessionId: 'term_ipc_1',
    data: 'echo hi\n',
  })
  assert.equal(writeResult.ok, true)
  assert.deepEqual(pty.writes, ['echo hi\n'])

  const resizeResult = await harness.invoke('v1:terminal:session:resize', { sender }, {
    sessionId: 'term_ipc_1',
    cols: 120,
    rows: 40,
  })
  assert.equal(resizeResult.ok, true)
  assert.deepEqual(pty.resizes, [{ cols: 120, rows: 40 }])

  const signalResult = await harness.invoke('v1:terminal:session:signal', { sender }, {
    sessionId: 'term_ipc_1',
    signal: 'SIGTERM',
  })
  assert.equal(signalResult.ok, true)
  assert.deepEqual(pty.kills, ['SIGTERM'])

  const interruptResult = await harness.invoke('v1:terminal:session:interrupt', { sender }, {
    sessionId: 'term_ipc_1',
  })
  assert.equal(interruptResult.ok, true)
  assert.deepEqual(pty.kills, ['SIGTERM', 'SIGINT'])

  const takeoverResult = await harness.invoke('v1:terminal:session:takeover', { sender }, {
    sessionId: 'term_ipc_1',
  })
  assert.equal(takeoverResult.ok, true)
  assert.equal(takeoverResult.session.controlOwner, 'user')
  assert.equal(takeoverResult.session.aiWriteBlocked, true)

  const attachWhileUserControlled = await harness.invoke('v1:terminal:session:attach', { sender }, {
    sessionId: 'term_ipc_1',
  })
  assert.equal(attachWhileUserControlled.ok, true)
  assert.equal(attachWhileUserControlled.session.controlOwner, 'user')

  const writeWhileUserControlled = await harness.invoke('v1:terminal:session:write', { sender }, {
    sessionId: 'term_ipc_1',
    data: 'echo from user takeover\n',
  })
  assert.equal(writeWhileUserControlled.ok, true)
  assert.deepEqual(pty.writes, ['echo hi\n', 'echo from user takeover\n'])

  const focusSurfaceWhileUserControlled = await harness.invoke('v1:terminal:session:focus-surface', { sender }, {
    sessionId: 'term_ipc_1',
    surface: 'chat_dock',
  })
  assert.equal(focusSurfaceWhileUserControlled.ok, true)
  assert.equal(focusSurfaceWhileUserControlled.session.focusedSurface, 'chat_dock')

  const handbackResult = await harness.invoke('v1:terminal:session:handback', { sender }, {
    sessionId: 'term_ipc_1',
  })
  assert.equal(handbackResult.ok, true)
  assert.equal(handbackResult.session.controlOwner, 'model')

  const unsubscribeResult = await harness.invoke('v1:terminal:session:unsubscribe', { sender }, {
    subscriptionId: subscription.subscriptionId,
  })
  assert.equal(unsubscribeResult.ok, true)

  const sentBeforeIgnoredOutput = sender.sent.length
  pty.emitData('ignored\n')
  assert.equal(sender.sent.length, sentBeforeIgnoredOutput)

  const resubscribe = await harness.invoke('v1:terminal:session:subscribe', { sender }, {
    sessionId: 'term_ipc_1',
  })
  assert.equal(resubscribe.ok, true)
  const sentBeforeDestroy = sender.sent.length
  sender.destroy()
  pty.emitData('after-destroy\n')
  assert.equal(sender.sent.length, sentBeforeDestroy)

  const closeResult = await harness.invoke('v1:terminal:session:close', { sender }, {
    sessionId: 'term_ipc_1',
  })
  assert.equal(closeResult.ok, true)
  assert.equal(closeResult.closing, true)
  pty.emitExit(0)

  registration.dispose()
  manager.dispose()
})

test('terminal session IPC lets user-created chat opens request chat_dock as the initial surface', async () => {
  const harness = createIpcMainHarness()
  const sender = new FakeSender()
  const pty = new FakePty()
  const manager = createTerminalSessionManager({
    platform: 'linux',
    env: { SHELL: '/bin/bash' },
    now: createNowSequence(),
    generateSessionId: () => 'term_ipc_chat_user_1',
    spawnTerminal: () => pty,
  })

  registerTerminalSessionHandlers({
    ipcMainImpl: harness.ipcMain,
    sessionManager: manager,
  })

  const created = await harness.invoke('v1:terminal:session:create', { sender }, {
    projectFolder: process.cwd(),
    cwd: process.cwd(),
    shell: 'default',
    cols: 90,
    rows: 28,
    threadId: 'thread_chat_ipc',
    preferredSurface: 'chat_dock',
  })

  assert.equal(created.ok, true)
  assert.equal(created.session.threadId, 'thread_chat_ipc')
  assert.equal(created.session.openedBy, 'user')
  assert.equal(created.session.focusedSurface, 'chat_dock')
  assert.equal(created.session.sessionTitle, '')

  manager.dispose()
})

test('terminal session IPC creates and renames user-visible session titles', async () => {
  const harness = createIpcMainHarness()
  const sender = new FakeSender()
  const pty = new FakePty()
  const manager = createTerminalSessionManager({
    platform: 'linux',
    env: { SHELL: '/bin/bash' },
    now: createNowSequence(),
    generateSessionId: () => 'term_ipc_rename_1',
    spawnTerminal: () => pty,
  })

  registerTerminalSessionHandlers({
    ipcMainImpl: harness.ipcMain,
    sessionManager: manager,
  })

  const created = await harness.invoke('v1:terminal:session:create', { sender }, {
    projectFolder: process.cwd(),
    cwd: process.cwd(),
    shell: 'default',
    sessionTitle: 'Initial IPC title',
  })
  assert.equal(created.ok, true)
  assert.equal(created.session.sessionTitle, 'Initial IPC title')

  const renamed = await harness.invoke('v1:terminal:session:rename', { sender }, {
    sessionId: 'term_ipc_rename_1',
    sessionTitle: 'Renamed IPC title',
    projectFolder: process.cwd(),
    permissionMode: 'ask',
  })
  assert.equal(renamed.ok, true)
  assert.equal(renamed.session.sessionTitle, 'Renamed IPC title')
  assert.equal(manager.getSession('term_ipc_rename_1').sessionTitle, 'Renamed IPC title')

  manager.dispose()
})

test('terminal session IPC enforces workspace-bound reuse and hides foreign sessions from non-full-access panels', async () => {
  const harness = createIpcMainHarness()
  const sender = new FakeSender()
  const pty = new FakePty()
  const manager = createTerminalSessionManager({
    platform: 'linux',
    env: { SHELL: '/bin/bash' },
    now: createNowSequence(),
    generateSessionId: () => 'term_ipc_scope_1',
    spawnTerminal: () => pty,
  })

  registerTerminalSessionHandlers({
    ipcMainImpl: harness.ipcMain,
    sessionManager: manager,
  })

  const outsideRoot = process.platform === 'win32'
    ? 'C:\\outside-workspace'
    : '/tmp/outside-workspace'
  const createResult = await harness.invoke('v1:terminal:session:create', { sender }, {
    projectFolder: process.cwd(),
    cwd: outsideRoot,
    shell: 'default',
    permissionMode: 'full_access',
  })
  assert.equal(createResult.ok, true)
  assert.equal(createResult.session.id, 'term_ipc_scope_1')

  const visibleInWorkspaceSafe = await harness.invoke('v1:terminal:session:list', { sender }, {
    projectFolder: process.cwd(),
    permissionMode: 'ask',
  })
  assert.equal(visibleInWorkspaceSafe.ok, true)
  assert.deepEqual(visibleInWorkspaceSafe.sessions, [])

  const blockedAttach = await harness.invoke('v1:terminal:session:attach', { sender }, {
    sessionId: 'term_ipc_scope_1',
    projectFolder: process.cwd(),
    permissionMode: 'ask',
  })
  assert.equal(blockedAttach.ok, false)
  assert.equal(blockedAttach.error, 'terminal_session_attach_denied')
  assert.equal(blockedAttach.approvalPolicy?.policyDecision, 'deny')

  const blockedReadSnapshot = await harness.invoke('v1:terminal:session:read-snapshot', { sender }, {
    sessionId: 'term_ipc_scope_1',
    projectFolder: process.cwd(),
    permissionMode: 'ask',
  })
  assert.equal(blockedReadSnapshot.ok, false)
  assert.equal(blockedReadSnapshot.error, 'terminal_session_read_snapshot_denied')
  assert.equal(blockedReadSnapshot.approvalPolicy?.policyDecision, 'deny')

  const allowedFullAccessAttach = await harness.invoke('v1:terminal:session:attach', { sender }, {
    sessionId: 'term_ipc_scope_1',
    projectFolder: process.cwd(),
    permissionMode: 'full_access',
  })
  assert.equal(allowedFullAccessAttach.ok, true)
  assert.equal(allowedFullAccessAttach.session.id, 'term_ipc_scope_1')

  const allowedFullAccessReadSnapshot = await harness.invoke('v1:terminal:session:read-snapshot', { sender }, {
    sessionId: 'term_ipc_scope_1',
    projectFolder: process.cwd(),
    permissionMode: 'full_access',
  })
  assert.equal(allowedFullAccessReadSnapshot.ok, true)
  assert.equal(allowedFullAccessReadSnapshot.session.id, 'term_ipc_scope_1')

  manager.dispose()
})

test('terminal session IPC preserves explicit approval-safe create denial for outside-workspace sessions', async () => {
  const harness = createIpcMainHarness()
  const sender = new FakeSender()
  const pty = new FakePty()
  const manager = createTerminalSessionManager({
    platform: 'linux',
    env: { SHELL: '/bin/bash' },
    now: createNowSequence(),
    generateSessionId: () => 'term_ipc_2',
    spawnTerminal: () => pty,
  })

  registerTerminalSessionHandlers({
    ipcMainImpl: harness.ipcMain,
    sessionManager: manager,
  })

  const result = await harness.invoke('v1:terminal:session:create', { sender }, {
    projectFolder: process.cwd(),
    cwd: '..',
    shell: 'default',
    permissionMode: 'ask',
  })

  assert.equal(result.ok, false)
  assert.equal(result.error, 'terminal_session_create_requires_approval')
  assert.equal(result.approvalPolicy.type, 'terminal_session_policy_v1')
  assert.equal(result.approvalPolicy.policyDecision, 'require_elevation')
  assert.equal(result.approvalPolicy.hostAccessRequired, true)
  assert.deepEqual(manager.listSessions(), [])

  manager.dispose()
})

test('terminal session IPC attach returns only output deltas after the requested sequence', async () => {
  const harness = createIpcMainHarness()
  const sender = new FakeSender()
  const pty = new FakePty()
  const manager = createTerminalSessionManager({
    platform: 'linux',
    env: { SHELL: '/bin/bash' },
    now: createNowSequence(),
    generateSessionId: () => 'term_ipc_delta_1',
    spawnTerminal: () => pty,
  })

  registerTerminalSessionHandlers({
    ipcMainImpl: harness.ipcMain,
    sessionManager: manager,
  })

  const created = await harness.invoke('v1:terminal:session:create', { sender }, {
    projectFolder: process.cwd(),
    cwd: '.',
    shell: 'default',
    cols: 80,
    rows: 24,
  })
  assert.equal(created.ok, true)

  pty.emitData('one')
  pty.emitData('two')
  pty.emitData('three')

  const attached = await harness.invoke('v1:terminal:session:attach', { sender }, {
    sessionId: 'term_ipc_delta_1',
    sinceSequence: 1,
  })
  assert.equal(attached.ok, true)
  assert.deepEqual(
    attached.output.chunks.map(({ sequence, data }) => ({ sequence, data })),
    [
      { sequence: 2, data: 'two' },
      { sequence: 3, data: 'three' },
    ],
  )
  assert.equal(attached.output.nextSequence, 3)
  assert.equal(attached.output.truncated, false)

  manager.dispose()
})

test('terminal session IPC read-snapshot returns bounded delta text after the requested sequence', async () => {
  const harness = createIpcMainHarness()
  const sender = new FakeSender()
  const pty = new FakePty()
  const manager = createTerminalSessionManager({
    platform: 'linux',
    env: { SHELL: '/bin/bash' },
    now: createNowSequence(),
    generateSessionId: () => 'term_ipc_read_1',
    spawnTerminal: () => pty,
  })

  registerTerminalSessionHandlers({
    ipcMainImpl: harness.ipcMain,
    sessionManager: manager,
  })

  const created = await harness.invoke('v1:terminal:session:create', { sender }, {
    projectFolder: process.cwd(),
    cwd: '.',
    shell: 'default',
    cols: 80,
    rows: 24,
  })
  assert.equal(created.ok, true)

  pty.emitData('one')
  pty.emitData('two')
  pty.emitData('three')

  const snapshot = await harness.invoke('v1:terminal:session:read-snapshot', { sender }, {
    sessionId: 'term_ipc_read_1',
    sinceSequence: 1,
    maxChars: 8,
    mode: 'buffer_tail',
  })
  assert.equal(snapshot.ok, true)
  assert.equal(snapshot.sessionId, 'term_ipc_read_1')
  assert.equal(snapshot.output.text, 'twothree')
  assert.equal(snapshot.output.preview, 'twothree')
  assert.equal(snapshot.output.chunkCount, 2)
  assert.equal(snapshot.output.nextSequence, 3)
  assert.equal(snapshot.output.truncated, false)
  assert.equal(snapshot.output.mode, 'buffer_tail')
  assert.equal(typeof snapshot.output.capturedAt, 'number')

  manager.dispose()
})

test('terminal session IPC read-snapshot can return explicit visible viewport text', async () => {
  const harness = createIpcMainHarness()
  const sender = new FakeSender()
  const pty = new FakePty()
  const manager = createTerminalSessionManager({
    platform: 'linux',
    env: { SHELL: '/bin/bash' },
    now: createNowSequence(),
    generateSessionId: () => 'term_ipc_visible_1',
    spawnTerminal: () => pty,
  })

  registerTerminalSessionHandlers({
    ipcMainImpl: harness.ipcMain,
    sessionManager: manager,
  })

  const created = await harness.invoke('v1:terminal:session:create', { sender }, {
    projectFolder: process.cwd(),
    cwd: '.',
    shell: 'default',
    cols: 80,
    rows: 24,
    preferredSurface: 'chat_dock',
  })
  assert.equal(created.ok, true)

  const published = await harness.invoke('v1:terminal:session:publish-visible-snapshot', { sender }, {
    sessionId: 'term_ipc_visible_1',
    text: 'first line\nprompt> ',
    capturedAt: 4123,
    cols: 80,
    rows: 24,
    surface: 'chat_dock',
    available: true,
  })
  assert.equal(published.ok, true)

  const snapshot = await harness.invoke('v1:terminal:session:read-snapshot', { sender }, {
    sessionId: 'term_ipc_visible_1',
    maxChars: 64,
    mode: 'visible_text',
  })
  assert.equal(snapshot.ok, true)
  assert.equal(snapshot.output.text, 'first line\nprompt> ')
  assert.equal(snapshot.output.mode, 'visible_text')
  assert.equal(snapshot.output.available, true)
  assert.equal(snapshot.output.capturedAt, 4123)

  manager.dispose()
})

test('terminal session IPC write accepts submit mode without changing raw write semantics', async () => {
  const harness = createIpcMainHarness()
  const sender = new FakeSender()
  const pty = new FakePty()
  const manager = createTerminalSessionManager({
    platform: 'linux',
    env: { SHELL: '/bin/bash' },
    now: createNowSequence(),
    generateSessionId: () => 'term_ipc_submit_1',
    spawnTerminal: () => pty,
  })

  registerTerminalSessionHandlers({
    ipcMainImpl: harness.ipcMain,
    sessionManager: manager,
  })

  const created = await harness.invoke('v1:terminal:session:create', { sender }, {
    projectFolder: process.cwd(),
    cwd: '.',
    shell: 'default',
    cols: 80,
    rows: 24,
  })
  assert.equal(created.ok, true)

  const submitResult = await harness.invoke('v1:terminal:session:write', { sender }, {
    sessionId: 'term_ipc_submit_1',
    data: 'npm --version',
    submit: true,
  })
  assert.equal(submitResult.ok, true)
  assert.deepEqual(pty.writes, ['npm --version\n'])
  assert.equal(submitResult.session.isRunningCommand, true)
  assert.equal(submitResult.session.commandState, 'running')

  const rawResult = await harness.invoke('v1:terminal:session:write', { sender }, {
    sessionId: 'term_ipc_submit_1',
    data: '\u0003',
  })
  assert.equal(rawResult.ok, true)
  assert.deepEqual(pty.writes, ['npm --version\n', '\u0003'])

  manager.dispose()
})
