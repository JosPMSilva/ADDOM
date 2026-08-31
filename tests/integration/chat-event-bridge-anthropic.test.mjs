import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildAnthropicCompactionEventActivity,
  registerAnthropicEventBridgeHandlers,
} from '../../src/renderer/components/chat/chat-event-bridge-anthropic.mjs'

test('anthropic compaction activity formats provider compaction metadata for the tool timeline', () => {
  const activity = buildAnthropicCompactionEventActivity({
    threadId: 'thread_a',
    turnId: 'turn_1',
    model: 'claude-sonnet-4-6',
    selectedCompactionMode: 'provider_chain_compaction',
    candidateCompactionModes: ['provider_chain_compaction', 'local_summary'],
    contextManagementApplied: true,
    contextManagementAppliedEdits: ['compact_20260112'],
    contextManagementCompactionThresholdTokens: 80_000,
    usageIterations: [
      { type: 'compaction', inputTokens: 1200, outputTokens: 140 },
      { type: 'message', inputTokens: 700, outputTokens: 110 },
    ],
  })

  assert.equal(activity.type, 'info')
  assert.equal(activity.id, 'anthropic_compaction:thread_a:turn_1:anthropic_context_management')
  assert.equal(activity.coalesce, true)
  assert.equal(activity.status, 'applied')
  assert.equal(activity.eventKind, 'anthropic_compaction_event')
  assert.equal(activity.strategy, 'anthropic_context_management')
  assert.equal(activity.scope, 'partial_reduce')
  assert.equal(activity.source, 'provider')
  assert.equal(activity.usageRefreshState, 'none')
  assert.equal(activity.label, 'Anthropic context compaction applied')
  assert.match(String(activity.detail || ''), /compaction mode: provider chain compaction/)
  assert.match(String(activity.detail || ''), /context_management_applied: true/)
  assert.match(String(activity.detail || ''), /applied_edits: compact_20260112/)
  assert.match(String(activity.detail || ''), /context_management_threshold_tokens: 80000/)
  assert.match(String(activity.detail || ''), /usage_iterations: compaction:1200\/140, message:700\/110/)
  assert.equal(activity.compactionMilestone, true)
})

test('anthropic event bridge registration wires subscriptions and unsubscribes on cleanup', () => {
  const handlers = new Map()
  const unsubscribed = []
  const activities = []

  const cleanup = registerAnthropicEventBridgeHandlers({
    safeSub: (_eventKey, handler, name) => {
      handlers.set(name, handler)
      return () => unsubscribed.push(name)
    },
    chatApi: {
      onAnthropicCompactionEvent: Symbol('onAnthropicCompactionEvent'),
    },
    useChatStore: {
      getState: () => ({
        pushToolActivity: (activity) => activities.push(activity),
      }),
    },
  })

  handlers.get('onAnthropicCompactionEvent')({
    threadId: 'thread_a',
    turnId: 'turn_1',
    contextManagementAppliedEdits: ['compact_20260112'],
  })

  assert.equal(activities.length, 1)
  assert.equal(activities[0].eventKind, 'anthropic_compaction_event')

  cleanup()
  assert.deepEqual(unsubscribed, ['onAnthropicCompactionEvent'])
})
