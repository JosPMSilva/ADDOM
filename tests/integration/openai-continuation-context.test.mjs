import test from 'node:test'
import assert from 'node:assert/strict'

import {
  updateOpenAIContinuationContext,
  resolveOpenAIContinuationPersistence,
} from '../../src/main/api-clients/openai-continuation-context.mjs'

test('updateOpenAIContinuationContext advances previous_response_id after a local-tool round', () => {
  const next = updateOpenAIContinuationContext({
    previousResponseId: 'resp_prev_1',
    conversationId: '',
    store: true,
  }, {
    responseId: 'resp_round_2',
    conversationId: '',
  })

  assert.equal(next.previousResponseId, 'resp_round_2')
  assert.equal(next.conversationId, '')
  assert.equal(next.store, true)
})

test('updateOpenAIContinuationContext prefers conversation state when OpenAI returns it', () => {
  const next = updateOpenAIContinuationContext({
    previousResponseId: 'resp_prev_1',
    conversationId: '',
  }, {
    responseId: 'resp_round_2',
    conversationId: 'conv_round_2',
  })

  assert.equal(next.previousResponseId, 'resp_round_2')
  assert.equal(next.conversationId, 'conv_round_2')
})

test('resolveOpenAIContinuationPersistence blocks persisted reuse while tool outputs are still pending', () => {
  const persistence = resolveOpenAIContinuationPersistence({
    responseMeta: { responseId: 'resp_tool_round' },
    toolCalls: [{ id: 'call_1', name: 'apply_patch', input: {} }],
    stopReason: 'tool-calls',
  })

  assert.equal(persistence.chainValid, false)
  assert.equal(persistence.chainInvalidReason, 'tool_outputs_pending')
})

test('resolveOpenAIContinuationPersistence allows persisted reuse after a completed round', () => {
  const persistence = resolveOpenAIContinuationPersistence({
    responseMeta: { responseId: 'resp_final_round' },
    toolCalls: [],
    stopReason: 'stop',
  })

  assert.equal(persistence.chainValid, true)
  assert.equal(persistence.chainInvalidReason, '')
})
