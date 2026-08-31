export function createAgentEventBatcher({
  applyBatch,
  schedule = queueMicrotask,
} = {}) {
  if (typeof applyBatch !== 'function') throw new TypeError('applyBatch is required')
  let queued = []
  let scheduled = false

  function flush() {
    scheduled = false
    const batch = queued
    queued = []
    if (batch.length > 0) applyBatch(batch)
  }

  function push(event) {
    queued.push(event)
    if (scheduled) return
    scheduled = true
    schedule(flush)
  }

  return Object.freeze({ flush, push })
}
