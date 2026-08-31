import React, { useRef, useState } from 'react'
import { buildProviderModelSelectorViewModel } from './provider-model-selector-view-model.mjs'
import ProviderModelSelectorMenus from './ProviderModelSelectorMenus.jsx'
import ProviderCustomModelInput from './provider-custom-model-input.jsx'
import ProviderTermsNoticeModal from './ProviderTermsNoticeModal.jsx'
import { SelectorBadge } from './chat-header-control-ornaments.jsx'
import { requestAppConfirm } from '../../store/useAppStore.js'
import useSettingsStore from '../../store/useSettingsStore.js'
import { COMPLIANCE_MODE_STRICT, COMPLIANCE_MODE_WARN_ONLY, normalizeComplianceMode, normalizeProviderTermsAcknowledgements, isProviderTermsAcknowledged } from '../../../common/compliance/compliance-settings.mjs'

export { default as ThreadSelector } from './ThreadSelector.jsx'
export { default as ModeToggle } from './ModeToggle.jsx'
export { default as TrashIcon } from './TrashIcon.jsx'
// aria-label={activeThreadId ? 'Rename thread' : 'Select a thread to rename'}

function getProviderRuntimeBadge(option = {}) {
  if (option?.supportsProviderNativeRuntime !== true) return null
  const mode = String(option?.providerNativeRuntimeMode || '').trim().toLowerCase()
  const family = String(option?.providerNativeRuntimeFamily || '').trim()
  if (mode === 'remote_tool_bundle') {
    return {
      label: 'Remote bundle',
      title: family
        ? `Uses provider-managed remote tool-bundle semantics (${family}).`
        : 'Uses provider-managed remote tool-bundle semantics.',
    }
  }
  return {
    label: 'Provider runtime',
    title: family
      ? `Uses provider-native runtime semantics (${family}).`
      : 'Uses provider-native runtime semantics.',
  }
}

function normalizeModelNamespaceToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function stripGroupedModelPrefix(label = '', group = '') {
  const text = String(label || '').trim()
  const groupPrefix = String(group || '').trim()
  if (!text || !groupPrefix) return text
  const prefix = `${groupPrefix}/`
  if (text.toLowerCase().startsWith(prefix.toLowerCase())) {
    return text.slice(prefix.length).trim() || text
  }
  const slashIndex = text.indexOf('/')
  if (slashIndex <= 0) return text
  const namespace = text.slice(0, slashIndex)
  if (namespace.includes(':')) return text
  const namespaceToken = normalizeModelNamespaceToken(namespace)
  const groupToken = normalizeModelNamespaceToken(groupPrefix)
  if (!namespaceToken || !groupToken) return text
  const compactNamespace = namespaceToken.replace(/-/g, '')
  const compactGroup = groupToken.replace(/-/g, '')
  const namespaceMatchesGroup = (
    namespaceToken === groupToken
    || namespaceToken.startsWith(`${groupToken}-`)
    || groupToken.startsWith(`${namespaceToken}-`)
    || compactNamespace === compactGroup
    || compactNamespace.startsWith(compactGroup)
    || compactGroup.startsWith(compactNamespace)
  )
  if (namespaceMatchesGroup) {
    return text.slice(slashIndex + 1).trim() || text
  }
  return text
}

export function ProviderModelSelector({
  providers,
  loaded,
  refreshing,
  selectedProvider,
  selectedModel,
  modelCatalogVisibility = null,
  activeThreadId = '',
  hasConversation = false,
  onComplianceNotice = () => { },
  onChangeProvider,
  onChangeModel,
  onRefresh,
  showRefreshButton = true,
  showCustomModelInput = true,
  customModelInputMode = 'always',
  showModelSourceBadge = true,
  allowWrap = true,
  modelMenuTopContent = null,
  modelMenuOpenOverride = undefined,
}) {
  const [customModel, setCustomModel] = useState('')
  const [providerMenuOpen, setProviderMenuOpen] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [expandedGroup, setExpandedGroup] = useState('')
  const [pendingProviderId, setPendingProviderId] = useState('')
  const [providerNoticeOpen, setProviderNoticeOpen] = useState(false)
  const [savingAcknowledgement, setSavingAcknowledgement] = useState(false)
  const strictSwitchConfirmKeysRef = useRef(new Set())
  const providerAcknowledgementInFlightRef = useRef(false)
  const providerMenuRef = useRef(null)
  const modelMenuRef = useRef(null)
  const coreSettings = useSettingsStore((s) => s.coreSettings)
  const cacheCoreSettings = useSettingsStore((s) => s.cacheCoreSettings)
  const complianceMode = normalizeComplianceMode(coreSettings?.complianceMode, COMPLIANCE_MODE_WARN_ONLY)
  const providerTermsAcknowledgements = React.useMemo(
    () => normalizeProviderTermsAcknowledgements(coreSettings?.providerTermsAcknowledgements),
    [coreSettings?.providerTermsAcknowledgements],
  )

  React.useEffect(() => {
    if (!providerMenuOpen && !modelMenuOpen) return undefined
    const onPointerDown = (event) => {
      if (providerMenuRef.current?.contains(event.target)) return
      if (modelMenuRef.current?.contains(event.target)) return
      setProviderMenuOpen(false)
      setModelMenuOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setProviderMenuOpen(false)
        setModelMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [providerMenuOpen, modelMenuOpen])

  const selectorVm = buildProviderModelSelectorViewModel({
    providers,
    loaded,
    selectedProvider,
    selectedModel,
    modelCatalogVisibility,
  })
  const configured = selectorVm.configuredProviders
  const activeProvider = selectorVm.activeProvider
  const modelList = selectorVm.modelList
  const selectedAdapterSelection = selectorVm.selectedAdapterSelection
  const selectedAdapterLabel = selectorVm.selectedAdapterLabel
  const selectedCanonicalModelId = selectorVm.selectedCanonicalModelId
  const pendingProvider = configured.find((provider) => provider.id === pendingProviderId) || null
  const hasConfiguredProviders = configured.length > 0
  const activeProviderNeedsTermsReview = !!(
    activeProvider
    && complianceMode !== 'off'
    && !isProviderTermsAcknowledged(activeProvider, providerTermsAcknowledgements)
  )
  const customModelInputEnabled = (
    showCustomModelInput === true
    && (
      customModelInputMode === 'always'
      || (
        customModelInputMode === 'openrouter_only'
        && String(activeProvider?.id || '').trim().toLowerCase() === 'openrouter'
      )
    )
  )

  React.useEffect(() => {
    setProviderMenuOpen(false)
  }, [selectedProvider])

  React.useEffect(() => {
    setModelMenuOpen(false)
  }, [selectedProvider, selectedModel])
  const effectiveModelMenuOpen = typeof modelMenuOpenOverride === 'boolean'
    ? modelMenuOpenOverride
    : modelMenuOpen

  const logComplianceEvent = ({
    noticeAction = 'shown',
    noticeType = '',
    providerId = '',
    model = '',
    termsVersion = '',
    summary = '',
    source = 'provider_selector',
    extraMeta = {},
    threadId = '',
    turnId = '',
  } = {}) => {
    const chatApi = typeof window !== 'undefined' ? window?.addom?.chat : null
    if (!chatApi || typeof chatApi.logComplianceEvent !== 'function') return
    const targetThreadId = String(threadId || activeThreadId || '').trim()
    if (!targetThreadId) return
    chatApi.logComplianceEvent({
      noticeAction: String(noticeAction || '').trim().toLowerCase(),
      noticeType: String(noticeType || '').trim().toLowerCase(),
      threadId: targetThreadId,
      turnId: String(turnId || '').trim(),
      providerId: String(providerId || '').trim().toLowerCase(),
      model: String(model || '').trim(),
      termsVersion: String(termsVersion || '').trim(),
      summary: String(summary || '').trim(),
      source: String(source || '').trim().toLowerCase(),
      ...(extraMeta && typeof extraMeta === 'object' ? extraMeta : {}),
    })
  }

  const requestStrictSwitchConfirmation = async ({
    switchKind = 'provider',
    fromProviderId = '',
    fromModelId = '',
    toProviderId = '',
    toModelId = '',
  } = {}) => {
    if (complianceMode !== COMPLIANCE_MODE_STRICT) return true
    if (!hasConversation || !activeThreadId) return true

    const fromProvider = String(fromProviderId || '').trim().toLowerCase()
    const toProvider = String(toProviderId || '').trim().toLowerCase()
    const fromModel = String(fromModelId || '').trim().toLowerCase()
    const toModel = String(toModelId || '').trim().toLowerCase()
    if (!toProvider) return true

    const normalizedSwitchKind = switchKind === 'model' ? 'model' : 'provider'
    const key = normalizedSwitchKind === 'model'
      ? `model:${activeThreadId}:${fromProvider}:${fromModel}:${toProvider}:${toModel}`
      : `provider:${activeThreadId}:${fromProvider}:${toProvider}`
    if (strictSwitchConfirmKeysRef.current.has(key)) return true

    const fromLabel = normalizedSwitchKind === 'model'
      ? `${fromProvider || 'provider'}/${fromModel || 'model'}`
      : (fromProvider || 'provider')
    const toLabel = normalizedSwitchKind === 'model'
      ? `${toProvider || 'provider'}/${toModel || 'model'}`
      : (toProvider || 'provider')
    const summary = normalizedSwitchKind === 'model'
      ? `Strict compliance confirmation required before switching model from ${fromLabel} to ${toLabel}.`
      : `Strict compliance confirmation required before switching provider from ${fromLabel} to ${toLabel}.`

    logComplianceEvent({
      noticeAction: 'shown',
      noticeType: normalizedSwitchKind === 'model' ? 'provider_model_switch' : 'provider_switch',
      providerId: toProvider,
      model: normalizedSwitchKind === 'model' ? toModel : '',
      summary,
      source: 'strict_switch_confirm',
    })

    const ok = await requestAppConfirm({
      title: normalizedSwitchKind === 'model' ? 'Confirm Model Switch' : 'Confirm Provider Switch',
      message: `${summary}\n\nStrict compliance mode keeps functionality unchanged, but requires an explicit confirmation once per session for this switch path.`,
      confirmLabel: normalizedSwitchKind === 'model' ? 'Switch Model' : 'Switch Provider',
      cancelLabel: 'Cancel',
      tone: 'warning',
    })

    if (!ok) {
      logComplianceEvent({
        noticeAction: 'skipped',
        noticeType: normalizedSwitchKind === 'model' ? 'provider_model_switch' : 'provider_switch',
        providerId: toProvider,
        model: normalizedSwitchKind === 'model' ? toModel : '',
        summary: `${summary} User cancelled strict confirmation.`,
        source: 'strict_switch_confirm',
      })
      return false
    }

    strictSwitchConfirmKeysRef.current.add(key)
    logComplianceEvent({
      noticeAction: 'acknowledged',
      noticeType: normalizedSwitchKind === 'model' ? 'provider_model_switch' : 'provider_switch',
      providerId: toProvider,
      model: normalizedSwitchKind === 'model' ? toModel : '',
      summary: `${summary} User confirmed strict switch.`,
      source: 'strict_switch_confirm',
    })
    return true
  }

  const saveProviderAcknowledgement = async (provider) => {
    if (!provider || !provider.id) return
    const providerId = String(provider.id || '').trim().toLowerCase()
    if (!providerId) return
    const termsVersion = String(provider.termsVersion || '').trim()
    if (!termsVersion) return
    const termsUrl = String(provider.termsUrl || '').trim()
    const providerName = String(provider.name || providerId).trim()

    setSavingAcknowledgement(true)
    try {
      const nextAcknowledgements = {
        ...providerTermsAcknowledgements,
        [providerId]: {
          termsVersion,
          acceptedAt: Date.now(),
          ...(termsUrl ? { termsUrl } : {}),
          ...(providerName ? { providerName } : {}),
        },
      }
      await window.addom.settings.set({
        providerTermsAcknowledgements: nextAcknowledgements,
      })
      if (coreSettings && typeof coreSettings === 'object') {
        cacheCoreSettings({
          ...coreSettings,
          providerTermsAcknowledgements: nextAcknowledgements,
        })
      }
      logComplianceEvent({
        noticeAction: 'acknowledged',
        noticeType: 'provider_terms_notice',
        providerId,
        termsVersion,
        summary: `Provider terms acknowledged for ${providerName || providerId}.`,
        source: 'provider_terms_modal',
      })
    } catch {
      // Non-fatal: keep chat flow moving; user can re-acknowledge later.
    } finally {
      setSavingAcknowledgement(false)
    }
  }

  const maybeOpenProviderNotice = (providerId) => {
    const nextProvider = configured.find((provider) => provider.id === providerId) || null
    if (!nextProvider) return false
    if (complianceMode === 'off') return false
    if (nextProvider.noKeyRequired) return false
    if (isProviderTermsAcknowledged(nextProvider, providerTermsAcknowledgements)) return false
    logComplianceEvent({
      noticeAction: 'shown',
      noticeType: 'provider_terms_notice',
      providerId: nextProvider.id,
      termsVersion: String(nextProvider.termsVersion || '').trim(),
      summary: `Provider terms review required before switching to ${String(nextProvider.name || nextProvider.id || 'provider')}.`,
      source: 'provider_terms_modal',
    })
    setPendingProviderId(providerId)
    setProviderNoticeOpen(true)
    return true
  }

  const emitProviderSwitchComplianceNotice = ({
    fromProviderId = '',
    fromModelId = '',
    toProviderId = '',
    toModelId = '',
    switchKind = 'provider',
  } = {}) => {
    if (complianceMode === 'off') return
    if (!hasConversation) return
    if (!activeThreadId) return
    const fromProvider = String(fromProviderId || '').trim() || 'previous provider'
    const toProvider = String(toProviderId || '').trim() || 'new provider'
    const fromModel = String(fromModelId || '').trim()
    const toModel = String(toModelId || '').trim()
    const fromLabel = fromModel ? `${fromProvider}/${fromModel}` : fromProvider
    const toLabel = toModel ? `${toProvider}/${toModel}` : toProvider
    const message = switchKind === 'model'
      ? `Compliance reminder: model switched from ${fromLabel} to ${toLabel}. Review provider/model usage terms for this thread context.`
      : `Compliance reminder: provider switched from ${fromLabel} to ${toLabel}. Review routing and provider terms for this thread context.`
    const noticeType = switchKind === 'model' ? 'provider_model_switch' : 'provider_switch'
    onComplianceNotice({
      type: 'warning',
      text: message,
      meta: {
        complianceNotice: true,
        sessionSuppressKey: 'compliance:provider-switch',
        noticeType,
        threadId: String(activeThreadId || ''),
        fromProviderId: fromProvider,
        fromModelId: fromModel,
        toProviderId: toProvider,
        toModelId: toModel,
      },
    })
  }

  const handleProviderChange = async (providerId) => {
    const nextProviderId = String(providerId || '').trim()
    if (!nextProviderId) return
    if (maybeOpenProviderNotice(nextProviderId)) return
    const currentProvider = String(selectedProvider || '').trim()
    if (nextProviderId === currentProvider) return
    const strictApproved = await requestStrictSwitchConfirmation({
      switchKind: 'provider',
      fromProviderId: currentProvider,
      fromModelId: selectedModel,
      toProviderId: nextProviderId,
      toModelId: '',
    })
    if (!strictApproved) return
    if (nextProviderId && currentProvider && nextProviderId !== currentProvider) {
      emitProviderSwitchComplianceNotice({
        fromProviderId: currentProvider,
        fromModelId: selectedModel,
        toProviderId: nextProviderId,
        toModelId: '',
        switchKind: 'provider',
      })
    }
    onChangeProvider(nextProviderId)
  }

  const handleModelChange = async (modelId) => {
    const nextModel = String(modelId || '').trim()
    const currentModel = String(selectedModel || '').trim()
    if (!nextModel || nextModel === currentModel) return
    const strictApproved = await requestStrictSwitchConfirmation({
      switchKind: 'model',
      fromProviderId: selectedProvider,
      fromModelId: currentModel,
      toProviderId: selectedProvider,
      toModelId: nextModel,
    })
    if (!strictApproved) return
    if (nextModel && currentModel && nextModel !== currentModel) {
      emitProviderSwitchComplianceNotice({
        fromProviderId: selectedProvider,
        fromModelId: currentModel,
        toProviderId: selectedProvider,
        toModelId: nextModel,
        switchKind: 'model',
      })
    }
    onChangeModel(nextModel)
  }

  const providerLabel = React.useMemo(() => {
    const selectedId = String(selectedProvider || '').trim()
    if (!selectedId) return 'Provider'
    const match = configured.find((entry) => String(entry?.id || '').trim() === selectedId) || null
    return String(match?.name || match?.id || selectedId)
  }, [configured, selectedProvider])

  const modelGroups = React.useMemo(() => {
    const rows = Array.isArray(modelList) ? modelList : []
    const hasGroups = rows.some((entry) => String(entry?.group || '').trim().length > 0)
    if (!hasGroups) {
      return [
        {
          group: '',
          options: rows.map((entry) => ({
            id: String(entry?.id || '').trim(),
            label: String(entry?.label || entry?.id || '').trim(),
            supportsTools: entry?.supportsTools === true,
            supportsAnyToolSurface: entry?.supportsAnyToolSurface === true,
            supportsProviderNativeRuntime: entry?.supportsProviderNativeRuntime === true,
            providerNativeRuntimeMode: String(entry?.providerNativeRuntimeMode || '').trim(),
            providerNativeRuntimeFamily: String(entry?.providerNativeRuntimeFamily || '').trim(),
            selectable: entry?.selectable !== false,
            unavailableReason: String(entry?.unavailableReason || '').trim(),
          })).filter((entry) => entry.id),
        },
      ]
    }

    const groupOrder = []
    const byGroup = new Map()
    for (const entry of rows) {
      const id = String(entry?.id || '').trim()
      if (!id) continue
      const label = String(entry?.label || entry?.id || '').trim() || id
      const group = String(entry?.group || 'Other').trim() || 'Other'
      if (!byGroup.has(group)) {
        byGroup.set(group, [])
        groupOrder.push(group)
      }
      byGroup.get(group).push({
        id,
        label,
        supportsTools: entry?.supportsTools === true,
        supportsAnyToolSurface: entry?.supportsAnyToolSurface === true,
        supportsProviderNativeRuntime: entry?.supportsProviderNativeRuntime === true,
        providerNativeRuntimeMode: String(entry?.providerNativeRuntimeMode || '').trim(),
        providerNativeRuntimeFamily: String(entry?.providerNativeRuntimeFamily || '').trim(),
        selectable: entry?.selectable !== false,
        unavailableReason: String(entry?.unavailableReason || '').trim(),
      })
    }

    return groupOrder
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map((group) => ({
        group,
        options: byGroup.get(group) || [],
      }))
  }, [modelList])

  const modelOptionsFlat = React.useMemo(
    () => modelGroups.flatMap((entry) => entry.options),
    [modelGroups],
  )
  const renderedModelGroups = React.useMemo(
    () => modelGroups.map((groupEntry) => ({
      ...groupEntry,
      options: (groupEntry.options || []).map((option) => ({
        ...option,
        displayLabel: stripGroupedModelPrefix(option.label, groupEntry.group),
        providerRuntimeBadge: getProviderRuntimeBadge(option),
      })),
    })),
    [modelGroups],
  )

  const selectedModelValue = String(selectedCanonicalModelId || selectedModel || activeProvider?.defaultModel || '').trim()
  const customModelValue = String(customModel || '').trim()
  const selectedModelMeta = React.useMemo(
    () => modelOptionsFlat.find((entry) => entry.id === selectedModelValue) || null,
    [modelOptionsFlat, selectedModelValue],
  )
  const selectedModelProviderRuntimeBadge = React.useMemo(
    () => getProviderRuntimeBadge(selectedModelMeta),
    [selectedModelMeta],
  )

  const previousMenuStateRef = useRef(false)
  React.useEffect(() => {
    if (effectiveModelMenuOpen && !previousMenuStateRef.current && selectedModelValue) {
      const activeGroup = modelGroups.find(
        (g) => g.options.some((opt) => opt.id === selectedModelValue)
      )
      if (activeGroup && activeGroup.group) {
        setExpandedGroup(activeGroup.group)
      } else {
        setExpandedGroup('')
      }
    }
    previousMenuStateRef.current = effectiveModelMenuOpen
  }, [effectiveModelMenuOpen, selectedModelValue, modelGroups])

  if (!loaded) return <span className="text-[11px] text-text-muted">Loading...</span>

  if (!hasConfiguredProviders) return (
    <span className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-surface-border bg-surface-panel-alt px-2.5 text-[11px] text-text-muted">
      No keys configured
    </span>
  )

  const handleProviderOptionSelect = (providerId) => {
    const id = String(providerId || '').trim()
    if (!id) return
    setProviderMenuOpen(false)
    setModelMenuOpen(false)
    void handleProviderChange(id)
  }
  const handleModelOptionSelect = (modelId) => {
    const id = String(modelId || '').trim()
    if (!id) return
    const option = modelOptionsFlat.find((entry) => entry.id === id)
    if (option?.selectable === false) return
    setModelMenuOpen(false)
    void handleModelChange(id)
  }
  const handleCustomModelSubmit = async (modelId) => {
    const id = String(modelId || '').trim()
    if (!id) return
    await handleModelChange(id)
    setCustomModel('')
  }

  return (
    <div className={allowWrap ? 'relative flex min-w-0 flex-wrap items-center gap-2' : 'relative flex min-w-0 flex-nowrap items-center gap-2'}>
      {showRefreshButton && (
        <button
          onClick={onRefresh}
          title="Refresh models"
          className="inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-lg border border-surface-border bg-surface-panel-alt px-2.5 text-[12px] font-medium text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary"
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      )}

      <ProviderModelSelectorMenus
        providerMenuRef={providerMenuRef}
        modelMenuRef={modelMenuRef}
        providerMenuOpen={providerMenuOpen}
        effectiveModelMenuOpen={effectiveModelMenuOpen}
        providerLabel={providerLabel}
        configured={configured}
        selectedProvider={selectedProvider}
        activeProvider={activeProvider}
        modelList={modelList}
        modelMenuTopContent={modelMenuTopContent}
        modelGroups={renderedModelGroups}
        expandedGroup={expandedGroup}
        setProviderMenuOpen={setProviderMenuOpen}
        setModelMenuOpen={setModelMenuOpen}
        modelMenuOpenOverride={modelMenuOpenOverride}
        setExpandedGroup={setExpandedGroup}
        selectedModelValue={selectedModelValue}
        onProviderOptionSelect={handleProviderOptionSelect}
        onModelOptionSelect={handleModelOptionSelect}
      />

      <ProviderCustomModelInput
        activeProvider={activeProvider}
        customModelInputEnabled={customModelInputEnabled}
        customModel={customModel}
        customModelValue={customModelValue}
        onCustomModelChange={setCustomModel}
        onSubmitCustomModel={handleCustomModelSubmit}
      />

      {activeProvider && showModelSourceBadge && (
        <>
          {selectedAdapterSelection === 'generic' && selectedAdapterLabel && (
            <span
              className="shrink-0 whitespace-nowrap rounded-md border border-surface-border bg-surface-panel-alt px-2 py-1 text-[10px] uppercase tracking-wide text-text-muted"
              title="This model is using the conservative generic adapter profile."
            >
              {selectedAdapterLabel}
            </span>
          )}
          <span className="shrink-0 whitespace-nowrap text-[10px] uppercase tracking-wide text-text-muted">
            {activeProvider.modelSource === 'dynamic' ? 'dynamic' : 'static'}
          </span>
          {selectedModelProviderRuntimeBadge && (
            <SelectorBadge
              tone="runtime"
              title={selectedModelProviderRuntimeBadge.title}
            />
          )}
          {activeProviderNeedsTermsReview && (
            <button
              type="button"
              onClick={() => {
                logComplianceEvent({
                  noticeAction: 'shown',
                  noticeType: 'provider_terms_notice',
                  providerId: activeProvider.id,
                  termsVersion: String(activeProvider.termsVersion || '').trim(),
                  summary: `Provider terms review opened for ${String(activeProvider.name || activeProvider.id || 'provider')}.`,
                  source: 'provider_terms_modal',
                })
                setPendingProviderId(String(activeProvider.id || ''))
                setProviderNoticeOpen(true)
              }}
              className="inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-md border border-warning-border/70 bg-surface-panel px-2 text-[10px] uppercase tracking-wide text-warning-soft transition-colors hover:border-warning-border hover:bg-surface-panel-alt"
              title="Review provider terms notice"
            >
              Terms review needed
            </button>
          )}
        </>
      )}

      <ProviderTermsNoticeModal
        open={providerNoticeOpen}
        provider={pendingProvider}
        saving={savingAcknowledgement}
        onCancel={() => {
          if (savingAcknowledgement || providerAcknowledgementInFlightRef.current) return
          if (pendingProvider) {
            logComplianceEvent({
              noticeAction: 'skipped',
              noticeType: 'provider_terms_notice',
              providerId: pendingProvider.id,
              termsVersion: String(pendingProvider.termsVersion || '').trim(),
              summary: `Provider terms notice dismissed for ${String(pendingProvider.name || pendingProvider.id || 'provider')}.`,
              source: 'provider_terms_modal',
            })
          }
          setProviderNoticeOpen(false)
          setPendingProviderId('')
        }}
        onOpenTerms={() => {
          if (savingAcknowledgement || providerAcknowledgementInFlightRef.current) return
          const url = String(pendingProvider?.termsUrl || '').trim()
          if (!url) return
          window.addom.shell.openExternal(url)
        }}
        onAcknowledge={async () => {
          if (!pendingProvider || savingAcknowledgement || providerAcknowledgementInFlightRef.current) return
          providerAcknowledgementInFlightRef.current = true
          try {
            await saveProviderAcknowledgement(pendingProvider)
            setProviderNoticeOpen(false)
            const currentProvider = String(selectedProvider || '').trim()
            const strictApproved = await requestStrictSwitchConfirmation({
              switchKind: 'provider',
              fromProviderId: currentProvider,
              fromModelId: selectedModel,
              toProviderId: pendingProvider.id,
              toModelId: '',
            })
            if (!strictApproved) {
              setPendingProviderId('')
              return
            }
            if (pendingProvider.id && currentProvider && pendingProvider.id !== currentProvider) {
              emitProviderSwitchComplianceNotice({
                fromProviderId: currentProvider,
                fromModelId: selectedModel,
                toProviderId: pendingProvider.id,
                toModelId: '',
                switchKind: 'provider',
              })
            }
            onChangeProvider(pendingProvider.id)
            setPendingProviderId('')
          } finally {
            providerAcknowledgementInFlightRef.current = false
          }
        }}
      />
    </div>
  )
}
