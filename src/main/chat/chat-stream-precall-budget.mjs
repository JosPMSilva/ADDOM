import {
  buildProviderTruncationBudget,
  buildSafeProviderTruncationOccupancyEstimate,
  resolveProviderTruncationTriggerTokens,
} from '../../common/chat/provider-truncation-budget-policy.mjs'
import { resolveAnthropicContextManagementStrategy } from './continuity/automatic-context-management-resolver.mjs'

const CRITICAL_TASK_CEILING_TOOL_NAMES = new Set([
  'write_file',
  'edit_file',
  'rename_file',
  'delete_file',
  'apply_patch',
  'artifacts_apply_to_disk',
  'artifacts_rollback',
  'run_command',
])

const CRITICAL_TASK_FLOOR_TOOL_NAMES = new Set([
  'read_file',
  'list_directory',
  'fetch_page',
  'browser_action',
  'run_command',
])

function normalizeToolName(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeReasonCodes(values = []) {
  const seen = new Set()
  const out = []
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = String(value || '').trim().toLowerCase()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

function normalizePositiveInt(value, fallback = 0) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return Math.max(0, Math.round(Number(fallback || 0) || 0))
  return Math.max(0, Math.round(n))
}

function formatContributorList(values = []) {
  const rows = Array.isArray(values) ? values : []
  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') return ''
      const category = String(row.category || '').trim()
      const tokens = normalizePositiveInt(row.tokens, 0)
      if (!category || tokens <= 0) return ''
      return `${category}=${tokens}`
    })
    .filter(Boolean)
    .join(', ')
}

function trimHistoryToPromptBudget(history = [], {
  effectivePromptBudgetTokens = 0,
  estimateHistoryTokens = () => 0,
} = {}) {
  const budgetTokens = Math.max(0, Math.round(Number(effectivePromptBudgetTokens || 0) || 0))
  const rows = Array.isArray(history) ? [...history] : []
  if (budgetTokens <= 0 || rows.length <= 1) {
    return { history: rows, removedCount: 0 }
  }
  let removedCount = 0
  while (
    rows.length > 1
    && buildSafeProviderTruncationOccupancyEstimate(estimateHistoryTokens(rows)) > budgetTokens
  ) {
    const removableIndex = rows.findIndex((row) => String(row?.role || '').trim().toLowerCase() !== 'system')
    if (removableIndex < 0) break
    rows.splice(removableIndex, 1)
    removedCount += 1
  }
  return { history: rows, removedCount }
}

export function resolvePromptBudgetHardLimitTokens({
  promptBudgetProfile = null,
} = {}) {
  const profile = promptBudgetProfile && typeof promptBudgetProfile === 'object'
    ? promptBudgetProfile
    : null
  return normalizePositiveInt(profile?.localPreflightInputCeilingTokens, 0)
}

export function createPromptBudgetHardLimitError({
  providerId = '',
  model = '',
  safeEstimateTokens = 0,
  hardLimitTokens = 0,
  promptEstimateTokens = 0,
  promptBudgetProfileId = '',
  dominantContributors = [],
} = {}) {
  const provider = String(providerId || '').trim().toLowerCase() || 'selected provider'
  const modelId = String(model || '').trim()
  const target = modelId ? `${provider}/${modelId}` : provider
  const safeEstimate = normalizePositiveInt(safeEstimateTokens, 0)
  const hardLimit = normalizePositiveInt(hardLimitTokens, 0)
  const rawEstimate = normalizePositiveInt(promptEstimateTokens, 0)
  const contributors = formatContributorList(dominantContributors)
  const reduction = [
    'start a fresh thread',
    'prune or summarize older tool-heavy history',
    'disable unnecessary tool families',
    'reduce memory/continuity context',
  ].join('; ')
  const message = [
    `Prompt preflight blocked ${target}: safe prompt estimate ${safeEstimate} tokens exceeds hard ceiling ${hardLimit} tokens.`,
    `Reduce prompt size before retrying: ${reduction}.`,
    contributors ? `Dominant contributors: ${contributors}.` : '',
  ].filter(Boolean).join(' ')
  const err = new Error(message)
  err.name = 'PromptBudgetHardLimitError'
  err.code = 'prompt_budget_hard_limit_exceeded'
  err.localPromptBudgetBlocked = true
  err.providerId = provider
  err.model = modelId
  err.promptBudget = {
    safeEstimateTokens: safeEstimate,
    promptEstimateTokens: rawEstimate,
    hardLimitTokens: hardLimit,
    promptBudgetProfileId: String(promptBudgetProfileId || '').trim(),
    dominantContributors: Array.isArray(dominantContributors) ? dominantContributors : [],
  }
  return err
}

export function shouldBlockForPromptBudgetHardLimit({
  safeEstimateTokens = 0,
  hardLimitTokens = 0,
} = {}) {
  const safeEstimate = normalizePositiveInt(safeEstimateTokens, 0)
  const hardLimit = normalizePositiveInt(hardLimitTokens, 0)
  return hardLimit > 0 && safeEstimate > hardLimit
}

export function buildProviderTruncationCriticalTaskState({
  turnToolResults = [],
  turnReasoningSegments = [],
} = {}) {
  const recentToolResults = Array.isArray(turnToolResults)
    ? turnToolResults.slice(-8)
    : []
  const reasoningActive = Array.isArray(turnReasoningSegments)
    && turnReasoningSegments.some((segment) => String(segment || '').trim())
  const reasons = []
  let fileChangeCount = 0
  let readOnlyActivity = false
  let writeActivity = false

  for (const result of recentToolResults) {
    if (!result || typeof result !== 'object') continue
    if (result.decision && String(result.decision).trim().toLowerCase() !== 'approved') continue
    if (result.isError === true) continue
    const toolName = normalizeToolName(result.toolName)
    const fileChanges = Array.isArray(result.fileChanges)
      ? result.fileChanges.filter((row) => row && typeof row === 'object' && String(row.filePath || '').trim())
      : []
    if (fileChanges.length > 0) {
      fileChangeCount += fileChanges.length
      writeActivity = true
    }
    if (CRITICAL_TASK_CEILING_TOOL_NAMES.has(toolName)) writeActivity = writeActivity || fileChanges.length > 0
    if (CRITICAL_TASK_FLOOR_TOOL_NAMES.has(toolName)) readOnlyActivity = true
  }

  if (fileChangeCount > 0 || writeActivity) {
    reasons.push(fileChangeCount > 1 ? 'multi_file_edit_in_progress' : 'file_write_in_progress')
    return {
      active: true,
      allowanceLevel: 'ceiling',
      reasons: normalizeReasonCodes(reasons),
    }
  }
  if (reasoningActive && readOnlyActivity) {
    reasons.push('code_search_reasoning_in_progress')
    return {
      active: true,
      allowanceLevel: 'floor',
      reasons: normalizeReasonCodes(reasons),
    }
  }
  if (reasoningActive) {
    reasons.push('reasoning_in_progress')
    return {
      active: true,
      allowanceLevel: 'floor',
      reasons: normalizeReasonCodes(reasons),
    }
  }
  return {
    active: false,
    allowanceLevel: 'none',
    reasons: [],
  }
}

export async function enforceEffectivePromptBudget({
  history = [],
  effectivePromptBudget = null,
  estimateHistoryTokens = () => 0,
  compactHistoryForContextWindow = async () => ({ compacted: false, history }),
  applyCompactionIfNeeded = () => {},
  modelContext = {},
  providerId = '',
  model = '',
  apiKey = '',
  loop = null,
  send = () => {},
  persistTimelineEvent = () => {},
  threadId = '',
  turnId = '',
} = {}) {
  const promptBudget = effectivePromptBudget && typeof effectivePromptBudget === 'object'
    ? effectivePromptBudget
    : {}
  const effectivePromptBudgetTokens = Math.max(
    0,
    Math.round(Number(promptBudget.effectivePromptBudgetTokens || 0) || 0),
  )
  let promptOccupancyEstimateTokens = Math.max(0, Number(estimateHistoryTokens(history) || 0) || 0)
  let safePromptOccupancyEstimateTokens = buildSafeProviderTruncationOccupancyEstimate(promptOccupancyEstimateTokens)
  if (effectivePromptBudgetTokens <= 0 || safePromptOccupancyEstimateTokens <= effectivePromptBudgetTokens) {
    return {
      promptOccupancyEstimateTokens,
      safePromptOccupancyEstimateTokens,
      enforced: false,
      aggressiveCompactionApplied: false,
      trimmedMessages: 0,
    }
  }

  const aggressiveCompaction = await compactHistoryForContextWindow(history, {
    modelLimit: effectivePromptBudgetTokens,
    softThreshold: 0.98,
    hardThreshold: 0.995,
    targetAfterCompactRatio: 0.82,
    preserveRecentMessages: 12,
    minCompactCandidates: 4,
    providerId,
    model: model ?? '',
    apiKey,
    abortSignal: loop?.abortController?.signal || null,
  })
  applyCompactionIfNeeded({
    compaction: aggressiveCompaction,
    preparedHistory: Array.isArray(aggressiveCompaction?.history) ? aggressiveCompaction.history : null,
    history,
    modelContext,
    send,
    persistTimelineEvent,
    threadId,
    turnId,
  })
  promptOccupancyEstimateTokens = Math.max(0, Number(estimateHistoryTokens(history) || 0) || 0)
  safePromptOccupancyEstimateTokens = buildSafeProviderTruncationOccupancyEstimate(promptOccupancyEstimateTokens)

  let trimmedMessages = 0
  if (safePromptOccupancyEstimateTokens > effectivePromptBudgetTokens) {
    const trimmed = trimHistoryToPromptBudget(history, {
      effectivePromptBudgetTokens,
      estimateHistoryTokens,
    })
    trimmedMessages = Number(trimmed.removedCount || 0) || 0
    if (trimmedMessages > 0) {
      history.length = 0
      history.push(...trimmed.history)
      persistTimelineEvent('prompt_budget_enforced', {
        role: 'system',
        content: `Prompt budget enforcement removed ${trimmedMessages} older message${trimmedMessages === 1 ? '' : 's'} before provider dispatch.`,
        meta: {
          threadId,
          turnId,
          providerId: String(providerId || '').trim().toLowerCase(),
          model: String(model || '').trim(),
          effectivePromptBudgetTokens,
        },
      })
    }
    promptOccupancyEstimateTokens = Math.max(0, Number(estimateHistoryTokens(history) || 0) || 0)
    safePromptOccupancyEstimateTokens = buildSafeProviderTruncationOccupancyEstimate(promptOccupancyEstimateTokens)
  }

  return {
    promptOccupancyEstimateTokens,
    safePromptOccupancyEstimateTokens,
    enforced: true,
    aggressiveCompactionApplied: aggressiveCompaction?.compacted === true,
    trimmedMessages,
  }
}

export function normalizeOpenAICommandTurnOptions(turnOptions = {}) {
  const openai = turnOptions?.openai && typeof turnOptions.openai === 'object'
    ? turnOptions.openai
    : {}
  const thresholdTokens = Number(openai.serverSideCompactionThresholdTokens || 0)
  return {
    forceManualCompaction: openai.forceManualCompaction === true,
    forceServerSideCompaction: openai.forceServerSideCompaction === true,
    serverSideCompactionThresholdTokens: (
      Number.isFinite(thresholdTokens) && thresholdTokens > 0
        ? Math.round(thresholdTokens)
        : 0
    ),
    commandOnly: openai.commandOnly === true,
  }
}

export function normalizeAnthropicCommandTurnOptions(turnOptions = {}) {
  const anthropic = turnOptions?.anthropic && typeof turnOptions.anthropic === 'object'
    ? turnOptions.anthropic
    : {}
  const thresholdTokens = Number(anthropic.contextManagementCompactionThresholdTokens || 0)
  return {
    forceContextManagementCompaction: anthropic.forceContextManagementCompaction === true,
    contextManagementCompactionThresholdTokens: (
      Number.isFinite(thresholdTokens) && thresholdTokens > 0
        ? Math.round(thresholdTokens)
        : 0
    ),
    contextManagementCompactionInstructions: String(anthropic.contextManagementCompactionInstructions || '').trim().slice(0, 4_000),
  }
}

export function resolveAnthropicContextManagementThresholdTokens({
  commandThresholdTokens = 0,
  runtimeThresholdTokens = 0,
  modelContextLimitTokens = 0,
  softTriggerPercent = 85,
  criticalTaskState = null,
} = {}) {
  const commandThreshold = Math.max(0, Math.round(Number(commandThresholdTokens || 0) || 0))
  if (commandThreshold > 0) return commandThreshold
  const runtimeThreshold = Math.max(0, Math.round(Number(runtimeThresholdTokens || 0) || 0))
  if (runtimeThreshold > 0) return runtimeThreshold
  const budget = buildProviderTruncationBudget({
    modelContextLimitTokens,
    softTriggerPercent,
  })
  return resolveProviderTruncationTriggerTokens({
    budget,
    criticalTaskState,
    fallbackTokens: budget.softTriggerTokens,
  })
}

export function buildAnthropicProviderRequestContext({
  providerRuntimeSettings = null,
  effectiveAnthropicCommandTurnOptions = {},
  continuityPolicy = null,
  modelContext = {},
  providerTruncationCriticalTaskState = null,
} = {}) {
  const anthropicRuntimeSettings = providerRuntimeSettings?.anthropic && typeof providerRuntimeSettings.anthropic === 'object'
    ? providerRuntimeSettings.anthropic
    : {}
  const strategy = resolveAnthropicContextManagementStrategy({
    providerRuntimeSettings,
    effectiveAnthropicCommandTurnOptions,
    continuityPolicy,
    modelContext,
    criticalTaskState: providerTruncationCriticalTaskState,
  })
  const instructions = (
    effectiveAnthropicCommandTurnOptions.contextManagementCompactionInstructions
    || String(anthropicRuntimeSettings.contextManagementCompactionInstructions || '').trim()
  ).slice(0, 4_000)
  return {
    anthropic: {
      useContextManagementCompaction: strategy.enabled === true,
      contextManagementCompactionThresholdTokens: strategy.enabled === true
        ? strategy.thresholdTokens
        : 0,
      contextManagementCompactionInstructions: strategy.enabled === true
        ? instructions
        : '',
    },
  }
}
