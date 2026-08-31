const REPAIRABLE_CODES = new Set([
  'missing_instruction',
  'missing_output_format',
  'missing_context',
  'role_not_found',
])

function asString(value) {
  return String(value || '').trim()
}

function toErrorRows(errors = []) {
  if (!Array.isArray(errors)) return []
  return errors
    .map((err) => ({
      code: asString(err?.code),
      taskId: asString(err?.taskId),
    }))
    .filter((row) => row.code || row.taskId)
}

function countCodes(errorRows = []) {
  const map = new Map()
  for (const row of errorRows) {
    const code = asString(row.code) || 'unknown'
    map.set(code, (map.get(code) || 0) + 1)
  }
  return [...map.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => (b.count - a.count) || a.code.localeCompare(b.code))
}

export function buildMoaDelegationPreflightTelemetry({
  providerId = '',
  model = '',
  rawTasks = [],
  preflight = null,
  repairability = null,
  repairPromptInjected = false,
  isRepairRetryAttempt = false,
  delegationId = '',
} = {}) {
  const taskCount = Array.isArray(rawTasks) ? rawTasks.length : 0
  const errors = toErrorRows(preflight?.errors)
  const errorCodes = countCodes(errors)
  const preflightOk = !!preflight?.ok
  const repairable = !!repairability?.repairable
  const malformedDelegation = errorCodes.some((row) => REPAIRABLE_CODES.has(row.code))

  return {
    delegationId: asString(delegationId),
    providerId: asString(providerId),
    model: asString(model),
    taskCount,
    preflightStatus: preflightOk ? 'ok' : 'failed',
    malformedDelegation,
    repairable,
    repairPromptInjected: !!repairPromptInjected,
    isRepairRetryAttempt: !!isRepairRetryAttempt,
    retryOutcome: isRepairRetryAttempt
      ? (preflightOk ? 'success' : 'failed_preflight')
      : '',
    errorCount: errors.length,
    errorCodes,
    errorTasks: [...new Set(errors.map((row) => row.taskId).filter(Boolean))].slice(0, 20),
  }
}

