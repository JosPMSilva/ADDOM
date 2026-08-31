const MAX_DIAGNOSTIC_ROWS = 12

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase()
}

function incrementCount(target = {}, key = '') {
  const normalizedKey = normalizeText(key)
  if (!normalizedKey) return
  target[normalizedKey] = (Number(target[normalizedKey] || 0) || 0) + 1
}

function pushUniqueRow(target = [], row = {}, { maxRows = MAX_DIAGNOSTIC_ROWS } = {}) {
  if (!Array.isArray(target) || !row || typeof row !== 'object') return
  const key = JSON.stringify(row)
  if (target.some((entry) => JSON.stringify(entry) === key)) return
  target.push(row)
  if (target.length > maxRows) target.splice(0, target.length - maxRows)
}

function summarizeVisibleFamilies(toolIdentityMap = {}) {
  const out = {}
  const source = toolIdentityMap && typeof toolIdentityMap === 'object' ? toolIdentityMap : {}
  for (const identity of Object.values(source)) {
    const family = normalizeText(identity?.family) || 'other'
    incrementCount(out, family)
  }
  return out
}

function normalizeActivationRows(records = []) {
  return (Array.isArray(records) ? records : [])
    .map((record) => {
      const capabilityId = normalizeText(record?.capabilityId)
      if (!capabilityId) return null
      return {
        capabilityId,
        state: normalizeKey(record?.state),
        reason: normalizeKey(record?.reason),
        attemptedToolName: normalizeText(record?.metadata?.attemptedToolName),
        catalogPath: normalizeText(record?.metadata?.catalogPath),
      }
    })
    .filter(Boolean)
    .slice(0, MAX_DIAGNOSTIC_ROWS)
}

function summarizeExcludedReasons(rows = []) {
  const out = {}
  for (const row of Array.isArray(rows) ? rows : []) {
    const reason = normalizeText(row?.reason)
    if (reason) incrementCount(out, reason)
  }
  return out
}

export function shouldCollectDevToolSurfaceDiagnostics(diagnostics = {}) {
  return diagnostics && typeof diagnostics === 'object' && diagnostics.runtimeDiagnosticsVisible === true
}

export function applyDevToolSurfaceDiagnostics(errorDiagnostics = {}, {
  resolvedToolSurface = {},
} = {}) {
  if (!shouldCollectDevToolSurfaceDiagnostics(errorDiagnostics)) return
  const source = resolvedToolSurface && typeof resolvedToolSurface === 'object' ? resolvedToolSurface : {}
  errorDiagnostics.devToolSurfaceDiagnosticsEnabled = true
  errorDiagnostics.devToolSurfaceVisibleFamilies = summarizeVisibleFamilies(source.toolIdentityMap)
  errorDiagnostics.devToolSurfaceHiddenDiscoverableFamilies = Array.isArray(source.toolSurfaceHiddenFamilies)
    ? [...source.toolSurfaceHiddenFamilies].map(normalizeText).filter(Boolean).sort()
    : []
  errorDiagnostics.devToolSurfaceActivationRecords = normalizeActivationRows(source.toolSurfaceActivationRecords)
  errorDiagnostics.devToolSurfaceActivatedCapabilities = Array.isArray(source.toolSurfaceActivatedCapabilities)
    ? [...source.toolSurfaceActivatedCapabilities].map(normalizeText).filter(Boolean).sort()
    : []
  errorDiagnostics.devToolSurfaceBlockedCapabilities = Array.isArray(source.toolSurfaceBlockedCapabilities)
    ? [...source.toolSurfaceBlockedCapabilities].map(normalizeText).filter(Boolean).sort()
    : []
  errorDiagnostics.devToolSurfaceActivationIncludedTools = Array.isArray(source.toolSurfaceActivationIncludedTools)
    ? [...source.toolSurfaceActivationIncludedTools].map(normalizeText).filter(Boolean).sort()
    : []
  errorDiagnostics.devToolSurfaceBlockedReasonCounts = summarizeExcludedReasons(source.excludedToolsWithReasons)
}

export function recordDevCapabilityCatalogOperation(errorDiagnostics = {}, {
  operation = '',
  path = '',
  query = '',
  matchCount = 0,
} = {}) {
  if (!shouldCollectDevToolSurfaceDiagnostics(errorDiagnostics)) return
  errorDiagnostics.devToolSurfaceDiagnosticsEnabled = true
  if (!errorDiagnostics.devToolSurfaceCatalogOperationCounts || typeof errorDiagnostics.devToolSurfaceCatalogOperationCounts !== 'object') {
    errorDiagnostics.devToolSurfaceCatalogOperationCounts = {}
  }
  const normalizedOperation = normalizeKey(operation) || 'unknown'
  incrementCount(errorDiagnostics.devToolSurfaceCatalogOperationCounts, normalizedOperation)
  if (!Array.isArray(errorDiagnostics.devToolSurfaceCatalogOperations)) {
    errorDiagnostics.devToolSurfaceCatalogOperations = []
  }
  pushUniqueRow(errorDiagnostics.devToolSurfaceCatalogOperations, {
    operation: normalizedOperation,
    path: normalizeText(path),
    query: normalizeText(query).slice(0, 160),
    matchCount: Math.max(0, Number(matchCount || 0) || 0),
  })
}

export function recordDevHiddenKnownToolRecovery(errorDiagnostics = {}, {
  recovery = null,
  blockedForTurn = false,
} = {}) {
  if (!shouldCollectDevToolSurfaceDiagnostics(errorDiagnostics) || !recovery) return
  errorDiagnostics.devToolSurfaceDiagnosticsEnabled = true
  if (!Array.isArray(errorDiagnostics.devToolSurfaceHiddenKnownRecoveries)) {
    errorDiagnostics.devToolSurfaceHiddenKnownRecoveries = []
  }
  pushUniqueRow(errorDiagnostics.devToolSurfaceHiddenKnownRecoveries, {
    attemptedToolName: normalizeText(recovery.attemptedToolName || recovery.toolName),
    capabilityId: normalizeText(recovery.capabilityId),
    catalogPath: normalizeText(recovery.catalogPath),
    blockedForTurn: blockedForTurn === true,
  })
}
