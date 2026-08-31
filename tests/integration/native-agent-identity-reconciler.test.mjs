import test from 'node:test'
import assert from 'node:assert/strict'

import {
  classifyNativeProviderCheckpoint,
  createNativeAgentIdentityReconciler,
} from '../../src/main/agents/providers/native-agent-identity-reconciler.mjs'

test('native identity reconciliation uses exact spawn and provider identities without role heuristics', () => {
  let nextId = 0
  const reconciler = createNativeAgentIdentityReconciler({
    namespace: 'openai-account',
    nodeIdFactory: () => `agent_native_${++nextId}`,
  })

  reconciler.registerSpawnIntent({
    spawnRequestId: 'item_spawn_1',
    parentAttemptId: 'attempt_root',
    parentProviderThreadId: 'thread_root',
  })
  const first = reconciler.observeNode({
    providerEventId: 'event_completed_1',
    providerThreadId: 'thread_child_1',
    parentProviderThreadId: 'thread_root',
    spawnRequestId: 'item_spawn_1',
    parentAttemptId: 'attempt_root',
    status: 'completed',
  })
  const duplicateIdentity = reconciler.observeNode({
    providerEventId: 'event_replayed_1',
    providerThreadId: 'thread_child_1',
    parentProviderThreadId: 'thread_root',
    status: 'completed',
  })

  assert.equal(first.nodeId, 'agent_native_1')
  assert.equal(first.reconciliationState, 'matched')
  assert.equal(first.providerCorrelationKey, 'openai-account:thread:thread_child_1')
  assert.equal(duplicateIdentity.nodeId, first.nodeId)
  assert.equal(duplicateIdentity.duplicateIdentity, true)
  assert.equal(nextId, 1)
})

test('provider-ahead native evidence stays inspectable and can reconcile only by exact intent identity', () => {
  const reconciler = createNativeAgentIdentityReconciler({
    namespace: 'openai-account',
    nodeIdFactory: () => 'agent_provider_ahead',
  })
  const ahead = reconciler.observeNode({
    providerEventId: 'event_provider_ahead',
    providerThreadId: 'thread_child_ahead',
    parentProviderThreadId: 'thread_root',
    spawnRequestId: 'item_late',
    status: 'running',
  })

  assert.equal(ahead.reconciliationState, 'provider_ahead')
  assert.equal(
    reconciler.registerSpawnIntent({
      spawnRequestId: 'different_item',
      parentAttemptId: 'attempt_root',
      parentProviderThreadId: 'thread_root',
    }).reconciledNodes.length,
    0,
  )
  const reconciled = reconciler.registerSpawnIntent({
    spawnRequestId: 'item_late',
    parentAttemptId: 'attempt_root',
    parentProviderThreadId: 'thread_root',
  })
  assert.deepEqual(reconciled.reconciledNodes.map((node) => node.nodeId), ['agent_provider_ahead'])
  assert.equal(reconciled.reconciledNodes[0].reconciliationState, 'matched')
})

test('checkpoint classification distinguishes provider-ahead, unverified terminal, and forked history', () => {
  assert.equal(classifyNativeProviderCheckpoint({
    persisted: { historyId: 'history_1', sequence: 4, terminal: false },
    current: { historyId: 'history_1', sequence: 4, terminal: false },
  }), 'matched')
  assert.equal(classifyNativeProviderCheckpoint({
    persisted: { historyId: 'history_1', sequence: 4, terminal: false },
    current: { historyId: 'history_1', sequence: 5, terminal: false },
  }), 'provider_ahead')
  assert.equal(classifyNativeProviderCheckpoint({
    persisted: { historyId: 'history_1', sequence: 4, terminal: false },
    current: { historyId: 'history_1', sequence: 5, terminal: true },
  }), 'provider_unverified_terminal')
  assert.equal(classifyNativeProviderCheckpoint({
    persisted: { historyId: 'history_1', sequence: 4, terminal: false },
    current: { historyId: 'history_2', sequence: 1, terminal: false },
  }), 'forked_history')
})
