import React from 'react'
import { useSettingsTranslator } from './settings-panel-ui-utils.mjs'

function OpenRouterModelRow({ model, namespace, onToggleVisibility }) {
  const t = useSettingsTranslator(['settings'])
  const effectiveVisible = model.visibilityBaseVisible

  return (
    <div className="flex min-h-[48px] items-center gap-3 border-b border-surface-border/55 py-2 last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-text-primary">{model.label || model.id}</span>
        <span className="mt-0.5 block truncate font-mono text-[10px] text-text-muted">{model.id}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={effectiveVisible}
        aria-label={t('settings:blocks.openRouterCatalogVisibility.modelRow.visibilityAriaLabel', {
          defaultValue: '{{label}} visibility',
          label: model.label || model.id,
        })}
        onClick={() => onToggleVisibility(model.id, namespace, !effectiveVisible)}
        className={[
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-75',
          effectiveVisible ? 'border-accent-muted bg-accent' : 'border-surface-border bg-surface-panel',
        ].join(' ')}
      >
        <span className={[
          'h-3.5 w-3.5 rounded-full border bg-white transition-transform duration-75',
          effectiveVisible ? 'translate-x-4 border-accent' : 'translate-x-1 border-surface-border',
        ].join(' ')} />
      </button>
    </div>
  )
}

const MemoOpenRouterModelRow = React.memo(OpenRouterModelRow)
MemoOpenRouterModelRow.displayName = 'MemoOpenRouterModelRow'

export { OpenRouterModelRow }
export default MemoOpenRouterModelRow
