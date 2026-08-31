import test from 'node:test'
import assert from 'node:assert/strict'

import { createStreamWithTools } from '../../src/main/api-clients/ai-provider.mjs'
import {
  __resetOpenAILegacyStreamFactoryForTests,
  __setOpenAILegacyStreamFactoryForTests,
  resolveOpenAITransportDecision,
} from '../../src/main/api-clients/ai-provider-openai.mjs'
import {
  __resetOpenAIResponsesWebSocketFactoryForTests,
  __setOpenAIResponsesWebSocketFactoryForTests,
} from '../../src/main/api-clients/experimental/openai-websocket/openai-websocket-runtime.mjs'
import { buildOpenAIHostedToolBundle } from '../../src/main/api-clients/openai-hosted-tools-runtime.mjs'

class FakeSocket {
  constructor() {
    this.listeners = new Map()
    this.sent = []
  }

  addEventListener(type, listener) {
    const rows = this.listeners.get(type) || []
    rows.push(listener)
    this.listeners.set(type, rows)
  }

  removeEventListener(type, listener) {
    const rows = this.listeners.get(type) || []
    this.listeners.set(type, rows.filter((entry) => entry !== listener))
  }

  send(payload) {
    this.sent.push(String(payload || ''))
  }

  close() {}

  emit(type, payload = {}) {
    const rows = this.listeners.get(type) || []
    for (const listener of rows) {
      listener(payload)
    }
  }
}

test.afterEach(() => {
  __resetOpenAIResponsesWebSocketFactoryForTests()
  __resetOpenAILegacyStreamFactoryForTests()
})

test('openai transport decision requires model eligibility and a qualified websocket runtime', () => {
  assert.deepEqual(
    resolveOpenAITransportDecision({
      modelId: 'gpt-5.4',
      runtimeSettings: {
        transportMode: 'responses_auto',
      },
    }),
    {
      configuredTransportMode: 'responses_auto',
      effectiveTransportMode: 'responses_websocket_experimental',
      transportSelectionReason: 'auto_preferred_model',
    },
  )

  assert.deepEqual(
    resolveOpenAITransportDecision({
      modelId: 'gpt-5-mini',
      runtimeSettings: {
        transportMode: 'responses_auto',
      },
    }),
    {
      configuredTransportMode: 'responses_auto',
      effectiveTransportMode: 'responses_stream',
      transportSelectionReason: 'auto_model_not_preferred',
    },
  )

  assert.deepEqual(
    resolveOpenAITransportDecision({
      modelId: 'gpt-5.4',
      runtimeSettings: {
        transportMode: 'responses_auto',
        enableBackgroundMode: true,
      },
    }),
    {
      configuredTransportMode: 'responses_auto',
      effectiveTransportMode: 'responses_stream',
      transportSelectionReason: 'auto_background_bypass',
    },
  )

  assert.deepEqual(
    resolveOpenAITransportDecision({
      modelId: 'gpt-5.4',
      runtimeSettings: {
        transportMode: 'responses_stream',
      },
    }),
    {
      configuredTransportMode: 'responses_stream',
      effectiveTransportMode: 'responses_stream',
      transportSelectionReason: 'manual_stream',
    },
  )

  assert.deepEqual(
    resolveOpenAITransportDecision({
      modelId: 'gpt-5.4',
      runtimeSettings: {
        transportMode: 'responses_websocket_experimental',
      },
      websocketQualification: {
        supported: false,
        reason: 'The loaded WebSocket runtime is not qualified.',
      },
    }),
    {
      configuredTransportMode: 'responses_websocket_experimental',
      effectiveTransportMode: 'responses_stream',
      transportSelectionReason: 'manual_websocket_not_qualified',
      transportSelectionDetail: 'The loaded WebSocket runtime is not qualified.',
    },
  )
})

test('openai adapter allows retained GPT-5.5 on the API-key runtime', async () => {
  let fallbackArgs = null
  __setOpenAILegacyStreamFactoryForTests(async (args) => {
    fallbackArgs = args
    return {
      text: 'API-key route.',
      providerResponseMeta: {},
      providerToolStatuses: [],
      providerToolOutputs: [],
      toolCalls: [],
      stopReason: 'stop',
    }
  })

  const payload = await createStreamWithTools(
    'openai',
    'sk-test',
    [{ role: 'user', content: 'Continue the work.' }],
    {
      model: 'gpt-5.5',
      providerRuntimeSettings: { transportMode: 'responses_stream' },
    },
    () => {},
    () => {},
  )

  assert.equal(fallbackArgs?.options?.model, 'gpt-5.5')
  assert.equal(payload.text, 'API-key route.')
})

test('openai adapter routes auto-preferred eligible models through the websocket runtime and stamps selection metadata', async () => {
  const socket = new FakeSocket()
  __setOpenAIResponsesWebSocketFactoryForTests(() => socket)

  const seenChunks = []
  const streamPromise = createStreamWithTools(
    'openai',
    'sk-test',
    [
      { role: 'system', content: 'You are ADDOM.' },
      { role: 'user', content: 'Continue the work.' },
    ],
    {
      model: 'gpt-5.4',
      providerRuntimeSettings: {
        transportMode: 'responses_auto',
      },
    },
    (chunk) => seenChunks.push(chunk),
    () => {},
  )

  socket.emit('open')
  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.output_text.delta',
      delta: 'Done.',
    }),
  })
  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.completed',
      response: {
        id: 'resp_ws_auto_1',
        model: 'gpt-5.4',
        status: 'completed',
        output_text: 'Done.',
        output: [],
        usage: {
          input_tokens: 5,
          output_tokens: 2,
          total_tokens: 7,
        },
      },
    }),
  })

  const payload = await streamPromise
  assert.deepEqual(seenChunks, [{ chunk: 'Done.', phase: 'commentary' }])
  assert.equal(payload.text, 'Done.')
  assert.equal(payload.providerResponseMeta.transportMode, 'responses_websocket_experimental')
  assert.equal(payload.providerResponseMeta.configuredTransportMode, 'responses_auto')
  assert.equal(payload.providerResponseMeta.transportSelectionReason, 'auto_preferred_model')
  assert.equal(socket.sent.length, 1)
})

test('openai adapter keeps auto-mode non-preferred models on the legacy stream path', async () => {
  let fallbackArgs = null
  __setOpenAILegacyStreamFactoryForTests(async (args) => {
    fallbackArgs = args
    return {
      text: 'Stream path.',
      providerResponseMeta: {},
      providerToolStatuses: [],
      providerToolOutputs: [],
      toolCalls: [],
      stopReason: 'stop',
    }
  })

  const payload = await createStreamWithTools(
    'openai',
    'sk-test',
    [{ role: 'user', content: 'Continue the work.' }],
    {
      model: 'gpt-5-mini',
      providerRuntimeSettings: {
        transportMode: 'responses_auto',
      },
    },
    () => {},
    () => {},
  )

  assert.equal(fallbackArgs?.options?.providerRuntimeSettings?.transportMode, 'responses_stream')
  assert.equal(payload.providerResponseMeta.transportMode, 'responses_stream')
  assert.equal(payload.providerResponseMeta.configuredTransportMode, 'responses_auto')
  assert.equal(payload.providerResponseMeta.transportSelectionReason, 'auto_model_not_preferred')
})

test('openai adapter keeps auto-mode background turns on the legacy stream path', async () => {
  let fallbackArgs = null
  __setOpenAILegacyStreamFactoryForTests(async (args) => {
    fallbackArgs = args
    return {
      text: 'Background stream path.',
      providerResponseMeta: {},
      providerToolStatuses: [],
      providerToolOutputs: [],
      toolCalls: [],
      stopReason: 'stop',
    }
  })

  const payload = await createStreamWithTools(
    'openai',
    'sk-test',
    [{ role: 'user', content: 'Continue the work.' }],
    {
      model: 'gpt-5.4',
      providerRuntimeSettings: {
        transportMode: 'responses_auto',
        enableBackgroundMode: true,
      },
    },
    () => {},
    () => {},
  )

  assert.equal(fallbackArgs?.options?.providerRuntimeSettings?.transportMode, 'responses_stream')
  assert.equal(payload.providerResponseMeta.transportMode, 'responses_stream')
  assert.equal(payload.providerResponseMeta.configuredTransportMode, 'responses_auto')
  assert.equal(payload.providerResponseMeta.transportSelectionReason, 'auto_background_bypass')
})

test('openai adapter falls back to the legacy stream path when an auto-selected websocket turn is ineligible', async () => {
  let fallbackArgs = null
  __setOpenAILegacyStreamFactoryForTests(async (args) => {
    fallbackArgs = args
    return {
      text: 'Ineligible stream path.',
      providerResponseMeta: {},
      providerToolStatuses: [],
      providerToolOutputs: [],
      toolCalls: [],
      stopReason: 'stop',
    }
  })

  const payload = await createStreamWithTools(
    'openai',
    'sk-test',
    [{
      role: 'assistant',
      content: [
        { type: 'text', text: 'Interim result.' },
        { type: 'audio', audio: 'unsupported' },
      ],
    }],
    {
      model: 'gpt-5.4',
      providerRuntimeSettings: {
        transportMode: 'responses_auto',
      },
    },
    () => {},
    () => {},
  )

  assert.equal(fallbackArgs?.options?.providerRuntimeSettings?.transportMode, 'responses_stream')
  assert.equal(payload.providerResponseMeta.transportMode, 'responses_stream')
  assert.equal(payload.providerResponseMeta.configuredTransportMode, 'responses_auto')
  assert.equal(payload.providerResponseMeta.transportSelectionReason, 'auto_ineligible_request_shape')
  assert.equal(payload.providerResponseMeta.websocketBypassReason, 'non_text_content_present')
})

test('openai adapter fails truthfully when a manual websocket turn is ineligible', async () => {
  let fallbackCalled = false
  __setOpenAILegacyStreamFactoryForTests(async () => {
    fallbackCalled = true
    return {
      text: 'should not be used',
      providerResponseMeta: {},
      providerToolStatuses: [],
      providerToolOutputs: [],
      toolCalls: [],
      stopReason: 'stop',
    }
  })

  await assert.rejects(
    createStreamWithTools(
      'openai',
      'sk-test',
      [{
        role: 'assistant',
        content: [
          { type: 'text', text: 'Interim result.' },
          { type: 'audio', audio: 'unsupported' },
        ],
      }],
      {
        model: 'gpt-5.4',
        providerRuntimeSettings: {
          transportMode: 'responses_websocket_experimental',
          websocketFallbackToStream: true,
        },
      },
      () => {},
      () => {},
    ),
    (error) => String(error?.code || '') === 'openai_websocket_ineligible',
  )

  assert.equal(fallbackCalled, false)
})

test('openai adapter routes eligible experimental transport turns through the websocket runtime', async () => {
  const socket = new FakeSocket()
  __setOpenAIResponsesWebSocketFactoryForTests(() => socket)

  const seenChunks = []
  const streamPromise = createStreamWithTools(
    'openai',
    'sk-test',
    [
      { role: 'system', content: 'You are ADDOM.' },
      { role: 'user', content: 'Continue the work.' },
    ],
    {
      model: 'gpt-5.4',
      providerRuntimeSettings: {
        transportMode: 'responses_websocket_experimental',
      },
    },
    (chunk) => seenChunks.push(chunk),
    () => {},
  )

  socket.emit('open')
  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.output_text.delta',
      delta: 'Done.',
    }),
  })
  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.completed',
      response: {
        id: 'resp_ws_adapter_1',
        model: 'gpt-5.4',
        status: 'completed',
        output_text: 'Done.',
        output: [],
        usage: {
          input_tokens: 5,
          output_tokens: 2,
          total_tokens: 7,
        },
      },
    }),
  })

  const payload = await streamPromise
  assert.deepEqual(seenChunks, [{ chunk: 'Done.', phase: 'commentary' }])
  assert.equal(payload.text, 'Done.')
  assert.equal(payload.providerResponseMeta.transportMode, 'responses_websocket_experimental')
  assert.equal(payload.providerResponseMeta.configuredTransportMode, 'responses_websocket_experimental')
  assert.equal(payload.providerResponseMeta.transportSelectionReason, 'manual_websocket')
  assert.equal(socket.sent.length, 1)
})

test('openai adapter keeps eligible attachment turns on the websocket transport', async () => {
  const socket = new FakeSocket()
  __setOpenAIResponsesWebSocketFactoryForTests(() => socket)

  const seenChunks = []
  const streamPromise = createStreamWithTools(
    'openai',
    'sk-test',
    [{
      role: 'user',
      content: [
        { type: 'text', text: 'Inspect this file.' },
        {
          type: 'file',
          filename: 'spec.pdf',
          mediaType: 'application/pdf',
          data: 'JVBERi0xLjQKJcTl8uXr',
        },
      ],
    }],
    {
      model: 'gpt-5.4',
      providerRuntimeSettings: {
        transportMode: 'responses_websocket_experimental',
        websocketFallbackToStream: false,
      },
    },
    (chunk) => seenChunks.push(chunk),
    () => {},
  )

  socket.emit('open')
  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.output_text.delta',
      delta: 'Parsed.',
    }),
  })
  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.completed',
      response: {
        id: 'resp_ws_attachment_1',
        model: 'gpt-5.4',
        status: 'completed',
        output_text: 'Parsed.',
        output: [],
        usage: {
          input_tokens: 20,
          output_tokens: 2,
          total_tokens: 22,
        },
      },
    }),
  })

  const payload = await streamPromise
  assert.deepEqual(seenChunks, [{ chunk: 'Parsed.', phase: 'commentary' }])
  assert.equal(payload.text, 'Parsed.')
  assert.equal(payload.providerResponseMeta.transportMode, 'responses_websocket_experimental')
  const request = JSON.parse(socket.sent[0])
  assert.deepEqual(request.input, [{
    type: 'message',
    role: 'user',
    content: [
      { type: 'input_text', text: 'Inspect this file.' },
      {
        type: 'input_file',
        filename: 'spec.pdf',
        file_data: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXr',
      },
    ],
  }])
})

test('openai adapter retries once with a fresh chain when previous_response_id cannot be resolved on websocket mode', async () => {
  const firstSocket = new FakeSocket()
  const secondSocket = new FakeSocket()
  let factoryCallCount = 0
  __setOpenAIResponsesWebSocketFactoryForTests(() => {
    factoryCallCount += 1
    return factoryCallCount === 1 ? firstSocket : secondSocket
  })

  const streamPromise = createStreamWithTools(
    'openai',
    'sk-test',
    [
      { role: 'system', content: 'You are ADDOM.' },
      { role: 'assistant', content: 'Previous answer.' },
      { role: 'user', content: 'Continue with full context.' },
    ],
    {
      model: 'gpt-5.4',
      providerRuntimeSettings: {
        transportMode: 'responses_websocket_experimental',
      },
      requestContext: {
        openai: {
          store: true,
          previousResponseId: 'resp_missing_prev_1',
        },
      },
    },
    () => {},
    () => {},
  )

  firstSocket.emit('open')
  firstSocket.emit('message', {
    data: JSON.stringify({
      type: 'response.failed',
      response: {
        id: 'resp_failed_1',
        model: 'gpt-5.4',
        status: 'failed',
        error: {
          code: 'previous_response_not_found',
          message: 'previous_response_id could not be resolved',
        },
      },
    }),
  })

  await new Promise((resolve) => setTimeout(resolve, 10))
  secondSocket.emit('open')
  secondSocket.emit('message', {
    data: JSON.stringify({
      type: 'response.completed',
      response: {
        id: 'resp_ws_retry_1',
        model: 'gpt-5.4',
        status: 'completed',
        output_text: 'Recovered.',
        output: [],
        usage: {
          input_tokens: 8,
          output_tokens: 2,
          total_tokens: 10,
        },
      },
    }),
  })

  const payload = await streamPromise
  assert.equal(payload.text, 'Recovered.')
  assert.equal(factoryCallCount, 2)

  const firstRequest = JSON.parse(firstSocket.sent[0])
  const secondRequest = JSON.parse(secondSocket.sent[0])

  assert.equal(firstRequest.previous_response_id, 'resp_missing_prev_1')
  assert.equal(Object.prototype.hasOwnProperty.call(secondRequest, 'previous_response_id'), false)
  assert.deepEqual(secondRequest.input, [
    { type: 'message', role: 'system', content: 'You are ADDOM.' },
    { type: 'message', role: 'assistant', content: 'Previous answer.' },
    { type: 'message', role: 'user', content: 'Continue with full context.' },
  ])
})

test('openai adapter keeps eligible custom function-tool turns on the websocket transport', async () => {
  const socket = new FakeSocket()
  __setOpenAIResponsesWebSocketFactoryForTests(() => socket)

  const streamPromise = createStreamWithTools(
    'openai',
    'sk-test',
    [{ role: 'user', content: 'Read the file.' }],
    {
      model: 'gpt-5.4',
      tools: {
        read_file: {
          description: 'Read a file.',
          inputSchema: {
            jsonSchema: {
              type: 'object',
              properties: {
                path: { type: 'string' },
              },
              required: ['path'],
            },
          },
        },
      },
      providerRuntimeSettings: {
        transportMode: 'responses_websocket_experimental',
      },
    },
    () => {},
    () => {},
  )

  socket.emit('open')
  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.function_call_arguments.done',
      output_index: 0,
      item: {
        type: 'function_call',
        id: 'fc_item_1',
        call_id: 'call_read_1',
        name: 'read_file',
        arguments: '{"path":"src/main/index.mjs"}',
      },
    }),
  })
  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.completed',
      response: {
        id: 'resp_ws_adapter_tool_1',
        model: 'gpt-5.4',
        status: 'completed',
        output: [{
          type: 'function_call',
          id: 'fc_item_1',
          call_id: 'call_read_1',
          name: 'read_file',
          arguments: '{"path":"src/main/index.mjs"}',
        }],
        usage: {
          input_tokens: 7,
          output_tokens: 1,
          total_tokens: 8,
        },
      },
    }),
  })

  const payload = await streamPromise
  assert.equal(payload.providerResponseMeta.transportMode, 'responses_websocket_experimental')
  assert.equal(payload.stopReason, 'tool-calls')
  assert.deepEqual(payload.toolCalls, [{
    id: 'call_read_1',
    name: 'read_file',
    input: { path: 'src/main/index.mjs' },
  }])
  const requestPayload = JSON.parse(socket.sent[0])
  assert.equal(requestPayload.tools[0]?.name, 'read_file')
})

test('openai adapter keeps supported hosted-tool bundles on the websocket transport', async () => {
  const socket = new FakeSocket()
  __setOpenAIResponsesWebSocketFactoryForTests(() => socket)
  const openaiBundle = buildOpenAIHostedToolBundle({
    modelId: 'gpt-5.4',
    runtimeSettings: {
      hostedToolsEnabled: true,
      enabledHostedTools: ['web_search', 'file_search'],
    },
    vectorStoreIds: ['vs_project_123'],
  })

  const streamPromise = createStreamWithTools(
    'openai',
    'sk-test',
    [{ role: 'user', content: 'Search the docs and answer.' }],
    {
      model: 'gpt-5.4',
      tools: openaiBundle.tools,
      providerRuntimeSettings: {
        transportMode: 'responses_websocket_experimental',
        websocketFallbackToStream: false,
      },
    },
    () => {},
    () => {},
  )

  socket.emit('open')
  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.output_item.added',
      item: {
        id: 'ws_call_1',
        type: 'web_search_call',
        status: 'in_progress',
      },
    }),
  })
  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.output_item.done',
      item: {
        id: 'ws_call_1',
        type: 'web_search_call',
        status: 'completed',
      },
    }),
  })
  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.completed',
      response: {
        id: 'resp_ws_hosted_1',
        model: 'gpt-5.4',
        status: 'completed',
        output_text: 'Found it.',
        output: [{
          id: 'ws_call_1',
          type: 'web_search_call',
          status: 'completed',
        }],
        usage: {
          input_tokens: 12,
          output_tokens: 3,
          total_tokens: 15,
        },
      },
    }),
  })

  const payload = await streamPromise
  assert.equal(payload.text, 'Found it.')
  assert.equal(payload.providerResponseMeta.transportMode, 'responses_websocket_experimental')
  assert.equal(payload.providerToolStatuses.some((row) => row.toolName === 'web_search'), true)
  assert.equal(payload.providerToolOutputs.some((row) => row.toolName === 'web_search'), true)

  const requestPayload = JSON.parse(socket.sent[0])
  assert.equal(requestPayload.tools.some((tool) => tool.type === 'web_search'), true)
  assert.equal(requestPayload.tools.some((tool) => tool.type === 'file_search'), true)
})
