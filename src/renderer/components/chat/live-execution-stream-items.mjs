import { mergeReasoningChunks } from '../../store/chat/live-execution-store-reasoning.mjs'
import { normalizeReasoningPreview } from './live-execution-reasoning-render.mjs'
import {
  buildExecutionEvidenceSections,
  hasUsefulExecutionEvidence,
} from './execution-evidence-view-model.mjs'
import {
  formatExecutionToolLabel,
  resolveExecutionToolLabelParts,
  resolveShortToolIdentity,
  resolveToolStatusPresentation,
} from './live-execution-stream-labels.mjs'
import { projectExecutionStreamClusters } from './live-execution-stream-clusters.mjs'
import { stitchCrossToolCommentaryItems } from './live-execution-stream-commentary-stitch.mjs'
import { extractToolIdentityDetail } from '../../../common/chat/tool-identity.mjs'

function normalizeState(value = '') {
  return String(value || '').trim().toLowerCase()
}

function buildToolItem(session = {}) {
  const toolKind = String(session?.toolKind || 'tool').trim().toLowerCase()
  const state = normalizeState(session?.state || session?.status)
  const presentation = resolveToolStatusPresentation(state)
  const outputs = Array.isArray(session?.outputs) ? session.outputs : []
  const input = String(session?.inputDetail || '').trim()
    || extractToolIdentityDetail({
      detail: session?.detail,
      toolKind,
    })
  const result = String(session?.detail || '')
  const expandedEvidence = {
    input,
    outputs,
    result,
    startedAt: Number(session?.startedAt || 0) || 0,
    completedAt: Number(session?.completedAt || 0) || 0,
  }
  const evidenceSections = buildExecutionEvidenceSections({
    toolKind,
    evidence: expandedEvidence,
  })
  const identity = resolveShortToolIdentity(toolKind, input)
  const failedLike = ['failed', 'error', 'cancelled', 'canceled', 'interrupted'].includes(state)
  // Drop unnamed generic tool failures/orphans — they render as "Tool failed" noise.
  // Keep successful generic "Ran tool" rows for provider-parity fixtures.
  if (
    toolKind === 'tool'
    && failedLike
    && !identity
    && !hasUsefulExecutionEvidence(evidenceSections)
  ) {
    return null
  }
  // Also hide active unnamed generic placeholders ("Running tool…") with no evidence yet.
  if (
    toolKind === 'tool'
    && ['queued', 'active', 'running', 'pending'].includes(state)
    && !identity
    && !hasUsefulExecutionEvidence(evidenceSections)
  ) {
    return null
  }
  const labelParts = resolveExecutionToolLabelParts({
    toolKind,
    state,
    inputDetail: input,
  })
  return {
    id: `tool:${String(session?.id || '')}`,
    kind: 'tool',
    sessionId: String(session?.id || ''),
    toolKind,
    state,
    label: labelParts.label || formatExecutionToolLabel({
      toolKind,
      state,
      inputDetail: input,
    }),
    verb: labelParts.verb,
    identity: labelParts.identity,
    ...presentation,
    expandable: hasUsefulExecutionEvidence(evidenceSections),
    expandedEvidence,
    evidenceSections,
  }
}

function isExecutionAnswerCommentary(messageId = '', role = '') {
  const normalizedMessageId = String(messageId || '').trim()
  const normalizedRole = String(role || '').trim().toLowerCase()
  if (normalizedRole === 'stage') return false
  return normalizedMessageId.startsWith('execution_commentary:')
}

function shouldRenderReasoningStreamItem({ messageId = '', role = '', capabilityProfile = {} } = {}) {
  const normalizedRole = String(role || '').trim().toLowerCase()
  const normalizedMessageId = String(messageId || '').trim()
  if (normalizedRole === 'stage') {
    return capabilityProfile?.reasoning !== false || capabilityProfile?.commentary !== false
  }
  if (normalizedMessageId.startsWith('execution_reasoning:')) {
    return capabilityProfile?.reasoning !== false
  }
  if (isExecutionAnswerCommentary(normalizedMessageId, normalizedRole)) {
    return capabilityProfile?.commentary !== false
  }
  return capabilityProfile?.reasoning !== false
}

function buildReasoningItem(reasoning = {}, turn = {}) {
  const role = String(reasoning?.role || 'commentary').trim().toLowerCase()
  if (role === 'stage' && String(turn?.status || '').trim().toLowerCase() !== 'active') return null
  // Keep full provider text — do not strip mid-sentence sealed stubs.
  const rawDetail = String(reasoning?.detail || '')
  const detail = normalizeReasoningPreview(rawDetail)
  if (!detail.trim()) return null
  return {
    id: `reasoning:${String(reasoning?.id || '')}`,
    kind: role === 'stage' ? 'stage' : (role === 'reasoning' ? 'reasoning' : 'commentary'),
    label: detail,
    rawLabel: rawDetail,
    statusMark: '',
    accessibleStatus: '',
    expandable: false,
  }
}

function isCommentaryStreamFragment(text = '') {
  const value = String(text || '').trim()
  if (!value) return true
  if (value === '**' || value === '.**' || value === '**.') return true
  if (/^\*\*[\s\S]*\*\*$/.test(value)) return false
  if (value.length <= 12 && !/\s/.test(value)) return true
  if (/^\s+\S+$/.test(value) && value.length <= 12) return true
  return false
}

export function coalesceFragmentedCommentaryItems(items = []) {
  const next = []
  for (const item of items) {
    if (item?.kind !== 'commentary') {
      next.push(item)
      continue
    }
    const previous = next.at(-1)
    const shouldMerge = previous?.kind === 'commentary'
      && (isCommentaryStreamFragment(item.label) || isCommentaryStreamFragment(previous.label))
    if (shouldMerge) {
      previous.rawLabel = mergeReasoningChunks([
        String(previous.rawLabel ?? previous.label ?? ''),
        String(item.rawLabel ?? item.label ?? ''),
      ])
      previous.label = normalizeReasoningPreview(previous.rawLabel)
      continue
    }
    next.push({ ...item })
  }
  return next.map((item) => {
    if (!Object.prototype.hasOwnProperty.call(item || {}, 'rawLabel')) return item
    const renderItem = { ...item }
    delete renderItem.rawLabel
    return renderItem
  })
}

export function buildExecutionStreamItems(turn = {}, capabilityProfile = {}, options = {}) {
  const items = []
  const orderedItemIds = Array.isArray(turn?.itemOrder) ? turn.itemOrder : []
  for (const itemId of orderedItemIds) {
    if (itemId.startsWith('tool:')) {
      if (capabilityProfile?.tools === false) continue
      const sessionId = itemId.slice('tool:'.length)
      const session = turn?.sessionsById?.[sessionId]
      if (session) {
        const item = buildToolItem(session)
        if (item) items.push(item)
      }
      continue
    }
    if (!itemId.startsWith('reasoning:')) continue
    const messageId = itemId.slice('reasoning:'.length)
    const reasoning = turn?.reasoningById?.[messageId]
    if (!reasoning) continue
    const role = String(reasoning?.role || 'commentary').trim().toLowerCase()
    if (!shouldRenderReasoningStreamItem({ messageId, role, capabilityProfile })) continue
    const item = buildReasoningItem(reasoning, turn)
    if (item) items.push(item)
  }
  const coalesced = coalesceFragmentedCommentaryItems(items)
  const stitched = stitchCrossToolCommentaryItems(coalesced)
  // Cluster settled contiguous tools even while the turn is still live so the
  // stream can incrementally collapse completed work (active tools stay visible).
  const collapseSettled = options.collapseSettled !== false
  return projectExecutionStreamClusters(stitched, {
    threshold: Number(options.clusterThreshold || 3) || 3,
    collapseSettled,
  })
}
