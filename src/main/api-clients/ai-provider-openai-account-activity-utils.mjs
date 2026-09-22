function normalizeStringList(values = []) {
  return Array.isArray(values)
    ? values.map((value) => String(value || '').trim()).filter(Boolean)
    : []
}

export function trackCommandExecutionOutcome(bucket = {}, {
  itemId = '',
  status = '',
  exitCode = Number.NaN,
  phase = '',
} = {}) {
  if (phase !== 'completed' || !itemId) return bucket
  const normalizedStatus = String(status || '').trim().toLowerCase()
  const failed = ['failed', 'error', 'cancelled', 'canceled', 'interrupted'].includes(normalizedStatus)
    || (Number.isFinite(exitCode) && exitCode !== 0)
  bucket.completedItemIds = normalizeStringList(bucket.completedItemIds)
    .filter((candidate) => candidate !== itemId)
  bucket.failedItemIds = normalizeStringList(bucket.failedItemIds)
    .filter((candidate) => candidate !== itemId)
  const target = failed ? bucket.failedItemIds : bucket.completedItemIds
  if (!target.includes(itemId)) target.push(itemId)
  return bucket
}

export function syncAggregatedText(currentValue = '', nextValue = '', emitChunk = null) {
  const current = String(currentValue || '')
  const next = String(nextValue || '')
  if (!next || next === current) return current
  if (next.startsWith(current)) {
    const delta = next.slice(current.length)
    if (delta && typeof emitChunk === 'function') emitChunk(delta)
    return next
  }
  return next
}
