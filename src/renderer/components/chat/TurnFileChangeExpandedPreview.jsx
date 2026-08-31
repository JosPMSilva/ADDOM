import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import { DiffLine } from '../diff/DiffComponents.jsx'
import {
  DIFF_HUNK_BACKGROUND,
  DIFF_HUNK_RAIL,
  DIFF_LINE_RAIL_TRACK,
  groupConsecutiveDiffHunks,
} from '../diff/diff-hunk-grouping.mjs'
import {
  getBlockRenderMetrics,
  TURN_FILE_DIFF_MAX_HIGHLIGHT_CHARS,
  TURN_FILE_DIFF_MAX_HIGHLIGHT_LINES,
} from './code-block-rendering.mjs'
import {
  countPreviewChangedLines,
  readDisplayedLineTotals,
} from './turn-file-changes.mjs'
import {
  highlightCode,
  inferCodeLanguageFromPath,
} from './turn-file-changes-card-helpers.mjs'
import { buildSharedDiffPreviewRows } from './turn-file-change-diff-preview.mjs'
import { useTurnFileChangePreview } from './use-turn-file-change-preview.mjs'

export default function TurnFileChangeExpandedPreview({ row }) {
  const { t } = useRendererTranslation(['core'])
  const filePath = String(row?.fileChange?.filePath || '').trim()
  const codeLanguage = inferCodeLanguageFromPath(filePath)
  const displayedTotals = useMemo(
    () => readDisplayedLineTotals(row?.fileChange || {}),
    [row?.fileChange],
  )
  const { diffRows, previewError, previewLoading, previewNotice } = useTurnFileChangePreview({
    row,
    buildPreviewRows: buildSharedDiffPreviewRows,
  })
  const previewTotals = useMemo(() => countPreviewChangedLines(diffRows), [diffRows])
  const scrollContainerRef = useRef(null)
  const firstChangeRef = useRef(null)
  const didScrollToChangeRef = useRef(false)

  const joinedDiffText = useMemo(
    () => diffRows.map((diffRow) => String(diffRow?.text ?? '')).join('\n'),
    [diffRows],
  )
  const { highlightEnabled } = useMemo(
    () => getBlockRenderMetrics(joinedDiffText, {
      maxChars: TURN_FILE_DIFF_MAX_HIGHLIGHT_CHARS,
      maxLines: TURN_FILE_DIFF_MAX_HIGHLIGHT_LINES,
    }),
    [joinedDiffText],
  )

  const renderedRows = useMemo(
    () => diffRows.map((diffRow) => {
      const kind = String(diffRow?.kind || '').trim()
      const text = String(diffRow?.text ?? '')
      const canHighlight = highlightEnabled && kind !== 'ellipsis' && text.trim().length > 0
      const highlightedHtml = canHighlight ? highlightCode(text, codeLanguage) : ''
      return {
        ...diffRow,
        kind,
        text,
        highlightedHtml,
      }
    }),
    [diffRows, highlightEnabled, codeLanguage],
  )

  const [expandedSet, setExpandedSet] = useState(() => new Set())
  const toggleExpand = useCallback((idx) => {
    setExpandedSet((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }, [])

  const displayRows = useMemo(() => {
    const result = []
    renderedRows.forEach((diffRow, index) => {
      const isEllipsis = diffRow.kind === 'ellipsis'
      const hasHidden = isEllipsis && Array.isArray(diffRow.hiddenLines) && diffRow.hiddenLines.length > 0
      if (isEllipsis && hasHidden && expandedSet.has(index)) {
        for (const line of diffRow.hiddenLines) {
          const text = String(line?.text ?? '')
          const canHL = highlightEnabled && text.trim().length > 0
          result.push({
            key: `${index}-exp-${line.oldLine ?? line.newLine}`,
            type: 'unchanged',
            oldLine: line.oldLine,
            newLine: line.newLine,
            text,
            highlightedHtml: canHL ? highlightCode(text, codeLanguage) : '',
          })
        }
      } else {
        const type = diffRow.kind === 'add' ? 'added'
          : diffRow.kind === 'delete' ? 'removed'
            : isEllipsis ? 'ellipsis'
              : 'unchanged'
        result.push({
          key: `${diffRow.kind}:${diffRow.oldLine ?? 'x'}:${diffRow.newLine ?? 'y'}:${index}`,
          type,
          oldLine: diffRow.oldLine,
          newLine: diffRow.newLine,
          text: diffRow.text,
          highlightedHtml: diffRow.highlightedHtml,
          expandable: hasHidden,
          sourceIndex: index,
        })
      }
    })
    return result
  }, [renderedRows, expandedSet, highlightEnabled, codeLanguage])

  const displayGroups = useMemo(
    () => groupConsecutiveDiffHunks(displayRows),
    [displayRows],
  )

  const firstChangeKey = useMemo(() => {
    const hit = displayRows.find((entry) => entry.type === 'added' || entry.type === 'removed')
    return hit?.key || ''
  }, [displayRows])

  useEffect(() => {
    didScrollToChangeRef.current = false
  }, [filePath, row?.key])

  useEffect(() => {
    if (previewLoading || !firstChangeKey || didScrollToChangeRef.current) return
    const node = firstChangeRef.current
    const container = scrollContainerRef.current
    if (!node || !container) return
    didScrollToChangeRef.current = true
    const nodeTop = node.offsetTop
    const target = Math.max(0, nodeTop - Math.floor(container.clientHeight * 0.25))
    container.scrollTop = target
  }, [firstChangeKey, previewLoading, displayRows.length])

  const lineNumberDigits = useMemo(() => {
    let largestLineNumber = 0
    for (const entry of displayRows) {
      largestLineNumber = Math.max(
        largestLineNumber,
        Number(entry?.oldLine || 0) || 0,
        Number(entry?.newLine || 0) || 0,
      )
    }
    return Math.max(2, String(largestLineNumber || 0).length)
  }, [displayRows])
  const maxContentColumns = useMemo(() => {
    let widestLine = 1
    for (const entry of displayRows) {
      const value = String(entry?.text ?? '')
      if (value.length > widestLine) widestLine = value.length
    }
    return widestLine
  }, [displayRows])
  const rowGridTemplate = useMemo(
    () => `calc(${lineNumberDigits}ch + 1.75rem) ${DIFF_LINE_RAIL_TRACK} ${maxContentColumns}ch`,
    [lineNumberDigits, maxContentColumns],
  )
  const codeWidth = useMemo(
    () => `max(100%, calc(${lineNumberDigits}ch + 1.75rem + ${DIFF_LINE_RAIL_TRACK} + ${maxContentColumns}ch))`,
    [lineNumberDigits, maxContentColumns],
  )

  const previewPartial = (
    previewTotals.addedLines < displayedTotals.addedLines
    || previewTotals.removedLines < displayedTotals.removedLines
  )
  const showMeta = displayRows.length > 0 && (
    displayedTotals.addedLines > 0
    || displayedTotals.removedLines > 0
    || previewTotals.collapsedRegions > 0
  )

  return (
    <div className="mt-1.5" data-ui="turn-file-change-expanded-preview">
      {previewLoading ? (
        <p className="chat-typo-file-changes-preview-message px-1 py-1 text-text-secondary">
          {t('core:chat.fileChanges.preview.loading', { defaultValue: 'Loading changes...' })}
        </p>
      ) : displayRows.length > 0 ? (
        <>
          {showMeta ? (
            <div className="chat-typo-file-changes-preview-message flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1 pb-1 text-text-secondary">
              <span className="text-success">+{displayedTotals.addedLines}</span>
              <span className="text-danger">-{displayedTotals.removedLines}</span>
              {previewTotals.collapsedRegions > 0 ? (
                <span>
                  {t('core:chat.fileChanges.preview.collapsedRegions', {
                    defaultValue: '{{count}} collapsed region{{suffix}}',
                    count: previewTotals.collapsedRegions,
                    suffix: previewTotals.collapsedRegions === 1 ? '' : 's',
                  })}
                </span>
              ) : null}
              {previewPartial ? (
                <span className="text-warning-soft">
                  {t('core:chat.fileChanges.preview.partialShown', {
                    defaultValue: 'Showing +{{shownAdded}} −{{shownRemoved}} in preview',
                    shownAdded: previewTotals.addedLines,
                    shownRemoved: previewTotals.removedLines,
                  })}
                </span>
              ) : (
                <span>
                  {t('core:chat.fileChanges.preview.scrollForMore', {
                    defaultValue: 'Scroll for more',
                  })}
                </span>
              )}
            </div>
          ) : null}
          <pre
            ref={scrollContainerRef}
            className="chat-typo-file-changes-preview-body m-0 max-h-[min(28rem,50vh)] overflow-auto px-1 py-1"
            data-ui="turn-file-change-preview-scroll"
          >
            <code className="block min-w-full font-mono" style={{ width: codeWidth }}>
              {displayGroups.map((group) => {
                const hunkBg = group.hunkType
                  ? DIFF_HUNK_BACKGROUND[group.hunkType]
                  : ''
                const hunkRail = group.hunkType
                  ? DIFF_HUNK_RAIL[group.hunkType]
                  : ''
                return (
                  <span
                    key={group.key}
                    className={[
                      'block',
                      hunkBg ? `rounded-sm ${hunkBg}` : '',
                      hunkRail,
                    ].filter(Boolean).join(' ')}
                    data-ui={hunkBg ? 'diff-hunk' : undefined}
                    data-diff-hunk={group.hunkType || undefined}
                  >
                    {group.entries.map((entry) => {
                      const isFirstChange = entry.key === firstChangeKey
                      return (
                        <span
                          key={entry.key}
                          ref={isFirstChange ? firstChangeRef : undefined}
                          className="block"
                        >
                          <DiffLine
                            type={entry.type}
                            oldLine={entry.oldLine}
                            newLine={entry.newLine}
                            text={entry.text}
                            highlightedHtml={entry.highlightedHtml}
                            gridTemplate={rowGridTemplate}
                            fullRowBackground
                            paintBackground={!hunkBg}
                            paintChangeRail={!hunkBg}
                            changeLabel={entry.type === 'added'
                              ? t('core:chat.diff.addedLine', { defaultValue: 'Added line' })
                              : entry.type === 'removed'
                                ? t('core:chat.diff.removedLine', { defaultValue: 'Removed line' })
                                : ''}
                            expandable={entry.expandable}
                            onToggleExpand={entry.expandable ? () => toggleExpand(entry.sourceIndex) : undefined}
                          />
                        </span>
                      )
                    })}
                  </span>
                )
              })}
            </code>
          </pre>
        </>
      ) : previewError ? (
        <p className="chat-typo-file-changes-preview-message px-1 py-1 text-danger-soft">{previewError}</p>
      ) : previewNotice ? (
        <p className="chat-typo-file-changes-preview-message px-1 py-1 text-warning-soft">{previewNotice}</p>
      ) : (
        <p className="chat-typo-file-changes-preview-message px-1 py-1 text-text-secondary">
          {t('core:chat.fileChanges.preview.noChangedLines', { defaultValue: 'No changed lines to preview.' })}
        </p>
      )}
    </div>
  )
}
