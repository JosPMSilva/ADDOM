import { buildSafeProviderTruncationOccupancyEstimate } from '../../common/chat/provider-truncation-budget-policy.mjs'
import { listTimeline } from '../workspace/workspace-store.mjs'
import {
  applyAdaptiveBudgetDiagnosticsState,
  buildAdaptiveBudgetUserExplanation,
} from './chat-runtime-diagnostics.mjs'
import { estimateDispatchedPromptOccupancy } from './context-occupancy-estimator.mjs'
import { applyMemoryContextBudgetToHistory } from './memory-context-budget.mjs'
import { buildPromptBudgetDiagnosticSnapshot } from './provider-prompt-budget-profile.mjs'
import {
  createPromptBudgetHardLimitError,
  enforceEffectivePromptBudget,
  resolvePromptBudgetHardLimitTokens,
  shouldBlockForPromptBudgetHardLimit,
} from './chat-stream-precall-budget.mjs'
import {
  injectCompactionImminentAwareness,
  injectProviderChainResumedAfterHandoff,
  resolveCarryForwardSource,
} from './chat-stream-precall-compaction-helpers.mjs'
import { pruneOldToolResultHistory } from './tool-result-history-pruning.mjs'
import { commitProjectedTimelineEvent } from './canonical-root-event-writer.mjs'

function normalizeId(value = '') {
  return String(value || '').trim()
}

export function resolveLatestPersistedContextUsage(threadId = '') {
  const normalizedThreadId = normalizeId(threadId)
  if (!normalizedThreadId) return null
  try {
    const rows = listTimeline(normalizedThreadId, { limit: 250 })
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const row = rows[index]
      if (String(row?.kind || '').trim() !== 'chat_usage') continue
      const meta = row?.meta && typeof row.meta === 'object' ? row.meta : null
      if (!meta) continue
      return meta
    }
  } catch {
    return null
  }
  return null
}

export function emitAdaptiveBudgetUserNote({
  errorDiagnostics = {},
  activeThreadId = '',
  activeTurnId = '',
  send = () => {},
  persistTimelineEvent = () => {},
} = {}) {
  applyAdaptiveBudgetDiagnosticsState(errorDiagnostics)
  if (errorDiagnostics.adaptiveBudgetUserNoteEmitted === true) return
  const adaptiveBudgetUserExplanation = buildAdaptiveBudgetUserExplanation(errorDiagnostics)
  if (!adaptiveBudgetUserExplanation) return
  const payload = {
    threadId: activeThreadId,
    turnId: activeTurnId,
    ...adaptiveBudgetUserExplanation,
  }
  commitProjectedTimelineEvent({
    persistTimelineEvent, send, kind: 'runtime_diagnostics',
    options: { role: 'system', content: adaptiveBudgetUserExplanation.label, meta: payload },
    channel: 'chat:runtime-diagnostics', payload,
  })
  errorDiagnostics.adaptiveBudgetUserNoteEmitted = true
}

export async function applyPreCallHistoryConditioning({
  history = [],
  compaction = null,
  preparedHistory = null,
  modelContext = {},
  send = () => {},
  persistTimelineEvent = () => {},
  activeThreadId = '',
  activeTurnId = '',
  continuityPacketPayload = null,
  errorDiagnostics = {},
  resolvedPromptBudgetProfile = null,
  providerId = '',
  model = '',
  effectiveCompactionStrategyMode = '',
  providerChainCompactionAppliedAutomatic = false,
  continuityInput = null,
  preCallOccupancyEstimateTokens = 0,
  activeToolDefinitions = {},
  effectivePromptBudget = {},
  estimateHistoryTokens,
  compactHistoryForContextWindow,
  applyCompactionIfNeeded,
  apiKey = '',
  loop = null,
  selectedCompactionMode = '',
  compactionEventPhase = '',
  canonicalHandoffUsed = null,
} = {}) {
  applyCompactionIfNeeded({
    compaction,
    preparedHistory,
    history,
    modelContext,
    send,
    persistTimelineEvent,
    threadId: activeThreadId,
    turnId: activeTurnId,
  })

  const shouldTightenMemoryForContinuity = (
    continuityPacketPayload
    && Number(errorDiagnostics.memoryContextNodeCount || 0) > 0
    && (
      String(resolvedPromptBudgetProfile?.strictness || '').trim().toLowerCase() === 'strict'
      || errorDiagnostics.continuityPacketBudgetReductionApplied === true
    )
  )
  const memoryContextBudgetReduction = shouldTightenMemoryForContinuity
    ? applyMemoryContextBudgetToHistory(history, {
      maxNodes: Number(
        resolvedPromptBudgetProfile?.memoryTightMaxNodes
        || resolvedPromptBudgetProfile?.memoryMaxNodes
        || errorDiagnostics.memoryContextNodeCount
        || 0
      ) || 0,
      maxTokens: Number(
        resolvedPromptBudgetProfile?.memoryTightBudgetTokens
        || resolvedPromptBudgetProfile?.memoryBudgetTokens
        || errorDiagnostics.memoryContextEstimatedTokens
        || 0
      ) || 0,
    })
    : null
  if (memoryContextBudgetReduction?.diagnostics?.applied === true && Array.isArray(memoryContextBudgetReduction.history)) {
    history.length = 0
    history.push(...memoryContextBudgetReduction.history)
    persistTimelineEvent('memory_context_budget_reduced', {
      role: 'system',
      content: `Memory context reduced from ${Number(memoryContextBudgetReduction.diagnostics.originalNodeCount || 0) || 0} nodes to ${Number(memoryContextBudgetReduction.diagnostics.reducedNodeCount || 0) || 0} before provider dispatch.`,
      meta: {
        threadId: activeThreadId,
        turnId: activeTurnId,
        providerId: String(providerId || '').trim().toLowerCase(),
        model: String(model || '').trim(),
        ...memoryContextBudgetReduction.diagnostics,
      },
    })
  }
  if (memoryContextBudgetReduction?.diagnostics) {
    errorDiagnostics.memoryContextBudgetReductionApplied = memoryContextBudgetReduction.diagnostics.applied === true
    errorDiagnostics.memoryContextBudgetReductionReasons = [
      ...(memoryContextBudgetReduction.diagnostics.reducedByNodes ? ['tight_node_cap'] : []),
      ...(memoryContextBudgetReduction.diagnostics.reducedByTokens ? ['tight_token_cap'] : []),
    ]
    errorDiagnostics.memoryContextNodeCount = Number(
      memoryContextBudgetReduction.diagnostics.reducedNodeCount
      || errorDiagnostics.memoryContextNodeCount
      || 0
    ) || 0
    errorDiagnostics.memoryContextEstimatedTokens = Number(
      memoryContextBudgetReduction.diagnostics.reducedTokens
      || errorDiagnostics.memoryContextEstimatedTokens
      || 0
    ) || 0
  }

  const toolResultHistoryPruning = pruneOldToolResultHistory({
    history,
    promptBudgetProfile: resolvedPromptBudgetProfile,
  })
  const toolResultHistoryPruningDiagnostics = toolResultHistoryPruning?.diagnostics || {}
  if (toolResultHistoryPruningDiagnostics.applied === true && Array.isArray(toolResultHistoryPruning.history)) {
    history.length = 0
    history.push(...toolResultHistoryPruning.history)
    persistTimelineEvent('tool_result_history_pruned', {
      role: 'system',
      content: `Old tool result history pruning replaced ${Number(toolResultHistoryPruningDiagnostics.prunedCount || 0) || 0} result${Number(toolResultHistoryPruningDiagnostics.prunedCount || 0) === 1 ? '' : 's'} before provider dispatch.`,
      meta: {
        threadId: activeThreadId,
        turnId: activeTurnId,
        providerId: String(providerId || '').trim().toLowerCase(),
        model: String(model || '').trim(),
        ...toolResultHistoryPruningDiagnostics,
      },
    })
  }
  errorDiagnostics.toolResultHistoryPruningApplied = toolResultHistoryPruningDiagnostics.applied === true
  errorDiagnostics.toolResultHistoryPrunedCount = Number(toolResultHistoryPruningDiagnostics.prunedCount || 0) || 0
  errorDiagnostics.toolResultHistoryProtectedCriticalCount = Number(toolResultHistoryPruningDiagnostics.protectedCriticalCount || 0) || 0
  errorDiagnostics.toolResultHistoryProtectedByRecentBudgetCount = Number(toolResultHistoryPruningDiagnostics.protectedByRecentBudgetCount || 0) || 0
  errorDiagnostics.toolResultHistoryPrunedChars = Number(toolResultHistoryPruningDiagnostics.prunedToolResultChars || 0) || 0
  errorDiagnostics.toolResultHistoryEstimatedSavedTokens = Number(toolResultHistoryPruningDiagnostics.estimatedSavedToolResultTokens || 0) || 0

  const promptBudgetGuard = await enforceEffectivePromptBudget({
    history,
    effectivePromptBudget,
    estimateHistoryTokens,
    compactHistoryForContextWindow,
    applyCompactionIfNeeded,
    modelContext,
    providerId,
    model,
    apiKey,
    loop,
    send,
    persistTimelineEvent,
    threadId: activeThreadId,
    turnId: activeTurnId,
  })

  let nextCanonicalHandoffUsed = canonicalHandoffUsed
  if (providerChainCompactionAppliedAutomatic) {
    injectProviderChainResumedAfterHandoff({
      history,
      continuityInput,
      selectedStrategyMode: effectiveCompactionStrategyMode,
      compactionEventType: 'provider_chain_compaction',
      providerId: String(providerId || '').trim().toLowerCase(),
      threadId: activeThreadId,
      turnId: activeTurnId,
      persistTimelineEvent,
    })
    injectCompactionImminentAwareness({
      history,
      continuityInput,
      selectedStrategyMode: effectiveCompactionStrategyMode,
      occurred: true,
      type: 'provider_chain_compaction',
      phase: 'resumed_after',
      source: 'provider',
      confidence: 'explicit',
      providerId: String(providerId || '').trim().toLowerCase(),
      threadId: activeThreadId,
      turnId: activeTurnId,
      preCallOccupancyEstimateTokens,
      modelLimitTokens: Number(modelContext?.limitTokens || 0) || 0,
      note: 'Provider chain compaction applied; continue from compacted chain.',
      persistTimelineEvent,
    })
    nextCanonicalHandoffUsed = true
  }

  const resolvedCarryForwardSource = resolveCarryForwardSource({
    history,
    packetPayload: continuityPacketPayload,
    compactionPayload: compaction,
  })
  const nextCarryForwardSource = resolvedCarryForwardSource === 'none' ? '' : resolvedCarryForwardSource
  const canonicalFromCarryForwardSource = (
    nextCarryForwardSource === 'both'
    || nextCarryForwardSource === 'compaction_handoff_only'
  )
  if (compactionEventPhase === 'resumed_after' || nextCarryForwardSource) {
    nextCanonicalHandoffUsed = canonicalFromCarryForwardSource
  }

  const promptOccupancyEstimateTokens = Number(
    promptBudgetGuard.promptOccupancyEstimateTokens || estimateHistoryTokens(history),
  ) || 0
  const promptBudgetGuardSafePromptOccupancyEstimateTokens = Number(
    promptBudgetGuard.safePromptOccupancyEstimateTokens || 0,
  ) || 0
  const dispatchedPromptOccupancyEstimate = estimateDispatchedPromptOccupancy({
    history,
    activeToolDefinitions,
    providerId,
    model,
    outputReserveTokens: effectivePromptBudget.outputReserveTokens,
  })
  const effectivePromptOccupancyEstimateTokens = Number(
    dispatchedPromptOccupancyEstimate.tokenEstimate || promptOccupancyEstimateTokens,
  ) || 0
  const safePromptOccupancyEstimateTokens = buildSafeProviderTruncationOccupancyEstimate(
    effectivePromptOccupancyEstimateTokens,
  )
  const guardedPromptOccupancyEstimateTokens = Math.max(
    promptOccupancyEstimateTokens,
    effectivePromptOccupancyEstimateTokens,
  )
  const guardedSafePromptOccupancyEstimateTokens = Math.max(
    promptBudgetGuardSafePromptOccupancyEstimateTokens,
    safePromptOccupancyEstimateTokens,
  )
  const promptOccupancyEstimateDiagnostics = dispatchedPromptOccupancyEstimate.diagnostics || null
  const promptBudgetCategoryEstimates = (
    promptOccupancyEstimateDiagnostics?.categoryEstimates
    && typeof promptOccupancyEstimateDiagnostics.categoryEstimates === 'object'
  )
    ? promptOccupancyEstimateDiagnostics.categoryEstimates
    : {}
  const promptBudgetDominantContributors = Array.isArray(promptOccupancyEstimateDiagnostics?.dominantContributors)
    ? promptOccupancyEstimateDiagnostics.dominantContributors
    : []
  const promptBudgetHardLimitTokens = resolvePromptBudgetHardLimitTokens({
    promptBudgetProfile: resolvedPromptBudgetProfile,
  })
  const promptBudgetHardLimitExceeded = shouldBlockForPromptBudgetHardLimit({
    safeEstimateTokens: guardedSafePromptOccupancyEstimateTokens,
    hardLimitTokens: promptBudgetHardLimitTokens,
  })
  errorDiagnostics.promptOccupancyEstimateTokens = Number(guardedPromptOccupancyEstimateTokens || 0) || 0
  errorDiagnostics.safePromptOccupancyEstimateTokens = guardedSafePromptOccupancyEstimateTokens
  errorDiagnostics.promptOccupancyEstimateConfidence = String(
    dispatchedPromptOccupancyEstimate.occupancyConfidence || 'rough_estimate'
  )
  errorDiagnostics.promptOccupancyEstimateMethod = String(
    dispatchedPromptOccupancyEstimate.occupancyMethod || 'history_estimate'
  )
  errorDiagnostics.promptOccupancyEstimateDiagnostics = promptOccupancyEstimateDiagnostics
  errorDiagnostics.promptBudgetCategoryEstimates = promptBudgetCategoryEstimates
  errorDiagnostics.promptBudgetDominantContributors = promptBudgetDominantContributors
  errorDiagnostics.promptBudgetHardLimitTokens = promptBudgetHardLimitTokens
  errorDiagnostics.promptBudgetHardLimitExceeded = promptBudgetHardLimitExceeded
  errorDiagnostics.promptBudgetGuardApplied = promptBudgetGuard.enforced === true
  errorDiagnostics.promptBudgetAggressiveCompactionApplied = promptBudgetGuard.aggressiveCompactionApplied === true
  errorDiagnostics.promptBudgetTrimmedMessages = Number(promptBudgetGuard.trimmedMessages || 0) || 0
  errorDiagnostics.preflightBudgetAction = promptBudgetHardLimitExceeded
    ? 'blocked'
    : (promptBudgetGuard.enforced === true
        ? 'compacted_history'
        : (toolResultHistoryPruningDiagnostics.applied === true ? 'pruned_old_tool_results' : 'none'))
  errorDiagnostics.historyMessageCount = Array.isArray(history) ? history.length : errorDiagnostics.historyMessageCount

  if (promptBudgetHardLimitExceeded) {
    persistTimelineEvent('prompt_budget_blocked', {
      role: 'system',
      content: `Prompt preflight blocked provider dispatch: safe estimate ${guardedSafePromptOccupancyEstimateTokens} tokens exceeds hard ceiling ${promptBudgetHardLimitTokens} tokens.`,
      meta: {
        threadId: activeThreadId,
        turnId: activeTurnId,
        providerId: String(providerId || '').trim().toLowerCase(),
        model: String(model || '').trim(),
        ...buildPromptBudgetDiagnosticSnapshot(resolvedPromptBudgetProfile),
        promptBudgetProfileId: String(resolvedPromptBudgetProfile?.id || '').trim(),
        promptOccupancyEstimateTokens: Number(guardedPromptOccupancyEstimateTokens || 0) || 0,
        safePromptOccupancyEstimateTokens: guardedSafePromptOccupancyEstimateTokens,
        promptBudgetHardLimitTokens,
        promptBudgetCategoryEstimates,
        promptBudgetDominantContributors,
        promptBudgetGuardApplied: promptBudgetGuard.enforced === true,
        promptBudgetAggressiveCompactionApplied: promptBudgetGuard.aggressiveCompactionApplied === true,
        promptBudgetTrimmedMessages: Number(promptBudgetGuard.trimmedMessages || 0) || 0,
        toolResultHistoryPruningApplied: toolResultHistoryPruningDiagnostics.applied === true,
        toolResultHistoryPrunedCount: Number(toolResultHistoryPruningDiagnostics.prunedCount || 0) || 0,
      },
    })
    throw createPromptBudgetHardLimitError({
      providerId,
      model,
      safeEstimateTokens: guardedSafePromptOccupancyEstimateTokens,
      hardLimitTokens: promptBudgetHardLimitTokens,
      promptEstimateTokens: guardedPromptOccupancyEstimateTokens,
      promptBudgetProfileId: resolvedPromptBudgetProfile?.id || '',
      dominantContributors: promptBudgetDominantContributors,
    })
  }

  return {
    carryForwardSource: nextCarryForwardSource,
    canonicalHandoffUsed: nextCanonicalHandoffUsed,
    promptOccupancyEstimateTokens: effectivePromptOccupancyEstimateTokens,
    promptOccupancyEstimateConfidence: String(
      dispatchedPromptOccupancyEstimate.occupancyConfidence || 'rough_estimate'
    ),
    promptOccupancyEstimateMethod: String(
      dispatchedPromptOccupancyEstimate.occupancyMethod || 'history_estimate'
    ),
    selectedCompactionMode: String(selectedCompactionMode || ''),
  }
}
