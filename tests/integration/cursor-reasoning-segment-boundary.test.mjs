import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveExecutionCapabilityProfile } from '../../src/common/chat/execution-capabilities.mjs'
import { endsWithSentenceBoundary } from '../../src/common/chat/reasoning-sentence-boundary.mjs'
import {
  appendLiveExecutionReasoningEvent,
  createEmptyLiveExecutionState,
  upsertLiveExecutionActivity,
} from '../../src/renderer/store/chat/live-execution-store.mjs'
import { buildExecutionStreamItems } from '../../src/renderer/components/chat/live-execution-stream-items.mjs'
import {
  buildOpenAIProviderToolOutputActivity,
  buildOpenAIProviderToolStatusActivity,
} from '../../src/renderer/components/chat/chat-event-bridge-openai.mjs'

function reasoningEventsFor(turn = {}, messageId = '') {
  return Object.values(turn?.eventsById || {}).filter((event) => (
    event?.kind === 'reasoning'
    && event?.archived !== true
    && (!messageId || String(event?.messageId || '') === messageId)
  ))
}

test('endsWithSentenceBoundary detects terminals and mid-clause tails', () => {
  assert.equal(endsWithSentenceBoundary('Planning the calculator upgrade.'), true)
  assert.equal(endsWithSentenceBoundary('button will be'), false)
  assert.equal(endsWithSentenceBoundary('labeled 10ˣ.'), true)
})

test('complete-sentence tool_started flushes pending reasoning tail before bumping', () => {
  let live = createEmptyLiveExecutionState()
  live = appendLiveExecutionReasoningEvent(live, {
    threadId: 'thread-1',
    turnId: 'turn-boundary',
    messageId: 'assistant-msg',
    chunk: 'Finalized three additions for the calculator.',
    emittedAt: 10,
    streamMeta: { threadId: 'thread-1', turnId: 'turn-boundary', providerId: 'cursor' },
  })

  const before = reasoningEventsFor(live.turnsById['turn-boundary'], 'execution_reasoning:turn-boundary')
  assert.equal(before.length, 1)
  assert.equal(String(before[0].status || ''), 'active')

  live = upsertLiveExecutionActivity(live, buildOpenAIProviderToolStatusActivity({
    threadId: 'thread-1',
    turnId: 'turn-boundary',
    providerId: 'cursor',
    toolCallId: 'call-boundary',
    toolName: 'read_file',
    type: 'tool-input-start',
  }))

  const sealed = reasoningEventsFor(live.turnsById['turn-boundary'], 'execution_reasoning:turn-boundary')
  assert.equal(sealed.length, 1)
  assert.equal(String(sealed[0].status || ''), 'done')
  assert.match(String(sealed[0].detail || ''), /Finalized three additions/)
  assert.equal(Number(live.turnsById['turn-boundary']?.executionReasoningSegment || 0), 1)
  assert.equal(live.turnsById['turn-boundary']?.pendingReasoningSegmentBump, false)
})

test('mid-sentence tool boundary keeps one reasoning segment until the clause completes', () => {
  let live = createEmptyLiveExecutionState()
  live = appendLiveExecutionReasoningEvent(live, {
    threadId: 'thread-1',
    turnId: 'turn-mid',
    messageId: 'assistant-msg',
    chunk: 'Finalized three additions: 10^x button will be',
    emittedAt: 10,
    streamMeta: { threadId: 'thread-1', turnId: 'turn-mid', providerId: 'cursor' },
  })
  live = upsertLiveExecutionActivity(live, buildOpenAIProviderToolStatusActivity({
    threadId: 'thread-1',
    turnId: 'turn-mid',
    providerId: 'cursor',
    toolCallId: 'call-mid',
    toolName: 'read_file',
    type: 'tool-input-start',
  }))
  assert.equal(Number(live.turnsById['turn-mid']?.executionReasoningSegment || 0), 0)
  assert.equal(live.turnsById['turn-mid']?.pendingReasoningSegmentBump, true)

  live = upsertLiveExecutionActivity(live, buildOpenAIProviderToolOutputActivity({
    threadId: 'thread-1',
    turnId: 'turn-mid',
    providerId: 'cursor',
    toolCallId: 'call-mid',
    toolName: 'read_file',
    output: { success: true },
  }))
  live = appendLiveExecutionReasoningEvent(live, {
    threadId: 'thread-1',
    turnId: 'turn-mid',
    messageId: 'assistant-msg',
    chunk: ' labeled 10ˣ.',
    emittedAt: 40,
    streamMeta: { threadId: 'thread-1', turnId: 'turn-mid', providerId: 'cursor' },
  })

  const turn = live.turnsById['turn-mid']
  const segment0 = turn.reasoningById['execution_reasoning:turn-mid']
  assert.match(String(segment0?.detail || ''), /button will be\s+labeled 10ˣ/)
  assert.equal(turn.reasoningById['execution_reasoning:turn-mid:1'], undefined)
  assert.equal(Number(turn.executionReasoningSegment || 0), 1)
  assert.equal(turn.pendingReasoningSegmentBump, false)

  const items = buildExecutionStreamItems(turn, resolveExecutionCapabilityProfile({ family: 'cursor' }))
  assert.equal(items.length, 2)
  assert.equal(items[0].kind, 'commentary')
  assert.match(String(items[0].label || ''), /button will be\s+labeled 10ˣ/)
  assert.equal(items[1].kind, 'tool')
  assert.match(String(items[1].label || ''), /Read file/)
})

test('tool_started before a late mid-sentence reasoning flush does not orphan the completing chunk', () => {
  let live = createEmptyLiveExecutionState()
  live = appendLiveExecutionReasoningEvent(live, {
    threadId: 'thread-1',
    turnId: 'turn-race',
    messageId: 'assistant-msg',
    chunk: 'Checking the command path will be',
    emittedAt: 10,
    streamMeta: { threadId: 'thread-1', turnId: 'turn-race', providerId: 'cursor' },
  })
  // Tool arrives while the clause is still open — must not bump yet.
  live = upsertLiveExecutionActivity(live, buildOpenAIProviderToolStatusActivity({
    threadId: 'thread-1',
    turnId: 'turn-race',
    providerId: 'cursor',
    toolCallId: 'call-race',
    toolName: 'run_command',
    type: 'tool-input-start',
  }))
  assert.equal(Number(live.turnsById['turn-race']?.executionReasoningSegment || 0), 0)
  assert.equal(live.turnsById['turn-race']?.pendingReasoningSegmentBump, true)

  // Late completing flush must land in segment 0, then allow the deferred bump.
  live = appendLiveExecutionReasoningEvent(live, {
    threadId: 'thread-1',
    turnId: 'turn-race',
    messageId: 'assistant-msg',
    chunk: ' ready.',
    emittedAt: 20,
    streamMeta: {
      threadId: 'thread-1',
      turnId: 'turn-race',
      providerId: 'cursor',
      // Stale segment meta as if a buffered flush raced the tool path.
      reasoningSegment: 0,
    },
  })

  const turn = live.turnsById['turn-race']
  assert.match(String(turn.reasoningById['execution_reasoning:turn-race']?.detail || ''), /will be\s+ready\./)
  assert.equal(turn.reasoningById['execution_reasoning:turn-race:1'], undefined)
  assert.equal(Number(turn.executionReasoningSegment || 0), 1)
  assert.equal(turn.pendingReasoningSegmentBump, false)
})
