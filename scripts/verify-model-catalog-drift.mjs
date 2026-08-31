import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  loadPortableModelsDevProvider,
  listPortableModelsDevProviders,
  mapModelsDevProviderId,
} from './lib/models-dev-portable.mjs'
import {
  buildPricingFromRawCost,
  normalizePricingShape,
} from './lib/model-catalog-pricing.mjs'
import {
  DEFAULT_MODEL_CATALOG_SOURCE,
  readNormalizedCatalogSource,
} from './lib/model-catalog-source.mjs'

import {
  listRegistryProviders,
  resolveRegistryModel,
} from '../src/common/api-clients/model-registry.mjs'

const DEFAULT_VENDOR_ROOT = DEFAULT_MODEL_CATALOG_SOURCE

const DEFAULT_OUTPUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../tests/fixtures/model-catalog/current-models-dev-conflict-report.json',
)

const RESEARCH_HINTS = Object.freeze({
  reasoning: ['official model docs', 'provider API docs', 'models.dev TOML'],
  toolCall: ['official API docs', 'provider model capability docs', 'models.dev TOML'],
  attachment: ['official multimodal docs', 'provider model cards', 'models.dev TOML'],
  inputModalities: ['official multimodal docs', 'provider model cards', 'models.dev TOML'],
  outputModalities: ['official model docs', 'provider API docs', 'models.dev TOML'],
  contextLimit: ['official model docs', 'provider context-window docs', 'models.dev TOML'],
  outputLimit: ['official model docs', 'provider output-limit docs', 'models.dev TOML'],
  pricing: ['official pricing page', 'provider API pricing docs', 'models.dev TOML'],
  knowledge: ['official model docs', 'provider model card', 'models.dev TOML'],
  releaseDate: ['official release notes', 'provider model card', 'models.dev TOML'],
  lastUpdated: ['official release notes', 'provider model card', 'models.dev TOML'],
})

function isIntentionalPolicyConflict(providerId = '', modelId = '', field = '', current = null, upstream = null) {
  const normalizedProviderId = trimString(providerId).toLowerCase()
  const normalizedModelId = trimString(modelId).toLowerCase()
  const normalizedField = trimString(field)

  if (
    normalizedProviderId === 'openrouter'
    && normalizedField === 'toolCall'
    && normalizedModelId.startsWith('moonshotai/')
    && current === false
    && upstream === true
  ) {
    return true
  }

  return false
}

function parseArgs(argv = []) {
  const args = [...argv]
  const parsed = {
    providerIds: [],
    vendorRoot: process.env.ADDOM_MODELS_DEV_VENDOR_ROOT || DEFAULT_VENDOR_ROOT,
    output: process.env.ADDOM_MODEL_CATALOG_DRIFT_OUTPUT || DEFAULT_OUTPUT,
  }

  while (args.length > 0) {
    const flag = String(args.shift() || '').trim()
    if (flag === '--provider') {
      parsed.providerIds.push(String(args.shift() || '').trim().toLowerCase())
      continue
    }
    if (flag === '--vendor-root') {
      parsed.vendorRoot = String(args.shift() || '').trim()
      continue
    }
    if (flag === '--output') {
      parsed.output = String(args.shift() || '').trim()
      continue
    }
    throw new Error(`Unknown flag: ${flag}`)
  }

  parsed.providerIds = [...new Set(parsed.providerIds.filter(Boolean))]
  if (!parsed.vendorRoot) throw new Error('Missing --vendor-root value.')
  if (!parsed.output) throw new Error('Missing --output value.')
  return parsed
}

function trimString(value = '') {
  return String(value || '').trim()
}

function normalizeBoolean(value) {
  if (value === true) return true
  if (value === false) return false
  return null
}

function normalizeStringArray(values = []) {
  const seen = new Set()
  const out = []
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = trimString(value).toLowerCase()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

function normalizeNumber(value) {
  if (value === null || value === undefined) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function normalizeModelsDevModel(model = {}) {
  return {
    id: trimString(model.id),
    label: trimString(model.name || model.id),
    family: trimString(model.family),
    releaseDate: trimString(model.release_date) || null,
    lastUpdated: trimString(model.last_updated) || null,
    knowledge: trimString(model.knowledge) || null,
    reasoning: normalizeBoolean(model.reasoning),
    toolCall: normalizeBoolean(model.tool_call),
    attachment: normalizeBoolean(model.attachment),
    structuredOutput: normalizeBoolean(model.structured_output),
    inputModalities: normalizeStringArray(model.modalities?.input),
    outputModalities: normalizeStringArray(model.modalities?.output),
    contextLimit: normalizeNumber(model.limit?.context),
    inputLimit: normalizeNumber(model.limit?.input),
    outputLimit: normalizeNumber(model.limit?.output),
    pricing: normalizePricingShape(buildPricingFromRawCost(model.cost)),
  }
}

function normalizeCurrentRegistryModel(model = {}) {
  const capabilities = model?.capabilities && typeof model.capabilities === 'object'
    ? model.capabilities
    : {}
  return {
    id: trimString(model.id),
    label: trimString(model.label || model.id),
    family: trimString(model.group),
    releaseDate: trimString(model.releaseDate) || null,
    lastUpdated: trimString(model.lastUpdated || model.verifiedAt) || null,
    knowledge: trimString(model.knowledge) || null,
    reasoning: model.reasoning === true || capabilities.reasoning?.supported === true,
    toolCall: Object.prototype.hasOwnProperty.call(model, 'supportsTools')
      ? (model.supportsTools === true ? true : (model.supportsTools === false ? false : null))
      : normalizeBoolean(capabilities.toolCall?.supported),
    attachment: normalizeBoolean(capabilities.attachment?.supported),
    structuredOutput: typeof model.structuredOutput === 'boolean' ? model.structuredOutput === true : null,
    inputModalities: normalizeStringArray(capabilities.inputModalities),
    outputModalities: normalizeStringArray(capabilities.outputModalities),
    contextLimit: normalizeNumber(model.contextWindowTokens ?? model.limits?.context),
    inputLimit: normalizeNumber(model.inputLimit ?? model.inputLimitTokens ?? model.limits?.input),
    outputLimit: normalizeNumber(model.maxOutputTokens ?? model.limits?.output),
    pricing: normalizePricingShape(model.pricing),
  }
}

function normalizeComparableModel(model = {}) {
  return {
    ...model,
    reasoning: normalizeBoolean(model.reasoning),
    toolCall: normalizeBoolean(model.toolCall),
    attachment: normalizeBoolean(model.attachment),
    structuredOutput: normalizeBoolean(model.structuredOutput),
    inputModalities: normalizeStringArray(model.inputModalities),
    outputModalities: normalizeStringArray(model.outputModalities),
    contextLimit: normalizeNumber(model.contextLimit),
    inputLimit: normalizeNumber(model.inputLimit),
    outputLimit: normalizeNumber(model.outputLimit),
    pricing: normalizePricingShape(model.pricing),
  }
}

function pricingDiff(currentPricing = {}, upstreamPricing = {}) {
  const diffs = []

  const normalizedCurrent = normalizePricingShape(currentPricing) || {}
  const normalizedUpstream = normalizePricingShape(upstreamPricing) || {}
  const scalarKeys = [...new Set([
    ...Object.keys(normalizedCurrent),
    ...Object.keys(normalizedUpstream),
  ])]
    .filter((key) => key !== 'tiers' && key !== 'notes')
    .sort((left, right) => left.localeCompare(right))

  for (const key of scalarKeys) {
    const current = normalizeNumber(normalizedCurrent?.[key])
    const upstream = normalizeNumber(normalizedUpstream?.[key])
    if (current === upstream) continue
    diffs.push({
      field: `pricing.${key}`,
      current,
      upstream,
      researchStatus: 'pending',
      recommendedSources: RESEARCH_HINTS.pricing,
    })
  }

  const currentTierMap = new Map(
    Array.isArray(normalizedCurrent?.tiers)
      ? normalizedCurrent.tiers.map((tier) => [trimString(tier?.id), tier]).filter(([tierId]) => Boolean(tierId))
      : [],
  )
  const upstreamTierMap = new Map(
    Array.isArray(normalizedUpstream?.tiers)
      ? normalizedUpstream.tiers.map((tier) => [trimString(tier?.id), tier]).filter(([tierId]) => Boolean(tierId))
      : [],
  )
  const tierIds = [...new Set([...currentTierMap.keys(), ...upstreamTierMap.keys()])].sort((left, right) => left.localeCompare(right))

  for (const tierId of tierIds) {
    const currentTier = currentTierMap.get(tierId) || {}
    const upstreamTier = upstreamTierMap.get(tierId) || {}
    const tierKeys = [...new Set([
      ...Object.keys(currentTier),
      ...Object.keys(upstreamTier),
    ])]
      .filter((key) => key !== 'id')
      .sort((left, right) => left.localeCompare(right))

    for (const key of tierKeys) {
      const currentValue = key === 'notes'
        ? (trimString(currentTier?.[key]) || null)
        : normalizeNumber(currentTier?.[key])
      const upstreamValue = key === 'notes'
        ? (trimString(upstreamTier?.[key]) || null)
        : normalizeNumber(upstreamTier?.[key])
      if (currentValue === upstreamValue) continue
      diffs.push({
        field: `pricing.tiers.${tierId}.${key}`,
        current: currentValue,
        upstream: upstreamValue,
        researchStatus: 'pending',
        recommendedSources: RESEARCH_HINTS.pricing,
      })
    }
  }

  return diffs
}

function compareModels(currentModel = {}, upstreamModel = {}) {
  const current = normalizeComparableModel(currentModel)
  const upstream = normalizeComparableModel(upstreamModel)
  const conflicts = []

  const scalarFields = [
    'reasoning',
    'toolCall',
    'attachment',
    'structuredOutput',
    'contextLimit',
    'inputLimit',
    'outputLimit',
    'knowledge',
    'releaseDate',
    'lastUpdated',
  ]

  for (const field of scalarFields) {
    if ((current[field] ?? null) === (upstream[field] ?? null)) continue
    conflicts.push({
      field,
      current: current[field] ?? null,
      upstream: upstream[field] ?? null,
      researchStatus: 'pending',
      recommendedSources: RESEARCH_HINTS[field] || ['official provider docs', 'models.dev TOML'],
    })
  }

  const arrayFields = ['inputModalities', 'outputModalities']
  for (const field of arrayFields) {
    const currentArray = [...(current[field] || [])].sort((left, right) => String(left).localeCompare(String(right)))
    const upstreamArray = [...(upstream[field] || [])].sort((left, right) => String(left).localeCompare(String(right)))
    const currentValue = JSON.stringify(currentArray)
    const upstreamValue = JSON.stringify(upstreamArray)
    if (currentValue === upstreamValue) continue
    conflicts.push({
      field,
      current: currentArray,
      upstream: upstreamArray,
      researchStatus: 'pending',
      recommendedSources: RESEARCH_HINTS[field] || ['official provider docs', 'models.dev TOML'],
    })
  }

  return [...conflicts, ...pricingDiff(current.pricing, upstream.pricing)]
}

function buildCurrentRegistryIndex() {
  const providers = listRegistryProviders()
  return new Map(providers.map((provider) => [trimString(provider.id).toLowerCase(), provider]))
}

function buildProviderReport(currentProvider = null, upstreamProvider = null) {
  const providerId = trimString(upstreamProvider?.providerId).toLowerCase()
  const upstreamProviderId = trimString(upstreamProvider?.upstreamProviderId).toLowerCase()
  const currentModels = Array.isArray(currentProvider?.models) ? currentProvider.models : []
  const matchedCanonicalIds = new Set()
  const conflicts = []
  const onlyInModelsDev = []

  for (const upstreamModel of upstreamProvider?.models || []) {
    const resolved = resolveRegistryModel(providerId, upstreamModel.id)
    if (!resolved?.model) {
      onlyInModelsDev.push(upstreamModel.id)
      continue
    }
    matchedCanonicalIds.add(trimString(resolved.canonicalModelId).toLowerCase())
    const currentComparable = normalizeCurrentRegistryModel(resolved.model)
    const fieldConflicts = compareModels(currentComparable, upstreamModel)
      .filter((conflict) => !isIntentionalPolicyConflict(
        providerId,
        resolved.canonicalModelId,
        conflict.field,
        conflict.current,
        conflict.upstream,
      ))
    if (fieldConflicts.length === 0) continue
    conflicts.push({
      requestedModelId: upstreamModel.id,
      canonicalModelId: trimString(resolved.canonicalModelId),
      matchedBy: trimString(resolved.matchedBy),
      conflicts: fieldConflicts,
    })
  }

  const onlyInAddom = currentModels
    .map((model) => trimString(model.id))
    .filter(Boolean)
    .filter((modelId) => !matchedCanonicalIds.has(modelId.toLowerCase()))
    .sort((left, right) => left.localeCompare(right))

  return {
    providerId,
    upstreamProviderId,
    addomModelCount: currentModels.length,
    modelsDevModelCount: Array.isArray(upstreamProvider?.models) ? upstreamProvider.models.length : 0,
    conflictingModelCount: conflicts.length,
    onlyInAddom,
    onlyInModelsDev,
    conflicts,
  }
}

async function buildReport({ vendorRoot, providerIds = [] } = {}) {
  const currentRegistryIndex = buildCurrentRegistryIndex()
  if (String(vendorRoot || '').toLowerCase().endsWith('.normalized.json')) {
    const lockPath = path.join(path.dirname(path.resolve(vendorRoot)), 'models-dev.lock.json')
    const { source } = await readNormalizedCatalogSource({
      sourcePath: vendorRoot,
      lockPath,
    })
    const selectedProviders = providerIds.length > 0
      ? source.catalog.filter((provider) => providerIds.includes(provider.providerId))
      : source.catalog
    return buildReportSummary(selectedProviders.map((provider) => {
      const upstreamProvider = {
        upstreamProviderId: provider.providerId,
        providerId: provider.providerId,
        models: provider.models.map((model) => normalizeCurrentRegistryModel(model)),
      }
      return buildProviderReport(
        currentRegistryIndex.get(upstreamProvider.providerId) || null,
        upstreamProvider,
      )
    }), vendorRoot)
  }
  const availableVendorProviders = await listPortableModelsDevProviders(vendorRoot)
  const selectedVendorProviders = providerIds.length > 0
    ? availableVendorProviders.filter((providerId) => providerIds.includes(mapModelsDevProviderId(providerId)))
    : availableVendorProviders

  const providerReports = []
  for (const upstreamProviderId of selectedVendorProviders) {
    const loadedProvider = await loadPortableModelsDevProvider(vendorRoot, upstreamProviderId)
    const upstreamProvider = {
      upstreamProviderId: loadedProvider.upstreamProviderId,
      providerId: loadedProvider.providerId,
      models: loadedProvider.models.map((model) => normalizeModelsDevModel(model)),
    }
    const currentProvider = currentRegistryIndex.get(upstreamProvider.providerId) || null
    if (!currentProvider) continue
    providerReports.push(buildProviderReport(currentProvider, upstreamProvider))
  }

  return buildReportSummary(providerReports, vendorRoot)
}

function buildReportSummary(providerReports, vendorRoot) {
  const summary = providerReports.reduce((acc, provider) => {
    acc.providerCount += 1
    acc.conflictingProviders += provider.conflictingModelCount > 0 ? 1 : 0
    acc.conflictingModels += provider.conflictingModelCount
    acc.onlyInAddom += provider.onlyInAddom.length
    acc.onlyInModelsDev += provider.onlyInModelsDev.length
    return acc
  }, {
    providerCount: 0,
    conflictingProviders: 0,
    conflictingModels: 0,
    onlyInAddom: 0,
    onlyInModelsDev: 0,
  })

  return {
    generatedAt: new Date().toISOString(),
    vendorRoot,
    providers: providerReports,
    summary,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const report = await buildReport(options)
  await mkdir(path.dirname(path.resolve(options.output)), { recursive: true })
  await writeFile(path.resolve(options.output), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(`Wrote model catalog drift report: ${path.resolve(options.output)}`)
  console.log(`Providers: ${report.summary.providerCount}`)
  console.log(`Conflicting models: ${report.summary.conflictingModels}`)
  console.log(`Only in ADDOM: ${report.summary.onlyInAddom}`)
  console.log(`Only in models.dev: ${report.summary.onlyInModelsDev}`)
}

await main()
