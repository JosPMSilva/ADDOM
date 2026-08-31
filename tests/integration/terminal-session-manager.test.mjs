import { EventEmitter } from 'node:events'
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createTerminalSessionManager,
  resolveAvailableTerminalShells,
  resolveTerminalShellLaunch,
} from '../../src/main/tools/terminal-session-manager.mjs'

class FakePty extends EventEmitter {
  constructor(pid = 4321) {
    super()
    this.pid = pid
    this.writes = []
    this.resizes = []
    this.kills = []
  }

  onData(listener) {
    this.on('data', listener)
    return {
      dispose: () => this.off('data', listener),
    }
  }

  onExit(listener) {
    this.on('exit-event', listener)
    return {
      dispose: () => this.off('exit-event', listener),
    }
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

class FakeTimerQueue {
  constructor() {
    this.nextId = 1
    this.tasks = new Map()
  }

  setTimer(fn, delay) {
    const id = this.nextId++
    this.tasks.set(id, { fn, delay: Number(delay || 0) || 0 })
    return id
  }

  clearTimer(id) {
    this.tasks.delete(id)
  }

  count() {
    return this.tasks.size
  }

  runAll() {
    const pending = Array.from(this.tasks.entries())
    this.tasks.clear()
    for (const [, task] of pending) {
      task.fn()
    }
  }
}

function createNowSequence(start = 1_000) {
  let value = start
  return () => {
    value += 1
    return value
  }
}

test('terminal session manager runs one deterministic interactive lifecycle', () => {
  const pty = new FakePty(9876)
  const timers = new FakeTimerQueue()
  const spawnCalls = []
  const events = []
  const manager = createTerminalSessionManager({
    platform: 'win32',
    env: { ComSpec: 'C:\\Windows\\System32\\cmd.exe' },
    now: createNowSequence(),
    generateSessionId: () => 'term_test_1',
    closeFallbackMs: 25,
    spawnTerminal: (spec) => {
      spawnCalls.push(spec)
      return pty
    },
    setTimer: (fn, delay) => timers.setTimer(fn, delay),
    clearTimer: (id) => timers.clearTimer(id),
  })
  const unsubscribe = manager.subscribe((event) => {
    events.push(event)
  })

  const created = manager.createSession({
    cwd: process.cwd(),
    shell: 'default',
    cols: 120,
    rows: 30,
    policy: { type: 'terminal_session_policy_v1', policyDecision: 'allow' },
  })

  assert.equal(created.session.id, 'term_test_1')
  assert.equal(created.session.pid, 9876)
  assert.equal(created.session.status, 'running')
  assert.equal(spawnCalls.length, 1)
  assert.equal(spawnCalls[0].file, 'C:\\Windows\\System32\\cmd.exe')
  assert.deepEqual(spawnCalls[0].args, [])
  assert.equal(spawnCalls[0].options.useConpty, true)
  assert.equal(spawnCalls[0].options.useConptyDll, true)

  pty.emitData('ADDOM> ')
  const attached = manager.attachSession('term_test_1')
  assert.equal(attached.output.nextSequence, 1)
  assert.deepEqual(attached.output.chunks.map((entry) => entry.data), ['ADDOM> '])

  manager.writeSession('term_test_1', 'dir\r')
  manager.resizeSession('term_test_1', { cols: 140, rows: 36 })
  manager.signalSession('term_test_1', { signal: 'SIGINT' })
  const closing = manager.closeSession('term_test_1')
  assert.equal(closing.closing, true)
  assert.equal(timers.count(), 1)

  assert.deepEqual(pty.writes, ['dir\r', '\u0003'])
  assert.deepEqual(pty.resizes, [{ cols: 140, rows: 36 }])
  assert.deepEqual(pty.kills, [null])

  pty.emitExit(0)
  assert.equal(timers.count(), 0)
  assert.deepEqual(manager.listSessions(), [])
  assert.deepEqual(
    events.map((event) => event.type),
    ['created', 'data', 'input', 'resized', 'signaled', 'exit', 'closed'],
  )

  unsubscribe()
  manager.dispose()
})

test('terminal session manager bounds buffered output snapshots', () => {
  const pty = new FakePty()
  const manager = createTerminalSessionManager({
    platform: 'linux',
    env: { SHELL: '/bin/bash' },
    now: createNowSequence(),
    generateSessionId: () => 'term_test_2',
    maxBufferChars: 10,
    spawnTerminal: () => pty,
  })

  manager.createSession({
    cwd: process.cwd(),
    shell: 'default',
  })

  pty.emitData('12345')
  pty.emitData('67890')
  pty.emitData('abc')

  const attached = manager.attachSession('term_test_2')
  assert.equal(attached.output.truncated, true)
  assert.deepEqual(attached.output.chunks.map((entry) => entry.data), ['67890', 'abc'])

  manager.dispose()
})

test('terminal session manager readSessionSnapshot returns bounded delta text without mutating session control state', () => {
  const pty = new FakePty()
  const manager = createTerminalSessionManager({
    platform: 'linux',
    env: { SHELL: '/bin/bash' },
    now: createNowSequence(),
    generateSessionId: () => 'term_test_read_1',
    spawnTerminal: () => pty,
  })

  manager.createSession({
    cwd: process.cwd(),
    shell: 'default',
  })
  manager.focusSessionSurface('term_test_read_1', { surface: 'terminal_panel' })
  manager.setSessionTakeover('term_test_read_1', { controlOwner: 'user' })

  pty.emitData('one')
  pty.emitData('two')
  pty.emitData('three')

  const before = manager.getSession('term_test_read_1')
  const snapshot = manager.readSessionSnapshot('term_test_read_1', {
    sinceSequence: 1,
    maxChars: 8,
    mode: 'buffer_tail',
  })
  const after = manager.getSession('term_test_read_1')

  assert.equal(snapshot.sessionId, 'term_test_read_1')
  assert.equal(snapshot.output.text, 'twothree')
  assert.equal(snapshot.output.preview, 'twothree')
  assert.equal(snapshot.output.chunkCount, 2)
  assert.equal(snapshot.output.nextSequence, 3)
  assert.equal(snapshot.output.truncated, false)
  assert.equal(snapshot.output.mode, 'buffer_tail')
  assert.equal(typeof snapshot.output.capturedAt, 'number')
  assert.equal(after.controlOwner, before.controlOwner)
  assert.equal(after.focusedSurface, before.focusedSurface)
  assert.equal(after.updatedAt, before.updatedAt)

  manager.dispose()
})

test('terminal session manager readSessionSnapshot can return ANSI-stripped plain text tails', () => {
  const pty = new FakePty()
  const manager = createTerminalSessionManager({
    platform: 'linux',
    env: { SHELL: '/bin/bash' },
    now: createNowSequence(),
    generateSessionId: () => 'term_test_plain_text_1',
    spawnTerminal: () => pty,
  })

  manager.createSession({
    cwd: process.cwd(),
    shell: 'default',
  })

  pty.emitData('\u001b[32mready\u001b[39m\n')

  const snapshot = manager.readSessionSnapshot('term_test_plain_text_1', {
    maxChars: 32,
    mode: 'plain_text_tail',
  })

  assert.equal(snapshot.output.text, 'ready\n')
  assert.equal(snapshot.output.preview, 'ready\n')
  assert.equal(snapshot.output.mode, 'plain_text_tail')

  manager.dispose()
})

test('terminal session manager submit mode appends one shell Enter and tracks command activity truthfully', () => {
  const pty = new FakePty()
  const manager = createTerminalSessionManager({
    platform: 'win32',
    env: { ComSpec: 'C:\\Windows\\System32\\cmd.exe' },
    now: createNowSequence(),
    generateSessionId: () => 'term_test_submit_1',
    spawnTerminal: () => pty,
  })

  const created = manager.createSession({
    cwd: process.cwd(),
    shell: 'default',
  })

  assert.equal(created.session.isRunningCommand, false)
  assert.equal(created.session.commandState, 'idle')

  const submitted = manager.writeSession('term_test_submit_1', 'node --version', {
    submit: true,
  })
  assert.deepEqual(pty.writes, ['node --version\r'])
  assert.equal(submitted.isRunningCommand, true)
  assert.equal(submitted.commandState, 'running')

  pty.emitData('v22.0.0\r\nC:\\repo> ')

  const settled = manager.getSession('term_test_submit_1')
  assert.equal(settled.isRunningCommand, false)
  assert.equal(settled.commandState, 'idle')

  manager.dispose()
})

test('terminal session manager raw writes preserve literal bytes without forcing command execution state', () => {
  const pty = new FakePty()
  const manager = createTerminalSessionManager({
    platform: 'linux',
    env: { SHELL: '/bin/bash' },
    now: createNowSequence(),
    generateSessionId: () => 'term_test_raw_write_1',
    spawnTerminal: () => pty,
  })

  manager.createSession({
    cwd: process.cwd(),
    shell: 'default',
  })

  const written = manager.writeSession('term_test_raw_write_1', 'printf "partial"', {
    submit: false,
  })

  assert.deepEqual(pty.writes, ['printf "partial"'])
  assert.equal(written.isRunningCommand, false)
  assert.equal(written.commandState, 'idle')

  manager.dispose()
})

test('terminal session manager readSessionSnapshot can return active visible viewport text', () => {
  const pty = new FakePty()
  const manager = createTerminalSessionManager({
    platform: 'linux',
    env: { SHELL: '/bin/bash' },
    now: createNowSequence(),
    generateSessionId: () => 'term_test_visible_1',
    spawnTerminal: () => pty,
  })

  manager.createSession({
    cwd: process.cwd(),
    shell: 'default',
    preferredSurface: 'chat_dock',
  })

  manager.updateVisibleSnapshot('term_test_visible_1', {
    text: 'top\nmiddle\nprompt> ',
    capturedAt: 2222,
    cols: 120,
    rows: 24,
    surface: 'chat_dock',
    available: true,
  })

  const snapshot = manager.readSessionSnapshot('term_test_visible_1', {
    mode: 'visible_text',
    maxChars: 64,
  })

  assert.equal(snapshot.output.text, 'top\nmiddle\nprompt> ')
  assert.equal(snapshot.output.preview, 'top\nmiddle\nprompt> ')
  assert.equal(snapshot.output.mode, 'visible_text')
  assert.equal(snapshot.output.available, true)
  assert.equal(snapshot.output.chunkCount, 1)
  assert.equal(snapshot.output.capturedAt, 2222)

  manager.dispose()
})

test('terminal session manager visible_text snapshots stay unavailable until the active surface publishes', () => {
  const pty = new FakePty()
  const manager = createTerminalSessionManager({
    platform: 'linux',
    env: { SHELL: '/bin/bash' },
    now: createNowSequence(),
    generateSessionId: () => 'term_test_visible_2',
    spawnTerminal: () => pty,
  })

  manager.createSession({
    cwd: process.cwd(),
    shell: 'default',
    preferredSurface: 'terminal_panel',
  })

  manager.updateVisibleSnapshot('term_test_visible_2', {
    text: 'stale dock text',
    capturedAt: 3333,
    surface: 'chat_dock',
    available: true,
  })

  const snapshot = manager.readSessionSnapshot('term_test_visible_2', {
    mode: 'visible_text',
    maxChars: 64,
  })

  assert.equal(snapshot.output.text, '')
  assert.equal(snapshot.output.mode, 'visible_text')
  assert.equal(snapshot.output.available, false)
  assert.equal(snapshot.output.chunkCount, 0)

  manager.dispose()
})

test('terminal session manager waitForOutput resolves when new terminal output matches', async () => {
  const pty = new FakePty()
  const timers = new FakeTimerQueue()
  const manager = createTerminalSessionManager({
    platform: 'linux',
    env: { SHELL: '/bin/bash' },
    now: createNowSequence(),
    generateSessionId: () => 'term_test_wait_1',
    spawnTerminal: () => pty,
    setTimer: (fn, delay) => timers.setTimer(fn, delay),
    clearTimer: (id) => timers.clearTimer(id),
  })

  manager.createSession({
    cwd: process.cwd(),
    shell: 'default',
  })

  const pendingWait = manager.waitForOutput('term_test_wait_1', {
    text: 'server ready',
    sinceSequence: 0,
    timeoutMs: 4000,
    maxChars: 96,
    mode: 'plain_text_tail',
  })

  pty.emitData('booting\n')
  pty.emitData('\u001b[32mserver ready\u001b[39m on :5173\n')

  const waited = await pendingWait

  assert.equal(waited.sessionId, 'term_test_wait_1')
  assert.equal(waited.wait.matched, true)
  assert.equal(waited.wait.timedOut, false)
  assert.equal(waited.wait.matchType, 'text')
  assert.equal(waited.wait.text, 'server ready')
  assert.equal(waited.output.mode, 'plain_text_tail')
  assert.match(waited.output.text, /server ready on :5173/)
  assert.equal(timers.count(), 0)

  manager.dispose()
})

test('terminal session manager honors an explicit preferredSurface for user-created sessions', () => {
  const pty = new FakePty()
  const manager = createTerminalSessionManager({
    platform: 'linux',
    env: { SHELL: '/bin/bash' },
    now: createNowSequence(),
    generateSessionId: () => 'term_test_surface_1',
    spawnTerminal: () => pty,
  })

  const created = manager.createSession({
    cwd: process.cwd(),
    shell: 'default',
    openedBy: 'user',
    preferredSurface: 'chat_dock',
  })

  assert.equal(created.session.focusedSurface, 'chat_dock')

  manager.dispose()
})

test('terminal session manager renames live sessions and archives the display title on close', () => {
  const pty = new FakePty()
  const events = []
  const archives = []
  const manager = createTerminalSessionManager({
    platform: 'linux',
    env: { SHELL: '/bin/bash' },
    now: createNowSequence(),
    generateSessionId: () => 'term_test_rename_1',
    spawnTerminal: () => pty,
    archiveClosedSession: (archive) => archives.push(archive),
  })
  manager.subscribe((event) => {
    events.push(event)
  })

  const created = manager.createSession({
    cwd: process.cwd(),
    shell: 'default',
    sessionTitle: 'Initial title',
  })
  assert.equal(created.session.sessionTitle, 'Initial title')

  const renamed = manager.renameSession('term_test_rename_1', {
    sessionTitle: 'Build watcher',
  })
  assert.equal(renamed.sessionTitle, 'Build watcher')
  assert.equal(manager.getSession('term_test_rename_1').sessionTitle, 'Build watcher')
  assert.deepEqual(
    events.map((event) => event.type),
    ['created', 'renamed'],
  )

  manager.closeSession('term_test_rename_1', { closedBy: 'user' })
  pty.emitExit(0)

  assert.equal(archives.length, 1)
  assert.equal(archives[0]?.sessionTitle, 'Build watcher')

  manager.dispose()
})

test('terminal session manager defaults omitted preferredSurface to the chat dock', () => {
  const pty = new FakePty()
  const manager = createTerminalSessionManager({
    platform: 'linux',
    env: { SHELL: '/bin/bash' },
    now: createNowSequence(),
    generateSessionId: () => 'term_test_default_surface_1',
    spawnTerminal: () => pty,
  })

  const created = manager.createSession({
    cwd: process.cwd(),
    shell: 'default',
    openedBy: 'user',
  })

  assert.equal(created.session.focusedSurface, 'chat_dock')

  manager.dispose()
})

test('terminal session manager trims a single oversized PTY chunk to the configured buffer cap', () => {
  const pty = new FakePty()
  const manager = createTerminalSessionManager({
    platform: 'linux',
    env: { SHELL: '/bin/bash' },
    now: createNowSequence(),
    generateSessionId: () => 'term_test_big_chunk',
    maxBufferChars: 10,
    spawnTerminal: () => pty,
  })

  manager.createSession({
    cwd: process.cwd(),
    shell: 'default',
  })

  pty.emitData('1234567890ABCDE')

  const attached = manager.attachSession('term_test_big_chunk')
  assert.equal(attached.output.truncated, true)
  assert.deepEqual(attached.output.chunks.map((entry) => entry.data), ['67890ABCDE'])

  manager.dispose()
})

test('terminal session manager readSessionSnapshot trims a single oversized chunk to the requested cap', () => {
  const pty = new FakePty()
  const manager = createTerminalSessionManager({
    platform: 'linux',
    env: { SHELL: '/bin/bash' },
    now: createNowSequence(),
    generateSessionId: () => 'term_test_read_big_chunk',
    maxBufferChars: 32,
    spawnTerminal: () => pty,
  })

  manager.createSession({
    cwd: process.cwd(),
    shell: 'default',
  })

  pty.emitData('1234567890ABCDE')

  const snapshot = manager.readSessionSnapshot('term_test_read_big_chunk', {
    maxChars: 10,
  })

  assert.equal(snapshot.output.text, '67890ABCDE')
  assert.equal(snapshot.output.chunkCount, 1)
  assert.equal(snapshot.output.truncated, true)

  manager.dispose()
})

test('terminal session manager skips redundant resize calls before reaching the PTY runtime', () => {
  const pty = new FakePty()
  const manager = createTerminalSessionManager({
    platform: 'linux',
    env: { SHELL: '/bin/bash' },
    now: createNowSequence(),
    generateSessionId: () => 'term_test_resize',
    spawnTerminal: () => pty,
  })

  manager.createSession({
    cwd: process.cwd(),
    shell: 'default',
    cols: 120,
    rows: 40,
  })

  const unchanged = manager.resizeSession('term_test_resize', { cols: 120, rows: 40 })
  assert.equal(unchanged.cols, 120)
  assert.equal(unchanged.rows, 40)
  assert.deepEqual(pty.resizes, [])

  manager.resizeSession('term_test_resize', { cols: 121, rows: 41 })
  assert.deepEqual(pty.resizes, [{ cols: 121, rows: 41 }])

  manager.dispose()
})

test('terminal session manager reaps exited sessions after the configured retention window', () => {
  const pty = new FakePty()
  const timers = new FakeTimerQueue()
  const events = []
  const manager = createTerminalSessionManager({
    platform: 'linux',
    env: { SHELL: '/bin/bash' },
    now: createNowSequence(),
    generateSessionId: () => 'term_test_reap',
    spawnTerminal: () => pty,
    exitedSessionReapMs: 25,
    setTimer: (fn, delay) => timers.setTimer(fn, delay),
    clearTimer: (id) => timers.clearTimer(id),
  })
  manager.subscribe((event) => {
    events.push(event)
  })

  manager.createSession({
    cwd: process.cwd(),
    shell: 'default',
  })

  pty.emitExit(0)
  assert.equal(manager.listSessions().length, 1)
  assert.equal(manager.getSession('term_test_reap').status, 'exited')

  timers.runAll()
  assert.deepEqual(manager.listSessions(), [])
  assert.deepEqual(
    events.map((event) => event.type),
    ['created', 'exit', 'closed'],
  )
  assert.equal(events[2]?.reason, 'reaped_after_exit')

  manager.dispose()
})

test('terminal session manager force-closes a session when close fallback expires without PTY exit', () => {
  const pty = new FakePty()
  const timers = new FakeTimerQueue()
  const events = []
  const manager = createTerminalSessionManager({
    platform: 'linux',
    env: { SHELL: '/bin/bash' },
    now: createNowSequence(),
    generateSessionId: () => 'term_test_close_fallback',
    closeFallbackMs: 25,
    spawnTerminal: () => pty,
    setTimer: (fn, delay) => timers.setTimer(fn, delay),
    clearTimer: (id) => timers.clearTimer(id),
  })
  manager.subscribe((event) => {
    events.push(event)
  })

  manager.createSession({
    cwd: process.cwd(),
    shell: 'default',
  })

  const closing = manager.closeSession('term_test_close_fallback')
  assert.equal(closing.closing, true)
  assert.deepEqual(pty.kills, ['SIGHUP'])
  assert.equal(timers.count(), 1)
  assert.equal(manager.hasSession('term_test_close_fallback'), true)

  timers.runAll()

  assert.equal(timers.count(), 0)
  assert.equal(manager.hasSession('term_test_close_fallback'), false)
  assert.deepEqual(
    events.map((event) => event.type),
    ['created', 'error', 'closed'],
  )
  assert.equal(events[1]?.error, 'Terminal session did not emit an exit event before the close fallback timeout.')
  assert.equal(events[2]?.reason, 'close_timeout_fallback')

  manager.dispose()
})

test('terminal session manager bulk-closes sessions by thread, project, and workspace scope', () => {
  const ptys = [
    new FakePty(1001),
    new FakePty(1002),
    new FakePty(1003),
  ]
  let nextPtyIndex = 0
  let nextSessionNumber = 0
  const manager = createTerminalSessionManager({
    platform: 'win32',
    env: { ComSpec: 'C:\\Windows\\System32\\cmd.exe' },
    now: createNowSequence(),
    generateSessionId: () => `term_test_bulk_${++nextSessionNumber}`,
    spawnTerminal: () => ptys[nextPtyIndex++],
  })

  manager.createSession({
    cwd: 'C:\\RepoA',
    project: 'C:\\RepoA',
    threadId: 'thread_a',
    shell: 'default',
  })
  manager.createSession({
    cwd: 'C:\\RepoA',
    project: 'C:\\RepoA',
    threadId: 'thread_b',
    shell: 'default',
  })
  manager.createSession({
    cwd: 'C:\\RepoB',
    project: 'C:\\RepoB',
    threadId: 'thread_c',
    shell: 'default',
  })

  assert.deepEqual(
    manager.closeSessionsForThread('thread_b', { closedBy: 'workspace_reset' }),
    ['term_test_bulk_2'],
  )
  assert.deepEqual(ptys[1].kills, [null])
  assert.equal(manager.getSession('term_test_bulk_2').closedBy, 'workspace_reset')
  ptys[1].emitExit(0)
  assert.equal(manager.hasSession('term_test_bulk_2'), false)

  assert.deepEqual(
    manager.closeSessionsForProject('c:\\repoa', { closedBy: 'workspace_reset' }),
    ['term_test_bulk_1'],
  )
  assert.deepEqual(ptys[0].kills, [null])
  ptys[0].emitExit(0)
  assert.equal(manager.hasSession('term_test_bulk_1'), false)
  assert.equal(manager.hasSession('term_test_bulk_3'), true)

  assert.deepEqual(
    manager.closeAllSessions({ closedBy: 'workspace_reset' }),
    ['term_test_bulk_3'],
  )
  assert.deepEqual(ptys[2].kills, [null])
  ptys[2].emitExit(0)
  assert.deepEqual(manager.listSessions(), [])

  manager.dispose()
})

test('terminal session manager resolves explicit zsh launches on POSIX targets', () => {
  const launch = resolveTerminalShellLaunch({
    platform: 'darwin',
    env: { SHELL: '/bin/zsh' },
    shell: 'zsh',
  })

  assert.deepEqual(launch, {
    shellId: 'zsh',
    shellKind: 'zsh',
    file: '/bin/zsh',
    args: [],
  })
})

test('terminal shell availability detects optional Windows shells without optimistic menu entries', () => {
  const existing = new Set([
    'C:\\Windows\\System32\\cmd.exe',
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Windows\\System32\\wsl.exe',
  ].map((entry) => entry.toLowerCase()))
  const pathExists = (candidate) => existing.has(String(candidate || '').toLowerCase())

  const shells = resolveAvailableTerminalShells({
    platform: 'win32',
    env: {
      ComSpec: 'C:\\Windows\\System32\\cmd.exe',
      ProgramFiles: 'C:\\Program Files',
      SystemRoot: 'C:\\Windows',
      Path: 'C:\\Windows\\System32',
    },
    pathExists,
  }).map((shell) => shell.id)

  assert.deepEqual(shells, ['default', 'cmd', 'git-bash', 'wsl'])
  assert.equal(shells.includes('powershell'), false)
  assert.equal(shells.includes('pwsh'), false)

  const gitBashLaunch = resolveTerminalShellLaunch({
    platform: 'win32',
    env: { ProgramFiles: 'C:\\Program Files' },
    shell: 'git-bash',
    pathExists,
  })
  assert.deepEqual(gitBashLaunch, {
    shellId: 'git-bash',
    shellKind: 'bash',
    file: 'C:\\Program Files\\Git\\bin\\bash.exe',
    args: ['--login', '-i'],
  })

  assert.throws(
    () => resolveTerminalShellLaunch({
      platform: 'win32',
      env: {},
      shell: 'wsl',
      pathExists: () => false,
    }),
    /Shell "wsl" is not available on win32/,
  )
})
