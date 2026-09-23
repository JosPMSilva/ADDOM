import {
  ANTHROPIC_ADAPTIVE_REASONING_CAPABILITY,
  ANTHROPIC_PROGRESS_ADAPTIVE_REASONING_DEFAULT_PROVIDER_OPTIONS,
  ANTHROPIC_PROGRESS_ADAPTIVE_REASONING_VARIANTS,
} from './model-registry-anthropic-reasoning-data.mjs'

export const DELEGATION_CAPABILITY = Object.freeze({
  supported: true,
  notes: 'Reviewed by ADDOM for orchestrating delegated coding tasks.',
})

export const OPENAI_FAST_PROCESSING_CAPABILITY = Object.freeze({
  fast: {
    authMethods: ['api_key', 'account'],
    requestByAuthMethod: {
      api_key: { serviceTier: 'priority' },
      account: { serviceTier: 'fast' },
    },
    pricing: 'premium',
  },
})

export const ANTHROPIC_FAST_PROCESSING_CAPABILITY = Object.freeze({
  fast: {
    authMethods: ['api_key'],
    request: { speed: 'fast' },
    pricing: 'premium',
  },
})

export const OPENAI_ASTRA_PRICING = Object.freeze({
  inputUsdPer1M: 10,
  outputUsdPer1M: 50,
  cacheReadUsdPer1M: 1,
  cacheWriteUsdPer1M: 12.5,
  tiers: [{
    id: 'long-context',
    sizeUsdPer1M: 272_000,
    inputUsdPer1M: 20,
    outputUsdPer1M: 75,
    cacheReadUsdPer1M: 2,
    cacheWriteUsdPer1M: 25,
    notes: 'Requests with more than 272K input tokens use long-context rates for the full request.',
  }],
  notes: 'Fast mode is priced at 2x the applicable Standard or long-context rates.',
})

export const OPENAI_SOL_PRICING = Object.freeze({
  inputUsdPer1M: 2,
  outputUsdPer1M: 10,
  cacheReadUsdPer1M: 0.2,
  cacheWriteUsdPer1M: 2.5,
  tiers: [{
    id: 'long-context',
    sizeUsdPer1M: 272_000,
    inputUsdPer1M: 4,
    outputUsdPer1M: 15,
    cacheReadUsdPer1M: 0.4,
    cacheWriteUsdPer1M: 5,
    notes: 'Requests with more than 272K input tokens use long-context rates for the full request.',
  }],
  notes: 'Fast mode is priced at 2x the applicable Standard or long-context rates.',
})

export const OPENAI_LUNA_PRICING = Object.freeze({
  inputUsdPer1M: 0.1,
  outputUsdPer1M: 0.5,
  cacheReadUsdPer1M: 0.01,
  cacheWriteUsdPer1M: 0.125,
  tiers: [{
    id: 'long-context',
    sizeUsdPer1M: 272_000,
    inputUsdPer1M: 0.2,
    outputUsdPer1M: 0.75,
    cacheReadUsdPer1M: 0.02,
    cacheWriteUsdPer1M: 0.25,
    notes: 'Requests with more than 272K input tokens use long-context rates for the full request.',
  }],
  notes: 'Fast mode is priced at 2x the applicable Standard or long-context rates.',
})

export const ANTHROPIC_OPUS_55_CATALOG_DATA = Object.freeze({
  authoritativeFields: ['limits', 'pricing', 'reasoning', 'attachment', 'release', 'knowledge', 'structuredOutput'],
  vision: true,
  supportsPdf: true,
  structuredOutput: true,
  releaseDate: '2026-09-22',
  lastUpdated: '2026-09-22',
  knowledge: '2026-06',
  contextWindowTokens: 1_000_000,
  maxOutputTokens: 128_000,
  pricing: {
    inputUsdPer1M: 4,
    outputUsdPer1M: 20,
    cacheReadUsdPer1M: 0.2,
    cacheWriteUsdPer1M: 5,
    cacheWrite1hUsdPer1M: 8,
    notes: 'Cache write base price is the 5-minute rate; the 1-hour rate is recorded separately.',
  },
  capabilities: {
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    reasoning: ANTHROPIC_ADAPTIVE_REASONING_CAPABILITY,
    toolCall: { supported: true },
    attachment: { supported: true, kinds: ['image', 'pdf'], modalities: ['text', 'image', 'pdf'] },
    delegation: DELEGATION_CAPABILITY,
    processing: ANTHROPIC_FAST_PROCESSING_CAPABILITY,
  },
  defaultProviderOptions: ANTHROPIC_PROGRESS_ADAPTIVE_REASONING_DEFAULT_PROVIDER_OPTIONS,
  variants: ANTHROPIC_PROGRESS_ADAPTIVE_REASONING_VARIANTS,
})

function openAiGpt6CatalogData({ knowledge, pricing }) {
  return {
    authoritativeFields: ['limits', 'pricing', 'reasoning', 'attachment', 'release', 'knowledge', 'structuredOutput'],
    reasoning: true,
    vision: true,
    supportsPdf: true,
    structuredOutput: true,
    releaseDate: '2026-09-22',
    lastUpdated: '2026-09-22',
    knowledge,
    contextWindowTokens: 1_050_000,
    maxOutputTokens: 128_000,
    pricing,
    capabilities: {
      reasoning: { supported: true },
      toolCall: { supported: true },
      attachment: { supported: true, kinds: ['image', 'pdf'], modalities: ['text', 'image', 'pdf'] },
      delegation: DELEGATION_CAPABILITY,
      processing: OPENAI_FAST_PROCESSING_CAPABILITY,
    },
  }
}

export const OPENAI_SOL_CATALOG_DATA = Object.freeze(openAiGpt6CatalogData({
  knowledge: '2026-04',
  pricing: OPENAI_SOL_PRICING,
}))

export const OPENAI_LUNA_CATALOG_DATA = Object.freeze(openAiGpt6CatalogData({
  knowledge: '2026-05',
  pricing: OPENAI_LUNA_PRICING,
}))

export const GROQ_COMPOUND_CUSTOM_TOOL_CAPABILITY = Object.freeze({
  supported: false,
  notes: 'Groq Compound accepts Groq-managed built-in tools, not ADDOM custom tools.',
})

export const GROQ_COMPOUND_MINI_CUSTOM_TOOL_CAPABILITY = Object.freeze({
  supported: false,
  notes: 'Groq Compound Mini accepts Groq-managed built-in tools, not ADDOM custom tools.',
})

export const MOONSHOT_K3_REASONING_CAPABILITY = Object.freeze({
  supported: true,
  providerControls: ['moonshot:reasoningEffort'],
  notes: 'Kimi K3 always reasons and supports low, high, and max effort.',
})

function moonshotK3ReasoningOptions(reasoningEffort) {
  return { moonshot: { reasoningEffort } }
}

export const MOONSHOT_K3_REASONING_DEFAULT_PROVIDER_OPTIONS = Object.freeze(
  moonshotK3ReasoningOptions('max'),
)

export const MOONSHOT_K3_REASONING_VARIANTS = Object.freeze([
  {
    id: 'low',
    label: 'Low',
    providerOptions: moonshotK3ReasoningOptions('low'),
  },
  {
    id: 'high',
    label: 'High',
    providerOptions: moonshotK3ReasoningOptions('high'),
  },
  {
    id: 'max',
    label: 'Max',
    default: true,
    providerOptions: moonshotK3ReasoningOptions('max'),
  },
])

export const XAI_46_REASONING_VARIANTS = Object.freeze([
  {
    id: 'fast',
    label: 'Fast',
    providerOptions: { xai: { reasoningEffort: 'low' } },
  },
  {
    id: 'balanced',
    label: 'Balanced',
    providerOptions: { xai: { reasoningEffort: 'medium' } },
  },
  {
    id: 'deep',
    label: 'Deep',
    default: true,
    providerOptions: { xai: { reasoningEffort: 'high' } },
  },
  {
    id: 'max',
    label: 'Max',
    providerOptions: { xai: { reasoningEffort: 'xhigh' } },
  },
])

export const DEEPSEEK_REASONING_CAPABILITY = Object.freeze({
  supported: true,
  providerControls: ['deepseek:thinking', 'deepseek:reasoningEffort'],
  notes: 'DeepSeek V4 thinking is enabled by default and supports none, low, high, and max effort.',
})

function deepseekThinkingOptions(reasoningEffort, thinkingType = 'enabled') {
  return {
    deepseek: {
      reasoningEffort,
      thinking: { type: thinkingType },
    },
  }
}

export const DEEPSEEK_REASONING_DEFAULT_PROVIDER_OPTIONS = Object.freeze(
  deepseekThinkingOptions('high'),
)

export const DEEPSEEK_REASONING_VARIANTS = Object.freeze([
  {
    id: 'none',
    label: 'None',
    providerOptions: deepseekThinkingOptions('none', 'disabled'),
  },
  {
    id: 'low',
    label: 'Low',
    providerOptions: deepseekThinkingOptions('low'),
  },
  {
    id: 'high',
    label: 'High',
    default: true,
    providerOptions: deepseekThinkingOptions('high'),
  },
  {
    id: 'max',
    label: 'Max',
    providerOptions: deepseekThinkingOptions('max'),
  },
])

function deepseekTimeTieredPricing({ input, output, cacheRead }) {
  return {
    inputUsdPer1M: input,
    outputUsdPer1M: output,
    cacheReadUsdPer1M: cacheRead,
    tiers: [
      {
        id: 'off-peak',
        inputUsdPer1M: input / 2,
        outputUsdPer1M: output / 2,
        cacheReadUsdPer1M: cacheRead / 2,
        notes: 'Outside weekday peak hours (01:00-04:00 and 06:00-10:00 UTC).',
      },
      {
        id: 'peak',
        inputUsdPer1M: input,
        outputUsdPer1M: output,
        cacheReadUsdPer1M: cacheRead,
        notes: 'Weekdays 01:00-04:00 and 06:00-10:00 UTC.',
      },
    ],
    notes: 'Base prices use peak rates; off-peak rates apply outside the listed weekday windows.',
  }
}

export const DEEPSEEK_FLASH_PRICING = Object.freeze(deepseekTimeTieredPricing({
  input: 0.3,
  output: 1.2,
  cacheRead: 0.006,
}))

export const DEEPSEEK_PRO_PRICING = Object.freeze(deepseekTimeTieredPricing({
  input: 1.32,
  output: 3.96,
  cacheRead: 0.044,
}))

export const OPENAI_COMPAT_INTERLEAVED_REASONING_CAPABILITY = Object.freeze({
  supported: true,
  providerControls: ['openaiCompatible:reasoning_content'],
  notes: 'This model emits execution-time reasoning as interleaved OpenAI-compatible text content that should be replayed through the reasoning lane.',
})

export const MOONSHOT_K3_CATALOG_DATA = Object.freeze({
  authoritativeFields: ['limits', 'pricing', 'reasoning', 'attachment', 'release', 'structuredOutput', 'openWeights'],
  reasoning: true,
  vision: true,
  structuredOutput: true,
  openWeights: true,
  releaseDate: '2026-07-16',
  lastUpdated: '2026-07-16',
  contextWindowTokens: 1_000_000,
  maxOutputTokens: 1_048_576,
  pricing: {
    inputUsdPer1M: 3,
    outputUsdPer1M: 15,
    cacheReadUsdPer1M: 0.3,
  },
  capabilities: {
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    reasoning: MOONSHOT_K3_REASONING_CAPABILITY,
    toolCall: { supported: true },
    attachment: { supported: true, kinds: ['image'], modalities: ['text', 'image'] },
    providerNativeRuntime: { supported: false },
    interleavedReasoning: OPENAI_COMPAT_INTERLEAVED_REASONING_CAPABILITY,
  },
  defaultProviderOptions: MOONSHOT_K3_REASONING_DEFAULT_PROVIDER_OPTIONS,
  variants: MOONSHOT_K3_REASONING_VARIANTS,
})
