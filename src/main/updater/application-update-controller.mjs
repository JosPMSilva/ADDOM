import {
  createInitialUpdateSnapshot,
  normalizeUpdateSnapshot,
  reduceApplicationUpdateState,
} from './application-update-state.mjs'

function normalizedFailureCode(adapter, error) {
  const classified = adapter.classifyError?.(error)
  const code = typeof classified === 'string' ? classified : classified?.code
  return ['generic', 'network', 'unavailable'].includes(code) ? code : 'generic'
}

export function createApplicationUpdateController({
  adapter,
  now = Date.now,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
  checkIntervalMs = 30 * 60 * 1000,
  launchDelayMs = 10_000,
  onStateChanged = () => {},
  installCoordinator = null,
  installBlockerCollector = null,
}) {
  let snapshot = normalizeUpdateSnapshot({
    ...createInitialUpdateSnapshot(),
    simulation: adapter.simulation === true
      ? { enabled: true, candidateVersion: adapter.candidateVersion }
      : null,
  })
  let operation = null
  let timer = null
  let started = false
  let disposed = false

  function publish(event) {
    const next = reduceApplicationUpdateState(snapshot, event, now())
    snapshot = normalizeUpdateSnapshot({ ...next, revision: snapshot.revision + 1 })
    onStateChanged(snapshot)
    return snapshot
  }

  function replaceSnapshot(nextSnapshot) {
    snapshot = normalizeUpdateSnapshot({
      ...nextSnapshot,
      simulation: nextSnapshot?.simulation ?? snapshot.simulation,
      revision: snapshot.revision + 1,
    })
    onStateChanged(snapshot)
    return snapshot
  }

  function schedule(delay) {
    if (!started) return
    if (timer !== null) clearTimer(timer)
    timer = setTimer(async () => {
      timer = null
      await checkForUpdates()
      if (started) schedule(checkIntervalMs)
    }, delay)
  }

  async function checkForUpdates() {
    if (operation) return { ok: false, code: 'operation_in_progress' }
    if (snapshot.phase === 'ready' || snapshot.phase === 'installing') {
      return { ok: true, skipped: true, code: 'update_ready', snapshot }
    }
    operation = 'check'
    publish({ type: 'check_started' })
    try {
      const result = await adapter.checkForUpdates()
      publish(result?.available
        ? { type: 'update_available', version: result.version }
        : { type: 'no_update' })
      return { ok: true, snapshot }
    } catch (error) {
      publish({
        type: 'operation_failed',
        operation: 'check',
        errorCode: normalizedFailureCode(adapter, error),
      })
      return { ok: false, code: snapshot.errorCode }
    } finally {
      operation = null
    }
  }

  async function downloadUpdate() {
    if (operation) return { ok: false, code: 'operation_in_progress' }
    if (!snapshot.version) return { ok: false, code: 'no_update' }
    operation = 'download'
    publish({ type: 'download_started' })
    try {
      const result = await adapter.downloadUpdate({
        onProgress: (percent) => publish({ type: 'download_progress', percent }),
      })
      publish({ type: 'download_succeeded', version: result?.version || snapshot.version })
      return { ok: true, snapshot }
    } catch (error) {
      publish({
        type: 'operation_failed',
        operation: 'download',
        errorCode: normalizedFailureCode(adapter, error),
      })
      return { ok: false, code: snapshot.errorCode }
    } finally {
      operation = null
    }
  }

  async function installUpdate(rendererPreflight) {
    if (operation) return { ok: false, code: 'operation_in_progress' }
    if (snapshot.phase !== 'ready') return { ok: false, code: 'not_ready' }
    if (!installCoordinator && snapshot.installBlockers.length > 0) return { ok: false, code: 'not_idle' }
    if (!installCoordinator && adapter.simulation !== true) return { ok: false, code: 'unavailable' }
    operation = 'install'
    try {
      if (installCoordinator) {
        const result = await installCoordinator.run({
          rendererPreflight,
          onQuiesced: async () => publish({ type: 'install_started' }),
          install: async () => {
            return adapter.installUpdate()
          },
        })
        if (result?.code === 'not_idle') {
          publish({ type: 'install_blockers_changed', blockers: result.blockers })
        }
        return result
      }
      publish({ type: 'install_started' })
      return await adapter.installUpdate()
    } catch (error) {
      publish({ type: 'install_failed', errorCode: normalizedFailureCode(adapter, error) })
      return { ok: false, code: snapshot.errorCode }
    } finally {
      operation = null
    }
  }

  async function refreshInstallBlockers(rendererPreflight) {
    if (operation) return { ok: false, code: 'operation_in_progress' }
    if (snapshot.phase !== 'ready') return { ok: false, code: 'not_ready' }
    if (typeof installBlockerCollector !== 'function') {
      return { ok: true, skipped: true, snapshot }
    }
    operation = 'readiness'
    try {
      const blockers = await installBlockerCollector({ rendererPreflight })
      publish({ type: 'install_blockers_changed', blockers })
      return { ok: true, snapshot }
    } catch {
      publish({
        type: 'install_blockers_changed',
        blockers: [{
          kind: 'running-task',
          label: 'ADDOM could not verify that all work is idle',
        }],
      })
      return { ok: false, code: 'not_idle', snapshot }
    } finally {
      operation = null
    }
  }

  function start() {
    if (started || disposed) return
    started = true
    schedule(launchDelayMs)
  }

  function stop() {
    started = false
    if (timer !== null) {
      clearTimer(timer)
      timer = null
    }
    if (!disposed) {
      disposed = true
      adapter.dispose?.()
    }
  }

  return {
    start,
    stop,
    getSnapshot: () => snapshot,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    refreshInstallBlockers,
    replaceSnapshot,
    setInstallBlockers: (blockers) => publish({ type: 'install_blockers_changed', blockers }),
    reset: () => publish({ type: 'reset' }),
  }
}
