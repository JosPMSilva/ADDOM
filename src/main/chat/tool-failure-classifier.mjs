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
