import { formatToolResultForDisplay } from '../../common/chat/tool-result-display.mjs'
import { normalizeQuestionUserRequest } from '../../common/chat/question-user-request.mjs'
import { buildToolContextFacts, persistToolContextFacts } from './tool-context-facts.mjs'
import { resolveToolFailureClass } from './tool-failure-classifier.mjs'
import { resolveProviderPromptBudgetProfile } from './provider-prompt-budget-profile.mjs'
import { recordToolResultSpilloverOutcome } from './chat-runtime-diagnostics.mjs'
import { budgetToolResultForModel } from '../tools/tool-result-budget.mjs'
import { buildCompactionUsageRefreshPayload } from './chat-compaction-usage-refresh.mjs'
import { buildCanonicalFinalDocument } from '../../common/chat/final-document-contract.mjs'
import { commitProjectedTimelineEvent } from './canonical-root-event-writer.mjs'
import { commitPlanLifecycleProjection } from './plan-lifecycle-event.mjs'
export { emitReasoningDone } from './chat-reasoning-finalization.mjs'
const SHELL_FILE_CHANGE_SOURCE_NAMES = new Set(['run_command', 'local_shell'])
const FILE_MUTATION_TOOL_NAMES = new Set([
  'apply_artifact_revision',
  'apply_patch',
  'delete_file',
  'edit_file',
  'file_change',
  'rename_file',
  'rollback_file',
  'write_file',
])

function isProvableShellFileChange(fileChange = null) {
  if (!fileChange || typeof fileChange !== 'object') return false
  const source = String(fileChange.source || '').trim().toLowerCase()
  if (!SHELL_FILE_CHANGE_SOURCE_NAMES.has(source)) return true
  return fileChange.hydrationProven === true
}

function isExplicitFileMutationTool(toolName = '') {
  const normalized = String(toolName || '').trim().toLowerCase()
  return FILE_MUTATION_TOOL_NAMES.has(normalized)
}

function buildArtifactTrackingState({
  toolName = '',
  decision = '',
  isError = false,
  rawWriteChanges = [],
  emittedWriteChanges = [],
  shellWriteDiagnostics = null,
} = {}) {
  if (decision !== 'approved' || isError) return null

  const normalizedToolName = String(toolName || '').trim().toLowerCase()
  const rawRows = Array.isArray(rawWriteChanges)
    ? rawWriteChanges.filter((row) => row && typeof row === 'object' && String(row.filePath || '').trim())
    : []
  const emittedRows = Array.isArray(emittedWriteChanges)
    ? emittedWriteChanges.filter((row) => row && typeof row === 'object' && String(row.filePath || '').trim())
    : []
  const revisionTrackedRows = emittedRows.filter((row) => String(row.newRevId || '').trim())
  const diagnostics = shellWriteDiagnostics && typeof shellWriteDiagnostics === 'object'
    ? shellWriteDiagnostics
    : null
  const diagnosticStatus = String(diagnostics?.status || '').trim().toLowerCase()
  const changedPathCount = Number(diagnostics?.changedPathCount || 0) || 0
  const hasShellWriteEvidence = changedPathCount > 0 || rawRows.length > 0 || emittedRows.length > 0
  const suppressedShellWrites = (
    SHELL_FILE_CHANGE_SOURCE_NAMES.has(normalizedToolName)
    && hasShellWriteEvidence
    && (
      diagnosticStatus === 'suppressed'
      || changedPathCount > rawRows.length
      || rawRows.length > emittedRows.length
    )
  )

  if (emittedRows.length > 0 && revisionTrackedRows.length === emittedRows.length && !suppressedShellWrites) {
    return {
      status: 'tracked',
      trackedCount: revisionTrackedRows.length,
      untrackedCount: 0,
      reasonCode: '',
      reason: '',
    }
  }

  if (emittedRows.length > 0 && revisionTrackedRows.length > 0) {
    return {
      status: 'partially_tracked',
      trackedCount: revisionTrackedRows.length,
      untrackedCount: emittedRows.length - revisionTrackedRows.length,
      reasonCode: suppressedShellWrites ? 'shell_write_hydration_incomplete' : 'missing_revision_metadata',
      reason: suppressedShellWrites
        ? 'Some file changes could not be safely hydrated into artifact revisions.'
        : 'Some file changes were visible but did not include artifact revision metadata.',
      ...(diagnostics ? { shellWriteHydration: diagnostics } : {}),
    }
  }

  if (emittedRows.length > 0) {
    return {
      status: 'untracked',
      trackedCount: 0,
      untrackedCount: emittedRows.length,
      reasonCode: suppressedShellWrites ? 'shell_write_hydration_untracked' : 'missing_revision_metadata',
      reason: suppressedShellWrites
        ? 'File changes were detected but could not be safely hydrated into artifact revisions.'
        : 'File changes were visible but did not include artifact revision metadata.',
      ...(diagnostics ? { shellWriteHydration: diagnostics } : {}),
    }
  }

  if (suppressedShellWrites) {
    return {
      status: 'untracked',
      trackedCount: 0,
      untrackedCount: Math.max(changedPathCount, rawRows.length, 1),
      reasonCode: 'shell_write_hydration_suppressed',
      reason: 'Shell writes were detected or suspected, but ADDOM could not safely map them to artifact revisions.',
      shellWriteHydration: diagnostics,
    }
  }

  if (isExplicitFileMutationTool(normalizedToolName)) {
    return {
      status: 'untracked',
      trackedCount: 0,
      untrackedCount: 1,
      reasonCode: 'artifact_metadata_missing',
      reason: `${normalizedToolName || 'write tool'} completed without artifact revision metadata.`,
    }
  }

  return null
}

function buildFileChangeSummary(fileChange = {}) {
  const filePath = String(fileChange?.filePath || '').trim()
  const renamedFrom = String(fileChange?.renamedFrom || '').trim()
  const changeType = String(fileChange?.changeType || '').trim().toLowerCase()
  if ((changeType === 'renamed' || changeType === 'moved') && filePath && renamedFrom) {
    return `File renamed: ${renamedFrom} -> ${filePath}`
  }
  return `File changed: ${filePath} (+${Number(fileChange?.addedLines || 0) || 0} / -${Number(fileChange?.removedLines || 0) || 0})`
}

export function buildInterruptedReasoningSnapshot({
  turnReasoningSegments = [],
  reasoningBuffer = '',
} = {}) {
  const normalizedSegments = []
  for (const segment of Array.isArray(turnReasoningSegments) ? turnReasoningSegments : []) {
    const text = String(segment || '').trim()
    if (!text) continue
    if (normalizedSegments[normalizedSegments.length - 1] === text) continue
    normalizedSegments.push(text)
  }
  const finalBuffer = String(reasoningBuffer || '').trim()
  if (finalBuffer && normalizedSegments[normalizedSegments.length - 1] !== finalBuffer) {
    normalizedSegments.push(finalBuffer)
  }
  return normalizedSegments.join('\n\n---\n\n')
}

export function applyCompactionIfNeeded({
  compaction = null,
  preparedHistory = null,
  history = [],
  modelContext = null,
  send = () => {},
  persistTimelineEvent = () => {},
  threadId = '',
  turnId = '',
} = {}) {
  if (!compaction?.compacted || !Array.isArray(preparedHistory)) return false

  const modelLimit = Number(modelContext?.limitTokens || 0)
  const estimatedBeforeTokens = Number(compaction.estimatedBeforeTokens || 0)
  const estimatedAfterTokens = Number(compaction.estimatedAfterTokens || 0)
  const usageRefreshPayload = buildCompactionUsageRefreshPayload({
    threadId,
    turnId,
    usage: {},
    modelLimit,
    estimatedAfterTokens,
    strategy: 'local_summary',
    scope: 'partial_reduce',
    compactionSource: 'local',
    status: 'applied',
  })

  history.length = 0
  history.push(...preparedHistory)

  const compactedPayload = {
    threadId,
    turnId,
    compactedFromEventId: null,
    compactedToEventId: null,
    summaryChars: String(compaction.summary ?? '').length,
    removedMessages: Number(compaction.removedCount || 0),
    estimatedBeforeTokens,
    estimatedAfterTokens,
    modelLimit,
    source: String(modelContext?.source || ''),
    status: 'applied',
    compactionStrategy: String(usageRefreshPayload?.compactionStrategy || 'local_summary'),
    compactionScope: String(usageRefreshPayload?.compactionScope || 'partial_reduce'),
    compactionSource: String(usageRefreshPayload?.compactionSource || 'local'),
    usageRefreshState: String(usageRefreshPayload?.usageRefreshState || 'estimated'),
  }

  commitProjectedTimelineEvent({
    persistTimelineEvent, send, kind: 'context_compacted',
    options: {
      role: 'system',
      content: `Context compacted before model call (removed ${compactedPayload.removedMessages} older message${compactedPayload.removedMessages === 1 ? '' : 's'}).`,
      meta: compactedPayload,
    },
    channel: 'chat:context-compacted', payload: compactedPayload,
  })
  if (usageRefreshPayload) {
    emitUsageEvent({
      usagePayload: usageRefreshPayload,
      send,
      persistTimelineEvent,
    })
  }
  return true
}

export function emitUsageEvent({
  usagePayload = null,
  send = () => {},
  persistTimelineEvent = () => {},
} = {}) {
  if (!usagePayload || typeof usagePayload !== 'object') return
  const contextRemainingTokens = Number(usagePayload.contextRemainingTokens || 0)
  const occupancyConfidence = String(usagePayload.occupancyConfidence || '').trim().toLowerCase()
  const occupancyDescriptor = occupancyConfidence === 'provider_verified'
    ? 'provider verified'
    : (occupancyConfidence === 'provider_mapped'
      ? 'provider mapped'
      : (String(usagePayload.occupancySource || '').trim().toLowerCase() === 'thread_local_estimate'
        ? 'thread-local estimate'
        : 'estimated'))
  commitProjectedTimelineEvent({
    persistTimelineEvent, send, kind: 'chat_usage',
    options: {
      role: 'system',
      content: `Usage: ${usagePayload.usage.totalTokens} tokens this step, ${contextRemainingTokens} context tokens remaining (${occupancyDescriptor}).`,
      meta: usagePayload,
    },
    channel: 'chat:usage', payload: usagePayload,
  })
}

export function finalizeRoundWithoutTools({
  send = () => {},
  persistTimelineEvent = () => {},
  sendTurnState = () => {},
  touchProjectUsageByThread = () => {},
  continuityRuntime = null,
  runPostTurnTasks = () => {},
  projectFolder = '',
  userMessage = '',
  assistantText = '',
  reasoningSegments = [],
  turnToolResults = [],
  mode = 'execute',
  memoryCompressionEnabled = false,
  memoryCompressionThreshold = 0,
  memoryCompressionCooldownMs = 0,
  memoryCompressionMaxPerHour = 0,
  memoryCompressionMinNewLogs = 0,
  providerId = '',
  apiKey = '',
  model = '',
  loop = null,
  isAbortError = () => false,
  threadId = '',
  turnId = '',
  round = 0,
  stopReason = '',
  assistantMessageId = '',
  assistantPhase = '',
  questionUser = null,
  assistantHistoryParts = null,
  generatedArtifacts = null,
  commitFinalTurn = null,
} = {}) {
  const normalizedQuestionUser = normalizeQuestionUserRequest(questionUser)
  const normalizedAssistantMessageId = String(assistantMessageId || '').trim()
  const normalizedAssistantHistoryParts = Array.isArray(assistantHistoryParts) && assistantHistoryParts.length > 0
    ? assistantHistoryParts
    : null
  const normalizedGeneratedArtifacts = Array.isArray(generatedArtifacts) && generatedArtifacts.length > 0
    ? generatedArtifacts
    : null
  const finalDocument = normalizedAssistantMessageId
    ? buildCanonicalFinalDocument({
      threadId,
      turnId,
      messageId: normalizedAssistantMessageId,
      text: assistantText,
      hasAuthoritativeMessageBinding: true,
    })
    : null
  const donePayload = {
    full: assistantText,
    threadId,
    turnId,
    round,
    emittedAt: Date.now(),
    providerId: String(providerId || ''),
    model: String(model || ''),
    ...(normalizedAssistantMessageId ? { assistantMessageId: normalizedAssistantMessageId } : {}),
    ...(finalDocument ? { finalDocument } : {}),
    ...(normalizedQuestionUser ? { questionUser: normalizedQuestionUser } : {}),
    ...(String(assistantPhase || '').trim() ? { phase: String(assistantPhase || '').trim() } : {}),
    ...(normalizedAssistantHistoryParts ? { providerHistoryParts: normalizedAssistantHistoryParts } : {}),
    ...(normalizedGeneratedArtifacts ? { generatedArtifacts: normalizedGeneratedArtifacts } : {}),
  }
  const assistantMeta = {
    stopReason: String(stopReason ?? ''),
    providerId: String(providerId ?? ''),
    model: String(model ?? ''),
    ...(normalizedAssistantMessageId ? { assistantMessageId: normalizedAssistantMessageId } : {}),
    ...(finalDocument ? { finalDocument } : {}),
    ...(normalizedQuestionUser ? { questionUser: normalizedQuestionUser } : {}),
    ...(String(assistantPhase || '').trim() ? { phase: String(assistantPhase || '').trim() } : {}),
    ...(normalizedAssistantHistoryParts ? { providerHistoryParts: normalizedAssistantHistoryParts } : {}),
    ...(normalizedGeneratedArtifacts ? { generatedArtifacts: normalizedGeneratedArtifacts } : {}),
  }
  if (typeof commitFinalTurn === 'function') {
    commitFinalTurn({
      donePayload,
      assistantMeta,
      terminalPayload: { status: 'ok', stopReason: String(stopReason ?? '') },
    })
    if (loop) loop.turnStateFinalized = true
  } else {
    persistTimelineEvent('assistant_message', {
      role: 'assistant',
      content: assistantText,
      meta: assistantMeta,
    })
    send('chat:done', donePayload)
    sendTurnState('completed', { status: 'ok', stopReason: String(stopReason ?? '') })
  }

  if (threadId) {
    try {
      touchProjectUsageByThread(threadId, providerId, model ?? '')
    } catch (error) {
      console.warn('[chat-turn-events] failed to update project usage:', error?.message || error)
    }
  }
  try {
    continuityRuntime?.persistTurnContinuity?.({ assistantText, toolResults: turnToolResults, userMessage })
  } catch (error) {
    console.warn('[chat-turn-events] failed to persist turn continuity:', error?.message || error)
  }

  runPostTurnTasks({
    projectFolder,
    userMessage,
    assistantText,
    reasoningSegments,
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
    activeThreadId: threadId,
    activeTurnId: turnId,
    isAbortError,
  })
}

export function recordToolStepOutcome({
  turnToolResults = [],
  history = [],
  send = () => {},
  persistTimelineEvent = () => {},
  buildToolResultMessage = () => ({}),
  trimText = (value) => String(value ?? ''),
  extractRunCommandMeta = () => ({}),
  approvalId = '',
  tc = {},
  toolInput = {},
  toolEventInput = {},
  result = '',
  isError = false,
  decision = 'denied',
  denyReason = '',
  missingDependencySuspected = false,
  stepId = '',
  sequence = 0,
  startedAt = 0,
  finishedAt = 0,
  durationMs = 0,
  threadId = '',
  turnId = '',
  runCommandPolicyActivityMeta = null,
  browserActionPolicyActivityMeta = null,
  terminalSessionActivityMeta = null,
  writeArtifactMeta = null,
  writeArtifactChanges = [],
  shellWriteDiagnostics = null,
  lintResult = null,
  providerId = '',
  model = '',
  promptBudgetProfile = null,
  errorDiagnostics = null,
} = {}) {
  const resultDisplay = formatToolResultForDisplay(tc.name, result)
  const normalizedToolName = String(tc?.name || '').trim().toLowerCase()
  const questionUser = (
    normalizedToolName === 'question_user'
    && !isError
    && String(decision || '').trim().toLowerCase() === 'approved'
  )
    ? (
        normalizeQuestionUserRequest(result)
        || normalizeQuestionUserRequest(toolInput)
        || normalizeQuestionUserRequest(toolEventInput)
      )
    : null
  const classifyToolErrorSeverity = () => {
    if (!isError || decision !== 'approved') return ''
    const tool = String(tc?.name || '').trim().toLowerCase()
    const text = String(result ?? '').toLowerCase()
    if (tool === 'fetch_page') {
      const isRecoverableFetchFailure = (
        /http\s(401|403|404|408|409|410|429|5\d\d)\b/.test(text)
        || text.includes('forbidden')
        || text.includes('not found')
        || text.includes('timed out')
        || text.includes('timeout')
        || text.includes('network')
        || text.includes('dns')
        || text.includes('econn')
        || text.includes('challenge')
      )
      if (isRecoverableFetchFailure) return 'warning'
    }
    return 'critical'
  }
  const errorSeverity = classifyToolErrorSeverity()
  const normalizedWriteChanges = Array.isArray(writeArtifactChanges)
    ? writeArtifactChanges.filter((row) => (
        row
        && typeof row === 'object'
        && String(row.filePath || '').trim()
        && isProvableShellFileChange(row)
      ))
    : []
  const primaryWriteArtifactMeta = writeArtifactMeta
    && typeof writeArtifactMeta === 'object'
    && String(writeArtifactMeta.filePath || '').trim()
    ? writeArtifactMeta
    : (normalizedWriteChanges[0] || null)
  const writeChangesForEmission = normalizedWriteChanges.length > 0
    ? normalizedWriteChanges
    : (primaryWriteArtifactMeta ? [primaryWriteArtifactMeta] : [])
  const artifactTracking = buildArtifactTrackingState({
    toolName: tc?.name,
    decision,
    isError,
    rawWriteChanges: writeArtifactChanges,
    emittedWriteChanges: writeChangesForEmission,
    shellWriteDiagnostics,
  })
  const runCommandMeta = (tc.name === 'run_command' || tc.name === 'local_shell')
    ? {
        ...extractRunCommandMeta(result, toolInput, isError || decision !== 'approved'),
        ...(shellWriteDiagnostics && typeof shellWriteDiagnostics === 'object'
          ? { shellWriteHydration: shellWriteDiagnostics }
          : {}),
      }
    : {}
  const failureClass = resolveToolFailureClass({
    toolName: tc?.name,
    result,
    decision,
    denyReason,
    lintResult,
  })
  const effectivePromptBudgetProfile = promptBudgetProfile && typeof promptBudgetProfile === 'object'
    ? promptBudgetProfile
    : resolveProviderPromptBudgetProfile({ providerId, modelId: model })
  const budgetedResult = budgetToolResultForModel({
    providerId,
    model,
    toolName: tc?.name,
    result,
    isError,
    decision,
    promptBudgetProfile: effectivePromptBudgetProfile,
    fileChange: primaryWriteArtifactMeta,
    fileChanges: writeChangesForEmission,
    threadId,
    turnId,
  })
  const resultForModel = budgetedResult.resultText
  const toolResultBudget = budgetedResult.truncationMetadata
    && typeof budgetedResult.truncationMetadata === 'object'
    ? budgetedResult.truncationMetadata
    : null
  recordToolResultSpilloverOutcome(errorDiagnostics, toolResultBudget)

  turnToolResults.push({
    approvalId,
    toolName: tc.name,
    input: toolInput,
    result: resultForModel,
    resultForModel,
    isError,
    errorSeverity,
    decision,
    denyReason,
    missingDependencySuspected,
    stepId,
    sequence,
    startedAt,
    finishedAt,
    durationMs,
    fileChange: primaryWriteArtifactMeta,
    fileChanges: writeChangesForEmission,
    artifactTracking,
    lintCode: String(lintResult?.lintCode || '').trim(),
    failureClass,
    rerouteToolName: String(lintResult?.rerouteToolName || '').trim(),
    lintDecision: String(lintResult?.decision || '').trim(),
    ...(questionUser ? { questionUser } : {}),
    ...(toolResultBudget ? { toolResultBudget } : {}),
    ...(shellWriteDiagnostics && typeof shellWriteDiagnostics === 'object'
      ? { shellWriteHydration: shellWriteDiagnostics }
      : {}),
  })

  const toolContextFacts = buildToolContextFacts({
    toolName: tc?.name,
    toolInput,
    result,
    isError,
    decision,
    writeArtifactChanges: writeChangesForEmission,
    failureClass,
    lintCode: String(lintResult?.lintCode || '').trim(),
    rerouteToolName: String(lintResult?.rerouteToolName || '').trim(),
  })

  const stepMeta = { threadId, turnId, stepId, sequence, startedAt, finishedAt, durationMs }
  const toolResultMeta = {
      ...stepMeta,
      toolName: tc.name,
      decision,
      denyReason,
      isError: !!isError,
      errorSeverity,
      missingDependencySuspected,
      ...(lintResult && typeof lintResult === 'object'
        ? {
          lintCode: String(lintResult.lintCode || '').trim(),
          failureClass,
          rerouteToolName: String(lintResult.rerouteToolName || '').trim(),
          lintDecision: String(lintResult.decision || '').trim(),
        }
        : {}),
      toolInput: toolEventInput,
      resultPreview: trimText(resultDisplay, 5000),
      ...(questionUser ? { questionUser } : {}),
      ...(toolResultBudget?.truncated === true ? { toolResultBudget } : {}),
      ...runCommandMeta,
      ...(runCommandPolicyActivityMeta && typeof runCommandPolicyActivityMeta === 'object'
        ? runCommandPolicyActivityMeta
        : {}),
      ...(browserActionPolicyActivityMeta && typeof browserActionPolicyActivityMeta === 'object'
        ? browserActionPolicyActivityMeta
        : {}),
      ...(terminalSessionActivityMeta && typeof terminalSessionActivityMeta === 'object'
        ? terminalSessionActivityMeta
        : {}),
      ...(primaryWriteArtifactMeta
        ? { fileChange: primaryWriteArtifactMeta }
        : {}),
      ...(writeChangesForEmission.length > 0
        ? { fileChanges: writeChangesForEmission }
        : {}),
      ...(artifactTracking ? { artifactTracking } : {}),
  }

  const toolResultPayload = {
    ...stepMeta,
    approvalId,
    toolName: tc.name,
    toolInput: toolEventInput,
    result: resultDisplay,
    ...(questionUser ? { questionUser } : {}),
    isError,
    errorSeverity,
    decision,
    denyReason,
    missingDependencySuspected,
    ...(lintResult && typeof lintResult === 'object'
      ? {
        lintCode: String(lintResult.lintCode || '').trim(),
        failureClass,
        rerouteToolName: String(lintResult.rerouteToolName || '').trim(),
        lintDecision: String(lintResult.decision || '').trim(),
      }
      : {}),
    ...runCommandMeta,
    ...(runCommandPolicyActivityMeta && typeof runCommandPolicyActivityMeta === 'object'
      ? runCommandPolicyActivityMeta
      : {}),
    ...(browserActionPolicyActivityMeta && typeof browserActionPolicyActivityMeta === 'object'
      ? browserActionPolicyActivityMeta
      : {}),
    ...(terminalSessionActivityMeta && typeof terminalSessionActivityMeta === 'object'
      ? terminalSessionActivityMeta
      : {}),
    ...(primaryWriteArtifactMeta
      ? { fileChange: primaryWriteArtifactMeta }
      : {}),
    ...(writeChangesForEmission.length > 0
      ? { fileChanges: writeChangesForEmission }
      : {}),
    ...(artifactTracking ? { artifactTracking } : {}),
  }
  commitProjectedTimelineEvent({
    persistTimelineEvent, send, kind: 'tool_result',
    options: { role: 'assistant', content: resultDisplay, meta: toolResultMeta },
    channel: 'chat:tool-result', payload: toolResultPayload,
  })

  commitPlanLifecycleProjection({ result, stepMeta, threadId, isError, decision, persistTimelineEvent, send })

  if (artifactTracking && artifactTracking.status !== 'tracked') {
    const artifactTrackingPayload = {
      threadId,
      turnId,
      stepId,
      sequence,
      startedAt,
      finishedAt,
      durationMs,
      toolName: String(tc?.name || '').trim(),
      ...artifactTracking,
    }
    const content = `Artifact tracking ${artifactTracking.status}: ${artifactTracking.reason || artifactTracking.reasonCode || 'unknown reason'}`
    commitProjectedTimelineEvent({
      persistTimelineEvent, send, kind: 'artifact_tracking',
      options: { role: 'system', content, meta: artifactTrackingPayload },
      channel: 'chat:artifact-tracking', payload: artifactTrackingPayload,
    })
  }

  persistToolContextFacts({
    persistTimelineEvent,
    threadId,
    turnId,
    stepId,
    sequence,
    startedAt,
    finishedAt,
    durationMs,
    facts: toolContextFacts,
  })

  for (const fileChange of writeChangesForEmission) {
    if (decision !== 'approved' || isError) break
    const summary = buildFileChangeSummary(fileChange)
    const payload = {
      threadId,
      turnId,
      stepId,
      sequence,
      startedAt,
      finishedAt,
      durationMs,
      ...fileChange,
    }
    commitProjectedTimelineEvent({
      persistTimelineEvent, send, kind: 'file_change',
      options: { role: 'assistant', content: summary, meta: payload },
      channel: 'chat:file-change', payload,
    })

    // Emit a dedicated write-conflict event when the artifact store detected
    // that another thread/turn wrote to the same file between our read and
    // this write.  The write is still recorded (staged in the artifact store)
    // but the renderer should surface it as a conflict needing review.
    if (fileChange.conflict === true) {
      const conflictPayload = {
        threadId,
        turnId,
        stepId,
        sequence,
        filePath: String(fileChange.filePath || '').trim(),
        newRevId: String(fileChange.newRevId || ''),
        prevRevId: String(fileChange.prevRevId || ''),
        conflictBaseRevId: String(fileChange.conflictBaseRevId || ''),
        conflictActualRevId: String(fileChange.conflictActualRevId || ''),
        toolName: String(tc?.name || ''),
        detectedAt: Date.now(),
      }
      commitProjectedTimelineEvent({
        persistTimelineEvent, send, kind: 'write_conflict',
        options: {
          role: 'system',
          content: `Write conflict on ${conflictPayload.filePath}: expected base revision ${conflictPayload.conflictBaseRevId}, found ${conflictPayload.conflictActualRevId}`,
          meta: conflictPayload,
        },
        channel: 'chat:write-conflict', payload: conflictPayload,
      })
    }
  }

  const resultMsg = buildToolResultMessage(tc.id, tc.name, resultForModel, isError, {
    lintCode: String(lintResult?.lintCode || '').trim(),
    failureClass,
    rerouteToolName: String(lintResult?.rerouteToolName || '').trim(),
    lintDecision: String(lintResult?.decision || '').trim(),
    isError: !!isError,
    decision,
  })
  history.push(resultMsg)
}
