import { buildCompactionUserFacingLines } from '../../../common/chat/compaction-diagnostics.mjs'
import {
  buildOpenAICompactionEventActivity,
} from '../../components/chat/chat-event-bridge-openai.mjs'
import {
  buildAnthropicCompactionEventActivity,
} from '../../components/chat/chat-event-bridge-anthropic.mjs'

function isCodexThreadCompaction(meta = {}) {
  return String(meta?.selectedCompactionMode || '').trim().toLowerCase() === 'codex_thread_compaction'
    || String(meta?.compactionEventType || '').trim().toLowerCase() === 'codex_thread_compaction'
}

export function hydrateProviderTimelineActivity({
  kind = '',
  activity = {},
  meta = {},
  content = '',
} = {}) {
  const nextActivity = activity && typeof activity === 'object' ? { ...activity } : {}

  if (kind === 'openai_continuity_status') {
    nextActivity.type = 'info'
    const responseId = String(meta.responseId || '').trim()
    const serviceTier = String(meta.serviceTier || '').trim()
    const accountDelegationBackend = String(meta.accountDelegationBackend || '').trim().toLowerCase()
    const accountCollaborationModeId = String(meta.accountCollaborationModeId || '').trim()
    const reconnectAttempt = Number(meta.websocketReconnectAttempt || 0) || 0
    const reconnectMaxAttempts = Number(meta.websocketReconnectMaxAttempts || 0) || 0
    const reconnectReason = String(meta.websocketReconnectReason || '').trim()
    const websocketRecovered = meta.websocketRecovered === true
    const websocketFallbackAfterReconnectExhausted = meta.websocketFallbackAfterReconnectExhausted === true
    const websocketBypassReason = String(meta.websocketBypassReason || '').trim()
    const websocketStoredResponseRecoveryAttempted = meta.websocketStoredResponseRecoveryAttempted === true
    const websocketRecoveredFromStoredResponse = meta.websocketRecoveredFromStoredResponse === true
    const transportMode = String(meta.transportMode || '').trim()
    const configuredTransportMode = String(meta.configuredTransportMode || '').trim()
    const transportSelectionReason = String(meta.transportSelectionReason || '').trim()
    const websocketReuseMode = String(meta.websocketReuseMode || '').trim()
    nextActivity.label = responseId
      ? 'OpenAI response state tracked'
      : 'OpenAI response state unavailable'
    nextActivity.detail = [
      responseId ? `response_id: ${responseId}` : '',
      meta.conversationId ? `conversation_id: ${String(meta.conversationId)}` : '',
      meta.model ? `model: ${String(meta.model)}` : '',
      meta.status ? `status: ${String(meta.status)}` : '',
      meta.continuityMode ? `continuity_mode: ${String(meta.continuityMode)}` : '',
      transportMode ? `transport_mode: ${transportMode}` : '',
      configuredTransportMode ? `configured_transport_mode: ${configuredTransportMode}` : '',
      transportSelectionReason ? `transport_selection_reason: ${transportSelectionReason}` : '',
      accountDelegationBackend ? `delegation_backend: ${accountDelegationBackend}` : '',
      accountCollaborationModeId ? `native_collaboration_mode: ${accountCollaborationModeId}` : '',
      websocketReuseMode ? `websocket_reuse_mode: ${websocketReuseMode}` : '',
      typeof meta.websocketPooledConnection === 'boolean'
        ? `websocket_pooled_connection: ${meta.websocketPooledConnection ? 'true' : 'false'}`
        : '',
      typeof meta.websocketReusedConnection === 'boolean'
        ? `websocket_reused_connection: ${meta.websocketReusedConnection ? 'true' : 'false'}`
        : '',
      reconnectAttempt > 0 ? `websocket_reconnect_attempt: ${reconnectAttempt}` : '',
      reconnectMaxAttempts > 0 ? `websocket_reconnect_max_attempts: ${reconnectMaxAttempts}` : '',
      reconnectReason ? `websocket_reconnect_reason: ${reconnectReason}` : '',
      websocketRecovered ? 'websocket_recovered: true' : '',
      websocketFallbackAfterReconnectExhausted ? 'websocket_fallback_after_reconnect_exhausted: true' : '',
      websocketBypassReason ? `websocket_bypass_reason: ${websocketBypassReason}` : '',
      websocketStoredResponseRecoveryAttempted ? 'websocket_stored_response_recovery_attempted: true' : '',
      websocketRecoveredFromStoredResponse ? 'websocket_recovered_from_stored_response: true' : '',
      typeof meta.promptCachingEnabled === 'boolean'
        ? `prompt_caching_enabled: ${meta.promptCachingEnabled ? 'true' : 'false'}`
        : '',
      meta.compactionStrategy ? `compaction_strategy: ${String(meta.compactionStrategy)}` : '',
      ...buildCompactionUserFacingLines(meta),
      typeof meta.serverSideCompactionEnabled === 'boolean'
        ? `server_side_compaction_enabled: ${meta.serverSideCompactionEnabled ? 'true' : 'false'}`
        : '',
      Number(meta.serverSideCompactionThresholdTokens || 0) > 0
        ? `server_side_threshold_tokens: ${Number(meta.serverSideCompactionThresholdTokens)}`
        : '',
      meta.background === true ? 'background: true' : '',
      serviceTier ? `service_tier: ${serviceTier}` : '',
      Number(meta.cachedTokens || 0) > 0 ? `cached_tokens: ${Number(meta.cachedTokens)}` : '',
    ].filter(Boolean).join('\n')
    return nextActivity
  }

  if (kind === 'openai_websocket_reconnect') {
    const status = String(meta.status || content || '').trim().toLowerCase()
    const attempt = Number(meta.attempt || 0) || 0
    const maxAttempts = Number(meta.maxAttempts || 0) || 0
    const reason = String(meta.reason || '').trim()
    const waitMs = Number(meta.waitMs || 0) || 0
    nextActivity.type = (
      status === 'fallback'
      || status === 'exhausted'
      || status === 'stored_response_recovery_failed'
    )
      ? 'warning'
      : 'info'
    if (status === 'reconnecting') {
      nextActivity.label = `Reconnecting... ${attempt}/${maxAttempts || attempt || 1}`
    } else if (status === 'recovering_stored_response') {
      nextActivity.label = 'Recovering the final response from stored state'
    } else if (status === 'recovered_stored_response') {
      nextActivity.label = 'Recovered the final response from stored state'
    } else if (status === 'stored_response_recovery_failed') {
      nextActivity.label = 'Stored-response recovery failed'
    } else if (status === 'bypassed') {
      nextActivity.label = 'Using the standard OpenAI transport for this turn'
    } else if (status === 'recovered') {
      nextActivity.label = `Reconnected after retry ${attempt}/${maxAttempts || attempt || 1}`
    } else if (status === 'fallback') {
      nextActivity.label = 'Falling back to the standard OpenAI stream'
    } else if (status === 'exhausted') {
      nextActivity.label = `Reconnect exhausted (${attempt}/${maxAttempts || attempt || 1})`
    } else if (status === 'cancelled') {
      nextActivity.label = `Reconnect cancelled (${attempt}/${maxAttempts || attempt || 1})`
    } else {
      nextActivity.label = 'OpenAI WebSocket transport update'
    }
    nextActivity.detail = [
      status ? `status: ${status}` : '',
      reason ? `reason: ${reason}` : '',
      meta.responseId ? `response_id: ${String(meta.responseId)}` : '',
      waitMs > 0 ? `wait_ms: ${waitMs}` : '',
    ].filter(Boolean).join('\n')
    return nextActivity
  }

  if (kind === 'openai_manual_compaction_requested') {
    nextActivity.type = 'info'
    nextActivity.label = 'OpenAI manual compaction requested'
    nextActivity.detail = [
      meta.providerId ? `provider: ${String(meta.providerId)}` : '',
      meta.model ? `model: ${String(meta.model)}` : '',
      ...buildCompactionUserFacingLines(meta),
      meta.reason ? `reason: ${String(meta.reason)}` : '',
    ].filter(Boolean).join('\n')
    return nextActivity
  }

  if (kind === 'openai_manual_compaction_running') {
    nextActivity.type = 'info'
    nextActivity.label = 'OpenAI manual compaction running'
    nextActivity.detail = [
      meta.providerId ? `provider: ${String(meta.providerId)}` : '',
      meta.model ? `model: ${String(meta.model)}` : '',
      ...buildCompactionUserFacingLines(meta),
      meta.reason ? `reason: ${String(meta.reason)}` : '',
    ].filter(Boolean).join('\n')
    return nextActivity
  }

  if (kind === 'openai_manual_compaction_applied') {
    nextActivity.type = 'info'
    nextActivity.label = 'OpenAI manual compaction applied'
    nextActivity.detail = [
      meta.providerId ? `provider: ${String(meta.providerId)}` : '',
      meta.model ? `model: ${String(meta.model)}` : '',
      ...buildCompactionUserFacingLines(meta),
      meta.reason ? `reason: ${String(meta.reason)}` : '',
    ].filter(Boolean).join('\n')
    nextActivity.compactionMilestone = true
    nextActivity.compactionMilestoneTitle = 'Context compacted before the next turn'
    nextActivity.compactionMilestoneDetail = [
      isCodexThreadCompaction(meta)
        ? 'Codex account thread compaction'
        : 'OpenAI manual server-side compaction',
    ].filter(Boolean).join(' | ')
    nextActivity.compactionMilestoneTone = 'provider'
    return nextActivity
  }

  if (kind === 'openai_manual_compaction_failed') {
    nextActivity.type = 'warning'
    nextActivity.isError = false
    nextActivity.label = 'OpenAI manual compaction failed'
    nextActivity.detail = [
      meta.providerId ? `provider: ${String(meta.providerId)}` : '',
      meta.model ? `model: ${String(meta.model)}` : '',
      ...buildCompactionUserFacingLines(meta),
      meta.reason ? `reason: ${String(meta.reason)}` : '',
    ].filter(Boolean).join('\n')
    return nextActivity
  }

  if (kind === 'openai_compaction_event') {
    return {
      ...nextActivity,
      ...buildOpenAICompactionEventActivity(meta),
      isError: false,
    }
  }

  if (kind === 'openai_manual_compaction_notice' || kind === 'anthropic_compaction_notice') {
    const providerLabel = String(meta.providerId || '').trim().toLowerCase() === 'anthropic'
      ? 'Anthropic compaction notice'
      : 'OpenAI manual compaction notice'
    nextActivity.type = String(meta.type || '').trim().toLowerCase() === 'warning' ? 'warning' : 'info'
    nextActivity.label = providerLabel
    nextActivity.detail = [
      content ? `message: ${String(content)}` : '',
      ...buildCompactionUserFacingLines(meta),
      meta.reason ? `reason: ${String(meta.reason)}` : '',
      meta.providerId ? `provider: ${String(meta.providerId)}` : '',
      meta.model ? `model: ${String(meta.model)}` : '',
    ].filter(Boolean).join('\n')
    return nextActivity
  }

  if (kind === 'anthropic_compaction_event') {
    return {
      ...nextActivity,
      ...buildAnthropicCompactionEventActivity(meta),
      isError: false,
    }
  }

  if (kind === 'background_response_queued') {
    nextActivity.type = 'info'
    nextActivity.label = 'OpenAI background response queued'
    nextActivity.detail = [
      meta.jobId ? `job_id: ${String(meta.jobId)}` : '',
      meta.responseId ? `response_id: ${String(meta.responseId)}` : '',
      meta.model ? `model: ${String(meta.model)}` : '',
    ].filter(Boolean).join('\n')
    return nextActivity
  }

  if (kind === 'background_response_completed') {
    nextActivity.type = 'info'
    nextActivity.label = 'OpenAI background response completed'
    nextActivity.detail = [
      meta.jobId ? `job_id: ${String(meta.jobId)}` : '',
      meta.responseId ? `response_id: ${String(meta.responseId)}` : '',
      meta.model ? `model: ${String(meta.model)}` : '',
      Number(meta.totalTokens || 0) > 0 ? `total_tokens: ${Number(meta.totalTokens)}` : '',
    ].filter(Boolean).join('\n')
    return nextActivity
  }

  if (kind === 'background_response_failed') {
    nextActivity.type = 'result'
    nextActivity.isError = true
    nextActivity.label = 'OpenAI background response failed'
    nextActivity.detail = [
      meta.jobId ? `job_id: ${String(meta.jobId)}` : '',
      meta.responseId ? `response_id: ${String(meta.responseId)}` : '',
      content ? `message: ${String(content)}` : '',
    ].filter(Boolean).join('\n')
    return nextActivity
  }

  return null
}
