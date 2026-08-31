import React from 'react'

export default function SettingsDetailView({
  title,
  description = '',
  closeLabel,
  onClose,
  actions = null,
  children,
}) {
  return (
    <div className="mx-auto w-full max-w-3xl" data-ui="settings-detail-view">
      <div className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b border-surface-border/60 bg-surface pb-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            title={closeLabel}
            className="mb-2 text-xs text-text-secondary transition-colors hover:text-text-primary"
          >
            {closeLabel}
          </button>
          <h3 className="text-[15px] font-semibold text-text-primary">{title}</h3>
          {description ? <p className="mt-1 text-xs leading-5 text-text-secondary">{description}</p> : null}
        </div>
        {actions}
      </div>
      <div className="pb-10 pt-3">{children}</div>
    </div>
  )
}
