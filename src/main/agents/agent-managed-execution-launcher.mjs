export function createManagedExecutionLauncher({
  activeExecutions,
  draft,
  eventStore,
  executeEntry,
  repository,
  runtimeLifecycle,
  suspendedContinuations,
} = {}) {
  return function launch(entry) {
    const continuation = suspendedContinuations.get(entry.attemptId)
    if (entry.resumed && continuation) {
      suspendedContinuations.delete(entry.attemptId)
      const graph = repository.getRunGraph(entry.runId)
      const node = graph.nodes.find((candidate) => candidate.id === entry.nodeId)
      eventStore.append(draft('agent_resumed', {
        runId: entry.runId,
        nodeId: entry.nodeId,
        parentNodeId: node.parentNodeId,
        attemptId: entry.attemptId,
        payload: { reason: 'child_result_available' },
        suffix: `${entry.attemptId}:child_result`,
      }))
      continuation.resolve()
      return
    }
    runtimeLifecycle.trackAttempt(entry.attemptId)
    const promise = executeEntry(entry).finally(() => {
      runtimeLifecycle.untrackAttempt(entry.attemptId)
      activeExecutions.delete(entry.attemptId)
    })
    activeExecutions.set(entry.attemptId, promise)
  }
}
