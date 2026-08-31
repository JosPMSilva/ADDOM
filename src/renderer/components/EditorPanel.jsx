import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react'
import { useRendererTranslation } from '../i18n/use-renderer-translation.mjs'
import {
  problemSeverityMeta,
  readEditorFormatOnSaveEnabled,
  readProblemsPanelDefaultCollapsed,
  writeEditorFormatOnSaveEnabled,
} from './editor/editor-diagnostics-panel-utils.mjs'
import {
  buildLocalizedEditorServiceNotice,
  buildEditorCapabilityActionTitle,
  buildEditorSetupHints,
  readDismissedEditorSetupHintIds,
  writeDismissedEditorSetupHintIds,
} from './editor/editor-setup-hints.mjs'
import {
  emptyOutlineState,
  normalizeOutlineState,
} from './editor/editor-monaco-helpers.mjs'
import EditorPanelView from './editor/EditorPanelView.jsx'
import {
  OPTIONAL_EDITOR_SERVICE_WARNING_PROVIDER_IDS,
  getActionableServiceNotice,
  normalizeEditorPath,
  normalizeFsPath,
  readFileTreeWidth,
  readMarkdownPreviewRatio,
  resolveStateValue,
} from './editor/editor-panel-state-helpers.mjs'
import { useEditorPanelResizers } from './editor/use-editor-panel-resizers.mjs'
import {
  buildAiSelectionVisibleDraft,
  buildAiSelectionVisibleComposerSegments,
  buildAiSelectionHiddenPrelude,
} from './editor/editor-ai-selection-helpers.mjs'
import useAppStore, { requestAppAlert, requestAppConfirm } from '../store/useAppStore.js'
import useChatStore from '../store/useChatStore.js'
import useEditorStore from '../store/useEditorStore.js'
import { useShallow } from 'zustand/react/shallow'

/**
 * EditorPanel is the main IDE-style editor surface.
 *
 * Features:
 *   - Recursive collapsible file tree
 *   - Multi-tab editing with dirty indicators
 *   - Ctrl+S / Cmd+S to save
 *   - Language auto-detection from extension
 *   - Auto-reloads open tabs when AI writes them
 */
export default function EditorPanel() {
  const { t } = useRendererTranslation(['core'])
  const {
    projectFolder,
    activeThreadId,
    inlineCompletionEnabled,
    setActivePanel,
    queueChatDraftInjection,
    commandPaletteEvent,
  } = useAppStore(useShallow((s) => ({
    projectFolder: s.projectFolder,
    activeThreadId: s.activeThreadId,
    inlineCompletionEnabled: s.inlineCompletionEnabled,
    setActivePanel: s.setActivePanel,
    queueChatDraftInjection: s.queueChatDraftInjection,
    commandPaletteEvent: s.commandPaletteEvent,
  })))
  const selectedProvider = useChatStore((s) => s.selectedProvider)
  const selectedModel = useChatStore((s) => s.selectedModel)
  const {
    tabs,
    activeTab,
    serviceStateByTab,
    setActiveTab,
    moveTab,
    closeTab,
    openFile,
    openFileAtLocation,
    updateContent,
    saveTab,
    reloadTab,
    handleExternalFileChange,
    dismissExternalChangeFlag,
    pendingReveal,
    consumePendingReveal,
    setTabServiceState,
    tree,
    treeLoading,
    loadTree,
  } = useEditorStore(useShallow((s) => ({
    tabs: s.tabs,
    activeTab: s.activeTab,
    serviceStateByTab: s.serviceStateByTab,
    setActiveTab: s.setActiveTab,
    moveTab: s.moveTab,
    closeTab: s.closeTab,
    openFile: s.openFile,
    openFileAtLocation: s.openFileAtLocation,
    updateContent: s.updateContent,
    saveTab: s.saveTab,
    reloadTab: s.reloadTab,
    handleExternalFileChange: s.handleExternalFileChange,
    dismissExternalChangeFlag: s.dismissExternalChangeFlag,
    pendingReveal: s.pendingReveal,
    consumePendingReveal: s.consumePendingReveal,
    setTabServiceState: s.setTabServiceState,
    tree: s.tree,
    treeLoading: s.treeLoading,
    loadTree: s.loadTree,
  })))
  const [problemsByTab, setProblemsByTab] = useState({})
  const [outlineByTab, setOutlineByTab] = useState({})
  const [editorApiByTab, setEditorApiByTab] = useState({})
  const [formatOnSaveEnabled, setFormatOnSaveEnabled] = useState(readEditorFormatOnSaveEnabled)
  const [problemsPanelCollapsed, setProblemsPanelCollapsed] = useState(readProblemsPanelDefaultCollapsed)
  const [outlinePanelCollapsed, setOutlinePanelCollapsed] = useState(false)
  const [previewOpenByTabId, setPreviewOpenByTabId] = useState({})
  const [previewContentByTabId, setPreviewContentByTabId] = useState({})
  const [previewSplitRatio, setPreviewSplitRatio] = useState(readMarkdownPreviewRatio)
  const [monacoHiddenInPreview, setMonacoHiddenInPreview] = useState(false)
  const [fileTreeWidth, setFileTreeWidth] = useState(readFileTreeWidth)
  const [watcherStatus, setWatcherStatus] = useState(null)
  const [dismissedServiceNoticeByTabKey, setDismissedServiceNoticeByTabKey] = useState({})
  const [seenGitNoRepoNoticeByThreadId, setSeenGitNoRepoNoticeByThreadId] = useState({})
  const [dismissedSetupHintIds, setDismissedSetupHintIds] = useState(readDismissedEditorSetupHintIds)

  const handledCommandPaletteEventIdRef = useRef('')
  const treeReloadTimerRef = useRef(null)
  const {
    previewSplitHostRef,
    fileTreeContainerRef,
    handlePreviewSplitPointerDown,
    handleTreePointerDown,
  } = useEditorPanelResizers({
    previewSplitRatio,
    setPreviewSplitRatio,
    fileTreeWidth,
    setFileTreeWidth,
  })
  const updateFormatOnSaveEnabled = useCallback((nextValue) => {
    setFormatOnSaveEnabled((currentValue) => {
      const resolvedValue = !!resolveStateValue(currentValue, nextValue)
      writeEditorFormatOnSaveEnabled(resolvedValue)
      return resolvedValue
    })
  }, [])

  const scheduleTreeReload = useCallback(() => {
    if (!projectFolder) return
    if (treeReloadTimerRef.current) {
      clearTimeout(treeReloadTimerRef.current)
    }
    treeReloadTimerRef.current = setTimeout(() => {
      treeReloadTimerRef.current = null
      void loadTree(projectFolder)
    }, 150)
  }, [loadTree, projectFolder])

  useEffect(() => {
    if (!projectFolder) return
    void loadTree(projectFolder)
  }, [projectFolder, loadTree])

  const refreshActiveTabRuntimeAvailability = useCallback(async () => {
    if (!projectFolder || !activeTab) return
    if (!window.addom?.editor?.service?.refreshRuntime) return
    const tab = useEditorStore.getState().getTabSnapshot(activeTab)
    if (!tab || tab.loading || tab.error || tab.readOnly) return
    try {
      const result = await window.addom.editor.service.refreshRuntime({
        projectFolder,
        filePath: tab.filePath,
        uri: tab.modelUri,
        language: tab.language,
        content: tab.content,
      })
      if (result?.serviceState) {
        setTabServiceState(tab.id, result.serviceState)
      }
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[editor-service] runtime refresh failed', err)
    }
  }, [activeTab, projectFolder, setTabServiceState])

  // Reload open tabs when AI writes a file.
  useEffect(() => {
    const unsub = window.addom.artifacts.onUpdated(({ filePath }) => {
      scheduleTreeReload()
      void refreshActiveTabRuntimeAvailability()
      if (filePath && projectFolder) {
        reloadTab(projectFolder, filePath.replace(/\\/g, '/'), { force: true })
      }
    })
    return unsub
  }, [projectFolder, refreshActiveTabRuntimeAvailability, reloadTab, scheduleTreeReload])

  useEffect(() => () => {
    if (treeReloadTimerRef.current) {
      clearTimeout(treeReloadTimerRef.current)
      treeReloadTimerRef.current = null
    }
  }, [])

  // Track external filesystem edits (outside ADDOM writes).
  useEffect(() => {
    if (!window.addom?.file?.onExternalChange) return undefined
    const unsub = window.addom.file.onExternalChange((payload = {}) => {
      const eventProjectPath = normalizeFsPath(payload.projectPath || '')
      const activeProjectPath = normalizeFsPath(projectFolder || '')
      if (!eventProjectPath || !activeProjectPath || eventProjectPath !== activeProjectPath) return
      const filePath = String(payload.filePath || '').trim()
      if (!filePath) return
      scheduleTreeReload()
      void handleExternalFileChange(projectFolder, filePath, payload)
    })
    return typeof unsub === 'function' ? unsub : () => { }
  }, [projectFolder, handleExternalFileChange, scheduleTreeReload])

  useEffect(() => {
    if (!window.addom?.file?.onTreeChanged) return undefined
    const unsub = window.addom.file.onTreeChanged((payload = {}) => {
      const activeProjectPath = normalizeFsPath(projectFolder || '')
      if (!activeProjectPath) return
      const eventProjectPath = normalizeFsPath(payload.projectPath || '')
      if (eventProjectPath && eventProjectPath !== activeProjectPath) return
      const filePath = String(payload.filePath || '').trim()
      const source = String(payload.source || '').trim().toLowerCase()
      scheduleTreeReload()
      void refreshActiveTabRuntimeAvailability()
      if (filePath && source === 'editor-save') {
        void reloadTab(projectFolder, filePath, { force: true })
      }
    })
    return typeof unsub === 'function' ? unsub : () => { }
  }, [projectFolder, refreshActiveTabRuntimeAvailability, reloadTab, scheduleTreeReload])

  // Track watcher health so users know when directory watch cap is reached.
  useEffect(() => {
    if (!window.addom?.file?.onWatcherStatus) return undefined
    const unsub = window.addom.file.onWatcherStatus((payload = {}) => {
      const eventProjectPath = normalizeFsPath(payload.projectPath || '')
      const activeProjectPath = normalizeFsPath(projectFolder || '')
      if (!eventProjectPath || !activeProjectPath || eventProjectPath !== activeProjectPath) return
      const capped = !!payload.capped
      if (!capped) {
        setWatcherStatus(null)
        return
      }
      setWatcherStatus({
        projectPath: eventProjectPath,
        mode: String(payload.mode || '').trim().toLowerCase(),
        capped,
        watchedCount: Math.max(0, Number(payload.watchedCount || 0) || 0),
        maxDirectories: Math.max(0, Number(payload.maxDirectories || 0) || 0),
        scannedDirectories: Math.max(0, Number(payload.scannedDirectories || 0) || 0),
      })
    })
    return typeof unsub === 'function' ? unsub : () => { }
  }, [projectFolder])

  useEffect(() => {
    void refreshActiveTabRuntimeAvailability()
  }, [refreshActiveTabRuntimeAvailability])

  useEffect(() => {
    const handleWindowFocus = () => {
      void refreshActiveTabRuntimeAvailability()
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      void refreshActiveTabRuntimeAvailability()
    }

    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [refreshActiveTabRuntimeAvailability])

  const handleFormatTab = useCallback(async (tabId) => {
    const tab = useEditorStore.getState().getTabSnapshot(tabId)
    if (!tab || tab.loading || tab.error || tab.readOnly || !projectFolder) {
      return { ok: false, available: false, reason: 'tab_not_ready' }
    }
    if (!window.addom?.editor?.service?.request) {
      return { ok: true, available: false, reason: 'editor_service_unavailable' }
    }

    try {
      const result = await window.addom.editor.service.request({
        kind: 'formatting',
        projectFolder,
        filePath: tab.filePath,
        uri: tab.modelUri,
        language: tab.language,
        content: tab.content,
      })
      if (result?.serviceState) {
        setTabServiceState(tab.id, result.serviceState)
      }
      if (result?.ok && result?.available && typeof result.formatted === 'string') {
        if (result.formatted !== tab.content) {
          updateContent(tab.id, result.formatted)
        }
      } else if (result?.message) {
        if (import.meta.env.DEV) console.warn(`[editor-format] ${result.message}`)
      }
      return result || { ok: false, available: false, reason: 'unknown_result' }
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[editor-format] formatText failed', err)
      return { ok: false, available: false, reason: 'format_call_failed', error: String(err?.message || err) }
    }
  }, [projectFolder, setTabServiceState, updateContent])

  const handleFixTab = useCallback(async (tabId) => {
    const tab = useEditorStore.getState().getTabSnapshot(tabId)
    if (!tab || tab.loading || tab.error || tab.readOnly || !projectFolder) {
      return { ok: false, available: false, reason: 'tab_not_ready' }
    }
    if (!window.addom?.editor?.service?.request) {
      return { ok: true, available: false, reason: 'editor_service_unavailable' }
    }

    try {
      const result = await window.addom.editor.service.request({
        kind: 'codeActions',
        projectFolder,
        filePath: tab.filePath,
        uri: tab.modelUri,
        language: tab.language,
        content: tab.content,
      })
      if (result?.serviceState) {
        setTabServiceState(tab.id, result.serviceState)
      }
      const preferredAction = Array.isArray(result?.actions)
        ? result.actions.find((action) => action?.isPreferred && typeof action?.edit?.fullText === 'string')
          || result.actions.find((action) => typeof action?.edit?.fullText === 'string')
        : null
      if (result?.ok && result?.available && preferredAction?.edit?.fullText && preferredAction.edit.fullText !== tab.content) {
        updateContent(tab.id, preferredAction.edit.fullText)
      } else if (result?.message) {
        if (import.meta.env.DEV) console.warn(`[editor-fix] ${result.message}`)
      } else if (result?.ok && result?.available && Array.isArray(result?.actions) && result.actions.length === 0) {
        if (import.meta.env.DEV) console.info('[editor-fix] no code actions available for current content')
      }
      return result || { ok: false, available: false, reason: 'unknown_result' }
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[editor-fix] codeActions failed', err)
      return { ok: false, available: false, reason: 'code_actions_call_failed', error: String(err?.message || err) }
    }
  }, [projectFolder, setTabServiceState, updateContent])

  const handleSaveTab = useCallback(async (tabId) => {
    if (!tabId || !projectFolder) {
      return {
        ok: false,
        error: t('editor.panel.errors.noProjectOrTabSelected', {
          defaultValue: 'No project or tab selected.',
        }),
      }
    }
    const tab = useEditorStore.getState().getTabSnapshot(tabId)
    if (tab?.readOnly) return { ok: false, reason: 'read_only' }
    if (formatOnSaveEnabled) {
      await handleFormatTab(tabId)
    }
    return saveTab(projectFolder, tabId)
  }, [formatOnSaveEnabled, handleFormatTab, projectFolder, saveTab, t])

  const handleCloseTab = useCallback(async (tabId) => {
    const tab = useEditorStore.getState().getTabSnapshot(tabId)
    if (!tab) return { ok: false, reason: 'tab_not_found' }

    const closeResult = closeTab(tabId)
    if (closeResult?.ok || closeResult?.reason !== 'dirty_tab') {
      return closeResult
    }

    const fileLabel = tab.label || tab.filePath || t('editor.panel.thisFile', { defaultValue: 'this file' })
    const shouldSave = await requestAppConfirm({
      title: t('editor.panel.closeDirty.title', { defaultValue: 'Unsaved changes' }),
      message: t('editor.panel.closeDirty.message', {
        defaultValue: 'Save changes to {{fileLabel}} before closing?',
        fileLabel,
      }),
      confirmLabel: t('editor.panel.closeDirty.confirm', { defaultValue: 'Save & Close' }),
      cancelLabel: t('editor.panel.closeDirty.cancel', { defaultValue: 'More Options' }),
      tone: 'warning',
    })
    if (shouldSave) {
      const saveResult = await handleSaveTab(tabId)
      if (!saveResult?.ok) {
        await requestAppAlert({
          title: t('editor.panel.saveFailed.title', { defaultValue: 'Save failed' }),
          message: String(saveResult?.error || saveResult?.reason || t('editor.panel.saveFailed.message', {
            defaultValue: 'The file could not be saved.',
          })),
        })
        return saveResult
      }
      return closeTab(tabId, { force: true })
    }

    const shouldDiscard = await requestAppConfirm({
      title: t('editor.panel.discard.title', { defaultValue: 'Discard changes?' }),
      message: t('editor.panel.discard.message', {
        defaultValue: 'Discard unsaved changes in {{fileLabel}} and close it?',
        fileLabel,
      }),
      confirmLabel: t('editor.panel.discard.confirm', { defaultValue: 'Discard Changes' }),
      cancelLabel: t('editor.panel.discard.cancel', { defaultValue: 'Keep Editing' }),
      tone: 'danger',
    })
    if (!shouldDiscard) {
      return { ok: false, reason: 'close_cancelled', tabId }
    }

    return closeTab(tabId, { force: true })
  }, [closeTab, handleSaveTab, t])

  // Global Ctrl+S / Cmd+S save
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (activeTab) handleSaveTab(activeTab)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeTab, handleSaveTab])

  const tabSnapshots = tabs.map((tab) => ({ ...tab, dirty: !!tab.dirty }))
  const activeTabBase = activeTab ? (tabs.find((tab) => tab.id === activeTab) ?? null) : null
  const currentTab = activeTabBase ? (useEditorStore.getState().getTabSnapshot(activeTabBase.id) ?? activeTabBase) : null
  const currentProblems = useMemo(
    () => (currentTab ? (problemsByTab[currentTab.id] ?? []) : []),
    [currentTab, problemsByTab],
  )
  const currentOutline = currentTab ? (outlineByTab[currentTab.id] ?? emptyOutlineState()) : emptyOutlineState()
  const currentEditorApi = currentTab ? (editorApiByTab[currentTab.id] ?? null) : null
  const currentServiceState = currentTab ? (serviceStateByTab[currentTab.id] ?? null) : null
  const currentCapabilities = useMemo(
    () => (currentServiceState?.capabilities || {}),
    [currentServiceState],
  )
  const markdownPreviewEligible = !!currentTab && String(currentTab.language || '').trim().toLowerCase() === 'markdown'
  const markdownPreviewOpen = markdownPreviewEligible && !!previewOpenByTabId[currentTab.id]
  const currentPreviewContent = currentTab
    ? (markdownPreviewOpen
      ? (previewContentByTabId[currentTab.id] ?? currentTab.content)
      : currentTab.content)
    : ''
  const formatSupportedForCurrentTab = !!currentCapabilities.formatting?.available
  const fixSupportedForCurrentTab = !!currentCapabilities.codeActions?.available
  const currentSetupHints = useMemo(() => buildEditorSetupHints({
    projectFolder,
    capabilities: currentCapabilities,
    dismissedHintIds: dismissedSetupHintIds,
  }), [currentCapabilities, dismissedSetupHintIds, projectFolder])
  const formatActionTitle = useMemo(() => buildEditorCapabilityActionTitle({
    capabilityKey: 'formatting',
    capability: currentCapabilities.formatting,
    enabledTitle: t('editor.panel.formatActionTitle', {
      defaultValue: 'Format document with the active formatter route (Shift+Alt+F)',
    }),
    disabledFallbackTitle: t('editor.panel.formatUnavailableTitle', {
      defaultValue: 'Formatting is unavailable for the current file',
    }),
    t,
  }), [currentCapabilities.formatting, t])
  const fixActionTitle = useMemo(() => buildEditorCapabilityActionTitle({
    capabilityKey: 'codeActions',
    capability: currentCapabilities.codeActions,
    enabledTitle: t('editor.panel.fixActionTitle', {
      defaultValue: 'Apply auto-fixable issues from the active code-action provider',
    }),
    disabledFallbackTitle: t('editor.panel.fixUnavailableTitle', {
      defaultValue: 'Code actions are unavailable for the current file',
    }),
    t,
  }), [currentCapabilities.codeActions, t])
  const currentLanguageServiceNotice = useMemo(() => buildLocalizedEditorServiceNotice({
    t,
    serviceState: getActionableServiceNotice(currentServiceState),
    optionalUnavailableProviderIds: OPTIONAL_EDITOR_SERVICE_WARNING_PROVIDER_IDS,
  }), [currentServiceState, t])
  const currentLanguageServiceNoticeKey = currentTab && currentLanguageServiceNotice?.id
    ? `${currentTab.id}:${currentLanguageServiceNotice.id}`
    : ''
  const currentLanguageServiceNoticeVisible = !!currentLanguageServiceNoticeKey
    && !dismissedServiceNoticeByTabKey[currentLanguageServiceNoticeKey]

  const dismissSetupHint = useCallback((hint) => {
    const hintId = String(hint?.id || '').trim()
    if (!hintId) return
    setDismissedSetupHintIds((prev) => {
      if (prev?.[hintId] === true) return prev
      const next = {
        ...(prev && typeof prev === 'object' ? prev : {}),
        [hintId]: true,
      }
      writeDismissedEditorSetupHintIds(next)
      return next
    })
  }, [])

  useEffect(() => {
    if (!currentTab || !markdownPreviewOpen) return
    const nextContent = useEditorStore.getState().getTabContent(currentTab.id)
    setPreviewContentByTabId((prev) => (
      prev[currentTab.id] === nextContent
        ? prev
        : {
          ...prev,
          [currentTab.id]: nextContent,
        }
    ))
  }, [
    currentTab,
    markdownPreviewOpen,
    tabs,
  ])

  useEffect(() => {
    const normalizedPendingPath = normalizeEditorPath(pendingReveal?.filePath || '')
    const normalizedCurrentPath = normalizeEditorPath(currentTab?.filePath || '')
    if (!normalizedPendingPath || !normalizedCurrentPath || normalizedPendingPath !== normalizedCurrentPath) return
    if (!currentEditorApi?.revealLocation) return
    currentEditorApi.revealLocation({
      lineNumber: pendingReveal.line,
      column: pendingReveal.column,
    })
    consumePendingReveal(currentTab.filePath)
  }, [consumePendingReveal, currentEditorApi, currentTab, pendingReveal])

  const toggleMarkdownPreviewForCurrentTab = useCallback((forced = null) => {
    if (!currentTab) return false
    const isMarkdown = String(currentTab.language || '').trim().toLowerCase() === 'markdown'
    if (!isMarkdown) return false
    const currentOpen = !!previewOpenByTabId[currentTab.id]
    const nextOpen = forced == null ? !currentOpen : !!forced
    if (nextOpen) {
      setPreviewContentByTabId((prev) => ({
        ...prev,
        [currentTab.id]: useEditorStore.getState().getTabContent(currentTab.id),
      }))
      if (!currentOpen) {
        setPreviewOpenByTabId((prev) => ({
          ...prev,
          [currentTab.id]: true,
        }))
      }
      return true
    }
    if (!currentOpen) return false
    setMonacoHiddenInPreview(false)
    setPreviewOpenByTabId((prev) => {
      const next = { ...prev }
      delete next[currentTab.id]
      return next
    })
    return true
  }, [currentTab, previewOpenByTabId])

  const handleOpenMarkdownPreviewWorkspaceFile = useCallback(async (filePath, location = {}) => {
    const normalized = String(filePath || '').trim().replace(/\\/g, '/')
    if (!projectFolder || !normalized) return { ok: false, reason: 'missing_project_context' }
    try {
      const nextLine = Number(location?.line)
      const nextColumn = Number(location?.column)
      const openResult = Number.isFinite(nextLine) && nextLine >= 1
        ? await openFileAtLocation(projectFolder, normalized, nextLine, nextColumn, { source: 'markdown_preview' })
        : await openFile(projectFolder, normalized, { source: 'markdown_preview' })
      if (openResult?.ok === false) {
        const rawReason = String(openResult?.reason || '').trim()
        if (/not found/i.test(rawReason)) {
          return { ok: false, reason: 'file_not_found' }
        }
        return { ok: false, reason: rawReason || 'open_file_failed' }
      }
      return { ok: true }
    } catch (error) {
      return { ok: false, reason: String(error?.message || 'open_file_failed') }
    }
  }, [openFile, openFileAtLocation, projectFolder])

  const handleAiSelectionAction = useCallback((actionId) => {
    if (!currentTab || !currentEditorApi?.getSelectionContext) return
    const selection = currentEditorApi.getSelectionContext()
    if (!selection?.ok) {
      if (import.meta.env.DEV) console.warn(`[editor-ai-selection] unavailable: ${selection?.reason || 'no_selection'}`)
      return
    }
    const visibleDraft = buildAiSelectionVisibleDraft(selection)
    const visibleComposerSegments = buildAiSelectionVisibleComposerSegments(selection)
    const hiddenPrelude = buildAiSelectionHiddenPrelude({
      actionId,
      tab: currentTab,
      selection,
      problems: currentProblems,
      severityLabelFor: (severity) => problemSeverityMeta(severity).label,
    })
    if ((!visibleDraft && visibleComposerSegments.length === 0) || !hiddenPrelude) return

    queueChatDraftInjection({
      text: visibleDraft,
      guardVisibleText: visibleDraft,
      composerBlocks: visibleComposerSegments,
      composerSegments: visibleComposerSegments,
      mode: 'append',
      source: 'editor_selection',
      hiddenPrefix: {
        kind: 'editor_selection_prelude',
        text: hiddenPrelude,
      },
      focusComposer: true,
    })
    setActivePanel('chat')
  }, [currentEditorApi, currentProblems, currentTab, queueChatDraftInjection, setActivePanel])

  useEffect(() => {
    const event = commandPaletteEvent
    const eventId = String(event?.id || '').trim()
    if (!eventId) return
    if (handledCommandPaletteEventIdRef.current === eventId) return
    handledCommandPaletteEventIdRef.current = eventId

    const type = String(event?.type || '').trim()
    if (!type) return

    if (type === 'editor.formatDocument') {
      if (currentTab) void handleFormatTab(currentTab.id)
      return
    }
    if (type === 'editor.fixAutofixable') {
      if (currentTab) void handleFixTab(currentTab.id)
      return
    }
    if (type === 'editor.toggleProblemsPanel') {
      setProblemsPanelCollapsed((prev) => !prev)
      return
    }
    if (type === 'editor.toggleOutlinePanel') {
      setOutlinePanelCollapsed((prev) => !prev)
      return
    }
    if (type === 'editor.markdownPreview.toggle') {
      toggleMarkdownPreviewForCurrentTab(null)
      return
    }
    if (type === 'editor.markdownPreview.open') {
      toggleMarkdownPreviewForCurrentTab(true)
      return
    }
    if (type === 'editor.aiSelection.explain') {
      handleAiSelectionAction('explain')
      return
    }
    if (type === 'editor.aiSelection.fix') {
      handleAiSelectionAction('fix')
      return
    }
    if (type === 'editor.aiSelection.refactor') {
      handleAiSelectionAction('refactor')
      return
    }
    if (type === 'editor.aiSelection.tests') {
      handleAiSelectionAction('tests')
    }
  }, [
    commandPaletteEvent,
    currentTab,
    handleAiSelectionAction,
    handleFixTab,
    handleFormatTab,
    toggleMarkdownPreviewForCurrentTab,
  ])

  const activeEditorThreadId = String(activeThreadId || '').trim() || '__no_thread__'
  const gitNoRepoNoticeSeenForThread = seenGitNoRepoNoticeByThreadId[activeEditorThreadId] === true
  const markGitNoRepoNoticeSeenForThread = useCallback((threadId) => {
    const normalizedThreadId = String(threadId || '').trim() || '__no_thread__'
    setSeenGitNoRepoNoticeByThreadId((prev) => (
      prev[normalizedThreadId]
        ? prev
        : {
          ...prev,
          [normalizedThreadId]: true,
        }
    ))
  }, [])

  return (
    <EditorPanelView
      t={t}
      projectFolder={projectFolder}
      fileTreeContainerRef={fileTreeContainerRef}
      fileTreeWidth={fileTreeWidth}
      handleTreePointerDown={handleTreePointerDown}
      tree={tree}
      treeLoading={treeLoading}
      openFile={openFile}
      loadTree={loadTree}
      currentTab={currentTab}
      tabs={tabs}
      tabSnapshots={tabSnapshots}
      activeTab={activeTab}
      problemsByTab={problemsByTab}
      outlinePanelCollapsed={outlinePanelCollapsed}
      formatSupportedForCurrentTab={formatSupportedForCurrentTab}
      fixSupportedForCurrentTab={fixSupportedForCurrentTab}
      currentEditorApi={currentEditorApi}
      markdownPreviewEligible={markdownPreviewEligible}
      markdownPreviewOpen={markdownPreviewOpen}
      formatOnSaveEnabled={formatOnSaveEnabled}
      formatActionTitle={formatActionTitle}
      fixActionTitle={fixActionTitle}
      setActiveTab={setActiveTab}
      moveTab={moveTab}
      handleCloseTab={handleCloseTab}
      handleSaveTab={handleSaveTab}
      handleFormatTab={handleFormatTab}
      handleFixTab={handleFixTab}
      toggleMarkdownPreviewForCurrentTab={toggleMarkdownPreviewForCurrentTab}
      handleAiSelectionAction={handleAiSelectionAction}
      updateFormatOnSaveEnabled={updateFormatOnSaveEnabled}
      watcherStatus={watcherStatus}
      currentLanguageServiceNoticeVisible={currentLanguageServiceNoticeVisible}
      currentLanguageServiceNotice={currentLanguageServiceNotice}
      currentLanguageServiceNoticeKey={currentLanguageServiceNoticeKey}
      setDismissedServiceNoticeByTabKey={setDismissedServiceNoticeByTabKey}
      reloadTab={reloadTab}
      dismissExternalChangeFlag={dismissExternalChangeFlag}
      previewSplitHostRef={previewSplitHostRef}
      monacoHiddenInPreview={monacoHiddenInPreview}
      previewSplitRatio={previewSplitRatio}
      activeThreadId={activeEditorThreadId}
      gitNoRepoNoticeSeenForThread={gitNoRepoNoticeSeenForThread}
      markGitNoRepoNoticeSeenForThread={markGitNoRepoNoticeSeenForThread}
      selectedProvider={selectedProvider}
      selectedModel={selectedModel}
      inlineCompletionEnabled={inlineCompletionEnabled}
      updateContent={updateContent}
      setPreviewContentByTabId={setPreviewContentByTabId}
      setProblemsByTab={setProblemsByTab}
      setOutlineByTab={setOutlineByTab}
      normalizeOutlineState={normalizeOutlineState}
      setEditorApiByTab={setEditorApiByTab}
      setTabServiceState={setTabServiceState}
      handlePreviewSplitPointerDown={handlePreviewSplitPointerDown}
      currentPreviewContent={currentPreviewContent}
      handleOpenMarkdownPreviewWorkspaceFile={handleOpenMarkdownPreviewWorkspaceFile}
      setMonacoHiddenInPreview={setMonacoHiddenInPreview}
      currentOutline={currentOutline}
      setOutlinePanelCollapsed={setOutlinePanelCollapsed}
      currentSetupHints={currentSetupHints}
      dismissSetupHint={dismissSetupHint}
      currentProblems={currentProblems}
      problemsPanelCollapsed={problemsPanelCollapsed}
      setProblemsPanelCollapsed={setProblemsPanelCollapsed}
    />
  )
}
