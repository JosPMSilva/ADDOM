import React from 'react'
import { DIALOG_Z_STANDARD } from '../dialog-layering.mjs'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import { useDialogFocusTrap } from '../use-dialog-focus-trap.mjs'
import { useDialogEscapeDismiss } from '../use-dialog-escape-dismiss.mjs'
import { formatAgeMs, formatTimestamp } from './chat-utils.js'

function formatOpenAIBackgroundStatus(t, status = '') {
  const normalized = String(status || '').trim().toLowerCase()
  switch (normalized) {
    case 'polling':
      return t('backgroundJobs.status.polling', { defaultValue: 'Polling' })
    case 'cancel_requested':
      return t('backgroundJobs.status.cancelRequested', { defaultValue: 'Cancel requested' })
    case 'completed':
      return t('backgroundJobs.status.completed', { defaultValue: 'Completed' })
    case 'failed':
      return t('backgroundJobs.status.failed', { defaultValue: 'Failed' })
    case 'cancelled':
      return t('backgroundJobs.status.cancelled', { defaultValue: 'Cancelled' })
    case 'orphaned':
      return t('backgroundJobs.status.orphaned', { defaultValue: 'Orphaned' })
    default:
      return t('backgroundJobs.status.queued', { defaultValue: 'Queued' })
  }
}

function openAIBackgroundStatusClass(status = '') {
  const normalized = String(status || '').trim().toLowerCase()
  switch (normalized) {
    case 'completed':
      return 'border-success-border bg-success-bg text-success-soft'
    case 'failed':
    case 'cancelled':
    case 'orphaned':
      return 'border-danger-border bg-danger-bg text-danger-soft'
    case 'cancel_requested':
      return 'border-warning-border bg-warning-bg text-warning-soft'
    default:
      return 'border-surface-border bg-surface text-text-secondary'
  }
}

export default function BackgroundJobsModal({
  jobs,
  loading,
  error,
  lastUpdated,
  busyId,
  onRefresh,
  onStopJob,
  onStopAll,
  onClose,
}) {
  const { t } = useRendererTranslation(['core'])
  const rows = Array.isArray(jobs) ? jobs : []
  const hasRows = rows.length > 0
  const allBusy = busyId === '__all__'
  const dialogRef = React.useRef(null)
  useDialogFocusTrap(true, dialogRef)
  useDialogEscapeDismiss(true, dialogRef, onClose)

  return (
    <div className={`fixed inset-0 ${DIALOG_Z_STANDARD} flex items-center justify-center bg-overlay-scrim backdrop-blur-sm px-4`}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="background-jobs-modal-title"
        className="w-full max-w-4xl max-h-[82vh] overflow-hidden rounded-2xl border border-surface-border bg-surface-raised shadow-2xl focus:outline-none"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
          <div>
            <p id="background-jobs-modal-title" className="text-sm font-semibold text-text-primary">
              {t('backgroundJobs.title', { defaultValue: 'Background Jobs' })}
            </p>
            <p className="text-xs text-text-secondary">
              {t('backgroundJobs.runningJobs', { defaultValue: 'Running jobs: {{count}}', count: rows.length })}
              {lastUpdated
                ? ` | ${t('backgroundJobs.updated', { defaultValue: 'Updated {{time}}', time: formatTimestamp(lastUpdated) })}`
                : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={loading || allBusy}
              className="px-2 py-1 text-xs rounded-lg border border-surface-border bg-surface text-text-secondary hover:text-text-primary hover:border-accent disabled:opacity-40 transition-colors"
            >
              {t('backgroundJobs.refresh', { defaultValue: 'Refresh' })}
            </button>
            <button
              onClick={onClose}
              className="px-2 py-1 text-xs rounded-lg border border-surface-border bg-surface text-text-secondary hover:text-text-primary transition-colors"
            >
              {t('backgroundJobs.close', { defaultValue: 'Close' })}
            </button>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between gap-3">
          <p className="text-xs text-text-secondary">
            {t('backgroundJobs.description', {
              defaultValue: 'Stop long-running local commands or detached OpenAI background responses when they are no longer needed.',
            })}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onStopAll}
              disabled={!hasRows || allBusy}
              className="px-2 py-1 text-xs rounded-lg border border-danger-border bg-danger-bg text-danger-soft hover:bg-danger-bg-hover disabled:opacity-40 transition-colors"
            >
              {allBusy
                ? t('backgroundJobs.stopping', { defaultValue: 'Stopping...' })
                : t('backgroundJobs.stopAll', { defaultValue: 'Stop All' })}
            </button>
          </div>
        </div>

        <div className="overflow-auto max-h-[58vh]">
          {loading && rows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-text-secondary">
              {t('backgroundJobs.loading', { defaultValue: 'Loading background jobs...' })}
            </p>
          ) : !hasRows ? (
            <p className="px-4 py-6 text-sm text-text-secondary">
              {t('backgroundJobs.empty', { defaultValue: 'No background jobs are currently running.' })}
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-surface text-text-secondary sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">{t('backgroundJobs.table.job', { defaultValue: 'Job' })}</th>
                  <th className="text-left px-3 py-2 font-medium">{t('backgroundJobs.table.task', { defaultValue: 'Task' })}</th>
                  <th className="text-left px-3 py-2 font-medium">{t('backgroundJobs.table.runtime', { defaultValue: 'Runtime' })}</th>
                  <th className="text-left px-3 py-2 font-medium">{t('backgroundJobs.table.context', { defaultValue: 'Context' })}</th>
                  <th className="text-left px-3 py-2 font-medium">{t('backgroundJobs.table.action', { defaultValue: 'Action' })}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((job) => {
                  const id = String(job.id || '')
                  const kind = String(job.kind || 'command').trim().toLowerCase()
                  const pid = Number(job.pid || 0)
                  const startedAt = Number(job.startedAt || 0)
                  const runtime = startedAt > 0 ? formatAgeMs(Date.now() - startedAt) : '-'
                  const stopping = busyId === id
                  const status = String(job.status || (kind === 'openai_response' ? 'queued' : 'running'))
                  const isOpenAI = kind === 'openai_response'
                  const statusLabel = formatOpenAIBackgroundStatus(t, status)
                  return (
                    <tr key={id} className="border-t border-surface-border align-top">
                      <td className="px-3 py-2 text-text-primary">
                        <div className="font-mono select-text cursor-text">{id}</div>
                        <div className="text-text-secondary">
                          {isOpenAI
                            ? (
                              <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] ${openAIBackgroundStatusClass(status)}`}>
                                {t('backgroundJobs.statusLabel', {
                                  defaultValue: 'status: {{status}}',
                                  status: statusLabel,
                                })}
                              </span>
                            )
                            : `pid: ${pid > 0 ? pid : '-'}`}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-text-primary">
                        {isOpenAI ? (
                          <>
                            <div className="font-mono break-all select-text cursor-text">
                              {job.model || t('backgroundJobs.openAiResponse', { defaultValue: 'OpenAI background response' })}
                            </div>
                            <div className="text-text-secondary break-all select-text cursor-text">
                              {job.promptPreview || job.responseId || t('backgroundJobs.detachedOpenAiResponse', { defaultValue: 'Detached OpenAI response' })}
                            </div>
                          </>
                        ) : (
                          <div className="font-mono break-all select-text cursor-text">
                            {job.commandPreview || job.command || t('backgroundJobs.emptyCommand', { defaultValue: '(empty)' })}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-text-primary">
                        <div>{runtime}</div>
                        <div className="text-text-secondary">{formatTimestamp(startedAt)}</div>
                      </td>
                      <td className="px-3 py-2 text-text-secondary">
                        {isOpenAI ? (
                          <>
                            <div className="font-mono break-all select-text cursor-text">thread: {job.threadId || '-'}</div>
                            <div className="font-mono break-all select-text cursor-text">response: {job.responseId || '-'}</div>
                          </>
                        ) : (
                          <>
                            <div className="font-mono break-all select-text cursor-text">cwd: {job.cwd || '.'}</div>
                            <div>shell: {job.shell || 'auto'}</div>
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => onStopJob(id)}
                          disabled={stopping || allBusy}
                          className="px-2 py-1 rounded-md border border-danger-border bg-danger-bg text-danger-soft hover:bg-danger-bg-hover disabled:opacity-40 transition-colors"
                        >
                          {stopping
                            ? t('backgroundJobs.stopping', { defaultValue: 'Stopping...' })
                            : t('backgroundJobs.stop', { defaultValue: 'Stop' })}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {error && (
          <div className="px-4 py-2 border-t border-surface-border text-xs text-danger-soft">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
