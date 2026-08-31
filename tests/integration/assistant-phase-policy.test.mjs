import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ASSISTANT_PHASE_COMMENTARY,
  ASSISTANT_PHASE_FINAL_ANSWER,
} from '../../src/common/chat/assistant-phase.mjs'
import {
  resolveAssistantPhaseForTurn,
  resolveOpenAIAssistantPhase,
  resolveOpenAIAccountAssistantPhase,
} from '../../src/main/chat/assistant-phase-policy.mjs'

test('resolveOpenAIAssistantPhase normalizes equivalent unphased OpenAI stream activity to commentary across auth transports', () => {
  assert.equal(resolveOpenAIAssistantPhase({
    modelId: 'gpt-5.4',
    transportMode: 'responses_stream',
    authMethod: 'api_key',
    activityKind: 'text-delta',
  }), ASSISTANT_PHASE_COMMENTARY)

  assert.equal(resolveOpenAIAssistantPhase({
    modelId: 'gpt-5.4',
    transportMode: 'responses_websocket_experimental',
    authMethod: 'api_key',
    activityKind: 'response.output_text.delta',
  }), ASSISTANT_PHASE_COMMENTARY)

  assert.equal(resolveOpenAIAssistantPhase({
    modelId: 'gpt-5.4',
    transportMode: 'codex_app_server_chatgpt',
    authMethod: 'account',
    activityKind: 'item/agentMessage/delta',
  }), ASSISTANT_PHASE_COMMENTARY)
})

test('resolveOpenAIAssistantPhase preserves explicit phase and keeps unsupported or non-OpenAI turns unclassified', () => {
  assert.equal(resolveOpenAIAssistantPhase({
    modelId: 'gpt-5.4',
    phase: 'final answer',
    transportMode: 'responses_stream',
    authMethod: 'api_key',
    activityKind: 'text-delta',
  }), ASSISTANT_PHASE_FINAL_ANSWER)

  assert.equal(resolveOpenAIAssistantPhase({
    modelId: 'gpt-4.1',
    transportMode: 'responses_stream',
    authMethod: 'api_key',
    activityKind: 'text-delta',
  }), '')

  assert.equal(resolveOpenAIAssistantPhase({
    providerId: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    transportMode: 'responses_stream',
    authMethod: 'api_key',
    activityKind: 'text-delta',
  }), '')
})

test('resolveOpenAIAccountAssistantPhase remains a compatible wrapper around the shared OpenAI phase policy', () => {
  assert.equal(resolveOpenAIAccountAssistantPhase({
    modelId: 'gpt-5.4',
    transportMode: 'codex_app_server_chatgpt',
    authMethod: 'account',
    activityKind: 'item/agentMessage/delta',
  }), ASSISTANT_PHASE_COMMENTARY)
})

test('resolveAssistantPhaseForTurn remains provider-scoped', () => {
  assert.equal(resolveAssistantPhaseForTurn({
    providerId: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    phase: 'commentary',
  }), '')
})
