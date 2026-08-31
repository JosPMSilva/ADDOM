import { normalizeOpenRouterLiveModelRow } from '../../src/common/api-clients/openrouter-live-models.mjs'

function trimString(value = '') {
  return String(value || '').trim()
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeStringList(values = []) {
  const seen = new Set()
  const out = []
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = trimString(value)
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(normalized)
  }
  return out.sort((left, right) => left.localeCompare(right))
}

function normalizeRowList(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => normalizeOpenRouterLiveModelRow(row))
    .filter(Boolean)
    .sort((left, right) => String(left.id || '').localeCompare(String(right.id || '')))
}

function summarizeRawFieldInventory(rows = []) {
  const topLevelKeys = new Set()
  const architectureKeys = new Set()
  const pricingKeys = new Set()
  const supportedParameters = new Set()

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    for (const key of Object.keys(row)) {
      const normalized = trimString(key)
      if (normalized) topLevelKeys.add(normalized)
    }
    const architecture = row.architecture && typeof row.architecture === 'object' && !Array.isArray(row.architecture)
      ? row.architecture
      : {}
    for (const key of Object.keys(architecture)) {
      const normalized = trimString(key)
      if (normalized) architectureKeys.add(normalized)
    }
    const pricing = row.pricing && typeof row.pricing === 'object' && !Array.isArray(row.pricing)
      ? row.pricing
      : {}
    for (const key of Object.keys(pricing)) {
      const normalized = trimString(key)
      if (normalized) pricingKeys.add(normalized)
    }
    for (const parameter of Array.isArray(row.supported_parameters) ? row.supported_parameters : []) {
      const normalized = trimString(parameter)
      if (normalized) supportedParameters.add(normalized)
    }
  }

  return {
    topLevelKeys: [...topLevelKeys].sort((left, right) => left.localeCompare(right)),
    architectureKeys: [...architectureKeys].sort((left, right) => left.localeCompare(right)),
    pricingKeys: [...pricingKeys].sort((left, right) => left.localeCompare(right)),
    supportedParameters: [...supportedParameters].sort((left, right) => left.localeCompare(right)),
  }
}

function diffStringLists(before = [], after = []) {
  const beforeList = normalizeStringList(before)
  const afterList = normalizeStringList(after)
  return {
    added: afterList.filter((value) => !beforeList.includes(value)),
    removed: beforeList.filter((value) => !afterList.includes(value)),
  }
}

function diffFlatObject(before = null, after = null) {
  const previous = before && typeof before === 'object' && !Array.isArray(before) ? before : {}
  const current = after && typeof after === 'object' && !Array.isArray(after) ? after : {}
  const keys = [...new Set([...Object.keys(previous), ...Object.keys(current)])]
    .map((key) => trimString(key))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
  const changed = []
  for (const key of keys) {
    const beforeValue = previous[key] ?? null
    const afterValue = current[key] ?? null
    if (beforeValue === afterValue) continue
    changed.push({
      key,
      before: beforeValue,
      after: afterValue,
    })
  }
  return changed
}

export function buildOpenRouterModelsSnapshot(payload = {}, { generatedAt = '1970-01-01T00:00:00.000Z' } = {}) {
  const rows = Array.isArray(payload?.data) ? payload.data : []
  return {
    generatedAt,
    sourceRowCount: rows.length,
    normalizedRouteCount: normalizeRowList(rows).length,
    rawFieldInventory: summarizeRawFieldInventory(rows),
    models: normalizeRowList(rows),
  }
}

export function buildOpenRouterModelsReviewReport(currentSnapshot = {}, previousSnapshot = {}, {
  generatedAt = '1970-01-01T00:00:00.000Z',
} = {}) {
  const currentModels = Array.isArray(currentSnapshot?.models) ? currentSnapshot.models : []
  const previousModels = Array.isArray(previousSnapshot?.models) ? previousSnapshot.models : []
  const currentById = new Map(currentModels.map((row) => [String(row?.id || '').trim().toLowerCase(), row]))
  const previousById = new Map(previousModels.map((row) => [String(row?.id || '').trim().toLowerCase(), row]))

  const addedRoutes = currentModels
    .map((row) => trimString(row?.id))
    .filter((id) => id && !previousById.has(id.toLowerCase()))
  const removedRoutes = previousModels
    .map((row) => trimString(row?.id))
    .filter((id) => id && !currentById.has(id.toLowerCase()))

  const sharedRouteIds = [...currentById.keys()]
    .filter((key) => previousById.has(key))
    .sort((left, right) => left.localeCompare(right))

  const supportedParameterChanges = []
  const contextLengthChanges = []
  const pricingChanges = []
  for (const routeId of sharedRouteIds) {
    const before = previousById.get(routeId)
    const after = currentById.get(routeId)
    const supportedParameterDiff = diffStringLists(
      before?.openrouterLive?.supportedParameters,
      after?.openrouterLive?.supportedParameters,
    )
    if (supportedParameterDiff.added.length > 0 || supportedParameterDiff.removed.length > 0) {
      supportedParameterChanges.push({
        routeId: trimString(after?.id || before?.id),
        ...supportedParameterDiff,
      })
    }

    const beforeContextLength = Number(before?.openrouterLive?.contextLength || 0)
    const afterContextLength = Number(after?.openrouterLive?.contextLength || 0)
    if (beforeContextLength !== afterContextLength) {
      contextLengthChanges.push({
        routeId: trimString(after?.id || before?.id),
        before: beforeContextLength,
        after: afterContextLength,
      })
    }

    const pricingDiff = diffFlatObject(before?.openrouterLive?.pricing, after?.openrouterLive?.pricing)
    if (pricingDiff.length > 0) {
      pricingChanges.push({
        routeId: trimString(after?.id || before?.id),
        changes: pricingDiff,
      })
    }
  }

  const topLevelKeyDiff = diffStringLists(
    previousSnapshot?.rawFieldInventory?.topLevelKeys,
    currentSnapshot?.rawFieldInventory?.topLevelKeys,
  )
  const architectureKeyDiff = diffStringLists(
    previousSnapshot?.rawFieldInventory?.architectureKeys,
    currentSnapshot?.rawFieldInventory?.architectureKeys,
  )
  const pricingKeyDiff = diffStringLists(
    previousSnapshot?.rawFieldInventory?.pricingKeys,
    currentSnapshot?.rawFieldInventory?.pricingKeys,
  )
  const supportedParameterUniverseDiff = diffStringLists(
    previousSnapshot?.rawFieldInventory?.supportedParameters,
    currentSnapshot?.rawFieldInventory?.supportedParameters,
  )

  return {
    generatedAt,
    summary: {
      currentRouteCount: currentModels.length,
      previousRouteCount: previousModels.length,
      addedRouteCount: addedRoutes.length,
      removedRouteCount: removedRoutes.length,
      supportedParameterChangeCount: supportedParameterChanges.length,
      contextLengthChangeCount: contextLengthChanges.length,
      pricingChangeCount: pricingChanges.length,
      shapeChangeCount: [
        topLevelKeyDiff,
        architectureKeyDiff,
        pricingKeyDiff,
        supportedParameterUniverseDiff,
      ].filter((entry) => entry.added.length > 0 || entry.removed.length > 0).length,
    },
    addedRoutes,
    removedRoutes,
    supportedParameterChanges,
    contextLengthChanges,
    pricingChanges,
    shapeChanges: {
      topLevelKeys: topLevelKeyDiff,
      architectureKeys: architectureKeyDiff,
      pricingKeys: pricingKeyDiff,
      supportedParameters: supportedParameterUniverseDiff,
    },
  }
}

export function cloneOpenRouterModelsSnapshot(snapshot = {}) {
  return cloneJson(snapshot)
}
