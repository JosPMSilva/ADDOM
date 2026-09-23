import test from 'node:test'
import assert from 'node:assert/strict'
import { createAnthropic } from '@ai-sdk/anthropic'

import {
  ANTHROPIC_FAST_MODE_BETA,
  buildAnthropicClientOptions,
  extractAnthropicReasoningHistoryParts,
  extractAnthropicResponseMeta,
} from '../../src/main/api-clients/ai-provider-anthropic-runtime.mjs'

test('Anthropic SDK serializes xhigh effort and Fast mode for supported models', async () => {
  let request = null
  const model = createAnthropic({
    ...buildAnthropicClientOptions({
      apiKey: 'test-key',
      modelId: 'claude-opus-5',
      requestContext: { processingMode: 'fast' },
    }),
    fetch: async (_url, init) => {
      request = {
        body: JSON.parse(init.body),
        headers: Object.fromEntries(new Headers(init.headers).entries()),
      }
      return new Response(JSON.stringify({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5',
        content: [{ type: 'text', text: 'ok' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
  })('claude-opus-5')

  await model.doGenerate({
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    providerOptions: { anthropic: { effort: 'xhigh', speed: 'fast' } },
    maxOutputTokens: 16,
  })

  assert.equal(request.body.output_config.effort, 'xhigh')
  assert.equal(request.body.speed, 'fast')
  assert.match(request.headers['anthropic-beta'], /fast-mode-2026-02-01/)
})

test('Anthropic SDK serializes Opus 5.5 adaptive thinking updates without forced tool choice', async () => {
  let request = null
  const model = createAnthropic({
    apiKey: 'test-key',
    fetch: async (_url, init) => {
      request = {
        body: JSON.parse(init.body),
        headers: Object.fromEntries(new Headers(init.headers).entries()),
      }
      return new Response(JSON.stringify({
        id: 'msg_opus_55',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        content: [{ type: 'text', text: 'ok' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
  })('claude-opus-5-5')

  await model.doGenerate({
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    providerOptions: {
      anthropic: {
        thinking: { type: 'adaptive', display: 'updates' },
        effort: 'medium',
      },
    },
    maxOutputTokens: 16,
  })

  assert.deepEqual(request.body.thinking, { type: 'adaptive', display: 'updates' })
  assert.equal(request.body.output_config.effort, 'medium')
  assert.equal(request.body.tool_choice, undefined)
  assert.match(request.headers['anthropic-beta'], /thinking-display-updates-2026-08-18/)
})

test('Anthropic Fast client config adds the isolated beta header and Standard omits it', () => {
  assert.equal(ANTHROPIC_FAST_MODE_BETA, 'fast-mode-2026-02-01')
  assert.deepEqual(buildAnthropicClientOptions({
    apiKey: 'test-key',
    modelId: 'claude-opus-5',
    requestContext: { processingMode: 'fast' },
  }), {
    apiKey: 'test-key',
    headers: { 'anthropic-beta': 'fast-mode-2026-02-01' },
  })
  assert.deepEqual(buildAnthropicClientOptions({
    apiKey: 'test-key',
    modelId: 'claude-opus-5',
    requestContext: { processingMode: 'standard' },
  }), { apiKey: 'test-key' })
  assert.deepEqual(buildAnthropicClientOptions({
    apiKey: 'test-key',
    modelId: 'claude-fable-5-1',
    requestContext: { processingMode: 'fast' },
  }), { apiKey: 'test-key' })
  assert.deepEqual(buildAnthropicClientOptions({
    apiKey: 'test-key',
    modelId: 'claude-opus-5-5',
    requestContext: { processingMode: 'fast' },
  }), {
    apiKey: 'test-key',
    headers: { 'anthropic-beta': 'fast-mode-2026-02-01' },
  })
})

test('extractAnthropicResponseMeta normalizes Anthropic context-management compaction metadata', () => {
  const meta = extractAnthropicResponseMeta({
    anthropic: {
      contextManagement: {
        appliedEdits: [
          { type: 'compact_20260112' },
          { type: 'clear_thinking_20251015', clearedThinkingTurns: 2, clearedInputTokens: 400 },
        ],
      },
      iterations: [
        { type: 'compaction', inputTokens: 1200, outputTokens: 140 },
        { type: 'message', inputTokens: 700, outputTokens: 110 },
      ],
      usage: {
        inputTokens: 2050,
        outputTokens: 140,
        totalTokens: 2190,
        cachedInputTokens: 250,
        inputTokenDetails: {
          noCacheTokens: 1700,
          cacheReadTokens: 250,
          cacheWriteTokens: 100,
        },
        outputTokenDetails: {
          textTokens: 140,
        },
        raw: {
          input_tokens: 700,
          output_tokens: 110,
          cache_creation_input_tokens: 100,
          cache_read_input_tokens: 250,
          iterations: [
            { type: 'compaction', input_tokens: 1200, output_tokens: 140 },
            { type: 'message', input_tokens: 700, output_tokens: 110 },
          ],
        },
      },
    },
  }, null, 'claude-sonnet-4-6')

  assert.deepEqual(meta, {
    providerId: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    contextManagementApplied: true,
    contextManagementAppliedEdits: ['compact_20260112', 'clear_thinking_20251015'],
    compactionApplied: true,
    compactionSummaryDetected: false,
    usageSemantics: {
      currentTurnInputMayExcludeCompaction: true,
      billedTotalsDerivedFromIterations: true,
    },
    usageTelemetry: {
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
      raw: {
        input_tokens: 700,
        output_tokens: 110,
        cache_creation_input_tokens: 100,
        cache_read_input_tokens: 250,
        iterations: [
          { type: 'compaction', input_tokens: 1200, output_tokens: 140 },
          { type: 'message', input_tokens: 700, output_tokens: 110 },
        ],
      },
    },
    usageIterations: [
      { type: 'compaction', inputTokens: 1200, outputTokens: 140 },
      { type: 'message', inputTokens: 700, outputTokens: 110 },
    ],
  })
})

test('extractAnthropicResponseMeta returns null when Anthropic response metadata contains no usable context-management signal', () => {
  const meta = extractAnthropicResponseMeta({
    anthropic: {},
  }, null, 'claude-sonnet-4-6')

  assert.equal(meta, null)
})

test('extractAnthropicResponseMeta preserves returned Fast mode without requiring compaction metadata', () => {
  const meta = extractAnthropicResponseMeta({
    anthropic: {
      usage: { speed: 'fast' },
    },
  }, null, 'claude-opus-5')

  assert.equal(meta.providerId, 'anthropic')
  assert.equal(meta.modelId, 'claude-opus-5')
  assert.equal(meta.processingMode, 'fast')
})

test('extractAnthropicReasoningHistoryParts keeps Anthropic thinking signatures and redacted data for replay', () => {
  const parts = extractAnthropicReasoningHistoryParts([
    {
      type: 'reasoning',
      text: 'First thinking block.',
      providerMetadata: {
        anthropic: {
          signature: 'sig_123',
        },
      },
    },
    {
      type: 'reasoning',
      text: '',
      providerMetadata: {
        anthropic: {
          redactedData: 'redacted_blob',
        },
      },
    },
    {
      type: 'reasoning',
      text: 'Plain text only should not be replayed.',
    },
  ])

  assert.deepEqual(parts, [
    {
      type: 'reasoning',
      text: 'First thinking block.',
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
  ])
})
