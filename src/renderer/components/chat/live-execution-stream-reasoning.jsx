import React, { useEffect, useMemo, useState } from 'react'
import AssistantRichContent from './AssistantRichContent.jsx'
import { buildExecutionFileReferenceRenderState } from './chat-rich-content-renderer.jsx'
import { normalizeReasoningPreview } from './live-execution-reasoning-render.mjs'
import { isLocalOpenAIStreamedReasoningEvent } from './reasoning-delivery-mode.mjs'
import { buildReasoningDisplayState } from '../../store/chat/reasoning-stream-segmentation.mjs'

const REASONING_CONTINUATION_CONNECTORS = new Set([
  'a',
  'an',
  'and',
  'for',
  'from',
  'in',
  'including',
  'into',
  'of',
  'on',
  'or',
  'per',
  'plus',
  'the',
  'to',
  'using',
  'via',
  'with',
  'without',
])

const LEADING_REASONING_TITLE_PATTERN = /^\*\*([^*\n][^*\n]{0,160}?)\*\*(?:(?:\r?\n){2,}|$)/
const EXECUTION_FILE_REFERENCE_CLASS_NAME = 'text-accent-soft underline decoration-accent-muted underline-offset-2 hover:text-text-primary'

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
      className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function shouldPreserveMidWordReasoningJoin(left = '', right = '') {
  const leftText = String(left || '')
  const rightText = String(right || '')
  if (!leftText || !rightText) return false
  return /[A-Za-z0-9]$/.test(leftText) && /^[a-z0-9]/.test(rightText.trimStart())
}

function mergeReasoningDetails(events = [], { startsWithHeading = false } = {}) {
  const parts = (Array.isArray(events) ? events : []).map((event) => String(event?.detail || '')).filter((detail) => detail.trim().length > 0)
  if (parts.length === 0) return ''
  let merged = parts[0]
  for (const part of parts.slice(1)) {
    const trimmedPart = part.trimStart()
    if (trimmedPart.startsWith('```') || trimmedPart.startsWith('**')) {
      merged += `\n\n${trimmedPart}`
      continue
    }
    merged += part
  }
  if (!startsWithHeading || parts.length === 1) return merged
  const rest = merged.slice(parts[0].length)
  // Titled first events often already include body text; do not force a paragraph
  // break that splits mid-word continuations ("scaff" + "olding.").
  if (shouldPreserveMidWordReasoningJoin(parts[0], rest)) return merged
  return `${parts[0].trim()}\n\n${rest.trimStart()}`.trim()
}

function startsWithReasoningTitle(detail = '') {
  const normalized = normalizeReasoningPreview(detail)
  if (!normalized) return false
  return LEADING_REASONING_TITLE_PATTERN.test(normalized.trimStart())
}

function resolveReasoningModelHint(events = []) {
  for (let index = (Array.isArray(events) ? events.length : 0) - 1; index >= 0; index -= 1) {
    const event = events[index]
    const hint = String(event?.reasoningMeta?.model || event?.reasoningMeta?.modelId || event?.model || '').trim().toLowerCase()
    if (hint) return hint
  }
  return ''
}

function isCodexReasoningMilestone(detail = '', modelHint = '') {
  const normalizedDetail = normalizeReasoningPreview(detail)
  const normalizedModelHint = String(modelHint || '').trim().toLowerCase()
  if (!normalizedDetail || !normalizedModelHint.includes('codex')) return false
  if (normalizedDetail.includes('\n')) return false
  if (normalizedDetail.length > 120) return false
  if (/^(#{1,6}\s|[*-]\s|\d+\.\s|```|>\s)/.test(normalizedDetail)) return false
  return true
}

function classifyReasoningDisplayKind({ mergedDetail = '', modelHint = '' } = {}) {
  const normalizedDetail = normalizeReasoningPreview(mergedDetail)
  if (!normalizedDetail) {
    return { reasoningDisplayKind: 'narrative_block', normalizedDetail: '', milestoneLabel: '' }
  }
  if (isCodexReasoningMilestone(normalizedDetail, modelHint)) {
    return {
      reasoningDisplayKind: 'milestone_step',
      normalizedDetail,
      milestoneLabel: normalizedDetail,
    }
  }
  return { reasoningDisplayKind: 'narrative_block', normalizedDetail, milestoneLabel: '' }
}

function buildReasoningDisplayItem(event = {}, { modelHint = '' } = {}) {
  const detail = String(event?.detail || '')
  const explicitDisplayState = (
    Object.prototype.hasOwnProperty.call(event || {}, 'stableDetail')
    || Object.prototype.hasOwnProperty.call(event || {}, 'pendingTail')
    || Object.prototype.hasOwnProperty.call(event || {}, 'hasPendingTail')
  )
    ? {
      stableDetail: String(event?.stableDetail || ''),
      pendingTail: String(event?.pendingTail || ''),
      hasPendingTail: event?.hasPendingTail === true,
    }
    : buildReasoningDisplayState(detail, {
      terminal: String(event?.status || '').trim().toLowerCase() !== 'active',
    })
  const hasPendingTail = explicitDisplayState.hasPendingTail === true
  const stableDetail = String(explicitDisplayState.stableDetail || '')
  const narrativeDetail = stableDetail || detail
  const classification = hasPendingTail
    ? {
      reasoningDisplayKind: 'narrative_block',
      normalizedDetail: normalizeReasoningPreview(narrativeDetail),
      milestoneLabel: '',
    }
    : classifyReasoningDisplayKind({ mergedDetail: detail, modelHint })
  if (!classification.normalizedDetail) return null
  return {
    type: 'reasoning_item',
    id: String(event?.id || '').trim(),
    event,
    stableDetail,
    pendingTail: String(explicitDisplayState.pendingTail || ''),
    hasPendingTail,
    startsWithHeading: startsWithReasoningTitle(event?.detail || ''),
    ...classification,
  }
}

function finalizeReasoningGroup(group = null, { modelHint = '' } = {}) {
  if (!group || !Array.isArray(group.events) || group.events.length === 0) return null
  const mergedDetail = mergeReasoningDetails(group.events, { startsWithHeading: group.startsWithHeading === true })
  const latestEvent = group.events[group.events.length - 1] || null
  const displayState = buildReasoningDisplayState(mergedDetail, {
    terminal: String(latestEvent?.status || '').trim().toLowerCase() !== 'active',
  })
  const classification = displayState.hasPendingTail
    ? {
      reasoningDisplayKind: 'narrative_block',
      normalizedDetail: normalizeReasoningPreview(displayState.stableDetail || mergedDetail),
      milestoneLabel: '',
    }
    : classifyReasoningDisplayKind({ mergedDetail, modelHint })
  if (!classification.normalizedDetail) return null
  return {
    type: 'reasoning_group',
    id: String(group.events[0]?.id || '').trim(),
    event: latestEvent,
    events: group.events,
    startsWithHeading: group.startsWithHeading === true,
    mergedDetail,
    stableDetail: displayState.stableDetail,
    pendingTail: displayState.pendingTail,
    hasPendingTail: displayState.hasPendingTail,
    ...classification,
  }
}

function getReasoningItemEvents(item = null) {
  if (Array.isArray(item?.events) && item.events.length > 0) return item.events
  if (item?.event) return [item.event]
  return []
}

function resolveReasoningGroupingContext(events = []) {
  const reasoningEvents = (Array.isArray(events) ? events : []).filter((event) => String(event?.kind || '').trim() === 'reasoning')
  return {
    localOpenAIStreamed: reasoningEvents.some((event) => isLocalOpenAIStreamedReasoningEvent(event)),
  }
}

function normalizeReasoningItemDetail(item = null) {
  return normalizeReasoningPreview(String(item?.mergedDetail || item?.event?.detail || ''))
}

function isExecutionCommentaryReasoningItem(item = null) {
  return getReasoningItemEvents(item).some((event) => String(event?.messageId || '').trim().startsWith('execution_commentary:'))
}

function previousReasoningDetailEndsWithConnector(detail = '') {
  const text = String(detail || '').trimEnd()
  if (!text) return false
  if (/[(/[-]\s*$/.test(text)) return true
  const match = text.match(/([A-Za-z][A-Za-z0-9/-]*)\s*$/)
  if (!match?.[1]) return false
  return REASONING_CONTINUATION_CONNECTORS.has(String(match[1] || '').toLowerCase())
}

function isPunctuationOnlyReasoningFragment(detail = '') {
  return /^[.?!,:;)\]}]+$/.test(String(detail || '').trim())
}

function looksLikeShortNarrativeLead(detail = '') {
  const text = String(detail || '').trim()
  if (!text || text.includes('\n')) return false
  if (text.length > 80) return false
  if (/[.!?…:;)\]}]["'`]*\s*$/.test(text)) return false
  if (/^(#{1,6}\s|[*-]\s|\d+\.\s|```|>\s)/.test(text)) return false
  return true
}

function looksLikeSentenceStyleContinuation(detail = '') {
  const text = String(detail || '').trim()
  if (!text) return false
  if (isPunctuationOnlyReasoningFragment(text)) return true
  if (/^(#{1,6}\s|[*-]\s|\d+\.\s|```|>\s)/.test(text)) return false
  if (!/^[A-Z0-9"'(]/.test(text)) return false
  if (!/[a-z]/.test(text)) return false
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length < 2) return false
  const titleCaseWordCount = words.filter((word) => /^[A-Z][a-z0-9/-]*$/.test(word)).length
  return titleCaseWordCount < words.length
}

function isLocalOpenAIReasoningContinuation(previousItem = null, nextItem = null, groupingContext = {}) {
  if (!groupingContext?.localOpenAIStreamed) return false
  if (isExecutionCommentaryReasoningItem(previousItem) || isExecutionCommentaryReasoningItem(nextItem)) return false

  const previousDetail = normalizeReasoningItemDetail(previousItem).trimEnd()
  const nextTrimmed = normalizeReasoningItemDetail(nextItem).trimStart()
  if (!previousDetail || !nextTrimmed) return false
  if (/^(#{1,6}\s|[*-]\s|\d+\.\s|```|>\s)/.test(nextTrimmed)) return false
  if (isPunctuationOnlyReasoningFragment(nextTrimmed)) return true
  return looksLikeShortNarrativeLead(previousDetail) && looksLikeSentenceStyleContinuation(nextTrimmed)
}

function isNarrativeContinuationReasoningItem(previousItem = null, nextItem = null, { groupingContext = {} } = {}) {
  if (!previousItem || !nextItem) return false
  if (previousItem.type === 'reasoning_archive' || nextItem.type === 'reasoning_archive') return false
  if (previousItem.reasoningDisplayKind !== 'narrative_block' || nextItem.reasoningDisplayKind !== 'narrative_block') return false
  if (nextItem.startsWithHeading === true) return false

  const previousDetail = String(previousItem?.mergedDetail || previousItem?.event?.detail || '').trimEnd()
  const nextDetail = String(nextItem?.mergedDetail || nextItem?.event?.detail || '')
  const nextTrimmed = nextDetail.trimStart()
  if (!previousDetail || !nextTrimmed) return false
  if (/[.!?…:;)\]}]["'`]*\s*$/.test(previousDetail)) return false
  if (/^(#{1,6}\s|[*-]\s|\d+\.\s|```|>\s)/.test(nextTrimmed)) return false
  if (/^[a-z0-9(]/.test(nextTrimmed)) return true
  if (previousReasoningDetailEndsWithConnector(previousDetail) && /^[A-Z0-9]/.test(nextTrimmed)) return true
  return isLocalOpenAIReasoningContinuation(previousItem, nextItem, groupingContext)
}

function mergeAdjacentReasoningItems(items = [], { modelHint = '', groupingContext = {} } = {}) {
  const mergedItems = []

  for (const item of Array.isArray(items) ? items : []) {
    const previousItem = mergedItems[mergedItems.length - 1] || null
    if (!isNarrativeContinuationReasoningItem(previousItem, item, { groupingContext })) {
      mergedItems.push(item)
      continue
    }

    const nextItem = finalizeReasoningGroup({
      events: [
        ...getReasoningItemEvents(previousItem),
        ...getReasoningItemEvents(item),
      ],
      startsWithHeading: previousItem?.startsWithHeading === true,
    }, { modelHint })

    if (!nextItem) {
      mergedItems.push(item)
      continue
    }

    mergedItems[mergedItems.length - 1] = nextItem
  }

  return mergedItems
}

function isProviderCompactionMilestoneEvent(event = {}) {
  const activity = event?.activity && typeof event.activity === 'object' ? event.activity : {}
  return activity?.compactionMilestone === true
    && String(activity?.compactionMilestoneTone || '').trim().toLowerCase() === 'provider'
}

export function buildRenderItems(events = []) {
  const items = []
  const modelHint = resolveReasoningModelHint(events)
  const groupingContext = resolveReasoningGroupingContext(events)
  let openReasoningGroup = null
  let bufferedBoundaryEvents = []
  const flushReasoningGroup = () => {
    if (!openReasoningGroup) return
    const nextItem = finalizeReasoningGroup(openReasoningGroup, { modelHint })
    if (nextItem) items.push(nextItem)
    if (bufferedBoundaryEvents.length > 0) {
      for (const event of bufferedBoundaryEvents) {
        items.push({ type: 'event', event })
      }
      bufferedBoundaryEvents = []
    }
    openReasoningGroup = null
  }

  for (const event of Array.isArray(events) ? events : []) {
    const eventKind = String(event?.kind || '').trim()
    if (eventKind !== 'reasoning') {
      if (openReasoningGroup && isProviderCompactionMilestoneEvent(event)) {
        bufferedBoundaryEvents.push(event)
        continue
      }
      flushReasoningGroup()
      items.push({ type: 'event', event })
      continue
    }
    if (event?.archived === true) {
      flushReasoningGroup()
      const archiveBlocks = Array.isArray(event?.blocks) && event.blocks.length > 0 ? event.blocks : [{ ...event, archived: false }]
      const archiveItems = archiveBlocks.map((block) => buildReasoningDisplayItem(block, { modelHint })).filter(Boolean)
      if (archiveItems.length > 0) {
        items.push({ type: 'reasoning_archive', id: String(event?.id || '').trim(), event, archiveItems })
      }
      continue
    }
    if (event?.reasoningBlock === true || Array.isArray(event?.reasoningChunks)) {
      flushReasoningGroup()
      const reasoningItem = buildReasoningDisplayItem(event, { modelHint })
      if (reasoningItem) items.push(reasoningItem)
      continue
    }
    const startsWithHeading = startsWithReasoningTitle(event?.detail || '')
    if (openReasoningGroup && startsWithHeading) {
      flushReasoningGroup()
    }
    if (openReasoningGroup) {
      openReasoningGroup.events.push(event)
      continue
    }
    openReasoningGroup = { events: [event], startsWithHeading }
  }
  flushReasoningGroup()
  return mergeAdjacentReasoningItems(items, { modelHint, groupingContext })
}

function ReasoningRow({
  detail = '',
  stableDetail = '',
  pendingTail = '',
  hasPendingTail = false,
  showCursor = false,
  keyPrefix = 'reasoning',
}) {
  const normalizedStableDetail = normalizeReasoningPreview(stableDetail || (hasPendingTail ? '' : detail))
  const normalizedPendingTail = normalizeReasoningPreview(pendingTail || '')
  const normalizedDetail = normalizeReasoningPreview(detail)

  if (!normalizedStableDetail && !normalizedPendingTail && !normalizedDetail) return null

  return (
    <div
      className="py-1"
      data-chat-render="reasoning-rail"
      data-reasoning-live={showCursor ? 'true' : 'false'}
    >
      <div className="max-w-[76ch]">
        <div className="max-w-none">
          {hasPendingTail ? (
            <>
              {normalizedStableDetail
                ? (
                  <AssistantRichContent
                    text={normalizedStableDetail}
                    keyPrefix={`${keyPrefix}:stable`}
                    mode="execution-stream"
                    typographyRole="exec-reasoning"
                    className="max-w-none select-text"
                  />
                )
                : null}
              {normalizedPendingTail ? (
                <p
                  data-chat-render="reasoning-pending-tail"
                  className="mb-0 whitespace-pre-wrap break-words text-text-secondary"
                >
                  {normalizedPendingTail}
                </p>
              ) : null}
            </>
          ) : (
            <AssistantRichContent
              text={normalizedDetail}
              keyPrefix={keyPrefix}
              mode="execution-stream"
              typographyRole="exec-reasoning"
              className="max-w-none select-text"
            />
          )}
        </div>
      </div>
    </div>
  )
}

function CompletedReasoningRow({ detail = '' }) {
  const [expanded, setExpanded] = useState(false)
  const paragraphs = useMemo(
    () => String(detail || '').split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean),
    [detail],
  )
  const shouldCollapse = paragraphs.length >= 4 && String(detail || '').length >= 280
  const previewText = useMemo(
    () => paragraphs.slice(0, Math.max(1, Math.min(4, paragraphs.length - 1))).join('\n\n'),
    [paragraphs],
  )

  if (!shouldCollapse) {
    return <ReasoningRow detail={detail} keyPrefix="reasoning:completed" />
  }

  return (
    <div className="py-1" data-chat-render="reasoning-collapsed">
      <div className="max-w-[76ch] space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="chat-typo-exec-reasoning-milestone whitespace-pre-wrap break-words font-medium text-text-primary">
            Reasoning
          </div>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="chat-typo-exec-reasoning-toggle inline-flex items-center gap-1 rounded-md border border-surface-border/70 bg-surface-panel/35 px-2.5 py-1 text-text-secondary transition-colors hover:border-surface-border hover:text-text-primary"
            aria-expanded={expanded}
          >
            <ChevronIcon open={expanded} />
            <span>{expanded ? 'Hide reasoning' : 'Show reasoning'}</span>
          </button>
        </div>
        <div className="max-w-none">
          {expanded
            ? (
              <AssistantRichContent
                text={detail}
                keyPrefix="reasoning:expanded"
                mode="execution-stream"
                typographyRole="exec-reasoning"
                className="max-w-none select-text"
              />
            )
            : (
              <AssistantRichContent
                text={previewText}
                keyPrefix="reasoning:preview"
                mode="execution-stream"
                typographyRole="exec-reasoning"
                className="max-w-none select-text"
              />
            )}
        </div>
      </div>
    </div>
  )
}

function ReasoningMilestoneRow({ label = '', showCursor = false }) {
  const text = String(label || '').trim()
  if (!text) return null
  const labelRenderState = buildExecutionFileReferenceRenderState(text, {
    keyPrefix: `reasoning-milestone:${text}`,
    className: EXECUTION_FILE_REFERENCE_CLASS_NAME,
  })
  return (
    <div className="py-0.5 group relative" data-chat-render="reasoning-milestone">
      <div className="absolute left-[-11px] top-3 h-1.5 w-1.5 rounded-full bg-accent-soft opacity-65 group-last:hidden" />
      <div className="chat-typo-exec-reasoning-milestone whitespace-pre-wrap break-words font-medium text-text-primary select-text">
        {labelRenderState.content}
        {showCursor ? <span className="ml-1 inline-block h-4 w-1 rounded-sm bg-accent-soft align-middle thinking-cursor-strong opacity-80" /> : null}
      </div>
    </div>
  )
}

export function ReasoningDisplayRow({ item = null, showCursor = false, isLiveTurn = false }) {
  if (!item?.event || !item?.normalizedDetail) return null
  if (item.reasoningDisplayKind === 'milestone_step') {
    return <ReasoningMilestoneRow label={item.milestoneLabel} showCursor={showCursor} />
  }
  if (item.hasPendingTail) {
    return (
      <ReasoningRow
        detail={String(item?.event?.detail || '')}
        stableDetail={item.stableDetail}
        pendingTail={item.pendingTail}
        hasPendingTail
        showCursor={showCursor}
        keyPrefix={String(item?.event?.id || 'reasoning')}
      />
    )
  }
  if (!showCursor && !isLiveTurn) {
    return <CompletedReasoningRow detail={item.normalizedDetail} />
  }
  return (
    <ReasoningRow
      detail={item.normalizedDetail}
      showCursor={showCursor}
      keyPrefix={String(item?.event?.id || 'reasoning')}
    />
  )
}

export function ReasoningArchiveRow({ event = {}, archiveItems = [] }) {
  const [expanded, setExpanded] = useState(false)
  const archiveSummary = String(event?.summary || '').trim() || 'Earlier reasoning collapsed'

  useEffect(() => {
    setExpanded(false)
  }, [event?.id])

  if (!Array.isArray(archiveItems) || archiveItems.length <= 0) return null

  return (
    <div className="py-1 group relative">
      <div className="absolute left-[-11px] top-5 h-1.5 w-1.5 rounded-full bg-accent-soft opacity-65 group-last:hidden" />
      <div className="w-full max-w-[84ch] overflow-hidden rounded-lg border border-surface-border/55 bg-surface-panel/35 px-4 py-3.5">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="chat-typo-exec-reasoning-toggle inline-flex items-center gap-1 rounded-md border border-surface-border/70 bg-surface-panel/35 px-2.5 py-1 text-text-secondary transition-colors hover:border-surface-border hover:text-text-primary"
          aria-expanded={expanded}
          aria-label={expanded ? 'Hide earlier reasoning' : 'Show earlier reasoning'}
        >
          <ChevronIcon open={expanded} />
          <span>{archiveSummary}</span>
        </button>
        {expanded ? (
          <div className="mt-3 space-y-2.5">
            {archiveItems.map((item) => (
              <ReasoningDisplayRow
                key={item.id || String(item?.event?.id || '')}
                item={item}
                isLiveTurn={false}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
