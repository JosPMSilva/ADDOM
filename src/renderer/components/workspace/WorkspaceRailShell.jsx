import React, { useCallback, useEffect, useRef } from 'react'
import { scaleDesignPixels } from '../../../common/ui/ui-scaling-settings.mjs'
import useAppStore from '../../store/useAppStore.js'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import { useDialogFocusTrap } from '../use-dialog-focus-trap.mjs'
import Icon from '../ui/Icon.jsx'
import {
  WORKSPACE_RAIL_MAX_WIDTH,
  WORKSPACE_RAIL_MIN_WIDTH,
} from './workspace-rail-state.mjs'
import {
  createWorkspaceRailDragSession,
  resolveWorkspaceRailKeyboardCommand,
  startWorkspaceRailDragPresentation,
} from './workspace-rail-interactions.mjs'
import {
  useWorkspaceRailControl,
  useWorkspaceRailFocusReturn,
  useWorkspaceRailNarrow,
} from './use-workspace-rail-hooks.mjs'

export default function WorkspaceRailShell({
  children,
  enabled = false,
  narrow: narrowOverride,
  open: openOverride,
  width: widthOverride,
  onOpenChange,
  onWidthChange,
  control: controlOverride,
  headerActions = null,
}) {
  const { t } = useRendererTranslation(['core'])
  const fallbackControl = useWorkspaceRailControl({
    open: openOverride,
    width: widthOverride,
    onOpenChange,
    onWidthChange,
  })
  const control = controlOverride || fallbackControl
  const uiScale = useAppStore((state) => state.uiScale)
  const railRef = useRef(null)
  const dragSessionRef = useRef(null)
  const narrow = useWorkspaceRailNarrow(narrowOverride)
  const { open, requestOpen, requestWidth, width } = control
  const scaledWidth = scaleDesignPixels(width, uiScale)

  useDialogFocusTrap(enabled && narrow && open, railRef, { restoreFocus: false })

  useEffect(() => () => dragSessionRef.current?.cleanup(), [])

  useWorkspaceRailFocusReturn(enabled, open)

  const handlePointerDown = useCallback((event) => {
    if (!open || narrow || typeof window === 'undefined') return
    if (event.button !== 0 || event.isPrimary === false) return
    dragSessionRef.current?.cleanup()
    const captureTarget = event.currentTarget
    const restorePresentation = startWorkspaceRailDragPresentation({
      railElement: railRef.current,
      bodyElement: document.body,
    })
    dragSessionRef.current = createWorkspaceRailDragSession({
      eventTarget: window,
      captureTarget,
      pointerId: event.pointerId,
      startClientX: Number(event.clientX || 0),
      startWidth: width,
      uiScale,
      onPreview: (nextWidth) => {
        if (railRef.current) railRef.current.style.width = `${scaleDesignPixels(nextWidth, uiScale)}px`
      },
      onCancel: () => {
        dragSessionRef.current = null
        if (railRef.current) railRef.current.style.width = `${scaleDesignPixels(width, uiScale)}px`
      },
      onCleanup: () => {
        restorePresentation()
      },
      onCommit: (result) => {
        dragSessionRef.current = null
        if (railRef.current) railRef.current.style.width = `${scaledWidth}px`
        if (result.open) requestWidth(result.width)
        else requestOpen(false)
      },
    })
  }, [narrow, open, requestOpen, requestWidth, scaledWidth, uiScale, width])

  const handleSeparatorKeyDown = useCallback((event) => {
    const result = resolveWorkspaceRailKeyboardCommand(event.key, width)
    if (!result.handled) return
    event.preventDefault()
    if (result.open) requestWidth(result.width)
    else requestOpen(false)
  }, [requestOpen, requestWidth, width])

  if (!enabled) return null
  if (narrow && !open) {
    return <div hidden data-ui="workspace-rail-activity-monitor">{children}</div>
  }

  const rail = (
    <aside
      ref={railRef}
      aria-label={t('core:workspaceRail.ariaLabel', { defaultValue: 'Projects and threads' })}
      className={[
        'relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden bg-surface',
        'transition-[width,min-width,max-width,opacity,transform] duration-150 ease-out motion-reduce:transition-none',
        narrow
          ? 'pointer-events-auto w-[min(32.5rem,calc(100%-3rem))] max-w-full border-r border-surface-border shadow-xl'
          : open ? 'border-r border-surface-border opacity-100 translate-x-0' : 'pointer-events-none opacity-0 -translate-x-4',
      ].join(' ')}
      data-layout={narrow ? 'overlay' : 'in-flow'}
      data-ui="workspace-rail-shell"
      role={narrow ? 'dialog' : undefined}
      aria-modal={narrow ? 'true' : undefined}
      tabIndex={narrow ? -1 : undefined}
      style={narrow ? undefined : {
        width: open ? scaledWidth : 0,
        minWidth: open ? scaleDesignPixels(WORKSPACE_RAIL_MIN_WIDTH, uiScale) : 0,
        maxWidth: open ? scaleDesignPixels(WORKSPACE_RAIL_MAX_WIDTH, uiScale) : 0,
      }}
      onKeyDown={narrow ? (event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          requestOpen(false)
        }
      } : undefined}
    >
      <div aria-hidden={open ? undefined : true} inert={open ? undefined : true} className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-[52px] shrink-0 items-center justify-between gap-3 border-b border-surface-border/60 px-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-secondary">{t('core:workspaceRail.title', { defaultValue: 'Projects' })}</p>
          <div className="flex items-center gap-1">
            {open && headerActions}
            {open && <button
              type="button"
              aria-label={t('core:workspaceRail.hide', { defaultValue: 'Hide projects and threads' })}
              data-ui="workspace-rail-close"
              onClick={() => requestOpen(false)}
              className="flex h-11 w-11 items-center justify-center rounded-md text-text-muted outline-none transition-colors hover:bg-surface-border/40 hover:text-text-primary focus-visible:ring-1 focus-visible:ring-border-strong md:h-7 md:w-7"
            >
              <Icon aria-hidden="true" name="sidebar-simple" className="text-[14px]" />
            </button>}
          </div>
        </div>
        {children}
      </div>
      {!narrow && open && (
        <button
          type="button"
          role="separator"
          aria-label={t('core:workspaceRail.resize', { defaultValue: 'Resize projects and threads' })}
          aria-orientation="vertical"
          aria-valuemin={WORKSPACE_RAIL_MIN_WIDTH}
          aria-valuemax={WORKSPACE_RAIL_MAX_WIDTH}
          aria-valuenow={width}
          onKeyDown={handleSeparatorKeyDown}
          onPointerDown={handlePointerDown}
          className="absolute bottom-0 right-0 top-0 z-10 w-1 cursor-col-resize touch-none bg-transparent outline-none transition-colors hover:bg-accent/30 focus-visible:bg-accent/45"
        />
      )}
    </aside>
  )

  if (!narrow) return rail
  return (
    <div className="absolute inset-0 z-40 flex" data-ui="workspace-rail-overlay">
      {rail}
      <button
        type="button"
        aria-label={t('core:workspaceRail.close', { defaultValue: 'Close projects and threads' })}
        className="min-w-0 flex-1 bg-black/70"
        data-ui="workspace-rail-scrim"
        onClick={() => requestOpen(false)}
      />
    </div>
  )
}
