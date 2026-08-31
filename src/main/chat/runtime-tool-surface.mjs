import {
  buildOpenAIHostedToolBundle,
  resolveOpenAIHostedToolExposure,
} from '../api-clients/openai-hosted-tools-runtime.mjs'
import { buildProviderNativeToolBundle } from '../api-clients/provider-native-tool-runtime.mjs'
import {
  resolveAdapterToolSurfaceMode,
  resolveProviderModelAdapter,
} from '../api-clients/provider-model-adapters.mjs'
import {
  applyConservativeIntentNarrowing,
  applyDelegationEntryPointCollapse,
  applyReliabilityWeightedWriteGating,
  applyTerminalSessionRuntimeGating,
  resolveProviderToolSurface,
} from './tool-surface-selection.mjs'
import {
  applyProviderPromptBudgetToolSurface,
  applyToolSurfaceActivation,
} from './tool-surface-budget-policy.mjs'
import { resolveDelegationBackend } from './delegation-backend-router.mjs'
import { buildToolIdentityMap } from '../tools/tool-identity-registry.mjs'
import { resolveToolReliabilityProfile } from './tool-reliability-profile.mjs'
import { resolveToolIntentShadow } from './tool-intent-router.mjs'
import { resolveProviderPromptBudgetProfile } from './provider-prompt-budget-profile.mjs'
import { filterToolsForMode } from './turn-mode.mjs'

const KNOWN_PROVIDER_SETTING_KEYS = new Set([
  'openai',
  'anthropic',
  'gemini',
  'google',
  'groq',
  'mistral',
  'ollama',
  'moonshot',
  'xai',
  'perplexity',
])

function resolveScopedProviderRuntimeSettings(providerId = '', providerRuntimeSettings = null) {
  if (!providerRuntimeSettings || typeof providerRuntimeSettings !== 'object' || Array.isArray(providerRuntimeSettings)) {
    return providerRuntimeSettings
  }
  const normalizedProviderId = String(providerId || '').trim().toLowerCase()
  if (!normalizedProviderId) return providerRuntimeSettings
  const directMatch = providerRuntimeSettings[providerId]
  if (directMatch && typeof directMatch === 'object' && !Array.isArray(directMatch)) {
    return directMatch
  }
  const scopedEntry = Object.entries(providerRuntimeSettings).find(([key, value]) => (
    String(key || '').trim().toLowerCase() === normalizedProviderId
    && value
    && typeof value === 'object'
    && !Array.isArray(value)
  ))
  if (scopedEntry) return scopedEntry[1]
  const looksLikeProviderSettingsMap = Object.keys(providerRuntimeSettings)
    .some((key) => KNOWN_PROVIDER_SETTING_KEYS.has(String(key || '').trim().toLowerCase()))
  return looksLikeProviderSettingsMap ? null : providerRuntimeSettings
}

export async function resolveRuntimeToolSurface({
  providerId = '',
  modelId = '',
  mode = 'execute',
  history = [],
  userMessage = '',
  apiKey = '',
  learnedBudgetProfile = null,
  addomTools = {},
  disableAllTools = false,
  providerRuntimeSettings = null,
  vectorStoreIds = [],
  includeOpenAILocalRuntimeTools = true,
  adapterProfile = null,
  fetchImpl = null,
  abortSignal = null,
  terminalSessionRuntimeHealth = null,
  toolSurfaceActivations = [],
} = {}) {
  const normalizedProviderId = String(providerId || '').trim().toLowerCase()
  const resolvedAdapterProfile = adapterProfile || resolveProviderModelAdapter(normalizedProviderId, modelId)
  if (disableAllTools === true) {
    return {
      adapterProfile: resolvedAdapterProfile,
      providerSurfaceTools: {},
      providerToolExecutionContext: null,
      resolvedToolSurface: {
        tools: {},
        toolSurfaceKind: 'none',
        toolSurfaceComponents: [],
        mixedToolSurfaceDetected: false,
        removedAddomToolNames: [],
        excludedToolsWithReasons: [],
        delegationBackend: 'none',
        delegationBackends: [],
        delegationBackendPreference: 'auto',
        delegationBackendReason: 'delegation_unavailable',
        canonicalDelegationBackend: 'none',
        nativeCollaborationBackend: 'none',
        delegationEntryPointPolicy: 'none',
        delegationBackendSelectionSeparatedFromVisibility: false,
        toolExecutionMap: {},
        toolIdentityMap: {},
        toolReliabilityProfile: null,
        shadowIntent: null,
      },
      openaiHostedToolIds: [],
      openaiDefaultSupportedToolIds: [],
      openaiExcludedToolReasons: [],
      notices: [],
    }
  }
  const scopedProviderRuntimeSettings = resolveScopedProviderRuntimeSettings(
    normalizedProviderId,
    providerRuntimeSettings,
  )
  const promptBudgetProfile = resolveProviderPromptBudgetProfile({
    providerId: normalizedProviderId,
    modelId,
    mode,
    runtimeSettings: scopedProviderRuntimeSettings,
    learnedBudgetProfile,
  })
  let providerSurfaceTools = {}
  let providerToolExecutionContext = null
  let openaiHostedToolIds = []
  let openaiDefaultSupportedToolIds = []
  let openaiExcludedToolReasons = []
  let notices = []

  const toolSurfaceMode = resolveAdapterToolSurfaceMode(resolvedAdapterProfile)

  if (normalizedProviderId === 'openai' && toolSurfaceMode === 'provider_owned_runtime') {
    const openAIAuthMethod = String(
      resolvedAdapterProfile?.openaiRuntimeSupport?.authMethod
      || 'api_key',
    ).trim().toLowerCase() || 'api_key'
    const openAIExposure = resolveOpenAIHostedToolExposure({
      modelId,
      runtimeSettings: scopedProviderRuntimeSettings,
      vectorStoreIds,
      includeLocalRuntimeTools: includeOpenAILocalRuntimeTools,
      authMethod: openAIAuthMethod,
    })
    openaiHostedToolIds = Array.isArray(openAIExposure.enabledToolIds)
      ? openAIExposure.enabledToolIds
      : []
    openaiDefaultSupportedToolIds = Array.isArray(openAIExposure.defaultSupportedToolIds)
      ? openAIExposure.defaultSupportedToolIds
      : []
    openaiExcludedToolReasons = Array.isArray(openAIExposure.excludedToolReasons)
      ? openAIExposure.excludedToolReasons
      : []
    notices = Array.isArray(openAIExposure.notices) ? openAIExposure.notices : []
  }

  if (toolSurfaceMode === 'openai_hosted') {
    const openaiBundle = buildOpenAIHostedToolBundle({
      modelId,
      runtimeSettings: scopedProviderRuntimeSettings,
      vectorStoreIds,
      includeLocalRuntimeTools: includeOpenAILocalRuntimeTools,
    })
    providerSurfaceTools = openaiBundle.tools || {}
    openaiHostedToolIds = Array.isArray(openaiBundle.enabledToolIds)
      ? openaiBundle.enabledToolIds
      : []
    openaiDefaultSupportedToolIds = Array.isArray(openaiBundle.defaultSupportedToolIds)
      ? openaiBundle.defaultSupportedToolIds
      : []
    openaiExcludedToolReasons = Array.isArray(openaiBundle.excludedToolReasons)
      ? openaiBundle.excludedToolReasons
      : []
    notices = Array.isArray(openaiBundle.notices) ? openaiBundle.notices : []
  } else if (toolSurfaceMode === 'remote_tool_bundle') {
    const providerNativeBundle = await buildProviderNativeToolBundle({
      providerId: normalizedProviderId,
      apiKey,
      runtimeSettings: scopedProviderRuntimeSettings,
      adapterProfile: resolvedAdapterProfile,
      fetchImpl,
      abortSignal,
    })
    providerSurfaceTools = providerNativeBundle.tools || {}
    providerToolExecutionContext = providerNativeBundle.toolRuntimeContext || null
    notices = Array.isArray(providerNativeBundle.notices) ? providerNativeBundle.notices : []
  }

  const baseResolvedToolSurface = resolveProviderToolSurface({
    adapterProfile: resolvedAdapterProfile,
    addomTools,
    providerTools: providerSurfaceTools,
  })
  let resolvedToolSurface = applyTerminalSessionRuntimeGating(baseResolvedToolSurface, {
    addomTools,
    terminalSessionRuntimeHealth,
  })
  const delegationBackendResolution = resolveDelegationBackend({
    providerId: normalizedProviderId,
    adapterProfile: resolvedAdapterProfile,
    addomTools,
    runtimeSettings: scopedProviderRuntimeSettings,
  })
  const toolReliabilityProfile = resolveToolReliabilityProfile({
    providerId: normalizedProviderId,
    modelId,
    adapterProfile: resolvedAdapterProfile,
    toolSurfaceKind: baseResolvedToolSurface.toolSurfaceKind,
  })
  const shadowIntent = resolveToolIntentShadow({
    mode,
    history,
    userMessage,
    activeTools: baseResolvedToolSurface.tools,
  })
  resolvedToolSurface = applyReliabilityWeightedWriteGating(
    resolvedToolSurface,
    {
      reliabilityProfile: toolReliabilityProfile,
      shadowIntent,
      addomTools,
      userMessage,
    },
  )
  resolvedToolSurface = applyDelegationEntryPointCollapse(
    resolvedToolSurface,
    {
      addomTools,
      shadowIntent,
      userMessage,
      history,
    },
  )
  resolvedToolSurface = applyConservativeIntentNarrowing(
    resolvedToolSurface,
    {
      addomTools,
      shadowIntent,
      userMessage,
      history,
    },
  )
  resolvedToolSurface = applyProviderPromptBudgetToolSurface(
    resolvedToolSurface,
    {
      providerId: normalizedProviderId,
      promptBudgetProfile,
      addomTools,
      shadowIntent,
      userMessage,
      history,
    },
  )
  resolvedToolSurface = applyToolSurfaceActivation(
    resolvedToolSurface,
    {
      addomTools,
      toolSurfaceActivations,
    },
  )
  const modeFilteredTools = filterToolsForMode(resolvedToolSurface.tools, mode)
  const modeHiddenToolNames = Object.keys(resolvedToolSurface.tools || {})
    .filter((toolName) => !Object.prototype.hasOwnProperty.call(modeFilteredTools, toolName))
  if (modeHiddenToolNames.length > 0) {
    const toolExecutionMap = { ...(resolvedToolSurface.toolExecutionMap || {}) }
    for (const toolName of modeHiddenToolNames) delete toolExecutionMap[toolName]
    resolvedToolSurface = {
      ...resolvedToolSurface,
      tools: modeFilteredTools,
      toolExecutionMap,
      excludedToolsWithReasons: [
        ...(resolvedToolSurface.excludedToolsWithReasons || []),
        ...modeHiddenToolNames.map((toolName) => ({ toolName, reason: 'excluded_due_to_turn_mode_capability' })),
      ],
    }
  }
  resolvedToolSurface.toolIdentityMap = buildToolIdentityMap(
    Object.keys(resolvedToolSurface.tools || {}),
    {
      providerToolExecutionContext,
      toolBackendNameMap: resolvedToolSurface.toolExecutionMap,
    },
  )
  resolvedToolSurface.toolReliabilityProfile = toolReliabilityProfile
  resolvedToolSurface.shadowIntent = shadowIntent
  resolvedToolSurface.promptBudgetProfile = promptBudgetProfile
  resolvedToolSurface.delegationBackend = delegationBackendResolution.selectedBackend
  resolvedToolSurface.delegationBackends = [...delegationBackendResolution.availableBackends]
  resolvedToolSurface.delegationBackendPreference = delegationBackendResolution.requestedPreference
  resolvedToolSurface.delegationBackendReason = delegationBackendResolution.selectionReason
  const delegationPolicy = resolvedAdapterProfile?.openaiRuntimeSupport?.delegationPolicy
    && typeof resolvedAdapterProfile.openaiRuntimeSupport.delegationPolicy === 'object'
    ? resolvedAdapterProfile.openaiRuntimeSupport.delegationPolicy
    : null
  // Backend routing is independent from the visible canonical delegation entry points.
  resolvedToolSurface.canonicalDelegationBackend = String(
    delegationPolicy?.canonicalDelegationBackend
    || (delegationBackendResolution.supportsAddomMoaDelegation ? 'addom_moa' : 'none'),
  ).trim().toLowerCase() || 'none'
  resolvedToolSurface.nativeCollaborationBackend = String(
    delegationPolicy?.nativeCollaborationBackend
    || (delegationBackendResolution.supportsOpenAINativeDelegation ? 'openai_native' : 'none'),
  ).trim().toLowerCase() || 'none'
  resolvedToolSurface.delegationEntryPointPolicy = String(
    delegationPolicy?.visibleEntryPointPolicy
    || (resolvedToolSurface.canonicalDelegationBackend !== 'none'
      ? 'canonical_addom_delegation_entry_points'
      : 'none'),
  ).trim().toLowerCase() || 'none'
  resolvedToolSurface.delegationBackendSelectionSeparatedFromVisibility =
    delegationPolicy?.backendSelectionSeparatedFromVisibility === true
    || resolvedToolSurface.delegationEntryPointPolicy !== 'none'

  return {
    adapterProfile: resolvedAdapterProfile,
    providerSurfaceTools,
    providerToolExecutionContext,
    resolvedToolSurface,
    openaiHostedToolIds,
    openaiDefaultSupportedToolIds,
    openaiExcludedToolReasons,
    notices,
  }
}
