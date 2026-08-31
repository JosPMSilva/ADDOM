import { COMPACTION_MODES } from './continuity/compaction-mode-contract.mjs'
import { buildInterruptedReasoningSnapshot } from './chat-turn-events.mjs'
import { emitOpenAICompactionEvent } from './chat-stream-precall-compaction-helpers.mjs'
import { createOpenAICollaborationIngestHandler, settleProviderStreamWithCollaboration } from './chat-stream-openai-collaboration-ingest.mjs'
import { normalizeProviderTextChunk } from '../../common/chat/canonical-turn-engine.mjs'
import { REASONING_PHASE_BOUNDARY } from '../../common/chat/reasoning-phase-boundary.mjs'
import { splitTerminalTextByExactPrefix } from '../../common/chat/terminal-text-ownership.mjs'
import { buildAssistantHistoryParts, shouldIncludeReasoningPartInAssistantToolHistory } from '../api-clients/ai-provider.mjs'
import { createProviderToolStatusHandler, createProviderWarningHandler } from './chat-stream-provider-status.mjs'
import { createProviderGeneratedArtifactRuntime } from './chat-stream-generated-artifacts.mjs'
import { commitProjectedTimelineEvent } from './canonical-root-event-writer.mjs'
import { createAccountContextUsageUpdateHandler } from './chat-account-context-usage-update.mjs'
import { createProgressiveExecutionChunkWriter } from './chat-stream-progressive-chunks.mjs'
import {
  buildDeferredFinalTextPayload,
  createProviderTextChunkRouter,
} from './chat-stream-text-routing.mjs'
import { createReasoningPhaseRuntime } from './chat-stream-reasoning-phases.mjs'

const KNOWN_PROVIDER_SETTING_KEYS = new Set(['openai', 'anthropic', 'gemini', 'google', 'groq', 'mistral', 'ollama', 'moonshot', 'xai', 'perplexity'])
function resolveScopedProviderRuntimeSettings(providerId = '', providerRuntimeSettings = null) {
  if (!providerRuntimeSettings || typeof providerRuntimeSettings !== 'object' || Array.isArray(providerRuntimeSettings)) {
    return providerRuntimeSettings
  }
  const normalizedProviderId = String(providerId || '').trim().toLowerCase()
  if (!normalizedProviderId) return providerRuntimeSettings
  const directMatch = providerRuntimeSettings[providerId]
  if (directMatch && typeof directMatch === 'object' && !Array.isArray(directMatch)) {
    return directMatch
  }
  const scopedEntry = Object.entries(providerRuntimeSettings).find(([key, value]) => (
    String(key || '').trim().toLowerCase() === normalizedProviderId
    && value
    && typeof value === 'object'
    && !Array.isArray(value)
  ))
  if (scopedEntry) return scopedEntry[1]
  const looksLikeProviderSettingsMap = Object.keys(providerRuntimeSettings)
    .some((key) => KNOWN_PROVIDER_SETTING_KEYS.has(String(key || '').trim().toLowerCase()))
  return looksLikeProviderSettingsMap ? null : providerRuntimeSettings
}

export async function executeProviderModelStream({
  providerId = '',
  apiKey = '',
  history = [],
  options = {},
  providerRuntimeSettings = null,
  projectFolder = '',
  activeProjectId = '',
  activeThreadId = '',
  activeTurnId = '',
  activeAssistantMessageId = '',
  mode = 'execute',
  tools = {},
  openAIRequestContextForRound = undefined,
  providerRequestContextForRound = undefined,
  round = 0,
  model = '',
  send = () => {},
  persistTimelineEvent = () => {},
  sendNotice = () => {},
  buildChatUsagePayload = () => null,
  modelContext = {},
  promptOccupancyEstimateTokens = 0,
  promptOccupancyEstimateConfidence = 'rough_estimate',
  promptOccupancyEstimateMethod = 'history_estimate',
  rollingUsage = {},
  resolveLatestContextUsage,
  createStreamWithTools,
} = {}) {
  const resolvedProviderRuntimeSettings = resolveScopedProviderRuntimeSettings(providerId, providerRuntimeSettings)
  const commitProjection = (kind, eventOptions, channel, payload) => commitProjectedTimelineEvent({
    persistTimelineEvent, send, kind, options: eventOptions, channel, payload,
  })
  let reasoningBuffer = ''
  let reasoningChunkSequence = 0
  const generatedArtifactRuntime = createProviderGeneratedArtifactRuntime({
    projectId: activeProjectId,
    threadId: activeThreadId,
    turnId: activeTurnId,
    round,
    providerId,
    model,
    send,
    persistTimelineEvent,
  })
  const persistProviderToolStatus = createProviderToolStatusHandler({
    send, persistTimelineEvent, threadId: activeThreadId, turnId: activeTurnId, round, providerId, model,
  })
  const reasoningPhases = createReasoningPhaseRuntime({
    providerId, round, threadId: activeThreadId, turnId: activeTurnId, model, send,
    onProviderToolStatus: persistProviderToolStatus,
    onProviderToolOutput: generatedArtifactRuntime.handleProviderToolOutput,
  })
  const handleProviderWarning = createProviderWarningHandler({ providerId, sendNotice })
  const executionChunks = createProgressiveExecutionChunkWriter({
    persistTimelineEvent, threadId: activeThreadId, turnId: activeTurnId,
    assistantMessageId: activeAssistantMessageId, round, providerId, model,
  })
  const textChunks = createProviderTextChunkRouter({
    tools, send, executionChunks, reasoningPhases, threadId: activeThreadId,
    turnId: activeTurnId, round, providerId, model,
  })
  const emitReasoningChunk = (chunk) => {
    reasoningBuffer += chunk
    const { currentBuffer, segment } = reasoningPhases.append(chunk)
    const emittedAt = Date.now()
    const sequence = ++reasoningChunkSequence
    executionChunks.write('execution_reasoning_chunk', {
      content: currentBuffer, sequence, emittedAt, reasoningSegment: segment,
    })
    send('chat:reasoning-chunk', {
      chunk,
      threadId: activeThreadId,
      turnId: activeTurnId,
      round,
      reasoningSegment: segment,
      providerId: String(providerId || ''),
      model: String(model ?? ''),
      sequence,
      emittedAt,
    })
  }
  const collaborationIngest = createOpenAICollaborationIngestHandler(
    { providerId, projectId: activeProjectId, threadId: activeThreadId, turnId: activeTurnId, modelId: model },
  )
  const streamPromise = createStreamWithTools(
    providerId,
    apiKey,
    history,
    {
      ...options,
      providerRuntimeSettings: resolvedProviderRuntimeSettings,
      requestContext: {
        ...(providerRequestContextForRound && typeof providerRequestContextForRound === 'object'
          ? providerRequestContextForRound
          : {}),
        projectFolder: String(projectFolder || '').trim(),
        projectId: activeProjectId,
        threadId: activeThreadId,
        mode,
        toolNames: Object.keys(tools || {}),
        openai: openAIRequestContextForRound,
      },
      onSource: (sourcePayload) => {
        const baseMeta = {
          threadId: activeThreadId,
          turnId: activeTurnId,
          round,
          providerId: String(providerId || ''),
          model: String(model ?? ''),
        }
        if (sourcePayload?.type === 'source-url') {
          const payload = { ...baseMeta, ...sourcePayload }
          commitProjection('source_url', {
            role: 'assistant',
            content: String(sourcePayload.title || sourcePayload.url || 'Source'),
            meta: payload,
          }, 'chat:source-url', payload)
        } else if (sourcePayload?.type === 'source-document') {
          const payload = { ...baseMeta, ...sourcePayload }
          commitProjection('source_document', {
            role: 'assistant',
            content: String(sourcePayload.title || sourcePayload.filename || 'Source document'),
            meta: payload,
          }, 'chat:source-document', payload)
        }
      },
      onProviderToolStatus: reasoningPhases.handleProviderToolStatus,
      onProviderToolOutput: reasoningPhases.handleProviderToolOutput,
      onProviderToolBoundary: reasoningPhases.markProviderToolBoundary,
      onContextUsageUpdate: createAccountContextUsageUpdateHandler({
        activeThreadId, activeTurnId, providerId, modelContext,
        promptOccupancyEstimateTokens, promptOccupancyEstimateConfidence,
        promptOccupancyEstimateMethod, rollingUsage, round,
        buildChatUsagePayload, send, persistTimelineEvent, resolveLatestContextUsage,
      }),
      onCompactionEvent: (compactionPayload = {}) => {
        emitOpenAICompactionEvent({
          send,
          persistTimelineEvent,
          threadId: activeThreadId,
          turnId: activeTurnId,
          providerId: String(providerId || ''),
          model: String(model ?? ''),
          ...compactionPayload,
        })
      },
      onCollaborationEvent: collaborationIngest,
      onProviderWarning: handleProviderWarning,
      onTransportStatus: (statusPayload) => {
        const payload = {
          threadId: activeThreadId,
          turnId: activeTurnId,
          round,
          providerId: String(providerId || ''),
          model: String(model ?? ''),
          ...statusPayload,
        }
        commitProjection('openai_websocket_reconnect', {
          role: 'system',
          content: String(statusPayload?.status || 'reconnecting'),
          meta: payload,
        }, 'chat:openai-websocket-reconnect', payload)
      },
    },
    textChunks.handle,
    (chunkPayload, metadata = {}) => {
      const normalizedChunk = normalizeProviderTextChunk(chunkPayload); const { chunk } = normalizedChunk
      const boundaryBefore = metadata?.boundaryBefore === true || normalizedChunk.boundaryBefore === true
      if (!chunk) return
      if (boundaryBefore && reasoningBuffer) emitReasoningChunk(REASONING_PHASE_BOUNDARY)
      emitReasoningChunk(chunk)
    },
  )
  let streamResult = null
  let streamSettled = false
  try {
    streamResult = await settleProviderStreamWithCollaboration(streamPromise, collaborationIngest)
    streamSettled = true
    const latestUserMessage = [...history].reverse().find((entry) => entry?.role === 'user')
    const textSnapshot = textChunks.snapshot()
    const recoveredTerminalText = splitTerminalTextByExactPrefix({
      text: textSnapshot.deferredUnphasedTextBuffer,
      instructionText: typeof latestUserMessage?.content === 'string' ? latestUserMessage.content : '',
      hasToolContext: Object.keys(tools || {}).length > 0
        && !(Array.isArray(streamResult?.toolCalls) && streamResult.toolCalls.length > 0),
    })
    if (recoveredTerminalText.commentaryParts.length > 0) {
      recoveredTerminalText.commentaryParts.forEach((chunk, index) => {
        textChunks.handle({ chunk, phase: 'commentary', boundaryBefore: index > 0 })
      })
      textChunks.handle({ chunk: recoveredTerminalText.finalText, phase: 'final_answer' })
      streamResult = { ...streamResult, text: recoveredTerminalText.finalText }
    } else {
      const deferredFinalPayload = buildDeferredFinalTextPayload({
        deferredText: textSnapshot.deferredUnphasedTextBuffer, streamResult, threadId: activeThreadId,
        turnId: activeTurnId, round, providerId, model, sequence: textSnapshot.textChunkSequence + 1,
      })
      if (deferredFinalPayload) send('chat:chunk', deferredFinalPayload)
    }
    const phase = reasoningPhases.snapshot()
    const settledText = textChunks.snapshot()
    executionChunks.settle({
      reasoningContent: phase.currentBuffer, reasoningSequence: reasoningChunkSequence, reasoningSegment: phase.segment,
      commentaryContent: phase.currentCommentaryBuffer, commentarySequence: settledText.commentaryChunkSequence,
      commentarySegment: phase.segment,
      lifecycle: 'completed',
    })
  } catch (error) {
    if (!streamSettled) {
      const phase = reasoningPhases.snapshot()
      const failedText = textChunks.snapshot()
      executionChunks.settle({
        reasoningContent: phase.currentBuffer, reasoningSequence: reasoningChunkSequence, reasoningSegment: phase.segment,
        commentaryContent: phase.currentCommentaryBuffer, commentarySequence: failedText.commentaryChunkSequence,
        commentarySegment: phase.segment,
        lifecycle: 'failed',
      })
    }
    throw error
  } finally {
    await generatedArtifactRuntime.settle()
  }

  const phase = reasoningPhases.snapshot()
  const textSnapshot = textChunks.snapshot()
  return {
    ...streamResult,
    reasoningBuffer,
    currentReasoningBuffer: phase.currentBuffer,
    reasoningSegment: phase.segment,
    commentaryBuffer: textSnapshot.commentaryBuffer,
    reasoningChunkCount: reasoningChunkSequence,
    commentaryChunkCount: textSnapshot.commentaryChunkSequence,
    providerReasoningParts: Array.isArray(streamResult?.providerReasoningParts)
      ? streamResult.providerReasoningParts
      : [],
    generatedArtifacts: generatedArtifactRuntime.snapshot(),
  }
}

export { resolveScopedProviderRuntimeSettings }

function isBlankAssistantCompletion(text = '') {
  return String(text ?? '').trim().length === 0
}

function buildAnthropicCompactionEventPayload({
  providerResponseMeta = null,
  providerRequestContextForRound = undefined,
  threadId = '',
  turnId = '',
  round = 0,
  providerId = '',
  model = '',
} = {}) {
  if (String(providerId || '').trim().toLowerCase() !== 'anthropic') return null
  if (!providerResponseMeta || typeof providerResponseMeta !== 'object') return null
  if (providerResponseMeta.compactionApplied !== true) return null

  const anthropicRequestContext = providerRequestContextForRound?.anthropic
    && typeof providerRequestContextForRound.anthropic === 'object'
    ? providerRequestContextForRound.anthropic
    : {}
  const thresholdTokens = Number(anthropicRequestContext.contextManagementCompactionThresholdTokens || 0) || 0
  const appliedEdits = Array.isArray(providerResponseMeta.contextManagementAppliedEdits)
    ? providerResponseMeta.contextManagementAppliedEdits.map((value) => String(value || '').trim()).filter(Boolean)
    : []
  const usageIterations = Array.isArray(providerResponseMeta.usageIterations)
    ? providerResponseMeta.usageIterations
      .map((iteration) => {
        const type = String(iteration?.type || '').trim().toLowerCase()
        if (!type) return null
        return {
          type,
          inputTokens: Number(iteration?.inputTokens || 0) || 0,
          outputTokens: Number(iteration?.outputTokens || 0) || 0,
        }
      })
      .filter(Boolean)
    : []

  return {
    threadId: String(threadId || '').trim(),
    turnId: String(turnId || '').trim(),
    round: Number(round || 0) || 0,
    providerId: 'anthropic',
    model: String(model || providerResponseMeta.modelId || '').trim(),
    status: 'applied',
    strategy: 'anthropic_context_management',
    scope: 'partial_reduce',
    source: 'provider',
    usageRefreshState: 'none',
    selectedCompactionMode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
    candidateCompactionModes: [COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION, COMPACTION_MODES.LOCAL_SUMMARY],
    compactionEventType: 'anthropic_context_management',
    compactionEventPhase: 'applied',
    compactionEventOccurred: true,
    contextManagementApplied: providerResponseMeta.contextManagementApplied === true,
    contextManagementAppliedEdits: appliedEdits,
    compactionApplied: true,
    compactionSummaryDetected: providerResponseMeta.compactionSummaryDetected === true,
    contextManagementCompactionThresholdTokens: thresholdTokens > 0 ? thresholdTokens : undefined,
    usageIterations: usageIterations.length > 0 ? usageIterations : undefined,
  }
}

function shouldEmitThreadUsageEstimate({
  providerId = '',
  providerResponseMeta = null,
  usageTotal = 0,
  usageInput = 0,
  usageOutput = 0,
  usageReasoning = 0,
  promptOccupancyEstimateTokens = 0,
  modelContext = {},
} = {}) {
  if (usageInput > 0 || usageOutput > 0 || usageTotal > 0 || usageReasoning > 0) return true
  const normalizedProviderId = String(providerId || '').trim().toLowerCase()
  const authMethod = String(providerResponseMeta?.authMethod || '').trim().toLowerCase()
  if (normalizedProviderId !== 'openai' || authMethod !== 'account') return false
  return (
    Number(promptOccupancyEstimateTokens || 0) > 0
    || Number(modelContext?.limitTokens || 0) > 0
  )
}

function shouldPreferStreamedOpenAICommentary({
  providerId = '',
  providerResponseMeta = null,
  commentaryChunkCount = 0,
} = {}) {
  if ((Number(commentaryChunkCount || 0) || 0) <= 0) return false
  if (String(providerId || '').trim().toLowerCase() !== 'openai') return false
  const authMethod = String(providerResponseMeta?.authMethod || '').trim().toLowerCase()
  if (authMethod === 'account') return false
  const transportMode = String(providerResponseMeta?.transportMode || '').trim().toLowerCase()
  return transportMode === 'responses_stream'
}

function hasAccountProviderWindowTelemetry(providerResponseMeta = null) {
  if (!providerResponseMeta || typeof providerResponseMeta !== 'object') return false
  return (
    Number.isFinite(Number(providerResponseMeta.remainingContextTokens))
    || Number.isFinite(Number(providerResponseMeta.contextRemainingTokens))
    || Number.isFinite(Number(providerResponseMeta.remainingTokens))
    || Number.isFinite(Number(providerResponseMeta.threadOccupancyTokens))
    || Number.isFinite(Number(providerResponseMeta.contextOccupancyTokens))
    || Number.isFinite(Number(providerResponseMeta.occupancyTokens))
    || Number.isFinite(Number(providerResponseMeta.threadCumulativeTotalTokens))
  )
}

export function finalizeProviderModelRound({
  streamResult = {},
  errorDiagnostics = {},
  turnStartedAt = 0,
  rollingUsage = {},
  asTokenCount = (value) => Number(value || 0) || 0,
  buildChatUsagePayload = () => null,
  emitUsageEvent = () => {},
  send = () => {},
  persistTimelineEvent = () => {},
  modelContext = {},
  promptOccupancyEstimateTokens = 0,
  promptOccupancyEstimateConfidence = 'rough_estimate',
  promptOccupancyEstimateMethod = 'history_estimate',
  round = 0,
  emitReasoningDone = () => {},
  activeThreadId = '',
  activeTurnId = '',
  activeAssistantMessageId = '',
  providerId = '',
  model = '',
  turnReasoningSegments = [],
  openAIContinuityEnabled = false,
  openAIRequestContextForRound = undefined,
  providerRequestContextForRound = undefined,
  updateOpenAIContinuationContext = (value) => value,
  emitOpenAIResponseMeta = () => {},
  resolveOpenAIContinuationPersistence = () => ({}),
  repeatedToolCallState = null,
  recordRepeatedToolCallBatch = () => ({ blocked: false }),
  commitFailureTurn = null,
  maxConsecutiveIdenticalToolRounds = 3,
  pushUniqueRuntimeValue = () => {},
  sendNotice = () => {},
  sendTurnState = () => {},
  loop,
  finalizeRoundWithoutTools = () => {},
  touchProjectUsageByThread = () => {},
  continuityRuntime = null,
  runPostTurnTasks = () => {},
  projectFolder = '',
  userMessage = '',
  turnToolResults = [],
  mode = '',
  memoryCompressionEnabled = false,
  memoryCompressionThreshold = 0,
  memoryCompressionCooldownMs = 0,
  memoryCompressionMaxPerHour = 0,
  memoryCompressionMinNewLogs = 0,
  apiKey = '',
  isAbortError = () => false,
  assistantFinalPhase = '',
  assistantCommentaryPhase = '',
  buildAssistantToolUseMessage = () => ({}),
  history = [],
  detectTextualApprovalRequestWithoutToolCall = () => false,
  allowBlankAssistantCompletion = false,
} = {}) {
  const {
    stopReason,
    text,
    toolCalls,
    usage,
    reasoning,
    providerResponseMeta,
    reasoningBuffer: initialReasoningBuffer,
    commentaryBuffer: streamedCommentaryBuffer,
    reasoningChunkCount = 0,
    commentaryChunkCount = 0,
    providerReasoningParts = [],
    generatedArtifacts = [],
  } = streamResult

  const authoritativeReasoning = String(reasoning ?? '').trim()
  const reasoningBuffer = authoritativeReasoning || initialReasoningBuffer
  const reasoningSnapshot = buildInterruptedReasoningSnapshot({
    turnReasoningSegments,
    reasoningBuffer,
  })
  if (
    errorDiagnostics.mode === 'execute'
    && Number(errorDiagnostics.requestedToolCount || 0) > 0
    && (!Array.isArray(toolCalls) || toolCalls.length === 0)
    && detectTextualApprovalRequestWithoutToolCall(text)
  ) {
    errorDiagnostics.modelTextualApprovalWithoutToolCall = true
    errorDiagnostics.modelTextualApprovalCueCount += 1
  }
  if (Array.isArray(toolCalls) && toolCalls.length > 0) {
    errorDiagnostics.toolCallCount += toolCalls.length
    errorDiagnostics.modelEmittedToolCalls = true
    for (const toolCall of toolCalls) {
      const toolName = String(toolCall?.name || '').trim()
      if (!toolName) continue
      const exists = errorDiagnostics.usedTools
        .some((value) => String(value || '').trim().toLowerCase() === toolName.toLowerCase())
      if (!exists) errorDiagnostics.usedTools.push(toolName)
    }
    if (Number(errorDiagnostics.firstToolLatencyMs || 0) <= 0) {
      errorDiagnostics.firstToolLatencyMs = Math.max(0, Date.now() - turnStartedAt)
    }
  }

  const usageInput = asTokenCount(usage?.inputTokens)
  const usageOutput = asTokenCount(usage?.outputTokens)
  const usageReasoning = asTokenCount(usage?.reasoningTokens)
  const usageTotal = asTokenCount(usage?.totalTokens)
    || (usageInput + usageOutput + usageReasoning)
  const providerUsageAvailable = usageInput > 0 || usageOutput > 0 || usageTotal > 0 || usageReasoning > 0
  rollingUsage.inputTokens += usageInput
  rollingUsage.outputTokens += usageOutput
  rollingUsage.reasoningTokens += usageReasoning
  rollingUsage.totalTokens += usageTotal
  errorDiagnostics.rollingTotalTokens = Number(rollingUsage.totalTokens || 0) || 0

  if (shouldEmitThreadUsageEstimate({
    providerId,
    providerResponseMeta,
    usageTotal,
    usageInput,
    usageOutput,
    usageReasoning,
    promptOccupancyEstimateTokens,
    modelContext,
  })) {
    const accountThreadEstimate = (
      String(providerId || '').trim().toLowerCase() === 'openai'
      && String(providerResponseMeta?.authMethod || '').trim().toLowerCase() === 'account'
    )
    const accountProviderWindowTelemetry = accountThreadEstimate
      && hasAccountProviderWindowTelemetry(providerResponseMeta)
    const normalizedProviderUsage = usage && typeof usage === 'object'
      ? {
        ...usage,
        inputTokens: usageInput,
        outputTokens: usageOutput,
        totalTokens: usageTotal,
        ...(usageReasoning > 0 ? { reasoningTokens: usageReasoning } : {}),
      }
      : null
    const usagePayload = buildChatUsagePayload({
      threadId: activeThreadId,
      turnId: activeTurnId,
      providerId,
      usage: normalizedProviderUsage,
      providerResponseMeta,
      modelContext,
      promptOccupancyEstimateTokens,
      promptOccupancyEstimateConfidence,
      promptOccupancyEstimateMethod,
      rollingUsage,
      round,
      sourceOverride: accountThreadEstimate && !accountProviderWindowTelemetry ? 'account_thread_local_estimate' : '',
      limitProvenanceOverride: accountThreadEstimate && !accountProviderWindowTelemetry ? 'account_thread_local_estimate' : '',
      limitPrecisionOverride: accountThreadEstimate && !accountProviderWindowTelemetry ? 'estimated' : '',
      occupancySourceOverride: accountThreadEstimate && !accountProviderWindowTelemetry ? 'thread_local_estimate' : '',
      providerUsageAvailable,
      authMethod: providerResponseMeta?.authMethod,
      transportMode: providerResponseMeta?.transportMode,
    })
    emitUsageEvent({ usagePayload, send, persistTimelineEvent })
  }

  emitReasoningDone({
    send,
    persistTimelineEvent,
    reasoningBuffer,
    currentReasoningBuffer: streamResult.currentReasoningBuffer,
    usageReasoningTokens: usage?.reasoningTokens,
    threadId: activeThreadId,
    turnId: activeTurnId,
    round,
    reasoningSegment: streamResult.reasoningSegment,
    providerId,
    model: model ?? '',
    assistantMessageId: activeAssistantMessageId,
    turnReasoningSegments,
    persistExecutionChunk: Number(reasoningChunkCount || 0) <= 0,
  })

  const persistedCommentaryText = String(streamedCommentaryBuffer || '').trim()

  let nextOpenAIRequestContext = openAIRequestContextForRound
  if (openAIContinuityEnabled && providerResponseMeta && typeof providerResponseMeta === 'object') {
    nextOpenAIRequestContext = updateOpenAIContinuationContext(openAIRequestContextForRound, providerResponseMeta)
    emitOpenAIResponseMeta(providerResponseMeta, {
      ...resolveOpenAIContinuationPersistence({
        responseMeta: providerResponseMeta,
        toolCalls,
        stopReason,
      }),
      requestContextUsed: openAIRequestContextForRound,
    })
  }

  const anthropicCompactionEvent = buildAnthropicCompactionEventPayload({
    providerResponseMeta,
    providerRequestContextForRound,
    threadId: activeThreadId,
    turnId: activeTurnId,
    round,
    providerId,
    model,
  })
  if (anthropicCompactionEvent) {
    commitProjectedTimelineEvent({
      persistTimelineEvent, send, kind: 'anthropic_compaction_event',
      options: {
      role: 'system',
      content: 'Anthropic context compaction applied.',
      meta: anthropicCompactionEvent,
      },
      channel: 'chat:anthropic-compaction-event', payload: anthropicCompactionEvent,
    })
  }

  const repeatedToolBatch = recordRepeatedToolCallBatch({
    state: repeatedToolCallState,
    toolCalls,
    maxConsecutiveIdenticalRounds: maxConsecutiveIdenticalToolRounds,
  })
  if (repeatedToolBatch.blocked) {
    const message = `Stopped after ${maxConsecutiveIdenticalToolRounds} identical tool-call rounds. Same tool batch kept repeating without progress.`
    pushUniqueRuntimeValue(errorDiagnostics.guardrailFailures, 'repeated_tool_call_loop')
    sendNotice({
      type: 'warning',
      text: message,
      meta: {
        reason: 'repeated_tool_call_loop',
        repeatedCount: repeatedToolBatch.repeatedCount,
        threshold: repeatedToolBatch.threshold,
      },
    })
    const failureMeta = {
      reason: 'repeated_tool_call_loop',
      repeatedCount: repeatedToolBatch.repeatedCount,
      threshold: repeatedToolBatch.threshold,
      ...(activeThreadId ? { threadId: String(activeThreadId || '') } : {}),
      ...(activeTurnId ? { turnId: String(activeTurnId || '') } : {}),
      ...(reasoningSnapshot ? { reasoningSnapshot } : {}),
    }
    if (typeof commitFailureTurn === 'function') {
      commitFailureTurn({ message, reason: 'repeated_tool_call_loop', errorMeta: failureMeta })
    } else {
      persistTimelineEvent('chat_error', {
        role: 'system',
        content: message,
        meta: failureMeta,
      })
      send('chat:error', { message })
      sendTurnState('completed', { status: 'error', reason: 'repeated_tool_call_loop' })
    }
    return { shouldBreakRoundLoop: true, nextOpenAIRequestContext }
  }

  if (loop.cancelled) {
    return { shouldBreakRoundLoop: true, nextOpenAIRequestContext }
  }

  if (!toolCalls.length) {
    if (isBlankAssistantCompletion(text) && !allowBlankAssistantCompletion) {
      const message = 'The provider returned no assistant text for this turn.'
      pushUniqueRuntimeValue(errorDiagnostics.guardrailFailures, 'no_output_generated')
      errorDiagnostics.failure_reason_code = 'no_output'
      errorDiagnostics.failure_message_sanitized = message
      errorDiagnostics.next_action_hint = 'Retry once, start a fresh thread if it repeats, or switch model/provider.'
      const failureMeta = {
        threadId: String(activeThreadId || ''),
        turnId: String(activeTurnId || ''),
        providerId: String(providerId || ''),
        model: String(model || ''),
        round,
        reason: 'no_output',
        ...(reasoningSnapshot ? { reasoningSnapshot } : {}),
      }
      if (typeof commitFailureTurn === 'function') {
        commitFailureTurn({ message, reason: 'no_output', errorMeta: failureMeta })
      } else {
        persistTimelineEvent('chat_error', {
          role: 'system',
          content: `Error: ${message}`,
          meta: failureMeta,
      })
      send('chat:error', { message })
      sendTurnState('completed', { status: 'error', reason: 'No output generated. Check the stream for errors.' })
      }
      return { shouldBreakRoundLoop: true, nextOpenAIRequestContext }
    }

    finalizeRoundWithoutTools({
      send,
      persistTimelineEvent,
      sendTurnState,
      touchProjectUsageByThread,
      continuityRuntime,
      runPostTurnTasks,
      projectFolder,
      userMessage,
      assistantText: text,
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
      isAbortError,
      threadId: activeThreadId,
      turnId: activeTurnId,
      round,
      stopReason,
      assistantMessageId: activeAssistantMessageId,
      assistantPhase: assistantFinalPhase,
      assistantHistoryParts: buildAssistantHistoryParts(text, {
        reasoningText: reasoningBuffer || reasoning || '',
        includeReasoningPart: shouldIncludeReasoningPartInAssistantToolHistory(providerId),
        providerReasoningParts,
      }),
      generatedArtifacts,
    })
    return { shouldBreakRoundLoop: true, nextOpenAIRequestContext }
  }

  const assistantMsg = buildAssistantToolUseMessage(text, toolCalls, {
    reasoningText: reasoningBuffer || reasoning || '',
    phase: assistantCommentaryPhase,
    includeReasoningPart: shouldIncludeReasoningPartInAssistantToolHistory(providerId),
    providerReasoningParts,
  })
  history.push(assistantMsg)

  const assistantCommentaryText = String(persistedCommentaryText || text || '').trim()
  const preserveStreamedCommentaryAsCanonical = shouldPreferStreamedOpenAICommentary({
    providerId,
    providerResponseMeta,
    commentaryChunkCount,
  })
  if (assistantCommentaryText && !preserveStreamedCommentaryAsCanonical) {
    const commentaryPayload = {
      text: assistantCommentaryText,
      threadId: activeThreadId,
      turnId: activeTurnId,
      round,
      providerId: String(providerId || ''),
      model: String(model ?? ''),
      phase: assistantCommentaryPhase,
      emittedAt: Date.now(),
    }
    commitProjectedTimelineEvent({
      persistTimelineEvent, send, kind: 'execution_commentary_chunk',
      options: {
      role: 'assistant',
      content: assistantCommentaryText,
      meta: {
        ...commentaryPayload,
        assistantMessageId: String(activeAssistantMessageId || ''),
      },
      },
      channel: 'chat:assistant-commentary', payload: commentaryPayload,
    })
  }

  const toolsPendingPayload = {
    count: toolCalls.length,
    threadId: activeThreadId,
    turnId: activeTurnId,
    round,
  }
  commitProjectedTimelineEvent({
    persistTimelineEvent, send, kind: 'tool_pending',
    options: {
      role: 'assistant',
      content: `Preparing ${toolCalls.length} action${toolCalls.length === 1 ? '' : 's'}...`,
      meta: toolsPendingPayload,
    },
    channel: 'chat:tools-pending', payload: toolsPendingPayload,
  })

  return {
    shouldBreakRoundLoop: false,
    toolCalls,
    nextOpenAIRequestContext,
  }
}
