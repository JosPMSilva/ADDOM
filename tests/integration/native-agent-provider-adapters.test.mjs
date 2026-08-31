import test from 'node:test'
import assert from 'node:assert/strict'

import { createCursorAgentAdapter } from '../../src/main/agents/providers/cursor-agent-adapter.mjs'
import { createOpenAINativeAgentAdapter } from '../../src/main/agents/providers/openai-native-agent-adapter.mjs'
import { NATIVE_AGENT_SUPPORT_TARGETS } from '../../src/main/agents/providers/native-agent-support-targets.mjs'
import {
  assertAgentProviderCapabilityConformance,
} from '../helpers/agent-provider-conformance.mjs'

const TS = 1_752_600_000_000

test('OpenAI account adapter projects receiver-thread identity as partial native evidence', async () => {
  const events = []
  let cancelled = 0
  const adapter = createOpenAINativeAgentAdapter({
    now: (() => {
      let value = TS
      return () => ++value
    })(),
    startOperation: async ({ onCollaborationEvent, onChunk, onReasoning }) => ({
      response: {
        id: 'turn_root_1',
        conversation: { id: 'thread_root_1' },
      },
      cancel: async () => { cancelled += 1 },
      awaitResult: async () => {
        onCollaborationEvent({
          phase: 'started',
          providerEventId: 'item_spawn_1:started',
          providerActivityId: 'item_spawn_1',
          spawnRequestId: 'item_spawn_1',
          parentProviderThreadId: 'thread_root_1',
          providerThreadId: null,
          status: 'running',
        })
        onChunk({ chunk: 'Root working note.', phase: 'commentary' })
        onChunk({ chunk: '\n', phase: 'commentary' })
        onChunk({ chunk: '- verified.', phase: 'commentary' })
        onReasoning('\n')
        onReasoning('Root reasoning.')
        onCollaborationEvent({
          phase: 'completed',
          providerEventId: 'item_spawn_1:completed',
          providerActivityId: 'item_spawn_1',
          spawnRequestId: 'item_spawn_1',
          parentProviderThreadId: 'thread_root_1',
          providerThreadId: 'thread_child_1',
          status: 'completed',
        })
        return {
          text: 'Root final answer.',
          usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
          providerResponseMeta: {
            accountBridgeThreadId: 'thread_root_1',
            accountBridgeTurnId: 'turn_root_1',
          },
        }
      },
    }),
  })

  const { session, snapshot } = await assertAgentProviderCapabilityConformance({
    adapter,
    providerId: 'openai',
    modelId: 'gpt-5.6-sol',
    capturedAt: TS,
    expectedAdapterId: 'openai-native',
    expectedMode: 'partial_native_projection',
    expectedOperations: ['create', 'start', 'cancel', 'dispose', 'usage'],
    context: {
      messages: [{ role: 'user', content: 'Delegate a review.' }],
      options: {},
      parentAttemptId: 'attempt_root',
    },
    appendEvent: async (event) => events.push(event),
  })
  assert.equal(snapshot.nodeCapabilities.mode, 'partial_native_projection')
  assert.equal(snapshot.nodeCapabilities.addressableChildren, true)
  assert.equal(snapshot.nodeCapabilities.childStreams, false)
  assert.equal(snapshot.nodeCapabilities.childCancellation, false)

  const result = await adapter.start(session.sessionId)

  assert.equal(session.providerSessionId, 'thread_root_1')
  assert.equal(result.status, 'completed')
  assert.equal(result.summary, 'Root final answer.')
  const child = events.find((event) => event.kind === 'node_discovered')
  assert.equal(child.payload.providerThreadId, 'thread_child_1')
  assert.equal(child.payload.parentProviderThreadId, 'thread_root_1')
  assert.equal(child.payload.reconciliationState, 'matched')
  assert.equal(child.payload.capabilityMode, 'partial_native_projection')
  assert.equal(child.payload.nodeCapabilityMode, 'provider_opaque')
  assert.equal(child.payload.workspaceMode, 'opaque_no_write_surface')
  assert.equal(child.payload.transcriptEvidence, 'status_only')
  assert.equal(
    events.some((event) => event.kind === 'commentary' && /Root final answer/.test(event.payload.text)),
    false,
  )
  assert.deepEqual(
    events.filter((event) => event.kind === 'commentary').map((event) => event.payload.text),
    ['Root working note.', '\n- verified.'],
  )
  assert.deepEqual(
    events.filter((event) => event.kind === 'reasoning').map((event) => event.payload.text),
    ['\nRoot reasoning.'],
  )
  await adapter.cancel(session.sessionId, { reason: 'test' })
  assert.equal(cancelled, 1)
  await adapter.dispose(session.sessionId)
})

test('Cursor adapter keeps root-session events root-owned and never infers a child from Task labels', async () => {
  const events = []
  let cancelled = 0
  const adapter = createCursorAgentAdapter({
    now: (() => {
      let value = TS
      return () => ++value
    })(),
    startSession: async ({ onEvent }) => ({
      providerSessionId: 'cursor_session_1',
      cancel: async () => { cancelled += 1 },
      awaitResult: async () => {
        onEvent({ kind: 'assistant_delta', sessionId: 'cursor_session_1', text: 'Inspecting.' })
        onEvent({
          kind: 'tool_started',
          sessionId: 'cursor_session_1',
          callId: 'call_task_1',
          toolCall: { task: { args: { description: 'Possible child' } } },
        })
        onEvent({
          kind: 'tool_completed',
          sessionId: 'cursor_session_1',
          callId: 'call_task_1',
          toolCall: { task: { result: { success: { text: 'done' } } } },
        })
        return {
          status: 'completed',
          summary: 'Cursor root final.',
          requestId: 'cursor_request_1',
        }
      },
    }),
  })

  const { session, snapshot } = await assertAgentProviderCapabilityConformance({
    adapter,
    providerId: 'cursor',
    modelId: 'composer-2.5',
    capturedAt: TS,
    expectedAdapterId: 'cursor-agent',
    expectedMode: 'partial_native_projection',
    expectedOperations: ['create', 'start', 'cancel', 'dispose'],
    context: { prompt: 'Inspect.', projectFolder: 'C:/workspace/project-01' },
    appendEvent: async (event) => events.push(event),
  })
  assert.equal(snapshot.nodeCapabilities.mode, 'partial_native_projection')
  assert.equal(snapshot.nodeCapabilities.addressableChildren, false)
  assert.equal(snapshot.nodeCapabilities.childStreams, false)

  const result = await adapter.start(session.sessionId)

  assert.equal(session.providerSessionId, 'cursor_session_1')
  assert.equal(result.summary, 'Cursor root final.')
  assert.equal(events.some((event) => event.kind === 'node_discovered'), false)
  assert.equal(events.filter((event) => event.kind === 'tool_started').length, 1)
  assert.deepEqual(
    events.filter((event) => event.kind === 'assistant_delta').map((event) => event.payload.text),
    ['Inspecting.'],
  )
  await adapter.cancel(session.sessionId, { reason: 'test' })
  assert.equal(cancelled, 1)
  await adapter.dispose(session.sessionId)
})

test('support targets distinguish shipped evidence from future conformance routes', () => {
  assert.equal(NATIVE_AGENT_SUPPORT_TARGETS.openaiAccount.capabilityMode, 'partial_native_projection')
  assert.equal(NATIVE_AGENT_SUPPORT_TARGETS.openaiAccount.releaseState, 'available')
  assert.equal(NATIVE_AGENT_SUPPORT_TARGETS.cursor.capabilityMode, 'partial_native_projection')
  assert.equal(NATIVE_AGENT_SUPPORT_TARGETS.cursor.childIdentity, 'unavailable')
  assert.equal(NATIVE_AGENT_SUPPORT_TARGETS.openaiResponses.capabilityMode, 'native_hierarchy')
  assert.equal(NATIVE_AGENT_SUPPORT_TARGETS.openaiResponses.releaseState, 'contract_only')
})
