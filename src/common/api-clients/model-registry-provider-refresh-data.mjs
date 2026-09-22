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
