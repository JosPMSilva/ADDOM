import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CANONICAL_ROOT_EVENT_SCHEMA_VERSION,
  EXECUTION_CONTRACT_VERSION,
  normalizeCanonicalRootEvent,
  normalizeExecutionEvent,
} from '../../src/common/chat/execution-event-contract.mjs'
import {
  EXECUTION_CAPABILITY_PROFILES,
  resolveExecutionCapabilityProfile,
  resolveExecutionFamilyFromProviderId,
} from '../../src/common/chat/execution-capabilities.mjs'

test('normalizeExecutionEvent returns only canonical fields', () => {
  const event = normalizeExecutionEvent({
    kind: 'tool_result',
    turnId: ' turn-1 ',
    sessionId: ' step-1 ',
    toolKind: 'command',
    state: 'failed',
    detail: 'exit 1',
    sequence: 4,
    providerId: 'cursor',
    providerPayload: { private: true },
  })

  assert.deepEqual(event, {
    contractVersion: EXECUTION_CONTRACT_VERSION,
    kind: 'tool_result',
    threadId: '',
    turnId: 'turn-1',
    eventId: '',
    sessionId: 'step-1',
    messageId: '',
    reasoningRole: '',
    toolKind: 'command',
    state: 'failed',
    detail: 'exit 1',
    stream: '',
    sequence: 4,
    emittedAt: 0,
    terminal: false,
    diagnosticSeverity: '',
  })
})

test('normalizeExecutionEvent preserves toolInput and output for L2 identity', () => {
  const event = normalizeExecutionEvent({
    kind: 'tool_result',
    turnId: 'turn-1',
    sessionId: 'step-1',
    toolKind: 'file_edit',
    state: 'succeeded',
    detail: '{"success":{"path":"C:\\\\repo\\\\a.py"}}',
    toolInput: { path: 'a.py' },
    output: { success: { path: 'C:\\\\repo\\\\a.py' } },
    providerPayload: { private: true },
  })
  assert.deepEqual(event.toolInput, { path: 'a.py' })
  assert.deepEqual(event.output, { success: { path: 'C:\\\\repo\\\\a.py' } })
  assert.equal(Object.hasOwn(event, 'providerPayload'), false)
})

test('normalizeExecutionEvent rejects invalid canonical events', () => {
  assert.throws(() => normalizeExecutionEvent({ turnId: 'turn-1' }), /kind/i)
  assert.throws(() => normalizeExecutionEvent({ kind: 'tool_started' }), /turnId/i)
  assert.throws(
    () => normalizeExecutionEvent({ kind: 'tool_started', turnId: 'turn-1', state: 'mystery' }),
    /state/i,
  )
  assert.throws(
    () => normalizeExecutionEvent({ kind: 'reasoning_chunk', turnId: 'turn-1', reasoningRole: 'private' }),
    /reasoningRole/i,
  )
  assert.throws(
    () => normalizeExecutionEvent({ kind: 'turn_state', turnId: 'turn-1', terminal: true, state: 'active' }),
    /terminal state/i,
  )
})

test('normalizeCanonicalRootEvent preserves stable identity and sanitizes source and actor metadata', () => {
  const event = normalizeCanonicalRootEvent({
    schemaVersion: CANONICAL_ROOT_EVENT_SCHEMA_VERSION,
    canonicalEventId: ' root_event_01 ',
    projectId: ' project_01 ',
    conversationId: ' thread_01 ',
    threadId: ' thread_01 ',
    turnId: ' turn_01 ',
    localSequence: 2,
    occurredAt: 1_000,
    createdAt: 1_010,
    updatedAt: 1_020,
    source: {
      providerId: ' OpenAI ',
      transport: ' WebSocket ',
      runtime: ' Responses ',
      providerEventId: ' response.output_text.delta:42 ',
      providerCorrelationKey: ' openai:response_01 ',
      credential: 'must-not-survive',
    },
    actor: {
      kind: ' ROOT ',
      id: ' root ',
      conversationId: ' thread_01 ',
      runId: ' run_01 ',
      privateState: true,
    },
    semanticKind: ' Commentary_Delta ',
    phase: ' COMMENTARY ',
    lifecycle: ' active ',
    payload: { text: 'Checking the workspace.' },
    supportDecision: ' supported ',
    progressiveKey: ' commentary:item_01 ',
    providerPayload: { private: true },
  })

  assert.deepEqual(event, {
    schemaVersion: CANONICAL_ROOT_EVENT_SCHEMA_VERSION,
    canonicalEventId: 'root_event_01',
    projectId: 'project_01',
    conversationId: 'thread_01',
    threadId: 'thread_01',
    turnId: 'turn_01',
    localSequence: 2,
    occurredAt: 1_000,
    createdAt: 1_010,
    updatedAt: 1_020,
    source: {
      providerId: 'openai',
      transport: 'websocket',
      runtime: 'responses',
      providerEventId: 'response.output_text.delta:42',
      providerCorrelationKey: 'openai:response_01',
    },
    actor: {
      kind: 'root',
      id: 'root',
      conversationId: 'thread_01',
      runId: 'run_01',
    },
    semanticKind: 'commentary_delta',
    phase: 'commentary',
    lifecycle: 'active',
    payload: { text: 'Checking the workspace.' },
    supportDecision: 'supported',
    progressiveKey: 'commentary:item_01',
  })
})

test('normalizeCanonicalRootEvent validates identity, lifecycle, support, and binary-free payloads', () => {
  const valid = {
    schemaVersion: CANONICAL_ROOT_EVENT_SCHEMA_VERSION,
    canonicalEventId: 'root_event_01',
    projectId: 'project_01',
    conversationId: 'thread_01',
    threadId: 'thread_01',
    turnId: 'turn_01',
    localSequence: 1,
    occurredAt: 1_000,
    createdAt: 1_000,
    updatedAt: 1_000,
    source: { providerId: 'openai', transport: 'http', runtime: 'responses' },
    actor: { kind: 'root', id: 'root', conversationId: 'thread_01', runId: '' },
    semanticKind: 'turn_state',
    phase: 'lifecycle',
    lifecycle: 'active',
    payload: {},
    supportDecision: 'supported',
    progressiveKey: 'turn',
  }

  assert.throws(() => normalizeCanonicalRootEvent({ ...valid, canonicalEventId: '' }), /canonicalEventId/i)
  assert.throws(() => normalizeCanonicalRootEvent({ ...valid, localSequence: 0 }), /localSequence/i)
  assert.throws(() => normalizeCanonicalRootEvent({ ...valid, conversationId: 'other' }), /conversationId.*threadId/i)
  assert.throws(() => normalizeCanonicalRootEvent({ ...valid, actor: { ...valid.actor, kind: 'mystery' } }), /actor.kind/i)
  assert.throws(() => normalizeCanonicalRootEvent({ ...valid, lifecycle: 'mystery' }), /lifecycle/i)
  assert.throws(() => normalizeCanonicalRootEvent({ ...valid, supportDecision: 'maybe' }), /supportDecision/i)
  assert.throws(() => normalizeCanonicalRootEvent({ ...valid, updatedAt: 999 }), /updatedAt/i)
  assert.throws(() => normalizeCanonicalRootEvent({ ...valid, payload: Buffer.from('binary') }), /binary/i)
  assert.throws(() => normalizeCanonicalRootEvent({
    ...valid,
    payload: { image: 'data:image/png;base64,iVBORw0KGgo=' },
  }), /managed artifact reference/i)
  const prototypeBearing = normalizeCanonicalRootEvent({
    ...valid,
    payload: JSON.parse('{"nested":{"__proto__":{"isAdmin":true}}}'),
  })
  assert.equal(Object.getPrototypeOf(prototypeBearing.payload.nested), Object.prototype)
  assert.equal(Object.hasOwn(prototypeBearing.payload.nested, '__proto__'), true)
  assert.equal(prototypeBearing.payload.nested.isAdmin, undefined)
  assert.deepEqual(prototypeBearing.payload.nested.__proto__, { isAdmin: true })
})

test('all curated execution families resolve to declared profiles', () => {
  assert.deepEqual(Object.keys(EXECUTION_CAPABILITY_PROFILES).sort(), [
    'commentary_and_tools',
    'reasoning_and_tools',
    'reasoning_and_tools_no_answer',
    'tools_only',
  ])

  assert.deepEqual(
    resolveExecutionCapabilityProfile({ family: 'cursor' }),
    EXECUTION_CAPABILITY_PROFILES.reasoning_and_tools_no_answer,
  )

  for (const family of ['openai_account', 'openai_api', 'anthropic', 'gemini', 'cursor', 'generic']) {
    const profile = resolveExecutionCapabilityProfile({ family })
    assert.ok(profile, family)
    assert.equal(typeof profile.reasoning, 'boolean')
    assert.equal(typeof profile.commentary, 'boolean')
    assert.equal(profile.tools, true)
  }
})

test('unknown execution families use the conservative tools-only profile', () => {
  assert.equal(
    resolveExecutionCapabilityProfile({ family: 'future-provider' }),
    EXECUTION_CAPABILITY_PROFILES.tools_only,
  )
})

test('openrouter provider id resolves to reasoning-capable profile', () => {
  assert.equal(resolveExecutionFamilyFromProviderId('openrouter'), 'openrouter')
  assert.deepEqual(
    resolveExecutionCapabilityProfile({ providerId: 'openrouter' }),
    EXECUTION_CAPABILITY_PROFILES.reasoning_and_tools,
  )
  assert.deepEqual(
    resolveExecutionCapabilityProfile({ family: 'openrouter' }),
    EXECUTION_CAPABILITY_PROFILES.reasoning_and_tools,
  )
})
