import assert from 'node:assert/strict'
import test from 'node:test'

import { createPreloadHarness } from './preload-bridge-test-helpers.mjs'

test('preload exposes only the allowlisted Agent Run API on versioned channels', async () => {
  const harness = await createPreloadHarness()
  const api = harness.addom.agentRuns

  for (const method of [
    'list',
    'get',
    'getTranscriptPage',
    'getEventsPage',
    'getConversation',
    'getConversationTranscriptPage',
    'subscribe',
    'control',
    'followup',
    'promoteConversation',
    'retry',
    'setQueuePaused',
    'resolveApproval',
    'decideArtifact',
  ]) {
    assert.equal(typeof api?.[method], 'function', method)
  }
  assert.equal(api.message, undefined)
  assert.equal(api.invoke, undefined)
  assert.equal(api.ipc, undefined)

  await api.get({
    projectId: ' project_01 ',
    threadId: ' thread_01 ',
    runId: ' run_01 ',
    reconciliationReason: ' sequence_gap ',
    unsafePath: 'C:/secret',
  })
  assert.deepEqual(harness.invokeCalls.at(-1), {
    channel: 'v1:agent-runs:get',
    payload: {
      projectId: 'project_01',
      threadId: 'thread_01',
      runId: 'run_01',
      reconciliationReason: 'sequence_gap',
    },
  })
})

test('preload Agent Run subscriptions share one event listener and unsubscribe in main', async () => {
  const harness = await createPreloadHarness({
    invokeBehavior: async (channel) => {
      if (channel === 'v1:agent-runs:subscribe') {
        return { ok: true, subscriptionId: 'agent_subscription_01' }
      }
      return { ok: true }
    },
  })
  const received = []
  const unsubscribe = await harness.addom.agentRuns.subscribe({
    projectId: 'project_01',
    threadId: 'thread_01',
    runId: 'run_01',
  }, (event) => received.push(event))

  assert.equal(harness.listenerCount('v1:agent-runs:event'), 1)
  harness.emit('v1:agent-runs:event', {
    subscriptionId: 'agent_subscription_other',
    event: { eventId: 'ignored' },
  })
  harness.emit('v1:agent-runs:event', {
    subscriptionId: 'agent_subscription_01',
    event: { eventId: 'event_01' },
  })
  assert.deepEqual(received, [{ eventId: 'event_01' }])

  await unsubscribe()
  assert.equal(harness.listenerCount('v1:agent-runs:event'), 0)
  assert.deepEqual(
    harness.invokeCalls.map((row) => row.channel),
    ['v1:agent-runs:subscribe', 'v1:agent-runs:unsubscribe'],
  )
})
