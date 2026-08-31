import {
  ASSISTANT_PHASE_COMMENTARY,
  ASSISTANT_PHASE_FINAL_ANSWER,
  normalizeAssistantPhase,
} from '../../common/chat/assistant-phase.mjs'
import { resolveProviderModelAdapter } from '../api-clients/provider-model-adapters.mjs'

const OPENAI_ACCOUNT_TRANSPORT_MODES = new Set([
  'codex_app_server_chatgpt',
  'codex_app_server_chatgpt_background',
])

const OPENAI_ACCOUNT_AGENT_MESSAGE_ACTIVITY_KINDS = new Set([
  'item/agentmessage/delta',
  'item/completed:agentmessage',
])

const OPENAI_RESPONSES_STREAM_ACTIVITY_KINDS = new Set([
  'text-delta',
])

const OPENAI_RESPONSES_WEBSOCKET_ACTIVITY_KINDS = new Set([
  'response.output_text.delta',
])

function normalizeId(value = '') {
  return String(value || '').trim().toLowerCase()
}

function supportsOpenAIAssistantPhase(modelId = '', phase = ASSISTANT_PHASE_COMMENTARY) {
  return resolveAssistantPhaseForTurn({
    providerId: 'openai',
    modelId,
    phase,
  })
}

function shouldNormalizeUnphasedOpenAICommentary({
  transportMode = '',
  activityKind = '',
} = {}) {
  const normalizedTransportMode = normalizeId(transportMode)
  const normalizedActivityKind = normalizeId(activityKind)
  if (!normalizedTransportMode || !normalizedActivityKind) return false
  if (OPENAI_ACCOUNT_TRANSPORT_MODES.has(normalizedTransportMode)) {
    return OPENAI_ACCOUNT_AGENT_MESSAGE_ACTIVITY_KINDS.has(normalizedActivityKind)
  }
  if (normalizedTransportMode === 'responses_stream') {
    return OPENAI_RESPONSES_STREAM_ACTIVITY_KINDS.has(normalizedActivityKind)
  }
  if (normalizedTransportMode === 'responses_websocket_experimental') {
    return OPENAI_RESPONSES_WEBSOCKET_ACTIVITY_KINDS.has(normalizedActivityKind)
  }
  return false
}

export function resolveAssistantPhaseForTurn({
  providerId = '',
  modelId = '',
  phase = ASSISTANT_PHASE_FINAL_ANSWER,
} = {}) {
  const normalizedProviderId = String(providerId || '').trim().toLowerCase()
  const normalizedPhase = normalizeAssistantPhase(phase)
  if (!normalizedPhase) return ''
  if (normalizedProviderId !== 'openai') return ''
  return resolveProviderModelAdapter(normalizedProviderId, modelId).promptPolicy?.assistantPhase === 'recommended'
    ? normalizedPhase
    : ''
}

export function resolveOpenAIAssistantPhase({
  providerId = 'openai',
  modelId = '',
  phase = '',
  transportMode = '',
  activityKind = '',
} = {}) {
  const normalizedProviderId = normalizeId(providerId || 'openai') || 'openai'
  if (normalizedProviderId !== 'openai') return ''

  const explicitPhase = supportsOpenAIAssistantPhase(modelId, phase)
  if (explicitPhase) return explicitPhase
  if (!supportsOpenAIAssistantPhase(modelId)) return ''
  if (!shouldNormalizeUnphasedOpenAICommentary({ transportMode, activityKind })) return ''

  return ASSISTANT_PHASE_COMMENTARY
}

export function resolveOpenAIAccountAssistantPhase({
  modelId = '',
  phase = '',
  transportMode = '',
  authMethod = '',
  activityKind = '',
} = {}) {
  if (normalizeId(authMethod) !== 'account') return ''
  return resolveOpenAIAssistantPhase({
    providerId: 'openai',
    modelId,
    phase,
    transportMode,
    authMethod,
    activityKind,
  })
}
