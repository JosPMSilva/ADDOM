export function buildApprovalRequestPayload({
  approvalId,
  responseChannel,
  toolName,
  toolInput,
  meta,
  projectRoot,
  prevContent,
  expiresAt,
  timeoutMs,
  policy,
  policyDecision,
  executionTarget,
  elevationRequired,
  threadId,
  turnId,
  availableDecisions,
  approvalKind,
  grantRoot,
  changes,
  originSurface,
  originLabel,
} = {}) {
  return {
    approvalId,
    responseChannel,
    toolName,
    toolInput,
    meta,
    projectRoot,
    prevContent,
    ...(policy && typeof policy === 'object' ? { policy } : {}),
    ...(policyDecision ? { policyDecision: String(policyDecision) } : {}),
    ...(executionTarget ? { executionTarget: String(executionTarget) } : {}),
    ...(typeof elevationRequired === 'boolean' ? { elevationRequired } : {}),
    ...(threadId ? { threadId: String(threadId) } : {}),
    ...(turnId ? { turnId: String(turnId) } : {}),
    ...(Array.isArray(availableDecisions)
      ? {
          availableDecisions: availableDecisions
            .map((value) => String(value || '').trim())
            .filter(Boolean),
        }
      : {}),
    ...(approvalKind ? { approvalKind: String(approvalKind) } : {}),
    ...(grantRoot ? { grantRoot: String(grantRoot) } : {}),
    ...(originSurface ? { originSurface: String(originSurface) } : {}),
    ...(originLabel ? { originLabel: String(originLabel) } : {}),
    ...(Array.isArray(changes)
      ? {
          changes: changes.map((change) => (
            change && typeof change === 'object'
              ? { ...change }
              : change
          )),
        }
      : {}),
    expiresAt,
    timeoutMs,
  }
}
