const pooledConnections = new Map()
const MAX_REUSABLE_CONNECTION_AGE_MS = 55 * 60 * 1000

function normalizeKeyPart(value = '') {
  return String(value || '').trim()
}

function buildPoolKey({ apiKey = '', baseUrl = '', threadId = '' } = {}) {
  const normalizedThreadId = normalizeKeyPart(threadId)
  if (!normalizedThreadId) return ''
  return [
    normalizeKeyPart(baseUrl),
    normalizeKeyPart(apiKey),
    normalizedThreadId,
  ].join('::')
}

function createConnectionError(event = null, fallbackMessage = 'OpenAI Responses WebSocket connection failed.') {
  const message = String(event?.error?.message || event?.message || fallbackMessage).trim() || fallbackMessage
  const error = new Error(message)
  error.providerId = 'openai'
  error.code = String(event?.error?.code || event?.code || '').trim().toLowerCase() || undefined
  const status = Number(event?.error?.status || event?.status || 0) || 0
  if (status > 0) error.status = status
  return error
}

function isConnectionReusable(connection = null, { allowBusy = false } = {}) {
  if (!connection || typeof connection !== 'object') return false
  if (connection.closed === true) return false
  if (allowBusy !== true && connection.busy === true) return false
  const ageMs = Date.now() - (Number(connection.createdAt || 0) || 0)
  return ageMs < MAX_REUSABLE_CONNECTION_AGE_MS
}

function createManagedConnection({
  socket = null,
  poolKey = '',
  threadId = '',
} = {}) {
  let settled = false
  let resolveReady = () => {}
  let rejectReady = () => {}
  const readyPromise = new Promise((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })

  const state = {
    socket,
    poolKey,
    threadId: normalizeKeyPart(threadId),
    createdAt: Date.now(),
    busy: false,
    closed: false,
    ready: false,
    pooled: !!poolKey,
    readyPromise,
    markBusy(value) {
      this.busy = value === true
    },
  }

  const handleOpen = () => {
    if (settled) return
    settled = true
    state.ready = true
    resolveReady()
  }

  const handleError = (event) => {
    const error = createConnectionError(event)
    if (!settled) {
      settled = true
      rejectReady(error)
    }
    state.closed = true
    if (state.poolKey) pooledConnections.delete(state.poolKey)
  }

  const handleClose = () => {
    if (!settled) {
      settled = true
      rejectReady(new Error('OpenAI Responses WebSocket closed before the connection opened.'))
    }
    state.closed = true
    if (state.poolKey) pooledConnections.delete(state.poolKey)
  }

  socket?.addEventListener?.('open', handleOpen)
  socket?.addEventListener?.('error', handleError)
  socket?.addEventListener?.('close', handleClose)

  state.dispose = (reason = 'OK') => {
    state.closed = true
    state.busy = false
    if (state.poolKey) pooledConnections.delete(state.poolKey)
    try {
      socket?.removeEventListener?.('open', handleOpen)
      socket?.removeEventListener?.('error', handleError)
      socket?.removeEventListener?.('close', handleClose)
    } catch {
      // Best-effort cleanup only.
    }
    try {
      socket?.close?.(1000, String(reason || 'OK'))
    } catch {
      // Best-effort cleanup only.
    }
  }

  return state
}

export function __resetOpenAIResponsesWebSocketConnectionPoolForTests() {
  for (const connection of pooledConnections.values()) {
    try {
      connection?.dispose?.('Reset')
    } catch {
      // Best-effort cleanup only.
    }
  }
  pooledConnections.clear()
}

export function acquireOpenAIResponsesWebSocketConnection({
  apiKey = '',
  baseUrl = '',
  threadId = '',
  createSocket = () => null,
} = {}) {
  const poolKey = buildPoolKey({ apiKey, baseUrl, threadId })
  const pooledConnection = poolKey ? pooledConnections.get(poolKey) : null
  if (pooledConnection && isConnectionReusable(pooledConnection)) {
    pooledConnection.markBusy(true)
    return {
      socket: pooledConnection.socket,
      pooled: true,
      ready: pooledConnection.ready === true,
      readyPromise: pooledConnection.readyPromise,
      reused: true,
      reuseMode: 'thread_socket_reused',
      connectionCreatedAt: pooledConnection.createdAt,
      release({ keepAlive = true } = {}) {
        if (keepAlive && isConnectionReusable(pooledConnection, { allowBusy: true })) {
          pooledConnection.markBusy(false)
          return
        }
        pooledConnection.dispose(keepAlive ? 'Closed' : 'Disposed')
      },
    }
  }

  const pooledConnectionBusy = !!(
    pooledConnection
    && pooledConnection.closed !== true
    && pooledConnection.busy === true
  )
  if (pooledConnection && pooledConnectionBusy !== true) {
    pooledConnection.dispose('AgedOut')
  }

  const socket = createSocket()
  const connection = createManagedConnection({
    socket,
    poolKey: pooledConnectionBusy ? '' : poolKey,
    threadId,
  })
  connection.markBusy(true)
  if (poolKey && !pooledConnectionBusy) {
    pooledConnections.set(poolKey, connection)
  }

  return {
    socket: connection.socket,
    pooled: connection.pooled,
    ready: connection.ready === true,
    reused: false,
    reuseMode: connection.pooled ? 'thread_socket_fresh' : 'unpooled_socket',
    connectionCreatedAt: connection.createdAt,
    readyPromise: connection.readyPromise.catch((error) => {
      connection.dispose('ConnectionError')
      throw error
    }),
    release({ keepAlive = true } = {}) {
      if (keepAlive && connection.pooled && isConnectionReusable(connection, { allowBusy: true })) {
        connection.markBusy(false)
        return
      }
      connection.dispose(keepAlive ? 'Closed' : 'Disposed')
    },
  }
}
