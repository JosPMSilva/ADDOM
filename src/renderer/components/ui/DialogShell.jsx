import React from 'react'

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

export default function DialogShell({
  title,
  description,
  children,
  footer,
  className = '',
  labelledBy,
  describedBy,
  ...props
}) {
  const generatedId = React.useId()
  const titleId = labelledBy || (title ? `${generatedId}-title` : undefined)
  const descriptionId = describedBy || (description ? `${generatedId}-description` : undefined)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={cx(
        'w-full rounded-xl border border-border-strong bg-surface-panel text-text-primary shadow-[0_22px_60px_rgb(var(--theme-shadow-rgb)_/_0.35)]',
        className,
      )}
      {...props}
    >
      {(title || description) && (
        <div className="border-b border-surface-border px-4 py-3">
          {title ? <h2 id={titleId} className="font-display text-sm font-semibold tracking-normal">{title}</h2> : null}
          {description ? <p id={descriptionId} className="mt-1 text-xs text-text-secondary">{description}</p> : null}
        </div>
      )}
      <div className="px-4 py-3">{children}</div>
      {footer ? <div className="border-t border-surface-border px-4 py-3">{footer}</div> : null}
    </div>
  )
}
