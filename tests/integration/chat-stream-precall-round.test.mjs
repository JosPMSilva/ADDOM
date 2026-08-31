import test from 'node:test'
import assert from 'node:assert/strict'

import { preparePreCallRoundContext } from '../../src/main/chat/chat-stream-precall-round.mjs'
import { COMPACTION_MODES } from '../../src/main/chat/continuity/compaction-mode-contract.mjs'
import {
  COMPACTION_HANDOFF_HEADER,
  COMPACTION_VICINITY_MARKER_HEADER,
} from '../../src/main/chat/continuity/compaction-handoff-prompt.mjs'
import {
  __resetOpenAICompactionClientFactoryForTests,
  __setOpenAICompactionClientFactoryForTests,
} from '../../src/main/chat/continuity/provider-native/openai-compaction-adapter.mjs'
import {
  __resetOpenAIAccountAuthServiceGetterForTests,
  __setOpenAIAccountAuthServiceGetterForTests,
} from '../../src/main/chat/chat-stream-precall-openai-command.mjs'
import { createBaseArgs } from './chat-stream-precall-round-test-helpers.mjs'

test.afterEach(() => {
  __resetOpenAICompactionClientFactoryForTests()
  __resetOpenAIAccountAuthServiceGetterForTests()
})

test('preparePreCallRoundContext forwards processing mode to the provider request context', async () => {
  const { args } = createBaseArgs({
    turnOptions: { processingMode: 'fast' },
  })

  const result = await preparePreCallRoundContext(args)

  assert.equal(result.currentProviderRequestContext?.processingMode, 'fast')
})

test('preparePreCallRoundContext does not force OpenAI response state storage when native compaction is unsupported and other continuity features are off', async () => {
  const { args, captured } = createBaseArgs({
    model: 'gpt-5.1',
  })

  const result = await preparePreCallRoundContext(args)

  assert.equal(result.shouldStoreOpenAIState, false)
  assert.equal(result.currentOpenAIRequestContext?.compactionStrategy, 'none')
  assert.equal(result.currentOpenAIRequestContext?.selectedCompactionMode, COMPACTION_MODES.LOCAL_SUMMARY)
  assert.deepEqual(result.currentOpenAIRequestContext?.candidateCompactionModes, [
    COMPACTION_MODES.LOCAL_SUMMARY,
  ])
  assert.equal(result.currentOpenAIRequestContext?.serverSideCompactionThresholdTokens, 0)
  assert.equal(captured.providerNativeContext?.compactionStrategy, 'none')
})

test('preparePreCallRoundContext uses adapter-owned OpenAI runtime support instead of re-deriving from model id', async () => {
  const { args, captured } = createBaseArgs({
    model: 'gpt-5.2',
    adapterProfile: {
      openaiRuntimeSupport: {
        supportsProviderChainCompaction: false,
        supportsProviderTruncation: false,
      },
    },
    continuityPolicy: {
      providerChainCompactionEnabled: false,
      providerTruncationEnabled: false,
      providerCompactionAllowlist: ['openai'],
    },
  })

  const result = await preparePreCallRoundContext(args)

  assert.equal(result.shouldStoreOpenAIState, false)
  assert.equal(result.currentOpenAIRequestContext?.compactionStrategy, 'none')
  assert.equal(result.currentOpenAIRequestContext?.serverSideCompactionThresholdTokens, 0)
  assert.equal(captured.providerNativeContext?.compactionStrategy, 'none')
})

test('preparePreCallRoundContext falls back to provider chain compaction when truncation is blocked but chain compaction stays enabled', async () => {
  const { args, captured } = createBaseArgs({
    providerRuntimeSettings: {
      openai: {
        usePreviousResponseId: false,
        useConversationState: false,
        useResponseCompaction: true,
        useServerSideCompaction: true,
        serverSideCompactionThresholdTokens: 180_000,
        enableBackgroundMode: false,
      },
    },
    continuityPolicy: {
      providerChainCompactionEnabled: true,
      providerTruncationEnabled: false,
      providerCompactionAllowlist: ['openai'],
    },
  })

  const result = await preparePreCallRoundContext(args)

  assert.equal(result.currentOpenAIRequestContext?.compactionStrategy, COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION)
  assert.equal(result.currentOpenAIRequestContext?.compaction?.requestedMode, COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION)
  assert.equal(result.currentOpenAIRequestContext?.compaction?.selectedMode, COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION)
  assert.equal(result.currentOpenAIRequestContext?.selectedCompactionMode, COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION)
  assert.equal(result.currentOpenAIRequestContext?.serverSideCompactionThresholdTokens, 0)
  assert.equal(captured.providerNativeContext?.compactionStrategy, COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION)
})

test('preparePreCallRoundContext applies explicit manual OpenAI compaction commands before the next turn', async () => {
  __setOpenAICompactionClientFactoryForTests(() => ({
    responses: {
      async compact() {
        return {
          id: 'resp_compacted_1',
          output: [{ type: 'compaction', id: 'cmp_1', encrypted_content: 'enc_1' }],
          usage: {
            input_tokens: 4,
            output_tokens: 2,
            total_tokens: 6,
          },
        }
      },
    },
  }))

  const { args, captured } = createBaseArgs({
    providerRuntimeSettings: {
      openai: {
        usePreviousResponseId: true,
        useConversationState: false,
        useResponseCompaction: false,
        useServerSideCompaction: false,
        serverSideCompactionThresholdTokens: 0,
        allowPromptCompactionCommands: true,
        enableBackgroundMode: false,
      },
    },
    continuityPolicy: {
      providerChainCompactionEnabled: true,
      providerTruncationEnabled: false,
      providerCompactionAllowlist: ['openai'],
    },
    turnOptions: {
      openai: {
        forceManualCompaction: true,
      },
    },
    resolveOpenAIThreadContinuation: () => ({
      previousResponseId: 'resp_prev_1',
      conversationId: '',
      invalidReason: '',
      manualCompactedWindow: [],
      resetChainFromCompactedWindow: false,
    }),
  })

  const result = await preparePreCallRoundContext(args)
  const handoffRows = (Array.isArray(args.history) ? args.history : [])
    .filter((row) => String(row?.content || '').includes(COMPACTION_HANDOFF_HEADER))
  const markerRows = (Array.isArray(args.history) ? args.history : [])
    .filter((row) => String(row?.content || '').includes(COMPACTION_VICINITY_MARKER_HEADER))
  const handoffText = String(handoffRows[0]?.content || '')

  assert.equal(result.latestOpenAICompactionId, 'cmp_1')
  assert.equal(result.currentOpenAIRequestContext?.previousResponseId, 'resp_compacted_1')
  assert.equal(result.currentOpenAIRequestContext?.selectedCompactionMode, COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION)
  assert.deepEqual(result.currentOpenAIRequestContext?.candidateCompactionModes, [
    COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
    COMPACTION_MODES.LOCAL_SUMMARY,
  ])
  assert.equal(captured.providerNativeContext?.previousResponseId, 'resp_compacted_1')
  assert.equal(captured.providerNativeContext?.compactionStrategy, COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION)
  assert.equal(markerRows.length, 0)
  assert.equal(handoffRows.length, 1)
  assert.match(handoffText, /type=provider_chain_compaction/)
  assert.match(handoffText, /phase=resumed_after/)
  assert.match(handoffText, /occurred=true/)
})

test('preparePreCallRoundContext resets the WebSocket chain to a compacted window after explicit manual OpenAI compaction', async () => {
  __setOpenAICompactionClientFactoryForTests(() => ({
    responses: {
      async compact() {
        return {
          id: 'resp_compacted_ws_1',
          output: [
            { type: 'message', id: 'msg_ws_1' },
            { type: 'compaction', id: 'cmp_ws_1', encrypted_content: 'enc_ws_1' },
          ],
          usage: {
            input_tokens: 4,
            output_tokens: 2,
            total_tokens: 6,
          },
        }
      },
    },
  }))

  const { args, captured } = createBaseArgs({
    providerRuntimeSettings: {
      openai: {
        transportMode: 'responses_websocket_experimental',
        usePreviousResponseId: true,
        useConversationState: false,
        useResponseCompaction: false,
        useServerSideCompaction: false,
        serverSideCompactionThresholdTokens: 0,
        allowPromptCompactionCommands: true,
        enableBackgroundMode: false,
      },
    },
    continuityPolicy: {
      providerChainCompactionEnabled: true,
      providerTruncationEnabled: false,
      providerCompactionAllowlist: ['openai'],
    },
    turnOptions: {
      openai: {
        forceManualCompaction: true,
      },
    },
    resolveOpenAIThreadContinuation: () => ({
      previousResponseId: 'resp_prev_ws_1',
      conversationId: '',
      invalidReason: '',
      manualCompactedWindow: [],
      resetChainFromCompactedWindow: false,
    }),
  })

  const result = await preparePreCallRoundContext(args)

  assert.equal(result.latestOpenAICompactionId, 'cmp_ws_1')
  assert.equal(result.currentOpenAIRequestContext?.previousResponseId, '')
  assert.equal(result.currentOpenAIRequestContext?.conversationId, '')
  assert.equal(result.currentOpenAIRequestContext?.resetChainFromCompactedWindow, true)
  assert.deepEqual(result.currentOpenAIRequestContext?.manualCompactedWindow, [
    { type: 'message', id: 'msg_ws_1' },
    { type: 'compaction', id: 'cmp_ws_1', encrypted_content: 'enc_ws_1' },
  ])
  assert.equal(captured.providerNativeContext?.previousResponseId, '')
  assert.equal(captured.providerNativeContext?.resetChainFromCompactedWindow, true)
  assert.equal(captured.providerNativeContext?.compactionStrategy, COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION)
})

test('preparePreCallRoundContext completes command-only compaction turns without entering the model loop', async () => {
  __setOpenAICompactionClientFactoryForTests(() => ({
    responses: {
      async compact() {
        return {
          id: 'resp_compacted_2',
          output: [{ type: 'compaction', id: 'cmp_2', encrypted_content: 'enc_2' }],
        }
      },
    },
  }))

  const { args, captured } = createBaseArgs({
    providerRuntimeSettings: {
      openai: {
        usePreviousResponseId: true,
        useConversationState: false,
        useResponseCompaction: false,
        useServerSideCompaction: false,
        serverSideCompactionThresholdTokens: 0,
        allowPromptCompactionCommands: true,
        enableBackgroundMode: false,
      },
    },
    continuityPolicy: {
      providerChainCompactionEnabled: true,
      providerTruncationEnabled: false,
      providerCompactionAllowlist: ['openai'],
    },
    turnOptions: {
      openai: {
        forceManualCompaction: true,
        commandOnly: true,
      },
    },
    resolveOpenAIThreadContinuation: () => ({
      previousResponseId: 'resp_prev_2',
      conversationId: '',
      invalidReason: '',
      manualCompactedWindow: [],
      resetChainFromCompactedWindow: false,
    }),
  })

  const result = await preparePreCallRoundContext(args)

  assert.equal(result.commandOnly, true)
  assert.match(String(result.commandOnlyAssistantText || ''), /compaction applied/i)
  assert.equal(captured.providerNativeContext, null)
  assert.equal(result.currentOpenAIRequestContext?.previousResponseId, 'resp_compacted_2')
})

test('preparePreCallRoundContext routes account-auth manual compaction through Codex thread compaction', async () => {
  const notifications = []
  __setOpenAIAccountAuthServiceGetterForTests(() => ({
    getBridge() {
      return {
        on(eventName, handler) {
          notifications.push({ eventName, handler })
        },
        off(eventName, handler) {
          const index = notifications.findIndex((entry) => entry.eventName === eventName && entry.handler === handler)
          if (index >= 0) notifications.splice(index, 1)
        },
        async startThreadCompaction(threadId = '') {
          queueMicrotask(() => {
            for (const entry of notifications.filter((row) => row.eventName === 'notification')) {
              entry.handler({
                method: 'item/completed',
                params: {
                  threadId,
                  item: {
                    id: 'cmp_account_1',
                    type: 'contextCompaction',
                    status: 'completed',
                  },
                },
              })
              entry.handler({
                method: 'turn/completed',
                params: {
                  threadId,
                  turn: {
                    id: 'turn_account_compaction',
                    status: 'completed',
                    error: null,
                  },
                },
              })
            }
          })
          return {}
        },
      }
    },
  }))

  const { args, captured } = createBaseArgs({
    apiKey: '',
    providerRuntimeSettings: {
      openai: {
        usePreviousResponseId: false,
        useConversationState: false,
        useResponseCompaction: false,
        useServerSideCompaction: false,
        allowPromptCompactionCommands: true,
        enableBackgroundMode: false,
      },
    },
    turnOptions: {
      openai: {
        forceManualCompaction: true,
      },
    },
    openAIExecutionAuthContext: {
      authMethod: 'account',
      sessionStatus: 'connected',
    },
    resolveOpenAIThreadContinuation: () => ({
      state: {
        metadata: {
          accountBridgeThreadId: 'thr_account_manual_1',
          accountBridgeProjectFolder: 'C:/Users/example/Desktop/test/P21',
        },
      },
      previousResponseId: '',
      conversationId: '',
      invalidReason: '',
      manualCompactedWindow: [],
      resetChainFromCompactedWindow: false,
    }),
  })

  const result = await preparePreCallRoundContext(args)
  const handoffRows = (Array.isArray(args.history) ? args.history : [])
    .filter((row) => String(row?.content || '').includes(COMPACTION_HANDOFF_HEADER))
  const handoffText = String(handoffRows[0]?.content || '')

  assert.equal(result.currentOpenAIRequestContext?.selectedCompactionMode, COMPACTION_MODES.CODEX_THREAD_COMPACTION)
  assert.deepEqual(result.currentOpenAIRequestContext?.candidateCompactionModes, [
    COMPACTION_MODES.CODEX_THREAD_COMPACTION,
    COMPACTION_MODES.LOCAL_SUMMARY,
  ])
  assert.equal(result.currentOpenAIRequestContext?.compactionEventType, 'codex_thread_compaction')
  assert.equal(result.currentOpenAIRequestContext?.compactionEventPhase, 'resumed_after')
  assert.equal(result.currentOpenAIRequestContext?.compactionEventOccurred, true)
  assert.equal(result.currentOpenAIRequestContext?.previousResponseId, '')
  assert.equal(captured.providerNativeContext?.compactionStrategy, COMPACTION_MODES.CODEX_THREAD_COMPACTION)
  assert.equal(handoffRows.length, 1)
  assert.match(handoffText, /type=codex_thread_compaction/)
  assert.match(handoffText, /phase=resumed_after/)
})

test('preparePreCallRoundContext blocks manual compaction commands when chain compaction is disabled in policy', async () => {
  const { args, captured } = createBaseArgs({
    continuityPolicy: {
      providerChainCompactionEnabled: false,
      providerTruncationEnabled: true,
      providerCompactionAllowlist: ['openai'],
    },
    providerRuntimeSettings: {
      openai: {
        usePreviousResponseId: true,
        useConversationState: false,
        useResponseCompaction: false,
        useServerSideCompaction: false,
        serverSideCompactionThresholdTokens: 0,
        allowPromptCompactionCommands: true,
        enableBackgroundMode: false,
      },
    },
    turnOptions: {
      openai: {
        forceManualCompaction: true,
        commandOnly: true,
      },
    },
    resolveOpenAIThreadContinuation: () => ({
      previousResponseId: 'resp_prev_policy_blocked',
      conversationId: '',
      invalidReason: '',
      manualCompactedWindow: [],
      resetChainFromCompactedWindow: false,
    }),
  })

  const result = await preparePreCallRoundContext(args)

  assert.equal(result.commandOnly, true)
  assert.match(String(result.commandOnlyAssistantText || ''), /provider chain compaction is disabled/i)
  assert.equal(result.currentOpenAIRequestContext?.selectedCompactionMode, COMPACTION_MODES.NONE)
  assert.equal(result.currentOpenAIRequestContext?.compactionFailureReason, 'provider_chain_compaction_disabled')
  assert.equal(result.currentOpenAIRequestContext?.fallbackReason, 'command_only_turn_stopped')
  assert.equal(captured.providerNativeContext, null)
  const failedEvent = captured.sentEvents.find((event) => event.channel === 'chat:openai-compaction-event')
  assert.equal(failedEvent?.payload?.status, 'failed')
  assert.equal(failedEvent?.payload?.reason, 'provider_chain_compaction_disabled')
  assert.equal(failedEvent?.payload?.fallbackCompactionMode, COMPACTION_MODES.NONE)
})

test('preparePreCallRoundContext emits one automatic fallback compaction event when provider chain compaction degrades to local summary', async () => {
  const { args, captured } = createBaseArgs({
    providerRuntimeSettings: {
      openai: {
        usePreviousResponseId: false,
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
    continuityRuntime: {
      async applyBeforeModelCall(payload = {}) {
        captured.providerNativeContext = payload.providerNativeContext || null
        const providerNativeMeta = await payload.providerNativeContext.runProviderNativeCompaction({
          history: payload.history,
          historyTokenEstimate: 1_200,
          packetTokens: 100,
          promptCacheKey: 'auto-fallback',
        })
        return {
          history: payload.history,
          compaction: null,
          packetPayload: {
            packetTokens: 1800,
            sourceRefCount: 3,
            providerNativeMeta,
          },
        }
      },
    },
    resolveOpenAIThreadContinuation: () => ({
      previousResponseId: 'resp_prev_fallback_1',
      conversationId: '',
      invalidReason: '',
      manualCompactedWindow: [],
      resetChainFromCompactedWindow: false,
    }),
  })

  const result = await preparePreCallRoundContext(args)
  const handoffRows = (Array.isArray(args.history) ? args.history : [])
    .filter((row) => String(row?.content || '').includes(COMPACTION_HANDOFF_HEADER))
  const markerRows = (Array.isArray(args.history) ? args.history : [])
    .filter((row) => String(row?.content || '').includes(COMPACTION_VICINITY_MARKER_HEADER))
  const markerText = String(markerRows[0]?.content || '')
  const handoffText = String(handoffRows[0]?.content || '')

  assert.equal(result.currentOpenAIRequestContext?.selectedCompactionMode, COMPACTION_MODES.LOCAL_SUMMARY)
  assert.equal(result.currentOpenAIRequestContext?.compactionFailureReason, 'below_threshold')
  assert.equal(result.currentOpenAIRequestContext?.fallbackCompactionMode, COMPACTION_MODES.LOCAL_SUMMARY)
  assert.equal(result.currentOpenAIRequestContext?.fallbackReason, 'provider_chain_compaction_unavailable')
  assert.equal(result.currentOpenAIRequestContext?.carryForwardSource, 'continuity_packet_only')
  assert.equal(result.currentOpenAIRequestContext?.canonicalHandoffUsed, false)
  const fallbackEvents = captured.sentEvents.filter((event) => event.channel === 'chat:openai-compaction-event')
  assert.equal(fallbackEvents.length, 3)
  assert.equal(fallbackEvents[0]?.payload?.status, 'requested')
  assert.equal(fallbackEvents[1]?.payload?.status, 'running')
  assert.equal(fallbackEvents[2]?.payload?.status, 'failed')
  assert.equal(fallbackEvents[0]?.payload?.activityId, fallbackEvents[1]?.payload?.activityId)
  assert.equal(fallbackEvents[1]?.payload?.activityId, fallbackEvents[2]?.payload?.activityId)
  assert.equal(fallbackEvents[0]?.payload?.mode, 'automatic')
  assert.equal(fallbackEvents[2]?.payload?.reason, 'below_threshold')
  assert.equal(handoffRows.length, 0)
  assert.equal(markerRows.length, 1)
  assert.match(markerText, /type=provider_chain_compaction/)
  assert.match(markerText, /phase=imminent/)
  assert.match(markerText, /occurred=false/)
  assert.equal(/occurred=true/.test(markerText), false)
  assert.equal(/phase=resumed_after/.test(markerText), false)
  assert.equal(/occurred=true/.test(handoffText), false)
})

test('preparePreCallRoundContext switches the same round onto the compacted response chain after automatic provider chain compaction', async () => {
  __setOpenAICompactionClientFactoryForTests(() => ({
    responses: {
      async compact() {
        return {
          id: 'resp_auto_chain_1',
          output: [{ type: 'compaction', id: 'cmp_auto_chain_1', encrypted_content: 'enc_auto_chain_1' }],
        }
      },
    },
  }))

  const { args } = createBaseArgs({
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
    continuityRuntime: {
      async applyBeforeModelCall(payload = {}) {
        const providerNativeMeta = await payload.providerNativeContext.runProviderNativeCompaction({
          history: payload.history,
          historyTokenEstimate: payload.contextOccupancyTokens,
          packetTokens: 2400,
          promptCacheKey: 'auto-chain',
        })
        return {
          history: payload.history,
          compaction: null,
          packetPayload: {
            packetTokens: 2400,
            sourceRefCount: 2,
            providerNativeMeta,
          },
        }
      },
    },
    resolveOpenAIThreadContinuation: () => ({
      previousResponseId: 'resp_prev_auto_chain_1',
      conversationId: '',
      invalidReason: '',
      manualCompactedWindow: [],
      resetChainFromCompactedWindow: false,
    }),
  })

  const result = await preparePreCallRoundContext(args)
  const handoffRows = (Array.isArray(args.history) ? args.history : [])
    .filter((row) => String(row?.content || '').includes(COMPACTION_HANDOFF_HEADER))
  const markerRows = (Array.isArray(args.history) ? args.history : [])
    .filter((row) => String(row?.content || '').includes(COMPACTION_VICINITY_MARKER_HEADER))
  const handoffText = String(handoffRows[0]?.content || '')
  const markerText = String(markerRows[0]?.content || '')

  assert.equal(result.latestOpenAICompactionId, 'cmp_auto_chain_1')
  assert.equal(result.currentOpenAIRequestContext?.previousResponseId, 'resp_auto_chain_1')
  assert.equal(result.currentOpenAIRequestContext?.resetChainFromCompactedWindow, false)
  assert.equal(result.currentOpenAIRequestContext?.selectedCompactionMode, COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION)
  assert.equal(result.currentOpenAIRequestContext?.carryForwardSource, 'both')
  assert.equal(result.currentOpenAIRequestContext?.canonicalHandoffUsed, true)
  assert.equal(handoffRows.length, 1)
  assert.equal(markerRows.length, 1)
  assert.match(handoffText, /type=provider_chain_compaction/)
  assert.match(handoffText, /phase=resumed_after/)
  assert.match(handoffText, /occurred=true/)
  assert.match(markerText, /type=provider_chain_compaction/)
  assert.match(markerText, /phase=resumed_after/)
  assert.match(markerText, /occurred=true/)
})

test('preparePreCallRoundContext switches WebSocket rounds onto the automatic compacted window after provider chain compaction', async () => {
  __setOpenAICompactionClientFactoryForTests(() => ({
    responses: {
      async compact() {
        return {
          id: 'resp_auto_ws_1',
          output: [
            { type: 'message', id: 'msg_auto_ws_1' },
            { type: 'compaction', id: 'cmp_auto_ws_1', encrypted_content: 'enc_auto_ws_1' },
          ],
        }
      },
    },
  }))

  const { args } = createBaseArgs({
    providerRuntimeSettings: {
      openai: {
        transportMode: 'responses_websocket_experimental',
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
    continuityRuntime: {
      async applyBeforeModelCall(payload = {}) {
        const providerNativeMeta = await payload.providerNativeContext.runProviderNativeCompaction({
          history: payload.history,
          historyTokenEstimate: payload.contextOccupancyTokens,
          packetTokens: 2400,
          promptCacheKey: 'auto-ws-chain',
        })
        return {
          history: payload.history,
          compaction: null,
          packetPayload: {
            packetTokens: 2400,
            sourceRefCount: 2,
            providerNativeMeta,
          },
        }
      },
    },
    resolveOpenAIThreadContinuation: () => ({
      previousResponseId: 'resp_prev_auto_ws_1',
      conversationId: '',
      invalidReason: '',
      manualCompactedWindow: [],
      resetChainFromCompactedWindow: false,
    }),
  })

  const result = await preparePreCallRoundContext(args)
  const handoffRows = (Array.isArray(args.history) ? args.history : [])
    .filter((row) => String(row?.content || '').includes(COMPACTION_HANDOFF_HEADER))
  const markerRows = (Array.isArray(args.history) ? args.history : [])
    .filter((row) => String(row?.content || '').includes(COMPACTION_VICINITY_MARKER_HEADER))
  const handoffText = String(handoffRows[0]?.content || '')
  const markerText = String(markerRows[0]?.content || '')

  assert.equal(result.latestOpenAICompactionId, 'cmp_auto_ws_1')
  assert.equal(result.currentOpenAIRequestContext?.previousResponseId, '')
  assert.equal(result.currentOpenAIRequestContext?.conversationId, '')
  assert.equal(result.currentOpenAIRequestContext?.resetChainFromCompactedWindow, true)
  assert.deepEqual(result.currentOpenAIRequestContext?.manualCompactedWindow, [
    { type: 'message', id: 'msg_auto_ws_1' },
    { type: 'compaction', id: 'cmp_auto_ws_1', encrypted_content: 'enc_auto_ws_1' },
  ])
  assert.equal(result.currentOpenAIRequestContext?.selectedCompactionMode, COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION)
  assert.equal(handoffRows.length, 1)
  assert.equal(markerRows.length, 1)
  assert.match(handoffText, /type=provider_chain_compaction/)
  assert.match(handoffText, /phase=resumed_after/)
  assert.match(handoffText, /occurred=true/)
  assert.match(markerText, /type=provider_chain_compaction/)
  assert.match(markerText, /phase=resumed_after/)
  assert.match(markerText, /occurred=true/)
})

test('preparePreCallRoundContext persists standalone WebSocket compaction windows for the next turn', async () => {
  __setOpenAICompactionClientFactoryForTests(() => ({
    responses: {
      async compact() {
        return {
          id: 'resp_compacted_ws_2',
          output: [
            { type: 'message', id: 'msg_ws_2' },
            { type: 'compaction', id: 'cmp_ws_2', encrypted_content: 'enc_ws_2' },
          ],
        }
      },
    },
  }))

  const { args, captured } = createBaseArgs({
    providerRuntimeSettings: {
      openai: {
        transportMode: 'responses_websocket_experimental',
        usePreviousResponseId: true,
        useConversationState: false,
        useResponseCompaction: false,
        useServerSideCompaction: false,
        serverSideCompactionThresholdTokens: 0,
        allowPromptCompactionCommands: true,
        enableBackgroundMode: false,
      },
    },
    continuityPolicy: {
      providerChainCompactionEnabled: true,
      providerTruncationEnabled: false,
      providerCompactionAllowlist: ['openai'],
    },
    turnOptions: {
      openai: {
        forceManualCompaction: true,
        commandOnly: true,
      },
    },
    resolveOpenAIThreadContinuation: () => ({
      previousResponseId: 'resp_prev_ws_2',
      conversationId: '',
      invalidReason: '',
      manualCompactedWindow: [],
      resetChainFromCompactedWindow: false,
    }),
  })

  const result = await preparePreCallRoundContext(args)

  assert.equal(result.commandOnly, true)
  assert.equal(captured.providerNativeContext, null)
  assert.equal(captured.persistedThreadState?.threadId, 'thread-precall')
  assert.equal(captured.persistedThreadState?.lastResponseId, '')
  assert.equal(captured.persistedThreadState?.lastCompactionId, 'cmp_ws_2')
  assert.deepEqual(captured.persistedThreadState?.metadata, {
    pendingManualCompactedWindow: [
      { type: 'message', id: 'msg_ws_2' },
      { type: 'compaction', id: 'cmp_ws_2', encrypted_content: 'enc_ws_2' },
    ],
    resetChainFromCompaction: true,
  })
})

test('preparePreCallRoundContext injects provider-chain imminent awareness marker before continuity runtime execution', async () => {
  const { args } = createBaseArgs({
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
    continuityRuntime: {
      async applyBeforeModelCall(payload = {}) {
        const markerCount = (Array.isArray(payload.history) ? payload.history : [])
          .filter((row) => String(row?.content || '').includes(COMPACTION_VICINITY_MARKER_HEADER))
          .length
        return {
          history: payload.history,
          compaction: null,
          markerCount,
        }
      },
    },
    modelContext: { limitTokens: 200_000 },
  })

  const result = await preparePreCallRoundContext(args)
  const markerCount = (Array.isArray(args.history) ? args.history : [])
    .filter((row) => String(row?.content || '').includes(COMPACTION_VICINITY_MARKER_HEADER))
    .length
  const markerRow = (Array.isArray(args.history) ? args.history : [])
    .find((row) => String(row?.content || '').includes(COMPACTION_VICINITY_MARKER_HEADER))
  const markerText = String(markerRow?.content || '')

  assert.equal(result.currentOpenAIRequestContext?.compactionStrategy, COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION)
  assert.equal(markerCount, 1)
  assert.match(markerText, /type=provider_chain_compaction/)
  assert.match(markerText, /phase=imminent/)
})

test('preparePreCallRoundContext emits requested automatic account compaction before continuity runtime and blocks until it resolves', async () => {
  const notifications = []
  let continuityRuntimeStarted = false

  __setOpenAIAccountAuthServiceGetterForTests(() => ({
    getBridge() {
      return {
        on(eventName, handler) {
          notifications.push({ eventName, handler })
        },
        off(eventName, handler) {
          const index = notifications.findIndex((entry) => entry.eventName === eventName && entry.handler === handler)
          if (index >= 0) notifications.splice(index, 1)
        },
        async startThreadCompaction() {
          return {}
        },
      }
    },
  }))

  const { args, captured } = createBaseArgs({
    apiKey: '',
    model: 'gpt-5.4',
    providerRuntimeSettings: {
      openai: {
        usePreviousResponseId: false,
        useConversationState: false,
        useResponseCompaction: false,
        useServerSideCompaction: false,
        codexAutoThreadCompactionEnabled: true,
        codexAutoThreadCompactionTokenLimit: 0,
        providerTruncationSoftTriggerPercent: 50,
        enableBackgroundMode: false,
      },
    },
    openAIExecutionAuthContext: {
      authMethod: 'account',
      sessionStatus: 'connected',
    },
    resolveOpenAIThreadContinuation: () => ({
      state: {
        metadata: {
          accountBridgeThreadId: 'thr_account_auto_1',
          accountBridgeProjectFolder: 'C:/Users/example/Documents/ADDOM',
          accountContextCompactionGeneration: 2,
        },
      },
      previousResponseId: '',
      conversationId: '',
      invalidReason: '',
      manualCompactedWindow: [],
      resetChainFromCompactedWindow: false,
    }),
    continuityRuntime: {
      async applyBeforeModelCall(payload = {}) {
        continuityRuntimeStarted = true
        captured.providerNativeContext = payload.providerNativeContext || null
        return {
          history: payload.history,
          compaction: null,
        }
      },
    },
    buildPreCallContinuityInput: () => ({
      preCallOccupancyEstimateTokens: 120_000,
      continuityInput: {
        history: args?.history || [],
        round: 1,
        rollingTotalTokens: 0,
        contextOccupancyTokens: 120_000,
        userMessage: 'Continue.',
      },
    }),
  })

  const pending = preparePreCallRoundContext(args)
  await Promise.resolve()

  const requestedEvent = captured.sentEvents.find((event) => (
    event.channel === 'chat:openai-compaction-event'
    && event.payload?.status === 'requested'
  ))
  const runningEvent = captured.sentEvents.find((event) => (
    event.channel === 'chat:openai-compaction-event'
    && event.payload?.status === 'running'
  ))
  assert.ok(requestedEvent)
  assert.ok(runningEvent)
  assert.equal(requestedEvent.payload.mode, 'automatic')
  assert.equal(requestedEvent.payload.compactionEventType, 'codex_thread_compaction')
  assert.equal(runningEvent.payload.compactionEventPhase, 'running')
  assert.equal(continuityRuntimeStarted, false)

  for (const entry of notifications.filter((row) => row.eventName === 'notification')) {
    entry.handler({
      method: 'item/completed',
      params: {
        threadId: 'thr_account_auto_1',
        item: {
          id: 'cmp_account_auto_1',
          type: 'contextCompaction',
          status: 'completed',
        },
      },
    })
    entry.handler({
      method: 'turn/completed',
      params: {
        threadId: 'thr_account_auto_1',
        turn: {
          id: 'turn_account_auto_compaction',
          status: 'completed',
          error: null,
        },
      },
    })
  }

  const result = await pending
  const appliedEvent = captured.sentEvents.find((event) => (
    event.channel === 'chat:openai-compaction-event'
    && event.payload?.status === 'applied'
  ))

  assert.ok(appliedEvent)
  assert.equal(appliedEvent.payload.activityId, requestedEvent.payload.activityId)
  assert.equal(continuityRuntimeStarted, true)
  assert.equal(result.currentOpenAIRequestContext?.selectedCompactionMode, COMPACTION_MODES.CODEX_THREAD_COMPACTION)
  assert.equal(result.currentOpenAIRequestContext?.compactionEventType, 'codex_thread_compaction')
  assert.equal(result.currentOpenAIRequestContext?.compactionEventPhase, 'resumed_after')
  assert.equal(result.currentOpenAIRequestContext?.compactionEventOccurred, true)
  assert.equal(result.currentOpenAIRequestContext?.accountContextCompactionGeneration, 3)
  assert.equal(args.errorDiagnostics.contextManagementStrategy, COMPACTION_MODES.CODEX_THREAD_COMPACTION)
  assert.equal(args.errorDiagnostics.contextManagementThresholdTokens, 100_000)
})
