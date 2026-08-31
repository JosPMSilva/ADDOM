function startTimer(setIntervalFn, callback, intervalMs) {
  const timer = setIntervalFn(callback, intervalMs)
  timer?.unref?.()
  return timer
}

export function createManagedRuntimeLifecycle({
  scheduler,
  orphanReaper,
  ensureWorkspaceRecovery,
  recoverProjections,
  heartbeatIntervalMs = 10_000,
  reapIntervalMs = 5_000,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  warn = console.warn,
} = {}) {
  if (
    !scheduler
    || !orphanReaper
    || typeof ensureWorkspaceRecovery !== 'function'
    || typeof recoverProjections !== 'function'
  ) {
    throw new TypeError(
      'scheduler, orphanReaper, workspace recovery, and projection recovery are required',
    )
  }
  const trackedAttempts = new Set()
  let startPromise = null
  let heartbeatTimer = null
  let reaperTimer = null
  let stopped = false

  function heartbeatNow() {
    for (const attemptId of trackedAttempts) {
      try {
        scheduler.heartbeat(attemptId)
      } catch (error) {
        warn?.('Managed agent heartbeat failed.', error)
      }
    }
  }

  function reapNow() {
    try {
      return orphanReaper.reap()
    } catch (error) {
      warn?.('Managed agent orphan reaping failed.', error)
      return []
    }
  }

  function start() {
    if (startPromise) return startPromise
    startPromise = (async () => {
      const workspaceRecovery = await ensureWorkspaceRecovery()
      const startupOrphans = orphanReaper.reap({
        includeUnregisteredReservations: true,
      })
      const projectionRecovery = recoverProjections()
      if (!stopped) {
        heartbeatTimer = startTimer(
          setIntervalFn,
          heartbeatNow,
          heartbeatIntervalMs,
        )
        reaperTimer = startTimer(setIntervalFn, reapNow, reapIntervalMs)
      }
      return {
        projectionRecovery,
        startupOrphans,
        workspaceRecovery,
      }
    })()
    return startPromise
  }

  function trackAttempt(attemptId) {
    const normalized = String(attemptId || '').trim()
    if (!normalized) throw new TypeError('attemptId is required')
    trackedAttempts.add(normalized)
  }

  function untrackAttempt(attemptId) {
    return trackedAttempts.delete(String(attemptId || '').trim())
  }

  function stop() {
    stopped = true
    if (heartbeatTimer) clearIntervalFn(heartbeatTimer)
    if (reaperTimer) clearIntervalFn(reaperTimer)
    heartbeatTimer = null
    reaperTimer = null
    trackedAttempts.clear()
  }

  return Object.freeze({
    heartbeatNow,
    reapNow,
    start,
    stop,
    trackAttempt,
    untrackAttempt,
  })
}
