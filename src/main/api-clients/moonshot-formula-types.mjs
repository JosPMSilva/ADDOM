import {
  getMoonshotFormulaCatalogEntry,
  listMoonshotFormulaCatalog,
  normalizeMoonshotFormulaUri,
} from '../../common/api-clients/moonshot-formula-catalog.mjs'

export const DEFAULT_MOONSHOT_PROVIDER_RUNTIME_SETTINGS = Object.freeze({
  remoteToolsEnabled: false,
  enabledFormulaUris: [],
  remoteToolWarningAcknowledgedAt: 0,
  defaultMaxOutputTokensOverride: 0,
  toolResultBudgetCharsOverride: 0,
  oldToolResultPruningEnabled: true,
  promptPreflightHardGuardEnabled: true,
})

export const DEFAULT_PROVIDER_RUNTIME_SETTINGS = Object.freeze({
  moonshot: { ...DEFAULT_MOONSHOT_PROVIDER_RUNTIME_SETTINGS },
})

function normalizeBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : !!fallback
}

function normalizeTimestamp(value, fallback = 0) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return Math.max(0, Number(fallback || 0) || 0)
  return Math.round(numeric)
}

function normalizeOptionalPositiveInteger(value, fallback = 0, {
  min = 1,
  max = 2_000_000,
} = {}) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    const fallbackNumeric = Number(fallback)
    if (!Number.isFinite(fallbackNumeric) || fallbackNumeric <= 0) return 0
    return Math.min(max, Math.max(min, Math.round(fallbackNumeric)))
  }
  return Math.min(max, Math.max(min, Math.round(numeric)))
}

export function resolveMoonshotBaseUrl() {
  const configured = String(process.env.ADDOM_MOONSHOT_BASE_URL || '').trim()
  const value = configured || 'https://api.moonshot.ai/v1'
  return value.replace(/\/+$/, '')
}

export function normalizeMoonshotFormulaUriList(rawValue, { maxItems = 32 } = {}) {
  const source = Array.isArray(rawValue) ? rawValue : []
  const seen = new Set()
  const out = []
  for (const item of source) {
    if (out.length >= maxItems) break
    const normalized = normalizeMoonshotFormulaUri(item)
    if (!normalized || seen.has(normalized)) continue
    if (!getMoonshotFormulaCatalogEntry(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

export function normalizeMoonshotProviderRuntimeSettings(
  rawValue = {},
  fallback = DEFAULT_MOONSHOT_PROVIDER_RUNTIME_SETTINGS,
) {
  const source = rawValue && typeof rawValue === 'object' ? rawValue : {}
  const base = fallback && typeof fallback === 'object'
    ? fallback
    : DEFAULT_MOONSHOT_PROVIDER_RUNTIME_SETTINGS
  return {
    remoteToolsEnabled: normalizeBoolean(source.remoteToolsEnabled, base.remoteToolsEnabled),
    enabledFormulaUris: normalizeMoonshotFormulaUriList(
      source.enabledFormulaUris,
      { maxItems: Math.max(1, Number(base.enabledFormulaUris?.length || 32) || 32) },
    ),
    remoteToolWarningAcknowledgedAt: normalizeTimestamp(
      source.remoteToolWarningAcknowledgedAt,
      base.remoteToolWarningAcknowledgedAt,
    ),
    defaultMaxOutputTokensOverride: normalizeOptionalPositiveInteger(
      source.defaultMaxOutputTokensOverride,
      base.defaultMaxOutputTokensOverride,
      { min: 256 },
    ),
    toolResultBudgetCharsOverride: normalizeOptionalPositiveInteger(
      source.toolResultBudgetCharsOverride,
      base.toolResultBudgetCharsOverride,
      { min: 1_000 },
    ),
    oldToolResultPruningEnabled: normalizeBoolean(
      source.oldToolResultPruningEnabled,
      base.oldToolResultPruningEnabled,
    ),
    promptPreflightHardGuardEnabled: normalizeBoolean(
      source.promptPreflightHardGuardEnabled,
      base.promptPreflightHardGuardEnabled,
    ),
  }
}

export function normalizeProviderRuntimeSettings(
  rawValue = {},
  fallback = DEFAULT_PROVIDER_RUNTIME_SETTINGS,
) {
  const source = rawValue && typeof rawValue === 'object' ? rawValue : {}
  const base = fallback && typeof fallback === 'object'
    ? fallback
    : DEFAULT_PROVIDER_RUNTIME_SETTINGS
  return {
    moonshot: normalizeMoonshotProviderRuntimeSettings(
      source.moonshot,
      base.moonshot,
    ),
  }
}

function slugifySegment(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function synthesizeMoonshotFormulaToolName(formulaUri = '', toolName = '') {
  const catalogEntry = getMoonshotFormulaCatalogEntry(formulaUri)
  const normalizedFormulaUri = normalizeMoonshotFormulaUri(formulaUri)
  const formulaId = catalogEntry?.id
    || normalizedFormulaUri.replace(/^moonshot\//, '').replace(/:latest$/, '')
  const formulaSlug = slugifySegment(formulaId) || 'formula'
  const toolSlug = slugifySegment(toolName) || 'tool'
  return `moonshot_formula__${formulaSlug}__${toolSlug}`
}

export function isMoonshotSyntheticToolName(value = '') {
  return String(value || '').trim().toLowerCase().startsWith('moonshot_formula__')
}

function stringifyStructuredOutput(value) {
  if (typeof value === 'string') return value
  if (value == null) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function normalizeMoonshotFiberToolResult(fiber = {}) {
  const source = fiber && typeof fiber === 'object' ? fiber : {}
  const status = String(source.status || '').trim().toLowerCase()
  const context = source.context && typeof source.context === 'object'
    ? source.context
    : {}

  const encryptedOutput = String(context.encrypted_output || '').trim()
  if (status === 'succeeded' && encryptedOutput) {
    return {
      ok: true,
      result: encryptedOutput,
      source: 'encrypted_output',
    }
  }

  if (status === 'succeeded' && Object.prototype.hasOwnProperty.call(context, 'output')) {
    const result = stringifyStructuredOutput(context.output)
    if (String(result || '').trim()) {
      return {
        ok: true,
        result,
        source: typeof context.output === 'string' ? 'output' : 'output_json',
      }
    }
  }

  const directError = String(source.error || '').trim()
  const contextError = String(context.error || '').trim()
  const outputError = status === 'succeeded' ? '' : String(context.output || '').trim()
  const detail = directError || contextError || outputError || status || 'unknown error'
  return {
    ok: false,
    result: `Moonshot Formula tool failed: ${detail}`,
    source: 'error',
  }
}

export function listSupportedMoonshotFormulaUris() {
  return listMoonshotFormulaCatalog().map((entry) => entry.uri)
}
