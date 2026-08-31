import { COMPACTION_MODES } from './continuity/compaction-mode-contract.mjs'
import { applyCompactionDiagnostics } from '../../common/chat/compaction-diagnostics.mjs'
import { buildCompactionUsageRefreshPayload } from './chat-compaction-usage-refresh.mjs'
import { emitOpenAICompactionEvent } from './chat-stream-precall-compaction-helpers.mjs'
import {
  buildOpenAIRequestContextSnapshot,
  resolveOpenAIRequestContextCompaction,
} from '../api-clients/openai-request-context-compaction.mjs'
import { buildCanonicalFinalDocument } from '../../common/chat/final-document-contract.mjs'
import { commitProjectedTimelineEvent } from './canonical-root-event-writer.mjs'

export function createOpenAIResponseMetaEmitter({
  activeProjectId = '',
  activeThreadId = '',
  activeTurnId = '',
  providerId = '',
  model = '',
  round = 0,
  providerRuntimeSettings = null,
  openaiHostedToolIds = [],
  openAIContinuation = null,
  shouldStoreOpenAIState = false,
  toolsetHash = '',
  systemPromptHash = '',
  continuitySignature = '',
  getLastCompactionId = () => '',
  send = () => {},
  persistTimelineEvent = () => {},
  upsertOpenAIThreadState = () => {},
} = {}) {
  return (responseMeta = {}, extraMeta = {}) => {
    const requestContextUsed = extraMeta?.requestContextUsed && typeof extraMeta.requestContextUsed === 'object'
      ? extraMeta.requestContextUsed
      : openAIContinuation
    const requestCompaction = resolveOpenAIRequestContextCompaction(requestContextUsed)
    const effectiveCompactionStrategy = requestCompaction.requestedCompactionMode || COMPACTION_MODES.NONE
    const effectiveServerSideCompactionThresholdTokens = Number(
      requestCompaction.providerTruncationThresholdTokens
      || providerRuntimeSettings?.openai?.serverSideCompactionThresholdTokens
      || 0,
    ) || 0
    const accountAuth = String(responseMeta?.authMethod || '').trim().toLowerCase() === 'account'
    const effectiveServerSideCompactionEnabled = !accountAuth && (effectiveCompactionStrategy === COMPACTION_MODES.PROVIDER_TRUNCATION
      || (
        providerRuntimeSettings?.openai?.useServerSideCompaction === true
        && effectiveServerSideCompactionThresholdTokens > 0
      ))
    const effectiveCompactionTransport = accountAuth
      ? COMPACTION_MODES.CODEX_THREAD_COMPACTION
      : (effectiveServerSideCompactionEnabled ? 'responses_server_compaction' : COMPACTION_MODES.NONE)
    const accountAutoCompactionTokenLimit = Number(
      providerRuntimeSettings?.openai?.codexAutoThreadCompactionTokenLimit || 0
    ) || 0
    const accountAutoCompactionMode = (
      accountAuth
      && providerRuntimeSettings?.openai?.codexAutoThreadCompactionEnabled === true
      && accountAutoCompactionTokenLimit > 0
    ) ? 'custom_threshold' : 'native_default'
    const accountAutoCompactionEnabled = accountAuth
    const accountAutoCompactionPromptConfigured = (
      accountAuth
      && String(providerRuntimeSettings?.openai?.codexAutoThreadCompactionInstructions || '').trim().length > 0
    )
    const accountCompaction = responseMeta?.accountCompaction && typeof responseMeta.accountCompaction === 'object'
      ? responseMeta.accountCompaction
      : null
    const accountCompactionIds = Array.isArray(accountCompaction?.itemIds)
      ? accountCompaction.itemIds.map((value) => String(value || '').trim()).filter(Boolean)
      : []
    const accountCompactionApplied = accountCompaction?.completed === true && accountCompactionIds.length > 0
    const contextCompactionGeneration = Math.max(0, Number(
      responseMeta?.contextCompactionGeneration
      ?? openAIContinuation?.accountContextCompactionGeneration
      ?? openAIContinuation?.state?.metadata?.accountContextCompactionGeneration
      ?? 0,
    ) || 0)
    const transportMode = String(responseMeta?.transportMode || 'responses_stream').trim().toLowerCase() || 'responses_stream'
    const accountCompactionUsageRefreshPayload = accountCompactionApplied
      ? buildCompactionUsageRefreshPayload({
          threadId: activeThreadId,
          turnId: activeTurnId,
          usage: {},
          modelLimit: responseMeta?.inputLimitTokens ?? null,
          remainingContextTokens: (
            responseMeta?.remainingContextTokens
            ?? responseMeta?.contextRemainingTokens
            ?? responseMeta?.remainingTokens
          ),
          threadOccupancyTokens: (
            responseMeta?.threadOccupancyTokens
            ?? responseMeta?.contextOccupancyTokens
            ?? responseMeta?.occupancyTokens
          ),
          strategy: COMPACTION_MODES.CODEX_THREAD_COMPACTION,
          scope: 'thread_reset',
          compactionSource: 'provider',
          status: 'applied',
          authMethod: responseMeta?.authMethod,
          transportMode,
          providerUsageSemantics: responseMeta?.providerUsageSemantics || '',
          accountBridgeThreadId: responseMeta?.accountBridgeThreadId || '',
          accountBridgeTurnId: responseMeta?.accountBridgeTurnId || '',
          contextCompactionGeneration,
        })
      : null
    const autoCompactionIds = Array.isArray(responseMeta?.autoCompactionIds)
      ? responseMeta.autoCompactionIds.map((value) => String(value || '').trim()).filter(Boolean)
      : []
    const effectiveAutoCompactionIds = autoCompactionIds.length > 0 ? autoCompactionIds : accountCompactionIds
    const autoCompactionApplied = (
      responseMeta?.autoCompactionApplied === true
      || autoCompactionIds.length > 0
      || accountCompactionApplied
    )
    const pendingProviderTruncationResume = (
      effectiveCompactionStrategy === COMPACTION_MODES.PROVIDER_TRUNCATION
      && autoCompactionApplied
    )
      ? {
          eventType: 'provider_truncation',
          eventPhase: 'resumed_after',
          source: 'provider',
          confidence: 'explicit',
          providerId: 'openai',
          turnId: String(activeTurnId || ''),
          responseId: String(responseMeta?.responseId || ''),
          compactionIds: effectiveAutoCompactionIds,
          detectedAt: Date.now(),
        }
      : null
    const accountBridgeThreadId = String(responseMeta?.accountBridgeThreadId || '').trim()
    const accountBridgeProjectFolder = String(responseMeta?.accountBridgeProjectFolder || '').trim()
    const accountDynamicToolSignature = String(responseMeta?.accountDynamicToolSignature || '').trim()
    const accountDelegationBackend = String(responseMeta?.accountDelegationBackend || '').trim().toLowerCase()
    const accountCollaborationModeId = String(responseMeta?.accountCollaborationModeId || '').trim()
    const continuityEpoch = Math.max(
      1,
      Number(
        responseMeta?.continuityEpoch
        || openAIContinuation?.continuityEpoch
        || 1,
      ) || 1,
    )
    const continuityReducerVersion = String(
      responseMeta?.continuityReducerVersion
      || openAIContinuation?.continuityReducerVersion
      || '',
    ).trim()
    const modeSignature = String(
      responseMeta?.modeSignature
      || openAIContinuation?.modeSignature
      || '',
    ).trim()
    const modelSignature = String(
      responseMeta?.modelSignature
      || openAIContinuation?.modelSignature
      || '',
    ).trim()
    const latestCodexThreadCompaction = accountCompactionApplied
      ? {
          eventType: 'codex_thread_compaction',
          eventPhase: 'applied',
          source: 'provider',
          confidence: 'explicit',
          providerId: 'openai',
          turnId: String(activeTurnId || ''),
          responseId: String(responseMeta?.responseId || ''),
          compactionIds: accountCompactionIds,
          detectedAt: Date.now(),
        }
      : null
    const threadStateMetadata = {
      ...(pendingProviderTruncationResume ? { pendingProviderTruncationResume } : {}),
      ...(latestCodexThreadCompaction ? { latestCodexThreadCompaction } : {}),
      ...(accountBridgeThreadId ? { accountBridgeThreadId } : {}),
      ...(accountBridgeProjectFolder ? { accountBridgeProjectFolder } : {}),
      ...(accountDynamicToolSignature ? { accountDynamicToolSignature } : {}),
      ...(accountDelegationBackend ? { accountDelegationBackend } : {}),
      ...(accountCollaborationModeId ? { accountCollaborationModeId } : {}),
      ...(accountAuth ? { accountContextCompactionGeneration: contextCompactionGeneration } : {}),
    }
    const lastCompactionId = String(getLastCompactionId() || effectiveAutoCompactionIds[0] || '')
    const responseCompactionEvent = (
      effectiveCompactionStrategy === COMPACTION_MODES.PROVIDER_TRUNCATION
      && autoCompactionApplied
    )
      ? {
          compactionEventType: 'provider_truncation',
          compactionEventPhase: 'applied',
          compactionEventOccurred: true,
        }
      : (accountCompactionApplied
        ? {
            selectedCompactionMode: COMPACTION_MODES.CODEX_THREAD_COMPACTION,
            candidateCompactionModes: [COMPACTION_MODES.CODEX_THREAD_COMPACTION, COMPACTION_MODES.LOCAL_SUMMARY],
            compactionEventType: 'codex_thread_compaction',
            compactionEventPhase: 'applied',
            compactionEventOccurred: true,
            strategy: accountCompactionUsageRefreshPayload?.compactionStrategy,
            scope: accountCompactionUsageRefreshPayload?.compactionScope,
            compactionSource: accountCompactionUsageRefreshPayload?.compactionSource,
            usageRefreshState: accountCompactionUsageRefreshPayload?.usageRefreshState,
            remainingContextTokens: accountCompactionUsageRefreshPayload?.contextRemainingTokens,
            threadOccupancyTokens: accountCompactionUsageRefreshPayload?.threadOccupancyTokens,
            estimatedAfterTokens: accountCompactionUsageRefreshPayload?.estimatedOccupancyTokens,
            modelLimit: accountCompactionUsageRefreshPayload?.modelLimit,
          }
        : {})
    const compactionDiagnostics = applyCompactionDiagnostics({}, {
      ...requestCompaction,
      ...responseCompactionEvent,
    })
    if (accountCompactionApplied) {
      emitOpenAICompactionEvent({
        send,
        persistTimelineEvent,
        threadId: activeThreadId,
        turnId: activeTurnId,
        providerId: String(providerId || ''),
        model: String(model ?? ''),
        status: 'applied',
        mode: 'automatic',
        reason: 'compacted',
        compactionId: String(effectiveAutoCompactionIds[0] || ''),
        selectedCompactionMode: COMPACTION_MODES.CODEX_THREAD_COMPACTION,
        candidateCompactionModes: [COMPACTION_MODES.CODEX_THREAD_COMPACTION, COMPACTION_MODES.LOCAL_SUMMARY],
        compactionEventType: 'codex_thread_compaction',
        compactionEventPhase: 'applied',
        compactionEventOccurred: true,
        strategy: accountCompactionUsageRefreshPayload?.compactionStrategy,
        scope: accountCompactionUsageRefreshPayload?.compactionScope,
        compactionSource: accountCompactionUsageRefreshPayload?.compactionSource,
        usageRefreshState: accountCompactionUsageRefreshPayload?.usageRefreshState,
        remainingContextTokens: accountCompactionUsageRefreshPayload?.contextRemainingTokens,
        threadOccupancyTokens: accountCompactionUsageRefreshPayload?.threadOccupancyTokens,
        estimatedAfterTokens: accountCompactionUsageRefreshPayload?.estimatedOccupancyTokens,
        modelLimit: accountCompactionUsageRefreshPayload?.modelLimit,
        accountBridgeThreadId,
        accountBridgeTurnId: String(responseMeta?.accountBridgeTurnId || ''),
        contextCompactionGeneration,
        emitLifecycleExpansion: false,
      })
    }
    try {
      upsertOpenAIThreadState({
        threadId: activeThreadId,
        projectId: activeProjectId,
        providerId: 'openai',
        model: String(model ?? ''),
        lastResponseId: String(responseMeta?.responseId || ''),
        conversationId: String(responseMeta?.conversationId || ''),
        storeEnabled: shouldStoreOpenAIState,
        toolsetHash,
        systemPromptHash,
        continuitySignature,
        continuityEpoch,
        continuityReducerVersion,
        modeSignature,
        modelSignature,
        lastCompactionId,
        chainValid: extraMeta?.chainValid === false
          ? false
          : !!String(responseMeta?.responseId || '').trim(),
        chainInvalidReason: String(extraMeta?.chainInvalidReason || '').trim() || (
          String(responseMeta?.responseId || '').trim()
            ? ''
            : 'missing_response_id'
        ),
        metadata: threadStateMetadata,
      })
    } catch {
      // Best-effort continuity scaffolding only.
    }
    const continuityPayload = {
      threadId: activeThreadId,
      turnId: activeTurnId,
      round,
      providerId: String(providerId || ''),
      model: String(model ?? ''),
      continuityMode: providerRuntimeSettings?.openai?.continuityMode || 'local_first_hybrid',
      promptCachingEnabled: providerRuntimeSettings?.openai?.promptCachingEnabled !== false,
      compactionStrategy: effectiveCompactionStrategy,
      effectiveCompactionTransport,
      serverSideCompactionEnabled: effectiveServerSideCompactionEnabled,
      serverSideCompactionThresholdTokens: effectiveServerSideCompactionThresholdTokens,
      transportMode,
      hostedToolIds: openaiHostedToolIds,
      previousResponseIdUsed: String(requestContextUsed?.previousResponseId || ''),
      chainInvalidReason: String(
        extraMeta?.chainInvalidReason
        || openAIContinuation?.invalidReason
        || ''
      ),
      storeEnabled: shouldStoreOpenAIState,
      lastCompactionId,
      accountAutoCompactionEnabled,
      accountAutoCompactionMode,
      accountAutoCompactionTokenLimit,
      accountAutoCompactionPromptConfigured,
      ...compactionDiagnostics,
      autoCompactionApplied,
      autoCompactionIds: effectiveAutoCompactionIds,
      ...responseMeta,
    }
    commitProjectedTimelineEvent({
      persistTimelineEvent, send, kind: 'openai_continuity_status',
      options: {
        role: 'system',
        content: String(responseMeta?.responseId || '').trim()
          ? `OpenAI response state tracked: ${String(responseMeta.responseId).trim()}`
          : 'OpenAI response state unavailable for this turn.',
        meta: continuityPayload,
      },
      channel: 'chat:openai-continuity-status', payload: continuityPayload,
    })
  }
}

export async function maybeQueueOpenAIBackgroundTurn({
  openAIContinuityEnabled = false,
  activeAssistantMessageId = '',
  providerId = '',
  apiKey = '',
  history = [],
  options = {},
  providerRuntimeSettings = null,
  activeProjectId = '',
  activeThreadId = '',
  activeTurnId = '',
  tools = {},
  openAIRequestContextForRound = undefined,
  projectFolder = '',
  assistantFinalPhase = '',
  model = '',
  emitOpenAIResponseMeta = () => {},
  rollingUsage = {},
  modelContext = {},
  promptOccupancyEstimateTokens = 0,
  promptOccupancyEstimateConfidence = 'rough_estimate',
  promptOccupancyEstimateMethod = 'history_estimate',
  round = 0,
  send = () => {},
  sendTurnState = () => {},
  persistTimelineEvent = () => {},
  commitFinalTurn = null,
  commitFailureTurn = null,
  emitTurnRuntimeDiagnostics = () => {},
  turnReasoningSegments = [],
  turnToolResults = [],
  userMessage = '',
  continuityRuntime = null,
  mode = '',
  memoryCompressionEnabled = false,
  memoryCompressionThreshold = 0,
  memoryCompressionCooldownMs = 0,
  memoryCompressionMaxPerHour = 0,
  memoryCompressionMinNewLogs = 0,
  loop,
  isAbortError = () => false,
  runPostTurnTasks = () => {},
  touchProjectUsageByThread = () => {},
  prepareOpenAIBackgroundTurn = async () => ({ eligible: false }),
  createOpenAIBackgroundJob = async () => null,
  finalizeOpenAIBackgroundJob = () => {},
  buildChatUsagePayload = () => null,
  emitUsageEvent = () => {},
  emitReasoningDone = () => {},
  asTokenCount = (value) => Number(value || 0) || 0,
} = {}) {
  if (!openAIContinuityEnabled || !activeAssistantMessageId) return false

  const backgroundTurn = await prepareOpenAIBackgroundTurn(
    providerId,
    apiKey,
    history,
    {
      ...options,
      providerRuntimeSettings: providerRuntimeSettings?.openai,
      requestContext: {
        projectFolder,
        projectId: activeProjectId,
        threadId: activeThreadId,
        mode,
        toolNames: Object.keys(tools || {}),
        openai: openAIRequestContextForRound,
      },
    },
  )
  if (backgroundTurn.eligible !== true) return false
  const backgroundRequestContextUsed = (
    openAIRequestContextForRound && typeof openAIRequestContextForRound === 'object'
  )
    ? buildOpenAIRequestContextSnapshot(openAIRequestContextForRound)
    : null

  const backgroundJob = await createOpenAIBackgroundJob({
    apiKey,
    modelId: backgroundTurn.modelId,
    messages: backgroundTurn.messages,
    runtimeSettings: providerRuntimeSettings?.openai,
    openaiOptions: backgroundTurn.openaiOptions || {},
    projectRoot: projectFolder,
    projectId: activeProjectId,
    threadId: activeThreadId,
    turnId: activeTurnId,
    messageId: activeAssistantMessageId,
    requestContextUsed: backgroundRequestContextUsed,
    onCompleted: async ({ job, payload: backgroundPayload }) => {
      const finalAssistantText = String(backgroundPayload.text || '')
      const backgroundFinalDocument = activeAssistantMessageId
        ? buildCanonicalFinalDocument({
          threadId: activeThreadId,
          turnId: activeTurnId,
          messageId: activeAssistantMessageId,
          text: finalAssistantText,
          hasAuthoritativeMessageBinding: true,
        })
        : null
      emitOpenAIResponseMeta(backgroundPayload.providerResponseMeta || {}, {
        chainValid: true,
        chainInvalidReason: '',
        requestContextUsed: backgroundRequestContextUsed,
      })
      const backgroundUsageInput = asTokenCount(backgroundPayload?.usage?.inputTokens)
      const backgroundUsageOutput = asTokenCount(backgroundPayload?.usage?.outputTokens)
      const backgroundUsageReasoning = asTokenCount(backgroundPayload?.usage?.reasoningTokens)
      const backgroundUsageTotal = asTokenCount(backgroundPayload?.usage?.totalTokens)
        || (backgroundUsageInput + backgroundUsageOutput + backgroundUsageReasoning)
      rollingUsage.inputTokens += backgroundUsageInput
      rollingUsage.outputTokens += backgroundUsageOutput
      rollingUsage.reasoningTokens += backgroundUsageReasoning
      rollingUsage.totalTokens += backgroundUsageTotal
      const backgroundProviderUsageAvailable = (
        backgroundUsageInput > 0
        || backgroundUsageOutput > 0
        || backgroundUsageTotal > 0
        || backgroundUsageReasoning > 0
      )
      const backgroundAccountThreadEstimate = (
        String(providerId || '').trim().toLowerCase() === 'openai'
        && String(backgroundPayload?.providerResponseMeta?.authMethod || '').trim().toLowerCase() === 'account'
      )
      const backgroundAccountProviderWindowTelemetry = backgroundAccountThreadEstimate && (
        Number.isFinite(Number(backgroundPayload?.providerResponseMeta?.remainingContextTokens))
        || Number.isFinite(Number(backgroundPayload?.providerResponseMeta?.contextRemainingTokens))
        || Number.isFinite(Number(backgroundPayload?.providerResponseMeta?.remainingTokens))
        || Number.isFinite(Number(backgroundPayload?.providerResponseMeta?.threadOccupancyTokens))
        || Number.isFinite(Number(backgroundPayload?.providerResponseMeta?.contextOccupancyTokens))
        || Number.isFinite(Number(backgroundPayload?.providerResponseMeta?.occupancyTokens))
        || Number.isFinite(Number(backgroundPayload?.providerResponseMeta?.threadCumulativeTotalTokens))
      )
      if (
        backgroundProviderUsageAvailable
        || (
          backgroundAccountThreadEstimate
          && (
            Number(promptOccupancyEstimateTokens || 0) > 0
            || Number(modelContext?.limitTokens || 0) > 0
          )
        )
      ) {
        const usagePayload = buildChatUsagePayload({
          threadId: activeThreadId,
          turnId: activeTurnId,
          providerId,
          usage: backgroundPayload?.usage && typeof backgroundPayload.usage === 'object'
            ? {
              ...backgroundPayload.usage,
              inputTokens: backgroundUsageInput,
              outputTokens: backgroundUsageOutput,
              totalTokens: backgroundUsageTotal,
              ...(backgroundUsageReasoning > 0 ? { reasoningTokens: backgroundUsageReasoning } : {}),
            }
            : {
              inputTokens: backgroundUsageInput,
              outputTokens: backgroundUsageOutput,
              totalTokens: backgroundUsageTotal,
              reasoningTokens: backgroundUsageReasoning,
            },
          providerResponseMeta: backgroundPayload?.providerResponseMeta,
          modelContext,
          promptOccupancyEstimateTokens,
          promptOccupancyEstimateConfidence,
          promptOccupancyEstimateMethod,
          rollingUsage,
          round,
          sourceOverride: backgroundAccountThreadEstimate && !backgroundAccountProviderWindowTelemetry ? 'account_thread_local_estimate' : '',
          limitProvenanceOverride: backgroundAccountThreadEstimate && !backgroundAccountProviderWindowTelemetry ? 'account_thread_local_estimate' : '',
          limitPrecisionOverride: backgroundAccountThreadEstimate && !backgroundAccountProviderWindowTelemetry ? 'estimated' : '',
          occupancySourceOverride: backgroundAccountThreadEstimate && !backgroundAccountProviderWindowTelemetry ? 'thread_local_estimate' : '',
          providerUsageAvailable: backgroundProviderUsageAvailable,
          authMethod: backgroundPayload?.providerResponseMeta?.authMethod,
          transportMode: backgroundPayload?.providerResponseMeta?.transportMode,
        })
        emitUsageEvent({ usagePayload, send, persistTimelineEvent })
      }
      emitReasoningDone({
        send,
        persistTimelineEvent,
        reasoningBuffer: String(backgroundPayload.reasoning || '').trim(),
        usageReasoningTokens: backgroundPayload?.usage?.reasoningTokens,
        threadId: activeThreadId,
        turnId: activeTurnId,
        round,
        providerId,
        model: model ?? '',
        turnReasoningSegments,
      })
      const completedPayload = {
        threadId: activeThreadId,
        turnId: activeTurnId,
        messageId: activeAssistantMessageId,
        assistantMessageId: activeAssistantMessageId,
        jobId: job.id,
        responseId: String(backgroundPayload?.providerResponseMeta?.responseId || ''),
        conversationId: String(backgroundPayload?.providerResponseMeta?.conversationId || ''),
        providerId: String(providerId || ''),
        model: String(model ?? ''),
        full: finalAssistantText,
        reasoning: String(backgroundPayload.reasoning || ''),
        reasoningTokens: Number(backgroundPayload?.usage?.reasoningTokens || 0) || 0,
        usage: backgroundPayload.usage || null,
        stopReason: String(backgroundPayload.stopReason || 'stop'),
        phase: assistantFinalPhase,
        ...(backgroundFinalDocument ? { finalDocument: backgroundFinalDocument } : {}),
        completedAt: Date.now(),
      }
      persistTimelineEvent('background_response_completed', {
        role: 'system',
        content: 'OpenAI background response completed.',
        meta: {
          threadId: activeThreadId,
          turnId: activeTurnId,
          jobId: job.id,
          responseId: String(backgroundPayload?.providerResponseMeta?.responseId || ''),
          model: String(model ?? ''),
          totalTokens: Number(backgroundPayload?.usage?.totalTokens || 0) || 0,
        },
      })
      const assistantMeta = {
        stopReason: String(backgroundPayload.stopReason || ''),
        providerId: String(providerId ?? ''),
        model: String(model ?? ''),
        phase: assistantFinalPhase,
        ...(activeAssistantMessageId ? { assistantMessageId: activeAssistantMessageId } : {}),
        ...(backgroundFinalDocument ? { finalDocument: backgroundFinalDocument } : {}),
      }
      if (typeof commitFinalTurn === 'function') {
        commitFinalTurn({
          doneChannel: 'chat:background-response-completed',
          donePayload: completedPayload,
          assistantMeta,
          terminalPayload: { status: 'ok', reason: 'background_response_completed' },
        })
      } else {
        persistTimelineEvent('assistant_message', {
          role: 'assistant',
          content: finalAssistantText,
          meta: assistantMeta,
        })
        send('chat:background-response-completed', completedPayload)
        sendTurnState('completed', { status: 'ok', reason: 'background_response_completed' })
      }
      finalizeOpenAIBackgroundJob(job.id, {
        completionEventPersisted: true,
        failureEventPersisted: false,
        resultSummary: {
          turnId: activeTurnId,
          promptPreview: String(job?.promptPreview || ''),
          stopReason: String(backgroundPayload.stopReason || ''),
          usage: backgroundPayload.usage || null,
        },
      })
      if (activeThreadId) {
        try {
          touchProjectUsageByThread(activeThreadId, providerId, model ?? '')
        } catch (error) {
          console.warn('[chat-stream-handler] failed to update project usage after background response:', error?.message || error)
        }
      }
      try {
        continuityRuntime?.persistTurnContinuity?.({
          assistantText: finalAssistantText,
          toolResults: turnToolResults,
          userMessage,
        })
      } catch (error) {
        console.warn('[chat-stream-handler] failed to persist background turn continuity:', error?.message || error)
      }
      runPostTurnTasks({
        projectFolder,
        userMessage,
        assistantText: finalAssistantText,
        reasoningSegments: turnReasoningSegments,
        turnToolResults,
        mode,
        memoryCompressionEnabled,
        memoryCompressionThreshold,
        memoryCompressionCooldownMs,
        memoryCompressionMaxPerHour,
        memoryCompressionMinNewLogs,
        providerId,
        apiKey,
        model: model ?? '',
        loop,
        send,
        persistTimelineEvent,
        activeThreadId,
        activeTurnId,
        isAbortError,
      })
    },
    onFailed: async ({ job, cancelled, message }) => {
      emitOpenAIResponseMeta({
        responseId: String(job?.responseId || ''),
        conversationId: String(job?.conversationId || ''),
        background: true,
        status: cancelled ? 'cancelled' : 'failed',
      }, {
        chainValid: false,
        chainInvalidReason: cancelled ? 'background_cancelled' : 'background_failed',
        requestContextUsed: backgroundRequestContextUsed,
      })
      const failedPayload = {
        threadId: activeThreadId,
        turnId: activeTurnId,
        messageId: activeAssistantMessageId,
        jobId: job?.id || '',
        responseId: String(job?.responseId || ''),
        providerId: String(providerId || ''),
        model: String(model ?? ''),
        message: String(message || ''),
        cancelled: cancelled === true,
        failedAt: Date.now(),
      }
      const failureMeta = {
        threadId: activeThreadId,
        turnId: activeTurnId,
        jobId: job?.id || '',
        responseId: String(job?.responseId || ''),
        cancelled: cancelled === true,
      }
      if (typeof commitFailureTurn === 'function') {
        commitFailureTurn({
          message: String(message || 'OpenAI background response failed.'),
          reason: cancelled === true ? 'background_cancelled' : 'background_failed',
          errorMeta: failureMeta,
          terminalPayload: { status: cancelled === true ? 'cancelled' : 'error' },
          errorChannel: 'chat:background-response-failed',
          errorPayload: failedPayload,
        })
      } else {
        persistTimelineEvent('background_response_failed', {
          role: 'system',
          content: String(message || 'OpenAI background response failed.'),
          meta: failureMeta,
        })
        send('chat:background-response-failed', failedPayload)
        sendTurnState('completed', {
          status: cancelled === true ? 'cancelled' : 'error',
          reason: cancelled === true ? 'background_cancelled' : 'background_failed',
        })
      }
      finalizeOpenAIBackgroundJob(String(job?.id || ''), {
        failureEventPersisted: true,
        completionEventPersisted: false,
        errorCode: cancelled === true ? 'cancelled' : 'background_failed',
        errorMessage: String(message || ''),
      })
    },
  })
  emitOpenAIResponseMeta(backgroundJob.providerResponseMeta || {}, {
    chainValid: false,
    chainInvalidReason: 'background_pending',
    requestContextUsed: backgroundRequestContextUsed,
  })
  const queuedPayload = {
    threadId: activeThreadId,
    turnId: activeTurnId,
    messageId: activeAssistantMessageId,
    jobId: backgroundJob.job.id,
    responseId: String(backgroundJob.providerResponseMeta?.responseId || ''),
    conversationId: String(backgroundJob.providerResponseMeta?.conversationId || ''),
    providerId: String(providerId || ''),
    model: String(model ?? ''),
    queuedAt: Date.now(),
    note: 'OpenAI background response queued. Open Jobs to monitor progress or stop it.',
  }
  commitProjectedTimelineEvent({
    persistTimelineEvent, send, kind: 'background_response_queued',
    options: {
      role: 'system',
      content: 'OpenAI background response queued.',
      meta: {
        threadId: activeThreadId,
        turnId: activeTurnId,
        jobId: backgroundJob.job.id,
        responseId: String(backgroundJob.providerResponseMeta?.responseId || ''),
        model: String(model ?? ''),
      },
    },
    channel: 'chat:background-response-queued', payload: queuedPayload,
  })
  sendTurnState('background_queued', {
    status: 'queued_background',
    label: 'background response queued',
    reason: 'openai_background_response_queued',
  })
  finalizeOpenAIBackgroundJob(backgroundJob.job.id, {
    queuedEventPersisted: true,
    resultSummary: {
      turnId: activeTurnId,
      promptPreview: String(backgroundJob?.job?.promptPreview || ''),
    },
  })
  emitTurnRuntimeDiagnostics({ backgroundQueued: true })
  return true
}
