import { resolveProviderModelAdapter } from '../../src/main/api-clients/provider-model-adapters.mjs'

export function createBaseArgs(overrides = {}) {
  const history = [
    { role: 'system', content: 'You are ADDOM.' },
    { role: 'user', content: 'Continue.' },
  ]
  const captured = {
    providerNativeContext: null,
    persistedThreadState: null,
    sentEvents: [],
    timelineEvents: [],
  }
  const args = {
    captured,
    args: {
      history,
      round: 1,
      rollingUsage: {},
      userMessage: 'Continue.',
      errorDiagnostics: {},
      providerId: 'openai',
      model: 'gpt-5.4',
      activeToolDefinitions: {},
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
      activeProjectId: 'project-precall',
      activeThreadId: 'thread-precall',
      activeTurnId: 'turn-precall',
      apiKey: 'sk-test',
      continuityRuntime: {
        async applyBeforeModelCall(payload = {}) {
          captured.providerNativeContext = payload.providerNativeContext || null
          return {
            history,
            compaction: null,
          }
        },
      },
      modelContext: { limitTokens: 200_000 },
      loop: { abortController: new AbortController() },
      latestOpenAICompactionId: '',
      send: (channel, payload) => {
        captured.sentEvents.push({ channel, payload })
      },
      persistTimelineEvent: (kind, payload) => {
        captured.timelineEvents.push({ kind, payload })
      },
      buildPreCallContinuityInput: () => ({
        preCallOccupancyEstimateTokens: 12_000,
        continuityInput: {
          history,
          round: 1,
          rollingTotalTokens: 0,
          contextOccupancyTokens: 12_000,
          userMessage: 'Continue.',
        },
      }),
      compactHistoryForContextWindow: async () => ({
        compacted: false,
        history,
      }),
      applyCompactionIfNeeded: () => {},
      estimateHistoryTokens: () => 12_000,
      resolveOpenAIThreadContinuation: () => ({
        previousResponseId: '',
        conversationId: '',
        invalidReason: '',
        manualCompactedWindow: [],
        resetChainFromCompactedWindow: false,
      }),
      pushUniqueRuntimeValue: () => {},
      upsertOpenAIThreadState: (payload = {}) => {
        captured.persistedThreadState = payload
      },
      ...overrides,
    },
  }
  if (!args.args.adapterProfile) {
    args.args.adapterProfile = resolveProviderModelAdapter(
      args.args.providerId,
      args.args.model,
    )
  }
  return args
}
