import React from 'react'
import { DIALOG_Z_ELEVATED } from '../dialog-layering.mjs'
import { useDialogEscapeDismiss } from '../use-dialog-escape-dismiss.mjs'
import { useDialogFocusTrap } from '../use-dialog-focus-trap.mjs'
import ActionButton from '../ui/ActionButton.jsx'
import DialogShell from '../ui/DialogShell.jsx'
import { useSettingsTranslator } from './settings-panel-ui-utils.mjs'

export default function SettingsImportThreadModal({
  open = false,
  busy = false,
  importJson = '',
  onImportJsonChange = () => {},
  onCancel = () => {},
  onConfirm = () => {},
} = {}) {
  const t = useSettingsTranslator(['settings', 'core'])
  const dialogRef = React.useRef(null)
  useDialogFocusTrap(open, dialogRef)
  useDialogEscapeDismiss(open, dialogRef, onCancel)
  if (!open) return null

  const footer = (
    <div className="flex items-center justify-end gap-2">
      <ActionButton onClick={onCancel} disabled={busy}>
        {t('core:common.cancel', { defaultValue: 'Cancel' })}
      </ActionButton>
      <ActionButton variant="primary" onClick={onConfirm} disabled={busy || !String(importJson || '').trim()}>
        {busy
          ? t('settings:blocks.dataReset.importThread.importing', { defaultValue: 'Importing...' })
          : t('settings:blocks.dataReset.importThread.confirm', { defaultValue: 'Import Thread' })}
      </ActionButton>
    </div>
  )

  return (
    <div className={`fixed inset-0 ${DIALOG_Z_ELEVATED} flex items-center justify-center bg-overlay-scrim px-4`} onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
      <div ref={dialogRef} tabIndex={-1} className="w-full max-w-2xl outline-none">
        <DialogShell
          title={t('settings:blocks.dataReset.importThread.title', { defaultValue: 'Import thread JSON' })}
          description={t('settings:blocks.dataReset.importThread.description', {
            defaultValue: 'Paste a previously exported thread payload to import it into the active project.',
          })}
          footer={footer}
        >
          <label className="block">
            <span className="text-xs text-text-secondary">{t('settings:blocks.dataReset.importThread.fieldLabel', { defaultValue: 'Thread export JSON' })}</span>
            <textarea
              value={importJson}
              onChange={(event) => onImportJsonChange(event.target.value)}
              rows={14}
              spellCheck={false}
              className="mt-2 w-full resize-y rounded-md border border-surface-border bg-surface px-3 py-2.5 font-mono text-xs text-text-primary outline-none transition-colors focus:border-accent"
              placeholder={t('settings:blocks.dataReset.importThread.placeholder', {
                defaultValue: '{"thread": {...}, "events": [...] }',
              })}
            />
          </label>
        </DialogShell>
      </div>
    </div>
  )
}
