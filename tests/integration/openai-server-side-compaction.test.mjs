import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  __testAiProviderInternals,
  prepareOpenAIBackgroundTurn,
} from '../../src/main/api-clients/ai-provider.mjs'
import {
  __resetOpenAIBackgroundClientFactoryForTests,
  __resetOpenAIBackgroundTimingForTests,
  __setOpenAIBackgroundClientFactoryForTests,
  __setOpenAIBackgroundTimingForTests,
  createOpenAIBackgroundResponse,
} from '../../src/main/api-clients/openai-background-runtime.mjs'
import { resolveOpenAIModelRuntimeSupport } from '../../src/main/api-clients/openai-model-runtime-support.mjs'
import {
  OPENAI_SERVER_SIDE_COMPACTION_METADATA_KEY,
  applyOpenAIServerSideCompactionTransportShim,
  buildOpenAIServerSideCompactionResponseMeta,
  createOpenAIServerSideCompactionStreamCollector,
  extractOpenAIServerSideCompactionThresholdFromRequestBody,
  resolveOpenAICompactionStrategy,
} from '../../src/main/api-clients/openai-server-side-compaction.mjs'
import { COMPACTION_MODES } from '../../src/main/chat/continuity/compaction-mode-contract.mjs'
import { normalizeOpenAIProviderRuntimeSettings } from '../../src/main/api-clients/openai-runtime-types.mjs'

test.afterEach(() => {
  __resetOpenAIBackgroundClientFactoryForTests()
  __resetOpenAIBackgroundTimingForTests()
})

test('openai runtime settings normalize server-side compaction defaults and thresholds safely', () => {
  const defaults = normalizeOpenAIProviderRuntimeSettings({})
  assert.equal(defaults.transportMode, 'responses_auto')
  assert.equal(defaults.websocketFallbackToStream, true)
  assert.equal(defaults.websocketWarmupEnabled, false)
  assert.equal(defaults.useServerSideCompaction, false)
  assert.equal(defaults.serverSideCompactionThresholdTokens, 0)
  assert.equal(defaults.providerTruncationSoftTriggerPercent, 85)
  assert.equal(defaults.serverSideCompactionBackgroundParity, true)
  assert.equal(defaults.allowPromptCompactionCommands, false)
  assert.equal(defaults.allowPromptCompactionThresholdOverride, false)

  const normalized = normalizeOpenAIProviderRuntimeSettings({
    transportMode: 'responses_websocket_experimental',
    websocketFallbackToStream: false,
    websocketWarmupEnabled: true,
    useServerSideCompaction: true,
    serverSideCompactionThresholdTokens: 10,
    providerTruncationSoftTriggerPercent: 50,
    serverSideCompactionBackgroundParity: false,
    allowPromptCompactionCommands: false,
    allowPromptCompactionThresholdOverride: false,
  })
  assert.equal(normalized.transportMode, 'responses_websocket_experimental')
  assert.equal(normalized.websocketFallbackToStream, false)
  assert.equal(normalized.websocketWarmupEnabled, true)
  assert.equal(normalized.useServerSideCompaction, true)
  assert.equal(normalized.serverSideCompactionThresholdTokens, 4_096)
  assert.equal(normalized.providerTruncationSoftTriggerPercent, 50)
  assert.equal(normalized.serverSideCompactionBackgroundParity, false)
  assert.equal(normalized.allowPromptCompactionCommands, false)
  assert.equal(normalized.allowPromptCompactionThresholdOverride, false)
})

test('openai model runtime support keeps retained models on chain compaction only', () => {
  const gpt54 = resolveOpenAIModelRuntimeSupport('gpt-5.4')
  assert.equal(gpt54.supportsProviderChainCompaction, true)
  assert.equal(gpt54.supportsProviderTruncation, false)
  assert.equal(gpt54.preferredCompactionMode, COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION)
  assert.equal(gpt54.requiresPreviousResponseId, true)

  const codex = resolveOpenAIModelRuntimeSupport('gpt-5.3-codex')
  assert.equal(codex.supportsProviderChainCompaction, false)
  assert.equal(codex.supportsProviderTruncation, false)
  assert.equal(codex.preferredCompactionMode, COMPACTION_MODES.NONE)

  assert.equal(resolveOpenAIModelRuntimeSupport('gpt-5.4').prefersResponsesWebSocket, true)
  assert.equal(resolveOpenAIModelRuntimeSupport('gpt-5.3-codex').prefersResponsesWebSocket, true)
  assert.equal(resolveOpenAIModelRuntimeSupport('gpt-5.2').prefersResponsesWebSocket, false)
  assert.equal(resolveOpenAIModelRuntimeSupport('gpt-5-mini').prefersResponsesWebSocket, false)
  assert.equal(resolveOpenAIModelRuntimeSupport('gpt-5.3-codex-spark').prefersResponsesWebSocket, false)
  assert.equal(resolveOpenAIModelRuntimeSupport('gpt-5-mini').prefersResponsesWebSocket, false)
  assert.equal(resolveOpenAIModelRuntimeSupport('gpt-5-nano').prefersResponsesWebSocket, false)
  assert.equal(resolveOpenAIModelRuntimeSupport('gpt-4.1-mini').prefersResponsesWebSocket, false)
})

test('openai compaction strategy prefers provider truncation over provider chain compaction when both are supported', () => {
  const strategy = resolveOpenAICompactionStrategy({
    runtimeSettings: {
      useServerSideCompaction: true,
      serverSideCompactionThresholdTokens: 180_000,
      useResponseCompaction: true,
    },
    modelSupport: { supportsProviderChainCompaction: true, supportsProviderTruncation: true },
  })

  assert.equal(strategy.mode, COMPACTION_MODES.PROVIDER_TRUNCATION)
  assert.equal(strategy.thresholdTokens, 180_000)
})

test('openai compaction strategy derives the truncation trigger from the model window when explicit tokens are unset', () => {
  const strategy = resolveOpenAICompactionStrategy({
    runtimeSettings: {
      useServerSideCompaction: true,
      serverSideCompactionThresholdTokens: 0,
      providerTruncationSoftTriggerPercent: 50,
      useResponseCompaction: true,
    },
    modelSupport: { supportsProviderChainCompaction: true, supportsProviderTruncation: true },
    modelContextLimitTokens: 200_000,
  })

  assert.equal(strategy.mode, COMPACTION_MODES.PROVIDER_TRUNCATION)
  assert.equal(strategy.thresholdTokens, 100_000)
  assert.equal(strategy.serverSidePolicy?.budget?.softTriggerPercent, 50)
  assert.equal(strategy.serverSidePolicy?.budget?.criticalTaskTriggerFloorPercent, 65)
  assert.equal(strategy.serverSidePolicy?.budget?.criticalTaskTriggerCeilingPercent, 80)
})

test('openai compaction strategy lifts the derived truncation trigger when a critical task is active', () => {
  const strategy = resolveOpenAICompactionStrategy({
    runtimeSettings: {
      useServerSideCompaction: true,
      serverSideCompactionThresholdTokens: 0,
      providerTruncationSoftTriggerPercent: 50,
      useResponseCompaction: true,
    },
    modelSupport: { supportsProviderChainCompaction: true, supportsProviderTruncation: true },
    modelContextLimitTokens: 200_000,
    criticalTaskState: {
      active: true,
      allowanceLevel: 'ceiling',
      reasons: ['file_write_in_progress'],
    },
  })

  assert.equal(strategy.mode, COMPACTION_MODES.PROVIDER_TRUNCATION)
  assert.equal(strategy.thresholdTokens, 160_000)
})

test('openai compaction strategy falls back to provider chain compaction when provider truncation is unavailable', () => {
  const strategy = resolveOpenAICompactionStrategy({
    runtimeSettings: {
      useServerSideCompaction: true,
      serverSideCompactionThresholdTokens: 180_000,
      useResponseCompaction: true,
    },
    modelSupport: resolveOpenAIModelRuntimeSupport('gpt-5.4'),
  })

  assert.equal(strategy.mode, COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION)
  assert.equal(strategy.thresholdTokens, 0)
})

test('openai provider options omit transport-truncation markers for retained models', () => {
  const supported = __testAiProviderInternals.buildProviderOptions('openai', 'gpt-5.4', {
    useServerSideCompaction: true,
    serverSideCompactionThresholdTokens: 180_000,
  }, {
    projectId: 'project-compaction',
    threadId: 'thread-compaction',
    toolNames: [],
    messages: [{ role: 'system', content: 'You are ADDOM.' }],
    openai: {
      store: true,
    },
  })
  assert.equal(
    Object.prototype.hasOwnProperty.call(supported?.openai?.metadata || {}, OPENAI_SERVER_SIDE_COMPACTION_METADATA_KEY),
    false,
  )
})

test('openai provider options do not derive obsolete truncation markers for retained models', () => {
  const supported = __testAiProviderInternals.buildProviderOptions('openai', 'gpt-5.4', {
    useServerSideCompaction: true,
    serverSideCompactionThresholdTokens: 0,
    providerTruncationSoftTriggerPercent: 50,
  }, {
    projectId: 'project-compaction-derived',
    threadId: 'thread-compaction-derived',
    toolNames: [],
    messages: [{ role: 'system', content: 'You are ADDOM.' }],
    openai: {
      store: true,
    },
  })

  assert.equal(Object.prototype.hasOwnProperty.call(
    supported?.openai?.metadata || {},
    OPENAI_SERVER_SIDE_COMPACTION_METADATA_KEY,
  ), false)
})

test('openai provider options reject obsolete per-turn truncation overrides for retained models', () => {
  const supported = __testAiProviderInternals.buildProviderOptions('openai', 'gpt-5.4', {
    useServerSideCompaction: false,
    serverSideCompactionThresholdTokens: 0,
    allowPromptCompactionThresholdOverride: true,
  }, {
    projectId: 'project-compaction-override',
    threadId: 'thread-compaction-override',
    toolNames: [],
    messages: [{ role: 'user', content: 'Continue' }],
    openai: {
      store: true,
      forceServerSideCompaction: true,
      serverSideCompactionThresholdTokens: 150_000,
    },
  })

  assert.equal(Object.prototype.hasOwnProperty.call(
    supported?.openai?.metadata || {},
    OPENAI_SERVER_SIDE_COMPACTION_METADATA_KEY,
  ), false)
})

test('openai provider options ignore per-turn compaction threshold overrides by default', () => {
  const supported = __testAiProviderInternals.buildProviderOptions('openai', 'gpt-5.4', {
    useServerSideCompaction: false,
    serverSideCompactionThresholdTokens: 0,
  }, {
    projectId: 'project-compaction-override-disabled',
    threadId: 'thread-compaction-override-disabled',
    toolNames: [],
    messages: [{ role: 'user', content: 'Continue' }],
    openai: {
      store: true,
      forceServerSideCompaction: true,
      serverSideCompactionThresholdTokens: 150_000,
    },
  })

  assert.equal(
    Object.prototype.hasOwnProperty.call(supported?.openai?.metadata || {}, OPENAI_SERVER_SIDE_COMPACTION_METADATA_KEY),
    false,
  )
})

test('openai provider options ignore shared truncation overrides for retained models', () => {
  const supported = __testAiProviderInternals.buildProviderOptions('openai', 'gpt-5.4', {
    useServerSideCompaction: false,
    serverSideCompactionThresholdTokens: 0,
    allowPromptCompactionThresholdOverride: true,
  }, {
    projectId: 'project-compaction-contract',
    threadId: 'thread-compaction-contract',
    toolNames: [],
    messages: [{ role: 'user', content: 'Continue' }],
    openai: {
      store: true,
      compaction: {
        requestedMode: COMPACTION_MODES.PROVIDER_TRUNCATION,
        selectedMode: COMPACTION_MODES.PROVIDER_TRUNCATION,
        forceProviderTruncation: true,
        providerTruncationThresholdTokens: 150_000,
      },
    },
  })

  assert.equal(Object.prototype.hasOwnProperty.call(
    supported?.openai?.metadata || {},
    OPENAI_SERVER_SIDE_COMPACTION_METADATA_KEY,
  ), false)
})

test('openai server-side compaction transport shim converts metadata marker into context_management', () => {
  const transformed = applyOpenAIServerSideCompactionTransportShim({
    model: 'synthetic-truncation-model',
    metadata: {
      [OPENAI_SERVER_SIDE_COMPACTION_METADATA_KEY]: '180000',
      request_scope: 'thread',
    },
  })

  assert.deepEqual(transformed.context_management, [{
    type: 'compaction',
    compact_threshold: 180_000,
  }])
  assert.equal(
    Object.prototype.hasOwnProperty.call(transformed.metadata || {}, OPENAI_SERVER_SIDE_COMPACTION_METADATA_KEY),
    false,
  )
  assert.equal(transformed.metadata?.request_scope, 'thread')
  assert.equal(extractOpenAIServerSideCompactionThresholdFromRequestBody(transformed), 180_000)
})

test('openai server-side compaction stream collector captures automatic compaction items from raw response events', () => {
  const collector = createOpenAIServerSideCompactionStreamCollector()

  assert.equal(collector.handleRawChunk({
    type: 'response.output_item.added',
    item: {
      type: 'compaction',
      id: 'cmp_auto_1',
      encrypted_content: 'enc_auto_1',
    },
  }), true)
  assert.equal(collector.handleRawChunk({
    type: 'response.output_item.done',
    item: {
      type: 'compaction',
      id: 'cmp_auto_1',
      encrypted_content: 'enc_auto_1',
    },
  }), true)
  assert.equal(collector.handleRawChunk({
    type: 'response.output_item.added',
    item: {
      type: 'message',
      id: 'msg_1',
    },
  }), false)

  assert.deepEqual(collector.buildMeta(), {
    autoCompactionApplied: true,
    autoCompactionIds: ['cmp_auto_1'],
  })
})

test('openai server-side compaction collector stays transport-agnostic for Responses WebSocket event names', () => {
  const collector = createOpenAIServerSideCompactionStreamCollector()

  collector.handleRawChunk({
    type: 'response.output_item.added',
    response_id: 'resp_ws_1',
    output_index: 0,
    item: {
      type: 'compaction',
      id: 'cmp_ws_1',
      encrypted_content: 'enc_ws_1',
    },
  })

  assert.deepEqual(collector.buildMeta(), {
    autoCompactionApplied: true,
    autoCompactionIds: ['cmp_ws_1'],
  })
})

test('openai server-side compaction response metadata resolves ids from raw stream and response output without duplication', () => {
  const meta = buildOpenAIServerSideCompactionResponseMeta({
    rawStreamMeta: {
      autoCompactionApplied: true,
      autoCompactionIds: ['cmp_auto_1'],
    },
    response: {
      output: [
        { type: 'compaction', id: 'cmp_auto_1', encrypted_content: 'enc_auto_1' },
        { type: 'compaction', id: 'cmp_auto_2', encrypted_content: 'enc_auto_2' },
        { type: 'message', id: 'msg_1' },
      ],
    },
  })

  assert.deepEqual(meta, {
    autoCompactionApplied: true,
    autoCompactionIds: ['cmp_auto_1', 'cmp_auto_2'],
  })
})

test('openai background responses omit unsupported transport truncation for retained models', async () => {
  const seenBodies = []
  __setOpenAIBackgroundTimingForTests({ pollIntervalMs: 0, maxWaitMs: 1_000 })
  __setOpenAIBackgroundClientFactoryForTests(() => ({
    responses: {
      create: async (body) => {
        seenBodies.push(body)
        return {
          id: 'resp_bg_compact_1',
          status: 'completed',
          model: 'gpt-5.4',
          background: true,
          output_text: 'ok',
          output: [],
          usage: {
            input_tokens: 4,
            output_tokens: 2,
            total_tokens: 6,
          },
        }
      },
      retrieve: async () => {
        throw new Error('retrieve should not be called when create already completed')
      },
      cancel: async () => {},
    },
  }))

  const providerOptions = __testAiProviderInternals.buildProviderOptions('openai', 'gpt-5.4', {
    useServerSideCompaction: true,
    serverSideCompactionThresholdTokens: 180_000,
  }, {
    projectId: 'project-bg-compaction',
    threadId: 'thread-bg-compaction',
    toolNames: [],
    messages: [{ role: 'user', content: 'Hello' }],
    openai: {
      store: true,
    },
  })

  await createOpenAIBackgroundResponse({
    apiKey: 'sk-test',
    modelId: 'gpt-5.4',
    messages: [{ role: 'user', content: 'Hello' }],
    runtimeSettings: {
      enableBackgroundMode: true,
      useServerSideCompaction: true,
      serverSideCompactionThresholdTokens: 180_000,
    },
    openaiOptions: providerOptions.openai,
  })

  assert.equal(seenBodies.length, 1)
  assert.equal(seenBodies[0].context_management, undefined)
  assert.equal(
    Object.prototype.hasOwnProperty.call(seenBodies[0].metadata || {}, OPENAI_SERVER_SIDE_COMPACTION_METADATA_KEY),
    false,
  )
})

test('openai background turn prep strips the compaction marker when background parity is disabled', async () => {
  const payload = await prepareOpenAIBackgroundTurn('openai', 'sk-test', [
    { role: 'user', content: 'Continue the task.' },
  ], {
    model: 'gpt-5.4',
    providerRuntimeSettings: {
      enableBackgroundMode: true,
      useServerSideCompaction: true,
      serverSideCompactionThresholdTokens: 180_000,
      serverSideCompactionBackgroundParity: false,
    },
    requestContext: {
      projectId: 'project-bg-parity',
      threadId: 'thread-bg-parity',
      openai: {
        store: true,
      },
    },
  })

  assert.equal(payload.eligible, true)
  assert.equal(
    Object.prototype.hasOwnProperty.call(payload.openaiOptions?.metadata || {}, OPENAI_SERVER_SIDE_COMPACTION_METADATA_KEY),
    false,
  )
})

test('openai background turn prep uses strict capability probing when tools are present', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/main/api-clients/ai-provider-openai-runtime.mjs'),
    'utf8',
  )

  assert.match(source, /failOnProbeError:\s*true/)
  assert.doesNotMatch(source, /failOnProbeError:\s*false/)
})
