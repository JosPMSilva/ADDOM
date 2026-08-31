function asString(value) {
  return String(value || '').trim()
}

export function normalizeMoaDelegationErrors(errors = []) {
  if (!Array.isArray(errors)) return []
  return errors
    .map((row) => ({
      code: asString(row?.code),
      message: asString(row?.message),
      taskId: asString(row?.taskId),
    }))
    .filter((row) => row.code || row.message)
}

function codeCountRows(errors = []) {
  const counts = new Map()
  for (const err of errors) {
    const code = asString(err?.code) || 'unknown'
    counts.set(code, (counts.get(code) || 0) + 1)
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => (b.count - a.count) || a.code.localeCompare(b.code))
}

function taskIdList(errors = []) {
  return [...new Set(
    errors
      .map((err) => asString(err?.taskId))
      .filter(Boolean),
  )]
}

export function buildMoaPreflightHints(errors = []) {
  const normalized = normalizeMoaDelegationErrors(errors)
  if (normalized.length === 0) return []
  const codes = new Set(normalized.map((err) => asString(err.code)))
  const hints = []

  const hasInvalidShape = (
    codes.has('missing_instruction')
    || codes.has('missing_output_format')
    || codes.has('missing_context')
    || codes.has('no_tasks')
  )
  if (hasInvalidShape) {
    hints.push(
      'Delegation payload is incomplete. Each task should include agent_role_id, instruction, injected_context, and expected_output_format.',
    )
  }
  if (codes.has('role_not_found')) {
    hints.push('Use a configured MoA agent role (prefer agent_role_id from the role catalog).')
  }
  if (codes.has('missing_api_key')) {
    hints.push('Configure API keys for the agent provider in Settings, or disable "Require configured API keys" for local-only testing.')
  }
  if (codes.has('max_tasks_exceeded')) {
    hints.push('Reduce the number of tasks or increase "Max tasks/delegation" in MoA policy settings.')
  }
  return hints
}

export function buildMoaPreflightErrorView(errors = [], options = {}) {
  const normalized = normalizeMoaDelegationErrors(errors)
  if (normalized.length === 0) {
    return {
      totalCount: 0,
      codeCounts: [],
      taskIds: [],
      visibleErrors: [],
      hiddenCount: 0,
      summaryLines: [],
      hints: [],
    }
  }

  const maxVisible = Math.max(1, Number(options.maxVisible || 8) || 8)
  const maxCodeSummary = Math.max(1, Number(options.maxCodeSummary || 6) || 6)
  const maxTaskSummary = Math.max(1, Number(options.maxTaskSummary || 6) || 6)

  const codeCounts = codeCountRows(normalized)
  const taskIds = taskIdList(normalized)
  const visibleErrors = normalized.slice(0, maxVisible)
  const hiddenCount = Math.max(0, normalized.length - visibleErrors.length)
  const codeSummary = codeCounts
    .slice(0, maxCodeSummary)
    .map((row) => `${row.code} x${row.count}`)
    .join(', ')
  const taskSummary = taskIds.slice(0, maxTaskSummary).join(', ')
  const hints = buildMoaPreflightHints(normalized)

  const summaryLines = [
    `preflight_errors: ${normalized.length}`,
    codeSummary ? `preflight_error_codes: ${codeSummary}${codeCounts.length > maxCodeSummary ? ', ...' : ''}` : '',
    taskSummary ? `preflight_error_tasks: ${taskSummary}${taskIds.length > maxTaskSummary ? ', ...' : ''}` : '',
    ...hints.map((hint) => `hint: ${hint}`),
  ].filter(Boolean)

  return {
    totalCount: normalized.length,
    codeCounts,
    taskIds,
    visibleErrors,
    hiddenCount,
    summaryLines,
    hints,
  }
}
