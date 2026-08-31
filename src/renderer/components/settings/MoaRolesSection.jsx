import React from 'react'
import { useSettingsTranslator } from './settings-panel-ui-utils.mjs'

export default function MoaRolesSection({ moaRoles = [], onEdit }) {
  const t = useSettingsTranslator(['settings'])

  if (moaRoles.length === 0) {
    return (
      <p className="border-b border-surface-border/55 py-5 text-xs text-text-muted">
        {t('settings:blocks.moaAgents.roles.guidance', {
          defaultValue: 'Role names must be unique. Role IDs are generated and immutable.',
        })}
      </p>
    )
  }

  return (
    <div className="border-t border-surface-border/55">
      {moaRoles.map((role) => (
        <button
          key={role.id}
          type="button"
          onClick={() => onEdit(role)}
          aria-label={`${t('settings:blocks.moaAgents.roles.edit', { defaultValue: 'Edit' })} ${role.name}`}
          className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-surface-border/55 py-2.5 text-left transition-colors hover:bg-surface-panel/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40"
        >
          <span className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-text-primary">{role.name}</p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-text-muted">{role.providerId} / {role.model}</p>
            {role.templateLabel ? <p className="mt-0.5 truncate text-[10px] text-text-muted">{role.templateLabel}</p> : null}
          </span>
          <span aria-hidden="true" className="shrink-0 text-sm text-text-muted">›</span>
        </button>
      ))}
    </div>
  )
}
