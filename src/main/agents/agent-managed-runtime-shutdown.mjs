function boundedSettlement(activeExecutions, timeoutMs) {
  if (activeExecutions.size === 0) {
    return Promise.resolve({ timedOut: false, cancelTimeout: () => {} })
  }
  const waitMs = Math.max(0, Math.min(60_000, Number(timeoutMs) || 0))
  let timeoutId = null
  const settlement = Promise.race([
    Promise.allSettled([...activeExecutions.values()]).then(() => false),
    new Promise((resolve) => {
      timeoutId = setTimeout(() => resolve(true), waitMs)
    }),
  ])
  return settlement.then((timedOut) => ({
    timedOut,
    cancelTimeout: () => {
      if (timeoutId) clearTimeout(timeoutId)
    },
  }))
}

export function createManagedRuntimeShutdown({
  activeExecutions,
  controlService,
  runtimeLifecycle = null,
  workspaceCleanup,
  workspaceManager,
} = {}) {
  return async function shutdown({
    reason = 'application_quit',
    timeoutMs = 5_000,
  } = {}) {
    runtimeLifecycle?.stop()
    const preparedCleanup = await workspaceManager.beginShutdown()
    const activeWorkspaces = workspaceManager.list({ status: 'active' })
    const activeRunIds = [...new Set(activeWorkspaces.map((workspace) => workspace.runId))]
    for (const runId of activeRunIds) {
      try {
        controlService.stopRun({ runId, reason })
      } catch {
        // A concurrently finalized run needs no additional cancellation.
      }
    }
    const settlement = await boundedSettlement(activeExecutions, timeoutMs)
    settlement.cancelTimeout()
    for (const workspace of workspaceManager.list({ status: 'active' })) {
      try {
        await workspaceManager.captureArtifacts({ workspaceId: workspace.id })
        const terminal = workspaceManager.markTerminal({
          attemptId: workspace.attemptId,
          status: 'interrupted',
        })
        if (terminal && terminal.status !== 'reviewable') {
          await workspaceCleanup.cleanupWorkspace(terminal.id)
        }
      } catch (error) {
        workspaceManager.markInterrupted({
          workspaceId: workspace.id,
          reason: `shutdown_capture_failed:${String(error?.message || error)}`,
        })
      }
    }
    return {
      ...preparedCleanup,
      stoppedRunIds: activeRunIds,
      timedOut: settlement.timedOut,
    }
  }
}
