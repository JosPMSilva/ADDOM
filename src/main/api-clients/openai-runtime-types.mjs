import {
  listSupportedOpenAIHostedToolIds,
  sanitizeOpenAIHostedToolIdsForMutualExclusion,
} from '../../common/api-clients/openai-hosted-tool-catalog.mjs'
import {
  DEFAULT_MOONSHOT_PROVIDER_RUNTIME_SETTINGS,
  normalizeMoonshotProviderRuntimeSettings,
} from './moonshot-formula-types.mjs'
import { normalizeProviderTruncationSoftTriggerPercent } from '../../common/chat/provider-truncation-budget-policy.mjs'
import { resolveOpenAIModelRuntimeSupport } from './openai-model-runtime-support.mjs'
import { resolveProviderModelAdapter } from './provider-model-adapters.mjs'

export const DEFAULT_OPENAI_PROVIDER_RUNTIME_SETTINGS = Object.freeze({
  transportMode: 'responses_auto',
  delegationBackendPreference: 'auto',
  nativeCollaborationModeId: '',
  websocketFallbackToStream: true,
  websocketWarmupEnabled: false,
  hostedToolsEnabled: false,
  enabledHostedTools: [],
  backgroundJobPersistenceEnabled: true,
  backgroundRecoveryMode: 'auto_resume',
  reasoningSummary: 'auto',
  reasoningEffort: 'provider_default',
  textVerbosity: 'provider_default',
  serviceTier: 'auto',
  promptCachingEnabled: true,
  promptCacheRetention: 'in_memory',
  continuityMode: 'local_first_hybrid',
  usePreviousResponseId: true,
  useConversationState: false,
  useResponseCompaction: false,
  useServerSideCompaction: false,
  serverSideCompactionThresholdTokens: 0,
  providerTruncationSoftTriggerPercent: 85,
  defaultMaxOutputTokensOverride: 0,
  toolResultBudgetCharsOverride: 0,
  oldToolResultPruningEnabled: true,
  promptPreflightHardGuardEnabled: true,
  codexAutoThreadCompactionEnabled: true,
  codexAutoThreadCompactionTokenLimit: 0,
  codexAutoThreadCompactionInstructions: '',
  serverSideCompactionBackgroundParity: true,
  allowPromptCompactionCommands: false,
  allowPromptCompactionThresholdOverride: false,
  enableBackgroundMode: false,
  webSearchContextSize: 'medium',
  webSearchApproximateLocationEnabled: false,
  fileHandlingMode: 'persistent_reusable',
  autoCreateProjectVectorStore: true,
  autoAttachProjectVectorStore: true,
  fileSearchMaxNumResults: 8,
  imageGenerationOutputFormat: 'webp',
  imageGenerationQuality: 'medium',
  remoteDataWarningAcknowledgedAt: 0,
  hostedToolConfig: {
    mcp: {
      servers: [],
    },
    shell: {
      environmentType: 'container_auto',
      networkPolicy: 'provider_default',
      memoryLimit: 'provider_default',
    },
    local_shell: {
      enabled: false,
      requireApproval: 'always',
      workingDirectoryPolicy: 'workspace_only',
      allowEnvironmentOverrides: false,
    },
    apply_patch: {
      enabled: false,
      requireApproval: 'always',
      workspaceOnly: true,
    },
  },
})

export const DEFAULT_ANTHROPIC_PROVIDER_RUNTIME_SETTINGS = Object.freeze({
  thinkingType: 'disabled',
  reasoningEffort: 'provider_default',
  useContextManagementCompaction: false,
  contextManagementCompactionThresholdTokens: 0,
  providerTruncationSoftTriggerPercent: 85,
  defaultMaxOutputTokensOverride: 0,
  toolResultBudgetCharsOverride: 0,
  oldToolResultPruningEnabled: true,
  promptPreflightHardGuardEnabled: true,
  contextManagementCompactionInstructions: '',
})

export const DEFAULT_PROVIDER_RUNTIME_SETTINGS = Object.freeze({
  anthropic: { ...DEFAULT_ANTHROPIC_PROVIDER_RUNTIME_SETTINGS },
  moonshot: { ...DEFAULT_MOONSHOT_PROVIDER_RUNTIME_SETTINGS },
  openai: { ...DEFAULT_OPENAI_PROVIDER_RUNTIME_SETTINGS },
})

const OPENAI_REASONING_SUMMARY_VALUES = new Set(['auto', 'none'])
const ANTHROPIC_THINKING_TYPE_VALUES = new Set(['provider_default', 'enabled', 'disabled'])
const ANTHROPIC_REASONING_EFFORT_VALUES = new Set(['provider_default', 'low', 'medium', 'high', 'max'])
const OPENAI_REASONING_EFFORT_VALUES = new Set([
  'provider_default',
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
])
const OPENAI_TEXT_VERBOSITY_VALUES = new Set(['provider_default', 'low', 'medium', 'high'])
const OPENAI_SERVICE_TIER_VALUES = new Set(['auto', 'flex', 'priority', 'default'])
const OPENAI_PROMPT_CACHE_RETENTION_VALUES = new Set(['in_memory', '24h'])
const OPENAI_TRANSPORT_MODE_VALUES = new Set([
  'responses_auto',
  'responses_stream',
  'responses_websocket_experimental',
])
const OPENAI_DELEGATION_BACKEND_PREFERENCE_VALUES = new Set([
  'auto',
  'openai_native',
  'addom_moa',
])
const OPENAI_WEB_SEARCH_CONTEXT_SIZE_VALUES = new Set(['low', 'medium', 'high'])
const OPENAI_IMAGE_OUTPUT_FORMAT_VALUES = new Set(['png', 'jpeg', 'webp'])
const OPENAI_IMAGE_QUALITY_VALUES = new Set(['auto', 'low', 'medium', 'high'])
const OPENAI_MCP_APPROVAL_VALUES = new Set(['always', 'never'])

function normalizeBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : !!fallback
}

function normalizeTimestamp(value, fallback = 0) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return Math.max(0, Number(fallback || 0) || 0)
  return Math.round(numeric)
}

function normalizeEnum(value, allowedValues, fallback) {
  const normalized = String(value || '').trim().toLowerCase()
  return allowedValues.has(normalized) ? normalized : fallback
}

function clampInt(value, fallback, min, max) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, Math.round(numeric)))
}

function normalizeOptionalPositiveInteger(value, fallback = 0, {
  min = 1,
  max = 2_000_000,
} = {}) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    const fallbackNumeric = Number(fallback)
    if (!Number.isFinite(fallbackNumeric) || fallbackNumeric <= 0) return 0
    return Math.min(max, Math.max(min, Math.round(fallbackNumeric)))
  }
  return Math.min(max, Math.max(min, Math.round(numeric)))
}

function normalizeServerSideCompactionThresholdTokens(value, fallback = 0) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    const fallbackNumeric = Number(fallback)
    if (!Number.isFinite(fallbackNumeric) || fallbackNumeric <= 0) return 0
    return Math.min(2_000_000, Math.max(4_096, Math.round(fallbackNumeric)))
  }
  return Math.min(2_000_000, Math.max(4_096, Math.round(numeric)))
}

function normalizeAnthropicContextManagementThresholdTokens(value, fallback = 0) {
  const normalizedRaw = String(value ?? '').trim()
  if (!normalizedRaw) {
    const fallbackNumeric = Number(fallback)
    if (!Number.isFinite(fallbackNumeric) || fallbackNumeric <= 0) return 0
    return Math.min(2_000_000, Math.max(4_096, Math.round(fallbackNumeric)))
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0
  }
  return Math.min(2_000_000, Math.max(4_096, Math.round(numeric)))
}

function normalizeAnthropicContextManagementInstructions(value, fallback = '') {
  const normalized = String(value ?? '').trim()
  if (normalized) return normalized.slice(0, 4_000)
  return String(fallback ?? '').trim().slice(0, 4_000)
}

function normalizeAnthropicReasoningEffort(value, fallback = 'provider_default') {
  return normalizeEnum(
    value,
    ANTHROPIC_REASONING_EFFORT_VALUES,
    ANTHROPIC_REASONING_EFFORT_VALUES.has(String(fallback || '').trim().toLowerCase())
      ? String(fallback || '').trim().toLowerCase()
      : 'provider_default',
  )
}

function normalizeAnthropicThinkingType(value, fallback = 'provider_default') {
  return normalizeEnum(
    value,
    ANTHROPIC_THINKING_TYPE_VALUES,
    ANTHROPIC_THINKING_TYPE_VALUES.has(String(fallback || '').trim().toLowerCase())
      ? String(fallback || '').trim().toLowerCase()
      : 'provider_default',
  )
}

function normalizeCodexAutoThreadCompactionTokenLimit(value, fallback = 0) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    const fallbackNumeric = Number(fallback)
    if (!Number.isFinite(fallbackNumeric) || fallbackNumeric <= 0) return 0
    return Math.min(2_000_000, Math.max(4_096, Math.round(fallbackNumeric)))
  }
  return Math.min(2_000_000, Math.max(4_096, Math.round(numeric)))
}

function normalizeCodexAutoThreadCompactionInstructions(value, fallback = '') {
  const normalized = String(value ?? '').trim()
  if (normalized) return normalized.slice(0, 4_000)
  return String(fallback ?? '').trim().slice(0, 4_000)
}

function normalizeNativeCollaborationModeId(value, fallback = '') {
  const normalized = String(value ?? '').trim()
  if (normalized) return normalized.slice(0, 128)
  return String(fallback ?? '').trim().slice(0, 128)
}

function normalizeHostedToolIdList(rawValue, { maxItems = 16 } = {}) {
  const source = Array.isArray(rawValue) ? rawValue : []
  const supported = new Set(listSupportedOpenAIHostedToolIds())
  const seen = new Set()
  const out = []
  for (const item of source) {
    if (out.length >= maxItems) break
    const normalized = String(item || '').trim().toLowerCase()
    if (!normalized || seen.has(normalized) || !supported.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

function syncOpenAILocalRuntimeConfigWithEnabledToolIds(hostedToolConfig = {}, enabledHostedTools = []) {
  const source = hostedToolConfig && typeof hostedToolConfig === 'object' ? hostedToolConfig : {}
  const enabledSet = new Set(
    Array.isArray(enabledHostedTools)
      ? enabledHostedTools.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
      : [],
  )
  return {
    ...source,
    local_shell: {
      ...(source.local_shell && typeof source.local_shell === 'object'
        ? source.local_shell
        : {}),
      enabled: enabledSet.has('local_shell'),
    },
    apply_patch: {
      ...(source.apply_patch && typeof source.apply_patch === 'object'
        ? source.apply_patch
        : {}),
      enabled: enabledSet.has('apply_patch'),
    },
  }
}

function normalizeModelId(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeStringArray(rawValue, { maxItems = 32 } = {}) {
  const source = Array.isArray(rawValue) ? rawValue : []
  const seen = new Set()
  const out = []
  for (const item of source) {
    if (out.length >= maxItems) break
    const normalized = String(item || '').trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

function normalizeOpenAIMcpServerConfigList(rawValue, fallback = []) {
  const source = Array.isArray(rawValue) ? rawValue : Array.isArray(fallback) ? fallback : []
  const seen = new Set()
  const out = []
  for (const row of source) {
    if (!row || typeof row !== 'object') continue
    const id = String(row.id || '').trim()
    const label = String(row.label || '').trim()
    const serverUrl = String(row.serverUrl || '').trim()
    if (!id || !label || !serverUrl) continue
    if (seen.has(id)) continue
    let parsedUrl = null
    try {
      parsedUrl = new URL(serverUrl)
    } catch {
      parsedUrl = null
    }
    if (!parsedUrl || !/^https?:$/i.test(parsedUrl.protocol)) continue
    seen.add(id)
    out.push({
      id,
      label,
      enabled: normalizeBoolean(row.enabled, false),
      serverUrl: parsedUrl.toString(),
      serverDescription: String(row.serverDescription || '').trim(),
      allowedTools: normalizeStringArray(row.allowedTools, { maxItems: 64 }),
      requireApproval: normalizeEnum(
        row.requireApproval,
        OPENAI_MCP_APPROVAL_VALUES,
        'always',
      ),
      authSecretRef: String(row.authSecretRef || '').trim(),
    })
  }
  return out
}

function normalizeOpenAIHostedToolConfig(rawValue = {}, fallback = DEFAULT_OPENAI_PROVIDER_RUNTIME_SETTINGS.hostedToolConfig) {
  const source = rawValue && typeof rawValue === 'object' ? rawValue : {}
  const base = fallback && typeof fallback === 'object'
    ? fallback
    : DEFAULT_OPENAI_PROVIDER_RUNTIME_SETTINGS.hostedToolConfig
  return {
    mcp: {
      servers: normalizeOpenAIMcpServerConfigList(
        source.mcp?.servers,
        base?.mcp?.servers,
      ),
    },
    shell: {
      environmentType: 'container_auto',
      networkPolicy: 'provider_default',
      memoryLimit: 'provider_default',
    },
    local_shell: {
      enabled: normalizeBoolean(source.local_shell?.enabled, base?.local_shell?.enabled),
      requireApproval: 'always',
      workingDirectoryPolicy: 'workspace_only',
      allowEnvironmentOverrides: false,
    },
    apply_patch: {
      enabled: normalizeBoolean(source.apply_patch?.enabled, base?.apply_patch?.enabled),
      requireApproval: 'always',
      workspaceOnly: true,
    },
  }
}

export { resolveOpenAIModelRuntimeSupport } from './openai-model-runtime-support.mjs'

export function normalizeAnthropicProviderRuntimeSettings(
  rawValue = {},
  fallback = DEFAULT_ANTHROPIC_PROVIDER_RUNTIME_SETTINGS,
) {
  const source = rawValue && typeof rawValue === 'object' ? rawValue : {}
  const base = fallback && typeof fallback === 'object'
    ? fallback
    : DEFAULT_ANTHROPIC_PROVIDER_RUNTIME_SETTINGS

  return {
    thinkingType: normalizeAnthropicThinkingType(
      source.thinkingType,
      base.thinkingType,
    ),
    reasoningEffort: normalizeAnthropicReasoningEffort(
      source.reasoningEffort,
      base.reasoningEffort,
    ),
    useContextManagementCompaction: normalizeBoolean(
      source.useContextManagementCompaction,
      base.useContextManagementCompaction,
    ),
    contextManagementCompactionThresholdTokens: normalizeAnthropicContextManagementThresholdTokens(
      source.contextManagementCompactionThresholdTokens,
      base.contextManagementCompactionThresholdTokens,
    ),
    providerTruncationSoftTriggerPercent: normalizeProviderTruncationSoftTriggerPercent(
      source.providerTruncationSoftTriggerPercent,
      base.providerTruncationSoftTriggerPercent,
    ),
    defaultMaxOutputTokensOverride: normalizeOptionalPositiveInteger(
      source.defaultMaxOutputTokensOverride,
      base.defaultMaxOutputTokensOverride,
      { min: 256 },
    ),
    toolResultBudgetCharsOverride: normalizeOptionalPositiveInteger(
      source.toolResultBudgetCharsOverride,
      base.toolResultBudgetCharsOverride,
      { min: 1_000 },
    ),
    oldToolResultPruningEnabled: normalizeBoolean(
      source.oldToolResultPruningEnabled,
      base.oldToolResultPruningEnabled,
    ),
    promptPreflightHardGuardEnabled: normalizeBoolean(
      source.promptPreflightHardGuardEnabled,
      base.promptPreflightHardGuardEnabled,
    ),
    contextManagementCompactionInstructions: normalizeAnthropicContextManagementInstructions(
      source.contextManagementCompactionInstructions,
      base.contextManagementCompactionInstructions,
    ),
  }
}

export function resolveOpenAIBaseUrl() {
  const configured = String(process.env.ADDOM_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || '').trim()
  const value = configured || 'https://api.openai.com/v1'
  return value.replace(/\/+$/, '')
}

export function normalizeOpenAIProviderRuntimeSettings(
  rawValue = {},
  fallback = DEFAULT_OPENAI_PROVIDER_RUNTIME_SETTINGS,
) {
  const source = rawValue && typeof rawValue === 'object' ? rawValue : {}
  const base = fallback && typeof fallback === 'object'
    ? fallback
    : DEFAULT_OPENAI_PROVIDER_RUNTIME_SETTINGS

  const enabledHostedTools = sanitizeOpenAIHostedToolIdsForMutualExclusion(
    normalizeHostedToolIdList(
      source.enabledHostedTools,
      { maxItems: 16 },
    ),
    { maxItems: 16 },
  )
  const normalizedHostedToolConfig = normalizeOpenAIHostedToolConfig(
    source.hostedToolConfig,
    base.hostedToolConfig,
  )
  const hostedToolConfig = normalizeOpenAIHostedToolConfig(
    syncOpenAILocalRuntimeConfigWithEnabledToolIds(
      normalizedHostedToolConfig,
      enabledHostedTools,
    ),
    base.hostedToolConfig,
  )

  return {
    transportMode: normalizeEnum(
      source.transportMode,
      OPENAI_TRANSPORT_MODE_VALUES,
      String(base.transportMode || 'responses_auto').trim().toLowerCase() || 'responses_auto',
    ),
    delegationBackendPreference: normalizeEnum(
      source.delegationBackendPreference,
      OPENAI_DELEGATION_BACKEND_PREFERENCE_VALUES,
      String(base.delegationBackendPreference || 'auto').trim().toLowerCase() || 'auto',
    ),
    nativeCollaborationModeId: normalizeNativeCollaborationModeId(
      source.nativeCollaborationModeId,
      base.nativeCollaborationModeId,
    ),
    websocketFallbackToStream: normalizeBoolean(
      source.websocketFallbackToStream,
      base.websocketFallbackToStream,
    ),
    websocketWarmupEnabled: normalizeBoolean(
      source.websocketWarmupEnabled,
      base.websocketWarmupEnabled,
    ),
    hostedToolsEnabled: normalizeBoolean(source.hostedToolsEnabled, base.hostedToolsEnabled),
    enabledHostedTools,
    backgroundJobPersistenceEnabled: true,
    backgroundRecoveryMode: 'auto_resume',
    reasoningSummary: normalizeEnum(
      source.reasoningSummary,
      OPENAI_REASONING_SUMMARY_VALUES,
      String(base.reasoningSummary || 'auto').trim().toLowerCase() || 'auto',
    ),
    reasoningEffort: normalizeEnum(
      source.reasoningEffort,
      OPENAI_REASONING_EFFORT_VALUES,
      String(base.reasoningEffort || 'provider_default').trim().toLowerCase() || 'provider_default',
    ),
    textVerbosity: normalizeEnum(
      source.textVerbosity,
      OPENAI_TEXT_VERBOSITY_VALUES,
      String(base.textVerbosity || 'provider_default').trim().toLowerCase() || 'provider_default',
    ),
    serviceTier: normalizeEnum(
      source.serviceTier,
      OPENAI_SERVICE_TIER_VALUES,
      String(base.serviceTier || 'auto').trim().toLowerCase() || 'auto',
    ),
    promptCachingEnabled: normalizeBoolean(source.promptCachingEnabled, base.promptCachingEnabled),
    promptCacheRetention: normalizeEnum(
      source.promptCacheRetention,
      OPENAI_PROMPT_CACHE_RETENTION_VALUES,
      String(base.promptCacheRetention || 'in_memory').trim().toLowerCase() || 'in_memory',
    ),
    continuityMode: 'local_first_hybrid',
    usePreviousResponseId: normalizeBoolean(source.usePreviousResponseId, base.usePreviousResponseId),
    useConversationState: normalizeBoolean(source.useConversationState, base.useConversationState),
    useResponseCompaction: normalizeBoolean(source.useResponseCompaction, base.useResponseCompaction),
    useServerSideCompaction: normalizeBoolean(
      source.useServerSideCompaction,
      base.useServerSideCompaction,
    ),
    serverSideCompactionThresholdTokens: normalizeServerSideCompactionThresholdTokens(
      source.serverSideCompactionThresholdTokens,
      base.serverSideCompactionThresholdTokens,
    ),
    providerTruncationSoftTriggerPercent: normalizeProviderTruncationSoftTriggerPercent(
      source.providerTruncationSoftTriggerPercent,
      base.providerTruncationSoftTriggerPercent,
    ),
    defaultMaxOutputTokensOverride: normalizeOptionalPositiveInteger(
      source.defaultMaxOutputTokensOverride,
      base.defaultMaxOutputTokensOverride,
      { min: 256 },
    ),
    toolResultBudgetCharsOverride: normalizeOptionalPositiveInteger(
      source.toolResultBudgetCharsOverride,
      base.toolResultBudgetCharsOverride,
      { min: 1_000 },
    ),
    oldToolResultPruningEnabled: normalizeBoolean(
      source.oldToolResultPruningEnabled,
      base.oldToolResultPruningEnabled,
    ),
    promptPreflightHardGuardEnabled: normalizeBoolean(
      source.promptPreflightHardGuardEnabled,
      base.promptPreflightHardGuardEnabled,
    ),
    codexAutoThreadCompactionEnabled: normalizeBoolean(
      source.codexAutoThreadCompactionEnabled,
      base.codexAutoThreadCompactionEnabled,
    ),
    codexAutoThreadCompactionTokenLimit: normalizeCodexAutoThreadCompactionTokenLimit(
      source.codexAutoThreadCompactionTokenLimit,
      base.codexAutoThreadCompactionTokenLimit,
    ),
    codexAutoThreadCompactionInstructions: normalizeCodexAutoThreadCompactionInstructions(
      source.codexAutoThreadCompactionInstructions,
      base.codexAutoThreadCompactionInstructions,
    ),
    serverSideCompactionBackgroundParity: normalizeBoolean(
      source.serverSideCompactionBackgroundParity,
      base.serverSideCompactionBackgroundParity,
    ),
    allowPromptCompactionCommands: normalizeBoolean(
      source.allowPromptCompactionCommands,
      base.allowPromptCompactionCommands,
    ),
    allowPromptCompactionThresholdOverride: normalizeBoolean(
      source.allowPromptCompactionThresholdOverride,
      base.allowPromptCompactionThresholdOverride,
    ),
    enableBackgroundMode: normalizeBoolean(source.enableBackgroundMode, base.enableBackgroundMode),
    webSearchContextSize: normalizeEnum(
      source.webSearchContextSize,
      OPENAI_WEB_SEARCH_CONTEXT_SIZE_VALUES,
      String(base.webSearchContextSize || 'medium').trim().toLowerCase() || 'medium',
    ),
    webSearchApproximateLocationEnabled: normalizeBoolean(
      source.webSearchApproximateLocationEnabled,
      base.webSearchApproximateLocationEnabled,
    ),
    fileHandlingMode: 'persistent_reusable',
    autoCreateProjectVectorStore: normalizeBoolean(
      source.autoCreateProjectVectorStore,
      base.autoCreateProjectVectorStore,
    ),
    autoAttachProjectVectorStore: normalizeBoolean(
      source.autoAttachProjectVectorStore,
      base.autoAttachProjectVectorStore,
    ),
    fileSearchMaxNumResults: clampInt(
      source.fileSearchMaxNumResults,
      clampInt(base.fileSearchMaxNumResults, 8, 1, 50),
      1,
      50,
    ),
    imageGenerationOutputFormat: normalizeEnum(
      source.imageGenerationOutputFormat,
      OPENAI_IMAGE_OUTPUT_FORMAT_VALUES,
      String(base.imageGenerationOutputFormat || 'webp').trim().toLowerCase() || 'webp',
    ),
    imageGenerationQuality: normalizeEnum(
      source.imageGenerationQuality,
      OPENAI_IMAGE_QUALITY_VALUES,
      String(base.imageGenerationQuality || 'medium').trim().toLowerCase() || 'medium',
    ),
    remoteDataWarningAcknowledgedAt: normalizeTimestamp(
      source.remoteDataWarningAcknowledgedAt,
      base.remoteDataWarningAcknowledgedAt,
    ),
    hostedToolConfig,
  }
}

export function sanitizeOpenAIHostedToolsForModel(runtimeSettings = {}, modelId = '') {
  const normalizedSettings = normalizeOpenAIProviderRuntimeSettings(runtimeSettings || {})
  const normalizedModelId = normalizeModelId(modelId)
  if (!normalizedModelId) return normalizedSettings

  const adapterProfile = resolveProviderModelAdapter('openai', normalizedModelId)
  const support = adapterProfile?.openaiRuntimeSupport || resolveOpenAIModelRuntimeSupport(normalizedModelId)
  const modelCompatibleToolIds = sanitizeOpenAIHostedToolIdsForMutualExclusion(
    normalizeHostedToolIdList(
      Array.isArray(normalizedSettings.enabledHostedTools) && String(adapterProfile?.toolFamily || '').trim().toLowerCase() === 'openai_hosted'
        ? normalizedSettings.enabledHostedTools.filter(
          (toolId) => support.hostedToolSupport?.[String(toolId || '').trim().toLowerCase()] !== false,
        )
        : [],
      { maxItems: 16 },
    ),
    { maxItems: 16 },
  )

  return normalizeOpenAIProviderRuntimeSettings({
    ...normalizedSettings,
    enabledHostedTools: modelCompatibleToolIds,
    hostedToolConfig: syncOpenAILocalRuntimeConfigWithEnabledToolIds(
      normalizedSettings.hostedToolConfig,
      modelCompatibleToolIds,
    ),
  })
}

export function normalizeProviderRuntimeSettings(
  rawValue = {},
  fallback = DEFAULT_PROVIDER_RUNTIME_SETTINGS,
) {
  const source = rawValue && typeof rawValue === 'object' ? rawValue : {}
  const base = fallback && typeof fallback === 'object'
    ? fallback
    : DEFAULT_PROVIDER_RUNTIME_SETTINGS
  return {
    anthropic: normalizeAnthropicProviderRuntimeSettings(
      source.anthropic,
      base.anthropic,
    ),
    moonshot: normalizeMoonshotProviderRuntimeSettings(
      source.moonshot,
      base.moonshot,
    ),
    openai: normalizeOpenAIProviderRuntimeSettings(
      source.openai,
      base.openai,
    ),
  }
}
