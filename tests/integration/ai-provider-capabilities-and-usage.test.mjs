import test from 'node:test'
import assert from 'node:assert/strict'
import {
  __resetDynamicModelCache,
  resolveModelCapabilities,
  getCachedModelCapabilities,
  __testAiProviderInternals,
  buildAssistantToolUseMessage,
  shouldIncludeReasoningPartInAssistantToolHistory,
} from '../../src/main/api-clients/ai-provider.mjs'
import { resolveOpenAIModelRuntimeSupport } from '../../src/main/api-clients/openai-runtime-types.mjs'
import {
  buildUsageResolutionFixture,
  getProviderUsageFixture,
} from '../fixtures/provider-usage-fixtures.mjs'

test('resolveModelCapabilities uses merged catalog defaults for curated models and explicit unknown state for unknown models', async () => {
  __resetDynamicModelCache()

  const curated = await resolveModelCapabilities('openai', '', 'gpt-5.4', { forceRefresh: true })
  assert.equal(curated.providerId, 'openai')
  assert.equal(curated.modelId, 'gpt-5.4')
  assert.equal(curated.supportsTools, true)
  assert.equal(curated.source, 'merged_catalog')

  const unknown = await resolveModelCapabilities('openai', '', 'unknown-model-xyz', { forceRefresh: true })
  assert.equal(unknown.providerId, 'openai')
  assert.equal(unknown.modelId, 'unknown-model-xyz')
  assert.equal(unknown.supportsTools, false)
  assert.equal(unknown.supportsReasoning, false)
  assert.equal(unknown.source, 'unknown')
})

test('resolveModelCapabilities keeps OpenAI account capability state separate from API-key capability state without drifting the canonical delegation default', async () => {
  __resetDynamicModelCache()

  const apiKeyCaps = await resolveModelCapabilities('openai', '', 'gpt-5.4', {
    forceRefresh: true,
    authMethod: 'api_key',
  })
  const accountCaps = await resolveModelCapabilities('openai', '', 'gpt-5.4', {
    forceRefresh: true,
    authMethod: 'account',
  })

  assert.equal(apiKeyCaps.authMethod, 'api_key')
  assert.equal(apiKeyCaps.supportsChatToolSurface, true)
  assert.equal(apiKeyCaps.supportsDelegatedToolSurface, true)
  assert.equal(apiKeyCaps.supportsCollabAgentActivities, false)
  assert.equal(apiKeyCaps.supportsAddomMoaDelegation, true)
  assert.deepEqual(apiKeyCaps.delegationBackends, ['addom_moa'])
  assert.equal(apiKeyCaps.preferredDelegationBackend, 'addom_moa')

  assert.equal(accountCaps.authMethod, 'account')
  assert.equal(accountCaps.supportsChatToolSurface, true)
  assert.equal(accountCaps.supportsDelegatedToolSurface, true)
  assert.equal(accountCaps.supportsCollabAgentActivities, true)
  assert.equal(accountCaps.supportsAddomMoaDelegation, true)
  assert.deepEqual(accountCaps.delegationBackends, ['openai_native', 'addom_moa'])
  assert.equal(accountCaps.preferredDelegationBackend, 'addom_moa')
  assert.equal(accountCaps.toolSupportMode, 'provider_owned_runtime')
  assert.equal(accountCaps.toolSurfaceMode, 'provider_owned_runtime')
  assert.equal(accountCaps.providerNativeRuntimeFamily, 'openai_codex_app_server')
  assert.equal(accountCaps.providerNativeRuntimeMode, 'provider_owned_runtime')
  assert.equal(accountCaps.accountRuntimeStatus, 'parity')
  assert.equal(Array.isArray(accountCaps.accountCapabilityExceptions), true)
  assert.equal(accountCaps.accountCapabilityExceptions.length, 0)
  assert.equal(accountCaps.accountCapabilityContract?.capabilities?.approvals?.status, 'parity')
  assert.equal(accountCaps.accountCapabilityContract?.capabilities?.compaction?.status, 'parity')
  assert.equal(accountCaps.accountCapabilityContract?.capabilities?.question_user?.status, 'parity')

  const cachedApiKeyCaps = getCachedModelCapabilities('openai', 'gpt-5.4', { authMethod: 'api_key' })
  const cachedAccountCaps = getCachedModelCapabilities('openai', 'gpt-5.4', { authMethod: 'account' })
  assert.equal(cachedApiKeyCaps?.authMethod, 'api_key')
  assert.equal(cachedAccountCaps?.authMethod, 'account')
  assert.notDeepEqual(cachedApiKeyCaps, cachedAccountCaps)
})

test('resolveModelCapabilities keeps LM Studio tool support enabled when model metadata omits capabilities', async () => {
  __resetDynamicModelCache()

  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      data: [
        { id: 'qwen2.5-7b-instruct' },
      ],
    }),
  })

  try {
    const result = await resolveModelCapabilities('lmstudio', '', 'qwen2.5-7b-instruct', {
      forceRefresh: true,
    })

    assert.equal(result.providerId, 'lmstudio')
    assert.equal(result.modelId, 'qwen2.5-7b-instruct')
    assert.equal(result.supportsTools, true)
    assert.equal(result.source, 'provider_default')
    assert.match(String(result.note || ''), /all models support at least some degree of tool use/i)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('resolveModelCapabilities keeps uncataloged remote models conservative even when the provider has tool-capable families', async () => {
  __resetDynamicModelCache()

  const result = await resolveModelCapabilities('deepseek', '', 'deepseek-new-unknown-model', {
    forceRefresh: true,
  })

  assert.equal(result.providerId, 'deepseek')
  assert.equal(result.modelId, 'deepseek-new-unknown-model')
  assert.equal(result.supportsTools, false)
  assert.equal(result.supportsReasoning, false)
  assert.equal(result.source, 'unknown')
})

test('getCachedModelCapabilities supports allowExpired reads for stale capability entries', async () => {
  __resetDynamicModelCache()

  const originalNow = Date.now
  try {
    Date.now = () => 1_000_000
    await resolveModelCapabilities('openai', '', 'gpt-5.4', { forceRefresh: true })

    Date.now = () => 1_000_000 + (11 * 60 * 1000)

    const staleAllowed = getCachedModelCapabilities('openai', 'gpt-5.4', { allowExpired: true })
    assert.ok(staleAllowed)
    assert.equal(staleAllowed.modelId, 'gpt-5.4')

    const staleBlocked = getCachedModelCapabilities('openai', 'gpt-5.4', { allowExpired: false })
    assert.equal(staleBlocked, null)

    const staleAfterPurge = getCachedModelCapabilities('openai', 'gpt-5.4', { allowExpired: true })
    assert.equal(staleAfterPurge, null)
  } finally {
    Date.now = originalNow
  }
})

test('tools-unsupported classification marks cached model capabilities as runtime unsupported', async () => {
  __resetDynamicModelCache()

  const unsupportedError = new Error('This model does not support tools for this request.')
  assert.equal(__testAiProviderInternals.isToolsUnsupportedError(unsupportedError), true)
  assert.equal(__testAiProviderInternals.isToolsUnsupportedError(new Error('invalid api key')), false)

  __testAiProviderInternals.markToolsUnsupported('openai', 'gpt-5.4', unsupportedError)
  const cached = getCachedModelCapabilities('openai', 'gpt-5.4')
  assert.ok(cached)
  assert.equal(cached.supportsTools, false)
  assert.equal(cached.source, 'runtime_error')
  assert.match(String(cached.note || ''), /does not support tools/i)
})

test('normalizeUsage handles heterogeneous usage payloads', () => {
  const openai = getProviderUsageFixture('openai')
  const fromSnakeCase = __testAiProviderInternals.normalizeUsage(openai.usage)
  assert.equal(fromSnakeCase.inputTokens, 120)
  assert.equal(fromSnakeCase.outputTokens, 30)
  assert.equal(fromSnakeCase.reasoningTokens, 7)
  assert.equal(fromSnakeCase.totalTokens, 150)
  assert.equal(fromSnakeCase.cachedInputTokens, 40)
  assert.deepEqual(fromSnakeCase.inputTokenDetails, {
    cachedTokens: 40,
    cacheReadTokens: 40,
  })
  assert.deepEqual(fromSnakeCase.outputTokenDetails, {
    reasoningTokens: 7,
    textTokens: 23,
  })
  assert.deepEqual(fromSnakeCase.raw, openai.expected.raw)

  const gemini = getProviderUsageFixture('gemini')
  const fromRichSdkShape = __testAiProviderInternals.normalizeUsage(gemini.usage)
  assert.equal(fromRichSdkShape.inputTokens, 1200)
  assert.equal(fromRichSdkShape.outputTokens, 450)
  assert.equal(fromRichSdkShape.reasoningTokens, 50)
  assert.equal(fromRichSdkShape.totalTokens, 1650)
  assert.equal(fromRichSdkShape.cachedInputTokens, 200)
  assert.deepEqual(fromRichSdkShape.inputTokenDetails, {
    noCacheTokens: 1000,
    cacheReadTokens: 200,
    cachedTokens: 200,
  })
  assert.deepEqual(fromRichSdkShape.outputTokenDetails, {
    textTokens: 400,
    reasoningTokens: 50,
  })
  assert.deepEqual(fromRichSdkShape.raw, gemini.expected.raw)

  assert.equal(__testAiProviderInternals.normalizeUsage({}), null)
})

test('resolveResultUsage prefers single-step usage, preserves aggregate totals, then falls back to provider metadata', async () => {
  const fromStepUsage = await __testAiProviderInternals.resolveResultUsage(
    buildUsageResolutionFixture({
      currentProvider: 'openaiCompatible',
      aggregateProvider: 'gemini',
    }),
  )
  assert.equal(fromStepUsage.usageSource, 'usage')
  assert.equal(fromStepUsage.usageSourcePath, 'usage')
  assert.equal(fromStepUsage.inputTokens, 90)
  assert.equal(fromStepUsage.outputTokens, 18)
  assert.equal(fromStepUsage.reasoningTokens, 4)
  assert.equal(fromStepUsage.totalTokens, 108)
  assert.equal(fromStepUsage.aggregateUsageSource, 'totalUsage')
  assert.equal(fromStepUsage.aggregateUsagePath, 'totalUsage')
  assert.equal(fromStepUsage.aggregateUsage.inputTokens, 1200)
  assert.equal(fromStepUsage.aggregateUsage.outputTokens, 450)
  assert.equal(fromStepUsage.aggregateUsage.totalTokens, 1650)

  const fromProviderMetadata = await __testAiProviderInternals.resolveResultUsage({
    usage: async () => { throw new Error('no usage') },
    totalUsage: null,
    providerMetadata: async () => ({
      openai: getProviderUsageFixture('openai').usage,
    }),
  })
  assert.equal(fromProviderMetadata.usageSource, 'providerMetadata')
  assert.equal(fromProviderMetadata.usageSourcePath, 'providerMetadata.openai')
  assert.equal(fromProviderMetadata.inputTokens, 120)
  assert.equal(fromProviderMetadata.outputTokens, 30)
  assert.equal(fromProviderMetadata.reasoningTokens, 7)
  assert.equal(fromProviderMetadata.totalTokens, 150)
})

test('buildProviderOptions emits expected reasoning options by provider/model', () => {
  const anthropic = __testAiProviderInternals.buildProviderOptions('anthropic', 'claude-sonnet-5')
  assert.deepEqual(anthropic, { anthropic: { effort: 'high' } })

  const anthropicMax = __testAiProviderInternals.buildProviderOptions('anthropic', 'claude-sonnet-5', {
    reasoningEffort: 'max',
  })
  assert.deepEqual(anthropicMax, {
    anthropic: {
      effort: 'max',
    },
  })

  const anthropicHaiku = __testAiProviderInternals.buildProviderOptions('anthropic', 'claude-haiku-4-5', {
    reasoningEffort: 'high',
  })
  assert.deepEqual(anthropicHaiku, {
    anthropic: {
      thinking: { type: 'enabled', budgetTokens: 16000 },
    },
  })

  const gemini = __testAiProviderInternals.buildProviderOptions('gemini', 'gemini-2.5-pro')
  assert.deepEqual(gemini, { google: { thinkingConfig: { includeThoughts: true } } })

  const grok = __testAiProviderInternals.buildProviderOptions('grok', 'grok-4.3')
  assert.deepEqual(grok, { xai: { reasoningEffort: 'high' } })

  const grokFast = __testAiProviderInternals.buildProviderOptions('grok', 'grok-4.3', null, {
    variantId: 'fast',
  })
  assert.deepEqual(grokFast, { xai: { reasoningEffort: 'low' } })

  const groq = __testAiProviderInternals.buildProviderOptions('groq', 'qwen/qwen3.6-27b')
  assert.deepEqual(groq, {
    groq: {
      reasoningEffort: 'default',
    },
  })

  const groqFast = __testAiProviderInternals.buildProviderOptions('groq', 'qwen/qwen3.6-27b', null, {
    variantId: 'fast',
  })
  assert.deepEqual(groqFast, {
    groq: {
      reasoningEffort: 'none',
    },
  })

  const openaiReasoning = __testAiProviderInternals.buildProviderOptions('openai', 'gpt-5.4', {
    reasoningSummary: 'auto',
    reasoningEffort: 'high',
    textVerbosity: 'high',
    serviceTier: 'priority',
    promptCachingEnabled: true,
    promptCacheRetention: '24h',
  }, {
    projectId: 'project-1',
    threadId: 'thread-1',
    messages: [
      { role: 'system', content: 'You are ADDOM.' },
      { role: 'user', content: 'Hi' },
    ],
    toolNames: ['web_search', 'run_command'],
  })
  assert.equal(typeof openaiReasoning?.openai?.promptCacheKey, 'string')
  assert.match(
    String(openaiReasoning?.openai?.promptCacheKey || ''),
    /^addom:openai:gpt-5\.4:[0-9a-f]{8}:[0-9a-f]{8}:[0-9a-f]{16}$/,
  )
  assert.equal(String(openaiReasoning?.openai?.promptCacheKey || '').length <= 64, true)
  assert.deepEqual(openaiReasoning, {
    openai: {
      store: false,
      reasoningSummary: 'auto',
      reasoningEffort: 'high',
      textVerbosity: 'high',
      serviceTier: 'priority',
      promptCacheKey: openaiReasoning.openai.promptCacheKey,
      promptCacheRetention: '24h',
    },
  })

  const openaiChat = __testAiProviderInternals.buildProviderOptions('openai', 'gpt-5-chat')
  assert.deepEqual(openaiChat, {
    openai: {
      store: false,
      promptCacheKey: openaiChat.openai.promptCacheKey,
      promptCacheRetention: 'in_memory',
    },
  })
  assert.match(
    String(openaiChat?.openai?.promptCacheKey || ''),
    /^addom:openai:gpt-5:[0-9a-f]{8}:[0-9a-f]{8}:[0-9a-f]{16}$/,
  )
  assert.equal(String(openaiChat?.openai?.promptCacheKey || '').length <= 64, true)

  for (const modelId of ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']) {
    const openaiGpt56 = __testAiProviderInternals.buildProviderOptions('openai', modelId, {
      promptCachingEnabled: true,
      promptCacheRetention: 'in_memory',
    })
    assert.equal(typeof openaiGpt56?.openai?.promptCacheKey, 'string')
    assert.equal(
      Object.prototype.hasOwnProperty.call(openaiGpt56.openai, 'promptCacheRetention'),
      false,
      `${modelId} should use OpenAI implicit prompt caching instead of forcing in_memory retention`,
    )

    const openaiGpt56Extended = __testAiProviderInternals.buildProviderOptions('openai', modelId, {
      promptCachingEnabled: true,
      promptCacheRetention: '24h',
    })
    assert.equal(openaiGpt56Extended?.openai?.promptCacheRetention, '24h')
  }

  const ollamaThinking = __testAiProviderInternals.buildProviderOptions('ollama', 'qwen3:8b')
  assert.deepEqual(ollamaThinking, { openaiCompatible: { think: true } })

  const moonshot = __testAiProviderInternals.buildProviderOptions('moonshot', 'kimi-k2.6')
  assert.equal(moonshot, undefined)
})

test('buildProviderOptions wires openai continuity fields and file-search include list', () => {
  const options = __testAiProviderInternals.buildProviderOptions('openai', 'gpt-5.4', {
    promptCachingEnabled: true,
  }, {
    projectId: 'project-2',
    threadId: 'thread-9',
    messages: [
      { role: 'system', content: 'You are ADDOM.' },
      { role: 'user', content: 'Find this in my uploaded files.' },
    ],
    toolNames: ['file_search'],
    openai: {
      store: true,
      previousResponseId: 'resp_456',
    },
  })

  assert.equal(options?.openai?.store, true)
  assert.equal(options?.openai?.previousResponseId, 'resp_456')
  assert.equal(Object.prototype.hasOwnProperty.call(options?.openai || {}, 'conversation'), false)
  assert.deepEqual(options?.openai?.include, ['file_search_call.results'])
  assert.match(
    String(options?.openai?.promptCacheKey || ''),
    /^addom:openai:gpt-5\.4:[0-9a-f]{8}:[0-9a-f]{8}:[0-9a-f]{16}$/,
  )
  assert.equal(String(options?.openai?.promptCacheKey || '').length <= 64, true)
})

test('buildProviderOptions keeps OpenAI prompt cache key within provider max length for long scopes', () => {
  const options = __testAiProviderInternals.buildProviderOptions('openai', 'gpt-5.5', {
    promptCachingEnabled: true,
  }, {
    projectId: 'project_1772487519187_766cfb14_with_extra_scope_detail_that_would_otherwise_be_too_long',
    threadId: 'thread_1772487519187_9201f0a3_with_extra_scope_detail_that_would_otherwise_be_too_long',
    messages: [
      { role: 'system', content: 'You are ADDOM.' },
      { role: 'developer', content: 'Prefer concise, verifiable answers.' },
      { role: 'user', content: 'hello' },
    ],
    toolNames: ['file_search', 'mcp'],
  })

  const key = String(options?.openai?.promptCacheKey || '')
  assert.equal(key.length > 0, true)
  assert.equal(key.length <= 64, true)
  assert.match(key, /^addom:openai:gpt-5\.5:[0-9a-f]{8}:[0-9a-f]{8}:[0-9a-f]{16}$/)
})

test('buildProviderOptions hashes oversized OpenAI model segments in prompt cache key', () => {
  const options = __testAiProviderInternals.buildProviderOptions(
    'openai',
    'custom-openai-model-with-a-very-long-family-name-that-exceeds-segment-limits',
    { promptCachingEnabled: true },
    {
      projectId: 'project-x',
      threadId: 'thread-y',
      messages: [{ role: 'system', content: 'You are ADDOM.' }],
    },
  )

  const key = String(options?.openai?.promptCacheKey || '')
  assert.equal(key.length > 0, true)
  assert.equal(key.length <= 64, true)
  assert.match(key, /^addom:openai:m-[0-9a-f]{13}:[0-9a-f]{8}:[0-9a-f]{8}:[0-9a-f]{16}$/)
})

test('buildProviderOptions keeps include list to supported OpenAI include keys', () => {
  const options = __testAiProviderInternals.buildProviderOptions('openai', 'gpt-5.4', {
    promptCachingEnabled: false,
  }, {
    toolNames: ['file_search', 'mcp'],
    openai: {
      store: true,
    },
  })

  assert.equal(options?.openai?.store, true)
  assert.deepEqual(options?.openai?.include, ['file_search_call.results'])
  assert.equal(Object.prototype.hasOwnProperty.call(options?.openai || {}, 'promptCacheKey'), false)
})

test('buildProviderOptions prefers OpenAI conversation state over previous-response chaining when both ids are present', () => {
  const options = __testAiProviderInternals.buildProviderOptions('openai', 'gpt-5.4', {
    promptCachingEnabled: true,
  }, {
    projectId: 'project-2',
    threadId: 'thread-9',
    messages: [
      { role: 'system', content: 'You are ADDOM.' },
      { role: 'user', content: 'Continue this conversation.' },
    ],
    openai: {
      store: true,
      previousResponseId: 'resp_456',
      conversationId: 'conv_123',
    },
  })

  assert.equal(options?.openai?.store, true)
  assert.equal(options?.openai?.conversation, 'conv_123')
  assert.equal(Object.prototype.hasOwnProperty.call(options?.openai || {}, 'previousResponseId'), false)
})

test('resolveOpenAIModelRuntimeSupport reflects model-specific hosted tools and reasoning controls', () => {
  const gpt54 = resolveOpenAIModelRuntimeSupport('gpt-5.4')
  assert.deepEqual(gpt54.reasoningEffortOptions, ['none', 'low', 'medium', 'high', 'xhigh'])
  assert.equal(gpt54.supportsTextVerbosity, true)
  assert.equal(gpt54.hostedToolSupport.code_interpreter, true)
  assert.equal(gpt54.hostedToolSupport.shell, true)
  assert.equal(gpt54.hostedToolSupport.mcp, true)
  assert.equal(gpt54.hostedToolSupport.apply_patch, true)
  assert.equal(gpt54.supportsShellEnvironment, true)
  assert.equal(gpt54.supportsBackgroundMode, true)
  assert.equal(gpt54.supportsAssistantPhase, true)

  const gpt55ApiKey = resolveOpenAIModelRuntimeSupport('gpt-5.5')
  assert.equal(gpt55ApiKey.accountRuntimeStatus, 'not_applicable')
  assert.equal(gpt55ApiKey.hostedToolSupport.web_search, true)
  assert.equal(gpt55ApiKey.supportsServiceTierPriority, true)

  const gpt55Account = resolveOpenAIModelRuntimeSupport('gpt-5.5', { authMethod: 'account' })
  assert.deepEqual(gpt55Account.reasoningEffortOptions, ['none', 'low', 'medium', 'high', 'xhigh'])
  assert.equal(gpt55Account.hostedToolSupport.web_search, true)
  assert.equal(gpt55Account.hostedToolSupport.code_interpreter, true)
  assert.equal(gpt55Account.hostedToolSupport.shell, true)
  assert.equal(gpt55Account.hostedToolSupport.mcp, true)
  assert.equal(gpt55Account.hostedToolSupport.apply_patch, true)
  assert.equal(gpt55Account.supportsShellEnvironment, true)
  assert.equal(gpt55Account.supportsBackgroundMode, true)
  assert.equal(gpt55Account.supportsAssistantPhase, true)

  const gpt53Codex = resolveOpenAIModelRuntimeSupport('gpt-5.3-codex')
  assert.deepEqual(gpt53Codex.reasoningEffortOptions, ['low', 'medium', 'high', 'xhigh'])
  assert.equal(gpt53Codex.supportsTextVerbosity, false)
  assert.equal(gpt53Codex.supportsPromptCaching, true)
  assert.equal(gpt53Codex.supportsPromptCache24h, true)
  assert.equal(gpt53Codex.hostedToolSupport.web_search, false)
  assert.equal(gpt53Codex.hostedToolSupport.file_search, false)
  assert.equal(gpt53Codex.hostedToolSupport.code_interpreter, false)
  assert.equal(gpt53Codex.hostedToolSupport.image_generation, false)
  assert.equal(gpt53Codex.hostedToolSupport.mcp, false)
  assert.equal(gpt53Codex.hostedToolSupport.shell, false)
  assert.equal(gpt53Codex.hostedToolSupport.apply_patch, false)
  assert.equal(gpt53Codex.supportsBackgroundMode, false)
  assert.equal(gpt53Codex.supportsAssistantPhase, true)

  const gpt52 = resolveOpenAIModelRuntimeSupport('gpt-5.2')
  assert.deepEqual(gpt52.reasoningEffortOptions, [])
  assert.equal(gpt52.supportsTextVerbosity, false)
  assert.equal(gpt52.hostedToolSupport.code_interpreter, false)
  assert.equal(gpt52.supportsShellEnvironment, false)
  assert.equal(gpt52.supportsBackgroundMode, false)
  assert.equal(gpt52.supportsAssistantPhase, false)

  const gpt5Chat = resolveOpenAIModelRuntimeSupport('gpt-5-chat')
  assert.equal(gpt5Chat.isReasoningModel, false)
  assert.equal(gpt5Chat.supportsTextVerbosity, false)
  assert.equal(gpt5Chat.reasoningEffortOptions.length, 0)

  const gpt51 = resolveOpenAIModelRuntimeSupport('gpt-5.1')
  assert.equal(gpt51.hostedToolSupport.shell, false)
  assert.equal(gpt51.supportsShellEnvironment, false)
  assert.equal(gpt51.hostedToolSupport.mcp, false)
  assert.equal(gpt51.hostedToolSupport.apply_patch, false)

  const gpt5Mini = resolveOpenAIModelRuntimeSupport('gpt-5-mini')
  assert.equal(gpt5Mini.hostedToolSupport.shell, false)
  assert.equal(gpt5Mini.hostedToolSupport.image_generation, false)
  assert.equal(gpt5Mini.hostedToolSupport.apply_patch, false)

  const gpt5Nano = resolveOpenAIModelRuntimeSupport('gpt-5-nano')
  assert.equal(gpt5Nano.hostedToolSupport.shell, false)
  assert.equal(gpt5Nano.hostedToolSupport.image_generation, false)
  assert.equal(gpt5Nano.hostedToolSupport.apply_patch, false)

  const gpt41Mini = resolveOpenAIModelRuntimeSupport('gpt-4.1-mini')
  assert.equal(gpt41Mini.hostedToolSupport.shell, false)
})

test('buildProviderOptions normalizes prompt cache families for new OpenAI model ids', () => {
  const gpt55 = __testAiProviderInternals.buildProviderOptions('openai', 'gpt-5.5-2026-04-23', {
    promptCachingEnabled: true,
  }, {
    projectId: 'project-5',
    threadId: 'thread-5',
    messages: [
      { role: 'system', content: 'You are ADDOM.' },
    ],
  })
  assert.match(
    String(gpt55?.openai?.promptCacheKey || ''),
    /^addom:openai:gpt-5\.5:[0-9a-f]{8}:[0-9a-f]{8}:[0-9a-f]{16}$/,
  )

  const gpt53Codex = __testAiProviderInternals.buildProviderOptions('openai', 'gpt-5.3-codex-2026-03-05', {
    promptCachingEnabled: true,
  }, {
    projectId: 'project-6',
    threadId: 'thread-6',
    messages: [
      { role: 'system', content: 'You are ADDOM.' },
    ],
  })
  assert.match(
    String(gpt53Codex?.openai?.promptCacheKey || ''),
    /^addom:openai:gpt-5\.3-codex:[0-9a-f]{8}:[0-9a-f]{8}:[0-9a-f]{16}$/,
  )
})

test('buildAssistantToolUseMessage preserves reasoning, phase, and tool calls', () => {
  const message = buildAssistantToolUseMessage('Done.', [{
    id: 'call_1',
    name: 'moonshot_formula__web_search__search',
    input: { query: 'test' },
  }], {
    reasoningText: 'Need to search first.',
    phase: 'commentary',
  })

  assert.deepEqual(message, {
    role: 'assistant',
    phase: 'commentary',
    content: [
      { type: 'reasoning', text: 'Need to search first.' },
      { type: 'text', text: 'Done.' },
      {
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'moonshot_formula__web_search__search',
        input: { query: 'test' },
      },
    ],
  })
})

test('buildAssistantToolUseMessage can omit reasoning parts when provider does not support them', () => {
  const message = buildAssistantToolUseMessage('Done.', [], {
    reasoningText: 'Should be omitted.',
    includeReasoningPart: false,
  })
  assert.deepEqual(message, {
    role: 'assistant',
    content: [
      { type: 'text', text: 'Done.' },
    ],
  })
})

test('buildAssistantToolUseMessage prefers metadata-backed provider reasoning parts over plain reasoning text', () => {
  const providerReasoningParts = [
    {
      type: 'reasoning',
      text: 'Anthropic thinking block.',
      providerOptions: {
        anthropic: {
          signature: 'sig_123',
        },
      },
    },
    {
      type: 'reasoning',
      text: '',
      providerOptions: {
        anthropic: {
          redactedData: 'redacted_blob',
        },
      },
    },
  ]

  const message = buildAssistantToolUseMessage('Done.', [], {
    reasoningText: 'Plain reasoning should stay UI-only.',
    includeReasoningPart: false,
    providerReasoningParts,
  })

  assert.deepEqual(message, {
    role: 'assistant',
    content: [
      ...providerReasoningParts,
      { type: 'text', text: 'Done.' },
    ],
  })
  assert.deepEqual(
    __testAiProviderInternals.buildAssistantHistoryParts('Done.', {
      reasoningText: 'fallback',
      includeReasoningPart: true,
      providerReasoningParts,
    }),
    [
      ...providerReasoningParts,
      { type: 'text', text: 'Done.' },
    ],
  )
})

test('shouldIncludeReasoningPartInAssistantToolHistory disables plain reasoning replay for openai and anthropic', () => {
  assert.equal(shouldIncludeReasoningPartInAssistantToolHistory('openai'), false)
  assert.equal(shouldIncludeReasoningPartInAssistantToolHistory('anthropic'), false)
  assert.equal(shouldIncludeReasoningPartInAssistantToolHistory('gemini'), true)
})

test('normalizeMessagesForProvider strips reasoning parts for openai responses payloads across roles', () => {
  const normalized = __testAiProviderInternals.normalizeMessagesForProvider('openai', [
    {
      role: 'user',
      content: [
        { type: 'reasoning', text: 'Unexpected user reasoning part' },
        { type: 'text', text: 'Question' },
      ],
    },
    {
      role: 'assistant',
      phase: 'commentary',
      content: [
        { type: 'reasoning', text: 'Planning web fetch for query' },
        { type: 'text', text: 'Done.' },
      ],
    },
  ], { modelId: 'gpt-5.3-codex' })

  assert.deepEqual(normalized, [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Question' },
      ],
    },
    {
      role: 'assistant',
      phase: 'commentary',
      content: [
        { type: 'text', text: 'Done.' },
      ],
    },
  ])
})

test('prepareOpenAIContinuationMessages keeps system instructions and only replays the post-assistant delta', () => {
  const reduced = __testAiProviderInternals.prepareOpenAIContinuationMessages([
    { role: 'system', content: 'You are ADDOM.' },
    { role: 'user', content: 'First turn' },
    { role: 'assistant', content: 'Initial answer' },
    { role: 'user', content: 'Follow-up question' },
  ], {
    openai: {
      previousResponseId: 'resp_prev',
    },
  })

  assert.deepEqual(reduced.messages, [
    { role: 'system', content: 'You are ADDOM.' },
    { role: 'user', content: 'Follow-up question' },
  ])
  assert.equal(reduced.openAIContext.previousResponseId, 'resp_prev')
})

test('prepareOpenAIContinuationMessages disables chaining when there is no post-assistant delta', () => {
  const reduced = __testAiProviderInternals.prepareOpenAIContinuationMessages([
    { role: 'system', content: 'You are ADDOM.' },
    { role: 'user', content: 'First turn' },
    { role: 'assistant', content: 'Initial answer', phase: 'final_answer' },
  ], {
    openai: {
      previousResponseId: 'resp_prev',
      conversationId: 'conv_prev',
    },
  })

  assert.deepEqual(reduced.messages, [
    { role: 'system', content: 'You are ADDOM.' },
    { role: 'user', content: 'First turn' },
    { role: 'assistant', content: 'Initial answer', phase: 'final_answer' },
  ])
  assert.equal(reduced.openAIContext.previousResponseId, '')
  assert.equal(reduced.openAIContext.conversationId, '')
})

test('extractOpenAIResponseMeta reads conversation and cached-token details from responses payloads', () => {
  const meta = __testAiProviderInternals.extractOpenAIResponseMeta(
    {
      openai: {
        responseId: 'resp_999',
      },
    },
    {
      model: 'gpt-5.2',
      conversation: { id: 'conv_999' },
      service_tier: 'priority',
      status: 'completed',
      background: false,
      usage: {
        input_tokens_details: {
          cached_tokens: 17,
        },
      },
    },
    'gpt-5.2',
    {
      autoCompactionApplied: true,
      autoCompactionIds: ['cmp_auto_1'],
    },
  )

  assert.deepEqual(meta, {
    responseId: 'resp_999',
    conversationId: 'conv_999',
    serviceTier: 'priority',
    modelId: 'gpt-5.2',
    cachedTokens: 17,
    usageTelemetry: {
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      cachedInputTokens: 17,
      inputTokenDetails: {
        cachedTokens: 17,
        cacheReadTokens: 17,
      },
      raw: {
        input_tokens_details: {
          cached_tokens: 17,
        },
      },
    },
    background: false,
    status: 'completed',
    autoCompactionApplied: true,
    autoCompactionIds: ['cmp_auto_1'],
  })
})

test('resolveStreamRecoveryAction only preserves the explicit ollama alias retry path', () => {
  const unsupported = __testAiProviderInternals.resolveStreamRecoveryAction({
    providerId: 'openai',
    effectiveModelId: 'gpt-4.1-mini',
    hasTools: true,
    err: new Error('tools are not supported for this model'),
  })
  assert.equal(unsupported, 'none')

  const unsupportedSingleTool = __testAiProviderInternals.resolveStreamRecoveryAction({
    providerId: 'openai',
    effectiveModelId: 'gpt-5.1',
    hasTools: true,
    err: new Error("Tool 'local_shell' is not supported with gpt-5.1."),
  })
  assert.equal(unsupportedSingleTool, 'none')

  const mutuallyExclusiveTools = __testAiProviderInternals.resolveStreamRecoveryAction({
    providerId: 'openai',
    effectiveModelId: 'gpt-5.1',
    hasTools: true,
    err: new Error('code_interpreter and shell with an OpenAI-managed container cannot be used together at the same time.'),
  })
  assert.equal(mutuallyExclusiveTools, 'none')

  const groqNoOutputRetry = __testAiProviderInternals.resolveStreamRecoveryAction({
    providerId: 'groq',
    effectiveModelId: 'llama-3.3-70b-versatile',
    hasTools: true,
    activeProviderOptions: undefined,
    err: new Error('No output generated. Check the stream for errors.'),
  })
  assert.equal(groqNoOutputRetry, 'none')

  const ollamaRetry = __testAiProviderInternals.resolveStreamRecoveryAction({
    providerId: 'ollama',
    effectiveModelId: 'cloud-my-model',
    hasTools: false,
    activeProviderOptions: { openaiCompatible: { think: true } },
    err: new Error('No output generated for this response'),
  })
  assert.equal(ollamaRetry, 'minimal_ollama_alias_retry')

  const none = __testAiProviderInternals.resolveStreamRecoveryAction({
    providerId: 'openai',
    effectiveModelId: 'gpt-4.1-mini',
    hasTools: false,
    activeProviderOptions: undefined,
    err: new Error('bad request'),
  })
  assert.equal(none, 'none')
})
