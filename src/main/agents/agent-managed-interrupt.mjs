export function createManagedInterrupt({
  approvalRouter,
  controlService,
  requireOwnedTarget,
} = {}) {
  return function interruptAgent({ owner, targetNodeId, reason }) {
    requireOwnedTarget(owner, targetNodeId)
    const result = controlService.stopSubtree({
      runId: owner.runId,
      nodeId: targetNodeId,
      reason,
    })
    approvalRouter.revokeDescendantGrants({
      runId: owner.runId,
      ancestorNodeId: targetNodeId,
      reason: 'ancestor_cancelled',
    })
    return {
      interrupted: result.cancelledAttemptIds.length > 0,
      ...result,
    }
  }
}
