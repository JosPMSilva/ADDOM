import React from 'react'
import { useSettingsTranslator } from './settings-panel-ui-utils.mjs'

export default function PermissionRow({
  label,
  description,
  locked,
  enabled = true,
  disabled = false,
  onToggle,
}) {
  const t = useSettingsTranslator(['settings', 'core'])
  const isDisabled = disabled === true
  return (
    <div className={[
      'grid gap-2 border-b border-surface-border/70 px-1 py-3 last:border-b-0 md:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)] md:items-center md:gap-4',
      isDisabled ? 'opacity-60' : '',
    ].join(' ')}>
      <div className="min-w-0">
        <p className="font-display text-xs font-semibold text-text-primary">{label}</p>
        <p className="mt-1 text-xs leading-5 text-text-secondary">{description}</p>
      </div>
      <div className="shrink-0 md:justify-self-end">
        {locked ? (
          <span className="text-[11px] font-bold tracking-wide uppercase text-success">
            {t('settings:common.permissionRow.alwaysOn', { defaultValue: 'Always on' })}
          </span>
        ) : (
          <button
            type="button"
            role="switch"
            aria-checked={!!enabled}
            aria-disabled={isDisabled}
            aria-label={String(label || t('settings:common.permissionRow.toggleSetting', { defaultValue: 'Toggle setting' }))}
            disabled={isDisabled}
            onClick={() => {
              if (isDisabled) return
              onToggle?.()
            }}
            className={[
              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-75 disabled:cursor-not-allowed disabled:opacity-60',
              enabled ? 'bg-accent' : 'bg-surface-panel border-surface-border border',
            ].join(' ')}
            title={isDisabled
              ? t('settings:common.permissionRow.unavailable', { defaultValue: 'Unavailable' })
              : (enabled
                ? t('settings:common.permissionRow.clickToDisable', { defaultValue: 'Click to disable' })
                : t('settings:common.permissionRow.clickToEnable', { defaultValue: 'Click to enable' }))}
          >
            <span className={[
              'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-75',
              enabled ? 'translate-x-4 border-accent border' : 'translate-x-1 border-surface-border border',
            ].join(' ')} />
          </button>
        )}
      </div>
    </div>
  )
}
