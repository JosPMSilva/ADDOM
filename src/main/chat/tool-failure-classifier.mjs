import { TOOL_CALL_FAILURE_CLASSES } from './tool-call-linter.mjs'

export function resolveToolFailureClass({
  toolName = '',
  result = '',
  decision = 'approved',
  denyReason = '',
  lintResult = null,
} = {}) {
  const lintFailureClass = String(lintResult?.failureClass || '').trim()
  if (lintFailureClass) return lintFailureClass

  const normalizedToolName = String(toolName || '').trim().toLowerCase()
  const normalizedDecision = String(decision || '').trim().toLowerCase()
  const normalizedDenyReason = String(denyReason || '').trim().toLowerCase()
  const text = String(result || '').toLowerCase()

  if (normalizedDecision === 'denied' && normalizedDenyReason === 'policy_denied') {
    return TOOL_CALL_FAILURE_CLASSES.COMMAND_POLICY_BLOCKED
  }

  if (normalizedToolName === 'apply_patch') {
    if (
      text.includes('requires unified diff hunks')
      || text.includes('begin patch')
      || text.includes('pre-execution lint')
      || text.includes('apply_patch_missing_hunk')
      || text.includes('apply_patch_empty_diff')
    ) {
      return TOOL_CALL_FAILURE_CLASSES.MALFORMED_PATCH_SYNTAX
    }
  }

  if (normalizedToolName === 'edit_file') {
    if (
      text.includes('old_text not found')
      || text.includes('requires a prior read_file or view_file_range')
    ) {
      return TOOL_CALL_FAILURE_CLASSES.EXACT_TEXT_NO_MATCH
    }
  }

  if (normalizedToolName === 'browser_action') {
    if (text.includes('timed out') || text.includes('timeout')) {
      return TOOL_CALL_FAILURE_CLASSES.BROWSER_TIMEOUT
    }
  }

  return ''
}

export function resolveToolFailureDiagnostics({
  toolName = '',
  result = '',
  isError = false,
  decision = 'approved',
  denyReason = '',
  lintResult = null,
  inputValidationError = null,
  modeCapability = null,
  missingDependencySuspected = false,
  cancelled = false,
} = {}) {
  const failureClass = resolveToolFailureClass({
    toolName,
    result,
    decision,
    denyReason,
    lintResult,
  })
  const normalizedDecision = String(decision || '').trim().toLowerCase()
  const normalizedDenyReason = String(denyReason || '').trim().toLowerCase()
  const text = String(result || '').toLowerCase()
  const lintDecision = String(lintResult?.decision || '').trim().toLowerCase()
  const lintCode = String(lintResult?.lintCode || '').trim().toLowerCase()

  if (inputValidationError && typeof inputValidationError === 'object') {
    return { failureClass, failureStage: 'input_validation', failureReasonCode: 'schema_rejected' }
  }
  if (modeCapability && modeCapability.allowed === false) {
    return { failureClass, failureStage: 'capability', failureReasonCode: 'mode_not_allowed' }
  }
  if (lintCode === 'hidden_known_tool' || lintCode === 'hidden_known_tool_disabled_for_turn') {
    return { failureClass, failureStage: 'capability', failureReasonCode: 'tool_surface_unavailable' }
  }
  if (lintDecision === 'reject') {
    return { failureClass, failureStage: 'pre_execution_lint', failureReasonCode: 'lint_rejected' }
  }
  if (normalizedDecision === 'denied') {
    if (normalizedDenyReason === 'policy_denied') {
      return { failureClass, failureStage: 'policy', failureReasonCode: 'policy_denied' }
    }
    if (normalizedDenyReason === 'renderer_unavailable') {
      return { failureClass, failureStage: 'approval', failureReasonCode: 'approval_unavailable' }
    }
    if (normalizedDenyReason.includes('timeout')) {
      return { failureClass, failureStage: 'approval', failureReasonCode: 'approval_timeout' }
    }
    if (normalizedDenyReason === 'cancelled' || cancelled === true) {
      return { failureClass, failureStage: 'execution', failureReasonCode: 'cancelled' }
    }
    return { failureClass, failureStage: 'approval', failureReasonCode: 'user_denied' }
  }
  if (cancelled === true) {
    return { failureClass, failureStage: 'execution', failureReasonCode: 'cancelled' }
  }
  if (isError !== true) {
    return { failureClass, failureStage: '', failureReasonCode: '' }
  }
  if (text.includes('requires a prior read_file or view_file_range')) {
    return { failureClass, failureStage: 'pre_execution_guard', failureReasonCode: 'inspection_required' }
  }
  if (text.includes('invalid_tool_input')) {
    return { failureClass, failureStage: 'input_validation', failureReasonCode: 'schema_rejected' }
  }
  if (/failed to parse|parse error|malformed (?:json|tool )?arguments?|invalid (?:json|tool arguments?)/i.test(text)) {
    return { failureClass, failureStage: 'argument_parse', failureReasonCode: 'arguments_parse_failed' }
  }
  if (missingDependencySuspected === true) {
    return { failureClass, failureStage: 'environment', failureReasonCode: 'missing_dependency' }
  }
  if (/timed out|timeout|etimedout/.test(text)) {
    return { failureClass, failureStage: 'execution', failureReasonCode: 'timeout' }
  }
  if (/command failed with exit code|process exited with (?:code|status)|non[- ]zero exit/.test(text)) {
    return { failureClass, failureStage: 'execution', failureReasonCode: 'nonzero_exit' }
  }
  if (/blocked by command safety policy|requires explicit host_full_access approval/.test(text)) {
    return { failureClass, failureStage: 'policy', failureReasonCode: 'command_policy_denied' }
  }
  if (/command not found|no usable shell|enoent|runtime (?:is )?unavailable|no project folder selected/.test(text)) {
    return { failureClass, failureStage: 'environment', failureReasonCode: 'runtime_unavailable' }
  }
  return { failureClass, failureStage: 'execution', failureReasonCode: 'executor_failed' }
}
