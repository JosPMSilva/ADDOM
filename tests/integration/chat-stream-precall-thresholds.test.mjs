import test from 'node:test'
import assert from 'node:assert/strict'

import { preparePreCallRoundContext } from '../../src/main/chat/chat-stream-precall-round.mjs'
import { COMPACTION_MODES } from '../../src/main/chat/continuity/compaction-mode-contract.mjs'
import {
  __resetOpenAICompactionClientFactoryForTests,
} from '../../src/main/chat/continuity/provider-native/openai-compaction-adapter.mjs'
import { createBaseArgs } from './chat-stream-precall-round-test-helpers.mjs'

test.afterEach(() => {
  __resetOpenAICompactionClientFactoryForTests()
})

test('preparePreCallRoundContext forwards Anthropic threshold overrides through provider request context', async () => {
  const { args } = createBaseArgs({
    providerId: 'anthropic',
    model: 'claude-sonnet-5',
    providerRuntimeSettings: {
      anthropic: {
        useContextManagementCompaction: false,
        contextManagementCompactionThresholdTokens: 0,
        contextManagementCompactionInstructions: '',
      },
    },
    continuityPolicy: {
      providerChainCompactionEnabled: true,
      providerTruncationEnabled: false,
      providerCompactionAllowlist: ['openai', 'anthropic'],
    },
    turnOptions: {
      anthropic: {
        forceContextManagementCompaction: true,
        contextManagementCompactionThresholdTokens: 80_000,
        contextManagementCompactionInstructions: 'Preserve decisions and unresolved work.',
      },
    },
  })

  const result = await preparePreCallRoundContext(args)

  assert.deepEqual(result.currentProviderRequestContext, {
    anthropic: {
      useContextManagementCompaction: true,
      contextManagementCompactionThresholdTokens: 80_000,
      contextManagementCompactionInstructions: 'Preserve decisions and unresolved work.',
    },
  })
  assert.equal(result.currentOpenAIRequestContext, undefined)
})

test('preparePreCallRoundContext derives the Anthropic compaction trigger from 85 percent of the model context window by default', async () => {
  const { args } = createBaseArgs({
    providerId: 'anthropic',
    model: 'claude-sonnet-5',
    providerRuntimeSettings: {
      anthropic: {
        useContextManagementCompaction: true,
        contextManagementCompactionThresholdTokens: 0,
        contextManagementCompactionInstructions: '',
      },
    },
    continuityPolicy: {
      providerChainCompactionEnabled: true,
      providerTruncationEnabled: false,
      providerCompactionAllowlist: ['openai', 'anthropic'],
    },
    modelContext: { limitTokens: 200_000 },
  })

  const result = await preparePreCallRoundContext(args)

  assert.deepEqual(result.currentProviderRequestContext, {
    anthropic: {
      useContextManagementCompaction: true,
      contextManagementCompactionThresholdTokens: 170_000,
      contextManagementCompactionInstructions: '',
    },
  })
})

test('preparePreCallRoundContext derives the Anthropic compaction trigger from the saved soft trigger percentage', async () => {
  const { args } = createBaseArgs({
    providerId: 'anthropic',
    model: 'claude-sonnet-5',
    providerRuntimeSettings: {
      anthropic: {
        useContextManagementCompaction: true,
        contextManagementCompactionThresholdTokens: 0,
        providerTruncationSoftTriggerPercent: 50,
        contextManagementCompactionInstructions: '',
      },
    },
    continuityPolicy: {
      providerChainCompactionEnabled: true,
      providerTruncationEnabled: false,
      providerCompactionAllowlist: ['openai', 'anthropic'],
    },
    modelContext: { limitTokens: 200_000 },
  })

  const result = await preparePreCallRoundContext(args)

  assert.deepEqual(result.currentProviderRequestContext, {
    anthropic: {
      useContextManagementCompaction: true,
      contextManagementCompactionThresholdTokens: 100_000,
      contextManagementCompactionInstructions: '',
    },
  })
})

test('preparePreCallRoundContext lifts the Anthropic trigger into the safe allowance floor while reasoning remains active', async () => {
  const { args } = createBaseArgs({
    providerId: 'anthropic',
    model: 'claude-sonnet-5',
    providerRuntimeSettings: {
      anthropic: {
        useContextManagementCompaction: true,
        contextManagementCompactionThresholdTokens: 0,
        providerTruncationSoftTriggerPercent: 50,
        contextManagementCompactionInstructions: '',
      },
    },
    continuityPolicy: {
      providerChainCompactionEnabled: true,
      providerTruncationEnabled: false,
      providerCompactionAllowlist: ['openai', 'anthropic'],
    },
    turnToolResults: [{
      toolName: 'read_file',
      decision: 'approved',
      isError: false,
      fileChanges: [],
    }],
    turnReasoningSegments: ['Inspecting the code path before changing it.'],
    modelContext: { limitTokens: 200_000 },
  })

  const result = await preparePreCallRoundContext(args)

  assert.deepEqual(result.currentProviderRequestContext, {
    anthropic: {
      useContextManagementCompaction: true,
      contextManagementCompactionThresholdTokens: 130_000,
      contextManagementCompactionInstructions: '',
    },
  })
})

test('preparePreCallRoundContext ignores obsolete OpenAI transport truncation settings for retained models', async () => {
  const { args, captured } = createBaseArgs({
    providerRuntimeSettings: {
      openai: {
        usePreviousResponseId: false,
        useConversationState: false,
        useResponseCompaction: false,
        useServerSideCompaction: true,
        serverSideCompactionThresholdTokens: 0,
        providerTruncationSoftTriggerPercent: 50,
        enableBackgroundMode: false,
      },
    },
    modelContext: { limitTokens: 200_000 },
  })

  const result = await preparePreCallRoundContext(args)

  assert.equal(result.currentOpenAIRequestContext?.compactionStrategy, COMPACTION_MODES.NONE)
  assert.equal(result.currentOpenAIRequestContext?.serverSideCompactionThresholdTokens, 0)
  assert.equal(captured.providerNativeContext?.serverSideCompactionThresholdTokens, 0)
  assert.deepEqual(args.errorDiagnostics.contextManagementSkippedReasons, ['unsupported_model'])
})

test('preparePreCallRoundContext keeps obsolete OpenAI transport truncation disabled during file edits', async () => {
  const { args, captured } = createBaseArgs({
    providerRuntimeSettings: {
      openai: {
        usePreviousResponseId: false,
        useConversationState: false,
        useResponseCompaction: false,
        useServerSideCompaction: true,
        serverSideCompactionThresholdTokens: 0,
        providerTruncationSoftTriggerPercent: 50,
        enableBackgroundMode: false,
      },
    },
    turnToolResults: [{
      toolName: 'edit_file',
      decision: 'approved',
      isError: false,
      fileChanges: [{ filePath: 'src/main/chat/example.mjs' }],
    }],
    modelContext: { limitTokens: 200_000 },
  })

  const result = await preparePreCallRoundContext(args)

  assert.equal(result.currentOpenAIRequestContext?.compactionStrategy, COMPACTION_MODES.NONE)
  assert.equal(result.currentOpenAIRequestContext?.serverSideCompactionThresholdTokens, 0)
  assert.equal(captured.providerNativeContext?.serverSideCompactionThresholdTokens, 0)
  assert.equal(args.errorDiagnostics.providerTruncationCriticalTaskActive, true)
  assert.deepEqual(args.errorDiagnostics.contextManagementSkippedReasons, ['unsupported_model'])
})

test('preparePreCallRoundContext enforces the effective prompt budget before provider dispatch', async () => {
  const history = [
    { role: 'system', content: 'You are ADDOM.' },
    { role: 'user', content: 'Large prompt body.' },
    { role: 'assistant', content: 'Large assistant reply.' },
  ]
  let compactCallCount = 0
  const { args } = createBaseArgs({
    history,
    modelContext: {
      limitTokens: 200_000,
      maxOutputTokens: 32_000,
    },
    buildPreCallContinuityInput: () => ({
      preCallOccupancyEstimateTokens: 150_000,
      continuityInput: {
        history,
        round: 1,
        rollingTotalTokens: 0,
        contextOccupancyTokens: 150_000,
        userMessage: 'Continue.',
      },
    }),
    continuityRuntime: {
      async applyBeforeModelCall(payload = {}) {
        return {
          history: payload.history,
          compaction: null,
        }
      },
    },
    compactHistoryForContextWindow: async (_history, options = {}) => {
      compactCallCount += 1
      assert.equal(options.modelLimit, 162_000)
      return {
        compacted: true,
        history: history.slice(0, 2),
      }
    },
    estimateHistoryTokens: (rows = []) => (Array.isArray(rows) && rows.length <= 2 ? 100_000 : 150_000),
  })

  const result = await preparePreCallRoundContext(args)

  assert.equal(compactCallCount, 1)
  assert.ok(result.promptOccupancyEstimateTokens > 0)
  assert.equal(result.promptOccupancyEstimateMethod, 'transformed_history_estimate')
  assert.equal(result.promptOccupancyEstimateConfidence, 'calibrated_estimate')
  assert.equal(args.errorDiagnostics.safePromptOccupancyEstimateTokens, 115_512)
  assert.equal(args.errorDiagnostics.promptBudgetGuardApplied, true)
  assert.equal(args.errorDiagnostics.promptBudgetAggressiveCompactionApplied, true)
  assert.equal(args.errorDiagnostics.promptBudgetTrimmedMessages, 1)
})

test('preparePreCallRoundContext blocks Anthropic threshold overrides when continuity policy disallows provider compaction', async () => {
  const { args, captured } = createBaseArgs({
    providerId: 'anthropic',
    model: 'claude-sonnet-5',
    providerRuntimeSettings: {
      anthropic: {
        useContextManagementCompaction: true,
        contextManagementCompactionThresholdTokens: 50_000,
        contextManagementCompactionInstructions: 'Keep defaults.',
      },
    },
    continuityPolicy: {
      providerChainCompactionEnabled: false,
      providerTruncationEnabled: false,
      providerCompactionAllowlist: ['openai'],
    },
    turnOptions: {
      anthropic: {
        forceContextManagementCompaction: true,
        contextManagementCompactionThresholdTokens: 80_000,
      },
    },
  })

  const result = await preparePreCallRoundContext(args)

  assert.deepEqual(result.currentProviderRequestContext, {
    anthropic: {
      useContextManagementCompaction: false,
      contextManagementCompactionThresholdTokens: 0,
      contextManagementCompactionInstructions: '',
    },
  })
  const notice = captured.sentEvents.find((event) => event.channel === 'chat:notice')
  assert.match(String(notice?.payload?.text || ''), /Anthropic provider compaction is disabled in continuity policy/i)
  const persistedNotice = captured.timelineEvents.find((event) => event.kind === 'anthropic_compaction_notice')
  assert.equal(persistedNotice?.kind, 'anthropic_compaction_notice')
  assert.equal(persistedNotice?.payload?.meta?.providerId, 'anthropic')
})

test('preparePreCallRoundContext blocks Anthropic threshold overrides with invalid thresholds and persists an Anthropic notice', async () => {
  const { args, captured } = createBaseArgs({
    providerId: 'anthropic',
    model: 'claude-sonnet-5',
    providerRuntimeSettings: {
      anthropic: {
        useContextManagementCompaction: false,
        contextManagementCompactionThresholdTokens: 0,
        contextManagementCompactionInstructions: '',
      },
    },
    continuityPolicy: {
      providerChainCompactionEnabled: true,
      providerTruncationEnabled: false,
      providerCompactionAllowlist: ['openai', 'anthropic'],
    },
    turnOptions: {
      anthropic: {
        forceContextManagementCompaction: true,
        contextManagementCompactionThresholdTokens: 0,
      },
    },
  })

  const result = await preparePreCallRoundContext(args)

  assert.deepEqual(result.currentProviderRequestContext, {
    anthropic: {
      useContextManagementCompaction: false,
      contextManagementCompactionThresholdTokens: 0,
      contextManagementCompactionInstructions: '',
    },
  })
  const notice = captured.sentEvents.find((event) => event.channel === 'chat:notice')
  assert.match(String(notice?.payload?.text || ''), /provide a positive token threshold/i)
  const persistedNotice = captured.timelineEvents.find((event) => event.kind === 'anthropic_compaction_notice')
  assert.equal(persistedNotice?.kind, 'anthropic_compaction_notice')
  assert.equal(persistedNotice?.payload?.meta?.reason, 'invalid_threshold')
})
