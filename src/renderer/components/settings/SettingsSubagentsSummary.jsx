import React from 'react'
import { useSettingsTranslator } from './settings-panel-ui-utils.mjs'

export default function SettingsSubagentsSummary({
  roleCount = 0,
  agentSettings = null,
  onManage = () => {},
}) {
  const t = useSettingsTranslator(['settings'])
  const rolesLabel = t('settings:shell.badges.rolesCount', {
    defaultValue: '{{count}} roles',
    count: roleCount,
  })

  return (
    <div className="flex min-h-12 items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-text-primary">
          {t('settings:blocks.moaAgents.title', { defaultValue: 'Agents' })}
        </p>
        <p className="mt-0.5 text-[11px] leading-4 text-text-secondary">
          {agentSettings?.enabled === false
            ? t('settings:blocks.moaAgents.runtime.disabled', { defaultValue: 'Agent delegation is disabled.' })
            : t('settings:blocks.moaAgents.runtime.summary', {
                defaultValue: '{{profile}} capacity · {{count}} active at once',
                profile: String(agentSettings?.defaultProfile || 'balanced'),
                count: Number(agentSettings?.limits?.maxLiveAgents || 8),
              })}
        </p>
      </div>
      <button
        type="button"
        onClick={onManage}
        data-ui="settings-manage-subagents"
        className="min-h-7 shrink-0 rounded-md px-2 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-panel hover:text-text-primary"
      >
        {rolesLabel} <span aria-hidden="true">›</span>
      </button>
    </div>
  )
}
