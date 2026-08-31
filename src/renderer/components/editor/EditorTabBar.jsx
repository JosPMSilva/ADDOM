import React, { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '../ui/Icon.jsx'
import {
  AI_SELECTION_ACTIONS,
} from './editor-ai-selection-helpers.mjs'
import {
  countProblemsBySeverity,
} from './editor-diagnostics-panel-utils.mjs'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'

export default function EditorTabBar({
  tabs,
  activeTab,
  problemsByTab = {},
  actionRailWidth = null,
  canFormatActive = false,
  canFixActive = false,
  canAiSelectionActive = false,
  canPreviewActive = false,
  previewOpen = false,
  formatOnSaveEnabled = false,
  formatActionTitle = 'Format document with the active formatter route (Shift+Alt+F)',
  fixActionTitle = 'Apply auto-fixable issues from the active code-action provider',
  onActivate,
  onMoveTab,
  onClose,
  onSave,
  onFormatActive,
  onFixActive,
  onTogglePreview,
  onAiSelectionAction,
  onToggleFormatOnSave,
}) {
  const { t } = useRendererTranslation(['core'])
  const [aiMenuOpen, setAiMenuOpen] = useState(false)
  const [draggedTabId, setDraggedTabId] = useState('')
  const aiMenuRef = useRef(null)
  const tabListRef = useRef(null)
  const dragStateRef = useRef(null)
  const suppressClickTabIdRef = useRef('')
  const tabButtonRefs = useRef(new Map())
  const tabItemRefs = useRef(new Map())

  useEffect(() => {
    if (!aiMenuOpen) return undefined

    const handlePointerDown = (event) => {
      if (aiMenuRef.current && !aiMenuRef.current.contains(event.target)) {
        setAiMenuOpen(false)
      }
    }
    const handleEscape = (event) => {
      if (event.key === 'Escape') setAiMenuOpen(false)
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [aiMenuOpen])

  const registerTabButtonRef = useCallback((tabId, node) => {
    const normalizedId = String(tabId || '').trim()
    if (!normalizedId) return
    if (node) {
      tabButtonRefs.current.set(normalizedId, node)
      return
    }
    tabButtonRefs.current.delete(normalizedId)
  }, [])

  const registerTabItemRef = useCallback((tabId, node) => {
    const normalizedId = String(tabId || '').trim()
    if (!normalizedId) return
    if (node) {
      tabItemRefs.current.set(normalizedId, node)
      return
    }
    tabItemRefs.current.delete(normalizedId)
  }, [])

  const focusAndActivateTab = useCallback((tabId) => {
    const normalizedId = String(tabId || '').trim()
    if (!normalizedId) return
    const button = tabButtonRefs.current.get(normalizedId)
    if (button) button.focus()
    onActivate?.(normalizedId)
  }, [onActivate])

  const handleTabKeyDown = useCallback((event, tabId) => {
    const normalizedId = String(tabId || '').trim()
    const currentIndex = tabs.findIndex((tab) => tab.id === normalizedId)
    if (currentIndex < 0) return

    if (event.altKey && event.shiftKey && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      const nextIndex = event.key === 'ArrowRight'
        ? Math.min(currentIndex + 1, tabs.length - 1)
        : Math.max(currentIndex - 1, 0)
      if (nextIndex !== currentIndex) {
        event.preventDefault()
        onMoveTab?.(normalizedId, nextIndex)
        requestAnimationFrame(() => {
          const button = tabButtonRefs.current.get(normalizedId)
          if (button) button.focus()
        })
      }
      return
    }

    let nextIndex = currentIndex
    if (event.key === 'ArrowRight') nextIndex = Math.min(currentIndex + 1, tabs.length - 1)
    else if (event.key === 'ArrowLeft') nextIndex = Math.max(currentIndex - 1, 0)
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = Math.max(0, tabs.length - 1)
    else return

    event.preventDefault()
    const nextTab = tabs[nextIndex]
    if (nextTab?.id) {
      focusAndActivateTab(nextTab.id)
    }
  }, [focusAndActivateTab, onMoveTab, tabs])

  const resolveReorderTargetIndex = useCallback((draggedId, clientX) => {
    const normalizedId = String(draggedId || '').trim()
    const currentIndex = tabs.findIndex((tab) => tab.id === normalizedId)
    if (currentIndex < 0) return currentIndex

    const orderedTabs = tabs
      .map((tab, index) => {
        const node = tabItemRefs.current.get(tab.id)
        if (!node) return null
        const rect = node.getBoundingClientRect()
        return {
          id: tab.id,
          index,
          midpoint: rect.left + rect.width / 2,
        }
      })
      .filter(Boolean)

    if (orderedTabs.length <= 0) return currentIndex

    let insertionIndex = orderedTabs.findIndex((tab) => clientX < tab.midpoint)
    if (insertionIndex < 0) insertionIndex = orderedTabs.length
    let nextIndex = insertionIndex
    if (nextIndex > currentIndex) nextIndex -= 1
    return Math.max(0, Math.min(tabs.length - 1, nextIndex))
  }, [tabs])

  const maybeAutoScrollTabStrip = useCallback((clientX) => {
    const node = tabListRef.current
    if (!node) return
    const bounds = node.getBoundingClientRect()
    const edgeThreshold = 48
    const maxStep = 28
    if (clientX < bounds.left + edgeThreshold) {
      const intensity = Math.min(1, (bounds.left + edgeThreshold - clientX) / edgeThreshold)
      node.scrollLeft -= Math.max(8, Math.round(maxStep * intensity))
      return
    }
    if (clientX > bounds.right - edgeThreshold) {
      const intensity = Math.min(1, (clientX - (bounds.right - edgeThreshold)) / edgeThreshold)
      node.scrollLeft += Math.max(8, Math.round(maxStep * intensity))
    }
  }, [])

  const handleTabDragPointerMove = useCallback((event) => {
    const drag = dragStateRef.current
    if (!drag) return
    const currentX = Number(event.clientX || 0)
    const deltaX = currentX - drag.startX
    if (!drag.started && Math.abs(deltaX) < 6) return

    if (!drag.started) {
      drag.started = true
      setDraggedTabId(drag.tabId)
      if (typeof document !== 'undefined' && document.body) {
        document.body.style.userSelect = 'none'
        document.body.style.cursor = 'grabbing'
      }
    }

    maybeAutoScrollTabStrip(currentX)
    const nextIndex = resolveReorderTargetIndex(drag.tabId, currentX)
    if (nextIndex >= 0 && nextIndex !== drag.lastIndex) {
      onMoveTab?.(drag.tabId, nextIndex)
      drag.lastIndex = nextIndex
    }
  }, [maybeAutoScrollTabStrip, onMoveTab, resolveReorderTargetIndex])

  const endTabDrag = useCallback(() => {
    window.removeEventListener('pointermove', handleTabDragPointerMove)
    window.removeEventListener('pointerup', endTabDrag)
    window.removeEventListener('pointercancel', endTabDrag)

    const drag = dragStateRef.current
    dragStateRef.current = null
    if (typeof document !== 'undefined' && document.body) {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    if (drag?.started && drag.tabId) {
      suppressClickTabIdRef.current = drag.tabId
      setTimeout(() => {
        if (suppressClickTabIdRef.current === drag.tabId) suppressClickTabIdRef.current = ''
      }, 0)
    }
    setDraggedTabId('')
  }, [handleTabDragPointerMove])

  const handleTabPointerDown = useCallback((event, tabId) => {
    if (event.button !== 0) return
    const normalizedId = String(tabId || '').trim()
    const currentIndex = tabs.findIndex((tab) => tab.id === normalizedId)
    if (!normalizedId || currentIndex < 0) return
    dragStateRef.current = {
      tabId: normalizedId,
      startX: Number(event.clientX || 0),
      started: false,
      lastIndex: currentIndex,
    }
    window.addEventListener('pointermove', handleTabDragPointerMove)
    window.addEventListener('pointerup', endTabDrag)
    window.addEventListener('pointercancel', endTabDrag)
  }, [endTabDrag, handleTabDragPointerMove, tabs])

  useEffect(() => () => {
    endTabDrag()
  }, [endTabDrag])

  const localizeAiAction = useCallback((action = {}) => {
    const actionId = String(action?.id || '').trim()
    if (actionId === 'explain') {
      return {
        label: t('editor.tabBar.aiSelection.explain.label', { defaultValue: 'Explain' }),
        title: t('editor.tabBar.aiSelection.explain.title', { defaultValue: 'Explain selected code in Chat' }),
        description: t('editor.tabBar.aiSelection.explain.description', { defaultValue: 'Explain behavior, assumptions, and risks.' }),
      }
    }
    if (actionId === 'fix') {
      return {
        label: t('editor.tabBar.aiSelection.fix.label', { defaultValue: 'Fix' }),
        title: t('editor.tabBar.aiSelection.fix.title', { defaultValue: 'Fix selected code in Chat' }),
        description: t('editor.tabBar.aiSelection.fix.description', { defaultValue: 'Fix bugs/issues in the selected code.' }),
      }
    }
    if (actionId === 'refactor') {
      return {
        label: t('editor.tabBar.aiSelection.refactor.label', { defaultValue: 'Refactor' }),
        title: t('editor.tabBar.aiSelection.refactor.title', { defaultValue: 'Refactor selected code in Chat' }),
        description: t('editor.tabBar.aiSelection.refactor.description', { defaultValue: 'Refactor while preserving behavior.' }),
      }
    }
    if (actionId === 'tests') {
      return {
        label: t('editor.tabBar.aiSelection.tests.label', { defaultValue: 'Tests' }),
        title: t('editor.tabBar.aiSelection.tests.title', { defaultValue: 'Generate tests for selected code in Chat' }),
        description: t('editor.tabBar.aiSelection.tests.description', { defaultValue: 'Write tests for the selected code.' }),
      }
    }
    return {
      label: action.label,
      title: action.title,
      description: action.description,
    }
  }, [t])

  return (
    <div className="relative flex items-end bg-surface-panel-alt border-b border-surface-border shrink-0 overflow-visible">
      <div
        ref={tabListRef}
        role="tablist"
        aria-label={t('editor.tabBar.openTabsAriaLabel', { defaultValue: 'Open editor tabs' })}
        className="min-w-0 flex-1 flex items-end overflow-x-auto scrollbar-hide"
      >
        {tabs.map(tab => {
          const dirty = !!tab.dirty
          const externalChanged = !!tab.externalChanged
          const active = tab.id === activeTab
          const problemCounts = countProblemsBySeverity(problemsByTab[tab.id] ?? [])
          const problemTotal = problemCounts.total
          const problemBadgeClass = problemCounts.error > 0
            ? 'border-danger-border bg-danger-bg text-danger-soft'
            : problemCounts.warning > 0
              ? 'border-warning-border bg-warning-bg text-warning'
              : 'border-info-border bg-info-bg text-info'
          return (
            <div
              key={tab.id}
              ref={(node) => registerTabItemRef(tab.id, node)}
              className={[
                'group flex items-center gap-1.5 px-2 py-2 border-r border-surface-border shrink-0 min-w-0 max-w-[220px] select-none text-xs font-mono',
                draggedTabId === tab.id ? 'opacity-80' : '',
                active
                  ? 'bg-surface text-text-primary border-t-2 border-t-accent'
                  : 'bg-surface-panel-alt text-text-muted hover:text-text-secondary hover:bg-surface',
              ].join(' ')}
            >
              <button
                ref={(node) => registerTabButtonRef(tab.id, node)}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                title={tab.title || tab.name || tab.label}
                onPointerDown={(event) => handleTabPointerDown(event, tab.id)}
                onClick={(event) => {
                  if (suppressClickTabIdRef.current === tab.id) {
                    suppressClickTabIdRef.current = ''
                    event.preventDefault()
                    return
                  }
                  onActivate(tab.id)
                }}
                onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
                className={[
                  'min-w-0 flex-1 truncate text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm',
                  onMoveTab ? 'cursor-grab active:cursor-grabbing touch-none' : '',
                ].join(' ')}
              >
                {tab.label}
              </button>
              {dirty && (
                <button
                  type="button"
                  aria-label={t('editor.tabBar.saveTabAriaLabel', {
                    defaultValue: 'Save {{fileLabel}}',
                    fileLabel: tab.title || tab.name || t('editor.tabBar.fallbackFileLabel', { defaultValue: 'file' }),
                  })}
                  title={t('editor.tabBar.unsavedChangesTitle', { defaultValue: 'Unsaved changes - click to save' })}
                  onClick={(e) => { e.stopPropagation(); onSave(tab.id) }}
                  className="h-2 w-2 shrink-0 rounded-full bg-warning hover:bg-warning-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors"
                />
              )}
              {externalChanged && (
                <span
                  title={t('editor.tabBar.externalChangedTitle', { defaultValue: 'External file change detected' })}
                  className="px-1 py-0.5 rounded border border-danger-border bg-danger-bg text-[10px] leading-none font-semibold text-danger shrink-0"
                >
                  EXT
                </span>
              )}
              {problemTotal > 0 && (
                <span
                  title={t('editor.tabBar.problemSummaryTitle', {
                    defaultValue: '{{count}} problem{{suffix}} ({{error}} error{{errorSuffix}}, {{warning}} warning{{warningSuffix}}, {{info}} info)',
                    count: problemTotal,
                    suffix: problemTotal === 1 ? '' : 's',
                    error: problemCounts.error,
                    errorSuffix: problemCounts.error === 1 ? '' : 's',
                    warning: problemCounts.warning,
                    warningSuffix: problemCounts.warning === 1 ? '' : 's',
                    info: problemCounts.info,
                  })}
                  className={`px-1 py-0.5 rounded border text-[10px] leading-none font-semibold shrink-0 ${problemBadgeClass}`}
                >
                  {problemTotal}
                </span>
              )}
              <button
                type="button"
                aria-label={t('editor.tabBar.closeTabAriaLabel', {
                  defaultValue: 'Close {{tabLabel}}',
                  tabLabel: tab.title || tab.name || t('editor.tabBar.fallbackTabLabel', { defaultValue: 'tab' }),
                })}
                onClick={(e) => { e.stopPropagation(); onClose(tab.id) }}
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 w-4 h-4 flex items-center justify-center rounded text-text-muted hover:text-danger hover:bg-surface-border transition-all shrink-0"
              >
                <Icon name="x" weight="bold" className="text-[10px]" />
              </button>
            </div>
          )
        })}
      </div>
      <div
        className="shrink-0 flex items-center gap-0 px-2 py-1.5 border-l border-surface-border bg-surface-panel-alt relative z-10"
        style={actionRailWidth ? { width: `${actionRailWidth}px` } : undefined}
      >
        <div className="relative" ref={aiMenuRef}>
          <button
            type="button"
            onClick={() => {
              if (!canAiSelectionActive) return
              setAiMenuOpen((v) => !v)
            }}
            disabled={!canAiSelectionActive}
            aria-expanded={aiMenuOpen}
            title={t('editor.tabBar.aiActionsTitle', { defaultValue: 'AI actions for selected code' })}
            className={[
              'text-[11px] px-2 py-1 transition-colors rounded',
              canAiSelectionActive
                ? (aiMenuOpen
                  ? 'text-accent'
                  : 'text-text-muted hover:text-text-primary')
                : 'text-text-muted/40 cursor-default',
            ].join(' ')}
          >
            <span className="border-b border-transparent hover:border-current">AI</span>
            <Icon
              name="caret-down"
              weight="bold"
              className={`ml-0.5 text-[8px] inline-block transition-transform ${aiMenuOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {aiMenuOpen && canAiSelectionActive && (
            <div className="absolute right-0 top-full mt-1 z-30 w-56 rounded-xl border border-surface-border bg-surface shadow-[0_10px_24px_rgb(var(--theme-shadow-rgb)_/_0.35)] p-1">
              {AI_SELECTION_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => {
                    onAiSelectionAction?.(action.id)
                    setAiMenuOpen(false)
                  }}
                  title={localizeAiAction(action).title}
                  className="w-full text-left rounded-lg px-2.5 py-2 hover:bg-surface-panel transition-colors"
                >
                  <div className="text-xs font-medium text-text-primary">{localizeAiAction(action).label}</div>
                  <div className="mt-0.5 text-[10px] text-text-muted">{localizeAiAction(action).description}</div>
                </button>
              ))}
              <div className="px-2.5 py-1 text-[10px] text-text-muted border-t border-surface-border mt-1">
                {t('editor.tabBar.aiDraftHint', {
                  defaultValue: 'Drafts to Chat using current selection and nearby context.',
                })}
              </div>
            </div>
          )}
        </div>

        <span className="text-text-tertiary/40 text-[10px] select-none">|</span>

        <button
          type="button"
          onClick={() => onTogglePreview?.()}
          disabled={!canPreviewActive}
          aria-pressed={previewOpen}
          title={t('editor.tabBar.togglePreviewTitle', {
            defaultValue: 'Toggle markdown preview (Ctrl/Cmd+Shift+V)',
          })}
          className={[
            'text-[11px] px-2 py-1 transition-colors rounded',
            canPreviewActive
              ? (previewOpen
                ? 'text-accent'
                : 'text-text-muted hover:text-text-primary')
              : 'text-text-muted/40 cursor-default',
          ].join(' ')}
        >
          {t('editor.tabBar.preview', { defaultValue: 'Preview' })}
        </button>

        <span className="text-text-tertiary/40 text-[10px] select-none">|</span>

        <button
          type="button"
          onClick={() => onFixActive?.()}
          disabled={!canFixActive}
          title={fixActionTitle}
          className="text-[11px] px-2 py-1 rounded text-text-muted hover:text-text-primary disabled:text-text-muted/40 disabled:cursor-default transition-colors"
        >
          {t('editor.tabBar.fix', { defaultValue: 'Fix' })}
        </button>

        <span className="text-text-tertiary/40 text-[10px] select-none">|</span>

        <button
          type="button"
          onClick={() => onFormatActive?.()}
          disabled={!canFormatActive}
          title={formatActionTitle}
          className="text-[11px] px-2 py-1 rounded text-text-muted hover:text-text-primary disabled:text-text-muted/40 disabled:cursor-default transition-colors"
        >
          {t('editor.tabBar.format', { defaultValue: 'Format' })}
        </button>

        <span className="text-text-tertiary/40 text-[10px] select-none">|</span>

        <button
          type="button"
          onClick={() => onToggleFormatOnSave?.()}
          aria-pressed={formatOnSaveEnabled}
          title={t('editor.tabBar.toggleFormatOnSaveTitle', {
            defaultValue: 'Toggle format on save when the current file has an active formatter route',
          })}
          className={[
            'text-[11px] px-2 py-1 rounded transition-colors inline-flex items-center gap-1',
            formatOnSaveEnabled
              ? 'text-accent'
              : 'text-text-muted hover:text-text-primary',
          ].join(' ')}
        >
          {t('editor.tabBar.auto', { defaultValue: 'Auto' })}
          <span className={`inline-block w-1.5 h-1.5 rounded-full transition-colors ${formatOnSaveEnabled ? 'bg-accent' : 'bg-text-tertiary/40'}`} />
        </button>
      </div>
    </div>
  )
}
