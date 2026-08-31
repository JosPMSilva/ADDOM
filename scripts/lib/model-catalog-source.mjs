import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const MODEL_CATALOG_SOURCE_SCHEMA_VERSION = 1
export const DEFAULT_MODEL_CATALOG_SOURCE = path.resolve(
  'catalog-source/models-dev.normalized.json',
)
export const DEFAULT_MODEL_CATALOG_LOCK = path.resolve(
  'catalog-source/models-dev.lock.json',
)

export function sha256(contents) {
  return `sha256:${createHash('sha256').update(contents).digest('hex')}`
}

function requireCondition(condition, message) {
  if (!condition) throw new TypeError(message)
}

function requireGitObjectId(value, field) {
  const normalized = String(value || '').trim().toLowerCase()
  requireCondition(/^[a-f0-9]{40}$/.test(normalized), `${field} must be a full Git object ID`)
  return normalized
}

export function validateNormalizedCatalogSource(source) {
  requireCondition(
    source?.schemaVersion === MODEL_CATALOG_SOURCE_SCHEMA_VERSION,
    `Unsupported model catalog source schema: ${source?.schemaVersion ?? '(missing)'}`,
  )
  requireCondition(Array.isArray(source.catalog), 'Normalized model catalog source requires catalog')
  requireCondition(source.catalog.length > 0, 'Normalized model catalog source cannot be empty')
  requireCondition(
    source.providerLogos && typeof source.providerLogos === 'object',
    'Normalized model catalog source requires providerLogos',
  )
  return source
}

export function validateModelCatalogSourceLock(lock, sourceContents) {
  requireCondition(
    lock?.schemaVersion === MODEL_CATALOG_SOURCE_SCHEMA_VERSION,
    `Unsupported model catalog lock schema: ${lock?.schemaVersion ?? '(missing)'}`,
  )
  requireCondition(
    /^https:\/\/github\.com\/[^/]+\/[^/]+\.git$/.test(String(lock?.upstream?.repository || '')),
    'Model catalog lock requires an HTTPS Git repository',
  )
  requireGitObjectId(lock?.upstream?.commit, 'upstream.commit')
  requireGitObjectId(lock?.upstream?.tree, 'upstream.tree')
  requireCondition(lock.sourceDigest === sha256(sourceContents), 'Model catalog source digest mismatch')
  return lock
}

export async function readNormalizedCatalogSource({
  sourcePath = DEFAULT_MODEL_CATALOG_SOURCE,
  lockPath = DEFAULT_MODEL_CATALOG_LOCK,
} = {}) {
  const [sourceContents, lockContents] = await Promise.all([
    readFile(path.resolve(sourcePath)),
    readFile(path.resolve(lockPath), 'utf8'),
  ])
  const source = validateNormalizedCatalogSource(
    JSON.parse(sourceContents.toString('utf8')),
  )
  const lock = validateModelCatalogSourceLock(
    JSON.parse(lockContents),
    sourceContents,
  )
  const providerCount = source.catalog.length
  const modelCount = source.catalog.reduce(
    (sum, provider) => sum + (Array.isArray(provider.models) ? provider.models.length : 0),
    0,
  )
  requireCondition(lock.providerCount === providerCount, 'Model catalog provider count mismatch')
  requireCondition(lock.modelCount === modelCount, 'Model catalog model count mismatch')
  return { lock, source, sourceContents }
}

export async function writeNormalizedCatalogSource({
  source,
  sourcePath,
  lockPath,
  upstream,
} = {}) {
  validateNormalizedCatalogSource(source)
  const sourceContents = Buffer.from(`${JSON.stringify(source)}\n`, 'utf8')
  const providerCount = source.catalog.length
  const modelCount = source.catalog.reduce(
    (sum, provider) => sum + (Array.isArray(provider.models) ? provider.models.length : 0),
    0,
  )
  const lock = {
    schemaVersion: MODEL_CATALOG_SOURCE_SCHEMA_VERSION,
    upstream: {
      repository: String(upstream?.repository || '').trim(),
      commit: requireGitObjectId(upstream?.commit, 'upstream.commit'),
      tree: requireGitObjectId(upstream?.tree, 'upstream.tree'),
    },
    sourceDigest: sha256(sourceContents),
    providerCount,
    modelCount,
  }
  validateModelCatalogSourceLock(lock, sourceContents)
  await Promise.all([
    mkdir(path.dirname(path.resolve(sourcePath)), { recursive: true }),
    mkdir(path.dirname(path.resolve(lockPath)), { recursive: true }),
  ])
  await Promise.all([
    writeFile(path.resolve(sourcePath), sourceContents),
    writeFile(path.resolve(lockPath), `${JSON.stringify(lock, null, 2)}\n`, 'utf8'),
  ])
  return { lock, sourceContents }
}
