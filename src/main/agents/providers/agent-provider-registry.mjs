function requireAdapterId(adapter) {
  if (typeof adapter?.adapterId !== 'string' || !adapter.adapterId.trim()) {
    throw new TypeError('adapter.adapterId is required')
  }
  for (const operation of ['create', 'start', 'resume', 'message', 'interrupt', 'cancel', 'dispose']) {
    if (typeof adapter[operation] !== 'function') {
      throw new TypeError(`adapter.${operation} must be a function`)
    }
  }
  return adapter.adapterId.trim()
}

export function createAgentProviderRegistry() {
  const adapters = new Map()

  function register(adapter) {
    const adapterId = requireAdapterId(adapter)
    if (adapters.has(adapterId)) {
      throw new TypeError(`Agent provider adapter ${adapterId} is already registered`)
    }
    adapters.set(adapterId, adapter)
    return adapter
  }

  function resolve(adapterId) {
    const adapter = adapters.get(String(adapterId || '').trim())
    if (!adapter) throw new TypeError(`Agent provider adapter ${adapterId} is not registered`)
    return adapter
  }

  function unregister(adapterId) {
    const key = String(adapterId || '').trim()
    const adapter = adapters.get(key) || null
    adapters.delete(key)
    return adapter
  }

  function list() {
    return [...adapters.values()]
  }

  return Object.freeze({ list, register, resolve, unregister })
}
