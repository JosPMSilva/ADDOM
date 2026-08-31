import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-terminal-memory-suggest-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { closeDb } = await import('../../src/main/memory/db.mjs')
const { executeTool } = await import('../../src/main/tools/fs-tools.mjs')
const {
  archiveTerminalSession,
  getTerminalSessionArchiveBySessionId,
  updateTerminalSessionArchiveCandidate,
} = await import('../../src/main/terminal/terminal-session-archive-store.mjs')

function isNativeDbLoadError(err) {
  const message = String(err?.message || '')
  return (
    String(err?.code || '') === 'ERR_DLOPEN_FAILED'
    || /NODE_MODULE_VERSION/i.test(message)
    || /better[-_ ]sqlite3/i.test(message)
  )
}

function buildArchiveSnapshot(overrides = {}) {
  return {
    project: 'project-terminal-memory',
    threadId: 'thread-terminal-memory',
    turnId: 'turn-terminal-memory',
    sessionId: 'term_terminal_memory_1',
    cwd: path.join(process.cwd(), 'workspace', 'terminal-memory'),
    shell: 'bash',
    shellKind: 'bash',
    openedAt: 1_700_100_000_000,
    closedAt: 1_700_100_010_000,
    openedBy: 'model',
    closedBy: 'model',
    sessionTitle: 'Dependency fix session',
    closeReason: 'reaped_after_exit',
    exitCode: 0,
    exitSignal: '',
    outputSequence: 2,
    outputTail: [
      { sequence: 1, at: 1_700_100_000_100, data: 'corepack enable\n' },
      { sequence: 2, at: 1_700_100_000_200, data: 'pnpm install\n' },
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
  try { closeDb() } catch { /* cleanup */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* cleanup */ }
})

test('terminal_memory_suggest persists one pending archive-backed suggestion for a closed model session', async (t) => {
  try {
    archiveTerminalSession(buildArchiveSnapshot())

    const result = await executeTool(process.cwd(), 'terminal_memory_suggest', {
      sessionId: 'term_terminal_memory_1',
      summary: 'This workspace uses pnpm through Corepack, so package commands should use pnpm instead of npm.',
      reason: 'Future install and CI fixes in this repo should follow the same package-manager path.',
    })

    assert.equal(result.result.status, 'pending')
    assert.equal(result.result.suggestion?.sessionId, 'term_terminal_memory_1')
    assert.match(String(result.result.guidance || ''), /same-turn local Save\/Dismiss card/i)

    const archive = getTerminalSessionArchiveBySessionId('term_terminal_memory_1')
    assert.equal(archive?.memoryCandidateStatus, 'pending')
    assert.match(String(archive?.memoryCandidateSummary || ''), /pnpm through Corepack/i)
    assert.match(String(archive?.memoryCandidateReason || ''), /package-manager path/i)
  } catch (error) {
    if (isNativeDbLoadError(error)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw error
  }
})

test('terminal_memory_suggest rejects transcript-like content and does not overwrite a dismissed candidate', async (t) => {
  try {
    archiveTerminalSession(buildArchiveSnapshot({
      sessionId: 'term_terminal_memory_transcript',
      sessionTitle: 'Transcript candidate',
    }))
    archiveTerminalSession(buildArchiveSnapshot({
      sessionId: 'term_terminal_memory_2',
      sessionTitle: 'Dismissed session',
    }))
    updateTerminalSessionArchiveCandidate('term_terminal_memory_2', {
      status: 'dismissed',
      summary: 'Existing summary',
      reason: 'Existing reason',
    })

    await assert.rejects(
      () => executeTool(process.cwd(), 'terminal_memory_suggest', {
        sessionId: 'term_terminal_memory_transcript',
        summary: '```bash\npnpm install\n```',
        reason: 'stdout showed the package manager choice.',
      }),
      /transcript/i,
    )

    await assert.rejects(
      () => executeTool(process.cwd(), 'terminal_memory_suggest', {
        sessionId: 'term_terminal_memory_2',
        summary: 'This repo uses pnpm through Corepack for installs.',
        reason: 'Future package work should follow the same path.',
      }),
      /already dismissed/i,
    )

    const archive = getTerminalSessionArchiveBySessionId('term_terminal_memory_2')
    assert.equal(archive?.memoryCandidateStatus, 'dismissed')
    assert.equal(archive?.memoryCandidateSummary, 'Existing summary')
  } catch (error) {
    if (isNativeDbLoadError(error)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw error
  }
})

test('terminal_memory_suggest rejects low-signal summaries and stale turn reuse', async (t) => {
  try {
    archiveTerminalSession(buildArchiveSnapshot({
      sessionId: 'term_terminal_memory_low_signal',
      turnId: 'turn-terminal-memory-live',
      threadId: 'thread-terminal-memory-live',
      sessionTitle: 'Low signal session',
    }))

    await assert.rejects(
      () => executeTool(process.cwd(), 'terminal_memory_suggest', {
        sessionId: 'term_terminal_memory_low_signal',
        summary: 'The current working directory was the repository root and the shell was pwsh.',
        reason: 'For future reference.',
      }, {
        threadId: 'thread-terminal-memory-live',
        turnId: 'turn-terminal-memory-live',
      }),
      /low-signal/i,
    )

    await assert.rejects(
      () => executeTool(process.cwd(), 'terminal_memory_suggest', {
        sessionId: 'term_terminal_memory_low_signal',
        summary: 'This workspace uses pnpm through Corepack for installs.',
        reason: 'Future dependency fixes should follow the same package-manager flow.',
      }, {
        threadId: 'thread-terminal-memory-live',
        turnId: 'turn-terminal-memory-stale',
      }),
      /closed in this turn/i,
    )
  } catch (error) {
    if (isNativeDbLoadError(error)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw error
  }
})
