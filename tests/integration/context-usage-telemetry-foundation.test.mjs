import test from 'node:test'
import assert from 'node:assert/strict'

import { __testAiProviderInternals } from '../../src/main/api-clients/ai-provider.mjs'
import { extractAnthropicResponseMeta } from '../../src/main/api-clients/ai-provider-anthropic-runtime.mjs'
import { buildOpenAIBackgroundResponsePayload } from '../../src/main/api-clients/openai-background-runtime.mjs'
import { createOpenAIResponsesWebSocketResponseState } from '../../src/main/api-clients/experimental/openai-websocket/openai-websocket-response-state.mjs'
import {
  buildOpenAIUsageResponseFixture,
  PROVIDER_USAGE_FIXTURES,
  getProviderUsageFixture,
} from '../fixtures/provider-usage-fixtures.mjs'

function assertUsageContains(actual, expected) {
  assert.ok(actual)
  assert.equal(actual.inputTokens, expected.inputTokens)
  assert.equal(actual.outputTokens, expected.outputTokens)
  assert.equal(actual.reasoningTokens, expected.reasoningTokens)
  assert.equal(actual.totalTokens, expected.totalTokens)

  if (Object.prototype.hasOwnProperty.call(expected, 'cachedInputTokens')) {
    assert.equal(actual.cachedInputTokens, expected.cachedInputTokens)
  }
  if (expected.inputTokenDetails) {
    assert.deepEqual(actual.inputTokenDetails, expected.inputTokenDetails)
  }
  if (expected.outputTokenDetails) {
    assert.deepEqual(actual.outputTokenDetails, expected.outputTokenDetails)
  }
  if (expected.raw) {
    assert.deepEqual(actual.raw, expected.raw)
  }
}

test('provider usage fixtures preserve rich telemetry across normalized provider shapes', () => {
  for (const [providerId, fixture] of Object.entries(PROVIDER_USAGE_FIXTURES)) {
    const normalized = __testAiProviderInternals.normalizeUsage(fixture.usage)
    assertUsageContains(normalized, fixture.expected)
    assert.equal(
      normalized.inputTokenDetails?.cacheReadTokens ?? normalized.cachedInputTokens ?? 0,
      fixture.expected.inputTokenDetails?.cacheReadTokens ?? fixture.expected.cachedInputTokens ?? 0,
      providerId,
    )
  }
})

test('openai runtime metadata preserves usage telemetry consistently across stream, background, and websocket paths', () => {
  const response = buildOpenAIUsageResponseFixture()
  const expectedUsage = getProviderUsageFixture('openai').expected

  const streamMeta = __testAiProviderInternals.extractOpenAIResponseMeta(null, response, 'gpt-5.2')
  const backgroundPayload = buildOpenAIBackgroundResponsePayload(response)

  const websocketState = createOpenAIResponsesWebSocketResponseState({
    modelId: 'gpt-5.2',
  })
  websocketState.handleEvent({
    type: 'response.completed',
    response,
  })
  const websocketPayload = websocketState.buildResult()

  assertUsageContains(streamMeta.usageTelemetry, expectedUsage)
  assertUsageContains(backgroundPayload.providerResponseMeta.usageTelemetry, expectedUsage)
  assertUsageContains(websocketPayload.providerResponseMeta.usageTelemetry, expectedUsage)

  assert.deepEqual(
    backgroundPayload.providerResponseMeta.usageTelemetry,
    streamMeta.usageTelemetry,
  )
  assert.deepEqual(
    websocketPayload.providerResponseMeta.usageTelemetry,
    streamMeta.usageTelemetry,
  )
})

test('anthropic response metadata preserves compaction semantics needed for later occupancy mapping', () => {
  const anthropic = getProviderUsageFixture('anthropic')
  const meta = extractAnthropicResponseMeta({
    anthropic: {
      contextManagement: {
        appliedEdits: [
          { type: 'compact_20260112' },
        ],
      },
      iterations: anthropic.expected.raw.iterations.map((iteration) => ({
        type: iteration.type,
        inputTokens: iteration.input_tokens,
        outputTokens: iteration.output_tokens,
      })),
      usage: anthropic.usage,
    },
  }, null, 'claude-sonnet-4-6')

  assert.equal(meta.contextManagementApplied, true)
  assert.equal(meta.compactionApplied, true)
  assert.deepEqual(meta.contextManagementAppliedEdits, ['compact_20260112'])
  assert.deepEqual(meta.usageSemantics, {
    currentTurnInputMayExcludeCompaction: true,
    billedTotalsDerivedFromIterations: true,
  })
  assertUsageContains(meta.usageTelemetry, anthropic.expected)
  assert.deepEqual(meta.usageIterations, [
    { type: 'compaction', inputTokens: 1200, outputTokens: 30 },
    { type: 'message', inputTokens: 700, outputTokens: 110 },
  ])
})
