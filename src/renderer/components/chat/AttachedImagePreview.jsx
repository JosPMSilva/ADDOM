import React from 'react'
import Icon from '../ui/Icon.jsx'

function RemoveIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function PdfIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
    >
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
      <path d="M14 2v5h5" />
      <path d="M8 14h8" />
      <path d="M8 18h5" />
    </svg>
  )
}

function isPdfAttachment(item) {
  const mediaType = String(item?.mediaType || '').trim().toLowerCase()
  if (mediaType === 'application/pdf' || mediaType === 'application/x-pdf') return true
  const fileName = String(item?.fileName || '').trim().toLowerCase()
  return fileName.endsWith('.pdf')
}

function isImageAttachment(item) {
  const kind = String(item?.kind || item?.type || '').trim().toLowerCase()
  if (kind === 'image') return true
  const mediaType = String(item?.mediaType || item?.mimeType || '').trim().toLowerCase()
  return mediaType.startsWith('image/')
}

function resolveAttachmentImageSrc(item = {}) {
  const previewUrl = String(item?.previewUrl || '').trim()
  const attachmentId = String(item?.attachmentId || '').trim()
  if (previewUrl) {
    if (attachmentId && /^file:/i.test(previewUrl)) {
      return `addom-attachment://attachment/${encodeURIComponent(attachmentId)}`
    }
    return previewUrl
  }
  return String(item?.dataUrl || '').trim()
}

function getKnowledgeBaseView(knowledgeBaseState = '', knowledgeBaseBusy = false) {
  if (knowledgeBaseBusy) {
    return {
      status: 'Adding',
      action: 'Adding',
      icon: 'circle-notch',
      tone: 'neutral',
      disabled: true,
    }
  }
  if (knowledgeBaseState === 'attached') {
    return {
      status: 'Added',
      action: 'Added',
      icon: 'check',
      tone: 'success',
      disabled: true,
    }
  }
  if (knowledgeBaseState === 'uploaded') {
    return {
      status: 'Uploaded',
      action: 'Attach',
      icon: 'paperclip',
      tone: 'accent',
      disabled: false,
    }
  }
  return {
    status: 'Local',
    action: 'Add',
    icon: 'database',
    tone: 'muted',
    disabled: false,
  }
}

function getKnowledgeBaseStatusClass(tone = 'muted') {
  if (tone === 'success') return 'border-success-border/50 text-success-soft'
  if (tone === 'accent') return 'border-accent/30 text-accent-soft'
  return 'border-surface-border/70 text-text-tertiary'
}

/**
 * Horizontal strip of image thumbnails with remove buttons.
 *
 * Props:
 *   images: Array<{ id: string, attachmentId?: string, kind?: 'image'|'file', previewUrl?: string, dataUrl?: string, mediaType: string, fileName: string }>
 *   onRemove: (id: string) => void
 */
function AttachedImagePreview({
  images,
  onRemove,
  openAIKnowledgeBaseEnabled = false,
  openAIKnowledgeBaseStateByAttachmentId = {},
  openAIKnowledgeBaseBusyAttachmentIds = [],
  onAddToOpenAIKnowledgeBase = null,
}) {
  if (!Array.isArray(images) || images.length === 0) return null
  const knowledgeBaseStateLookup = openAIKnowledgeBaseStateByAttachmentId && typeof openAIKnowledgeBaseStateByAttachmentId === 'object'
    ? openAIKnowledgeBaseStateByAttachmentId
    : {}
  const busyAttachmentIds = new Set(
    Array.isArray(openAIKnowledgeBaseBusyAttachmentIds)
      ? openAIKnowledgeBaseBusyAttachmentIds.map((value) => String(value || '').trim()).filter(Boolean)
      : [],
  )

  return (
    <div
      className="flex flex-wrap gap-2 px-1 py-1.5"
      data-ui="attached-image-preview"
    >
      {images.map((img, index) => {
        const imageAttachment = isImageAttachment(img)
        const pdfAttachment = isPdfAttachment(img)
        const imageSrc = resolveAttachmentImageSrc(img)
        const badgeText = pdfAttachment
          ? 'PDF'
          : (imageAttachment ? 'Image' : 'File')
        const displayName = String(img.fileName || img.filename || '').trim()
        const attachmentId = String(img.attachmentId || img.id || '').trim()
        const knowledgeBaseState = String(knowledgeBaseStateLookup[attachmentId] || '').trim().toLowerCase()
        const knowledgeBaseBusy = busyAttachmentIds.has(attachmentId)
        const knowledgeBaseStateAttribute = knowledgeBaseBusy ? 'adding' : (knowledgeBaseState || 'local')
        const knowledgeBaseView = getKnowledgeBaseView(knowledgeBaseState, knowledgeBaseBusy)
        const knowledgeBaseTitle = knowledgeBaseBusy
          ? 'Adding this attachment to the OpenAI knowledge base'
          : knowledgeBaseState === 'attached'
            ? 'Already added to OpenAI knowledge base'
            : 'Add this attachment to the OpenAI knowledge base'
        const canAddToKnowledgeBase = (
          !imageAttachment
          && openAIKnowledgeBaseEnabled
          && !!attachmentId
          && typeof onAddToOpenAIKnowledgeBase === 'function'
        )
        return (
          <div
            key={img.id || img.attachmentId || `attachment-${index}`}
            className="relative group shrink-0"
            title={displayName || img.mediaType || (pdfAttachment ? 'PDF attachment' : (imageAttachment ? 'Image' : 'File attachment'))}
            data-ui="attached-preview-item"
            data-attachment-id={attachmentId || undefined}
            data-attachment-kind={imageAttachment ? 'image' : 'file'}
            data-knowledge-state={canAddToKnowledgeBase ? knowledgeBaseStateAttribute : undefined}
          >
            {imageAttachment && imageSrc ? (
              <img
                src={imageSrc}
                alt={displayName || 'Attached image'}
                className="h-14 w-auto max-w-[116px] rounded-md border border-surface-border bg-surface-panel object-cover"
                draggable={false}
              />
            ) : (
              <div
                className="flex h-14 w-[128px] flex-col justify-between rounded-md border border-surface-border bg-surface-panel px-2 py-1.5"
                data-ui={pdfAttachment ? 'attached-pdf-preview' : 'attached-file-preview'}
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-[10px] text-text-secondary">
                    <PdfIcon />
                    <span>{pdfAttachment ? 'Document' : 'Attachment'}</span>
                  </span>
                  <span className="rounded border border-surface-border px-1 py-0.5 text-[9px] text-text-muted">{badgeText}</span>
                </div>
                <div className="text-[10px] text-text-secondary truncate">
                  {displayName || (pdfAttachment ? 'Attachment.pdf' : 'Attachment')}
                </div>
                {canAddToKnowledgeBase && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span
                      className={[
                        'inline-flex h-5 items-center rounded border bg-transparent px-1.5 text-[9px] leading-none',
                        getKnowledgeBaseStatusClass(knowledgeBaseView.tone),
                      ].join(' ')}
                      data-ui="attached-knowledge-state"
                    >
                      {knowledgeBaseView.status}
                    </span>
                    <button
                      type="button"
                      disabled={knowledgeBaseView.disabled}
                      onClick={() => onAddToOpenAIKnowledgeBase?.(img)}
                      className="inline-flex h-5 items-center gap-1 rounded border border-surface-border bg-surface px-1.5 text-[9px] leading-none text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-45"
                      title={knowledgeBaseTitle}
                      aria-label={`${knowledgeBaseView.action} ${displayName || 'attachment'} to OpenAI knowledge base`}
                      data-ui="attached-knowledge-action"
                    >
                      <Icon
                        name={knowledgeBaseView.icon}
                        size={10}
                        className={knowledgeBaseBusy ? 'animate-spin' : ''}
                      />
                      {knowledgeBaseView.action}
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => onRemove?.(img.id || img.attachmentId)}
              className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-surface-border bg-surface-panel text-text-muted opacity-0 transition-colors hover:border-danger hover:bg-danger hover:text-surface group-hover:opacity-100 focus:opacity-100"
              title="Remove attachment"
              aria-label={`Remove ${displayName || 'attachment'}`}
            >
              <RemoveIcon />
            </button>
            {!pdfAttachment && imageAttachment && displayName && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate rounded-b-md bg-black/50 px-1 py-0.5 text-[9px] text-text-secondary opacity-0 transition-opacity group-hover:opacity-100">
                {displayName}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default AttachedImagePreview
