import { createAgentRunRepository } from './agent-run-repository.mjs'
import { recordAgentRuntimeDiagnostic } from './agent-runtime-diagnostics.mjs'

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])
const DEGRADED_RECONCILIATION_STATES = new Set([
  'reconciling',
  'provider_ahead',
  'provider_unverified_terminal',
  'forked_history',
])

function recoveryResult(classification, reconciliationStatus, requiresProviderReconciliation) {
  return { classification, reconciliationStatus, requiresProviderReconciliation }
}

export function classifyAgentRunRecovery(
  graph,
  { providerEvidenceByAttempt = {} } = {},
) {
  if (!graph?.run) return recoveryResult('orphaned', 'opaque_unmatched', true)
  if (TERMINAL_STATUSES.has(graph.run.status)) {
    return recoveryResult('terminal', graph.run.reconciliationStatus || 'matched', false)
  }
  if (!Array.isArray(graph.attempts) || graph.attempts.length === 0) {
    return recoveryResult('orphaned', 'opaque_unmatched', true)
  }

  for (const attempt of graph.attempts) {
    if (DEGRADED_RECONCILIATION_STATES.has(attempt.reconciliationState)) {
      return recoveryResult('interrupted', attempt.reconciliationState, true)
    }
    const evidence = providerEvidenceByAttempt[attempt.id]
    if (evidence?.status === 'ahead') {
      return recoveryResult('interrupted', 'provider_ahead', true)
    }
    if (evidence?.status === 'terminal_unverified') {
      return recoveryResult('interrupted', 'provider_unverified_terminal', true)
    }
    if (evidence?.status === 'forked') {
      return recoveryResult('interrupted', 'forked_history', true)
    }
  }

  const activeAttempts = graph.attempts.filter((attempt) => !TERMINAL_STATUSES.has(attempt.status))
  const canResume = activeAttempts.length > 0 && activeAttempts.every((attempt) => {
    const evidence = providerEvidenceByAttempt[attempt.id]
    return attempt.capabilitySnapshot?.resumableChildren === true
      && evidence?.status === 'active'
      && evidence.correlationVerified === true
  })
  if (canResume) return recoveryResult('resumable', 'matched', false)
  return recoveryResult('interrupted', 'pending_match', true)
}

export function recoverAgentRunProjections(
  db,
  {
    providerEvidenceByAttempt = {},
    diagnostics = null,
    warn = console.warn,
  } = {},
) {
  const repository = createAgentRunRepository(db)
  const rows = db.prepare(`
    SELECT id FROM agent_runs
    WHERE status NOT IN ('completed', 'failed', 'cancelled')
    ORDER BY created_at ASC, id ASC
  `).all()
  const update = db.prepare(`
    UPDATE agent_runs SET recovery_json = ? WHERE id = ?
  `)
  return db.transaction(() => rows.map(({ id }) => {
    const recovery = classifyAgentRunRecovery(repository.getRunGraph(id), {
      providerEvidenceByAttempt,
    })
    update.run(JSON.stringify(recovery), id)
    recordAgentRuntimeDiagnostic(diagnostics, {
      kind: recovery.requiresProviderReconciliation ? 'reconciliation' : 'reconnect',
      runId: id,
      providerClass: 'unknown',
      outcome: recovery.classification,
      attributes: {
        reconciliation_status: recovery.reconciliationStatus,
        requires_provider: recovery.requiresProviderReconciliation,
      },
    }, warn)
    return { runId: id, ...recovery }
  }))()
}
