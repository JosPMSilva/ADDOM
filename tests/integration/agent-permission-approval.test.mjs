import assert from 'node:assert/strict'
import test from 'node:test'

import Database from 'better-sqlite3'

import {
  hashAgentPermissionSnapshot,
  resolveAgentChildPermission,
} from '../../src/main/agents/agent-permission-resolver.mjs'
import { createAgentApprovalRouter } from '../../src/main/agents/agent-approval-router.mjs'
import { createAgentEventStore } from '../../src/main/agents/agent-event-store.mjs'
import { createAgentRunRepository } from '../../src/main/agents/agent-run-repository.mjs'
import { runMigrations } from '../../src/main/memory/db-migrations.mjs'
import {
  AGENT_TEST_TIMESTAMP,
  makeAgentAttempt,
  makeAgentEventDraft,
  makeAgentNode,
  makeAgentPermission,
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

function seedApprovalGraph(store) {
  const root = makeAgentNode({
    status: 'running',
    attemptId: null,
    permissionSnapshot: makeAgentPermission('all'),
  })
  store.append(makeAgentEventDraft('agent_run_created', {
    policyProfileId: 'high',
    run: makeAgentRun({ status: 'running', startedAt: AGENT_TEST_TIMESTAMP }),
    rootNode: root,
  }, { attemptId: null }))
  for (const id of ['agent_writer_a', 'agent_writer_b']) {
    const permissionSnapshot = makeAgentPermission('read_write')
    const node = makeAgentNode({
      id,
      status: 'queued',
      attemptId: `attempt_${id}_1`,
      permissionSnapshot,
      workspaceMode: 'local_overlay',
    })
    const attempt = makeAgentAttempt(id, {
      status: 'queued',
      startedAt: null,
      providerRequestId: null,
      providerCorrelationKey: null,
      permissionSnapshot,
      workspaceMode: 'local_overlay',
      usage: null,
    })
    store.append(makeAgentEventDraft('agent_spawned', {
      spawnRequestId: `spawn_${id}`,
      childNodeId: id,
      node,
    }, {
      nodeId: id,
      attemptId: null,
      eventId: `event_spawned_${id}`,
      idempotencyKey: `run_01:spawned:${id}`,
    }))
    store.append(makeAgentEventDraft('agent_attempt_queued', {
      attemptId: attempt.id,
      node,
      attempt,
    }, {
      nodeId: id,
      attemptId: attempt.id,
      eventId: `event_queued_${id}`,
      idempotencyKey: `run_01:queued:${id}`,
    }))
  }
}

test('child permission resolution requires an explicit policy grant for incomparable write or execute lanes', () => {
  const parent = makeAgentPermission('all')
  const requested = makeAgentPermission('read_write')

  assert.throws(
    () => resolveAgentChildPermission({ parentSnapshot: parent, requestedSnapshot: requested }),
    /explicit policy grant/i,
  )
  const resolved = resolveAgentChildPermission({
    parentSnapshot: parent,
    requestedSnapshot: requested,
    policy: { allowedChildLevels: ['read_write'] },
  })
  assert.deepEqual(resolved.permissionSnapshot, requested)
  assert.equal(resolved.permissionSnapshotHash, hashAgentPermissionSnapshot(requested))
  assert.equal(resolved.permissionSnapshotHash.length, 64)
  assert.throws(
    () => resolveAgentChildPermission({
      parentSnapshot: makeAgentPermission('read_write'),
      requestedSnapshot: makeAgentPermission('execute'),
      policy: { allowedChildLevels: ['execute'] },
    }),
    /widen|incomparable/i,
  )
})

test('approval grants remain node, attempt, permission, workspace, operation, and expiry bound across reload', () => {
  const db = createDatabase()
  try {
    const eventStore = createAgentEventStore(db)
    const repository = createAgentRunRepository(db)
    seedApprovalGraph(eventStore)
    let now = AGENT_TEST_TIMESTAMP + 100
    let id = 0
    const createRouter = () => createAgentApprovalRouter({
      eventStore,
      repository,
      now: () => now,
      idFactory: () => `approval_${++id}`,
    })
    const router = createRouter()
    const permissionSnapshot = makeAgentPermission('read_write')
    const workspaceSnapshot = {
      workspaceId: 'workspace_01',
      workspaceMode: 'local_overlay',
      baseRevision: 'sha256:base-a',
    }
    const request = router.request({
      runId: 'run_01',
      nodeId: 'agent_writer_a',
      attemptId: 'attempt_agent_writer_a_1',
      toolCallId: 'tool_call_write_a',
      operationSummary: 'Update src/a.mjs',
      operationScope: {
        toolName: 'write_file',
        toolClass: 'write',
        resource: 'src/a.mjs',
      },
      permissionSnapshot,
      workspaceSnapshot,
      allowedResolutionScopes: ['once', 'node'],
    })
    assert.equal(request.status, 'pending')
    assert.deepEqual(request.parentPath, ['agent_root', 'agent_writer_a'])
    assert.equal(request.projectId, 'project_01')
    assert.equal(request.threadId, 'thread_01')
    assert.equal(request.providerId, 'openrouter')

    const reloadedPending = createRouter().get(request.id)
    assert.equal(reloadedPending.status, 'pending')
    const approved = createRouter().resolve({
      approvalId: request.id,
      outcome: 'approved',
      resolutionScope: 'node',
      expiresAt: now + 1_000,
    })
    assert.equal(approved.status, 'approved')
    assert.equal(approved.grant.attemptId, 'attempt_agent_writer_a_1')

    const authorizeInput = {
      approvalId: request.id,
      runId: 'run_01',
      nodeId: 'agent_writer_a',
      attemptId: 'attempt_agent_writer_a_1',
      operationScope: request.operationScope,
      permissionSnapshot,
      workspaceSnapshot,
    }
    assert.equal(createRouter().authorize(authorizeInput).authorized, true)
    assert.throws(
      () => createRouter().authorize({ ...authorizeInput, nodeId: 'agent_writer_b' }),
      /node/i,
    )
    assert.throws(
      () => createRouter().authorize({
        ...authorizeInput,
        attemptId: 'attempt_agent_writer_b_1',
      }),
      /attempt/i,
    )
    assert.throws(
      () => createRouter().authorize({
        ...authorizeInput,
        permissionSnapshot: makeAgentPermission('read_only'),
      }),
      /permission snapshot/i,
    )
    assert.throws(
      () => createRouter().authorize({
        ...authorizeInput,
        workspaceSnapshot: { ...workspaceSnapshot, baseRevision: 'sha256:base-b' },
      }),
      /workspace snapshot/i,
    )
    now += 1_001
    assert.throws(() => createRouter().authorize(authorizeInput), /expired/i)
    const expired = createRouter().get(request.id)
    assert.equal(expired.status, 'expired')
    assert.equal(expired.grant.id, `${request.id}_grant`)
    assert.equal(expired.grant.expiredAt, now)
    assert.equal(expired.grant.expirationReason, 'grant_expired')
  } finally {
    db.close()
  }
})

test('ancestor cancellation revokes unused descendant grants durably without touching siblings', () => {
  const db = createDatabase()
  try {
    const eventStore = createAgentEventStore(db)
    const repository = createAgentRunRepository(db)
    seedApprovalGraph(eventStore)
    let id = 0
    const router = createAgentApprovalRouter({
      eventStore,
      repository,
      now: () => AGENT_TEST_TIMESTAMP + 200,
      idFactory: () => `approval_revoke_${++id}`,
    })
    const makeApproval = (nodeId, suffix) => {
      const attemptId = `attempt_${nodeId}_1`
      const requested = router.request({
        runId: 'run_01',
        nodeId,
        attemptId,
        toolCallId: `tool_call_${suffix}`,
        operationSummary: `Write ${suffix}`,
        operationScope: { toolName: 'write_file', toolClass: 'write', resource: suffix },
        permissionSnapshot: makeAgentPermission('read_write'),
        workspaceSnapshot: {
          workspaceId: 'workspace_01',
          workspaceMode: 'local_overlay',
          baseRevision: 'sha256:base-a',
        },
        allowedResolutionScopes: ['node'],
      })
      return router.resolve({
        approvalId: requested.id,
        outcome: 'approved',
        resolutionScope: 'node',
        expiresAt: AGENT_TEST_TIMESTAMP + 5_000,
      })
    }
    const writerA = makeApproval('agent_writer_a', 'a.mjs')
    const writerB = makeApproval('agent_writer_b', 'b.mjs')
    const pendingA = router.request({
      runId: 'run_01',
      nodeId: 'agent_writer_a',
      attemptId: 'attempt_agent_writer_a_1',
      toolCallId: 'tool_call_pending_a',
      operationSummary: 'Write pending-a.mjs',
      operationScope: {
        toolName: 'write_file',
        toolClass: 'write',
        resource: 'pending-a.mjs',
      },
      permissionSnapshot: makeAgentPermission('read_write'),
      workspaceSnapshot: {
        workspaceId: 'workspace_01',
        workspaceMode: 'local_overlay',
        baseRevision: 'sha256:base-revoke',
      },
      allowedResolutionScopes: ['once'],
    })

    const revoked = router.revokeDescendantGrants({
      runId: 'run_01',
      ancestorNodeId: 'agent_writer_a',
      reason: 'ancestor_cancelled',
    })
    assert.deepEqual(revoked.approvalIds, [writerA.id, pendingA.id])
    assert.equal(createAgentApprovalRouter({
      eventStore,
      repository,
      now: () => AGENT_TEST_TIMESTAMP + 300,
    }).get(writerA.id).status, 'revoked')
    assert.equal(router.get(pendingA.id).status, 'revoked')
    assert.equal(router.get(writerB.id).status, 'approved')
  } finally {
    db.close()
  }
})

test('pending approvals remain deniable after reload and one-shot grants cannot be reused', () => {
  const db = createDatabase()
  try {
    const eventStore = createAgentEventStore(db)
    const repository = createAgentRunRepository(db)
    seedApprovalGraph(eventStore)
    let id = 0
    const createRouter = () => createAgentApprovalRouter({
      eventStore,
      repository,
      now: () => AGENT_TEST_TIMESTAMP + 300,
      idFactory: () => `approval_action_${++id}`,
    })
    const permissionSnapshot = makeAgentPermission('read_write')
    const workspaceSnapshot = {
      workspaceId: 'workspace_01',
      workspaceMode: 'local_overlay',
      baseRevision: 'sha256:base-action',
    }
    const requestInput = {
      runId: 'run_01',
      nodeId: 'agent_writer_a',
      attemptId: 'attempt_agent_writer_a_1',
      toolCallId: 'tool_action',
      operationSummary: 'Update src/action.mjs',
      operationScope: {
        toolName: 'write_file',
        toolClass: 'write',
        resource: 'src/action.mjs',
      },
      permissionSnapshot,
      workspaceSnapshot,
      allowedResolutionScopes: ['once'],
    }
    const denied = createRouter().request(requestInput)
    assert.equal(createRouter().resolve({
      approvalId: denied.id,
      outcome: 'denied',
      reason: 'user_denied',
    }).status, 'denied')

    const once = createRouter().request({
      ...requestInput,
      toolCallId: 'tool_action_once',
    })
    createRouter().resolve({
      approvalId: once.id,
      outcome: 'approved',
      resolutionScope: 'once',
      expiresAt: AGENT_TEST_TIMESTAMP + 1_000,
    })
    const authorizeInput = {
      approvalId: once.id,
      runId: requestInput.runId,
      nodeId: requestInput.nodeId,
      attemptId: requestInput.attemptId,
      operationScope: requestInput.operationScope,
      permissionSnapshot,
      workspaceSnapshot,
    }
    assert.equal(createRouter().authorize(authorizeInput).authorized, true)
    assert.throws(() => createRouter().authorize(authorizeInput), /consumed/i)
  } finally {
    db.close()
  }
})
