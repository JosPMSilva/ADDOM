function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

const OPENAI_RAW_USAGE = {
  input_tokens: 120,
  output_tokens: 30,
  total_tokens: 150,
  input_tokens_details: {
    cached_tokens: 40,
  },
  output_tokens_details: {
    reasoning_tokens: 7,
  },
}

const ANTHROPIC_RAW_USAGE = {
  input_tokens: 700,
  output_tokens: 110,
  cache_creation_input_tokens: 100,
  cache_read_input_tokens: 250,
  iterations: [
    { type: 'compaction', input_tokens: 1200, output_tokens: 30 },
    { type: 'message', input_tokens: 700, output_tokens: 110 },
  ],
}

const GEMINI_RAW_USAGE = {
  promptTokenCount: 1200,
  cachedContentTokenCount: 200,
  candidatesTokenCount: 400,
  thoughtsTokenCount: 50,
  totalTokenCount: 1650,
}

const OPENAI_COMPATIBLE_RAW_USAGE = {
  prompt_tokens: 90,
  completion_tokens: 18,
  total_tokens: 108,
  prompt_tokens_details: {
    cached_tokens: 15,
  },
  completion_tokens_details: {
    reasoning_tokens: 4,
  },
}

export const PROVIDER_USAGE_FIXTURES = Object.freeze({
  openai: Object.freeze({
    usage: clone(OPENAI_RAW_USAGE),
    expected: Object.freeze({
      inputTokens: 120,
      outputTokens: 30,
      reasoningTokens: 7,
      totalTokens: 150,
      cachedInputTokens: 40,
      inputTokenDetails: {
        cachedTokens: 40,
        cacheReadTokens: 40,
      },
      outputTokenDetails: {
        reasoningTokens: 7,
        textTokens: 23,
      },
      raw: clone(OPENAI_RAW_USAGE),
    }),
  }),
  anthropic: Object.freeze({
    usage: {
      inputTokens: 2050,
      outputTokens: 140,
      totalTokens: 2190,
      cachedInputTokens: 250,
      inputTokenDetails: {
        noCacheTokens: 1700,
        cacheReadTokens: 250,
        cacheWriteTokens: 100,
        cachedTokens: 250,
      },
      outputTokenDetails: {
        textTokens: 140,
      },
      raw: clone(ANTHROPIC_RAW_USAGE),
    },
    expected: Object.freeze({
      inputTokens: 2050,
      outputTokens: 140,
      reasoningTokens: 0,
      totalTokens: 2190,
      cachedInputTokens: 250,
      inputTokenDetails: {
        noCacheTokens: 1700,
        cacheReadTokens: 250,
        cacheWriteTokens: 100,
        cachedTokens: 250,
      },
      outputTokenDetails: {
        textTokens: 140,
      },
      raw: clone(ANTHROPIC_RAW_USAGE),
    }),
  }),
  gemini: Object.freeze({
    usage: {
      inputTokens: 1200,
      outputTokens: 450,
      totalTokens: 1650,
      cachedInputTokens: 200,
      inputTokenDetails: {
        noCacheTokens: 1000,
        cacheReadTokens: 200,
        cachedTokens: 200,
      },
      outputTokenDetails: {
        textTokens: 400,
        reasoningTokens: 50,
      },
      raw: clone(GEMINI_RAW_USAGE),
    },
    expected: Object.freeze({
      inputTokens: 1200,
      outputTokens: 450,
      reasoningTokens: 50,
      totalTokens: 1650,
      cachedInputTokens: 200,
      inputTokenDetails: {
        noCacheTokens: 1000,
        cacheReadTokens: 200,
        cachedTokens: 200,
      },
      outputTokenDetails: {
        textTokens: 400,
        reasoningTokens: 50,
      },
      raw: clone(GEMINI_RAW_USAGE),
    }),
  }),
  xai: Object.freeze({
    usage: {
      prompt_tokens: 100,
      completion_tokens: 60,
      prompt_tokens_details: {
        cached_tokens: 40,
      },
      completion_tokens_details: {
        reasoning_tokens: 15,
      },
    },
    expected: Object.freeze({
      inputTokens: 100,
      outputTokens: 60,
      reasoningTokens: 15,
      totalTokens: 160,
      cachedInputTokens: 40,
      inputTokenDetails: {
        cachedTokens: 40,
        cacheReadTokens: 40,
      },
      outputTokenDetails: {
        reasoningTokens: 15,
        textTokens: 45,
      },
    }),
  }),
  groq: Object.freeze({
    usage: {
      prompt_tokens: 88,
      completion_tokens: 22,
      prompt_tokens_details: {
        cached_tokens: 10,
      },
      completion_tokens_details: {
        reasoning_tokens: 6,
      },
      x_groq: {
        usage: {
          prompt_tokens: 88,
          completion_tokens: 22,
          prompt_tokens_details: { cached_tokens: 10 },
          completion_tokens_details: { reasoning_tokens: 6 },
        },
      },
    },
    expected: Object.freeze({
      inputTokens: 88,
      outputTokens: 22,
      reasoningTokens: 6,
      totalTokens: 110,
      cachedInputTokens: 10,
      inputTokenDetails: {
        cachedTokens: 10,
        cacheReadTokens: 10,
      },
      outputTokenDetails: {
        reasoningTokens: 6,
        textTokens: 16,
      },
    }),
  }),
  mistral: Object.freeze({
    usage: {
      prompt_tokens: 75,
      completion_tokens: 25,
      total_tokens: 100,
    },
    expected: Object.freeze({
      inputTokens: 75,
      outputTokens: 25,
      reasoningTokens: 0,
      totalTokens: 100,
    }),
  }),
  perplexity: Object.freeze({
    usage: {
      prompt_tokens: 55,
      completion_tokens: 24,
      reasoning_tokens: 5,
      citation_tokens: 9,
      num_search_queries: 2,
    },
    expected: Object.freeze({
      inputTokens: 55,
      outputTokens: 24,
      reasoningTokens: 5,
      totalTokens: 79,
    }),
  }),
  openaiCompatible: Object.freeze({
    usage: {
      inputTokens: 90,
      outputTokens: 18,
      totalTokens: 108,
      cachedInputTokens: 15,
      inputTokenDetails: {
        noCacheTokens: 75,
        cacheReadTokens: 15,
        cachedTokens: 15,
      },
      outputTokenDetails: {
        textTokens: 14,
        reasoningTokens: 4,
      },
      raw: clone(OPENAI_COMPATIBLE_RAW_USAGE),
    },
    expected: Object.freeze({
      inputTokens: 90,
      outputTokens: 18,
      reasoningTokens: 4,
      totalTokens: 108,
      cachedInputTokens: 15,
      inputTokenDetails: {
        noCacheTokens: 75,
        cacheReadTokens: 15,
        cachedTokens: 15,
      },
      outputTokenDetails: {
        textTokens: 14,
        reasoningTokens: 4,
      },
      raw: clone(OPENAI_COMPATIBLE_RAW_USAGE),
    }),
  }),
})

export function getProviderUsageFixture(providerId = '') {
  return PROVIDER_USAGE_FIXTURES[String(providerId || '').trim()]
    ? clone(PROVIDER_USAGE_FIXTURES[String(providerId || '').trim()])
    : null
}

export function buildUsageResolutionFixture({
  currentProvider = 'openai',
  aggregateProvider = 'gemini',
} = {}) {
  const current = getProviderUsageFixture(currentProvider)
  const aggregate = getProviderUsageFixture(aggregateProvider)
  return {
    usage: current?.usage || null,
    totalUsage: aggregate?.usage || null,
  }
}

export function buildOpenAIUsageResponseFixture() {
  return {
    id: 'resp_usage_fixture_1',
    model: 'gpt-5.2',
    status: 'completed',
    conversation: { id: 'conv_usage_fixture_1' },
    usage: clone(OPENAI_RAW_USAGE),
    output: [],
  }
}
