// @refresh reset
import React, { startTransition, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import useAppStore, { requestAppAlert, requestAppConfirm } from '../../store/useAppStore.js'
import useVaultStore from '../../store/useVaultStore.js'
import useWorkspaceStore from '../../store/useWorkspaceStore.js'
import useSettingsStore, { readInitialSettingsPanelDrafts } from '../../store/useSettingsStore.js'
import { DEFAULT_UI_LOCALE, normalizeUiLocale } from '../../../common/i18n/locale-config.mjs'
import Icon from '../ui/Icon.jsx'
import { normalizeAgentSettings } from '../../../common/agents/agent-settings.mjs'
import { normalizeModelCatalogVisibility } from '../../../common/api-clients/model-catalog-visibility-settings.mjs'
import {
  COMPLIANCE_MODE_WARN_ONLY,
  normalizeComplianceMode,
} from '../../../common/compliance/compliance-settings.mjs'
import { normalizePermissionMode } from '../../../common/chat/permission-mode.mjs'
import {
  SETTINGS_NAV_GROUPS,
  localizeSettingsNavGroups,
  normalizeCommandSafetyForUi,
  useSettingsTranslator,
} from './settings-panel-ui-utils.mjs'
import {
  buildSettingsCategories,
  buildActiveSettingsSections,
  SettingsInstructionsModal,
} from './SettingsPanelSections.jsx'
import { savePermissionModeSelection } from '../permission-mode-persistence.mjs'
import SettingsPanelContent from './SettingsPanelContent.jsx'
import SettingsExportPreflightModal from './SettingsExportPreflightModal.jsx'
import SettingsImportThreadModal from './SettingsImportThreadModal.jsx'
import useSettingsPanelDataManagement from './use-settings-panel-data-management.mjs'
import useSettingsOpenAIAssetsMcp from './use-settings-openai-assets-mcp.mjs'
import {
  DEFAULT_ANTHROPIC_RUNTIME_SETTINGS,
  DEFAULT_OPENAI_RUNTIME_SETTINGS,
  normalizeAnthropicRuntimeSettingsForUi,
  normalizeOpenAIRuntimeSettingsForUi,
  readSettingsPanelActiveCategoryId,
  resolveUpdateCheckFallbackInfo,
  resolveUpdateCheckFallbackStatus,
  writeSettingsPanelActiveCategoryId,
  isStaleSettingsPersistError,
} from './settings-panel-runtime-and-storage.mjs'
import { useShallow } from 'zustand/react/shallow'
import {
  DEFAULT_CHAT_TYPOGRAPHY_SETTINGS,
  normalizeChatTypographySettings,
} from '../../../common/chat/chat-typography-settings.mjs'
import {
  DEFAULT_UI_SCALING_SETTINGS,
  normalizeUiScalingSettings,
} from '../../../common/ui/ui-scaling-settings.mjs'
import { applyUiScalingSettings } from '../../ui-scaling-runtime.mjs'
import {
  DEFAULT_BACKGROUND_TONE_SETTINGS,
  normalizeBackgroundToneSettings,
} from '../../../common/ui/background-tone-settings.mjs'
import { applyBackgroundToneSettings } from '../../background-tone-runtime.mjs'
import useAppearanceSettingsController from './use-appearance-settings-controller.mjs'
import {
  DEFAULT_TERMINAL_SETTINGS,
  normalizeTerminalSettings,
} from '../../../common/terminal/terminal-settings.mjs'

function mergeOpenAIMcpServersIntoRuntimeSettings(runtimeSettings = {}, openAIMcpServers = []) {
  const normalizedServers = Array.isArray(openAIMcpServers) ? openAIMcpServers : []
  const normalizedRuntimeSettings = normalizeOpenAIRuntimeSettingsForUi(runtimeSettings)
  return normalizeOpenAIRuntimeSettingsForUi({
    ...normalizedRuntimeSettings,
    hostedToolConfig: {
      ...(normalizedRuntimeSettings?.hostedToolConfig && typeof normalizedRuntimeSettings.hostedToolConfig === 'object'
        ? normalizedRuntimeSettings.hostedToolConfig
        : {}),
      mcp: {
        servers: normalizedServers,
      },
    },
  })
}
function buildSettingsDraftBootstrap(coreSettings = null, openAIMcpServers = []) {
  const sourceSettings = coreSettings && typeof coreSettings === 'object'
    ? coreSettings
    : readInitialSettingsPanelDrafts()
  return {
    systemPromptAppendix: String(sourceSettings?.systemPromptAppendix ?? ''),
    moaRoles: Array.isArray(sourceSettings?.moaRoles) ? sourceSettings.moaRoles : [],
    agentSettings: normalizeAgentSettings(sourceSettings?.agentSettings),
    uiScalingSettings: normalizeUiScalingSettings(
      sourceSettings?.uiScalingSettings || sourceSettings?.uiScaling || DEFAULT_UI_SCALING_SETTINGS,
    ),
    backgroundToneSettings: normalizeBackgroundToneSettings(
      sourceSettings?.backgroundToneSettings || sourceSettings?.backgroundTone || DEFAULT_BACKGROUND_TONE_SETTINGS,
    ),
    chatTypographySettings: normalizeChatTypographySettings(
      sourceSettings?.chatTypographySettings || sourceSettings?.chatTypography || DEFAULT_CHAT_TYPOGRAPHY_SETTINGS,
    ),
    anthropicRuntimeSettings: normalizeAnthropicRuntimeSettingsForUi(
      sourceSettings?.anthropicRuntimeSettings || sourceSettings?.providerRuntimeSettings?.anthropic || DEFAULT_ANTHROPIC_RUNTIME_SETTINGS,
    ),
    openaiRuntimeSettings: mergeOpenAIMcpServersIntoRuntimeSettings(
      sourceSettings?.openaiRuntimeSettings || sourceSettings?.providerRuntimeSettings?.openai || DEFAULT_OPENAI_RUNTIME_SETTINGS,
      openAIMcpServers,
    ),
  }
}

export default function SettingsPanelRoot() {
  const t = useSettingsTranslator(['settings', 'core'])
  const coreSettings = useSettingsStore((s) => s.coreSettings)
  const uiLocale = useSettingsStore((s) => s.uiLocale)
  const roleTemplates = useSettingsStore((s) => s.roleTemplates)
  const openAIMcpServers = useSettingsStore((s) => s.openAIMcpServers)
  const {
    projectFolder,
    permissionMode,
    setPermissionMode,
    modelCatalogVisibility,
    settingsTarget,
    clearSettingsTarget,
    uiScale,
  } = useAppStore(useShallow((s) => ({
    projectFolder: s.projectFolder,
    permissionMode: s.permissionMode,
    setPermissionMode: s.setPermissionMode,
    modelCatalogVisibility: s.modelCatalogVisibility,
    settingsTarget: s.settingsTarget,
    clearSettingsTarget: s.clearSettingsTarget,
    uiScale: s.uiScale,
  })))
  const { providers, loadProviders, setKeyForProvider, setAuthMethodForProvider, deleteKeyForProvider } = useVaultStore(useShallow((s) => ({
    providers: s.providers,
    loadProviders: s.loadProviders,
    setKeyForProvider: s.setKeyForProvider,
    setAuthMethodForProvider: s.setAuthMethodForProvider,
    deleteKeyForProvider: s.deleteKeyForProvider,
  })))
  const {
    activeProjectId,
    activeThreadId,
    exportCurrentThread,
    importThreadPayload,
  } = useWorkspaceStore(useShallow((s) => ({
    activeProjectId: s.activeProjectId,
    activeThreadId: s.activeThreadId,
    exportCurrentThread: s.exportCurrentThread,
    importThreadPayload: s.importThreadPayload,
  })))
  const initialSettingsDrafts = useMemo(() => readInitialSettingsPanelDrafts(), [])
  const settingsDraftsHydratedRef = useRef(!!coreSettings)
  const modelCatalogVisibilityPersistTimerRef = useRef(null)
  const pendingModelCatalogVisibilityRef = useRef(null)
  const syncedOpenAIMcpServersSignatureRef = useRef(JSON.stringify(
    initialSettingsDrafts?.openaiRuntimeSettings?.hostedToolConfig?.mcp?.servers || [],
  ))
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const [systemPromptAppendix, setSystemPromptAppendix] = useState(initialSettingsDrafts.systemPromptAppendix)
  const [moaRoles, setMoaRoles] = useState(initialSettingsDrafts.moaRoles)
  const [agentSettings, setAgentSettings] = useState(() => normalizeAgentSettings(initialSettingsDrafts.agentSettings))
  const [uiScalingSettings, setUiScalingSettings] = useState(
    () => normalizeUiScalingSettings(initialSettingsDrafts.uiScalingSettings || DEFAULT_UI_SCALING_SETTINGS),
  )
  const [backgroundToneSettings, setBackgroundToneSettings] = useState(
    () => normalizeBackgroundToneSettings(
      initialSettingsDrafts.backgroundToneSettings || DEFAULT_BACKGROUND_TONE_SETTINGS,
    ),
  )
  const complianceMode = useMemo(
    () => normalizeComplianceMode(
      coreSettings?.complianceMode ?? initialSettingsDrafts.complianceMode,
      COMPLIANCE_MODE_WARN_ONLY,
    ),
    [coreSettings?.complianceMode, initialSettingsDrafts.complianceMode],
  )
  const [anthropicRuntimeSettings, setAnthropicRuntimeSettings] = useState(
    () => normalizeAnthropicRuntimeSettingsForUi(initialSettingsDrafts.anthropicRuntimeSettings || DEFAULT_ANTHROPIC_RUNTIME_SETTINGS),
  )
  const [openaiRuntimeSettings, setOpenAIRuntimeSettings] = useState(
    () => normalizeOpenAIRuntimeSettingsForUi(initialSettingsDrafts.openaiRuntimeSettings || DEFAULT_OPENAI_RUNTIME_SETTINGS),
  )
  const [chatTypographySettings, setChatTypographySettings] = useState(
    () => normalizeChatTypographySettings(initialSettingsDrafts.chatTypographySettings || DEFAULT_CHAT_TYPOGRAPHY_SETTINGS),
  )
  const [updateStatus, setUpdateStatus] = useState(null)
  const [updateInfo, setUpdateInfo] = useState(null)
  const [updatePct, setUpdatePct] = useState(0)
  const [permissionModeChangePending, setPermissionModeChangePending] = useState(false)
  const [activeCategoryId, setActiveCategoryId] = useState(readSettingsPanelActiveCategoryId)
  const backgroundToneRestartAlertShownRef = useRef(false)
  const commandSafety = useMemo(
    () => normalizeCommandSafetyForUi(coreSettings?.commandSafety),
    [coreSettings?.commandSafety],
  )
  const openAIMcpServersSignature = useMemo(
    () => JSON.stringify(Array.isArray(openAIMcpServers) ? openAIMcpServers : []),
    [openAIMcpServers],
  )
  useEffect(() => {
    if (!coreSettings || settingsDraftsHydratedRef.current) return
    settingsDraftsHydratedRef.current = true
    syncedOpenAIMcpServersSignatureRef.current = openAIMcpServersSignature
    const nextDrafts = buildSettingsDraftBootstrap(coreSettings, openAIMcpServers)
    startTransition(() => {
      setSystemPromptAppendix(nextDrafts.systemPromptAppendix)
      setMoaRoles(nextDrafts.moaRoles)
      setAgentSettings(nextDrafts.agentSettings)
      setUiScalingSettings(nextDrafts.uiScalingSettings)
      setBackgroundToneSettings(nextDrafts.backgroundToneSettings)
      setChatTypographySettings(nextDrafts.chatTypographySettings)
      setAnthropicRuntimeSettings(nextDrafts.anthropicRuntimeSettings)
      setOpenAIRuntimeSettings(nextDrafts.openaiRuntimeSettings)
    })
  }, [coreSettings, openAIMcpServers, openAIMcpServersSignature])
  useEffect(() => {
    if (!settingsDraftsHydratedRef.current) return
    if (syncedOpenAIMcpServersSignatureRef.current === openAIMcpServersSignature) return
    syncedOpenAIMcpServersSignatureRef.current = openAIMcpServersSignature
    startTransition(() => {
      setOpenAIRuntimeSettings((prev) => mergeOpenAIMcpServersIntoRuntimeSettings(prev, openAIMcpServers))
    })
  }, [openAIMcpServers, openAIMcpServersSignature])
  const selectActiveCategory = useCallback((categoryId) => {
    const normalizedCategoryId = String(categoryId || '').trim()
    if (!normalizedCategoryId) return
    startTransition(() => {
      setActiveCategoryId(normalizedCategoryId)
    })
    writeSettingsPanelActiveCategoryId(normalizedCategoryId)
  }, [])
  useEffect(() => {
    const unsubs = [
      window.addom.updater.onChecking(() => { setUpdateStatus('checking'); setUpdateInfo(null) }),
      window.addom.updater.onAvailable((data) => { setUpdateStatus('available'); setUpdateInfo(data) }),
      window.addom.updater.onNotAvailable(() => { setUpdateStatus('not-available'); setUpdateInfo(null) }),
      window.addom.updater.onProgress((data) => { setUpdateStatus('downloading'); setUpdatePct(data.percent) }),
      window.addom.updater.onDownloaded((data) => { setUpdateStatus('downloaded'); setUpdateInfo(data) }),
      window.addom.updater.onError((data) => { setUpdateStatus('error'); setUpdateInfo(data) }),
    ]
    return () => unsubs.forEach((unsubscribe) => unsubscribe())
  }, [])
  const handleCheckUpdate = useCallback(async () => {
    setUpdateStatus('checking')
    setUpdateInfo(null)
    const result = await window.addom.updater.checkForUpdates()
    const fallbackStatus = resolveUpdateCheckFallbackStatus(result)
    if (fallbackStatus) {
      setUpdateStatus(fallbackStatus)
      setUpdateInfo(resolveUpdateCheckFallbackInfo(result))
    }
  }, [])
  const handleDownloadUpdate = useCallback(async () => {
    setUpdateStatus('downloading')
    setUpdatePct(0)
    await window.addom.updater.downloadUpdate()
  }, [])
  const handleInstallUpdate = useCallback(() => {
    window.addom.updater.installUpdate()
  }, [])
  const handlePermissionModeChange = useCallback(async (nextMode) => {
    if (permissionModeChangePending) return
    const normalizedMode = normalizePermissionMode(nextMode)
    if (normalizedMode === permissionMode) return

    setPermissionModeChangePending(true)
    try {
      const result = await savePermissionModeSelection({
        nextMode: normalizedMode,
        currentPermissionMode: permissionMode,
        settingsApi: window?.addom?.settings ?? null,
      })
      setPermissionMode(result.permissionMode)
      if (result.status === 'failed') {
        await requestAppAlert({
          title: t('settings:alerts.executionModeSaveFailed.title', { defaultValue: 'Execution Mode Save Failed' }),
          message: t('settings:alerts.executionModeSaveFailed.message', {
            defaultValue: 'ADDOM could not persist the selected permission mode. The UI was reset to the last saved value.',
          }),
          tone: 'danger',
        })
      }
    } finally {
      setPermissionModeChangePending(false)
    }
  }, [permissionMode, permissionModeChangePending, setPermissionMode, t])
  const handleSaveSystemPromptAppendix = useCallback((nextValue) => {
    const normalized = String(nextValue ?? '')
    setSystemPromptAppendix(normalized)
    window.addom.settings.set({ systemPromptAppendix: normalized }).catch(() => { })
  }, [])
  const showSettingsAlert = useCallback((title, message, tone = 'neutral') => (
      requestAppAlert({ title, message, tone })
  ), [])
  const {
    appearanceSettings,
    resolvedAppearance,
    handleAppearanceModeChange,
  } = useAppearanceSettingsController({
    coreSettings,
    initialAppearanceSettings: initialSettingsDrafts.appearanceSettings,
    showSettingsAlert,
    t,
  })
  const handleUiLocaleChange = useCallback((nextUiLocale) => {
    const normalized = normalizeUiLocale(nextUiLocale, DEFAULT_UI_LOCALE)
    if (normalized === normalizeUiLocale(uiLocale, DEFAULT_UI_LOCALE)) return
    const previousSettings = coreSettings && typeof coreSettings === 'object' ? coreSettings : null
    if (previousSettings) {
      useSettingsStore.getState().cacheCoreSettings({
        ...previousSettings,
        uiLocale: normalized,
      })
    }

    window.addom.settings.set({ uiLocale: normalized })
      .then((persistedSettings) => {
        if (persistedSettings && typeof persistedSettings === 'object') {
          useSettingsStore.getState().cacheCoreSettings(persistedSettings)
        }
      })
      .catch(() => {
        if (previousSettings) {
          useSettingsStore.getState().cacheCoreSettings(previousSettings)
        }
        void showSettingsAlert(
          t('settings:alerts.languageSaveFailed.title', { defaultValue: 'Language Save Failed' }),
          t('settings:alerts.languageSaveFailed.message', {
            defaultValue: 'ADDOM could not persist the selected app language.',
          }),
          'danger',
        )
      })
  }, [coreSettings, showSettingsAlert, t, uiLocale])
  const {
    openAIProjectAssets,
    openAIAssetsBusy,
    handleRefreshOpenAIProjectAssets,
    handleEnsureOpenAIProjectVectorStore,
    handleUploadOpenAIFiles,
    handleAttachOpenAIProjectFiles,
    handleRemoveOpenAIProjectAsset,
    handleDeleteOpenAIProjectVectorStore,
  } = useSettingsOpenAIAssetsMcp({
    activeProjectId,
    showSettingsAlert,
    requestAppConfirm,
  })
  const {
    exportPreflightOpen,
    exportPreflightBusy,
    exportPreserveCitations,
    exportStrictConfirmed,
    importThreadModalOpen,
    importThreadBusy,
    importThreadJson,
    localDataSummary,
    providerBudgetSummary,
    toolResultSpilloverSummary,
    localDataActionBusy,
    setExportPreserveCitations,
    setExportStrictConfirmed,
    setImportThreadJson,
    handleDeleteApiKeysNow,
    handleResetLocalDataAndRestart,
    handleRefreshProviderBudgetSummary,
    handleCleanupProviderBudgetProfiles,
    handleResetProviderBudgetProfiles,
    handleRefreshToolResultSpilloverSummary,
    handleCleanupToolResultSpillover,
    handleResetToolResultSpillover,
    handleExportCurrentThread,
    handleCancelExportPreflight,
    handleConfirmExportPreflight,
    handleOpenImportThreadModal,
    handleCancelImportThreadModal,
    handleConfirmImportThreadModal,
  } = useSettingsPanelDataManagement({
    activeProjectId,
    activeThreadId,
    complianceMode,
    exportCurrentThread,
    importThreadPayload,
    loadProviders,
    requestAppConfirm,
    showSettingsAlert,
  })
  const handleOpenAIRuntimeSettingsChange = useCallback((nextSettings) => {
    const normalized = normalizeOpenAIRuntimeSettingsForUi(nextSettings)
    setOpenAIRuntimeSettings(normalized)
    window.addom.settings.setProviderRuntimeSettings('openai', normalized).catch(() => { })
  }, [])
  const handleAnthropicRuntimeSettingsChange = useCallback((nextSettings) => {
    const normalized = normalizeAnthropicRuntimeSettingsForUi(nextSettings)
    setAnthropicRuntimeSettings(normalized)
    window.addom.settings.setProviderRuntimeSettings('anthropic', normalized).catch(() => { })
  }, [])
  const flushPendingModelCatalogVisibilityPersist = useCallback(() => {
    const pending = pendingModelCatalogVisibilityRef.current
    if (!pending) return
    pendingModelCatalogVisibilityRef.current = null
    if (modelCatalogVisibilityPersistTimerRef.current) {
      window.clearTimeout(modelCatalogVisibilityPersistTimerRef.current)
      modelCatalogVisibilityPersistTimerRef.current = null
    }
    window.addom.settings.set({
      modelCatalogVisibility: pending,
    }).catch(() => { })
  }, [])
  useEffect(() => () => {
    flushPendingModelCatalogVisibilityPersist()
  }, [flushPendingModelCatalogVisibilityPersist])
  const handleModelCatalogVisibilityChange = useCallback((nextVisibility) => {
    const normalized = normalizeModelCatalogVisibility(nextVisibility)
    pendingModelCatalogVisibilityRef.current = normalized
    if (modelCatalogVisibilityPersistTimerRef.current) {
      window.clearTimeout(modelCatalogVisibilityPersistTimerRef.current)
    }
    modelCatalogVisibilityPersistTimerRef.current = window.setTimeout(() => {
      modelCatalogVisibilityPersistTimerRef.current = null
      flushPendingModelCatalogVisibilityPersist()
    }, 240)
  }, [flushPendingModelCatalogVisibilityPersist])
  const persistUiScalingSettings = useCallback((nextSettings) => {
    const normalized = normalizeUiScalingSettings(nextSettings)
    setUiScalingSettings(normalized)
    applyUiScalingSettings(normalized)
    window.addom.settings.set({
      uiScaling: normalized,
    })
      .then((persistedSettings) => {
        const persistedUiScaling = normalizeUiScalingSettings(
          persistedSettings?.uiScaling,
          DEFAULT_UI_SCALING_SETTINGS,
        )
        const missingUiScaling = (
          !persistedSettings
          || typeof persistedSettings !== 'object'
          || !Object.prototype.hasOwnProperty.call(persistedSettings, 'uiScaling')
        )
        if (
          missingUiScaling
          || persistedUiScaling.mode !== normalized.mode
          || persistedUiScaling.scale !== normalized.scale
        ) {
          void showSettingsAlert(
            t('settings:alerts.restartRequired.title', { defaultValue: 'Restart Required' }),
            t('settings:alerts.restartRequired.message', {
              defaultValue: 'The running ADDOM main process did not acknowledge the new UI scaling settings. Restart the app so the main process reloads the updated settings handlers.',
            }),
            'warning',
          )
        }
      })
      .catch(() => {
        void showSettingsAlert(
          t('settings:alerts.uiScalingSaveFailed.title', { defaultValue: 'UI Scaling Save Failed' }),
          t('settings:alerts.uiScalingSaveFailed.message', {
            defaultValue: 'ADDOM could not persist the selected UI scaling settings.',
          }),
          'danger',
        )
      })
  }, [showSettingsAlert, t])
  const handleUiScalingModeChange = useCallback((nextMode) => {
    persistUiScalingSettings({
      ...uiScalingSettings,
      mode: nextMode,
    })
  }, [persistUiScalingSettings, uiScalingSettings])
  const handleUiScalingScaleChange = useCallback((nextScale) => {
    persistUiScalingSettings({
      ...uiScalingSettings,
      scale: nextScale,
    })
  }, [persistUiScalingSettings, uiScalingSettings])
  const handleResetUiScaling = useCallback(() => {
    persistUiScalingSettings(DEFAULT_UI_SCALING_SETTINGS)
  }, [persistUiScalingSettings])
  const persistBackgroundToneSettings = useCallback((nextSettings) => {
    const normalized = normalizeBackgroundToneSettings(nextSettings)
    const previousSettings = coreSettings && typeof coreSettings === 'object' ? coreSettings : null
    const previousTone = normalizeBackgroundToneSettings(
      previousSettings?.backgroundTone || backgroundToneSettings,
      DEFAULT_BACKGROUND_TONE_SETTINGS,
    )

    setBackgroundToneSettings(normalized)
    applyBackgroundToneSettings(normalized)
    if (previousSettings) {
      useSettingsStore.getState().cacheCoreSettings({
        ...previousSettings,
        backgroundTone: normalized,
      })
    }

    const showBackgroundToneRestartAlert = () => {
      if (backgroundToneRestartAlertShownRef.current) return
      backgroundToneRestartAlertShownRef.current = true
      void showSettingsAlert(
        t('settings:alerts.restartRequired.title', { defaultValue: 'Restart Required' }),
        t('settings:alerts.backgroundToneRestartRequired.message', {
          defaultValue: 'The running ADDOM main process did not acknowledge the new background tone. Restart the app so the main process reloads the updated settings handlers.',
        }),
        'warning',
      )
    }

    const settingsApi = window?.addom?.settings
    if (!settingsApi || typeof settingsApi.set !== 'function') {
      showBackgroundToneRestartAlert()
      return
    }

    settingsApi.set({
      backgroundTone: normalized,
    })
      .then((persistedSettings) => {
        if (persistedSettings && typeof persistedSettings === 'object') {
          useSettingsStore.getState().cacheCoreSettings(persistedSettings)
        }
        const persistedBackgroundTone = normalizeBackgroundToneSettings(
          persistedSettings?.backgroundTone,
          DEFAULT_BACKGROUND_TONE_SETTINGS,
        )
        const missingBackgroundTone = (
          !persistedSettings
          || typeof persistedSettings !== 'object'
          || !Object.prototype.hasOwnProperty.call(persistedSettings, 'backgroundTone')
        )
        if (missingBackgroundTone || persistedBackgroundTone.tone !== normalized.tone) {
          showBackgroundToneRestartAlert()
        }
      })
      .catch((error) => {
        if (isStaleSettingsPersistError(error, 'backgroundTone')) {
          // Keep optimistic local tone + cached draft; main just needs a restart.
          showBackgroundToneRestartAlert()
          return
        }
        setBackgroundToneSettings(previousTone)
        applyBackgroundToneSettings(previousTone)
        if (previousSettings) {
          useSettingsStore.getState().cacheCoreSettings(previousSettings)
        }
        void showSettingsAlert(
          t('settings:alerts.backgroundToneSaveFailed.title', { defaultValue: 'Background Tone Save Failed' }),
          t('settings:alerts.backgroundToneSaveFailed.message', {
            defaultValue: 'ADDOM could not persist the selected background tone.',
          }),
          'danger',
        )
      })
  }, [backgroundToneSettings, coreSettings, showSettingsAlert, t])
  const handleBackgroundToneChange = useCallback((nextSettings) => {
    persistBackgroundToneSettings(nextSettings)
  }, [persistBackgroundToneSettings])
  const persistChatTypographySettings = useCallback((nextSettings) => {
    const normalized = normalizeChatTypographySettings(nextSettings)
    setChatTypographySettings(normalized)
    window.addom.settings.set({
      chatTypography: normalized,
    }).catch(() => { })
  }, [])
  const handleChatTypographyScaleChange = useCallback((nextScale) => {
    persistChatTypographySettings({
      ...chatTypographySettings,
      scale: nextScale,
    })
  }, [chatTypographySettings, persistChatTypographySettings])
  const handleResetChatTypographyScale = useCallback(() => {
    persistChatTypographySettings(DEFAULT_CHAT_TYPOGRAPHY_SETTINGS)
  }, [persistChatTypographySettings])
  const terminalSettings = useMemo(
    () => normalizeTerminalSettings(coreSettings?.terminal, DEFAULT_TERMINAL_SETTINGS),
    [coreSettings?.terminal],
  )
  const handleTerminalSettingsChange = useCallback((nextPatch = {}) => {
    const source = nextPatch && typeof nextPatch === 'object' ? nextPatch : {}
    window.addom.settings.set({
      terminal: source,
    }).catch(() => { })
  }, [])
  const categories = useMemo(() => buildSettingsCategories({
    t,
    openaiRuntimeSettings,
  }), [
    t,
    openaiRuntimeSettings,
  ])
  const categoriesById = useMemo(
    () => Object.fromEntries(categories.map((category) => [category.id, category])),
    [categories],
  )

  useEffect(() => {
    const target = settingsTarget && typeof settingsTarget === 'object' ? settingsTarget : null
    const categoryId = String(target?.categoryId || '').trim()
    const sectionId = String(target?.sectionId || '').trim()
    if (!categoryId || !sectionId) return

    const resolvedCategoryId = categoriesById[categoryId]
      ? categoryId
      : (categoriesById[activeCategoryId] ? activeCategoryId : categories[0]?.id)
    if (categoriesById[categoryId]) {
      selectActiveCategory(categoryId)
    }
    if (resolvedCategoryId) {
      const targetId = `${resolvedCategoryId}:${sectionId}`
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          document.getElementById(targetId)?.scrollIntoView({ block: 'start' })
        })
      })
    }
    clearSettingsTarget()
  }, [
    settingsTarget,
    categoriesById,
    activeCategoryId,
    categories,
    clearSettingsTarget,
    selectActiveCategory,
  ])

  const activeCategory = useMemo(
    () => categoriesById[activeCategoryId] || categories[0] || null,
    [activeCategoryId, categoriesById, categories],
  )
  const handleSelectCategory = useCallback((categoryId) => {
    selectActiveCategory(categoryId)
  }, [selectActiveCategory])
  const appVersion = window.addom._version
  const activeSections = useMemo(() => buildActiveSettingsSections({
    t,
    activeCategoryId: activeCategory?.id,
    setInstructionsOpen,
    projectFolder,
    uiLocale,
    handleUiLocaleChange,
    systemPromptAppendix,
    handleSaveSystemPromptAppendix,
    updateStatus,
    updateInfo,
    updatePct,
    handleCheckUpdate,
    handleDownloadUpdate,
    handleInstallUpdate,
    appVersion,
    uiScale,
    uiScalingSettings,
    handleUiScalingModeChange,
    handleUiScalingScaleChange,
    handleResetUiScaling,
    appearanceSettings,
    resolvedAppearance,
    handleAppearanceModeChange,
    backgroundToneSettings,
    handleBackgroundToneChange,
    terminalSettings,
    handleTerminalSettingsChange,
    chatTypographySettings,
    handleChatTypographyScaleChange,
    handleResetChatTypographyScale,
    providers,
    setKeyForProvider,
    setAuthMethodForProvider,
    deleteKeyForProvider,
    openaiProjectAssets: openAIProjectAssets,
    openaiAssetsBusy: openAIAssetsBusy,
    modelCatalogVisibility,
    handleRefreshOpenAIProjectAssets,
    handleEnsureOpenAIProjectVectorStore,
    handleUploadOpenAIFiles,
    handleAttachOpenAIProjectFiles,
    handleRemoveOpenAIProjectAsset,
    handleDeleteOpenAIProjectVectorStore,
    handleModelCatalogVisibilityChange,
    permissionMode,
    permissionModeChangePending,
    handlePermissionModeChange,
    commandSafety,
    anthropicRuntimeSettings,
    handleAnthropicRuntimeSettingsChange,
    openaiRuntimeSettings,
    handleOpenAIRuntimeSettingsChange,
    moaRoles,
    setMoaRoles,
    agentSettings,
    setAgentSettings,
    roleTemplates,
    activeProjectId,
    activeThreadId,
    localDataSummary,
    providerBudgetSummary,
    toolResultSpilloverSummary,
    localDataActionBusy,
    handleExportCurrentThread,
    handleImportThread: handleOpenImportThreadModal,
    handleRefreshProviderBudgetSummary,
    handleCleanupProviderBudgetProfiles,
    handleResetProviderBudgetProfiles,
    handleRefreshToolResultSpilloverSummary,
    handleCleanupToolResultSpillover,
    handleResetToolResultSpillover,
    handleDeleteApiKeysNow,
    handleResetLocalDataAndRestart,
  }), [
    t,
    activeCategory?.id, setInstructionsOpen,
    projectFolder, uiLocale, handleUiLocaleChange, systemPromptAppendix, handleSaveSystemPromptAppendix,
    updateStatus, updateInfo, updatePct, handleCheckUpdate, handleDownloadUpdate, handleInstallUpdate, appVersion,
    uiScale, uiScalingSettings, handleUiScalingModeChange, handleUiScalingScaleChange, handleResetUiScaling,
    appearanceSettings, resolvedAppearance, handleAppearanceModeChange,
    backgroundToneSettings, handleBackgroundToneChange,
    terminalSettings, handleTerminalSettingsChange,
    chatTypographySettings, handleChatTypographyScaleChange, handleResetChatTypographyScale,
    providers, setKeyForProvider, setAuthMethodForProvider, deleteKeyForProvider, openAIProjectAssets, openAIAssetsBusy, modelCatalogVisibility, handleRefreshOpenAIProjectAssets,
    handleEnsureOpenAIProjectVectorStore, handleUploadOpenAIFiles, handleAttachOpenAIProjectFiles, handleRemoveOpenAIProjectAsset,
    handleDeleteOpenAIProjectVectorStore, handleModelCatalogVisibilityChange,
    permissionMode, permissionModeChangePending, handlePermissionModeChange, commandSafety,
    anthropicRuntimeSettings, handleAnthropicRuntimeSettingsChange,
    openaiRuntimeSettings, handleOpenAIRuntimeSettingsChange,
    moaRoles, setMoaRoles, agentSettings, setAgentSettings,
    roleTemplates, activeProjectId, activeThreadId, localDataSummary, providerBudgetSummary, toolResultSpilloverSummary, localDataActionBusy,
    handleExportCurrentThread, handleOpenImportThreadModal,
    handleRefreshProviderBudgetSummary, handleCleanupProviderBudgetProfiles, handleResetProviderBudgetProfiles,
    handleRefreshToolResultSpilloverSummary, handleCleanupToolResultSpillover, handleResetToolResultSpillover,
    handleDeleteApiKeysNow, handleResetLocalDataAndRestart,
  ])
  const navGroups = useMemo(() => localizeSettingsNavGroups(t, SETTINGS_NAV_GROUPS), [t])

  return (
    <div className="flex flex-col h-full min-h-0" data-ui="settings-shell">
      <div className="flex min-h-[52px] shrink-0 items-center border-b border-surface-border/60 px-4">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
          <Icon name="gear-six" className="text-[15px] text-text-muted" />
          {t('core:settings.title', { defaultValue: 'Settings' })}
        </h2>
      </div>

      <SettingsPanelContent
        groups={navGroups}
        categoriesById={categoriesById}
        activeCategory={activeCategory}
        activeSections={activeSections}
        onSelectCategory={handleSelectCategory}
      />

      {instructionsOpen && (
        <SettingsInstructionsModal onClose={() => setInstructionsOpen(false)} />
      )}
      <SettingsExportPreflightModal
        open={exportPreflightOpen}
        busy={exportPreflightBusy}
        complianceMode={complianceMode}
        preserveCitations={exportPreserveCitations}
        strictConfirmed={exportStrictConfirmed}
        onTogglePreserveCitations={setExportPreserveCitations}
        onStrictConfirmedChange={setExportStrictConfirmed}
        onCancel={handleCancelExportPreflight}
        onConfirm={handleConfirmExportPreflight}
      />
      <SettingsImportThreadModal
        open={importThreadModalOpen}
        busy={importThreadBusy}
        importJson={importThreadJson}
        onImportJsonChange={setImportThreadJson}
        onCancel={handleCancelImportThreadModal}
        onConfirm={handleConfirmImportThreadModal}
      />
    </div>
  )
}
