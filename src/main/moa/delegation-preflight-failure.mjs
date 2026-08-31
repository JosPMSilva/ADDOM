export function handleDelegationPreflightFailure({
  preflight,
  delegationId,
  activeThreadId,
  activeTurnId,
  stepId,
  stepStartedAt,
  moaPolicy,
  emitMoaEvent,
  buildDelegationErrorEnvelope,
}) {
  const envelope = buildDelegationErrorEnvelope({
    delegationId,
    threadId: activeThreadId,
    turnId: activeTurnId,
    stepId,
    policy: moaPolicy,
    tasks: preflight.tasks,
    errors: preflight.errors,
    status: 'preflight_failed',
  })

  emitMoaEvent('moa:delegation-start', {
    delegationId: envelope.delegationId,
    taskCount: envelope.taskCount,
    agentSummary: envelope.agents.map((agent) => ({
      taskId: agent.taskId,
      role: agent.role,
      roleId: agent.roleId,
      providerId: agent.providerId,
      model: agent.model,
    })),
    policy: envelope.policy,
    status: 'preflight_failed',
    startedAt: stepStartedAt,
  })

  emitMoaEvent('moa:delegation-done', {
    delegationId: envelope.delegationId,
    status: 'preflight_failed',
    taskCount: envelope.taskCount,
    summary: envelope.summary,
    usage: envelope.usage,
    results: envelope.agents,
    startedAt: stepStartedAt,
    finishedAt: Date.now(),
    durationMs: Math.max(0, Date.now() - stepStartedAt),
    policy: envelope.policy,
    stagedSummary: envelope.stagedSummary || { count: 0, totalBytes: 0 },
    stagedChanges: Array.isArray(envelope.stagedChanges) ? envelope.stagedChanges : [],
    errors: preflight.errors,
  })

  return envelope
}

