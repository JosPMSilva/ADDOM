export function ChevronDownIcon({ open }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

export function SelectorBadge({ tone = 'neutral', label = '', title = '' }) {
  const className = tone === 'reviewed'
    ? 'border-success/30 bg-success-bg/20 text-success'
    : tone === 'catalog'
      ? 'border-info-border/40 bg-info-bg/40 text-info-soft'
      : tone === 'estimated'
        ? 'border-warning/30 bg-warning/10 text-warning'
      : tone === 'runtime'
        ? 'border-accent/30 bg-accent/10 text-accent-soft'
        : 'border-surface-border bg-surface-panel-alt text-text-muted'
  return (
    <span
      className={['inline-flex shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] uppercase tracking-wide', className].join(' ')}
      title={title || label}
    >
      {label}
    </span>
  )
}
