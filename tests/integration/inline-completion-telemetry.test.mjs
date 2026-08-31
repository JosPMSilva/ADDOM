import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createInlineCompletionTelemetryState,
  recordInlineCompletionTelemetryEvent,
  getInlineCompletionTelemetrySnapshot,
  clearInlineCompletionTelemetry,
} from '../../src/main/editor/inline-completion-telemetry.mjs'

test('inline completion telemetry records request/result/accept/dismiss counters', () => {
  const state = createInlineCompletionTelemetryState({ maxRecentEvents: 4 })
  recordInlineCompletionTelemetryEvent(state, 'request', { providerId: 'openai', model: 'gpt-5' })
  recordInlineCompletionTelemetryEvent(state, 'success', { providerId: 'openai', model: 'gpt-5', chars: 21 })
  recordInlineCompletionTelemetryEvent(state, 'accept', { providerId: 'openai', chars: 21 })
  recordInlineCompletionTelemetryEvent(state, 'dismiss', { providerId: 'openai', chars: 18 })
  recordInlineCompletionTelemetryEvent(state, 'error', { providerId: 'openai', reason: 'timeout' })

  const snapshot = getInlineCompletionTelemetrySnapshot(state)
  assert.equal(snapshot.counters.requestCount, 1)
  assert.equal(snapshot.counters.successCount, 1)
  assert.equal(snapshot.counters.acceptCount, 1)
  assert.equal(snapshot.counters.dismissCount, 1)
  assert.equal(snapshot.counters.errorCount, 1)
  assert.equal(snapshot.breakdowns.providerRequests.openai, 1)
  assert.equal(snapshot.breakdowns.providerSuccesses.openai, 1)
  assert.equal(snapshot.breakdowns.providerErrors.openai, 1)
  assert.equal(snapshot.recentEvents.length, 4)
})

test('inline completion telemetry clear resets counters and events', () => {
  const state = createInlineCompletionTelemetryState()
  recordInlineCompletionTelemetryEvent(state, 'request', { providerId: 'gemini' })
  recordInlineCompletionTelemetryEvent(state, 'success', { providerId: 'gemini' })

  clearInlineCompletionTelemetry(state)
  const snapshot = getInlineCompletionTelemetrySnapshot(state)
  assert.equal(snapshot.counters.requestCount, 0)
  assert.equal(snapshot.counters.successCount, 0)
  assert.equal(snapshot.recentEvents.length, 0)
})

test('inline completion telemetry caps provider breakdown keys with deterministic LRU eviction', () => {
  const state = createInlineCompletionTelemetryState({
    maxRecentEvents: 10,
    maxProviderBreakdownKeys: 2,
  })

  recordInlineCompletionTelemetryEvent(state, 'request', { providerId: 'provider-a' })
  recordInlineCompletionTelemetryEvent(state, 'request', { providerId: 'provider-b' })
  recordInlineCompletionTelemetryEvent(state, 'request', { providerId: 'provider-c' }) // evicts provider-a
  recordInlineCompletionTelemetryEvent(state, 'request', { providerId: 'provider-b' }) // refresh provider-b
  recordInlineCompletionTelemetryEvent(state, 'request', { providerId: 'provider-d' }) // evicts provider-c

  const snapshot = getInlineCompletionTelemetrySnapshot(state)
  const requestKeys = Object.keys(snapshot.breakdowns.providerRequests).sort()
  assert.deepEqual(requestKeys, ['provider-b', 'provider-d'])
  assert.equal(snapshot.breakdowns.providerRequests['provider-b'], 2)
  assert.equal(snapshot.breakdowns.providerRequests['provider-d'], 1)
  assert.equal(snapshot.limits.maxProviderBreakdownKeys, 2)
  assert.equal(snapshot.limits.providerBreakdownCapped, true)
})

test('inline completion telemetry keeps event-kind breakdown uncapped', () => {
  const state = createInlineCompletionTelemetryState({
    maxProviderBreakdownKeys: 1,
  })
  const kinds = ['request', 'success', 'error', 'accept', 'dismiss', 'empty']
  for (const kind of kinds) {
    recordInlineCompletionTelemetryEvent(state, kind, { providerId: `provider-${kind}` })
  }
  const snapshot = getInlineCompletionTelemetrySnapshot(state)
  for (const kind of kinds) {
    assert.equal(snapshot.breakdowns.eventKinds[kind], 1)
  }
})
