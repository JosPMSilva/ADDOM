import React from 'react'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'

export default function ProviderSwitchContextBanner({
  hint,
  disabled,
  onInjectMemory,
  onInjectArtifacts,
  onInjectBoth,
  onDismiss,
}) {
  const { t } = useRendererTranslation(['core'])
  if (!hint) return null
  const fromProvider = hint.fromProvider || t('chat.providerSwitchContextBanner.previousProvider', {
    defaultValue: 'previous provider',
  })
  const toProvider = hint.toProvider || t('chat.providerSwitchContextBanner.newProvider', {
    defaultValue: 'new provider',
  })
  const fromModel = hint.fromModel ? ` (${hint.fromModel})` : ''
  const toModel = hint.toModel ? ` (${hint.toModel})` : ''

  const routeLabel = `${fromProvider}${fromModel} -> ${toProvider}${toModel}`
  const dismissLabel = t('chat.providerSwitchContextBanner.dismiss', { defaultValue: 'Dismiss' })

  return (
    <div
      className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-surface-border/70 bg-surface-panel-alt/75 px-2.5 py-1.5 text-[11px]"
      data-ui="provider-switch-context-banner"
    >
      <div className="flex min-w-0 flex-[1_1_18rem] flex-wrap items-center gap-x-2 gap-y-1">
        <span className="shrink-0 font-medium text-text-primary">
          {t('chat.providerSwitchContextBanner.title', { defaultValue: 'Provider/model changed' })}
        </span>
        <span className="hidden h-3 w-px shrink-0 bg-surface-border/80 sm:inline-block" aria-hidden="true" />
        <span className="min-w-0 flex-[1_1_13rem] truncate font-mono text-text-secondary" title={routeLabel}>
          {fromProvider}{fromModel}
          <span className="mx-1 font-sans text-text-muted">-&gt;</span>
          {toProvider}{toModel}
        </span>
        <span className="hidden shrink-0 text-text-muted md:inline">
          {t('chat.providerSwitchContextBanner.continuityHint', {
            defaultValue: 'Inject context to preserve project continuity.',
          })}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onInjectBoth}
          disabled={disabled}
          data-ui="provider-switch-inject-both"
          className="h-6 rounded-md border border-border-strong bg-surface-panel px-2 text-[11px] font-medium text-text-primary transition-colors hover:border-border-hover hover:bg-surface-border/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('chat.providerSwitchContextBanner.injectBoth', { defaultValue: 'Inject context' })}
        </button>
        <button
          type="button"
          onClick={onInjectMemory}
          disabled={disabled}
          data-ui="provider-switch-inject-memory"
          className="h-6 rounded-md px-1.5 text-[11px] font-medium text-text-secondary transition-colors hover:bg-surface-panel hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('chat.providerSwitchContextBanner.injectMemory', { defaultValue: 'Memory' })}
        </button>
        <button
          type="button"
          onClick={onInjectArtifacts}
          disabled={disabled}
          data-ui="provider-switch-inject-artifacts"
          className="h-6 rounded-md px-1.5 text-[11px] font-medium text-text-secondary transition-colors hover:bg-surface-panel hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('chat.providerSwitchContextBanner.injectArtifacts', {
            defaultValue: '[[canon:artifacts]]',
          })}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          disabled={disabled}
          data-ui="provider-switch-dismiss"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-panel hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={dismissLabel}
          title={dismissLabel}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
