import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import Icon from '../ui/Icon.jsx'
import { MenuRow, MenuSurface } from '../ui/MenuSurface.jsx'
import {
  resolveAttachmentActionKinds,
  resolveAttachmentMenuPosition,
  resolveAttachmentSubmenuSide,
  resolveNextMenuItemIndex,
} from './attachment-action-menu-state.mjs'

const ROOT_MENU_SIZE = { width: 188, height: 144 }
const SUBMENU_SIZE = { width: 216, height: 176 }
const VIEWPORT_MARGIN = 8
const SUBMENU_GAP = 4

function focusMenuItem(menuNode, direction) {
  const items = [...(menuNode?.querySelectorAll('[role="menuitem"]:not(:disabled)') || [])]
  if (items.length === 0) return
  const currentIndex = items.indexOf(document.activeElement)
  const nextIndex = resolveNextMenuItemIndex(items, currentIndex, direction)
  items[nextIndex]?.focus()
}

function localizedApplicationLabel(application, t) {
  if (application.id === 'default') {
    return t('core:chat.attachments.actions.defaultApp', { defaultValue: 'Default app' })
  }
  if (application.id === 'choose') {
    return t('core:chat.attachments.actions.chooseAnotherApp', { defaultValue: 'Choose another app...' })
  }
  return application.label
}

export default function AttachmentActionsMenu({
  applications = [],
  applicationsLoading = false,
  busy = false,
  menu = null,
  onClose,
  onLoadOpenWith,
  onRunAction,
}) {
  const { t } = useRendererTranslation(['core'])
  const rootMenuId = useId()
  const submenuId = useId()
  const rootRef = useRef(null)
  const submenuRef = useRef(null)
  const openWithRef = useRef(null)
  const [position, setPosition] = useState({ left: 0, top: 0, ready: false })
  const [submenuPosition, setSubmenuPosition] = useState({ left: 0, top: 0, ready: false })
  const [submenuOpen, setSubmenuOpen] = useState(false)

  const close = useCallback((restoreFocus = true) => {
    setSubmenuOpen(false)
    onClose?.(restoreFocus)
  }, [onClose])

  const openSubmenu = useCallback((focusFirst = false) => {
    setSubmenuOpen(true)
    onLoadOpenWith?.()
    if (focusFirst) {
      window.requestAnimationFrame(() => focusMenuItem(submenuRef.current, 1))
    }
  }, [onLoadOpenWith])

  useEffect(() => {
    setSubmenuOpen(false)
  }, [menu])

  useLayoutEffect(() => {
    if (!menu || typeof window === 'undefined') return undefined
    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect?.()
      const next = resolveAttachmentMenuPosition(
        menu.point,
        { width: rect?.width || ROOT_MENU_SIZE.width, height: rect?.height || ROOT_MENU_SIZE.height },
        { width: window.innerWidth, height: window.innerHeight },
        VIEWPORT_MARGIN,
      )
      setPosition({ ...next, ready: true })
    }
    updatePosition()
    const frameId = window.requestAnimationFrame(() => {
      updatePosition()
      focusMenuItem(rootRef.current, 1)
    })
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [menu])

  useLayoutEffect(() => {
    if (!submenuOpen || typeof window === 'undefined') return
    const anchorRect = openWithRef.current?.getBoundingClientRect?.()
    const submenuRect = submenuRef.current?.getBoundingClientRect?.()
    if (!anchorRect) return
    const width = submenuRect?.width || SUBMENU_SIZE.width
    const height = submenuRect?.height || SUBMENU_SIZE.height
    const side = resolveAttachmentSubmenuSide({
      menuRight: anchorRect.right,
      submenuWidth: width,
      viewportWidth: window.innerWidth,
      margin: VIEWPORT_MARGIN,
    })
    const point = {
      x: side === 'right' ? anchorRect.right + SUBMENU_GAP : anchorRect.left - width - SUBMENU_GAP,
      y: anchorRect.top - 4,
    }
    setSubmenuPosition({
      ...resolveAttachmentMenuPosition(
        point,
        { width, height },
        { width: window.innerWidth, height: window.innerHeight },
        VIEWPORT_MARGIN,
      ),
      ready: true,
    })
  }, [applications, applicationsLoading, position, submenuOpen])

  useEffect(() => {
    if (!menu || typeof window === 'undefined') return undefined
    const handlePointerDown = (event) => {
      if (rootRef.current?.contains(event.target) || submenuRef.current?.contains(event.target)) return
      close(true)
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') close(true)
    }
    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [close, menu])

  if (!menu || typeof document === 'undefined') return null
  const actionKinds = resolveAttachmentActionKinds(menu)
  const labels = {
    copy: t('core:chat.attachments.actions.copy', { defaultValue: 'Copy' }),
    show_in_folder: t('core:chat.attachments.actions.showInFolder', { defaultValue: 'Show in folder' }),
    save_as: t('core:chat.attachments.actions.saveAs', { defaultValue: 'Save as...' }),
    open_with: t('core:chat.attachments.actions.openWith', { defaultValue: 'Open with' }),
  }
  const icons = {
    copy: 'copy',
    show_in_folder: 'folder-open',
    save_as: 'floppy-disk',
    open_with: 'app-window',
  }

  const handleRootKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      focusMenuItem(rootRef.current, event.key === 'ArrowDown' ? 1 : -1)
    } else if (event.key === 'ArrowRight' && document.activeElement === openWithRef.current) {
      event.preventDefault()
      openSubmenu(true)
    }
  }

  const handleSubmenuKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      focusMenuItem(submenuRef.current, event.key === 'ArrowDown' ? 1 : -1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setSubmenuOpen(false)
      openWithRef.current?.focus()
    }
  }

  return createPortal(
    <>
      <MenuSurface
        ref={rootRef}
        id={rootMenuId}
        role="menu"
        aria-label={t('core:chat.attachments.actions.menuAriaLabel', {
          defaultValue: 'Attachment actions for {{name}}',
          name: menu.label,
        })}
        className="fixed z-[120] isolate w-[11.75rem] bg-surface-panel"
        data-ui="attachment-actions-menu"
        onKeyDown={handleRootKeyDown}
        style={{
          left: `${position.left}px`,
          top: `${position.top}px`,
          visibility: position.ready ? 'visible' : 'hidden',
        }}
      >
        {actionKinds.map((action) => (
          <MenuRow
            key={action}
            ref={action === 'open_with' ? openWithRef : undefined}
            role="menuitem"
            disabled={busy}
            aria-haspopup={action === 'open_with' ? 'menu' : undefined}
            aria-expanded={action === 'open_with' ? submenuOpen : undefined}
            aria-controls={action === 'open_with' && submenuOpen ? submenuId : undefined}
            className="h-8 text-[11px]"
            onMouseEnter={() => {
              if (action === 'open_with') openSubmenu(false)
              else setSubmenuOpen(false)
            }}
            onClick={() => {
              if (action === 'open_with') openSubmenu(true)
              else void onRunAction?.(action)
            }}
          >
            <Icon name={icons[action]} size={14} className="text-text-muted" />
            <span className="min-w-0 flex-1 truncate">{labels[action]}</span>
            {action === 'open_with' && <Icon name="caret-right" size={12} className="text-text-muted" />}
          </MenuRow>
        ))}
      </MenuSurface>
      {submenuOpen && (
        <MenuSurface
          ref={submenuRef}
          id={submenuId}
          role="menu"
          aria-label={labels.open_with}
          aria-busy={applicationsLoading || undefined}
          className="fixed z-[121] isolate w-[13.5rem] bg-surface-panel"
          data-ui="attachment-open-with-menu"
          onKeyDown={handleSubmenuKeyDown}
          style={{
            left: `${submenuPosition.left}px`,
            top: `${submenuPosition.top}px`,
            visibility: submenuPosition.ready ? 'visible' : 'hidden',
          }}
        >
          {applicationsLoading ? (
            <MenuRow role="menuitem" disabled className="h-8 text-[11px]">...</MenuRow>
          ) : applications.map((application) => (
            <MenuRow
              key={application.id}
              role="menuitem"
              disabled={busy}
              className="h-8 text-[11px]"
              onClick={() => void onRunAction?.('open_with', application.id)}
            >
              <span className="min-w-0 flex-1 truncate">
                {localizedApplicationLabel(application, t)}
              </span>
            </MenuRow>
          ))}
        </MenuSurface>
      )}
    </>,
    document.body,
  )
}
