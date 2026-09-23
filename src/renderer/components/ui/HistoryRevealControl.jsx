import React from 'react'

export default function HistoryRevealControl({
  label,
  ariaLabel = '',
  onClick,
  className = '',
  dataUi = 'history-reveal-control',
}) {
  return (
    <div className={`flex w-full items-center gap-2 py-1 ${className}`.trim()} data-ui={`${dataUi}-row`}>
      <span aria-hidden="true" className="h-px min-w-4 flex-1 bg-surface-border/45" />
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel || label}
        className="inline-flex min-h-7 shrink-0 items-center rounded-md px-2 font-display text-[11px] font-medium tracking-normal text-text-muted transition-colors duration-150 hover:bg-surface-panel/55 hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong"
        data-ui={dataUi}
      >
        {label}
      </button>
      <span aria-hidden="true" className="h-px min-w-4 flex-1 bg-surface-border/45" />
    </div>
  )
}
