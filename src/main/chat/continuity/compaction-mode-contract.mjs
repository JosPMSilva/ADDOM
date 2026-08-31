export const COMPACTION_MODES = Object.freeze({
  NONE: 'none',
  LOCAL_SUMMARY: 'local_summary',
  CODEX_THREAD_COMPACTION: 'codex_thread_compaction',
  PROVIDER_CHAIN_COMPACTION: 'provider_chain_compaction',
  PROVIDER_TRUNCATION: 'provider_truncation',
})

const COMPACTION_MODE_SET = new Set(Object.values(COMPACTION_MODES))

function normalizeValue(value = '') {
  return String(value || '').trim().toLowerCase()
}

export function isCompactionMode(value = '') {
  return COMPACTION_MODE_SET.has(normalizeValue(value))
}

export function normalizeCompactionMode(value = '', fallback = COMPACTION_MODES.NONE) {
  const normalizedFallback = isCompactionMode(fallback)
    ? normalizeValue(fallback)
    : COMPACTION_MODES.NONE
  const normalizedValue = normalizeValue(value)
  return COMPACTION_MODE_SET.has(normalizedValue) ? normalizedValue : normalizedFallback
}

export function normalizeCompactionModeList(value = [], { fallback = [] } = {}) {
  const source = Array.isArray(value) ? value : fallback
  const out = []
  const seen = new Set()
  for (const rawEntry of source) {
    const entry = normalizeValue(rawEntry)
    if (!COMPACTION_MODE_SET.has(entry) || seen.has(entry)) continue
    seen.add(entry)
    out.push(entry)
  }
  return out
}

export function isProviderNativeCompactionMode(value = '') {
  const normalized = normalizeCompactionMode(value, COMPACTION_MODES.NONE)
  return (
    normalized === COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION
    || normalized === COMPACTION_MODES.PROVIDER_TRUNCATION
  )
}

export function resolvePreferredCompactionMode({
  supportsProviderChainCompaction = false,
  supportsProviderTruncation = false,
} = {}) {
  if (supportsProviderChainCompaction === true) {
    return COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION
  }
  if (supportsProviderTruncation === true) {
    return COMPACTION_MODES.PROVIDER_TRUNCATION
  }
  return COMPACTION_MODES.NONE
}
