import React from 'react'

import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'

export default function ThreadPromotionOriginNote({
  origin = null,
  busy = false,
  error = '',
  onInspectSource = () => {},
}) {
  const { t } = useRendererTranslation(['core'])
  if (!origin || origin.kind !== 'agent_promotion') return null
  const role = String(origin.sourceRoleLabel || origin.sourceRoleId || 'agent')
  const sequence = Math.max(1, Number(origin.sourceSequence || 0) || 1)
  const artifactCount = Math.max(0, Number(origin.artifactCount || 0) || 0)
  return (
    <div
      className="w-full border-b border-surface-border/55 px-1 pb-2 text-[11px] text-text-tertiary"
      style={{ maxWidth: 'var(--app-chat-content-max-width)' }}
      data-ui="thread-promotion-origin"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate">
          {t('core:agentConversation.origin.label', {
            defaultValue: 'Branched from {{role}} · Turn {{turn}}', role, turn: sequence,
          })}
        </span>
        {origin.sourceAvailable ? (
          <button
            type="button"
            disabled={busy}
            onClick={onInspectSource}
            className="shrink-0 rounded px-1 py-0.5 text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:opacity-50"
          >
            {t('core:agentConversation.origin.inspect', { defaultValue: 'Inspect source' })}
          </button>
        ) : (
          <span className="shrink-0 text-text-muted">
            {t('core:agentConversation.origin.unavailable', { defaultValue: 'Source unavailable' })}
          </span>
        )}
      </div>
      {artifactCount > 0 ? (
        <p className="mt-1 text-text-muted">
          {t('core:agentConversation.origin.artifacts', {
            defaultValue: '{{count}} unmerged source artifact(s)', count: artifactCount,
          })}
        </p>
      ) : null}
      {error ? <p className="mt-1 text-danger" role="status">{error}</p> : null}
    </div>
  )
}
