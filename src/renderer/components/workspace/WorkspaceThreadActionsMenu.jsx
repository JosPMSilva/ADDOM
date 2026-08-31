import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import { MenuRow, MenuSurface } from '../ui/MenuSurface.jsx'
import { resolveProjectMenuPosition } from '../workspace-project-entry-state.mjs'
import {
  canDismissWorkspaceThreadMenu,
  runWorkspaceThreadMenuAction,
} from './workspace-thread-actions.mjs'

const MENU_WIDTH = 176
const MENU_HEIGHT = 116

export default function WorkspaceThreadActionsMenu({
  actionError = '',
  anchorElement,
  menuId,
  onClose,
  onDelete,
  onRename,
  projectId,
  thread,
}) {
  const { t } = useRendererTranslation(['core'])
  const menuRef = useRef(null)
  const inputRef = useRef(null)
  const [position, setPosition] = useState({ left: 0, top: 0, ready: false })
  const [renaming, setRenaming] = useState(false)
  const [renameFocusOrigin, setRenameFocusOrigin] = useState('keyboard')
  const [renameValue, setRenameValue] = useState('')
  const [pending, setPending] = useState(false)

  const dismiss = useCallback((restoreFocus = false) => {
    onClose?.()
    if (restoreFocus) window.requestAnimationFrame(() => anchorElement?.focus())
  }, [anchorElement, onClose])

  useEffect(() => {
    if (!anchorElement) return undefined
    const handlePointerDown = (event) => {
      if (!canDismissWorkspaceThreadMenu(pending)) return
      if (menuRef.current?.contains(event.target) || anchorElement.contains(event.target)) return
      dismiss(true)
    }
    const handleKeyDown = (event) => {
      if (!canDismissWorkspaceThreadMenu(pending)) return
      if (event.key === 'Escape') dismiss(true)
    }
    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [anchorElement, dismiss, pending])

  useLayoutEffect(() => {
    if (!anchorElement || typeof window === 'undefined') return undefined
    const updatePosition = () => {
      if (!anchorElement.isConnected) {
        dismiss()
        return
      }
      const rect = menuRef.current?.getBoundingClientRect?.()
      const next = resolveProjectMenuPosition(
        anchorElement.getBoundingClientRect(),
        { width: rect?.width || MENU_WIDTH, height: rect?.height || MENU_HEIGHT },
        { width: window.innerWidth, height: window.innerHeight, margin: 8, gap: 4 },
      )
      setPosition({ ...next, ready: true })
    }
    updatePosition()
    const frameId = window.requestAnimationFrame(() => {
      updatePosition()
      menuRef.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus()
    })
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [anchorElement, dismiss, renaming])

  useEffect(() => {
    if (renaming) inputRef.current?.select()
  }, [renaming])

  if (!thread || !projectId || !anchorElement || typeof document === 'undefined') return null
  const title = String(thread.title || t('core:threadDrawer.fallbackTitle', { defaultValue: 'Untitled thread' })).trim()

  const submitRename = async (event) => {
    event.preventDefault()
    const nextTitle = renameValue.trim()
    if (!nextTitle || nextTitle === title) {
      dismiss(true)
      return
    }
    await runWorkspaceThreadMenuAction(
      () => onRename?.({ projectId, threadId: thread.id, title: nextTitle }),
      { onPendingChange: setPending, onSuccess: () => dismiss(true) },
    )
  }

  const requestDelete = async () => {
    await runWorkspaceThreadMenuAction(
      () => onDelete?.({ projectId, threadId: thread.id, title }),
      {
        onPendingChange: setPending,
        onSuccess: () => dismiss(true),
        onCancelled: () => dismiss(true),
      },
    )
  }

  return createPortal(
    <MenuSurface
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-label={`${t('core:threadDrawer.renameTitle', { defaultValue: 'Thread actions' })}: ${title}`}
      className="fixed z-[125] isolate w-44 bg-surface-panel"
      data-ui="workspace-thread-actions-menu"
      style={{
        left: `${position.left}px`,
        top: `${position.top}px`,
        visibility: position.ready ? 'visible' : 'hidden',
      }}
    >
      {renaming ? (
        <form onSubmit={submitRename} className="space-y-1.5 p-1.5">
          <label className="sr-only" htmlFor={`${menuId}-rename-input`}>
            {t('core:chat.threadModals.rename.title', { defaultValue: 'Rename thread' })}
          </label>
          <input
            ref={inputRef}
            id={`${menuId}-rename-input`}
            data-ui="workspace-thread-rename-input"
            data-focus-origin={renameFocusOrigin}
            value={renameValue}
            disabled={pending}
            onChange={(event) => setRenameValue(event.target.value)}
            className="h-7 w-full rounded-md border border-surface-border bg-surface px-2 text-[11px] text-text-primary outline-none focus:border-border-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-hover/60"
          />
          <div className="flex justify-end gap-1">
            <button type="button" disabled={pending} onClick={() => { setRenameFocusOrigin('keyboard'); setRenaming(false) }} className="rounded px-2 py-1 text-[10px] text-text-muted hover:text-text-primary">
              {t('core:chat.threadModals.common.cancel', { defaultValue: 'Cancel' })}
            </button>
            <button type="submit" disabled={pending} className="rounded bg-surface-panel-alt px-2 py-1 text-[10px] font-medium text-text-primary transition-colors hover:bg-surface-border/70 disabled:opacity-50">
              {t('core:chat.threadModals.rename.confirm', { defaultValue: 'Save' })}
            </button>
          </div>
        </form>
      ) : (
        <>
          <MenuRow
            role="menuitem"
            disabled={pending}
            className="text-[11px]"
            onClick={(event) => {
              setRenameFocusOrigin(event.detail === 0 ? 'keyboard' : 'pointer')
              setRenameValue(title)
              setRenaming(true)
            }}
          >
            {t('core:threadDrawer.renameTitle', { defaultValue: 'Rename thread' })}
          </MenuRow>
          <MenuRow role="menuitem" danger disabled={pending} className="text-[11px]" onClick={() => void requestDelete()}>
            {t('core:threadDrawer.deleteTitle', { defaultValue: 'Delete thread' })}
          </MenuRow>
        </>
      )}
      {actionError && <p role="status" className="px-2 pb-1.5 text-[10px] leading-4 text-danger-soft">{actionError}</p>}
    </MenuSurface>,
    document.body,
  )
}
