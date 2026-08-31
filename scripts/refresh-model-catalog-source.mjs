import { execFileSync } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  buildCatalogSnapshot,
  buildProviderLogoManifest,
  generateModelCatalog,
  loadPortableTomlSource,
} from './generate-model-catalog.mjs'
import {
  DEFAULT_MODEL_CATALOG_SOURCE,
  MODEL_CATALOG_SOURCE_SCHEMA_VERSION,
  readNormalizedCatalogSource,
  writeNormalizedCatalogSource,
} from './lib/model-catalog-source.mjs'

const REPOSITORY_URL = 'https://github.com/anomalyco/models.dev.git'
const REPOSITORY_ROOT = path.resolve('.')
const CACHE_ROOT = path.join(REPOSITORY_ROOT, '.cache')
const DEFAULT_INPUT = path.resolve('.cache/models.dev-portable/providers')
const DEFAULT_MIRROR = path.resolve('.cache/models.dev.git')
const DEFAULT_REVIEW_ROOT = path.resolve('.cache/model-catalog-review')

function assertReviewOutput(output) {
  const resolved = path.resolve(output)
  const relative = path.relative(CACHE_ROOT, resolved)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new TypeError('Catalog refresh output must be a child of the repository .cache directory')
  }
  return resolved
}

function parseArgs(argv) {
  const parsed = {
    input: DEFAULT_INPUT,
    mirror: DEFAULT_MIRROR,
    output: DEFAULT_REVIEW_ROOT,
  }
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = String(argv[index + 1] || '').trim()
    if (!value) throw new TypeError(`Missing value for ${flag}`)
    if (flag === '--input') parsed.input = path.resolve(value)
    else if (flag === '--mirror') parsed.mirror = path.resolve(value)
    else if (flag === '--output') parsed.output = assertReviewOutput(value)
    else throw new TypeError(`Unknown flag: ${flag}`)
  }
  parsed.output = assertReviewOutput(parsed.output)
  return parsed
}

function gitObject(mirror, revision) {
  return execFileSync('git', [`--git-dir=${mirror}`, 'rev-parse', revision], {
    encoding: 'utf8',
  }).trim().toLowerCase()
}

function modelMap(catalog = []) {
  const result = new Map()
  for (const provider of catalog) {
    for (const model of Array.isArray(provider.models) ? provider.models : []) {
      result.set(`${provider.providerId}/${model.id}`, model)
    }
  }
  return result
}

function semanticChanges(previousCatalog = [], nextCatalog = []) {
  const previousProviders = new Set(previousCatalog.map((provider) => provider.providerId))
  const nextProviders = new Set(nextCatalog.map((provider) => provider.providerId))
  const previousModels = modelMap(previousCatalog)
  const nextModels = modelMap(nextCatalog)
  const changedModels = [...nextModels.keys()].filter((key) => (
    previousModels.has(key)
    && JSON.stringify(previousModels.get(key)) !== JSON.stringify(nextModels.get(key))
  ))
  const changedByField = (field) => changedModels.filter((key) => (
    JSON.stringify(previousModels.get(key)?.[field] ?? null)
      !== JSON.stringify(nextModels.get(key)?.[field] ?? null)
  )).sort()
  const pricingChanged = changedByField('pricing')
  const limitsChanged = changedByField('limits')
  const capabilitiesChanged = changedByField('capabilities')
  const classified = new Set([
    ...pricingChanged,
    ...limitsChanged,
    ...capabilitiesChanged,
  ])
  return {
    providersAdded: [...nextProviders].filter((id) => !previousProviders.has(id)).sort(),
    providersRemoved: [...previousProviders].filter((id) => !nextProviders.has(id)).sort(),
    modelsAdded: [...nextModels.keys()].filter((key) => !previousModels.has(key)).sort(),
    modelsRemoved: [...previousModels.keys()].filter((key) => !nextModels.has(key)).sort(),
    modelsChanged: changedModels.sort(),
    pricingChanged,
    limitsChanged,
    capabilitiesChanged,
    metadataChanged: changedModels.filter((key) => !classified.has(key)).sort(),
  }
}

function listSection(label, values) {
  return [
    `## ${label} (${values.length})`,
    '',
    ...(values.length > 0 ? values.map((value) => `- \`${value}\``) : ['None.']),
    '',
  ]
}

function renderReport({ commit, tree, changes }) {
  return [
    '# models.dev Catalog Refresh Candidate',
    '',
    `- Repository: ${REPOSITORY_URL}`,
    `- Commit: \`${commit}\``,
    `- Tree: \`${tree}\``,
    '',
    'This candidate does not affect ADDOM until `npm run catalog:accept:refresh` is run.',
    'Review removals and capability/pricing changes before accepting it.',
    '',
    ...listSection('Providers added', changes.providersAdded),
    ...listSection('Providers removed', changes.providersRemoved),
    ...listSection('Models added', changes.modelsAdded),
    ...listSection('Models removed', changes.modelsRemoved),
    ...listSection('Pricing changed', changes.pricingChanged),
    ...listSection('Limits changed', changes.limitsChanged),
    ...listSection('Capabilities changed', changes.capabilitiesChanged),
    ...listSection('Other model metadata changed', changes.metadataChanged),
  ].join('\n')
}

async function readCurrentCatalog() {
  try {
    return (await readNormalizedCatalogSource()).source.catalog
  } catch {
    try {
      const module = await import('../src/common/api-clients/generated/model-catalog.snapshot.mjs')
      return module.GENERATED_MODEL_CATALOG_SNAPSHOT
    } catch {
      return []
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const sourcePath = path.join(options.output, 'models-dev.normalized.json')
  const lockPath = path.join(options.output, 'models-dev.lock.json')
  const generatedRoot = path.join(options.output, 'generated')
  const generatedSnapshot = path.join(generatedRoot, 'model-catalog.snapshot.mjs')
  const artifactBase = path.resolve(options.input, '..')
  const [sourceData, previousCatalog] = await Promise.all([
    loadPortableTomlSource(options.input),
    readCurrentCatalog(),
  ])
  const catalog = buildCatalogSnapshot(sourceData, { artifactBase })
  await rm(options.output, { recursive: true, force: true })
  await mkdir(generatedRoot, { recursive: true })
  const providerLogos = await buildProviderLogoManifest(options.input, {
    artifactBase,
    logoAssetsDir: path.join(generatedRoot, 'provider-logos'),
  })
  const commit = gitObject(options.mirror, 'HEAD')
  const tree = gitObject(options.mirror, 'HEAD^{tree}')
  const source = {
    schemaVersion: MODEL_CATALOG_SOURCE_SCHEMA_VERSION,
    catalog,
    providerLogos,
  }
  await writeNormalizedCatalogSource({
    source,
    sourcePath,
    lockPath,
    upstream: { repository: REPOSITORY_URL, commit, tree },
  })
  await generateModelCatalog({
    input: sourcePath,
    lock: lockPath,
    output: generatedSnapshot,
  })
  const changes = semanticChanges(previousCatalog, catalog)
  const report = renderReport({ commit, tree, changes })
  await writeFile(path.join(options.output, 'refresh-report.md'), report, 'utf8')
  console.log(`Catalog refresh candidate: ${options.output}`)
  console.log(`Review report: ${path.join(options.output, 'refresh-report.md')}`)
  console.log(`Tracked source remains unchanged: ${DEFAULT_MODEL_CATALOG_SOURCE}`)
}

await main()
