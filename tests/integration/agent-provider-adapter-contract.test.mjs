import test from 'node:test'
import assert from 'node:assert/strict'

import {
  AgentProviderCapabilityError,
  createAgentProviderAdapter,
} from '../../src/main/agents/providers/agent-provider-adapter.mjs'
import {
  createAgentProviderRegistry,
} from '../../src/main/agents/providers/agent-provider-registry.mjs'
import {
  AGENT_PROVIDER_CAPABILITY_FIELDS,
} from '../../src/common/agents/agent-provider-capability-snapshot.mjs'
import {
  assertAgentProviderLifecycleConformance,
} from '../helpers/agent-provider-conformance.mjs'

const TS = 1_752_600_000_000
const LIFECYCLE_OPERATIONS = ['start', 'resume', 'message', 'interrupt', 'cancel']

function nodeCapabilities(mode) {
  const native = mode === 'native_hierarchy'
  return {
    mode,
    nativeAgents: native,
    recursiveAgents: true,
    childStreams: true,
    addressableChildren: true,
    childMessaging: true,
    childCancellation: true,
    childRetry: true,
    resumableChildren: true,
    perNodeUsage: true,
    approvalAttribution: true,
    workspaceIsolation: true,
    maxDepthHint: 8,
    maxConcurrencyHint: 32,
    visibilityReason: null,
    capabilityKey: mode,
  }
}

function capabilities(mode) {
  return {
    runtimeAvailability: { status: 'available', reason: null },
    providerCapabilities: {
      operations: Object.fromEntries(AGENT_PROVIDER_CAPABILITY_FIELDS.map((field) => [field, true])),
      node: nodeCapabilities(mode),
      evidence: {
        sourceClass: 'fake_adapter',
        confidence: 'verified',
        provenance: [`test:${mode}`],
      },
    },
    modelCapabilities: {
      agentRuntime: true,
      disabledCapabilities: [],
      maxDepthHint: null,
      maxConcurrencyHint: null,
    },
  }
}

function createFakeAdapter(mode, overrides = {}) {
  const calls = []
  const definitions = {
    async create({ emit }) {
      calls.push('create')
      await emit({
        providerEventId: 'event_created',
        kind: 'created',
        occurredAt: TS,
        payload: { providerSessionId: `session_${mode}` },
        providerMetadata: { route: mode, undocumented: 'preserved' },
      })
      return {
        providerSessionId: `session_${mode}`,
        controlHandle: { mode },
      }
    },
    ...Object.fromEntries(LIFECYCLE_OPERATIONS.map((operation) => [
      operation,
      async ({ emit }) => {
        calls.push(operation)
        await emit({
          providerEventId: `event_${operation}`,
          kind: 'status',
          occurredAt: TS + calls.length,
          payload: { operation },
        })
        return { ok: true, operation }
      },
    ])),
    async dispose() {
      calls.push('dispose')
      return { ok: true, operation: 'dispose' }
    },
    ...overrides.implementation,
  }
  const adapter = createAgentProviderAdapter({
    adapterId: `fake-${mode}`,
    capabilityProbe: async () => capabilities(mode),
    implementation: definitions,
    ...overrides.definition,
  })
  return { adapter, calls }
}

async function assertLifecycleConformance(mode) {
  const { adapter, calls } = createFakeAdapter(mode)
  const { events } = await assertAgentProviderLifecycleConformance({
    adapter,
    calls,
    expectedAdapterId: `fake-${mode}`,
    expectedMode: mode,
    modelId: `model-${mode}`,
    capturedAt: TS,
  })
  assert.deepEqual(events[0].diagnostics, {
    [`fake-${mode}`]: { route: mode, undocumented: 'preserved' },
  })
}

test('fake native and managed adapters pass the same lifecycle contract', async () => {
  await assertLifecycleConformance('native_hierarchy')
  await assertLifecycleConformance('managed_hierarchy')
})

test('shared managed adapters retain the concrete provider route in each session snapshot', async () => {
  const { adapter } = createFakeAdapter('managed_hierarchy')
  const session = await adapter.create({
    providerId: 'openrouter',
    modelId: 'anthropic/claude-sonnet-5',
    capturedAt: TS,
    appendEvent: async () => {},
  })

  assert.equal(session.adapterId, 'fake-managed_hierarchy')
  assert.equal(session.capabilitySnapshot.adapterId, 'fake-managed_hierarchy')
  assert.equal(session.capabilitySnapshot.providerId, 'openrouter')
})

test('capabilities can be snapshotted before durable queue ownership and reused at provider creation', async () => {
  let probeCalls = 0
  const { adapter } = createFakeAdapter('managed_hierarchy', {
    definition: {
      capabilityProbe: async () => {
        probeCalls += 1
        return capabilities('managed_hierarchy')
      },
    },
  })
  const capabilitySnapshot = await adapter.probe({
    providerId: 'openrouter',
    modelId: 'anthropic/claude-sonnet-5',
    capturedAt: TS,
  })
  const session = await adapter.create({
    providerId: 'openrouter',
    modelId: 'anthropic/claude-sonnet-5',
    capturedAt: TS,
    capabilitySnapshot,
    appendEvent: async () => {},
  })

  assert.equal(probeCalls, 1)
  assert.deepEqual(session.capabilitySnapshot, capabilitySnapshot)
})

test('unsupported controls fail deterministically before provider code runs', async () => {
  let messageCalls = 0
  const { adapter } = createFakeAdapter('managed_hierarchy', {
    definition: {
      capabilityProbe: async () => {
        const result = capabilities('managed_hierarchy')
        result.providerCapabilities.operations.message = false
        return result
      },
    },
    implementation: {
      async message() {
        messageCalls += 1
      },
    },
  })
  const session = await adapter.create({
    modelId: 'model-managed',
    capturedAt: TS,
    appendEvent: async () => {},
  })

  await assert.rejects(
    adapter.message(session.sessionId, { text: 'hello' }),
    (error) => {
      assert.ok(error instanceof AgentProviderCapabilityError)
      assert.equal(error.code, 'AGENT_PROVIDER_CAPABILITY_UNSUPPORTED')
      assert.equal(error.capability, 'message')
      return true
    },
  )
  assert.equal(messageCalls, 0)
})

test('duplicate, late, and invalid provider events never reach the canonical sink', async () => {
  const decisions = []
  const events = []
  const { adapter } = createFakeAdapter('managed_hierarchy', {
    implementation: {
      async start({ emit }) {
        decisions.push(await emit({
          providerEventId: 'event_invalid',
          kind: 'not_a_real_kind',
          occurredAt: TS + 9,
          payload: {},
        }))
        decisions.push(await emit({
          providerEventId: 'event_result',
          kind: 'result',
          occurredAt: TS + 10,
          payload: { status: 'completed', summary: 'Done' },
        }))
        decisions.push(await emit({
          providerEventId: 'event_result',
          kind: 'result',
          occurredAt: TS + 10,
          payload: { status: 'completed', summary: 'Done again' },
        }))
        decisions.push(await emit({
          providerEventId: 'event_late',
          kind: 'commentary',
          occurredAt: TS + 11,
          payload: { text: 'Too late' },
        }))
        return null
      },
    },
  })
  const session = await adapter.create({
    modelId: 'model-managed',
    capturedAt: TS,
    appendEvent: async (event) => events.push(event),
  })
  await adapter.start(session.sessionId)

  assert.deepEqual(decisions.map((decision) => decision.reason), [
    'invalid',
    null,
    'duplicate',
    'late_after_terminal',
  ])
  assert.deepEqual(events.map((event) => event.providerEventId), [
    'event_created',
    'event_result',
  ])
})

test('provider disconnect yields one explicit interrupted terminal result', async () => {
  const events = []
  const { adapter } = createFakeAdapter('managed_hierarchy', {
    implementation: {
      async start({ emit }) {
        await emit({
          providerEventId: 'event_disconnect',
          kind: 'disconnected',
          occurredAt: TS + 10,
          payload: { reason: 'socket_closed' },
        })
        await emit({
          providerEventId: 'event_late_result',
          kind: 'result',
          occurredAt: TS + 11,
          payload: { status: 'completed', summary: 'Unreliable late result' },
        })
        return null
      },
    },
  })
  const session = await adapter.create({
    modelId: 'model-managed',
    capturedAt: TS,
    appendEvent: async (event) => events.push(event),
  })
  await adapter.start(session.sessionId)

  const terminal = events.at(-1)
  assert.equal(terminal.kind, 'result')
  assert.equal(terminal.payload.status, 'interrupted')
  assert.equal(terminal.payload.errorCode, 'PROVIDER_DISCONNECTED')
  assert.equal(events.some((event) => event.providerEventId === 'event_late_result'), false)
})

test('returned terminal results use the same normalized stream and enforce observable evidence', async () => {
  const events = []
  const { adapter } = createFakeAdapter('managed_hierarchy', {
    implementation: {
      async start() {
        return { status: 'completed', summary: 'Completed through the return contract.' }
      },
    },
  })
  const session = await adapter.create({
    modelId: 'model-managed',
    capturedAt: TS,
    appendEvent: async (event) => events.push(event),
  })
  const result = await adapter.start(session.sessionId)

  assert.equal(result.status, 'completed')
  assert.equal(events.at(-1).kind, 'result')
  assert.equal(events.at(-1).payload.summary, result.summary)

  const restricted = createFakeAdapter('managed_hierarchy', {
    definition: {
      capabilityProbe: async () => {
        const resultCapabilities = capabilities('managed_hierarchy')
        resultCapabilities.providerCapabilities.operations.usage = false
        return resultCapabilities
      },
    },
    implementation: {
      async start() {
        return {
          status: 'completed',
          summary: 'Claims unsupported usage.',
          usage: { totalTokens: 100 },
        }
      },
    },
  }).adapter
  const restrictedSession = await restricted.create({
    modelId: 'model-managed',
    capturedAt: TS,
    appendEvent: async () => {},
  })
  await assert.rejects(
    restricted.start(restrictedSession.sessionId),
    (error) => error.code === 'AGENT_PROVIDER_CAPABILITY_UNSUPPORTED'
      && error.capability === 'usage',
  )
})

test('active sessions retain their immutable capability snapshot across later probe changes', async () => {
  let canCancel = true
  const { adapter } = createFakeAdapter('managed_hierarchy', {
    definition: {
      capabilityProbe: async () => {
        const result = capabilities('managed_hierarchy')
        result.providerCapabilities.operations.cancel = canCancel
        return result
      },
    },
  })
  const first = await adapter.create({
    modelId: 'model-managed',
    capturedAt: TS,
    appendEvent: async () => {},
  })
  canCancel = false
  const second = await adapter.create({
    modelId: 'model-managed',
    capturedAt: TS + 1,
    appendEvent: async () => {},
  })

  assert.equal(first.capabilitySnapshot.runCapabilities.cancel, true)
  assert.equal(second.capabilitySnapshot.runCapabilities.cancel, false)
  await assert.doesNotReject(adapter.cancel(first.sessionId))
  await assert.rejects(adapter.cancel(second.sessionId), /not support cancel/i)
})

test('registry rejects duplicate adapters and resolves by opaque adapter ID', () => {
  const registry = createAgentProviderRegistry()
  const { adapter } = createFakeAdapter('managed_hierarchy')

  registry.register(adapter)
  assert.equal(registry.resolve(adapter.adapterId), adapter)
  assert.deepEqual(registry.list().map((entry) => entry.adapterId), [adapter.adapterId])
  assert.throws(() => registry.register(adapter), /already registered/i)
  assert.throws(() => registry.resolve('missing-adapter'), /not registered/i)
})
