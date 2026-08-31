import { OPENROUTER_SUPPORTED_COMPATIBILITY_ENTRIES } from './openrouter-compatibility-data.mjs'
import { GENERATED_MODEL_CATALOG_SNAPSHOT } from './generated/model-catalog.snapshot.mjs'
import {
  ANTHROPIC_ADAPTIVE_REASONING_CAPABILITY,
  ANTHROPIC_ADAPTIVE_REASONING_DEFAULT_PROVIDER_OPTIONS,
  ANTHROPIC_ADAPTIVE_REASONING_VARIANTS,
  ANTHROPIC_DISABLEABLE_REASONING_CAPABILITY,
  ANTHROPIC_EFFORT_REASONING_CAPABILITY,
  ANTHROPIC_EFFORT_REASONING_DEFAULT_PROVIDER_OPTIONS,
  ANTHROPIC_EFFORT_REASONING_VARIANTS,
  ANTHROPIC_MANUAL_REASONING_DEFAULT_PROVIDER_OPTIONS,
  ANTHROPIC_MANUAL_REASONING_VARIANTS,
  ANTHROPIC_THINKING_CAPABILITY,
} from './model-registry-anthropic-reasoning-data.mjs'

const OPENROUTER_VERIFIED_AT = '2026-07-14'
const TERMS_VERSION = '2026-02-28'
const DELEGATION_CAPABILITY = Object.freeze({
  supported: true,
  notes: 'Reviewed by ADDOM for orchestrating delegated coding tasks.',
})
const OPENAI_FAST_PROCESSING_CAPABILITY = Object.freeze({
  fast: {
    authMethods: ['api_key', 'account'],
    requestByAuthMethod: {
      api_key: { serviceTier: 'priority' },
      account: { serviceTier: 'fast' },
    },
    pricing: 'premium',
  },
})
const MOONSHOT_FAST_PROCESSING_CAPABILITY = Object.freeze({
  fast: {
    authMethods: ['api_key'],
    request: { modelId: 'kimi-k2.7-code-highspeed' },
    pricing: 'premium',
  },
})
const MOONSHOT_FORMULA_RUNTIME = Object.freeze({
  supported: true,
  family: 'moonshot_formula',
  surfaces: ['formula'],
  mode: 'remote_tool_bundle',
  notes: 'Moonshot Formula provider-native tool surface is controlled by Moonshot runtime settings.',
})
const PERPLEXITY_SEARCH_RUNTIME = Object.freeze({
  supported: true,
  family: 'perplexity_search',
  surfaces: ['search'],
  mode: 'provider_owned_runtime',
  notes: 'Perplexity search is provider-owned response grounding with citations, not an executable provider tool bundle.',
})
const PERPLEXITY_RESEARCH_RUNTIME = Object.freeze({
  supported: true,
  family: 'perplexity_research',
  surfaces: ['research'],
  mode: 'provider_owned_runtime',
  notes: 'Perplexity deep research is provider-owned runtime behavior, not an executable provider tool bundle.',
})
const GOOGLE_REASONING_DEFAULT_PROVIDER_OPTIONS = Object.freeze({
  google: {
    thinkingConfig: {
      includeThoughts: true,
    },
  },
})
const GOOGLE_THINKING_LEVEL_CAPABILITY = Object.freeze({
  supported: true,
  providerControls: [
    'google:thinkingConfig.includeThoughts',
    'google:thinkingConfig.thinkingLevel',
  ],
  notes: 'Gemini 3.x reasoning uses provider-supported thinking levels.',
})
function googleThinkingLevelOptions(thinkingLevel) {
  return {
    google: {
      thinkingConfig: {
        includeThoughts: true,
        thinkingLevel,
      },
    },
  }
}
function googleThinkingLevelVariants(levels, defaultLevel) {
  return Object.freeze(levels.map((level) => ({
    id: level,
    label: level.charAt(0).toUpperCase() + level.slice(1),
    ...(level === defaultLevel ? { default: true } : {}),
    providerOptions: googleThinkingLevelOptions(level),
  })))
}
const GOOGLE_FLASH_35_REASONING_VARIANTS = googleThinkingLevelVariants(
  ['minimal', 'low', 'medium', 'high'],
  'medium',
)
const GOOGLE_PRO_31_REASONING_VARIANTS = googleThinkingLevelVariants(
  ['low', 'medium', 'high'],
  'high',
)
const GOOGLE_FLASH_LITE_31_REASONING_VARIANTS = googleThinkingLevelVariants(
  ['minimal', 'low', 'medium', 'high'],
  'minimal',
)
const GOOGLE_25_REASONING_VARIANTS = googleThinkingLevelVariants(
  ['low', 'medium', 'high'],
  null,
)
const XAI_REASONING_CAPABILITY = Object.freeze({
  supported: true,
  providerControls: ['xai:reasoningEffort'],
  notes: 'Curated Grok reasoning variants map to xAI reasoning-effort provider options.',
})
const XAI_REASONING_DEFAULT_PROVIDER_OPTIONS = Object.freeze({
  xai: {
    reasoningEffort: 'high',
  },
})
const XAI_REASONING_VARIANTS = Object.freeze([
  {
    id: 'deep',
    label: 'Deep',
    default: true,
    providerOptions: {
      xai: {
        reasoningEffort: 'high',
      },
    },
  },
  {
    id: 'fast',
    label: 'Fast',
    providerOptions: {
      xai: {
        reasoningEffort: 'low',
      },
    },
  },
])
const XAI_MULTI_AGENT_REASONING_CAPABILITY = Object.freeze({
  supported: true,
  providerControls: ['xai:reasoningEffort'],
  notes: 'Reasoning effort controls the multi-agent execution breadth for this model.',
})
const XAI_MULTI_AGENT_REASONING_VARIANTS = Object.freeze([
  {
    id: 'comprehensive',
    label: 'Comprehensive',
    default: true,
    providerOptions: { xai: { reasoningEffort: 'high' } },
  },
  {
    id: 'focused',
    label: 'Focused',
    providerOptions: { xai: { reasoningEffort: 'low' } },
  },
])
const GROQ_REASONING_CAPABILITY = Object.freeze({
  supported: true,
  providerControls: ['groq:reasoningEffort'],
  notes: 'Curated Groq reasoning models expose selectable reasoning effort through Groq provider options.',
})
const GROQ_REASONING_DEFAULT_PROVIDER_OPTIONS = Object.freeze({
  groq: {
    reasoningEffort: 'medium',
  },
})
const GROQ_REASONING_VARIANTS = Object.freeze([
  {
    id: 'balanced',
    label: 'Balanced',
    default: true,
    providerOptions: {
      groq: {
        reasoningEffort: 'medium',
      },
    },
  },
  {
    id: 'deep',
    label: 'Deep',
    providerOptions: {
      groq: {
        reasoningEffort: 'high',
      },
    },
  },
  {
    id: 'fast',
    label: 'Fast',
    providerOptions: {
      groq: {
        reasoningEffort: 'low',
      },
    },
  },
])
const GROQ_QWEN_REASONING_DEFAULT_PROVIDER_OPTIONS = Object.freeze({
  groq: { reasoningEffort: 'default' },
})
const GROQ_QWEN_REASONING_VARIANTS = Object.freeze([
  {
    id: 'thinking',
    label: 'Thinking',
    default: true,
    providerOptions: { groq: { reasoningEffort: 'default' } },
  },
  {
    id: 'fast',
    label: 'Fast',
    providerOptions: { groq: { reasoningEffort: 'none' } },
  },
])
const OPENAI_COMPAT_INTERLEAVED_REASONING_CAPABILITY = Object.freeze({
  supported: true,
  providerControls: ['openaiCompatible:reasoning_content'],
  notes: 'This model emits execution-time reasoning as interleaved OpenAI-compatible text content that should be replayed through the reasoning lane.',
})
const GENERATED_MODEL_MAP = Object.freeze(
  Object.fromEntries(
    (Array.isArray(GENERATED_MODEL_CATALOG_SNAPSHOT) ? GENERATED_MODEL_CATALOG_SNAPSHOT : [])
      .map((provider) => [
        String(provider?.providerId || '').trim().toLowerCase(),
        Object.fromEntries(
          (Array.isArray(provider?.models) ? provider.models : [])
            .map((entry) => [String(entry?.id || '').trim(), entry])
            .filter(([modelId]) => Boolean(modelId)),
        ),
      ])
      .filter(([providerId]) => Boolean(providerId)),
  ),
)

function model(id, label, group, extra = {}) {
  return { id, label, group, ...extra }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function getGeneratedModel(providerId = '', modelId = '') {
  const normalizedProviderId = String(providerId || '').trim().toLowerCase()
  const normalizedModelId = String(modelId || '').trim()
  if (!normalizedProviderId || !normalizedModelId) return null
  return GENERATED_MODEL_MAP[normalizedProviderId]?.[normalizedModelId] || null
}

function supportsGeneratedImageInput(model = {}) {
  const inputModalities = Array.isArray(model?.capabilities?.inputModalities)
    ? model.capabilities.inputModalities
    : []
  const attachmentKinds = Array.isArray(model?.capabilities?.attachment?.kinds)
    ? model.capabilities.attachment.kinds
    : []
  return inputModalities.includes('image') || attachmentKinds.includes('image')
}

function supportsGeneratedPdfInput(model = {}) {
  const inputModalities = Array.isArray(model?.capabilities?.inputModalities)
    ? model.capabilities.inputModalities
    : []
  const attachmentKinds = Array.isArray(model?.capabilities?.attachment?.kinds)
    ? model.capabilities.attachment.kinds
    : []
  return inputModalities.includes('pdf')
    || inputModalities.includes('file')
    || attachmentKinds.includes('pdf')
}

function cloneGeneratedPricing(model = {}) {
  return model?.pricing && typeof model.pricing === 'object'
    ? cloneJson(model.pricing)
    : null
}

function hasGeneratedAttachmentTruth(model = {}) {
  const inputModalities = Array.isArray(model?.capabilities?.inputModalities)
    ? model.capabilities.inputModalities
    : []
  const attachmentKinds = Array.isArray(model?.capabilities?.attachment?.kinds)
    ? model.capabilities.attachment.kinds
    : []
  return typeof model?.capabilities?.attachment?.supported === 'boolean'
    || inputModalities.length > 0
    || attachmentKinds.length > 0
}

function buildOpenRouterModelNotes(entry = {}, sourceProvider = {}, sourceModel = {}) {
  const notes = [
    `OpenRouter reviewed route for ${String(sourceProvider.providerId || '').trim()}/${String(sourceModel.id || '').trim()}.`,
    'Explicit OpenRouter selection only; native provider-only runtimes are not carried over.',
  ]
  if (entry.status === 'remap') {
    notes.push(`Remap from curated model ID to route ${String(entry.routeId || '').trim()}.`)
  }
  const compatibilityNote = String(entry.notes || '').trim()
  if (compatibilityNote) notes.push(compatibilityNote)
  return notes.join(' ')
}

function buildOpenRouterProvider(baseProviders = []) {
  const sourceProviders = Array.isArray(baseProviders) ? baseProviders : []
  const providerMap = new Map(sourceProviders.map((provider) => [String(provider.providerId || '').trim(), provider]))
  const models = []
  const seenRoutes = new Set()

  for (const entry of OPENROUTER_SUPPORTED_COMPATIBILITY_ENTRIES) {
    const routeId = String(entry.routeId || '').trim()
    if (!routeId) continue
    const routeKey = routeId.toLowerCase()
    if (seenRoutes.has(routeKey)) continue

    const sourceProvider = providerMap.get(String(entry.sourceProviderId || '').trim()) || null
    const curatedSourceModel = Array.isArray(sourceProvider?.models)
      ? sourceProvider.models.find((row) => String(row?.id || '').trim() === String(entry.sourceModelId || '').trim())
      : null
    if (!sourceProvider) continue
    const generatedSourceModel = getGeneratedModel(sourceProvider.providerId, entry.sourceModelId)
    const sourceModel = curatedSourceModel || {
      id: String(entry.sourceModelId || '').trim(),
      capabilities: {},
    }
    const generatedRouteModel = getGeneratedModel('openrouter', routeId)
    const sourceReasoning = generatedSourceModel?.capabilities?.reasoning?.supported === true || sourceModel.reasoning === true
    const sourceVision = generatedSourceModel ? supportsGeneratedImageInput(generatedSourceModel) : sourceModel.vision === true
    const sourceSupportsPdf = generatedSourceModel ? supportsGeneratedPdfInput(generatedSourceModel) : sourceModel.supportsPdf === true
    const sourceContextWindowTokens = Number.isFinite(generatedSourceModel?.limits?.context)
      ? Number(generatedSourceModel.limits.context)
      : sourceModel.contextWindowTokens
    const sourceInputLimitTokens = Number.isFinite(generatedSourceModel?.limits?.input)
      ? Number(generatedSourceModel.limits.input)
      : null
    const sourceMaxOutputTokens = Number.isFinite(generatedSourceModel?.limits?.output)
      ? Number(generatedSourceModel.limits.output)
      : sourceModel.maxOutputTokens
    const sourceInputModalities = Array.isArray(generatedSourceModel?.capabilities?.inputModalities)
      ? [...generatedSourceModel.capabilities.inputModalities]
      : []
    const sourceOutputModalities = Array.isArray(generatedSourceModel?.capabilities?.outputModalities)
      ? [...generatedSourceModel.capabilities.outputModalities]
      : []
    const sourceAttachmentKinds = [
      ...(sourceVision ? ['image'] : []),
      ...(sourceSupportsPdf ? ['pdf'] : []),
    ]
    const sourcePricing = cloneGeneratedPricing(generatedSourceModel)
    const sourceAttachmentSupported = sourceAttachmentKinds.length > 0
    const sourceInterleavedReasoning = (
      sourceModel?.capabilities?.interleavedReasoning
      && typeof sourceModel.capabilities.interleavedReasoning === 'object'
      && sourceModel.capabilities.interleavedReasoning.supported === true
    )
      ? cloneJson(sourceModel.capabilities.interleavedReasoning)
      : null
    const sourceDelegation = sourceModel?.capabilities?.delegation?.supported === true
      ? sourceModel.capabilities.delegation
      : null
    const routeHasInputModalities = Array.isArray(generatedRouteModel?.capabilities?.inputModalities)
      && generatedRouteModel.capabilities.inputModalities.length > 0
    const routeHasOutputModalities = Array.isArray(generatedRouteModel?.capabilities?.outputModalities)
      && generatedRouteModel.capabilities.outputModalities.length > 0
    const routeHasAttachment = hasGeneratedAttachmentTruth(generatedRouteModel)

    const sourceRuntime = sourceModel.providerNativeRuntime && typeof sourceModel.providerNativeRuntime === 'object'
      ? sourceModel.providerNativeRuntime
      : null
    const providerSupportsNativeRuntime = sourceRuntime?.supported === true || (
      !curatedSourceModel
      && sourceProvider.models.some((candidate) => candidate?.providerNativeRuntime?.supported === true)
    )
    const genericToolCallingSupported = providerSupportsNativeRuntime !== true
      && String(sourceProvider.providerId || '').trim() !== 'perplexity'
      && sourceModel?.capabilities?.toolCall?.supported !== false
      && generatedRouteModel?.capabilities?.toolCall?.supported !== false

    models.push(model(routeId, routeId, String(sourceProvider.name || sourceProvider.providerId || 'OpenRouter').trim(), {
      reasoning: sourceReasoning,
      ...(sourceVision ? { vision: true } : {}),
      supportsPdf: sourceSupportsPdf,
      ...(String(generatedSourceModel?.releaseDate || '').trim() ? { releaseDate: String(generatedSourceModel.releaseDate).trim() } : {}),
      ...(String(generatedSourceModel?.lastUpdated || '').trim() ? { lastUpdated: String(generatedSourceModel.lastUpdated).trim() } : {}),
      ...(String(generatedSourceModel?.knowledge || '').trim() ? { knowledge: String(generatedSourceModel.knowledge).trim() } : {}),
      ...(typeof generatedSourceModel?.structuredOutput === 'boolean' ? { structuredOutput: generatedSourceModel.structuredOutput === true } : {}),
      ...(Number.isFinite(sourceContextWindowTokens) ? { contextWindowTokens: sourceContextWindowTokens } : {}),
      ...(Number.isFinite(sourceInputLimitTokens) ? { inputLimitTokens: sourceInputLimitTokens, inputLimit: sourceInputLimitTokens } : {}),
      ...(Number.isFinite(sourceMaxOutputTokens) ? { maxOutputTokens: sourceMaxOutputTokens } : {}),
      ...(sourcePricing ? { pricing: sourcePricing } : {}),
      contextSource: 'verified_fallback',
      verifiedAt: OPENROUTER_VERIFIED_AT,
      availability: {
        status: 'verified',
        requiresKey: true,
        localAvailable: null,
        gates: [],
        notes: 'Reviewed OpenRouter route; explicit selection only.',
      },
      capabilities: {
        toolCall: {
          supported: genericToolCallingSupported,
          notes: genericToolCallingSupported
            ? 'Generic tool-calling is allowed through the OpenRouter OpenAI-compatible surface.'
            : 'Provider-native runtime semantics are not carried over to OpenRouter in ADDOM v1.',
        },
        ...(sourceDelegation ? { delegation: cloneJson(sourceDelegation) } : {}),
        ...(!routeHasInputModalities && sourceInputModalities.length > 0 ? { inputModalities: sourceInputModalities } : {}),
        ...(!routeHasOutputModalities && sourceOutputModalities.length > 0 ? { outputModalities: sourceOutputModalities } : {}),
        ...(sourceReasoning
          ? {
              reasoning: {
                supported: true,
                notes: 'Reasoning-capable route reviewed for explicit OpenRouter use.',
              },
            }
          : {}),
        ...(sourceInterleavedReasoning
          ? {
              interleavedReasoning: sourceInterleavedReasoning,
            }
          : {}),
        ...(!routeHasAttachment
          ? {
              attachment: {
                supported: sourceAttachmentSupported,
                kinds: sourceAttachmentKinds,
                modalities: sourceAttachmentKinds,
              },
            }
          : {}),
      },
      notes: buildOpenRouterModelNotes(entry, sourceProvider, sourceModel),
    }))
    seenRoutes.add(routeKey)
  }

  return {
    providerId: 'openrouter',
    name: 'OpenRouter',
    defaultModel: 'openai/gpt-5.6-sol',
    keyHint: 'sk-or-v1-...',
    keyUrl: 'https://openrouter.ai/settings/keys',
    termsUrl: 'https://openrouter.ai/terms',
    termsVersion: TERMS_VERSION,
    baseUrl: 'https://openrouter.ai/api/v1',
    availability: {
      status: 'verified',
      requiresKey: true,
      localAvailable: null,
      gates: [],
      notes: 'Reviewed OpenRouter routes for explicit BYOK use.',
    },
    models: cloneJson(models),
  }
}

const BASE_MODEL_PROVIDER_REGISTRY_DATA = [
  {
    providerId: 'anthropic',
    name: 'Anthropic',
    defaultModel: 'claude-sonnet-5',
    keyHint: 'sk-ant-api03-...',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    termsUrl: 'https://www.anthropic.com/legal/commercial-terms',
    termsVersion: TERMS_VERSION,
    models: [
      model('claude-sonnet-5', 'Claude Sonnet 5', 'Claude 5', { capabilities: { reasoning: ANTHROPIC_DISABLEABLE_REASONING_CAPABILITY, delegation: DELEGATION_CAPABILITY }, defaultProviderOptions: ANTHROPIC_EFFORT_REASONING_DEFAULT_PROVIDER_OPTIONS, variants: ANTHROPIC_EFFORT_REASONING_VARIANTS }),
      model('claude-opus-4-8', 'Claude Opus 4.8', 'Claude 4', { capabilities: { reasoning: ANTHROPIC_ADAPTIVE_REASONING_CAPABILITY, delegation: DELEGATION_CAPABILITY }, defaultProviderOptions: ANTHROPIC_ADAPTIVE_REASONING_DEFAULT_PROVIDER_OPTIONS, variants: ANTHROPIC_ADAPTIVE_REASONING_VARIANTS }),
      model('claude-fable-5', 'Claude Fable 5', 'Claude 5', { capabilities: { reasoning: ANTHROPIC_EFFORT_REASONING_CAPABILITY, delegation: DELEGATION_CAPABILITY }, defaultProviderOptions: ANTHROPIC_EFFORT_REASONING_DEFAULT_PROVIDER_OPTIONS, variants: ANTHROPIC_EFFORT_REASONING_VARIANTS }),
      model('claude-haiku-4-5', 'Claude Haiku 4.5', 'Claude 4', { capabilities: { reasoning: ANTHROPIC_THINKING_CAPABILITY }, defaultProviderOptions: ANTHROPIC_MANUAL_REASONING_DEFAULT_PROVIDER_OPTIONS, variants: ANTHROPIC_MANUAL_REASONING_VARIANTS }),
    ],
  },
  {
    providerId: 'openai',
    name: 'OpenAI',
    defaultModel: 'gpt-5.6-sol',
    keyHint: 'sk-...',
    keyUrl: 'https://platform.openai.com/api-keys',
    termsUrl: 'https://openai.com/policies/service-terms',
    termsVersion: TERMS_VERSION,
    models: [
      model('gpt-5.6-sol', 'GPT-5.6 Sol', 'GPT-5.6', { capabilities: { delegation: DELEGATION_CAPABILITY, processing: OPENAI_FAST_PROCESSING_CAPABILITY }, contextWindowTokens: 1_050_000, maxOutputTokens: 128_000 }),
      model('gpt-5.6-terra', 'GPT-5.6 Terra', 'GPT-5.6', { capabilities: { delegation: DELEGATION_CAPABILITY, processing: OPENAI_FAST_PROCESSING_CAPABILITY }, contextWindowTokens: 1_050_000, maxOutputTokens: 128_000 }),
      model('gpt-5.6-luna', 'GPT-5.6 Luna', 'GPT-5.6', { capabilities: { delegation: DELEGATION_CAPABILITY, processing: OPENAI_FAST_PROCESSING_CAPABILITY }, contextWindowTokens: 1_050_000, maxOutputTokens: 128_000 }),
      model('gpt-5.3-codex', 'GPT-5.3 Codex', 'Codex', {
        capabilities: {
          delegation: DELEGATION_CAPABILITY,
          interleavedReasoning: OPENAI_COMPAT_INTERLEAVED_REASONING_CAPABILITY,
        },
        notes: 'Responses API only.',
      }),
      model('gpt-5.5', 'GPT-5.5', 'GPT-5', { capabilities: { delegation: DELEGATION_CAPABILITY, processing: OPENAI_FAST_PROCESSING_CAPABILITY } }),
      model('gpt-5.4', 'GPT-5.4', 'GPT-5', { capabilities: { delegation: DELEGATION_CAPABILITY, processing: OPENAI_FAST_PROCESSING_CAPABILITY } }),
    ],
  },
  {
    providerId: 'gemini',
    name: 'Google Gemini',
    defaultModel: 'gemini-3.5-flash',
    keyHint: 'AIza...',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    termsUrl: 'https://ai.google.dev/gemini-api/terms',
    termsVersion: TERMS_VERSION,
    models: [
      model('gemini-3.5-flash', 'Gemini 3.5 Flash', 'Gemini 3', { capabilities: { reasoning: GOOGLE_THINKING_LEVEL_CAPABILITY, delegation: DELEGATION_CAPABILITY }, defaultProviderOptions: googleThinkingLevelOptions('medium'), variants: GOOGLE_FLASH_35_REASONING_VARIANTS }),
      model('gemini-3.1-pro-preview', 'Gemini 3.1 Pro (Preview)', 'Gemini 3', { capabilities: { reasoning: GOOGLE_THINKING_LEVEL_CAPABILITY, delegation: DELEGATION_CAPABILITY }, defaultProviderOptions: googleThinkingLevelOptions('high'), variants: GOOGLE_PRO_31_REASONING_VARIANTS }),
      model('gemini-3.1-flash-lite', 'Gemini 3.1 Flash Lite', 'Gemini 3', { capabilities: { reasoning: GOOGLE_THINKING_LEVEL_CAPABILITY }, defaultProviderOptions: googleThinkingLevelOptions('minimal'), variants: GOOGLE_FLASH_LITE_31_REASONING_VARIANTS }),
      model('gemini-2.5-pro', 'Gemini 2.5 Pro', 'Gemini 2.5', { capabilities: { reasoning: GOOGLE_THINKING_LEVEL_CAPABILITY, delegation: DELEGATION_CAPABILITY }, defaultProviderOptions: GOOGLE_REASONING_DEFAULT_PROVIDER_OPTIONS, variants: GOOGLE_25_REASONING_VARIANTS }),
    ],
  },
  {
    providerId: 'moonshot',
    name: 'Moonshot AI',
    defaultModel: 'kimi-k2.6',
    keyHint: 'sk-...',
    keyUrl: 'https://platform.moonshot.ai/console/api-keys',
    termsUrl: 'https://platform.moonshot.ai/docs/agreement/modeluse',
    termsVersion: TERMS_VERSION,
    baseUrl: 'https://api.moonshot.ai/v1',
    models: [
      model('kimi-k2.6', 'Kimi K2.6', 'Kimi K2', {
        capabilities: { delegation: DELEGATION_CAPABILITY },
        providerNativeRuntime: MOONSHOT_FORMULA_RUNTIME,
      }),
      model('kimi-k2.7-code', 'Kimi K2.7 Code', 'Code', {
        capabilities: { delegation: DELEGATION_CAPABILITY, processing: MOONSHOT_FAST_PROCESSING_CAPABILITY },
        providerNativeRuntime: MOONSHOT_FORMULA_RUNTIME,
      }),
    ],
  },
  {
    providerId: 'grok',
    name: 'xAI Grok',
    defaultModel: 'grok-4.5',
    keyHint: 'xai-...',
    keyUrl: 'https://console.x.ai/',
    termsUrl: 'https://x.ai/legal/enterprise-terms-of-service',
    termsVersion: TERMS_VERSION,
    models: [
      model('grok-4.5', 'Grok 4.5', 'Grok 4', { capabilities: { reasoning: XAI_REASONING_CAPABILITY, delegation: DELEGATION_CAPABILITY }, contextWindowTokens: 500_000, defaultProviderOptions: XAI_REASONING_DEFAULT_PROVIDER_OPTIONS, variants: XAI_REASONING_VARIANTS }),
      model('grok-4.3', 'Grok 4.3', 'Grok 4', { capabilities: { reasoning: XAI_REASONING_CAPABILITY, delegation: DELEGATION_CAPABILITY }, contextWindowTokens: 1_000_000, defaultProviderOptions: XAI_REASONING_DEFAULT_PROVIDER_OPTIONS, variants: XAI_REASONING_VARIANTS }),
      model('grok-4.20-multi-agent-0309', 'Grok 4.20 Multi-Agent', 'Grok 4.20', { aliases: ['grok-4.20-multi-agent'], capabilities: { reasoning: XAI_MULTI_AGENT_REASONING_CAPABILITY, delegation: DELEGATION_CAPABILITY }, contextWindowTokens: 1_000_000, defaultProviderOptions: XAI_REASONING_DEFAULT_PROVIDER_OPTIONS, variants: XAI_MULTI_AGENT_REASONING_VARIANTS }),
    ],
  },
  {
    providerId: 'groq',
    name: 'Groq',
    defaultModel: 'openai/gpt-oss-120b',
    keyHint: 'gsk_...',
    keyUrl: 'https://console.groq.com/keys',
    termsUrl: 'https://console.groq.com/docs/legal/ai-policy',
    termsVersion: TERMS_VERSION,
    models: [
      model('openai/gpt-oss-120b', 'GPT OSS 120B', 'OSS', { capabilities: { reasoning: GROQ_REASONING_CAPABILITY }, defaultProviderOptions: GROQ_REASONING_DEFAULT_PROVIDER_OPTIONS, variants: GROQ_REASONING_VARIANTS }),
      model('openai/gpt-oss-20b', 'GPT OSS 20B', 'OSS', { capabilities: { reasoning: GROQ_REASONING_CAPABILITY }, defaultProviderOptions: GROQ_REASONING_DEFAULT_PROVIDER_OPTIONS, variants: GROQ_REASONING_VARIANTS }),
      model('qwen/qwen3.6-27b', 'Qwen3.6 27B', 'Reasoning', { capabilities: { reasoning: GROQ_REASONING_CAPABILITY }, defaultProviderOptions: GROQ_QWEN_REASONING_DEFAULT_PROVIDER_OPTIONS, variants: GROQ_QWEN_REASONING_VARIANTS }),
      model('groq/compound', 'Compound', 'Groq', {}),
    ],
  },
  {
    providerId: 'mistral',
    name: 'Mistral',
    defaultModel: 'mistral-medium-2604',
    keyHint: '...',
    keyUrl: 'https://console.mistral.ai/api-keys/',
    termsUrl: 'https://legal.mistral.ai/terms/commercial-terms-of-service',
    termsVersion: TERMS_VERSION,
    models: [
      model('mistral-medium-2604', 'Mistral Medium 3.5', 'Mistral', { capabilities: { delegation: DELEGATION_CAPABILITY } }),
      model('mistral-small-2603', 'Mistral Small 4', 'Mistral', {}),
      model('mistral-large-2512', 'Mistral Large 3', 'Mistral', {}),
    ],
  },
  {
    providerId: 'deepseek',
    name: 'DeepSeek',
    defaultModel: 'deepseek-v4-flash',
    keyHint: 'sk-...',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    termsUrl: 'https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html',
    termsVersion: TERMS_VERSION,
    models: [
      model('deepseek-v4-flash', 'DeepSeek V4 Flash', 'DeepSeek V4', { capabilities: { delegation: DELEGATION_CAPABILITY } }),
      model('deepseek-v4-pro', 'DeepSeek V4 Pro', 'DeepSeek V4', { capabilities: { delegation: DELEGATION_CAPABILITY } }),
    ],
  },
  {
    providerId: 'perplexity',
    name: 'Perplexity',
    defaultModel: 'sonar-pro',
    keyHint: 'pplx-...',
    keyUrl: 'https://www.perplexity.ai/settings/api',
    termsUrl: 'https://www.perplexity.ai/hub/legal/perplexity-api-terms-of-service',
    termsVersion: TERMS_VERSION,
    models: [
      model('sonar-pro', 'Sonar Pro', 'Search', { providerNativeRuntime: PERPLEXITY_SEARCH_RUNTIME }),
      model('sonar', 'Sonar', 'Search', { providerNativeRuntime: PERPLEXITY_SEARCH_RUNTIME }),
      model('sonar-reasoning-pro', 'Sonar Reasoning Pro', 'Reasoning', { providerNativeRuntime: PERPLEXITY_SEARCH_RUNTIME }),
      model('sonar-deep-research', 'Sonar Deep Research', 'Research', { providerNativeRuntime: PERPLEXITY_RESEARCH_RUNTIME }),
    ],
  },
  {
    providerId: 'ollama',
    name: 'Ollama (local)',
    defaultModel: '',
    noKeyRequired: true,
    keyUrl: 'https://ollama.com/download',
    localAvailable: false,
    models: [],
  },
  {
    providerId: 'lmstudio',
    name: 'LM Studio (local)',
    defaultModel: '',
    noKeyRequired: true,
    keyUrl: 'https://lmstudio.ai/',
    localAvailable: false,
    models: [],
  },
]

const LOCAL_PROVIDER_IDS = new Set(['ollama', 'lmstudio'])

export const MODEL_PROVIDER_REGISTRY_DATA = [
  ...BASE_MODEL_PROVIDER_REGISTRY_DATA.filter((provider) => !LOCAL_PROVIDER_IDS.has(String(provider.providerId || '').trim())),
  buildOpenRouterProvider(BASE_MODEL_PROVIDER_REGISTRY_DATA),
  ...BASE_MODEL_PROVIDER_REGISTRY_DATA.filter((provider) => LOCAL_PROVIDER_IDS.has(String(provider.providerId || '').trim())),
]
