import {
  applyCompactionLifecycle,
  normalizeCompactionLifecycle,
} from './compaction-lifecycle.mjs'

function normalizeId(value = '') {
  return String(value || '').trim()
}

function humanizeId(value = '') {
  const normalized = normalizeId(value)
  if (!normalized) return ''
  return normalized.replace(/[_-]+/g, ' ')
}

function normalizeBooleanOrNull(value) {
  if (value === true) return true
  if (value === false) return false
  return null
}

function normalizeModeList(values = []) {
  const source = Array.isArray(values)
    ? values
    : [values]
  const normalized = []
  const seen = new Set()
  for (const value of source) {
    const mode = normalizeId(value)
    if (!mode) continue
    const key = mode.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(mode)
  }
  return normalized
}

export function normalizeCompactionDiagnostics(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const event = source.compactionEvent && typeof source.compactionEvent === 'object'
    ? source.compactionEvent
    : {}
  const lifecycle = normalizeCompactionLifecycle(source)
  return {
    selectedCompactionMode: normalizeId(
      source.selectedCompactionMode
      || source.compactionStrategy
      || source.compactionMode,
    ),
    candidateCompactionModes: normalizeModeList(source.candidateCompactionModes),
    compactionFailureReason: normalizeId(
      source.compactionFailureReason
      || source.failureReason,
    ),
    fallbackCompactionMode: normalizeId(source.fallbackCompactionMode),
    fallbackReason: normalizeId(source.fallbackReason),
    compactionEventType: normalizeId(
      source.compactionEventType
      || source.eventType
      || event.type,
    ),
    compactionEventPhase: normalizeId(
      source.compactionEventPhase
      || source.eventPhase
      || event.phase,
    ),
    compactionEventOccurred: normalizeBooleanOrNull(
      source.compactionEventOccurred ?? source.eventOccurred ?? event.occurred,
    ),
    canonicalHandoffUsed: normalizeBooleanOrNull(
      source.canonicalHandoffUsed ?? source.compactionHandoffUsed,
    ),
    carryForwardSource: normalizeId(
      source.carryForwardSource
      || source.compactionCarryForwardSource,
    ),
    strategy: lifecycle.strategy,
    scope: lifecycle.scope,
    source: lifecycle.source,
    usageRefreshState: lifecycle.usageRefreshState,
  }
}

export function applyCompactionDiagnostics(target = {}, payload = {}) {
  const base = target && typeof target === 'object' ? target : {}
  const normalized = normalizeCompactionDiagnostics(payload)
  return applyCompactionLifecycle({
    ...base,
    ...(normalized.selectedCompactionMode
      ? { selectedCompactionMode: normalized.selectedCompactionMode }
      : {}),
    ...(normalized.candidateCompactionModes.length > 0
      ? { candidateCompactionModes: normalized.candidateCompactionModes }
      : {}),
    ...(normalized.compactionFailureReason
      ? { compactionFailureReason: normalized.compactionFailureReason }
      : {}),
    ...(normalized.fallbackCompactionMode
      ? { fallbackCompactionMode: normalized.fallbackCompactionMode }
      : {}),
    ...(normalized.fallbackReason
      ? { fallbackReason: normalized.fallbackReason }
      : {}),
    ...(normalized.compactionEventType
      ? { compactionEventType: normalized.compactionEventType }
      : {}),
    ...(normalized.compactionEventPhase
      ? { compactionEventPhase: normalized.compactionEventPhase }
      : {}),
    ...(normalized.compactionEventOccurred === null
      ? {}
      : { compactionEventOccurred: normalized.compactionEventOccurred }),
    ...(normalized.canonicalHandoffUsed === null
      ? {}
      : { canonicalHandoffUsed: normalized.canonicalHandoffUsed }),
    ...(normalized.carryForwardSource
      ? { carryForwardSource: normalized.carryForwardSource }
      : {}),
  }, normalized)
}

export function buildCompactionDiagnosticLines(payload = {}) {
  const normalized = normalizeCompactionDiagnostics(payload)
  return [
    normalized.strategy
      ? `strategy: ${normalized.strategy}`
      : '',
    normalized.scope
      ? `scope: ${normalized.scope}`
      : '',
    normalized.source
      ? `source: ${normalized.source}`
      : '',
    normalized.usageRefreshState
      ? `usage_refresh_state: ${normalized.usageRefreshState}`
      : '',
    normalized.selectedCompactionMode
      ? `selected_compaction_mode: ${normalized.selectedCompactionMode}`
      : '',
    normalized.candidateCompactionModes.length > 0
      ? `candidate_compaction_modes: ${normalized.candidateCompactionModes.join(', ')}`
      : '',
    normalized.compactionFailureReason
      ? `compaction_failure_reason: ${normalized.compactionFailureReason}`
      : '',
    normalized.fallbackCompactionMode
      ? `fallback_compaction_mode: ${normalized.fallbackCompactionMode}`
      : '',
    normalized.fallbackReason
      ? `fallback_reason: ${normalized.fallbackReason}`
      : '',
    normalized.compactionEventType
      ? `compaction_event_type: ${normalized.compactionEventType}`
      : '',
    normalized.compactionEventPhase
      ? `compaction_event_phase: ${normalized.compactionEventPhase}`
      : '',
    normalized.compactionEventOccurred === null
      ? ''
      : `compaction_event_occurred: ${normalized.compactionEventOccurred ? 'true' : 'false'}`,
    normalized.canonicalHandoffUsed === null
      ? ''
      : `canonical_handoff_used: ${normalized.canonicalHandoffUsed ? 'true' : 'false'}`,
    normalized.carryForwardSource
      ? `carry_forward_source: ${normalized.carryForwardSource}`
      : '',
  ].filter(Boolean)
}

function formatCarryForwardSourceLabel(source = '') {
  const normalized = normalizeId(source).toLowerCase()
  if (!normalized) return ''
  if (normalized === 'continuity_packet_only') return 'continuity packet only'
  if (normalized === 'compaction_handoff_only') return 'compaction handoff only'
  if (normalized === 'both') return 'continuity packet + compaction handoff'
  return humanizeId(normalized)
}

function formatCompactionBoundaryLabel({
  compactionEventPhase = '',
  compactionEventType = '',
  compactionEventOccurred = null,
} = {}) {
  const phase = normalizeId(compactionEventPhase).toLowerCase()
  const typeLabel = humanizeId(compactionEventType).toLowerCase()
  const typeSuffix = typeLabel ? ` (${typeLabel})` : ''
  if (phase === 'resumed_after') return `boundary: resumed after compaction${typeSuffix}`
  if (phase === 'applied') return `boundary: compaction applied${typeSuffix}`
  if (phase === 'imminent') return `boundary: compaction imminent${typeSuffix}`
  if (compactionEventOccurred === true) return `boundary: compaction occurred${typeSuffix}`
  if (compactionEventOccurred === false) return `boundary: compaction not applied${typeSuffix}`
  return ''
}

export function buildCompactionUserFacingLines(payload = {}) {
  const normalized = normalizeCompactionDiagnostics(payload)
  const carryForwardSourceLabel = formatCarryForwardSourceLabel(normalized.carryForwardSource)
  return [
    normalized.selectedCompactionMode
      ? `compaction mode: ${humanizeId(normalized.selectedCompactionMode).toLowerCase()}`
      : '',
    formatCompactionBoundaryLabel({
      compactionEventType: normalized.compactionEventType,
      compactionEventPhase: normalized.compactionEventPhase,
      compactionEventOccurred: normalized.compactionEventOccurred,
    }),
    normalized.compactionFailureReason
      ? `compaction failure: ${humanizeId(normalized.compactionFailureReason).toLowerCase()}`
      : '',
    normalized.fallbackCompactionMode
      ? `fallback mode: ${humanizeId(normalized.fallbackCompactionMode).toLowerCase()}`
      : '',
    carryForwardSourceLabel
      ? `carry-forward source: ${carryForwardSourceLabel}`
      : '',
    normalized.canonicalHandoffUsed === null
      ? ''
      : `canonical handoff: ${normalized.canonicalHandoffUsed ? 'used' : 'not used'}`,
  ].filter(Boolean)
}
