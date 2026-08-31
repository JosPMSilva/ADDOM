import React from 'react'
import { COMPLIANCE_MODE_STRICT } from '../../../common/compliance/compliance-settings.mjs'
import { DIALOG_Z_ELEVATED } from '../dialog-layering.mjs'
import { useDialogEscapeDismiss } from '../use-dialog-escape-dismiss.mjs'
import { useDialogFocusTrap } from '../use-dialog-focus-trap.mjs'
import ActionButton from '../ui/ActionButton.jsx'
import DialogShell from '../ui/DialogShell.jsx'
import { useSettingsTranslator } from './settings-panel-ui-utils.mjs'

export default function SettingsExportPreflightModal({
  open = false,
  busy = false,
  complianceMode = 'warn_only',
  preserveCitations = true,
  strictConfirmed = false,
  onTogglePreserveCitations = () => {},
  onStrictConfirmedChange = () => {},
  onCancel = () => {},
  onConfirm = () => {},
} = {}) {
  const t = useSettingsTranslator(['settings', 'core'])
  const dialogRef = React.useRef(null)
  useDialogFocusTrap(open, dialogRef)
  useDialogEscapeDismiss(open, dialogRef, onCancel)
  if (!open) return null
  const strictMode = complianceMode === COMPLIANCE_MODE_STRICT

  const footer = (
    <div className="flex items-center justify-end gap-2">
      <ActionButton onClick={onCancel} disabled={busy}>
        {t('core:common.cancel', { defaultValue: 'Cancel' })}
      </ActionButton>
      <ActionButton variant="primary" onClick={onConfirm} disabled={busy || (strictMode && !strictConfirmed)}>
        {busy
          ? t('settings:blocks.dataReset.exportPreflight.exporting', { defaultValue: 'Exporting...' })
          : t('settings:blocks.dataReset.exportPreflight.continueExport', { defaultValue: 'Continue Export' })}
      </ActionButton>
    </div>
  )

  return (
    <div className={`fixed inset-0 ${DIALOG_Z_ELEVATED} flex items-center justify-center bg-overlay-scrim px-4`} onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
      <div ref={dialogRef} tabIndex={-1} className="w-full max-w-xl outline-none">
        <DialogShell
          title={t('settings:blocks.dataReset.exportPreflight.title', { defaultValue: 'Compliance reminder before export' })}
          description={t('settings:blocks.dataReset.exportPreflight.description', {
            defaultValue: 'Thread exports are portable. Do not use exports for prohibited distillation, benchmark harvesting, or provider-policy bypass workflows.',
          })}
          footer={footer}
        >
          <div className="flex flex-col">
            <label className="flex cursor-pointer items-start gap-2 border-b border-surface-border/55 py-2.5">
              <input type="checkbox" checked={Boolean(preserveCitations)} onChange={(event) => onTogglePreserveCitations(Boolean(event.target.checked))} className="mt-0.5 accent-accent" />
              <span className="text-xs text-text-secondary">
                {t('settings:blocks.dataReset.exportPreflight.preserveCitationsLabel', {
                  defaultValue: 'Preserve citations and attribution metadata in export',
                })}
                <span className="mt-0.5 block text-[11px] text-text-muted">
                  {t('settings:blocks.dataReset.exportPreflight.preserveCitationsHint', {
                    defaultValue: 'Recommended for providers/models with attribution-sensitive terms.',
                  })}
                </span>
              </span>
            </label>

            {strictMode ? (
              <label className="flex cursor-pointer items-start gap-2 py-2.5">
                <input type="checkbox" checked={Boolean(strictConfirmed)} onChange={(event) => onStrictConfirmedChange(Boolean(event.target.checked))} className="mt-0.5 accent-accent" />
                <span className="text-xs text-text-secondary">
                  {t('settings:blocks.dataReset.exportPreflight.strictConfirmLabel', {
                    defaultValue: 'I confirm this export is for a terms-compliant workflow in this session.',
                  })}
                  <span className="mt-0.5 block text-[11px] text-text-muted">
                    {t('settings:blocks.dataReset.exportPreflight.strictConfirmHint', {
                      defaultValue: 'Strict mode requires explicit confirmation before export.',
                    })}
                  </span>
                </span>
              </label>
            ) : null}
          </div>
        </DialogShell>
      </div>
    </div>
  )
}
