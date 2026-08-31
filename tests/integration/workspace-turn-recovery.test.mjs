import test from 'node:test'
import assert from 'node:assert/strict'

import {
  reconcileInterruptedWorkspaceTurns,
} from '../../src/main/workspace/workspace-turn-recovery.mjs'

function createDb(rows = []) {
  return {
    prepare(sql) {
      assert.match(sql, /ROW_NUMBER\(\) OVER/i)
      return { all: () => rows }
    },
  }
}

test('reconciles unfinished turns once and preserves terminal turns', async () => {
  const appended = []
  const rows = [
    { project_id: 'project-1', thread_id: 'thread-1', turn_id: 'turn-1', kind: 'turn_started' },
    { project_id: 'project-1', thread_id: 'thread-1', turn_id: 'turn-2', kind: 'turn_completed' },
  ]

  const first = await reconcileInterruptedWorkspaceTurns({
    db: createDb(rows),
    appendEvent: (threadId, event) => appended.push({ threadId, event }),
    listRecoverableJobs: () => [],
    now: () => 1234,
  })

  assert.deepEqual(first, {
    inspected: 2,
    interrupted: 1,
    skippedRecoverable: 0,
    alreadyTerminal: 1,
  })
  assert.deepEqual(appended, [{
    threadId: 'thread-1',
    event: {
      turnId: 'turn-1',
      kind: 'turn_interrupted',
      role: 'system',
      content: 'The app closed before this turn completed.',
      meta: {
        status: 'interrupted',
        reason: 'application_restart_recovery',
      },
      createdAt: 1234,
    },
  }])

  const second = await reconcileInterruptedWorkspaceTurns({
    db: createDb([
      { project_id: 'project-1', thread_id: 'thread-1', turn_id: 'turn-1', kind: 'turn_interrupted' },
      rows[1],
    ]),
    appendEvent: (threadId, event) => appended.push({ threadId, event }),
    listRecoverableJobs: () => [],
    now: () => 5678,
  })

  assert.deepEqual(second, {
    inspected: 2,
    interrupted: 0,
    skippedRecoverable: 0,
    alreadyTerminal: 2,
  })
  assert.equal(appended.length, 1)
})

test('skips only matching API-key background jobs that can resume after restart', async () => {
  const appended = []
  const rows = [
    { project_id: 'project-1', thread_id: 'thread-1', turn_id: 'turn-api', kind: 'turn_started' },
    { project_id: 'project-1', thread_id: 'thread-1', turn_id: 'turn-account', kind: 'turn_started' },
  ]

  const result = await reconcileInterruptedWorkspaceTurns({
    db: createDb(rows),
    appendEvent: (threadId, event) => appended.push({ threadId, event }),
    listRecoverableJobs: () => [
      {
        projectId: 'project-1',
        threadId: 'thread-1',
        remoteResponseId: 'resp_api',
        transportMode: 'responses_background',
        resultSummary: { turnId: 'turn-api', runtimeAuthMethod: 'api_key' },
      },
      {
        projectId: 'project-1',
        threadId: 'thread-1',
        remoteResponseId: 'resp_account',
        transportMode: 'codex_app_server_chatgpt_background',
        resultSummary: { turnId: 'turn-account', runtimeAuthMethod: 'account' },
      },
    ],
    now: () => 42,
  })

  assert.deepEqual(result, {
    inspected: 2,
    interrupted: 1,
    skippedRecoverable: 1,
    alreadyTerminal: 0,
  })
  assert.equal(appended.length, 1)
  assert.equal(appended[0].event.turnId, 'turn-account')
})

test('requires an exact project, thread, and turn match before skipping recovery', async () => {
  const appended = []
  const result = await reconcileInterruptedWorkspaceTurns({
    db: createDb([
      { project_id: 'project-1', thread_id: 'thread-1', turn_id: 'turn-1', kind: 'turn_started' },
    ]),
    appendEvent: (threadId, event) => appended.push({ threadId, event }),
    listRecoverableJobs: () => [{
      projectId: 'project-1',
      threadId: 'thread-other',
      remoteResponseId: 'resp_1',
      resultSummary: { turnId: 'turn-1', runtimeAuthMethod: 'api_key' },
    }],
    now: () => 42,
  })

  assert.equal(result.interrupted, 1)
  assert.equal(result.skippedRecoverable, 0)
  assert.equal(appended.length, 1)
})
