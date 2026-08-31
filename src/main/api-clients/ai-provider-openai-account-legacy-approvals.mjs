const QUALIFIED_RUNTIME_VERSIONS = new Set(['0.116.0', '0.145.0'])
const LEGACY_AVAILABLE_DECISIONS = Object.freeze([
  'accept',
  'acceptForSession',
  'decline',
  'cancel',
])
const MAX_COMMAND_PARTS = 128
const MAX_COMMAND_TEXT_LENGTH = 65_536
const MAX_FILE_CHANGES = 512
const MAX_FILE_CHANGE_TEXT_LENGTH = 8 * 1024 * 1024
const MAX_PATH_LENGTH = 4_096

function isRecord(value = null) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function asBoundedString(value, maxLength, { nullable = false } = {}) {
  if (nullable && value == null) return ''
  if (typeof value !== 'string' || value.length > maxLength) return null
  return value
}

function normalizeRuntimeVersion(value = '') {
  return String(value || '').match(/\d+\.\d+\.\d+/)?.[0] || ''
}

function validateLegacyScope(source = {}, context = {}) {
  if (!QUALIFIED_RUNTIME_VERSIONS.has(normalizeRuntimeVersion(context.runtimeVersion))) {
    return 'unqualified_runtime_version'
  }
  const conversationId = asBoundedString(source.conversationId, 256)
  const bridgeThreadId = asBoundedString(context.bridgeThreadId, 256)
  const activeTurnId = asBoundedString(context.activeTurnId, 256)
  if (!conversationId || !bridgeThreadId || !activeTurnId) return 'missing_turn_scope'
  if (conversationId !== bridgeThreadId) return 'thread_scope_mismatch'
  return ''
}

function normalizeLegacyCommandActions(parsedCmd = null) {
  if (!Array.isArray(parsedCmd) || parsedCmd.length > MAX_COMMAND_PARTS) return null
  const actions = []
  for (const entry of parsedCmd) {
    if (!isRecord(entry)) return null
    const type = asBoundedString(entry.type, 32)
    const command = asBoundedString(entry.cmd, MAX_COMMAND_TEXT_LENGTH)
    if (!type || command == null) return null
    if (type === 'read') {
      const name = asBoundedString(entry.name, 256)
      const path = asBoundedString(entry.path, MAX_PATH_LENGTH)
      if (!name || !path) return null
      actions.push({ type, command, name, path })
      continue
    }
    if (type === 'list_files') {
      const path = asBoundedString(entry.path, MAX_PATH_LENGTH, { nullable: true })
      if (path == null) return null
      actions.push({ type: 'listFiles', command, ...(path ? { path } : {}) })
      continue
    }
    if (type === 'search') {
      const path = asBoundedString(entry.path, MAX_PATH_LENGTH, { nullable: true })
      const query = asBoundedString(entry.query, MAX_COMMAND_TEXT_LENGTH, { nullable: true })
      if (path == null || query == null) return null
      actions.push({
        type,
        command,
        ...(path ? { path } : {}),
        ...(query ? { query } : {}),
      })
      continue
    }
    if (type !== 'unknown') return null
    actions.push({ type, command })
  }
  return actions
}

export function normalizeOpenAIAccountLegacyExecCommandApproval(
  params = null,
  context = {},
) {
  const source = isRecord(params) ? params : null
  if (!source) return { valid: false, failureReason: 'invalid_request' }
  const scopeFailure = validateLegacyScope(source, context)
  if (scopeFailure) return { valid: false, failureReason: scopeFailure }

  const callId = asBoundedString(source.callId, 256)
  const approvalId = asBoundedString(source.approvalId, 256, { nullable: true })
  const cwd = asBoundedString(source.cwd, MAX_PATH_LENGTH)
  const reason = asBoundedString(source.reason, MAX_COMMAND_TEXT_LENGTH, { nullable: true })
  if (!callId || !cwd || approvalId == null || reason == null) {
    return { valid: false, failureReason: 'invalid_request' }
  }
  if (!Array.isArray(source.command) || source.command.length === 0 || source.command.length > MAX_COMMAND_PARTS) {
    return { valid: false, failureReason: 'invalid_command' }
  }
  const commandParts = source.command.map((entry) => asBoundedString(entry, MAX_COMMAND_TEXT_LENGTH))
  if (commandParts.some((entry) => entry == null) || commandParts.join(' ').length > MAX_COMMAND_TEXT_LENGTH) {
    return { valid: false, failureReason: 'invalid_command' }
  }
  const commandActions = normalizeLegacyCommandActions(source.parsedCmd)
  if (!commandActions) return { valid: false, failureReason: 'invalid_parsed_command' }

  return {
    valid: true,
    params: {
      ...(approvalId ? { approvalId } : {}),
      itemId: callId,
      threadId: source.conversationId,
      turnId: context.activeTurnId,
      command: commandParts.join(' '),
      cwd,
      commandActions,
      ...(reason ? { reason } : {}),
      availableDecisions: [...LEGACY_AVAILABLE_DECISIONS],
    },
  }
}

function normalizeLegacyFileChange(pathValue = '', value = null) {
  const requestedPath = asBoundedString(pathValue, MAX_PATH_LENGTH)
  if (!requestedPath || !isRecord(value)) return null
  const type = asBoundedString(value.type, 32)
  if (type === 'add' || type === 'delete') {
    const content = asBoundedString(value.content, MAX_FILE_CHANGE_TEXT_LENGTH)
    if (content == null) return null
    return {
      path: requestedPath,
      kind: { type: type === 'add' ? 'create' : 'delete' },
      content,
    }
  }
  if (type !== 'update') return null
  const diff = asBoundedString(value.unified_diff, MAX_FILE_CHANGE_TEXT_LENGTH)
  const movePath = asBoundedString(value.move_path, MAX_PATH_LENGTH, { nullable: true })
  if (diff == null || movePath == null) return null
  return {
    path: movePath || requestedPath,
    ...(movePath ? { oldPath: requestedPath } : {}),
    kind: { type: movePath ? 'rename' : 'modify' },
    diff,
  }
}

export function normalizeOpenAIAccountLegacyApplyPatchApproval(
  params = null,
  context = {},
) {
  const source = isRecord(params) ? params : null
  if (!source) return { valid: false, failureReason: 'invalid_request' }
  const scopeFailure = validateLegacyScope(source, context)
  if (scopeFailure) return { valid: false, failureReason: scopeFailure }

  const callId = asBoundedString(source.callId, 256)
  const grantRoot = asBoundedString(source.grantRoot, MAX_PATH_LENGTH, { nullable: true })
  const reason = asBoundedString(source.reason, MAX_COMMAND_TEXT_LENGTH, { nullable: true })
  const fileChanges = isRecord(source.fileChanges) ? Object.entries(source.fileChanges) : []
  if (
    !callId
    || grantRoot == null
    || reason == null
    || fileChanges.length === 0
    || fileChanges.length > MAX_FILE_CHANGES
  ) {
    return { valid: false, failureReason: 'invalid_request' }
  }
  const changes = fileChanges.map(([filePath, change]) => normalizeLegacyFileChange(filePath, change))
  if (changes.some((change) => !change)) {
    return { valid: false, failureReason: 'invalid_file_changes' }
  }
  return {
    valid: true,
    params: {
      itemId: callId,
      threadId: source.conversationId,
      turnId: context.activeTurnId,
      ...(grantRoot ? { grantRoot } : {}),
      ...(reason ? { reason } : {}),
      availableDecisions: [...LEGACY_AVAILABLE_DECISIONS],
      changes,
    },
  }
}

function mapExecpolicyAmendment(decision = null) {
  const amendment = decision?.acceptWithExecpolicyAmendment?.execpolicy_amendment
  if (!Array.isArray(amendment) || amendment.length === 0) return null
  const normalized = amendment
    .map((entry) => asBoundedString(entry, MAX_COMMAND_TEXT_LENGTH))
    .filter((entry) => entry != null)
  if (normalized.length !== amendment.length) return null
  return {
    decision: {
      approved_execpolicy_amendment: {
        proposed_execpolicy_amendment: normalized,
      },
    },
  }
}

export function mapOpenAIAccountLegacyReviewDecision(decision = null) {
  if (decision === 'accept') return { decision: 'approved' }
  if (decision === 'acceptForSession') return { decision: 'approved_for_session' }
  if (decision === 'cancel') return { decision: 'abort' }
  if (decision === 'decline') {
    return { decision: { denied: { rejection: 'user_denied' } } }
  }
  return mapExecpolicyAmendment(decision)
    || { decision: { denied: { rejection: 'invalid_decision' } } }
}

export function buildOpenAIAccountLegacyApprovalDeniedResponse(rejection = 'invalid_request') {
  return {
    decision: {
      denied: {
        rejection: String(rejection || 'invalid_request').slice(0, 256),
      },
    },
  }
}
