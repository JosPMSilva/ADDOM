import { updateOpenAIContinuationContext } from '../api-clients/openai-continuation-context.mjs'
import { COMPACTION_MODES } from './continuity/compaction-mode-contract.mjs'
import { resolveFallbackCompactionMode } from './continuity/openai-precall-compaction-decision.mjs'
import { tryOpenAIProviderNativeCompaction } from './continuity/provider-native/openai-provider-native-compaction.mjs'
import {
  emitCompactionNotice,
  emitOpenAICompactionEvent,
} from './chat-stream-precall-compaction-helpers.mjs'
import {
  __resetOpenAIAccountAuthServiceGetterForTests as resetOpenAIAccountAuthServiceGetterForTests,
  __setOpenAIAccountAuthServiceGetterForTests as setOpenAIAccountAuthServiceGetterForTests,
  buildManualCompactionMeta,
  buildOpenAICompactionActivityId,
  normalizeAuthMethod,
  normalizeId,
  persistCommandOnlyAccountCompaction,
  persistCommandOnlyWebSocketCompaction,
  runOpenAIAccountThreadCompaction,
} from './chat-stream-precall-openai-command-helpers.mjs'

function resolveAccountContextCompactionGeneration(continuation = null) {
  return Math.max(0, Number(
    continuation?.accountContextCompactionGeneration
    ?? continuation?.state?.metadata?.accountContextCompactionGeneration
    ?? 0,
  ) || 0)
}

function withAccountContextCompactionGeneration(continuation = null, generation = 0) {
  const current = continuation && typeof continuation === 'object' ? continuation : {}
  const state = current.state && typeof current.state === 'object' ? current.state : {}
  const metadata = state.metadata && typeof state.metadata === 'object' ? state.metadata : {}
  const normalizedGeneration = Math.max(0, Number(generation || 0) || 0)
  return {
    ...current,
    accountContextCompactionGeneration: normalizedGeneration,
    state: {
      ...state,
      metadata: { ...metadata, accountContextCompactionGeneration: normalizedGeneration },
    },
  }
}

export async function handleManualOpenAICompactionCommand({
  enabled = false,
  continuityPolicy = {},
  history = [],
  model = '',
  effectiveOpenAIContinuation = null,
  apiKey = '',
  preCallOccupancyEstimateTokens = 0,
  activeThreadId = '',
  activeTurnId = '',
  activeProjectId = '',
  toolsetHash = '',
  systemPromptHash = '',
  continuitySignature = '',
  shouldStoreOpenAIState = false,
  openAIExecutionAuthContext = null,
  usingExperimentalOpenAIWebSocketTransport = false,
  openAICommandTurnOptions = {},
  manualDecision = null,
  effectiveCompactionStrategyMode = COMPACTION_MODES.NONE,
  send = () => {},
  persistTimelineEvent = () => {},
  upsertOpenAIThreadState = () => {},
  nextLatestOpenAICompactionId = '',
} = {}) {
  if (!enabled) return { handled: false }

  const authMethod = normalizeAuthMethod(openAIExecutionAuthContext?.authMethod)
  const accountAuth = authMethod === 'account'
  const requestedCompactionMode = normalizeId(manualDecision?.requestedCompactionMode)
    || (accountAuth ? COMPACTION_MODES.CODEX_THREAD_COMPACTION : COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION)
  const manualCandidateCompactionModes = Array.isArray(manualDecision?.candidateCompactionModes)
    ? manualDecision.candidateCompactionModes
    : [COMPACTION_MODES.LOCAL_SUMMARY]
  const defaultCompactionEventType = accountAuth ? 'codex_thread_compaction' : 'provider_chain_compaction'
  const manualCompactionActivityId = buildOpenAICompactionActivityId({
    threadId: activeThreadId,
    turnId: activeTurnId,
    mode: 'manual',
    compactionEventType: defaultCompactionEventType,
  })
  const compactionMeta = buildManualCompactionMeta({
    compactionMeta: {
      reason: 'manual_compaction_requested',
      explicit: true,
      providerId: 'openai',
      model: String(model || '').trim(),
      threadId: activeThreadId,
      turnId: activeTurnId,
    },
    requestedCompactionMode,
    manualCandidateCompactionModes,
  })
  if (manualDecision?.shouldAttempt !== true) {
    const text = String(manualDecision?.blockedMessage || 'Compaction command could not be applied.')
    const selectedCompactionMode = manualDecision?.commandOnlyStopsTurn
      ? COMPACTION_MODES.NONE
      : requestedCompactionMode
    const compactionFailureReason = normalizeId(manualDecision?.blockedReason) || 'unknown_reason'
    const fallbackCompactionMode = normalizeId(manualDecision?.fallbackCompactionMode)
    const fallbackReason = normalizeId(manualDecision?.fallbackReason)
    const compactionEventType = defaultCompactionEventType
    const compactionEventPhase = 'imminent'
    const compactionEventOccurred = false
    emitCompactionNotice({
      send,
      persistTimelineEvent,
      threadId: activeThreadId,
      turnId: activeTurnId,
      type: 'warning',
      text,
      meta: buildManualCompactionMeta({
        compactionMeta: {
          ...compactionMeta,
          reason: compactionFailureReason,
        },
        requestedCompactionMode,
        manualCandidateCompactionModes,
        extra: {
          selectedCompactionMode,
          compactionFailureReason,
          fallbackCompactionMode,
          fallbackReason,
          compactionEventType,
          compactionEventPhase,
          compactionEventOccurred,
        },
      }),
    })
    emitOpenAICompactionEvent({
      send,
      persistTimelineEvent,
      activityId: manualCompactionActivityId,
      threadId: activeThreadId,
      turnId: activeTurnId,
      providerId: 'openai',
      model: String(model || '').trim(),
      status: 'failed',
      mode: 'manual',
      reason: compactionFailureReason,
      selectedCompactionMode,
      candidateCompactionModes: manualCandidateCompactionModes,
      compactionFailureReason,
      fallbackCompactionMode,
      fallbackReason,
      compactionEventType,
      compactionEventPhase,
      compactionEventOccurred,
    })
    return {
      handled: true,
      effectiveOpenAIContinuation,
      nextLatestOpenAICompactionId,
      effectiveCompactionStrategyMode,
      selectedCompactionMode,
      candidateCompactionModes: [...manualCandidateCompactionModes],
      compactionFailureReason,
      fallbackCompactionMode,
      fallbackReason,
      compactionEventType,
      compactionEventPhase,
      compactionEventOccurred,
      manualCompactionAppliedPreCall: false,
      commandOnly: manualDecision?.commandOnlyStopsTurn === true,
      commandOnlyAssistantText: manualDecision?.commandOnlyStopsTurn === true ? text : '',
    }
  }

  if (accountAuth) {
    try {
      const manualCompaction = await runOpenAIAccountThreadCompaction({
        mode: 'manual',
        send,
        persistTimelineEvent,
        threadId: activeThreadId,
        turnId: activeTurnId,
        providerId: 'openai',
        model: String(model || '').trim(),
        reason: 'manual_compaction_requested',
        selectedCompactionMode: requestedCompactionMode,
        candidateCompactionModes: manualCandidateCompactionModes,
        bridgeThreadId: manualDecision?.accountBridgeThreadId,
        contextCompactionGeneration: resolveAccountContextCompactionGeneration(effectiveOpenAIContinuation),
      })
      const nextEffectiveOpenAIContinuation = withAccountContextCompactionGeneration(
        effectiveOpenAIContinuation,
        manualCompaction?.contextCompactionGeneration,
      )
      const updatedLatestOpenAICompactionId = normalizeId(
        manualCompaction?.compactionId
        || manualCompaction?.turnId
        || nextLatestOpenAICompactionId,
      )
      const compactionEventType = 'codex_thread_compaction'
      const compactionEventPhase = openAICommandTurnOptions.commandOnly ? 'applied' : 'resumed_after'
      const compactionEventOccurred = true
      const text = 'Codex account thread compaction applied before the turn.'
      emitCompactionNotice({
        send,
        persistTimelineEvent,
        threadId: activeThreadId,
        turnId: activeTurnId,
        type: 'info',
        text,
        meta: buildManualCompactionMeta({
          compactionMeta: {
            ...compactionMeta,
            reason: 'compacted',
            compactionId: updatedLatestOpenAICompactionId,
          },
          requestedCompactionMode,
          manualCandidateCompactionModes,
          extra: {
            selectedCompactionMode: requestedCompactionMode,
            compactionEventType,
            compactionEventPhase,
            compactionEventOccurred,
          },
        }),
      })
      if (openAICommandTurnOptions.commandOnly) {
        persistCommandOnlyAccountCompaction({
          upsertOpenAIThreadState,
          activeThreadId,
          activeProjectId,
          model,
          shouldStoreOpenAIState,
          toolsetHash,
          systemPromptHash,
          continuitySignature,
          updatedLatestOpenAICompactionId,
          effectiveOpenAIContinuation: nextEffectiveOpenAIContinuation,
          manualDecision,
        })
      }
      return {
        handled: true,
        effectiveOpenAIContinuation: nextEffectiveOpenAIContinuation,
        nextLatestOpenAICompactionId: updatedLatestOpenAICompactionId,
        effectiveCompactionStrategyMode: requestedCompactionMode,
        selectedCompactionMode: requestedCompactionMode,
        candidateCompactionModes: [...manualCandidateCompactionModes],
        compactionFailureReason: '',
        fallbackCompactionMode: '',
        fallbackReason: '',
        compactionEventType,
        compactionEventPhase,
        compactionEventOccurred,
        manualCompactionAppliedPreCall: true,
        commandOnly: openAICommandTurnOptions.commandOnly === true,
        commandOnlyAssistantText: openAICommandTurnOptions.commandOnly === true ? text : '',
      }
    } catch (error) {
      const compactionFailureReason = normalizeId(error?.reason) || 'codex_thread_compaction_failed'
      const fallbackCompactionMode = openAICommandTurnOptions.commandOnly
        ? COMPACTION_MODES.NONE
        : resolveFallbackCompactionMode(effectiveCompactionStrategyMode)
      const fallbackReason = openAICommandTurnOptions.commandOnly
        ? 'command_only_turn_stopped'
        : 'continue_with_standard_turn_path'
      const selectedCompactionMode = openAICommandTurnOptions.commandOnly
        ? COMPACTION_MODES.NONE
        : requestedCompactionMode
      const compactionEventType = 'codex_thread_compaction'
      const compactionEventPhase = 'imminent'
      const compactionEventOccurred = false
      const text = normalizeId(error?.message) || 'Codex account thread compaction could not be applied.'

      emitCompactionNotice({
        send,
        persistTimelineEvent,
        threadId: activeThreadId,
        turnId: activeTurnId,
        type: 'warning',
        text,
        meta: buildManualCompactionMeta({
          compactionMeta: {
            ...compactionMeta,
            reason: compactionFailureReason,
          },
          requestedCompactionMode,
          manualCandidateCompactionModes,
          extra: {
            selectedCompactionMode,
            compactionFailureReason,
            fallbackCompactionMode,
            fallbackReason,
            compactionEventType,
            compactionEventPhase,
            compactionEventOccurred,
          },
        }),
      })
      emitOpenAICompactionEvent({
        send,
        persistTimelineEvent,
        activityId: manualCompactionActivityId,
        threadId: activeThreadId,
        turnId: activeTurnId,
        providerId: 'openai',
        model: String(model || '').trim(),
        status: 'failed',
        mode: 'manual',
        reason: compactionFailureReason,
        selectedCompactionMode,
        candidateCompactionModes: manualCandidateCompactionModes,
        compactionFailureReason,
        fallbackCompactionMode,
        fallbackReason,
        compactionEventType,
        compactionEventPhase,
        compactionEventOccurred,
      })
      return {
        handled: true,
        effectiveOpenAIContinuation,
        nextLatestOpenAICompactionId,
        effectiveCompactionStrategyMode,
        selectedCompactionMode,
        candidateCompactionModes: [...manualCandidateCompactionModes],
        compactionFailureReason,
        fallbackCompactionMode,
        fallbackReason,
        compactionEventType,
        compactionEventPhase,
        compactionEventOccurred,
        manualCompactionAppliedPreCall: false,
        commandOnly: openAICommandTurnOptions.commandOnly === true,
        commandOnlyAssistantText: openAICommandTurnOptions.commandOnly === true ? text : '',
      }
    }
  }

  emitOpenAICompactionEvent({
    send,
    persistTimelineEvent,
    activityId: manualCompactionActivityId,
    threadId: activeThreadId,
    turnId: activeTurnId,
    providerId: 'openai',
    model: String(model || '').trim(),
    status: 'requested',
    mode: 'manual',
    reason: 'manual_compaction_requested',
    selectedCompactionMode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
    candidateCompactionModes: manualCandidateCompactionModes,
    compactionEventType: 'provider_chain_compaction',
    compactionEventPhase: 'running',
    compactionEventOccurred: false,
  })

  const manualCompaction = await tryOpenAIProviderNativeCompaction({
    providerId: 'openai',
    policy: continuityPolicy || {},
    history,
    model: String(model ?? ''),
    previousResponseId: String(effectiveOpenAIContinuation?.previousResponseId || ''),
    apiKey,
    historyTokenEstimate: Number(preCallOccupancyEstimateTokens || 0) || 0,
    packetTokens: 0,
    force: true,
  })

  if (manualCompaction?.used) {
    const updatedLatestOpenAICompactionId = String(
      manualCompaction.compactionId
      || manualCompaction.compactionIds?.[0]
      || nextLatestOpenAICompactionId
      || '',
    )
    const updatedOpenAIContinuation = usingExperimentalOpenAIWebSocketTransport
      ? {
          previousResponseId: '',
          conversationId: '',
          manualCompactedWindow: Array.isArray(manualCompaction.compactedWindow)
            ? manualCompaction.compactedWindow
            : [],
          resetChainFromCompactedWindow: true,
        }
      : updateOpenAIContinuationContext({
          previousResponseId: String(effectiveOpenAIContinuation?.previousResponseId || ''),
          conversationId: String(effectiveOpenAIContinuation?.conversationId || ''),
        }, {
          responseId: String(manualCompaction.responseId || ''),
        })
    const compactionEventType = 'provider_chain_compaction'
    const compactionEventPhase = openAICommandTurnOptions.commandOnly ? 'applied' : 'resumed_after'
    const compactionEventOccurred = true
    const text = 'OpenAI server-side compaction applied before the turn.'

    emitCompactionNotice({
      send,
      persistTimelineEvent,
      threadId: activeThreadId,
      turnId: activeTurnId,
      type: 'info',
      text,
      meta: buildManualCompactionMeta({
        compactionMeta: {
          ...compactionMeta,
          reason: 'compacted',
          responseId: String(manualCompaction.responseId || ''),
          compactionId: String(manualCompaction.compactionId || ''),
          resetChainFromCompactedWindow: usingExperimentalOpenAIWebSocketTransport,
        },
        requestedCompactionMode,
        manualCandidateCompactionModes,
        extra: {
          selectedCompactionMode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
          compactionEventType,
          compactionEventPhase: 'applied',
          compactionEventOccurred,
        },
      }),
    })
    if (openAICommandTurnOptions.commandOnly && usingExperimentalOpenAIWebSocketTransport) {
      persistCommandOnlyWebSocketCompaction({
        upsertOpenAIThreadState,
        activeThreadId,
        activeProjectId,
        model,
        shouldStoreOpenAIState,
        toolsetHash,
        systemPromptHash,
        continuitySignature,
        updatedLatestOpenAICompactionId,
        manualCompaction,
      })
    }
    emitOpenAICompactionEvent({
      send,
      persistTimelineEvent,
      activityId: manualCompactionActivityId,
      threadId: activeThreadId,
      turnId: activeTurnId,
      providerId: 'openai',
      model: String(model || '').trim(),
      status: 'applied',
      mode: 'manual',
      reason: 'compacted',
      responseId: String(manualCompaction.responseId || ''),
      compactionId: String(manualCompaction.compactionId || ''),
      selectedCompactionMode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
      candidateCompactionModes: manualCandidateCompactionModes,
      compactionEventType,
      compactionEventPhase,
      compactionEventOccurred,
    })
    return {
      handled: true,
      effectiveOpenAIContinuation: updatedOpenAIContinuation,
      nextLatestOpenAICompactionId: updatedLatestOpenAICompactionId,
      effectiveCompactionStrategyMode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
      selectedCompactionMode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
      candidateCompactionModes: [...manualCandidateCompactionModes],
      compactionFailureReason: '',
      fallbackCompactionMode: '',
      fallbackReason: '',
      compactionEventType,
      compactionEventPhase,
      compactionEventOccurred,
      manualCompactionAppliedPreCall: true,
      commandOnly: openAICommandTurnOptions.commandOnly === true,
      commandOnlyAssistantText: openAICommandTurnOptions.commandOnly === true ? text : '',
    }
  }

  const compactionFailureReason = String(manualCompaction?.reason || 'unknown_reason')
  const fallbackCompactionMode = openAICommandTurnOptions.commandOnly
    ? COMPACTION_MODES.NONE
    : resolveFallbackCompactionMode(effectiveCompactionStrategyMode)
  const fallbackReason = openAICommandTurnOptions.commandOnly
    ? 'command_only_turn_stopped'
    : 'continue_with_standard_turn_path'
  const selectedCompactionMode = openAICommandTurnOptions.commandOnly
    ? COMPACTION_MODES.NONE
    : COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION
  const compactionEventType = 'provider_chain_compaction'
  const compactionEventPhase = 'imminent'
  const compactionEventOccurred = false
  const text = `OpenAI server-side compaction was requested but could not be applied (${String(manualCompaction?.reason || 'unknown_reason')}).`

  emitCompactionNotice({
    send,
    persistTimelineEvent,
    threadId: activeThreadId,
    turnId: activeTurnId,
    type: 'warning',
    text,
    meta: buildManualCompactionMeta({
      compactionMeta: {
        ...compactionMeta,
        reason: String(manualCompaction?.reason || 'unknown_reason'),
        reference: manualCompaction?.reference && typeof manualCompaction.reference === 'object'
          ? manualCompaction.reference
          : undefined,
      },
      requestedCompactionMode,
      manualCandidateCompactionModes,
      extra: {
        selectedCompactionMode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
        compactionFailureReason,
        fallbackCompactionMode,
        fallbackReason,
        compactionEventType,
        compactionEventPhase,
        compactionEventOccurred,
      },
    }),
  })
  emitOpenAICompactionEvent({
    send,
    persistTimelineEvent,
    activityId: manualCompactionActivityId,
    threadId: activeThreadId,
    turnId: activeTurnId,
    providerId: 'openai',
    model: String(model || '').trim(),
    status: 'failed',
    mode: 'manual',
    reason: String(manualCompaction?.reason || 'unknown_reason'),
    selectedCompactionMode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
    candidateCompactionModes: manualCandidateCompactionModes,
    compactionFailureReason,
    fallbackCompactionMode,
    fallbackReason,
    compactionEventType,
    compactionEventPhase,
    compactionEventOccurred,
  })
  return {
    handled: true,
    effectiveOpenAIContinuation,
    nextLatestOpenAICompactionId,
    effectiveCompactionStrategyMode,
    selectedCompactionMode,
    candidateCompactionModes: [...manualCandidateCompactionModes],
    compactionFailureReason,
    fallbackCompactionMode,
    fallbackReason,
    compactionEventType,
    compactionEventPhase,
    compactionEventOccurred,
    manualCompactionAppliedPreCall: false,
    commandOnly: openAICommandTurnOptions.commandOnly === true,
    commandOnlyAssistantText: openAICommandTurnOptions.commandOnly === true ? text : '',
  }
}

export async function handleAutomaticOpenAIAccountCompaction({
  enabled = false,
  automaticDecision = null,
  model = '',
  effectiveOpenAIContinuation = null,
  activeThreadId = '',
  activeTurnId = '',
  activeProjectId = '',
  toolsetHash = '',
  systemPromptHash = '',
  continuitySignature = '',
  shouldStoreOpenAIState = false,
  send = () => {},
  persistTimelineEvent = () => {},
  upsertOpenAIThreadState = () => {},
  nextLatestOpenAICompactionId = '',
} = {}) {
  if (!enabled || automaticDecision?.shouldAttempt !== true) {
    return {
      handled: false,
      effectiveOpenAIContinuation,
      nextLatestOpenAICompactionId,
    }
  }

  const selectedCompactionMode = COMPACTION_MODES.CODEX_THREAD_COMPACTION
  const candidateCompactionModes = Array.isArray(automaticDecision?.candidateCompactionModes)
    ? automaticDecision.candidateCompactionModes
    : [COMPACTION_MODES.CODEX_THREAD_COMPACTION, COMPACTION_MODES.LOCAL_SUMMARY]

  try {
    const automaticCompaction = await runOpenAIAccountThreadCompaction({
      mode: 'automatic',
      send,
      persistTimelineEvent,
      threadId: activeThreadId,
      turnId: activeTurnId,
      providerId: 'openai',
      model: String(model || '').trim(),
      reason: 'automatic_compaction_requested',
      selectedCompactionMode,
      candidateCompactionModes,
      bridgeThreadId: automaticDecision?.accountBridgeThreadId,
      contextCompactionGeneration: resolveAccountContextCompactionGeneration(effectiveOpenAIContinuation),
    })
    const nextEffectiveOpenAIContinuation = withAccountContextCompactionGeneration(
      effectiveOpenAIContinuation,
      automaticCompaction?.contextCompactionGeneration,
    )
    const updatedLatestOpenAICompactionId = normalizeId(
      automaticCompaction?.compactionId
      || automaticCompaction?.turnId
      || nextLatestOpenAICompactionId,
    )

    try {
      upsertOpenAIThreadState({
        threadId: activeThreadId,
        projectId: activeProjectId,
        providerId: 'openai',
        model: String(model ?? ''),
        lastResponseId: normalizeId(nextEffectiveOpenAIContinuation?.state?.lastResponseId),
        conversationId: normalizeId(nextEffectiveOpenAIContinuation?.state?.conversationId),
        storeEnabled: shouldStoreOpenAIState,
        toolsetHash,
        systemPromptHash,
        continuitySignature,
        continuityEpoch: Math.max(1, Number(nextEffectiveOpenAIContinuation?.state?.continuityEpoch || 1) || 1),
        continuityReducerVersion: String(nextEffectiveOpenAIContinuation?.state?.continuityReducerVersion || '').trim(),
        modeSignature: String(nextEffectiveOpenAIContinuation?.state?.modeSignature || '').trim(),
        modelSignature: String(nextEffectiveOpenAIContinuation?.state?.modelSignature || '').trim(),
        lastCompactionId: updatedLatestOpenAICompactionId,
        chainValid: true,
        chainInvalidReason: '',
        metadata: {
          ...(normalizeId(automaticDecision?.accountBridgeThreadId)
            ? { accountBridgeThreadId: normalizeId(automaticDecision.accountBridgeThreadId) }
            : {}),
          ...(normalizeId(nextEffectiveOpenAIContinuation?.state?.metadata?.accountBridgeProjectFolder)
            ? { accountBridgeProjectFolder: normalizeId(nextEffectiveOpenAIContinuation.state.metadata.accountBridgeProjectFolder) }
            : {}),
          accountContextCompactionGeneration: automaticCompaction.contextCompactionGeneration,
          latestCodexThreadCompaction: {
            eventType: 'codex_thread_compaction',
            eventPhase: 'applied',
            source: 'provider',
            confidence: 'explicit',
            providerId: 'openai',
            turnId: String(activeTurnId || ''),
            responseId: '',
            compactionIds: updatedLatestOpenAICompactionId ? [updatedLatestOpenAICompactionId] : [],
            detectedAt: Date.now(),
          },
        },
      })
    } catch {
      // Best-effort persistence only.
    }

    return {
      handled: true,
      effectiveOpenAIContinuation: nextEffectiveOpenAIContinuation,
      nextLatestOpenAICompactionId: updatedLatestOpenAICompactionId,
      selectedCompactionMode,
      candidateCompactionModes: [...candidateCompactionModes],
      compactionFailureReason: '',
      fallbackCompactionMode: '',
      fallbackReason: '',
      compactionEventType: 'codex_thread_compaction',
      compactionEventPhase: 'resumed_after',
      compactionEventOccurred: true,
      automaticAccountCompactionAppliedPreCall: true,
    }
  } catch (error) {
    const compactionFailureReason = normalizeId(error?.reason) || 'codex_thread_compaction_failed'
    const activityId = buildOpenAICompactionActivityId({
      threadId: activeThreadId,
      turnId: activeTurnId,
      mode: 'automatic',
      compactionEventType: 'codex_thread_compaction',
    })
    emitOpenAICompactionEvent({
      send,
      persistTimelineEvent,
      activityId,
      threadId: activeThreadId,
      turnId: activeTurnId,
      providerId: 'openai',
      model: String(model || '').trim(),
      status: 'failed',
      mode: 'automatic',
      reason: compactionFailureReason,
      selectedCompactionMode,
      candidateCompactionModes,
      compactionFailureReason,
      compactionEventType: 'codex_thread_compaction',
      compactionEventPhase: 'running',
      compactionEventOccurred: false,
    })
    return {
      handled: true,
      effectiveOpenAIContinuation,
      nextLatestOpenAICompactionId,
      selectedCompactionMode,
      candidateCompactionModes: [...candidateCompactionModes],
      compactionFailureReason,
      fallbackCompactionMode: '',
      fallbackReason: '',
      compactionEventType: 'codex_thread_compaction',
      compactionEventPhase: 'running',
      compactionEventOccurred: false,
      automaticAccountCompactionAppliedPreCall: false,
    }
  }
}

export function __setOpenAIAccountAuthServiceGetterForTests(fn = null) {
  setOpenAIAccountAuthServiceGetterForTests(fn)
}

export function __resetOpenAIAccountAuthServiceGetterForTests() {
  resetOpenAIAccountAuthServiceGetterForTests()
}
