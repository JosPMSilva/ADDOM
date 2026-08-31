import { COMPACTION_MODES } from '../chat/continuity/compaction-mode-contract.mjs'
import {
  buildProviderTruncationBudget,
  resolveProviderTruncationTriggerTokens,
} from '../../common/chat/provider-truncation-budget-policy.mjs'
import { resolveOpenAIRequestContextCompaction } from './openai-request-context-compaction.mjs'

const OPENAI_SERVER_SIDE_COMPACTION_MIN_TOKENS = 4_096
const OPENAI_SERVER_SIDE_COMPACTION_MAX_TOKENS = 2_000_000
const OPENAI_SERVER_SIDE_COMPACTION_ENTRY_TYPE = 'compaction'

export const OPENAI_SERVER_SIDE_COMPACTION_METADATA_KEY = 'addom_ctx_compact_threshold'

function toNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function normalizeId(value = '') {
  return String(value || '').trim()
}

function normalizeMetadataObject(metadata = null) {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? { ...metadata }
    : {}
}

function pushUniqueIds(target = [], values = []) {
  const seen = new Set(target)
  for (const value of values) {
    const normalized = normalizeId(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    target.push(normalized)
  }
  return target
}

export function normalizeOpenAIServerSideCompactionThresholdTokens(value, fallback = 0) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    const fallbackNumeric = Number(fallback)
    if (!Number.isFinite(fallbackNumeric) || fallbackNumeric <= 0) return 0
    return Math.min(
      OPENAI_SERVER_SIDE_COMPACTION_MAX_TOKENS,
      Math.max(OPENAI_SERVER_SIDE_COMPACTION_MIN_TOKENS, Math.round(fallbackNumeric)),
    )
  }
  return Math.min(
    OPENAI_SERVER_SIDE_COMPACTION_MAX_TOKENS,
    Math.max(OPENAI_SERVER_SIDE_COMPACTION_MIN_TOKENS, Math.round(numeric)),
  )
}

export function buildOpenAIServerSideCompactionEntries(thresholdTokens = 0) {
  const normalizedThreshold = normalizeOpenAIServerSideCompactionThresholdTokens(thresholdTokens, 0)
  if (normalizedThreshold <= 0) return undefined
  return [{
    type: OPENAI_SERVER_SIDE_COMPACTION_ENTRY_TYPE,
    compact_threshold: normalizedThreshold,
  }]
}

export function resolveOpenAIServerSideCompactionPolicy({
  runtimeSettings = null,
  requestContext = {},
  modelSupport = null,
  forBackground = false,
  modelContextLimitTokens = 0,
  criticalTaskState = null,
} = {}) {
  const settings = runtimeSettings && typeof runtimeSettings === 'object' ? runtimeSettings : {}
  const openAIRequestContext = requestContext?.openai && typeof requestContext.openai === 'object'
    ? requestContext.openai
    : {}
  const requestCompaction = resolveOpenAIRequestContextCompaction(openAIRequestContext)
  const promptThresholdOverridesAllowed = settings.allowPromptCompactionThresholdOverride === true
  const overrideThreshold = normalizeOpenAIServerSideCompactionThresholdTokens(
    promptThresholdOverridesAllowed ? requestCompaction.providerTruncationThresholdTokens : 0,
    0,
  )
  const configuredThreshold = normalizeOpenAIServerSideCompactionThresholdTokens(
    settings.serverSideCompactionThresholdTokens,
    0,
  )
  const budget = buildProviderTruncationBudget({
    modelContextLimitTokens,
    softTriggerPercent: settings.providerTruncationSoftTriggerPercent,
  })
  const derivedThreshold = normalizeOpenAIServerSideCompactionThresholdTokens(
    resolveProviderTruncationTriggerTokens({
      budget,
      criticalTaskState,
      fallbackTokens: budget.softTriggerTokens,
    }),
    0,
  )
  const effectiveThreshold = overrideThreshold > 0
    ? overrideThreshold
    : (configuredThreshold > 0 ? configuredThreshold : derivedThreshold)

  const forceProviderTruncation = (
    promptThresholdOverridesAllowed
    && requestCompaction.forceProviderTruncation === true
  )
  if (settings.useServerSideCompaction !== true && forceProviderTruncation !== true) {
    return {
      enabled: false,
      reason: 'disabled',
      thresholdTokens: 0,
      budget,
    }
  }
  if (forBackground && settings.serverSideCompactionBackgroundParity === false) {
    return {
      enabled: false,
      reason: 'background_parity_disabled',
      thresholdTokens: 0,
      budget,
    }
  }
  if (modelSupport?.supportsProviderTruncation !== true) {
    return {
      enabled: false,
      reason: 'unsupported_model',
      thresholdTokens: 0,
      budget,
    }
  }
  if (effectiveThreshold <= 0) {
    return {
      enabled: false,
      reason: 'invalid_threshold',
      thresholdTokens: 0,
      budget,
    }
  }
  return {
    enabled: true,
    reason: 'enabled',
    thresholdTokens: effectiveThreshold,
    budget,
  }
}

export function resolveOpenAICompactionStrategy({
  runtimeSettings = null,
  requestContext = {},
  modelSupport = null,
  forBackground = false,
  preferManual = false,
  modelContextLimitTokens = 0,
  criticalTaskState = null,
} = {}) {
  const settings = runtimeSettings && typeof runtimeSettings === 'object' ? runtimeSettings : {}
  const providerChainCompactionEnabled = (
    settings.useResponseCompaction === true
    && modelSupport?.supportsProviderChainCompaction === true
  )
  const serverSidePolicy = resolveOpenAIServerSideCompactionPolicy({
    runtimeSettings: settings,
    requestContext,
    modelSupport,
    forBackground,
    modelContextLimitTokens,
    criticalTaskState,
  })

  if (preferManual && providerChainCompactionEnabled) {
    return {
      mode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
      reason: 'manual_preferred',
      thresholdTokens: 0,
      serverSidePolicy,
    }
  }

  if (serverSidePolicy.enabled) {
    return {
      mode: COMPACTION_MODES.PROVIDER_TRUNCATION,
      reason: serverSidePolicy.reason,
      thresholdTokens: serverSidePolicy.thresholdTokens,
      serverSidePolicy,
    }
  }

  if (providerChainCompactionEnabled) {
    return {
      mode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
      reason: 'manual_enabled',
      thresholdTokens: 0,
      serverSidePolicy,
    }
  }

  return {
    mode: COMPACTION_MODES.NONE,
    reason: serverSidePolicy.reason || 'disabled',
    thresholdTokens: 0,
    serverSidePolicy,
  }
}

export function injectOpenAIServerSideCompactionMetadata(metadata = null, thresholdTokens = 0) {
  const normalizedThreshold = normalizeOpenAIServerSideCompactionThresholdTokens(thresholdTokens, 0)
  const nextMetadata = normalizeMetadataObject(metadata)
  if (normalizedThreshold <= 0) {
    delete nextMetadata[OPENAI_SERVER_SIDE_COMPACTION_METADATA_KEY]
    return nextMetadata
  }
  nextMetadata[OPENAI_SERVER_SIDE_COMPACTION_METADATA_KEY] = String(normalizedThreshold)
  return nextMetadata
}

export function applyOpenAIServerSideCompactionTransportShim(body = {}) {
  const source = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const metadata = normalizeMetadataObject(source.metadata)
  const thresholdTokens = normalizeOpenAIServerSideCompactionThresholdTokens(
    metadata[OPENAI_SERVER_SIDE_COMPACTION_METADATA_KEY],
    0,
  )
  if (thresholdTokens <= 0) return source

  delete metadata[OPENAI_SERVER_SIDE_COMPACTION_METADATA_KEY]
  const nextBody = {
    ...source,
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  }
  if (Object.keys(metadata).length === 0 && Object.prototype.hasOwnProperty.call(nextBody, 'metadata')) {
    delete nextBody.metadata
  }
  if (!Array.isArray(nextBody.context_management) || nextBody.context_management.length === 0) {
    nextBody.context_management = buildOpenAIServerSideCompactionEntries(thresholdTokens)
  }
  return nextBody
}

export function extractOpenAIServerSideCompactionIdsFromOutput(output = []) {
  const rows = Array.isArray(output) ? output : []
  const ids = []
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue
    if (String(item.type || '').trim().toLowerCase() !== OPENAI_SERVER_SIDE_COMPACTION_ENTRY_TYPE) continue
    pushUniqueIds(ids, [item.id])
  }
  return ids
}

export function createOpenAIServerSideCompactionStreamCollector() {
  const autoCompactionIds = []

  return {
    handleRawChunk(rawChunk = null) {
      if (!rawChunk || typeof rawChunk !== 'object') return false
      const eventType = String(rawChunk.type || '').trim().toLowerCase()
      if (eventType !== 'response.output_item.added' && eventType !== 'response.output_item.done') {
        return false
      }
      const nextIds = extractOpenAIServerSideCompactionIdsFromOutput([rawChunk.item])
      if (nextIds.length === 0) return false
      pushUniqueIds(autoCompactionIds, nextIds)
      return true
    },
    buildMeta() {
      return {
        autoCompactionApplied: autoCompactionIds.length > 0,
        autoCompactionIds: [...autoCompactionIds],
      }
    },
  }
}

export function buildOpenAIServerSideCompactionResponseMeta({
  response = null,
  rawStreamMeta = null,
} = {}) {
  const autoCompactionIds = []
  pushUniqueIds(autoCompactionIds, rawStreamMeta?.autoCompactionIds)
  pushUniqueIds(autoCompactionIds, extractOpenAIServerSideCompactionIdsFromOutput(response?.output))
  return {
    autoCompactionApplied: autoCompactionIds.length > 0,
    autoCompactionIds,
  }
}

export function extractOpenAIServerSideCompactionThresholdFromMetadata(metadata = null) {
  const source = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}
  return normalizeOpenAIServerSideCompactionThresholdTokens(
    source[OPENAI_SERVER_SIDE_COMPACTION_METADATA_KEY],
    0,
  )
}

export function extractOpenAIServerSideCompactionThresholdFromRequestBody(body = {}) {
  const source = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  if (Array.isArray(source.context_management) && source.context_management.length > 0) {
    for (const entry of source.context_management) {
      if (String(entry?.type || '').trim().toLowerCase() !== OPENAI_SERVER_SIDE_COMPACTION_ENTRY_TYPE) continue
      const thresholdTokens = normalizeOpenAIServerSideCompactionThresholdTokens(
        toNumber(entry?.compact_threshold, 0),
        0,
      )
      if (thresholdTokens > 0) return thresholdTokens
    }
  }
  return extractOpenAIServerSideCompactionThresholdFromMetadata(source.metadata)
}
