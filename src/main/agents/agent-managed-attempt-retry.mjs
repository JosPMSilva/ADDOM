export async function failOrRetryManagedAttempt({
  runService,
  result,
  attempt,
  graph,
  prepareRetry = null,
  activateRetry = null,
  discardRetry = null,
  createRetryOwnership = null,
  onRetryWaiting = null,
  onTerminalFailure = null,
}) {
  const maxAttempts = Number(graph.run.budgetSnapshot?.maxAttemptsPerNode || 1)
  const retryable = result.retryable === true && attempt.attemptNumber < maxAttempts
  let preparedRetry = null
  if (retryable && typeof prepareRetry === 'function') {
    try {
      preparedRetry = await prepareRetry()
    } catch (error) {
      runService.failAttempt({
        attemptId: attempt.id,
        errorSummary: `Retry workspace preparation failed: ${String(error?.message || error)}`,
        errorCode: 'AGENT_RETRY_WORKSPACE_FAILED',
        retryable: false,
      })
      onTerminalFailure?.(attempt.id)
      return { retrying: false, reason: 'workspace_preparation_failed' }
    }
  }
  runService.failAttempt({
    attemptId: attempt.id,
    errorSummary: String(result.summary || result.errorCode || 'Agent failed.'),
    errorCode: result.errorCode || 'AGENT_FAILED',
    retryable,
  })
  if (!retryable) {
    onTerminalFailure?.(attempt.id)
    return { retrying: false }
  }
  onRetryWaiting?.(attempt.id)
  const admission = runService.retryNode({
    runId: graph.run.id,
    nodeId: attempt.nodeId,
    attemptId: preparedRetry?.attemptId,
    workspaceLease: preparedRetry?.workspaceLease,
    reservations: {
      tokenReservation: 1,
      costReservationUsd: 0,
      toolCallReservation: 1,
    },
    createOwnership: createRetryOwnership
      ? () => createRetryOwnership(preparedRetry?.attemptId)
      : null,
  })
  if (!admission.admitted) {
    onTerminalFailure?.(attempt.id)
    await discardRetry?.(preparedRetry)
    return { retrying: false, reason: admission.reason || null }
  }
  if (preparedRetry && typeof activateRetry === 'function') {
    try {
      await activateRetry(preparedRetry, admission)
    } catch (error) {
      runService.failAttempt({
        attemptId: admission.attemptId,
        errorSummary: `Retry workspace activation failed: ${String(error?.message || error)}`,
        errorCode: 'AGENT_RETRY_WORKSPACE_FAILED',
        retryable: false,
      })
      onTerminalFailure?.(admission.attemptId)
      await discardRetry?.(preparedRetry)
      return { retrying: false, reason: 'workspace_activation_failed' }
    }
  }
  return { retrying: true, reason: null, attemptId: admission.attemptId }
}
