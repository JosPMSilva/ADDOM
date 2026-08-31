import React from 'react'

export default function TurnFileChangesHeader({
  expanded = false,
  controlsId = '',
  summary = {},
  onToggle = () => {},
  dockPosition = '',
  actions = null,
}) {
  const fileCount = Number(summary?.fileCount || 0) || 0
  const totalAdded = Number(summary?.totalAdded || 0) || 0
  const totalRemoved = Number(summary?.totalRemoved || 0) || 0
  const conflictCount = Number(summary?.conflictCount || 0) || 0
  const hasActions = actions != null

  return (
    <div
      className={`flex min-h-8 w-full items-center gap-1 ${dockPosition ? '' : 'rounded-md border border-surface-border/45 bg-surface/20'}`}
    >
      <button
        type="button"
        data-turn-header-dock-row="files"
        className="flex min-h-8 min-w-0 flex-1 items-center gap-2 px-3 text-left outline-none transition-colors hover:bg-surface-panel/55 hover:text-text-primary focus-visible:ring-1 focus-visible:ring-border-strong"
        aria-expanded={expanded}
        aria-controls={controlsId}
        onClick={onToggle}
      >
        <span className="chat-typo-file-changes-header font-medium text-text-secondary">
          Files changed: {fileCount}
        </span>
        <span className="chat-typo-file-changes-header text-success">+{totalAdded}</span>
        <span className="chat-typo-file-changes-header text-danger">-{totalRemoved}</span>
        {conflictCount > 0 ? (
          <span className="chat-typo-file-changes-header text-danger-soft">
            {conflictCount} conflict{conflictCount === 1 ? '' : 's'}
          </span>
        ) : null}
        {!hasActions ? <span aria-hidden="true" className="ml-auto" /> : null}
      </button>
      {hasActions ? (
        <div className="flex shrink-0 items-center gap-0.5 pr-2">
          {actions}
        </div>
      ) : null}
    </div>
  )
}
