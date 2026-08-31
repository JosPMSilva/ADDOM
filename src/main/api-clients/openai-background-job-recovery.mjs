import { appendEvent, touchProjectUsageByThread } from '../workspace/workspace-store.mjs'
import {
  finalizeOpenAIBackgroundJob,
  getOpenAIBackgroundJob,
  resolveOpenAIBackgroundJobDeliveryState,
  resolveOpenAIBackgroundJobOrphanState,
} from './openai-background-job-store.mjs'
import {
  invalidateOpenAIThreadState,
  upsertOpenAIThreadState,
} from './openai-thread-state-service.mjs'
import { resolveAssistantPhaseForTurn } from '../chat/assistant-phase-policy.mjs'
import { applyCompactionDiagnostics } from '../../common/chat/compaction-diagnostics.mjs'
import { COMPACTION_MODES } from '../chat/continuity/compaction-mode-contract.mjs'
import { resolveOpenAIRequestContextCompaction } from './openai-request-context-compaction.mjs'

function now() {
  return Date.now()
}

function normalizeId(value = '') {
  return String(value || '').trim()
}

function emitBackgroundEvent(broadcast, channel, payload = {}) {
  if (typeof broadcast !== 'function') return
  try {
    broadcast(channel, payload)
  } catch {
    // Best-effort only.
  }
}

function appendThreadEvent(threadId, payload = {}) {
  const normalizedThreadId = normalizeId(threadId)
  if (!normalizedThreadId) return
  try {
    appendEvent(normalizedThreadId, payload)
  } catch {
    // Best-effort only.
  }
}

function buildRecoveredOpenAIContinuityStatusPayload({
  persisted = null,
  payload = {},
  chainInvalidReason = '',
} = {}) {
  const resultSummary = persisted?.resultSummary && typeof persisted.resultSummary === 'object'
    ? persisted.resultSummary
    : {}
  const requestContextUsed = resultSummary.requestContextUsed && typeof resultSummary.requestContextUsed === 'object'
    ? resultSummary.requestContextUsed
    : null
  const requestCompaction = resolveOpenAIRequestContextCompaction(requestContextUsed)
  const compactionStrategy = String(requestCompaction.requestedCompactionMode || COMPACTION_MODES.NONE)
  const serverSideCompactionThresholdTokens = Number(requestCompaction.providerTruncationThresholdTokens || 0) || 0
  const autoCompactionIds = Array.isArray(payload?.providerResponseMeta?.autoCompactionIds)
    ? payload.providerResponseMeta.autoCompactionIds.map((value) => normalizeId(value)).filter(Boolean)
    : []
  return {
    threadId: persisted?.threadId,
    turnId: normalizeId(resultSummary.turnId),
    providerId: 'openai',
    model: persisted?.model,
    continuityMode: 'local_first_hybrid',
    promptCachingEnabled: true,
    background: true,
    responseId: normalizeId(payload?.providerResponseMeta?.responseId || persisted?.remoteResponseId),
    conversationId: normalizeId(payload?.providerResponseMeta?.conversationId || persisted?.conversationId),
    storeEnabled: persisted?.storeEnabled === true,
    status: normalizeId(payload?.providerResponseMeta?.status || 'completed'),
    cachedTokens: Number(payload?.providerResponseMeta?.cachedTokens || 0) || 0,
    previousResponseIdUsed: normalizeId(requestContextUsed?.previousResponseId),
    chainInvalidReason: normalizeId(chainInvalidReason),
    compactionStrategy,
    serverSideCompactionEnabled: (
      compactionStrategy === COMPACTION_MODES.PROVIDER_TRUNCATION
      || serverSideCompactionThresholdTokens > 0
    ),
    serverSideCompactionThresholdTokens,
    autoCompactionApplied: payload?.providerResponseMeta?.autoCompactionApplied === true,
    autoCompactionIds,
    lastCompactionId: autoCompactionIds[0] || '',
    ...applyCompactionDiagnostics({}, requestCompaction),
  }
}

export function finalizeRecoveredOpenAIBackgroundJobSuccess({
  job = null,
  payload = {},
  broadcast = null,
} = {}) {
  const persisted = getOpenAIBackgroundJob(job?.id || '')
  if (!persisted) return null
  const turnId = normalizeId(persisted.resultSummary?.turnId)
  const assistantPhase = resolveAssistantPhaseForTurn({
    providerId: 'openai',
    modelId: persisted.model,
  })
  const delivery = resolveOpenAIBackgroundJobDeliveryState({
    threadId: persisted.threadId,
    turnId,
  })
  const orphanState = resolveOpenAIBackgroundJobOrphanState({
    threadId: persisted.threadId,
    turnId,
  })

  if (orphanState.orphaned) {
    invalidateOpenAIThreadState(
      persisted.threadId,
      orphanState.reason === 'missing_thread'
        ? 'background_orphaned'
        : 'background_failed',
    )
    const next = finalizeOpenAIBackgroundJob(persisted.id, {
      status: 'orphaned',
      completionEventPersisted: true,
      errorCode: orphanState.reason || 'orphaned',
      errorMessage: 'Recovered OpenAI background response became orphaned before delivery.',
      resultSummary: {
        ...(persisted.resultSummary && typeof persisted.resultSummary === 'object' ? persisted.resultSummary : {}),
        stopReason: normalizeId(payload?.stopReason),
        usage: payload?.usage || null,
      },
    })
    if (normalizeId(persisted.threadId)) {
      appendThreadEvent(persisted.threadId, {
        kind: 'background_response_failed',
        turnId,
        role: 'system',
        content: 'Recovered OpenAI background response became orphaned before delivery.',
        meta: {
          threadId: persisted.threadId,
          turnId,
          jobId: persisted.id,
          responseId: normalizeId(payload?.providerResponseMeta?.responseId || persisted.remoteResponseId),
          orphaned: true,
        },
      })
    }
    return next
  }

  upsertOpenAIThreadState({
    threadId: persisted.threadId,
    projectId: persisted.projectId,
    providerId: 'openai',
    model: persisted.model,
    lastResponseId: normalizeId(payload?.providerResponseMeta?.responseId || persisted.remoteResponseId),
    conversationId: normalizeId(payload?.providerResponseMeta?.conversationId || persisted.conversationId),
    storeEnabled: persisted.storeEnabled,
    toolsetHash: persisted.toolsetHash,
    systemPromptHash: persisted.systemPromptHash,
    continuitySignature: persisted.continuitySignature,
    chainValid: true,
    chainInvalidReason: '',
  })

  if (!delivery.completionEventExists) {
    appendThreadEvent(persisted.threadId, {
      kind: 'background_response_completed',
      turnId,
      role: 'system',
      content: 'OpenAI background response completed.',
      meta: {
        threadId: persisted.threadId,
        turnId,
        jobId: persisted.id,
        responseId: normalizeId(payload?.providerResponseMeta?.responseId || persisted.remoteResponseId),
        model: persisted.model,
        totalTokens: Number(payload?.usage?.totalTokens || 0) || 0,
        recovered: true,
      },
    })
  }
  if (!delivery.assistantMessageExists) {
    appendThreadEvent(persisted.threadId, {
      kind: 'assistant_message',
      turnId,
      role: 'assistant',
      content: String(payload?.text || ''),
      meta: {
        providerId: 'openai',
        model: persisted.model,
        stopReason: normalizeId(payload?.stopReason || 'stop'),
        recoveredBackgroundJob: true,
        phase: assistantPhase,
      },
    })
  }
  if (String(payload?.reasoning || '').trim()) {
    appendThreadEvent(persisted.threadId, {
      kind: 'reasoning_done',
      turnId,
      role: 'assistant',
      content: String(payload.reasoning || '').trim(),
      meta: {
        threadId: persisted.threadId,
        turnId,
        providerId: 'openai',
        model: persisted.model,
        full: String(payload.reasoning || '').trim(),
      },
    })
  }
  if (Number(payload?.usage?.totalTokens || 0) > 0) {
    appendThreadEvent(persisted.threadId, {
      kind: 'chat_usage',
      turnId,
      role: 'system',
      content: '',
      meta: {
        threadId: persisted.threadId,
        turnId,
        source: 'openai_background_recovery',
        providerId: 'openai',
        model: persisted.model,
        usage: payload.usage,
      },
    })
  }
  const continuityStatusPayload = buildRecoveredOpenAIContinuityStatusPayload({
    persisted,
    payload,
    chainInvalidReason: '',
  })
  appendThreadEvent(persisted.threadId, {
    kind: 'openai_continuity_status',
    turnId,
    role: 'system',
    content: normalizeId(continuityStatusPayload.responseId)
      ? `OpenAI response state tracked: ${normalizeId(continuityStatusPayload.responseId)}`
      : 'OpenAI response state unavailable for this turn.',
    meta: continuityStatusPayload,
  })
  try {
    touchProjectUsageByThread(persisted.threadId, 'openai', persisted.model)
  } catch {
    // Best-effort only.
  }

  const next = finalizeOpenAIBackgroundJob(persisted.id, {
    status: normalizeId(payload?.providerResponseMeta?.status || 'completed'),
    conversationId: normalizeId(payload?.providerResponseMeta?.conversationId || persisted.conversationId),
    remoteResponseId: normalizeId(payload?.providerResponseMeta?.responseId || persisted.remoteResponseId),
    completionEventPersisted: true,
    errorCode: '',
    errorMessage: '',
    resultSummary: {
      ...(persisted.resultSummary && typeof persisted.resultSummary === 'object' ? persisted.resultSummary : {}),
      stopReason: normalizeId(payload?.stopReason),
      usage: payload?.usage || null,
    },
  })

  emitBackgroundEvent(broadcast, 'chat:openai-continuity-status', {
    ...continuityStatusPayload,
  })
  emitBackgroundEvent(broadcast, 'chat:background-response-completed', {
    threadId: persisted.threadId,
    turnId,
    messageId: persisted.assistantMessageId,
    jobId: persisted.id,
    responseId: normalizeId(payload?.providerResponseMeta?.responseId || persisted.remoteResponseId),
    conversationId: normalizeId(payload?.providerResponseMeta?.conversationId || persisted.conversationId),
    providerId: 'openai',
    model: persisted.model,
    full: String(payload?.text || ''),
    reasoning: String(payload?.reasoning || ''),
    reasoningTokens: Number(payload?.usage?.reasoningTokens || 0) || 0,
    usage: payload?.usage || null,
    stopReason: normalizeId(payload?.stopReason || 'stop'),
    phase: assistantPhase,
    completedAt: now(),
    recovered: true,
  })

  return next
}

export function finalizeRecoveredOpenAIBackgroundJobFailure({
  job = null,
  cancelled = false,
  message = '',
  broadcast = null,
} = {}) {
  const persisted = getOpenAIBackgroundJob(job?.id || '')
  if (!persisted) return null
  const turnId = normalizeId(persisted.resultSummary?.turnId)
  const delivery = resolveOpenAIBackgroundJobDeliveryState({
    threadId: persisted.threadId,
    turnId,
  })

  invalidateOpenAIThreadState(
    persisted.threadId,
    cancelled === true ? 'background_cancelled' : 'background_failed',
  )
  const continuityStatusPayload = buildRecoveredOpenAIContinuityStatusPayload({
    persisted,
    payload: {
      providerResponseMeta: {
        responseId: normalizeId(job?.responseId || persisted.remoteResponseId),
        conversationId: normalizeId(job?.conversationId || persisted.conversationId),
        status: cancelled === true ? 'cancelled' : 'failed',
      },
    },
    chainInvalidReason: cancelled === true ? 'background_cancelled' : 'background_failed',
  })

  if (!delivery.failureEventExists) {
    appendThreadEvent(persisted.threadId, {
      kind: 'background_response_failed',
      turnId,
      role: 'system',
      content: String(message || 'OpenAI background response failed.'),
      meta: {
        threadId: persisted.threadId,
        turnId,
        jobId: persisted.id,
        responseId: normalizeId(job?.responseId || persisted.remoteResponseId),
        cancelled: cancelled === true,
        recovered: true,
      },
    })
  }

  const next = finalizeOpenAIBackgroundJob(persisted.id, {
    status: cancelled === true ? 'cancelled' : 'failed',
    failureEventPersisted: true,
    errorCode: cancelled === true ? 'cancelled' : 'background_failed',
    errorMessage: String(message || ''),
  })

  emitBackgroundEvent(broadcast, 'chat:openai-continuity-status', {
    ...continuityStatusPayload,
  })
  emitBackgroundEvent(broadcast, 'chat:background-response-failed', {
    threadId: persisted.threadId,
    turnId,
    messageId: persisted.assistantMessageId,
    jobId: persisted.id,
    responseId: normalizeId(job?.responseId || persisted.remoteResponseId),
    providerId: 'openai',
    model: persisted.model,
    message: String(message || ''),
    cancelled: cancelled === true,
    failedAt: now(),
    recovered: true,
  })

  return next
}
