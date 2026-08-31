import {
  COMPACTION_MODES,
  resolvePreferredCompactionMode,
} from '../chat/continuity/compaction-mode-contract.mjs'
import { resolveOpenAIAccountCapabilityContract } from './openai-account-capability-contract.mjs'
import { resolveOpenAIApiCapabilityContract } from './openai-api-capability-contract.mjs'

function normalizeModelId(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeOpenAIModelSnapshotAlias(modelId = '') {
  return normalizeModelId(modelId).replace(/-\d{4}-\d{2}-\d{2}$/, '')
}

function buildDelegationCapabilityState({
  supportsCollabAgentActivities = false,
  supportsAddomMoaDelegation = false,
} = {}) {
  const canonicalDelegationBackend = supportsAddomMoaDelegation === true ? 'addom_moa' : 'none'
  const nativeCollaborationBackend = supportsCollabAgentActivities === true ? 'openai_native' : 'none'
  const delegationBackends = []
  if (supportsCollabAgentActivities === true) delegationBackends.push('openai_native')
  if (supportsAddomMoaDelegation === true) delegationBackends.push('addom_moa')
  return {
    supportsCollabAgentActivities: supportsCollabAgentActivities === true,
    supportsAddomMoaDelegation: supportsAddomMoaDelegation === true,
    delegationBackends,
    preferredDelegationBackend: canonicalDelegationBackend !== 'none'
      ? canonicalDelegationBackend
      : nativeCollaborationBackend,
    delegationPolicy: Object.freeze({
      canonicalDelegationBackend,
      visibleEntryPointPolicy: canonicalDelegationBackend !== 'none'
        ? 'canonical_addom_delegation_entry_points'
        : 'none',
      nativeCollaborationBackend,
      backendSelectionSeparatedFromVisibility: true,
    }),
  }
}

export function createUnsupportedOpenAIModelRuntimeSupport(modelId = '') {
  const apiCapabilityContract = resolveOpenAIApiCapabilityContract(modelId)
  return {
    modelId: String(modelId || '').trim(),
    authMethod: 'api_key',
    accountRuntimeStatus: 'unsupported',
    supportsProviderNativeRuntime: false,
    providerNativeRuntimeFamily: 'none',
    providerNativeRuntimeMode: 'none',
    isReasoningModel: false,
    supportsReasoningSummary: false,
    supportsAssistantPhase: false,
    supportsTextVerbosity: false,
    supportsPromptCaching: false,
    supportsPromptCache24h: false,
    supportsServiceTierFlex: false,
    supportsServiceTierPriority: false,
    supportsBackgroundMode: false,
    supportsProviderChainCompaction: false,
    supportsProviderTruncation: false,
    preferredCompactionMode: COMPACTION_MODES.NONE,
    requiresPreviousResponseId: false,
    supportsShellEnvironment: false,
    prefersResponsesWebSocket: false,
    preferredTransportMode: 'responses_stream',
    supportsChatToolSurface: false,
    supportsDelegatedToolSurface: false,
    ...buildDelegationCapabilityState(),
    reasoningEffortOptions: [],
    hostedToolSupport: Object.fromEntries(
      Object.keys(apiCapabilityContract.hostedTools).map((toolId) => [toolId, false]),
    ),
    apiCapabilityContract,
    accountCapabilityContract: null,
    accountCapabilityExceptions: [],
  }
}

function withAccountAuthRuntimeSupport(baseSupport = {}) {
  const contract = resolveOpenAIAccountCapabilityContract(baseSupport)
  const hostedToolSupport = Object.fromEntries(
    Object.entries(contract.hostedTools || {}).map(([toolId, entry]) => [toolId, entry?.supported === true]),
  )
  const delegationSupport = buildDelegationCapabilityState({
    supportsCollabAgentActivities: contract?.capabilities?.collab_agent_activities?.supported === true,
    supportsAddomMoaDelegation: contract?.capabilities?.addom_moa_delegation?.supported === true,
  })
  return {
    ...baseSupport,
    authMethod: 'account',
    accountRuntimeStatus: String(contract?.runtimeStatus || '').trim().toLowerCase() || 'parity',
    supportsProviderNativeRuntime: contract?.providerNativeRuntime?.supported === true,
    providerNativeRuntimeFamily: String(contract?.providerNativeRuntime?.family || '').trim().toLowerCase() || 'none',
    providerNativeRuntimeMode: String(contract?.providerNativeRuntime?.mode || '').trim().toLowerCase() || 'none',
    supportsBackgroundMode: contract?.capabilities?.background_mode?.supported === true,
    supportsChatToolSurface: contract?.capabilities?.chat_tool_surface?.supported === true,
    supportsDelegatedToolSurface: contract?.capabilities?.delegated_tool_surface?.supported === true,
    ...delegationSupport,
    hostedToolSupport,
    reasoningEffortOptions: Array.isArray(baseSupport.reasoningEffortOptions)
      ? baseSupport.reasoningEffortOptions.filter((effort) => effort !== 'max')
      : [],
    accountCapabilityContract: contract,
    accountCapabilityExceptions: Array.isArray(contract?.exceptions) ? [...contract.exceptions] : [],
  }
}

function withUnsupportedAccountAuthRuntimeSupport(baseSupport = {}, message = '') {
  return {
    ...createUnsupportedOpenAIModelRuntimeSupport(baseSupport.modelId),
    authMethod: 'account',
    accountRuntimeMessage: String(message || '').trim(),
  }
}

export function resolveOpenAIModelRuntimeSupport(modelId = '', { authMethod = 'api_key' } = {}) {
  const canonicalModelId = normalizeOpenAIModelSnapshotAlias(modelId)
  const apiCapabilityContract = resolveOpenAIApiCapabilityContract(canonicalModelId)
  if (apiCapabilityContract.modelEligibility.status !== 'curated') {
    return createUnsupportedOpenAIModelRuntimeSupport(modelId)
  }

  const normalizedAuthMethod = String(authMethod || '').trim().toLowerCase()
  const isGpt55 = canonicalModelId === 'gpt-5.5'
  const isGpt56 = canonicalModelId.startsWith('gpt-5.6-')
  const isGpt54 = canonicalModelId === 'gpt-5.4'
  const isGpt53Codex = canonicalModelId === 'gpt-5.3-codex'
  const isCodexFamily = isGpt53Codex
  const prefersResponsesWebSocket = apiCapabilityContract.betaFeatures.responses_websocket.supported === true

  const supportsRemoteShell = !isCodexFamily

  let reasoningEffortOptions = []
  if (isGpt56) {
    reasoningEffortOptions = ['none', 'low', 'medium', 'high', 'xhigh', 'max']
  } else if (isGpt53Codex) {
    reasoningEffortOptions = ['low', 'medium', 'high', 'xhigh']
  } else if (isGpt55 || isGpt54) {
    reasoningEffortOptions = ['none', 'low', 'medium', 'high', 'xhigh']
  }

  const supportsProviderChainCompaction = isGpt56 || isGpt55 || isGpt54
  const supportsProviderTruncation = false
  const preferredCompactionMode = resolvePreferredCompactionMode({
    supportsProviderChainCompaction,
    supportsProviderTruncation,
  })
  const delegationSupport = buildDelegationCapabilityState({
    supportsCollabAgentActivities: false,
    supportsAddomMoaDelegation: true,
  })

  const baseSupport = {
    modelId: String(modelId || '').trim(),
    authMethod: 'api_key',
    accountRuntimeStatus: 'not_applicable',
    supportsProviderNativeRuntime: false,
    providerNativeRuntimeFamily: 'none',
    providerNativeRuntimeMode: 'none',
    isReasoningModel: true,
    supportsReasoningSummary: true,
    supportsAssistantPhase: isGpt56 || isGpt55 || isGpt54 || isGpt53Codex,
    supportsTextVerbosity: !isGpt53Codex,
    supportsPromptCaching: true,
    supportsPromptCache24h: true,
    supportsServiceTierFlex: true,
    supportsServiceTierPriority: !isGpt53Codex,
    supportsBackgroundMode: !isGpt53Codex,
    supportsProviderChainCompaction,
    supportsProviderTruncation,
    preferredCompactionMode,
    requiresPreviousResponseId: supportsProviderChainCompaction,
    supportsShellEnvironment: supportsRemoteShell,
    prefersResponsesWebSocket,
    preferredTransportMode: prefersResponsesWebSocket
      ? 'responses_websocket_experimental'
      : 'responses_stream',
    supportsChatToolSurface: true,
    supportsDelegatedToolSurface: true,
    ...delegationSupport,
    reasoningEffortOptions,
    hostedToolSupport: Object.fromEntries(
      Object.entries(apiCapabilityContract.hostedTools).map(([toolId, entry]) => [
        toolId,
        entry.supported === true,
      ]),
    ),
    apiCapabilityContract,
    accountCapabilityContract: null,
    accountCapabilityExceptions: [],
  }
  if (normalizedAuthMethod !== 'account') return baseSupport
  if (isGpt53Codex) {
    return withUnsupportedAccountAuthRuntimeSupport(
      baseSupport,
      'GPT-5.3 Codex is not supported when using Codex with a ChatGPT account. Choose GPT-5.4 or use OpenAI API-key authentication.',
    )
  }
  return withAccountAuthRuntimeSupport(baseSupport)
}
