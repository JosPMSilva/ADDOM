import assert from 'node:assert/strict'
import test from 'node:test'

import Database from 'better-sqlite3'

import {
  createAgentRunFinalizer,
  evaluateAgentRunFinalization,
} from '../../src/main/agents/agent-run-finalizer.mjs'
import { createAgentEventStore } from '../../src/main/agents/agent-event-store.mjs'
import { createAgentRunRepository } from '../../src/main/agents/agent-run-repository.mjs'
import { runMigrations } from '../../src/main/memory/db-migrations.mjs'
import {
  AGENT_TEST_TIMESTAMP,
  makeAgentEventDraft,
  makeAgentNode,
  makeAgentRun,
  seedAgentWorkspace,
} from '../helpers/agent-runtime-fixtures.mjs'

function graphWith(nodes, runOverrides = {}) {
  return {
    run: makeAgentRun({
      status: 'running',
      startedAt: 1_752_600_000_001,
      finishedAt: null,
      completionReason: null,
      ...runOverrides,
    }),
    nodes: [
      makeAgentNode({
        id: 'agent_root',
        status: 'running',
        attemptId: null,
        exclusiveUsage: null,
        inclusiveUsage: null,
      }),
      ...nodes,
    ],
    attempts: [],
    approvals: [],
  }
}

test('finalization waits for required descendants and never promotes child prose to root output', () => {
  const active = makeAgentNode({
    id: 'agent_required',
    status: 'running',
    resultSummary: 'Child prose must not become the final answer.',
  })
  const waiting = evaluateAgentRunFinalization(graphWith([active]), {
    requiredNodeIds: ['agent_required'],
    rootResultSummary: 'Root-owned answer.',
    allowPartial: false,
  })
  assert.deepEqual(waiting, {
    ready: false,
    reason: 'required_descendants_active',
    blockingNodeIds: ['agent_required'],
  })

  const completed = evaluateAgentRunFinalization(graphWith([{
    ...active,
    status: 'completed',
    finishedAt: 1_752_600_000_100,
  }]), {
    requiredNodeIds: ['agent_required'],
    rootResultSummary: 'Root-owned answer.',
    allowPartial: false,
  })
  assert.equal(completed.ready, true)
  assert.equal(completed.rootResultSummary, 'Root-owned answer.')
  assert.equal(JSON.stringify(completed).includes('Child prose'), false)
})

test('partial finalization records abandoned provenance and terminal runs require reconciliation for late events', () => {
  const failed = makeAgentNode({
    id: 'agent_failed_child',
    status: 'failed',
    errorSummary: 'Provider disconnected.',
  })
  const decision = evaluateAgentRunFinalization(graphWith([failed]), {
    requiredNodeIds: ['agent_failed_child'],
    rootResultSummary: 'Root reports partial completion.',
    allowPartial: true,
  })
  assert.equal(decision.ready, true)
  assert.deepEqual(decision.abandonedBranches, [{
    nodeId: 'agent_failed_child',
    status: 'failed',
    reason: 'Provider disconnected.',
  }])

  assert.deepEqual(evaluateAgentRunFinalization(graphWith([], {
    status: 'completed',
    finishedAt: 1_752_600_000_200,
    completionReason: 'root_finalized',
  }), {
    requiredNodeIds: [],
    rootResultSummary: 'Late replacement.',
    allowPartial: true,
  }), {
    ready: false,
    reason: 'run_terminal_reconciliation_required',
    reconciliationState: 'provider_unverified_terminal',
  })
})

test('finalization never abandons a live optional descendant implicitly', () => {
  const active = makeAgentNode({
    id: 'agent_optional_active',
    status: 'running',
  })
  assert.deepEqual(evaluateAgentRunFinalization(graphWith([active]), {
    requiredNodeIds: [],
    rootResultSummary: 'Root answer.',
    allowPartial: true,
  }), {
    ready: false,
    reason: 'descendants_active',
    blockingNodeIds: [active.id],
  })
})

test('finalizer persists root-owned output, hierarchy-safe usage, and abandoned provenance atomically', () => {
  const db = new Database(':memory:')
  try {
    db.pragma('foreign_keys = ON')
    runMigrations(db)
    seedAgentWorkspace(db)
    const eventStore = createAgentEventStore(db)
    const repository = createAgentRunRepository(db)
    const root = makeAgentNode({
      status: 'running',
      attemptId: null,
      exclusiveUsage: null,
      inclusiveUsage: null,
    })
    const child = makeAgentNode({
      id: 'agent_child_complete',
      status: 'completed',
      resultSummary: 'Child prose must remain child-owned.',
      exclusiveUsage: null,
      inclusiveUsage: null,
    })
    const abandoned = makeAgentNode({
      id: 'agent_child_failed',
      status: 'failed',
      errorSummary: 'Provider disconnected.',
      exclusiveUsage: null,
      inclusiveUsage: null,
    })
    eventStore.append(makeAgentEventDraft('agent_run_created', {
      policyProfileId: 'high',
      run: makeAgentRun({
        status: 'running',
        startedAt: AGENT_TEST_TIMESTAMP,
        exclusiveUsage: null,
        inclusiveUsage: null,
      }),
      rootNode: root,
    }, { attemptId: null }))
    for (const node of [child, abandoned]) {
      eventStore.append(makeAgentEventDraft('agent_spawned', {
        spawnRequestId: `spawn_${node.id}`,
        childNodeId: node.id,
        node,
      }, {
        nodeId: node.id,
        attemptId: null,
        eventId: `event_spawn_${node.id}`,
        idempotencyKey: `run_01:spawn:${node.id}`,
      }))
    }

    const finalizer = createAgentRunFinalizer({
      eventStore,
      repository,
      now: () => AGENT_TEST_TIMESTAMP + 200,
    })
    const result = finalizer.finalize({
      runId: 'run_01',
      requiredNodeIds: [child.id, abandoned.id],
      rootResultSummary: 'Root-owned final answer.',
      allowPartial: true,
    })

    assert.equal(result.finalized, true)
    const graph = repository.getRunGraph('run_01')
    assert.equal(graph.run.status, 'completed')
    assert.equal(graph.run.inclusiveUsage.scope, 'inclusive')
    assert.deepEqual(graph.run.completionProvenance.abandonedBranches, [{
      nodeId: abandoned.id,
      status: 'failed',
      reason: 'Provider disconnected.',
    }])
    assert.equal(
      graph.nodes.find((node) => node.id === graph.run.rootNodeId).resultSummary,
      'Root-owned final answer.',
    )
    assert.equal(JSON.stringify(graph.run.completionProvenance).includes('Child prose'), false)
  } finally {
    db.close()
  }
})

test('late child events cannot mutate a finalized run without explicit reconciliation', () => {
  const db = new Database(':memory:')
  try {
    db.pragma('foreign_keys = ON')
    runMigrations(db)
    seedAgentWorkspace(db)
    const eventStore = createAgentEventStore(db)
    eventStore.append(makeAgentEventDraft('agent_run_created', {
      policyProfileId: 'high',
      run: makeAgentRun({ status: 'completed' }),
      rootNode: makeAgentNode({ status: 'completed' }),
    }, { attemptId: null }))

    assert.throws(
      () => eventStore.append(makeAgentEventDraft('agent_commentary_delta', {
        delta: 'Late child text.',
      }, {
        nodeId: 'agent_late_child',
        eventId: 'event_late_child_text',
        idempotencyKey: 'run_01:late-child:text',
      })),
      /finalized run|reconciliation/i,
    )
    assert.throws(
      () => eventStore.append(makeAgentEventDraft('agent_run_created', {
        policyProfileId: 'high',
        run: makeAgentRun({ status: 'running', finishedAt: null }),
        rootNode: makeAgentNode({ status: 'running', finishedAt: null }),
      }, {
        attemptId: null,
        eventId: 'event_late_run_replacement',
        idempotencyKey: 'run_01:late-child:replacement',
      })),
      /finalized run|reconciliation/i,
    )
    eventStore.append(makeAgentEventDraft('agent_reconciliation_recorded', {
      state: 'provider_ahead',
      reason: 'Provider emitted a child event after root finalization.',
      sourceEventId: 'provider_event_late_01',
    }, {
      attemptId: null,
      eventId: 'event_late_reconciliation',
      idempotencyKey: 'run_01:late-child:reconciliation',
    }))
    const graph = createAgentRunRepository(db).getRunGraph('run_01')
    assert.equal(graph.recovery.reconciliationState, 'provider_ahead')
  } finally {
    db.close()
  }
})
