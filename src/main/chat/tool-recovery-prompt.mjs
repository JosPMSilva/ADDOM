function trimInline(text, max = 160) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return ''
  if (s.length <= max) return s
  return `${s.slice(0, max - 3)}...`
}

function normalizeFailureClass(value = '') {
  return String(value || '').trim().toUpperCase()
}

function collectFailureClasses(roundResults = []) {
  const classes = new Set()
  for (const row of Array.isArray(roundResults) ? roundResults : []) {
    const failureClass = normalizeFailureClass(row?.failureClass)
    if (failureClass) classes.add(failureClass)
  }
  return classes
}

function collectLintCodes(roundResults = []) {
  const codes = new Set()
  for (const row of Array.isArray(roundResults) ? roundResults : []) {
    const lintCode = String(row?.lintCode || '').trim().toLowerCase()
    if (lintCode) codes.add(lintCode)
  }
  return codes
}

function summarizeFailedCalls(roundResults = []) {
  const items = Array.isArray(roundResults) ? roundResults.slice(0, 3) : []
  return items
    .map((row) => {
      const toolName = String(row?.toolName || '').trim() || 'unknown_tool'
      const input = row?.input && typeof row.input === 'object' ? row.input : {}
      const command = toolName === 'run_command' ? trimInline(input.command, 100) : ''
      const result = trimInline(row?.result, 140)
      const failureClass = normalizeFailureClass(row?.failureClass)
      const detail = command ? `command="${command}"` : result ? `result="${result}"` : ''
      const prefix = failureClass ? `${failureClass} ` : ''
      return detail ? `- ${toolName}: ${prefix}${detail}` : `- ${toolName}: ${prefix}`.trim()
    })
    .join('\n')
}

export function buildToolRecoveryPrompt({
  roundResults = [],
  consecutiveErrorRounds = 0,
  maxConsecutiveErrorRounds = 3,
  malformedPatchFailuresThisTurn = 0,
} = {}) {
  const failures = summarizeFailedCalls(roundResults)
  const failureClasses = collectFailureClasses(roundResults)
  const lintCodes = collectLintCodes(roundResults)
  const attemptsLeft = Math.max(0, Number(maxConsecutiveErrorRounds || 0) - Number(consecutiveErrorRounds || 0))
  const failureSummary = failures ? `Recent failed calls:\n${failures}\n` : ''
  const classSpecificRules = []

  if (failureClasses.has('MALFORMED_PATCH_SYNTAX') || failureClasses.has('PATCH_USED_FOR_FULL_REWRITE')) {
    classSpecificRules.push(
      'Patch recovery: if you retry apply_patch, send one valid patch string using "*** Begin Patch" ... "*** End Patch".',
      'If replacing most of a file, use write_file. If making a precise replacement, use edit_file after reading the current file content.',
    )
    if (Number(malformedPatchFailuresThisTurn || 0) === 1) {
      classSpecificRules.push(
        'One more malformed apply_patch call in this turn will disable apply_patch for the rest of the turn.',
      )
    }
  }
  if (failureClasses.has('EXACT_TEXT_NO_MATCH')) {
    classSpecificRules.push(
      'Edit recovery: read the current file with read_file or view_file_range before retrying edit_file so old_text matches exactly.',
    )
  }
  if (failureClasses.has('COMMAND_POLICY_BLOCKED')) {
    classSpecificRules.push(
      'Command recovery: the last command was blocked by policy. Do not repeat it unchanged; choose a safer alternative or explain the blocked requirement to the user.',
    )
    if (lintCodes.has('run_command_long_running_foreground')) {
      classSpecificRules.push(
        'Server/watch recovery: do not retry the same foreground run_command. Prefer terminal_session_open, terminal_session_write, and terminal_session_wait_for_output for dev servers or other interactive long-running flows when those tools are available.',
        'Only retry run_command with background=true when the user explicitly asked you to start the server/watcher and terminal_session_* is unavailable or inappropriate.',
      )
    }
  }
  if (failureClasses.has('BROWSER_TIMEOUT')) {
    classSpecificRules.push(
      'Browser recovery: avoid repeating the same browser action unchanged. Prefer fetch_page for static pages or retry only with a materially different action.',
    )
  }

  return [
    '[TOOL FAILURE RECOVERY]',
    `All tool calls in the previous round failed or were denied. You have ${attemptsLeft} recovery round(s) before forced stop.`,
    failureSummary,
    classSpecificRules.length > 0 ? `Recovery guidance:\n- ${classSpecificRules.join('\n- ')}` : '',
    'Rules for the next round:',
    '1) Do not repeat the same tool call with identical arguments.',
    '2) Use a different command/action and explain in one short sentence what changed.',
    '3) Prefer diagnosis first (read_file, list_directory, search_code) before retrying execution.',
    '4) If a dependency/install is needed, call the install tool action directly and let runtime permission mode/policy handle approvals.',
    '5) If blocked by permissions/approval, propose an alternative path and continue safely.',
  ].filter(Boolean).join('\n')
}
