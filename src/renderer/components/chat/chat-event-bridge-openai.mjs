import { buildCompactionUserFacingLines } from '../../../common/chat/compaction-diagnostics.mjs'
import {
  buildOpenAIProviderToolInputSummaryActivity as buildProviderToolInputSummaryActivity,
  resolveProviderToolInputActivityId,
} from './provider-tool-input-summary.mjs'
import { buildOpenAIAccountNativeActivityRows as buildNativeActivityRows } from './chat-event-bridge-openai-native-activity.mjs'
import { buildProviderToolOutputActivity } from './chat-event-bridge-openai-tool-output.mjs'

function normalizeId(value = '') {
  return String(value || '').trim()
}

function resolveOpenAICompactionActivityId(payload = {}) {
  const explicitId = normalizeId(payload?.activityId)
  if (explicitId) return explicitId
  const threadId = normalizeId(payload?.threadId)
  const turnId = normalizeId(payload?.turnId)
  const mode = normalizeId(payload?.mode).toLowerCase() || 'automatic'
  const compactionEventType = normalizeId(payload?.compactionEventType).toLowerCase()
    || normalizeId(payload?.selectedCompactionMode).toLowerCase()
    || 'provider_compaction'
  if (threadId && turnId) return `openai_compaction:${threadId}:${turnId}:${mode}:${compactionEventType}`
  if (turnId) return `openai_compaction:${turnId}:${mode}:${compactionEventType}`
  if (threadId) return `openai_compaction:${threadId}:${mode}:${compactionEventType}`
  return `openai_compaction:${mode}:${compactionEventType}`
}

import i18n from '../../i18n/init.mjs'

function interpolateOpenAIEventText(template, options = {}) {
  return String(template ?? '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, rawKey) => {
    const key = String(rawKey || '').trim()
    const value = options?.[key]
    return value == null ? '' : String(value)
  })
}

function translateOpenAIEventText(key, defaultValue, options = {}) {
  const safeOptions = options && typeof options === 'object' ? options : {}
  if (i18n?.isInitialized === true) {
    const translated = i18n.t(key, {
      defaultValue,
      ...safeOptions,
    })
    if (typeof translated === 'string' && translated && translated !== key) {
      return translated
    }
  }
  return interpolateOpenAIEventText(defaultValue, safeOptions)
}

function isCodexThreadCompaction(payload = {}) {
  return normalizeId(payload?.selectedCompactionMode).toLowerCase() === 'codex_thread_compaction'
    || normalizeId(payload?.compactionEventType).toLowerCase() === 'codex_thread_compaction'
}

function resolveStoreState(useChatStore) {
  if (!useChatStore || typeof useChatStore.getState !== 'function') return null
  return useChatStore.getState()
}

function normalizeProviderToolStatusType(payload = {}) {
  return String(payload?.type || '').trim().toLowerCase()
}

function normalizeProviderToolName(payload = {}, fallback = 'tool') {
  const value = String(payload?.toolName || '').trim()
  return value || fallback
}

export function buildOpenAIAccountNativeActivityRows(payload = {}) {
  return buildNativeActivityRows(payload, translateOpenAIEventText)
}

export function buildOpenAISourceUrlActivity(payload = {}) {
  return {
    type: 'source',
    threadId: payload?.threadId,
    turnId: payload?.turnId,
    eventKind: 'source_url',
    providerId: payload?.providerId,
    model: payload?.model,
    label: payload?.title
      ? translateOpenAIEventText(
        'core:executionStream.bridge.source.urlTitle',
        'Source: {{title}}',
        { title: payload.title },
      )
      : translateOpenAIEventText(
        'core:executionStream.bridge.source.urlCaptured',
        'Source URL captured',
      ),
    detail: String(payload?.url || ''),
  }
}

export function buildOpenAISourceDocumentActivity(payload = {}) {
  return {
    type: 'source',
    threadId: payload?.threadId,
    turnId: payload?.turnId,
    eventKind: 'source_document',
    providerId: payload?.providerId,
    model: payload?.model,
    label: payload?.title
      ? translateOpenAIEventText(
        'core:executionStream.bridge.source.documentTitle',
        'Source document: {{title}}',
        { title: payload.title },
      )
      : translateOpenAIEventText(
        'core:executionStream.bridge.source.documentCaptured',
        'Source document captured',
      ),
    detail: [
      payload?.filename ? `file: ${payload.filename}` : '',
      payload?.mediaType ? `media_type: ${payload.mediaType}` : '',
    ].filter(Boolean).join('\n'),
  }
}

export function buildOpenAIProviderToolStatusActivity(payload = {}) {
  const toolName = String(payload?.toolName || '').trim()
  const statusType = String(payload?.type || '').trim().toLowerCase()
  const activityKind = normalizeId(payload?.activityKind)
  const toolCallId = normalizeId(payload?.toolCallId)
  const turnId = normalizeId(payload?.turnId)
  const stableId = toolCallId && turnId ? `provider_tool:${turnId}:${toolCallId}` : ''
  return {
    ...(stableId ? { id: stableId } : {}),
    type: 'provider_tool',
    threadId: payload?.threadId,
    turnId: payload?.turnId,
    eventKind: 'provider_tool_status',
    status: statusType,
    providerId: payload?.providerId,
    model: payload?.model,
    toolName,
    ...(toolCallId ? { stepId: toolCallId } : {}),
    label: activityKind === 'openai_account_model_reroute'
      ? translateOpenAIEventText(
        'core:executionStream.bridge.providerTool.modelRerouted',
        'Model rerouted',
      )
      : activityKind === 'openai_account_config_warning'
      ? translateOpenAIEventText(
        'core:executionStream.bridge.providerTool.configWarning',
        'Configuration warning',
      )
      : activityKind === 'openai_account_hook'
      ? translateOpenAIEventText(
        'core:executionStream.bridge.providerTool.hook',
        'Hook',
      )
      : activityKind === 'openai_account_auto_approval_review'
      ? translateOpenAIEventText(
        'core:executionStream.bridge.providerTool.autoApprovalReview',
        'Automatic approval review',
      )
      : activityKind === 'openai_account_turn_error'
      ? translateOpenAIEventText(
        'core:executionStream.bridge.providerTool.providerError',
        'Provider error',
      )
      : statusType === 'completed'
      ? translateOpenAIEventText(
        'core:executionStream.bridge.providerTool.output',
        'Provider tool output: {{toolName}}',
        { toolName: toolName || 'tool' },
      )
      : statusType === 'tool-input-delta'
      ? translateOpenAIEventText(
        'core:executionStream.bridge.providerTool.input',
        'Provider tool input: {{toolName}}',
        { toolName: toolName || 'tool' },
      )
      : translateOpenAIEventText(
        'core:executionStream.bridge.providerTool.running',
        'Provider tool running: {{toolName}}',
        { toolName: toolName || 'tool' },
      ),
    detail: (
      statusType === 'tool-input-start' || statusType === 'tool-input-delta'
        ? translateOpenAIEventText(
          'core:executionStream.bridge.providerTool.collectingInput',
          'Collecting provider tool input...',
        )
        : String(payload?.delta || '').slice(0, 2000)
    ),
  }
}

function buildOpenAIProviderToolInputSummaryActivity(payload = {}) {
  return buildProviderToolInputSummaryActivity(payload, translateOpenAIEventText)
}

export function buildOpenAIProviderToolOutputActivity(payload = {}) {
  return buildProviderToolOutputActivity(payload, translateOpenAIEventText)
}

export function buildOpenAIContinuityStatusActivity(payload = {}) {
  const responseId = normalizeId(payload?.responseId)
  const serviceTier = normalizeId(payload?.serviceTier)
  const continuityMode = normalizeId(payload?.continuityMode)
  const transportMode = normalizeId(payload?.transportMode)
  const configuredTransportMode = normalizeId(payload?.configuredTransportMode)
  const transportSelectionReason = normalizeId(payload?.transportSelectionReason)
  const websocketReuseMode = normalizeId(payload?.websocketReuseMode)
  const compactionStrategy = normalizeId(payload?.compactionStrategy)
  const effectiveCompactionTransport = normalizeId(payload?.effectiveCompactionTransport)
  const accountDelegationBackend = normalizeId(payload?.accountDelegationBackend).toLowerCase()
  const accountCollaborationModeId = normalizeId(payload?.accountCollaborationModeId)
  const reconnectAttempt = Number(payload?.websocketReconnectAttempt || 0) || 0
  const reconnectMaxAttempts = Number(payload?.websocketReconnectMaxAttempts || 0) || 0
  const reconnectReason = normalizeId(payload?.websocketReconnectReason)
  const websocketRecovered = payload?.websocketRecovered === true
  const websocketFallbackAfterReconnectExhausted = payload?.websocketFallbackAfterReconnectExhausted === true
  const websocketBypassReason = normalizeId(payload?.websocketBypassReason)
  const websocketStoredResponseRecoveryAttempted = payload?.websocketStoredResponseRecoveryAttempted === true
  const websocketRecoveredFromStoredResponse = payload?.websocketRecoveredFromStoredResponse === true
  const nativeActivityRows = buildOpenAIAccountNativeActivityRows(payload)
  const hostedToolIds = Array.isArray(payload?.hostedToolIds)
    ? payload.hostedToolIds.map((value) => normalizeId(value)).filter(Boolean)
    : null

  return {
    type: 'info',
    threadId: payload?.threadId,
    turnId: payload?.turnId,
    authMethod: normalizeId(payload?.authMethod).toLowerCase(),
    eventKind: 'openai_continuity_status',
    label: responseId
      ? translateOpenAIEventText(
        'core:executionStream.bridge.continuity.responseTracked',
        'OpenAI response tracked: {{responseId}}',
        { responseId },
      )
      : translateOpenAIEventText(
        'core:executionStream.bridge.continuity.metadataReceived',
        'OpenAI response metadata received',
      ),
    detail: [
      continuityMode ? `mode: ${continuityMode}` : '',
      transportMode ? `transport_mode: ${transportMode}` : '',
      configuredTransportMode ? `configured_transport_mode: ${configuredTransportMode}` : '',
      transportSelectionReason ? `transport_selection_reason: ${transportSelectionReason}` : '',
      accountDelegationBackend ? `delegation_backend: ${accountDelegationBackend}` : '',
      accountCollaborationModeId ? `native_collaboration_mode: ${accountCollaborationModeId}` : '',
      websocketReuseMode ? `websocket_reuse_mode: ${websocketReuseMode}` : '',
      typeof payload?.websocketPooledConnection === 'boolean'
        ? `websocket_pooled_connection: ${payload.websocketPooledConnection ? 'true' : 'false'}`
        : '',
      typeof payload?.websocketReusedConnection === 'boolean'
        ? `websocket_reused_connection: ${payload.websocketReusedConnection ? 'true' : 'false'}`
        : '',
      reconnectAttempt > 0 ? `websocket_reconnect_attempt: ${reconnectAttempt}` : '',
      reconnectMaxAttempts > 0 ? `websocket_reconnect_max_attempts: ${reconnectMaxAttempts}` : '',
      reconnectReason ? `websocket_reconnect_reason: ${reconnectReason}` : '',
      websocketRecovered ? 'websocket_recovered: true' : '',
      websocketFallbackAfterReconnectExhausted ? 'websocket_fallback_after_reconnect_exhausted: true' : '',
      websocketBypassReason ? `websocket_bypass_reason: ${websocketBypassReason}` : '',
      websocketStoredResponseRecoveryAttempted ? 'websocket_stored_response_recovery_attempted: true' : '',
      websocketRecoveredFromStoredResponse ? 'websocket_recovered_from_stored_response: true' : '',
      payload?.promptCachingEnabled === true ? 'prompt_cache: enabled' : 'prompt_cache: disabled',
      compactionStrategy ? `compaction_strategy: ${compactionStrategy}` : '',
      effectiveCompactionTransport ? `effective_compaction_transport: ${effectiveCompactionTransport}` : '',
      ...buildCompactionUserFacingLines(payload),
      typeof payload?.serverSideCompactionEnabled === 'boolean'
        ? `server_side_compaction: ${payload.serverSideCompactionEnabled ? 'enabled' : 'disabled'}`
        : '',
      Number(payload?.serverSideCompactionThresholdTokens || 0) > 0
        ? `server_side_threshold_tokens: ${Number(payload.serverSideCompactionThresholdTokens)}`
        : '',
      serviceTier ? `service_tier: ${serviceTier}` : '',
      nativeActivityRows.length > 0
        ? `native_items: ${nativeActivityRows.map((row) => String(row.eventKind || '').replace('openai_account_native_', '')).join(', ')}`
        : '',
      Array.isArray(hostedToolIds) ? `hosted_tools: ${hostedToolIds.join(', ') || 'none'}` : '',
    ].filter(Boolean).join('\n'),
  }
}

export function buildOpenAIWebSocketReconnectActivity(payload = {}) {
  const status = normalizeId(payload?.status)
  const attempt = Number(payload?.attempt || 0) || 0
  const maxAttempts = Number(payload?.maxAttempts || 0) || 0
  const reason = normalizeId(payload?.reason)
  const waitMs = Number(payload?.waitMs || 0) || 0

  let label = translateOpenAIEventText(
    'core:executionStream.bridge.websocket.transportUpdate',
    'OpenAI WebSocket transport update',
  )
  let type = 'info'
  if (status === 'reconnecting') {
    label = translateOpenAIEventText(
      'core:executionStream.bridge.websocket.reconnecting',
      'Reconnecting... {{attempt}}/{{maxAttempts}}',
      { attempt, maxAttempts: maxAttempts || attempt || 1 },
    )
  } else if (status === 'recovering_stored_response') {
    label = translateOpenAIEventText(
      'core:executionStream.bridge.websocket.recoveringStoredResponse',
      'Recovering the final response from stored state',
    )
  } else if (status === 'recovered_stored_response') {
    label = translateOpenAIEventText(
      'core:executionStream.bridge.websocket.recoveredStoredResponse',
      'Recovered the final response from stored state',
    )
  } else if (status === 'stored_response_recovery_failed') {
    type = 'warning'
    label = translateOpenAIEventText(
      'core:executionStream.bridge.websocket.storedRecoveryFailed',
      'Stored-response recovery failed',
    )
  } else if (status === 'recovered') {
    label = translateOpenAIEventText(
      'core:executionStream.bridge.websocket.recovered',
      'Reconnected after retry {{attempt}}/{{maxAttempts}}',
      { attempt, maxAttempts: maxAttempts || attempt || 1 },
    )
  } else if (status === 'bypassed') {
    label = translateOpenAIEventText(
      'core:executionStream.bridge.websocket.bypassed',
      'Using the standard OpenAI transport for this turn',
    )
  } else if (status === 'fallback') {
    type = 'warning'
    label = translateOpenAIEventText(
      'core:executionStream.bridge.websocket.fallback',
      'Falling back to the standard OpenAI stream',
    )
  } else if (status === 'exhausted') {
    type = 'warning'
    label = translateOpenAIEventText(
      'core:executionStream.bridge.websocket.exhausted',
      'Reconnect exhausted ({{attempt}}/{{maxAttempts}})',
      { attempt, maxAttempts: maxAttempts || attempt || 1 },
    )
  } else if (status === 'cancelled') {
    label = translateOpenAIEventText(
      'core:executionStream.bridge.websocket.cancelled',
      'Reconnect cancelled ({{attempt}}/{{maxAttempts}})',
      { attempt, maxAttempts: maxAttempts || attempt || 1 },
    )
  }

  return {
    type,
    threadId: payload?.threadId,
    turnId: payload?.turnId,
    eventKind: 'openai_websocket_reconnect',
    providerId: payload?.providerId,
    model: payload?.model,
    label,
    detail: [
      status ? `status: ${status}` : '',
      reason ? `reason: ${reason}` : '',
      payload?.responseId ? `response_id: ${String(payload.responseId)}` : '',
      waitMs > 0 ? `wait_ms: ${waitMs}` : '',
    ].filter(Boolean).join('\n'),
  }
}

export function buildOpenAICompactionEventActivity(payload = {}) {
  const status = normalizeId(payload?.status).toLowerCase()
  const mode = normalizeId(payload?.mode).toLowerCase()
  const requested = status === 'requested'
  const running = status === 'running'
  const reason = normalizeId(payload?.reason)
  const applied = status === 'applied'
  const codexThreadCompaction = isCodexThreadCompaction(payload)
  const milestoneDetail = codexThreadCompaction
    ? translateOpenAIEventText(
      'core:executionStream.compaction.milestoneDetail.codexThreadCompaction',
      'Codex account thread compaction',
    )
    : (mode === 'automatic'
      ? translateOpenAIEventText(
        'core:executionStream.compaction.milestoneDetail.providerServerSide',
        'OpenAI server-side compaction',
      )
      : translateOpenAIEventText(
        'core:executionStream.compaction.milestoneDetail.manualServerSide',
        'OpenAI manual server-side compaction',
      ))

  return {
    id: resolveOpenAICompactionActivityId(payload),
    coalesce: true,
    type: requested || running || applied ? 'info' : 'warning',
    threadId: payload?.threadId,
    turnId: payload?.turnId,
    status,
    eventKind: 'openai_compaction_event',
    providerId: payload?.providerId,
    model: payload?.model,
    accountBridgeThreadId: normalizeId(payload?.accountBridgeThreadId),
    accountBridgeTurnId: normalizeId(payload?.accountBridgeTurnId),
    contextCompactionGeneration: Math.max(0, Number(payload?.contextCompactionGeneration || 0) || 0),
    label: requested
      ? translateOpenAIEventText('core:executionStream.compaction.requested', 'Compacting context')
      : running
      ? translateOpenAIEventText('core:executionStream.compaction.running', 'Compacting context')
      : applied
      ? translateOpenAIEventText('core:executionStream.compaction.applied', 'OpenAI compaction applied')
      : translateOpenAIEventText('core:executionStream.compaction.failed', 'OpenAI compaction failed'),
    detail: [
      mode ? `mode: ${mode}` : '',
      ...buildCompactionUserFacingLines(payload),
      (!(requested || running) && reason) ? `reason: ${reason}` : '',
    ].filter(Boolean).join('\n'),
    compactionMilestone: applied,
    compactionMilestoneTitle: applied
      ? translateOpenAIEventText(
        'core:executionStream.compaction.milestoneTitle',
        'Context compacted before the next turn',
      )
      : '',
    compactionMilestoneDetail: applied
      ? milestoneDetail
      : '',
    compactionMilestoneTone: applied ? 'provider' : '',
  }
}

export function buildOpenAIBackgroundQueuedActivity(payload = {}) {
  return {
    type: 'info',
    threadId: normalizeId(payload?.threadId),
    turnId: normalizeId(payload?.turnId),
    eventKind: 'background_response_queued',
    label: translateOpenAIEventText(
      'core:executionStream.bridge.background.queued',
      'OpenAI background response queued',
    ),
    detail: [
      payload?.jobId ? `job_id: ${String(payload.jobId)}` : '',
      payload?.responseId ? `response_id: ${String(payload.responseId)}` : '',
      payload?.model ? `model: ${String(payload.model)}` : '',
    ].filter(Boolean).join('\n'),
  }
}

export function buildOpenAIBackgroundCompletedActivity(payload = {}) {
  return {
    type: 'info',
    threadId: normalizeId(payload?.threadId),
    turnId: normalizeId(payload?.turnId),
    eventKind: 'background_response_completed',
    label: translateOpenAIEventText(
      'core:executionStream.bridge.background.completed',
      'OpenAI background response completed',
    ),
    detail: [
      payload?.jobId ? `job_id: ${String(payload.jobId)}` : '',
      payload?.responseId ? `response_id: ${String(payload.responseId)}` : '',
      payload?.model ? `model: ${String(payload.model)}` : '',
      Number(payload?.usage?.totalTokens || 0) > 0 ? `total_tokens: ${Number(payload.usage.totalTokens)}` : '',
    ].filter(Boolean).join('\n'),
  }
}

export function buildOpenAIBackgroundFailedActivity(payload = {}, message = '') {
  return {
    type: 'result',
    isError: true,
    decision: 'approved',
    threadId: normalizeId(payload?.threadId),
    turnId: normalizeId(payload?.turnId),
    eventKind: 'background_response_failed',
    label: message || translateOpenAIEventText(
      'core:executionStream.bridge.background.failed',
      'OpenAI background response failed.',
    ),
    detail: [
      payload?.jobId ? `job_id: ${String(payload.jobId)}` : '',
      payload?.responseId ? `response_id: ${String(payload.responseId)}` : '',
    ].filter(Boolean).join('\n'),
  }
}

export function registerOpenAIEventBridgeHandlers({
  safeSub = () => () => {},
  chatApi = {},
  useChatStore,
  setReasoningMetaForMessage = () => {},
} = {}) {
  const providerToolInputBufferByActivityId = new Map()
  const resolvePayloadThreadMessages = (state, threadId = '') => {
    const targetThreadId = normalizeId(threadId)
    if (!state || !targetThreadId) return []
    const activeThreadId = normalizeId(state.activeThreadId)
    if (targetThreadId === activeThreadId) {
      return Array.isArray(state.messages) ? state.messages : []
    }
    const threadStateById = state.threadStateById && typeof state.threadStateById === 'object'
      ? state.threadStateById
      : {}
    const threadState = threadStateById[targetThreadId] && typeof threadStateById[targetThreadId] === 'object'
      ? threadStateById[targetThreadId]
      : null
    return Array.isArray(threadState?.messages) ? threadState.messages : []
  }
  const resolveAssistantMessageId = (state, payload = {}) => {
    const payloadMessageId = normalizeId(payload?.messageId)
    const payloadThreadId = normalizeId(payload?.threadId)
    const payloadTurnId = normalizeId(payload?.turnId)
    if (!payloadThreadId) return payloadMessageId
    const messages = resolvePayloadThreadMessages(state, payloadThreadId)
    if (messages.length === 0) return payloadMessageId
    if (payloadMessageId && messages.some((row) => normalizeId(row?.id) === payloadMessageId)) {
      return payloadMessageId
    }
    if (payloadTurnId) {
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index]
        if (!message || message.role !== 'assistant') continue
        const messageTurnId = normalizeId(message?.streamMeta?.turnId)
        if (messageTurnId !== payloadTurnId) continue
        const messageId = normalizeId(message?.id)
        if (messageId) return messageId
      }
    }
    return payloadMessageId
  }
  const syncAssistantStreamMetaFromPayload = (state, payload = {}) => {
    if (!state?.setStreamMeta) return
    const messageId = resolveAssistantMessageId(state, payload)
    if (!messageId) return
    const threadId = normalizeId(payload?.threadId)
    const patch = {
      threadId,
      turnId: normalizeId(payload?.turnId),
      providerId: normalizeId(payload?.providerId),
      model: normalizeId(payload?.model),
      transportMode: normalizeId(payload?.transportMode),
      authMethod: normalizeId(payload?.authMethod).toLowerCase(),
    }
    if (!Object.values(patch).some(Boolean)) return

    state.setStreamMeta(
      messageId,
      patch,
      threadId ? { threadId } : undefined,
    )
  }

  const unSourceUrl = safeSub(chatApi.onSourceUrl, (payload = {}) => {
    const state = resolveStoreState(useChatStore)
    state?.pushToolActivity?.(buildOpenAISourceUrlActivity(payload))
  }, 'onSourceUrl')

  const unSourceDocument = safeSub(chatApi.onSourceDocument, (payload = {}) => {
    const state = resolveStoreState(useChatStore)
    state?.pushToolActivity?.(buildOpenAISourceDocumentActivity(payload))
  }, 'onSourceDocument')

  const unProviderToolStatus = safeSub(chatApi.onProviderToolStatus, (payload = {}) => {
    const state = resolveStoreState(useChatStore)
    if (!state?.pushToolActivity) return

    const statusType = normalizeProviderToolStatusType(payload)
    if (statusType !== 'tool-input-start' && statusType !== 'tool-input-delta') {
      state.pushToolActivity(buildOpenAIProviderToolStatusActivity(payload))
      return
    }

    const activityId = resolveProviderToolInputActivityId(payload)
    if (!activityId) {
      state.pushToolActivity(buildOpenAIProviderToolStatusActivity(payload))
      return
    }

    const existing = providerToolInputBufferByActivityId.get(activityId) || {
      toolName: normalizeProviderToolName(payload, 'tool'),
      emitted: false,
    }
    if (statusType === 'tool-input-start') {
      existing.toolName = normalizeProviderToolName(payload, existing.toolName || 'tool')
    }
    providerToolInputBufferByActivityId.set(activityId, existing)
    while (providerToolInputBufferByActivityId.size > 128) {
      const oldestKey = providerToolInputBufferByActivityId.keys().next().value
      if (!oldestKey) break
      providerToolInputBufferByActivityId.delete(oldestKey)
    }

    if (existing.emitted) return
    existing.emitted = true
    state.pushToolActivity(buildOpenAIProviderToolInputSummaryActivity({
      ...payload,
      toolName: existing.toolName,
    }))
  }, 'onProviderToolStatus')

  const unProviderToolOutput = safeSub(chatApi.onProviderToolOutput, (payload = {}) => {
    const state = resolveStoreState(useChatStore)
    const activityId = resolveProviderToolInputActivityId(payload)
    if (activityId) providerToolInputBufferByActivityId.delete(activityId)
    state?.pushToolActivity?.(buildOpenAIProviderToolOutputActivity(payload))
  }, 'onProviderToolOutput')

  const unOpenAIContinuityStatus = safeSub(chatApi.onOpenAIContinuityStatus, (payload = {}) => {
    const state = resolveStoreState(useChatStore)
    state?.recordReturnedProcessingMode?.(payload?.serviceTier, { threadId: normalizeId(payload?.threadId), providerId: 'openai' })
    syncAssistantStreamMetaFromPayload(state, payload)
    state?.pushToolActivity?.(buildOpenAIContinuityStatusActivity(payload))
    for (const row of buildOpenAIAccountNativeActivityRows(payload)) {
      state?.pushToolActivity?.(row)
    }
  }, 'onOpenAIContinuityStatus')

  const unOpenAICompactionEvent = safeSub(chatApi.onOpenAICompactionEvent, (payload = {}) => {
    const state = resolveStoreState(useChatStore)
    state?.pushToolActivity?.(buildOpenAICompactionEventActivity(payload))
  }, 'onOpenAICompactionEvent')

  const unOpenAIWebSocketReconnect = safeSub(chatApi.onOpenAIWebSocketReconnect, (payload = {}) => {
    const state = resolveStoreState(useChatStore)
    state?.pushToolActivity?.(buildOpenAIWebSocketReconnectActivity(payload))
  }, 'onOpenAIWebSocketReconnect')

  const unBackgroundResponseQueued = safeSub(chatApi.onBackgroundResponseQueued, (payload = {}) => {
    const state = resolveStoreState(useChatStore)
    syncAssistantStreamMetaFromPayload(state, payload)
    const messageId = resolveAssistantMessageId(state, payload)
    const threadId = normalizeId(payload?.threadId)
    const note = String(
      payload?.note
      || translateOpenAIEventText(
        'core:executionStream.bridge.background.noteQueued',
        'OpenAI background response queued. Open Jobs to monitor progress or stop it.',
      ),
    ).trim()
    if (messageId) {
      state?.markBackgroundPending?.(messageId, note, {
        threadId,
        turnId: normalizeId(payload?.turnId),
        jobId: payload?.jobId,
        responseId: payload?.responseId,
        queuedAt: payload?.queuedAt,
      })
    }
    state?.pushToolActivity?.(buildOpenAIBackgroundQueuedActivity(payload))
  }, 'onBackgroundResponseQueued')

  const unBackgroundResponseCompleted = safeSub(chatApi.onBackgroundResponseCompleted, (payload = {}) => {
    const state = resolveStoreState(useChatStore)
    syncAssistantStreamMetaFromPayload(state, payload)
    const messageId = resolveAssistantMessageId(state, payload)
    const threadId = normalizeId(payload?.threadId)
    const fullText = String(payload?.full || '').trim()
    const reasoningText = String(payload?.reasoning || '').trim()
    const reasoningTokens = Number(payload?.reasoningTokens || payload?.usage?.reasoningTokens || 0) || 0
    if (messageId) {
      if (reasoningText || reasoningTokens > 0) {
        state?.finalizeReasoning?.(
          messageId,
          reasoningText,
          {
            ...(threadId ? { threadId } : {}),
            authoritative: true,
            currentText: reasoningText,
          },
        )
        setReasoningMetaForMessage(messageId, {
          mode: reasoningText ? 'summary' : 'none',
          reasoningTokens,
        }, threadId)
        state?.markReasoningDone?.(messageId, threadId ? { threadId } : undefined)
      }
      state?.finalizeMessage?.(
        messageId,
        fullText || translateOpenAIEventText(
          'core:executionStream.bridge.background.noTextOutput',
          'OpenAI background response completed with no text output.',
        ),
        {
          phase: payload?.phase,
          threadId,
          finalDocument: payload?.finalDocument,
        },
      )
    }
    state?.pushToolActivity?.(buildOpenAIBackgroundCompletedActivity(payload))
  }, 'onBackgroundResponseCompleted')

  const unBackgroundResponseFailed = safeSub(chatApi.onBackgroundResponseFailed, (payload = {}) => {
    const state = resolveStoreState(useChatStore)
    syncAssistantStreamMetaFromPayload(state, payload)
    const messageId = resolveAssistantMessageId(state, payload)
    const threadId = normalizeId(payload?.threadId)
    const message = String(
      payload?.message
      || (payload?.cancelled
        ? translateOpenAIEventText(
          'core:executionStream.bridge.background.cancelled',
          'OpenAI background response was cancelled.',
        )
        : translateOpenAIEventText(
          'core:executionStream.bridge.background.failed',
          'OpenAI background response failed.',
        )),
    ).trim()
    if (messageId) {
      state?.markError?.(
        messageId,
        translateOpenAIEventText(
          'core:executionStream.bridge.background.errorPrefix',
          'Error: {{message}}',
          { message },
        ),
        threadId ? { threadId } : undefined,
      )
    }
    state?.pushToolActivity?.(buildOpenAIBackgroundFailedActivity(payload, message))
  }, 'onBackgroundResponseFailed')

  return () => {
    unSourceUrl()
    unSourceDocument()
    unProviderToolStatus()
    unProviderToolOutput()
    unOpenAIContinuityStatus()
    unOpenAICompactionEvent()
    unOpenAIWebSocketReconnect()
    unBackgroundResponseQueued()
    unBackgroundResponseCompleted()
    unBackgroundResponseFailed()
  }
}
