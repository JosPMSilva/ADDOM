import { recordAgentRuntimeDiagnostic } from './agent-runtime-diagnostics.mjs'

const RESERVED_STATUSES = new Set(['queued', 'leased', 'waiting', 'paused'])

export function createAgentOrphanReaper({
  scheduler,
  registry,
  runService,
  diagnostics = null,
  now = Date.now,
  warn = console.warn,
}) {
  if (!scheduler || !registry || !runService) {
    throw new TypeError('scheduler, registry, and runService are required')
  }

  function reap({ includeUnregisteredReservations = false } = {}) {
    const reaped = []
    const candidates = includeUnregisteredReservations
      ? scheduler.list().filter((entry) => RESERVED_STATUSES.has(entry.status))
      : scheduler.listExpiredLeases()
    for (const candidate of candidates) {
      const current = scheduler.get(candidate.attemptId)
      const registered = registry.get(candidate.attemptId)
      const expired = current?.leaseExpiresAt !== null
        && current?.leaseExpiresAt <= now()
      const missingOwnership = includeUnregisteredReservations && !registered
      if (
        !current
        || !RESERVED_STATUSES.has(current.status)
        || (
          !missingOwnership
          && (
            current.status !== 'leased'
            || current.leaseExpiresAt === null
            || !expired
          )
        )
      ) {
        continue
      }
      if (registered?.supportsCancellation) {
        registry.cancel({
          scope: 'node',
          runId: candidate.runId,
          targetNodeId: candidate.nodeId,
          reason: 'orphaned_lease',
        })
      } else {
        registry.unregister(candidate.attemptId)
      }
      runService.orphanAttempt(candidate.attemptId, {
        reason: missingOwnership
          ? 'runtime_ownership_unrecoverable'
          : 'scheduler_lease_expired',
        detectedAt: now(),
      })
      scheduler.complete(candidate.attemptId)
      recordAgentRuntimeDiagnostic(diagnostics, {
        kind: 'orphan',
        runId: candidate.runId,
        nodeId: candidate.nodeId,
        attemptId: candidate.attemptId,
        providerClass: 'managed_hierarchy',
        durationMs: Math.max(
          0,
          now() - (candidate.leaseExpiresAt ?? candidate.updatedAt),
        ),
        outcome: 'reaped',
      }, warn)
      reaped.push(candidate)
    }
    return reaped
  }

  return Object.freeze({ reap })
}
