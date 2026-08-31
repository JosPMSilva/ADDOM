import test from 'node:test'
import assert from 'node:assert/strict'

import {
  classifyReasoningDeliveryMode,
  finalizeReasoningMeta,
  isLocalOpenAIStreamedReasoningEvent,
  nextReasoningMetaOnChunk,
} from '../../src/renderer/components/chat/reasoning-delivery-mode.mjs'
import { resolveStreamingIndexes } from '../../src/renderer/store/chat/activity-builders.mjs'

test('classifyReasoningDeliveryMode detects live/summary/redacted/none', () => {
  assert.equal(classifyReasoningDeliveryMode({ chunkCount: 2, finalText: '', reasoningTokens: 0 }), 'live')
  assert.equal(classifyReasoningDeliveryMode({ chunkCount: 0, finalText: 'summary text', reasoningTokens: 0 }), 'summary_end')
  assert.equal(classifyReasoningDeliveryMode({ chunkCount: 0, finalText: '', reasoningTokens: 12 }), 'unavailable_redacted')
  assert.equal(classifyReasoningDeliveryMode({ chunkCount: 0, finalText: '', reasoningTokens: 0 }), 'none')
})

test('nextReasoningMetaOnChunk accumulates chunk stats and timestamps', () => {
  const t1 = 1_700_000_000_000
  const t2 = t1 + 250
  const m1 = nextReasoningMetaOnChunk({}, 'abc', t1)
  assert.equal(m1.mode, 'live')
  assert.equal(m1.chunkCount, 1)
  assert.equal(m1.charsStreamed, 3)
  assert.equal(m1.firstChunkAt, t1)
  assert.equal(m1.lastChunkAt, t1)

  const m2 = nextReasoningMetaOnChunk(m1, 'defg', t2)
  assert.equal(m2.chunkCount, 2)
  assert.equal(m2.charsStreamed, 7)
  assert.equal(m2.firstChunkAt, t1)
  assert.equal(m2.lastChunkAt, t2)
})

test('finalizeReasoningMeta chooses summary_end when no chunks and text arrives at end', () => {
  const meta = finalizeReasoningMeta(
    { mode: 'none', chunkCount: 0, charsStreamed: 0 },
    { finalText: 'batch summary', reasoningTokens: 22, providerId: 'openai', model: 'gpt-5' },
  )
  assert.equal(meta.mode, 'summary_end')
  assert.equal(meta.reasoningTokens, 22)
  assert.equal(meta.finalTextPresent, true)
  assert.equal(meta.providerId, 'openai')
  assert.equal(meta.model, 'gpt-5')
})

test('finalizeReasoningMeta keeps live mode when chunks were streamed', () => {
  const meta = finalizeReasoningMeta(
    { mode: 'live', chunkCount: 3, charsStreamed: 120, firstChunkAt: 100, lastChunkAt: 300 },
    { finalText: 'done', reasoningTokens: 45 },
  )
  assert.equal(meta.mode, 'live')
  assert.equal(meta.chunkCount, 3)
  assert.equal(meta.charsStreamed, 120)
  assert.equal(meta.reasoningTokens, 45)
})

test('isLocalOpenAIStreamedReasoningEvent scopes renderer grouping to non-account responses_stream reasoning', () => {
  assert.equal(isLocalOpenAIStreamedReasoningEvent({
    status: 'done',
    messageId: 'assistant_live_local_reasoning',
    reasoningMeta: { mode: 'live', chunkCount: 3 },
    streamMeta: {
      providerId: 'openai',
      authMethod: 'api_key',
      transportMode: 'responses_stream',
    },
  }), true)

  assert.equal(isLocalOpenAIStreamedReasoningEvent({
    status: 'done',
    messageId: 'assistant_account_reasoning',
    reasoningMeta: { mode: 'summary_end' },
    streamMeta: {
      providerId: 'openai',
      authMethod: 'account',
      transportMode: 'codex_app_server_chatgpt',
    },
  }), false)

  assert.equal(isLocalOpenAIStreamedReasoningEvent({
    status: 'active',
    messageId: 'execution_commentary:turn_local_reasoning',
    streamMeta: {
      providerId: 'openai',
      authMethod: 'api_key',
      transportMode: 'responses_stream',
    },
  }), false)
})

test('resolveStreamingIndexes is race-safe when cached indexes are stale', () => {
  const state = {
    messages: [
      { id: 'old' },
      { id: 'target' },
    ],
    timeline: [
      { kind: 'message', message: { id: 'old' } },
      { kind: 'tool', activity: {} },
      { kind: 'message', message: { id: 'target' } },
    ],
    streamingMessageIndex: 0,
    streamingTimelineIndex: 0,
  }
  const resolved = resolveStreamingIndexes(state, 'target')
  assert.equal(resolved.messageIndex, 1)
  assert.equal(resolved.timelineIndex, 2)
})
