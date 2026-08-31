import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { DIALOG_Z_ELEVATED } from '../dialog-layering.mjs'
import ActionButton from '../ui/ActionButton.jsx'
import IconButton from '../ui/IconButton.jsx'
import Icon from '../ui/Icon.jsx'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import useWorkspaceStore from '../../store/useWorkspaceStore.js'
import AttachmentActionsMenu from './AttachmentActionsMenu.jsx'
import useAttachmentActions from './use-attachment-actions.js'
import {
  isImageContentPart,
  isPdfContentPart,
  resolveFileAttachmentBadgeText,
  resolveImagePartSource,
} from './message-bubble-render-utils.mjs'

function renderAttachmentModalPortal(content) {
  if (typeof document === 'undefined') return content
  const target = document.querySelector('[data-ui="chat-panel-content-layer"]')
  return target ? createPortal(content, target) : content
}

function AttachmentImagePreviewDialog({
  previewImage = null,
  onClose = () => {},
}) {
  const { t } = useRendererTranslation(['core'])
  if (!previewImage) return null
  return renderAttachmentModalPortal((
    <div
      className={`absolute inset-0 ${DIALOG_Z_ELEVATED} flex items-center justify-center bg-overlay-scrim-strong p-4`}
      data-chat-render="user-image-preview-modal"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('core:chat.attachments.image.previewAriaLabel', { defaultValue: 'Image preview' })}
    >
      <div
        className="relative flex h-[min(88vh,960px)] w-[min(94vw,1400px)] items-center justify-center rounded-lg border border-surface-border bg-surface-panel/95 p-2 shadow-[0_22px_60px_rgb(var(--theme-shadow-rgb)_/_0.35)]"
        onClick={(event) => event.stopPropagation()}
      >
        <IconButton
          onClick={onClose}
          className="chat-typo-image-preview-close absolute right-3 top-3 z-10 bg-surface/90 backdrop-blur"
          variant="panel"
          label={t('core:chat.attachments.image.closePreviewAriaLabel', {
            defaultValue: 'Close image preview',
          })}
        >
          <Icon name="x" size={13} weight="bold" />
        </IconButton>
        <img
          src={previewImage.src}
          alt={previewImage.label || t('core:chat.attachments.image.previewAriaLabel', {
            defaultValue: 'Image preview',
          })}
          className="h-full w-full object-contain"
        />
      </div>
    </div>
  ))
}

function AttachmentOpenConfirmDialog({
  attachmentOpenConfirm = null,
  onClose = () => {},
  onConfirm = () => {},
}) {
  const { t } = useRendererTranslation(['core'])
  if (!attachmentOpenConfirm) return null
  return renderAttachmentModalPortal((
    <div
      className={`absolute inset-0 ${DIALOG_Z_ELEVATED} flex items-center justify-center bg-overlay-scrim p-4`}
      data-chat-render="user-file-open-confirm-modal"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('core:chat.attachments.dialogs.openFileAriaLabel', {
        defaultValue: 'Open file confirmation',
      })}
    >
      <div
        className="w-[min(92vw,440px)] rounded-lg border border-surface-border bg-surface-panel p-4 shadow-[0_22px_60px_rgb(var(--theme-shadow-rgb)_/_0.35)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="chat-typo-attachment-modal-title font-semibold text-text-primary">
              {t('core:chat.attachments.dialogs.openPdfTitle', {
                defaultValue: 'Open PDF in your default viewer?',
              })}
            </p>
            <p className="chat-typo-attachment-modal-file mt-1 text-text-secondary break-all">{attachmentOpenConfirm.fileName}</p>
          </div>
          <IconButton
            onClick={onClose}
            className="chat-typo-attachment-modal-close -mr-1 -mt-1"
            label={t('core:chat.attachments.dialogs.closeFileOpenAriaLabel', {
              defaultValue: 'Close file open confirmation',
            })}
          >
            <Icon name="x" size={13} weight="bold" />
          </IconButton>
        </div>
        <div className="chat-typo-attachment-modal-body mt-3 text-text-tertiary">
          {t('core:chat.attachments.dialogs.openPdfDescription', {
            defaultValue: 'This file will open outside ADDOM using your system PDF application.',
          })}
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <ActionButton
            onClick={onClose}
            className="chat-typo-attachment-modal-cancel"
          >
            {t('core:chat.attachments.common.cancel', { defaultValue: 'Cancel' })}
          </ActionButton>
          <ActionButton
            onClick={onConfirm}
            variant="primary"
            className="chat-typo-attachment-modal-confirm"
          >
            {t('core:chat.attachments.dialogs.openPdfConfirm', { defaultValue: 'Open PDF' })}
          </ActionButton>
        </div>
      </div>
    </div>
  ))
}

export default function MessageBubbleUserAttachments({
  parts = [],
  messageId = '',
}) {
  const { t } = useRendererTranslation(['core'])
  const [previewImage, setPreviewImage] = useState(null)
  const [attachmentOpenError, setAttachmentOpenError] = useState('')
  const [attachmentOpenConfirm, setAttachmentOpenConfirm] = useState(null)
  const activeProjectId = useWorkspaceStore((state) => state.activeProjectId)
  const activeThreadId = useWorkspaceStore((state) => state.activeThreadId)
  const attachmentActions = useAttachmentActions({
    messageId,
    projectId: activeProjectId,
    threadId: activeThreadId,
    onError: setAttachmentOpenError,
  })

  useEffect(() => {
    setPreviewImage(null)
    setAttachmentOpenError('')
    setAttachmentOpenConfirm(null)
  }, [messageId])

  useEffect(() => {
    if (!previewImage && !attachmentOpenConfirm) return undefined
    if (typeof window === 'undefined') return undefined
    const onKeyDown = (event) => {
      if (String(event?.key || '') !== 'Escape') return
      if (attachmentOpenConfirm) {
        setAttachmentOpenConfirm(null)
        return
      }
      if (previewImage) setPreviewImage(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [attachmentOpenConfirm, previewImage])

  const openAttachmentFileNow = async (part = {}) => {
    setAttachmentOpenError('')
    const fileName = String(part?.filename || part?.fileName || '').trim()
    const attachmentId = String(part?.attachmentId || '').trim()
    const attachmentApi = typeof window !== 'undefined' ? window?.addom?.attachments : null
    if (attachmentId && attachmentApi && typeof attachmentApi.open === 'function') {
      try {
        const result = await attachmentApi.open(attachmentId)
        if (result?.ok) return
        if (!String(part?.data || '').trim()) {
          setAttachmentOpenError(t('core:chat.attachments.errors.cachedOpenFailed', {
            defaultValue: 'Unable to open cached attachment file.',
          }))
          return
        }
      } catch {
        if (!String(part?.data || '').trim()) {
          setAttachmentOpenError(t('core:chat.attachments.errors.cachedOpenFailed', {
            defaultValue: 'Unable to open cached attachment file.',
          }))
          return
        }
      }
    }

    const shellApi = typeof window !== 'undefined' ? window?.addom?.shell : null
    if (!shellApi || typeof shellApi.openAttachmentFile !== 'function') {
      setAttachmentOpenError(t('core:chat.attachments.errors.unavailable', {
        defaultValue: 'Attachment open is unavailable in this build.',
      }))
      return
    }

    const mediaType = String(part?.mediaType || part?.mimeType || '').trim().toLowerCase()
    const data = String(part?.data || '').trim()
    if (!data) {
      setAttachmentOpenError(t('core:chat.attachments.errors.historyUnavailable', {
        defaultValue: 'This attachment cannot be reopened because its data is unavailable in timeline history.',
      }))
      return
    }

    try {
      const result = await shellApi.openAttachmentFile({
        data,
        mediaType,
        fileName,
      })
      if (!result?.ok) {
        setAttachmentOpenError(String(result?.error || t('core:chat.attachments.errors.openFailed', {
          defaultValue: 'Unable to open attachment file.',
        })))
      }
    } catch (error) {
      setAttachmentOpenError(String(error?.message || t('core:chat.attachments.errors.openFailed', {
        defaultValue: 'Unable to open attachment file.',
      })))
    }
  }

  const handleOpenAttachmentFile = async (part = {}) => {
    if (isPdfContentPart(part)) {
      const fileName = String(part?.filename || part?.fileName || '').trim()
      setAttachmentOpenConfirm({
        part,
        fileName: fileName || t('core:chat.attachments.labels.pdfAttachment', {
          defaultValue: 'PDF attachment',
        }),
      })
      return
    }
    await openAttachmentFileNow(part)
  }

  const handleConfirmOpenAttachment = async () => {
    const pending = attachmentOpenConfirm && typeof attachmentOpenConfirm === 'object'
      ? attachmentOpenConfirm
      : null
    setAttachmentOpenConfirm(null)
    if (!pending?.part) return
    await openAttachmentFileNow(pending.part)
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {parts.map((part, idx) => {
          if (part?.type === 'text') {
            const text = String(part.text || '')
            return text ? (
              <span key={idx} className="whitespace-pre-wrap">{text}</span>
            ) : null
          }
          if (part?.type === 'image') {
            const src = resolveImagePartSource(part)
            if (!src && isImageContentPart(part)) {
              return (
                <div
                  key={idx}
                  className="chat-typo-user-attachment-meta max-w-xs rounded-md border border-surface-border bg-surface-panel px-3 py-2 text-text-tertiary"
                  data-chat-render="user-image-attachment"
                >
                  {t('core:chat.attachments.image.unavailable', {
                    defaultValue: 'Image attachment unavailable.',
                  })}
                </div>
              )
            }
            const imageLabel = String(part?.filename || part?.fileName || '').trim() || t('core:chat.attachments.labels.attachedImage', {
              defaultValue: 'Attached image',
            })
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setPreviewImage({ src, label: imageLabel })}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setAttachmentOpenError('')
                  attachmentActions.openMenu(part, event.currentTarget, {
                    x: event.clientX,
                    y: event.clientY,
                  })
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
                  event.preventDefault()
                  const rect = event.currentTarget.getBoundingClientRect()
                  attachmentActions.openMenu(part, event.currentTarget, {
                    x: rect.left + 12,
                    y: rect.top + 12,
                  })
                }}
                className="inline-flex max-w-xs rounded-md border border-surface-border bg-surface-panel p-0.5 transition-colors hover:border-border-hover focus:outline-none focus:ring-1 focus:ring-accent"
                data-chat-render="user-image-attachment"
                title={t('core:chat.attachments.image.open', {
                  defaultValue: 'Open {{label}}',
                  label: imageLabel,
                })}
                aria-label={t('core:chat.attachments.image.open', {
                  defaultValue: 'Open {{label}}',
                  label: imageLabel,
                })}
              >
                <img
                  src={src}
                  alt={imageLabel}
                  className="max-h-48 max-w-xs rounded border border-surface-border object-contain"
                />
              </button>
            )
          }
          if (part?.type === 'file') {
            const fileName = String(part.filename || part.fileName || '').trim()
            const isPdf = isPdfContentPart(part)
            const badgeText = resolveFileAttachmentBadgeText(part)
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleOpenAttachmentFile(part)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setAttachmentOpenError('')
                  attachmentActions.openMenu(part, event.currentTarget, {
                    x: event.clientX,
                    y: event.clientY,
                  })
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
                  event.preventDefault()
                  const rect = event.currentTarget.getBoundingClientRect()
                  attachmentActions.openMenu(part, event.currentTarget, {
                    x: rect.left + 12,
                    y: rect.top + 12,
                  })
                }}
                className="max-w-xs rounded-md border border-surface-border bg-surface-panel px-3 py-2 text-left transition-colors hover:border-border-hover focus:outline-none focus:ring-1 focus:ring-accent"
                data-chat-render="user-file-attachment"
                title={isPdf
                  ? t('core:chat.attachments.file.openPdfViewer', { defaultValue: 'Open PDF in viewer' })
                  : t('core:chat.attachments.file.openAttachedFile', { defaultValue: 'Open attached file' })}
                aria-label={isPdf
                  ? t('core:chat.attachments.file.openPdfAttachment', { defaultValue: 'Open PDF attachment' })
                  : t('core:chat.attachments.file.openFileAttachment', { defaultValue: 'Open file attachment' })}
              >
                <div className="font-mono uppercase tracking-wide text-accent-soft chat-typo-user-attachment-badge">{badgeText}</div>
                <div className="text-text-primary break-all chat-typo-user-attachment-title">
                  {fileName || t('core:chat.attachments.labels.attachedFile', { defaultValue: 'Attached file' })}
                </div>
                <div className="mt-1 text-accent-soft chat-typo-user-attachment-meta">
                  {isPdf
                    ? t('core:chat.attachments.file.clickOpenViewer', { defaultValue: 'Click to open in viewer' })
                    : t('core:chat.attachments.file.clickOpenFile', { defaultValue: 'Click to open file' })}
                </div>
              </button>
            )
          }
          return null
        })}
        {attachmentOpenError && (
          <p className="text-danger-soft chat-typo-user-attachment-meta">{attachmentOpenError}</p>
        )}
      </div>
      <AttachmentImagePreviewDialog
        previewImage={previewImage}
        onClose={() => setPreviewImage(null)}
      />
      <AttachmentOpenConfirmDialog
        attachmentOpenConfirm={attachmentOpenConfirm}
        onClose={() => setAttachmentOpenConfirm(null)}
        onConfirm={() => {
          void handleConfirmOpenAttachment()
        }}
      />
      <AttachmentActionsMenu
        applications={attachmentActions.applications}
        applicationsLoading={attachmentActions.applicationsLoading}
        busy={attachmentActions.busy}
        menu={attachmentActions.menu}
        onClose={attachmentActions.closeMenu}
        onLoadOpenWith={attachmentActions.loadOpenWith}
        onRunAction={attachmentActions.runAction}
      />
    </>
  )
}
