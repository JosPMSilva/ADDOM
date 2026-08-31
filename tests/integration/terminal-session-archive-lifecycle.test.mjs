import { EventEmitter } from 'node:events'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-terminal-archive-lifecycle-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { closeDb } = await import('../../src/main/memory/db.mjs')
const {
  archiveTerminalSession,
  listTerminalSessionArchives,
  getTerminalSessionArchiveBySessionId,
} = await import('../../src/main/terminal/terminal-session-archive-store.mjs')
const { createTerminalSessionManager } = await import('../../src/main/tools/terminal-session-manager.mjs')

function isNativeDbLoadError(err) {
  const message = String(err?.message || '')
  return (
    String(err?.code || '') === 'ERR_DLOPEN_FAILED'
    || /NODE_MODULE_VERSION/i.test(message)
    || /better[-_ ]sqlite3/i.test(message)
  )
}

class FakePty extends EventEmitter {
  constructor(pid = 777) {
    super()
    this.pid = pid
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

  write() {}

  resize() {}

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

  runAll() {
    const pending = Array.from(this.tasks.values())
    this.tasks.clear()
    for (const task of pending) {
      task.fn()
    }
  }
}

function createNowSequence(start = 10_000) {
  let value = start
  return () => {
    value += 1
    return value
  }
}

function createArchivingManager({ pty, timers, sessionId }) {
  return createTerminalSessionManager({
    platform: 'linux',
    env: { SHELL: '/bin/bash' },
    now: createNowSequence(),
    generateSessionId: () => sessionId,
    closeFallbackMs: 25,
    spawnTerminal: () => pty,
    setTimer: (fn, delay) => timers.setTimer(fn, delay),
    clearTimer: (id) => timers.clearTimer(id),
    archiveClosedSession: (snapshot) => {
      archiveTerminalSession(snapshot, {
        maxTailChars: 256,
        maxTailChunks: 16,
        maxPayloadRowsPerProject: 20,
        maxPayloadBytesPerProject: 100_000,
      })
    },
  })
}

function createCreatePayload(overrides = {}) {
  return {
    project: 'project-lifecycle',
    threadId: 'thread-archive',
    turnId: 'turn-archive',
    openedBy: 'model',
    sessionTitle: 'Lifecycle archive',
    cwd: process.cwd(),
    shell: 'default',
    policy: {
      type: 'terminal_session_policy_v1',
      profileHint: 'workspace_terminal',
      hostAccessRequired: false,
    },
    ...overrides,
  }
}

test.after(() => {
  try { closeDb() } catch { /* best-effort test cleanup */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('terminal session lifecycle archives normal close, exit-then-close, and close-timeout fallback exactly once', (t) => {
  try {
    const ptyNormal = new FakePty()
    const timersNormal = new FakeTimerQueue()
    const managerNormal = createArchivingManager({
      pty: ptyNormal,
      timers: timersNormal,
      sessionId: 'term_lifecycle_normal',
    })
    managerNormal.createSession(createCreatePayload({ sessionTitle: 'Normal close' }))
    ptyNormal.emitData('normal\n')
    managerNormal.closeSession('term_lifecycle_normal', { closedBy: 'model' })
    ptyNormal.emitExit(0)
    managerNormal.dispose()

    const ptyExited = new FakePty()
    const timersExited = new FakeTimerQueue()
    const managerExited = createArchivingManager({
      pty: ptyExited,
      timers: timersExited,
      sessionId: 'term_lifecycle_exit_then_close',
    })
    managerExited.createSession(createCreatePayload({ sessionTitle: 'Exit then close' }))
    ptyExited.emitData('exit-first\n')
    ptyExited.emitExit(0)
    const exitedSession = managerExited.getSession('term_lifecycle_exit_then_close')
    assert.equal(exitedSession.status, 'exited')
    managerExited.closeSession('term_lifecycle_exit_then_close', { closedBy: 'user' })
    managerExited.dispose()

    const ptyFallback = new FakePty()
    const timersFallback = new FakeTimerQueue()
    const managerFallback = createArchivingManager({
      pty: ptyFallback,
      timers: timersFallback,
      sessionId: 'term_lifecycle_fallback',
    })
    managerFallback.createSession(createCreatePayload({ sessionTitle: 'Fallback close' }))
    ptyFallback.emitData('stuck\n')
    managerFallback.closeSession('term_lifecycle_fallback', { closedBy: 'model' })
    timersFallback.runAll()
    managerFallback.dispose()

    const archives = listTerminalSessionArchives('project-lifecycle')
    assert.equal(archives.length, 3)
    assert.deepEqual(
      archives.map((entry) => entry.sessionId).sort(),
      [
        'term_lifecycle_exit_then_close',
        'term_lifecycle_fallback',
        'term_lifecycle_normal',
      ],
    )

    const normal = getTerminalSessionArchiveBySessionId('term_lifecycle_normal')
    assert.equal(normal.closeReason, 'close_requested')
    assert.equal(normal.status, 'ended')
    assert.equal(normal.outputTail.length, 1)

    const exitThenClose = getTerminalSessionArchiveBySessionId('term_lifecycle_exit_then_close')
    assert.equal(exitThenClose.closeReason, 'close_after_exit')
    assert.equal(exitThenClose.status, 'ended')
    assert.equal(exitThenClose.closedBy, 'user')

    const fallback = getTerminalSessionArchiveBySessionId('term_lifecycle_fallback')
    assert.equal(fallback.closeReason, 'close_timeout_fallback')
    assert.equal(fallback.status, 'terminated')
    assert.equal(fallback.outputTail.length, 1)
    assert.equal(fallback.metadata?.runtimeCloseReason, 'close_timeout_fallback')
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})
