import { mergeOpenAIAccountContextTelemetry } from './ai-provider-openai-account-telemetry.mjs'
import { trackAccountCompactionItem } from './ai-provider-openai-account-activity-state.mjs'

export function resolveAccountContextCompactionGeneration(requestContext = {}) {
  return Math.max(0, Number(
    requestContext?.openai?.accountContextCompactionGeneration
    ?? requestContext?.accountContextCompactionGeneration
    ?? 0,
  ) || 0)
}

export function tagAccountContextUsageTelemetry(telemetry, contextCompactionGeneration = 0) {
  return telemetry ? { ...telemetry, contextCompactionGeneration } : null
}

export function resolveEffectiveAccountContextTelemetry({
  turnContextTelemetry = null,
  latestThreadTokenUsageTelemetry = null,
  accountCompactionCompleted = false,
  contextCompactionGeneration = 0,
} = {}) {
  const merged = mergeOpenAIAccountContextTelemetry(
    turnContextTelemetry,
    latestThreadTokenUsageTelemetry,
  )
  const usageMatchesGeneration = Number(
    latestThreadTokenUsageTelemetry?.contextCompactionGeneration ?? -1,
  ) === contextCompactionGeneration
  if (!accountCompactionCompleted || usageMatchesGeneration) return merged
  return {
    inputLimitTokens: merged?.inputLimitTokens ?? null,
    remainingContextTokens: null,
    threadOccupancyTokens: null,
    threadCumulativeTotalTokens: merged?.threadCumulativeTotalTokens ?? null,
    providerUsageSemantics: 'openai_account_provider_context_recalculating',
  }
}

export function advanceAccountContextCompaction({
  state,
  item,
  completed = false,
  contextCompactionGeneration = 0,
  accountBridgeThreadId = '',
  accountBridgeTurnId = '',
} = {}) {
  const nextGeneration = contextCompactionGeneration + (completed ? 1 : 0)
  return {
    state: trackAccountCompactionItem(state, item, completed ? 'completed' : 'started'),
    contextCompactionGeneration: nextGeneration,
    event: {
      status: completed ? 'applied' : 'running',
      mode: 'automatic',
      reason: completed ? 'compacted' : 'automatic_compaction_requested',
      compactionId: String(item?.id || '').trim(),
      selectedCompactionMode: 'codex_thread_compaction',
      candidateCompactionModes: ['codex_thread_compaction', 'local_summary'],
      compactionEventType: 'codex_thread_compaction',
      compactionEventPhase: completed ? 'applied' : 'running',
      compactionEventOccurred: completed,
      strategy: 'codex_thread_compaction',
      scope: completed ? 'thread_reset' : '',
      compactionSource: 'provider',
      usageRefreshState: completed ? 'recalculating' : '',
      accountBridgeThreadId,
      accountBridgeTurnId,
      contextCompactionGeneration: nextGeneration,
    },
  }
}
