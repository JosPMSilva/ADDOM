import test from 'node:test'
import assert from 'node:assert/strict'

import { toAISDKTools } from '../../src/main/tools/tool-definitions.mjs'
import {
  replayInterleavedReasoningMessage,
  resolveInterleavedReasoningReplayTarget,
  resolveProviderModelTransform,
} from '../../src/main/api-clients/provider-model-transform.mjs'

test('provider model transform derives Gemini thinking config from curated model metadata', () => {
  const reasoningTransform = resolveProviderModelTransform({
    providerId: 'gemini',
    modelId: 'gemini-2.5-pro',
  })
  const flashTransform = resolveProviderModelTransform({
    providerId: 'gemini',
    modelId: 'gemini-3.5-flash',
  })

  assert.deepEqual(
    reasoningTransform.buildProviderOptions(),
    { google: { thinkingConfig: { includeThoughts: true } } },
  )
  assert.equal(reasoningTransform.adapterProfile.optionFamily, 'google_thinking_config')
  assert.deepEqual(
    flashTransform.buildProviderOptions(),
    { google: { thinkingConfig: { includeThoughts: true, thinkingLevel: 'medium' } } },
  )
  assert.equal(flashTransform.registryModel?.id, 'gemini-3.5-flash')
})

test('provider model transform derives Grok reasoning defaults and selected variants from curated metadata', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'grok',
    modelId: 'grok-4.5',
  })
  const defaultConfig = transform.resolveInvocationConfig()
  const fastConfig = transform.resolveInvocationConfig({
    requestContext: {
      variantId: 'fast',
    },
  })

  assert.equal(defaultConfig.selectedVariantId, 'deep')
  assert.deepEqual(defaultConfig.providerOptions, {
    xai: {
      reasoningEffort: 'high',
    },
  })
  assert.equal(fastConfig.selectedVariantId, 'fast')
  assert.deepEqual(fastConfig.providerOptions, {
    xai: {
      reasoningEffort: 'low',
    },
  })
})

test('provider model transform keeps standard and multi-agent Grok reasoning controls distinct', () => {
  const standard = resolveProviderModelTransform({
    providerId: 'grok',
    modelId: 'grok-4.3',
  })
  const multiAgent = resolveProviderModelTransform({
    providerId: 'grok',
    modelId: 'grok-4.20-multi-agent-0309',
  })

  assert.deepEqual(standard.buildProviderOptions(), {
    xai: { reasoningEffort: 'high' },
  })
  assert.equal(standard.registryModel?.variants?.some((variant) => variant.id === 'deep'), true)
  assert.equal(standard.registryModel?.variants?.some((variant) => variant.id === 'fast'), true)
  assert.deepEqual(multiAgent.buildProviderOptions(), {
    xai: { reasoningEffort: 'high' },
  })
  assert.equal(multiAgent.registryModel?.variants?.some((variant) => variant.id === 'focused'), true)
  assert.equal(multiAgent.registryModel?.variants?.some((variant) => variant.id === 'comprehensive'), true)
})

test('provider model transform derives Groq reasoning defaults and selected variants from curated metadata', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'groq',
    modelId: 'openai/gpt-oss-120b',
  })
  const defaultConfig = transform.resolveInvocationConfig()
  const deepConfig = transform.resolveInvocationConfig({
    requestContext: {
      variantId: 'deep',
    },
  })

  assert.equal(defaultConfig.selectedVariantId, 'balanced')
  assert.deepEqual(defaultConfig.providerOptions, {
    groq: {
      reasoningEffort: 'medium',
    },
  })
  assert.equal(deepConfig.selectedVariantId, 'deep')
  assert.deepEqual(deepConfig.providerOptions, {
    groq: {
      reasoningEffort: 'high',
    },
  })
})

test('provider model transform keeps OpenAI processing mode independent from reasoning effort', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'openai',
    modelId: 'gpt-5.4',
  })
  const fast = transform.resolveInvocationConfig({
    runtimeSettings: { reasoningEffort: 'high', serviceTier: 'auto' },
    requestContext: { processingMode: 'fast' },
  })
  const standard = transform.resolveInvocationConfig({
    runtimeSettings: { reasoningEffort: 'high', serviceTier: 'priority' },
    requestContext: { processingMode: 'standard' },
  })

  assert.equal(fast.providerOptions?.openai?.serviceTier, 'priority')
  assert.equal(fast.providerOptions?.openai?.reasoningEffort, 'high')
  assert.equal(standard.providerOptions?.openai?.serviceTier, 'default')
  assert.equal(standard.providerOptions?.openai?.reasoningEffort, 'high')
})

test('provider model transform omits Fast for unsupported OpenAI models', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'openai',
    modelId: 'gpt-5.3-codex',
  })

  assert.equal(
    transform.buildProviderOptions({ requestContext: { processingMode: 'fast' } })?.openai?.serviceTier,
    undefined,
  )
})

test('provider model transform keeps Groq provider options model-scoped', () => {
  const reasoning = resolveProviderModelTransform({
    providerId: 'groq',
    modelId: 'openai/gpt-oss-120b',
  })
  const nonReasoning = resolveProviderModelTransform({
    providerId: 'groq',
    modelId: 'groq/compound',
  })

  assert.equal(reasoning.adapterProfile.optionFamily, 'groq_reasoning_effort')
  assert.deepEqual(reasoning.buildProviderOptions(), {
    groq: {
      reasoningEffort: 'medium',
    },
  })
  assert.equal(nonReasoning.adapterProfile.optionFamily, 'none')
  assert.equal(nonReasoning.buildProviderOptions(), undefined)
})

test('provider model transform preserves supported Gemini multimodal parts from catalog truth', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'gemini',
    modelId: 'gemini-2.5-pro',
  })
  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Review this image and PDF.' },
        { type: 'image', filename: 'diagram.png' },
        { type: 'file', filename: 'spec.pdf' },
      ],
    },
  ]

  const normalized = transform.normalizeMessages({ messages })
  assert.ok(Array.isArray(normalized[0].content))
  assert.equal(normalized[0].content[1].type, 'image')
  assert.equal(normalized[0].content[2].type, 'file')
  assert.equal(normalized[0].content[2].filename, 'spec.pdf')
})

test('provider model transform exposes attachment compatibility from curated metadata', () => {
  const gemini = resolveProviderModelTransform({
    providerId: 'gemini',
    modelId: 'gemini-2.5-pro',
  })
  const moonshot = resolveProviderModelTransform({
    providerId: 'moonshot',
    modelId: 'kimi-k2.6',
  })

  assert.equal(gemini.attachment.supportsVision, true)
  assert.equal(gemini.attachment.inputModalities.includes('image'), true)
  assert.equal(moonshot.attachment.supportsPdf, false)
})

test('provider model transform does not strip attachments for generic unknown models', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'openai',
    modelId: 'gpt-5-unknown-lab-build',
  })

  const normalized = transform.normalizeMessages({
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Inspect these attachments.' },
        { type: 'image', filename: 'diagram.png' },
        { type: 'file', filename: 'spec.pdf', mediaType: 'application/pdf' },
      ],
    }],
  })

  assert.deepEqual(normalized[0].content, [
    { type: 'text', text: 'Inspect these attachments.' },
    { type: 'image', filename: 'diagram.png' },
    { type: 'file', filename: 'spec.pdf', mediaType: 'application/pdf' },
  ])
})

test('provider model transform derives text-only user flattening from adapter transport instead of raw provider id', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'custom-provider',
    modelId: 'custom-text-only-model',
    adapterProfile: {
      providerId: 'custom-provider',
      adapterModelId: 'custom-text-only-model',
      transportFamily: 'groq_chat',
      attachmentFamily: 'text_only',
      attachment: {
        family: 'text_only',
        supported: false,
        supportsVision: false,
        supportsPdf: false,
        inputModalities: ['text'],
      },
    },
  })

  const normalized = transform.normalizeMessages({
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Inspect these attachments.' },
        { type: 'image', filename: 'diagram.png', mediaType: 'image/png' },
      ],
    }],
  })

  assert.equal(typeof normalized[0].content, 'string')
  assert.match(String(normalized[0].content), /Inspect these attachments\./)
  assert.match(String(normalized[0].content), /Image attachment omitted/i)
})

test('provider model transform applies Gemini tool-schema normalization as a provider quirk', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'gemini',
    modelId: 'gemini-2.5-pro',
  })
  const normalized = transform.normalizeTools({ tools: toAISDKTools('ask', true) })
  const fileExtensions = normalized.search_code?.inputSchema?.jsonSchema?.properties?.file_extensions
  const delegateTaskItem = normalized.delegate_tasks?.inputSchema?.jsonSchema?.properties?.tasks?.items

  assert.equal(Array.isArray(fileExtensions?.type), false)
  assert.equal(Array.isArray(fileExtensions?.anyOf), true)
  assert.equal(fileExtensions.anyOf[0]?.type, 'array')
  assert.equal(fileExtensions.anyOf[1]?.type, 'null')
  assert.equal(Array.isArray(delegateTaskItem?.anyOf), true)
  for (const branch of delegateTaskItem.anyOf) {
    assert.equal(branch?.type, 'object')
    assert.equal(branch?.additionalProperties, false)
    assert.equal(Array.isArray(branch?.required), true)
    assert.equal(
      Object.prototype.hasOwnProperty.call(branch?.properties || {}, branch.required[0]),
      true,
    )
  }
})

test('tool definitions require apply_patch.patch for OpenAI function schema validity', () => {
  const tools = toAISDKTools('ask', true)
  const schema = tools.apply_patch?.inputSchema?.jsonSchema

  assert.deepEqual(schema?.required, ['patch'])
  assert.equal(schema?.properties?.patch?.type, 'string')
  assert.equal(schema?.additionalProperties, false)
})

test('provider model transform keeps canonical tool history while sanitizing tool-result media payloads', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'gemini',
    modelId: 'gemini-2.5-pro',
  })
  const normalized = transform.normalizeMessages({
    messages: [{
      role: 'tool',
      content: [{
        type: 'tool-result',
        toolCallId: 'call_browser_1',
        toolName: 'browser_action',
        output: {
          type: 'json',
          value: {
            summary: 'Captured screenshot.',
            content: [
              { type: 'text', text: 'Browser snapshot follows.' },
              { type: 'image', filename: 'capture.jpg', mediaType: 'image/jpeg', image: 'base64-image' },
              { type: 'file', filename: 'capture.pdf', mediaType: 'application/pdf', data: 'base64-file' },
            ],
            screenshotBase64: 'raw-screenshot',
            screenshotMediaType: 'image/jpeg',
            screenshotFilepath: 'captures/page.jpg',
          },
        },
      }],
    }],
  })

  assert.equal(normalized[0].role, 'tool')
  assert.equal(normalized[0].content[0].type, 'tool-result')
  assert.equal(normalized[0].content[0].toolCallId, 'call_browser_1')

  const sanitizedValue = normalized[0].content[0].output.value
  assert.equal(Array.isArray(sanitizedValue.content), true)
  assert.deepEqual(sanitizedValue.content, [
    { type: 'text', text: 'Browser snapshot follows.' },
    { type: 'text', text: '[Tool result image omitted: capture.jpg]' },
    { type: 'text', text: '[Tool result file omitted: capture.pdf]' },
  ])
  assert.equal(Object.prototype.hasOwnProperty.call(sanitizedValue, 'screenshotBase64'), false)
  assert.equal(sanitizedValue.screenshotOmitted, true)
  assert.equal(sanitizedValue.screenshotPlaceholder, '[Tool result image omitted: captures/page.jpg]')
})

test('provider model transform normalizes Mistral tool ids and repairs tool-to-user message sequencing', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'mistral',
    modelId: 'mistral-medium-2604',
  })
  const normalized = transform.normalizeMessages({
    messages: [
      {
        role: 'assistant',
        content: [
          { type: 'tool_call', call_id: 'call:1/with spaces', name: 'search_code', arguments: { query: 'provider transform' } },
        ],
      },
      {
        role: 'tool',
        content: [
          { type: 'tool_result', call_id: 'call:1/with spaces', name: 'search_code', result: { ok: true } },
        ],
      },
      { role: 'user', content: 'continue' },
    ],
  })

  assert.equal(normalized.length, 4)
  assert.equal(normalized[0].content[0].toolCallId.length, 9)
  assert.match(normalized[0].content[0].toolCallId, /^[a-z0-9]+$/i)
  assert.equal(normalized[1].content[0].toolCallId, normalized[0].content[0].toolCallId)
  assert.deepEqual(normalized[0].content[0].input, { query: 'provider transform' })
  assert.deepEqual(normalized[1].content[0].output, { type: 'json', value: { ok: true } })
  assert.deepEqual(normalized[2], {
    role: 'assistant',
    content: [{ type: 'text', text: 'Done.' }],
  })
  assert.equal(normalized[3].role, 'user')
})

test('provider model transform keeps Mistral tool ids deterministic and distinct across colliding prefixes', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'mistral',
    modelId: 'mistral-medium-2604',
  })
  const normalized = transform.normalizeMessages({
    messages: [
      {
        role: 'assistant',
        content: [
          { type: 'tool_call', call_id: 'call:abcdef-1', name: 'first_tool', arguments: {} },
          { type: 'tool_call', call_id: 'call:abcdef-2', name: 'second_tool', arguments: {} },
        ],
      },
      {
        role: 'tool',
        content: [
          { type: 'tool_result', call_id: 'call:abcdef-1', name: 'first_tool', result: { ok: 1 } },
          { type: 'tool_result', call_id: 'call:abcdef-2', name: 'second_tool', result: { ok: 2 } },
        ],
      },
    ],
  })

  const firstAssistantId = normalized[0].content[0].toolCallId
  const secondAssistantId = normalized[0].content[1].toolCallId
  const firstToolId = normalized[1].content[0].toolCallId
  const secondToolId = normalized[1].content[1].toolCallId

  assert.equal(firstAssistantId.length, 9)
  assert.equal(secondAssistantId.length, 9)
  assert.notEqual(firstAssistantId, secondAssistantId)
  assert.equal(firstAssistantId, firstToolId)
  assert.equal(secondAssistantId, secondToolId)
})

test('provider model transform keeps Mistral provider options generic and only inserts the sequence shim on direct tool-to-user adjacency', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'mistral',
    modelId: 'mistral-medium-2604',
  })
  const adjacent = transform.normalizeMessages({
    messages: [
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call1', toolName: 'search', output: { type: 'json', value: { ok: true } } }] },
      { role: 'user', content: 'continue' },
    ],
  })
  const separated = transform.normalizeMessages({
    messages: [
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call1', toolName: 'search', output: { type: 'json', value: { ok: true } } }] },
      { role: 'assistant', content: 'already resumed' },
      { role: 'user', content: 'continue' },
    ],
  })

  assert.equal(transform.buildProviderOptions(), undefined)
  assert.equal(transform.adapterProfile.optionFamily, 'none')
  assert.equal(adjacent.length, 3)
  assert.deepEqual(adjacent[1], {
    role: 'assistant',
    content: [{ type: 'text', text: 'Done.' }],
  })
  assert.equal(separated.length, 3)
  assert.equal(separated[1].role, 'assistant')
  assert.equal(separated[1].content, 'already resumed')
})

test('provider model transform resolves and applies the interleaved reasoning replay contract', () => {
  const replayTarget = resolveInterleavedReasoningReplayTarget({
    supported: true,
    providerControls: ['openaiCompatible:reasoning_content'],
  })
  const replayed = replayInterleavedReasoningMessage({
    role: 'assistant',
    content: [
      { type: 'reasoning', text: 'step one ' },
      { type: 'text', text: 'Done.' },
      { type: 'reasoning', text: 'step two' },
    ],
    providerOptions: {
      openaiCompatible: {
        existing: true,
      },
    },
  }, replayTarget)

  assert.deepEqual(replayTarget, {
    providerNamespace: 'openaiCompatible',
    field: 'reasoning_content',
  })
  assert.deepEqual(replayed.content, [
    { type: 'text', text: 'Done.' },
  ])
  assert.deepEqual(replayed.providerOptions, {
    openaiCompatible: {
      existing: true,
      reasoning_content: 'step one step two',
    },
  })
})

test('provider model transform exposes interleaved reasoning for OpenRouter Codex 5.3', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'openrouter',
    modelId: 'openai/gpt-5.3-codex',
  })

  assert.deepEqual(
    resolveInterleavedReasoningReplayTarget(
      transform.registryModel?.capabilities?.interleavedReasoning,
    ),
    {
      providerNamespace: 'openaiCompatible',
      field: 'reasoning_content',
    },
  )
})

test('provider model transform merges catalog defaults and variants into invocation config and clamps output limits', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    registryModelOverride: {
      id: 'gpt-5.4',
      maxOutputTokens: 2048,
      defaultProviderOptions: {
        openai: {
          serviceTier: 'default',
          metadata: {
            catalog: 'curated',
          },
        },
        customNamespace: {
          enabled: true,
        },
      },
      variants: [
        {
          id: 'balanced',
          label: 'Balanced',
          default: true,
          providerOptions: {
            openai: {
              reasoningEffort: 'medium',
            },
          },
        },
        {
          id: 'priority',
          label: 'Priority',
          providerOptions: {
            openai: {
              serviceTier: 'priority',
            },
          },
        },
      ],
    },
  })

  const defaultConfig = transform.resolveInvocationConfig({
    runtimeSettings: {
      reasoningSummary: 'auto',
      textVerbosity: 'high',
      promptCachingEnabled: false,
    },
    requestContext: {
      projectId: 'project-1',
      threadId: 'thread-1',
      messages: [{ role: 'user', content: 'Hello' }],
      toolNames: [],
    },
    requestedMaxOutputTokens: 999999,
  })
  const priorityConfig = transform.resolveInvocationConfig({
    runtimeSettings: {
      promptCachingEnabled: false,
    },
    requestContext: {
      variantId: 'priority',
      messages: [{ role: 'user', content: 'Hello' }],
      toolNames: [],
    },
    requestedMaxOutputTokens: 512,
  })

  assert.equal(defaultConfig.selectedVariantId, 'balanced')
  assert.equal(defaultConfig.maxOutputTokens, 2048)
  assert.deepEqual(defaultConfig.providerOptions, {
    openai: {
      store: false,
      serviceTier: 'default',
      reasoningEffort: 'medium',
      reasoningSummary: 'auto',
      textVerbosity: 'high',
      metadata: {
        catalog: 'curated',
      },
    },
    customNamespace: {
      enabled: true,
    },
  })

  assert.equal(priorityConfig.selectedVariantId, 'priority')
  assert.equal(priorityConfig.maxOutputTokens, 512)
  assert.equal(priorityConfig.providerOptions?.openai?.serviceTier, 'priority')
  assert.equal(priorityConfig.providerOptions?.customNamespace?.enabled, true)
})

test('provider model transform leaves max output tokens unset when no explicit cap is requested', () => {
  const openAITransform = resolveProviderModelTransform({
    providerId: 'openai',
    modelId: 'gpt-5.5',
  })
  const geminiTransform = resolveProviderModelTransform({
    providerId: 'gemini',
    modelId: 'gemini-3.5-flash',
  })

  const openAIConfig = openAITransform.resolveInvocationConfig({
    runtimeSettings: {
      reasoningSummary: 'auto',
    },
    requestContext: {
      messages: [{ role: 'user', content: 'Hello' }],
      toolNames: [],
    },
    requestedMaxOutputTokens: null,
  })
  const geminiConfig = geminiTransform.resolveInvocationConfig({
    requestContext: {
      messages: [{ role: 'user', content: 'Hello' }],
      toolNames: [],
    },
    requestedMaxOutputTokens: null,
  })

  assert.equal(openAIConfig.maxOutputTokens, null)
  assert.equal(geminiConfig.maxOutputTokens, null)
})
