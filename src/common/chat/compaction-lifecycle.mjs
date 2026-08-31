function normalizeId(value = '') {
  return String(value || '').trim()
}

function normalizeTokenCountOrNull(value = null) {
  if (value == null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.max(0, Math.round(n))
}

const COMPACTION_SCOPE_SET = new Set(['thread_reset', 'partial_reduce'])
const COMPACTION_SOURCE_SET = new Set(['provider', 'local'])
const COMPACTION_USAGE_REFRESH_STATE_SET = new Set(['verified', 'estimated', 'recalculating', 'none'])

const COMPACTION_STRATEGY_METADATA = Object.freeze({
  codex_thread_compaction: Object.freeze({ scope: 'thread_reset', source: 'provider' }),
  provider_chain_compaction: Object.freeze({ scope: 'partial_reduce', source: 'provider' }),
  provider_truncation: Object.freeze({ scope: 'partial_reduce', source: 'provider' }),
  anthropic_context_management: Object.freeze({ scope: 'partial_reduce', source: 'provider' }),
  local_summary: Object.freeze({ scope: 'partial_reduce', source: 'local' }),
  continuity_packet: Object.freeze({ scope: 'partial_reduce', source: 'local' }),
})

function resolveCompactionStatus(payload = {}, event = {}) {
  const explicitStatus = normalizeId(
    payload.status
    || payload.compactionStatus
    || event.status,
  ).toLowerCase()
  if (explicitStatus) return explicitStatus

  const phase = normalizeId(
    payload.compactionEventPhase
    || payload.eventPhase
    || event.phase,
  ).toLowerCase()
  if (phase === 'applied' || phase === 'resumed_after') return 'applied'
  if (phase === 'running') return 'running'
  if (phase === 'requested' || phase === 'imminent') return 'requested'
  if (phase === 'failed') return 'failed'
  return ''
}

export function normalizeCompactionStrategy(value = '', fallback = '') {
  const normalizedFallback = normalizeId(fallback).toLowerCase()
  const normalizedValue = normalizeId(value).toLowerCase()
  if (normalizedValue && Object.prototype.hasOwnProperty.call(COMPACTION_STRATEGY_METADATA, normalizedValue)) {
    return normalizedValue
  }
  return (
    normalizedFallback && Object.prototype.hasOwnProperty.call(COMPACTION_STRATEGY_METADATA, normalizedFallback)
      ? normalizedFallback
      : ''
  )
}

export function resolveCompactionScope(strategy = '', explicitScope = '') {
  const normalizedScope = normalizeId(explicitScope).toLowerCase()
  if (COMPACTION_SCOPE_SET.has(normalizedScope)) return normalizedScope
  const normalizedStrategy = normalizeCompactionStrategy(strategy)
  return COMPACTION_STRATEGY_METADATA[normalizedStrategy]?.scope || ''
}

export function resolveCompactionSource({
  strategy = '',
  explicitSource = '',
} = {}) {
  const normalizedSource = normalizeId(explicitSource).toLowerCase()
  if (COMPACTION_SOURCE_SET.has(normalizedSource)) return normalizedSource
  const normalizedStrategy = normalizeCompactionStrategy(strategy)
  return COMPACTION_STRATEGY_METADATA[normalizedStrategy]?.source || ''
}

export function resolveCompactionUsageRefreshState({
  usageRefreshState = '',
  status = '',
  scope = '',
  remainingContextTokens = null,
  threadOccupancyTokens = null,
  effectiveOccupancyTokens = null,
  estimatedAfterTokens = null,
} = {}) {
  const normalizedState = normalizeId(usageRefreshState).toLowerCase()
  if (COMPACTION_USAGE_REFRESH_STATE_SET.has(normalizedState)) return normalizedState

  const normalizedStatus = normalizeId(status).toLowerCase()
  if (normalizedStatus !== 'applied') return 'none'

  if (
    normalizeTokenCountOrNull(remainingContextTokens) !== null
    || normalizeTokenCountOrNull(threadOccupancyTokens) !== null
    || normalizeTokenCountOrNull(effectiveOccupancyTokens) !== null
  ) {
    return 'verified'
  }

  if (normalizeTokenCountOrNull(estimatedAfterTokens) !== null) {
    return 'estimated'
  }

  return resolveCompactionScope('', scope) === 'thread_reset'
    ? 'recalculating'
    : 'none'
}

export function normalizeCompactionLifecycle(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const event = source.compactionEvent && typeof source.compactionEvent === 'object'
    ? source.compactionEvent
    : {}
  const strategy = normalizeCompactionStrategy(
    source.strategy
    || source.compactionStrategy
    || source.selectedCompactionMode
    || source.compactionMode
    || source.compactionEventType
    || source.eventType
    || event.type,
  )
  const scope = resolveCompactionScope(
    strategy,
    source.scope
    || source.compactionScope
    || source.lifecycleScope
    || event.scope,
  )
  const lifecycleSource = resolveCompactionSource({
    strategy,
    explicitSource: (
      source.compactionSource
      || source.lifecycleSource
      || source.compactionEventSource
      || event.source
    ),
  })
  const usageRefreshState = resolveCompactionUsageRefreshState({
    usageRefreshState: (
      source.usageRefreshState
      || source.compactionUsageRefreshState
      || event.usageRefreshState
    ),
    status: resolveCompactionStatus(source, event),
    scope,
    remainingContextTokens: (
      source.remainingContextTokens
      ?? source.contextRemainingTokens
      ?? event.remainingContextTokens
    ),
    threadOccupancyTokens: (
      source.threadOccupancyTokens
      ?? source.contextOccupancyTokens
      ?? event.threadOccupancyTokens
    ),
    effectiveOccupancyTokens: source.effectiveOccupancyTokens ?? event.effectiveOccupancyTokens,
    estimatedAfterTokens: source.estimatedAfterTokens ?? event.estimatedAfterTokens,
  })

  return {
    strategy,
    scope,
    source: lifecycleSource,
    usageRefreshState,
  }
}

export function applyCompactionLifecycle(target = {}, payload = {}) {
  const base = target && typeof target === 'object' ? target : {}
  const normalized = normalizeCompactionLifecycle(payload)
  return {
    ...base,
    ...(normalized.strategy ? { strategy: normalized.strategy } : {}),
    ...(normalized.scope ? { scope: normalized.scope } : {}),
    ...(normalized.source ? { source: normalized.source } : {}),
    ...(normalized.usageRefreshState ? { usageRefreshState: normalized.usageRefreshState } : {}),
  }
}
