import React from 'react'
import useVaultStore from '../../store/useVaultStore.js'
import {
  normalizeAnthropicProviderRuntimeSettings,
  normalizeOpenAIProviderRuntimeSettings,
} from '../../../main/api-clients/openai-runtime-types.mjs'
import { resolveProviderModelAdapter } from '../../../main/api-clients/provider-model-adapters.mjs'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import ChatComposerControlRailView from './ChatComposerControlRailView.jsx'
import {
  ANTHROPIC_REASONING_EFFORT_OPTIONS,
  RAIL_INLINE_GAP_PX,
  formatAnthropicThinkingLabel,
  formatCollaborationModeLabel,
  formatEffortLabel,
} from './chat-composer-control-rail-helpers.jsx'
function ChatComposerControlRail({
  providers = [],
  loaded = false,
  refreshing = false,
  selectedProvider = '',
  selectedModel = '',
  modelCatalogVisibility = null,
  activeThreadId = '',
  activeThreadIsEmpty = false,
  activeThreadContextFallbackMode = 'none',
  hasConversation = false,
  onComplianceNotice = () => { },
  onProviderChange = () => { },
  onModelChange = () => { },
  onRefreshProviders = () => { },
  contextUsage = null,
  agentQuickActionsEnabled = false,
  agentMenuOpen = false,
  disabled = false,
  isStreaming = false,
  canSend = false,
  onAgentMenuOpenChange = () => { },
  onSend = () => { },
  onStop = () => { },
  onOpenJobsModal = () => { },
  commandPaletteEvent = null,
  openAIAccountSessionOverride = undefined,
  overflowOpenOverride = undefined,
  terminalButtonEnabled = false,
  terminalButtonActive = false,
  onToggleTerminalDock = () => {},
}) {
  const { t } = useRendererTranslation(['core'])
  const openAIAccountSessionFromStore = useVaultStore((s) => s.openAIAccountSession)
  const openAIAccountSession = openAIAccountSessionOverride === undefined
    ? openAIAccountSessionFromStore
    : openAIAccountSessionOverride
  const [overflowOpenState, setOverflowOpenState] = React.useState(false)
  const [effortMenuOpen, setEffortMenuOpen] = React.useState(false)
  const [collaborationModeMenuOpen, setCollaborationModeMenuOpen] = React.useState(false)
  const [providerModelOnSecondRow, setProviderModelOnSecondRow] = React.useState(false)
  const [anthropicRuntimeSettings, setAnthropicRuntimeSettings] = React.useState(
    () => normalizeAnthropicProviderRuntimeSettings({}),
  )
  const [openAIRuntimeSettings, setOpenAIRuntimeSettings] = React.useState(
    () => normalizeOpenAIProviderRuntimeSettings({}),
  )
  const railRef = React.useRef(null)
  const meterSlotRef = React.useRef(null)
  const modeSlotRef = React.useRef(null)
  const providerModelSlotRef = React.useRef(null)
  const overflowRef = React.useRef(null)
  const rightClusterRef = React.useRef(null)
  const effortRef = React.useRef(null)
  const collaborationModeRef = React.useRef(null)
  const handledCommandPaletteEventIdRef = React.useRef('')
  const overflowOpen = overflowOpenOverride === undefined
    ? overflowOpenState
    : overflowOpenOverride
  const openTerminalTitle = t(`core:chat.controlRail.${terminalButtonActive ? 'hideTerminal' : 'showTerminal'}`, {
    defaultValue: terminalButtonActive ? 'Hide terminal' : 'Show terminal',
  })
  const setOverflowOpen = React.useCallback((valueOrUpdater) => {
    if (overflowOpenOverride !== undefined) return
    setOverflowOpenState((prev) => (
      typeof valueOrUpdater === 'function'
        ? valueOrUpdater(prev)
        : valueOrUpdater
    ))
  }, [overflowOpenOverride])

  const recomputeProviderModelRow = React.useCallback(() => {
    const railNode = railRef.current
    if (!railNode) return
    const railWidth = railNode.getBoundingClientRect().width
    if (!Number.isFinite(railWidth) || railWidth <= 0) return

    const meterWidth = meterSlotRef.current?.getBoundingClientRect?.().width || 0
    const modeWidth = modeSlotRef.current?.getBoundingClientRect?.().width || 0
    const actionsWidth = rightClusterRef.current?.getBoundingClientRect?.().width || 0
    const providerModelWidth = providerModelSlotRef.current
      ?.querySelector?.('[data-ui="provider-model-selector"]')
      ?.getBoundingClientRect?.().width || 0
    const requiredInlineWidth = (
      meterWidth
      + modeWidth
      + actionsWidth
      + providerModelWidth
      + (RAIL_INLINE_GAP_PX * 3)
    )
    const shouldUseSecondRow = railWidth < requiredInlineWidth
    setProviderModelOnSecondRow((prev) => (prev === shouldUseSecondRow ? prev : shouldUseSecondRow))
  }, [])

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const railNode = railRef.current
    if (!railNode) return undefined
    const meterNode = meterSlotRef.current
    const modeNode = modeSlotRef.current
    const actionsNode = rightClusterRef.current
    const providerModelNode = providerModelSlotRef.current?.querySelector?.('[data-ui="provider-model-selector"]')

    let rafId = 0
    const scheduleRecompute = () => {
      if (rafId) window.cancelAnimationFrame(rafId)
      rafId = window.requestAnimationFrame(() => {
        recomputeProviderModelRow()
      })
    }

    scheduleRecompute()
    let observer = null
    if (typeof window.ResizeObserver === 'function') {
      observer = new window.ResizeObserver(() => {
        scheduleRecompute()
      })
      observer.observe(railNode)
      if (meterNode) observer.observe(meterNode)
      if (modeNode) observer.observe(modeNode)
      if (actionsNode) observer.observe(actionsNode)
      if (providerModelNode) observer.observe(providerModelNode)
    }
    window.addEventListener('resize', scheduleRecompute)
    return () => {
      window.removeEventListener('resize', scheduleRecompute)
      if (rafId) window.cancelAnimationFrame(rafId)
      observer?.disconnect?.()
    }
  }, [recomputeProviderModelRow])

  React.useEffect(() => {
    const settingsApi = typeof window !== 'undefined' ? window?.addom?.settings : null
    if (!settingsApi || typeof settingsApi.get !== 'function') {
      setAnthropicRuntimeSettings(normalizeAnthropicProviderRuntimeSettings({}))
      setOpenAIRuntimeSettings(normalizeOpenAIProviderRuntimeSettings({}))
      return undefined
    }
    let active = true
    settingsApi.get()
      .then((settings) => {
        if (!active) return
        setAnthropicRuntimeSettings(
          normalizeAnthropicProviderRuntimeSettings(settings?.providerRuntimeSettings?.anthropic || {}),
        )
        setOpenAIRuntimeSettings(
          normalizeOpenAIProviderRuntimeSettings(settings?.providerRuntimeSettings?.openai || {}),
        )
      })
      .catch(() => {
        if (!active) return
        setAnthropicRuntimeSettings(normalizeAnthropicProviderRuntimeSettings({}))
        setOpenAIRuntimeSettings(normalizeOpenAIProviderRuntimeSettings({}))
      })
    return () => {
      active = false
    }
  }, [])

  React.useEffect(() => {
    if (!overflowOpen) return undefined
    const onPointerDown = (event) => {
      if (!overflowRef.current?.contains(event.target)) {
        setOverflowOpen(false)
      }
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOverflowOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [overflowOpen, setOverflowOpen])

  React.useEffect(() => {
    if (!effortMenuOpen) return undefined
    const onPointerDown = (event) => {
      if (!effortRef.current?.contains(event.target)) {
        setEffortMenuOpen(false)
      }
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setEffortMenuOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [effortMenuOpen])

  React.useEffect(() => {
    if (!collaborationModeMenuOpen) return undefined
    const onPointerDown = (event) => {
      if (!collaborationModeRef.current?.contains(event.target)) {
        setCollaborationModeMenuOpen(false)
      }
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setCollaborationModeMenuOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [collaborationModeMenuOpen])

  React.useEffect(() => {
    const event = commandPaletteEvent
    const eventId = String(event?.id || '').trim()
    if (!eventId) return
    if (handledCommandPaletteEventIdRef.current === eventId) return

    const type = String(event?.type || '').trim()
    if (!type) return
    if (type !== 'chat.openBackgroundJobs' && type !== 'chat.openDirectAgents') {
      return
    }

    handledCommandPaletteEventIdRef.current = eventId

    if (type === 'chat.openBackgroundJobs') {
      setOverflowOpen(false)
      onOpenJobsModal?.()
      return
    }

    if (type === 'chat.openDirectAgents' && agentQuickActionsEnabled && !isStreaming) {
      setOverflowOpen(false)
      onAgentMenuOpenChange(true)
    }
  }, [
    agentQuickActionsEnabled,
    commandPaletteEvent,
    isStreaming,
    onAgentMenuOpenChange,
    onOpenJobsModal,
    setOverflowOpen,
  ])

  const normalizedProvider = String(selectedProvider || '').trim().toLowerCase()
  const selectedProviderRow = React.useMemo(
    () => (Array.isArray(providers)
      ? providers.find((provider) => String(provider?.id || '').trim().toLowerCase() === normalizedProvider) || null
      : null),
    [normalizedProvider, providers],
  )
  const selectedProviderAuthMethod = String(selectedProviderRow?.authMethod || '').trim().toLowerCase()
  const selectedAnthropicModel = React.useMemo(() => {
    if (normalizedProvider === 'anthropic') {
      const direct = String(selectedModel || '').trim()
      if (direct) return direct
    }
    const anthropicProvider = Array.isArray(providers)
      ? providers.find((provider) => String(provider?.id || '').trim().toLowerCase() === 'anthropic')
      : null
    return String(anthropicProvider?.defaultModel || '').trim()
  }, [normalizedProvider, providers, selectedModel])
  const selectedOpenAIModel = React.useMemo(() => {
    if (normalizedProvider === 'openai') {
      const direct = String(selectedModel || '').trim()
      if (direct) return direct
    }
    const openAIProvider = Array.isArray(providers)
      ? providers.find((provider) => String(provider?.id || '').trim().toLowerCase() === 'openai')
      : null
    return String(openAIProvider?.defaultModel || '').trim()
  }, [normalizedProvider, providers, selectedModel])
  const openAIModelSupport = React.useMemo(
    () => resolveProviderModelAdapter('openai', selectedOpenAIModel, {
      authMethod: selectedProviderAuthMethod,
    }).openaiRuntimeSupport,
    [selectedOpenAIModel, selectedProviderAuthMethod],
  )
  const showOpenAIAccountRateLimits = (
    normalizedProvider === 'openai'
    && selectedProviderAuthMethod === 'account'
    && openAIAccountSession?.hasSession === true
  )
  const openAIAccountCollaborationModes = React.useMemo(
    () => (Array.isArray(openAIAccountSession?.collaborationModes)
      ? openAIAccountSession.collaborationModes.filter((entry) => entry && String(entry.id || '').trim())
      : []),
    [openAIAccountSession],
  )
  const openAIEffortOptions = React.useMemo(
    () => (Array.isArray(openAIModelSupport?.reasoningEffortOptions) ? openAIModelSupport.reasoningEffortOptions : []),
    [openAIModelSupport],
  )
  const anthropicModelSupport = React.useMemo(
    () => resolveProviderModelAdapter('anthropic', selectedAnthropicModel),
    [selectedAnthropicModel],
  )
  const anthropicReasoningProviderControls = React.useMemo(
    () => (Array.isArray(anthropicModelSupport?.reasoningProviderControls) ? anthropicModelSupport.reasoningProviderControls : []),
    [anthropicModelSupport],
  )
  const anthropicThinkingControlEnabled = (
    normalizedProvider === 'anthropic'
    && anthropicReasoningProviderControls.includes('anthropic:thinking.type')
  )
  const anthropicEffortOptions = React.useMemo(
    () => (
      anthropicReasoningProviderControls.includes('anthropic:effort')
        ? [...ANTHROPIC_REASONING_EFFORT_OPTIONS]
        : []
    ),
    [anthropicReasoningProviderControls],
  )
  const selectedAnthropicThinkingType = String(
    anthropicRuntimeSettings?.thinkingType,
  ).trim().toLowerCase() || 'disabled'
  const effortOptionsByProvider = React.useMemo(() => (
    normalizedProvider === 'openai'
      ? openAIEffortOptions
      : (normalizedProvider === 'anthropic' ? anthropicEffortOptions : [])
  ), [anthropicEffortOptions, normalizedProvider, openAIEffortOptions])
  const effortControlEnabled = (
    (normalizedProvider === 'openai' || normalizedProvider === 'anthropic')
    && effortOptionsByProvider.length > 0
  )
  const collaborationModeControlEnabled = (
    normalizedProvider === 'openai'
    && selectedProviderAuthMethod === 'account'
    && openAIAccountCollaborationModes.length > 0
  )
  React.useEffect(() => {
    recomputeProviderModelRow()
  }, [recomputeProviderModelRow, selectedProvider, selectedModel, loaded, effortControlEnabled, collaborationModeControlEnabled])
  const selectedEffort = String(
    normalizedProvider === 'anthropic'
      ? anthropicRuntimeSettings?.reasoningEffort
      : openAIRuntimeSettings?.reasoningEffort,
  ).trim().toLowerCase() || 'provider_default'
  const effectiveEffort = effortControlEnabled && (
    selectedEffort === 'provider_default'
    || effortOptionsByProvider.includes(selectedEffort)
  )
    ? selectedEffort
    : 'provider_default'
  const selectedCollaborationModeId = String(openAIRuntimeSettings?.nativeCollaborationModeId || '').trim()
  const effectiveCollaborationModeId = (
    openAIAccountCollaborationModes.some((entry) => String(entry.id || '').trim() === selectedCollaborationModeId)
      ? selectedCollaborationModeId
      : String(openAIAccountSession?.defaultCollaborationModeId || openAIAccountCollaborationModes[0]?.id || '').trim()
  )

  const handleAnthropicThinkingTypeChange = React.useCallback((nextValue) => {
    const normalizedValue = String(nextValue || 'disabled').trim().toLowerCase() || 'disabled'
    const settingsApi = typeof window !== 'undefined' ? window?.addom?.settings : null
    setAnthropicRuntimeSettings((prev) => normalizeAnthropicProviderRuntimeSettings({
      ...(prev && typeof prev === 'object' ? prev : {}),
      thinkingType: normalizedValue,
    }))
    if (settingsApi && typeof settingsApi.setProviderRuntimeSettings === 'function') {
      settingsApi.setProviderRuntimeSettings('anthropic', {
        thinkingType: normalizedValue,
      }).catch(() => { })
    }
  }, [])

  const handleReasoningEffortChange = React.useCallback((event) => {
    const nextValue = String(event?.target?.value || 'provider_default').trim().toLowerCase() || 'provider_default'
    const settingsApi = typeof window !== 'undefined' ? window?.addom?.settings : null
    if (normalizedProvider === 'anthropic') {
      setAnthropicRuntimeSettings((prev) => normalizeAnthropicProviderRuntimeSettings({
        ...(prev && typeof prev === 'object' ? prev : {}),
        reasoningEffort: nextValue,
      }))
      if (settingsApi && typeof settingsApi.setProviderRuntimeSettings === 'function') {
        settingsApi.setProviderRuntimeSettings('anthropic', {
          reasoningEffort: nextValue,
        }).catch(() => { })
      }
      return
    }
    setOpenAIRuntimeSettings((prev) => normalizeOpenAIProviderRuntimeSettings({
      ...(prev && typeof prev === 'object' ? prev : {}),
      reasoningEffort: nextValue,
    }))
    if (settingsApi && typeof settingsApi.setProviderRuntimeSettings === 'function') {
      settingsApi.setProviderRuntimeSettings('openai', {
        reasoningEffort: nextValue,
      }).catch(() => { })
    }
  }, [normalizedProvider])

  const handleCollaborationModeChange = React.useCallback((nextValue) => {
    const normalizedValue = String(nextValue || '').trim()
    setOpenAIRuntimeSettings((prev) => normalizeOpenAIProviderRuntimeSettings({
      ...(prev && typeof prev === 'object' ? prev : {}),
      nativeCollaborationModeId: normalizedValue,
    }))
    const settingsApi = typeof window !== 'undefined' ? window?.addom?.settings : null
    if (settingsApi && typeof settingsApi.setProviderRuntimeSettings === 'function') {
      settingsApi.setProviderRuntimeSettings('openai', {
        nativeCollaborationModeId: normalizedValue,
      }).catch(() => { })
    }
  }, [])

  React.useEffect(() => {
    if (effortControlEnabled) return
    setEffortMenuOpen(false)
  }, [effortControlEnabled, selectedProvider, selectedModel])

  React.useEffect(() => {
    if (collaborationModeControlEnabled) return
    setCollaborationModeMenuOpen(false)
  }, [collaborationModeControlEnabled, selectedProvider, selectedProviderAuthMethod])

  const effortOptions = React.useMemo(() => {
    const options = ['provider_default', ...effortOptionsByProvider]
    return Array.from(new Set(options))
  }, [effortOptionsByProvider])

  const sendDisabled = disabled || !canSend
  const collaborationModeLabel = formatCollaborationModeLabel(
    effectiveCollaborationModeId,
    openAIAccountCollaborationModes,
    t,
  )
  const collaborationModeButtonTitle = t('core:chat.controlRail.collaborationMode.buttonTitle', {
    defaultValue: `Native collaboration mode: ${collaborationModeLabel}`,
    value: collaborationModeLabel,
  })
  const collaborationModeOptionsAriaLabel = t('core:chat.controlRail.collaborationMode.optionsAriaLabel', {
    defaultValue: 'Native collaboration mode options',
  })
  const reasoningEffortLabel = formatEffortLabel(effectiveEffort, t)
  const reasoningEffortButtonTitle = t('core:chat.controlRail.reasoningEffort.buttonTitle', {
    defaultValue: `Reasoning effort: ${reasoningEffortLabel}. Controls how much reasoning the model applies.`,
    value: reasoningEffortLabel,
  })
  const reasoningEffortButtonAriaLabel = t('core:chat.controlRail.reasoningEffort.buttonAriaLabel', {
    defaultValue: `Reasoning effort: ${reasoningEffortLabel}`,
    value: reasoningEffortLabel,
  })
  const reasoningEffortOptionsAriaLabel = t('core:chat.controlRail.reasoningEffort.optionsAriaLabel', {
    defaultValue: 'Reasoning effort options',
  })
  const anthropicThinkingMenuContent = React.useMemo(() => {
    if (!anthropicThinkingControlEnabled) return null
    const enabled = selectedAnthropicThinkingType === 'enabled'
    const label = t('core:chat.controlRail.extendedThinking.title', {
      defaultValue: 'Extended thinking',
    })
    const description = t('core:chat.controlRail.extendedThinking.description', {
      defaultValue: 'Enable only on Anthropic models that support thinking.',
    })
    const toggleLabel = formatAnthropicThinkingLabel(enabled ? 'enabled' : 'disabled', t)
    return (
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${label}: ${toggleLabel}`}
        onClick={() => {
          handleAnthropicThinkingTypeChange(enabled ? 'disabled' : 'enabled')
        }}
        className="group mb-0.5 flex min-h-7 w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-[11px] text-text-secondary transition-colors hover:bg-surface-panel-alt hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent/35"
        data-ui="provider-model-selector-anthropic-thinking"
        title={`${description} ${label}: ${toggleLabel}`}
      >
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        <span className="max-w-0 overflow-hidden truncate text-[10px] text-text-tertiary opacity-0 transition-opacity group-hover:max-w-[40%] group-hover:opacity-100 group-focus-visible:max-w-[40%] group-focus-visible:opacity-100">
          {toggleLabel}
        </span>
        <span
          className={[
            'inline-flex h-4.5 w-8 shrink-0 items-center rounded-full border px-[2px] transition-colors',
            enabled
              ? 'justify-end border-border-hover bg-surface-panel-alt'
              : 'justify-start border-surface-border/80 bg-surface-panel',
          ].join(' ')}
          aria-hidden="true"
        >
          <span className="h-3.5 w-3.5 rounded-full bg-accent-strong shadow-[0_1px_2px_rgb(var(--theme-shadow-rgb)_/_0.18)]" />
        </span>
      </button>
    )
  }, [anthropicThinkingControlEnabled, handleAnthropicThinkingTypeChange, selectedAnthropicThinkingType, t])

  return (
    <ChatComposerControlRailView
      activeThreadId={activeThreadId}
      activeThreadIsEmpty={activeThreadIsEmpty}
      activeThreadContextFallbackMode={activeThreadContextFallbackMode}
      agentMenuOpen={agentMenuOpen}
      agentQuickActionsEnabled={agentQuickActionsEnabled}
      anthropicThinkingMenuContent={anthropicThinkingMenuContent}
      collaborationModeButtonTitle={collaborationModeButtonTitle}
      collaborationModeControlEnabled={collaborationModeControlEnabled}
      collaborationModeLabel={collaborationModeLabel}
      collaborationModeMenuOpen={collaborationModeMenuOpen}
      collaborationModeOptionsAriaLabel={collaborationModeOptionsAriaLabel}
      collaborationModeRef={collaborationModeRef}
      contextUsage={contextUsage}
      effectiveCollaborationModeId={effectiveCollaborationModeId}
      effectiveEffort={effectiveEffort}
      effortControlEnabled={effortControlEnabled}
      effortMenuOpen={effortMenuOpen}
      effortOptions={effortOptions}
      effortRef={effortRef}
      handleCollaborationModeChange={handleCollaborationModeChange}
      handleReasoningEffortChange={handleReasoningEffortChange}
      hasConversation={hasConversation}
      isStreaming={isStreaming}
      loaded={loaded}
      modeSlotRef={modeSlotRef}
      modelCatalogVisibility={modelCatalogVisibility}
      meterSlotRef={meterSlotRef}
      onAgentMenuOpenChange={onAgentMenuOpenChange}
      onComplianceNotice={onComplianceNotice}
      onModelChange={onModelChange}
      onOpenJobsModal={onOpenJobsModal}
      onProviderChange={onProviderChange}
      onRefreshProviders={onRefreshProviders}
      onSend={onSend}
      onStop={onStop}
      onToggleTerminalDock={onToggleTerminalDock}
      openAIAccountCollaborationModes={openAIAccountCollaborationModes}
      openAIAccountSession={openAIAccountSession}
      openTerminalTitle={openTerminalTitle}
      overflowOpen={overflowOpen}
      overflowRef={overflowRef}
      providerModelOnSecondRow={providerModelOnSecondRow}
      providerModelSlotRef={providerModelSlotRef}
      providers={providers}
      railRef={railRef}
      reasoningEffortButtonAriaLabel={reasoningEffortButtonAriaLabel}
      reasoningEffortButtonTitle={reasoningEffortButtonTitle}
      reasoningEffortLabel={reasoningEffortLabel}
      reasoningEffortOptionsAriaLabel={reasoningEffortOptionsAriaLabel}
      refreshing={refreshing}
      rightClusterRef={rightClusterRef}
      selectedModel={selectedModel}
      selectedOpenAIModel={selectedOpenAIModel}
      selectedProvider={selectedProvider}
      selectedProviderRow={selectedProviderRow}
      sendDisabled={sendDisabled}
      setCollaborationModeMenuOpen={setCollaborationModeMenuOpen}
      setEffortMenuOpen={setEffortMenuOpen}
      setOverflowOpen={setOverflowOpen}
      showOpenAIAccountRateLimits={showOpenAIAccountRateLimits}
      t={t}
      terminalButtonActive={terminalButtonActive}
      terminalButtonEnabled={terminalButtonEnabled}
    />
  )
}
const MemoChatComposerControlRail = React.memo(ChatComposerControlRail)
MemoChatComposerControlRail.displayName = 'MemoChatComposerControlRail'

export { ChatComposerControlRail, MemoChatComposerControlRail }
export default ChatComposerControlRail
