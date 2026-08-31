import test from 'node:test'
import assert from 'node:assert/strict'

import { ASSISTANT_PHASE_COMMENTARY } from '../../src/common/chat/assistant-phase.mjs'
import { resolveOpenAIAssistantPhase } from '../../src/main/chat/assistant-phase-policy.mjs'

test('provider policy parity assistant phase keeps equivalent OpenAI auth stream activity on the same visible phase semantics', () => {
  const apiKeyStreamPhase = resolveOpenAIAssistantPhase({
    modelId: 'gpt-5.4',
    authMethod: 'api_key',
    transportMode: 'responses_stream',
    activityKind: 'text-delta',
  })
  const accountStreamPhase = resolveOpenAIAssistantPhase({
    modelId: 'gpt-5.4',
    authMethod: 'account',
    transportMode: 'codex_app_server_chatgpt',
    activityKind: 'item/agentMessage/delta',
  })

  assert.equal(apiKeyStreamPhase, ASSISTANT_PHASE_COMMENTARY)
  assert.equal(accountStreamPhase, apiKeyStreamPhase)
})

test('provider policy parity assistant phase keeps equivalent OpenAI websocket and account bridge activity aligned', () => {
  const apiKeyWebSocketPhase = resolveOpenAIAssistantPhase({
    modelId: 'gpt-5.4',
    authMethod: 'api_key',
    transportMode: 'responses_websocket_experimental',
    activityKind: 'response.output_text.delta',
  })
  const accountBridgePhase = resolveOpenAIAssistantPhase({
    modelId: 'gpt-5.4',
    authMethod: 'account',
    transportMode: 'codex_app_server_chatgpt',
    activityKind: 'item/completed:agentMessage',
  })

  assert.equal(apiKeyWebSocketPhase, ASSISTANT_PHASE_COMMENTARY)
  assert.equal(accountBridgePhase, apiKeyWebSocketPhase)
})

test('provider policy parity assistant phase keeps capability gaps separate from auth-phase drift', () => {
  const apiKeyUnsupported = resolveOpenAIAssistantPhase({
    modelId: 'gpt-4.1',
    authMethod: 'api_key',
    transportMode: 'responses_stream',
    activityKind: 'text-delta',
  })
  const accountUnsupported = resolveOpenAIAssistantPhase({
    modelId: 'gpt-4.1',
    authMethod: 'account',
    transportMode: 'codex_app_server_chatgpt',
    activityKind: 'item/agentMessage/delta',
  })

  assert.equal(apiKeyUnsupported, '')
  assert.equal(accountUnsupported, apiKeyUnsupported)
})
