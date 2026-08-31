import { jsonSchema } from 'ai'
import {
  getMoonshotFormulaCatalogEntry,
  normalizeMoonshotFormulaUri,
} from '../../common/api-clients/moonshot-formula-catalog.mjs'
import {
  normalizeMoonshotFiberToolResult,
  normalizeMoonshotProviderRuntimeSettings,
  resolveMoonshotBaseUrl,
  synthesizeMoonshotFormulaToolName,
} from './moonshot-formula-types.mjs'
import {
  PROVIDER_POLICY,
  withRetry,
  buildTimeoutSignal,
  isRetryableProviderError,
} from './provider-policy.mjs'

const MOONSHOT_FORMULA_SCHEMA_CACHE_TTL_MS = 15 * 60 * 1000
const formulaSchemaCache = new Map()

function asFetch(fetchImpl = null) {
  if (typeof fetchImpl === 'function') return fetchImpl
  if (typeof globalThis.fetch === 'function') return globalThis.fetch.bind(globalThis)
  throw new Error('Fetch is unavailable for Moonshot Formula runtime.')
}

function buildMoonshotHeaders(apiKey = '', extraHeaders = {}) {
  return {
    authorization: `Bearer ${String(apiKey || '').trim()}`,
    ...extraHeaders,
  }
}

function schemaCacheKey(formulaUri, baseUrl) {
  return `${String(baseUrl || '').trim()}::${String(formulaUri || '').trim().toLowerCase()}`
}

function readCachedFormulaSchema(formulaUri, baseUrl) {
  const key = schemaCacheKey(formulaUri, baseUrl)
  const cached = formulaSchemaCache.get(key)
  if (!cached || typeof cached !== 'object') return null
  if ((Date.now() - Number(cached.fetchedAt || 0)) > MOONSHOT_FORMULA_SCHEMA_CACHE_TTL_MS) {
    formulaSchemaCache.delete(key)
    return null
  }
  return cached
}

function writeCachedFormulaSchema(formulaUri, baseUrl, tools) {
  const key = schemaCacheKey(formulaUri, baseUrl)
  const payload = {
    tools: Array.isArray(tools) ? tools.map((tool) => ({ ...tool })) : [],
    fetchedAt: Date.now(),
  }
  formulaSchemaCache.set(key, payload)
  return payload
}

async function fetchJsonWithMoonshotPolicy(url, init = {}, fetchImpl = null) {
  const impl = asFetch(fetchImpl)
  return withRetry(async () => {
    const response = await impl(url, {
      ...init,
      signal: buildTimeoutSignal(PROVIDER_POLICY.modelFetch.timeoutMs, init.signal || init.abortSignal),
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      const error = new Error(`Moonshot Formula request failed: ${response.status}`)
      error.statusCode = response.status
      error.responseBody = text
      throw error
    }
    return response.json()
  }, {
    retries: PROVIDER_POLICY.modelFetch.retries,
    baseDelayMs: PROVIDER_POLICY.modelFetch.baseDelayMs,
    maxDelayMs: PROVIDER_POLICY.modelFetch.maxDelayMs,
    retryableFn: isRetryableProviderError,
  })
}

function normalizeFormulaToolRecord(formulaUri, tool = {}) {
  const source = tool && typeof tool === 'object' ? tool : {}
  if (String(source.type || '').trim().toLowerCase() !== 'function') return null
  const fn = source.function && typeof source.function === 'object'
    ? source.function
    : {}
  const originalToolName = String(fn.name || '').trim()
  if (!originalToolName) return null
  const description = String(fn.description || '').trim()
  const parameters = fn.parameters && typeof fn.parameters === 'object'
    ? fn.parameters
    : { type: 'object', properties: {}, required: [] }
  const catalogEntry = getMoonshotFormulaCatalogEntry(formulaUri)
  const syntheticToolName = synthesizeMoonshotFormulaToolName(formulaUri, originalToolName)
  return {
    syntheticToolName,
    formulaUri,
    originalToolName,
    description,
    parameters,
    riskLevel: String(catalogEntry?.riskLevel || 'medium').trim().toLowerCase() || 'medium',
  }
}

export async function loadMoonshotFormulaToolSchemas(formulaUri, apiKey, {
  fetchImpl = null,
  forceRefresh = false,
  abortSignal = null,
} = {}) {
  const normalizedFormulaUri = normalizeMoonshotFormulaUri(formulaUri)
  if (!normalizedFormulaUri) return []
  const baseUrl = resolveMoonshotBaseUrl()
  if (!forceRefresh) {
    const cached = readCachedFormulaSchema(normalizedFormulaUri, baseUrl)
    if (cached) return cached.tools.map((tool) => ({ ...tool }))
  }
  const url = `${baseUrl}/formulas/${encodeURIComponent(normalizedFormulaUri)}/tools`
  const payload = await fetchJsonWithMoonshotPolicy(url, {
    method: 'GET',
    headers: buildMoonshotHeaders(apiKey),
    signal: abortSignal,
  }, fetchImpl)
  const tools = Array.isArray(payload?.tools) ? payload.tools : []
  writeCachedFormulaSchema(normalizedFormulaUri, baseUrl, tools)
  return tools.map((tool) => ({ ...tool }))
}

export async function buildMoonshotFormulaToolBundle({
  apiKey = '',
  runtimeSettings = null,
  fetchImpl = null,
  forceRefresh = false,
  abortSignal = null,
} = {}) {
  const normalizedSettings = normalizeMoonshotProviderRuntimeSettings(runtimeSettings)
  if (!normalizedSettings.remoteToolsEnabled || normalizedSettings.enabledFormulaUris.length === 0 || !String(apiKey || '').trim()) {
    return {
      tools: {},
      toolMap: new Map(),
      notices: [],
      enabledFormulaUris: normalizedSettings.enabledFormulaUris,
    }
  }

  const tools = {}
  const toolMap = new Map()
  const notices = []

  for (const formulaUri of normalizedSettings.enabledFormulaUris) {
    try {
      const schemaTools = await loadMoonshotFormulaToolSchemas(formulaUri, apiKey, {
        fetchImpl,
        forceRefresh,
        abortSignal,
      })
      for (const rawTool of schemaTools) {
        const normalizedTool = normalizeFormulaToolRecord(formulaUri, rawTool)
        if (!normalizedTool) continue
        if (toolMap.has(normalizedTool.syntheticToolName)) {
          notices.push({
            type: 'warning',
            text: `Skipped duplicate Moonshot Formula tool "${normalizedTool.syntheticToolName}" from ${formulaUri}.`,
            meta: {
              providerId: 'moonshot',
              formulaUri,
              toolName: normalizedTool.originalToolName,
              duplicateSyntheticToolName: normalizedTool.syntheticToolName,
            },
          })
          continue
        }
        toolMap.set(normalizedTool.syntheticToolName, normalizedTool)
        tools[normalizedTool.syntheticToolName] = {
          description: normalizedTool.description || `${normalizedTool.originalToolName} via ${formulaUri}`,
          inputSchema: jsonSchema(normalizedTool.parameters),
        }
      }
    } catch (error) {
      notices.push({
        type: 'warning',
        text: `Moonshot Formula tools from ${formulaUri} are unavailable for this turn and were skipped.`,
        meta: {
          providerId: 'moonshot',
          formulaUri,
          error: String(error?.message || error || 'unknown error'),
        },
      })
    }
  }

  return {
    tools,
    toolMap,
    notices,
    enabledFormulaUris: normalizedSettings.enabledFormulaUris,
  }
}

export async function executeMoonshotFormulaToolCall({
  apiKey = '',
  mapping = null,
  toolInput = {},
  fetchImpl = null,
  abortSignal = null,
} = {}) {
  const row = mapping && typeof mapping === 'object' ? mapping : null
  if (!row?.formulaUri || !row?.originalToolName) {
    return {
      ok: false,
      result: 'Moonshot Formula tool failed: invalid mapping.',
      source: 'error',
    }
  }

  const baseUrl = resolveMoonshotBaseUrl()
  const url = `${baseUrl}/formulas/${encodeURIComponent(row.formulaUri)}/fibers`
  const payload = await fetchJsonWithMoonshotPolicy(url, {
    method: 'POST',
    headers: buildMoonshotHeaders(apiKey, { 'content-type': 'application/json' }),
    signal: abortSignal,
    body: JSON.stringify({
      name: row.originalToolName,
      arguments: JSON.stringify(toolInput && typeof toolInput === 'object' ? toolInput : {}),
    }),
  }, fetchImpl)

  return normalizeMoonshotFiberToolResult(payload)
}

export const __testMoonshotFormulaRuntimeInternals = Object.freeze({
  clearSchemaCache() {
    formulaSchemaCache.clear()
  },
  normalizeFormulaToolRecord,
  readCachedFormulaSchema,
})
