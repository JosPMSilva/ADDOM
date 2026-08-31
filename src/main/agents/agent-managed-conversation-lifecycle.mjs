export function createManagedConversationLifecycle({ repository, now } = {}) {
  const transition = (attemptId, status) => repository.transitionTurnForAttempt({
    attemptId, status, now: now(),
  })
  const close = (attemptId, status) => repository.closeTurnForAttempt({
    attemptId, status, now: now(),
  })
  return Object.freeze({
    cancelMany(attemptIds) {
      for (const attemptId of attemptIds) close(attemptId, 'cancelled')
    },
    fail: (attemptId) => close(attemptId, 'failed'),
    markQueued: (attemptId) => transition(attemptId, 'queued'),
    markRunning: (attemptId) => transition(attemptId, 'running'),
    markWaiting: (attemptId) => transition(attemptId, 'waiting'),
    bindRetry({ sourceAttemptId, retryAttemptId }) {
      const binding = repository.getTurnBindingForAttempt(sourceAttemptId)
      if (!binding || !retryAttemptId) return
      repository.bindAttempt({ attemptId: retryAttemptId, turnId: binding.turnId, createdAt: now() })
      transition(retryAttemptId, 'queued')
    },
  })
}
