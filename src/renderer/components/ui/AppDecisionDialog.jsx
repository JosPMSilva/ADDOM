import React from 'react'
import { DIALOG_Z_CONFIRM } from '../dialog-layering.mjs'
import { useDialogEscapeDismiss } from '../use-dialog-escape-dismiss.mjs'
import { useDialogFocusTrap } from '../use-dialog-focus-trap.mjs'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'

function dialogId(value = '') {
  return String(value || 'current')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-') || 'current'
}

export default function AppDecisionDialog({ dialog, onConfirm, onCancel }) {
  const { t } = useRendererTranslation(['core'])
  const open = Boolean(dialog?.id)
  const dialogRef = React.useRef(null)
  useDialogFocusTrap(open, dialogRef)
  useDialogEscapeDismiss(open, dialogRef, onCancel)

  if (!open) return null

  const id = dialogId(dialog.id)
  const titleId = `app-decision-dialog-title-${id}`
  const descriptionId = `app-decision-dialog-description-${id}`
  const showCancel = dialog.showCancel !== false
  const destructive = dialog.tone === 'danger'
  const handleBackdropMouseDown = (event) => {
    if (event.target !== event.currentTarget) return
    onCancel?.()
  }

  return (
    <div
      className={`fixed inset-0 ${DIALOG_Z_CONFIRM} flex items-center justify-center bg-overlay-scrim px-4 backdrop-blur-sm`}
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-ui="app-decision-dialog"
        className="w-full max-w-md rounded-2xl bg-surface-raised px-6 py-5 text-text-primary shadow-[0_22px_64px_rgb(var(--theme-shadow-rgb)_/_0.38)] focus:outline-none"
      >
        <h2 id={titleId} className="font-display text-[15px] font-semibold tracking-normal">
          {dialog.title}
        </h2>
        <p id={descriptionId} className="mt-3 whitespace-pre-wrap text-[13px] leading-5 text-text-secondary">
          {dialog.message || t('core:app.confirmDialog.messageFallback', {
            defaultValue: 'Are you sure you want to continue?',
          })}
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          {showCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-3 py-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-panel hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong"
            >
              {dialog.cancelLabel || t('core:app.confirmDialog.cancel', { defaultValue: 'Cancel' })}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onConfirm}
            className={[
              'rounded-md bg-surface-panel-muted-strong px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-surface-panel focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong',
              destructive ? 'text-danger' : 'text-text-primary',
            ].join(' ')}
          >
            {dialog.confirmLabel || t('core:app.confirmDialog.confirm', { defaultValue: 'Confirm' })}
          </button>
        </div>
      </div>
    </div>
  )
}
