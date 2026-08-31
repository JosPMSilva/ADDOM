import { access, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_MODEL_CATALOG_LOCK,
  DEFAULT_MODEL_CATALOG_SOURCE,
  readNormalizedCatalogSource,
} from './lib/model-catalog-source.mjs'
import {
  loadPortableModelsDevProvider,
  listPortableModelsDevProviders,
  mapModelsDevProviderId,
} from './lib/models-dev-portable.mjs'
import {
  buildPricingFromRawCost,
} from './lib/model-catalog-pricing.mjs'

import {
  attachGeneratedSourceFileProvenance,
  buildGeneratedModelFieldProvenance,
  buildGeneratedProviderFieldProvenance,
} from '../src/common/api-clients/model-catalog-provenance.mjs'
import { normalizeCatalog } from '../src/common/api-clients/model-catalog-schema.mjs'

const SOURCE_URL = 'https://models.dev/api.json'
const DEFAULT_VENDOR_ROOT = DEFAULT_MODEL_CATALOG_SOURCE
const CURATED_PROVIDER_ORDER = Object.freeze([
  'openai',
  'anthropic',
  'google',
  'moonshotai',
  'xai',
  'groq',
  'mistral',
  'deepseek',
  'perplexity',
  'openrouter',
])

const PROVIDER_NAME_MAP = Object.freeze({
  gemini: 'Google Gemini',
  moonshot: 'Moonshot AI',
  grok: 'xAI Grok',
})

const DEFAULT_OUTPUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/common/api-clients/generated/model-catalog.snapshot.mjs',
)

function toPosixPath(value = '') {
  return String(value || '').replace(/\\/g, '/')
}

function parseArgs(argv) {
  const args = [...argv]
  const parsed = {
    input: process.env.ADDOM_MODEL_CATALOG_INPUT || DEFAULT_VENDOR_ROOT,
    lock: process.env.ADDOM_MODEL_CATALOG_LOCK || DEFAULT_MODEL_CATALOG_LOCK,
    output: process.env.ADDOM_MODEL_CATALOG_OUTPUT || DEFAULT_OUTPUT,
  }

  while (args.length > 0) {
    const flag = String(args.shift() || '').trim()
    if (flag === '--input') {
      parsed.input = String(args.shift() || '').trim()
      continue
    }
    if (flag === '--output') {
      parsed.output = String(args.shift() || '').trim()
      continue
    }
    if (flag === '--lock') {
      parsed.lock = String(args.shift() || '').trim()
      continue
    }
    throw new Error(`Unknown flag: ${flag}`)
  }

  if (!parsed.input) throw new Error('Missing --input value.')
  if (!parsed.lock) throw new Error('Missing --lock value.')
  if (!parsed.output) throw new Error('Missing --output value.')
  return parsed
}

function resolvePortableArtifactBase(input) {
  const normalizedInput = path.resolve(input)
  return path.resolve(normalizedInput, '..')
}

function normalizePortableArtifactPath(filePath, {
  artifactBase,
} = {}) {
  const normalizedFilePath = path.resolve(filePath)
  const basePath = artifactBase ? path.resolve(artifactBase) : path.resolve(path.dirname(normalizedFilePath), '..')
  const relativePath = path.relative(basePath, normalizedFilePath)
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return toPosixPath(normalizedFilePath)
  }
  return toPosixPath(relativePath)
}

function sanitizeLogoAssetName(providerId = '') {
  return String(providerId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
}

function isHttpUrl(value = '') {
  return /^https?:\/\//i.test(String(value || '').trim())
}

async function loadSource(input) {
  if (isHttpUrl(input)) {
    const response = await fetch(input)
    if (!response.ok) {
      throw new Error(`Failed to fetch ${input}: HTTP ${response.status}`)
    }
    return response.json()
  }

  const fileContents = await readFile(path.resolve(input), 'utf8')
  return JSON.parse(fileContents)
}

export async function loadPortableTomlSource(vendorRoot) {
  const availableProviders = await listPortableModelsDevProviders(vendorRoot)
  const result = {}
  for (const upstreamProviderId of availableProviders) {
    const loaded = await loadPortableModelsDevProvider(vendorRoot, upstreamProviderId)
    result[upstreamProviderId] = {
      id: upstreamProviderId,
      name: loaded.provider?.name || loaded.providerId,
      env: loaded.provider?.env,
      npm: loaded.provider?.npm,
      doc: loaded.provider?.doc,
      __sourceFile: loaded.provider?.__sourceFile,
      models: Object.fromEntries(
        loaded.models.map((model) => [model.id, model]),
      ),
    }
  }
  return result
}

function inferAttachmentKinds(inputModalities = []) {
  const kinds = []
  for (const modality of inputModalities) {
    const normalized = String(modality || '').trim().toLowerCase()
    if (normalized === 'image' || normalized === 'pdf' || normalized === 'file') {
      kinds.push(normalized)
    }
  }
  return [...new Set(kinds)]
}

function mapProviderId(upstreamProviderId = '') {
  return mapModelsDevProviderId(upstreamProviderId)
}

function mapProviderName(upstreamProvider = {}, addomProviderId = '') {
  return PROVIDER_NAME_MAP[addomProviderId] || String(upstreamProvider?.name || addomProviderId)
}

function transformModel(upstreamModel = {}, upstreamProvider = {}, addomProviderId = '', {
  artifactBase = null,
} = {}) {
  const inputModalities = Array.isArray(upstreamModel?.modalities?.input)
    ? upstreamModel.modalities.input.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
    : []
  const outputModalities = Array.isArray(upstreamModel?.modalities?.output)
    ? upstreamModel.modalities.output.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
    : []
  const attachmentKinds = inferAttachmentKinds(inputModalities)
  const pricing = buildPricingFromRawCost(upstreamModel?.cost)

  const modelEntry = {
    id: String(upstreamModel?.id || '').trim(),
    label: String(upstreamModel?.name || upstreamModel?.id || '').trim(),
    group: String(upstreamModel?.family || 'Other').trim(),
    ...(String(upstreamModel?.release_date || '').trim() ? { releaseDate: String(upstreamModel.release_date).trim() } : {}),
    ...(String(upstreamModel?.last_updated || '').trim() ? { lastUpdated: String(upstreamModel.last_updated).trim() } : {}),
    ...(String(upstreamModel?.knowledge || '').trim() ? { knowledge: String(upstreamModel.knowledge).trim() } : {}),
    ...(typeof upstreamModel?.structured_output === 'boolean' ? { structuredOutput: upstreamModel.structured_output === true } : {}),
    ...(typeof upstreamModel?.open_weights === 'boolean' ? { openWeights: upstreamModel.open_weights === true } : {}),
    limits: {
      context: Number.isFinite(upstreamModel?.limit?.context) ? Number(upstreamModel.limit.context) : null,
      input: Number.isFinite(upstreamModel?.limit?.input) ? Number(upstreamModel.limit.input) : null,
      output: Number.isFinite(upstreamModel?.limit?.output) ? Number(upstreamModel.limit.output) : null,
    },
    pricing,
    capabilities: {
      reasoning: { supported: upstreamModel?.reasoning === true },
      toolCall: { supported: upstreamModel?.tool_call === true },
      attachment: {
        supported: upstreamModel?.attachment === true,
        kinds: attachmentKinds,
        modalities: inputModalities,
      },
      interleavedReasoning: { supported: upstreamModel?.interleaved === true },
      inputModalities,
      outputModalities,
    },
    providerTransport: String(upstreamProvider?.api || upstreamProvider?.npm || '').trim() || null,
    defaultProviderOptions: {},
    variants: [],
    availability: {
      status: 'unknown',
      gates: [`upstream:${String(upstreamProvider?.id || addomProviderId)}`],
    },
    provenance: {
      source: 'models.dev',
      sourceUrl: String(upstreamProvider?.doc || SOURCE_URL).trim(),
      sourceFile: String(
        upstreamModel?.__sourceFile
          ? normalizePortableArtifactPath(upstreamModel.__sourceFile, { artifactBase })
          : '',
      ).trim() || null,
      verifiedAt: String(upstreamModel?.last_updated || upstreamModel?.release_date || '').trim() || null,
      trustLevel: 'estimated',
    },
    ...(String(upstreamModel?.status || '').trim().toLowerCase() === 'deprecated' ? { deprecated: true } : {}),
  }
  modelEntry.provenance = attachGeneratedSourceFileProvenance(
    modelEntry.provenance,
    upstreamModel?.__sourceFile
      ? normalizePortableArtifactPath(upstreamModel.__sourceFile, { artifactBase })
      : '',
  )
  modelEntry.provenance.fields = buildGeneratedModelFieldProvenance(modelEntry)
  return modelEntry
}

function transformProvider(upstreamProviderId, upstreamProvider = {}, {
  artifactBase = null,
} = {}) {
  const addomProviderId = mapProviderId(upstreamProviderId)
  const models = Object.values(upstreamProvider?.models || {})
    .map((model) => transformModel(model, upstreamProvider, addomProviderId, { artifactBase }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))

  const providerEntry = {
    providerId: addomProviderId,
    name: mapProviderName(upstreamProvider, addomProviderId),
    defaultModel: models[0]?.id || '',
    ...(Array.isArray(upstreamProvider?.env) && upstreamProvider.env.length > 0
      ? {
          env: upstreamProvider.env.map((value) => String(value || '').trim()).filter(Boolean),
          keyHint: String(upstreamProvider.env[0] || '').trim() || undefined,
        }
      : (String(upstreamProvider?.env || '').trim() ? { keyHint: String(upstreamProvider.env).trim() } : {})),
    ...(String(upstreamProvider?.doc || '').trim() ? { keyUrl: String(upstreamProvider.doc).trim() } : {}),
    ...(String(upstreamProvider?.doc || '').trim() ? { termsUrl: String(upstreamProvider.doc).trim() } : {}),
    ...(String(upstreamProvider?.api || '').trim() ? { baseUrl: String(upstreamProvider.api).trim() } : {}),
    availability: {
      status: 'unknown',
      requiresKey: true,
      gates: [`upstream:${String(upstreamProviderId).trim()}`],
    },
    provenance: {
      source: 'models.dev',
      sourceUrl: String(upstreamProvider?.doc || SOURCE_URL).trim(),
      sourceFile: String(
        upstreamProvider?.__sourceFile
          ? normalizePortableArtifactPath(upstreamProvider.__sourceFile, { artifactBase })
          : '',
      ).trim() || null,
      verifiedAt: null,
      trustLevel: 'estimated',
    },
    models,
  }
  providerEntry.provenance = attachGeneratedSourceFileProvenance(
    providerEntry.provenance,
    upstreamProvider?.__sourceFile
      ? normalizePortableArtifactPath(upstreamProvider.__sourceFile, { artifactBase })
      : '',
  )
  providerEntry.provenance.fields = buildGeneratedProviderFieldProvenance(providerEntry)
  return providerEntry
}

export function buildCatalogSnapshot(sourceData, {
  artifactBase = null,
} = {}) {
  return normalizeCatalog(
    CURATED_PROVIDER_ORDER
      .map((providerId) => [providerId, sourceData?.[providerId]])
      .filter(([, provider]) => provider && typeof provider === 'object')
      .map(([providerId, provider]) => transformProvider(providerId, provider, { artifactBase })),
  )
}

function renderModule(sourceUrl, snapshot) {
  const serialized = JSON.stringify(snapshot, null, 2)
  return [
    `export const GENERATED_MODEL_CATALOG_SOURCE_URL = ${JSON.stringify(sourceUrl)}`,
    '',
    `export const GENERATED_MODEL_CATALOG_SNAPSHOT = ${serialized}`,
    '',
  ].join('\n')
}

export function buildGeneratedLookup(snapshot = [], logoManifest = {}) {
  const providersById = {}
  const modelsByProviderId = {}

  for (const [providerIndex, provider] of snapshot.entries()) {
    const providerId = String(provider?.providerId || '').trim()
    if (!providerId) continue
    providersById[providerId] = {
      index: providerIndex,
      providerId,
      name: String(provider?.name || providerId).trim(),
      defaultModel: String(provider?.defaultModel || '').trim() || null,
      sourceFile: String(provider?.provenance?.sourceFile || '').trim() || null,
      logoPath: String(logoManifest?.[providerId]?.path || '').trim() || null,
      upstreamProviderId: String(logoManifest?.[providerId]?.upstreamProviderId || providerId).trim(),
    }

    modelsByProviderId[providerId] = Object.fromEntries(
      (Array.isArray(provider?.models) ? provider.models : []).map((model, modelIndex) => {
        const modelId = String(model?.id || '').trim()
        return [modelId, {
          index: modelIndex,
          id: modelId,
          label: String(model?.label || modelId).trim(),
          group: String(model?.group || '').trim() || null,
          sourceFile: String(model?.provenance?.sourceFile || '').trim() || null,
          deprecated: model?.deprecated === true,
        }]
      }),
    )
  }

  return {
    providersById,
    modelsByProviderId,
  }
}

export function buildGeneratedProvenanceMap(snapshot = []) {
  const providersById = {}
  const modelsByProviderId = {}

  for (const provider of snapshot) {
    const providerId = String(provider?.providerId || '').trim()
    if (!providerId) continue
    providersById[providerId] = {
      source: String(provider?.provenance?.source || '').trim() || 'unknown',
      sourceUrl: String(provider?.provenance?.sourceUrl || '').trim() || null,
      sourceFile: String(provider?.provenance?.sourceFile || '').trim() || null,
      verifiedAt: String(provider?.provenance?.verifiedAt || '').trim() || null,
      trustLevel: String(provider?.provenance?.trustLevel || '').trim() || 'unknown',
      fields: provider?.provenance?.fields || {},
    }

    modelsByProviderId[providerId] = Object.fromEntries(
      (Array.isArray(provider?.models) ? provider.models : []).map((model) => {
        const modelId = String(model?.id || '').trim()
        return [modelId, {
          source: String(model?.provenance?.source || '').trim() || 'unknown',
          sourceUrl: String(model?.provenance?.sourceUrl || '').trim() || null,
          sourceFile: String(model?.provenance?.sourceFile || '').trim() || null,
          verifiedAt: String(model?.provenance?.verifiedAt || '').trim() || null,
          trustLevel: String(model?.provenance?.trustLevel || '').trim() || 'unknown',
          fields: model?.provenance?.fields || {},
        }]
      }),
    )
  }

  return {
    providersById,
    modelsByProviderId,
  }
}

export async function buildProviderLogoManifest(vendorRoot, {
  artifactBase = null,
  logoAssetsDir = '',
} = {}) {
  const availableProviders = await listPortableModelsDevProviders(vendorRoot)
  const curatedProviders = CURATED_PROVIDER_ORDER.filter((providerId) => (
    availableProviders.includes(providerId)
  ))
  const manifest = {}
  const missingLogos = []
  const resolvedLogoAssetsDir = path.resolve(logoAssetsDir)
  const logoAssetBase = path.resolve(resolvedLogoAssetsDir, '..')

  await rm(resolvedLogoAssetsDir, { recursive: true, force: true })
  await mkdir(resolvedLogoAssetsDir, { recursive: true })

  for (const upstreamProviderId of curatedProviders) {
    const providerId = mapProviderId(upstreamProviderId)
    const logoFilePath = path.join(vendorRoot, upstreamProviderId, 'logo.svg')
    try {
      await access(logoFilePath)
    } catch {
      missingLogos.push(upstreamProviderId)
      continue
    }
    const outputFileName = `${sanitizeLogoAssetName(providerId)}.svg`
    const outputFilePath = path.join(resolvedLogoAssetsDir, outputFileName)
    await copyFile(logoFilePath, outputFilePath)
    manifest[providerId] = {
      providerId,
      upstreamProviderId,
      path: normalizePortableArtifactPath(outputFilePath, { artifactBase: logoAssetBase }),
      sourcePath: normalizePortableArtifactPath(logoFilePath, { artifactBase }),
    }
  }

  if (missingLogos.length > 0) {
    console.warn(`Skipped provider logos with no upstream logo.svg: ${missingLogos.join(', ')}`)
  }

  return manifest
}

function renderAuxiliaryModule(exportName, value) {
  return [
    `export const ${exportName} = ${JSON.stringify(value, null, 2)}`,
    '',
  ].join('\n')
}

function buildArtifactPaths(outputFile) {
  const normalizedOutput = path.resolve(outputFile)
  const ext = path.extname(normalizedOutput)
  const rawStem = normalizedOutput.slice(0, normalizedOutput.length - ext.length)
  const stem = rawStem.endsWith('.snapshot')
    ? rawStem.slice(0, rawStem.length - '.snapshot'.length)
    : rawStem
  return {
    snapshot: normalizedOutput,
    lookup: `${stem}.lookup${ext}`,
    logos: `${stem}.provider-logos${ext}`,
    provenance: `${stem}.provenance-map${ext}`,
    logoAssetsDir: path.join(path.dirname(normalizedOutput), 'provider-logos'),
  }
}

export async function generateModelCatalog({
  input,
  lock,
  output,
} = {}) {
  const normalizedInput = String(input || '').trim()
  const usesPortableTomlSource = !isHttpUrl(normalizedInput)
    && !normalizedInput.toLowerCase().endsWith('.json')
  const usesTrackedSource = !isHttpUrl(normalizedInput)
    && normalizedInput.toLowerCase().endsWith('.normalized.json')
  const tracked = usesTrackedSource
    ? await readNormalizedCatalogSource({
        sourcePath: normalizedInput,
        lockPath: lock,
      })
    : null
  const sourceData = tracked
    ? null
    : (isHttpUrl(normalizedInput) || normalizedInput.toLowerCase().endsWith('.json')
      ? await loadSource(normalizedInput)
      : await loadPortableTomlSource(path.resolve(normalizedInput)))
  const artifactBase = usesPortableTomlSource
    ? resolvePortableArtifactBase(normalizedInput)
    : null
  const renderedSourceRef = tracked
    ? `${tracked.lock.upstream.repository.replace(/\.git$/, '')}/tree/${tracked.lock.upstream.commit}`
    : (usesPortableTomlSource
      ? normalizePortableArtifactPath(path.resolve(normalizedInput), { artifactBase })
      : normalizedInput)
  const snapshot = tracked
    ? tracked.source.catalog
    : buildCatalogSnapshot(sourceData, { artifactBase })
  const artifactPaths = buildArtifactPaths(output)
  const logoManifest = tracked
    ? tracked.source.providerLogos
    : (usesPortableTomlSource
    ? await buildProviderLogoManifest(path.resolve(input), {
        artifactBase,
        logoAssetsDir: artifactPaths.logoAssetsDir,
      })
      : {})
  const lookup = buildGeneratedLookup(snapshot, logoManifest)
  const provenanceMap = buildGeneratedProvenanceMap(snapshot)

  await mkdir(path.dirname(artifactPaths.snapshot), { recursive: true })
  await writeFile(artifactPaths.snapshot, renderModule(renderedSourceRef, snapshot), 'utf8')
  await writeFile(artifactPaths.lookup, renderAuxiliaryModule('GENERATED_MODEL_CATALOG_LOOKUP', lookup), 'utf8')
  await writeFile(artifactPaths.logos, renderAuxiliaryModule('GENERATED_MODEL_CATALOG_PROVIDER_LOGOS', logoManifest), 'utf8')
  await writeFile(artifactPaths.provenance, renderAuxiliaryModule('GENERATED_MODEL_CATALOG_PROVENANCE_MAP', provenanceMap), 'utf8')
  console.log(`Generated model catalog snapshot: ${artifactPaths.snapshot}`)
  console.log(`Generated model catalog lookup: ${artifactPaths.lookup}`)
  console.log(`Generated model catalog provider logos: ${artifactPaths.logos}`)
  console.log(`Generated model catalog provider logo assets: ${artifactPaths.logoAssetsDir}`)
  console.log(`Generated model catalog provenance map: ${artifactPaths.provenance}`)
  console.log(`Providers: ${snapshot.map((provider) => provider.providerId).join(', ')}`)
  return { artifactPaths, logoManifest, snapshot }
}

async function main() {
  return generateModelCatalog(parseArgs(process.argv.slice(2)))
}

const isEntrypoint = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false

if (isEntrypoint) {
  await main()
}
