import { create } from 'zustand'
import { normalizeModelCatalogVisibility } from '../../common/api-clients/model-catalog-visibility-settings.mjs'
import { normalizeAgentSettings } from '../../common/agents/agent-settings.mjs'
import { normalizePermissionMode } from '../../common/chat/permission-mode.mjs'
import useAppStore from './useAppStore.js'
import useChatStore, { setThreadSessionDebug } from './useChatStore.js'
import { applyChatTypographySettings } from '../components/chat/chat-typography-settings.mjs'
import { applyUiScalingSettings } from '../ui-scaling-runtime.mjs'
import { applyBackgroundToneSettings } from '../background-tone-runtime.mjs'
import { applyAppearanceSettings } from '../theme/appearance-runtime.mjs'
import { DEFAULT_UI_LOCALE, normalizeUiLocale } from '../../common/i18n/locale-config.mjs'
import { syncRendererUiLocale } from '../i18n/init.mjs'

const MAX_SEEN_SECURITY_WARNING_IDS = 500
const seenSecurityWarningIds = new Set()

let settingsBridgeCleanup = null
let coreSettingsHydrationPromise = null
let appSettingsHydrationPromise = null
let coreSettingsRequestSequence = 0
let openAIProjectAssetsRequestSequence = 0
let secondaryHydrationPendingCount = 0

function normalizeSettingsObject(settings = null) {
  return settings && typeof settings === 'object' ? settings : null
}

function cacheSecurityWarning(warning = {}) {
  const warningId = String(warning?.id || '').trim()
  if (warningId && seenSecurityWarningIds.has(warningId)) return false
  if (warningId) {
    if (seenSecurityWarningIds.size >= MAX_SEEN_SECURITY_WARNING_IDS) {
      seenSecurityWarningIds.clear()
    }
    seenSecurityWarningIds.add(warningId)
  }
  return true
}

function applyCoreSettingsToRuntime(settings = {}) {
  const normalizedSettings = normalizeSettingsObject(settings) || {}
  const appState = useAppStore.getState()
  const chatState = useChatStore.getState()
  const hasUiScaling = Object.prototype.hasOwnProperty.call(normalizedSettings, 'uiScaling')
  const hasBackgroundTone = Object.prototype.hasOwnProperty.call(normalizedSettings, 'backgroundTone')
  const hasAppearance = Object.prototype.hasOwnProperty.call(normalizedSettings, 'appearance')
  const hasChatTypography = Object.prototype.hasOwnProperty.call(normalizedSettings, 'chatTypography')
  const uiLocale = normalizeUiLocale(normalizedSettings.uiLocale, DEFAULT_UI_LOCALE)

  appState.setPermissionMode(normalizePermissionMode(normalizedSettings.permissionMode))
  appState.setInlineCompletionEnabled(normalizedSettings.inlineCompletionEnabled !== false)
  appState.setAttachmentTextExtractionEnabled(normalizedSettings?.attachmentTextExtraction?.enabled === true)
  appState.setMemoryCompressionEnabled(normalizedSettings.memoryCompressionEnabled !== false)
  appState.setMemoryCompressionThreshold(normalizedSettings.memoryCompressionThreshold)
  appState.setIncludeGlobalMemoryInContext(!!normalizedSettings.includeGlobalMemoryInContext)
  appState.setLiveExecutionStreamEnabled(normalizedSettings.liveExecutionStreamEnabled !== false)
  appState.setPerThreadBackgroundSessions(normalizedSettings.perThreadBackgroundSessions !== false)
  appState.setModelCatalogVisibility(
    normalizeModelCatalogVisibility(normalizedSettings?.modelCatalogVisibility),
  )
  setThreadSessionDebug(normalizedSettings?.commandSafety?.showDeveloperOptions === true)
  chatState.setChatMode(
    normalizedSettings.chatMode === 'plan' || normalizedSettings.chatMode === 'thinking'
      ? normalizedSettings.chatMode
      : 'execute',
  )
  void syncRendererUiLocale(uiLocale).catch((error) => {
    console.error('[i18n] failed to apply renderer uiLocale:', error)
  })
  if (hasUiScaling) applyUiScalingSettings(normalizedSettings.uiScaling)
  if (hasBackgroundTone) applyBackgroundToneSettings(normalizedSettings.backgroundTone)
  if (hasAppearance) applyAppearanceSettings(normalizedSettings.appearance)
  if (hasChatTypography) applyChatTypographySettings(normalizedSettings.chatTypography)
}

const useSettingsStore = create((set, get) => ({
  coreSettings: null,
  uiLocale: DEFAULT_UI_LOCALE,
  coreSettingsLoading: false,
  secondaryHydrationLoading: false,
  roleTemplates: [],
  localDataSummary: null,
  providerBudgetSummary: null,
  toolResultSpilloverSummary: null,
  openAIProjectAssets: null,
  openAIProjectAssetsProjectId: '',
  openAIMcpServers: [],
  commandSafetyTelemetry: null,
  inlineCompletionTelemetry: null,

  beginSecondaryHydration: () => {
    secondaryHydrationPendingCount += 1
    set({ secondaryHydrationLoading: true })
  },

  finishSecondaryHydration: () => {
    secondaryHydrationPendingCount = Math.max(0, secondaryHydrationPendingCount - 1)
    set({ secondaryHydrationLoading: secondaryHydrationPendingCount > 0 })
  },

  cacheCoreSettings: (settings = null) => {
    const normalizedSettings = normalizeSettingsObject(settings)
    set({
      coreSettings: normalizedSettings,
      uiLocale: normalizeUiLocale(normalizedSettings?.uiLocale, DEFAULT_UI_LOCALE),
    })
    if (normalizedSettings) {
      applyCoreSettingsToRuntime(normalizedSettings)
    }
    return normalizedSettings
  },

  cacheRoleTemplates: (roleTemplates = []) => set({
    roleTemplates: Array.isArray(roleTemplates) ? roleTemplates : [],
  }),

  cacheLocalDataSummary: (localDataSummary = null) => set({
    localDataSummary: localDataSummary && typeof localDataSummary === 'object'
      ? localDataSummary
      : null,
  }),

  cacheProviderBudgetSummary: (providerBudgetSummary = null) => set({
    providerBudgetSummary: providerBudgetSummary && typeof providerBudgetSummary === 'object'
      ? providerBudgetSummary
      : null,
  }),

  cacheToolResultSpilloverSummary: (toolResultSpilloverSummary = null) => set({
    toolResultSpilloverSummary: toolResultSpilloverSummary && typeof toolResultSpilloverSummary === 'object'
      ? toolResultSpilloverSummary
      : null,
  }),

  cacheOpenAIProjectAssets: (projectId = '', openAIProjectAssets = null) => set({
    openAIProjectAssetsProjectId: String(projectId || '').trim(),
    openAIProjectAssets: openAIProjectAssets && typeof openAIProjectAssets === 'object'
      ? openAIProjectAssets
      : null,
  }),

  resetProjectSettingsCaches: () => {
    openAIProjectAssetsRequestSequence += 1
    set({
      openAIProjectAssets: null,
      openAIProjectAssetsProjectId: '',
    })
  },

  cacheOpenAIMcpServers: (servers = []) => set({
    openAIMcpServers: Array.isArray(servers) ? servers : [],
  }),

  cacheCommandSafetyTelemetry: (snapshot = null) => {
    const normalizedSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : null
    set({ commandSafetyTelemetry: normalizedSnapshot })
    useAppStore.getState().setCommandSafetyStartupTelemetry(normalizedSnapshot)
    return normalizedSnapshot
  },

  cacheInlineCompletionTelemetry: (snapshot = null) => set({
    inlineCompletionTelemetry: snapshot && typeof snapshot === 'object' ? snapshot : null,
  }),

  initializeBridge: () => {
    if (settingsBridgeCleanup) return settingsBridgeCleanup
    const settingsApi = window?.addom?.settings
    if (!settingsApi) {
      settingsBridgeCleanup = () => {
        settingsBridgeCleanup = null
      }
      return settingsBridgeCleanup
    }

    const unsubscribeSecurityWarning = typeof settingsApi.onSecurityWarning === 'function'
      ? settingsApi.onSecurityWarning((warning = {}) => {
        if (!cacheSecurityWarning(warning)) return
        const changedFields = Array.isArray(warning?.changedFields)
          ? warning.changedFields.map((field) => String(field || '').trim()).filter(Boolean)
          : []
        const reason = String(warning?.reason || '').trim()
        console.warn('[settings-security-warning]', {
          reason: reason || 'unexpected_security_change',
          changedFields,
        })
      })
      : () => {}

    const unsubscribeSettingsUpdated = typeof settingsApi.onUpdated === 'function'
      ? settingsApi.onUpdated((payload = {}) => {
        if (payload?.settings && typeof payload.settings === 'object') {
          coreSettingsRequestSequence += 1
          get().cacheCoreSettings(payload.settings)
        }
      })
      : () => {}

    settingsBridgeCleanup = () => {
      unsubscribeSecurityWarning?.()
      unsubscribeSettingsUpdated?.()
      settingsBridgeCleanup = null
    }

    return settingsBridgeCleanup
  },

  hydrateCoreSettings: async (options = {}) => {
    const settingsApi = window?.addom?.settings
    if (!settingsApi || typeof settingsApi.get !== 'function') {
      if (options?.throwOnError === true) {
        throw new Error('Settings API is unavailable.')
      }
      return null
    }

    set({ coreSettingsLoading: true })
    const requestId = ++coreSettingsRequestSequence
    try {
      const settings = await settingsApi.get()
      if (requestId !== coreSettingsRequestSequence) {
        return get().coreSettings
      }
      return get().cacheCoreSettings(settings)
    } catch (error) {
      if (options?.throwOnError === true) throw error
      return null
    } finally {
      set({ coreSettingsLoading: false })
    }
  },

  ensureCoreSettingsHydrated: async (options = {}) => {
    if (get().coreSettings) return get().coreSettings
    if (!coreSettingsHydrationPromise) {
      coreSettingsHydrationPromise = get().hydrateCoreSettings({ ...options, throwOnError: true })
        .finally(() => {
          coreSettingsHydrationPromise = null
        })
    }
    try {
      return await coreSettingsHydrationPromise
    } catch (error) {
      if (options?.throwOnError === true) throw error
      return null
    }
  },

  refreshStartupCommandSafetyProbe: async () => {
    const settingsApi = window?.addom?.settings
    if (!settingsApi || typeof settingsApi.detectInstallSandboxBackend !== 'function') return null
    const commandSafety = get().coreSettings?.commandSafety || {}
    try {
      const backendStatus = await settingsApi.detectInstallSandboxBackend(commandSafety)
      const normalizedStatus = backendStatus && typeof backendStatus === 'object'
        ? backendStatus
        : null
      useAppStore.getState().setCommandSafetyStartupProbe({
        checkedAt: Date.now(),
        source: 'app_startup',
        backendStatus: normalizedStatus,
      })
      return normalizedStatus
    } catch (error) {
      const failureStatus = {
        backend: 'none',
        available: false,
        reason: String(error?.message || error || 'Failed to detect install sandbox backend on startup.'),
      }
      useAppStore.getState().setCommandSafetyStartupProbe({
        checkedAt: Date.now(),
        source: 'app_startup',
        backendStatus: failureStatus,
      })
      return null
    }
  },

  refreshRoleTemplates: async () => {
    const agentsApi = window?.addom?.agents
    if (!agentsApi || typeof agentsApi.listRoleTemplates !== 'function') {
      get().cacheRoleTemplates([])
      return []
    }
    try {
      const rows = await agentsApi.listRoleTemplates()
      const templates = Array.isArray(rows)
        ? rows.filter((row) => row && typeof row === 'object')
        : []
      get().cacheRoleTemplates(templates)
      return templates
    } catch {
      get().cacheRoleTemplates([])
      return []
    }
  },

  refreshLocalDataSummary: async () => {
    const localDataApi = window?.addom?.localData
    if (!localDataApi || typeof localDataApi.getSummary !== 'function') {
      get().cacheLocalDataSummary(null)
      return null
    }
    try {
      const summary = await localDataApi.getSummary()
      const normalizedSummary = summary && typeof summary === 'object' ? summary : null
      get().cacheLocalDataSummary(normalizedSummary)
      return normalizedSummary
    } catch {
      get().cacheLocalDataSummary(null)
      return null
    }
  },

  refreshProviderBudgetSummary: async () => {
    const localDataApi = window?.addom?.localData
    if (!localDataApi || typeof localDataApi.getProviderBudgetSummary !== 'function') {
      get().cacheProviderBudgetSummary(null)
      return null
    }
    try {
      const summary = await localDataApi.getProviderBudgetSummary()
      const normalizedSummary = summary && typeof summary === 'object' ? summary : null
      get().cacheProviderBudgetSummary(normalizedSummary)
      return normalizedSummary
    } catch {
      get().cacheProviderBudgetSummary(null)
      return null
    }
  },

  refreshToolResultSpilloverSummary: async () => {
    const localDataApi = window?.addom?.localData
    if (!localDataApi || typeof localDataApi.getToolResultSpilloverSummary !== 'function') {
      get().cacheToolResultSpilloverSummary(null)
      return null
    }
    try {
      const summary = await localDataApi.getToolResultSpilloverSummary()
      const normalizedSummary = summary && typeof summary === 'object' ? summary : null
      get().cacheToolResultSpilloverSummary(normalizedSummary)
      return normalizedSummary
    } catch {
      get().cacheToolResultSpilloverSummary(null)
      return null
    }
  },

  refreshOpenAIProjectAssets: async (projectId, options = {}) => {
    const normalizedProjectId = String(projectId || '').trim()
    const openaiAssetsApi = window?.addom?.openaiAssets
    if (!normalizedProjectId || !openaiAssetsApi) {
      get().cacheOpenAIProjectAssets('', null)
      return null
    }

    const forceRemote = options?.forceRemote === true
    const throwOnError = options?.throwOnError === true
    const method = forceRemote === true
      ? openaiAssetsApi.syncProjectAssets
      : openaiAssetsApi.listProjectAssets

    if (typeof method !== 'function') {
      get().cacheOpenAIProjectAssets(normalizedProjectId, null)
      return null
    }

    const requestId = ++openAIProjectAssetsRequestSequence
    get().cacheOpenAIProjectAssets(normalizedProjectId, null)
    try {
      const assets = await method(normalizedProjectId)
      const normalizedAssets = assets && typeof assets === 'object' ? assets : null
      if (requestId !== openAIProjectAssetsRequestSequence) return normalizedAssets
      get().cacheOpenAIProjectAssets(normalizedProjectId, normalizedAssets)
      return normalizedAssets
    } catch (error) {
      if (forceRemote !== true && typeof openaiAssetsApi.syncProjectAssets === 'function') {
        try {
          const fallbackAssets = await openaiAssetsApi.syncProjectAssets(normalizedProjectId)
          const normalizedFallbackAssets = fallbackAssets && typeof fallbackAssets === 'object'
            ? fallbackAssets
            : null
          if (requestId !== openAIProjectAssetsRequestSequence) return normalizedFallbackAssets
          get().cacheOpenAIProjectAssets(normalizedProjectId, normalizedFallbackAssets)
          return normalizedFallbackAssets
        } catch {
          if (requestId === openAIProjectAssetsRequestSequence) {
            get().cacheOpenAIProjectAssets(normalizedProjectId, null)
          }
        }
      } else {
        if (requestId === openAIProjectAssetsRequestSequence) {
          get().cacheOpenAIProjectAssets(normalizedProjectId, null)
        }
      }
      if (throwOnError) throw error
      return null
    }
  },

  refreshOpenAIMcpServers: async () => {
    const openAIMcpApi = window?.addom?.openaiMcp
    if (!openAIMcpApi || typeof openAIMcpApi.listServers !== 'function') {
      get().cacheOpenAIMcpServers([])
      return []
    }
    try {
      const rows = await openAIMcpApi.listServers()
      const normalizedRows = Array.isArray(rows) ? rows : []
      get().cacheOpenAIMcpServers(normalizedRows)
      return normalizedRows
    } catch {
      get().cacheOpenAIMcpServers([])
      return []
    }
  },

  refreshCommandSafetyTelemetry: async () => {
    const settingsApi = window?.addom?.settings
    if (!settingsApi || typeof settingsApi.getCommandSafetyTelemetry !== 'function') {
      return get().cacheCommandSafetyTelemetry(null)
    }
    try {
      const snapshot = await settingsApi.getCommandSafetyTelemetry()
      return get().cacheCommandSafetyTelemetry(snapshot)
    } catch {
      return get().cacheCommandSafetyTelemetry(null)
    }
  },

  clearCommandSafetyTelemetry: async () => {
    const settingsApi = window?.addom?.settings
    if (!settingsApi || typeof settingsApi.clearCommandSafetyTelemetry !== 'function') {
      return get().cacheCommandSafetyTelemetry(null)
    }
    try {
      const snapshot = await settingsApi.clearCommandSafetyTelemetry()
      return get().cacheCommandSafetyTelemetry(snapshot)
    } catch {
      return get().cacheCommandSafetyTelemetry(null)
    }
  },

  refreshInlineCompletionTelemetry: async () => {
    const settingsApi = window?.addom?.settings
    if (!settingsApi || typeof settingsApi.getInlineCompletionTelemetry !== 'function') {
      return get().cacheInlineCompletionTelemetry(null)
    }
    try {
      const snapshot = await settingsApi.getInlineCompletionTelemetry()
      return get().cacheInlineCompletionTelemetry(snapshot)
    } catch {
      return get().cacheInlineCompletionTelemetry(null)
    }
  },

  clearInlineCompletionTelemetry: async () => {
    const settingsApi = window?.addom?.settings
    if (!settingsApi || typeof settingsApi.clearInlineCompletionTelemetry !== 'function') {
      return get().cacheInlineCompletionTelemetry(null)
    }
    try {
      const snapshot = await settingsApi.clearInlineCompletionTelemetry()
      return get().cacheInlineCompletionTelemetry(snapshot)
    } catch {
      return get().cacheInlineCompletionTelemetry(null)
    }
  },

  hydrateAppSettingsCaches: async () => {
    if (appSettingsHydrationPromise) return appSettingsHydrationPromise
    get().beginSecondaryHydration()
    appSettingsHydrationPromise = Promise.allSettled([
      get().refreshRoleTemplates(),
      get().refreshLocalDataSummary(),
      get().refreshProviderBudgetSummary(),
      get().refreshToolResultSpilloverSummary(),
      get().refreshCommandSafetyTelemetry(),
      get().refreshInlineCompletionTelemetry(),
      get().refreshOpenAIMcpServers(),
    ]).finally(() => {
      get().finishSecondaryHydration()
      appSettingsHydrationPromise = null
    })
    return appSettingsHydrationPromise
  },

  hydrateProjectSettingsCaches: async ({ activeProjectId = '', includeRemoteOpenAIAssets = false } = {}) => {
    get().beginSecondaryHydration()
    try {
      if (!activeProjectId) {
        get().resetProjectSettingsCaches()
        return
      }
      await get().refreshOpenAIProjectAssets(activeProjectId, {
        forceRemote: includeRemoteOpenAIAssets === true,
        throwOnError: true,
      })
    } finally {
      get().finishSecondaryHydration()
    }
  },
}))

export function readInitialSettingsPanelDrafts() {
  const settings = normalizeSettingsObject(useSettingsStore.getState().coreSettings) || {}
  const cachedMcpServers = useSettingsStore.getState().openAIMcpServers
  const openaiRuntimeSettings = settings?.providerRuntimeSettings?.openai
    && typeof settings.providerRuntimeSettings.openai === 'object'
    ? settings.providerRuntimeSettings.openai
    : {}

  return {
    systemPromptAppendix: String(settings?.systemPromptAppendix ?? ''),
    moaRoles: Array.isArray(settings?.moaRoles) ? settings.moaRoles : [],
    agentSettings: normalizeAgentSettings(settings?.agentSettings),
    continuityPolicy: settings?.continuityPolicy || {},
    complianceMode: String(settings?.complianceMode || 'warn_only').trim() || 'warn_only',
    anthropicRuntimeSettings: settings?.providerRuntimeSettings?.anthropic || {},
    openaiRuntimeSettings: {
      ...openaiRuntimeSettings,
      hostedToolConfig: {
        ...(openaiRuntimeSettings?.hostedToolConfig && typeof openaiRuntimeSettings.hostedToolConfig === 'object'
          ? openaiRuntimeSettings.hostedToolConfig
          : {}),
        mcp: {
          servers: Array.isArray(cachedMcpServers) ? cachedMcpServers : [],
        },
      },
    },
    uiScalingSettings: settings?.uiScaling || null,
    backgroundToneSettings: settings?.backgroundTone || null,
    appearanceSettings: settings?.appearance || null,
    chatTypographySettings: settings?.chatTypography || null,
  }
}

export default useSettingsStore
