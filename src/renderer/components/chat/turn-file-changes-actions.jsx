import React, { useEffect, useRef, useState } from 'react'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'

function EllipsisIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
      <circle cx="3" cy="8" r="1.2" />
      <circle cx="8" cy="8" r="1.2" />
      <circle cx="13" cy="8" r="1.2" />
    </svg>
  )
}

function OverflowMenu({
  items = [],
  buttonTitle = 'More actions',
  className = '',
}) {
  const { t } = useRendererTranslation(['core'])
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined
    const onPointerDown = (event) => {
      const root = rootRef.current
      if (!root || root.contains(event.target)) return
      setOpen(false)
    }
    const onEscape = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown, true)
    window.addEventListener('keydown', onEscape)
    return () => {
      window.removeEventListener('mousedown', onPointerDown, true)
      window.removeEventListener('keydown', onEscape)
    }
  }, [open])

  const normalizedItems = Array.isArray(items)
    ? items.filter((item) => item && typeof item === 'object')
    : []

  if (normalizedItems.length === 0) return null

  return (
    <div className={[
      'relative shrink-0',
      className,
    ].join(' ')} ref={rootRef}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
        className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-surface-border text-text-tertiary hover:text-text-primary hover:border-border-hover"
        title={buttonTitle}
        aria-label={buttonTitle}
        aria-expanded={open}
      >
        <EllipsisIcon />
      </button>
      {open ? (
        <div
          role="menu"
          data-ui="turn-file-changes-overflow-menu"
          className="absolute right-0 bottom-[calc(100%+6px)] z-50 min-w-[10.5rem] rounded-md border border-surface-border bg-surface-panel p-1 shadow-[0_12px_20px_rgb(var(--theme-shadow-rgb)_/_0.35)]"
        >
          {normalizedItems.map((item, index) => {
            const itemId = String(item.id || `item-${index}`)
            const itemLabel = String(item.label || '').trim() || t('core:chat.fileChanges.actions.fallbackAction', { defaultValue: 'Action' })
            const disabled = item.disabled === true
            const danger = item.danger === true
            return (
              <button
                key={itemId}
                type="button"
                role="menuitem"
                disabled={disabled}
                title={item.title ? String(item.title) : ''}
                onClick={(event) => {
                  event.stopPropagation()
                  if (disabled) return
                  setOpen(false)
                  item.onSelect?.()
                }}
                className={[
                  'chat-typo-file-changes-menu-item w-full rounded px-2 py-1.5 text-left transition-colors disabled:opacity-45 disabled:cursor-not-allowed',
                  danger
                    ? 'text-danger-soft hover:bg-danger-bg/70'
                    : 'text-text-subtle hover:bg-surface',
                ].join(' ')}
              >
                {itemLabel}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export function buildRowActionItems({
  t,
  onOpen,
  onOpenDocument,
  onReview,
  onCopyPath,
} = {}) {
  const translate = typeof t === 'function' ? t : (_key, options = {}) => options.defaultValue || ''
  const items = [
    {
      id: 'open',
      label: translate('core:chat.fileChanges.actions.openInEditor', { defaultValue: 'Open in editor' }),
      onSelect: onOpen,
    },
  ]
  if (typeof onOpenDocument === 'function') {
    items.push({
      id: 'open-document',
      label: translate('core:chat.fileChanges.actions.openInDocumentViewer', { defaultValue: 'Open in document viewer' }),
      onSelect: onOpenDocument,
    })
  }
  items.push(
    {
      id: 'review',
      label: translate('core:chat.fileChanges.actions.openArtifacts', { defaultValue: 'Open artifacts' }),
      onSelect: onReview,
    },
    {
      id: 'copy',
      label: translate('core:chat.fileChanges.actions.copyPath', { defaultValue: 'Copy path' }),
      onSelect: onCopyPath,
    },
  )
  return items
}

export default function RowActions({
  onOpen,
  onOpenDocument,
  onReview,
  onCopyPath,
  onUndo,
  onDelete,
  canUndo = true,
  canDelete = true,
  undoBusy = false,
  deleteBusy = false,
  undoReason = '',
  deleteReason = '',
  className = '',
}) {
  const { t } = useRendererTranslation(['core'])
  const items = buildRowActionItems({ t, onOpen, onOpenDocument, onReview, onCopyPath })

  if (typeof onDelete === 'function') {
    items.push({
      id: 'delete',
      label: deleteBusy
        ? t('core:chat.fileChanges.actions.deleting', { defaultValue: 'Deleting...' })
        : t('core:chat.fileChanges.actions.deleteFile', { defaultValue: 'Delete file' }),
      title: deleteReason || '',
      disabled: !canDelete || deleteBusy,
      danger: true,
      onSelect: onDelete,
    })
  } else if (typeof onUndo === 'function') {
    items.push({
      id: 'undo',
      label: undoBusy
        ? t('core:chat.fileChanges.actions.undoing', { defaultValue: 'Undoing...' })
        : t('core:chat.fileChanges.actions.undoChange', { defaultValue: 'Undo change' }),
      title: undoReason || '',
      disabled: !canUndo || undoBusy,
      danger: true,
      onSelect: onUndo,
    })
  }

  return (
    <OverflowMenu
      className={className}
      items={items}
      buttonTitle={t('core:chat.fileChanges.actions.menuTitle', { defaultValue: 'File actions' })}
    />
  )
}
