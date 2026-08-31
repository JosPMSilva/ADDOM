import React from 'react'
import { useRendererTranslation } from '../i18n/use-renderer-translation.mjs'

function PolicyRows({ rows = [] }) {
  return (
    <div className="grid grid-cols-1 gap-1.5">
      {rows.map((row) => (
        <div key={row.key} className="grid grid-cols-[112px_minmax(0,1fr)] gap-2 items-start">
          <p className="text-[11px] text-text-tertiary">{row.label}</p>
          <p className={row.mono ? 'text-xs text-text-secondary font-mono break-all' : 'text-xs text-text-secondary'}>
            {row.value}
          </p>
        </div>
      ))}
    </div>
  )
}

function PolicyParagraphList({ title, items = [], titleClass, itemClass, boxClass }) {
  if (items.length === 0) return null
  return (
    <div className={boxClass}>
      <p className={titleClass}>{title}</p>
      {items.map((item, index) => (
        <p key={`${item}-${index}`} className={itemClass}>
          {item}
        </p>
      ))}
    </div>
  )
}

export function RunCommandPolicyPanel({ view }) {
  const { t } = useRendererTranslation(['core'])
  if (!view) return null
  const { rows = [], warnings = [], hintCallouts = [] } = view
  const requiresHostFullAccess = !!view?.actionsVariant?.requireExplicitHostFullAccess
  const requiresWslCompatibilityApproval = !!view?.actionsVariant?.requireExplicitWslCompatibilityApproval

  return (
    <div className="rounded-lg border border-surface-border/70 bg-transparent p-3 space-y-3">
      <p className="text-xs font-medium text-text-secondary">{t('core:toolApprovalOverlay.productionPolicy.command', { defaultValue: 'Command policy' })}</p>

      <PolicyRows rows={rows} />

      {warnings.length > 0 && (
        <div className="border-l border-warning-border/70 pl-3">
          <p className="text-[11px] font-medium text-warning-soft mb-1">{t('core:toolApprovalOverlay.policy.warnings', { defaultValue: 'Warnings' })}</p>
          <ul className="space-y-0.5">
            {warnings.map((warning, idx) => (
              <li key={`${idx}:${warning}`} className="text-xs text-warning-soft">{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {requiresHostFullAccess && (
        <div className="border-l border-danger-border/70 pl-3">
          <p className="text-[11px] font-medium text-danger-softer mb-1">{t('core:toolApprovalOverlay.productionPolicy.hostAccessRequired', { defaultValue: 'Host access required' })}</p>
          <p className="text-xs text-danger-softer">
            {t('core:toolApprovalOverlay.productionPolicy.hostAccessDescription', { defaultValue: 'Use an explicit host action if this should run outside workspace-safe limits.' })}
          </p>
        </div>
      )}

      {requiresWslCompatibilityApproval && (
        <div className="border-l border-warning-border/70 pl-3">
          <p className="text-[11px] font-medium text-warning-soft mb-1">{t('core:toolApprovalOverlay.productionPolicy.wslCompatibility', { defaultValue: 'WSL compatibility' })}</p>
          <p className="text-xs text-warning-soft">
            {t('core:toolApprovalOverlay.productionPolicy.wslDescription', { defaultValue: 'WSL can reach host files. Use the WSL action only when that is intended.' })}
          </p>
        </div>
      )}

      {hintCallouts.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-text-tertiary">{t('core:toolApprovalOverlay.productionPolicy.notes', { defaultValue: 'Notes' })}</p>
          <ul className="space-y-0.5">
            {hintCallouts.map((hint, idx) => (
              <li key={`${idx}:${hint}`} className="text-xs text-text-secondary">{hint}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function BrowserActionPolicyPanel({ view }) {
  const { t } = useRendererTranslation(['core'])
  if (!view) return null
  const { rows = [], warnings = [], hintCallouts = [] } = view

  return (
    <div className="rounded-lg border border-surface-border/70 bg-transparent p-3 space-y-3">
      <p className="text-xs font-medium text-text-secondary">{t('core:toolApprovalOverlay.productionPolicy.browser', { defaultValue: 'Browser policy' })}</p>

      <PolicyRows rows={rows} />

      <PolicyParagraphList
        title={t('core:toolApprovalOverlay.policy.warnings', { defaultValue: 'Warnings' })}
        items={warnings}
        boxClass="border-l border-warning-border/70 pl-3 space-y-1"
        titleClass="text-[11px] font-medium text-warning-soft"
        itemClass="text-xs text-warning-soft leading-relaxed"
      />
      <PolicyParagraphList
        title={t('core:toolApprovalOverlay.productionPolicy.notes', { defaultValue: 'Notes' })}
        items={hintCallouts}
        boxClass="space-y-1"
        titleClass="text-[11px] font-medium text-text-tertiary"
        itemClass="text-xs text-text-secondary leading-relaxed"
      />
    </div>
  )
}

export function TerminalSessionPolicyPanel({ view }) {
  const { t } = useRendererTranslation(['core'])
  if (!view) return null
  const { rows = [], warnings = [], hintCallouts = [] } = view
  const action = String(view?.policy?.action || '').trim().toLowerCase()
  const sessionId = String(view?.policy?.sessionId || '').trim()
  const visibilityCallout = action === 'open'
    ? t('core:toolApprovalOverlay.policy.terminalVisibleOpen', { defaultValue: 'If approved, ADDOM opens a visible chat terminal session. The model keeps using that same session through explicit terminal_session_* calls.' })
    : (sessionId
      ? t('core:toolApprovalOverlay.policy.terminalVisibleReuse', { defaultValue: 'This request targets the visible chat terminal session {{sessionId}}. It does not create a hidden shell path.', sessionId })
      : '')

  return (
    <div className="rounded-lg border border-surface-border/70 bg-transparent p-3 space-y-3">
      <p className="text-xs font-medium text-text-secondary">{t('core:toolApprovalOverlay.productionPolicy.terminal', { defaultValue: 'Terminal policy' })}</p>

      <PolicyRows rows={rows} />

      {visibilityCallout && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-text-tertiary">{t('core:toolApprovalOverlay.policy.visibility', { defaultValue: 'Visibility' })}</p>
          <p className="text-xs text-text-secondary leading-relaxed">{visibilityCallout}</p>
        </div>
      )}
      <PolicyParagraphList
        title={t('core:toolApprovalOverlay.policy.warnings', { defaultValue: 'Warnings' })}
        items={warnings}
        boxClass="border-l border-warning-border/70 pl-3 space-y-1"
        titleClass="text-[11px] font-medium text-warning-soft"
        itemClass="text-xs text-warning-soft leading-relaxed"
      />
      <PolicyParagraphList
        title={t('core:toolApprovalOverlay.productionPolicy.notes', { defaultValue: 'Notes' })}
        items={hintCallouts}
        boxClass="space-y-1"
        titleClass="text-[11px] font-medium text-text-tertiary"
        itemClass="text-xs text-text-secondary leading-relaxed"
      />
    </div>
  )
}
