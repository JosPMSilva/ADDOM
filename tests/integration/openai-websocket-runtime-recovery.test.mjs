import test from 'node:test'
import assert from 'node:assert/strict'

import {
  __setOpenAIResponsesWebSocketFactoryForTests,
  __setOpenAIResponsesWebSocketReconnectWaitForTests,
  createExperimentalOpenAIResponsesWebSocketStream,
} from '../../src/main/api-clients/experimental/openai-websocket/openai-websocket-runtime.mjs'
import {
  __setOpenAIBackgroundClientFactoryForTests,
} from '../../src/main/api-clients/openai-background-runtime.mjs'
import { FakeSocket, registerOpenAIWebSocketRuntimeTestCleanup } from './openai-websocket-runtime-test-helpers.mjs'

registerOpenAIWebSocketRuntimeTestCleanup()

test('openai websocket runtime recovers a partial-output disconnect by retrieving the stored terminal response', async () => {
  const socket = new FakeSocket()
  let factoryCallCount = 0
  const transportStatuses = []
  __setOpenAIResponsesWebSocketReconnectWaitForTests(async () => {
    throw new Error('should not reconnect when stored-response recovery is available')
  })
  __setOpenAIResponsesWebSocketFactoryForTests(() => {
    factoryCallCount += 1
    return socket
  })
  __setOpenAIBackgroundClientFactoryForTests(() => ({
    responses: {
      retrieve: async (responseId) => ({
        id: responseId,
        model: 'gpt-5.2',
        status: 'completed',
        output_text: 'Recovered final output.',
        output: [],
        usage: {
          input_tokens: 7,
          output_tokens: 3,
          total_tokens: 10,
        },
      }),
    },
  }))

  const streamPromise = createExperimentalOpenAIResponsesWebSocketStream({
    apiKey: 'sk-test',
    messages: [{ role: 'user', content: 'Continue.' }],
    options: {
      model: 'gpt-5.2',
      providerRuntimeSettings: {
        transportMode: 'responses_websocket_experimental',
      },
      requestContext: {
        openai: {
          store: true,
        },
      },
      onTransportStatus: (payload) => transportStatuses.push(payload),
    },
  })

  socket.emit('open')
  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.created',
      response: {
        id: 'resp_ws_partial_1',
        model: 'gpt-5.2',
        status: 'in_progress',
      },
    }),
  })
  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.output_text.delta',
      delta: 'Partial',
    }),
  })
  socket.emit('close', {
    reason: 'server reset',
  })

  const payload = await streamPromise
  assert.equal(payload.text, 'Recovered final output.')
  assert.equal(payload.providerResponseMeta.responseId, 'resp_ws_partial_1')
  assert.equal(payload.providerResponseMeta.websocketStoredResponseRecoveryAttempted, true)
  assert.equal(payload.providerResponseMeta.websocketRecoveredFromStoredResponse, true)
  assert.equal(factoryCallCount, 1)
  assert.equal(transportStatuses[0]?.status, 'recovering_stored_response')
  assert.equal(transportStatuses[1]?.status, 'recovered_stored_response')
})

test('openai websocket runtime surfaces stored-response terminal failures instead of collapsing back to the socket error', async () => {
  const socket = new FakeSocket()
  __setOpenAIResponsesWebSocketFactoryForTests(() => socket)
  __setOpenAIBackgroundClientFactoryForTests(() => ({
    responses: {
      retrieve: async (responseId) => ({
        id: responseId,
        model: 'gpt-5.2',
        status: 'failed',
        error: {
          message: 'OpenAI provider rejected the stored response.',
        },
      }),
    },
  }))

  const streamPromise = createExperimentalOpenAIResponsesWebSocketStream({
    apiKey: 'sk-test',
    messages: [{ role: 'user', content: 'Continue.' }],
    options: {
      model: 'gpt-5.2',
      providerRuntimeSettings: {
        transportMode: 'responses_websocket_experimental',
      },
      requestContext: {
        openai: {
          store: true,
        },
      },
    },
  })

  socket.emit('open')
  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.created',
      response: {
        id: 'resp_ws_partial_terminal_fail_1',
        model: 'gpt-5.2',
        status: 'in_progress',
      },
    }),
  })
  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.output_text.delta',
      delta: 'Partial',
    }),
  })
  socket.emit('close', {
    reason: 'server reset',
  })

  await assert.rejects(
    streamPromise,
    (error) => (
      String(error?.message || '').includes('OpenAI provider rejected the stored response.')
      && error?.openaiWebSocketStoredResponseRecoveryAttempted === true
      && String(error?.openaiWebSocketResponseId || '') === 'resp_ws_partial_terminal_fail_1'
    ),
  )
})

test('openai websocket runtime fails truthfully when stored-response recovery is unavailable after partial output', async () => {
  const socket = new FakeSocket()
  let factoryCallCount = 0
  __setOpenAIResponsesWebSocketReconnectWaitForTests(async () => {
    throw new Error('should not wait when partial output was already emitted')
  })
  __setOpenAIResponsesWebSocketFactoryForTests(() => {
    factoryCallCount += 1
    return socket
  })

  const streamPromise = createExperimentalOpenAIResponsesWebSocketStream({
    apiKey: 'sk-test',
    messages: [{ role: 'user', content: 'Continue.' }],
    options: {
      model: 'gpt-5.2',
      providerRuntimeSettings: {
        transportMode: 'responses_websocket_experimental',
      },
    },
  })

  socket.emit('open')
  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.created',
      response: {
        id: 'resp_ws_partial_fail_1',
        model: 'gpt-5.2',
        status: 'in_progress',
      },
    }),
  })
  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.output_text.delta',
      delta: 'Partial',
    }),
  })
  __setOpenAIBackgroundClientFactoryForTests(() => ({
    responses: {
      retrieve: async () => {
        throw new Error('stored response unavailable')
      },
    },
  }))
  socket.emit('close', {
    reason: 'server reset',
  })

  await assert.rejects(
    streamPromise,
    (error) => String(error?.message || '').includes('partial output'),
  )
  assert.equal(factoryCallCount, 1)
})

test('openai websocket runtime aborts during reconnect wait and closes the active socket', async () => {
  const firstSocket = new FakeSocket()
  let factoryCallCount = 0
  const transportStatuses = []
  const abortController = new AbortController()
  let waitStartedResolve = () => {}
  const waitStarted = new Promise((resolve) => {
    waitStartedResolve = resolve
  })
  __setOpenAIResponsesWebSocketReconnectWaitForTests((_delayMs, { signal } = {}) => new Promise((resolve, reject) => {
    waitStartedResolve()
    signal?.addEventListener?.('abort', () => {
      const error = new Error('reconnect aborted')
      error.name = 'AbortError'
      reject(error)
    }, { once: true })
  }))
  __setOpenAIResponsesWebSocketFactoryForTests(() => {
    factoryCallCount += 1
    return firstSocket
  })

  const streamPromise = createExperimentalOpenAIResponsesWebSocketStream({
    apiKey: 'sk-test',
    messages: [{ role: 'user', content: 'Continue.' }],
    options: {
      model: 'gpt-5.2',
      abortSignal: abortController.signal,
      providerRuntimeSettings: {
        transportMode: 'responses_websocket_experimental',
      },
      onTransportStatus: (payload) => transportStatuses.push(payload),
    },
  })

  firstSocket.emit('open')
  firstSocket.emit('message', {
    data: JSON.stringify({
      type: 'response.failed',
      response: {
        id: 'resp_ws_abort_wait_1',
        model: 'gpt-5.2',
        status: 'failed',
        error: {
          code: 'websocket_connection_limit_reached',
          message: 'connection lifetime exceeded',
        },
      },
    }),
  })
  await waitStarted
  abortController.abort()

  const error = await streamPromise.then(() => null, (reason) => reason)
  assert.equal(String(error?.name || '').toLowerCase(), 'aborterror')
  assert.equal(factoryCallCount, 1)
  assert.equal(firstSocket.closeCalls.length, 1)
  assert.equal(transportStatuses[0]?.status, 'reconnecting')
  assert.equal(transportStatuses[1]?.status, 'cancelled')
})

test('openai websocket runtime aggregates function tool calls from streamed events', async () => {
  const socket = new FakeSocket()
  __setOpenAIResponsesWebSocketFactoryForTests(() => socket)

  const streamPromise = createExperimentalOpenAIResponsesWebSocketStream({
    apiKey: 'sk-test',
    messages: [{ role: 'user', content: 'Inspect the file.' }],
    options: {
      model: 'gpt-5.2',
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
  })

  socket.emit('open')
  const createPayload = JSON.parse(socket.sent[0])
  assert.deepEqual(createPayload.tools, [{
    type: 'function',
    name: 'read_file',
    description: 'Read a file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
      },
      required: ['path'],
    },
    strict: true,
  }])

  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.output_item.added',
      output_index: 0,
      item: {
        type: 'function_call',
        id: 'fc_item_1',
        call_id: 'call_read_1',
        name: 'read_file',
        arguments: '',
      },
    }),
  })
  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.function_call_arguments.delta',
      item_id: 'fc_item_1',
      delta: '{"path":"src/main/index.mjs"}',
    }),
  })
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
        id: 'resp_ws_tool_1',
        model: 'gpt-5.2',
        status: 'completed',
        output: [{
          type: 'function_call',
          id: 'fc_item_1',
          call_id: 'call_read_1',
          name: 'read_file',
          arguments: '{"path":"src/main/index.mjs"}',
        }],
        usage: {
          input_tokens: 8,
          output_tokens: 2,
          total_tokens: 10,
        },
      },
    }),
  })

  const payload = await streamPromise
  assert.equal(payload.stopReason, 'tool-calls')
  assert.deepEqual(payload.toolCalls, [{
    id: 'call_read_1',
    name: 'read_file',
    input: {
      path: 'src/main/index.mjs',
    },
  }])
})

test('openai websocket runtime emits live provider-tool status callbacks for hosted tools', async () => {
  const socket = new FakeSocket()
  __setOpenAIResponsesWebSocketFactoryForTests(() => socket)

  const seenStatuses = []
  const seenOutputs = []
  const streamPromise = createExperimentalOpenAIResponsesWebSocketStream({
    apiKey: 'sk-test',
    messages: [{ role: 'user', content: 'Search the docs.' }],
    options: {
      model: 'gpt-5.2',
      providerRuntimeSettings: {
        transportMode: 'responses_websocket_experimental',
      },
      onProviderToolStatus: (payload) => seenStatuses.push(payload),
      onProviderToolOutput: (payload) => seenOutputs.push(payload),
    },
  })

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
      type: 'response.code_interpreter_call_code.delta',
      item_id: 'ci_call_1',
      delta: 'print(42)',
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
        id: 'resp_ws_live_tools_1',
        model: 'gpt-5.2',
        status: 'completed',
        output_text: 'Done.',
        output: [{
          id: 'ws_call_1',
          type: 'web_search_call',
          status: 'completed',
        }],
        usage: {
          input_tokens: 6,
          output_tokens: 1,
          total_tokens: 7,
        },
      },
    }),
  })

  const payload = await streamPromise
  assert.equal(payload.text, 'Done.')
  assert.equal(seenStatuses.some((row) => row.type === 'tool-input-start' && row.toolName === 'web_search'), true)
  assert.equal(seenStatuses.some((row) => row.type === 'tool-input-delta' && row.toolName === 'code_interpreter' && row.delta === 'print(42)'), true)
  assert.equal(seenOutputs.some((row) => row.toolName === 'web_search'), true)
})

test('openai websocket runtime reuses a pooled thread socket for sequential turns', async () => {
  const socket = new FakeSocket()
  let factoryCallCount = 0
  __setOpenAIResponsesWebSocketFactoryForTests(() => {
    factoryCallCount += 1
    return socket
  })

  const firstStreamPromise = createExperimentalOpenAIResponsesWebSocketStream({
    apiKey: 'sk-test',
    messages: [{ role: 'user', content: 'First turn.' }],
    options: {
      model: 'gpt-5.2',
      requestContext: {
        threadId: 'thread-pooled-1',
      },
      providerRuntimeSettings: {
        transportMode: 'responses_websocket_experimental',
      },
    },
  })

  socket.emit('open')
  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.completed',
      response: {
        id: 'resp_ws_pool_1',
        model: 'gpt-5.2',
        status: 'completed',
        output_text: 'First done.',
        output: [],
        usage: {
          input_tokens: 4,
          output_tokens: 2,
          total_tokens: 6,
        },
      },
    }),
  })

  const firstPayload = await firstStreamPromise
  assert.equal(firstPayload.text, 'First done.')
  assert.equal(factoryCallCount, 1)
  assert.equal(socket.sent.length, 1)

  const secondStreamPromise = createExperimentalOpenAIResponsesWebSocketStream({
    apiKey: 'sk-test',
    messages: [{ role: 'user', content: 'Second turn.' }],
    options: {
      model: 'gpt-5.2',
      requestContext: {
        threadId: 'thread-pooled-1',
      },
      providerRuntimeSettings: {
        transportMode: 'responses_websocket_experimental',
      },
    },
  })

  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(factoryCallCount, 1)
  assert.equal(socket.sent.length, 2)
  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.completed',
      response: {
        id: 'resp_ws_pool_2',
        model: 'gpt-5.2',
        status: 'completed',
        output_text: 'Second done.',
        output: [],
        usage: {
          input_tokens: 4,
          output_tokens: 2,
          total_tokens: 6,
        },
      },
    }),
  })

  const secondPayload = await secondStreamPromise
  assert.equal(secondPayload.text, 'Second done.')
  assert.equal(factoryCallCount, 1)
  assert.equal(secondPayload.providerResponseMeta.websocketPooledConnection, true)
  assert.equal(secondPayload.providerResponseMeta.websocketReusedConnection, true)
  assert.equal(secondPayload.providerResponseMeta.websocketReuseMode, 'thread_socket_reused')
})

test('openai websocket runtime rotates an aged pooled thread socket instead of reusing it', async () => {
  const realDateNow = Date.now
  let fakeNow = 1_000_000
  Date.now = () => fakeNow

  try {
    const firstSocket = new FakeSocket()
    const secondSocket = new FakeSocket()
    let factoryCallCount = 0
    __setOpenAIResponsesWebSocketFactoryForTests(() => {
      factoryCallCount += 1
      return factoryCallCount === 1 ? firstSocket : secondSocket
    })

    const firstStreamPromise = createExperimentalOpenAIResponsesWebSocketStream({
      apiKey: 'sk-test',
      messages: [{ role: 'user', content: 'First turn.' }],
      options: {
        model: 'gpt-5.2',
        requestContext: {
          threadId: 'thread-aged-1',
        },
        providerRuntimeSettings: {
          transportMode: 'responses_websocket_experimental',
        },
      },
    })

    firstSocket.emit('open')
    firstSocket.emit('message', {
      data: JSON.stringify({
        type: 'response.completed',
        response: {
          id: 'resp_ws_aged_1',
          model: 'gpt-5.2',
          status: 'completed',
          output_text: 'First done.',
          output: [],
          usage: {
            input_tokens: 4,
            output_tokens: 2,
            total_tokens: 6,
          },
        },
      }),
    })

    const firstPayload = await firstStreamPromise
    assert.equal(firstPayload.providerResponseMeta.websocketReuseMode, 'thread_socket_fresh')
    assert.equal(factoryCallCount, 1)

    fakeNow += 56 * 60 * 1000

    const secondStreamPromise = createExperimentalOpenAIResponsesWebSocketStream({
      apiKey: 'sk-test',
      messages: [{ role: 'user', content: 'Second turn.' }],
      options: {
        model: 'gpt-5.2',
        requestContext: {
          threadId: 'thread-aged-1',
        },
        providerRuntimeSettings: {
          transportMode: 'responses_websocket_experimental',
        },
      },
    })

    secondSocket.emit('open')
    secondSocket.emit('message', {
      data: JSON.stringify({
        type: 'response.completed',
        response: {
          id: 'resp_ws_aged_2',
          model: 'gpt-5.2',
          status: 'completed',
          output_text: 'Second done.',
          output: [],
          usage: {
            input_tokens: 4,
            output_tokens: 2,
            total_tokens: 6,
          },
        },
      }),
    })

    const secondPayload = await secondStreamPromise
    assert.equal(factoryCallCount, 2)
    assert.equal(secondPayload.providerResponseMeta.websocketReusedConnection, false)
    assert.equal(secondPayload.providerResponseMeta.websocketReuseMode, 'thread_socket_fresh')
  } finally {
    Date.now = realDateNow
  }
})
