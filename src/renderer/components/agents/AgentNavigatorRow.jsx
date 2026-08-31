import React from 'react'

import { AGENT_STATUS_TONE as STATUS_TONE } from './agent-status-tone.mjs'

export const AGENT_NAVIGATOR_ROW_HEIGHT = 46

function DisclosureGlyph({ expanded }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      className={[
        'h-3 w-3 shrink-0 text-text-tertiary transition-transform duration-100 motion-reduce:transition-none',
        expanded ? 'rotate-90' : '',
      ].join(' ')}
    >
      <path d="M4.5 2.5 L8 6 L4.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function AgentNavigatorRow({
  row,
  focused,
  statusLabel,
  ageLabel,
  hiddenLabel,
  hiddenAttentionLabel,
  disclosureLabel,
  partialVisibilityLabel,
  onSelect,
  onToggle,
  registerRef,
}) {
  const tone = STATUS_TONE[row.status] || 'bg-text-secondary'
  const running = !STATUS_TONE[row.status]
  const showHiddenAttention = !row.expanded && row.hiddenAttentionStatus && hiddenAttentionLabel

  return (
    <div
      ref={registerRef}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={row.selected}
      aria-expanded={row.hasChildren ? row.expanded : undefined}
      aria-label={`${row.label}, ${statusLabel}`}
      tabIndex={focused ? 0 : -1}
      data-agent-row={row.nodeId}
      data-selected={row.selected ? 'true' : 'false'}
      onClick={() => onSelect(row)}
      className={[
        'group flex w-full cursor-default items-start gap-1.5 rounded-md py-1.5 pr-2 text-left',
        'outline-none focus-visible:ring-1 focus-visible:ring-accent',
        row.selected ? 'bg-surface-raised' : 'hover:bg-surface-raised/50',
      ].join(' ')}
      style={{ paddingLeft: `${6 + (row.indent * 12)}px`, minHeight: `${AGENT_NAVIGATOR_ROW_HEIGHT}px` }}
    >
      {row.hasChildren ? (
        <button
          type="button"
          aria-label={disclosureLabel}
          aria-expanded={row.expanded}
          onClick={(event) => {
            event.stopPropagation()
            onToggle(row)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            event.stopPropagation()
            onToggle(row)
          }}
          className="mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm text-text-tertiary hover:bg-surface-panel focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          data-ui="agent-navigator-disclosure"
        >
          <DisclosureGlyph expanded={row.expanded} />
        </button>
      ) : (
        <span aria-hidden="true" className="mt-[3px] h-3.5 w-3.5 shrink-0" />
      )}

      <span
        aria-hidden="true"
        data-agent-status={row.status}
        className={[
          'mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full',
          tone,
          running ? 'animate-pulse motion-reduce:animate-none' : '',
        ].join(' ')}
      />

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate font-display text-[12px] font-medium text-text-primary">
            {row.label}
          </span>
          {ageLabel ? (
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-text-tertiary">
              {ageLabel}
            </span>
          ) : null}
        </span>
        <span className="flex items-baseline gap-1.5">
          <span
            className="min-w-0 flex-1 truncate text-[11px] leading-tight text-text-muted"
            title={row.opaque ? row.visibilityReason || undefined : undefined}
          >
            {row.opaque ? partialVisibilityLabel : row.preview || statusLabel}
          </span>
          {!row.expanded && row.hiddenDescendantCount > 0 ? (
            <span className="shrink-0 text-[10px] text-text-tertiary">
              {showHiddenAttention ? (
                <span className="text-warning">{hiddenAttentionLabel}</span>
              ) : hiddenLabel}
            </span>
          ) : null}
        </span>
      </span>
    </div>
  )
}

export default React.memo(AgentNavigatorRow)
