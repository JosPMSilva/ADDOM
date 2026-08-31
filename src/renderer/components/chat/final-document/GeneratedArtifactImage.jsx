import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRendererTranslation } from '../../../i18n/use-renderer-translation.mjs'
import { DIALOG_Z_ELEVATED } from '../../dialog-layering.mjs'
import AttachmentActionsMenu from '../AttachmentActionsMenu.jsx'
import useAttachmentActions from '../use-attachment-actions.js'
import Icon from '../../ui/Icon.jsx'
import IconButton from '../../ui/IconButton.jsx'
import { useDialogFocusTrap } from '../../use-dialog-focus-trap.mjs'
import { useDialogEscapeDismiss } from '../../use-dialog-escape-dismiss.mjs'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 4
const ZOOM_STEP = 0.25

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value || 1)))
}

function GeneratedImageViewer({ image = null, onClose = () => {} }) {
  const { t } = useRendererTranslation(['core'])
  const [zoom, setZoom] = useState(1)
  const dialogRef = useRef(null)
  useDialogFocusTrap(!!image, dialogRef)
  useDialogEscapeDismiss(!!image, dialogRef, onClose)

  useEffect(() => {
    if (!image) return undefined
    const handleKeyDown = (event) => {
      if (event.key === '+' || event.key === '=') setZoom((value) => clampZoom(value + ZOOM_STEP))
      if (event.key === '-') setZoom((value) => clampZoom(value - ZOOM_STEP))
      if (event.key === '0') setZoom(1)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [image, onClose])

  if (!image || typeof document === 'undefined') return null
  const zoomInLabel = t('core:terminal.viewport.context.zoomIn', { defaultValue: 'Zoom in' })
  const zoomOutLabel = t('core:terminal.viewport.context.zoomOut', { defaultValue: 'Zoom out' })
  const resetLabel = t('core:terminal.viewport.context.zoomReset', { defaultValue: 'Reset zoom' })
  const closeLabel = t('core:chat.attachments.image.closePreviewAriaLabel', {
    defaultValue: 'Close image preview',
  })

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      className={`fixed inset-0 ${DIALOG_Z_ELEVATED} flex flex-col bg-black/85`}
      data-chat-render="assistant-generated-image-preview-modal"
      role="dialog"
      aria-modal="true"
      aria-label={image.label}
      onClick={onClose}
    >
      <div
        className="flex h-12 shrink-0 items-center justify-end gap-1 border-b border-white/10 bg-black/45 px-3"
        onClick={(event) => event.stopPropagation()}
      >
        <IconButton
          onClick={() => setZoom((value) => clampZoom(value - ZOOM_STEP))}
          disabled={zoom <= MIN_ZOOM}
          label={zoomOutLabel}
          className="text-white/75 hover:bg-white/10 hover:text-white"
        >
          <Icon name="minus" size={14} />
        </IconButton>
        <button
          type="button"
          className="min-w-14 rounded px-2 py-1 text-xs tabular-nums text-white/75 hover:bg-white/10"
          onClick={() => setZoom(1)}
          aria-label={resetLabel}
        >
          {Math.round(zoom * 100)}%
        </button>
        <IconButton
          onClick={() => setZoom((value) => clampZoom(value + ZOOM_STEP))}
          disabled={zoom >= MAX_ZOOM}
          label={zoomInLabel}
          className="text-white/75 hover:bg-white/10 hover:text-white"
        >
          <Icon name="plus" size={14} />
        </IconButton>
        <IconButton
          onClick={onClose}
          label={closeLabel}
          className="text-white/75 hover:bg-white/10 hover:text-white"
        >
          <Icon name="x" size={14} weight="bold" />
        </IconButton>
      </div>
      <div
        className="min-h-0 flex-1 overflow-auto p-4"
        onClick={(event) => event.stopPropagation()}
        onWheel={(event) => {
          if (!event.ctrlKey) return
          event.preventDefault()
          setZoom((value) => clampZoom(value + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)))
        }}
      >
        <div
          className="flex min-h-full min-w-full items-center justify-center"
          style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
        >
          <img
            src={image.src}
            alt={image.label}
            className="max-h-full max-w-full rounded-sm object-contain shadow-[0_18px_60px_rgb(var(--theme-shadow-rgb)_/_0.4)]"
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default function GeneratedArtifactImage({
  artifact = null,
  alt = '',
  messageId = '',
  threadId = '',
}) {
  const { t } = useRendererTranslation(['core'])
  const [viewerOpen, setViewerOpen] = useState(false)
  const [actionError, setActionError] = useState('')
  const actions = useAttachmentActions({
    messageId,
    threadId,
    onError: setActionError,
  })
  const label = String(alt || artifact?.fileName || t('core:chat.attachments.labels.attachedImage', {
    defaultValue: 'Attached image',
  }))
  const descriptor = useMemo(() => ({
    attachmentId: String(artifact?.attachmentId || '').trim(),
    kind: 'image',
    mediaType: String(artifact?.mediaType || 'image/png').trim(),
    fileName: String(artifact?.fileName || label).trim(),
  }), [artifact, label])
  if (!artifact) return null

  const openContextMenu = (event, point) => {
    event.preventDefault()
    setActionError('')
    actions.openMenu(descriptor, event.currentTarget, point)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setViewerOpen(true)}
        onContextMenu={(event) => openContextMenu(event, { x: event.clientX, y: event.clientY })}
        onKeyDown={(event) => {
          if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
          const rect = event.currentTarget.getBoundingClientRect()
          openContextMenu(event, { x: rect.left + 12, y: rect.top + 12 })
        }}
        className="my-3 inline-flex max-w-full rounded-lg border border-surface-border bg-surface-panel p-1 text-left transition-colors hover:border-border-hover focus:outline-none focus:ring-1 focus:ring-accent"
        data-chat-render="assistant-generated-image"
        data-generated-image-thumbnail="true"
        data-attachment-id={artifact.attachmentId || undefined}
        aria-label={label}
        aria-haspopup="dialog"
      >
        <img
          src={artifact.previewUrl}
          alt={label}
          className="max-h-48 max-w-[min(100%,18rem)] rounded-md object-contain"
          loading="lazy"
        />
      </button>
      {actionError ? <span className="block text-xs text-danger-soft">{actionError}</span> : null}
      {viewerOpen ? (
        <GeneratedImageViewer
          image={{ src: artifact.previewUrl, label }}
          onClose={() => setViewerOpen(false)}
        />
      ) : null}
      <AttachmentActionsMenu
        applications={actions.applications}
        applicationsLoading={actions.applicationsLoading}
        busy={actions.busy}
        menu={actions.menu}
        onClose={actions.closeMenu}
        onLoadOpenWith={actions.loadOpenWith}
        onRunAction={actions.runAction}
      />
    </>
  )
}
