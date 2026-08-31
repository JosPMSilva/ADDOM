import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import AgentStreamReferenceGroup from '../agents/AgentStreamReferenceGroup.jsx'
import AssistantRichContent from './AssistantRichContent.jsx'
import ExecutionEvidenceDisclosure from './ExecutionEvidenceDisclosure.jsx'
import ExecutionToolRowLabel from './ExecutionToolRowLabel.jsx'
import { normalizeReasoningPreview } from './live-execution-reasoning-render.mjs'

function CanonicalCommentaryRow({ item = {}, collapseReasoning = false }) {
  const { t } = useTranslation('core')
  const [expanded, setExpanded] = useState(false)
  const label = normalizeReasoningPreview(String(item?.label || ''))
  if (!label.trim()) return null
  const isStage = item.kind === 'stage'
  const isReasoning = item.kind === 'reasoning'
  const panelId = item?.id
    ? `execution-thought-${String(item.id).replace(/[^a-z0-9_-]/gi, '-')}`
    : undefined

  if (!collapseReasoning || isStage || !isReasoning) {
    return (
      <div
        className={`min-h-7 px-2 py-1 text-text-secondary ${isStage ? 'italic text-text-tertiary' : ''}`}
        data-ui={`execution-${item.kind}`}
      >
        <AssistantRichContent
          text={label}
          keyPrefix={`canonical:${item.id || item.kind}`}
          mode="execution-stream"
          typographyRole="exec-reasoning"
          className="max-w-none"
        />
      </div>
    )
  }

  const thoughtVerb = t('executionStream.thought.verb', { defaultValue: 'Reasoned' })
  const thoughtIdentity = t('executionStream.thought.briefly', { defaultValue: 'briefly' })

  return (
    <div
      data-ui="execution-reasoning"
      data-execution-item-id={item?.id || undefined}
      data-thought-collapsed={expanded ? 'false' : 'true'}
    >
      <button
        type="button"
        className="group flex min-h-7 w-full items-center rounded-sm px-2 py-0.5 text-left outline-none transition-colors hover:bg-surface-panel/35 focus-visible:ring-1 focus-visible:ring-border-strong"
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-label={expanded
          ? t('executionStream.thought.hide', { defaultValue: 'Hide reasoning' })
          : t('executionStream.thought.show', { defaultValue: 'Show reasoning' })}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
          <ExecutionToolRowLabel verb={thoughtVerb} identity={thoughtIdentity} />
          <span className="text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true">
            {expanded ? '▾' : '▸'}
          </span>
        </span>
      </button>
      {expanded ? (
        <div id={panelId} className="ml-5 pb-2 pt-1 text-text-secondary" data-ui="execution-thought-detail">
          <AssistantRichContent
            text={label}
            keyPrefix={`canonical-thought:${item.id || item.kind}`}
            mode="execution-stream"
            typographyRole="exec-reasoning"
            className="max-w-none"
          />
        </div>
      ) : null}
    </div>
  )
}

function CanonicalClusterRow({ item = {} }) {
  const [expanded, setExpanded] = useState(false)
  const children = Array.isArray(item?.items) ? item.items : []
  const panelId = item?.id ? `execution-cluster-${String(item.id).replace(/[^a-z0-9_-]/gi, '-')}` : undefined
  return (
    <div data-ui="execution-cluster">
      <button
        type="button"
        className="group flex min-h-7 w-full items-center rounded-sm px-2 py-0.5 text-left outline-none transition-colors hover:bg-surface-panel/35 focus-visible:ring-1 focus-visible:ring-border-strong"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
          <span className="chat-typo-exec-row-label chat-typo-exec-row-verb min-w-0 truncate text-text-tertiary">{item.label}</span>
          <span className="text-text-tertiary" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        </span>
      </button>
      {expanded ? (
        <div id={panelId} className="space-y-0.5 pb-1">
          {children.map((child) => (
            <ExecutionEvidenceDisclosure key={child.id} item={child} nested />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function CanonicalExecutionStream({
  items = [],
  collapseReasoning = false,
} = {}) {
  return (
    <div className="space-y-1" data-ui="canonical-execution-stream">
      {items.map((item) => {
        if (item.kind === 'cluster') return <CanonicalClusterRow key={item.id} item={item} />
        if (item.kind === 'agents') return <AgentStreamReferenceGroup key={item.id} item={item} />
        if (item.kind === 'tool') return <ExecutionEvidenceDisclosure key={item.id} item={item} />
        return (
          <CanonicalCommentaryRow
            key={item.id}
            item={item}
            collapseReasoning={collapseReasoning}
          />
        )
      })}
    </div>
  )
}
