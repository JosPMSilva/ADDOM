import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import Icon from '../ui/Icon.jsx'
import {
  CHAT_COMPANION_MODE_FOCUSED,
  MIN_CHAT_COMPANION_WIDTH,
  clampChatCompanionWidth,
  resolveChatCompanionMaximumWidth,
} from './chat-companion-state.mjs'
import {
  createChatCompanionDragSession,
  startChatCompanionDragPresentation,
} from './chat-companion-resize.mjs'

function focusOrigin(selector = '') {
  const value = String(selector || '').trim()
  if (!value || typeof document === 'undefined') return
  window.requestAnimationFrame(() => {
    const target = document.querySelector(value)
    if (target instanceof HTMLElement) target.focus({ preventScroll: true })
  })
}

export default function ChatCompanionShell({
  activeCompanion = '',
  views = [],
  visible = false,
  mode = 'split',
  width = 360,
  workspaceRailOpen = true,
  onActivate,
  onMoveView,
  onClose,
  onToggleMode,
  onResize,
  headerAction = null,
  children,
}) {
  const { t } = useRendererTranslation(['core'])
  const shellRef = useRef(null)
  const dragSessionRef = useRef(null)
  const draggedViewKeyRef = useRef('')
  const [draggedViewKey, setDraggedViewKey] = useState('')
  const activeView = useMemo(
    () => views.find((view) => view.key === activeCompanion) || null,
    [activeCompanion, views],
  )
  const focused = mode === CHAT_COMPANION_MODE_FOCUSED
  const showTabs = views.length > 1
  const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth
  const resizeLayout = useMemo(() => ({ workspaceRailOpen }), [workspaceRailOpen])
  const maximumWidth = resolveChatCompanionMaximumWidth(viewportWidth, resizeLayout)
  const resolvedWidth = clampChatCompanionWidth(width, viewportWidth, resizeLayout)

  useEffect(() => () => dragSessionRef.current?.cleanup(), [])

  const handleResizePointerDown = useCallback((event) => {
    if (event.button !== 0 || event.isPrimary === false) return
    event.preventDefault()
    dragSessionRef.current?.cleanup()
    const captureTarget = event.currentTarget
    const dragViewportWidth = window.innerWidth
    const restorePresentation = startChatCompanionDragPresentation({
      shellElement: shellRef.current,
      bodyElement: document.body,
    })
    dragSessionRef.current = createChatCompanionDragSession({
      eventTarget: window,
      captureTarget,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startWidth: resolvedWidth,
      viewportWidth: dragViewportWidth,
      layout: resizeLayout,
      onPreview: (nextWidth) => {
        shellRef.current?.style.setProperty('--chat-companion-inline-size', `${nextWidth}px`)
      },
      onCancel: () => {
        dragSessionRef.current = null
        shellRef.current?.style.setProperty('--chat-companion-inline-size', `${resolvedWidth}px`)
      },
      onCleanup: restorePresentation,
      onCommit: (nextWidth) => {
        dragSessionRef.current = null
        onResize?.(nextWidth, dragViewportWidth, resizeLayout)
      },
    })
  }, [onResize, resizeLayout, resolvedWidth])

  if (!activeCompanion || !activeView) return null

  const handleCloseView = (view) => {
    onClose?.(view.key)
    if (view.key === activeCompanion) focusOrigin(view.originSelector)
  }

  const handleTabKeyDown = (event, view, index) => {
    if (!event.altKey || !event.shiftKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
    const nextIndex = event.key === 'ArrowLeft'
      ? Math.max(0, index - 1)
      : Math.min(views.length - 1, index + 1)
    if (nextIndex === index) return
    event.preventDefault()
    onMoveView?.(view.key, nextIndex)
  }

  const handleResizeKeyDown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    if (event.key === 'Home') onResize?.(MIN_CHAT_COMPANION_WIDTH, viewportWidth, resizeLayout)
    else if (event.key === 'End') onResize?.(maximumWidth, viewportWidth, resizeLayout)
    else onResize?.(resolvedWidth + (event.key === 'ArrowLeft' ? 16 : -16), viewportWidth, resizeLayout)
  }

  return (
    <aside
      ref={shellRef}
      data-chat-companion={activeCompanion}
      data-companion-mode={focused ? 'focused' : 'split'}
      data-visible={visible ? 'true' : 'false'}
      aria-hidden={visible ? undefined : true}
      inert={visible ? undefined : true}
      className={[
        'chat-companion-shell relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden bg-surface',
        'transition-[width,min-width,max-width,opacity] duration-150 ease-out motion-reduce:transition-none',
        visible ? 'opacity-100' : 'hidden',
        focused ? 'flex-1 border-l-0' : 'border-l border-surface-border',
      ].join(' ')}
      style={{
        '--chat-companion-inline-size': visible && !focused ? `${resolvedWidth}px` : '0px',
      }}
    >
      {!focused ? (
        <div
          data-companion-resizer="true"
          role="separator"
          aria-orientation="vertical"
          aria-label={t('core:companionDock.resize', { defaultValue: 'Resize companion' })}
          aria-valuemin={MIN_CHAT_COMPANION_WIDTH}
          aria-valuemax={maximumWidth}
          aria-valuenow={resolvedWidth}
          tabIndex={0}
          onKeyDown={handleResizeKeyDown}
          onPointerDown={handleResizePointerDown}
          className="absolute inset-y-0 left-0 z-20 hidden w-3 cursor-col-resize touch-none outline-none after:absolute after:inset-y-0 after:left-0 after:w-px after:bg-transparent hover:after:bg-border-hover focus-visible:after:bg-accent md:block"
        />
      ) : null}

      <header className="flex min-h-[52px] shrink-0 items-center gap-2 border-b border-surface-border px-3">
        {showTabs ? (
          <div role="tablist" aria-label={t('core:companionDock.views', { defaultValue: 'Companion views' })} className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {views.map((view, index) => (
              <div
                key={view.key}
                draggable={Boolean(onMoveView)}
                data-companion-tab={view.key}
                onDragStart={(event) => {
                  draggedViewKeyRef.current = view.key
                  setDraggedViewKey(view.key)
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', view.key)
                }}
                onDragOver={(event) => {
                  if (!draggedViewKeyRef.current) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                }}
                onDragEnter={() => {
                  const draggedKey = draggedViewKeyRef.current
                  if (draggedKey && draggedKey !== view.key) onMoveView?.(draggedKey, index)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  draggedViewKeyRef.current = ''
                  setDraggedViewKey('')
                }}
                onDragEnd={() => {
                  draggedViewKeyRef.current = ''
                  setDraggedViewKey('')
                }}
                className={[
                  'group flex h-7 max-w-40 shrink-0 items-center rounded-md outline-none transition-colors',
                  'focus-within:bg-surface-panel focus-within:text-text-primary',
                  view.key === activeCompanion
                    ? 'bg-surface-panel text-text-primary'
                    : 'text-text-tertiary hover:bg-surface-panel hover:text-text-secondary',
                  draggedViewKey === view.key ? 'opacity-70' : '',
                ].join(' ')}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={view.key === activeCompanion}
                  tabIndex={view.key === activeCompanion ? 0 : -1}
                  onClick={() => onActivate?.(view.key)}
                  onKeyDown={(event) => handleTabKeyDown(event, view, index)}
                  className="min-w-0 flex-1 cursor-grab truncate py-1 pl-2 pr-1 text-left text-[11px] outline-none active:cursor-grabbing"
                  title={view.label}
                >
                  {view.label}
                </button>
                <button
                  type="button"
                  draggable={false}
                  data-companion-tab-close={view.key}
                  aria-label={t('core:editor.tabBar.closeTabAriaLabel', {
                    tabLabel: view.label,
                    defaultValue: 'Close {{tabLabel}}',
                  })}
                  title={t('core:editor.tabBar.closeTabAriaLabel', {
                    tabLabel: view.label,
                    defaultValue: 'Close {{tabLabel}}',
                  })}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleCloseView(view)
                  }}
                  className={[
                    'mr-1 flex size-5 shrink-0 items-center justify-center rounded-sm outline-none transition-opacity',
                    'hover:bg-surface-border hover:text-text-primary focus-visible:bg-surface-border focus-visible:text-text-primary focus-visible:opacity-100',
                    view.key === activeCompanion
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
                  ].join(' ')}
                >
                  <Icon name="x" size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <span className="min-w-0 flex-1 truncate font-display text-xs font-semibold text-text-primary" title={activeView.label}>
            {activeView.label}
          </span>
        )}
        <div className="flex shrink-0 items-center gap-1" data-ui="chat-companion-header-actions">
          {headerAction ? (
            <button
              type="button"
              data-companion-header-action={headerAction.key || 'context'}
              aria-label={headerAction.label}
              title={headerAction.label}
              onClick={() => headerAction.onSelect?.()}
              className="flex size-7 items-center justify-center rounded-md text-text-tertiary outline-none transition-colors hover:bg-surface-panel hover:text-text-primary focus-visible:ring-1 focus-visible:ring-border-strong"
            >
              <Icon name={headerAction.icon || 'gear'} size={14} />
            </button>
          ) : null}
          <button
            type="button"
            aria-pressed={focused}
            aria-label={focused
              ? t('core:companionDock.restoreSplit', { defaultValue: 'Restore split view' })
              : t('core:companionDock.focus', { defaultValue: 'Focus companion' })}
            title={focused
              ? t('core:companionDock.restoreSplit', { defaultValue: 'Restore split view' })
              : t('core:companionDock.focus', { defaultValue: 'Focus companion' })}
            onClick={() => onToggleMode?.()}
            className="flex size-7 items-center justify-center rounded-md text-text-tertiary outline-none transition-colors hover:bg-surface-panel hover:text-text-primary focus-visible:ring-1 focus-visible:ring-border-strong"
          >
            <Icon name={focused ? 'arrows-in' : 'arrows-out'} size={14} />
          </button>
          <button
            type="button"
            aria-label={t('core:companionDock.close', { defaultValue: 'Close companion view' })}
            title={t('core:companionDock.close', { defaultValue: 'Close companion view' })}
            onClick={() => handleCloseView(activeView)}
            className="flex size-7 items-center justify-center rounded-md text-text-tertiary outline-none transition-colors hover:bg-surface-panel hover:text-text-primary focus-visible:ring-1 focus-visible:ring-border-strong"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1">{children}</div>
    </aside>
  )
}
