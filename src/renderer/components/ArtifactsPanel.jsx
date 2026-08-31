import React, { useCallback, useEffect, useRef, useState } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import { useRendererTranslation } from '../i18n/use-renderer-translation.mjs'
import useAppStore from '../store/useAppStore.js'
import { requestAppConfirm } from '../store/useAppStore.js'
import useArtifactsStore from '../store/useArtifactsStore.js'
import useEditorStore, { detectLanguage } from '../store/useEditorStore.js'
import { useMonacoLoadGuard } from './editor/MonacoLoadGuard.jsx'
import { useRendererFormattingLocale } from '../i18n/formatters.mjs'
import ArtifactScopeFilter from './artifacts/ArtifactScopeFilter.jsx'
import { FileRow, FooterActions, RevPicker } from './artifacts/ArtifactPanelControls.jsx'
import { sourceLabel } from './artifacts/artifact-panel-labels.mjs'
import {
  bindMonacoAppearance,
  resolveAddomMonacoThemeId,
} from '../theme/specialized-theme-adapters.mjs'

export default function ArtifactsPanel() {
  const { t } = useRendererTranslation(['core'])
  const formatLocale = useRendererFormattingLocale()
  const projectFolder = useAppStore((s) => s.projectFolder)
  const activeThreadId = useAppStore((s) => s.activeThreadId)
  const setActivePanel = useAppStore((s) => s.setActivePanel)
  const files = useArtifactsStore((s) => s.files)
  const filesLoading = useArtifactsStore((s) => s.filesLoading)
  const loadFiles = useArtifactsStore((s) => s.loadFiles)
  const artifactScope = useArtifactsStore((s) => s.activeScope)
  const setArtifactScope = useArtifactsStore((s) => s.setActiveScope)
  const openEditorFile = useEditorStore((s) => s.openFile)

  const [selectedFile, setSelectedFile] = useState(null)
  const [revisions, setRevisions] = useState([])
  const [baseRevId, setBaseRevId] = useState(null)
  const [headRevId, setHeadRevId] = useState(null)
  const [baseContent, setBaseContent] = useState(null)
  const [headContent, setHeadContent] = useState(null)
  const [rolling, setRolling] = useState(false)
  const [applying, setApplying] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [actionMsg, setActionMsg] = useState(null)
  const revisionRequestSequenceRef = useRef(0)
  const clearSelectedFile = useCallback(() => {
    revisionRequestSequenceRef.current += 1
    setSelectedFile(null)
    setRevisions([])
    setBaseRevId(null)
    setHeadRevId(null)
    setBaseContent(null)
    setHeadContent(null)
    setActionMsg(null)
  }, [])

  useEffect(() => {
    setArtifactScope('project')
    clearSelectedFile()
  }, [clearSelectedFile, projectFolder, setArtifactScope])

  useEffect(() => {
    const unsub = window.addom.artifacts.onUpdated(() => {
      if (!projectFolder) return
      void loadFiles(projectFolder, { scope: artifactScope, threadId: activeThreadId })
    })
    return unsub
  }, [activeThreadId, artifactScope, projectFolder, loadFiles])

  useEffect(() => {
    if (!projectFolder) return
    void loadFiles(projectFolder, { scope: artifactScope, threadId: activeThreadId })
  }, [activeThreadId, artifactScope, projectFolder, loadFiles])

  useEffect(() => {
    if (activeThreadId || artifactScope !== 'thread') return
    setArtifactScope('project')
  }, [activeThreadId, artifactScope, setArtifactScope])

  useEffect(() => {
    if (!selectedFile || filesLoading || files.some((file) => file.file_path === selectedFile)) return
    clearSelectedFile()
  }, [clearSelectedFile, files, filesLoading, selectedFile])

  const selectFile = useCallback(async (filePath) => {
    const requestId = revisionRequestSequenceRef.current + 1
    revisionRequestSequenceRef.current = requestId
    setSelectedFile(filePath)
    setBaseRevId(null)
    setHeadRevId(null)
    setBaseContent(null)
    setHeadContent(null)
    setActionMsg(null)

    if (!filePath || !projectFolder) return
    const revs = await window.addom.artifacts.listRevisions(projectFolder, filePath)
    if (requestId !== revisionRequestSequenceRef.current) return
    setRevisions(revs ?? [])

    if (revs?.length >= 2) {
      setHeadRevId(revs[0].id)
      setBaseRevId(revs[1].id)
    } else if (revs?.length === 1) {
      setHeadRevId(revs[0].id)
      setBaseRevId('__empty__')
    }
  }, [projectFolder])

  useEffect(() => {
    if (!baseRevId) {
      setBaseContent(null)
      return
    }
    if (baseRevId === '__empty__') {
      setBaseContent('')
      return
    }
    let cancelled = false
    setBaseContent(null)
    window.addom.artifacts.getRevision(baseRevId).then((revision) => {
      if (!cancelled) setBaseContent(revision?.content ?? '')
    })
    return () => {
      cancelled = true
    }
  }, [baseRevId])

  useEffect(() => {
    if (!headRevId) {
      setHeadContent(null)
      return
    }
    let cancelled = false
    setHeadContent(null)
    window.addom.artifacts.getRevision(headRevId).then((revision) => {
      if (!cancelled) setHeadContent(revision?.content ?? '')
    })
    return () => {
      cancelled = true
    }
  }, [headRevId])

  const handleRollback = useCallback(async () => {
    if (!baseRevId || baseRevId === '__empty__' || !selectedFile || !projectFolder) return
    setRolling(true)
    setActionMsg(null)
    const res = await window.addom.artifacts.rollback(projectFolder, selectedFile, baseRevId)
    setRolling(false)
    if (res?.ok) {
      setActionMsg({
        ok: true,
        text: t('artifacts.action.rollbackSuccess', {
          defaultValue: 'Rolled back to rev {{rev}}. New rev {{newRev}} recorded.',
          rev: revisions.find((revision) => revision.id === baseRevId)?.rev ?? '?',
          newRev: res.newRev,
        }),
      })
      await selectFile(selectedFile)
      return
    }
    setActionMsg({
      ok: false,
      text: res?.error ?? t('artifacts.action.rollbackFailed', { defaultValue: 'Rollback failed.' }),
    })
  }, [baseRevId, projectFolder, revisions, selectFile, selectedFile, t])

  const handleDeleteRevision = useCallback(async (revId) => {
    if (!revId || !selectedFile || !projectFolder) return
    const rev = revisions.find((revision) => revision.id === revId)
    const ok = await requestAppConfirm({
      title: t('artifacts.deleteRevisionDialog.title', { defaultValue: 'Delete Revision' }),
      message: t('artifacts.deleteRevisionDialog.message', {
        defaultValue: 'Delete rev {{rev}} ({{source}}) for:\n{{filePath}}\n\nThis cannot be undone.',
        rev: rev?.rev ?? '?',
        source: sourceLabel(t, rev?.source ?? ''),
        filePath: selectedFile,
      }),
      confirmLabel: t('artifacts.deleteRevisionDialog.confirm', { defaultValue: 'Delete Revision' }),
      cancelLabel: t('artifacts.deleteRevisionDialog.cancel', { defaultValue: 'Cancel' }),
      tone: 'danger',
    })
    if (!ok) return
    setDeleting(true)
    setActionMsg(null)
    await window.addom.artifacts.deleteRevision(projectFolder, selectedFile, revId)
    setDeleting(false)
    setActionMsg({
      ok: true,
      text: t('artifacts.action.revisionDeleted', {
        defaultValue: 'Rev {{rev}} deleted.',
        rev: rev?.rev ?? '?',
      }),
    })
    const revs = await window.addom.artifacts.listRevisions(projectFolder, selectedFile)
    setRevisions(revs ?? [])
    if (revId === headRevId) setHeadRevId(revs?.[0]?.id ?? null)
    if (revId === baseRevId) setBaseRevId(revs?.[1]?.id ?? null)
  }, [baseRevId, headRevId, projectFolder, revisions, selectedFile, t])

  const handleApply = useCallback(async () => {
    if (!headRevId || !selectedFile || !projectFolder) return
    const rev = revisions.find((revision) => revision.id === headRevId)
    if (!rev || rev.source !== 'ai_suggestion') return
    setApplying(true)
    setActionMsg(null)
    const res = await window.addom.artifacts.applyToDisk(projectFolder, selectedFile, headRevId)
    setApplying(false)
    if (res?.ok) {
      setActionMsg({
        ok: true,
        text: t('artifacts.action.applySuccess', {
          defaultValue: 'Applied to disk. New rev {{newRev}} recorded.',
          newRev: res.newRev,
        }),
      })
      await selectFile(selectedFile)
      return
    }
    setActionMsg({
      ok: false,
      text: res?.error ?? t('artifacts.action.applyFailed', { defaultValue: 'Apply failed.' }),
    })
  }, [headRevId, projectFolder, revisions, selectFile, selectedFile, t])

  const handleOpenInEditor = useCallback(async (filePath) => {
    const normalizedFilePath = String(filePath || '').trim()
    if (!projectFolder || !normalizedFilePath) return
    setActivePanel('editor')
    await openEditorFile(projectFolder, normalizedFilePath, { source: 'artifacts_panel' })
  }, [openEditorFile, projectFolder, setActivePanel])

  if (!projectFolder) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
        {t('artifacts.emptyProject', { defaultValue: 'Open a project folder to see artifact history.' })}
      </div>
    )
  }

  return (
    <div className="flex h-full bg-surface text-text-primary">
      <div className="w-56 shrink-0 border-r border-surface-border flex flex-col">
        <div className="flex h-[52px] shrink-0 items-center border-b border-surface-border px-4">
          <ArtifactScopeFilter
            activeThreadId={activeThreadId}
            onChange={setArtifactScope}
            resultCount={files.length}
            scope={artifactScope}
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {filesLoading && (
            <p className="text-text-tertiary text-xs px-2 py-3">
              {t('artifacts.loadingTrackedFiles', { defaultValue: 'Loading tracked files...' })}
            </p>
          )}
          {!filesLoading && files.length === 0 && (
            <p className="text-text-tertiary text-xs px-2 py-3">
              {t('artifacts.emptyTrackedFiles', {
                defaultValue: 'No versioned files yet. AI file writes and code suggestions will appear here.',
              })}
            </p>
          )}
          {files.map((file) => (
            <FileRow
              key={file.file_path}
              t={t}
              file={file}
              selected={selectedFile === file.file_path}
              onSelect={() => selectFile(file.file_path)}
              onOpenInEditor={() => handleOpenInEditor(file.file_path)}
              onDelete={async () => {
                const ok = await requestAppConfirm({
                  title: t('artifacts.deleteHistoryDialog.title', { defaultValue: 'Delete Revision History' }),
                  message: t('artifacts.deleteHistoryDialog.message', {
                    defaultValue: 'Delete all revision history for:\n{{filePath}}\n\nThe file on disk is NOT deleted.',
                    filePath: file.file_path,
                  }),
                  confirmLabel: t('artifacts.deleteHistoryDialog.confirm', { defaultValue: 'Delete History' }),
                  cancelLabel: t('artifacts.deleteHistoryDialog.cancel', { defaultValue: 'Cancel' }),
                  tone: 'danger',
                })
                if (!ok) return
                await window.addom.artifacts.deleteFile(projectFolder, file.file_path)
                if (selectedFile === file.file_path) {
                  clearSelectedFile()
                }
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedFile ? (
          <>
            <div aria-hidden="true" className="h-[52px] shrink-0 border-b border-surface-border" />
            <div className="flex flex-1 items-center justify-center text-text-tertiary text-sm">
              {t('artifacts.selectFile', { defaultValue: 'Select a file to view its revision history.' })}
            </div>
          </>
        ) : (
          <>
            <div className="flex h-[52px] shrink-0 flex-wrap items-center gap-4 border-b border-surface-border px-5">
              <span
                className="min-w-0 flex-1 text-xs text-text-tertiary font-mono truncate"
                title={selectedFile}
              >
                {selectedFile}
              </span>

              <div className="flex items-center gap-2 ml-auto flex-wrap">
                <label className="text-xs text-text-tertiary">
                  {t('artifacts.labels.fromBase', { defaultValue: 'From (base)' })}
                </label>
                <RevPicker
                  t={t}
                  locale={formatLocale}
                  revisions={revisions}
                  value={baseRevId}
                  onChange={setBaseRevId}
                  exclude={headRevId}
                  label={t('artifacts.labels.base', { defaultValue: 'base' })}
                />
                {baseRevId && baseRevId !== '__empty__' && (
                  <button
                    onClick={() => handleDeleteRevision(baseRevId)}
                    disabled={deleting}
                    title={t('artifacts.deleteRevisionTitle', { defaultValue: 'Delete this revision' })}
                    className="text-danger hover:text-danger-soft disabled:opacity-40 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6M14 11v6" />
                      <path d="M9 6V4h6v2" />
                    </svg>
                  </button>
                )}
                <span className="text-text-tertiary">-&gt;</span>
                <label className="text-xs text-text-tertiary">
                  {t('artifacts.labels.toHead', { defaultValue: 'To (head)' })}
                </label>
                <RevPicker
                  t={t}
                  locale={formatLocale}
                  revisions={revisions}
                  value={headRevId}
                  onChange={setHeadRevId}
                  exclude={baseRevId}
                  label={t('artifacts.labels.head', { defaultValue: 'head' })}
                />
                {headRevId && (
                  <button
                    onClick={() => handleDeleteRevision(headRevId)}
                    disabled={deleting}
                    title={t('artifacts.deleteRevisionTitle', { defaultValue: 'Delete this revision' })}
                    className="text-danger hover:text-danger-soft disabled:opacity-40 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6M14 11v6" />
                      <path d="M9 6V4h6v2" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              {baseContent !== null || headContent !== null ? (
                <MonacoDiffView
                  base={baseContent ?? ''}
                  head={headContent ?? ''}
                  language={detectLanguage(selectedFile)}
                  filePath={selectedFile}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
                  {t('artifacts.selectRevisions', { defaultValue: 'Select revisions above to compare.' })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-t border-surface-border bg-surface-panel/60 shrink-0">
              <div>
                {actionMsg && (
                  <p className={`text-xs ${actionMsg.ok ? 'text-success' : 'text-danger'}`}>{actionMsg.text}</p>
                )}
              </div>
              <FooterActions
                t={t}
                revisions={revisions}
                baseRevId={baseRevId}
                headRevId={headRevId}
                rolling={rolling}
                applying={applying}
                onRollback={handleRollback}
                onApply={handleApply}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const DIFF_OPTIONS = {
  fontSize: 12,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  fontLigatures: true,
  lineHeight: 20,
  lineNumbersMinChars: 6,
  lineDecorationsWidth: 18,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  renderSideBySide: true,
  readOnly: true,
  overviewRulerBorder: false,
  padding: { top: 8, bottom: 8 },
  scrollbar: { verticalScrollbarSize: 4, horizontalScrollbarSize: 6 },
}

function ensureDiffTheme(monaco, editor) {
  bindMonacoAppearance(monaco, { diff: true, editor })
}

function readDiffModel(monaco, path) {
  if (!monaco?.editor || !path) return null
  try {
    return monaco.editor.getModel(monaco.Uri.parse(path)) ?? null
  } catch {
    return null
  }
}

function disposeDetachedDiffModel(monaco, editor, path) {
  const model = readDiffModel(monaco, path)
  if (!model) return

  let attachedModel = null
  try {
    attachedModel = editor?.getModel?.() ?? null
  } catch {
    attachedModel = null
  }

  if (attachedModel?.original === model || attachedModel?.modified === model) {
    return
  }

  try {
    model.dispose()
  } catch {
    // Best-effort cleanup only.
  }
}

function MonacoDiffView({ base, head, language, filePath }) {
  return (
    <MonacoDiffViewInner
      base={base}
      head={head}
      language={language}
      filePath={filePath}
    />
  )
}

function MonacoDiffViewInner({ base, head, language, filePath }) {
  const { t } = useRendererTranslation(['core'])
  const rootRef = useRef(null)
  const editorRef = useRef(null)
  const monacoRef = useRef(null)
  const previousModelPathsRef = useRef({ original: '', modified: '' })
  const disposeTimerIdsRef = useRef(new Set())
  const resizeFrameRef = useRef(0)
  const editorSizeRef = useRef({ width: 0, height: 0 })
  const [editorSize, setEditorSize] = useState({ width: 0, height: 0 })
  const fileModelKey = React.useMemo(
    () => encodeURIComponent(String(filePath || '__empty__')),
    [filePath],
  )
  const originalPath = `inmemory://addom/diff/${fileModelKey}/base`
  const modifiedPath = `inmemory://addom/diff/${fileModelKey}/head`
  const loadingFallback = (
    <div className="flex items-center justify-center h-full bg-surface">
      <p className="text-text-muted text-xs animate-pulse">
        {t('artifacts.diffLoading', { defaultValue: 'Preparing artifact diff view…' })}
      </p>
    </div>
  )
  const { handleMount, loadingElement } = useMonacoLoadGuard({
    onMount: (editor, monaco) => {
      editorRef.current = editor
      monacoRef.current = monaco
      ensureDiffTheme(monaco, editor)
      const nextSize = readDiffContainerSize(rootRef.current)
      if (nextSize.width > 0 && nextSize.height > 0) {
        editorSizeRef.current = nextSize
        setEditorSize(nextSize)
        editor.layout(nextSize)
      }
    },
    loadingFallback,
    timeoutMessage: t('artifacts.diffTimeout', {
      defaultValue: 'Diff runtime failed to initialize. Reload the app.',
    }),
  })
  const scheduleDetachedModelDispose = useCallback((path) => {
    if (typeof window === 'undefined' || !path) return
    const timerId = window.setTimeout(() => {
      disposeTimerIdsRef.current.delete(timerId)
      disposeDetachedDiffModel(monacoRef.current, editorRef.current, path)
    }, 0)
    disposeTimerIdsRef.current.add(timerId)
  }, [])
  const relayout = useCallback((sizeOverride = null) => {
    const nextSize = sizeOverride ?? readDiffContainerSize(rootRef.current)
    if (!nextSize.width || !nextSize.height) return nextSize

    const prevSize = editorSizeRef.current
    if (prevSize.width !== nextSize.width || prevSize.height !== nextSize.height) {
      editorSizeRef.current = nextSize
      setEditorSize(nextSize)
    }

    try {
      editorRef.current?.layout(nextSize)
    } catch {
      // Diff editor can already be disposed during panel switches.
    }

    return nextSize
  }, [])

  useEffect(() => {
    const previousPaths = previousModelPathsRef.current
    if (previousPaths.original && previousPaths.original !== originalPath) {
      scheduleDetachedModelDispose(previousPaths.original)
    }
    if (previousPaths.modified && previousPaths.modified !== modifiedPath) {
      scheduleDetachedModelDispose(previousPaths.modified)
    }
    previousModelPathsRef.current = { original: originalPath, modified: modifiedPath }
  }, [modifiedPath, originalPath, scheduleDetachedModelDispose])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const disposeTimerIds = disposeTimerIdsRef.current
    return () => {
      for (const timerId of disposeTimerIds) {
        window.clearTimeout(timerId)
      }
      disposeTimerIds.clear()
    }
  }, [])

  const remeasureFonts = useCallback(() => {
    try {
      monacoRef.current?.editor?.remeasureFonts?.()
    } catch {
      // Ignore Monaco font remeasure failures during teardown.
    }
    relayout()
  }, [relayout])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const relayoutLater = () => {
      if (resizeFrameRef.current) {
        window.cancelAnimationFrame(resizeFrameRef.current)
      }
      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = 0
        relayout()
      })
    }

    relayoutLater()
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
  }, [relayout])

  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return undefined

    let cancelled = false
    const runRemeasure = () => {
      if (cancelled) return
      remeasureFonts()
    }

    const ready = document.fonts.ready
    if (ready && typeof ready.then === 'function') {
      ready.then(runRemeasure).catch(() => { })
    }

    const fontSet = document.fonts
    if (typeof fontSet.addEventListener === 'function') {
      fontSet.addEventListener('loadingdone', runRemeasure)
      return () => {
        cancelled = true
        fontSet.removeEventListener('loadingdone', runRemeasure)
      }
    }

    return () => {
      cancelled = true
    }
  }, [remeasureFonts])

  const hasMeasuredSize = editorSize.width > 0 && editorSize.height > 0

  return (
    <div ref={rootRef} className="h-full min-h-0 min-w-0 w-full overflow-hidden addom-artifact-diff">
      {hasMeasuredSize ? (
        <DiffEditor
          original={base}
          modified={head}
          language={language}
          width={editorSize.width}
          height={editorSize.height}
          originalModelPath={originalPath}
          modifiedModelPath={modifiedPath}
          keepCurrentOriginalModel
          keepCurrentModifiedModel
          theme={resolveAddomMonacoThemeId({ diff: true })}
          options={DIFF_OPTIONS}
          onMount={handleMount}
          loading={loadingElement}
        />
      ) : (
        loadingFallback
      )}
    </div>
  )
}

function readDiffContainerSize(node) {
  if (!node?.getBoundingClientRect) return { width: 0, height: 0 }
  const rect = node.getBoundingClientRect()
  return {
    width: Math.max(0, Math.round(rect.width)),
    height: Math.max(0, Math.round(rect.height)),
  }
}
