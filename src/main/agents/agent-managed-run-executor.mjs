import { scheduleManagedTaskInputs } from './agent-managed-task-sequencer.mjs'
import { managedRootOwner } from './agent-managed-runtime-values.mjs'

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])

export function createManagedRunExecutor({
  adapterRegistry,
  approvalRouter,
  controlService,
  createRun,
  ensureRuntimeReady,
  executionInputs,
  activeExecutions,
  now,
  pumpUntil,
  repository,
  resultsByNode,
  runFinalizer,
  runPolicies,
  runRouteResolvers,
  spawnChild,
} = {}) {
  return async function executeTaskGraph({
    projectId,
    threadId,
    turnId,
    policyProfileId = 'balanced',
    policySettings = null,
    rootTaskSummary,
    tasks,
    sequential = false,
    prepareSequentialInput = null,
    childRouteResolver = null,
    abortSignal = null,
  }) {
    await ensureRuntimeReady()
    if (!Array.isArray(tasks) || tasks.length === 0) {
      throw new TypeError('executeTaskGraph requires at least one task')
    }
    const adapter = adapterRegistry.resolve('addom-managed')
    const snapshots = []
    for (const input of tasks) {
      snapshots.push(await adapter.probe({
        providerId: input.role.providerId,
        modelId: input.role.model,
        capturedAt: now(),
        context: { projectId, threadId },
      }))
    }
    const graph = createRun({
      projectId,
      threadId,
      turnId,
      policyProfileId,
      policySettings,
      rootTaskSummary,
      snapshots: snapshots.filter((snapshot, index, all) => (
        all.findIndex((candidate) => (
          candidate.providerId === snapshot.providerId && candidate.modelId === snapshot.modelId
        )) === index
      )),
    })
    if (typeof childRouteResolver === 'function') {
      runRouteResolvers.set(graph.run.id, childRouteResolver)
    }
    const owner = managedRootOwner(graph)
    const cancelRun = () => {
      const result = controlService.stopRun({
        runId: graph.run.id,
        reason: String(abortSignal?.reason || 'parent_cancelled'),
      })
      approvalRouter.revokeDescendantGrants({
        runId: graph.run.id,
        ancestorNodeId: graph.run.rootNodeId,
        reason: 'ancestor_cancelled',
      })
      return result
    }
    if (abortSignal?.aborted) cancelRun()
    else abortSignal?.addEventListener?.('abort', cancelRun, { once: true })
    const readResult = ({ nodeId }) => {
      const latest = repository.getRunGraph(graph.run.id)
      return {
        node: latest.nodes.find((candidate) => candidate.id === nodeId),
        providerResult: resultsByNode.get(nodeId),
      }
    }
    const initialNodes = await scheduleManagedTaskInputs({
      inputs: tasks,
      snapshots,
      sequential,
      prepareSequentialInput,
      spawnInput: (input, capabilitySnapshot) => spawnChild({
        owner,
        ...input,
        capabilitySnapshot,
      }),
      waitForNode: ({ nodeId }) => pumpUntil(() => (
        TERMINAL_STATUSES.has(readResult({ nodeId }).node?.status)
      )),
      readResult,
      cancelNode: ({ nodeId }, reason) => {
        const result = controlService.stopSubtree({
          runId: graph.run.id,
          nodeId,
          reason,
        })
        approvalRouter.revokeDescendantGrants({
          runId: graph.run.id,
          ancestorNodeId: nodeId,
          reason: 'ancestor_cancelled',
        })
        return result
      },
      isRunTerminal: () => TERMINAL_STATUSES.has(
        repository.getRunGraph(graph.run.id).run.status,
      ),
    })
    await pumpUntil(() => {
      const latest = repository.getRunGraph(graph.run.id)
      return TERMINAL_STATUSES.has(latest.run.status) || latest.nodes
        .filter((node) => node.id !== latest.run.rootNodeId)
        .every((node) => TERMINAL_STATUSES.has(node.status))
    })
    const runAttemptIds = new Set(
      repository.getRunGraph(graph.run.id).attempts.map((attempt) => attempt.id),
    )
    await Promise.allSettled(
      [...activeExecutions.entries()]
        .filter(([attemptId]) => runAttemptIds.has(attemptId))
        .map(([, execution]) => execution),
    )
    const beforeFinalization = repository.getRunGraph(graph.run.id)
    if (!TERMINAL_STATUSES.has(beforeFinalization.run.status)) {
      runFinalizer.finalize({
        runId: graph.run.id,
        requiredNodeIds: beforeFinalization.nodes
          .filter((node) => node.id !== beforeFinalization.run.rootNodeId)
          .map((node) => node.id),
        rootResultSummary: 'Delegated agent run completed.',
        allowPartial: true,
      })
    }
    abortSignal?.removeEventListener?.('abort', cancelRun)
    const finalGraph = repository.getRunGraph(graph.run.id)
    const output = {
      runId: graph.run.id,
      status: finalGraph.run.status,
      results: initialNodes.map((spawned) => ({
        ...readResult(spawned),
        attemptCount: finalGraph.attempts
          .filter((attempt) => attempt.nodeId === spawned.nodeId).length,
      })),
    }
    for (const node of finalGraph.nodes) {
      executionInputs.delete(node.id)
      resultsByNode.delete(node.id)
    }
    runPolicies.delete(graph.run.id)
    runRouteResolvers.delete(graph.run.id)
    return output
  }
}
