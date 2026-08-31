const DEFAULT_MAX_RECENT_EVENTS = 20
const DEFAULT_MAX_PROVIDER_BREAKDOWN_KEYS = 16

function safeObject(input) {
  return input && typeof input === 'object' ? input : {}
}

function createEmptyCounters() {
  return {
    requestCount: 0,
    successCount: 0,
    emptyCount: 0,
    errorCount: 0,
    acceptCount: 0,
    dismissCount: 0,
  }
}

function createEmptyBreakdowns() {
  return {
    providerRequests: {},
    providerSuccesses: {},
    providerErrors: {},
    eventKinds: {},
  }
}

function createProviderBreakdownTouchState() {
  return {
    providerRequests: {},
    providerSuccesses: {},
    providerErrors: {},
  }
}

function normalizePositiveInteger(value, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.floor(n)))
}

function normalizeMapKey(value) {
  return String(value || '').trim().toLowerCase()
}

function pruneProviderBreakdownMap(state, mapName) {
  const map = safeObject(state?.breakdowns?.[mapName])
  const touchState = safeObject(state?.providerBreakdownTouchState?.[mapName])
  const maxKeys = normalizePositiveInteger(
    state?.maxProviderBreakdownKeys,
    DEFAULT_MAX_PROVIDER_BREAKDOWN_KEYS,
    1,
    256,
  )
  const keys = Object.keys(map)
  if (keys.length <= maxKeys) return
  const evictCount = keys.length - maxKeys
  const evictionOrder = keys
    .map((key) => ({
      key,
      touchedAt: Number(touchState[key] || 0) || 0,
    }))
    .sort((a, b) => {
      if (a.touchedAt !== b.touchedAt) return a.touchedAt - b.touchedAt
      return a.key.localeCompare(b.key)
    })
  for (let i = 0; i < evictCount; i += 1) {
    const evictKey = evictionOrder[i]?.key
    if (!evictKey) continue
    delete map[evictKey]
    delete touchState[evictKey]
  }
  state.providerBreakdownCapped = true
}

export function createInlineCompletionTelemetryState({
  maxRecentEvents = DEFAULT_MAX_RECENT_EVENTS,
  maxProviderBreakdownKeys = DEFAULT_MAX_PROVIDER_BREAKDOWN_KEYS,
} = {}) {
  return {
    counters: createEmptyCounters(),
    breakdowns: createEmptyBreakdowns(),
    recentEvents: [],
    maxRecentEvents: normalizePositiveInteger(maxRecentEvents, DEFAULT_MAX_RECENT_EVENTS, 1, 1_000),
    maxProviderBreakdownKeys: normalizePositiveInteger(
      maxProviderBreakdownKeys,
      DEFAULT_MAX_PROVIDER_BREAKDOWN_KEYS,
      1,
      256,
    ),
    providerBreakdownTouchState: createProviderBreakdownTouchState(),
    providerBreakdownTouchSequence: 0,
    providerBreakdownCapped: false,
  }
}

function bump(map, key, by = 1) {
  const k = normalizeMapKey(key)
  if (!k) return
  map[k] = (Number(map[k] || 0) || 0) + by
}

function bumpProviderBreakdown(state, mapName, key, by = 1) {
  const k = normalizeMapKey(key)
  if (!k) return
  const map = safeObject(state?.breakdowns?.[mapName])
  const touchState = safeObject(state?.providerBreakdownTouchState?.[mapName])
  map[k] = (Number(map[k] || 0) || 0) + by
  state.providerBreakdownTouchSequence = (Number(state.providerBreakdownTouchSequence || 0) || 0) + 1
  touchState[k] = state.providerBreakdownTouchSequence
  pruneProviderBreakdownMap(state, mapName)
}

function pushEvent(state, event = {}) {
  if (!Array.isArray(state?.recentEvents)) return
  const row = {
    at: Number(event.at || Date.now()) || Date.now(),
    type: String(event.type || 'event').trim().toLowerCase() || 'event',
    ...(event.payload && typeof event.payload === 'object' ? { payload: event.payload } : {}),
  }
  state.recentEvents.push(row)
  const max = Number(state.maxRecentEvents || DEFAULT_MAX_RECENT_EVENTS) || DEFAULT_MAX_RECENT_EVENTS
  if (state.recentEvents.length > max) {
    state.recentEvents.splice(0, state.recentEvents.length - max)
  }
}

export function recordInlineCompletionTelemetryEvent(state, eventType, payload = {}) {
  const st = safeObject(state)
  if (!st.counters || !st.breakdowns) return null
  const type = String(eventType || '').trim().toLowerCase()
  if (!type) return null
  const providerId = String(payload?.providerId || '').trim().toLowerCase()

  bump(st.breakdowns.eventKinds, type)

  if (type === 'request') {
    st.counters.requestCount += 1
    bumpProviderBreakdown(st, 'providerRequests', providerId || 'unknown')
  } else if (type === 'success') {
    st.counters.successCount += 1
    bumpProviderBreakdown(st, 'providerSuccesses', providerId || 'unknown')
  } else if (type === 'empty') {
    st.counters.emptyCount += 1
  } else if (type === 'error') {
    st.counters.errorCount += 1
    bumpProviderBreakdown(st, 'providerErrors', providerId || 'unknown')
  } else if (type === 'accept') {
    st.counters.acceptCount += 1
  } else if (type === 'dismiss') {
    st.counters.dismissCount += 1
  }

  pushEvent(st, {
    type,
    payload: {
      providerId: providerId || undefined,
      model: String(payload?.model || '').trim() || undefined,
      filePath: String(payload?.filePath || '').trim().slice(0, 300) || undefined,
      chars: Math.max(0, Number(payload?.chars || 0) || 0) || undefined,
      reason: String(payload?.reason || '').trim().slice(0, 120) || undefined,
    },
  })

  return { type }
}

export function clearInlineCompletionTelemetry(state) {
  const st = safeObject(state)
  st.counters = createEmptyCounters()
  st.breakdowns = createEmptyBreakdowns()
  st.recentEvents = []
  st.maxRecentEvents = normalizePositiveInteger(st.maxRecentEvents, DEFAULT_MAX_RECENT_EVENTS, 1, 1_000)
  st.maxProviderBreakdownKeys = normalizePositiveInteger(
    st.maxProviderBreakdownKeys,
    DEFAULT_MAX_PROVIDER_BREAKDOWN_KEYS,
    1,
    256,
  )
  st.providerBreakdownTouchState = createProviderBreakdownTouchState()
  st.providerBreakdownTouchSequence = 0
  st.providerBreakdownCapped = false
  return st
}

export function getInlineCompletionTelemetrySnapshot(state) {
  const st = safeObject(state)
  return {
    counters: { ...createEmptyCounters(), ...safeObject(st.counters) },
    breakdowns: {
      providerRequests: { ...safeObject(st.breakdowns?.providerRequests) },
      providerSuccesses: { ...safeObject(st.breakdowns?.providerSuccesses) },
      providerErrors: { ...safeObject(st.breakdowns?.providerErrors) },
      eventKinds: { ...safeObject(st.breakdowns?.eventKinds) },
    },
    recentEvents: Array.isArray(st.recentEvents)
      ? st.recentEvents.map((row) => ({
        at: Number(row?.at || 0) || 0,
        type: String(row?.type || ''),
        ...(row?.payload && typeof row.payload === 'object' ? { payload: { ...row.payload } } : {}),
      }))
      : [],
    maxRecentEvents: Number(st.maxRecentEvents || DEFAULT_MAX_RECENT_EVENTS) || DEFAULT_MAX_RECENT_EVENTS,
    limits: {
      maxProviderBreakdownKeys: normalizePositiveInteger(
        st.maxProviderBreakdownKeys,
        DEFAULT_MAX_PROVIDER_BREAKDOWN_KEYS,
        1,
        256,
      ),
      providerBreakdownCapped: st.providerBreakdownCapped === true,
    },
  }
}

const GLOBAL_INLINE_COMPLETION_TELEMETRY = createInlineCompletionTelemetryState()

export function recordGlobalInlineCompletionTelemetryEvent(eventType, payload = {}) {
  return recordInlineCompletionTelemetryEvent(GLOBAL_INLINE_COMPLETION_TELEMETRY, eventType, payload)
}

export function getGlobalInlineCompletionTelemetrySnapshot() {
  return getInlineCompletionTelemetrySnapshot(GLOBAL_INLINE_COMPLETION_TELEMETRY)
}

export function clearGlobalInlineCompletionTelemetry() {
  clearInlineCompletionTelemetry(GLOBAL_INLINE_COMPLETION_TELEMETRY)
  return getGlobalInlineCompletionTelemetrySnapshot()
}
