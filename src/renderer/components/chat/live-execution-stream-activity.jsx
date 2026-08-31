import React from 'react'
import CopyBlockButton from './CopyBlockButton.jsx'
import AssistantRichContent from './AssistantRichContent.jsx'
import { stripAnsiControlSequences } from './ansi-output.mjs'
import { buildExecutionFileReferenceRenderState } from './chat-rich-content-renderer.jsx'

const EXECUTION_FILE_REFERENCE_CLASS_NAME = 'text-accent-soft underline decoration-accent-muted underline-offset-2 hover:text-text-primary'
const DEFAULT_EXECUTION_ROW_TONE_CLASS = 'text-text-tertiary'

function ChevronIcon({ open = false }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function StreamLoopingDots() {
  return (
    <span aria-hidden="true" className="ml-1 inline-flex items-center text-text-tertiary">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="inline-block w-[0.4em] animate-pulse"
          style={{ animationDelay: `${index * 180}ms` }}
        >
          .
        </span>
      ))}
    </span>
  )
}

function PreviewToggle({ expanded = false }) {
  const visibilityClass = expanded
    ? 'opacity-100'
    : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
  return (
    <span className={`ml-0.5 inline-flex text-text-secondary transition-opacity duration-150 ${visibilityClass}`}>
      <ChevronIcon open={expanded} />
    </span>
  )
}

function StreamRowStatusIcon({ kind = '' }) {
  const normalized = String(kind || '').trim().toLowerCase()
  if (normalized === 'success') {
    return <span aria-hidden="true" className="ph ph-check text-[14px] leading-none text-success" />
  }
  if (normalized === 'error') {
    return <span aria-hidden="true" className="ph ph-x text-[14px] leading-none text-danger" />
  }
  return null
}

function renderExecutionFileReferenceText(text = '', keyPrefix = 'execution-text') {
  return buildExecutionFileReferenceRenderState(text, {
    keyPrefix,
    className: EXECUTION_FILE_REFERENCE_CLASS_NAME,
  })
}

function splitExecutionLabel(label = '') {
  const text = String(label || '')
  const match = text.match(/^(\S+)([\s\S]*)$/)
  if (!match) return { action: '', detail: text }
  return {
    action: match[1] || '',
    detail: match[2] || '',
  }
}

function buildExecutionLabelRenderState({ label = '', rowId = '', showDots = false, useMutedHierarchy = true } = {}) {
  if (showDots || !useMutedHierarchy) {
    return renderExecutionFileReferenceText(label, `exec-label:${rowId || label}`)
  }

  const { action, detail } = splitExecutionLabel(label)
  const detailRenderState = renderExecutionFileReferenceText(detail, `exec-label-detail:${rowId || label}`)
  return {
    hasFileReferences: detailRenderState.hasFileReferences,
    content: (
      <>
        {action ? <span className="font-medium text-text-secondary transition-colors group-hover:text-text-primary group-focus-within:text-text-primary">{action}</span> : null}
        {detail ? <span className="font-normal text-text-tertiary/80 transition-colors group-hover:text-text-secondary group-focus-within:text-text-secondary">{detailRenderState.content}</span> : null}
      </>
    ),
  }
}

function CompactionMilestoneRow({ title = '', detail = '', tone = 'provider' }) {
  const pillClass = tone === 'provider'
    ? 'border-surface-border/80 bg-surface-panel/55 text-text-secondary'
    : 'border-surface-border/80 bg-surface-panel-alt/70 text-text-secondary'
  const lineClass = tone === 'provider'
    ? 'bg-surface-border/70'
    : 'bg-surface-border/70'

  return (
    <div data-chat-render="timeline-compaction-milestone" className="py-2.5">
      <div className="flex items-center gap-3">
        <span className={`h-px flex-1 ${lineClass}`} />
        <span className={`chat-typo-tool-activity-milestone-badge inline-flex items-center rounded-md border px-2.5 py-1 uppercase tracking-[0.14em] ${pillClass}`}>
          {title}
        </span>
        <span className={`h-px flex-1 ${lineClass}`} />
      </div>
      {detail ? (
        <p className="chat-typo-tool-activity-milestone-detail mt-2 text-center text-text-tertiary">
          {detail}
        </p>
      ) : null}
    </div>
  )
}

function CompactionActiveRow({ label = '', showDots = false }) {
  return (
    <div data-chat-render="timeline-compaction-active" className="py-0.5">
      <div className="whitespace-pre-wrap break-words select-text chat-typo-exec-compaction-label text-text-secondary">
        <span className="min-w-0">
          {label}
          {showDots ? <StreamLoopingDots /> : null}
        </span>
      </div>
    </div>
  )
}

export default function StreamActivityRow({
  row = null,
  previewExpanded = false,
  onTogglePreview = () => {},
}) {
  if (!row?.label) return null
  const sanitizedLabel = stripAnsiControlSequences(row.label)
  const sanitizedDetail = stripAnsiControlSequences(row.detail || '')
  const taskInstructionText = String(row?.taskInstructionText || '')
  const hasTaskInstruction = taskInstructionText.trim().length > 0
  const richContentText = String(row?.richContentText || '')
  const hasRichContent = richContentText.trim().length > 0
  const expandedPreviewLines = Array.isArray(row.previewExpanded) && row.previewExpanded.length > 0
    ? row.previewExpanded
    : row.preview
  const sanitizedPreviewLines = Array.isArray(expandedPreviewLines)
    ? expandedPreviewLines.map((line) => stripAnsiControlSequences(line)).filter((line) => line.length > 0)
    : []
  const hasExpandableDetail = !hasRichContent && (
    sanitizedDetail.length > 0
    || sanitizedPreviewLines.length > 0
  )
  const canTogglePreview = hasRichContent || hasExpandableDetail
  const inlineDetailHiddenByPreview = !hasRichContent && canTogglePreview && sanitizedDetail
  const isChildRow = row?.isChild === true
  const showTaskCard = hasTaskInstruction && (!hasRichContent || previewExpanded)
  const showPlainPreview = !hasRichContent && hasExpandableDetail
  const showRichPreview = hasRichContent && previewExpanded
  const previewPanelVisible = showRichPreview || (showPlainPreview && previewExpanded)
  const childContentWidthClass = isChildRow
    ? 'ml-4 max-w-[min(100%,48rem)]'
    : 'max-w-[min(100%,52rem)]'
  const nestedContentClass = isChildRow
    ? 'ml-4'
    : 'ml-6'
  const hasExplicitTone = row.toneClass && row.toneClass !== 'text-text-primary'
  const rowToneClass = hasExplicitTone ? row.toneClass : DEFAULT_EXECUTION_ROW_TONE_CLASS
  const labelRenderState = buildExecutionLabelRenderState({
    label: sanitizedLabel,
    rowId: row.id || sanitizedLabel,
    showDots: row.showDots === true,
    useMutedHierarchy: !hasExplicitTone,
  })
  const detailRenderState = renderExecutionFileReferenceText(sanitizedDetail, `exec-detail:${row.id || sanitizedLabel}`)
  const previewRenderState = renderExecutionFileReferenceText(
    sanitizedPreviewLines.join('\n'),
    `exec-preview:${row.id || sanitizedLabel}`,
  )
  if (row?.type === 'compaction_milestone') {
    return (
      <CompactionMilestoneRow
        title={sanitizedLabel}
        detail={sanitizedDetail}
        tone={String(row?.milestoneTone || '').trim().toLowerCase()}
      />
    )
  }
  if (row?.type === 'compaction') {
    return (
      <CompactionActiveRow
        label={sanitizedLabel}
        showDots={row.showDots === true}
      />
    )
  }
  const labelContent = (
    <>
      {labelRenderState.content}
      {row.showDots ? <StreamLoopingDots /> : null}
    </>
  )

  return (
    <div className={`py-1 group relative ${isChildRow ? 'ml-3 pl-2' : ''}`} data-chat-render="execution-row">
      <div className={`flex items-center gap-2 whitespace-pre-wrap break-words select-text ${isChildRow ? 'chat-typo-agent-label' : 'chat-typo-exec-row-label'} ${rowToneClass}`}>
        <StreamRowStatusIcon kind={row.iconKind} />
        {canTogglePreview ? (
          labelRenderState.hasFileReferences ? (
            <span className="min-w-0">
              {labelContent}
              <button
                type="button"
                onClick={onTogglePreview}
                className="inline-flex align-[-0.125em] text-left text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:text-text-primary"
                aria-expanded={previewExpanded}
                aria-label={previewExpanded ? `Collapse ${sanitizedLabel} details` : `Expand ${sanitizedLabel} details`}
              >
                <span className="sr-only">{previewExpanded ? 'Collapse details' : 'Expand details'}</span>
                <PreviewToggle expanded={previewExpanded} />
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={onTogglePreview}
              className="min-w-0 inline text-left transition-colors hover:text-text-secondary focus-visible:outline-none focus-visible:text-text-secondary"
              aria-expanded={previewExpanded}
              aria-label={previewExpanded ? `Collapse ${sanitizedLabel} details` : `Expand ${sanitizedLabel} details`}
            >
              <span>{labelContent}</span>
              <PreviewToggle expanded={previewExpanded} />
            </button>
          )
        ) : (
          <span className="min-w-0">{labelContent}</span>
        )}
      </div>
      {inlineDetailHiddenByPreview ? null : sanitizedDetail && !hasRichContent ? (
        <div className={`chat-typo-exec-row-detail mt-0.5 whitespace-pre-wrap break-words text-text-secondary select-text ${nestedContentClass}`}>
          {detailRenderState.content}
        </div>
      ) : null}
      {showTaskCard ? (
        <div className={`mt-1 ${childContentWidthClass}`}>
          <div className={`group/task relative overflow-hidden ${isChildRow
            ? 'w-full rounded-lg rounded-tl-sm border border-surface-border/45 bg-surface-panel/20'
            : 'w-full rounded-lg border border-surface-border/55 bg-surface-panel-alt/45'}`}
          >
            <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover/task:opacity-100 group-focus-within/task:opacity-100">
              <CopyBlockButton
                iconOnly
                text={taskInstructionText}
                idleLabel="Copy task"
                copiedLabel="Task copied"
                failedLabel="Task copy failed"
                variant="ghost"
              />
            </div>
            <div className="px-3 py-2.5 pr-9">
              <AssistantRichContent
                text={taskInstructionText}
                keyPrefix={`stream-task:${row.id || sanitizedLabel}`}
                mode="agent-task"
                typographyRole={isChildRow ? 'agent-task' : ''}
                className="select-text"
              />
            </div>
          </div>
        </div>
      ) : null}
      <div className={`grid transition-all duration-300 ease-in-out ${previewPanelVisible ? `mt-1 ${nestedContentClass} grid-rows-[1fr]` : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          {showPlainPreview ? (
            <div className="max-h-72 overflow-y-auto rounded-md border border-surface-border/50 bg-surface-panel/30 p-1.5 pr-1 select-text">
              {sanitizedDetail ? (
                <div className="chat-typo-exec-row-detail whitespace-pre-wrap break-words text-text-secondary">
                  {detailRenderState.content}
                </div>
              ) : null}
              {sanitizedDetail && sanitizedPreviewLines.length > 0 ? (
                <div className="my-1.5 h-px bg-surface-border/60" />
              ) : null}
              {sanitizedPreviewLines.length > 0 ? (
                <div className="chat-typo-exec-row-preview whitespace-pre-wrap break-words font-mono text-text-tertiary">
                  {previewRenderState.content}
                </div>
              ) : null}
            </div>
          ) : null}
          {showRichPreview ? (
            <div className={childContentWidthClass}>
              <div className="max-h-[32rem] overflow-y-auto">
                <AssistantRichContent
                  text={richContentText}
                  keyPrefix={`stream:${row.id || sanitizedLabel}`}
                  mode="agent-result"
                  typographyRole={isChildRow ? 'agent-result' : ''}
                  className="select-text"
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
