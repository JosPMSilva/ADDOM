import { performance } from 'node:perf_hooks'

import {
  createAgentRuntimeDiagnostics,
  recordAgentRuntimeDiagnostic,
} from './agent-runtime-diagnostics.mjs'

export function createManagedRuntimeDiagnostics({
  db,
  idFactory,
  now,
  monotonicNow = performance.now.bind(performance),
} = {}) {
  const store = createAgentRuntimeDiagnostics(db, {
    idFactory: () => idFactory('diagnostic'),
    now,
    monotonicNow,
  })

  function beginSpawn() {
    return monotonicNow()
  }

  function recordSpawn(startedAt, {
    graph,
    nodeId,
    attemptId,
    snapshot,
    workspace,
  }) {
    return recordAgentRuntimeDiagnostic(store, {
      kind: 'spawn_latency',
      runId: graph.run.id,
      nodeId,
      attemptId,
      providerClass: snapshot.nodeCapabilities.mode,
      monotonicAt: startedAt,
      durationMs: Math.max(0, monotonicNow() - startedAt),
      outcome: 'queued',
      attributes: { workspace_mode: workspace.mode },
    })
  }

  return Object.freeze({ beginSpawn, recordSpawn, store })
}
