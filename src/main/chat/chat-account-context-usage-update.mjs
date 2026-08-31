import { reduceAccountContextUsageSnapshot } from '../../common/chat/account-context-usage-state.mjs'
import { emitUsageEvent } from './chat-turn-events.mjs'
import { resolveLatestPersistedContextUsage } from './chat-stream-precall-history-conditioning.mjs'

export function createAccountContextUsageUpdateHandler({
  activeThreadId,
  activeTurnId,
  providerId,
  modelContext,
  promptOccupancyEstimateTokens,
  promptOccupancyEstimateConfidence,
  promptOccupancyEstimateMethod,
  rollingUsage,
  round,
  buildChatUsagePayload,
  send,
  persistTimelineEvent,
  resolveLatestContextUsage = resolveLatestPersistedContextUsage,
} = {}) {
  return (telemetryPayload = {}) => {
    const usagePayload = buildChatUsagePayload({
      threadId: activeThreadId,
      turnId: activeTurnId,
      providerId,
      usage: telemetryPayload?.usage && typeof telemetryPayload.usage === 'object'
        ? telemetryPayload.usage
        : {},
      providerResponseMeta: {
        authMethod: 'account',
        transportMode: 'codex_app_server_chatgpt',
        inputLimitTokens: telemetryPayload?.inputLimitTokens ?? null,
        remainingContextTokens: telemetryPayload?.remainingContextTokens ?? null,
        threadOccupancyTokens: telemetryPayload?.threadOccupancyTokens ?? null,
        threadCumulativeTotalTokens: telemetryPayload?.threadCumulativeTotalTokens ?? null,
        providerUsageSemantics: telemetryPayload?.providerUsageSemantics || '',
        accountBridgeThreadId: telemetryPayload?.accountBridgeThreadId || '',
        accountBridgeTurnId: telemetryPayload?.accountBridgeTurnId || '',
        contextCompactionGeneration: telemetryPayload?.contextCompactionGeneration ?? 0,
      },
      modelContext,
      promptOccupancyEstimateTokens,
      promptOccupancyEstimateConfidence,
      promptOccupancyEstimateMethod,
      rollingUsage,
      round,
      authMethod: 'account',
      transportMode: 'codex_app_server_chatgpt',
    })
    const acceptedUsagePayload = reduceAccountContextUsageSnapshot(
      resolveLatestContextUsage(activeThreadId),
      usagePayload,
    )
    if (acceptedUsagePayload?.contextUsageAnomaly) {
      persistTimelineEvent('account_context_usage_anomaly', {
        role: 'system',
        content: 'Ignored an inconsistent OpenAI account context usage update.',
        meta: acceptedUsagePayload,
      })
    }
    emitUsageEvent({ usagePayload: acceptedUsagePayload, send, persistTimelineEvent })
  }
}
