import test from 'node:test'
import assert from 'node:assert/strict'

import { preparePreCallRoundContext } from '../../src/main/chat/chat-stream-precall-round.mjs'
import { createBaseArgs } from './chat-stream-precall-round-test-helpers.mjs'
import { recordToolStepOutcome } from '../../src/main/chat/chat-turn-events.mjs'
import { resolveProviderPromptBudgetProfile } from '../../src/main/chat/provider-prompt-budget-profile.mjs'

const RECENT_OBSERVED_AT = Date.UTC(2026, 3, 14, 18, 6, 40)
const RECENT_OBSERVED_NOW = Date.UTC(2026, 3, 16, 12, 0, 0)

async function withMockedNow(nowMs, callback) {
  const originalNow = Date.now
  Date.now = () => nowMs
  try {
    return await callback()
  } finally {
    Date.now = originalNow
  }
}

function buildAnthropicArgs(overrides = {}) {
  const { args, captured } = createBaseArgs({
    providerId: 'anthropic',
    model: 'claude-sonnet-4-6',
    providerRuntimeSettings: {
      anthropic: {
        useContextManagementCompaction: false,
      },
    },
    continuityPolicy: {
      providerChainCompactionEnabled: true,
      providerTruncationEnabled: true,
      providerCompactionAllowlist: ['anthropic'],
    },
    continuityRuntime: {
      async applyBeforeModelCall(payload = {}) {
        captured.providerNativeContext = payload.providerNativeContext || null
        return {
          history: payload.history,
          compaction: null,
        }
      },
    },
    modelContext: {
      limitTokens: 200_000,
      maxOutputTokens: 16_000,
    },
    ...overrides,
  })
  return { args, captured }
}

test('Anthropic strict profile blocks locally when safe prompt estimate exceeds 30k-tier ceiling', async () => {
  const hugeHistory = [
    { role: 'system', content: 'You are ADDOM.' },
    { role: 'user', content: `Summarize this context.\n${'alpha '.repeat(32_000)}` },
  ]
  const { args, captured } = buildAnthropicArgs({
    history: hugeHistory,
    activeToolDefinitions: {
      read_file: {
        description: 'Read a file from disk.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
          },
          required: ['path'],
        },
      },
    },
    estimateHistoryTokens: () => 12_000,
    compactHistoryForContextWindow: async () => ({
      compacted: false,
      history: hugeHistory,
    }),
  })

  await assert.rejects(
    () => preparePreCallRoundContext(args),
    (err) => {
      assert.equal(err?.code, 'prompt_budget_hard_limit_exceeded')
      assert.equal(err?.localPromptBudgetBlocked, true)
      assert.match(String(err?.message || ''), /Prompt preflight blocked anthropic\/claude-sonnet-4-6/i)
      assert.match(String(err?.message || ''), /hard ceiling 24000 tokens/i)
      assert.match(String(err?.message || ''), /Dominant contributors:/i)
      return true
    },
  )

  assert.equal(args.errorDiagnostics.promptBudgetHardLimitExceeded, true)
  assert.equal(args.errorDiagnostics.promptBudgetHardLimitTokens, 24_000)
  assert.equal(args.errorDiagnostics.preflightBudgetAction, 'blocked')
  assert.ok(args.errorDiagnostics.safePromptOccupancyEstimateTokens > 24_000)
  assert.ok(args.errorDiagnostics.promptBudgetCategoryEstimates.historyTokens > 24_000)
  assert.ok(args.errorDiagnostics.promptBudgetCategoryEstimates.activeToolSchemaTokens > 0)
  assert.equal(Array.isArray(args.errorDiagnostics.promptBudgetDominantContributors), true)
  assert.equal(
    captured.timelineEvents.some((event) => event.kind === 'prompt_budget_blocked'),
    true,
  )
  const adaptiveBudgetEvent = captured.sentEvents.find((event) => event.channel === 'chat:runtime-diagnostics')
  assert.deepEqual(adaptiveBudgetEvent?.payload, {
    threadId: 'thread-precall',
    turnId: 'turn-precall',
    type: 'info',
    label: 'Adaptive budget: strict for this turn',
    detail: [
      'source: default safe Anthropic budget',
      'reason: no recent provider budget signal is available yet.',
    ].join('\n'),
  })
  const persistedAdaptiveBudgetEvent = captured.timelineEvents.find((event) => event.kind === 'runtime_diagnostics')
  assert.equal(persistedAdaptiveBudgetEvent?.payload?.content, 'Adaptive budget: strict for this turn')
  assert.equal(persistedAdaptiveBudgetEvent?.payload?.meta?.detail.includes('sha256:'), false)
})

test('Anthropic learned low-capacity profile tightens the local hard ceiling below the fallback', async () => {
  await withMockedNow(RECENT_OBSERVED_NOW, async () => {
    const { args, captured } = buildAnthropicArgs({
      promptBudgetProfile: resolveProviderPromptBudgetProfile({
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-6',
        learnedBudgetProfile: {
          profileSource: 'observed_headers',
          confidence: 'observed_stable',
          organizationId: 'org_low',
          credentialFingerprint: 'sha256:low',
          inputTpmLimit: 30_000,
          lastObservedAt: RECENT_OBSERVED_AT,
        },
      }),
      buildPreCallContinuityInput: () => ({
        preCallOccupancyEstimateTokens: 18_000,
        continuityInput: {
          history: args?.history || [],
          round: 1,
          rollingTotalTokens: 0,
          contextOccupancyTokens: 18_000,
          userMessage: 'Continue.',
        },
      }),
      estimateHistoryTokens: () => 18_000,
    })

    await assert.rejects(
      () => preparePreCallRoundContext(args),
      (err) => {
        assert.equal(err?.code, 'prompt_budget_hard_limit_exceeded')
        assert.match(String(err?.message || ''), /hard ceiling 20000 tokens/i)
        return true
      },
    )

    assert.equal(args.errorDiagnostics.promptBudgetHardLimitExceeded, true)
    assert.equal(args.errorDiagnostics.promptBudgetHardLimitTokens, 20_000)
    assert.equal(args.errorDiagnostics.preflightBudgetAction, 'blocked')
    assert.equal(args.errorDiagnostics.adaptiveBudgetSource, 'observed_headers')
    assert.equal(args.errorDiagnostics.adaptiveBudgetConfidence, 'observed_stable')
    assert.equal(args.errorDiagnostics.adaptiveBudgetCapacityTier, 'low')
    assert.equal(args.errorDiagnostics.adaptiveBudgetResolutionSource, 'learned_profile')
    assert.equal(args.errorDiagnostics.adaptiveBudgetResolutionReason, 'observed_low_capacity')
    assert.equal(args.errorDiagnostics.adaptiveBudgetResolvedCeilingTokens, 20_000)
    assert.equal(args.errorDiagnostics.adaptiveBudgetResolvedExplorationMode, 'strict')
    assert.ok(args.errorDiagnostics.safePromptOccupancyEstimateTokens > 20_000)
    assert.equal(
      captured.timelineEvents.some((event) => event.kind === 'prompt_budget_blocked'),
      true,
    )
    const adaptiveBudgetEvent = captured.sentEvents.find((event) => event.channel === 'chat:runtime-diagnostics')
    assert.deepEqual(adaptiveBudgetEvent?.payload, {
      threadId: 'thread-precall',
      turnId: 'turn-precall',
      type: 'info',
      label: 'Adaptive budget: strict for this turn',
      detail: [
        'source: learned provider budget',
        'reason: recent provider feedback suggests a smaller prompt budget.',
      ].join('\n'),
    })
  })
})

test('Anthropic learned medium-capacity profile allows prompt preflight above the static fallback ceiling', async () => {
  await withMockedNow(RECENT_OBSERVED_NOW, async () => {
    const promptBudgetProfile = resolveProviderPromptBudgetProfile({
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-6',
      learnedBudgetProfile: {
        profileSource: 'observed_headers',
        confidence: 'observed_stable',
        organizationId: 'org_medium',
        credentialFingerprint: 'sha256:medium',
        inputTpmLimit: 80_000,
        lastObservedAt: RECENT_OBSERVED_AT,
      },
    })
    const { args, captured } = buildAnthropicArgs({
      promptBudgetProfile,
      buildPreCallContinuityInput: () => ({
        preCallOccupancyEstimateTokens: 30_000,
        continuityInput: {
          history: [],
          round: 1,
          rollingTotalTokens: 0,
          contextOccupancyTokens: 30_000,
          userMessage: 'Continue.',
        },
      }),
      estimateHistoryTokens: () => 30_000,
    })

    const result = await preparePreCallRoundContext(args)

    assert.equal(result.commandOnly, false)
    assert.equal(args.errorDiagnostics.promptBudgetHardLimitExceeded, false)
    assert.equal(args.errorDiagnostics.promptBudgetHardLimitTokens, 48_000)
    assert.equal(args.errorDiagnostics.preflightBudgetAction, 'none')
    assert.equal(args.errorDiagnostics.adaptiveBudgetSource, 'observed_headers')
    assert.equal(args.errorDiagnostics.adaptiveBudgetConfidence, 'observed_stable')
    assert.equal(args.errorDiagnostics.adaptiveBudgetCapacityTier, 'medium')
    assert.equal(args.errorDiagnostics.adaptiveBudgetResolutionSource, 'learned_profile')
    assert.equal(args.errorDiagnostics.adaptiveBudgetResolutionReason, 'observed_medium_capacity')
    assert.equal(args.errorDiagnostics.adaptiveBudgetResolvedCeilingTokens, 48_000)
    assert.equal(args.errorDiagnostics.adaptiveBudgetResolvedExplorationMode, 'moderate')
    assert.ok(args.errorDiagnostics.safePromptOccupancyEstimateTokens > 24_000)
    assert.ok(args.errorDiagnostics.safePromptOccupancyEstimateTokens < 48_000)
    assert.equal(
      captured.timelineEvents.some((event) => event.kind === 'prompt_budget_blocked'),
      false,
    )
    const adaptiveBudgetEvent = captured.sentEvents.find((event) => event.channel === 'chat:runtime-diagnostics')
    assert.deepEqual(adaptiveBudgetEvent?.payload, {
      threadId: 'thread-precall',
      turnId: 'turn-precall',
      type: 'info',
      label: 'Adaptive budget: moderate for this turn',
      detail: [
        'source: learned provider budget',
        'reason: recent provider feedback supports a balanced prompt budget.',
      ].join('\n'),
    })
  })
})

test('Anthropic stale learned profile emits a warning budget note while preserving the learned ceiling', async () => {
  const nowMs = Date.UTC(2026, 3, 16, 12, 0, 0)
  const originalNow = Date.now
  Date.now = () => nowMs
  try {
    const promptBudgetProfile = resolveProviderPromptBudgetProfile({
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-6',
      learnedBudgetProfile: {
        profileSource: 'observed_headers',
        confidence: 'observed_stable',
        organizationId: 'org_stale',
        credentialFingerprint: 'sha256:stale',
        inputTpmLimit: 80_000,
        outputTpmLimit: 8_000,
        requestsPerMinuteLimit: 50,
        lastObservedAt: nowMs - (8 * 24 * 60 * 60 * 1000),
      },
    })
    const { args, captured } = buildAnthropicArgs({
      promptBudgetProfile,
      buildPreCallContinuityInput: () => ({
        preCallOccupancyEstimateTokens: 30_000,
        continuityInput: {
          history: [],
          round: 1,
          rollingTotalTokens: 0,
          contextOccupancyTokens: 30_000,
          userMessage: 'Continue.',
        },
      }),
      estimateHistoryTokens: () => 30_000,
    })

    const result = await preparePreCallRoundContext(args)

    assert.equal(result.commandOnly, false)
    const adaptiveBudgetEvent = captured.sentEvents.find((event) => event.channel === 'chat:runtime-diagnostics')
    assert.deepEqual(adaptiveBudgetEvent?.payload, {
      threadId: 'thread-precall',
      turnId: 'turn-precall',
      type: 'warning',
      label: 'Adaptive budget: moderate for this turn',
      detail: [
        'source: learned provider budget',
        'reason: saved provider budget data is stale, so this turn kept the last safe learned budget.',
      ].join('\n'),
    })
  } finally {
    Date.now = originalNow
  }
})

test('Anthropic expired learned profile emits a warning fallback note instead of generic no-telemetry copy', async () => {
  const nowMs = Date.UTC(2026, 3, 16, 12, 0, 0)
  const originalNow = Date.now
  Date.now = () => nowMs
  try {
    const promptBudgetProfile = resolveProviderPromptBudgetProfile({
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-6',
      learnedBudgetProfile: {
        profileSource: 'observed_headers',
        confidence: 'observed_stable',
        organizationId: 'org_expired',
        credentialFingerprint: 'sha256:expired',
        inputTpmLimit: 80_000,
        outputTpmLimit: 8_000,
        requestsPerMinuteLimit: 50,
        lastObservedAt: nowMs - (31 * 24 * 60 * 60 * 1000),
      },
    })
    const { args, captured } = buildAnthropicArgs({
      promptBudgetProfile,
      estimateHistoryTokens: () => 20,
    })

    const result = await preparePreCallRoundContext(args)

    assert.equal(result.commandOnly, false)
    const adaptiveBudgetEvent = captured.sentEvents.find((event) => event.channel === 'chat:runtime-diagnostics')
    assert.deepEqual(adaptiveBudgetEvent?.payload, {
      threadId: 'thread-precall',
      turnId: 'turn-precall',
      type: 'warning',
      label: 'Adaptive budget: strict for this turn',
      detail: [
        'source: default safe Anthropic budget',
        'reason: saved provider budget data expired, so this turn fell back to the default safe Anthropic budget.',
      ].join('\n'),
    })
  } finally {
    Date.now = originalNow
  }
})

test('Anthropic invalid learned profile emits a warning fallback note instead of generic no-telemetry copy', async () => {
  const promptBudgetProfile = resolveProviderPromptBudgetProfile({
    providerId: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    learnedBudgetProfile: {
      profileSource: 'observed_headers',
      confidence: 'observed_once',
      organizationId: 'org_invalid',
      credentialFingerprint: 'sha256:invalid',
      lastObservedAt: Date.now() - (60 * 60 * 1000),
    },
  })
  const { args, captured } = buildAnthropicArgs({
    promptBudgetProfile,
    estimateHistoryTokens: () => 20,
  })

  const result = await preparePreCallRoundContext(args)

  assert.equal(result.commandOnly, false)
  const adaptiveBudgetEvent = captured.sentEvents.find((event) => event.channel === 'chat:runtime-diagnostics')
  assert.deepEqual(adaptiveBudgetEvent?.payload, {
    threadId: 'thread-precall',
    turnId: 'turn-precall',
    type: 'warning',
    label: 'Adaptive budget: strict for this turn',
    detail: [
      'source: default safe Anthropic budget',
      'reason: saved provider budget data was incomplete, so this turn fell back to the default safe Anthropic budget.',
    ].join('\n'),
  })
})

test('Anthropic strict profile lets normal small prompts proceed without noisy budget events', async () => {
  const { args, captured } = buildAnthropicArgs({
    history: [
      { role: 'system', content: 'You are ADDOM.' },
      { role: 'user', content: 'List the next step.' },
    ],
    activeToolDefinitions: {},
    estimateHistoryTokens: () => 20,
  })

  const result = await preparePreCallRoundContext(args)

  assert.equal(result.commandOnly, false)
  assert.equal(args.errorDiagnostics.promptBudgetHardLimitExceeded, false)
  assert.equal(args.errorDiagnostics.preflightBudgetAction, 'none')
  assert.ok(args.errorDiagnostics.safePromptOccupancyEstimateTokens < 24_000)
  assert.equal(
    captured.timelineEvents.some((event) => event.kind === 'prompt_budget_blocked'),
    false,
  )
  assert.equal(
    captured.sentEvents.some((event) => String(event.channel || '').includes('budget')),
    false,
  )
})

test('Anthropic strict profile keeps current-turn read exploration bounded enough to continue', async () => {
  const { args } = buildAnthropicArgs({
    history: [
      { role: 'system', content: 'You are ADDOM.' },
      { role: 'user', content: 'Check the UI of the changes panel.' },
    ],
    activeToolDefinitions: {
      read_file: {
        description: 'Read a file from disk.',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
      },
      list_directory: {
        description: 'List a directory.',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
      },
    },
  })

  const buildToolResultMessage = (_id, toolName, toolResult, isError, metadata) => ({
    role: 'tool',
    content: [{
      type: 'tool-result',
      toolName,
      output: { type: isError ? 'error-text' : 'text', value: toolResult },
      ...metadata,
    }],
  })

  const addToolResult = ({ toolName, result, sequence }) => {
    recordToolStepOutcome({
      turnToolResults: [],
      history: args.history,
      send: () => {},
      persistTimelineEvent: () => {},
      buildToolResultMessage,
      trimText: (value) => String(value || ''),
      extractRunCommandMeta: () => ({}),
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
      promptBudgetProfile: args.promptBudgetProfile,
      approvalId: '',
      tc: { id: `call_${sequence}`, name: toolName },
      toolInput: { path: `src/file-${sequence}.js` },
      toolEventInput: { path: `src/file-${sequence}.js` },
      result,
      isError: false,
      decision: 'approved',
      denyReason: '',
      missingDependencySuspected: false,
      stepId: `turn_1:step:${sequence}`,
      sequence,
      startedAt: sequence * 10,
      finishedAt: (sequence * 10) + 5,
      durationMs: 5,
      threadId: 'thread_1',
      turnId: 'turn_1',
    })
  }

  addToolResult({ toolName: 'list_directory', result: `Showing 200 entries\n${'[dir] child\n'.repeat(4_000)}`, sequence: 1 })
  addToolResult({ toolName: 'read_file', result: `import React from 'react'\n${'const x = 1;\n'.repeat(4_000)}`, sequence: 2 })
  addToolResult({ toolName: 'read_file', result: `import { create } from 'zustand'\n${'export const y = 2;\n'.repeat(4_000)}`, sequence: 3 })
  addToolResult({ toolName: 'read_file', result: `@import "tailwindcss";\n${'.foo { color: red; }\n'.repeat(4_000)}`, sequence: 4 })

  const result = await preparePreCallRoundContext(args)

  assert.equal(result.commandOnly, false)
  assert.equal(args.errorDiagnostics.promptBudgetHardLimitExceeded, false)
  assert.equal(args.errorDiagnostics.preflightBudgetAction, 'none')
  assert.ok(args.errorDiagnostics.safePromptOccupancyEstimateTokens < 24_000)
  assert.ok((args.errorDiagnostics.promptBudgetCategoryEstimates?.recentToolResultTokens || 0) < 12_000)
})
