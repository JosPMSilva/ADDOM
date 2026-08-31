import crypto from 'node:crypto'
import { estimateTextTokens } from './token-utils.mjs'

const DEFAULT_RECENT_TOOL_RESULT_BUDGET_CHARS = 64_000
const DEFAULT_MIN_PRUNE_CHARS = 1_000
const PRUNED_PLACEHOLDER_HEADER = '[Old tool result cleared for prompt budget]'

const LOW_VALUE_HISTORY_TOOLS = new Set([
  'read_file',
  'view_file_range',
  'search_code',
  'grep_file',
  'find_files',
  'list_directory',
  'fetch_page',
  'browser_action',
  'git_status',
  'git_diff',
  'git_log',
])

const HIGH_VALUE_HISTORY_TOOLS = new Set([
  'run_command',
  'local_shell',
  'terminal_session_read_snapshot',
])

const WRITE_OR_EDIT_TOOLS = new Set([
  'write_file',
  'edit_file',
  'apply_patch',
  'delete_file',
  'rename_file',
  'rollback_file',
  'apply_artifact_revision',
  'artifacts_apply_to_disk',
  'artifacts_rollback',
  'git_commit',
  'git_checkout_file',
  'plan_update',
  'todo_write',
])

const COMMAND_LIKE_TOOLS = new Set([
  'run_command',
  'local_shell',
  'terminal_session_open',
  'terminal_session_write',
  'terminal_session_read_snapshot',
  'terminal_session_close',
])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeToolName(value = '') {
  return normalizeText(value).toLowerCase()
}

function clampPositiveInt(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback
}

function resolvePreserveRecentUserTurns(profile = null, explicit = 0) {
  const requested = clampPositiveInt(explicit, 0)
  if (requested > 0) return Math.min(4, Math.max(2, requested))
  const pruneMode = normalizeText(profile?.oldToolResultPrune).toLowerCase()
  if (pruneMode === 'aggressive') return 2
  if (pruneMode === 'moderate') return 3
  return 4
}

function resolveRecentToolResultBudgetChars(profile = null, explicit = 0) {
  const requested = clampPositiveInt(explicit, 0)
  if (requested > 0) return requested
  return clampPositiveInt(
    profile?.oldToolResultProtectChars,
    clampPositiveInt(profile?.perTurnToolResultBudgetChars, DEFAULT_RECENT_TOOL_RESULT_BUDGET_CHARS),
  )
}

function resolveMinPruneChars(profile = null, explicit = 0) {
  const requested = clampPositiveInt(explicit, 0)
  if (requested > 0) return requested
  return clampPositiveInt(profile?.oldToolResultMinPruneChars, DEFAULT_MIN_PRUNE_CHARS)
}

function stringifyToolOutput(output = null) {
  if (typeof output === 'string') return output
  if (!output || typeof output !== 'object') return output == null ? '' : String(output)
  if (typeof output.value === 'string') return output.value
  if (Object.prototype.hasOwnProperty.call(output, 'value')) {
    try {
      return JSON.stringify(output.value, null, 2)
    } catch {
      return String(output.value)
    }
  }
  try {
    return JSON.stringify(output, null, 2)
  } catch {
    return String(output)
  }
}

function isAlreadyPrunedToolResult(part = {}) {
  return part?.toolResultHistoryPruned?.pruned === true
}

function isErrorToolResult(part = {}, outputText = '') {
  const outputType = normalizeText(part?.output?.type).toLowerCase()
  if (part?.isError === true) return true
  if (outputType === 'error-text') return true
  if (normalizeText(part?.decision).toLowerCase() === 'error') return true
  const failureClass = normalizeText(part?.failureClass).toLowerCase()
  return Boolean(failureClass && /error|fail|lint|guard/.test(failureClass) && outputText)
}

function isDeniedOrGuarded(part = {}) {
  const decision = normalizeText(part?.decision).toLowerCase()
  if (decision && decision !== 'approved') return true
  if (normalizeText(part?.denyReason)) return true
  if (normalizeText(part?.lintCode)) return true
  if (normalizeText(part?.lintDecision)) return true
  if (normalizeText(part?.rerouteToolName)) return true
  const failureClass = normalizeText(part?.failureClass).toLowerCase()
  return Boolean(failureClass && /lint|guard|policy|approval|permission/.test(failureClass))
}

function isCriticalToolResult(part = {}, outputText = '') {
  const toolName = normalizeToolName(part?.toolName || part?.name || part?.tool)
  if (!toolName) return false
  if (WRITE_OR_EDIT_TOOLS.has(toolName)) return true
  if (toolName === 'terminal_memory_suggest') return true
  if (isDeniedOrGuarded(part)) return true
  if (isErrorToolResult(part, outputText) && COMMAND_LIKE_TOOLS.has(toolName)) return true
  return false
}

function isLowValueHistoryTool(toolName = '') {
  return LOW_VALUE_HISTORY_TOOLS.has(normalizeToolName(toolName))
}

function isHighValueHistoryTool(toolName = '') {
  return HIGH_VALUE_HISTORY_TOOLS.has(normalizeToolName(toolName))
}

function buildOutputHash(text = '') {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex').slice(0, 16)
}

function classifyToolResultRetention(part = {}, outputText = '') {
  const toolName = normalizeToolName(part?.toolName || part?.name || part?.tool)
  if (!toolName) return 'standard_history'
  if (isCriticalToolResult(part, outputText)) return 'critical'
  if (isHighValueHistoryTool(toolName)) return 'high_value_history'
  if (isLowValueHistoryTool(toolName)) return 'low_value_history'
  return 'standard_history'
}

function resolveRetentionProtectionPriority(retentionClass = '') {
  switch (normalizeText(retentionClass).toLowerCase()) {
    case 'high_value_history':
      return 3
    case 'standard_history':
      return 2
    case 'low_value_history':
      return 1
    default:
      return 0
  }
}

function resolvePruneReason(retentionClass = '') {
  return normalizeText(retentionClass).toLowerCase() === 'low_value_history'
    ? 'old_low_value_tool_output'
    : 'old_noncritical_tool_output'
}

function createRetentionCounts() {
  return {
    high_value_history: 0,
    standard_history: 0,
    low_value_history: 0,
  }
}

function incrementRetentionCount(target = {}, retentionClass = '') {
  const key = normalizeText(retentionClass).toLowerCase()
  if (!key || !Object.prototype.hasOwnProperty.call(target, key)) return
  target[key] = (Number(target[key]) || 0) + 1
}

function buildPrunedPlaceholder({
  toolName = '',
  outputText = '',
  isError = false,
  decision = '',
  reason = '',
} = {}) {
  const normalizedDecision = normalizeText(decision).toLowerCase()
  const status = isError
    ? 'error'
    : (normalizedDecision && normalizedDecision !== 'approved' ? `decision_${normalizedDecision}` : 'success')
  return [
    PRUNED_PLACEHOLDER_HEADER,
    `tool: ${normalizeText(toolName) || 'unknown'}`,
    `status: ${status}`,
    `reason: ${normalizeText(reason) || 'old_noncritical_tool_output'}`,
    `original_chars: ${String(String(outputText || '').length)}`,
    `output_sha256: ${buildOutputHash(outputText)}`,
  ].join('\n')
}

function replaceToolResultOutput(part = {}, placeholder = '', metadata = {}) {
  return {
    ...part,
    output: {
      type: 'text',
      value: placeholder,
    },
    toolResultHistoryPruned: {
      pruned: true,
      placeholderVersion: 2,
      ...metadata,
    },
  }
}

function collectUserTurnIndexes(messages = []) {
  let currentUserTurn = 0
  const indexes = []
  for (const message of messages) {
    if (normalizeText(message?.role).toLowerCase() === 'user') currentUserTurn += 1
    indexes.push(currentUserTurn)
  }
  return {
    totalUserTurns: currentUserTurn,
    userTurnIndexes: indexes,
  }
}

function collectToolResultEntries(messages = [], userTurnIndexes = [], firstPreservedUserTurn = 1) {
  const entries = []
  for (let messageIndex = 0; messageIndex < messages.length; messageIndex += 1) {
    const message = messages[messageIndex]
    if (normalizeText(message?.role).toLowerCase() !== 'tool') continue
    const content = Array.isArray(message?.content) ? message.content : []
    const inRecentUserTurn = userTurnIndexes[messageIndex] >= firstPreservedUserTurn
      && userTurnIndexes[messageIndex] > 0
    for (let partIndex = 0; partIndex < content.length; partIndex += 1) {
      const part = content[partIndex]
      if (!part || typeof part !== 'object') continue
      if (normalizeText(part.type).toLowerCase() !== 'tool-result') continue
      if (isAlreadyPrunedToolResult(part)) continue
      const toolName = normalizeText(part.toolName || part.name || part.tool)
      const outputText = stringifyToolOutput(part.output)
      const outputChars = outputText.length
      const isError = isErrorToolResult(part, outputText)
      const retentionClass = classifyToolResultRetention(part, outputText)
      entries.push({
        messageIndex,
        partIndex,
        part,
        toolName,
        outputText,
        outputChars,
        isError,
        inRecentUserTurn,
        critical: retentionClass === 'critical',
        retentionClass,
        protectionPriority: resolveRetentionProtectionPriority(retentionClass),
      })
    }
  }
  return entries
}

export function pruneOldToolResultHistory({
  history = [],
  promptBudgetProfile = null,
  preserveRecentUserTurns = 0,
  recentToolResultBudgetChars = 0,
  minPruneChars = 0,
} = {}) {
  const messages = Array.isArray(history) ? history : []
  const profile = promptBudgetProfile && typeof promptBudgetProfile === 'object' ? promptBudgetProfile : null
  if (
    profile?.oldToolResultPruningEnabled === false
    || normalizeText(profile?.oldToolResultPrune).toLowerCase() === 'disabled'
  ) {
    return {
      history: messages,
      diagnostics: {
        applied: false,
        disabled: true,
        prunedCount: 0,
        protectedRecentUserTurns: 0,
        protectedByRecentBudgetCount: 0,
        protectedCriticalCount: 0,
        originalToolResultChars: 0,
        prunedToolResultChars: 0,
        placeholderChars: 0,
        estimatedBeforeToolResultTokens: 0,
        estimatedAfterToolResultTokens: 0,
        estimatedSavedToolResultTokens: 0,
        budgetProfileId: normalizeText(profile?.id),
      },
    }
  }
  const recentTurns = resolvePreserveRecentUserTurns(profile, preserveRecentUserTurns)
  const protectBudgetChars = resolveRecentToolResultBudgetChars(profile, recentToolResultBudgetChars)
  const pruneThresholdChars = resolveMinPruneChars(profile, minPruneChars)
  const { totalUserTurns, userTurnIndexes } = collectUserTurnIndexes(messages)
  const firstPreservedUserTurn = totalUserTurns > 0
    ? Math.max(1, totalUserTurns - recentTurns + 1)
    : 1
  const entries = collectToolResultEntries(messages, userTurnIndexes, firstPreservedUserTurn)
  const protectedEntryKeys = new Set()
  let protectedByRecentBudgetChars = 0
  let protectedByRecentBudgetCount = 0
  let protectedCriticalCount = 0
  const protectedRetentionCounts = createRetentionCounts()
  const prunedRetentionCounts = createRetentionCounts()
  let originalToolResultChars = 0
  let estimatedBeforeToolResultTokens = 0
  let estimatedAfterToolResultTokens = 0

  for (const entry of entries) {
    originalToolResultChars += entry.outputChars
    estimatedBeforeToolResultTokens += estimateTextTokens(entry.outputText)
    if (entry.critical) protectedCriticalCount += 1
  }

  const protectableEntries = entries
    .filter((entry) => !entry.inRecentUserTurn && !entry.critical && entry.outputChars > 0)
    .sort((a, b) => (
      b.protectionPriority - a.protectionPriority
      || b.messageIndex - a.messageIndex
      || b.partIndex - a.partIndex
    ))

  for (const entry of protectableEntries) {
    const nextBudget = protectedByRecentBudgetChars + entry.outputChars
    if (nextBudget > protectBudgetChars) continue
    const key = `${entry.messageIndex}:${entry.partIndex}`
    protectedEntryKeys.add(key)
    protectedByRecentBudgetChars = nextBudget
    protectedByRecentBudgetCount += 1
    incrementRetentionCount(protectedRetentionCounts, entry.retentionClass)
  }

  const prunedEntries = new Map()
  for (const entry of entries) {
    const key = `${entry.messageIndex}:${entry.partIndex}`
    if (entry.inRecentUserTurn || entry.critical || protectedEntryKeys.has(key)) {
      estimatedAfterToolResultTokens += estimateTextTokens(entry.outputText)
      continue
    }
    if (entry.outputChars < pruneThresholdChars) {
      estimatedAfterToolResultTokens += estimateTextTokens(entry.outputText)
      continue
    }
    const reason = resolvePruneReason(entry.retentionClass)
    const placeholder = buildPrunedPlaceholder({
      toolName: entry.toolName,
      outputText: entry.outputText,
      isError: entry.isError,
      decision: entry.part?.decision,
      reason,
    })
    estimatedAfterToolResultTokens += estimateTextTokens(placeholder)
    prunedEntries.set(key, {
      ...entry,
      reason,
      placeholder,
    })
    incrementRetentionCount(prunedRetentionCounts, entry.retentionClass)
  }

  if (prunedEntries.size === 0) {
    return {
      history: messages,
      diagnostics: {
        applied: false,
        prunedCount: 0,
        protectedRecentUserTurns: Math.min(totalUserTurns, recentTurns),
        protectedByRecentBudgetCount,
        protectedCriticalCount,
        protectedRetentionCounts,
        prunedRetentionCounts,
        originalToolResultChars,
        prunedToolResultChars: 0,
        placeholderChars: 0,
        estimatedBeforeToolResultTokens,
        estimatedAfterToolResultTokens,
        estimatedSavedToolResultTokens: 0,
        budgetProfileId: normalizeText(profile?.id),
      },
    }
  }

  let prunedToolResultChars = 0
  let placeholderChars = 0
  const nextHistory = messages.map((message, messageIndex) => {
    if (normalizeText(message?.role).toLowerCase() !== 'tool') return message
    const content = Array.isArray(message?.content) ? message.content : []
    let changed = false
    const nextContent = content.map((part, partIndex) => {
      const pruned = prunedEntries.get(`${messageIndex}:${partIndex}`)
      if (!pruned) return part
      changed = true
      prunedToolResultChars += pruned.outputChars
      placeholderChars += pruned.placeholder.length
      return replaceToolResultOutput(part, pruned.placeholder, {
        reason: pruned.reason,
        retentionClass: pruned.retentionClass,
        originalChars: pruned.outputChars,
        outputSha256: buildOutputHash(pruned.outputText),
      })
    })
    return changed ? { ...message, content: nextContent } : message
  })

  return {
    history: nextHistory,
    diagnostics: {
      applied: true,
      prunedCount: prunedEntries.size,
      protectedRecentUserTurns: Math.min(totalUserTurns, recentTurns),
      protectedByRecentBudgetCount,
      protectedCriticalCount,
      protectedRetentionCounts,
      prunedRetentionCounts,
      originalToolResultChars,
      prunedToolResultChars,
      placeholderChars,
      estimatedBeforeToolResultTokens,
      estimatedAfterToolResultTokens,
      estimatedSavedToolResultTokens: Math.max(0, estimatedBeforeToolResultTokens - estimatedAfterToolResultTokens),
      budgetProfileId: normalizeText(profile?.id),
    },
  }
}
