import React, { startTransition } from 'react'
import { useSettingsTranslator } from './settings-panel-ui-utils.mjs'
import { useOpenRouterVisibility } from './useOpenRouterVisibility.js'
import OpenRouterNamespaceRow, { OpenRouterModelList } from './OpenRouterNamespaceRow.jsx'
import SettingsDetailView from './SettingsDetailView.jsx'
import { MenuRow, MenuSurface } from '../ui/MenuSurface.jsx'
import {
  buildOpenRouterSearchGroups,
  findOpenRouterNamespaceRow,
} from './openrouter-catalog-manager-model.mjs'

const OPENROUTER_PROVIDER_ID = 'openrouter'
const providerModelsCache = new Map()

function readCachedProviderModels(providerId = '') {
  const normalizedProviderId = String(providerId || '').trim().toLowerCase()
  if (!normalizedProviderId) return []
  const cached = providerModelsCache.get(normalizedProviderId)
  return Array.isArray(cached) ? cached : []
}

function writeCachedProviderModels(providerId = '', models = []) {
  const normalizedProviderId = String(providerId || '').trim().toLowerCase()
  if (!normalizedProviderId) return
  providerModelsCache.set(normalizedProviderId, Array.isArray(models) ? models : [])
}

export default function OpenRouterCatalogVisibilitySection({
  providers = [],
  value = null,
  onChange = () => {},
  onClose = () => {},
}) {
  const t = useSettingsTranslator(['settings', 'core'])
  const menuRef = React.useRef(null)
  const [selectedNamespace, setSelectedNamespace] = React.useState('')
  const [rulesOpen, setRulesOpen] = React.useState(false)
  const [actionsOpen, setActionsOpen] = React.useState(false)
  const openrouterProvider = React.useMemo(
    () => (Array.isArray(providers) ? providers.find((provider) => String(provider?.id || '').trim().toLowerCase() === OPENROUTER_PROVIDER_ID) || null : null),
    [providers],
  )
  const [providerModels, setProviderModels] = React.useState(() => readCachedProviderModels(OPENROUTER_PROVIDER_ID))
  const [modelsLoading, setModelsLoading] = React.useState(() => readCachedProviderModels(OPENROUTER_PROVIDER_ID).length === 0)
  const [modelsError, setModelsError] = React.useState('')

  React.useEffect(() => {
    if (!openrouterProvider) return undefined
    const cachedModels = readCachedProviderModels(OPENROUTER_PROVIDER_ID)
    if (cachedModels.length > 0) {
      setProviderModels(cachedModels)
      setModelsLoading(false)
      return undefined
    }

    let cancelled = false
    setModelsLoading(true)
    setModelsError('')
    window.addom.vault.getProviderModels(OPENROUTER_PROVIDER_ID, false)
      .then((models) => {
        if (cancelled) return
        const normalizedModels = Array.isArray(models) ? models : []
        writeCachedProviderModels(OPENROUTER_PROVIDER_ID, normalizedModels)
        startTransition(() => setProviderModels(normalizedModels))
      })
      .catch((error) => {
        if (!cancelled) setModelsError(String(error?.message || error || 'Unable to load OpenRouter models.'))
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false)
      })
    return () => { cancelled = true }
  }, [openrouterProvider])

  React.useEffect(() => {
    if (!rulesOpen && !actionsOpen) return undefined
    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        setRulesOpen(false)
        setActionsOpen(false)
      }
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setRulesOpen(false)
        setActionsOpen(false)
      }
    }
    window.addEventListener('mousedown', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [actionsOpen, rulesOpen])

  const {
    search,
    setSearch,
    normalizedValue,
    summaryView,
    visibilityView,
    totalModels,
    shownModels,
    enabledModels,
    setNamespaceVisibility,
    setModelVisibility,
    handleToggleFilter,
    applyQuickAction,
  } = useOpenRouterVisibility({ models: providerModels, value, onChange })

  const selectedNamespaceRow = React.useMemo(
    () => findOpenRouterNamespaceRow(summaryView, selectedNamespace),
    [selectedNamespace, summaryView],
  )
  const searchGroups = React.useMemo(
    () => buildOpenRouterSearchGroups(visibilityView),
    [visibilityView],
  )
  const activeRuleCount = Object.values(normalizedValue.filters || {}).filter(Boolean).length
  const catalogTitle = t('settings:blocks.openRouterCatalogVisibility.catalogTitle', { defaultValue: 'OpenRouter catalog' })
  const closeLabel = selectedNamespaceRow
    ? t('settings:blocks.openRouterCatalogVisibility.backToCatalog', { defaultValue: 'Back to OpenRouter catalog' })
    : t('settings:blocks.openRouterCatalogVisibility.backToProviders', { defaultValue: 'Back to Providers' })
  const rulesLabel = t('settings:blocks.openRouterCatalogVisibility.rulesTitle', { defaultValue: 'Rules' })
  const summary = t('settings:blocks.openRouterCatalogVisibility.counts.default', {
    defaultValue: '{{enabled}} / {{total}} enabled',
    enabled: enabledModels,
    total: totalModels,
  })

  const runAction = (action) => {
    applyQuickAction(action)
    setActionsOpen(false)
  }

  const headerActions = (
    <div ref={menuRef} className="relative mt-1 flex items-center gap-1">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={rulesOpen}
        onClick={() => { setRulesOpen((open) => !open); setActionsOpen(false) }}
        className="min-h-7 rounded-md px-2 text-xs text-text-secondary hover:bg-surface-panel hover:text-text-primary"
      >
        {rulesLabel}{activeRuleCount ? ` · ${activeRuleCount}` : ''}
      </button>
      <button
        type="button"
        aria-label={t('settings:blocks.openRouterCatalogVisibility.quickActionsTitle', { defaultValue: 'Quick actions' })}
        title={t('settings:blocks.openRouterCatalogVisibility.quickActionsTitle', { defaultValue: 'Quick actions' })}
        aria-haspopup="menu"
        aria-expanded={actionsOpen}
        onClick={() => { setActionsOpen((open) => !open); setRulesOpen(false) }}
        className="h-7 w-7 rounded-md text-text-secondary hover:bg-surface-panel hover:text-text-primary"
      >
        ···
      </button>
      {rulesOpen ? (
        <MenuSurface className="absolute right-8 top-8 z-30 w-48">
          {[
            ['reviewedOnly', t('settings:blocks.openRouterCatalogVisibility.filters.reviewedOnly', { defaultValue: 'Reviewed only' })],
            ['toolsOnly', t('settings:blocks.openRouterCatalogVisibility.filters.anyTools', { defaultValue: 'Any tools' })],
            ['reasoningOnly', t('settings:blocks.openRouterCatalogVisibility.filters.reasoning', { defaultValue: 'Reasoning' })],
            ['visionOnly', t('settings:blocks.openRouterCatalogVisibility.filters.vision', { defaultValue: 'Vision' })],
          ].map(([key, label]) => (
            <label key={key} className="flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2.5 text-xs text-text-secondary hover:bg-surface-panel-alt hover:text-text-primary">
              <input type="checkbox" checked={normalizedValue.filters[key]} onChange={() => { handleToggleFilter(key); setRulesOpen(false) }} className="accent-accent" />
              <span>{label}</span>
            </label>
          ))}
        </MenuSurface>
      ) : null}
      {actionsOpen ? (
        <MenuSurface className="absolute right-0 top-8 z-30 w-40">
          <MenuRow onClick={() => runAction('show_all')}>{t('settings:blocks.openRouterCatalogVisibility.quickActions.showAll', { defaultValue: 'Show all' })}</MenuRow>
          <MenuRow onClick={() => runAction('hide_all')}>{t('settings:blocks.openRouterCatalogVisibility.quickActions.hideAll', { defaultValue: 'Hide all' })}</MenuRow>
          <MenuRow onClick={() => runAction('reset')}>{t('settings:blocks.openRouterCatalogVisibility.quickActions.reset', { defaultValue: 'Reset' })}</MenuRow>
        </MenuSurface>
      ) : null}
    </div>
  )

  return (
    <SettingsDetailView
      title={selectedNamespaceRow?.label || catalogTitle}
      description={selectedNamespaceRow ? summary : `${summary} · ${shownModels} shown`}
      closeLabel={closeLabel}
      onClose={selectedNamespaceRow ? () => setSelectedNamespace('') : onClose}
      actions={headerActions}
    >
      {!openrouterProvider ? (
        <p className="py-5 text-xs text-text-muted">
          {t('settings:blocks.openRouterCatalogVisibility.notAvailable', { defaultValue: 'OpenRouter is not available in the current provider manifest.' })}
        </p>
      ) : null}

      {openrouterProvider && modelsLoading && providerModels.length === 0 ? (
        <p className="py-5 text-xs text-text-muted">
          {t('settings:blocks.openRouterCatalogVisibility.loading', { defaultValue: 'Loading OpenRouter catalog...' })}
        </p>
      ) : null}

      {openrouterProvider && modelsError && providerModels.length === 0 ? (
        <p className="py-5 text-xs text-danger-soft">{modelsError}</p>
      ) : null}

      {openrouterProvider && providerModels.length > 0 ? (
        <>
          {!selectedNamespaceRow ? (
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('settings:blocks.openRouterCatalogVisibility.searchPlaceholder', { defaultValue: 'Search OpenRouter namespaces or route IDs' })}
              className="mb-3 w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-xs text-text-primary outline-none placeholder:text-text-muted focus:border-accent-muted"
              data-ui="settings-openrouter-search"
            />
          ) : null}

          {selectedNamespaceRow ? (
            <>
              <div className="flex min-h-11 items-center justify-between border-b border-surface-border/55 py-2.5 text-xs text-text-secondary">
                <span>{t('settings:blocks.openRouterCatalogVisibility.namespaceRow.visibilityAriaLabel', { defaultValue: '{{label}} namespace visibility', label: selectedNamespaceRow.label })}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={selectedNamespaceRow.effectiveVisible}
                  aria-label={t('settings:blocks.openRouterCatalogVisibility.namespaceRow.visibilityAriaLabel', { defaultValue: '{{label}} namespace visibility', label: selectedNamespaceRow.label })}
                  onClick={() => setNamespaceVisibility(selectedNamespaceRow.namespace, !selectedNamespaceRow.effectiveVisible)}
                  className={[
                    'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-75',
                    selectedNamespaceRow.effectiveVisible ? 'border-accent-muted bg-accent' : 'border-surface-border bg-surface-panel',
                  ].join(' ')}
                >
                  <span className={[
                    'h-3.5 w-3.5 rounded-full border bg-white transition-transform duration-75',
                    selectedNamespaceRow.effectiveVisible ? 'translate-x-4 border-accent' : 'translate-x-1 border-surface-border',
                  ].join(' ')} />
                </button>
              </div>
              <OpenRouterModelList models={selectedNamespaceRow.models} namespace={selectedNamespaceRow.namespace} onSetModelVisibility={setModelVisibility} />
            </>
          ) : search.trim() ? (
            searchGroups.length ? searchGroups.map((group) => (
              <section key={group.namespace} className="border-b border-surface-border/55 py-2 last:border-b-0">
                <h4 className="py-1 text-[11px] font-semibold text-text-secondary">{group.label}</h4>
                <OpenRouterModelList models={group.models} namespace={group.namespace} onSetModelVisibility={setModelVisibility} />
              </section>
            )) : (
              <p className="py-8 text-center text-xs text-text-muted">
                {t('settings:blocks.openRouterCatalogVisibility.empty', { defaultValue: 'No OpenRouter routes match the current search.' })}
              </p>
            )
          ) : (
            <div className="border-t border-surface-border/55">
              {visibilityView.namespaceRows.map((namespaceRow) => (
                <OpenRouterNamespaceRow
                  key={namespaceRow.namespace}
                  namespaceRow={namespaceRow}
                  onOpen={setSelectedNamespace}
                  onToggleVisibility={setNamespaceVisibility}
                />
              ))}
            </div>
          )}
        </>
      ) : null}
    </SettingsDetailView>
  )
}
