import React from 'react'

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

export default function FieldRow({
  label,
  description,
  children,
  status,
  htmlFor,
  className = '',
}) {
  return (
    <div className={cx('grid min-h-11 gap-2 border-b border-surface-border/55 py-2.5 last:border-b-0 md:grid-cols-[minmax(0,0.78fr)_minmax(15rem,1fr)] md:items-center md:gap-6', className)}>
      <div className="min-w-0">
        {label ? (
          <label htmlFor={htmlFor} className="font-display text-xs font-medium tracking-normal text-text-primary">
            {label}
          </label>
        ) : null}
        {description ? <p className="mt-0.5 text-[11px] leading-4 text-text-secondary">{description}</p> : null}
        {status ? <p className="mt-0.5 text-[11px] leading-4 text-text-muted">{status}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
