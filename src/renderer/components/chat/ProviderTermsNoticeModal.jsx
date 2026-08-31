import React from 'react'
import { DIALOG_Z_ELEVATED } from '../dialog-layering.mjs'
import ActionButton from '../ui/ActionButton.jsx'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import { useDialogFocusTrap } from '../use-dialog-focus-trap.mjs'
import { useDialogEscapeDismiss } from '../use-dialog-escape-dismiss.mjs'

export default function ProviderTermsNoticeModal({
  open = false,
  provider = null,
  saving = false,
  onCancel = () => {},
  onAcknowledge = () => {},
  onOpenTerms = () => {},
}) {
  const { t } = useRendererTranslation(['core'])
  const dialogRef = React.useRef(null)
  useDialogFocusTrap(open, dialogRef, { initialFocus: 'container' })
  useDialogEscapeDismiss(open && !saving, dialogRef, onCancel)

  if (!open || !provider) return null

  const providerName = String(provider.name || provider.id || t('core:chat.providerTerms.providerFallback', {
    defaultValue: 'this provider',
  })).trim() || 'this provider'
  const termsUrl = String(provider.termsUrl || '').trim()

  return (
    <div
      className={`pointer-events-none absolute left-1/2 bottom-[calc(100%+0.75rem)] ${DIALOG_Z_ELEVATED} w-[min(100vw-2rem,24rem)] -translate-x-1/2`}
      data-ui="provider-terms-notice-anchor"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="pointer-events-auto w-full rounded-xl bg-surface-panel px-4 pb-3 pt-3.5 shadow-[0_14px_36px_rgb(var(--theme-shadow-rgb)_/_0.24)]"
        data-ui="provider-terms-notice"
        role="dialog"
        aria-modal="true"
        aria-busy={saving ? 'true' : undefined}
        aria-labelledby="provider-terms-notice-title"
      >
        <h3
          id="provider-terms-notice-title"
          className="text-[13px] font-medium leading-snug text-text-primary"
        >
          {t('core:chat.providerTerms.title', {
            defaultValue: 'Before using {{providerName}}',
            providerName,
          })}
        </h3>
        <p className="mt-2 text-xs font-normal leading-snug text-text-tertiary">
          {t('core:chat.providerTerms.lead', {
            defaultValue: "You're responsible for this provider's terms. Prompts and tool activity can leave this machine.",
          })}
        </p>
        <div className="mt-3.5 flex items-center justify-end gap-0.5">
          <ActionButton
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={saving}
            className="h-7 border-transparent px-2.5 leading-none"
            data-ui="provider-terms-cancel"
          >
            {t('core:chat.providerTerms.cancel', { defaultValue: 'Cancel' })}
          </ActionButton>
          {termsUrl ? (
            <ActionButton
              variant="ghost"
              size="sm"
              onClick={onOpenTerms}
              disabled={saving}
              className="h-7 border-transparent px-2.5 leading-none text-text-secondary hover:bg-surface-panel-alt hover:text-text-primary"
              data-ui="provider-terms-open"
            >
              {t('core:chat.providerTerms.openTerms', { defaultValue: 'Open terms' })}
            </ActionButton>
          ) : null}
          <ActionButton
            variant="ghost"
            size="sm"
            onClick={onAcknowledge}
            disabled={saving}
            className="h-7 border-transparent bg-surface-panel-muted-strong px-2.5 leading-none text-text-primary hover:bg-surface-panel-alt"
            data-ui="provider-terms-continue"
          >
            {t('core:chat.providerTerms.continue', { defaultValue: 'Continue' })}
          </ActionButton>
        </div>
      </div>
    </div>
  )
}
