import React, { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRendererTranslation } from '../i18n/use-renderer-translation.mjs'
import { MenuRow, MenuSurface } from './ui/MenuSurface.jsx'
import { resolveProjectMenuPosition } from './workspace-project-entry-state.mjs'

const MENU_WIDTH = 176
const MENU_ESTIMATED_HEIGHT = 176
const VIEWPORT_MARGIN = 8
const ANCHOR_GAP = 4

export default function ProjectEntryActionsMenu({
  anchorElement,
  archived = false,
  menuId,
  menuRef,
  onArchive,
  onClose,
  onCreateThread,
  onRemove,
  onRestore,
  project,
}) {
  const { t } = useRendererTranslation(['core'])
  const localMenuRef = useRef(null)
  const [position, setPosition] = useState({ left: 0, top: 0, ready: false })
  const setMenuNode = useCallback((node) => {
    localMenuRef.current = node
    if (menuRef && typeof menuRef === 'object') menuRef.current = node
  }, [menuRef])

  useLayoutEffect(() => {
    if (!anchorElement || typeof window === 'undefined') return undefined
    const updatePosition = () => {
      if (!anchorElement.isConnected) {
        onClose?.()
        return
      }
      const anchorRect = anchorElement.getBoundingClientRect()
      const menuRect = localMenuRef.current?.getBoundingClientRect?.()
      const next = resolveProjectMenuPosition(anchorRect, {
        width: menuRect?.width || MENU_WIDTH,
        height: menuRect?.height || MENU_ESTIMATED_HEIGHT,
      }, {
        width: window.innerWidth,
        height: window.innerHeight,
        margin: VIEWPORT_MARGIN,
        gap: ANCHOR_GAP,
      })
      setPosition({ ...next, ready: true })
    }

    updatePosition()
    const frameId = window.requestAnimationFrame(() => {
      updatePosition()
      localMenuRef.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus()
    })
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [anchorElement, archived, onClose])

  if (!project || !anchorElement || typeof document === 'undefined') return null

  return createPortal(
    <MenuSurface
      ref={setMenuNode}
      id={menuId}
      role="menu"
      aria-label={t('core:projectEntry.projectActions.ariaLabel', {
        defaultValue: 'Project actions for {{name}}',
        name: project.name,
      })}
      className="fixed z-[120] isolate w-44 bg-surface-panel"
      data-ui="project-entry-actions-menu"
      style={{
        left: `${position.left}px`,
        top: `${position.top}px`,
        visibility: position.ready ? 'visible' : 'hidden',
      }}
    >
      <MenuRow
        role="menuitem"
        className="text-[11px]"
        onClick={() => {
          onCreateThread?.(project.id)
          onClose?.()
        }}
      >
        {t('core:threadDrawer.newThreadTitle', { defaultValue: 'New thread' })}
      </MenuRow>
      <MenuRow
        role="menuitem"
        className="text-[11px]"
        onClick={() => {
          window.addom?.shell?.openPath?.(project.path)
          onClose?.()
        }}
      >
        {t('core:projectEntry.projectActions.openFolder', { defaultValue: 'Open folder' })}
      </MenuRow>
      {archived ? (
        <MenuRow role="menuitem" className="text-[11px]" onClick={() => onRestore?.(project.id)}>
          {t('core:projectEntry.projectActions.restoreToRecent', { defaultValue: 'Restore to Recent' })}
        </MenuRow>
      ) : (
        <MenuRow role="menuitem" className="text-[11px]" onClick={() => onArchive?.(project.id)}>
          {t('core:projectEntry.projectActions.archiveProject', { defaultValue: 'Archive project' })}
        </MenuRow>
      )}
      <div role="separator" className="my-1 border-t border-surface-border" />
      <MenuRow role="menuitem" danger className="text-[11px]" onClick={() => void onRemove?.(project.id)}>
        {t('core:projectEntry.projectActions.removeProject', { defaultValue: 'Remove from ADDOM' })}
      </MenuRow>
    </MenuSurface>,
    document.body,
  )
}
