function normalizeLoopKey(value) {
  const key = String(value || '').trim()
  if (!key) throw new Error('loop key is required')
  return key
}

export function buildLoopKey(windowId, threadId = '') {
  const wid = String(windowId ?? '').trim()
  if (!wid) throw new Error('window id is required')
  const tid = String(threadId || '').trim() || '__window__'
  return `${wid}:${tid}`
}

export function replaceActiveLoop(activeLoops, loopKey, nextLoop) {
  if (!activeLoops || !(activeLoops instanceof Map)) {
    throw new Error('activeLoops map is required')
  }
  const key = normalizeLoopKey(loopKey)
  if (activeLoops.has(key)) {
    const prev = activeLoops.get(key)
    prev.cancelled = true
    prev.cancelReason = 'Interrupted by a newer request in the same thread.'
    try { prev.abortController?.abort() } catch { /* best-effort abort for replaced loop */ }
  }
  activeLoops.set(key, nextLoop)
}

export function createLoopState({
  activeProjectId = '',
  activeThreadId = '',
  activeTurnId = '',
  windowId = '',
  loopKey = '',
  providerId = '',
  model = '',
  permissionMode = '',
  abortController = null,
} = {}) {
  return {
    cancelled: false,
    cancelReason: '',
    abortController,
    cancellationSent: false,
    turnStateFinalized: false,
    projectId: String(activeProjectId || '').trim(),
    threadId: activeThreadId,
    turnId: activeTurnId,
    windowId: String(windowId || '').trim(),
    loopKey: String(loopKey || '').trim(),
    providerId: String(providerId || '').trim().toLowerCase(),
    model: String(model || '').trim(),
    permissionMode: String(permissionMode || '').trim().toLowerCase(),
  }
}
