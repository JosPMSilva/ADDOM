import React, { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import { LoadingPane } from './EditorFileTree.jsx'
import EditorMonacoSurface from './EditorMonacoSurface.jsx'
import useEditorStore from '../../store/useEditorStore.js'
import {
  MONACO_OPTIONS,
  bindMonacoAppearance,
  ensureTheme,
  emptyOutlineState,
  resolveAddomMonacoThemeId,
} from './editor-monaco-helpers.mjs'
import {
  attachMonacoAnalysisObservers,
  attachMonacoGitUi,
  registerInlineCompletionProvider,
  registerMonacoEditorCommands,
} from './editor-monaco-mount-helpers.mjs'

const MONACO_EDITOR_OPTIONS = Object.freeze({
  ...MONACO_OPTIONS,
  inlineSuggest: { enabled: true, mode: 'prefix' },
  suggest: { preview: true },
})

const EMPTY_EDITOR_SIZE = Object.freeze({
  width: 0,
  height: 0,
})
const INITIAL_LAYOUT_RETRY_FRAMES = 12
const GIT_SCOPE_CHIP_MINIMAP_GAP_PX = 12
const DEFAULT_GIT_SCOPE_CHIP_RIGHT_OFFSET_PX = 156
const GIT_NO_REPO_NOTICE_AUTO_DISMISS_MS = 3_000

function readEditorContainerSize(node) {
  if (!node?.getBoundingClientRect) return EMPTY_EDITOR_SIZE
  const rect = node.getBoundingClientRect()
  return {
    width: Math.max(0, Math.round(rect.width)),
    height: Math.max(0, Math.round(rect.height)),
  }
}

function readGitScopeChipRightOffset(editor) {
  const layoutInfo = editor?.getLayoutInfo?.()
  const minimapLeft = Number(layoutInfo?.minimap?.minimapLeft || 0) || 0
  const minimapWidth = Number(layoutInfo?.minimap?.minimapWidth || 0) || 0
  if (layoutInfo?.width > 0 && minimapLeft > 0 && minimapWidth > 0) {
    return `${Math.max(
      GIT_SCOPE_CHIP_MINIMAP_GAP_PX,
      Math.round(layoutInfo.width - minimapLeft + GIT_SCOPE_CHIP_MINIMAP_GAP_PX),
    )}px`
  }
  return `${DEFAULT_GIT_SCOPE_CHIP_RIGHT_OFFSET_PX}px`
}

function describeGitOverlayMessage(gitDiff, gitDiffError = '', t) {
  const errorText = String(gitDiffError || '').trim()
  if (errorText) {
    return {
      tone: 'danger',
      text: errorText,
    }
  }
  if (!gitDiff) return null
  if (gitDiff?.dirtyBufferBlocked) {
    return {
      tone: 'warning',
      text: t('core:editor.git.overlay.saveBeforeOverlay', { defaultValue: 'Save the file before showing Git overlays.' }),
    }
  }
  if (gitDiff?.previewNotice) {
    return {
      tone: 'neutral',
      text: String(gitDiff.previewNotice),
    }
  }

  const reason = String(gitDiff?.editorBlockedReason || gitDiff?.unsupportedReason || '').trim()
  switch (reason) {
    case 'merge_conflict':
      return { tone: 'warning', text: t('core:editor.git.overlay.mergeConflict', { defaultValue: 'Conflicted files are listed in Source Control, but inline SCM is disabled until the conflict is resolved.' }) }
    case 'binary_file':
      return { tone: 'warning', text: t('core:editor.git.overlay.binaryFile', { defaultValue: 'Binary file changes are listed in Source Control, but inline SCM preview is unavailable.' }) }
    case 'submodule':
      return { tone: 'warning', text: t('core:editor.git.overlay.submodule', { defaultValue: 'Submodule changes are listed in Source Control, but inline SCM preview is unavailable.' }) }
    case 'rename':
      return { tone: 'warning', text: t('core:editor.git.overlay.rename', { defaultValue: 'Renamed files are listed in Source Control, but inline SCM preview is unavailable.' }) }
    case 'deleted_file':
      return { id: 'deleted_file', tone: 'warning', text: t('core:editor.git.overlay.deletedFile', { defaultValue: 'Deleted files cannot render inline Git overlays.' }) }
    case 'no_repo':
      return { id: 'no_repo', tone: 'warning', text: t('core:editor.git.overlay.noRepo', { defaultValue: 'This file is not inside a Git worktree.' }) }
    default:
      break
  }

  if (gitDiff?.status === 'detail') {
    return {
      tone: 'warning',
      text: String(gitDiff?.detail?.summary || t('core:editor.git.overlay.inlineUnavailable', { defaultValue: 'Inline SCM preview is unavailable for this file state.' })),
    }
  }
  if (gitDiff?.status === 'unsupported') {
    return {
      tone: 'warning',
      text: t('core:editor.git.overlay.inlineUnavailable', { defaultValue: 'Inline SCM preview is unavailable for this file state.' }),
    }
  }
  if (gitDiff?.status === 'no_diff' && gitDiff?.scope === 'staged') {
    return {
      tone: 'neutral',
      text: t('core:editor.git.overlay.noStagedChanges', { defaultValue: 'No staged changes for this file.' }),
    }
  }
  return null
}

export function MonacoPane({
  tab,
  initialValue,
  projectFolder,
  activeThreadId,
  gitNoRepoNoticeSeenForThread,
  markGitNoRepoNoticeSeenForThread,
  providerId,
  modelId,
  inlineCompletionEnabled,
  onChange,
  onSave,
  onFormat,
  onToggleMarkdownPreview,
  onProblemsChange,
  onOutlineChange,
  onEditorApiChange,
  onServiceStateChange,
}) {
  const { t } = useRendererTranslation(['core'])
  const editorRef = useRef(null)
  const gitUiControllerRef = useRef(null)
  const gitScopeLayoutDisposableRef = useRef(null)
  const gitScopeMenuRef = useRef(null)
  const rootRef = useRef(null)
  const resizeFrameRef = useRef(0)
  const layoutRetryFramesRef = useRef(0)
  const onSaveRef = useRef(onSave)
  const onFormatRef = useRef(onFormat)
  const onToggleMarkdownPreviewRef = useRef(onToggleMarkdownPreview)
  const projectFolderRef = useRef(projectFolder)
  const providerIdRef = useRef(providerId)
  const modelIdRef = useRef(modelId)
  const inlineCompletionEnabledRef = useRef(inlineCompletionEnabled !== false)
  const gitPreviewStateRef = useRef(null)
  const lastPreviewModelUriRef = useRef('')
  const editorSizeRef = useRef(EMPTY_EDITOR_SIZE)
  const [editorSize, setEditorSize] = useState(EMPTY_EDITOR_SIZE)
  const [gitScopeChipRightOffset, setGitScopeChipRightOffset] = useState(`${DEFAULT_GIT_SCOPE_CHIP_RIGHT_OFFSET_PX}px`)
  const [gitScopeMenuOpen, setGitScopeMenuOpen] = useState(false)
  const [visibleGitNoRepoNoticeThreadId, setVisibleGitNoRepoNoticeThreadId] = useState('')
  const tabId = String(tab?.id || '')
  const tabFilePath = String(tab?.filePath || '').trim()
  const tabLanguage = String(tab?.language || '').trim()
  const tabModelUri = String(tab?.modelUri || '').trim()
  const resolvedThreadId = String(activeThreadId || '').trim() || '__no_thread__'
  const {
    gitScope,
    gitDiff,
    gitUnstagedDiff,
    gitStagedDiff,
    gitPreviewState,
    gitDiffLoading,
    gitDiffError,
    gitUi,
    refreshTabGitDiff,
    setTabGitScope,
  } = useEditorStore(useShallow((state) => ({
    gitScope: tabId ? String(state.gitDiffScopeByTab[tabId] || 'unstaged') : 'unstaged',
    gitDiff: tabId ? (state.gitDiffByTab[tabId]?.[String(state.gitDiffScopeByTab[tabId] || 'unstaged')] ?? null) : null,
    gitUnstagedDiff: tabId ? (state.gitDiffByTab[tabId]?.unstaged ?? null) : null,
    gitStagedDiff: tabId ? (state.gitDiffByTab[tabId]?.staged ?? null) : null,
    gitPreviewState: tabId ? state.getTabGitPreviewState(tabId, state.gitDiffScopeByTab[tabId]) : null,
    gitDiffLoading: !!(tabId && state.gitDiffLoadingByTab[tabId]?.[String(state.gitDiffScopeByTab[tabId] || 'unstaged')]),
    gitDiffError: tabId ? String(state.gitDiffErrorByTab[tabId]?.[String(state.gitDiffScopeByTab[tabId] || 'unstaged')] || '') : '',
    gitUi: tabId ? (state.gitDiffUiByTab[tabId]?.[String(state.gitDiffScopeByTab[tabId] || 'unstaged')] ?? null) : null,
    refreshTabGitDiff: state.refreshTabGitDiff,
    setTabGitScope: state.setTabGitScope,
  })))

  const fileStatus = gitUnstagedDiff?.fileStatus || gitStagedDiff?.fileStatus || gitDiff?.fileStatus || null
  const showGitScopeToggle = !!(
    fileStatus?.hasUnstagedChanges
    || fileStatus?.hasStagedChanges
    || gitUnstagedDiff
    || gitStagedDiff
    || gitDiffLoading
  )
  const gitOverlayMessage = describeGitOverlayMessage(gitDiff, gitDiffError, t)
  const showGitOverlayMessage = !!(
    gitOverlayMessage
    && (
      gitOverlayMessage.id !== 'no_repo'
      || visibleGitNoRepoNoticeThreadId === resolvedThreadId
    )
  )
  const gitScopeLabel = gitScope === 'staged'
    ? t('core:editor.git.scope.staged', { defaultValue: 'Staged' })
    : t('core:editor.git.scope.unstaged', { defaultValue: 'Unstaged' })
  const activePreviewState = gitPreviewState?.previewReadOnly ? gitPreviewState : null
  const activeModelUri = activePreviewState?.modelUri || tabModelUri
  const activeInitialValue = activePreviewState?.previewContent || initialValue
  const editorOptions = activePreviewState || tab?.readOnly
    ? {
        ...MONACO_EDITOR_OPTIONS,
        readOnly: true,
        domReadOnly: true,
      }
    : MONACO_EDITOR_OPTIONS

  onSaveRef.current = onSave
  onFormatRef.current = onFormat
  onToggleMarkdownPreviewRef.current = onToggleMarkdownPreview
  projectFolderRef.current = projectFolder
  providerIdRef.current = providerId
  modelIdRef.current = modelId
  inlineCompletionEnabledRef.current = inlineCompletionEnabled !== false
  gitPreviewStateRef.current = activePreviewState

  useEffect(() => {
    if (gitOverlayMessage?.id !== 'no_repo') return
    if (gitNoRepoNoticeSeenForThread) return
    setVisibleGitNoRepoNoticeThreadId(resolvedThreadId)
    markGitNoRepoNoticeSeenForThread?.(resolvedThreadId)
  }, [
    gitNoRepoNoticeSeenForThread,
    gitOverlayMessage?.id,
    markGitNoRepoNoticeSeenForThread,
    resolvedThreadId,
  ])

  useEffect(() => {
    if (gitOverlayMessage?.id !== 'no_repo') return undefined
    if (visibleGitNoRepoNoticeThreadId !== resolvedThreadId) return undefined
    const timerId = setTimeout(() => {
      setVisibleGitNoRepoNoticeThreadId((prev) => (
        prev === resolvedThreadId ? '' : prev
      ))
    }, GIT_NO_REPO_NOTICE_AUTO_DISMISS_MS)
    return () => clearTimeout(timerId)
  }, [gitOverlayMessage?.id, resolvedThreadId, visibleGitNoRepoNoticeThreadId])

  const updateGitScopeChipRightOffset = useCallback((editor = editorRef.current) => {
    const nextOffset = readGitScopeChipRightOffset(editor)
    setGitScopeChipRightOffset((prevOffset) => (
      prevOffset === nextOffset ? prevOffset : nextOffset
    ))
  }, [])

  const relayout = useCallback((sizeOverride) => {
    const nextSize = sizeOverride ?? readEditorContainerSize(rootRef.current)
    if (!nextSize.width || !nextSize.height) return nextSize

    const prevSize = editorSizeRef.current
    if (prevSize.width !== nextSize.width || prevSize.height !== nextSize.height) {
      editorSizeRef.current = nextSize
      setEditorSize(nextSize)
    }

    try {
      editorRef.current?.layout(nextSize)
      updateGitScopeChipRightOffset()
    } catch {
      // Editor may already be disposed during split/layout churn.
    }

    return nextSize
  }, [updateGitScopeChipRightOffset])

  const handleMount = useCallback((editor, monaco) => {
    void tabId
    editorRef.current = editor
    gitScopeLayoutDisposableRef.current?.dispose?.()
    gitScopeLayoutDisposableRef.current = editor.onDidLayoutChange?.(() => {
      updateGitScopeChipRightOffset(editor)
    }) || null
    ensureTheme(monaco)
    bindMonacoAppearance(monaco, { editor })

    const pendingInlineSuggestionRef = { current: null }
    const logInlineCompletionTelemetry = (eventType, payload = {}) => {
      const api = window?.addom?.editor
      if (!api || typeof api.logInlineCompletionTelemetry !== 'function') return
      const normalizedType = String(eventType || '').trim().toLowerCase()
      if (!normalizedType) return
      api.logInlineCompletionTelemetry({
        eventType: normalizedType,
        providerId: String(providerIdRef.current || '').trim().toLowerCase(),
        model: String(modelIdRef.current || '').trim(),
        filePath: tabFilePath,
        chars: Math.max(0, Number(payload?.chars || 0) || 0),
        reason: String(payload?.reason || '').trim().toLowerCase(),
      }).catch(() => { })
    }

    registerMonacoEditorCommands({
      editor,
      monaco,
      tabLanguage,
      onSave: () => onSaveRef.current?.(),
      onFormat: () => onFormatRef.current?.(),
      onToggleMarkdownPreview: () => onToggleMarkdownPreviewRef.current?.(),
      pendingInlineSuggestionRef,
      logInlineCompletionTelemetry,
    })

    const model = editor.getModel()
    if (!model) {
      gitUiControllerRef.current?.dispose?.()
      gitUiControllerRef.current = null
      onEditorApiChange?.(null)
      onProblemsChange?.([])
      onOutlineChange?.(emptyOutlineState())
      editor.focus()
      return
    }

    const previewState = gitPreviewStateRef.current
    if (previewState?.modelUri && String(model?.uri || '') === previewState.modelUri) {
      useEditorStore.getState().attachGitPreviewModel(previewState, model)
    } else {
      useEditorStore.getState().attachTabModel(tabId, model)
    }
    gitUiControllerRef.current?.dispose?.()
    gitUiControllerRef.current = attachMonacoGitUi({
      editor,
      monaco,
      onSelectHunk: (hunkId) => {
        useEditorStore.getState().toggleTabGitHunkSelection(
          tabId,
          hunkId,
          useEditorStore.getState().getTabGitScope(tabId),
        )
      },
      onCloseWidget: () => {
        useEditorStore.getState().closeTabGitWidget(
          tabId,
          useEditorStore.getState().getTabGitScope(tabId),
        )
      },
      onStageHunk: (hunkId) => {
        void useEditorStore.getState().stageTabGitHunk(projectFolderRef.current, tabId, hunkId)
      },
      onDiscardHunk: (hunkId) => {
        void useEditorStore.getState().discardTabGitHunk(projectFolderRef.current, tabId, hunkId)
      },
      onUnstageHunk: (hunkId) => {
        void useEditorStore.getState().unstageTabGitHunk(projectFolderRef.current, tabId, hunkId)
      },
      onStageLines: (lineSelection) => {
        void useEditorStore.getState().stageTabGitLines(projectFolderRef.current, tabId, lineSelection)
      },
      onDiscardLines: (lineSelection) => {
        void useEditorStore.getState().discardTabGitLines(projectFolderRef.current, tabId, lineSelection)
      },
      onUnstageLines: (lineSelection) => {
        void useEditorStore.getState().unstageTabGitLines(projectFolderRef.current, tabId, lineSelection)
      },
      labels: {
        noLineDelta: t('core:editor.git.widget.noLineDelta', { defaultValue: 'No line delta' }),
        stage: t('core:editor.git.widget.stage', { defaultValue: 'Stage' }),
        staging: t('core:editor.git.widget.staging', { defaultValue: 'Staging...' }),
        unstage: t('core:editor.git.widget.unstage', { defaultValue: 'Unstage' }),
        unstaging: t('core:editor.git.widget.unstaging', { defaultValue: 'Unstaging...' }),
        more: t('core:editor.git.widget.more', { defaultValue: 'More' }),
        moreHunkActions: t('core:editor.git.widget.moreHunkActions', { defaultValue: 'More hunk actions' }),
        discard: t('core:editor.git.widget.discard', { defaultValue: 'Discard' }),
        discarding: t('core:editor.git.widget.discarding', { defaultValue: 'Discarding...' }),
        close: t('core:editor.git.widget.close', { defaultValue: 'Close' }),
        stageLines: t('core:editor.git.widget.stageLines', { defaultValue: 'Stage Lines' }),
        unstageLines: t('core:editor.git.widget.unstageLines', { defaultValue: 'Unstage Lines' }),
        discardLines: t('core:editor.git.widget.discardLines', { defaultValue: 'Discard Lines' }),
        staged: t('core:editor.git.scope.staged', { defaultValue: 'Staged' }),
        unstaged: t('core:editor.git.scope.unstaged', { defaultValue: 'Unstaged' }),
        hunkPrefix: t('core:editor.git.widget.hunkPrefix', { defaultValue: 'Hunk' }),
        selectionPrefixChanged: t('core:editor.git.selection.changed', { defaultValue: 'Selection: changed lines {{lineLabel}}' }),
        selectionPrefixStaged: t('core:editor.git.selection.staged', { defaultValue: 'Selection: staged lines {{lineLabel}}' }),
        selectionReason: t('core:editor.git.selection.reason', { defaultValue: 'Selection: {{reason}}.' }),
        selectionIncludesContext: t('core:editor.git.selection.includesContext', { defaultValue: 'Selection includes unchanged context lines. {{hint}}' }),
        selectionNoMatch: t('core:editor.git.selection.noMatch', { defaultValue: 'Selection does not match a changed segment. {{hint}}' }),
        selectionNoMatchPlain: t('core:editor.git.selection.noMatchPlain', { defaultValue: 'Selection does not match a changed segment.' }),
        actionableRange: t('core:editor.git.selection.actionableRange', { defaultValue: 'Actionable range: {{labels}}' }),
        actionableRanges: t('core:editor.git.selection.actionableRanges', { defaultValue: 'Actionable ranges: {{labels}}' }),
        moreRangesSuffix: t('core:editor.git.selection.moreRangesSuffix', { defaultValue: ', +{{count}} more' }),
      },
    })

    const createInlineProviderDisposable = () => registerInlineCompletionProvider({
      monaco,
      model,
      tabFilePath,
      tabLanguage,
      projectFolderRef,
      providerIdRef,
      modelIdRef,
      inlineCompletionEnabledRef,
      pendingInlineSuggestionRef,
    })

    attachMonacoAnalysisObservers({
      editor,
      monaco,
      model,
      projectFolder: String(projectFolderRef.current || '').trim(),
      tabFilePath,
      tabLanguage,
      createInlineProviderDisposable,
      onProblemsChange,
      onOutlineChange,
      onEditorApiChange,
      onServiceStateChange,
    })

    editor.focus()
    relayout(editorSizeRef.current)
    updateGitScopeChipRightOffset(editor)
  }, [onEditorApiChange, onOutlineChange, onProblemsChange, onServiceStateChange, relayout, t, tabFilePath, tabId, tabLanguage, updateGitScopeChipRightOffset])

  useEffect(() => {
    if (!tabId || !projectFolder || tab?.loading || tab?.error) return
    void refreshTabGitDiff(projectFolder, tabId)
  }, [projectFolder, refreshTabGitDiff, tab?.dirty, tab?.error, tab?.loading, tabFilePath, tabId])

  useEffect(() => {
    gitUiControllerRef.current?.update?.({
      scope: gitScope,
      gitDiff,
      gitDiffLoading,
      gitDiffError,
      selectedHunkId: String(gitUi?.selectedHunkId || ''),
      actionHunkId: String(gitUi?.actionHunkId || ''),
      actionType: String(gitUi?.actionType || ''),
      actionError: String(gitUi?.actionError || ''),
    })
  }, [
    gitDiff,
    gitDiffError,
    gitDiffLoading,
    gitUi?.actionError,
    gitUi?.actionHunkId,
    gitUi?.actionType,
    gitUi?.selectedHunkId,
    gitScope,
  ])

  useEffect(() => {
    if (!activePreviewState?.modelUri) return
    useEditorStore.getState().syncGitPreviewModelContent(activePreviewState)
  }, [activePreviewState])

  useEffect(() => {
    const model = editorRef.current?.getModel?.()
    if (!model) return
    const nextValue = String(activeInitialValue ?? '')
    const currentValue = typeof model.getValue === 'function'
      ? String(model.getValue() ?? '')
      : ''
    if (currentValue === nextValue) return
    model.setValue(nextValue)
  }, [activeInitialValue, activeModelUri])

  useEffect(() => {
    const previousUri = lastPreviewModelUriRef.current
    const nextUri = String(activePreviewState?.modelUri || '')
    if (previousUri && previousUri !== nextUri) {
      useEditorStore.getState().disposeGitPreviewModel(previousUri)
    }
    lastPreviewModelUriRef.current = nextUri
  }, [activePreviewState?.modelUri])

  const handleGitScopeChange = useCallback((nextScope) => {
    const normalizedScope = String(nextScope || '').trim().toLowerCase() === 'staged' ? 'staged' : 'unstaged'
    if (!tabId || normalizedScope === gitScope) return
    startTransition(() => {
      setTabGitScope(tabId, normalizedScope)
    })
    const hasScopeData = normalizedScope === 'staged' ? gitStagedDiff : gitUnstagedDiff
    if (!hasScopeData && projectFolder) {
      void refreshTabGitDiff(projectFolder, tabId, { scope: normalizedScope })
    }
  }, [gitScope, gitStagedDiff, gitUnstagedDiff, projectFolder, refreshTabGitDiff, setTabGitScope, tabId])

  useEffect(() => {
    if (!showGitScopeToggle && gitScopeMenuOpen) {
      setGitScopeMenuOpen(false)
    }
  }, [gitScopeMenuOpen, showGitScopeToggle])

  useEffect(() => {
    if (!gitScopeMenuOpen || typeof window === 'undefined') return undefined

    const handlePointerDown = (event) => {
      if (gitScopeMenuRef.current && !gitScopeMenuRef.current.contains(event.target)) {
        setGitScopeMenuOpen(false)
      }
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setGitScopeMenuOpen(false)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [gitScopeMenuOpen])

  useEffect(() => () => {
    if (lastPreviewModelUriRef.current) {
      useEditorStore.getState().disposeGitPreviewModel(lastPreviewModelUriRef.current)
      lastPreviewModelUriRef.current = ''
    }
    gitUiControllerRef.current?.dispose?.()
    gitUiControllerRef.current = null
    gitScopeLayoutDisposableRef.current?.dispose?.()
    gitScopeLayoutDisposableRef.current = null
  }, [tabId])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const relayoutLater = (retryFrames = 0) => {
      if (resizeFrameRef.current) {
        window.cancelAnimationFrame(resizeFrameRef.current)
      }
      layoutRetryFramesRef.current = Math.max(0, Number(retryFrames || 0) || 0)
      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = 0
        const nextSize = relayout()
        if (
          (!nextSize.width || !nextSize.height)
          && layoutRetryFramesRef.current > 0
        ) {
          relayoutLater(layoutRetryFramesRef.current - 1)
          return
        }
        layoutRetryFramesRef.current = 0
      })
    }

    relayoutLater(INITIAL_LAYOUT_RETRY_FRAMES)
    const onWindowResize = () => relayoutLater()
    window.addEventListener('resize', onWindowResize)

    let resizeObserver = null
    if (typeof ResizeObserver !== 'undefined' && rootRef.current) {
      resizeObserver = new ResizeObserver(() => relayoutLater())
      resizeObserver.observe(rootRef.current)
    }

    return () => {
      if (resizeFrameRef.current) {
        window.cancelAnimationFrame(resizeFrameRef.current)
        resizeFrameRef.current = 0
      }
      window.removeEventListener('resize', onWindowResize)
      resizeObserver?.disconnect?.()
    }
  }, [relayout, tabId])

  const hasMeasuredSize = editorSize.width > 0 && editorSize.height > 0
  const editorWidth = hasMeasuredSize ? editorSize.width : '100%'
  const editorHeight = hasMeasuredSize ? editorSize.height : '100%'

  return (
    <div ref={rootRef} className="relative flex h-full min-h-0 min-w-0 w-full overflow-hidden">
      {(showGitScopeToggle || showGitOverlayMessage) ? (
        <div
          className="pointer-events-none absolute bottom-6 z-20 flex max-w-[min(420px,calc(100%-24px))] flex-col items-end gap-2"
          style={{ right: gitScopeChipRightOffset }}
        >
          {showGitOverlayMessage ? (
            <div
              className={`rounded-md border px-3 py-2 text-xs shadow-lg ${
                gitOverlayMessage.tone === 'danger'
                  ? 'border-red-500/50 bg-red-950/85 text-red-100'
                  : gitOverlayMessage.tone === 'warning'
                    ? 'border-amber-500/50 bg-amber-950/85 text-amber-100'
                    : 'border-surface-border bg-black/75 text-text-secondary'
              }`}
            >
              {gitOverlayMessage.text}
            </div>
          ) : null}
          {showGitScopeToggle ? (
            <div ref={gitScopeMenuRef} className="pointer-events-auto relative">
              {gitScopeMenuOpen ? (
                <div
                  role="menu"
                  aria-label={t('core:editor.git.scope.ariaLabel', { defaultValue: 'Git diff scope' })}
                  className="absolute bottom-[calc(100%+0.375rem)] right-0 w-28 overflow-hidden rounded-md border border-surface-border bg-surface-panel shadow-lg"
                >
                  {['unstaged', 'staged'].map((scope) => {
                    const selected = gitScope === scope
                    const label = scope === 'staged'
                      ? t('core:editor.git.scope.staged', { defaultValue: 'Staged' })
                      : t('core:editor.git.scope.unstaged', { defaultValue: 'Unstaged' })
                    return (
                      <button
                        key={scope}
                        type="button"
                        role="menuitemradio"
                        aria-checked={selected}
                        className={`flex w-full items-center justify-between px-2.5 py-1.5 text-left text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                          selected ? 'bg-emerald-500/20 text-text-primary' : 'text-text-secondary hover:bg-surface-border hover:text-text-primary'
                        }`}
                        onClick={() => {
                          setGitScopeMenuOpen(false)
                          handleGitScopeChange(scope)
                        }}
                      >
                        <span>{label}</span>
                      </button>
                    )
                  })}
                </div>
              ) : null}
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={gitScopeMenuOpen}
                aria-label={t('core:editor.git.scope.selectAriaLabel', { defaultValue: 'Select Git diff scope' })}
                className="inline-flex h-6 items-center gap-1 rounded-md border border-surface-border bg-surface-panel/95 px-2.5 text-[11px] font-medium text-text-secondary shadow-lg opacity-70 transition-[background-color,border-color,color,opacity] hover:border-border-hover hover:text-text-primary hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:opacity-100"
                onClick={() => setGitScopeMenuOpen((value) => !value)}
              >
                <span>{gitScopeLabel}</span>
                <span aria-hidden="true" className={`text-[9px] transition-transform ${gitScopeMenuOpen ? 'rotate-180' : ''}`}>v</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <EditorMonacoSurface
        key={`${tabId}:${activeModelUri}`}
        path={activeModelUri}
        language={tab.language}
        defaultLanguage={tab.language}
        height={editorHeight}
        width={editorWidth}
        defaultValue={activeInitialValue}
        onChange={activePreviewState ? undefined : onChange}
        onMount={handleMount}
        theme={resolveAddomMonacoThemeId()}
        options={editorOptions}
        saveViewState
        keepCurrentModel
        loading={<LoadingPane />}
      />
    </div>
  )
}
