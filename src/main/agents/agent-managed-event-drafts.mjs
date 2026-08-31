export function createManagedEventDrafts({ now } = {}) {
  function draft(kind, {
    runId,
    nodeId,
    parentNodeId,
    attemptId = null,
    providerEventId = null,
    providerCorrelationKey = null,
    payload,
    suffix,
    createdAt = now(),
  }) {
    return {
      runId,
      nodeId,
      parentNodeId,
      attemptId,
      providerEventId,
      providerCorrelationKey,
      idempotencyKey: `${runId}:${kind}:${suffix}`,
      kind,
      payload,
      createdAt,
    }
  }

  function statusDraft(entity, from, to, snapshot, attempt = null, suffix = '') {
    const runId = snapshot.runId || snapshot.id
    return draft('agent_status_changed', {
      runId,
      nodeId: entity === 'run' ? snapshot.rootNodeId : snapshot.nodeId || snapshot.id,
      parentNodeId: entity === 'node' ? snapshot.parentNodeId : null,
      attemptId: entity === 'attempt' ? snapshot.id : attempt?.id || null,
      providerCorrelationKey: attempt?.providerCorrelationKey || null,
      payload: { entity, from, to, snapshot },
      suffix: `${entity}:${snapshot.id}:${from}:${to}:${suffix}`,
    })
  }

  return Object.freeze({ draft, statusDraft })
}
