import { replaceActiveLoop } from './chat-turn-state.mjs'

const DEFAULT_SETTLE_TIMEOUT_MS = 5_000

function normalizeFilter(filter = {}) {
  const source = filter && typeof filter === 'object' ? filter : {}
  return Object.fromEntries(Object.entries(source)
    .map(([key, value]) => [key, String(value ?? '').trim()])
    .filter(([, value]) => value))
}

function matchesFilter(run, filter = {}) {
  return Object.entries(filter).every(([key, value]) => (
    String(run?.[key] ?? '').trim() === value
  ))
}

function toPublicRun(run = {}) {
  return {
    loopKey: String(run.loopKey || ''),
    windowId: String(run.windowId || ''),
    projectId: String(run.projectId || ''),
    threadId: String(run.threadId || ''),
    turnId: String(run.turnId || ''),
    providerId: String(run.providerId || ''),
    model: String(run.model || ''),
    permissionMode: String(run.permissionMode || ''),
  }
}

function ensureSettlement(run) {
  if (run.settledPromise) return
  run.settled = false
  run.settledPromise = new Promise((resolve) => {
    run.resolveSettled = resolve
  })
}

async function waitForSettlement(runs, timeoutMs) {
  if (runs.length === 0) return { settled: 0, timedOut: 0 }
  let timeoutId = null
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(resolve, timeoutMs)
  })
  await Promise.race([
    Promise.all(runs.map((run) => run.settledPromise)),
    timeout,
  ])
  if (timeoutId) clearTimeout(timeoutId)
  const settled = runs.filter((run) => run.settled === true).length
  return { settled, timedOut: runs.length - settled }
}

export function createChatRunRegistry({
  appendEvent = () => {},
  settleTimeoutMs = DEFAULT_SETTLE_TIMEOUT_MS,
} = {}) {
  const activeLoops = new Map()

  const selectRuns = (filter = {}) => {
    const normalizedFilter = normalizeFilter(filter)
    return [...activeLoops.values()].filter((run) => matchesFilter(run, normalizedFilter))
  }

  const cancelAndWait = async (filter = {}, {
    reason = 'Stopped by user.',
    onCancel = null,
  } = {}) => {
    const runs = selectRuns(filter)
    for (const run of runs) {
      if (run.cancelled === true) continue
      const resolvedReason = typeof reason === 'function' ? reason(run) : reason
      run.cancelled = true
      run.cancelReason = String(resolvedReason || 'Stopped by user.')
      try { onCancel?.(run) } catch { /* cancellation presentation is non-fatal */ }
      try { run.abortController?.abort() } catch { /* best-effort abort propagation */ }
    }
    const settlement = await waitForSettlement(runs, settleTimeoutMs)
    return {
      ok: settlement.timedOut === 0,
      matched: runs.length,
      ...settlement,
      runs: runs.map(toPublicRun),
    }
  }

  return {
    activeLoops,
    register(run) {
      if (!run || typeof run !== 'object') throw new Error('chat run is required')
      if (!String(run.loopKey || '').trim()) throw new Error('chat run loopKey is required')
      ensureSettlement(run)
      replaceActiveLoop(activeLoops, run.loopKey, run)
      return run
    },
    settle(loopKey, run) {
      if (!run || typeof run !== 'object') return false
      if (activeLoops.get(loopKey) === run) activeLoops.delete(loopKey)
      if (run.settled !== true) {
        run.settled = true
        run.resolveSettled?.()
      }
      return true
    },
    select(filter = {}) {
      return selectRuns(filter)
    },
    list(filter = {}) {
      return selectRuns(filter).map(toPublicRun)
    },
    cancelAndWait,
    async interruptAndWait(filter = {}, { reason = 'Application quit.' } = {}) {
      return await cancelAndWait(filter, {
        reason,
        onCancel: (run) => {
          if (run.turnStateFinalized || !run.threadId) return
          appendEvent(run.threadId, {
            turnId: run.turnId,
            kind: 'turn_interrupted',
            role: 'system',
            content: String(reason || 'Application quit.'),
            meta: {
              state: 'interrupted',
              status: 'interrupted',
              reason: 'application_quit',
            },
          })
          run.turnStateFinalized = true
        },
      })
    },
  }
}
