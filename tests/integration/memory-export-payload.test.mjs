import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-memory-export-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { closeDb, getDb } = await import('../../src/main/memory/db.mjs')
const { addNode } = await import('../../src/main/memory/memory-store.mjs')
const {
  archiveTerminalSession,
  updateTerminalSessionArchiveCandidate,
  linkTerminalSessionArchiveMemoryNode,
} = await import('../../src/main/terminal/terminal-session-archive-store.mjs')
const { buildProjectExportPayload } = await import('../../src/main/ipc-handlers/memory.mjs')

function isNativeDbLoadError(err) {
  const message = String(err?.message || '')
  return (
    String(err?.code || '') === 'ERR_DLOPEN_FAILED'
    || /NODE_MODULE_VERSION/i.test(message)
    || /better[-_ ]sqlite3/i.test(message)
  )
}

test.after(() => {
  try { closeDb() } catch { /* best-effort test cleanup */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('project export includes deleted-thread archived Memory', async (t) => {
  try {
    const project = 'memory-export-deleted-thread-project'
    const id = await addNode({
      project,
      topic: 'Archived thread recovery',
      content: 'Preserve this deleted-thread note in export.',
      source: 'user_memory',
      scope: 'thread',
      threadId: 'thread-export-deleted',
    })
    getDb().prepare(`
      UPDATE nodes
      SET origin_thread_state = 'deleted', origin_thread_deleted_at = ?
      WHERE id = ?
    `).run(1_700_000_000_000, id)

    const payload = buildProjectExportPayload(project)
    const exported = payload.memory.nodes.find((node) => node.id === id)
    assert.equal(exported?.originThreadState, 'deleted')
    assert.equal(exported?.originThreadDeletedAt, 1_700_000_000_000)
  } catch (error) {
    if (isNativeDbLoadError(error)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw error
  }
})

test('project export payload includes terminal archive audit data and linked memory provenance', async (t) => {
  try {
    const project = 'memory-export-project'
    const savedNodeId = await addNode({
      project,
      topic: 'Terminal summary: bootstrap',
      content: 'Use Corepack before installing workspace dependencies.',
      source: 'terminal_summary',
      tags: [
        'terminal_summary',
        'terminal_session',
        'terminal_session:term_export_accepted',
        'terminal_thread:thread_export',
        'terminal_accepted_at:1700000000000',
      ],
    })

    archiveTerminalSession({
      project,
      threadId: 'thread_export',
      turnId: 'turn_export',
      sessionId: 'term_export_accepted',
      cwd: path.join(process.cwd(), 'workspace', 'accepted'),
      shell: 'bash',
      shellKind: 'bash',
      openedAt: 1_700_000_000_000,
      closedAt: 1_700_000_010_000,
      openedBy: 'model',
      closedBy: 'model',
      sessionTitle: 'Accepted archive',
      outputTail: [{ sequence: 1, at: 1_700_000_000_100, data: 'npm test\n' }],
    })
    updateTerminalSessionArchiveCandidate('term_export_accepted', {
      status: 'pending',
      summary: 'Use Corepack before installing workspace dependencies.',
      reason: 'Dependency work in this repo follows the Corepack flow.',
    })
    linkTerminalSessionArchiveMemoryNode('term_export_accepted', {
      memoryNodeId: savedNodeId,
      status: 'accepted',
    })

    archiveTerminalSession({
      project,
      threadId: 'thread_export',
      turnId: 'turn_export',
      sessionId: 'term_export_dismissed',
      cwd: path.join(process.cwd(), 'workspace', 'dismissed'),
      shell: 'bash',
      shellKind: 'bash',
      openedAt: 1_700_000_020_000,
      closedAt: 1_700_000_030_000,
      openedBy: 'model',
      closedBy: 'model',
      sessionTitle: 'Dismissed archive',
      outputTail: [{ sequence: 1, at: 1_700_000_020_100, data: 'npm run lint\n' }],
    })
    updateTerminalSessionArchiveCandidate('term_export_dismissed', {
      status: 'dismissed',
      summary: 'Run lint before packaging releases.',
      reason: 'Release verification expects a clean lint pass first.',
    })

    const payload = buildProjectExportPayload(project)

    assert.equal(payload.schemaVersion, 2)
    assert.equal(payload.memory.totalNodes, 1)
    assert.equal(payload.terminalArchive.totalSessions, 2)
    assert.equal(payload.terminalArchive.suggestionStatusCounts.accepted, 1)
    assert.equal(payload.terminalArchive.suggestionStatusCounts.dismissed, 1)
    assert.equal(payload.terminalArchive.linkedMemoryNodeCount, 1)

    const acceptedArchive = payload.terminalArchive.sessions.find((entry) => entry.sessionId === 'term_export_accepted')
    const dismissedArchive = payload.terminalArchive.sessions.find((entry) => entry.sessionId === 'term_export_dismissed')
    const exportedNode = payload.memory.nodes.find((entry) => entry.id === savedNodeId)

    assert.equal(acceptedArchive?.memoryCandidateStatus, 'accepted')
    assert.equal(acceptedArchive?.memoryNodeId, savedNodeId)
    assert.match(String(acceptedArchive?.closedAtIso || ''), /T/)
    assert.equal(dismissedArchive?.memoryCandidateStatus, 'dismissed')
    assert.equal(String(dismissedArchive?.memoryNodeId || ''), '')
    assert.equal(exportedNode?.provenance?.sessionId, 'term_export_accepted')
    assert.equal(exportedNode?.provenance?.threadId, 'thread_export')
  } catch (error) {
    if (isNativeDbLoadError(error)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw error
  }
})
