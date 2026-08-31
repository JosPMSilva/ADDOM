import { formatToolResultForDisplay } from '../../common/chat/tool-result-display.mjs'
import { buildInterruptedReasoningSnapshot } from './chat-turn-events.mjs'
import { TOOL_CALL_LINT_DECISIONS } from './tool-call-linter.mjs'

export const APPROVAL_RENDERER_UNAVAILABLE_MESSAGE = 'Approval interrupted because the window reloaded or closed. Reopen the thread and retry.'

export function buildQuestionUserAssistantText(result = {}) {
  const normalized = result && typeof result === 'object' ? result : {}
  const base = formatToolResultForDisplay('question_user', normalized).trim()
  if (!base) return 'Clarification needed.\n\nReply with the missing detail and I will continue from there.'
  return `${base}\n\nReply with your choice or provide the missing detail and I will continue from there.`
}

const FILE_MUTATION_TOOLS = new Set([
  'apply_artifact_revision',
  'apply_patch',
  'delete_file',
  'edit_file',
  'rename_file',
  'write_file',
])

export function isFileMutationTool(toolName = '') {
  return FILE_MUTATION_TOOLS.has(String(toolName || '').trim().toLowerCase())
}

export function getBlockedToolNames(loop = null) {
  if (!loop || typeof loop !== 'object') return new Set()
  if (!(loop.blockedToolNames instanceof Set)) {
    loop.blockedToolNames = new Set()
  }
  return loop.blockedToolNames
}

export function getBlockedToolStates(loop = null) {
  if (!loop || typeof loop !== 'object') return new Map()
  if (!(loop.blockedToolStates instanceof Map)) {
    loop.blockedToolStates = new Map()
  }
  return loop.blockedToolStates
}

function getMalformedPatchFailureCount(loop = null) {
  if (!loop || typeof loop !== 'object') return 0
  const count = Number(loop.malformedPatchFailureCount || 0) || 0
  return count > 0 ? count : 0
}

function setMalformedPatchFailureCount(loop = null, count = 0) {
  if (!loop || typeof loop !== 'object') return 0
  const normalized = Math.max(0, Number(count || 0) || 0)
  loop.malformedPatchFailureCount = normalized
  return normalized
}

export function buildBlockedToolResult({ toolName = '', blockedState = null } = {}) {
  const normalizedToolName = String(toolName || '').trim().toLowerCase()
  const rerouteToolName = String(blockedState?.rerouteToolName || '').trim()
  const failureClass = String(blockedState?.failureClass || '').trim()
  const lintCode = String(blockedState?.lintCode || '').trim()
  if (normalizedToolName === 'apply_patch') {
    return {
      result: 'Tool error: apply_patch is disabled for this turn after malformed patch failures. Use write_file for whole-file replacement, or edit_file for exact-text replacement after reading the current file.',
      lintResult: {
        decision: TOOL_CALL_LINT_DECISIONS.REJECT,
        lintCode: lintCode || 'apply_patch_disabled_for_turn',
        failureClass: failureClass || 'MALFORMED_PATCH_SYNTAX',
        rerouteToolName: rerouteToolName || 'write_file',
        severity: 'error',
      },
    }
  }
  if (normalizedToolName === 'edit_file') {
    return {
      result: 'Tool error: edit_file is disabled for this turn after exact-text mismatches. Read the current file content first, then retry edit_file with an exact old_text match.',
      lintResult: {
        decision: TOOL_CALL_LINT_DECISIONS.REJECT,
        lintCode: lintCode || 'edit_file_disabled_for_turn',
        failureClass: failureClass || 'EXACT_TEXT_NO_MATCH',
        rerouteToolName: rerouteToolName || 'read_file',
        severity: 'error',
      },
    }
  }
  return {
    result: `Tool error: ${toolName} is disabled for this turn due to repeated failure.`,
    lintResult: {
      decision: TOOL_CALL_LINT_DECISIONS.REJECT,
      lintCode: lintCode || 'tool_disabled_for_turn',
      failureClass,
      rerouteToolName,
      severity: 'error',
    },
  }
}

export function recordBlockedToolRetryStep({
  blockedToolNames = new Set(),
  blockedToolStates = new Map(),
  tc = {},
  toolInput = {},
  toolEventInput = {},
  recordToolStepOutcome = () => {},
  recordToolWorkflowOutcome = () => {},
  turnToolResults = [],
  history = [],
  send = () => {},
  persistTimelineEvent = () => {},
  buildToolResultMessage = () => ({}),
  trimText = (value) => String(value ?? ''),
  extractRunCommandMeta = () => ({}),
  stepId = '',
  stepSequence = 0,
  stepStartedAt = 0,
  activeThreadId = '',
  activeTurnId = '',
  providerId = '',
  model = '',
  promptBudgetProfile = null,
  errorDiagnostics = {},
  turnStartedAt = 0,
} = {}) {
  const toolName = String(tc?.name || '').trim().toLowerCase()
  if (!toolName || !blockedToolNames.has(toolName)) return false
  const stepFinishedAt = Date.now()
  const durationMs = Math.max(0, stepFinishedAt - stepStartedAt)
  const blockedTool = buildBlockedToolResult({
    toolName: tc?.name,
    blockedState: blockedToolStates.get(toolName) || null,
  })
  recordToolStepOutcome({
    turnToolResults,
    history,
    send,
    persistTimelineEvent,
    buildToolResultMessage,
    trimText,
    extractRunCommandMeta,
    approvalId: '',
    tc,
    toolInput,
    toolEventInput,
    result: blockedTool.result,
    isError: true,
    decision: 'approved',
    denyReason: '',
    missingDependencySuspected: false,
    stepId,
    sequence: stepSequence,
    startedAt: stepStartedAt,
    finishedAt: stepFinishedAt,
    durationMs,
    threadId: activeThreadId,
    turnId: activeTurnId,
    providerId,
    model,
    promptBudgetProfile,
    errorDiagnostics,
    lintResult: blockedTool.lintResult,
  })
  const blockedOutcome = turnToolResults[turnToolResults.length - 1] || {}
  recordToolWorkflowOutcome(errorDiagnostics, {
    toolName: tc?.name,
    decision: 'approved',
    isError: true,
    failureClass: blockedOutcome.failureClass || blockedTool.lintResult?.failureClass || '',
    rerouteToolName: blockedOutcome.rerouteToolName || blockedTool.lintResult?.rerouteToolName || '',
    turnStartedAt,
    finishedAt: stepFinishedAt,
    repeatedBlockedRetry: true,
  })
  return true
}

export function buildDeniedToolCallResult({
  toolName = '',
  denyReason = '',
  approvalPolicy = null,
} = {}) {
  if (denyReason === 'timeout') {
    return { result: `Tool approval expired (timeout): ${toolName}`, isError: false }
  }
  if (denyReason === 'cancelled') {
    return { result: `Tool call cancelled: ${toolName}`, isError: false }
  }
  if (denyReason === 'renderer_unavailable') {
    return { result: `${APPROVAL_RENDERER_UNAVAILABLE_MESSAGE} (${toolName})`, isError: true }
  }
  if (denyReason === 'policy_denied') {
    const policyHints = Array.isArray(approvalPolicy?.hints)
      ? approvalPolicy.hints.map((message) => String(message || '').trim()).filter(Boolean)
      : []
    const policyHintBlock = policyHints.length > 0
      ? `\n\nPolicy hints:\n- ${Array.from(new Set(policyHints)).join('\n- ')}`
      : ''
    return {
      result: `Tool call blocked by command safety policy: ${toolName}${policyHintBlock}`,
      isError: true,
    }
  }
  return { result: `Tool call denied by user: ${toolName}`, isError: false }
}

export function updateToolBatchFailureState({
  roundResults = [],
  loop = null,
  consecutiveErrorRounds = 0,
  maxConsecutiveErrorRounds = 3,
  moaSpecializedContinuationPromptInjectedThisRound = false,
  errorDiagnostics = {},
  history = [],
  buildToolRecoveryPrompt = () => '',
} = {}) {
  const roundAllFailed = roundResults.length > 0
    && roundResults.every((result) => result.isError)
  if (!roundAllFailed) return 0

  const blockedToolNames = getBlockedToolNames(loop)
  const blockedToolStates = getBlockedToolStates(loop)
  const nextConsecutiveErrorRounds = consecutiveErrorRounds + 1
  const malformedPatchFailuresThisRound = roundResults.filter((row) => String(row?.failureClass || '').trim().toUpperCase() === 'MALFORMED_PATCH_SYNTAX').length
  const malformedPatchFailuresBeforeRound = getMalformedPatchFailureCount(loop)
  const malformedPatchFailuresAfterRound = setMalformedPatchFailureCount(
    loop,
    malformedPatchFailuresBeforeRound + malformedPatchFailuresThisRound,
  )
  if (malformedPatchFailuresBeforeRound < 1 && malformedPatchFailuresAfterRound >= 1) {
    errorDiagnostics.toolWorkflowApplyPatchRetryAllowedCount = Number(errorDiagnostics.toolWorkflowApplyPatchRetryAllowedCount || 0) + 1
  }
  const shouldDisableApplyPatch = malformedPatchFailuresAfterRound >= 2
  if (shouldDisableApplyPatch) {
    blockedToolNames.add('apply_patch')
    blockedToolStates.set('apply_patch', {
      lintCode: 'apply_patch_disabled_for_turn',
      failureClass: 'MALFORMED_PATCH_SYNTAX',
      rerouteToolName: 'write_file',
    })
    if (malformedPatchFailuresBeforeRound < 2) {
      errorDiagnostics.toolWorkflowApplyPatchHardBlockCount = Number(errorDiagnostics.toolWorkflowApplyPatchHardBlockCount || 0) + 1
    }
  }
  const shouldDisableEditFile = roundResults.some((row) => String(row?.failureClass || '').trim().toUpperCase() === 'EXACT_TEXT_NO_MATCH')
  if (shouldDisableEditFile) {
    blockedToolNames.add('edit_file')
    blockedToolStates.set('edit_file', {
      lintCode: 'edit_file_disabled_for_turn',
      failureClass: 'EXACT_TEXT_NO_MATCH',
      rerouteToolName: 'read_file',
    })
  }
  if (nextConsecutiveErrorRounds < maxConsecutiveErrorRounds && !moaSpecializedContinuationPromptInjectedThisRound) {
    history.push({
      role: 'system',
      content: buildToolRecoveryPrompt({
        roundResults,
        consecutiveErrorRounds: nextConsecutiveErrorRounds,
        maxConsecutiveErrorRounds,
        malformedPatchFailuresThisTurn: malformedPatchFailuresAfterRound,
      }),
    })
  }
  return nextConsecutiveErrorRounds
}

export function stopAfterConsecutiveToolErrors({
  maxConsecutiveErrorRounds = 3,
  turnReasoningSegments = [],
  send = () => {},
  sendTurnState = () => {},
  persistTimelineEvent = () => {},
  commitFailureTurn = null,
  emitTurnRuntimeDiagnostics = () => {},
  activeThreadId = '',
  activeTurnId = '',
} = {}) {
  const reasoningSnapshot = buildInterruptedReasoningSnapshot({ turnReasoningSegments })
  emitTurnRuntimeDiagnostics()
  const message = `Stopped after ${maxConsecutiveErrorRounds} consecutive rounds of tool errors. The last tool calls all failed - please check the error details above.`
  const errorMeta = {
    threadId: String(activeThreadId || ''),
    turnId: String(activeTurnId || ''),
    reason: 'consecutive_tool_errors',
    ...(reasoningSnapshot ? { reasoningSnapshot } : {}),
  }
  if (typeof commitFailureTurn === 'function') {
    commitFailureTurn({ message, reason: 'consecutive_tool_errors', errorMeta })
  } else {
    persistTimelineEvent('chat_error', {
      role: 'system',
      content: `Stopped: ${maxConsecutiveErrorRounds} consecutive rounds of tool errors.`,
      meta: errorMeta,
    })
    send('chat:error', { message })
    sendTurnState('completed', { status: 'error', reason: 'consecutive_tool_errors' })
  }
}

export function stopAfterMaxToolRounds({
  maxToolRounds = 40,
  turnReasoningSegments = [],
  send = () => {},
  sendTurnState = () => {},
  persistTimelineEvent = () => {},
  commitFailureTurn = null,
  emitTurnRuntimeDiagnostics = () => {},
  activeThreadId = '',
  activeTurnId = '',
} = {}) {
  const reasoningSnapshot = buildInterruptedReasoningSnapshot({ turnReasoningSegments })
  emitTurnRuntimeDiagnostics()
  const message = `Maximum tool call rounds (${maxToolRounds}) reached. Stopping.`
  const errorMeta = {
    threadId: String(activeThreadId || ''),
    turnId: String(activeTurnId || ''),
    reason: 'max_tool_rounds',
    ...(reasoningSnapshot ? { reasoningSnapshot } : {}),
  }
  if (typeof commitFailureTurn === 'function') {
    commitFailureTurn({ message, reason: 'max_tool_rounds', errorMeta })
  } else {
    persistTimelineEvent('chat_error', {
      role: 'system',
      content: message,
      meta: errorMeta,
    })
    send('chat:error', { message })
    sendTurnState('completed', { status: 'error', reason: 'max_tool_rounds' })
  }
}

export function finalizeQuestionUserRound({
  helpers = {},
  send = () => {},
  persistTimelineEvent = () => {},
  sendTurnState = () => {},
  continuityRuntime = null,
  projectFolder = '',
  userMessage = '',
  questionUserRequest = null,
  turnReasoningSegments = [],
  turnToolResults = [],
  mode = '',
  memoryCompressionEnabled = false,
  memoryCompressionThreshold = 0,
  memoryCompressionCooldownMs = 0,
  memoryCompressionMaxPerHour = 0,
  memoryCompressionMinNewLogs = 0,
  providerId = '',
  apiKey = '',
  model = '',
  loop = null,
  activeThreadId = '',
  activeTurnId = '',
  activeAssistantMessageId = '',
  round = 0,
  assistantFinalPhase = '',
} = {}) {
  const { finalizeRoundWithoutTools } = helpers
  if (typeof finalizeRoundWithoutTools !== 'function') {
    throw new Error('finalizeRoundWithoutTools helper is required for question_user handoff.')
  }
  finalizeRoundWithoutTools({
    send,
    persistTimelineEvent,
    sendTurnState,
    touchProjectUsageByThread: typeof helpers.touchProjectUsageByThread === 'function' ? helpers.touchProjectUsageByThread : () => {},
    continuityRuntime,
    runPostTurnTasks: typeof helpers.runPostTurnTasks === 'function' ? helpers.runPostTurnTasks : () => {},
    projectFolder,
    userMessage,
    assistantText: String(questionUserRequest?.assistantText || '').trim(),
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
    model,
    loop,
    isAbortError: typeof helpers.isAbortError === 'function' ? helpers.isAbortError : () => false,
    threadId: activeThreadId,
    turnId: activeTurnId,
    assistantMessageId: activeAssistantMessageId,
    round,
    stopReason: 'question_user',
    assistantPhase: assistantFinalPhase,
    questionUser: questionUserRequest,
  })
}
