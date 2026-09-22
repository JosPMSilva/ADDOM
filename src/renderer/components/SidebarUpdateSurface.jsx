import React from 'react'
import { useRendererTranslation } from '../i18n/use-renderer-translation.mjs'
import Icon from './ui/Icon.jsx'
import { useDialogFocusTrap } from './use-dialog-focus-trap.mjs'
import { useDialogEscapeDismiss } from './use-dialog-escape-dismiss.mjs'
import {
  VISIBLE_UPDATE_PHASES,
  getUpdateStateIcon,
  getUpdateStatus,
  getUpdateVersion,
} from './sidebar-update-presentation.mjs'

function DownloadProgress({ percent, label }) {
  const normalized = Math.max(0, Math.min(100, Number(percent) || 0))
  const radius = 12
  const circumference = 2 * Math.PI * radius
  return (
    <svg
      viewBox="0 0 28 28"
      className="absolute left-1/2 top-1/2 size-7 -translate-x-1/2 -translate-y-1/2 -rotate-90"
      role="progressbar"
      aria-label={label}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={normalized}
    >
      <circle cx="14" cy="14" r={radius} fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="1.5" />
      <circle
        cx="14"
        cy="14"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - normalized / 100)}
      />
    </svg>
  )
}

export function UpdateInstallConfirmation({ status, onConfirm, onCancel }) {
  const { t } = useRendererTranslation(['settings', 'core'])
  const ref = React.useRef(null)
  const titleId = React.useId()
  useDialogFocusTrap(true, ref)
  useDialogEscapeDismiss(true, ref, onCancel)
  const action = t('settings:blocks.updates.actions.restartAndInstall')
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-overlay-scrim p-3"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
      <section ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        data-ui="update-install-confirmation"
        className="w-72 max-w-full rounded-lg bg-surface-panel p-3 text-text-primary shadow-sm outline-none">
        <h2 id={titleId} className="break-words text-xs font-medium">{action}?</h2>
        <p className="mt-1 break-words [overflow-wrap:anywhere] text-[11px] leading-4 text-text-secondary">{status}</p>
        <div className="mt-3 flex flex-wrap justify-end gap-2 text-[11px]">
          <button type="button" onClick={onCancel} className="rounded px-2 py-1.5 text-text-secondary hover:bg-surface-panel-alt focus-visible:outline focus-visible:outline-1">{t('core:app.confirmDialog.cancel')}</button>
          <button type="button" onClick={onConfirm} className="max-w-full break-words rounded bg-surface-panel-alt px-2 py-1.5 hover:bg-surface-panel-hover focus-visible:outline focus-visible:outline-1">{action}</button>
        </div>
      </section>
    </div>
  )
}

export function SidebarUpdateButton({
  snapshot,
  collapsed = false,
  label,
  busy = false,
  tooltipId,
  buttonRef,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
}) {
  const { t } = useRendererTranslation(['settings'])
  const version = getUpdateVersion(snapshot)
  if (!version || !VISIBLE_UPDATE_PHASES.has(snapshot?.phase)) return null
  const status = getUpdateStatus(t, snapshot)
  const blockerText = snapshot.installBlockers?.map((blocker) => blocker.label).join('. ')
  const accessibleStatus = blockerText ? `${status}. ${blockerText}` : status
  const iconName = getUpdateStateIcon(snapshot)
  const briefState = snapshot.phase === 'ready'
    ? snapshot.installBlockers?.length ? 'waiting' : 'restart'
    : snapshot.phase === 'error' ? 'retry' : snapshot.phase === 'available' ? 'update' : 'installing'
  const briefLabel = snapshot.phase === 'downloading'
    ? `${Math.round(Math.max(0, Math.min(100, Number(snapshot.progressPercent) || 0)))}%`
    : t(`settings:blocks.updates.sidebar.labels.${briefState}`)

  return (
    <button
      ref={buttonRef}
      type="button"
      data-ui="sidebar-update"
      data-update-phase={snapshot.phase}
      aria-label={label || accessibleStatus}
      aria-describedby={tooltipId}
      aria-disabled={busy || snapshot.phase === 'downloading' || snapshot.phase === 'installing' || (snapshot.phase === 'ready' && snapshot.installBlockers?.length > 0)}
      aria-haspopup={snapshot.phase === 'ready' && !snapshot.installBlockers?.length ? 'dialog' : undefined}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className={`group flex w-full items-center rounded-md py-2.5 text-warning transition-colors duration-150 hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong ${collapsed ? 'justify-center px-0' : 'justify-start gap-3 px-3'}`}
    >
      <span className={`relative flex size-[18px] shrink-0 items-center justify-center transition-transform duration-300 ${collapsed ? 'group-hover:scale-110' : 'group-hover:translate-x-0.5'}`}>
        {snapshot.phase === 'downloading' && <DownloadProgress percent={snapshot.progressPercent} label={status} />}
        <Icon name={iconName} className={`text-[17px] ${snapshot.phase === 'installing' ? 'animate-spin motion-reduce:animate-none' : ''}`} />
      </span>
      {!collapsed && <span data-ui="sidebar-update-label" className="min-w-0 text-[13px] font-semibold font-display tracking-tight text-text-secondary transition-transform duration-300 group-hover:translate-x-0.5">{briefLabel}</span>}
    </button>
  )
}

