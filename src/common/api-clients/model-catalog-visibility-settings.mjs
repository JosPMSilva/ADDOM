export const DEFAULT_OPENROUTER_MODEL_CATALOG_VISIBILITY = Object.freeze({
  defaultVisible: true,
  namespaceVisibility: {},
  modelOverrides: {},
  filters: {
    reviewedOnly: false,
    toolsOnly: false,
    reasoningOnly: false,
    visionOnly: false,
  },
})

export const DEFAULT_MODEL_CATALOG_VISIBILITY = Object.freeze({
  openrouter: DEFAULT_OPENROUTER_MODEL_CATALOG_VISIBILITY,
})

export function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

export function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value
  return fallback
}

export function normalizeRouteId(value = '') {
  return String(value || '').trim()
}

export function normalizeLowerRouteId(value = '') {
  return normalizeRouteId(value).toLowerCase()
}

export function normalizeNamespace(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeBooleanRecord(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const normalized = {}
  for (const [key, value] of Object.entries(raw)) {
    const normalizedKey = String(key || '').trim()
    if (!normalizedKey) continue
    normalized[normalizedKey] = value === true
  }
  return normalized
}

export function areBooleanRecordsEqual(left = {}, right = {}) {
  const leftEntries = Object.entries(left)
  const rightEntries = Object.entries(right)
  if (leftEntries.length !== rightEntries.length) return false
  for (const [key, value] of leftEntries) {
    if (right[key] !== value) return false
  }
  return true
}

export function normalizeOpenRouterModelCatalogVisibility(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const defaultVisible = normalizeBoolean(source.defaultVisible, true)
  const namespaceVisibility = normalizeBooleanRecord(source.namespaceVisibility)
  for (const [namespace, enabled] of Object.entries(namespaceVisibility)) {
    if (enabled === defaultVisible) delete namespaceVisibility[namespace]
  }
  return {
    defaultVisible,
    namespaceVisibility,
    modelOverrides: normalizeBooleanRecord(source.modelOverrides),
    filters: {
      reviewedOnly: normalizeBoolean(source.filters?.reviewedOnly, false),
      toolsOnly: normalizeBoolean(source.filters?.toolsOnly, false),
      reasoningOnly: normalizeBoolean(source.filters?.reasoningOnly, false),
      visionOnly: normalizeBoolean(source.filters?.visionOnly, false),
    },
  }
}

export function normalizeModelCatalogVisibility(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    openrouter: normalizeOpenRouterModelCatalogVisibility(source.openrouter),
  }
}

export function areOpenRouterModelCatalogVisibilityEqual(left = null, right = null) {
  const normalizedLeft = normalizeOpenRouterModelCatalogVisibility(left)
  const normalizedRight = normalizeOpenRouterModelCatalogVisibility(right)
  return (
    normalizedLeft.defaultVisible === normalizedRight.defaultVisible
    && areBooleanRecordsEqual(normalizedLeft.namespaceVisibility, normalizedRight.namespaceVisibility)
    && areBooleanRecordsEqual(normalizedLeft.modelOverrides, normalizedRight.modelOverrides)
    && normalizedLeft.filters.reviewedOnly === normalizedRight.filters.reviewedOnly
    && normalizedLeft.filters.toolsOnly === normalizedRight.filters.toolsOnly
    && normalizedLeft.filters.reasoningOnly === normalizedRight.filters.reasoningOnly
    && normalizedLeft.filters.visionOnly === normalizedRight.filters.visionOnly
  )
}

export function areModelCatalogVisibilityEqual(left = null, right = null) {
  const normalizedLeft = normalizeModelCatalogVisibility(left)
  const normalizedRight = normalizeModelCatalogVisibility(right)
  return areOpenRouterModelCatalogVisibilityEqual(
    normalizedLeft.openrouter,
    normalizedRight.openrouter,
  )
}
