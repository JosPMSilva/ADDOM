export function createAgentStreamEventRouter(onEvent) {
  let chain = Promise.resolve()
  return Object.freeze({
    route(event) {
      if (typeof onEvent !== 'function') return chain
      chain = chain.then(() => onEvent(event))
      // Provider callbacks are fire-and-forget, but the authoritative chain remains
      // rejected so the owning agent run fails closed when it drains persistence.
      void chain.catch(() => {})
      return chain
    },
    drain() {
      return chain
    },
  })
}

import { normalizeProviderTextChunk } from '../../common/chat/canonical-turn-engine.mjs'

export function createManagedDeltaCoalescer(emit) {
  let pendingWhitespace = ''
  return (value = '', metadata = {}) => {
    const normalized = normalizeProviderTextChunk(value)
    const delta = normalized.chunk
    if (!delta) return
    if (!delta.trim()) {
      pendingWhitespace += delta
      return
    }
    const coalesced = `${pendingWhitespace}${delta}`
    pendingWhitespace = ''
    emit(coalesced, {
      ...metadata,
      ...(normalized.boundaryBefore === true ? { boundaryBefore: true } : {}),
    })
  }
}
