import React from 'react'
import { ChevronDownIcon } from './chat-header-control-ornaments.jsx'

const MANUAL_GROUP_COLLAPSE = '__manual_group_collapse__'

export default function ProviderModelSelectorMenus({
  providerMenuRef,
  modelMenuRef,
  providerMenuOpen = false,
  effectiveModelMenuOpen = false,
  providerLabel = 'Provider',
  configured = [],
  selectedProvider = '',
  activeProvider = null,
  modelList = [],
  modelMenuTopContent = null,
  modelGroups = [],
  expandedGroup = '',
  setProviderMenuOpen = () => {},
  setModelMenuOpen = () => {},
  modelMenuOpenOverride = undefined,
  setExpandedGroup = () => {},
  selectedModelValue = '',
  onProviderOptionSelect = () => {},
  onModelOptionSelect = () => {},
}) {
  const selectedModelLabel = String(
    modelGroups
      .flatMap((groupEntry) => groupEntry.options || [])
      .find((option) => option.id === selectedModelValue)?.displayLabel
    || selectedModelValue
    || activeProvider?.defaultModel
    || 'Model',
  )
  const selectedModelGroup = React.useMemo(() => {
    const selectedId = String(selectedModelValue || '').trim()
    if (!selectedId) return ''
    const groupEntry = modelGroups.find((entry) => (
      Array.isArray(entry?.options)
      && entry.options.some((option) => String(option?.id || '').trim() === selectedId)
    ))
    return String(groupEntry?.group || '').trim()
  }, [modelGroups, selectedModelValue])
  const effectiveExpandedGroup = expandedGroup === MANUAL_GROUP_COLLAPSE
    ? ''
    : (String(expandedGroup || '').trim() || selectedModelGroup)

  return (
    <div className="relative flex min-w-0 shrink-0 items-center rounded-lg bg-surface-panel-alt/35" data-ui="provider-model-selector">
      <div ref={providerMenuRef} className="relative w-fit max-w-[9rem] shrink-0">
        <button
          type="button"
          onClick={() => {
            setProviderMenuOpen((prev) => !prev)
            setModelMenuOpen(false)
          }}
          className={[
            'inline-flex h-7 w-full items-center justify-between gap-2 rounded-l-lg bg-transparent px-2.5 text-[10.5px] transition-colors',
            providerMenuOpen
              ? 'text-text-primary'
              : 'text-text-secondary hover:text-text-primary',
          ].join(' ')}
          aria-haspopup="listbox"
          aria-expanded={providerMenuOpen}
          aria-label="Provider"
          title={providerLabel}
          data-ui="provider-model-selector-provider-trigger"
        >
          <span className="truncate text-left font-medium text-text-subtle">{providerLabel}</span>
          <ChevronDownIcon open={providerMenuOpen} />
        </button>

        {providerMenuOpen && (
          <div className="absolute bottom-[calc(100%+6px)] left-0 z-[70] w-56 max-w-[88vw] rounded-lg border border-surface-border bg-surface-panel p-1 shadow-[0_14px_32px_rgb(var(--theme-shadow-rgb)_/_0.28)]" data-ui="provider-model-selector-provider-menu">
            <div className="max-h-56 overflow-y-auto pr-0.5" role="listbox" aria-label="Provider options">
              {configured.map((provider) => {
                const providerId = String(provider?.id || '').trim()
                if (!providerId) return null
                const optionLabel = String(provider?.name || providerId)
                const selected = providerId === String(selectedProvider || '').trim()
                return (
                  <button
                    key={providerId}
                    type="button"
                    onClick={() => onProviderOptionSelect(providerId)}
                    className={[
                      'min-h-7 w-full rounded-md border px-2 py-1 text-left text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent/35',
                      selected
                        ? 'border-transparent bg-surface-panel-alt text-text-primary font-medium'
                        : 'border-transparent text-text-subtle hover:bg-surface-panel-alt hover:text-text-primary',
                    ].join(' ')}
                    role="option"
                    aria-selected={selected}
                    title={optionLabel}
                    data-ui="provider-model-selector-provider-option"
                  >
                    <span className="block truncate">{optionLabel}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {activeProvider && activeProvider.noKeyRequired && !activeProvider.localAvailable ? (
        <span className="px-2 text-[11px] text-text-muted">Not running</span>
      ) : activeProvider && modelList.length === 0 ? (
        <span className="px-2 text-[11px] text-text-muted">No models loaded</span>
      ) : activeProvider && (
        <div ref={modelMenuRef} className="relative w-fit min-w-0 max-w-[12rem] shrink-0 border-l border-surface-border/20">
          <button
            type="button"
            onClick={() => {
              const opening = !effectiveModelMenuOpen
              if (opening) {
                setExpandedGroup(selectedModelGroup)
              }
              if (typeof modelMenuOpenOverride !== 'boolean') {
                setModelMenuOpen((prev) => !prev)
              }
              setProviderMenuOpen(false)
            }}
            className={[
              'inline-flex h-7 w-full items-center justify-between gap-2 rounded-r-lg bg-transparent px-2.5 text-[10.5px] transition-colors',
              effectiveModelMenuOpen
                ? 'text-text-primary'
                : 'text-text-secondary hover:text-text-primary',
            ].join(' ')}
            aria-haspopup="listbox"
            aria-expanded={effectiveModelMenuOpen}
            aria-label="Model"
            title={selectedModelLabel}
            data-ui="provider-model-selector-model-trigger"
          >
            <span className="min-w-0 flex-1 truncate text-left font-medium text-text-subtle">
              {selectedModelLabel}
            </span>
            <ChevronDownIcon open={effectiveModelMenuOpen} />
          </button>

          {effectiveModelMenuOpen && (
            <div className="absolute right-0 bottom-[calc(100%+6px)] z-[70] w-80 max-w-[88vw] rounded-lg border border-surface-border bg-surface-panel p-1 shadow-[0_14px_32px_rgb(var(--theme-shadow-rgb)_/_0.28)]" data-ui="provider-model-selector-model-menu">
              <div className="max-h-72 overflow-y-auto pr-0.5" role="listbox" aria-label="Model options">
                {modelMenuTopContent && (
                  <div className="mb-1 px-0.5 pb-1" data-ui="provider-model-selector-menu-top">
                    {modelMenuTopContent}
                  </div>
                )}
                {modelGroups.map((groupEntry) => (
                  <div key={groupEntry.group || 'models'} className="mb-0.5 last:mb-0">
                    {groupEntry.group ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          setExpandedGroup(effectiveExpandedGroup === groupEntry.group ? MANUAL_GROUP_COLLAPSE : groupEntry.group)
                        }}
                        className="flex min-h-7 w-full items-center justify-between rounded-md px-2 py-1 text-[11px] transition-colors text-text-secondary hover:bg-surface-panel-alt hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent/35"
                        title={groupEntry.group}
                        data-ui="provider-model-selector-model-group"
                      >
                        <span className="mr-2 block min-w-0 flex-1 truncate text-left font-medium">
                          {groupEntry.group}
                        </span>
                        <ChevronDownIcon open={effectiveExpandedGroup === groupEntry.group} />
                      </button>
                    ) : null}

                    {(!groupEntry.group || effectiveExpandedGroup === groupEntry.group || modelGroups.length === 1) && (
                      <div className={groupEntry.group ? 'mt-0.5' : ''}>
                        {groupEntry.options.map((option) => {
                          const selected = option.id === selectedModelValue
                          const selectable = option.selectable !== false
                          const runtimeDetail = String(option.providerRuntimeBadge?.label || '').trim()
                          const optionTitle = !selectable
                            ? (option.unavailableReason || `${option.label} is unavailable.`)
                            : option.providerRuntimeBadge?.title
                            ? `${option.label} - ${option.providerRuntimeBadge.title}`
                            : option.label
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => onModelOptionSelect(option.id)}
                              disabled={!selectable}
                              className={[
                                'group mb-0.5 flex min-h-7 w-full items-center gap-2 rounded-md border px-2 py-1 text-left text-[11px] font-normal transition-colors last:mb-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent/35',
                                !selectable
                                  ? 'cursor-not-allowed border-transparent text-text-muted opacity-50'
                                  : selected
                                  ? 'border-transparent bg-surface-panel-alt text-text-primary font-medium'
                                  : 'border-transparent text-text-muted hover:bg-surface-panel-alt hover:text-text-secondary',
                              ].join(' ')}
                              role="option"
                              aria-selected={selected}
                              aria-disabled={!selectable}
                              title={optionTitle}
                              data-ui="provider-model-selector-model-option"
                            >
                              <span className="block min-w-0 flex-1 truncate">{option.displayLabel || option.label}</span>
                              {runtimeDetail && (
                                <span
                                  className="min-w-0 max-w-0 overflow-hidden truncate whitespace-nowrap text-[10px] text-text-tertiary opacity-0 transition-opacity group-hover:max-w-[38%] group-hover:opacity-100 group-focus-visible:max-w-[38%] group-focus-visible:opacity-100"
                                  aria-hidden="true"
                                  data-ui="provider-model-selector-option-detail"
                                >
                                  {runtimeDetail}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
