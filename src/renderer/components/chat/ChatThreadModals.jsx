import React from 'react'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import { DIALOG_Z_STANDARD } from '../dialog-layering.mjs'
import { useDialogFocusTrap } from '../use-dialog-focus-trap.mjs'
import { useDialogEscapeDismiss } from '../use-dialog-escape-dismiss.mjs'
import ActionButton from '../ui/ActionButton.jsx'
import Icon from '../ui/Icon.jsx'
import IconButton from '../ui/IconButton.jsx'

export default function ChatThreadModals({
  createThreadModalOpen = false,
  newThreadTitle = '',
  onNewThreadTitleChange = () => {},
  onCreateThreadSubmit = () => {},
  onCloseCreateThreadModal = () => {},
  renameThreadModalOpen = false,
  renameThreadTitle = '',
  onRenameThreadTitleChange = () => {},
  onRenameThreadSubmit = () => {},
  onCloseRenameThreadModal = () => {},
} = {}) {
  const { t } = useRendererTranslation(['core'])
  return (
    <>
      {createThreadModalOpen && (
        <ModalShell
          dataUi="chat-thread-create-modal"
          title={t('chat.threadModals.create.title', { defaultValue: 'Create [[canon:thread]]' })}
          closeTitle={t('chat.threadModals.common.close', { defaultValue: 'Close' })}
          closeAriaLabel={t('chat.threadModals.common.closeModal', { defaultValue: 'Close [[canon:thread]] modal' })}
          onClose={onCloseCreateThreadModal}
        >
          <div className="space-y-3">
            <label htmlFor="create-thread-title-input" className="sr-only">
              {t('chat.threadModals.create.description', {
                defaultValue: 'Enter a title for the new conversation [[canon:thread]].',
              })}
            </label>
            <input
              id="create-thread-title-input"
              autoFocus
              type="text"
              value={newThreadTitle}
              maxLength={200}
              onChange={(e) => onNewThreadTitleChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onCreateThreadSubmit()
                }
              }}
              className="w-full bg-surface border border-surface-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              placeholder={t('chat.threadModals.create.placeholder', {
                defaultValue: 'New [[canon:thread]]',
              })}
            />
            <div className="flex items-center justify-end gap-2">
              <ActionButton
                onClick={onCloseCreateThreadModal}
                variant="ghost"
              >
                {t('chat.threadModals.common.cancel', { defaultValue: 'Cancel' })}
              </ActionButton>
              <ActionButton
                onClick={onCreateThreadSubmit}
                variant="primary"
              >
                {t('chat.threadModals.create.confirm', { defaultValue: 'Create' })}
              </ActionButton>
            </div>
          </div>
        </ModalShell>
      )}

      {renameThreadModalOpen && (
        <ModalShell
          dataUi="chat-thread-rename-modal"
          title={t('chat.threadModals.rename.title', { defaultValue: 'Rename [[canon:thread]]' })}
          closeTitle={t('chat.threadModals.common.close', { defaultValue: 'Close' })}
          closeAriaLabel={t('chat.threadModals.common.closeModal', { defaultValue: 'Close [[canon:thread]] modal' })}
          onClose={onCloseRenameThreadModal}
        >
          <div className="space-y-3">
            <label htmlFor="rename-thread-title-input" className="sr-only">
              {t('chat.threadModals.rename.description', {
                defaultValue: 'Update the title for the current conversation [[canon:thread]].',
              })}
            </label>
            <input
              id="rename-thread-title-input"
              autoFocus
              type="text"
              value={renameThreadTitle}
              maxLength={200}
              onChange={(e) => onRenameThreadTitleChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onRenameThreadSubmit()
                }
              }}
              className="w-full bg-surface border border-surface-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              placeholder={t('chat.threadModals.rename.placeholder', {
                defaultValue: '[[canon:thread]] title',
              })}
            />
            <div className="flex items-center justify-end gap-2">
              <ActionButton
                onClick={onCloseRenameThreadModal}
                variant="ghost"
              >
                {t('chat.threadModals.common.cancel', { defaultValue: 'Cancel' })}
              </ActionButton>
              <ActionButton
                onClick={onRenameThreadSubmit}
                variant="primary"
              >
                {t('chat.threadModals.rename.confirm', { defaultValue: 'Save' })}
              </ActionButton>
            </div>
          </div>
        </ModalShell>
      )}
    </>
  )
}

function ModalShell({
  title,
  children,
  onClose,
  closeTitle = 'Close',
  closeAriaLabel = 'Close modal',
  dataUi = 'chat-thread-modal',
}) {
  const dialogRef = React.useRef(null)
  const titleId = `${String(title || 'thread-modal').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-title`
  useDialogFocusTrap(true, dialogRef)
  useDialogEscapeDismiss(true, dialogRef, onClose)
  return (
    <div className={`fixed inset-0 ${DIALOG_Z_STANDARD} flex items-center justify-center bg-overlay-scrim backdrop-blur-sm`}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-ui={dataUi}
        className="w-full max-w-sm mx-4 overflow-hidden rounded-xl border border-border-strong bg-surface-raised text-text-primary shadow-[0_18px_48px_rgb(var(--theme-shadow-rgb)_/_0.32)] focus:outline-none"
      >
        <div className="flex items-center justify-between gap-3 border-b border-surface-border px-3.5 py-2.5">
          <h3 id={titleId} className="min-w-0 truncate font-display text-sm font-semibold tracking-normal text-text-primary">
            {title}
          </h3>
          <IconButton
            onClick={onClose}
            label={closeAriaLabel}
            title={closeTitle}
          >
            <Icon name="x" size={13} />
          </IconButton>
        </div>
        <div className="p-3.5">
          {children}
        </div>
      </div>
    </div>
  )
}
