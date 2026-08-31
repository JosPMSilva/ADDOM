import test from 'node:test'
import assert from 'node:assert/strict'

import { buildToolResultMessage } from '../../src/main/api-clients/ai-provider.mjs'
import { estimateDispatchedPromptOccupancy } from '../../src/main/chat/context-occupancy-estimator.mjs'
import { preparePreCallRoundContext } from '../../src/main/chat/chat-stream-precall-round.mjs'
import { pruneOldToolResultHistory } from '../../src/main/chat/tool-result-history-pruning.mjs'
import { getProviderUsageFixture } from '../fixtures/provider-usage-fixtures.mjs'
import { createBaseArgs } from './chat-stream-precall-round-test-helpers.mjs'

test('estimateDispatchedPromptOccupancy stays within bounded error against provider-backed prompt usage fixtures', () => {
  const cases = [
    {
      providerId: 'openai',
      expectedInputTokens: getProviderUsageFixture('openai')?.expected?.inputTokens,
      history: [
        { role: 'system', content: 'You are ADDOM. Keep edits small and production safe.' },
        { role: 'user', content: 'Open src/app.js, src/auth.js, and src/session.js. Explain the refresh path.' },
        { role: 'assistant', content: 'Inspecting the auth flow and session pipeline now.' },
      ],
      activeToolDefinitions: {
        read_file: {
          description: 'Read a file.',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string' },
            },
            required: ['path'],
          },
        },
      },
      maxAbsoluteError: 4,
    },
    {
      providerId: 'openaiCompatible',
      expectedInputTokens: getProviderUsageFixture('openaiCompatible')?.expected?.inputTokens,
      history: [
        { role: 'system', content: 'You are ADDOM.' },
        { role: 'user', content: 'Open src/app.js.' },
        { role: 'assistant', content: 'Inspecting the file now.' },
      ],
      activeToolDefinitions: {
        read_file: {
          description: 'Read a file.',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string' },
            },
            required: ['path'],
          },
        },
      },
      maxAbsoluteError: 4,
    },
  ]

  for (const testCase of cases) {
    const estimated = estimateDispatchedPromptOccupancy({
      history: testCase.history,
      activeToolDefinitions: testCase.activeToolDefinitions,
      providerId: testCase.providerId,
      model: 'fixture-model',
    })

    assert.ok(
      Math.abs(estimated.tokenEstimate - testCase.expectedInputTokens) <= testCase.maxAbsoluteError,
      `${testCase.providerId} expected ${testCase.expectedInputTokens}, got ${estimated.tokenEstimate}`,
    )
    assert.equal(estimated.occupancyConfidence, 'calibrated_estimate')
  }
})

test('preparePreCallRoundContext upgrades the final fallback estimate after transformed history and tool schema inspection', async () => {
  const { args } = createBaseArgs({
    providerId: 'gemini',
    model: 'gemini-2.5-flash',
    history: [
      { role: 'system', content: 'You are ADDOM.' },
      { role: 'user', content: 'Open src/auth.js and summarize the refresh flow.' },
    ],
    activeToolDefinitions: {
      read_file: {
        description: 'Read a file from disk.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Absolute path.' },
          },
          required: ['path'],
        },
      },
    },
    buildPreCallContinuityInput: ({ history = [] } = {}) => ({
      preCallOccupancyEstimateTokens: 30,
      continuityInput: {
        history,
        round: 1,
        rollingTotalTokens: 0,
        contextOccupancyTokens: 30,
        userMessage: 'Open src/auth.js and summarize the refresh flow.',
      },
    }),
    estimateHistoryTokens: () => 30,
    continuityRuntime: {
      async applyBeforeModelCall(payload = {}) {
        return {
          history: Array.isArray(payload.history) ? payload.history : [],
          compaction: null,
        }
      },
    },
    providerRuntimeSettings: null,
    continuityPolicy: null,
  })

  const result = await preparePreCallRoundContext(args)

  assert.equal(result.preCallOccupancyEstimateTokens, 30)
  assert.ok(result.promptOccupancyEstimateTokens > 30)
  assert.equal(result.promptOccupancyEstimateConfidence, 'calibrated_estimate')
  assert.equal(result.promptOccupancyEstimateMethod, 'transformed_history_plus_tool_schema')
  assert.equal(args.errorDiagnostics.promptOccupancyEstimateConfidence, 'calibrated_estimate')
  assert.equal(args.errorDiagnostics.promptOccupancyEstimateMethod, 'transformed_history_plus_tool_schema')
})

test('estimateDispatchedPromptOccupancy separates old-result placeholders from intact tool output diagnostics', () => {
  const oldHistory = [
    { role: 'system', content: 'You are ADDOM.' },
    { role: 'user', content: 'turn one' },
    buildToolResultMessage('call_old', 'search_code', `old search\n${'match line\n'.repeat(300)}`, false),
    { role: 'user', content: 'turn two' },
    { role: 'assistant', content: 'ack' },
    buildToolResultMessage('call_recent', 'run_command', `stdout\n${'recent line\n'.repeat(80)}`, false),
    { role: 'user', content: 'turn three' },
  ]
  const pruned = pruneOldToolResultHistory({
    history: oldHistory,
    promptBudgetProfile: {
      id: 'test_prune_profile',
      oldToolResultPrune: 'aggressive',
      perTurnToolResultBudgetChars: 500,
      oldToolResultMinPruneChars: 200,
    },
  })

  const estimated = estimateDispatchedPromptOccupancy({
    history: pruned.history,
    activeToolDefinitions: {},
    providerId: 'openai',
    model: 'fixture-model',
  })

  assert.ok((estimated.diagnostics.categoryEstimates.oldToolResultPlaceholderTokens || 0) > 0)
  assert.ok((estimated.diagnostics.categoryEstimates.recentToolResultTokens || 0) > 0)
})
