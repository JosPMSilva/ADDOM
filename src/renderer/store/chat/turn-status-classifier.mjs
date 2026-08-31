const NON_FATAL_ERROR_EVENT_KINDS = new Set([
  'continuity_drift_detected',
  'continuity_invariant_violated',
])

const NON_FATAL_DENY_REASONS = new Set([
  'cancelled',
  'timeout',
  'user_denied',
])

function unwrapActivity(entry = {}) {
  if (entry?.activity && typeof entry.activity === 'object') {
    return entry.activity
  }
  return entry
}

export function isNonFatalDeniedActivity(activity = {}) {
  const decision = String(activity?.decision || '').trim().toLowerCase()
  if (decision !== 'denied') return false
  const denyReason = String(activity?.denyReason || '').trim().toLowerCase()
  if (NON_FATAL_DENY_REASONS.has(denyReason)) return true
  return !denyReason && activity?.isError !== true
}

export function collectTurnCompletionSignals(entries = []) {
  let hasFatalError = false
  let hasWarning = false
  let hasNonFatalRestriction = false

  for (const entry of Array.isArray(entries) ? entries : []) {
    const activity = unwrapActivity(entry)
    if (!activity || typeof activity !== 'object') continue

    if (isNonFatalDeniedActivity(activity)) {
      hasNonFatalRestriction = true
      continue
    }

    const type = String(activity.type || '').trim().toLowerCase()
    if (type !== 'result') continue
    if (activity.isError !== true) continue

    const eventKind = String(activity.eventKind || '').trim().toLowerCase()
    const severity = String(activity.errorSeverity || '').trim().toLowerCase()
    if (severity === 'warning') {
      hasWarning = true
      continue
    }
    if (!NON_FATAL_ERROR_EVENT_KINDS.has(eventKind)) {
      hasFatalError = true
    }
  }

  return {
    hasFatalError,
    hasNonFatalRestriction,
    hasWarning,
  }
}

export function resolveCompletedTurnStatus({
  turnStatus = '',
} = {}) {
  const status = String(turnStatus || '').trim().toLowerCase()
  if (status === 'error' || status === 'failed' || status === 'failure') return 'error'
  if (status === 'cancelled' || status === 'canceled') return 'cancelled'
  if (status === 'interrupted') return 'interrupted'
  return 'done'
}
