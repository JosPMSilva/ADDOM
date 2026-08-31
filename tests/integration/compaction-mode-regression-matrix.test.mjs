import test from 'node:test'
import assert from 'node:assert/strict'

import { preparePreCallRoundContext } from '../../src/main/chat/chat-stream-precall-round.mjs'
import { resolveProviderModelAdapter } from '../../src/main/api-clients/provider-model-adapters.mjs'
import { COMPACTION_MODES } from '../../src/main/chat/continuity/compaction-mode-contract.mjs'
import {
  __resetOpenAICompactionClientFactoryForTests,
  __setOpenAICompactionClientFactoryForTests,
} from '../../src/main/chat/continuity/provider-native/openai-compaction-adapter.mjs'

test.afterEach(() => {
  __resetOpenAICompactionClientFactoryForTests()
})

function createMatrixArgs({
  providerId = 'openai',
  model = 'gpt-5.4',
  providerRuntimeSettings = null,
  continuityPolicy = null,
  preCallOccupancyEstimateTokens = 12_000,
  previousResponseId = '',
  invokeProviderNativeCompaction = false,
  providerNativePacketTokens = 0,
} = {}) {
  const history = [
    { role: 'system', content: 'You are ADDOM.' },
    { role: 'user', content: 'Continue.' },
  ]
  const captured = {
    providerNativeContext: null,
  }
  const args = {
    history,
    round: 1,
    rollingUsage: {},
    userMessage: 'Continue.',
    errorDiagnostics: {},
    providerId,
    model,
    activeToolDefinitions: {},
    providerRuntimeSettings: providerRuntimeSettings || {
      openai: {
        usePreviousResponseId: false,
        useConversationState: false,
        useResponseCompaction: false,
        useServerSideCompaction: true,
        serverSideCompactionThresholdTokens: 180_000,
        enableBackgroundMode: false,
      },
    },
    continuityPolicy: continuityPolicy || {
      providerChainCompactionEnabled: true,
      providerTruncationEnabled: true,
      providerCompactionAllowlist: ['openai'],
    },
    activeProjectId: 'project-compaction-matrix',
    activeThreadId: 'thread-compaction-matrix',
    activeTurnId: 'turn-compaction-matrix',
    apiKey: 'sk-test',
    continuityRuntime: {
      async applyBeforeModelCall(payload = {}) {
        captured.providerNativeContext = payload.providerNativeContext || null
        let providerNativeMeta = null
        if (
          invokeProviderNativeCompaction
          && typeof payload?.providerNativeContext?.runProviderNativeCompaction === 'function'
        ) {
          providerNativeMeta = await payload.providerNativeContext.runProviderNativeCompaction({
            history: Array.isArray(payload.history) ? payload.history : history,
            historyTokenEstimate: Number(payload.contextOccupancyTokens || 0) || preCallOccupancyEstimateTokens,
            packetTokens: providerNativePacketTokens,
            promptCacheKey: 'matrix-key',
          })
        }
        return {
          history,
          compaction: null,
          packetPayload: providerNativeMeta
            ? {
              packetTokens: providerNativePacketTokens,
              sourceRefCount: 0,
              providerNativeMeta,
            }
            : null,
        }
      },
    },
    modelContext: { limitTokens: 200_000 },
    loop: { abortController: new AbortController() },
    latestOpenAICompactionId: '',
    send: () => {},
    persistTimelineEvent: () => {},
    buildPreCallContinuityInput: () => ({
      preCallOccupancyEstimateTokens,
      continuityInput: {
        history,
        round: 1,
        rollingTotalTokens: 0,
        contextOccupancyTokens: preCallOccupancyEstimateTokens,
        userMessage: 'Continue.',
      },
    }),
    compactHistoryForContextWindow: async () => ({
      compacted: false,
      history,
    }),
    applyCompactionIfNeeded: () => {},
    estimateHistoryTokens: () => preCallOccupancyEstimateTokens,
    resolveOpenAIThreadContinuation: () => ({
      previousResponseId,
      conversationId: '',
      invalidReason: '',
      manualCompactedWindow: [],
      resetChainFromCompactedWindow: false,
    }),
    pushUniqueRuntimeValue: () => {},
    upsertOpenAIThreadState: () => {},
    adapterProfile: resolveProviderModelAdapter(providerId, model),
  }
  return { args, captured }
}

function summarizeCompactionOutcome(result, captured) {
  return {
    openAIContinuityEnabled: result.openAIContinuityEnabled,
    selectedCompactionMode: result.currentOpenAIRequestContext?.selectedCompactionMode || COMPACTION_MODES.LOCAL_SUMMARY,
    candidateCompactionModes: result.currentOpenAIRequestContext?.candidateCompactionModes || [COMPACTION_MODES.LOCAL_SUMMARY],
    compactionFailureReason: result.currentOpenAIRequestContext?.compactionFailureReason || '',
    fallbackCompactionMode: result.currentOpenAIRequestContext?.fallbackCompactionMode || '',
    fallbackReason: result.currentOpenAIRequestContext?.fallbackReason || '',
    latestOpenAICompactionId: String(result.latestOpenAICompactionId || ''),
    providerNativeHookActive: typeof captured.providerNativeContext?.runProviderNativeCompaction === 'function',
  }
}

test('compaction mode regression matrix keeps explicit mode and fallback behavior stable', async () => {
  const cases = [
    {
      name: 'local summary only',
      setup() {
        return createMatrixArgs({
          providerId: 'openai',
          model: 'gpt-5.4',
          providerRuntimeSettings: {
            openai: {
              usePreviousResponseId: false,
              useConversationState: false,
              useResponseCompaction: false,
              useServerSideCompaction: false,
              serverSideCompactionThresholdTokens: 0,
              enableBackgroundMode: false,
            },
          },
          continuityPolicy: {
            providerChainCompactionEnabled: false,
            providerTruncationEnabled: false,
            providerCompactionAllowlist: ['openai'],
          },
        })
      },
      expected: {
        openAIContinuityEnabled: true,
        selectedCompactionMode: COMPACTION_MODES.LOCAL_SUMMARY,
        candidateCompactionModes: [COMPACTION_MODES.LOCAL_SUMMARY],
        compactionFailureReason: '',
        fallbackCompactionMode: '',
        fallbackReason: '',
        latestOpenAICompactionId: '',
        providerNativeHookActive: false,
      },
    },
    {
      name: 'openai chain compaction eligible',
      setup() {
        __setOpenAICompactionClientFactoryForTests(() => ({
          responses: {
            async compact() {
              return {
                id: 'resp_cmp_chain_matrix',
                output: [{ type: 'compaction', id: 'cmp_chain_matrix_1', encrypted_content: 'enc_chain' }],
              }
            },
          },
        }))
        return createMatrixArgs({
          providerId: 'openai',
          model: 'gpt-5.4',
          providerRuntimeSettings: {
            openai: {
              usePreviousResponseId: true,
              useConversationState: false,
              useResponseCompaction: true,
              useServerSideCompaction: false,
              serverSideCompactionThresholdTokens: 0,
              enableBackgroundMode: false,
            },
          },
          continuityPolicy: {
            providerChainCompactionEnabled: true,
            providerTruncationEnabled: false,
            providerCompactionAllowlist: ['openai'],
          },
          previousResponseId: 'resp_prev_chain_matrix',
          invokeProviderNativeCompaction: true,
        })
      },
      expected: {
        openAIContinuityEnabled: true,
        selectedCompactionMode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
        candidateCompactionModes: [
          COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
          COMPACTION_MODES.LOCAL_SUMMARY,
        ],
        compactionFailureReason: '',
        fallbackCompactionMode: '',
        fallbackReason: '',
        latestOpenAICompactionId: 'cmp_chain_matrix_1',
        providerNativeHookActive: true,
      },
    },
    {
      name: 'removed OpenAI transport truncation falls back locally',
      setup() {
        return createMatrixArgs({
          providerId: 'openai',
          model: 'gpt-5.4',
          providerRuntimeSettings: {
            openai: {
              usePreviousResponseId: false,
              useConversationState: false,
              useResponseCompaction: false,
              useServerSideCompaction: true,
              serverSideCompactionThresholdTokens: 180_000,
              enableBackgroundMode: false,
            },
          },
          continuityPolicy: {
            providerChainCompactionEnabled: true,
            providerTruncationEnabled: true,
            providerCompactionAllowlist: ['openai'],
          },
        })
      },
      expected: {
        openAIContinuityEnabled: true,
        selectedCompactionMode: COMPACTION_MODES.LOCAL_SUMMARY,
        candidateCompactionModes: [COMPACTION_MODES.LOCAL_SUMMARY],
        compactionFailureReason: '',
        fallbackCompactionMode: '',
        fallbackReason: '',
        latestOpenAICompactionId: '',
        providerNativeHookActive: false,
      },
    },
    {
      name: 'chain compaction failure fallback',
      setup() {
        __setOpenAICompactionClientFactoryForTests(() => ({
          responses: {
            async compact() {
              const error = new Error('compaction unavailable')
              error.status = 429
              throw error
            },
          },
        }))
        return createMatrixArgs({
          providerId: 'openai',
          model: 'gpt-5.4',
          providerRuntimeSettings: {
            openai: {
              usePreviousResponseId: true,
              useConversationState: false,
              useResponseCompaction: true,
              useServerSideCompaction: false,
              serverSideCompactionThresholdTokens: 0,
              enableBackgroundMode: false,
            },
          },
          continuityPolicy: {
            providerChainCompactionEnabled: true,
            providerTruncationEnabled: false,
            providerCompactionAllowlist: ['openai'],
          },
          previousResponseId: 'resp_prev_chain_failure_matrix',
          invokeProviderNativeCompaction: true,
        })
      },
      expected: {
        openAIContinuityEnabled: true,
        selectedCompactionMode: COMPACTION_MODES.LOCAL_SUMMARY,
        candidateCompactionModes: [
          COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
          COMPACTION_MODES.LOCAL_SUMMARY,
        ],
        compactionFailureReason: 'provider_error',
        fallbackCompactionMode: COMPACTION_MODES.LOCAL_SUMMARY,
        fallbackReason: 'provider_chain_compaction_unavailable',
        latestOpenAICompactionId: '',
        providerNativeHookActive: true,
      },
    },
    {
      name: 'missing chain-state fallback',
      setup() {
        return createMatrixArgs({
          providerId: 'openai',
          model: 'gpt-5.4',
          providerRuntimeSettings: {
            openai: {
              usePreviousResponseId: true,
              useConversationState: false,
              useResponseCompaction: true,
              useServerSideCompaction: false,
              serverSideCompactionThresholdTokens: 0,
              enableBackgroundMode: false,
            },
          },
          continuityPolicy: {
            providerChainCompactionEnabled: true,
            providerTruncationEnabled: false,
            providerCompactionAllowlist: ['openai'],
          },
          previousResponseId: '',
          invokeProviderNativeCompaction: true,
        })
      },
      expected: {
        openAIContinuityEnabled: true,
        selectedCompactionMode: COMPACTION_MODES.LOCAL_SUMMARY,
        candidateCompactionModes: [
          COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
          COMPACTION_MODES.LOCAL_SUMMARY,
        ],
        compactionFailureReason: 'missing_previous_response_id',
        fallbackCompactionMode: COMPACTION_MODES.LOCAL_SUMMARY,
        fallbackReason: 'provider_chain_compaction_unavailable',
        latestOpenAICompactionId: '',
        providerNativeHookActive: true,
      },
    },
    {
      name: 'unsupported provider fallback',
      setup() {
        return createMatrixArgs({
          providerId: 'anthropic',
          model: 'claude-sonnet-5',
        })
      },
      expected: {
        openAIContinuityEnabled: false,
        selectedCompactionMode: COMPACTION_MODES.LOCAL_SUMMARY,
        candidateCompactionModes: [COMPACTION_MODES.LOCAL_SUMMARY],
        compactionFailureReason: '',
        fallbackCompactionMode: '',
        fallbackReason: '',
        latestOpenAICompactionId: '',
        providerNativeHookActive: false,
      },
    },
  ]

  for (const row of cases) {
    const { args, captured } = row.setup()
    const result = await preparePreCallRoundContext(args)
    const summary = summarizeCompactionOutcome(result, captured)

    assert.deepEqual(summary, row.expected, row.name)
  }
})
