import { EventEmitter } from 'node:events'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-workspace-terminal-lifecycle-'))
const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-workspace-terminal-projects-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { closeDb } = await import('../../src/main/memory/db.mjs')
const {
  clearAllWorkspaceData,
} = await import('../../src/main/workspace/workspace-store.mjs')
const { registerWorkspaceHandlers } = await import('../../src/main/ipc-handlers/workspace.mjs')
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
  constructor(pid = 4000) {
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

  emitExit(exitCode = 0, signal = undefined) {
    this.emit('exit-event', { exitCode, signal })
  }
}

function createNowSequence(start = 10_000) {
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
    async invoke(channel, payload = {}) {
      const handler = handlers.get(String(channel))
      if (!handler) throw new Error(`No handler registered for ${channel}`)
      return handler({}, payload)
    },
  }
}

function createIpcMainHarnessWithSender() {
  const handlers = new Map()
  return {
    ipcMain: {
      handle(channel, listener) {
        handlers.set(String(channel), listener)
      },
    },
    async invoke(channel, payload = {}, sender = { send() {} }) {
      const handler = handlers.get(String(channel))
      if (!handler) throw new Error(`No handler registered for ${channel}`)
      return handler({ sender }, payload)
    },
  }
}

test.after(async () => {
  try { await clearAllWorkspaceData() } catch { /* best-effort cleanup */ }
  try { closeDb() } catch { /* best-effort cleanup */ }
  try { fs.rmSync(projectRoot, { recursive: true, force: true }) } catch { /* best-effort cleanup */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort cleanup */ }
})

test('workspace remove-project callback can terminate only sessions owned by that project', async (t) => {
  try {
    await clearAllWorkspaceData()
    const harness = createIpcMainHarness()
    const ptys = [new FakePty(5001), new FakePty(5002)]
    let nextPtyIndex = 0
    let nextSessionNumber = 0
    const manager = createTerminalSessionManager({
      platform: 'linux',
      env: { SHELL: '/bin/bash' },
      now: createNowSequence(),
      generateSessionId: () => `term_workspace_project_${++nextSessionNumber}`,
      spawnTerminal: () => ptys[nextPtyIndex++],
    })

    registerWorkspaceHandlers({
      ipcMainImpl: harness.ipcMain,
      onThreadDisposed: async ({ threadId } = {}) => {
        manager.closeSessionsForThread(threadId, { closedBy: 'workspace_reset' })
      },
      onWorkspaceReset: async ({ scope = '', projectPath = '' } = {}) => {
        if (scope === 'project' && projectPath) {
          manager.closeSessionsForProject(projectPath, { closedBy: 'workspace_reset' })
          return
        }
        manager.closeAllSessions({ closedBy: 'workspace_reset' })
      },
    })

    const projectAPath = path.join(projectRoot, 'project-a')
    const projectBPath = path.join(projectRoot, 'project-b')
    fs.mkdirSync(projectAPath, { recursive: true })
    fs.mkdirSync(projectBPath, { recursive: true })

    const openedA = await harness.invoke('v1:workspace:open-project', { path: projectAPath })
    const openedB = await harness.invoke('v1:workspace:open-project', { path: projectBPath })
    const projectAId = String(openedA?.project?.id || '').trim()
    const projectBThreadId = String(openedB?.activeThread?.id || '').trim()

    manager.createSession({
      cwd: projectAPath,
      project: projectAPath,
      threadId: String(openedA?.activeThread?.id || '').trim(),
      shell: 'default',
    })
    manager.createSession({
      cwd: projectBPath,
      project: projectBPath,
      threadId: projectBThreadId,
      shell: 'default',
    })

    const removed = await harness.invoke('v1:workspace:remove-project', { projectId: projectAId })
    assert.equal(removed.ok, true)
    assert.deepEqual(ptys[0].kills, ['SIGHUP'])
    assert.deepEqual(ptys[1].kills, [])

    ptys[0].emitExit(0)

    const remainingSessions = manager.listSessions()
    assert.equal(remainingSessions.length, 1)
    assert.equal(remainingSessions[0]?.threadId, projectBThreadId)

    manager.dispose()
  } catch (error) {
    if (isNativeDbLoadError(error)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw error
  }
})

test('workspace delete-thread callback terminates only sessions bound to the deleted thread', async (t) => {
  try {
    await clearAllWorkspaceData()
    const harness = createIpcMainHarness()
    const ptys = [new FakePty(6001), new FakePty(6002)]
    let nextPtyIndex = 0
    let nextSessionNumber = 0
    const manager = createTerminalSessionManager({
      platform: 'linux',
      env: { SHELL: '/bin/bash' },
      now: createNowSequence(20_000),
      generateSessionId: () => `term_workspace_thread_${++nextSessionNumber}`,
      spawnTerminal: () => ptys[nextPtyIndex++],
    })

    registerWorkspaceHandlers({
      ipcMainImpl: harness.ipcMain,
      onThreadDisposed: async ({ threadId } = {}) => {
        manager.closeSessionsForThread(threadId, { closedBy: 'workspace_reset' })
      },
      onWorkspaceReset: async ({ scope = '', projectPath = '' } = {}) => {
        if (scope === 'project' && projectPath) {
          manager.closeSessionsForProject(projectPath, { closedBy: 'workspace_reset' })
          return
        }
        manager.closeAllSessions({ closedBy: 'workspace_reset' })
      },
    })

    const projectPath = path.join(projectRoot, 'thread-project')
    fs.mkdirSync(projectPath, { recursive: true })

    const opened = await harness.invoke('v1:workspace:open-project', { path: projectPath })
    const projectId = String(opened?.project?.id || '').trim()
    const threadAId = String(opened?.activeThread?.id || '').trim()
    const createdThread = await harness.invoke('v1:workspace:create-thread', {
      projectId,
      title: 'Second thread',
    })
    const threadBId = String(createdThread?.thread?.id || '').trim()

    manager.createSession({
      cwd: projectPath,
      project: projectPath,
      threadId: threadAId,
      shell: 'default',
    })
    manager.createSession({
      cwd: projectPath,
      project: projectPath,
      threadId: threadBId,
      shell: 'default',
    })

    const deleted = await harness.invoke('v1:workspace:delete-thread', { threadId: threadAId })
    assert.equal(deleted.ok, true)
    assert.deepEqual(ptys[0].kills, ['SIGHUP'])
    assert.deepEqual(ptys[1].kills, [])

    ptys[0].emitExit(0)

    const remainingSessions = manager.listSessions()
    assert.equal(remainingSessions.length, 1)
    assert.equal(remainingSessions[0]?.threadId, threadBId)

    manager.dispose()
  } catch (error) {
    if (isNativeDbLoadError(error)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw error
  }
})

test('closing sessions for a deleted thread suppresses recovery archives', () => {
  const pty = new FakePty(7001)
  const archives = []
  const manager = createTerminalSessionManager({
    archiveClosedSession: (snapshot) => archives.push(snapshot),
    env: { SHELL: '/bin/bash' },
    generateSessionId: () => 'term_deleted_thread',
    now: createNowSequence(30_000),
    platform: 'linux',
    spawnTerminal: () => pty,
  })

  manager.createSession({
    cwd: projectRoot,
    project: projectRoot,
    shell: 'default',
    threadId: 'deleted-thread',
  })
  manager.closeSessionsForThread('deleted-thread', {
    archive: false,
    closedBy: 'workspace_reset',
  })
  pty.emitExit(0)

  assert.deepEqual(archives, [])
  assert.equal(manager.hasSession('term_deleted_thread'), false)
  manager.dispose()
})

test('workspace handlers emit active-project-changed for external activation calls and suppress it when requested', async (t) => {
  try {
    await clearAllWorkspaceData()
    const harness = createIpcMainHarnessWithSender()
    const sent = []
    const activeProjectPaths = []
    const sender = {
      send(channel, payload) {
        sent.push({ channel, payload })
      },
    }

    registerWorkspaceHandlers({
      ipcMainImpl: harness.ipcMain,
      sendVersionedImpl: (target, channel, payload) => target.send(channel, payload),
      onActiveProjectPathChanged: (projectPath) => activeProjectPaths.push(projectPath),
    })

    const projectPath = path.join(projectRoot, 'activation-project')
    fs.mkdirSync(projectPath, { recursive: true })

    const opened = await harness.invoke('v1:workspace:open-project', { path: projectPath }, sender)
    assert.ok(String(opened?.project?.id || '').trim())
    assert.deepEqual(sent[0], {
      channel: 'workspace:active-project-changed',
      payload: {
        action: 'open-project',
        project: opened.project,
        activeThread: opened.activeThread,
      },
    })

    sent.length = 0
    const created = await harness.invoke('v1:workspace:create-thread', {
      projectId: String(opened?.project?.id || ''),
      title: 'External thread',
    }, sender)
    assert.deepEqual(sent, [{
      channel: 'workspace:active-project-changed',
      payload: {
        action: 'create-thread',
        project: created.project,
        activeThread: created.thread,
      },
    }])

    sent.length = 0
    const selected = await harness.invoke('v1:workspace:set-active-thread', {
      projectId: String(opened?.project?.id || ''),
      threadId: String(opened?.activeThread?.id || ''),
    }, sender)
    assert.deepEqual(sent, [{
      channel: 'workspace:active-project-changed',
      payload: {
        action: 'set-active-thread',
        project: selected.project,
        activeThread: selected.thread,
      },
    }])

    sent.length = 0
    const reopened = await harness.invoke('v1:workspace:set-active-project', {
      projectId: String(opened?.project?.id || ''),
      notifyRenderer: false,
    }, sender)
    assert.ok(String(reopened?.project?.id || '').trim())
    assert.deepEqual(sent, [])

    const clearedSilently = await harness.invoke('v1:workspace:clear-active-project', {
      notifyRenderer: false,
    }, sender)
    assert.deepEqual(clearedSilently, { project: null, activeThread: null })
    assert.equal(activeProjectPaths.at(-1), '')
    assert.deepEqual(sent, [])

    await harness.invoke('v1:workspace:set-active-project', {
      projectId: String(opened?.project?.id || ''),
      notifyRenderer: false,
    }, sender)
    sent.length = 0
    const cleared = await harness.invoke('v1:workspace:clear-active-project', {}, sender)
    assert.deepEqual(cleared, { project: null, activeThread: null })
    assert.equal(activeProjectPaths.at(-1), '')
    assert.deepEqual(sent, [{
      channel: 'workspace:active-project-changed',
      payload: {
        action: 'clear-active-project',
        project: null,
        activeThread: null,
      },
    }])
  } catch (error) {
    if (isNativeDbLoadError(error)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw error
  }
})
