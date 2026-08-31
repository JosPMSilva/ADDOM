import React, { useCallback, useEffect, useMemo, useState } from 'react'
import hljs from 'highlight.js/lib/common'
import { computeLineDiff } from '../diff/line-diff.mjs'
import { DiffLine, DiffStats, DIFF_LINE_RAIL_TRACK, inferLanguage } from '../diff/DiffComponents.jsx'
import { buildMergePreviewSections } from './write-conflict-preview.mjs'
import { getBlockRenderMetrics } from './code-block-rendering.mjs'
import { formatRelativeTime as formatLocalizedRelativeTime } from '../../i18n/formatters.mjs'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import ActionButton from '../ui/ActionButton.jsx'
import PromptSurface from '../ui/PromptSurface.jsx'

const SHOW_DEV_CONFLICT_DEBUG = import.meta.env.DEV

function formatRelativeTime(timestamp) {
  if (!timestamp) return ''
  return formatLocalizedRelativeTime(timestamp, {
    fallback: '',
    numeric: 'auto',
    style: 'narrow',
  })
}

function highlightCode(text, language = 'text') {
  const content = String(text ?? '')
  const lang = String(language || 'text').trim().toLowerCase()
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(content, { language: lang, ignoreIllegals: true }).value
    }
    return hljs.highlightAuto(content).value
  } catch {
    return ''
  }
}

function MergeDiffView({ prevContent, newContent, label, noChangesLabel = 'No changes detected.', filePath = '' }) {
  const { t } = useRendererTranslation(['core'])
  const diff = useMemo(
    () => computeLineDiff(prevContent ?? '', newContent ?? ''),
    [prevContent, newContent],
  )

  const codeLanguage = useMemo(() => inferLanguage(filePath), [filePath])

  const [expandedSet, setExpandedSet] = useState(() => new Set())

  const toggleExpand = useCallback((segIndex) => {
    setExpandedSet((prev) => {
      const next = new Set(prev)
      if (next.has(segIndex)) next.delete(segIndex)
      else next.add(segIndex)
      return next
    })
  }, [])

  const baseRows = useMemo(() => {
    const result = []
    diff.forEach((seg, si) => {
      if (seg.type === 'ellipsis' && expandedSet.has(si) && Array.isArray(seg.hiddenLines) && seg.hiddenLines.length > 0) {
        for (const line of seg.hiddenLines) {
          result.push({ key: `${si}-exp-${line.oldLine ?? line.newLine}`, type: 'unchanged', oldLine: line.oldLine, newLine: line.newLine, text: line.text })
        }
      } else {
        seg.lines.forEach((line, li) => {
          result.push({
            key: `${si}-${li}`,
            type: seg.type,
            oldLine: line.oldLine,
            newLine: line.newLine,
            text: line.text,
            expandable: seg.type === 'ellipsis' && Array.isArray(seg.hiddenLines) && seg.hiddenLines.length > 0,
            segIndex: si,
          })
        })
      }
    })
    return result
  }, [diff, expandedSet])

  const joinedText = useMemo(
    () => baseRows.map((r) => String(r.text ?? '')).join('\n'),
    [baseRows],
  )
  const { highlightEnabled } = useMemo(
    () => getBlockRenderMetrics(joinedText),
    [joinedText],
  )

  const rows = useMemo(
    () => baseRows.map((row) => {
      const canHighlight = highlightEnabled && row.type !== 'ellipsis' && String(row.text ?? '').trim().length > 0
      return {
        ...row,
        highlightedHtml: canHighlight ? highlightCode(row.text, codeLanguage) : '',
      }
    }),
    [baseRows, highlightEnabled, codeLanguage],
  )

  const lineNumberDigits = useMemo(() => {
    let largest = 0
    for (const row of rows) {
      largest = Math.max(largest, Number(row.oldLine || 0) || 0, Number(row.newLine || 0) || 0)
    }
    return Math.max(2, String(largest || 0).length)
  }, [rows])

  const gridTemplate = useMemo(
    () => `calc(${lineNumberDigits}ch + 1.75rem) ${DIFF_LINE_RAIL_TRACK} minmax(0, 1fr)`,
    [lineNumberDigits],
  )

  return (
    <div>
      <p className="chat-typo-conflict-diff-label mb-1.5 uppercase tracking-wider text-text-secondary">{label}</p>
      <div className="chat-typo-conflict-diff-body max-h-[60vh] overflow-auto rounded-lg border border-surface-border bg-surface font-mono">
        {diff.length === 0 ? (
          <p className="text-text-muted px-4 py-3">{noChangesLabel}</p>
        ) : (
          <pre className="m-0 px-1 py-1">
            <code className="block font-mono">
              {rows.map((row) => (
                <DiffLine
                  key={row.key}
                  type={row.type}
                  oldLine={row.oldLine}
                  newLine={row.newLine}
                  text={row.text}
                  highlightedHtml={row.highlightedHtml}
                  gridTemplate={gridTemplate}
                  expandable={row.expandable}
                  onToggleExpand={row.expandable ? () => toggleExpand(row.segIndex) : undefined}
                  changeLabel={row.type === 'added'
                    ? t('core:chat.diff.addedLine', { defaultValue: 'Added line' })
                    : row.type === 'removed'
                      ? t('core:chat.diff.removedLine', { defaultValue: 'Removed line' })
                      : ''}
                />
              ))}
            </code>
          </pre>
        )}
      </div>
      <DiffStats diff={diff} />
    </div>
  )
}

function SpinnerIcon() {
  return (
    <svg className="w-4 h-4 animate-spin text-accent" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-success-soft">
      <polyline points="3 8 7 12 13 4" />
    </svg>
  )
}

export default function WriteConflictCard({
  conflict,
  projectFolder = '',
  providerId = '',
  model = '',
  onResolve,
  onDismiss,
  onSetMergeProposal,
}) {
  const { t } = useRendererTranslation(['core'])
  const [showDiffs, setShowDiffs] = useState(false)
  const [showPreMergePreview, setShowPreMergePreview] = useState(false)
  const [confirmDismiss, setConfirmDismiss] = useState(false)
  const [preMergeContext, setPreMergeContext] = useState({ status: 'idle', baseContent: '', oursContent: '', theirsContent: '' })
  const [revisionPreview, setRevisionPreview] = useState({
    status: 'idle',
    error: '',
    oursLoaded: false,
    oursContent: '',
    theirsLoaded: false,
    theirsContent: '',
  })

  const status = conflict?.mergeProposal?.status || 'idle'
  const errorKind = String(conflict?.mergeProposal?.errorKind || '').trim()
  const isResolved = conflict?.resolved === true
  const mergedContent = String(conflict?.mergeProposal?.content || '')
  const isStaleMergeError = (
    errorKind === 'changed_since_conflict'
    || errorKind === 'disk_changed_since_conflict'
    || errorKind === 'missing_latest_revision'
  )

  useEffect(() => {
    if (status !== 'ready' || !mergedContent) {
      setRevisionPreview({
        status: 'idle',
        error: '',
        oursLoaded: false,
        oursContent: '',
        theirsLoaded: false,
        theirsContent: '',
      })
      return
    }

    const artifactsApi = window?.addom?.artifacts
    if (typeof artifactsApi?.getRevision !== 'function') {
      setRevisionPreview({
        status: 'error',
        error: t('core:chat.writeConflict.errors.revisionPreviewUnavailable', { defaultValue: 'Revision preview is unavailable in this renderer session.' }),
        oursLoaded: false,
        oursContent: '',
        theirsLoaded: false,
        theirsContent: '',
      })
      return
    }

    let cancelled = false
    setRevisionPreview((current) => ({
      ...current,
      status: 'loading',
      error: '',
    }))

    async function loadRevisionPreview() {
      try {
        const [oursRevision, theirsRevision] = await Promise.all([
          conflict?.newRevId ? artifactsApi.getRevision(conflict.newRevId) : Promise.resolve(null),
          conflict?.conflictActualRevId ? artifactsApi.getRevision(conflict.conflictActualRevId) : Promise.resolve(null),
        ])
        if (cancelled) return
        setRevisionPreview({
          status: 'ready',
          error: '',
          oursLoaded: !!conflict?.newRevId,
          oursContent: String(oursRevision?.content ?? ''),
          theirsLoaded: !!conflict?.conflictActualRevId,
          theirsContent: String(theirsRevision?.content ?? ''),
        })
      } catch (err) {
        if (cancelled) return
        setRevisionPreview({
          status: 'error',
          error: String(err?.message || t('core:chat.writeConflict.errors.loadRevisionPreviewFailed', { defaultValue: 'Could not load revision preview.' })),
          oursLoaded: false,
          oursContent: '',
          theirsLoaded: false,
          theirsContent: '',
        })
      }
    }

    void loadRevisionPreview()
    return () => {
      cancelled = true
    }
  }, [status, mergedContent, conflict?.newRevId, conflict?.conflictActualRevId, t])

  useEffect(() => {
    if (!showPreMergePreview || preMergeContext.status !== 'idle') return
    const artifactsApi = window?.addom?.artifacts
    if (typeof artifactsApi?.getRevision !== 'function') {
      setPreMergeContext((c) => ({ ...c, status: 'unavailable' }))
      return
    }
    let cancelled = false
    setPreMergeContext((c) => ({ ...c, status: 'loading' }))
    async function load() {
      try {
        const [base, ours, theirs] = await Promise.all([
          conflict?.conflictBaseRevId ? artifactsApi.getRevision(conflict.conflictBaseRevId) : Promise.resolve(null),
          conflict?.newRevId ? artifactsApi.getRevision(conflict.newRevId) : Promise.resolve(null),
          conflict?.conflictActualRevId ? artifactsApi.getRevision(conflict.conflictActualRevId) : Promise.resolve(null),
        ])
        if (cancelled) return
        setPreMergeContext({
          status: 'ready',
          baseContent: String(base?.content ?? ''),
          oursContent: String(ours?.content ?? ''),
          theirsContent: String(theirs?.content ?? ''),
        })
      } catch {
        if (!cancelled) setPreMergeContext((c) => ({ ...c, status: 'error' }))
      }
    }
    void load()
    return () => { cancelled = true }
  }, [showPreMergePreview, preMergeContext.status, conflict?.conflictBaseRevId, conflict?.newRevId, conflict?.conflictActualRevId])

  const preMergeSummary = useMemo(() => {
    if (preMergeContext.status !== 'ready') return null
    const yourDiff = computeLineDiff(preMergeContext.baseContent, preMergeContext.oursContent)
    const otherDiff = computeLineDiff(preMergeContext.baseContent, preMergeContext.theirsContent)
    const countChanges = (diff) => {
      let added = 0, removed = 0
      for (const seg of diff) {
        if (seg.type === 'added') added += seg.lines.length
        if (seg.type === 'removed') removed += seg.lines.length
      }
      return { added, removed }
    }
    return { yours: countChanges(yourDiff), theirs: countChanges(otherDiff), yourDiff, otherDiff }
  }, [preMergeContext])

  const previewSections = useMemo(
    () => buildMergePreviewSections({
      mergedContent,
      oursLoaded: revisionPreview.oursLoaded,
      oursContent: revisionPreview.oursContent,
      theirsLoaded: revisionPreview.theirsLoaded,
      theirsContent: revisionPreview.theirsContent,
    }),
    [mergedContent, revisionPreview],
  )

  const handleRequestMerge = useCallback(async () => {
    if (!conflict?.id) return
    onSetMergeProposal?.(conflict.id, {
      status: 'loading',
      content: '',
      explanation: '',
      error: '',
      errorKind: '',
    })

    try {
      const result = await window.addom.artifacts.requestMergeProposal(projectFolder, {
        conflictBaseRevId: conflict.conflictBaseRevId,
        conflictActualRevId: conflict.conflictActualRevId,
        newRevId: conflict.newRevId,
        filePath: conflict.filePath,
        providerId,
        model,
      })

      if (result?.ok) {
        onSetMergeProposal?.(conflict.id, {
          status: 'ready',
          content: result.mergedContent || '',
          explanation: result.explanation || '',
          error: '',
          errorKind: '',
          generatedAt: Date.now(),
        })
        return
      }

      onSetMergeProposal?.(conflict.id, {
        status: 'error',
        content: '',
        explanation: '',
        error: result?.error || t('core:chat.writeConflict.errors.unknown', { defaultValue: 'Unknown error' }),
        errorKind: 'request_failed',
        generatedAt: Date.now(),
      })
    } catch (err) {
      onSetMergeProposal?.(conflict.id, {
        status: 'error',
        content: '',
        explanation: '',
        error: String(err?.message || t('core:chat.writeConflict.errors.requestFailed', { defaultValue: 'Request failed' })),
        errorKind: 'request_failed',
        generatedAt: Date.now(),
      })
    }
  }, [conflict, model, onSetMergeProposal, projectFolder, providerId, t])

  const setApplyError = useCallback((message, nextErrorKind = 'apply_failed') => {
    if (!conflict?.id) return
    onSetMergeProposal?.(conflict.id, {
      status: 'error',
      content: conflict?.mergeProposal?.content || '',
      explanation: conflict?.mergeProposal?.explanation || '',
      error: String(message || t('core:chat.writeConflict.errors.applyFailed', { defaultValue: 'Failed to apply merge resolution.' })),
      errorKind: String(nextErrorKind || 'apply_failed'),
      generatedAt: conflict?.mergeProposal?.generatedAt || Date.now(),
    })
  }, [conflict, onSetMergeProposal, t])

  const handleAcceptMerge = useCallback(async () => {
    if (!conflict?.id || !conflict?.mergeProposal?.content) return

    try {
      const result = await window.addom.artifacts.applyMergeResolution(projectFolder, {
        filePath: conflict.filePath,
        mergedContent: conflict.mergeProposal.content,
        conflictId: conflict.id,
        conflictBaseRevId: conflict.conflictBaseRevId,
        conflictActualRevId: conflict.conflictActualRevId,
        newRevId: conflict.newRevId,
      })

      if (result?.ok) {
        onResolve?.(conflict.id)
        return
      }

      setApplyError(
        result?.error || t('core:chat.writeConflict.errors.applyFailed', { defaultValue: 'Failed to apply merge resolution.' }),
        result?.reason || 'apply_failed',
      )
    } catch (err) {
      setApplyError(String(err?.message || t('core:chat.writeConflict.errors.applyFailed', { defaultValue: 'Failed to apply merge resolution.' })), 'apply_failed')
    }
  }, [conflict, onResolve, projectFolder, setApplyError, t])

  const handleDismiss = useCallback(() => {
    if (!confirmDismiss) {
      setConfirmDismiss(true)
      return
    }
    onDismiss?.(conflict?.id)
  }, [conflict?.id, onDismiss, confirmDismiss])

  if (isResolved) {
    return (
      <PromptSurface tone="success" className="my-2 px-3 py-2">
        <div className="chat-typo-conflict-resolved flex items-center gap-2 text-text-secondary">
          <CheckIcon />
          <span>{t('core:chat.writeConflict.resolved', { defaultValue: 'Resolved {{path}}', path: conflict.filePath })}</span>
        </div>
      </PromptSurface>
    )
  }

  return (
    <PromptSurface tone="warning" className="my-2 space-y-2 px-3 py-2.5">
      {/* Header row */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="chat-typo-conflict-header-path truncate font-mono text-text-primary">{conflict.filePath}</span>
        <span className="chat-typo-conflict-header-meta shrink-0 text-text-muted">{t('core:chat.writeConflict.conflictBadge', { defaultValue: 'conflict' })}</span>
        {conflict.detectedAt && (
          <span className="chat-typo-conflict-header-meta shrink-0 text-text-muted">{formatRelativeTime(conflict.detectedAt)}</span>
        )}
        <span className="flex-1" />
        {SHOW_DEV_CONFLICT_DEBUG ? (
          <button
            type="button"
            onClick={() => setShowDiffs(!showDiffs)}
            className="chat-typo-conflict-toggle shrink-0 rounded p-0.5 text-text-muted transition-colors hover:bg-surface-border/30 hover:text-text-secondary"
            title={showDiffs
              ? t('core:chat.writeConflict.hideDebugInfo', { defaultValue: 'Hide debug info' })
              : t('core:chat.writeConflict.showDebugInfo', { defaultValue: 'Show debug info' })}
            aria-label={showDiffs
              ? t('core:chat.writeConflict.hideDebugInfo', { defaultValue: 'Hide debug info' })
              : t('core:chat.writeConflict.showDebugInfo', { defaultValue: 'Show debug info' })}
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <circle cx="8" cy="3" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="8" cy="13" r="1.5" />
            </svg>
          </button>
        ) : null}
      </div>

      {/* Debug panel */}
      {SHOW_DEV_CONFLICT_DEBUG && showDiffs && (
        <div className="chat-typo-conflict-debug space-y-0.5 rounded border border-surface-border bg-surface p-2 font-mono text-text-muted">
          {conflict.conflictBaseRevId && (
            <p>base: <span className="text-text-secondary">{conflict.conflictBaseRevId}</span></p>
          )}
          <p>your write: <span className="text-text-secondary">{conflict.newRevId}</span></p>
          <p>other write: <span className="text-text-secondary">{conflict.conflictActualRevId}</span></p>
          <p>prev: <span className="text-text-secondary">{conflict.prevRevId || '(none)'}</span></p>
          {conflict.toolName && <p>tool: <span className="text-text-secondary">{conflict.toolName}</span></p>}
          <p>detected: <span className="text-text-secondary">{new Date(conflict.detectedAt).toLocaleTimeString()}</span></p>
        </div>
      )}

      {/* Idle state */}
      {status === 'idle' && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowPreMergePreview(!showPreMergePreview)}
            className="chat-typo-conflict-toggle text-text-secondary transition-colors hover:text-text-primary"
          >
            {showPreMergePreview
              ? t('core:chat.writeConflict.hideDetails', { defaultValue: 'Hide details' })
              : t('core:chat.writeConflict.viewChanges', { defaultValue: 'View what changed' })}
          </button>

          {showPreMergePreview && preMergeContext.status === 'loading' && (
            <p className="chat-typo-conflict-status text-text-muted">{t('core:chat.writeConflict.loading', { defaultValue: 'Loading...' })}</p>
          )}

          {showPreMergePreview && preMergeContext.status === 'error' && (
            <p className="chat-typo-conflict-status text-text-muted">{t('core:chat.writeConflict.errors.loadRevisionContextFailed', { defaultValue: 'Could not load revision context.' })}</p>
          )}

          {showPreMergePreview && preMergeSummary && (
            <div className="space-y-2">
              <div className="chat-typo-conflict-header-meta flex items-center gap-4 text-text-muted">
                <span>Yours: <span className="text-success">+{preMergeSummary.yours.added}</span> <span className="text-danger">-{preMergeSummary.yours.removed}</span></span>
                <span>Theirs: <span className="text-success">+{preMergeSummary.theirs.added}</span> <span className="text-danger">-{preMergeSummary.theirs.removed}</span></span>
              </div>
              {preMergeContext.oursContent && (
                <MergeDiffView
                  prevContent={preMergeContext.baseContent}
                  newContent={preMergeContext.oursContent}
                  label={t('core:chat.writeConflict.labels.yoursVsBase', { defaultValue: 'Your changes vs. base' })}
                  noChangesLabel={t('core:toolApprovalOverlay.diff.noChanges', { defaultValue: 'No changes detected.' })}
                  filePath={conflict.filePath}
                />
              )}
              {preMergeContext.theirsContent && (
                <MergeDiffView
                  prevContent={preMergeContext.baseContent}
                  newContent={preMergeContext.theirsContent}
                  label={t('core:chat.writeConflict.labels.theirsVsBase', { defaultValue: 'Other changes vs. base' })}
                  noChangesLabel={t('core:toolApprovalOverlay.diff.noChanges', { defaultValue: 'No changes detected.' })}
                  filePath={conflict.filePath}
                />
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <ActionButton
              onClick={handleRequestMerge}
              disabled={!providerId || !model}
              variant="primary"
              className="chat-typo-conflict-action"
            >
              {t('core:chat.writeConflict.aiMerge', { defaultValue: 'AI Merge' })}
            </ActionButton>
            <ActionButton
              onClick={handleDismiss}
              variant={confirmDismiss ? 'danger' : 'ghost'}
              className="chat-typo-conflict-action"
            >
              {confirmDismiss
                ? t('core:chat.writeConflict.confirm', { defaultValue: 'Confirm' })
                : t('core:chat.writeConflict.dismiss', { defaultValue: 'Dismiss' })}
            </ActionButton>
            {confirmDismiss && (
              <ActionButton
                onClick={() => setConfirmDismiss(false)}
                variant="ghost"
                className="chat-typo-conflict-action px-1.5"
              >
                {t('core:common.cancel', { defaultValue: 'Cancel' })}
              </ActionButton>
            )}
            {(!providerId || !model) && (
              <span className="chat-typo-conflict-hint text-text-muted">{t('core:chat.writeConflict.noModelSelected', { defaultValue: 'No model selected' })}</span>
            )}
          </div>
        </div>
      )}

      {/* Loading state */}
      {status === 'loading' && (
        <div className="chat-typo-conflict-status flex items-center gap-2 text-text-muted">
          <SpinnerIcon />
          <span>{t('core:chat.writeConflict.generatingMerge', { defaultValue: 'Generating merge...' })}</span>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div className="space-y-2">
          <p className="chat-typo-conflict-status text-danger">{conflict.mergeProposal?.error || t('core:chat.writeConflict.errors.mergeFailed', { defaultValue: 'Merge failed.' })}</p>
          <div className="flex items-center gap-2">
            {!isStaleMergeError && errorKind !== 'apply_failed' && (
              <ActionButton
                onClick={handleRequestMerge}
                variant="primary"
                className="chat-typo-conflict-action"
              >
                {t('core:chat.writeConflict.retry', { defaultValue: 'Retry' })}
              </ActionButton>
            )}
            {!isStaleMergeError && errorKind === 'apply_failed' && (
              <ActionButton
                onClick={handleAcceptMerge}
                variant="secondary"
                className="chat-typo-conflict-action"
              >
                {t('core:chat.writeConflict.tryAgain', { defaultValue: 'Try Again' })}
              </ActionButton>
            )}
            <ActionButton
              onClick={handleDismiss}
              variant={confirmDismiss ? 'danger' : 'ghost'}
              className="chat-typo-conflict-action"
            >
              {confirmDismiss
                ? t('core:chat.writeConflict.confirm', { defaultValue: 'Confirm' })
                : t('core:chat.writeConflict.dismiss', { defaultValue: 'Dismiss' })}
            </ActionButton>
            {confirmDismiss && (
              <ActionButton
                onClick={() => setConfirmDismiss(false)}
                variant="ghost"
                className="chat-typo-conflict-action px-1.5"
              >
                {t('core:common.cancel', { defaultValue: 'Cancel' })}
              </ActionButton>
            )}
          </div>
        </div>
      )}

      {/* Ready state — merge proposal available */}
      {status === 'ready' && conflict.mergeProposal?.content && (
        <div className="space-y-2">
          {conflict.mergeProposal?.error && (
            <p className="chat-typo-conflict-status text-danger">{conflict.mergeProposal.error}</p>
          )}

          {revisionPreview.status === 'loading' && (
            <p className="chat-typo-conflict-status text-text-muted">{t('core:chat.writeConflict.loadingPreviews', { defaultValue: 'Loading previews...' })}</p>
          )}

          {revisionPreview.status === 'error' && (
            <p className="chat-typo-conflict-status text-text-muted">{revisionPreview.error}</p>
          )}

          {revisionPreview.status !== 'loading' && previewSections.length > 0 && previewSections.map((section) => (
            <MergeDiffView
              key={section.id}
              prevContent={section.prevContent}
              newContent={section.newContent}
              label={section.label}
              noChangesLabel={t('core:toolApprovalOverlay.diff.noChanges', { defaultValue: 'No changes detected.' })}
              filePath={conflict.filePath}
            />
          ))}

          {revisionPreview.status === 'ready' && previewSections.length === 0 && (
            <p className="chat-typo-conflict-status text-text-muted">{t('core:chat.writeConflict.previewUnavailable', { defaultValue: 'Preview unavailable.' })}</p>
          )}

          {conflict.mergeProposal.explanation && (
            <p className="chat-typo-conflict-explanation italic text-text-muted">
              {conflict.mergeProposal.explanation}
            </p>
          )}

          <div className="flex items-center gap-2">
            <ActionButton
              onClick={handleAcceptMerge}
              variant="primary"
              className="chat-typo-conflict-action"
            >
              {t('core:chat.writeConflict.accept', { defaultValue: 'Accept' })}
            </ActionButton>
            <ActionButton
              onClick={handleDismiss}
              variant={confirmDismiss ? 'danger' : 'ghost'}
              className="chat-typo-conflict-action"
            >
              {confirmDismiss
                ? t('core:chat.writeConflict.confirm', { defaultValue: 'Confirm' })
                : t('core:chat.writeConflict.dismiss', { defaultValue: 'Dismiss' })}
            </ActionButton>
            {confirmDismiss && (
              <ActionButton
                onClick={() => setConfirmDismiss(false)}
                variant="ghost"
                className="chat-typo-conflict-action px-1.5"
              >
                {t('core:common.cancel', { defaultValue: 'Cancel' })}
              </ActionButton>
            )}
          </div>
        </div>
      )}
    </PromptSurface>
  )
}
