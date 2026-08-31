import React, { useEffect, useState } from 'react'

const OLD_TURN_DATE_THRESHOLD_SECONDS = 7 * 24 * 60 * 60

function formatDayMonth(timestamp = 0) {
  const date = new Date(Number(timestamp || 0) || 0)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}`
}

export function formatExecutionTime({ seconds = 0, startedAt = 0 } = {}) {
  const total = Math.max(0, Math.round(Number(seconds || 0) || 0))
  if (total >= OLD_TURN_DATE_THRESHOLD_SECONDS && Number(startedAt || 0) > 0) {
    return formatDayMonth(startedAt)
  }
  const roundedHours = Math.round(total / 3_600)
  const days = Math.floor(roundedHours / 24)
  if (days > 0) {
    const hours = roundedHours % 24
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  }
  const roundedMinutes = Math.round(total / 60)
  const hours = Math.floor(roundedMinutes / 60)
  if (hours > 0) {
    const minutes = roundedMinutes % 60
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }
  const minutes = Math.floor(total / 60)
  const remainder = total % 60
  if (minutes <= 0) return `${remainder}s`
  return `${minutes}m ${remainder}s`
}

function ElapsedHeaderLabel({ active = false, startedAt = 0, completedAt = 0 }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return undefined
    const timer = setInterval(() => setTick((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [active])
  const start = Number(startedAt || 0) || 0
  if (start <= 0) return null
  const end = active ? Date.now() : (Number(completedAt || 0) || start)
  return (
    <span className="chat-typo-exec-header-meta font-mono text-chat-meta">
      {formatExecutionTime({
        seconds: Math.max(0, (end - start) / 1000),
        startedAt: start,
      })}
    </span>
  )
}

const ExecutionStreamHeaderDot = React.memo(function ExecutionStreamHeaderDot() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-1.5 w-1.5 rounded-full bg-accent-soft opacity-85 motion-safe:animate-pulse motion-safe:[animation-duration:820ms] motion-safe:[animation-timing-function:ease-in-out] motion-reduce:animate-none"
    />
  )
})

export default function LiveExecutionStreamHeader({
  t,
  expanded,
  onToggle,
  panelId,
  isLiveTurn,
  statusLabel,
  turn,
  onContinue,
  filesHint = null,
}) {
  const fileCount = Number(filesHint?.fileCount || 0) || 0
  const totalAdded = Number(filesHint?.totalAdded || 0) || 0
  const totalRemoved = Number(filesHint?.totalRemoved || 0) || 0
  const showFilesHint = fileCount > 0 && typeof filesHint?.onReveal === 'function'

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        data-turn-header-dock-row="execution"
        className="flex min-h-8 min-w-0 flex-1 items-center justify-between rounded-md px-2 text-left outline-none transition-colors hover:bg-surface-panel hover:text-text-primary focus-visible:ring-1 focus-visible:ring-border-strong"
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-label={expanded
          ? t('core:executionStream.header.hide', { defaultValue: 'Hide live execution stream' })
          : t('core:executionStream.header.show', { defaultValue: 'Show live execution stream' })}
      >
        <div className="flex items-center gap-2">
          {isLiveTurn && <ExecutionStreamHeaderDot />}
          <span className="chat-typo-exec-header-status font-medium text-text-secondary">
            {statusLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ElapsedHeaderLabel
            active={isLiveTurn}
            startedAt={Number(turn?.createdAt || 0) || 0}
            completedAt={Number(turn?.updatedAt || 0) || 0}
          />
        </div>
      </button>
      {showFilesHint ? (
        <button
          type="button"
          data-ui="turn-shell-files-hint"
          onClick={filesHint.onReveal}
          className="chat-typo-exec-header-meta shrink-0 rounded-md px-1.5 py-1 text-text-tertiary outline-none transition-colors hover:bg-surface-panel/70 hover:text-text-secondary focus-visible:ring-1 focus-visible:ring-border-strong"
          title={t('core:executionStream.header.revealFiles', {
            defaultValue: 'Jump to files changed',
          })}
          aria-label={t('core:executionStream.header.revealFiles', {
            defaultValue: 'Jump to files changed',
          })}
        >
          <span className="inline-flex items-center gap-1.5">
            <span>
              {fileCount} file{fileCount === 1 ? '' : 's'}
            </span>
            <span className="text-success">+{totalAdded}</span>
            <span className="text-danger">-{totalRemoved}</span>
          </span>
        </button>
      ) : null}
      {onContinue ? (
        <button
          type="button"
          data-ui="interrupted-turn-continue"
          onClick={onContinue}
          className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-text-secondary outline-none transition-colors hover:bg-surface-border/40 hover:text-text-primary focus-visible:ring-1 focus-visible:ring-border-strong"
        >
          {t('core:executionStream.actions.continue', { defaultValue: 'Continue' })}
        </button>
      ) : null}
    </div>
  )
}
