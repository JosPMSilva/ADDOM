import test from 'node:test'
import assert from 'node:assert/strict'

import { applyContinuityCompaction } from '../../src/main/chat/continuity/compaction-engine.mjs'
import {
  COMPACTION_HANDOFF_HEADER,
} from '../../src/main/chat/continuity/compaction-handoff-prompt.mjs'
import { preparePreCallRoundContext } from '../../src/main/chat/chat-stream-precall-round.mjs'
import { resolveProviderModelAdapter } from '../../src/main/api-clients/provider-model-adapters.mjs'

test('regression: local compaction always injects explicit resumed-after handoff boundary awareness', async () => {
  const history = [
    { role: 'system', content: 'You are ADDOM.' },
  ]
  const filler = 'x'.repeat(9_000)
  for (let i = 0; i < 24; i += 1) {
    history.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `${i}: ${filler}` })
  }

  const result = await applyContinuityCompaction({
    history,
    modelLimit: 32_000,
    packetText: '[ADDOM Continuity Packet]\n## decisions\n- Keep boundary awareness explicit.',
    providerId: 'openai',
    turnId: 'turn_regression_local_1',
  })

  const handoffRow = (Array.isArray(result.history) ? result.history : [])
    .find((row) => String(row?.content || '').includes(COMPACTION_HANDOFF_HEADER))
  const handoffText = String(handoffRow?.content || '')

  assert.equal(result.compacted, true)
  assert.ok(handoffRow)
  assert.match(handoffText, /occurred=true/)
  assert.match(handoffText, /phase=resumed_after/)
})

test('regression: retained models ignore stale provider-truncation resume state', async () => {
  const history = [
    { role: 'system', content: 'You are ADDOM.' },
    { role: 'user', content: 'Continue.' },
  ]
  let continuityCallArgs = null
  const args = {
    history,
    round: 1,
    rollingUsage: {},
    userMessage: 'Continue.',
    errorDiagnostics: {},
    providerId: 'openai',
    model: 'gpt-5.4',
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4'),
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
    activeProjectId: 'project-regression',
    activeThreadId: 'thread-regression',
    activeTurnId: 'turn-regression',
    turnOptions: {},
    apiKey: 'sk-test',
    continuityRuntime: {
      async applyBeforeModelCall(payload = {}) {
        continuityCallArgs = payload
        return {
          history: payload.history,
          compaction: null,
        }
      },
    },
    modelContext: { limitTokens: 200_000 },
    loop: { abortController: new AbortController() },
    latestOpenAICompactionId: '',
    send: () => {},
    persistTimelineEvent: () => {},
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
    compactHistoryForContextWindow: async () => ({ compacted: false, history }),
    applyCompactionIfNeeded: () => {},
    estimateHistoryTokens: () => 12_000,
    resolveOpenAIThreadContinuation: () => ({
      previousResponseId: 'resp_prev_1',
      conversationId: 'conv_prev_1',
      pendingProviderTruncationResume: {
        responseId: 'resp_compacted_1',
        previousTurnId: 'turn_prev_1',
        compactionIds: ['cmp_prev_resume_1'],
        eventType: 'provider_truncation',
        eventPhase: 'resumed_after',
        eventOccurred: true,
      },
      invalidReason: '',
      manualCompactedWindow: [],
      resetChainFromCompactedWindow: false,
    }),
    pushUniqueRuntimeValue: () => {},
    upsertOpenAIThreadState: () => {},
  }

  const result = await preparePreCallRoundContext(args)
  const preparedHistory = Array.isArray(continuityCallArgs?.history) ? continuityCallArgs.history : []
  const handoffRows = preparedHistory.filter((row) => String(row?.content || '').includes(COMPACTION_HANDOFF_HEADER))

  assert.equal(result.currentOpenAIRequestContext?.compactionEventType, undefined)
  assert.equal(result.currentOpenAIRequestContext?.compactionEventOccurred, undefined)
  assert.equal(result.currentOpenAIRequestContext?.canonicalHandoffUsed, undefined)
  assert.equal(handoffRows.length, 0)
})
