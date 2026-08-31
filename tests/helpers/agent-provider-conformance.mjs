import assert from 'node:assert/strict'

import {
  AgentProviderCapabilityError,
} from '../../src/main/agents/providers/agent-provider-adapter.mjs'

const LIFECYCLE_OPERATIONS = Object.freeze([
  'start',
  'resume',
  'message',
  'interrupt',
  'cancel',
])

const CONTROL_OPERATIONS = Object.freeze([
  'resume',
  'message',
  'interrupt',
  'cancel',
])

export async function assertAgentProviderCapabilityConformance({
  adapter,
  providerId,
  modelId,
  capturedAt,
  context = {},
  expectedAdapterId,
  expectedMode,
  expectedOperations = [],
  appendEvent = async () => {},
}) {
  const expected = new Set(expectedOperations)
  const snapshot = await adapter.probe({ providerId, modelId, capturedAt, context })
  assert.equal(snapshot.adapterId, expectedAdapterId)
  assert.equal(snapshot.nodeCapabilities.mode, expectedMode)
  for (const [operation, supported] of Object.entries(snapshot.runCapabilities)) {
    assert.equal(
      supported,
      expected.has(operation),
      `${expectedAdapterId} capability mismatch for ${operation}`,
    )
  }
  const session = await adapter.create({
    providerId,
    modelId,
    capturedAt,
    context,
    capabilitySnapshot: snapshot,
    appendEvent,
  })
  assert.ok(!('controlHandle' in session))
  for (const operation of CONTROL_OPERATIONS.filter((name) => !expected.has(name))) {
    await assert.rejects(
      adapter[operation](session.sessionId, { reason: 'conformance' }),
      (error) => (
        error instanceof AgentProviderCapabilityError
        && error.capability === operation
      ),
    )
  }
  return { session, snapshot }
}

export async function assertAgentProviderLifecycleConformance({
  adapter,
  calls,
  expectedAdapterId,
  expectedMode,
  modelId,
  capturedAt,
}) {
  const events = []
  const session = await adapter.create({
    modelId,
    capturedAt,
    appendEvent: async (event) => events.push(event),
  })

  assert.equal(session.adapterId, expectedAdapterId)
  assert.equal(session.capabilitySnapshot.nodeCapabilities.mode, expectedMode)
  assert.ok(!('controlHandle' in session))
  for (const operation of LIFECYCLE_OPERATIONS) {
    assert.deepEqual(await adapter[operation](session.sessionId, { reason: operation }), {
      ok: true,
      operation,
    })
  }
  assert.deepEqual(await adapter.dispose(session.sessionId), { ok: true, operation: 'dispose' })
  assert.deepEqual(calls, ['create', ...LIFECYCLE_OPERATIONS, 'dispose'])
  assert.deepEqual(events.map((event) => event.kind), [
    'created',
    ...LIFECYCLE_OPERATIONS.map(() => 'status'),
  ])
  return { events, session }
}
