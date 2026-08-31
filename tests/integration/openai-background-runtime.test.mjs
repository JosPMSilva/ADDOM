import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-background-runtime-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

import { createStreamWithTools } from '../../src/main/api-clients/ai-provider.mjs'
import { setSettingsPatch } from '../../src/main/settings.mjs'
import {
  __testOpenAIAccountInternals,
  getOpenAIAccountAuthService,
} from '../../src/main/openai-account/openai-account-auth-service.mjs'
import {
  __resetOpenAIBackgroundClientFactoryForTests,
  __resetOpenAIBackgroundTimingForTests,
  __setOpenAIBackgroundClientFactoryForTests,
  __setOpenAIBackgroundTimingForTests,
  createOpenAIBackgroundResponse,
  resolveOpenAIBackgroundModeEligibility,
} from '../../src/main/api-clients/openai-background-runtime.mjs'

class FakeAccountBridge extends EventEmitter {
  constructor({ threadId = 'thr_bg_account_1', turnId = 'turn_bg_account_1', onStartTurn = null } = {}) {
    super()
    this.threadId = threadId
    this.turnId = turnId
    this.onStartTurn = onStartTurn
    this.startThreadCalls = []
    this.startTurnCalls = []
    this.interruptTurnCalls = []
  }

  async startThread(params = {}) {
    this.startThreadCalls.push(params)
    return { thread: { id: this.threadId } }
  }

  async resumeThread(params = {}) {
    return { thread: { id: params.threadId || this.threadId } }
  }

  async startTurn(params = {}) {
    this.startTurnCalls.push(params)
    this.onStartTurn?.(params, this)
    return { turn: { id: this.turnId, status: 'inProgress', items: [], error: null } }
  }

  async interruptTurn(threadId = '', turnId = '') {
    this.interruptTurnCalls.push({ threadId, turnId })
    return {}
  }
}

function installAccountRuntimeBridge(bridge) {
  __testOpenAIAccountInternals.resetSingleton()
  const service = getOpenAIAccountAuthService()
  service.getState = () => ({
    sessionSummary: {
      hasSession: true,
      status: 'connected',
    },
    activeLogin: null,
    storage: {
      availability: {
        supported: true,
        reason: '',
        message: '',
      },
    },
  })
  service.getBridge = () => bridge
}

test.afterEach(async () => {
  __resetOpenAIBackgroundClientFactoryForTests()
  __resetOpenAIBackgroundTimingForTests()
  __testOpenAIAccountInternals.resetSingleton()
  await setSettingsPatch({
    providerAuthSettings: {
      openai: {
        authMethod: 'api_key',
      },
    },
  })
})

test('openai background runtime polls to completion and returns response metadata', async () => {
  const seenBodies = []
  let retrieveCount = 0

  __setOpenAIBackgroundTimingForTests({ pollIntervalMs: 0, maxWaitMs: 1_000 })
  __setOpenAIBackgroundClientFactoryForTests(() => ({
    responses: {
      create: async (body) => {
        seenBodies.push(body)
        return {
          id: 'resp_bg_1',
          status: 'queued',
          model: 'gpt-5.4',
          background: true,
          conversation: { id: 'conv_bg_1' },
        }
      },
      retrieve: async () => {
        retrieveCount += 1
        if (retrieveCount === 1) {
          return {
            id: 'resp_bg_1',
            status: 'in_progress',
            model: 'gpt-5.4',
            background: true,
            conversation: { id: 'conv_bg_1' },
          }
        }
        return {
          id: 'resp_bg_1',
          status: 'completed',
          model: 'gpt-5.4',
          background: true,
          conversation: { id: 'conv_bg_1' },
          service_tier: 'priority',
          output_text: 'Background response complete.',
          output: [
            {
              id: 'cmp_bg_auto_1',
              type: 'compaction',
              encrypted_content: 'enc_bg_1',
            },
            {
              id: 'rs_1',
              type: 'reasoning',
              summary: [{ type: 'summary_text', text: 'Evaluated the request carefully.' }],
            },
          ],
          usage: {
            input_tokens: 11,
            output_tokens: 7,
            total_tokens: 20,
            output_tokens_details: {
              reasoning_tokens: 2,
            },
            input_tokens_details: {
              cached_tokens: 5,
            },
          },
        }
      },
      cancel: async () => {},
    },
  }))

  const result = await createOpenAIBackgroundResponse({
    apiKey: 'sk-test',
    modelId: 'gpt-5.4',
    messages: [
      { role: 'system', content: 'You are ADDOM.' },
      { role: 'user', content: 'Summarize the repo state.' },
    ],
    runtimeSettings: {
      enableBackgroundMode: true,
    },
    openaiOptions: {
      store: true,
      serviceTier: 'priority',
      promptCacheKey: 'addom:openai:project:thread:gpt-5.4:test',
      reasoningEffort: 'high',
      reasoningSummary: 'auto',
      textVerbosity: 'high',
    },
  })

  assert.equal(seenBodies.length, 1)
  assert.equal(seenBodies[0].background, true)
  assert.equal(seenBodies[0].store, true)
  assert.equal(seenBodies[0].service_tier, 'priority')
  assert.equal(seenBodies[0].reasoning.effort, 'high')
  assert.equal(seenBodies[0].reasoning.summary, 'auto')
  assert.equal(seenBodies[0].text.verbosity, 'high')
  assert.deepEqual(seenBodies[0].input, [
    { role: 'system', content: 'You are ADDOM.' },
    { role: 'user', content: 'Summarize the repo state.' },
  ])

  assert.equal(result.stopReason, 'stop')
  assert.equal(result.text, 'Background response complete.')
  assert.equal(result.reasoning, 'Evaluated the request carefully.')
  assert.equal(result.usage.inputTokens, 11)
  assert.equal(result.usage.outputTokens, 7)
  assert.equal(result.usage.reasoningTokens, 2)
  assert.equal(result.usage.totalTokens, 20)
  assert.equal(result.usage.cachedInputTokens, 5)
  assert.deepEqual(result.usage.inputTokenDetails, {
    cachedTokens: 5,
    cacheReadTokens: 5,
  })
  assert.deepEqual(result.usage.outputTokenDetails, {
    reasoningTokens: 2,
    textTokens: 5,
  })
  assert.equal(result.providerResponseMeta.responseId, 'resp_bg_1')
  assert.equal(result.providerResponseMeta.conversationId, 'conv_bg_1')
  assert.equal(result.providerResponseMeta.cachedTokens, 5)
  assert.deepEqual(result.providerResponseMeta.usageTelemetry, result.usage)
  assert.equal(result.providerResponseMeta.status, 'completed')
  assert.equal(result.providerResponseMeta.background, true)
  assert.equal(result.providerResponseMeta.autoCompactionApplied, true)
  assert.deepEqual(result.providerResponseMeta.autoCompactionIds, ['cmp_bg_auto_1'])
})

test('openai background runtime sanitizes oversized prompt cache keys before create', async () => {
  const seenBodies = []

  __setOpenAIBackgroundTimingForTests({ pollIntervalMs: 0, maxWaitMs: 1_000 })
  __setOpenAIBackgroundClientFactoryForTests(() => ({
    responses: {
      create: async (body) => {
        seenBodies.push(body)
        return {
          id: 'resp_bg_key_1',
          status: 'completed',
          model: 'gpt-5.4',
          background: true,
          output_text: 'ok',
          output: [],
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            total_tokens: 2,
          },
        }
      },
      retrieve: async () => {
        throw new Error('retrieve should not be called when create already completed')
      },
      cancel: async () => {},
    },
  }))

  const oversizedPromptCacheKey = 'addom:openai:project_1772487519187_766cfb14:thread_1772487519187_9201f0a3:gpt-5.1:3103e019f7f0a7ab'
  await createOpenAIBackgroundResponse({
    apiKey: 'sk-test',
    modelId: 'gpt-5.4',
    messages: [{ role: 'user', content: 'Hello' }],
    runtimeSettings: {
      enableBackgroundMode: true,
    },
    openaiOptions: {
      store: true,
      promptCacheKey: oversizedPromptCacheKey,
    },
  })

  assert.equal(seenBodies.length, 1)
  assert.equal(typeof seenBodies[0].prompt_cache_key, 'string')
  assert.equal(seenBodies[0].prompt_cache_key.length <= 64, true)
  assert.match(seenBodies[0].prompt_cache_key, /^addom:openai:ck:[0-9a-f]{40}$/)
})

test('createStreamWithTools routes eligible OpenAI turns through background mode', async () => {
  const chunks = []
  const reasoningChunks = []

  __setOpenAIBackgroundTimingForTests({ pollIntervalMs: 0, maxWaitMs: 1_000 })
  __setOpenAIBackgroundClientFactoryForTests(() => ({
    responses: {
      create: async () => ({
        id: 'resp_bg_2',
        status: 'completed',
        model: 'gpt-5.4',
        background: true,
        conversation: { id: 'conv_bg_2' },
        output_text: 'Background route used.',
        output: [{
          id: 'rs_2',
          type: 'reasoning',
          summary: [{ type: 'summary_text', text: 'Background chain preserved.' }],
        }],
        usage: {
          input_tokens: 4,
          output_tokens: 3,
          total_tokens: 8,
          output_tokens_details: { reasoning_tokens: 1 },
        },
      }),
      retrieve: async () => {
        throw new Error('retrieve should not be called when create already completed')
      },
      cancel: async () => {},
    },
  }))

  const payload = await createStreamWithTools(
    'openai',
    'sk-test',
    [
      { role: 'system', content: 'You are ADDOM.' },
      { role: 'user', content: 'Give me a short answer.' },
    ],
    {
      model: 'gpt-5.4',
      tools: {},
      providerRuntimeSettings: {
        enableBackgroundMode: true,
        promptCachingEnabled: true,
      },
      requestContext: {
        projectId: 'project-bg',
        threadId: 'thread-bg',
        openai: {
          store: true,
        },
      },
    },
    (chunk) => chunks.push(chunk),
    (chunk) => reasoningChunks.push(chunk),
  )

  assert.deepEqual(chunks, [{ chunk: 'Background route used.', phase: 'commentary' }])
  assert.equal(reasoningChunks.join(''), 'Background chain preserved.')
  assert.equal(payload.text, 'Background route used.')
  assert.equal(payload.reasoning, 'Background chain preserved.')
  assert.equal(payload.providerResponseMeta?.responseId, 'resp_bg_2')
  assert.equal(payload.providerResponseMeta?.usageTelemetry?.inputTokens, 4)
  assert.equal(payload.providerResponseMeta?.usageTelemetry?.outputTokens, 3)
  assert.equal(payload.providerResponseMeta?.usageTelemetry?.reasoningTokens, 1)
  assert.equal(payload.providerResponseMeta?.usageTelemetry?.totalTokens, 8)
  assert.equal(payload.providerResponseMeta?.background, true)
})

test('openai background runtime cancels remote work when aborted mid-poll', async () => {
  let cancelCalls = 0
  const controller = new AbortController()

  __setOpenAIBackgroundTimingForTests({ pollIntervalMs: 0, maxWaitMs: 1_000 })
  __setOpenAIBackgroundClientFactoryForTests(() => ({
    responses: {
      create: async () => ({
        id: 'resp_bg_abort',
        status: 'queued',
        model: 'gpt-5.4',
        background: true,
      }),
      retrieve: async () => {
        controller.abort()
        return {
          id: 'resp_bg_abort',
          status: 'in_progress',
          model: 'gpt-5.4',
          background: true,
        }
      },
      cancel: async () => {
        cancelCalls += 1
      },
    },
  }))

  await assert.rejects(
    () => createOpenAIBackgroundResponse({
      apiKey: 'sk-test',
      modelId: 'gpt-5.4',
      messages: [{ role: 'user', content: 'Hello' }],
      runtimeSettings: { enableBackgroundMode: true },
      openaiOptions: { store: true },
      abortSignal: controller.signal,
    }),
    (error) => {
      assert.equal(String(error?.name || ''), 'AbortError')
      return true
    },
  )

  assert.equal(cancelCalls, 1)
})

test('openai background runtime rejects generic OpenAI adapters before background dispatch', async () => {
  await assert.rejects(
    () => createOpenAIBackgroundResponse({
      apiKey: 'sk-test',
      modelId: 'custom-openai-model',
      messages: [{ role: 'user', content: 'Hello' }],
      runtimeSettings: { enableBackgroundMode: true },
      openaiOptions: { store: true },
    }),
    /unsupported_model/i,
  )
})

test('openai background eligibility stays auth-aware for connected account mode', async () => {
  const eligibility = resolveOpenAIBackgroundModeEligibility({
    modelId: 'gpt-5.4',
    runtimeSettings: {
      enableBackgroundMode: true,
    },
    messages: [{ role: 'user', content: 'Hello' }],
    toolCount: 0,
    store: true,
    authMethod: 'account',
  })

  assert.equal(eligibility.eligible, true)
  assert.equal(eligibility.reason, '')
})

test('openai background runtime supports connected OpenAI account sessions through the bridge-backed runtime', async () => {
  const warnings = []

  await setSettingsPatch({
    providerAuthSettings: {
      openai: {
        authMethod: 'account',
      },
    },
  })

  const bridge = new FakeAccountBridge({
    onStartTurn(params, target) {
      queueMicrotask(() => {
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              id: 'background_unknown_activity_1',
              type: 'futureActivity',
              status: 'completed',
              result: 'private-background-result',
            },
          },
        })
        target.emit('notification', {
          method: 'item/agentMessage/delta',
          params: { threadId: params.threadId, turnId: target.turnId, delta: 'Background ' },
        })
        target.emit('notification', {
          method: 'item/completed',
          params: {
            threadId: params.threadId,
            turnId: target.turnId,
            item: {
              type: 'agentMessage',
              text: 'Background account result.',
            },
          },
        })
        target.emit('notification', {
          method: 'turn/completed',
          params: {
            threadId: params.threadId,
            turn: {
              id: target.turnId,
              status: 'completed',
              error: null,
            },
          },
        })
      })
    },
  })
  installAccountRuntimeBridge(bridge)

  const result = await createOpenAIBackgroundResponse({
    modelId: 'gpt-5.4',
    messages: [{ role: 'user', content: 'Summarize this later.' }],
    runtimeSettings: {
      enableBackgroundMode: true,
    },
    openaiOptions: {
      store: true,
    },
    requestContext: {
      projectId: 'project-bg-account',
    },
    onProviderWarning: (warning) => warnings.push(warning),
  })

  assert.equal(bridge.startThreadCalls.length, 1)
  assert.equal(bridge.startTurnCalls.length, 1)
  assert.equal(result.text, 'Background account result.')
  assert.equal(result.providerResponseMeta?.authMethod, 'account')
  assert.equal(result.providerResponseMeta?.transportMode, 'codex_app_server_chatgpt_background')
  assert.equal(result.providerResponseMeta?.background, true)
  assert.equal(result.providerResponseMeta?.responseId, 'turn_bg_account_1')
  assert.equal(result.providerResponseMeta?.conversationId, 'thr_bg_account_1')
  assert.equal(warnings.length, 1)
  assert.equal(warnings[0]?.meta?.protocolItemType, 'futureActivity')
  assert.equal(JSON.stringify(warnings).includes('background_unknown_activity_1'), false)
  assert.equal(JSON.stringify(warnings).includes('private-background-result'), false)
})
