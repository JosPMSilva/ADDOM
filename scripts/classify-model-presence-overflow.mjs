import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_INPUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../tests/fixtures/model-catalog/current-models-dev-conflict-report.json',
)

const DEFAULT_OUTPUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../tests/fixtures/model-catalog',
)

const CURATED_PREFIXES = Object.freeze([
  'anthropic/',
  'openai/',
  'google/',
  'moonshotai/',
  'x-ai/',
  'mistralai/',
  'deepseek/',
  'perplexity/',
  'qwen/',
  'meta-llama/',
])

const IMAGE_OR_MEDIA_PATTERN = /(flux|seedream|vision|vl-|tts|audio|speech|image|video|recraft|molmo)/i
const PREVIEW_OR_EXP_PATTERN = /(preview|(?:^|[-_])exp(?:$|[-_])|beta)/i
const FREE_OR_PROMO_PATTERN = /(:free|__58__free|__58__exacto)/i
const SNAPSHOT_OR_ALIAS_PATTERN = /(?:latest|-\d{8}|-\d{4}-\d{2}-\d{2}|-\d{6}|-\d{2}-\d{2})$/i

const OPENROUTER_REVIEW_IDS = new Set([
  'deepseek/deepseek-v3.2',
])

const OPENROUTER_NATIVE_PROVIDER_CURATED_IDS = new Set([
  'openai/gpt-4.1',
  'openai/gpt-4o-mini',
  'openai/gpt-5',
  'openai/gpt-5-chat',
  'openai/gpt-5-pro',
  'openai/gpt-5.1-chat',
  'openai/gpt-5.2-chat',
  'openai/gpt-5.2-pro',
  'openai/o4-mini',
])

const OPENROUTER_OUT_OF_SCOPE_PREFIXES = Object.freeze([
  'google/gemma-',
  'qwen/',
])

const OPENROUTER_EXPLICIT_UPSTREAM_ONLY_REASONS = new Map([
  ['anthropic/claude-3.5-haiku', 'older_model_not_needed'],
  ['anthropic/claude-3.7-sonnet', 'older_model_not_needed'],
  ['deepseek/deepseek-v3.1-terminus', 'temporary_variant_not_needed'],
  ['deepseek/deepseek-v3.2-speciale', 'special_edition_not_needed'],
  ['mistralai/mistral-medium-3', 'superseded_by_curated_native_model'],
  ['mistralai/devstral-small-2505', 'older_model_not_needed'],
  ['moonshotai/kimi-k2', 'superseded_by_curated_native_model'],
])

const OPENAI_REVIEW_IDS = new Set([
  'gpt-4.1',
  'gpt-4o-mini',
  'gpt-5',
  'gpt-5-pro',
  'o4-mini',
])

const OPENAI_EXPLICIT_UPSTREAM_ONLY_REASONS = new Map([
  ['gpt-3.5-turbo', 'older_model_not_needed'],
  ['gpt-4', 'older_model_not_needed'],
  ['gpt-4-turbo', 'older_model_not_needed'],
  ['gpt-4o', 'older_model_not_needed'],
  ['gpt-4.1-nano', 'low_value_tier_not_needed'],
  ['gpt-5.2-pro', 'not_in_current_curated_openai_scope'],
  ['o1-mini', 'not_in_current_curated_openai_scope'],
  ['o1-preview', 'not_in_current_curated_openai_scope'],
  ['o1-pro', 'not_in_current_curated_openai_scope'],
  ['o1', 'not_in_current_curated_openai_scope'],
  ['o3-mini', 'not_in_current_curated_openai_scope'],
  ['o3-pro', 'not_in_current_curated_openai_scope'],
  ['o3', 'not_in_current_curated_openai_scope'],
  ['o3-deep-research', 'provider_owned_research_surface_not_curated'],
  ['o4-mini-deep-research', 'provider_owned_research_surface_not_curated'],
  ['text-embedding-3-large', 'embedding_surface_not_curated'],
  ['text-embedding-3-small', 'embedding_surface_not_curated'],
  ['text-embedding-ada-002', 'embedding_surface_not_curated'],
])

const ANTHROPIC_EXPLICIT_UPSTREAM_ONLY_REASONS = new Map([
  ['claude-3-5-haiku-20241022', 'older_model_not_needed'],
  ['claude-3-5-sonnet-20240620', 'older_model_not_needed'],
  ['claude-3-5-sonnet-20241022', 'older_model_not_needed'],
  ['claude-3-7-sonnet-20250219', 'older_model_not_needed'],
  ['claude-3-haiku-20240307', 'older_model_not_needed'],
  ['claude-3-opus-20240229', 'older_model_not_needed'],
  ['claude-3-sonnet-20240229', 'older_model_not_needed'],
])

const MISTRAL_EXPLICIT_UPSTREAM_ONLY_REASONS = new Map([
  ['devstral-small-2505', 'older_model_not_needed'],
  ['labs-devstral-small-2512', 'not_in_current_curated_mistral_scope'],
  ['magistral-small', 'not_in_current_curated_mistral_scope'],
  ['ministral-3b-latest', 'not_in_current_curated_mistral_scope'],
  ['ministral-8b-latest', 'not_in_current_curated_mistral_scope'],
  ['mistral-embed', 'embedding_surface_not_curated'],
  ['mistral-large-2411', 'older_model_not_needed'],
  ['mistral-medium-2505', 'older_model_not_needed'],
  ['mistral-nemo', 'not_in_current_curated_mistral_scope'],
  ['open-mistral-7b', 'open_weight_surface_not_curated'],
  ['open-mixtral-8x22b', 'open_weight_surface_not_curated'],
  ['open-mixtral-8x7b', 'open_weight_surface_not_curated'],
  ['pixtral-12b', 'image_surface_not_curated'],
  ['pixtral-large-latest', 'image_surface_not_curated'],
])

function trimString(value = '') {
  return String(value || '').trim()
}

function buildDefaultOutput(providerId = '') {
  return path.resolve(DEFAULT_OUTPUT_DIR, `${trimString(providerId).toLowerCase()}-models-dev-presence-triage.json`)
}

function parseArgs(argv = []) {
  const args = [...argv]
  const parsed = {
    input: process.env.ADDOM_MODEL_PRESENCE_INPUT || DEFAULT_INPUT,
    providerId: 'openrouter',
  }

  while (args.length > 0) {
    const flag = trimString(args.shift())
    if (flag === '--input') {
      parsed.input = trimString(args.shift())
      continue
    }
    if (flag === '--output') {
      parsed.output = trimString(args.shift())
      continue
    }
    if (flag === '--provider') {
      parsed.providerId = trimString(args.shift()).toLowerCase()
      continue
    }
    throw new Error(`Unknown flag: ${flag}`)
  }

  if (!parsed.input) throw new Error('Missing --input value.')
  parsed.output = parsed.output || process.env.ADDOM_MODEL_PRESENCE_OUTPUT || buildDefaultOutput(parsed.providerId)
  if (!parsed.output) throw new Error('Missing --output value.')
  if (!parsed.providerId) throw new Error('Missing --provider value.')
  return parsed
}

export function classifyPresenceOverflowId(id = '') {
  const normalized = trimString(id).toLowerCase()
  if (!normalized) return 'other'
  if (FREE_OR_PROMO_PATTERN.test(normalized)) return 'free_or_promo'
  if (PREVIEW_OR_EXP_PATTERN.test(normalized)) return 'preview_or_exp'
  if (IMAGE_OR_MEDIA_PATTERN.test(normalized)) return 'image_or_media'
  if (CURATED_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return 'provider_family_match'
  return 'other'
}

function isSnapshotOrAlias(id = '') {
  return SNAPSHOT_OR_ALIAS_PATTERN.test(trimString(id).toLowerCase())
}

function isExplicitlyUpstreamOnly(id = '') {
  const normalized = trimString(id).toLowerCase()
  return normalized.startsWith('openrouter/')
}

function summarizeSuggestedActions(actions = []) {
  return actions.reduce((summary, { action }) => {
    summary[action] = (summary[action] || 0) + 1
    return summary
  }, {})
}

function buildDefaultSuggestedAction(bucketId = 'other') {
  if (bucketId === 'free_or_promo') {
    return { action: 'keep_upstream_only', reason: 'free_or_promo_variant' }
  }
  if (bucketId === 'preview_or_exp') {
    return { action: 'keep_upstream_only', reason: 'preview_or_experimental_surface' }
  }
  if (bucketId === 'image_or_media') {
    return { action: 'keep_upstream_only', reason: 'image_or_media_surface' }
  }
  return { action: 'keep_upstream_only', reason: 'no_explicit_runtime_or_product_reason' }
}

function resolveRuleMapAction(id = '', ruleMap = new Map()) {
  const reason = ruleMap.get(trimString(id).toLowerCase())
  return reason
    ? { action: 'keep_upstream_only', reason }
    : null
}

function resolveOpenAIAction(id = '', bucketId = 'other') {
  const normalizedId = trimString(id).toLowerCase()
  if (OPENAI_REVIEW_IDS.has(normalizedId)) {
    return {
      action: 'review_for_curated_scope',
      reason: 'high_value_current_generation_gap',
      bucketId,
    }
  }
  const explicit = resolveRuleMapAction(normalizedId, OPENAI_EXPLICIT_UPSTREAM_ONLY_REASONS)
  if (explicit) return { ...explicit, bucketId }
  return null
}

function resolveAnthropicAction(id = '', bucketId = 'other') {
  const normalizedId = trimString(id).toLowerCase()
  const explicit = resolveRuleMapAction(normalizedId, ANTHROPIC_EXPLICIT_UPSTREAM_ONLY_REASONS)
  if (explicit) return { ...explicit, bucketId }
  return {
    action: 'keep_upstream_only',
    reason: 'snapshot_or_alias_of_curated_family',
    bucketId,
  }
}

function resolveMistralAction(id = '', bucketId = 'other') {
  const normalizedId = trimString(id).toLowerCase()
  const explicit = resolveRuleMapAction(normalizedId, MISTRAL_EXPLICIT_UPSTREAM_ONLY_REASONS)
  if (explicit) return { ...explicit, bucketId }
  return {
    action: 'keep_upstream_only',
    reason: 'snapshot_or_alias_of_curated_family',
    bucketId,
  }
}

export function resolvePresenceSuggestedAction(providerId = '', id = '') {
  const normalizedProviderId = trimString(providerId).toLowerCase()
  const normalizedId = trimString(id).toLowerCase()
  const bucketId = classifyPresenceOverflowId(normalizedId)

  if (!normalizedId) {
    return {
      action: 'keep_upstream_only',
      reason: 'empty_id',
      bucketId,
    }
  }

  if (isSnapshotOrAlias(normalizedId)) {
    return {
      action: 'keep_upstream_only',
      reason: 'snapshot_or_alias',
      bucketId,
    }
  }

  if (isExplicitlyUpstreamOnly(normalizedId)) {
    return {
      action: 'keep_upstream_only',
      reason: 'openrouter_house_route',
      bucketId,
    }
  }

  if (normalizedProviderId === 'openrouter' && OPENROUTER_REVIEW_IDS.has(normalizedId)) {
    return {
      action: 'review_for_curated_scope',
      reason: 'current_generation_gap_in_curated_scope',
      bucketId,
    }
  }

  if (normalizedProviderId === 'openrouter' && OPENROUTER_NATIVE_PROVIDER_CURATED_IDS.has(normalizedId)) {
    return {
      action: 'keep_upstream_only',
      reason: 'covered_by_curated_native_provider',
      bucketId,
    }
  }

  if (normalizedProviderId === 'openrouter' && OPENROUTER_EXPLICIT_UPSTREAM_ONLY_REASONS.has(normalizedId)) {
    return {
      action: 'keep_upstream_only',
      reason: OPENROUTER_EXPLICIT_UPSTREAM_ONLY_REASONS.get(normalizedId),
      bucketId,
    }
  }

  if (normalizedProviderId === 'openrouter' && OPENROUTER_OUT_OF_SCOPE_PREFIXES.some((prefix) => normalizedId.startsWith(prefix))) {
    return {
      action: 'keep_upstream_only',
      reason: 'out_of_current_curated_family_scope',
      bucketId,
    }
  }

  if (normalizedProviderId === 'openai') {
    const resolved = resolveOpenAIAction(normalizedId, bucketId)
    if (resolved) return resolved
  }

  if (normalizedProviderId === 'anthropic') {
    return resolveAnthropicAction(normalizedId, bucketId)
  }

  if (normalizedProviderId === 'mistral') {
    return resolveMistralAction(normalizedId, bucketId)
  }

  return {
    ...buildDefaultSuggestedAction(normalizedId, bucketId),
    bucketId,
  }
}

export function buildPresenceTriage(providerReport = {}) {
  const providerId = trimString(providerReport.providerId).toLowerCase()
  const onlyInModelsDev = Array.isArray(providerReport.onlyInModelsDev)
    ? providerReport.onlyInModelsDev.map((id) => trimString(id)).filter(Boolean)
    : []

  const buckets = {
    free_or_promo: [],
    preview_or_exp: [],
    image_or_media: [],
    provider_family_match: [],
    other: [],
  }

  for (const id of onlyInModelsDev) {
    buckets[classifyPresenceOverflowId(id)].push(id)
  }

  const reviewCandidatesSource = providerId === 'openrouter'
    ? buckets.provider_family_match
        .filter((id) => !isSnapshotOrAlias(id))
        .filter((id) => !isExplicitlyUpstreamOnly(id))
    : onlyInModelsDev

  const reviewCandidates = reviewCandidatesSource
    .slice()
    .sort((left, right) => left.localeCompare(right))

  const suggestedActions = reviewCandidates.map((id) => ({
    id,
    ...resolvePresenceSuggestedAction(providerId, id),
  }))

  const suggestedReviewQueue = suggestedActions
    .filter(({ action }) => action === 'review_for_curated_scope')
    .map(({ id }) => id)

  return {
    providerId,
    onlyInModelsDevCount: onlyInModelsDev.length,
    defaultPolicy: 'upstream_only_unless_explicit_runtime_or_product_reason',
    bucketSummaries: Object.fromEntries(
      Object.entries(buckets).map(([bucketId, ids]) => [
        bucketId,
        {
          count: ids.length,
          ids,
        },
      ]),
    ),
    reviewCandidateCount: reviewCandidates.length,
    suggestedActionSummary: summarizeSuggestedActions(suggestedActions),
    suggestedActions,
    suggestedReviewQueue,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const parsed = JSON.parse(await readFile(path.resolve(options.input), 'utf8'))
  const provider = Array.isArray(parsed.providers)
    ? parsed.providers.find((entry) => trimString(entry?.providerId).toLowerCase() === options.providerId)
    : null

  if (!provider) {
    throw new Error(`Provider not found in report: ${options.providerId}`)
  }

  const triage = buildPresenceTriage(provider)
  await mkdir(path.dirname(path.resolve(options.output)), { recursive: true })
  await writeFile(path.resolve(options.output), `${JSON.stringify(triage, null, 2)}\n`, 'utf8')
  console.log(`Wrote model presence triage: ${path.resolve(options.output)}`)
  console.log(`Provider: ${triage.providerId}`)
  console.log(`onlyInModelsDev: ${triage.onlyInModelsDevCount}`)
  console.log(`reviewQueue: ${triage.suggestedReviewQueue.length}`)
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error))
    process.exitCode = 1
  })
}
