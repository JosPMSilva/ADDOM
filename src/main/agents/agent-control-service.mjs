import { recordAgentRuntimeDiagnostic } from './agent-runtime-diagnostics.mjs'

export function createAgentControlService({
  registry,
  runService,
  scheduler = null,
  diagnostics = null,
  onAttemptsCancelled = null,
  warn = console.warn,
}) {
  if (!registry || !runService) throw new TypeError('registry and runService are required')

  function stop({ scope, runId, targetNodeId = null, reason = 'user_stop' }) {
    const result = registry.cancel({ scope, runId, targetNodeId, reason })
    const durableAttemptIds = typeof runService.listCancellableAttemptIds === 'function'
      ? runService.listCancellableAttemptIds({ scope, runId, targetNodeId })
      : []
    const unsupported = new Set(result.unsupportedAttemptIds)
    const attemptIds = [...new Set([
      ...result.cancelledAttemptIds,
      ...durableAttemptIds,
    ])].filter((attemptId) => !unsupported.has(attemptId))
    let cancelledAttemptIds = attemptIds
    if (attemptIds.length > 0) {
      const persisted = runService.cancelAttempts(attemptIds, {
        scope,
        runId,
        targetNodeId,
        reason,
      })
      if (Array.isArray(persisted)) cancelledAttemptIds = persisted
    }
    onAttemptsCancelled?.(cancelledAttemptIds)
    const outcome = result.unsupportedAttemptIds.length > 0
      ? (cancelledAttemptIds.length > 0 ? 'partial' : 'unsupported')
      : 'cancelled'
    recordAgentRuntimeDiagnostic(diagnostics, {
      kind: 'cancellation',
      runId,
      nodeId: targetNodeId,
      providerClass: 'managed_hierarchy',
      outcome,
      attributes: {
        cancelled_count: cancelledAttemptIds.length,
        unsupported_count: result.unsupportedAttemptIds.length,
        scope,
      },
    }, warn)
    return {
      cancelledAttemptIds,
      unsupportedAttemptIds: result.unsupportedAttemptIds,
    }
  }

  function stopNode({ runId, nodeId, reason }) {
    return stop({ scope: 'node', runId, targetNodeId: nodeId, reason })
  }

  function stopParentTurn({ runId, nodeId, reason }) {
    return stop({ scope: 'parent_turn', runId, targetNodeId: nodeId, reason })
  }

  function stopSubtree({ runId, nodeId, reason }) {
    return stop({ scope: 'subtree', runId, targetNodeId: nodeId, reason })
  }

  function stopRun({ runId, reason }) {
    return stop({ scope: 'run', runId, reason })
  }

  function pauseQueue() {
    if (!scheduler) return { supported: false, reason: 'scheduler_unavailable' }
    scheduler.pauseQueue()
    return { supported: true }
  }

  function resumeQueue() {
    if (!scheduler) return { supported: false, reason: 'scheduler_unavailable' }
    scheduler.resumeQueue()
    return { supported: true }
  }

  return Object.freeze({
    pauseQueue,
    resumeQueue,
    stopNode,
    stopParentTurn,
    stopRun,
    stopSubtree,
  })
}
