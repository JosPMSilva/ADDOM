import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-terminal-archive-ipc-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { closeDb } = await import('../../src/main/memory/db.mjs')
const { getNode, listNodes } = await import('../../src/main/memory/memory-store.mjs')
const { archiveTerminalSession } = await import('../../src/main/terminal/terminal-session-archive-store.mjs')
const { updateTerminalSessionArchiveCandidate } = await import('../../src/main/terminal/terminal-session-archive-store.mjs')
const { registerTerminalSessionArchiveHandlers } = await import('../../src/main/ipc-handlers/terminal-session-archive.mjs')

function isNativeDbLoadError(err) {
  const message = String(err?.message || '')
  return (
    String(err?.code || '') === 'ERR_DLOPEN_FAILED'
    || /NODE_MODULE_VERSION/i.test(message)
    || /better[-_ ]sqlite3/i.test(message)
  )
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

function buildArchiveSnapshot(overrides = {}) {
  return {
    project: 'project-ipc',
    threadId: 'thread-ipc',
    turnId: 'turn-ipc',
    sessionId: 'term_archive_ipc_1',
    cwd: path.join(process.cwd(), 'workspace', 'archive-ipc'),
    shell: 'bash',
    shellKind: 'bash',
    openedAt: 1_700_000_000_000,
    closedAt: 1_700_000_010_000,
    openedBy: 'model',
    closedBy: 'model',
    sessionTitle: 'Archive IPC',
    closeReason: 'reaped_after_exit',
    exitCode: 0,
    exitSignal: '',
    outputSequence: 2,
    outputTail: [
      { sequence: 1, at: 1_700_000_000_100, data: 'npm ci\n' },
      { sequence: 2, at: 1_700_000_000_200, data: 'npm test\n' },
    ],
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

test('terminal session archive IPC exposes list, detail, dismiss, and accept handlers', async (t) => {
  try {
    archiveTerminalSession(buildArchiveSnapshot())
    updateTerminalSessionArchiveCandidate('term_archive_ipc_1', {
      status: 'pending',
      summary: 'This repo uses pnpm through Corepack for installs.',
      reason: 'Future dependency fixes should use the same package-manager flow.',
    })
    archiveTerminalSession(buildArchiveSnapshot({
      sessionId: 'term_archive_ipc_3',
      sessionTitle: 'Dismiss suggestion',
    }))
    updateTerminalSessionArchiveCandidate('term_archive_ipc_3', {
      status: 'pending',
      summary: 'Run database migrations before starting local services.',
      reason: 'Boot order matters for local recovery sessions.',
    })
    archiveTerminalSession(buildArchiveSnapshot({
      sessionId: 'term_archive_ipc_2',
      sessionTitle: 'Missing suggestion',
    }))

    const harness = createIpcMainHarness()
    registerTerminalSessionArchiveHandlers({
      ipcMainImpl: harness.ipcMain,
    })

    const listed = await harness.invoke('v1:terminal:archive:list', {}, {
      projectFolder: 'project-ipc',
    })
    assert.equal(listed.ok, true)
    assert.equal(listed.archives.length, 3)
    assert.ok(listed.archives.some((archive) => archive.sessionId === 'term_archive_ipc_1'))
    assert.ok(listed.archives.some((archive) => archive.sessionId === 'term_archive_ipc_2'))
    assert.ok(listed.archives.some((archive) => archive.sessionId === 'term_archive_ipc_3'))

    const detailed = await harness.invoke('v1:terminal:archive:get', {}, {
      projectFolder: 'project-ipc',
      sessionId: 'term_archive_ipc_1',
    })
    assert.equal(detailed.ok, true)
    assert.equal(detailed.archive?.sessionTitle, 'Archive IPC')

    const accepted = await harness.invoke('v1:terminal:archive:accept-suggestion', {
      sender: { isDestroyed: () => false },
    }, {
      projectFolder: 'project-ipc',
      sessionId: 'term_archive_ipc_1',
    })
    assert.equal(accepted.ok, true)
    assert.equal(accepted.archive?.memoryCandidateStatus, 'accepted')
    assert.ok(String(accepted.archive?.memoryNodeId || '').length > 0)
    const nodes = listNodes('project-ipc', {
      threadId: 'thread-ipc',
      includeProject: false,
    })
    const savedNode = nodes.find((node) => node.id === accepted.archive?.memoryNodeId)
    assert.equal(Boolean(savedNode), true)
    assert.equal(savedNode?.source, 'terminal_summary')
    assert.equal(savedNode?.scope, 'thread')
    assert.equal(savedNode?.threadId, 'thread-ipc')
    assert.equal(savedNode?.originThreadId, 'thread-ipc')
    assert.equal(savedNode?.promotedAt, null)
    assert.equal(savedNode?.provenance?.kind, 'terminal')
    assert.equal(savedNode?.provenance?.sessionId, 'term_archive_ipc_1')
    assert.equal(savedNode?.provenance?.threadId, 'thread-ipc')
    assert.equal(Array.isArray(savedNode?.displayTags), true)
    assert.deepEqual(savedNode?.displayTags || [], [])
    assert.match(String(savedNode?.content || ''), /pnpm through Corepack/i)
    assert.match(JSON.stringify(savedNode?.tags || []), /terminal_session:term_archive_ipc_1/)

    const acceptedAgain = await harness.invoke('v1:terminal:archive:accept-suggestion', {
      sender: { isDestroyed: () => false },
    }, {
      projectFolder: 'project-ipc',
      sessionId: 'term_archive_ipc_1',
    })
    assert.equal(acceptedAgain.ok, true)
    assert.equal(acceptedAgain.archive?.memoryNodeId, accepted.archive?.memoryNodeId)
    assert.equal(
      listNodes('project-ipc', {
        threadId: 'thread-ipc',
        includeProject: false,
      }).filter((node) => node.source === 'terminal_summary').length,
      1,
    )

    const dismissed = await harness.invoke('v1:terminal:archive:dismiss-suggestion', {}, {
      projectFolder: 'project-ipc',
      sessionId: 'term_archive_ipc_3',
    })
    assert.equal(dismissed.ok, true)
    assert.equal(dismissed.archive?.memoryCandidateStatus, 'dismissed')
    assert.equal(String(dismissed.archive?.memoryNodeId || ''), '')

    const savedFromDismissedArchive = await harness.invoke('v1:terminal:archive:save-to-memory', {
      sender: { isDestroyed: () => false },
    }, {
      projectFolder: 'project-ipc',
      sessionId: 'term_archive_ipc_3',
      targetScope: 'project',
    })
    assert.equal(savedFromDismissedArchive.ok, true)
    assert.equal(savedFromDismissedArchive.archive?.memoryCandidateStatus, 'accepted')
    assert.ok(String(savedFromDismissedArchive.archive?.memoryNodeId || '').length > 0)
    const projectSavedNode = getNode(savedFromDismissedArchive.archive?.memoryNodeId)
    assert.equal(projectSavedNode?.scope, 'project')
    assert.equal(projectSavedNode?.threadId, null)
    assert.equal(projectSavedNode?.originThreadId, 'thread-ipc')
    assert.ok(Number(projectSavedNode?.promotedAt || 0) > 0)
    assert.equal(
      listNodes('project-ipc').filter((node) => node.source === 'terminal_summary').length,
      1,
    )

    const missingSuggestion = await harness.invoke('v1:terminal:archive:accept-suggestion', {}, {
      projectFolder: 'project-ipc',
      sessionId: 'term_archive_ipc_2',
    })
    assert.equal(missingSuggestion.ok, false)
    assert.equal(missingSuggestion.error, 'terminal_archive_suggestion_missing')

    const unavailableManualSave = await harness.invoke('v1:terminal:archive:save-to-memory', {}, {
      projectFolder: 'project-ipc',
      sessionId: 'term_archive_ipc_2',
    })
    assert.equal(unavailableManualSave.ok, false)
    assert.equal(unavailableManualSave.error, 'terminal_archive_manual_promotion_unavailable')
  } catch (error) {
    if (isNativeDbLoadError(error)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw error
  }
})

test('terminal session archive dismiss is idempotent after accept', async (t) => {
  try {
    archiveTerminalSession(buildArchiveSnapshot({
      sessionId: 'term_archive_ipc_dismiss_after_accept',
      sessionTitle: 'Dismiss after accept',
    }))
    updateTerminalSessionArchiveCandidate('term_archive_ipc_dismiss_after_accept', {
      status: 'pending',
      summary: 'This repo uses pnpm through Corepack for installs.',
      reason: 'Future dependency fixes should use the same package-manager flow.',
    })

    const harness = createIpcMainHarness()
    registerTerminalSessionArchiveHandlers({
      ipcMainImpl: harness.ipcMain,
    })

    const accepted = await harness.invoke('v1:terminal:archive:accept-suggestion', {
      sender: { isDestroyed: () => false },
    }, {
      projectFolder: 'project-ipc',
      sessionId: 'term_archive_ipc_dismiss_after_accept',
    })
    assert.equal(accepted.ok, true)
    assert.equal(accepted.archive?.memoryCandidateStatus, 'accepted')

    const dismissed = await harness.invoke('v1:terminal:archive:dismiss-suggestion', {}, {
      projectFolder: 'project-ipc',
      sessionId: 'term_archive_ipc_dismiss_after_accept',
    })
    assert.equal(dismissed.ok, true)
    assert.equal(dismissed.archive?.memoryCandidateStatus, 'accepted')
    assert.equal(dismissed.archive?.memoryNodeId, accepted.archive?.memoryNodeId)
  } catch (error) {
    if (isNativeDbLoadError(error)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw error
  }
})

test('terminal session archive delete removes the archive row without requiring memory cleanup', async (t) => {
  try {
    archiveTerminalSession(buildArchiveSnapshot({
      sessionId: 'term_archive_ipc_delete_1',
      sessionTitle: 'Delete archive',
    }))
    updateTerminalSessionArchiveCandidate('term_archive_ipc_delete_1', {
      status: 'accepted',
      summary: 'A saved summary already exists for this archive.',
      reason: 'Archive deletion should not be blocked by memory linkage state.',
    })

    const harness = createIpcMainHarness()
    registerTerminalSessionArchiveHandlers({
      ipcMainImpl: harness.ipcMain,
    })

    const deleted = await harness.invoke('v1:terminal:archive:delete', {}, {
      projectFolder: 'project-ipc',
      sessionId: 'term_archive_ipc_delete_1',
    })
    assert.equal(deleted.ok, true)
    assert.equal(deleted.sessionId, 'term_archive_ipc_delete_1')
    assert.equal(deleted.deletedArchive?.sessionId, 'term_archive_ipc_delete_1')

    const missing = await harness.invoke('v1:terminal:archive:get', {}, {
      projectFolder: 'project-ipc',
      sessionId: 'term_archive_ipc_delete_1',
    })
    assert.equal(missing.ok, false)
    assert.equal(missing.error, 'terminal_archive_not_found')
  } catch (error) {
    if (isNativeDbLoadError(error)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw error
  }
})

test('terminal session archive manual save is idempotent after a dismissed suggestion', async (t) => {
  try {
    archiveTerminalSession(buildArchiveSnapshot({
      sessionId: 'term_archive_ipc_manual_idempotent',
      sessionTitle: 'Manual idempotent archive save',
    }))
    updateTerminalSessionArchiveCandidate('term_archive_ipc_manual_idempotent', {
      status: 'dismissed',
      summary: 'Run lint before packaging desktop releases.',
      reason: 'Release verification in this repo expects a clean lint pass first.',
    })

    const harness = createIpcMainHarness()
    registerTerminalSessionArchiveHandlers({
      ipcMainImpl: harness.ipcMain,
    })

    const firstSave = await harness.invoke('v1:terminal:archive:save-to-memory', {
      sender: { isDestroyed: () => false },
    }, {
      projectFolder: 'project-ipc',
      sessionId: 'term_archive_ipc_manual_idempotent',
      targetScope: 'project',
    })
    assert.equal(firstSave.ok, true)
    assert.equal(firstSave.archive?.memoryCandidateStatus, 'accepted')

    const secondSave = await harness.invoke('v1:terminal:archive:save-to-memory', {
      sender: { isDestroyed: () => false },
    }, {
      projectFolder: 'project-ipc',
      sessionId: 'term_archive_ipc_manual_idempotent',
      targetScope: 'project',
    })
    assert.equal(secondSave.ok, true)
    assert.equal(secondSave.archive?.memoryNodeId, firstSave.archive?.memoryNodeId)
  } catch (error) {
    if (isNativeDbLoadError(error)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw error
  }
})
