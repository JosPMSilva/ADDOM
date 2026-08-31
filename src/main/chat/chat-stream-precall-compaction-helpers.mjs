import { applyCompactionDiagnostics } from '../../common/chat/compaction-diagnostics.mjs'
import { applyOpenAIRequestContextCompaction } from '../api-clients/openai-request-context-compaction.mjs'
import { COMPACTION_MODES } from './continuity/compaction-mode-contract.mjs'
import {
  isCompactionHandoffMessage,
  renderCompactionAwarenessMarker,
  renderCompactionHandoffPrompt,
  upsertCompactionHandoffMessage,
  upsertCompactionVicinityMarkerMessage,
} from './continuity/compaction-handoff-prompt.mjs'
import { buildCompactionHandoffPayload } from './continuity/compaction-handoff-state.mjs'
import { isContinuityPacketMessage } from './continuity/packet-injection.mjs'
import { commitProjectedTimelineEvent } from './canonical-root-event-writer.mjs'

export function emitCompactionNotice({
  send = () => {},
  persistTimelineEvent = () => {},
  threadId = '',
  turnId = '',
  persistEventName = 'openai_manual_compaction_notice',
  type = 'info',
  text = '',
  meta = {},
} = {}) {
  const normalizedText = String(text || '').trim()
  if (!normalizedText) return
  const payload = {
    type: String(type || 'info').trim().toLowerCase() === 'warning' ? 'warning' : 'info',
    text: normalizedText,
    meta,
  }
  commitProjectedTimelineEvent({
    persistTimelineEvent, send,
    kind: String(persistEventName || 'openai_manual_compaction_notice').trim() || 'openai_manual_compaction_notice',
    options: {
      role: 'system', content: normalizedText,
      meta: { threadId, turnId, ...meta },
    },
    channel: 'chat:notice', payload,
  })
}

export function emitOpenAICompactionEvent({
  send = () => {},
  persistTimelineEvent = null,
  threadId = '',
  turnId = '',
  activityId = '',
  providerId = 'openai',
  model = '',
  status = 'applied',
  mode = 'manual',
  reason = '',
  responseId = '',
  compactionId = '',
  selectedCompactionMode = '',
  candidateCompactionModes = [],
  compactionFailureReason = '',
  fallbackCompactionMode = '',
  fallbackReason = '',
  compactionEventType = '',
  compactionEventPhase = '',
  compactionEventOccurred = null,
  strategy = '',
  scope = '',
  compactionSource = '',
  usageRefreshState = '',
  remainingContextTokens = null,
  threadOccupancyTokens = null,
  estimatedAfterTokens = null,
  modelLimit = null,
  accountBridgeThreadId = '',
  accountBridgeTurnId = '',
  contextCompactionGeneration = 0,
  emitLifecycleExpansion = true,
} = {}) {
  const normalizedStatus = String(status || 'applied').trim().toLowerCase()
  const emitSingleEvent = (eventStatus = '', eventPhase = compactionEventPhase, eventOccurred = compactionEventOccurred) => {
    const payload = applyCompactionDiagnostics({
      activityId: String(activityId || '').trim(),
      threadId,
      turnId,
      providerId: String(providerId || 'openai').trim().toLowerCase() || 'openai',
      model: String(model || '').trim(),
      status: String(eventStatus || normalizedStatus).trim().toLowerCase(),
      mode: String(mode || 'manual').trim().toLowerCase(),
      reason: String(reason || '').trim(),
      responseId: String(responseId || '').trim(),
      compactionId: String(compactionId || '').trim(),
      accountBridgeThreadId: String(accountBridgeThreadId || '').trim(),
      accountBridgeTurnId: String(accountBridgeTurnId || '').trim(),
      contextCompactionGeneration: Math.max(0, Number(contextCompactionGeneration || 0) || 0),
    }, {
      selectedCompactionMode,
      candidateCompactionModes,
      compactionFailureReason,
      fallbackCompactionMode,
      fallbackReason,
      compactionEventType,
      compactionEventPhase: eventPhase,
      compactionEventOccurred: eventOccurred,
      strategy,
      scope,
      compactionSource,
      usageRefreshState,
      remainingContextTokens,
      threadOccupancyTokens,
      estimatedAfterTokens,
      modelLimit,
    })
    if (typeof persistTimelineEvent === 'function') {
      const eventStatus = String(payload.status || '').trim().toLowerCase()
      commitProjectedTimelineEvent({
        persistTimelineEvent, send, kind: 'openai_compaction_event',
        options: {
          role: 'system',
          content: String(eventStatus === 'requested'
            ? 'OpenAI compaction requested.'
            : eventStatus === 'running'
              ? 'OpenAI compaction running.'
              : eventStatus === 'applied'
                ? 'OpenAI compaction applied.'
                : 'OpenAI compaction failed.'),
          meta: payload,
          lifecycle: eventStatus === 'applied' ? 'succeeded' : eventStatus === 'failed' ? 'failed' : 'active',
          progressiveKey: `openai_compaction:${String(payload.activityId || payload.compactionId || payload.responseId || payload.strategy || 'active')}`,
        },
        channel: 'chat:openai-compaction-event', payload,
      })
    } else {
      send('chat:openai-compaction-event', payload)
    }
  }

  emitSingleEvent(normalizedStatus)

  if (emitLifecycleExpansion && normalizedStatus === 'requested') {
    emitSingleEvent('running', compactionEventPhase || 'running', compactionEventOccurred ?? false)
  }
}

export function assignCompactionDiagnostics(target = {}, payload = {}) {
  Object.assign(target, applyCompactionDiagnostics({}, payload))
  return target
}

export function resolveCarryForwardSource({
  history = [],
  packetPayload = null,
  compactionPayload = null,
} = {}) {
  const rows = Array.isArray(history) ? history : []
  const hasPacketInHistory = rows.some((row) => isContinuityPacketMessage(row))
  const hasHandoffInHistory = rows.some((row) => isCompactionHandoffMessage(row))
  const hasPacketPayload = !!(packetPayload && typeof packetPayload === 'object')
  const hasCompactionHandoff = hasHandoffInHistory || compactionPayload?.handoffInjected === true
  const hasPacket = hasPacketInHistory || hasPacketPayload
  if (hasPacket && hasCompactionHandoff) return 'both'
  if (hasPacket) return 'continuity_packet_only'
  if (hasCompactionHandoff) return 'compaction_handoff_only'
  return 'none'
}

export function injectCompactionImminentAwareness({
  history = [],
  continuityInput = null,
  selectedStrategyMode = COMPACTION_MODES.NONE,
  allowedStrategyModes = [COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION],
  occurred = false,
  type = 'provider_chain_compaction',
  phase = 'imminent',
  source = 'provider',
  confidence = 'explicit',
  providerId = '',
  threadId = '',
  turnId = '',
  preCallOccupancyEstimateTokens = 0,
  modelLimitTokens = 0,
  note = '',
  persistTimelineEvent = () => {},
} = {}) {
  if (!Array.isArray(history)) return history
  const normalizedMode = String(selectedStrategyMode || '').trim()
  const allowedModes = Array.isArray(allowedStrategyModes)
    ? allowedStrategyModes.map((mode) => String(mode || '').trim()).filter(Boolean)
    : []
  if (allowedModes.length > 0 && !allowedModes.includes(normalizedMode)) return history
  const limit = Number(modelLimitTokens || 0) || 0
  const occupancy = Number(preCallOccupancyEstimateTokens || 0) || 0
  const occupancyRatio = limit > 0 ? Math.max(0, Math.min(2, occupancy / Math.max(1, limit))) : null
  const markerText = renderCompactionAwarenessMarker({
    occurred: occurred === true,
    type,
    phase,
    source,
    confidence,
    providerId,
    turnId,
    occupancyRatio,
    note: String(note || '').trim(),
  }, {
    tokenBudget: 88,
  })
  const historyWithMarker = upsertCompactionVicinityMarkerMessage(history, markerText)
  if (!Array.isArray(historyWithMarker) || historyWithMarker.length === 0) return history
  history.length = 0
  history.push(...historyWithMarker)
  if (continuityInput && typeof continuityInput === 'object') {
    continuityInput.history = history
  }
  const normalizedType = String(type || '').trim().toLowerCase() || 'provider_chain_compaction'
  const isProviderTruncation = normalizedType === 'provider_truncation'
  const timelineKind = isProviderTruncation
    ? 'provider_truncation_boundary_awareness'
    : 'provider_chain_compaction_boundary_awareness'
  const timelineSubject = isProviderTruncation
    ? 'Provider truncation'
    : 'Provider chain compaction'
  const timelineVerb = occurred === true
    ? (
        String(phase || '').trim().toLowerCase() === 'resumed_after'
          ? 'resumed after prior boundary before model call.'
          : 'applied before model call.'
      )
    : 'selected before model call.'
  persistTimelineEvent(timelineKind, {
    role: 'system',
    content: `${timelineSubject} ${timelineVerb}`,
    meta: {
      threadId: String(threadId || ''),
      turnId: String(turnId || ''),
      providerId: String(providerId || '').trim().toLowerCase(),
      compactionMode: normalizedMode || COMPACTION_MODES.NONE,
      compactionEventType: normalizedType,
      compactionEventOccurred: occurred === true,
      compactionEventPhase: String(phase || '').trim().toLowerCase(),
      occupancyRatio: occupancyRatio === null ? null : Number(occupancyRatio.toFixed(3)),
    },
  })
  return history
}

export function injectProviderChainResumedAfterHandoff({
  history = [],
  continuityInput = null,
  selectedStrategyMode = COMPACTION_MODES.NONE,
  compactionEventType = 'provider_chain_compaction',
  providerId = '',
  threadId = '',
  turnId = '',
  persistTimelineEvent = () => {},
} = {}) {
  if (!Array.isArray(history)) return history
  const normalizedStrategyMode = String(selectedStrategyMode || '').trim()
  const normalizedCompactionEventType = String(compactionEventType || '').trim().toLowerCase() || 'provider_chain_compaction'
  if (
    normalizedStrategyMode !== COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION
    && normalizedStrategyMode !== COMPACTION_MODES.CODEX_THREAD_COMPACTION
  ) return history

  const handoffPayload = buildCompactionHandoffPayload({
    compactionEvent: {
      occurred: true,
      type: normalizedCompactionEventType,
      phase: 'resumed_after',
      providerId: String(providerId || '').trim().toLowerCase(),
      turnId: String(turnId || ''),
      source: 'provider',
      confidence: 'explicit',
    },
    historyBeforeCompaction: history,
    removedMessages: [],
    compactedHistory: history,
    threadId,
    toolContextFacts: [],
  })
  const handoffText = renderCompactionHandoffPrompt(handoffPayload, { tokenBudget: 220 })
  const historyWithHandoff = upsertCompactionHandoffMessage(history, handoffText)
  if (!Array.isArray(historyWithHandoff) || historyWithHandoff.length === 0) return history
  history.length = 0
  history.push(...historyWithHandoff)
  if (continuityInput && typeof continuityInput === 'object') {
    continuityInput.history = history
  }
  persistTimelineEvent('provider_chain_compaction_resumed_handoff', {
    role: 'system',
    content: normalizedCompactionEventType === 'codex_thread_compaction'
      ? 'Codex account thread compaction resumed-after handoff injected before model call.'
      : 'Provider chain compaction resumed-after handoff injected before model call.',
    meta: {
      threadId: String(threadId || ''),
      turnId: String(turnId || ''),
      providerId: String(providerId || '').trim().toLowerCase(),
      compactionMode: normalizedStrategyMode,
      compactionEventType: normalizedCompactionEventType,
      compactionEventPhase: 'resumed_after',
      compactionEventOccurred: true,
    },
  })
  return history
}

export function injectProviderTruncationResumedAfterHandoff({
  history = [],
  continuityInput = null,
  selectedStrategyMode = COMPACTION_MODES.NONE,
  providerId = '',
  threadId = '',
  turnId = '',
  modelLimitTokens = 0,
  preCallOccupancyEstimateTokens = 0,
  pendingTruncationResume = null,
  persistTimelineEvent = () => {},
} = {}) {
  if (!Array.isArray(history)) return false
  if (String(selectedStrategyMode || '').trim() !== COMPACTION_MODES.PROVIDER_TRUNCATION) return false
  if (!pendingTruncationResume || typeof pendingTruncationResume !== 'object') return false

  const persistedTurnId = String(pendingTruncationResume.turnId || '').trim()
  const persistedResponseId = String(pendingTruncationResume.responseId || '').trim()
  const persistedCompactionIds = Array.isArray(pendingTruncationResume.compactionIds)
    ? pendingTruncationResume.compactionIds.map((value) => String(value || '').trim()).filter(Boolean)
    : []
  const normalizedProviderId = String(
    pendingTruncationResume.providerId
    || providerId
    || '',
  ).trim().toLowerCase()

  const handoffPayload = buildCompactionHandoffPayload({
    compactionEvent: {
      occurred: true,
      type: 'provider_truncation',
      phase: 'resumed_after',
      providerId: normalizedProviderId,
      turnId: persistedTurnId || String(turnId || ''),
      source: 'provider',
      confidence: 'explicit',
    },
    historyBeforeCompaction: history,
    removedMessages: [],
    compactedHistory: history,
    threadId,
    toolContextFacts: [],
  })
  const handoffText = renderCompactionHandoffPrompt(handoffPayload, { tokenBudget: 220 })
  const historyWithHandoff = upsertCompactionHandoffMessage(history, handoffText)
  if (!Array.isArray(historyWithHandoff) || historyWithHandoff.length === 0) return false

  const limit = Number(modelLimitTokens || 0) || 0
  const occupancy = Number(preCallOccupancyEstimateTokens || 0) || 0
  const occupancyRatio = limit > 0 ? Math.max(0, Math.min(2, occupancy / Math.max(1, limit))) : null
  const markerText = renderCompactionAwarenessMarker({
    occurred: true,
    type: 'provider_truncation',
    phase: 'resumed_after',
    source: 'provider',
    confidence: 'explicit',
    providerId: normalizedProviderId,
    turnId: String(turnId || ''),
    occupancyRatio,
    note: 'Provider truncation was applied on the prior turn; resume from preserved objective and next step.',
  }, {
    tokenBudget: 88,
  })
  const historyWithMarker = upsertCompactionVicinityMarkerMessage(historyWithHandoff, markerText)
  if (!Array.isArray(historyWithMarker) || historyWithMarker.length === 0) return false

  history.length = 0
  history.push(...historyWithMarker)
  if (continuityInput && typeof continuityInput === 'object') {
    continuityInput.history = history
  }
  persistTimelineEvent('provider_truncation_resumed_handoff', {
    role: 'system',
    content: 'Provider truncation resumed-after handoff injected before model call.',
    meta: {
      threadId: String(threadId || ''),
      turnId: String(turnId || ''),
      providerId: normalizedProviderId,
      previousTurnId: persistedTurnId,
      responseId: persistedResponseId,
      compactionIds: persistedCompactionIds,
      compactionMode: COMPACTION_MODES.PROVIDER_TRUNCATION,
      compactionEventType: 'provider_truncation',
      compactionEventPhase: 'resumed_after',
      compactionEventOccurred: true,
    },
  })
  return true
}

export function buildCurrentOpenAIRequestContext({
  openAIContinuityEnabled = false,
  effectiveOpenAIContinuation = null,
  shouldStoreOpenAIState = false,
  openAIProviderChainCompactionUsable = false,
  requestedCompactionMode = COMPACTION_MODES.NONE,
  forceProviderTruncation = false,
  providerTruncationThresholdTokens = 0,
  selectedCompactionMode = '',
  candidateCompactionModes = [],
  compactionFailureReason = '',
  fallbackCompactionMode = '',
  fallbackReason = '',
  compactionEventType = '',
  compactionEventPhase = '',
  compactionEventOccurred = null,
  canonicalHandoffUsed = null,
  carryForwardSource = '',
} = {}) {
  if (!openAIContinuityEnabled) return undefined
  return applyOpenAIRequestContextCompaction({
    previousResponseId: String(effectiveOpenAIContinuation?.previousResponseId || ''),
    conversationId: String(effectiveOpenAIContinuation?.conversationId || ''),
    accountBridgeThreadId: String(effectiveOpenAIContinuation?.accountBridgeThreadId || ''),
    accountBridgeProjectFolder: String(effectiveOpenAIContinuation?.accountBridgeProjectFolder || ''),
    accountDynamicToolSignature: String(effectiveOpenAIContinuation?.accountDynamicToolSignature || ''),
    accountDelegationBackend: String(effectiveOpenAIContinuation?.accountDelegationBackend || '').toLowerCase(),
    accountCollaborationModeId: String(effectiveOpenAIContinuation?.accountCollaborationModeId || ''),
    accountContextCompactionGeneration: Math.max(0, Number(
      effectiveOpenAIContinuation?.accountContextCompactionGeneration
      ?? effectiveOpenAIContinuation?.state?.metadata?.accountContextCompactionGeneration
      ?? 0,
    ) || 0),
    manualCompactedWindow: Array.isArray(effectiveOpenAIContinuation?.manualCompactedWindow)
      ? effectiveOpenAIContinuation.manualCompactedWindow
      : undefined,
    resetChainFromCompactedWindow: effectiveOpenAIContinuation?.resetChainFromCompactedWindow === true,
    store: shouldStoreOpenAIState,
    useResponseCompaction: openAIProviderChainCompactionUsable,
  }, {
    requestedCompactionMode,
    forceProviderTruncation,
    providerTruncationThresholdTokens: Number(providerTruncationThresholdTokens || 0) || 0,
    selectedCompactionMode,
    candidateCompactionModes,
    compactionFailureReason,
    fallbackCompactionMode,
    fallbackReason,
    compactionEventType,
    compactionEventPhase,
    compactionEventOccurred,
    canonicalHandoffUsed,
    carryForwardSource,
  })
}
