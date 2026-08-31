import { buildCompactionUserFacingLines } from '../../../common/chat/compaction-diagnostics.mjs'
import { applyCompactionLifecycle } from '../../../common/chat/compaction-lifecycle.mjs'

function normalizeId(value = '') {
  return String(value || '').trim()
}

function resolveStoreState(useChatStore) {
  if (!useChatStore || typeof useChatStore.getState !== 'function') return null
  return useChatStore.getState()
}

function formatUsageIterations(iterations = []) {
  const rows = Array.isArray(iterations) ? iterations : []
  if (rows.length === 0) return ''
  return rows
    .map((iteration) => {
      const type = normalizeId(iteration?.type)
      if (!type) return ''
      const inputTokens = Number(iteration?.inputTokens || 0) || 0
      const outputTokens = Number(iteration?.outputTokens || 0) || 0
      return `${type}:${inputTokens}/${outputTokens}`
    })
    .filter(Boolean)
    .join(', ')
}

function resolveAnthropicCompactionActivityId(payload = {}) {
  const explicitId = normalizeId(payload?.activityId)
  if (explicitId) return explicitId
  const threadId = normalizeId(payload?.threadId)
  const turnId = normalizeId(payload?.turnId)
  const strategy = normalizeId(payload?.strategy || payload?.compactionStrategy || 'anthropic_context_management').toLowerCase()
  if (!threadId || !turnId || !strategy) return ''
  return `anthropic_compaction:${threadId}:${turnId}:${strategy}`
}

export function buildAnthropicCompactionEventActivity(payload = {}) {
  const appliedEdits = Array.isArray(payload?.contextManagementAppliedEdits)
    ? payload.contextManagementAppliedEdits.map((value) => normalizeId(value)).filter(Boolean)
    : []
  const usageIterations = formatUsageIterations(payload?.usageIterations)
  const status = normalizeId(payload?.status || 'applied').toLowerCase() || 'applied'

  return applyCompactionLifecycle({
    id: resolveAnthropicCompactionActivityId(payload),
    coalesce: true,
    type: 'info',
    threadId: normalizeId(payload?.threadId),
    turnId: normalizeId(payload?.turnId),
    status,
    eventKind: 'anthropic_compaction_event',
    providerId: 'anthropic',
    model: normalizeId(payload?.model),
    label: 'Anthropic context compaction applied',
    detail: [
      ...buildCompactionUserFacingLines(payload),
      payload?.contextManagementApplied === true ? 'context_management_applied: true' : '',
      appliedEdits.length > 0 ? `applied_edits: ${appliedEdits.join(', ')}` : '',
      Number(payload?.contextManagementCompactionThresholdTokens || 0) > 0
        ? `context_management_threshold_tokens: ${Number(payload.contextManagementCompactionThresholdTokens)}`
        : '',
      payload?.compactionSummaryDetected === true ? 'compaction_summary_detected: true' : '',
      usageIterations ? `usage_iterations: ${usageIterations}` : '',
    ].filter(Boolean).join('\n'),
    compactionMilestone: status === 'applied',
    compactionMilestoneTitle: status === 'applied' ? 'Context automatically compacted' : '',
    compactionMilestoneDetail: status === 'applied' ? 'Anthropic server-side compaction' : '',
    compactionMilestoneTone: status === 'applied' ? 'provider' : '',
  }, {
    strategy: 'anthropic_context_management',
    scope: 'partial_reduce',
    compactionSource: 'provider',
    ...payload,
  })
}

export function registerAnthropicEventBridgeHandlers({
  safeSub = () => () => {},
  chatApi = {},
  useChatStore,
} = {}) {
  const unAnthropicCompactionEvent = safeSub(chatApi.onAnthropicCompactionEvent, (payload = {}) => {
    const state = resolveStoreState(useChatStore)
    state?.pushToolActivity?.(buildAnthropicCompactionEventActivity(payload))
  }, 'onAnthropicCompactionEvent')

  return () => {
    unAnthropicCompactionEvent()
  }
}
