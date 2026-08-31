import { useEffect, useState } from 'react'
import { getPreviewLimitState, isLikelyOversizedForPreview, previewLimitMessage } from './turn-file-changes-card-helpers.mjs'
import {
  buildPreviewRowsFromUnifiedDiff,
  resolvePreviewRevisionPair,
} from './turn-file-changes.mjs'

export function useTurnFileChangePreview({
  row,
  prefetchedDiff = null,
  buildPreviewRows,
}) {
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [previewNotice, setPreviewNotice] = useState('')
  const [diffRows, setDiffRows] = useState([])

  const fileChange = row?.fileChange || {}
  const revisionPair = resolvePreviewRevisionPair(fileChange)
  const beforeRevId = revisionPair.beforeRevId
  const afterRevId = revisionPair.afterRevId
  const diffText = String(fileChange.diffText || '').trim()
  const likelyOversized = isLikelyOversizedForPreview(row)
  const hasRevisionIds = Boolean(beforeRevId || afterRevId)
  // Hunk-only unified diffs cannot expand collapsed regions (no hiddenLines).
  // Prefer full-content diffs whenever revisions or inline content are available.
  // Last-write unified diffs are also wrong for multi-write turn totals.
  const canUseDiffText = (
    Boolean(diffText)
    && !revisionPair.usesTurnBaseline
    && !hasRevisionIds
  )

  useEffect(() => {
    let cancelled = false

    function applyUnifiedDiffRows() {
      const nextRows = buildPreviewRowsFromUnifiedDiff(diffText)
      setDiffRows(nextRows)
      setPreviewNotice('')
      setPreviewError(nextRows.length > 0 ? '' : 'No changed lines to preview.')
    }

    async function run() {
      const prefetchedStatus = String(prefetchedDiff?.status || '').trim().toLowerCase()
      if (prefetchedStatus === 'ready') {
        setDiffRows(Array.isArray(prefetchedDiff?.rows) ? prefetchedDiff.rows : [])
        setPreviewError('')
        setPreviewNotice('')
        return
      }

      if (revisionPair.hasInlineTurnContent) {
        const beforeText = String(revisionPair.beforeContent ?? '')
        const afterText = String(revisionPair.afterContent ?? '')
        const previewLimit = getPreviewLimitState(beforeText, afterText)
        if (previewLimit.blocked) {
          setDiffRows([])
          setPreviewError('')
          setPreviewNotice(previewLimit.message)
          return
        }
        const nextRows = buildPreviewRows(beforeText, afterText)
        setPreviewNotice('')
        setDiffRows(nextRows)
        setPreviewError(nextRows.length > 0 ? '' : 'No changed lines to preview.')
        return
      }

      if (canUseDiffText) {
        applyUnifiedDiffRows()
        return
      }

      if (prefetchedStatus === 'blocked') {
        setDiffRows([])
        setPreviewError('')
        setPreviewNotice(String(prefetchedDiff?.error || previewLimitMessage()).trim())
        return
      }

      if (likelyOversized) {
        setDiffRows([])
        setPreviewError('')
        setPreviewNotice(previewLimitMessage())
        return
      }

      if (!hasRevisionIds) {
        if (diffText && !revisionPair.usesTurnBaseline) {
          applyUnifiedDiffRows()
          return
        }
        setPreviewError('Preview unavailable for this change.')
        setDiffRows([])
        setPreviewNotice('')
        return
      }

      setPreviewLoading(true)
      setPreviewError('')
      try {
        const [beforeRev, afterRev] = await Promise.all([
          beforeRevId ? window.addom.artifacts.getRevision(beforeRevId) : Promise.resolve(null),
          afterRevId ? window.addom.artifacts.getRevision(afterRevId) : Promise.resolve(null),
        ])
        if (cancelled) return
        const beforeText = beforeRevId ? String(beforeRev?.content ?? '') : ''
        const afterText = afterRevId ? String(afterRev?.content ?? '') : ''
        const previewLimit = getPreviewLimitState(beforeText, afterText)
        if (previewLimit.blocked) {
          setDiffRows([])
          setPreviewError('')
          setPreviewNotice(previewLimit.message)
          return
        }
        const nextRows = buildPreviewRows(beforeText, afterText)
        setPreviewNotice('')
        if (nextRows.length <= 0 && diffText && !revisionPair.usesTurnBaseline) {
          applyUnifiedDiffRows()
          return
        }
        setDiffRows(nextRows)
        if (nextRows.length <= 0) {
          setPreviewError('No changed lines to preview.')
        }
      } catch (error) {
        if (cancelled) return
        // Fall back to hunk text when revision load fails so preview still appears.
        if (diffText && !revisionPair.usesTurnBaseline) {
          applyUnifiedDiffRows()
          return
        }
        setPreviewNotice('')
        setPreviewError(String(error?.message || 'Could not load file changes preview.'))
        setDiffRows([])
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    }

    void run()
    return () => { cancelled = true }
  }, [
    afterRevId,
    beforeRevId,
    buildPreviewRows,
    canUseDiffText,
    diffText,
    hasRevisionIds,
    likelyOversized,
    prefetchedDiff,
    revisionPair.afterContent,
    revisionPair.beforeContent,
    revisionPair.hasInlineTurnContent,
    revisionPair.usesTurnBaseline,
  ])

  return {
    diffRows,
    previewError,
    previewLoading,
    previewNotice,
  }
}
