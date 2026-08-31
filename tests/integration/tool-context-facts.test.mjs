import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  buildRecentExecutionBriefContextFromFacts,
  buildRecentTerminalSessionInsights,
  buildToolContextFacts,
  collectRecentToolContextFacts,
  persistToolContextFacts,
  summarizeToolContextFacts,
} from '../../src/main/chat/tool-context-facts.mjs'
import { closeDb } from '../../src/main/memory/db.mjs'
import { appendEvents, createThread, registerProject } from '../../src/main/workspace/workspace-store.mjs'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-tool-context-facts-'))
const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-tool-context-project-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

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
  try { fs.rmSync(projectPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('buildToolContextFacts records deterministic read, write, command, and failure facts', () => {
  const fileReadFacts = buildToolContextFacts({
    toolName: 'read_file',
    toolInput: { path: 'src/app.js' },
    result: 'console.log("hello")',
    decision: 'approved',
    isError: false,
  })
  assert.equal(fileReadFacts[0]?.kind, 'file_read')
  assert.equal(fileReadFacts[0]?.filePath, 'src/app.js')
  assert.match(String(fileReadFacts[0]?.contentHash || ''), /^[a-f0-9]{64}$/)

  const fileWriteFacts = buildToolContextFacts({
    toolName: 'write_file',
    decision: 'approved',
    writeArtifactChanges: [{
      filePath: 'src/app.js',
      changeType: 'update',
      newRevId: 'rev_2',
      prevRevId: 'rev_1',
      contentBytes: 120,
    }],
  })
  assert.deepEqual(fileWriteFacts, [{
    kind: 'file_write',
    toolName: 'write_file',
    filePath: 'src/app.js',
    changeType: 'update',
    newRevisionId: 'rev_2',
    previousRevisionId: 'rev_1',
    contentBytes: 120,
  }])

  const commandFacts = buildToolContextFacts({
    toolName: 'run_command',
    toolInput: { command: 'npm test' },
    result: 'PASS all tests',
    decision: 'approved',
    isError: false,
  })
  assert.equal(commandFacts[0]?.kind, 'command_output')
  assert.equal(commandFacts[0]?.command, 'npm test')
  assert.match(String(commandFacts[0]?.outputHash || ''), /^[a-f0-9]{64}$/)

  const failureFacts = buildToolContextFacts({
    toolName: 'apply_patch',
    result: 'Tool error',
    isError: true,
    decision: 'approved',
    failureClass: 'MALFORMED_PATCH_SYNTAX',
    lintCode: 'apply_patch_missing_hunks',
    rerouteToolName: 'write_file',
  })
  assert.deepEqual(failureFacts, [{
    kind: 'failure_class',
    toolName: 'apply_patch',
    failureClass: 'MALFORMED_PATCH_SYNTAX',
    lintCode: 'apply_patch_missing_hunks',
    rerouteToolName: 'write_file',
  }])

  const terminalFacts = buildToolContextFacts({
    toolName: 'terminal_session_wait_for_output',
    toolInput: { sessionId: 'term_1', sinceSequence: 12, pattern: 'server ready' },
    result: {
      sessionId: 'term_1',
      session: { id: 'term_1', outputSequence: 18 },
      wait: { matched: true, timedOut: false, matchType: 'pattern', pattern: 'server ready' },
      output: { nextSequence: 18 },
    },
    decision: 'approved',
    isError: false,
  })
  assert.deepEqual(terminalFacts, [{
    kind: 'terminal_session',
    toolName: 'terminal_session_wait_for_output',
    action: 'wait_for_output',
    sessionId: 'term_1',
    outputSequence: 18,
    sinceSequence: 12,
    outputProgress: true,
    matched: true,
    timedOut: false,
    matchType: 'pattern',
    expectedPattern: 'server ready',
  }])
})

test('persistToolContextFacts emits tool_context_fact timeline events', () => {
  const persisted = []
  persistToolContextFacts({
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    threadId: 'thread_facts',
    turnId: 'turn_facts',
    stepId: 'turn_facts:step:1',
    sequence: 1,
    startedAt: 10,
    finishedAt: 20,
    durationMs: 10,
    facts: [{
      kind: 'file_read',
      toolName: 'read_file',
      filePath: 'src/app.js',
      contentHash: 'abc',
    }],
  })

  assert.equal(persisted.length, 1)
  assert.equal(persisted[0]?.kind, 'tool_context_fact')
  assert.equal(persisted[0]?.payload?.meta?.fact?.filePath, 'src/app.js')
})

test('collectRecentToolContextFacts reads persisted tool context facts from timeline storage', (t) => {
  try {
    const project = registerProject(projectPath)
    const created = createThread(project.project.id, 'Tool facts')

    appendEvents(created.thread.id, [
      {
        kind: 'tool_context_fact',
        role: 'system',
        content: 'Read src/app.js',
        meta: {
          fact: {
            kind: 'file_read',
            toolName: 'read_file',
            filePath: 'src/app.js',
            contentHash: 'hash_read',
          },
        },
      },
      {
        kind: 'tool_context_fact',
        role: 'system',
        content: 'Failure class recorded',
        meta: {
          fact: {
            kind: 'failure_class',
            toolName: 'apply_patch',
            failureClass: 'MALFORMED_PATCH_SYNTAX',
          },
        },
      },
    ])

    const facts = collectRecentToolContextFacts(created.thread.id)
    assert.deepEqual(facts, [
      {
        kind: 'file_read',
        toolName: 'read_file',
        filePath: 'src/app.js',
        contentHash: 'hash_read',
      },
      {
        kind: 'failure_class',
        toolName: 'apply_patch',
        failureClass: 'MALFORMED_PATCH_SYNTAX',
      },
    ])
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('tool context fact helpers build bounded brief and handoff summaries', () => {
  const facts = [
    {
      kind: 'file_read',
      toolName: 'read_file',
      filePath: 'src/app.js',
      contentHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    },
    {
      kind: 'command_output',
      toolName: 'run_command',
      command: 'npm test',
      outputHash: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
    },
    {
      kind: 'failure_class',
      toolName: 'apply_patch',
      failureClass: 'MALFORMED_PATCH_SYNTAX',
    },
    {
      kind: 'terminal_session',
      toolName: 'terminal_session_write',
      action: 'write',
      sessionId: 'term_1',
      commandPreview: 'npm test',
      commandHash: 'a'.repeat(64),
      inputBytes: 9,
      outputSequence: 12,
    },
    {
      kind: 'terminal_session',
      toolName: 'terminal_session_wait_for_output',
      action: 'wait_for_output',
      sessionId: 'term_1',
      outputSequence: 12,
      sinceSequence: 12,
      outputProgress: false,
      matched: false,
      timedOut: true,
      matchType: 'pattern',
    },
    {
      kind: 'terminal_session',
      toolName: 'terminal_session_wait_for_output',
      action: 'wait_for_output',
      sessionId: 'term_1',
      outputSequence: 12,
      sinceSequence: 12,
      outputProgress: false,
      matched: false,
      timedOut: true,
      matchType: 'pattern',
    },
  ]

  assert.deepEqual(buildRecentExecutionBriefContextFromFacts(facts), {
    lastFilePath: 'src/app.js',
    lastFailedToolName: 'apply_patch',
    lastFailureClass: 'MALFORMED_PATCH_SYNTAX',
    lastToolFamily: 'terminal_session_wait_for_output',
    lastTerminalSessionId: 'term_1',
    lastTerminalAction: 'wait_for_output',
    lastTerminalCommand: 'npm test',
  })
  assert.deepEqual(summarizeToolContextFacts(facts, { maxItems: 3 }), [
    'terminal term_1 wait timeout @ 12 (no progress)',
    'terminal term_1 write "npm test"',
    'failure apply_patch (MALFORMED_PATCH_SYNTAX)',
  ])
  assert.deepEqual(buildRecentTerminalSessionInsights(facts, {
    visibleTerminalSessions: [
      {
        sessionId: 'term_1',
        access: 'ai_reusable',
        suggestedUse: 'reuse this session for the ongoing interactive workflow',
      },
    ],
  }), {
    recentSessionId: 'term_1',
    recentAction: 'wait_for_output',
    recentCommandPreview: 'npm test',
    recentOutputSequence: 12,
    reusableSessionId: 'term_1',
    reusableSessionReason: 'reuse this session for the ongoing interactive workflow',
    loopRisk: 'wait_timeout_streak',
    waitTimeoutsWithoutProgress: 2,
    repeatedWritesWithoutProgress: 0,
  })
})
