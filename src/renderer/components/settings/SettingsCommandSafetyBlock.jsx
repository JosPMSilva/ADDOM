import React from 'react'
import SettingsSection from './SettingsSection.jsx'
import Icon from '../ui/Icon.jsx'
import { useSettingsTranslator } from './settings-panel-ui-utils.mjs'

export function CommandSafetyBlock({
  projectFolder,
}) {
  const t = useSettingsTranslator(['settings', 'core'])
  const activeWorkspaceRoot = String(projectFolder || '').trim()

  return (
    <SettingsSection
      title={<><Icon name="shield-check" className="text-text-secondary" size={18} weight="fill" /> {t('settings:blocks.commandSafety.productionTitle', { defaultValue: 'Guardrails' })}</>}
      description={t('settings:blocks.commandSafety.productionDescription', {
        defaultValue: 'Hard guardrails stay on in all permission modes. Approvals only change when a turn pauses for risk-sensitive actions.',
      })}
    >
      <div className="mt-2 flex flex-col" data-ui="settings-guardrails-diagnostics">
        <div className="border-b border-surface-border/55 py-3">
          <p className="text-xs font-medium text-text-primary">{t('settings:blocks.commandSafety.riskyActionApprovals.title', { defaultValue: 'Risky-action approvals' })}</p>
          <p className="mt-1 text-[11px] leading-4 text-text-secondary">
            {t('settings:blocks.commandSafety.riskyActionApprovals.description', {
              defaultValue: 'First risky network fetches and project dependency installs can be remembered for the active project during this app session. Outside-workspace paths, destructive actions, global installs, and elevated host access still require explicit approval.',
            })}
          </p>
          {activeWorkspaceRoot ? (
            <p className="mt-2 break-all text-[11px] text-text-tertiary">
              {t('settings:blocks.commandSafety.riskyActionApprovals.activeProjectScope', { defaultValue: 'Active project session scope:' })} <span className="font-mono font-medium text-text-secondary">{activeWorkspaceRoot}</span>
            </p>
          ) : (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-text-secondary">
              <Icon name="info" size={12} /> {t('settings:blocks.commandSafety.riskyActionApprovals.noActiveWorkspace', { defaultValue: 'No active workspace detected yet. Session-scoped risky-action memory starts once a project root is open.' })}
            </p>
          )}
        </div>

        <div className="py-3">
          <p className="text-xs font-medium text-text-primary">{t('settings:blocks.commandSafety.modeEffect.title', { defaultValue: 'Mode effect' })}</p>
          <p className="mt-1 text-[11px] leading-4 text-text-secondary">
            {t('settings:blocks.commandSafety.modeEffect.description', {
              defaultValue: '[[canon:ask]] pauses on risky actions. [[canon:autonomy]] keeps routine workspace work moving and only interrupts on first risky network/install use or hard guardrail blocks. [[canon:full_access]] auto-approves routine execution while explicit hard-deny policy outcomes still block.',
            })}
          </p>
        </div>
      </div>
    </SettingsSection>
  )
}
