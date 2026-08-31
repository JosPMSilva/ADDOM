import test from 'node:test'
import assert from 'node:assert/strict'

import { REASONING_PHASE_BOUNDARY } from '../../src/common/chat/reasoning-phase-boundary.mjs'
import { resolveExecutionReasoningMessageId } from '../../src/common/chat/reasoning-segment.mjs'
import { resolveExecutionCapabilityProfile } from '../../src/common/chat/execution-capabilities.mjs'
import { createCursorAgentEventMapper } from '../../src/main/cursor-agent/cursor-agent-event-mapper.mjs'
import {
  appendLiveExecutionReasoningEvent,
  createEmptyLiveExecutionState,
  upsertLiveExecutionActivity,
} from '../../src/renderer/store/chat/live-execution-store.mjs'
import { buildExecutionStreamItems } from '../../src/renderer/components/chat/live-execution-stream-items.mjs'
import { buildOpenAIProviderToolOutputActivity, buildOpenAIProviderToolStatusActivity } from '../../src/renderer/components/chat/chat-event-bridge-openai.mjs'
import { reducePersistedTimelineRecords } from '../../src/renderer/store/chat/timeline-execution-event-adapter.mjs'

function simulateCursorInterleavedTurn() {
  let live = createEmptyLiveExecutionState()
  live = appendLiveExecutionReasoningEvent(live, {
    threadId: 'thread-1',
    turnId: 'turn-cursor',
    messageId: 'assistant-msg',
    reasoningRole: 'reasoning',
    chunk: 'Planning the calculator upgrade.',
    emittedAt: 10,
    streamMeta: { threadId: 'thread-1', turnId: 'turn-cursor', providerId: 'cursor' },
  })
  live = upsertLiveExecutionActivity(live, buildOpenAIProviderToolStatusActivity({
    threadId: 'thread-1',
    turnId: 'turn-cursor',
    providerId: 'cursor',
    toolCallId: 'call-1',
    toolName: 'read_file',
    type: 'tool-input-start',
  }))
  live = upsertLiveExecutionActivity(live, buildOpenAIProviderToolOutputActivity({
    threadId: 'thread-1',
    turnId: 'turn-cursor',
    providerId: 'cursor',
    toolCallId: 'call-1',
    toolName: 'read_file',
    output: { success: true },
  }))
  live = appendLiveExecutionReasoningEvent(live, {
    threadId: 'thread-1',
    turnId: 'turn-cursor',
    messageId: 'assistant-msg',
    reasoningRole: 'reasoning',
    chunk: 'Applying the patch.',
    emittedAt: 40,
    streamMeta: { threadId: 'thread-1', turnId: 'turn-cursor', providerId: 'cursor' },
  })
  live = upsertLiveExecutionActivity(live, buildOpenAIProviderToolStatusActivity({
    threadId: 'thread-1',
    turnId: 'turn-cursor',
    providerId: 'cursor',
    toolCallId: 'call-2',
    toolName: 'edit_file',
    type: 'tool-input-start',
  }))
  live = upsertLiveExecutionActivity(live, buildOpenAIProviderToolOutputActivity({
    threadId: 'thread-1',
    turnId: 'turn-cursor',
    providerId: 'cursor',
    toolCallId: 'call-2',
    toolName: 'edit_file',
    output: { success: true },
  }))
  return live.turnsById['turn-cursor']
}

test('resolveExecutionReasoningMessageId assigns segmented ids for cursor turns', () => {
  assert.equal(
    resolveExecutionReasoningMessageId({ turnId: 'turn-1', segment: 0, providerId: 'cursor' }),
    'execution_reasoning:turn-1',
  )
  assert.equal(
    resolveExecutionReasoningMessageId({ turnId: 'turn-1', segment: 2, providerId: 'cursor' }),
    'execution_reasoning:turn-1:2',
  )
})

test('cursor live ingestion interleaves reasoning segments with provider tools', () => {
  const turn = simulateCursorInterleavedTurn()
  const items = buildExecutionStreamItems(turn, resolveExecutionCapabilityProfile({ family: 'cursor' }))

  assert.deepEqual(items.map(({ kind, label }) => ({ kind, label })), [
    { kind: 'reasoning', label: 'Planning the calculator upgrade.' },
    { kind: 'tool', label: 'Read file' },
    { kind: 'reasoning', label: 'Applying the patch.' },
    { kind: 'tool', label: 'Edited file' },
  ])
  assert.deepEqual(turn.itemOrder, [
    'reasoning:execution_reasoning:turn-cursor',
    'tool:session:turn-cursor:call-1',
    'reasoning:execution_reasoning:turn-cursor:1',
    'tool:session:turn-cursor:call-2',
  ])
})

test('account-backed reasoning keeps its arrival order around tool activity', () => {
  let live = createEmptyLiveExecutionState()
  const streamMeta = {
    threadId: 'thread-account-order',
    turnId: 'turn-account-order',
    providerId: 'openai',
    authMethod: 'account',
    transportMode: 'codex_app_server_chatgpt',
  }
  live = appendLiveExecutionReasoningEvent(live, {
    threadId: streamMeta.threadId,
    turnId: streamMeta.turnId,
    messageId: 'assistant-account-order',
    reasoningRole: 'reasoning',
    chunk: 'Preparing the image tool.',
    emittedAt: 10,
    streamMeta: { ...streamMeta, reasoningSegment: 0 },
  })
  live = upsertLiveExecutionActivity(live, {
    id: 'read-start',
    type: 'executing',
    eventKind: 'tool_executing',
    threadId: streamMeta.threadId,
    turnId: streamMeta.turnId,
    stepId: 'read-step',
    toolName: 'read_file',
    createdAt: 20,
  })
  live = upsertLiveExecutionActivity(live, {
    id: 'read-result',
    type: 'result',
    eventKind: 'tool_result',
    threadId: streamMeta.threadId,
    turnId: streamMeta.turnId,
    stepId: 'read-step',
    toolName: 'read_file',
    createdAt: 20,
    finishedAt: 30,
    result: { ok: true },
  })
  live = appendLiveExecutionReasoningEvent(live, {
    threadId: streamMeta.threadId,
    turnId: streamMeta.turnId,
    messageId: 'assistant-account-order',
    reasoningRole: 'reasoning',
    chunk: 'Calling image generation.',
    emittedAt: 40,
    streamMeta: { ...streamMeta, reasoningSegment: 1 },
  })
  live = upsertLiveExecutionActivity(live, {
    id: 'image-result',
    type: 'result',
    eventKind: 'provider_tool_output',
    threadId: streamMeta.threadId,
    turnId: streamMeta.turnId,
    stepId: 'image-call',
    toolName: 'image_generation',
    createdAt: 50,
    finishedAt: 50,
    result: { ok: true },
  })
  live = appendLiveExecutionReasoningEvent(live, {
    threadId: streamMeta.threadId,
    turnId: streamMeta.turnId,
    messageId: 'assistant-account-order',
    reasoningRole: 'reasoning',
    chunk: 'Reviewing the generated image.',
    emittedAt: 60,
    streamMeta: { ...streamMeta, reasoningSegment: 2 },
  })

  const turn = live.turnsById[streamMeta.turnId]
  const items = buildExecutionStreamItems(
    turn,
    resolveExecutionCapabilityProfile({ family: 'openai_account' }),
    { clusterThreshold: 99 },
  )

  assert.deepEqual(items.map(({ kind, label }) => ({ kind, label })), [
    { kind: 'reasoning', label: 'Preparing the image tool.' },
    { kind: 'tool', label: 'Read file' },
    { kind: 'reasoning', label: 'Calling image generation.' },
    { kind: 'tool', label: 'Ran tool' },
    { kind: 'reasoning', label: 'Reviewing the generated image.' },
  ])
})

test('cursor mapper persists reasoningSegment and bumps after tool_started', () => {
  const timeline = []
  const mapper = createCursorAgentEventMapper({
    threadId: 'thread-1',
    turnId: 'turn-mapper',
    persistTimelineEvent: (kind, payload) => timeline.push({ kind, ...payload }),
  })

  mapper.handle({ kind: 'thinking_delta', text: 'First burst.' })
  mapper.handle({ kind: 'thinking_completed' })
  mapper.handle({
    kind: 'tool_started',
    callId: 'call-a',
    toolCall: { name: 'read_file' },
  })
  mapper.handle({ kind: 'thinking_delta', text: 'Second burst.' })

  const reasoning = timeline.filter((entry) => entry.kind === 'execution_reasoning_chunk')
  assert.equal(reasoning[0].meta.reasoningSegment, 0)
  assert.equal(reasoning[1].meta.reasoningSegment, 0)
  assert.equal(reasoning[2].meta.reasoningSegment, 1)
})

test('cursor mapper defers segment bump and skips hard phase break mid-sentence', () => {
  const timeline = []
  const sent = []
  const mapper = createCursorAgentEventMapper({
    threadId: 'thread-1',
    turnId: 'turn-soft',
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => timeline.push({ kind, ...payload }),
  })

  mapper.handle({ kind: 'thinking_delta', text: 'Also adding profile' })
  mapper.handle({ kind: 'thinking_completed' })
  assert.equal(
    timeline.some((entry) => entry.content === REASONING_PHASE_BOUNDARY),
    false,
  )

  mapper.handle({
    kind: 'tool_started',
    callId: 'call-soft',
    toolCall: { name: 'read_file' },
  })
  mapper.handle({ kind: 'thinking_delta', text: ' dataclass will wrap.' })

  const reasoning = timeline.filter((entry) => entry.kind === 'execution_reasoning_chunk')
  assert.equal(reasoning.length, 2)
  assert.equal(reasoning[0].meta.reasoningSegment, 0)
  assert.equal(reasoning[1].meta.reasoningSegment, 0)
  assert.equal(reasoning[1].content, ' dataclass will wrap.')
})

test('phase boundaries stay in the same reasoning segment before the next tool', () => {
  let live = createEmptyLiveExecutionState()
  live = appendLiveExecutionReasoningEvent(live, {
    threadId: 'thread-1',
    turnId: 'turn-phase',
    chunk: 'Phase one.',
    emittedAt: 1,
    streamMeta: { threadId: 'thread-1', turnId: 'turn-phase', providerId: 'cursor' },
  })
  live = appendLiveExecutionReasoningEvent(live, {
    threadId: 'thread-1',
    turnId: 'turn-phase',
    chunk: REASONING_PHASE_BOUNDARY,
    emittedAt: 2,
    streamMeta: { threadId: 'thread-1', turnId: 'turn-phase', providerId: 'cursor' },
  })
  live = appendLiveExecutionReasoningEvent(live, {
    threadId: 'thread-1',
    turnId: 'turn-phase',
    chunk: 'Phase two.',
    emittedAt: 3,
    streamMeta: { threadId: 'thread-1', turnId: 'turn-phase', providerId: 'cursor' },
  })
  live = upsertLiveExecutionActivity(live, buildOpenAIProviderToolStatusActivity({
    threadId: 'thread-1',
    turnId: 'turn-phase',
    providerId: 'cursor',
    toolCallId: 'call-1',
    toolName: 'run_command',
    type: 'tool-input-start',
  }))

  const turn = live.turnsById['turn-phase']
  const items = buildExecutionStreamItems(turn, resolveExecutionCapabilityProfile({ family: 'cursor' }))
  assert.equal(items.length, 2)
  assert.match(items[0].label, /Phase one\.\n\nPhase two\./)
  assert.equal(items[1].kind, 'tool')
})

test('persisted cursor timeline hydrates to the same interleaved itemOrder', () => {
  const liveTurn = simulateCursorInterleavedTurn()
  const persisted = reducePersistedTimelineRecords([
    {
      eventId: 1,
      kind: 'execution_reasoning_chunk',
      turnId: 'turn-cursor',
      content: 'Planning the calculator upgrade.',
      createdAt: 10,
      meta: { threadId: 'thread-1', providerId: 'cursor', sequence: 1, reasoningSegment: 0 },
    },
    {
      eventId: 2,
      kind: 'provider_tool_output',
      turnId: 'turn-cursor',
      content: 'Cursor activity: read_file',
      createdAt: 20,
      meta: {
        threadId: 'thread-1',
        providerId: 'cursor',
        sequence: 2,
        toolCallId: 'call-1',
        toolName: 'read_file',
        output: '{}',
      },
    },
    {
      eventId: 3,
      kind: 'execution_reasoning_chunk',
      turnId: 'turn-cursor',
      content: 'Applying the patch.',
      createdAt: 30,
      meta: { threadId: 'thread-1', providerId: 'cursor', sequence: 3, reasoningSegment: 1 },
    },
    {
      eventId: 4,
      kind: 'provider_tool_output',
      turnId: 'turn-cursor',
      content: 'Cursor activity: edit_file',
      createdAt: 40,
      meta: {
        threadId: 'thread-1',
        providerId: 'cursor',
        sequence: 4,
        toolCallId: 'call-2',
        toolName: 'edit_file',
        output: '{}',
      },
    },
  ]).turnsById['turn-cursor']

  assert.deepEqual(persisted.itemOrder, liveTurn.itemOrder)
})

test('persisted account reasoning is split by observed tool boundaries even with one assistant id', () => {
  const turn = reducePersistedTimelineRecords([
    {
      eventId: 1,
      kind: 'execution_reasoning_chunk',
      turnId: 'turn-account-persisted',
      content: 'Preparing the image tool.',
      createdAt: 10,
      meta: {
        threadId: 'thread-1',
        providerId: 'openai',
        assistantMessageId: 'assistant-account-persisted',
        sequence: 1,
      },
    },
    {
      eventId: 2,
      kind: 'tool_executing',
      turnId: 'turn-account-persisted',
      content: 'Read file',
      createdAt: 20,
      meta: {
        threadId: 'thread-1',
        providerId: 'openai',
        toolCallId: 'call-read',
        toolName: 'read_file',
        sequence: 2,
      },
    },
    {
      eventId: 3,
      kind: 'tool_result',
      turnId: 'turn-account-persisted',
      content: 'Read file',
      createdAt: 30,
      meta: {
        threadId: 'thread-1',
        providerId: 'openai',
        toolCallId: 'call-read',
        toolName: 'read_file',
        sequence: 3,
        output: '{}',
      },
    },
    {
      eventId: 4,
      kind: 'execution_reasoning_chunk',
      turnId: 'turn-account-persisted',
      content: 'Calling image generation.',
      createdAt: 40,
      meta: {
        threadId: 'thread-1',
        providerId: 'openai',
        assistantMessageId: 'assistant-account-persisted',
        sequence: 4,
      },
    },
    {
      eventId: 5,
      kind: 'provider_tool_output',
      turnId: 'turn-account-persisted',
      content: 'Generated image',
      createdAt: 50,
      meta: {
        threadId: 'thread-1',
        providerId: 'openai',
        toolCallId: 'call-image',
        toolName: 'image_generation',
        sequence: 5,
        output: '{}',
      },
    },
    {
      eventId: 6,
      kind: 'execution_reasoning_chunk',
      turnId: 'turn-account-persisted',
      content: 'Reviewing the generated image.',
      createdAt: 60,
      meta: {
        threadId: 'thread-1',
        providerId: 'openai',
        assistantMessageId: 'assistant-account-persisted',
        sequence: 6,
      },
    },
  ]).turnsById['turn-account-persisted']

  const items = buildExecutionStreamItems(
    turn,
    resolveExecutionCapabilityProfile({ family: 'openai_account' }),
    { clusterThreshold: 99 },
  )

  assert.deepEqual(items.map(({ kind, label }) => ({ kind, label })), [
    { kind: 'reasoning', label: 'Preparing the image tool.' },
    { kind: 'tool', label: 'Read Read file' },
    { kind: 'reasoning', label: 'Calling image generation.' },
    { kind: 'tool', label: 'Ran tool' },
    { kind: 'reasoning', label: 'Reviewing the generated image.' },
  ])
})
