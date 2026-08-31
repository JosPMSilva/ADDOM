function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeToolName(value = '') {
  return normalizeText(value).toLowerCase()
}

const EXPLORATION_TOOL_NAMES = new Set([
  'list_directory',
  'search_code',
  'read_file',
  'view_file_range',
  'grep_file',
  'find_files',
  'plan_read',
])

function uniqueToolNames(toolCalls = []) {
  const seen = new Set()
  const names = []
  for (const row of Array.isArray(toolCalls) ? toolCalls : []) {
    const normalized = normalizeToolName(row?.name)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    names.push(normalized)
  }
  return names
}

function extractToolPath(toolCall = {}) {
  const input = toolCall?.input && typeof toolCall.input === 'object'
    ? toolCall.input
    : (toolCall?.args && typeof toolCall.args === 'object' ? toolCall.args : {})
  return normalizeText(
    input.path
    || input.filePath
    || input.file_path
    || input.old_path
    || input.oldPath
    || input.new_path
    || input.newPath,
  )
}

function pickRecoveryPath(toolCalls = []) {
  for (const toolCall of Array.isArray(toolCalls) ? toolCalls : []) {
    const path = extractToolPath(toolCall)
    if (path) return path
  }
  return ''
}

function pickBlockedToolNames(triggerKind = '', toolCalls = []) {
  const toolNames = uniqueToolNames(toolCalls)
  if (normalizeToolName(triggerKind) === 'near_duplicate_exploration') {
    const explorationNames = toolNames.filter((name) => EXPLORATION_TOOL_NAMES.has(name))
    return explorationNames.length > 0 ? explorationNames : toolNames
  }
  return toolNames
}

function formatBlockedTools(blockedToolNames = []) {
  const names = (Array.isArray(blockedToolNames) ? blockedToolNames : [])
    .map((name) => normalizeToolName(name))
    .filter(Boolean)
  return names.length > 0 ? names.join(', ') : 'none'
}

export function filterAgentToolsByRecovery(agentTools = {}, recovery = null) {
  const source = agentTools && typeof agentTools === 'object' ? agentTools : {}
  const blocked = new Set(
    (Array.isArray(recovery?.blockedToolNames) ? recovery.blockedToolNames : [])
      .map((name) => normalizeToolName(name))
      .filter(Boolean),
  )
  if (blocked.size === 0) return { ...source }
  const next = {}
  for (const [toolName, definition] of Object.entries(source)) {
    if (blocked.has(normalizeToolName(toolName))) continue
    next[toolName] = definition
  }
  return next
}

export function isToolBlockedByLoopRecovery(toolName = '', recovery = null) {
  const normalized = normalizeToolName(toolName)
  if (!normalized) return false
  return (Array.isArray(recovery?.blockedToolNames) ? recovery.blockedToolNames : [])
    .map((name) => normalizeToolName(name))
    .includes(normalized)
}

export function buildMoaLoopRecoveryContract({
  triggerKind = '',
  toolCalls = [],
  recoveryAttempt = 1,
  maxRecoveryAttempts = 1,
} = {}) {
  const normalizedTrigger = normalizeToolName(triggerKind)
  const blockedToolNames = pickBlockedToolNames(normalizedTrigger, toolCalls)
  return {
    kind: 'loop_recovery',
    triggerKind: normalizedTrigger || 'identical_tool_batch',
    recoveryAttempt: Number(recoveryAttempt || 0) || 1,
    maxRecoveryAttempts: Number(maxRecoveryAttempts || 0) || 1,
    blockedToolNames,
    targetPath: pickRecoveryPath(toolCalls),
    finalAnswerIfNoProgress: true,
  }
}

export function buildMoaLoopRecoveryPrompt(recovery = null) {
  const contract = recovery && typeof recovery === 'object' ? recovery : {}
  const blockedTools = formatBlockedTools(contract.blockedToolNames)
  const hasTargetPath = normalizeText(contract.targetPath).length > 0
  const triggerKind = normalizeToolName(contract.triggerKind) === 'near_duplicate_exploration'
    ? 'near-duplicate exploration'
    : 'repeated identical tool use'

  return [
    '[LOOP GUARD RECOVERY]',
    `Loop guard triggered after ${triggerKind}. This is recovery attempt ${Number(contract.recoveryAttempt || 1)} of ${Number(contract.maxRecoveryAttempts || 1)}.`,
    blockedTools !== 'none' ? `Do not call these tools in the next round: ${blockedTools}.` : '',
    hasTargetPath
      ? `Choose exactly one file and justify it in one short sentence before reading it. Use only this file if you keep using tools: ${normalizeText(contract.targetPath)}`
      : 'Do not resume broad discovery. Pick one already-known file path and justify it in one short sentence, or stop using tools if no specific file is justified.',
    'If you do not gain materially new evidence in the next round, stop using tools and return your best answer with explicit uncertainty.',
  ].filter(Boolean).join('\n')
}
