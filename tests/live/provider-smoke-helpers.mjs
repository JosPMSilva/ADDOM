import { getRegistryProvider } from '../../src/common/api-clients/model-registry.mjs'
import { OPENROUTER_SUPPORTED_ROUTE_IDS } from '../../src/common/api-clients/openrouter-compatibility-data.mjs'
import { buildCompactionDiagnosticLines } from '../../src/common/chat/compaction-diagnostics.mjs'
import {
  buildProviderTruncationBudget,
  DEFAULT_PROVIDER_TRUNCATION_SOFT_TRIGGER_PERCENT,
} from '../../src/common/chat/provider-truncation-budget-policy.mjs'
import { COMPACTION_MODES } from '../../src/main/chat/continuity/compaction-mode-contract.mjs'
import { isProviderChainCompactionAllowed } from '../../src/main/chat/continuity/continuity-policy.mjs'
import { resolveOpenAIPreCallCompactionDecision } from '../../src/main/chat/continuity/openai-precall-compaction-decision.mjs'
import {
  DEFAULT_ANTHROPIC_PROVIDER_RUNTIME_SETTINGS,
  DEFAULT_OPENAI_PROVIDER_RUNTIME_SETTINGS,
  normalizeAnthropicProviderRuntimeSettings,
  normalizeOpenAIProviderRuntimeSettings,
} from '../../src/main/api-clients/openai-runtime-types.mjs'
import { resolveModelContextLimit } from '../../src/main/api-clients/model-context-limits.mjs'
import { resolveProviderModelAdapter } from '../../src/main/api-clients/provider-model-adapters.mjs'

export const LIVE_SMOKE_REMOTE_PROVIDER_IDS = Object.freeze([
  'openai',
  'anthropic',
  'gemini',
  'moonshot',
  'grok',
  'groq',
  'mistral',
  'deepseek',
  'perplexity',
  'openrouter',
])

const PROVIDER_ENV_KEYS = Object.freeze({
  openai: ['OPENAI_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
  moonshot: ['MOONSHOT_API_KEY'],
  grok: ['XAI_API_KEY'],
  groq: ['GROQ_API_KEY'],
  mistral: ['MISTRAL_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  perplexity: ['PERPLEXITY_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
})

const DEFAULT_LIVE_SMOKE_OPENAI_CONTINUITY_POLICY = Object.freeze({
  providerChainCompactionEnabled: true,
  providerTruncationEnabled: true,
  providerCompactionAllowlist: ['openai'],
})

const DEFAULT_LIVE_SMOKE_ANTHROPIC_CONTINUITY_POLICY = Object.freeze({
  providerChainCompactionEnabled: true,
  providerTruncationEnabled: true,
  providerCompactionAllowlist: ['anthropic'],
})

const LIVE_SMOKE_COMPACTION_PROBE_DEFAULT_THRESHOLD_TOKENS = 4_096
const LIVE_SMOKE_COMPACTION_PROBE_DEFAULT_PADDING_CHARS = 24_000

function normalizeProviderId(value = '') {
  return String(value || '').trim().toLowerCase()
}

function trimString(value = '') {
  return String(value || '').trim()
}

function parseBooleanFlag(value = '') {
  const normalized = trimString(value).toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

export function isLiveSmokeEnabled(env = process.env) {
  return parseBooleanFlag(env?.ADDOM_LIVE_SMOKE)
}

export function isLiveSmokeStreamEnabled(env = process.env) {
  return parseBooleanFlag(env?.ADDOM_LIVE_SMOKE_STREAM)
}

export function isLiveSmokeExecutionContractEnabled(env = process.env) {
  return parseBooleanFlag(env?.ADDOM_LIVE_SMOKE_EXECUTION_CONTRACT)
}

export function createLiveSmokeExecutionContractRecorder({ now = () => Date.now() } = {}) {
  const events = []
  return {
    record(kind = '', detail = {}) {
      events.push({
        ...detail,
        kind: trimString(kind),
        at: Number(now()) || Date.now(),
        sequence: events.length + 1,
      })
    },
    snapshot() {
      return events.map((event) => ({ ...event }))
    },
  }
}

export function validateLiveSmokeExecutionContract(events = [], { supportsReasoning = true } = {}) {
  const list = Array.isArray(events) ? events : []
  const errors = []
  const terminalEvents = list.filter((event) => event?.kind === 'terminal')
  if (terminalEvents.length !== 1) errors.push(`Expected one terminal event, received ${terminalEvents.length}.`)

  for (let index = 1; index < list.length; index += 1) {
    if (Number(list[index]?.at || 0) < Number(list[index - 1]?.at || 0)) {
      errors.push('Execution contract timestamps are out of order.')
      break
    }
  }

  const reasoningEvents = list.filter((event) => event?.kind === 'reasoning')
  if (!supportsReasoning && reasoningEvents.length > 0) {
    errors.push('Profiles without reasoning must not synthesize reasoning.')
  }
  const terminalSequence = Number(terminalEvents[0]?.sequence || Number.POSITIVE_INFINITY)
  if (reasoningEvents.some((event) => Number(event?.sequence || 0) >= terminalSequence)) {
    errors.push('Reasoning must arrive before the terminal event.')
  }

  const startedSessions = new Set(list
    .filter((event) => event?.kind === 'tool_started')
    .map((event) => trimString(event?.sessionId))
    .filter(Boolean))
  const closedSessions = new Set(list
    .filter((event) => event?.kind === 'tool_result' || event?.kind === 'tool_interrupted')
    .map((event) => trimString(event?.sessionId))
    .filter(Boolean))
  for (const sessionId of startedSessions) {
    if (!closedSessions.has(sessionId)) errors.push(`Tool session ${sessionId} did not terminate or interrupt.`)
  }

  return { valid: errors.length === 0, errors }
}

export function isLiveSmokeCompactionProbeEnabled(env = process.env) {
  return parseBooleanFlag(env?.ADDOM_LIVE_SMOKE_COMPACTION_PROBE)
}

export function parseLiveSmokeProviderSelection(env = process.env) {
  const raw = trimString(env?.ADDOM_LIVE_SMOKE_PROVIDERS)
  if (!raw) return []
  const seen = new Set()
  const selected = []
  for (const entry of raw.split(',')) {
    const providerId = normalizeProviderId(entry)
    if (!providerId || seen.has(providerId)) continue
    seen.add(providerId)
    selected.push(providerId)
  }
  return selected
}

export function resolveLiveSmokeApiKey(providerId = '', env = process.env) {
  const normalizedProviderId = normalizeProviderId(providerId)
  const explicitEnvKey = trimString(env?.[`ADDOM_LIVE_SMOKE_${normalizedProviderId.toUpperCase()}_API_KEY`])
  if (explicitEnvKey) {
    return {
      apiKey: explicitEnvKey,
      source: `ADDOM_LIVE_SMOKE_${normalizedProviderId.toUpperCase()}_API_KEY`,
    }
  }

  for (const envKey of PROVIDER_ENV_KEYS[normalizedProviderId] || []) {
    const value = trimString(env?.[envKey])
    if (!value) continue
    return {
      apiKey: value,
      source: envKey,
    }
  }

  return {
    apiKey: '',
    source: '',
  }
}

export function resolveLiveSmokeModelId(providerId = '', env = process.env) {
  const normalizedProviderId = normalizeProviderId(providerId)
  const override = trimString(env?.[`ADDOM_LIVE_SMOKE_${normalizedProviderId.toUpperCase()}_MODEL`])
  if (override) return override
  const provider = getRegistryProvider(normalizedProviderId)
  return trimString(provider?.defaultModel)
}

function parseCommaSeparatedValues(value = '') {
  const raw = trimString(value)
  if (!raw) return []
  const seen = new Set()
  const values = []
  for (const entry of raw.split(',')) {
    const trimmed = trimString(entry)
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    values.push(trimmed)
  }
  return values
}

export function resolveOpenRouterSmokeModelIds(env = process.env) {
  const allowlist = parseCommaSeparatedValues(env?.ADDOM_LIVE_SMOKE_OPENROUTER_MODELS)
  if (allowlist.length > 0) return allowlist

  const scope = trimString(env?.ADDOM_LIVE_SMOKE_OPENROUTER_SCOPE).toLowerCase()
  if (scope === 'default') {
    const defaultModel = resolveLiveSmokeModelId('openrouter', env)
    return defaultModel ? [defaultModel] : []
  }
  return [...OPENROUTER_SUPPORTED_ROUTE_IDS]
}

export function resolveLiveSmokeTimeoutMs(env = process.env) {
  const raw = Number(env?.ADDOM_LIVE_SMOKE_TIMEOUT_MS)
  if (!Number.isFinite(raw) || raw <= 0) return 60_000
  return Math.max(10_000, Math.round(raw))
}

function resolveLiveSmokeCompactionProbeThresholdTokens(providerId = '', env = process.env) {
  const normalizedProviderId = normalizeProviderId(providerId)
  const providerSpecific = Number(env?.[`ADDOM_LIVE_SMOKE_${normalizedProviderId.toUpperCase()}_COMPACTION_THRESHOLD_TOKENS`])
  if (Number.isFinite(providerSpecific) && providerSpecific > 0) {
    return Math.max(4_096, Math.round(providerSpecific))
  }
  const generic = Number(env?.ADDOM_LIVE_SMOKE_COMPACTION_THRESHOLD_TOKENS)
  if (Number.isFinite(generic) && generic > 0) {
    return Math.max(4_096, Math.round(generic))
  }
  return LIVE_SMOKE_COMPACTION_PROBE_DEFAULT_THRESHOLD_TOKENS
}

function resolveLiveSmokeCompactionProbePaddingChars(env = process.env) {
  const raw = Number(env?.ADDOM_LIVE_SMOKE_COMPACTION_PADDING_CHARS)
  if (!Number.isFinite(raw) || raw <= 0) return LIVE_SMOKE_COMPACTION_PROBE_DEFAULT_PADDING_CHARS
  return Math.max(12_000, Math.round(raw))
}

function buildProviderTruncationBudgetVisibility({
  modelContextLimitTokens = 0,
  softTriggerPercent = DEFAULT_PROVIDER_TRUNCATION_SOFT_TRIGGER_PERCENT,
  explicitThresholdTokens = 0,
} = {}) {
  const budget = buildProviderTruncationBudget({
    modelContextLimitTokens,
    softTriggerPercent,
  })
  const thresholdTokens = Number(explicitThresholdTokens || 0) > 0
    ? Math.max(4_096, Math.round(Number(explicitThresholdTokens || 0)))
    : budget.softTriggerTokens
  return {
    providerTruncationSoftTriggerPercent: budget.softTriggerPercent,
    providerTruncationThresholdTokens: thresholdTokens,
    providerTruncationCriticalTaskFloorTokens: budget.criticalTaskTriggerFloorTokens,
    providerTruncationCriticalTaskCeilingTokens: budget.criticalTaskTriggerCeilingTokens,
    providerTruncationForcedTriggerTokens: budget.forcedTriggerTokens,
  }
}

export function buildLiveSmokeCases(env = process.env) {
  const enabled = isLiveSmokeEnabled(env)
  const selectedProviders = parseLiveSmokeProviderSelection(env)
  const selectedProviderSet = new Set(selectedProviders)

  return LIVE_SMOKE_REMOTE_PROVIDER_IDS.flatMap((providerId) => {
    const apiKeyResolution = resolveLiveSmokeApiKey(providerId, env)
    const selected = selectedProviderSet.size === 0 || selectedProviderSet.has(providerId)
    const configured = !!apiKeyResolution.apiKey
    const modelIds = providerId === 'openrouter'
      ? resolveOpenRouterSmokeModelIds(env)
      : [resolveLiveSmokeModelId(providerId, env)].filter(Boolean)
    const run = enabled && selected && configured && modelIds.length > 0

    let skipReason = ''
    if (!enabled) skipReason = 'ADDOM_LIVE_SMOKE is not enabled.'
    else if (!selected) skipReason = `Provider ${providerId} was not selected in ADDOM_LIVE_SMOKE_PROVIDERS.`
    else if (!configured) skipReason = `No API key found for ${providerId}.`
    else if (modelIds.length === 0) skipReason = `No smoke model is configured for ${providerId}.`

    if (!run) {
      return [{
        providerId,
        modelId: modelIds[0] || '',
        apiKey: apiKeyResolution.apiKey,
        apiKeySource: apiKeyResolution.source,
        run,
        skipReason,
      }]
    }

    return modelIds.map((modelId) => ({
      providerId,
      modelId,
      apiKey: apiKeyResolution.apiKey,
      apiKeySource: apiKeyResolution.source,
      run: true,
      skipReason: '',
    }))
  })
}

export function resolveLiveSmokeCompactionVisibility({
  providerId = '',
  modelId = '',
  providerRuntimeSettings = null,
  continuityPolicy = null,
  requestContext = {},
  previousResponseId = '',
  occupancyEstimateTokens = 12_000,
} = {}) {
  const normalizedProviderId = normalizeProviderId(providerId)
  const normalizedModelId = trimString(modelId)
  const modelContext = resolveModelContextLimit(normalizedProviderId, normalizedModelId)
  const modelContextLimitTokens = Number(modelContext?.limitTokens || 0) || 0

  if (normalizedProviderId === 'anthropic') {
    const normalizedAnthropicSettings = normalizeAnthropicProviderRuntimeSettings(
      providerRuntimeSettings?.anthropic && typeof providerRuntimeSettings.anthropic === 'object'
        ? providerRuntimeSettings.anthropic
        : providerRuntimeSettings,
      DEFAULT_ANTHROPIC_PROVIDER_RUNTIME_SETTINGS,
    )
    const policy = continuityPolicy && typeof continuityPolicy === 'object'
      ? continuityPolicy
      : DEFAULT_LIVE_SMOKE_ANTHROPIC_CONTINUITY_POLICY
    const policyAllowsCompaction = isProviderChainCompactionAllowed('anthropic', policy)
    const budgetVisibility = buildProviderTruncationBudgetVisibility({
      modelContextLimitTokens,
      softTriggerPercent: normalizedAnthropicSettings.providerTruncationSoftTriggerPercent,
      explicitThresholdTokens: normalizedAnthropicSettings.contextManagementCompactionThresholdTokens,
    })
    const enabled = (
      normalizedAnthropicSettings.useContextManagementCompaction === true
      && policyAllowsCompaction
      && budgetVisibility.providerTruncationThresholdTokens > 0
    )
    return {
      providerId: normalizedProviderId,
      modelId: normalizedModelId,
      selectedCompactionMode: enabled
        ? COMPACTION_MODES.PROVIDER_TRUNCATION
        : COMPACTION_MODES.LOCAL_SUMMARY,
      candidateCompactionModes: enabled
        ? [COMPACTION_MODES.PROVIDER_TRUNCATION, COMPACTION_MODES.LOCAL_SUMMARY]
        : [COMPACTION_MODES.LOCAL_SUMMARY],
      compactionFailureReason: enabled
        ? ''
        : (
          policyAllowsCompaction
            ? 'provider_truncation_disabled'
            : 'provider_compaction_policy_blocked'
        ),
      fallbackCompactionMode: enabled ? '' : COMPACTION_MODES.LOCAL_SUMMARY,
      fallbackReason: enabled ? '' : 'provider_truncation_unavailable',
      ...budgetVisibility,
      modelContextLimitTokens,
      providerTruncationEnabled: enabled,
    }
  }

  if (normalizedProviderId !== 'openai') {
    return {
      providerId: normalizedProviderId,
      modelId: normalizedModelId,
      selectedCompactionMode: COMPACTION_MODES.LOCAL_SUMMARY,
      candidateCompactionModes: [COMPACTION_MODES.LOCAL_SUMMARY],
      compactionFailureReason: '',
      fallbackCompactionMode: '',
      fallbackReason: '',
      providerTruncationEnabled: false,
      modelContextLimitTokens,
    }
  }

  const normalizedOpenAISettings = normalizeOpenAIProviderRuntimeSettings(
    providerRuntimeSettings?.openai && typeof providerRuntimeSettings.openai === 'object'
      ? providerRuntimeSettings.openai
      : providerRuntimeSettings,
    DEFAULT_OPENAI_PROVIDER_RUNTIME_SETTINGS,
  )

  const adapterProfile = resolveProviderModelAdapter(normalizedProviderId, normalizedModelId)
  const decision = resolveOpenAIPreCallCompactionDecision({
    providerId: normalizedProviderId,
    modelId: normalizedModelId,
    modelSupport: adapterProfile?.openaiRuntimeSupport || null,
    providerRuntimeSettings: providerRuntimeSettings && typeof providerRuntimeSettings === 'object'
      ? providerRuntimeSettings
      : { openai: normalizedOpenAISettings },
    continuityPolicy: continuityPolicy && typeof continuityPolicy === 'object'
      ? continuityPolicy
      : DEFAULT_LIVE_SMOKE_OPENAI_CONTINUITY_POLICY,
    requestContext: requestContext && typeof requestContext === 'object' ? requestContext : {},
    previousResponseId: trimString(previousResponseId),
    occupancyEstimateTokens: Number(occupancyEstimateTokens || 0) || 0,
  })

  const manualDecision = decision?.manualDecision && typeof decision.manualDecision === 'object'
    ? decision.manualDecision
    : null

  return {
    providerId: normalizedProviderId,
    modelId: normalizedModelId,
    selectedCompactionMode: String(decision?.selectedCompactionMode || COMPACTION_MODES.LOCAL_SUMMARY),
    candidateCompactionModes: Array.isArray(decision?.candidateCompactionModes)
      ? decision.candidateCompactionModes
      : [COMPACTION_MODES.LOCAL_SUMMARY],
    compactionFailureReason: trimString(manualDecision?.blockedReason || ''),
    fallbackCompactionMode: trimString(manualDecision?.fallbackCompactionMode || ''),
    fallbackReason: trimString(manualDecision?.fallbackReason || ''),
    ...buildProviderTruncationBudgetVisibility({
      modelContextLimitTokens,
      softTriggerPercent: normalizedOpenAISettings.providerTruncationSoftTriggerPercent,
      explicitThresholdTokens: normalizedOpenAISettings.serverSideCompactionThresholdTokens,
    }),
    modelContextLimitTokens,
    providerTruncationEnabled: String(decision?.selectedCompactionMode || '') === COMPACTION_MODES.PROVIDER_TRUNCATION,
  }
}

export function buildLiveSmokeRequest({
  providerId = '',
  env = process.env,
} = {}) {
  const normalizedProviderId = normalizeProviderId(providerId)
  const base = {
    messages: [{ role: 'user', content: 'Reply with exactly ADDOM_LIVE_SMOKE_OK and nothing else.' }],
    providerRuntimeSettings: null,
  }
  if (!isLiveSmokeCompactionProbeEnabled(env)) return base
  if (!['openai', 'anthropic'].includes(normalizedProviderId)) return base

  const paddingChars = resolveLiveSmokeCompactionProbePaddingChars(env)
  const filler = 'PAD '.repeat(Math.ceil(paddingChars / 4)).trim()
  const prompt = [
    filler,
    '',
    'Ignore the filler above.',
    'Reply with exactly ADDOM_LIVE_SMOKE_OK and nothing else.',
  ].join('\n')

  if (normalizedProviderId === 'anthropic') {
    const thresholdTokens = resolveLiveSmokeCompactionProbeThresholdTokens(normalizedProviderId, env)
    return {
      messages: [{ role: 'user', content: prompt }],
      providerRuntimeSettings: {
        anthropic: {
          useContextManagementCompaction: true,
          contextManagementCompactionThresholdTokens: thresholdTokens,
          providerTruncationSoftTriggerPercent: 85,
          contextManagementCompactionInstructions: '',
        },
      },
    }
  }

  return {
    messages: [{ role: 'user', content: prompt }],
    providerRuntimeSettings: {
      openai: {
        useServerSideCompaction: false,
        useResponseCompaction: true,
        serverSideCompactionThresholdTokens: 0,
        providerTruncationSoftTriggerPercent: 85,
      },
    },
  }
}

export function formatLiveSmokeCompactionDiagnostics({
  providerId = '',
  modelId = '',
  transport = '',
  compaction = null,
  providerResponseMeta = null,
} = {}) {
  const normalizedProviderId = normalizeProviderId(providerId)
  const normalizedModelId = trimString(modelId)
  const normalizedTransport = trimString(transport).toLowerCase()
  const lines = [
    `live_smoke_provider_model: ${normalizedProviderId || 'unknown'}${normalizedModelId ? `/${normalizedModelId}` : ''}`,
  ]
  if (normalizedTransport) {
    lines.push(`live_smoke_transport: ${normalizedTransport}`)
  }
  lines.push(...buildCompactionDiagnosticLines(compaction || {}))
  if (Number.isFinite(Number(compaction?.providerTruncationSoftTriggerPercent || 0)) && Number(compaction.providerTruncationSoftTriggerPercent) > 0) {
    lines.push(`provider_truncation_soft_trigger_percent: ${Math.round(Number(compaction.providerTruncationSoftTriggerPercent))}`)
  }
  if (Number.isFinite(Number(compaction?.providerTruncationThresholdTokens || 0)) && Number(compaction.providerTruncationThresholdTokens) > 0) {
    lines.push(`provider_truncation_threshold_tokens: ${Math.round(Number(compaction.providerTruncationThresholdTokens))}`)
  }
  if (Number.isFinite(Number(compaction?.providerTruncationCriticalTaskFloorTokens || 0)) && Number(compaction.providerTruncationCriticalTaskFloorTokens) > 0) {
    lines.push(`provider_truncation_critical_task_floor_tokens: ${Math.round(Number(compaction.providerTruncationCriticalTaskFloorTokens))}`)
  }
  if (Number.isFinite(Number(compaction?.providerTruncationCriticalTaskCeilingTokens || 0)) && Number(compaction.providerTruncationCriticalTaskCeilingTokens) > 0) {
    lines.push(`provider_truncation_critical_task_ceiling_tokens: ${Math.round(Number(compaction.providerTruncationCriticalTaskCeilingTokens))}`)
  }
  if (Number.isFinite(Number(compaction?.providerTruncationForcedTriggerTokens || 0)) && Number(compaction.providerTruncationForcedTriggerTokens) > 0) {
    lines.push(`provider_truncation_forced_trigger_tokens: ${Math.round(Number(compaction.providerTruncationForcedTriggerTokens))}`)
  }
  if (typeof compaction?.providerTruncationEnabled === 'boolean') {
    lines.push(`provider_truncation_enabled: ${compaction.providerTruncationEnabled ? 'true' : 'false'}`)
  }
  if (Number.isFinite(Number(compaction?.modelContextLimitTokens || 0)) && Number(compaction.modelContextLimitTokens) > 0) {
    lines.push(`model_context_limit_tokens: ${Math.round(Number(compaction.modelContextLimitTokens))}`)
  }

  const responseMeta = providerResponseMeta && typeof providerResponseMeta === 'object'
    ? providerResponseMeta
    : {}
  if (typeof responseMeta.autoCompactionApplied === 'boolean') {
    lines.push(`provider_auto_compaction_applied: ${responseMeta.autoCompactionApplied ? 'true' : 'false'}`)
  }
  if (Array.isArray(responseMeta.autoCompactionIds) && responseMeta.autoCompactionIds.length > 0) {
    lines.push(`provider_auto_compaction_ids: ${responseMeta.autoCompactionIds.join(', ')}`)
  }
  if (typeof responseMeta.appliedContextManagement === 'boolean') {
    lines.push(`provider_context_management_applied: ${responseMeta.appliedContextManagement ? 'true' : 'false'}`)
  }
  if (Array.isArray(responseMeta.contextManagementEdits) && responseMeta.contextManagementEdits.length > 0) {
    lines.push(`provider_context_management_edits: ${responseMeta.contextManagementEdits.join(', ')}`)
  }

  return lines.join('\n')
}
