import React, { useRef } from 'react'
import { DIALOG_Z_STANDARD } from './dialog-layering.mjs'
import { useDialogEscapeDismiss } from './use-dialog-escape-dismiss.mjs'
import { useDialogFocusTrap } from './use-dialog-focus-trap.mjs'
import { useRendererTranslation } from '../i18n/use-renderer-translation.mjs'

export default function WorkspaceTargetDialog({
  busy,
  dirtyTabs,
  error,
  onCancel,
  onDiscard,
  onSave,
  open,
}) {
  const { t } = useRendererTranslation(['core'])
  const dialogRef = useRef(null)
  useDialogFocusTrap(open, dialogRef)
  useDialogEscapeDismiss(open && !busy, dialogRef, onCancel)
  if (!open) return null

  return (
    <div className={`fixed inset-0 ${DIALOG_Z_STANDARD} flex items-center justify-center bg-overlay-scrim backdrop-blur-sm px-4`}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-target-dialog-title"
        aria-describedby="workspace-target-dialog-message"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-surface-border bg-surface-raised shadow-2xl focus:outline-none"
      >
        <div className="border-b border-surface-border px-4 py-3">
          <h3 id="workspace-target-dialog-title" className="text-sm font-semibold text-text-primary">
            {t('core:app.leaveWorkspace.title', { defaultValue: 'Unsaved Changes' })}
          </h3>
          <p id="workspace-target-dialog-message" className="mt-1 text-xs text-text-secondary">
            {t('core:app.leaveWorkspace.message', {
              defaultValue: 'You have unsaved files. Choose how to proceed before switching projects.',
            })}
          </p>
          {error && <p role="alert" className="mt-2 text-xs text-danger-soft">{error}</p>}
        </div>
        <ul className="max-h-48 space-y-1 overflow-y-auto px-4 py-3 font-mono text-xs text-text-subtle">
          {dirtyTabs.map((tab) => <li key={tab.id} className="truncate">{tab.filePath}</li>)}
        </ul>
        <div className="flex items-center justify-end gap-2 border-t border-surface-border px-4 py-3">
          <button type="button" onClick={onCancel} disabled={busy} className="rounded-lg px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-panel-alt hover:text-text-primary disabled:opacity-50">
            {t('core:app.leaveWorkspace.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button type="button" onClick={onDiscard} disabled={busy} className="rounded-lg border border-surface-border px-3 py-1.5 text-xs text-danger-soft hover:bg-surface-panel-alt disabled:opacity-50">
            {t('core:app.leaveWorkspace.discardAndLeave', { defaultValue: 'Discard & Switch' })}
          </button>
          <button type="button" onClick={onSave} disabled={busy} className="rounded-lg bg-accent-strong px-3 py-1.5 text-xs font-medium text-surface hover:opacity-90 disabled:opacity-50">
            {busy
              ? t('core:app.leaveWorkspace.saving', { defaultValue: 'Saving...' })
              : t('core:app.leaveWorkspace.saveAllAndLeave', { defaultValue: 'Save All & Switch' })}
          </button>
        </div>
      </div>
    </div>
  )
}
