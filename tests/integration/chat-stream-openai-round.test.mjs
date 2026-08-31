import test from 'node:test'
import assert from 'node:assert/strict'

import { COMPACTION_MODES } from '../../src/main/chat/continuity/compaction-mode-contract.mjs'
import {
  createOpenAIResponseMetaEmitter,
  maybeQueueOpenAIBackgroundTurn,
} from '../../src/main/chat/chat-stream-openai-round.mjs'
import {
  __resetOpenAIAccountAuthServiceGetterForTests,
  __setOpenAIAccountAuthServiceGetterForTests,
  runOpenAIAccountThreadCompaction,
} from '../../src/main/chat/chat-stream-precall-openai-command-helpers.mjs'
import { buildChatUsagePayload } from '../../src/main/chat/chat-usage-payload.mjs'
import { getProviderUsageFixture } from '../fixtures/provider-usage-fixtures.mjs'

test('openai response meta emitter reads the shared request-context compaction contract', () => {
  const events = []
  const timelineEvents = []
  const emitter = createOpenAIResponseMetaEmitter({
    activeProjectId: 'project-openai-round',
    activeThreadId: 'thread-openai-round',
    activeTurnId: 'turn-openai-round',
    providerId: 'openai',
    model: 'gpt-5.2',
    round: 1,
    providerRuntimeSettings: {
      openai: {
        continuityMode: 'local_first_hybrid',
        promptCachingEnabled: true,
        useServerSideCompaction: true,
        serverSideCompactionThresholdTokens: 180_000,
      },
    },
    getLastCompactionId: () => 'cmp_ctx_1',
    send: (channel, payload) => events.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => timelineEvents.push({ kind, payload }),
  })

  emitter({
    responseId: 'resp_1',
    transportMode: 'responses_stream',
  }, {
    requestContextUsed: {
      previousResponseId: 'resp_prev_1',
      compaction: {
        requestedMode: COMPACTION_MODES.PROVIDER_TRUNCATION,
        selectedMode: COMPACTION_MODES.LOCAL_SUMMARY,
        candidateModes: [
          COMPACTION_MODES.PROVIDER_TRUNCATION,
          COMPACTION_MODES.LOCAL_SUMMARY,
        ],
        failureReason: 'below_threshold',
        fallbackMode: COMPACTION_MODES.LOCAL_SUMMARY,
        fallbackReason: 'provider_truncation_unavailable',
        providerTruncationThresholdTokens: 180_000,
      },
    },
  })

  assert.equal(events.length, 1)
  assert.equal(events[0].channel, 'chat:openai-continuity-status')
  assert.equal(events[0].payload.compactionStrategy, COMPACTION_MODES.PROVIDER_TRUNCATION)
  assert.equal(events[0].payload.selectedCompactionMode, COMPACTION_MODES.LOCAL_SUMMARY)
  assert.deepEqual(events[0].payload.candidateCompactionModes, [
    COMPACTION_MODES.PROVIDER_TRUNCATION,
    COMPACTION_MODES.LOCAL_SUMMARY,
  ])
  assert.equal(events[0].payload.compactionFailureReason, 'below_threshold')
  assert.equal(events[0].payload.fallbackCompactionMode, COMPACTION_MODES.LOCAL_SUMMARY)
  assert.equal(events[0].payload.fallbackReason, 'provider_truncation_unavailable')
  assert.equal(events[0].payload.strategy, COMPACTION_MODES.LOCAL_SUMMARY)
  assert.equal(events[0].payload.scope, 'partial_reduce')
  assert.equal(events[0].payload.source, 'local')
  assert.equal(events[0].payload.usageRefreshState, 'none')
  assert.equal(events[0].payload.serverSideCompactionEnabled, true)
  assert.equal(events[0].payload.effectiveCompactionTransport, 'responses_server_compaction')
  assert.equal(events[0].payload.serverSideCompactionThresholdTokens, 180_000)
  assert.equal(events[0].payload.previousResponseIdUsed, 'resp_prev_1')
  assert.equal(timelineEvents.length, 1)
  assert.equal(timelineEvents[0].kind, 'openai_continuity_status')
  assert.equal(timelineEvents[0].payload.meta.compactionStrategy, COMPACTION_MODES.PROVIDER_TRUNCATION)
  assert.equal(timelineEvents[0].payload.meta.selectedCompactionMode, COMPACTION_MODES.LOCAL_SUMMARY)
  assert.equal(timelineEvents[0].payload.meta.strategy, COMPACTION_MODES.LOCAL_SUMMARY)
  assert.equal(timelineEvents[0].payload.meta.scope, 'partial_reduce')
  assert.equal(timelineEvents[0].payload.meta.source, 'local')
  assert.equal(timelineEvents[0].payload.meta.usageRefreshState, 'none')
})

test('openai response meta emitter reports no effective compaction transport when none is configured', () => {
  const events = []
  const emitter = createOpenAIResponseMetaEmitter({
    activeProjectId: 'project-openai-no-compaction',
    activeThreadId: 'thread-openai-no-compaction',
    activeTurnId: 'turn-openai-no-compaction',
    providerId: 'openai',
    model: 'gpt-5.2',
    round: 1,
    providerRuntimeSettings: {
      openai: {
        continuityMode: 'local_first_hybrid',
        promptCachingEnabled: true,
        useServerSideCompaction: false,
      },
    },
    send: (channel, payload) => events.push({ channel, payload }),
    persistTimelineEvent: () => {},
  })

  emitter({
    responseId: 'resp_no_compaction',
    transportMode: 'responses_stream',
  })

  assert.equal(events.length, 1)
  assert.equal(events[0].payload.serverSideCompactionEnabled, false)
  assert.equal(events[0].payload.effectiveCompactionTransport, COMPACTION_MODES.NONE)
})

test('openai response meta emitter persists account reroute diagnostics on the original turn', () => {
  const timelineEvents = []
  const emitter = createOpenAIResponseMetaEmitter({
    activeThreadId: 'thread-account-reroute',
    activeTurnId: 'turn-account-reroute',
    providerId: 'openai',
    model: 'gpt-5.3-codex',
    round: 1,
    send: () => {},
    persistTimelineEvent: (kind, payload) => timelineEvents.push({ kind, payload }),
  })

  emitter({
    authMethod: 'account',
    transportMode: 'codex_app_server_chatgpt',
    responseId: 'turn-account-reroute',
    requestedModelId: 'gpt-5.3-codex',
    modelId: 'gpt-5.2',
    accountModelReroutes: [{
      fromModel: 'gpt-5.3-codex',
      toModel: 'gpt-5.2',
      reason: 'highRiskCyberActivity',
    }],
  })

  assert.equal(timelineEvents.length, 1)
  assert.equal(timelineEvents[0].kind, 'openai_continuity_status')
  assert.equal(timelineEvents[0].payload.meta.turnId, 'turn-account-reroute')
  assert.equal(timelineEvents[0].payload.meta.requestedModelId, 'gpt-5.3-codex')
  assert.equal(timelineEvents[0].payload.meta.modelId, 'gpt-5.2')
  assert.deepEqual(timelineEvents[0].payload.meta.accountModelReroutes, [{
    fromModel: 'gpt-5.3-codex',
    toModel: 'gpt-5.2',
    reason: 'highRiskCyberActivity',
  }])
})

test('openai response meta emitter persists next-turn provider truncation resume metadata when auto compaction is reported', () => {
  let persistedThreadState = null
  const events = []
  const emitter = createOpenAIResponseMetaEmitter({
    activeProjectId: 'project-openai-round',
    activeThreadId: 'thread-openai-round',
    activeTurnId: 'turn-openai-round',
    providerId: 'openai',
    model: 'gpt-5.2',
    round: 1,
    providerRuntimeSettings: {
      openai: {
        continuityMode: 'local_first_hybrid',
        promptCachingEnabled: true,
        useServerSideCompaction: true,
        serverSideCompactionThresholdTokens: 180_000,
      },
    },
    shouldStoreOpenAIState: true,
    getLastCompactionId: () => 'cmp_ctx_2',
    send: (channel, payload) => events.push({ channel, payload }),
    persistTimelineEvent: () => {},
    upsertOpenAIThreadState: (payload = {}) => {
      persistedThreadState = payload
    },
  })

  emitter({
    responseId: 'resp_2',
    transportMode: 'responses_stream',
    autoCompactionApplied: true,
    autoCompactionIds: ['cmp_auto_2'],
  }, {
    requestContextUsed: {
      previousResponseId: 'resp_prev_2',
      compaction: {
        requestedMode: COMPACTION_MODES.PROVIDER_TRUNCATION,
        selectedMode: COMPACTION_MODES.PROVIDER_TRUNCATION,
        candidateModes: [
          COMPACTION_MODES.PROVIDER_TRUNCATION,
          COMPACTION_MODES.LOCAL_SUMMARY,
        ],
        canonicalHandoffUsed: true,
        carryForwardSource: 'both',
        providerTruncationThresholdTokens: 180_000,
      },
    },
  })

  assert.equal(persistedThreadState?.threadId, 'thread-openai-round')
  assert.equal(persistedThreadState?.lastCompactionId, 'cmp_ctx_2')
  assert.equal(persistedThreadState?.metadata?.pendingProviderTruncationResume?.eventType, 'provider_truncation')
  assert.equal(persistedThreadState?.metadata?.pendingProviderTruncationResume?.eventPhase, 'resumed_after')
  assert.equal(persistedThreadState?.metadata?.pendingProviderTruncationResume?.providerId, 'openai')
  assert.equal(persistedThreadState?.metadata?.pendingProviderTruncationResume?.turnId, 'turn-openai-round')
  assert.equal(persistedThreadState?.metadata?.pendingProviderTruncationResume?.responseId, 'resp_2')
  assert.deepEqual(persistedThreadState?.metadata?.pendingProviderTruncationResume?.compactionIds, ['cmp_auto_2'])
  assert.ok(Number(persistedThreadState?.metadata?.pendingProviderTruncationResume?.detectedAt || 0) > 0)
  assert.equal(events[0]?.channel, 'chat:openai-continuity-status')
  assert.equal(events[0]?.payload?.compactionEventType, 'provider_truncation')
  assert.equal(events[0]?.payload?.compactionEventPhase, 'applied')
  assert.equal(events[0]?.payload?.compactionEventOccurred, true)
  assert.equal(events[0]?.payload?.canonicalHandoffUsed, true)
  assert.equal(events[0]?.payload?.carryForwardSource, 'both')
})

test('queued openai background turns keep the shared compaction contract on queued and completed continuity status events', async () => {
  const sent = []
  const timelineEvents = []
  const emitOpenAIResponseMeta = createOpenAIResponseMetaEmitter({
    activeProjectId: 'project-openai-background',
    activeThreadId: 'thread-openai-background',
    activeTurnId: 'turn-openai-background',
    providerId: 'openai',
    model: 'gpt-5.2',
    round: 1,
    providerRuntimeSettings: {
      openai: {
        continuityMode: 'local_first_hybrid',
        promptCachingEnabled: true,
        useServerSideCompaction: true,
        serverSideCompactionThresholdTokens: 180_000,
      },
    },
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => timelineEvents.push({ kind, payload }),
  })

  const queued = await maybeQueueOpenAIBackgroundTurn({
    openAIContinuityEnabled: true,
    activeAssistantMessageId: 'assistant_bg_1',
    providerId: 'openai',
    apiKey: 'sk-test',
    history: [{ role: 'user', content: 'Continue.' }],
    options: { model: 'gpt-5.2' },
    providerRuntimeSettings: {
      openai: {
        continuityMode: 'local_first_hybrid',
        promptCachingEnabled: true,
        useServerSideCompaction: true,
        serverSideCompactionThresholdTokens: 180_000,
      },
    },
    activeProjectId: 'project-openai-background',
    activeThreadId: 'thread-openai-background',
    activeTurnId: 'turn-openai-background',
    tools: {},
    openAIRequestContextForRound: {
      previousResponseId: 'resp_prev_bg_1',
      store: true,
      compaction: {
        requestedMode: COMPACTION_MODES.PROVIDER_TRUNCATION,
        selectedMode: COMPACTION_MODES.LOCAL_SUMMARY,
        candidateModes: [COMPACTION_MODES.PROVIDER_TRUNCATION, COMPACTION_MODES.LOCAL_SUMMARY],
        failureReason: 'below_threshold',
        fallbackMode: COMPACTION_MODES.LOCAL_SUMMARY,
        fallbackReason: 'provider_truncation_unavailable',
        providerTruncationThresholdTokens: 180_000,
      },
    },
    projectFolder: 'C:/Users/example/Documents/ADDOM',
    assistantFinalPhase: 'final',
    model: 'gpt-5.2',
    emitOpenAIResponseMeta,
    rollingUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
    modelContext: {},
    promptOccupancyEstimateTokens: 12_000,
    round: 1,
    send: (channel, payload) => sent.push({ channel, payload }),
    sendTurnState: () => {},
    persistTimelineEvent: (kind, payload) => timelineEvents.push({ kind, payload }),
    emitTurnRuntimeDiagnostics: () => {},
    turnReasoningSegments: [],
    turnToolResults: [],
    userMessage: 'Continue.',
    continuityRuntime: { persistTurnContinuity: () => {} },
    mode: 'chat',
    loop: {},
    prepareOpenAIBackgroundTurn: async () => ({
      eligible: true,
      modelId: 'gpt-5.2',
      messages: [{ role: 'user', content: 'Continue.' }],
      openaiOptions: { store: true },
    }),
    createOpenAIBackgroundJob: async ({ requestContextUsed, onCompleted }) => {
      assert.equal(requestContextUsed?.previousResponseId, 'resp_prev_bg_1')
      assert.equal(requestContextUsed?.selectedCompactionMode, COMPACTION_MODES.LOCAL_SUMMARY)
      assert.equal(requestContextUsed?.compaction?.requestedMode, COMPACTION_MODES.PROVIDER_TRUNCATION)
      await onCompleted({
        job: { id: 'oaibg-test-1', promptPreview: 'Continue.' },
        payload: {
          text: 'Background answer.',
          reasoning: '',
          usage: { inputTokens: 3, outputTokens: 2, reasoningTokens: 0, totalTokens: 5 },
          stopReason: 'stop',
          providerResponseMeta: {
            responseId: 'resp_bg_done_1',
            conversationId: 'conv_bg_done_1',
            background: true,
            status: 'completed',
          },
        },
      })
      return {
        job: { id: 'oaibg-test-1', promptPreview: 'Continue.' },
        providerResponseMeta: {
          responseId: 'resp_bg_queue_1',
          conversationId: 'conv_bg_queue_1',
          background: true,
          status: 'queued',
        },
      }
    },
    finalizeOpenAIBackgroundJob: () => {},
    buildChatUsagePayload: () => null,
    emitUsageEvent: () => {},
    emitReasoningDone: () => {},
    touchProjectUsageByThread: () => {},
    runPostTurnTasks: () => {},
  })

  assert.equal(queued, true)
  const continuityStatuses = sent.filter((row) => row.channel === 'chat:openai-continuity-status')
  assert.equal(continuityStatuses.length, 2)
  for (const row of continuityStatuses) {
    assert.equal(row.payload.compactionStrategy, COMPACTION_MODES.PROVIDER_TRUNCATION)
    assert.equal(row.payload.selectedCompactionMode, COMPACTION_MODES.LOCAL_SUMMARY)
    assert.deepEqual(row.payload.candidateCompactionModes, [
      COMPACTION_MODES.PROVIDER_TRUNCATION,
      COMPACTION_MODES.LOCAL_SUMMARY,
    ])
    assert.equal(row.payload.compactionFailureReason, 'below_threshold')
    assert.equal(row.payload.fallbackCompactionMode, COMPACTION_MODES.LOCAL_SUMMARY)
    assert.equal(row.payload.fallbackReason, 'provider_truncation_unavailable')
    assert.equal(row.payload.serverSideCompactionThresholdTokens, 180_000)
    assert.equal(row.payload.previousResponseIdUsed, 'resp_prev_bg_1')
  }
  const backgroundCompleted = sent.find((row) => row.channel === 'chat:background-response-completed')
  assert.ok(backgroundCompleted)
  assert.equal(backgroundCompleted.payload.messageId, 'assistant_bg_1')
  assert.equal(backgroundCompleted.payload.assistantMessageId, 'assistant_bg_1')
  assert.deepEqual(backgroundCompleted.payload.finalDocument, {
    schemaVersion: 1,
    threadId: 'thread-openai-background',
    turnId: 'turn-openai-background',
    messageId: 'assistant_bg_1',
    ownership: 'final-document',
    text: 'Background answer.',
    parts: [{
      threadId: 'thread-openai-background',
      turnId: 'turn-openai-background',
      messageId: 'assistant_bg_1',
      partId: 'assistant_bg_1:final-document:1',
      appendOrder: 1,
      sequence: 1,
      status: 'completed',
      ownership: 'final-document',
      kind: 'markdown',
      text: 'Background answer.',
    }],
  })
  const persistedAssistant = timelineEvents.find((row) => row.kind === 'assistant_message')
  assert.ok(persistedAssistant)
  assert.equal(persistedAssistant.payload.meta.assistantMessageId, 'assistant_bg_1')
  assert.deepEqual(persistedAssistant.payload.meta.finalDocument, backgroundCompleted.payload.finalDocument)
})

test('openai response meta emitter records account-runtime compaction and emits a visible compaction event', () => {
  const sent = []
  const timelineEvents = []
  let persistedThreadState = null
  const emitter = createOpenAIResponseMetaEmitter({
    activeProjectId: 'project-account-stream',
    activeThreadId: 'thread-account-stream',
    activeTurnId: 'turn-account-stream',
    providerId: 'openai',
    model: 'gpt-5.4',
    round: 1,
    providerRuntimeSettings: {
      openai: {
        continuityMode: 'local_first_hybrid',
        promptCachingEnabled: true,
      },
    },
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => timelineEvents.push({ kind, payload }),
    upsertOpenAIThreadState: (payload = {}) => { persistedThreadState = payload },
  })

  emitter({
    authMethod: 'account',
    transportMode: 'codex_app_server_chatgpt',
    responseId: 'turn_account_stream_1',
    conversationId: 'thr_account_stream_1',
    accountBridgeThreadId: 'thr_account_stream_1',
    accountBridgeTurnId: 'turn_account_stream_1',
    contextCompactionGeneration: 1,
    accountCompaction: {
      started: true,
      completed: true,
      itemIds: ['cmp_account_stream_1'],
    },
  })

  const continuityStatus = sent.find((entry) => entry.channel === 'chat:openai-continuity-status')
  assert.ok(continuityStatus)
  assert.equal(continuityStatus.payload.autoCompactionApplied, true)
  assert.deepEqual(continuityStatus.payload.autoCompactionIds, ['cmp_account_stream_1'])
  assert.equal(continuityStatus.payload.selectedCompactionMode, COMPACTION_MODES.CODEX_THREAD_COMPACTION)
  assert.equal(continuityStatus.payload.compactionEventType, 'codex_thread_compaction')
  assert.equal(continuityStatus.payload.strategy, COMPACTION_MODES.CODEX_THREAD_COMPACTION)
  assert.equal(continuityStatus.payload.scope, 'thread_reset')
  assert.equal(continuityStatus.payload.source, 'provider')
  assert.equal(continuityStatus.payload.usageRefreshState, 'recalculating')
  assert.equal(continuityStatus.payload.effectiveCompactionTransport, 'codex_thread_compaction')
  assert.equal(continuityStatus.payload.serverSideCompactionEnabled, false)
  assert.equal(continuityStatus.payload.accountAutoCompactionEnabled, true)
  assert.equal(continuityStatus.payload.accountAutoCompactionMode, 'native_default')
  assert.equal(continuityStatus.payload.lastCompactionId, 'cmp_account_stream_1')
  const compactionEvent = sent.find((entry) => entry.channel === 'chat:openai-compaction-event')
  assert.ok(compactionEvent)
  assert.equal(compactionEvent.payload.status, 'applied')
  assert.equal(compactionEvent.payload.compactionEventType, 'codex_thread_compaction')
  assert.equal(compactionEvent.payload.accountBridgeThreadId, 'thr_account_stream_1')
  assert.equal(compactionEvent.payload.accountBridgeTurnId, 'turn_account_stream_1')
  assert.equal(compactionEvent.payload.contextCompactionGeneration, 1)
  assert.equal(persistedThreadState?.lastCompactionId, 'cmp_account_stream_1')
  assert.equal(persistedThreadState?.metadata?.accountContextCompactionGeneration, 1)
  assert.deepEqual(persistedThreadState?.metadata?.latestCodexThreadCompaction?.compactionIds, ['cmp_account_stream_1'])
  assert.equal(
    timelineEvents.some((entry) => entry.kind === 'openai_compaction_event'),
    true,
  )
})

test('openai response meta emitter marks account-runtime compaction as verified when provider context telemetry is present', () => {
  const sent = []
  const emitter = createOpenAIResponseMetaEmitter({
    activeProjectId: 'project-account-stream-verified',
    activeThreadId: 'thread-account-stream-verified',
    activeTurnId: 'turn-account-stream-verified',
    providerId: 'openai',
    model: 'gpt-5.4',
    round: 1,
    providerRuntimeSettings: {
      openai: {
        continuityMode: 'local_first_hybrid',
        promptCachingEnabled: true,
      },
    },
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: () => {},
  })

  emitter({
    authMethod: 'account',
    transportMode: 'codex_app_server_chatgpt',
    responseId: 'turn_account_stream_verified_1',
    conversationId: 'thr_account_stream_verified_1',
    accountBridgeThreadId: 'thr_account_stream_verified_1',
    inputLimitTokens: 400000,
    remainingContextTokens: 392000,
    threadOccupancyTokens: 8000,
    providerUsageSemantics: 'openai_account_provider_context',
    accountCompaction: {
      started: true,
      completed: true,
      itemIds: ['cmp_account_stream_verified_1'],
    },
  })

  const continuityStatus = sent.find((entry) => entry.channel === 'chat:openai-continuity-status')
  assert.ok(continuityStatus)
  assert.equal(continuityStatus.payload.usageRefreshState, 'verified')
  assert.equal(continuityStatus.payload.source, 'provider')
  assert.equal(continuityStatus.payload.scope, 'thread_reset')
})

test('account thread compaction emits a post-compaction recalculating usage refresh when no verified telemetry is available', async () => {
  const sent = []
  const listeners = new Map()
  const bridge = {
    on(eventName, handler) {
      if (!listeners.has(eventName)) listeners.set(eventName, new Set())
      listeners.get(eventName).add(handler)
    },
    off(eventName, handler) {
      listeners.get(eventName)?.delete(handler)
    },
    async startThreadCompaction(threadId) {
      const notify = (payload) => {
        for (const handler of listeners.get('notification') || []) handler(payload)
      }
      notify({
        method: 'item/started',
        params: {
          threadId,
          item: {
            id: 'cmp_manual_usage_1',
            type: 'contextCompaction',
          },
        },
      })
      notify({
        method: 'turn/completed',
        params: {
          threadId,
          turn: {
            id: 'bridge_turn_compaction_1',
            status: 'completed',
          },
        },
      })
    },
  }
  __setOpenAIAccountAuthServiceGetterForTests(() => ({
    getBridge: () => bridge,
  }))

  try {
    const result = await runOpenAIAccountThreadCompaction({
      mode: 'manual',
      threadId: 'thread_manual_usage_refresh',
      turnId: 'turn_manual_usage_refresh',
      providerId: 'openai',
      model: 'gpt-5.4',
      reason: 'manual_compaction_requested',
      selectedCompactionMode: COMPACTION_MODES.CODEX_THREAD_COMPACTION,
      candidateCompactionModes: [COMPACTION_MODES.CODEX_THREAD_COMPACTION, COMPACTION_MODES.LOCAL_SUMMARY],
      bridgeThreadId: 'thread_manual_usage_refresh',
      contextCompactionGeneration: 4,
      send: (channel, payload) => sent.push({ channel, payload }),
      persistTimelineEvent: () => {},
    })

    assert.equal(result.compactionId, 'cmp_manual_usage_1')
    assert.equal(result.contextCompactionGeneration, 5)
    const compactionRequested = sent.find((entry) => (
      entry.channel === 'chat:openai-compaction-event'
      && entry.payload.status === 'requested'
    ))
    assert.equal(compactionRequested?.payload?.contextCompactionGeneration, 4)
    const compactionApplied = sent.find((entry) => (
      entry.channel === 'chat:openai-compaction-event'
      && entry.payload.status === 'applied'
    ))
    assert.ok(compactionApplied)
    assert.equal(compactionApplied.payload.strategy, COMPACTION_MODES.CODEX_THREAD_COMPACTION)
    assert.equal(compactionApplied.payload.scope, 'thread_reset')
    assert.equal(compactionApplied.payload.source, 'provider')
    assert.equal(compactionApplied.payload.usageRefreshState, 'recalculating')
    assert.equal(compactionApplied.payload.contextCompactionGeneration, 5)

    const usageRefresh = sent.find((entry) => entry.channel === 'chat:usage')
    assert.ok(usageRefresh)
    assert.equal(usageRefresh.payload.compactionStrategy, COMPACTION_MODES.CODEX_THREAD_COMPACTION)
    assert.equal(usageRefresh.payload.compactionScope, 'thread_reset')
    assert.equal(usageRefresh.payload.compactionSource, 'provider')
    assert.equal(usageRefresh.payload.usageRefreshState, 'recalculating')
    assert.equal(usageRefresh.payload.occupancySource, 'unavailable')
    assert.equal(usageRefresh.payload.occupancyConfidence, 'unavailable')
    assert.equal(usageRefresh.payload.providerUsageAvailable, false)
    assert.equal(usageRefresh.payload.contextCompactionGeneration, 5)
  } finally {
    __resetOpenAIAccountAuthServiceGetterForTests()
  }
})

test('account thread compaction emits a verified post-compaction usage refresh when thread token telemetry is available', async () => {
  const sent = []
  const listeners = new Map()
  const bridge = {
    on(eventName, handler) {
      if (!listeners.has(eventName)) listeners.set(eventName, new Set())
      listeners.get(eventName).add(handler)
    },
    off(eventName, handler) {
      listeners.get(eventName)?.delete(handler)
    },
    async startThreadCompaction(threadId) {
      const notify = (payload) => {
        for (const handler of listeners.get('notification') || []) handler(payload)
      }
      notify({
        method: 'item/started',
        params: {
          threadId,
          item: {
            id: 'cmp_manual_usage_verified_1',
            type: 'contextCompaction',
          },
        },
      })
      notify({
        method: 'thread/tokenUsage/updated',
        params: {
          threadId,
          tokenUsage: {
            modelContextWindow: 400000,
            remainingContextTokens: 392000,
            last: {
              totalTokens: 8000,
            },
          },
        },
      })
      notify({
        method: 'turn/completed',
        params: {
          threadId,
          turn: {
            id: 'bridge_turn_compaction_verified_1',
            status: 'completed',
          },
        },
      })
    },
  }
  __setOpenAIAccountAuthServiceGetterForTests(() => ({
    getBridge: () => bridge,
  }))

  try {
    await runOpenAIAccountThreadCompaction({
      mode: 'manual',
      threadId: 'thread_manual_usage_refresh_verified',
      turnId: 'turn_manual_usage_refresh_verified',
      providerId: 'openai',
      model: 'gpt-5.4',
      reason: 'manual_compaction_requested',
      selectedCompactionMode: COMPACTION_MODES.CODEX_THREAD_COMPACTION,
      candidateCompactionModes: [COMPACTION_MODES.CODEX_THREAD_COMPACTION, COMPACTION_MODES.LOCAL_SUMMARY],
      bridgeThreadId: 'thread_manual_usage_refresh_verified',
      send: (channel, payload) => sent.push({ channel, payload }),
      persistTimelineEvent: () => {},
    })

    const compactionApplied = sent.find((entry) => (
      entry.channel === 'chat:openai-compaction-event'
      && entry.payload.status === 'applied'
    ))
    assert.ok(compactionApplied)
    assert.equal(compactionApplied.payload.usageRefreshState, 'verified')

    const usageRefresh = sent.find((entry) => entry.channel === 'chat:usage')
    assert.ok(usageRefresh)
    assert.equal(usageRefresh.payload.usageRefreshState, 'verified')
    assert.equal(usageRefresh.payload.contextRemainingTokens, 392000)
    assert.equal(usageRefresh.payload.threadOccupancyTokens, 8000)
    assert.equal(usageRefresh.payload.contextOccupancyTokens, 8000)
    assert.equal(usageRefresh.payload.occupancySource, 'provider_thread_context')
    assert.equal(usageRefresh.payload.occupancyConfidence, 'provider_verified')
    assert.equal(usageRefresh.payload.providerUsageAvailable, true)
  } finally {
    __resetOpenAIAccountAuthServiceGetterForTests()
  }
})

test('queued openai background turns emit mapped provider occupancy instead of the pre-call estimate when usage is present', async () => {
  let emittedUsagePayload = null

  const queued = await maybeQueueOpenAIBackgroundTurn({
    openAIContinuityEnabled: true,
    activeAssistantMessageId: 'assistant_bg_usage_1',
    providerId: 'openai',
    apiKey: 'sk-test',
    history: [{ role: 'user', content: 'Continue.' }],
    options: { model: 'gpt-5.2' },
    providerRuntimeSettings: {
      openai: {
        continuityMode: 'local_first_hybrid',
        promptCachingEnabled: true,
      },
    },
    activeProjectId: 'project-openai-background-usage',
    activeThreadId: 'thread-openai-background-usage',
    activeTurnId: 'turn-openai-background-usage',
    tools: {},
    openAIRequestContextForRound: {
      previousResponseId: 'resp_prev_bg_usage_1',
      store: true,
    },
    projectFolder: 'C:/Users/example/Documents/ADDOM',
    assistantFinalPhase: 'final',
    model: 'gpt-5.2',
    emitOpenAIResponseMeta: () => {},
    rollingUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
    modelContext: { limitTokens: 400000, source: 'provider', provenance: 'provider' },
    promptOccupancyEstimateTokens: 12000,
    round: 1,
    send: () => {},
    sendTurnState: () => {},
    persistTimelineEvent: () => {},
    emitTurnRuntimeDiagnostics: () => {},
    turnReasoningSegments: [],
    turnToolResults: [],
    userMessage: 'Continue.',
    continuityRuntime: { persistTurnContinuity: () => {} },
    mode: 'chat',
    loop: {},
    prepareOpenAIBackgroundTurn: async () => ({
      eligible: true,
      modelId: 'gpt-5.2',
      messages: [{ role: 'user', content: 'Continue.' }],
      openaiOptions: { store: true },
    }),
    createOpenAIBackgroundJob: async ({ onCompleted }) => {
      await onCompleted({
        job: { id: 'oaibg-usage-1', promptPreview: 'Continue.' },
        payload: {
          text: 'Background answer.',
          reasoning: '',
          usage: getProviderUsageFixture('openai')?.expected,
          stopReason: 'stop',
          providerResponseMeta: {
            authMethod: 'api_key',
            transportMode: 'responses_stream',
            responseId: 'resp_bg_usage_done_1',
            conversationId: 'conv_bg_usage_done_1',
            background: true,
            status: 'completed',
          },
        },
      })
      return {
        job: { id: 'oaibg-usage-1', promptPreview: 'Continue.' },
        providerResponseMeta: {
          responseId: 'resp_bg_usage_queue_1',
          conversationId: 'conv_bg_usage_queue_1',
          background: true,
          status: 'queued',
        },
      }
    },
    finalizeOpenAIBackgroundJob: () => {},
    buildChatUsagePayload,
    emitUsageEvent: ({ usagePayload }) => { emittedUsagePayload = usagePayload },
    emitReasoningDone: () => {},
    asTokenCount: (value) => Number(value || 0) || 0,
    touchProjectUsageByThread: () => {},
    runPostTurnTasks: () => {},
  })

  assert.equal(queued, true)
  assert.ok(emittedUsagePayload)
  assert.equal(emittedUsagePayload.providerOccupancyTokens, 150)
  assert.equal(emittedUsagePayload.estimatedOccupancyTokens, 12000)
  assert.equal(emittedUsagePayload.effectiveOccupancyTokens, 150)
  assert.equal(emittedUsagePayload.contextOccupancyTokens, 150)
  assert.equal(emittedUsagePayload.rollingTotalTokens, 150)
  assert.equal(emittedUsagePayload.occupancySource, 'provider_last_request')
  assert.equal(emittedUsagePayload.occupancyConfidence, 'provider_verified')
})
