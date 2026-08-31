import React from 'react'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'

export default function ArtifactScopeFilter({
  activeThreadId = '',
  onChange,
  resultCount = 0,
  scope = 'project',
}) {
  const { t } = useRendererTranslation(['core'])
  const hasActiveThread = !!String(activeThreadId || '').trim()
  const options = [
    ['project', t('core:artifacts.scope.entireProject', { defaultValue: 'Project' })],
    ['thread', t('core:artifacts.scope.thisThread', { defaultValue: 'Thread' })],
  ]

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1" aria-label={t('core:artifacts.scope.label', { defaultValue: 'Artifact scope' })} role="group">
        {options.map(([value, label]) => {
          const disabled = value === 'thread' && !hasActiveThread
          const selected = scope === value
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChange?.(value)}
              className={`rounded-md px-2 py-1 text-[11px] transition-colors ${selected ? 'bg-surface-panel text-text-primary' : 'text-text-muted hover:text-text-primary'} disabled:cursor-not-allowed disabled:opacity-40`}
            >
              {label}
            </button>
          )
        })}
      </div>
      <span aria-live="polite" className="shrink-0 text-[10px] text-text-tertiary">
        {t('core:artifacts.scope.resultCount', {
          defaultValue: '{{count}} files',
          count: resultCount,
        })}
      </span>
    </div>
  )
}
