import { SETTINGS_NAV_GROUPS } from './settings-panel-ui-utils.mjs'
import {
  isSupportedMoonshotFormulaUri,
  normalizeMoonshotFormulaUri,
} from '../../../common/api-clients/moonshot-formula-catalog.mjs'
import { isSupportedOpenAIHostedToolId } from '../../../common/api-clients/openai-hosted-tool-catalog.mjs'
import {
  DEFAULT_ANTHROPIC_PROVIDER_RUNTIME_SETTINGS,
  normalizeAnthropicProviderRuntimeSettings,
  normalizeOpenAIProviderRuntimeSettings,
} from '../../../main/api-clients/openai-runtime-types.mjs'

export const DEFAULT_MOONSHOT_RUNTIME_SETTINGS = Object.freeze({
  remoteToolsEnabled: false,
  enabledFormulaUris: [],
  remoteToolWarningAcknowledgedAt: 0,
})

export const DEFAULT_OPENAI_RUNTIME_SETTINGS = Object.freeze({
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

export const DEFAULT_ANTHROPIC_RUNTIME_SETTINGS = Object.freeze({
  ...DEFAULT_ANTHROPIC_PROVIDER_RUNTIME_SETTINGS,
})

const SETTINGS_PANEL_ACTIVE_CATEGORY_STORAGE_KEY = 'addom.settings.activeCategory.v1'
const SETTINGS_PANEL_DEFAULT_CATEGORY_ID = 'general'
const SETTINGS_PANEL_ALLOWED_CATEGORY_IDS = new Set(
  SETTINGS_NAV_GROUPS.flatMap((group) => (Array.isArray(group?.categoryIds) ? group.categoryIds : []))
    .map((id) => String(id || '').trim())
    .filter(Boolean),
)

export function resolveUpdateCheckFallbackStatus(result = null) {
  const status = String(result?.status || '').trim().toLowerCase()
  if (status === 'dev-mode' || status === 'disabled') return 'not-available'
  return result?.ok === false ? 'error' : null
}

export function resolveUpdateCheckFallbackInfo(result = null) {
  if (result?.ok !== false) return null
  const code = String(result?.code || '').trim().toLowerCase()
  return { code: code === 'unavailable' || code === 'network' ? code : 'generic' }
}

function normalizeSettingsPanelActiveCategoryId(rawValue = '', fallback = SETTINGS_PANEL_DEFAULT_CATEGORY_ID) {
  const normalized = String(rawValue || '').trim().toLowerCase()
  if (SETTINGS_PANEL_ALLOWED_CATEGORY_IDS.has(normalized)) return normalized
  const normalizedFallback = String(fallback || '').trim().toLowerCase()
  if (normalizedFallback && SETTINGS_PANEL_ALLOWED_CATEGORY_IDS.has(normalizedFallback)) return normalizedFallback
  return SETTINGS_PANEL_DEFAULT_CATEGORY_ID
}

export function readSettingsPanelActiveCategoryId() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return SETTINGS_PANEL_DEFAULT_CATEGORY_ID
    const raw = window.localStorage.getItem(SETTINGS_PANEL_ACTIVE_CATEGORY_STORAGE_KEY)
    return normalizeSettingsPanelActiveCategoryId(raw, SETTINGS_PANEL_DEFAULT_CATEGORY_ID)
  } catch {
    return SETTINGS_PANEL_DEFAULT_CATEGORY_ID
  }
}

export function writeSettingsPanelActiveCategoryId(rawValue = SETTINGS_PANEL_DEFAULT_CATEGORY_ID) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    const normalized = normalizeSettingsPanelActiveCategoryId(rawValue, SETTINGS_PANEL_DEFAULT_CATEGORY_ID)
    window.localStorage.setItem(SETTINGS_PANEL_ACTIVE_CATEGORY_STORAGE_KEY, normalized)
  } catch {
    // Ignore localStorage failures in renderer sandboxed contexts.
  }
}

export function normalizeMoonshotRuntimeSettingsForUi(rawValue = {}, fallback = DEFAULT_MOONSHOT_RUNTIME_SETTINGS) {
  const source = rawValue && typeof rawValue === 'object' ? rawValue : {}
  const base = fallback && typeof fallback === 'object'
    ? fallback
    : DEFAULT_MOONSHOT_RUNTIME_SETTINGS
  const seen = new Set()
  const enabledFormulaUris = []
  for (const value of Array.isArray(source.enabledFormulaUris) ? source.enabledFormulaUris : []) {
    const normalized = normalizeMoonshotFormulaUri(value)
    if (!normalized || seen.has(normalized) || !isSupportedMoonshotFormulaUri(normalized)) continue
    seen.add(normalized)
    enabledFormulaUris.push(normalized)
  }
  const acknowledgedAt = Number(source.remoteToolWarningAcknowledgedAt)
  return {
    remoteToolsEnabled: typeof source.remoteToolsEnabled === 'boolean'
      ? source.remoteToolsEnabled
      : !!base.remoteToolsEnabled,
    enabledFormulaUris,
    remoteToolWarningAcknowledgedAt: Number.isFinite(acknowledgedAt) && acknowledgedAt > 0
      ? Math.round(acknowledgedAt)
      : Math.max(0, Number(base.remoteToolWarningAcknowledgedAt || 0) || 0),
  }
}

export function normalizeOpenAIRuntimeSettingsForUi(rawValue = {}, fallback = DEFAULT_OPENAI_RUNTIME_SETTINGS) {
  const normalized = normalizeOpenAIProviderRuntimeSettings({
    ...(fallback && typeof fallback === 'object' ? fallback : DEFAULT_OPENAI_RUNTIME_SETTINGS),
    ...(rawValue && typeof rawValue === 'object' ? rawValue : {}),
  })
  const enabledHostedTools = Array.isArray(normalized.enabledHostedTools)
    ? normalized.enabledHostedTools.filter((value) => isSupportedOpenAIHostedToolId(value))
    : []
  return {
    ...normalized,
    enabledHostedTools,
  }
}

export function normalizeAnthropicRuntimeSettingsForUi(
  rawValue = {},
  fallback = DEFAULT_ANTHROPIC_RUNTIME_SETTINGS,
) {
  return normalizeAnthropicProviderRuntimeSettings({
    ...(fallback && typeof fallback === 'object' ? fallback : DEFAULT_ANTHROPIC_RUNTIME_SETTINGS),
    ...(rawValue && typeof rawValue === 'object' ? rawValue : {}),
  })
}

/**
 * Detect when settings:set failed because the running Electron main process
 * still has an older settings allowlist/handler (common after renderer HMR).
 */
export function isStaleSettingsPersistError(error, settingKey = '') {
  const key = String(settingKey || '').trim()
  if (!key) return false
  const rejectedKeys = Array.isArray(error?.rejectedKeys)
    ? error.rejectedKeys.map((value) => String(value || '').trim()).filter(Boolean)
    : []
  if (error?.code === 'settings_set_rejected_keys' && rejectedKeys.includes(key)) return true
  const message = String(error?.message || error || '')
  if (!message) return false
  if (new RegExp(`\\b${key}\\b`).test(message) && /cannot mutate|rejected/i.test(message)) return true
  return /no handler|not registered|unknown channel/i.test(message)
}
