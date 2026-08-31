import test from 'node:test'
import assert from 'node:assert/strict'

import {
  extractAnthropicReasoningHistoryParts,
  extractAnthropicResponseMeta,
} from '../../src/main/api-clients/ai-provider-anthropic-runtime.mjs'

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
