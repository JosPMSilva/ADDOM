import test from 'node:test'
import assert from 'node:assert/strict'

import Database from 'better-sqlite3'

import { createAgentEventStore } from '../../src/main/agents/agent-event-store.mjs'
import {
  compactTerminalAgentTranscriptDeltas,
  pruneExpiredAgentProviderDiagnostics,
} from '../../src/main/agents/agent-event-retention.mjs'
import { rebuildAgentRunProjection } from '../../src/main/agents/agent-event-projector.mjs'
import { createAgentRunRepository } from '../../src/main/agents/agent-run-repository.mjs'
import { runMigrations } from '../../src/main/memory/db-migrations.mjs'
import {
  AGENT_TEST_TIMESTAMP,
  makeAgentArtifact,
  makeAgentAttempt,
  makeAgentEventDraft,
  makeAgentNode,
  makeAgentRun,
  seedAgentWorkspace,
} from '../helpers/agent-runtime-fixtures.mjs'

function createDatabase() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  seedAgentWorkspace(db)
  return db
}

function appendActiveRun(store) {
  store.append(makeAgentEventDraft('agent_run_created', {
    policyProfileId: 'high',
    run: makeAgentRun(),
    rootNode: makeAgentNode(),
  }, {
    attemptId: null,
    eventId: 'event_run_created',
    idempotencyKey: 'run_01:created',
  }))
  store.append(makeAgentEventDraft('agent_run_started', {
    run: makeAgentRun({ status: 'running', startedAt: AGENT_TEST_TIMESTAMP + 1, queuedNodeCount: 0 }),
  }, {
    attemptId: null,
    eventId: 'event_run_started',
    idempotencyKey: 'run_01:started',
  }))
  store.append(makeAgentEventDraft('agent_started', {
    attemptId: 'attempt_agent_root_1',
    node: makeAgentNode({ status: 'running' }),
    attempt: makeAgentAttempt(),
  }, {
    eventId: 'event_agent_started',
    idempotencyKey: 'run_01:agent-started',
  }))
}

function appendMixedTranscript(store, { createdAt = AGENT_TEST_TIMESTAMP } = {}) {
  const rows = [
    ['agent_commentary_delta', { delta: 'Inspecting the event store.' }],
    ['agent_tool_started', { toolCallId: 'tool_01', toolName: 'read_file', toolClass: 'read' }],
    ['agent_reasoning_delta', { delta: 'The schema preserves order.' }],
    ['agent_tool_output', { toolCallId: 'tool_01', output: 'file contents' }],
    ['agent_tool_completed', { toolCallId: 'tool_01', status: 'completed' }],
  ]
  rows.forEach(([kind, payload], index) => {
    store.append(makeAgentEventDraft(kind, payload, {
      eventId: `event_mixed_${index + 1}`,
      idempotencyKey: `run_01:mixed:${index + 1}`,
      createdAt: createdAt + index,
    }))
  })
}

function approvalRequestPayload(approvalId) {
  return {
    approvalId,
    permissionLevel: 'execute',
    operationSummary: 'Run the integration tests',
    toolCallId: `tool_${approvalId}`,
    projectId: 'project_01',
    threadId: 'thread_01',
    providerId: 'openai-account',
    modelId: 'gpt-5.6-sol',
    permissionSnapshotHash: 'a'.repeat(64),
    workspaceSnapshotHash: 'b'.repeat(64),
    operationScopeHash: 'c'.repeat(64),
    operationScope: { toolName: 'shell', toolClass: 'execute' },
    workspaceSnapshot: {
      workspaceId: 'workspace_01',
      workspaceMode: 'local_worktree',
      baseRevision: 'sha256:test',
    },
    parentPath: ['agent_root'],
    allowedResolutionScopes: ['once'],
  }
}

function approvalGrantPayload() {
  return {
    id: 'grant_01',
    resolutionScope: 'once',
    runId: 'run_01',
    nodeId: 'agent_root',
    attemptId: 'attempt_agent_root_1',
    permissionSnapshotHash: 'a'.repeat(64),
    workspaceSnapshotHash: 'b'.repeat(64),
    operationScopeHash: 'c'.repeat(64),
    grantedAt: AGENT_TEST_TIMESTAMP,
    expiresAt: AGENT_TEST_TIMESTAMP + 1_000,
  }
}

test('rebuild from an empty projection is byte-equivalent to the live normalized graph', () => {
  const db = createDatabase()
  try {
    const store = createAgentEventStore(db)
    const repository = createAgentRunRepository(db)
    appendActiveRun(store)
    appendMixedTranscript(store)

    store.append(makeAgentEventDraft('agent_approval_requested', approvalRequestPayload('approval_01'), {
      eventId: 'event_approval_requested',
      idempotencyKey: 'run_01:approval:requested',
    }))
    store.append(makeAgentEventDraft('agent_approval_resolved', {
      approvalId: 'approval_01',
      outcome: 'approved',
      resolutionScope: 'once',
      grant: approvalGrantPayload(),
    }, {
      eventId: 'event_approval_resolved',
      idempotencyKey: 'run_01:approval:resolved',
    }))
    const artifact = makeAgentArtifact()
    store.append(makeAgentEventDraft('agent_artifact_staged', {
      artifactId: artifact.id,
      workspaceMode: artifact.workspaceMode,
      path: artifact.path,
      artifact,
    }, {
      eventId: 'event_artifact_staged',
      idempotencyKey: 'run_01:artifact:staged',
    }))
    store.append(makeAgentEventDraft('agent_merge_requested', {
      mergeId: 'merge_01',
      artifactIds: [artifact.id],
      operation: 'apply',
    }, {
      eventId: 'event_merge_requested',
      idempotencyKey: 'run_01:merge:requested',
    }))
    store.append(makeAgentEventDraft('agent_merge_completed', {
      mergeId: 'merge_01',
      artifactIds: [artifact.id],
      status: 'completed',
      decision: { appliedAt: 1_752_600_000_100 },
    }, {
      eventId: 'event_merge_completed',
      idempotencyKey: 'run_01:merge:completed',
    }))

    const live = JSON.stringify(repository.getRunGraph('run_01'))
    assert.equal(repository.getRunGraph('run_01').artifacts[0].status, 'applied')
    rebuildAgentRunProjection(db, 'run_01')
    const replayedOnce = JSON.stringify(repository.getRunGraph('run_01'))
    rebuildAgentRunProjection(db, 'run_01')
    const replayedTwice = JSON.stringify(repository.getRunGraph('run_01'))

    assert.equal(replayedOnce, live)
    assert.equal(replayedTwice, live)
  } finally {
    db.close()
  }
})

test('mixed high-frequency and lifecycle events retain one authoritative FIFO sequence', () => {
  const db = createDatabase()
  try {
    const store = createAgentEventStore(db)
    const repository = createAgentRunRepository(db)
    appendActiveRun(store)
    appendMixedTranscript(store)

    const transcript = repository.getRunGraph('run_01').transcript
    assert.deepEqual(transcript.map((segment) => segment.kind), [
      'agent_commentary_delta',
      'agent_tool_started',
      'agent_reasoning_delta',
      'agent_tool_output',
      'agent_tool_completed',
    ])
    assert.deepEqual(transcript.map((segment) => segment.nodeSequence), [4, 5, 6, 7, 8])
    assert.deepEqual(repository.listEvents('run_01').map((event) => event.runSequence), [1, 2, 3, 4, 5, 6, 7, 8])
  } finally {
    db.close()
  }
})

test('terminal transcript compaction is lossless, replay-equivalent, and preserves dedupe receipts', () => {
  const db = createDatabase()
  try {
    const store = createAgentEventStore(db)
    const repository = createAgentRunRepository(db)
    const oldTimestamp = AGENT_TEST_TIMESTAMP - (40 * 24 * 60 * 60 * 1_000)
    appendActiveRun(store)
    appendMixedTranscript(store, { createdAt: oldTimestamp })

    const completedNode = makeAgentNode({ status: 'completed', finishedAt: AGENT_TEST_TIMESTAMP + 100 })
    const completedAttempt = makeAgentAttempt('agent_root', {
      status: 'completed',
      finishedAt: AGENT_TEST_TIMESTAMP + 100,
    })
    store.append(makeAgentEventDraft('agent_completed', {
      resultSummary: 'Root work completed.',
      node: completedNode,
      attempt: completedAttempt,
    }, {
      eventId: 'event_agent_completed',
      idempotencyKey: 'run_01:agent-completed',
      createdAt: AGENT_TEST_TIMESTAMP + 100,
    }))
    const completedRun = makeAgentRun({
      status: 'completed',
      startedAt: AGENT_TEST_TIMESTAMP + 1,
      finishedAt: AGENT_TEST_TIMESTAMP + 101,
      activeNodeCount: 0,
      queuedNodeCount: 0,
      terminalNodeCount: 1,
      completionReason: 'root_final_emitted',
    })
    store.append(makeAgentEventDraft('agent_run_completed', {
      finalAuthorityNodeId: 'agent_root',
      completionReason: 'root_final_emitted',
      run: completedRun,
    }, {
      eventId: 'event_run_completed',
      idempotencyKey: 'run_01:run-completed',
      createdAt: AGENT_TEST_TIMESTAMP + 101,
    }))

    const eventsBefore = JSON.stringify(repository.listEvents('run_01'))
    const graphBefore = JSON.stringify(repository.getRunGraph('run_01'))
    const result = compactTerminalAgentTranscriptDeltas(db, { now: AGENT_TEST_TIMESTAMP })
    assert.ok(result.compactedEvents >= 3)
    assert.ok(result.compactions >= 1)
    assert.equal(JSON.stringify(repository.listEvents('run_01')), eventsBefore)

    rebuildAgentRunProjection(db, 'run_01')
    assert.equal(JSON.stringify(repository.getRunGraph('run_01')), graphBefore)

    const duplicate = store.append(makeAgentEventDraft('agent_commentary_delta', {
      delta: 'Inspecting the event store.',
    }, {
      eventId: 'event_mixed_1',
      idempotencyKey: 'run_01:mixed:1',
      createdAt: oldTimestamp,
    }))
    assert.equal(duplicate.inserted, false)
    assert.equal(duplicate.event.eventId, 'event_mixed_1')
  } finally {
    db.close()
  }
})

test('raw provider diagnostics expire independently and never remove canonical events or transcript', () => {
  const db = createDatabase()
  try {
    const store = createAgentEventStore(db)
    const repository = createAgentRunRepository(db)
    appendActiveRun(store)
    store.append(makeAgentEventDraft('agent_commentary_delta', {
      delta: 'Canonical text remains.',
      providerMetadata: { vendor_trace: 'temporary' },
    }, {
      eventId: 'event_diagnostic',
      idempotencyKey: 'run_01:diagnostic',
      createdAt: AGENT_TEST_TIMESTAMP,
      adapterMetadata: { raw_kind: 'vendor.delta' },
    }))

    assert.equal(repository.getRunGraph('run_01').diagnostics.length, 1)
    const result = pruneExpiredAgentProviderDiagnostics(db, {
      now: AGENT_TEST_TIMESTAMP + (15 * 24 * 60 * 60 * 1_000),
    })
    assert.equal(result.deleted, 1)
    const graph = repository.getRunGraph('run_01')
    assert.equal(graph.diagnostics.length, 0)
    assert.equal(graph.transcript.at(-1).payload.delta, 'Canonical text remains.')
    assert.equal(repository.listEvents('run_01').at(-1).eventId, 'event_diagnostic')
  } finally {
    db.close()
  }
})

test('active runs and unresolved approvals are never eligible for automatic transcript compaction', () => {
  const db = createDatabase()
  try {
    const store = createAgentEventStore(db)
    appendActiveRun(store)
    appendMixedTranscript(store, {
      createdAt: AGENT_TEST_TIMESTAMP - (40 * 24 * 60 * 60 * 1_000),
    })
    store.append(makeAgentEventDraft(
      'agent_approval_requested',
      approvalRequestPayload('approval_pending'),
      {
        eventId: 'event_approval_pending',
        idempotencyKey: 'run_01:approval:pending',
      },
    ))

    assert.deepEqual(compactTerminalAgentTranscriptDeltas(db, { now: AGENT_TEST_TIMESTAMP }), {
      compactions: 0,
      compactedEvents: 0,
    })
  } finally {
    db.close()
  }
})
