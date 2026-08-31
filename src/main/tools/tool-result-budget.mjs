import { persistToolResultSpillover } from './tool-result-spillover.mjs'

const DEFAULT_TOOL_RESULT_BUDGET_CHARS = 40_000
const MIN_TOOL_RESULT_BUDGET_CHARS = 1_000
const ANTHROPIC_STRICT_LOW_VALUE_TOOL_BUDGETS = Object.freeze({
  list_directory: 2_500,
  find_files: 2_500,
  plan_read: 2_500,
  todo_read: 2_500,
  search_code: 3_500,
  grep_file: 3_500,
  read_file: 4_500,
  view_file_range: 4_500,
  fetch_page: 5_000,
  browser_action: 5_000,
})
const ANTHROPIC_MODERATE_LOW_VALUE_TOOL_BUDGETS = Object.freeze({
  list_directory: 4_000,
  find_files: 4_000,
  plan_read: 4_000,
  todo_read: 4_000,
  search_code: 6_000,
  grep_file: 6_000,
  read_file: 8_000,
  view_file_range: 8_000,
  fetch_page: 8_000,
  browser_action: 8_000,
})
const ANTHROPIC_RELAXED_LOW_VALUE_TOOL_BUDGETS = Object.freeze({
  list_directory: 6_000,
  find_files: 6_000,
  plan_read: 6_000,
  todo_read: 6_000,
  search_code: 9_000,
  grep_file: 9_000,
  read_file: 12_000,
  view_file_range: 12_000,
  fetch_page: 12_000,
  browser_action: 12_000,
})
const ANTHROPIC_LOW_VALUE_TOOL_BUDGETS_BY_MODE = Object.freeze({
  strict: ANTHROPIC_STRICT_LOW_VALUE_TOOL_BUDGETS,
  moderate: ANTHROPIC_MODERATE_LOW_VALUE_TOOL_BUDGETS,
  relaxed: ANTHROPIC_RELAXED_LOW_VALUE_TOOL_BUDGETS,
})

const COMMAND_LIKE_TOOL_NAMES = new Set([
  'run_command',
  'local_shell',
  'git_status',
  'git_diff',
  'git_log',
  'git_commit',
  'git_checkout_file',
  'terminal_session_open',
  'terminal_session_read_snapshot',
  'terminal_session_write',
  'terminal_session_resize',
  'terminal_session_signal',
  'terminal_session_close',
])

const SEARCH_LIST_TOOL_NAMES = new Set([
  'read_file',
  'view_file_range',
  'search_code',
  'grep_file',
  'find_files',
  'list_directory',
  'fetch_page',
  'browser_action',
  'plan_read',
  'todo_read',
])

const WRITE_TOOL_NAMES = new Set([
  'write_file',
  'edit_file',
  'apply_patch',
  'delete_file',
  'rename_file',
  'rollback_file',
  'apply_artifact_revision',
  'git_commit',
  'git_checkout_file',
  'plan_update',
  'todo_write',
])

function normalizeToolName(value = '') {
  return String(value || '').trim().toLowerCase()
}

function stringifyResult(value) {
  if (typeof value === 'string') return value
  if (value == null) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function resolveBudgetChars(profile = null, explicitBudgetChars = 0) {
  const requested = Number(explicitBudgetChars || 0)
  const normalizedToolName = normalizeToolName(profile?.toolName || '')
  const normalizedBudgetMode = String(profile?.explorationToolBudgetMode || '').trim().toLowerCase()
  const anthropicLowValueBudgetMap = (
    String(profile?.family || '').trim().toLowerCase() === 'anthropic'
    || String(profile?.id || '').trim() === 'anthropic_strict'
  )
    ? (ANTHROPIC_LOW_VALUE_TOOL_BUDGETS_BY_MODE[normalizedBudgetMode] || ANTHROPIC_STRICT_LOW_VALUE_TOOL_BUDGETS)
    : null
  const anthropicLowValueToolCap = normalizedToolName && anthropicLowValueBudgetMap
    ? Number(anthropicLowValueBudgetMap[normalizedToolName] || 0)
    : 0
  if (Number.isFinite(requested) && requested > 0) {
    const requestedBudget = Math.max(MIN_TOOL_RESULT_BUDGET_CHARS, Math.trunc(requested))
    if (anthropicLowValueToolCap > 0) {
      return Math.min(requestedBudget, anthropicLowValueToolCap)
    }
    return requestedBudget
  }
  const profileBudget = Number(profile?.perToolOutputPreviewChars || 0)
  if (Number.isFinite(profileBudget) && profileBudget > 0) {
    const normalizedProfileBudget = Math.max(MIN_TOOL_RESULT_BUDGET_CHARS, Math.trunc(profileBudget))
    if (anthropicLowValueToolCap > 0) {
      return Math.min(normalizedProfileBudget, anthropicLowValueToolCap)
    }
    return normalizedProfileBudget
  }
  if (anthropicLowValueToolCap > 0) {
    return Math.max(MIN_TOOL_RESULT_BUDGET_CHARS, anthropicLowValueToolCap)
  }
  return DEFAULT_TOOL_RESULT_BUDGET_CHARS
}

function formatCount(value = 0) {
  return String(Math.max(0, Math.trunc(Number(value || 0) || 0)))
}

function trimToBudget(text = '', budgetChars = DEFAULT_TOOL_RESULT_BUDGET_CHARS) {
  const limit = Math.max(0, Math.trunc(Number(budgetChars || 0) || 0))
  const value = String(text || '')
  if (value.length <= limit) return value
  return value.slice(0, limit)
}

function buildTruncationHeader({
  toolName = '',
  providerId = '',
  model = '',
  profileId = '',
  originalChars = 0,
  omittedChars = 0,
  previewDirection = 'head',
  budgetChars = 0,
  persistence = 'disabled',
  spilloverPersistenceState = '',
  spilloverCleanupState = 'none',
  spilloverCleanupDeletedFileCount = 0,
  spilloverCleanupDeletedBytes = 0,
  spilloverRetentionExceeded = false,
} = {}) {
  const lines = [
    '[Tool result truncated for model context]',
    `tool: ${toolName || 'unknown'}`,
    `provider: ${providerId || 'unknown'}`,
    `model: ${model || 'unknown'}`,
    `budget_profile: ${profileId || 'unknown'}`,
    `original_chars: ${formatCount(originalChars)}`,
    `omitted_chars: ${formatCount(omittedChars)}`,
    `preview: ${previewDirection || 'head'}`,
    `budget_chars: ${formatCount(budgetChars)}`,
    `full_output_persistence: ${persistence === 'enabled' ? 'enabled' : 'disabled'}`,
    `spillover_persistence_state: ${spilloverPersistenceState || (persistence === 'enabled' ? 'persisted' : 'disabled')}`,
    `spillover_cleanup_state: ${spilloverCleanupState || 'none'}`,
    `spillover_cleanup_deleted_files: ${formatCount(spilloverCleanupDeletedFileCount)}`,
    `spillover_cleanup_deleted_bytes: ${formatCount(spilloverCleanupDeletedBytes)}`,
    `spillover_retention_exceeded: ${spilloverRetentionExceeded === true ? 'true' : 'false'}`,
    '',
  ]
  return lines.join('\n')
}

function buildBudgetedPreview(text = '', {
  toolName = '',
  providerId = '',
  model = '',
  profileId = '',
  previewDirection = 'head',
  budgetChars = DEFAULT_TOOL_RESULT_BUDGET_CHARS,
  persistence = 'disabled',
  spilloverPersistenceState = '',
  spilloverCleanupState = 'none',
  spilloverCleanupDeletedFileCount = 0,
  spilloverCleanupDeletedBytes = 0,
  spilloverRetentionExceeded = false,
} = {}) {
  const originalChars = String(text || '').length
  let omittedChars = 0
  let preview = ''
  let header = ''
  for (let attempt = 0; attempt < 3; attempt += 1) {
    header = buildTruncationHeader({
      toolName,
      providerId,
      model,
      profileId,
      originalChars,
      omittedChars,
      previewDirection,
      budgetChars,
      persistence,
      spilloverPersistenceState,
      spilloverCleanupState,
      spilloverCleanupDeletedFileCount,
      spilloverCleanupDeletedBytes,
      spilloverRetentionExceeded,
    })
    const previewLimit = Math.max(0, budgetChars - header.length)
    preview = previewDirection === 'tail'
      ? String(text || '').slice(Math.max(0, originalChars - previewLimit))
      : String(text || '').slice(0, previewLimit)
    const nextOmittedChars = Math.max(0, originalChars - preview.length)
    if (nextOmittedChars === omittedChars) break
    omittedChars = nextOmittedChars
  }
  return {
    text: trimToBudget(`${header}${preview}`, budgetChars),
    omittedChars,
  }
}

function summarizeFileChange(fileChange = null) {
  if (!fileChange || typeof fileChange !== 'object') return ''
  const filePath = String(fileChange.filePath || '').trim()
  if (!filePath) return ''
  const changeType = String(fileChange.changeType || 'changed').trim() || 'changed'
  const added = Number(fileChange.addedLines || 0) || 0
  const removed = Number(fileChange.removedLines || 0) || 0
  const renamedFrom = String(fileChange.renamedFrom || '').trim()
  const renameText = renamedFrom ? ` from ${renamedFrom}` : ''
  return `- ${filePath}: ${changeType}${renameText} (+${added} / -${removed})`
}

function buildWriteMetadataPreview({
  toolName = '',
  resultText = '',
  fileChange = null,
  fileChanges = [],
} = {}) {
  const changes = Array.isArray(fileChanges) && fileChanges.length > 0
    ? fileChanges
    : (fileChange ? [fileChange] : [])
  const firstLine = String(resultText || '').trim().split(/\r?\n/).find(Boolean) || ''
  const lines = [
    `${toolName || 'write tool'} completed; large success output was omitted from model context.`,
  ]
  if (firstLine) lines.push(`status: ${firstLine.slice(0, 500)}`)
  const summaries = changes.map(summarizeFileChange).filter(Boolean)
  if (summaries.length > 0) {
    lines.push('changed_files:')
    lines.push(...summaries.slice(0, 20))
    if (summaries.length > 20) lines.push(`- ... ${summaries.length - 20} more file change(s)`)
  } else {
    lines.push('changed_files: unavailable')
  }
  return lines.join('\n')
}

function resolvePreviewDirection({ toolName = '', isError = false } = {}) {
  const normalizedToolName = normalizeToolName(toolName)
  if (isError === true && COMMAND_LIKE_TOOL_NAMES.has(normalizedToolName)) return 'tail'
  if (SEARCH_LIST_TOOL_NAMES.has(normalizedToolName)) return 'head'
  return 'head'
}

function buildMetadata({
  truncated = false,
  providerId = '',
  model = '',
  toolName = '',
  profile = null,
  originalChars = 0,
  resultChars = 0,
  omittedChars = 0,
  previewDirection = 'none',
  budgetChars = DEFAULT_TOOL_RESULT_BUDGET_CHARS,
  persistedOutputPath = '',
  persistedOutputSha256 = '',
  spilloverPersistenceState = '',
  spilloverCleanupState = 'none',
  spilloverCleanupDeletedFileCount = 0,
  spilloverCleanupDeletedBytes = 0,
  spilloverRetentionExceeded = false,
  spilloverFailureReasons = [],
  spilloverDegraded = false,
  spilloverRetentionPolicy = null,
} = {}) {
  return {
    truncated: truncated === true,
    providerId: String(providerId || '').trim().toLowerCase(),
    model: String(model || '').trim(),
    toolName: String(toolName || '').trim(),
    budgetProfileId: String(profile?.id || '').trim(),
    originalChars: Math.max(0, Number(originalChars || 0) || 0),
    resultChars: Math.max(0, Number(resultChars || 0) || 0),
    omittedChars: Math.max(0, Number(omittedChars || 0) || 0),
    previewDirection: String(previewDirection || 'none').trim(),
    budgetChars: Math.max(0, Number(budgetChars || 0) || 0),
    persistedOutputPath: String(persistedOutputPath || ''),
    persistedOutputSha256: String(persistedOutputSha256 || ''),
    persistence: persistedOutputPath ? 'enabled' : 'disabled',
    spilloverPersistenceState: String(spilloverPersistenceState || '').trim().toLowerCase(),
    spilloverCleanupState: String(spilloverCleanupState || 'none').trim().toLowerCase(),
    spilloverCleanupDeletedFileCount: Math.max(0, Number(spilloverCleanupDeletedFileCount || 0) || 0),
    spilloverCleanupDeletedBytes: Math.max(0, Number(spilloverCleanupDeletedBytes || 0) || 0),
    spilloverRetentionExceeded: spilloverRetentionExceeded === true,
    spilloverFailureReasons: Array.isArray(spilloverFailureReasons)
      ? spilloverFailureReasons.map((value) => String(value || '').trim()).filter(Boolean)
      : [],
    spilloverDegraded: spilloverDegraded === true,
    spilloverRetentionPolicy: spilloverRetentionPolicy && typeof spilloverRetentionPolicy === 'object'
      ? {
        maxFileCount: Math.max(0, Number(spilloverRetentionPolicy.maxFileCount || 0) || 0),
        maxAggregateBytes: Math.max(0, Number(spilloverRetentionPolicy.maxAggregateBytes || 0) || 0),
        maxAgeMs: Math.max(0, Number(spilloverRetentionPolicy.maxAgeMs || 0) || 0),
      }
      : null,
  }
}

export function budgetToolResultForModel({
  providerId = '',
  model = '',
  toolName = '',
  result = '',
  isError = false,
  decision = '',
  promptBudgetProfile = null,
  budgetChars = 0,
  fileChange = null,
  fileChanges = [],
  threadId = '',
  turnId = '',
} = {}) {
  const normalizedToolName = normalizeToolName(toolName)
  const profile = promptBudgetProfile && typeof promptBudgetProfile === 'object' ? promptBudgetProfile : null
  const resolvedBudgetChars = resolveBudgetChars(
    profile
      ? {
          ...profile,
          toolName: normalizedToolName || toolName,
        }
      : { toolName: normalizedToolName || toolName },
    budgetChars,
  )
  const resultText = stringifyResult(result)
  const originalChars = resultText.length
  const approved = String(decision || 'approved').trim().toLowerCase() === 'approved'

  if (originalChars <= resolvedBudgetChars) {
    return {
      resultText,
      omittedChars: 0,
      previewDirection: 'none',
      truncationMetadata: buildMetadata({
        providerId,
        model,
        toolName: normalizedToolName || toolName,
        profile,
        originalChars,
        resultChars: originalChars,
        budgetChars: resolvedBudgetChars,
      }),
    }
  }

  const useWriteMetadataPreview = approved
    && isError !== true
    && WRITE_TOOL_NAMES.has(normalizedToolName)
  const spillover = persistToolResultSpillover({
    providerId: String(providerId || '').trim().toLowerCase(),
    model,
    toolName: normalizedToolName || toolName,
    resultText,
    originalChars,
    threadId,
    turnId,
  })
  const previewDirection = useWriteMetadataPreview
    ? 'metadata'
    : resolvePreviewDirection({ toolName: normalizedToolName, isError })
  const budgetedPreview = useWriteMetadataPreview
    ? buildWriteMetadataPreview({
      toolName: normalizedToolName || toolName,
      resultText,
      fileChange,
      fileChanges,
    })
    : buildBudgetedPreview(resultText, {
      toolName: normalizedToolName || toolName,
      providerId: String(providerId || '').trim().toLowerCase(),
      model,
      profileId: String(profile?.id || '').trim(),
      previewDirection,
      budgetChars: resolvedBudgetChars,
      persistence: spillover.persistence,
      spilloverPersistenceState: spillover.spilloverPersistenceState,
      spilloverCleanupState: spillover.spilloverCleanupState,
      spilloverCleanupDeletedFileCount: spillover.spilloverCleanupDeletedFileCount,
      spilloverCleanupDeletedBytes: spillover.spilloverCleanupDeletedBytes,
      spilloverRetentionExceeded: spillover.spilloverRetentionExceeded,
    })
  const previewText = typeof budgetedPreview === 'string' ? budgetedPreview : budgetedPreview.text
  const boundedText = trimToBudget(previewText, resolvedBudgetChars)
  const omittedChars = typeof budgetedPreview === 'object' && budgetedPreview
    ? Math.max(0, Number(budgetedPreview.omittedChars || 0) || 0)
    : Math.max(0, originalChars - boundedText.length)

  return {
    resultText: boundedText,
    omittedChars,
    previewDirection,
    truncationMetadata: buildMetadata({
      truncated: true,
      providerId,
      model,
      toolName: normalizedToolName || toolName,
      profile,
      originalChars,
      resultChars: boundedText.length,
      omittedChars,
      previewDirection,
      budgetChars: resolvedBudgetChars,
      persistedOutputPath: spillover.persistedOutputPath,
      persistedOutputSha256: spillover.persistedOutputSha256,
      spilloverPersistenceState: spillover.spilloverPersistenceState,
      spilloverCleanupState: spillover.spilloverCleanupState,
      spilloverCleanupDeletedFileCount: spillover.spilloverCleanupDeletedFileCount,
      spilloverCleanupDeletedBytes: spillover.spilloverCleanupDeletedBytes,
      spilloverRetentionExceeded: spillover.spilloverRetentionExceeded,
      spilloverFailureReasons: spillover.spilloverFailureReasons,
      spilloverDegraded: spillover.spilloverDegraded,
      spilloverRetentionPolicy: spillover.spilloverRetentionPolicy,
    }),
  }
}
