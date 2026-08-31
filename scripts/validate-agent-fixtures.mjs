import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const AGENT_FIXTURE_SCHEMA_VERSION = 1

export const REQUIRED_AGENT_FIXTURE_IDS = Object.freeze([
  'background-child-cancellation',
  'buffered-lifecycle-interleave',
  'child-transcript-replay',
  'cursor-root-session',
  'duplicate-transport',
  'flat-moa-completion',
  'foreground-background-detachment',
  'generic-provider-tool-stream',
  'openai-native-collaboration',
  'out-of-order-transport',
  'restart-sequence-reseed',
  'spawn-query-initialization',
])

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '..')
const DEFAULT_FIXTURE_ROOT = path.join(REPOSITORY_ROOT, 'tests', 'fixtures', 'agent-runs')
const PLACEHOLDER_PATTERN = /^<[a-z0-9]+(?:-[a-z0-9]+)*>$/
const FIXTURE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const HASH_PATTERN = /^[a-f0-9]{64}$/
const ABSOLUTE_PATH_PATTERNS = [
  /(?:^|["'\s])(?:[a-zA-Z]:[\\/]|\\\\[^\\\s]+[\\/]|\/(?:Users|home|root|private|var\/folders)\/)/,
  /file:\/\//i,
]
const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{8,}\b/,
  /\b(?:ghp|github_pat|xox[baprs])[_-][A-Za-z0-9_-]{8,}\b/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{8,}/i,
]
const PRIVATE_PROMPT_KEYS = new Set([
  'privatePrompt',
  'rawPrompt',
  'systemPrompt',
  'developerPrompt',
])

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )).join(',')}}`
  }
  return JSON.stringify(value)
}

function hashCanonicalJson(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex')
}

function collectSensitiveShapeErrors(value, location, errors) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectSensitiveShapeErrors(entry, `${location}[${index}]`, errors))
    return
  }
  if (!value || typeof value !== 'object') return

  for (const [key, entry] of Object.entries(value)) {
    const entryLocation = `${location}.${key}`
    if (PRIVATE_PROMPT_KEYS.has(key)) {
      errors.push(`${entryLocation} is forbidden in sanitized fixtures`)
    }
    if (/(?:^|_)(?:id|ids)$/i.test(key) || /Id(?:s)?$/.test(key)) {
      const values = Array.isArray(entry) ? entry : [entry]
      values.forEach((candidate) => {
        if (candidate !== null && candidate !== '' && !PLACEHOLDER_PATTERN.test(String(candidate))) {
          errors.push(`${entryLocation} must use a declared placeholder`)
        }
      })
    }
    if (/timestamp/i.test(key) && !PLACEHOLDER_PATTERN.test(String(entry))) {
      errors.push(`${entryLocation} must use a declared placeholder`)
    }
    collectSensitiveShapeErrors(entry, entryLocation, errors)
  }
}

function validateManifest(manifest, fixtureId, errors) {
  if (manifest?.schemaVersion !== AGENT_FIXTURE_SCHEMA_VERSION) {
    errors.push(`${fixtureId}: unknown manifest schemaVersion ${String(manifest?.schemaVersion)}`)
  }
  if (manifest?.fixtureId !== fixtureId) errors.push(`${fixtureId}: manifest fixtureId mismatch`)
  if (!['sanitized_existing_test', 'sanitized_existing_fixture', 'synthetic_contract'].includes(manifest?.sourceClass)) {
    errors.push(`${fixtureId}: unsupported sourceClass`)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(manifest?.captureDate || ''))) {
    errors.push(`${fixtureId}: captureDate must be YYYY-MM-DD`)
  }
  if (typeof manifest?.providerRuntimeClass !== 'string' || !manifest.providerRuntimeClass) {
    errors.push(`${fixtureId}: providerRuntimeClass is required`)
  }
  if (typeof manifest?.synthetic !== 'boolean') errors.push(`${fixtureId}: synthetic must be boolean`)
  if (manifest?.networkRequired !== false) errors.push(`${fixtureId}: fixtures must be offline`)
  if (!Array.isArray(manifest?.sourceReferences) || manifest.sourceReferences.length === 0) {
    errors.push(`${fixtureId}: sourceReferences are required`)
  }
  if (!Array.isArray(manifest?.coverage) || manifest.coverage.length === 0) {
    errors.push(`${fixtureId}: coverage is required`)
  }
  if (manifest?.contentHashAlgorithm !== 'sha256-canonical-json-v1') {
    errors.push(`${fixtureId}: unsupported contentHashAlgorithm`)
  }
  if (!HASH_PATTERN.test(String(manifest?.contentHash || ''))) {
    errors.push(`${fixtureId}: contentHash must be a SHA-256 hex digest`)
  }
  const sanitization = manifest?.sanitization || {}
  for (const key of ['method', 'privatePromptRemoved', 'identifiersPlaceholdered', 'pathsNormalized']) {
    if (!(key in sanitization)) errors.push(`${fixtureId}: sanitization.${key} is required`)
  }
  for (const key of ['addressableChildIdentity', 'nodeScopedStream', 'nodeCancellation', 'rootFinalAuthority']) {
    if (typeof manifest?.expectedCapabilities?.[key] !== 'boolean') {
      errors.push(`${fixtureId}: expectedCapabilities.${key} must be boolean`)
    }
  }
  for (const key of ['identity', 'stream', 'cancellation', 'rootFinalAuthority']) {
    if (typeof manifest?.currentContract?.[key] !== 'string' || !manifest.currentContract[key]) {
      errors.push(`${fixtureId}: currentContract.${key} is required`)
    }
  }
  if (!Array.isArray(manifest?.knownGaps)) errors.push(`${fixtureId}: knownGaps must be an array`)
}

async function validateSourceReferences(manifest, fixtureId, errors) {
  for (const reference of manifest.sourceReferences || []) {
    if (path.isAbsolute(reference)) {
      errors.push(`${fixtureId}: source reference must be repository-relative`)
      continue
    }
    const resolved = path.resolve(REPOSITORY_ROOT, reference)
    if (!resolved.startsWith(`${REPOSITORY_ROOT}${path.sep}`)) {
      errors.push(`${fixtureId}: source reference escapes repository root`)
      continue
    }
    try {
      await fs.access(resolved)
    } catch {
      errors.push(`${fixtureId}: source reference does not exist: ${reference}`)
    }
  }
}

function validateEvents(events, fixtureId, errors) {
  if (events?.schemaVersion !== AGENT_FIXTURE_SCHEMA_VERSION) {
    errors.push(`${fixtureId}: unknown events schemaVersion ${String(events?.schemaVersion)}`)
  }
  if (events?.fixtureId !== fixtureId) errors.push(`${fixtureId}: events fixtureId mismatch`)
  if (!Array.isArray(events?.events) || events.events.length === 0) {
    errors.push(`${fixtureId}: events array is required`)
    return
  }

  const eventIds = new Set()
  events.events.forEach((event, index) => {
    const location = `${fixtureId}:events[${index}]`
    if (event?.ordinal !== index + 1) errors.push(`${location}.ordinal must be ${index + 1}`)
    for (const key of ['eventId', 'timestamp', 'source', 'kind', 'runId', 'nodeId']) {
      if (typeof event?.[key] !== 'string' || !event[key]) errors.push(`${location}.${key} is required`)
    }
    if (eventIds.has(event?.eventId)) errors.push(`${location}.eventId must be unique`)
    eventIds.add(event?.eventId)
    if (!PLACEHOLDER_PATTERN.test(String(event?.eventId || ''))) errors.push(`${location}.eventId must be a placeholder`)
    if (!PLACEHOLDER_PATTERN.test(String(event?.timestamp || ''))) errors.push(`${location}.timestamp must be a placeholder`)
    if (!PLACEHOLDER_PATTERN.test(String(event?.runId || ''))) errors.push(`${location}.runId must be a placeholder`)
    if (!PLACEHOLDER_PATTERN.test(String(event?.nodeId || ''))) errors.push(`${location}.nodeId must be a placeholder`)
    if (event?.parentNodeId !== null && !PLACEHOLDER_PATTERN.test(String(event?.parentNodeId || ''))) {
      errors.push(`${location}.parentNodeId must be null or a placeholder`)
    }
    collectSensitiveShapeErrors(event?.payload, `${location}.payload`, errors)
  })
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

export async function loadAgentFixtureCorpus({ fixtureRoot = DEFAULT_FIXTURE_ROOT } = {}) {
  const entries = await fs.readdir(fixtureRoot, { withFileTypes: true })
  const fixtureIds = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  const corpus = []

  for (const fixtureId of fixtureIds) {
    const fixtureDir = path.join(fixtureRoot, fixtureId)
    const [manifest, events] = await Promise.all([
      readJson(path.join(fixtureDir, 'manifest.json')),
      readJson(path.join(fixtureDir, 'events.json')),
    ])
    corpus.push({ fixtureDir, manifest, events })
  }
  return corpus
}

export async function validateAgentFixtureCorpus(options = {}) {
  const errors = []
  let corpus = []
  try {
    corpus = await loadAgentFixtureCorpus(options)
  } catch (error) {
    return { valid: false, fixtureIds: [], errors: [error instanceof Error ? error.message : String(error)] }
  }

  const fixtureIds = corpus.map(({ manifest }) => String(manifest?.fixtureId || '')).sort()
  if (JSON.stringify(fixtureIds) !== JSON.stringify(REQUIRED_AGENT_FIXTURE_IDS)) {
    errors.push(`fixture IDs must equal required corpus: ${REQUIRED_AGENT_FIXTURE_IDS.join(', ')}`)
  }

  for (const { manifest, events } of corpus) {
    const fixtureId = String(manifest?.fixtureId || '<unknown>')
    if (!FIXTURE_ID_PATTERN.test(fixtureId)) errors.push(`${fixtureId}: invalid fixtureId`)
    validateManifest(manifest, fixtureId, errors)
    validateEvents(events, fixtureId, errors)
    await validateSourceReferences(manifest, fixtureId, errors)

    const actualHash = hashCanonicalJson(events)
    if (actualHash !== manifest?.contentHash) {
      errors.push(`${fixtureId}: contentHash drift (expected ${String(manifest?.contentHash)}, got ${actualHash})`)
    }

    const serialized = JSON.stringify({ manifest, events })
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(serialized)) errors.push(`${fixtureId}: possible credential or secret detected`)
    }
    for (const pattern of ABSOLUTE_PATH_PATTERNS) {
      if (pattern.test(serialized)) errors.push(`${fixtureId}: absolute user or host path detected`)
    }
  }

  return { valid: errors.length === 0, fixtureIds, errors }
}

async function main() {
  const result = await validateAgentFixtureCorpus()
  if (!result.valid) {
    result.errors.forEach((error) => console.error(`[agent-fixtures] ${error}`))
    process.exitCode = 1
    return
  }
  console.log(`[agent-fixtures] Validated ${result.fixtureIds.length} deterministic offline fixture corpora.`)
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main()
}
