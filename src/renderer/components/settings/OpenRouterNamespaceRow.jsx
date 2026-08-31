import React from 'react'
import { useSettingsTranslator } from './settings-panel-ui-utils.mjs'
import { formatOpenRouterNamespaceLabel } from '../../../common/api-clients/model-catalog-visibility.mjs'
import { getLogoUrl } from '../../utils/model-logos.js'
import OpenRouterModelRow from './OpenRouterModelRow.jsx'
import { buildFixedSizeVirtualWindow } from '../../utils/fixed-size-virtual-window.mjs'

const MODEL_LIST_VIRTUALIZE_MIN_COUNT = 80
const MODEL_LIST_MAX_HEIGHT_PX = 560
const MODEL_LIST_ROW_HEIGHT_PX = 48
const MODEL_LIST_OVERSCAN = 8

export function OpenRouterModelList({ models = [], namespace = '', onSetModelVisibility = () => {} }) {
  const [scrollTop, setScrollTop] = React.useState(0)
  const useVirtualization = models.length >= MODEL_LIST_VIRTUALIZE_MIN_COUNT
  const virtualWindow = React.useMemo(() => buildFixedSizeVirtualWindow({
    itemCount: models.length,
    itemHeight: MODEL_LIST_ROW_HEIGHT_PX,
    viewportHeight: MODEL_LIST_MAX_HEIGHT_PX,
    scrollTop,
    overscan: MODEL_LIST_OVERSCAN,
  }), [models.length, scrollTop])

  if (!useVirtualization) {
    return models.map((model) => (
      <OpenRouterModelRow key={model.id} model={model} namespace={namespace} onToggleVisibility={onSetModelVisibility} />
    ))
  }

  const visibleModels = models.slice(virtualWindow.startIndex, virtualWindow.endIndex)
  return (
    <div className="overflow-y-auto" style={{ maxHeight: `${MODEL_LIST_MAX_HEIGHT_PX}px` }} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
      <div className="relative" style={{ height: `${virtualWindow.totalHeight}px` }}>
        {visibleModels.map((model, index) => {
          const absoluteIndex = virtualWindow.startIndex + index
          return (
            <div key={model.id} className="absolute left-0 right-0" style={{ top: `${absoluteIndex * MODEL_LIST_ROW_HEIGHT_PX}px` }}>
              <OpenRouterModelRow model={model} namespace={namespace} onToggleVisibility={onSetModelVisibility} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function OpenRouterNamespaceRow({ namespaceRow, onOpen, onToggleVisibility }) {
  const t = useSettingsTranslator(['settings'])
  const logoUrl = namespaceRow.models.length > 0 ? getLogoUrl(namespaceRow.models[0].visibilityProviderLogoPath) : null
  const label = namespaceRow.label || formatOpenRouterNamespaceLabel(namespaceRow.namespace)

  return (
    <div className="flex min-h-12 items-center gap-3 border-b border-surface-border/55 py-2.5 last:border-b-0">
      <button type="button" onClick={() => onOpen(namespaceRow.namespace)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        {logoUrl ? <img src={logoUrl} alt="" className="h-3.5 w-3.5 shrink-0 object-contain opacity-80 dark:invert" /> : null}
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-primary">{label}</span>
        <span className="text-[10px] text-text-muted">
          {t('settings:blocks.openRouterCatalogVisibility.namespaceRow.enabledCount', {
            defaultValue: '{{enabled}}/{{total}} enabled',
            enabled: namespaceRow.baseVisibleCount,
            total: namespaceRow.totalCount,
          })}
        </span>
        <span className="text-text-muted" aria-hidden="true">›</span>
      </button>
      <button
        type="button"
        role="switch"
        aria-checked={namespaceRow.effectiveVisible}
        aria-label={t('settings:blocks.openRouterCatalogVisibility.namespaceRow.visibilityAriaLabel', {
          defaultValue: '{{label}} namespace visibility',
          label,
        })}
        onClick={() => onToggleVisibility(namespaceRow.namespace, !namespaceRow.effectiveVisible)}
        className={[
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-75',
          namespaceRow.effectiveVisible ? 'border-accent-muted bg-accent' : 'border-surface-border bg-surface-panel',
        ].join(' ')}
      >
        <span className={[
          'h-3.5 w-3.5 rounded-full border bg-white transition-transform duration-75',
          namespaceRow.effectiveVisible ? 'translate-x-4 border-accent' : 'translate-x-1 border-surface-border',
        ].join(' ')} />
      </button>
    </div>
  )
}

const MemoOpenRouterNamespaceRow = React.memo(OpenRouterNamespaceRow)
MemoOpenRouterNamespaceRow.displayName = 'MemoOpenRouterNamespaceRow'

export { OpenRouterNamespaceRow }
export default MemoOpenRouterNamespaceRow
