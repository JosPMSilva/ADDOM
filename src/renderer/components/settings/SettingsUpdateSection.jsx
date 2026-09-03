import React from 'react'
import { useSettingsTranslator } from './settings-panel-ui-utils.mjs'

function UpdateStatusText({ status, info, pct, t }) {
  const className = 'text-[11px] font-medium text-text-secondary'
  if (!status) return <span className={className}>{t('settings:blocks.updates.status.upToDate', { defaultValue: 'Up to date' })}</span>
  if (status === 'checking') return <span className={className}>{t('settings:blocks.updates.status.checking', { defaultValue: 'Checking for updates...' })}</span>
  if (status === 'not-available') return <span className={className}>{t('settings:blocks.updates.status.latest', { defaultValue: 'No updates found.' })}</span>
  if (status === 'available') return <span className={className}>{t('settings:blocks.updates.status.available', { defaultValue: 'Update available - v{{version}}', version: info?.version })}</span>
  if (status === 'downloading') return <span className={className}>{t('settings:blocks.updates.status.downloading', { defaultValue: 'Downloading... {{percent}}%', percent: pct })}</span>
  if (status === 'downloaded') return <span className={className}>{t('settings:blocks.updates.status.readyToInstall', { defaultValue: 'v{{version}} ready to install', version: info?.version })}</span>
  if (status === 'error') {
    const errorCode = String(info?.code || '').trim()
    if (errorCode === 'unavailable') {
      return <span className="text-[11px] font-medium text-danger-soft">{t('settings:blocks.updates.status.errorUnavailable', { defaultValue: 'The update service is not available yet. Try again later.' })}</span>
    }
    if (errorCode === 'network') {
      return <span className="text-[11px] font-medium text-danger-soft">{t('settings:blocks.updates.status.errorNetwork', { defaultValue: "Couldn't reach the update service. Check your connection and try again." })}</span>
    }
    return <span className="text-[11px] font-medium text-danger-soft">{t('settings:blocks.updates.status.error', { defaultValue: "Couldn't check for updates. Try again later." })}</span>
  }
  return null
}

const actionClass = 'min-h-7 rounded-md border border-surface-border bg-transparent px-2.5 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:border-border-hover hover:bg-surface-panel hover:text-text-primary'

export default function SettingsUpdateSection({ status, info, pct, onCheck, onDownload, onInstall }) {
  const t = useSettingsTranslator(['settings'])
  return (
    <div className="pt-1">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-3 border-b border-surface-border/55 py-2.5">
        <UpdateStatusText status={status} info={info} pct={pct} t={t} />
        <div className="flex items-center gap-2">
          {(status === null || status === 'not-available' || status === 'error') && (
            <button type="button" onClick={onCheck} className={actionClass}>
              {t('settings:blocks.updates.actions.checkForUpdates', { defaultValue: 'Check for updates' })}
            </button>
          )}
          {status === 'available' && (
            <button type="button" onClick={onDownload} className={actionClass}>
              {t('settings:blocks.updates.actions.download', { defaultValue: 'Download v{{version}}', version: info?.version })}
            </button>
          )}
          {status === 'downloaded' && (
            <button type="button" onClick={onInstall} className={actionClass}>
              {t('settings:blocks.updates.actions.restartAndInstall', { defaultValue: 'Restart and Install' })}
            </button>
          )}
        </div>
      </div>
      {status === 'downloading' ? (
        <div className="h-px w-full overflow-hidden bg-surface-border/55">
          <div className="h-full bg-text-secondary transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  )
}
