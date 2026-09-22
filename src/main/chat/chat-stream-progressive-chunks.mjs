export const PROGRESSIVE_EXECUTION_PERSIST_INTERVAL_MS = 250

function executionProgressiveKey(kind, round, reasoningSegment = null) {
  const prefix = kind === 'execution_reasoning_chunk' ? 'execution_reasoning' : 'execution_commentary'
  const suffix = reasoningSegment != null
    ? `:${Math.max(0, Number(reasoningSegment) || 0)}`
    : ''
  return `${prefix}:${round}${suffix}`
}

export function createProgressiveExecutionChunkWriter({
  persistTimelineEvent = () => {},
  threadId = '',
  turnId = '',
  assistantMessageId = '',
  round = 0,
  providerId = '',
  model = '',
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  persistIntervalMs = PROGRESSIVE_EXECUTION_PERSIST_INTERVAL_MS,
} = {}) {
  const normalizedIntervalMs = Math.max(1, Number(persistIntervalMs) || 1)
  const lastPersistedAtByKey = new Map()
  const lastProgressiveKeyByKind = new Map()
  const pendingByKey = new Map()
  let timerId = null
  let timerDueAt = 0
  let deferredPersistenceError = null
  let settled = false

  const throwDeferredPersistenceError = () => {
    if (deferredPersistenceError) throw deferredPersistenceError
  }

  const cancelScheduledFlush = () => {
    if (timerId != null) clearTimer(timerId)
    timerId = null
    timerDueAt = 0
  }

  const persistEntry = (entry) => {
    persistTimelineEvent(entry.kind, entry.payload)
    lastPersistedAtByKey.set(entry.progressiveKey, Math.max(0, Number(now()) || 0))
  }

  const flushEntry = (progressiveKey) => {
    const entry = pendingByKey.get(progressiveKey)
    if (!entry) return false
    pendingByKey.delete(progressiveKey)
    persistEntry(entry)
    return true
  }

  const scheduleNextFlush = () => {
    if (pendingByKey.size === 0) {
      cancelScheduledFlush()
      return
    }
    const nextDueAt = Math.min(...[...pendingByKey.values()].map((entry) => entry.dueAt))
    if (timerId != null && timerDueAt <= nextDueAt) return
    cancelScheduledFlush()
    timerDueAt = nextDueAt
    timerId = setTimer(() => {
      timerId = null
      timerDueAt = 0
      try {
        const currentTime = Math.max(0, Number(now()) || 0)
        for (const [progressiveKey, entry] of pendingByKey) {
          if (entry.dueAt <= currentTime) flushEntry(progressiveKey)
        }
        scheduleNextFlush()
      } catch (error) {
        deferredPersistenceError = error
        cancelScheduledFlush()
      }
    }, Math.max(0, nextDueAt - (Number(now()) || 0)))
    timerId?.unref?.()
  }

  const createEntry = (kind, {
    content = '', phase = '', sequence = 0, emittedAt = 0, lifecycle = 'active', reasoningSegment = null,
  } = {}) => {
    const normalizedContent = String(content ?? '')
    if (!normalizedContent) return null
    const progressiveKey = executionProgressiveKey(kind, round, reasoningSegment)
    return {
      kind,
      progressiveKey,
      payload: {
        role: 'assistant',
        content: normalizedContent,
        lifecycle,
        progressiveKey,
        meta: {
          threadId,
          turnId,
          round,
          ...((reasoningSegment != null || (kind === 'execution_reasoning_chunk' && Number(round || 0) > 0))
            ? { reasoningSegment: reasoningSegment == null
              ? Math.max(0, Number(round) - 1)
              : Math.max(0, Number(reasoningSegment) || 0) }
            : {}),
          providerId: String(providerId || ''),
          model: String(model ?? ''),
          assistantMessageId: String(assistantMessageId || ''),
          ...(phase ? { phase } : {}),
          ...(Number(sequence || 0) > 0 ? { sequence: Number(sequence || 0) || 0 } : {}),
          emittedAt: Number(emittedAt || 0) || now(),
        },
      },
    }
  }

  const flush = () => {
    throwDeferredPersistenceError()
    cancelScheduledFlush()
    let flushed = 0
    for (const progressiveKey of [...pendingByKey.keys()]) {
      if (flushEntry(progressiveKey)) flushed += 1
    }
    return flushed
  }

  const write = (kind, options = {}) => {
    throwDeferredPersistenceError()
    if (settled) throw new TypeError('Progressive execution writer is already settled.')
    const entry = createEntry(kind, options)
    if (!entry) return

    const previousProgressiveKey = lastProgressiveKeyByKind.get(kind)
    if (previousProgressiveKey && previousProgressiveKey !== entry.progressiveKey) {
      flushEntry(previousProgressiveKey)
    }
    lastProgressiveKeyByKind.set(kind, entry.progressiveKey)

    const lifecycle = String(entry.payload.lifecycle || '').trim().toLowerCase()
    if (lifecycle !== 'active' && lifecycle !== 'created') {
      pendingByKey.delete(entry.progressiveKey)
      persistEntry(entry)
      scheduleNextFlush()
      return
    }

    const lastPersistedAt = lastPersistedAtByKey.get(entry.progressiveKey)
    const currentTime = Math.max(0, Number(now()) || 0)
    if (lastPersistedAt == null || currentTime - lastPersistedAt >= normalizedIntervalMs) {
      pendingByKey.delete(entry.progressiveKey)
      persistEntry(entry)
      scheduleNextFlush()
      return
    }

    pendingByKey.set(entry.progressiveKey, {
      ...entry,
      dueAt: lastPersistedAt + normalizedIntervalMs,
    })
    if (options.flushImmediately === true) flushEntry(entry.progressiveKey)
    scheduleNextFlush()
  }

  const settle = ({
    reasoningContent = '', reasoningSequence = 0,
    reasoningSegment = null,
    commentaryContent = '', commentarySequence = 0,
    commentarySegment = null,
    lifecycle = 'completed',
  } = {}) => {
    throwDeferredPersistenceError()
    if (settled) return
    const terminalEntries = []
    if (reasoningSequence > 0) {
      const entry = createEntry('execution_reasoning_chunk', {
        content: reasoningContent, sequence: reasoningSequence, lifecycle, reasoningSegment,
      })
      if (entry) terminalEntries.push(entry)
    }
    if (commentarySequence > 0) {
      const entry = createEntry('execution_commentary_chunk', {
        content: commentaryContent, phase: 'commentary', sequence: commentarySequence, lifecycle,
        reasoningSegment: commentarySegment,
      })
      if (entry) terminalEntries.push(entry)
    }

    cancelScheduledFlush()
    for (const entry of terminalEntries) pendingByKey.delete(entry.progressiveKey)
    for (const progressiveKey of [...pendingByKey.keys()]) flushEntry(progressiveKey)
    for (const entry of terminalEntries) persistEntry(entry)
    settled = true
  }

  return { write, flush, settle }
}
