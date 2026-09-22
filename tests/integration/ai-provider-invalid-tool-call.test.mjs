import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createSharedStreamWithTools,
  __resetSharedStreamTextForTests,
  __setSharedStreamTextForTests,
} from '../../src/main/api-clients/ai-provider-adapter-core.mjs'
import { extractDynamicToolCall } from '../../src/main/api-clients/ai-provider-openai-account-dynamic-tools.mjs'
import { createOpenAIAccountServerRequestHandler } from '../../src/main/api-clients/ai-provider-openai-account-server-requests.mjs'

test.afterEach(() => {
  __resetSharedStreamTextForTests()
})

function createTestAdapter() {
  return {
    buildModel() {
      return { id: 'fake-model' }
    },
    normalizeMessages({ messages }) {
      return Array.isArray(messages) ? messages : []
    },
    prepareContinuationMessages({ messages }) {
      return { messages: Array.isArray(messages) ? messages : [] }
    },
    prepareBackgroundTurn({ messages, modelId }) {
      return {
        eligible: false,
        reason: 'not_openai',
        messages: Array.isArray(messages) ? messages : [],
        modelId: String(modelId || '').trim(),
      }
    },
  }
}

test('shared adapter preserves invalid SDK tool-call metadata', async () => {
  const parseError = new Error('Tool input JSON was incomplete.')
  __setSharedStreamTextForTests(async () => ({
    text: Promise.resolve(''),
    reasoningText: Promise.resolve(''),
    reasoning: Promise.resolve([]),
    toolCalls: Promise.resolve([{
      toolCallId: 'call_invalid',
      toolName: 'write_file',
      input: '{"path":',
      invalid: true,
      error: parseError,
    }]),
    finishReason: Promise.resolve('tool-calls'),
    usage: Promise.resolve(null),
    providerMetadata: Promise.resolve(null),
    response: Promise.resolve(null),
    warnings: Promise.resolve([]),
  }))

  const payload = await createSharedStreamWithTools({
    adapter: createTestAdapter(),
    providerId: 'openai',
    apiKey: 'synthetic-test-key',
    messages: [{ role: 'user', content: 'Write the fixture.' }],
    options: { model: 'gpt-test' },
  })

  assert.equal(payload.toolCalls.length, 1)
  assert.equal(payload.toolCalls[0].invalid, true)
  assert.equal(payload.toolCalls[0].error, parseError)
  assert.equal(payload.toolCalls[0].input, '{"path":')
})

test('account dynamic-tool extraction marks malformed JSON instead of treating it as empty input', () => {
  const call = extractDynamicToolCall({
    itemId: 'call_dynamic_invalid',
    tool: 'write_file',
    arguments: '{"path":',
  })

  assert.equal(call.invalid, true)
  assert.equal(call.inputError?.code, 'invalid_json')
  assert.equal(call.rawInput, '{"path":')
  assert.deepEqual(call.input, {})
})

test('account dynamic-tool requests reject malformed JSON without invoking the executor', async () => {
  const responses = []
  const rejected = []
  let executorCalled = false
  const handleRequest = createOpenAIAccountServerRequestHandler({
    bridge: {
      respond: async (id, result) => {
        responses.push({ id, result })
      },
    },
    matchesScope: () => true,
    rejectTurn: (error) => rejected.push(error),
    accountDynamicToolExecutor: async () => {
      executorCalled = true
      return { result: 'unexpected' }
    },
    bridgeThreadId: 'thread_fixture',
    getActiveTurnId: () => 'turn_fixture',
  })

  handleRequest({
    id: 77,
    method: 'item/tool/call',
    params: {
      threadId: 'thread_fixture',
      turnId: 'turn_fixture',
      itemId: 'call_fixture',
      tool: 'write_file',
      arguments: '{"path":',
    },
  })
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(executorCalled, false)
  assert.equal(responses.length, 1)
  assert.equal(responses[0].result.success, false)
  assert.match(responses[0].result.contentItems[0].text, /malformed input/i)
  assert.equal(rejected[0]?.reason, 'account_runtime_dynamic_tool_invalid_input')
})
