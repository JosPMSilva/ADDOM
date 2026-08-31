import test from 'node:test'
import assert from 'node:assert/strict'

import {
  __setOpenAIResponsesWebSocketStreamTimeoutMsForTests,
  __setOpenAIResponsesWebSocketReconnectWaitForTests,
  __setOpenAIResponsesWebSocketFactoryForTests,
  __toWebSocketUrlForTests,
  createExperimentalOpenAIResponsesWebSocketStream,
} from '../../src/main/api-clients/experimental/openai-websocket/openai-websocket-runtime.mjs'
import { FakeSocket, registerOpenAIWebSocketRuntimeTestCleanup } from './openai-websocket-runtime-test-helpers.mjs'

registerOpenAIWebSocketRuntimeTestCleanup()

test('openai websocket runtime upgrades secure HTTPS base URLs to WSS responses endpoints', () => {
  assert.equal(
    __toWebSocketUrlForTests('https://api.openai.com/v1'),
    'wss://api.openai.com/v1/responses',
  )
})

test('openai websocket runtime rejects insecure non-loopback base URLs', () => {
  process.env.NODE_ENV = 'production'
  assert.throws(
    () => __toWebSocketUrlForTests('http://api.openai.com/v1'),
    /outside local loopback development/i,
  )
})

test('openai websocket runtime rejects insecure loopback base URLs in production', () => {
  process.env.NODE_ENV = 'production'
  assert.throws(
    () => __toWebSocketUrlForTests('http://127.0.0.1:4010/v1'),
    /secure https\/wss base url in production/i,
  )
})

test('openai websocket runtime allows insecure loopback base URLs only outside production', () => {
  process.env.NODE_ENV = 'test'
  process.env.ADDOM_DEV = '1'
  assert.equal(
    __toWebSocketUrlForTests('http://127.0.0.1:4010/v1'),
    'ws://127.0.0.1:4010/v1/responses',
  )
})

test('openai websocket runtime streams text and reasoning, then returns normalized response metadata', async () => {
  const socket = new FakeSocket()
  __setOpenAIResponsesWebSocketFactoryForTests(() => socket)

  const textDeltas = []
  const reasoningDeltas = []
  const streamPromise = createExperimentalOpenAIResponsesWebSocketStream({
    apiKey: 'sk-test',
    messages: [
      { role: 'system', content: 'You are ADDOM.' },
      { role: 'user', content: 'Continue.' },
    ],
    options: {
      model: 'gpt-5.4',
      providerRuntimeSettings: {
        transportMode: 'responses_websocket_experimental',
        useServerSideCompaction: true,
        serverSideCompactionThresholdTokens: 180_000,
      },
      requestContext: {
        projectId: 'project-runtime',
        threadId: 'thread-runtime',
        openai: {
          store: true,
          previousResponseId: 'resp_prev_1',
        },
      },
    },
    onChunk: (chunk) => textDeltas.push(chunk),
    onReasoning: (chunk) => reasoningDeltas.push(chunk),
  })

  socket.emit('open')
  assert.equal(socket.sent.length, 1)
  const sentPayload = JSON.parse(socket.sent[0])
  assert.equal(sentPayload.type, 'response.create')
  assert.equal(sentPayload.previous_response_id, 'resp_prev_1')
  assert.equal(sentPayload.context_management, undefined)

  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.reasoning_summary_text.delta',
      delta: 'Thinking...',
    }),
  })
  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.output_text.delta',
      delta: 'Hello',
    }),
  })
  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.output_item.added',
      item: {
        type: 'compaction',
        id: 'cmp_auto_ws_1',
      },
    }),
  })
  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.completed',
      response: {
        id: 'resp_ws_1',
        model: 'gpt-5.4',
        status: 'completed',
        output_text: 'Hello',
        output: [{ type: 'compaction', id: 'cmp_auto_ws_1' }],
        usage: {
          input_tokens: 10,
          output_tokens: 4,
          total_tokens: 14,
        },
      },
    }),
  })

  const payload = await streamPromise
  assert.deepEqual(textDeltas, ['Hello'])
  assert.deepEqual(reasoningDeltas, ['Thinking...'])
  assert.equal(payload.stopReason, 'stop')
  assert.equal(payload.text, 'Hello')
  assert.equal(payload.reasoning, 'Thinking...')
  assert.equal(payload.providerResponseMeta.responseId, 'resp_ws_1')
  assert.equal(payload.providerResponseMeta.transportMode, 'responses_websocket_experimental')
  assert.equal(payload.providerResponseMeta.websocketPooledConnection, true)
  assert.equal(payload.providerResponseMeta.websocketReusedConnection, false)
  assert.equal(payload.providerResponseMeta.websocketReuseMode, 'thread_socket_fresh')
  assert.equal(payload.providerResponseMeta.autoCompactionApplied, true)
  assert.deepEqual(payload.providerResponseMeta.autoCompactionIds, ['cmp_auto_ws_1'])
})

test('openai websocket runtime resets stale timeout when progress keeps arriving', async () => {
  const socket = new FakeSocket()
  __setOpenAIResponsesWebSocketFactoryForTests(() => socket)

  const streamPromise = createExperimentalOpenAIResponsesWebSocketStream({
    apiKey: 'sk-test',
    messages: [
      { role: 'system', content: 'You are ADDOM.' },
      { role: 'user', content: 'Continue.' },
    ],
    options: {
      model: 'gpt-5.4',
      providerRuntimeSettings: {
        transportMode: 'responses_websocket_experimental',
      },
      streamIdleTimeoutMs: 100,
    },
  })

  socket.emit('open')
  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.output_text.delta',
      delta: 'A',
    }),
  })
  await new Promise((resolve) => setTimeout(resolve, 65))
  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.reasoning_text.delta',
      delta: 'Thinking',
    }),
  })
  await new Promise((resolve) => setTimeout(resolve, 65))
  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.completed',
      response: {
        id: 'resp_ws_progress_1',
        model: 'gpt-5.4',
        status: 'completed',
        output_text: 'A',
        output: [],
      },
    }),
  })

  const payload = await streamPromise
  assert.equal(payload.text, 'A')
  assert.equal(payload.stopReason, 'stop')
})

test('openai websocket runtime fails stale after silence following initial progress', async () => {
  const socket = new FakeSocket()
  __setOpenAIResponsesWebSocketFactoryForTests(() => socket)

  const streamPromise = createExperimentalOpenAIResponsesWebSocketStream({
    apiKey: 'sk-test',
    messages: [
      { role: 'system', content: 'You are ADDOM.' },
      { role: 'user', content: 'Continue.' },
    ],
    options: {
      model: 'gpt-5.4',
      providerRuntimeSettings: {
        transportMode: 'responses_websocket_experimental',
      },
      streamIdleTimeoutMs: 25,
    },
  })

  socket.emit('open')
  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.reasoning_text.delta',
      delta: 'Thinking',
    }),
  })

  await assert.rejects(
    streamPromise,
    (error) => (
      String(error?.code || '') === 'openai_websocket_stream_stale'
      && error?.streamStale === true
    ),
  )
})

test('openai websocket runtime throws an explicit ineligible error before connecting', async () => {
  await assert.rejects(
    createExperimentalOpenAIResponsesWebSocketStream({
      apiKey: 'sk-test',
      messages: [{
        role: 'user',
        content: [{ type: 'file', filename: 'spec.pdf', mediaType: 'application/pdf' }],
      }],
      options: {
        model: 'gpt-5.4',
        providerRuntimeSettings: {
          transportMode: 'responses_websocket_experimental',
        },
      },
    }),
    (error) => (
      String(error?.code || '') === 'openai_websocket_ineligible'
      && String(error?.openaiWebSocketFallbackReason || '') === 'input_file_missing_data'
    ),
  )
})

test('openai websocket runtime can warm request state before creating the generated response', async () => {
  const socket = new FakeSocket()
  __setOpenAIResponsesWebSocketFactoryForTests(() => socket)

  const streamPromise = createExperimentalOpenAIResponsesWebSocketStream({
    apiKey: 'sk-test',
    messages: [
      { role: 'system', content: 'You are ADDOM.' },
      { role: 'user', content: 'Continue.' },
    ],
    options: {
      model: 'gpt-5.4',
      providerRuntimeSettings: {
        transportMode: 'responses_websocket_experimental',
        websocketWarmupEnabled: true,
      },
    },
  })
  socket.emit('open')
  assert.equal(socket.sent.length, 1)
  const warmupPayload = JSON.parse(socket.sent[0])
  assert.equal(warmupPayload.type, 'response.create')
  assert.equal(warmupPayload.generate, false)
  assert.deepEqual(warmupPayload.input, [
    { type: 'message', role: 'system', content: 'You are ADDOM.' },
  ])

  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.completed',
      response: {
        id: 'resp_warmup_1',
        model: 'gpt-5.4',
        status: 'completed',
        output: [],
      },
    }),
  })

  assert.equal(socket.sent.length, 2)
  const createPayload = JSON.parse(socket.sent[1])
  assert.equal(createPayload.type, 'response.create')
  assert.equal(createPayload.previous_response_id, 'resp_warmup_1')
  assert.deepEqual(createPayload.input, [
    { type: 'message', role: 'user', content: 'Continue.' },
  ])

  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.completed',
      response: {
        id: 'resp_ws_warm_1',
        model: 'gpt-5.4',
        status: 'completed',
        output_text: 'Done.',
        output: [],
        usage: {
          input_tokens: 6,
          output_tokens: 2,
          total_tokens: 8,
        },
      },
    }),
  })

  const payload = await streamPromise
  assert.equal(payload.text, 'Done.')
  assert.equal(payload.providerResponseMeta.responseId, 'resp_ws_warm_1')
})

test('openai websocket runtime can warm request state for simple custom-tool turns', async () => {
  const socket = new FakeSocket()
  __setOpenAIResponsesWebSocketFactoryForTests(() => socket)

  const streamPromise = createExperimentalOpenAIResponsesWebSocketStream({
    apiKey: 'sk-test',
    messages: [
      { role: 'system', content: 'You are ADDOM.' },
      { role: 'user', content: 'Read the file.' },
    ],
    options: {
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
        websocketWarmupEnabled: true,
      },
    },
  })

  socket.emit('open')
  const warmupPayload = JSON.parse(socket.sent[0])
  assert.equal(warmupPayload.generate, false)
  assert.equal(warmupPayload.tools?.[0]?.name, 'read_file')
  assert.deepEqual(warmupPayload.input, [
    { type: 'message', role: 'system', content: 'You are ADDOM.' },
  ])

  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.completed',
      response: {
        id: 'resp_warmup_tool_1',
        model: 'gpt-5.4',
        status: 'completed',
        output: [],
      },
    }),
  })

  const generatedPayload = JSON.parse(socket.sent[1])
  assert.equal(generatedPayload.previous_response_id, 'resp_warmup_tool_1')
  assert.equal(generatedPayload.tools?.[0]?.name, 'read_file')
  assert.deepEqual(generatedPayload.input, [
    { type: 'message', role: 'user', content: 'Read the file.' },
  ])

  socket.emit('message', {
    data: JSON.stringify({
      type: 'response.completed',
      response: {
        id: 'resp_ws_warm_tool_1',
        model: 'gpt-5.4',
        status: 'completed',
        output_text: 'Done.',
        output: [],
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
  assert.equal(payload.providerResponseMeta.responseId, 'resp_ws_warm_tool_1')
})

test('openai websocket runtime reconnects once when the connection limit is reached before any output', async () => {
  const firstSocket = new FakeSocket()
  const secondSocket = new FakeSocket()
  let factoryCallCount = 0
  const transportStatuses = []
  __setOpenAIResponsesWebSocketReconnectWaitForTests(async () => {})
  __setOpenAIResponsesWebSocketFactoryForTests(() => {
    factoryCallCount += 1
    return factoryCallCount === 1 ? firstSocket : secondSocket
  })

  const streamPromise = createExperimentalOpenAIResponsesWebSocketStream({
    apiKey: 'sk-test',
    messages: [
      { role: 'system', content: 'You are ADDOM.' },
      { role: 'user', content: 'Continue.' },
    ],
    options: {
      model: 'gpt-5.4',
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
        id: 'resp_ws_limit_1',
        model: 'gpt-5.4',
        status: 'failed',
        error: {
          code: 'websocket_connection_limit_reached',
          message: 'connection lifetime exceeded',
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
        id: 'resp_ws_limit_2',
        model: 'gpt-5.4',
        status: 'completed',
        output_text: 'Recovered after reconnect.',
        output: [],
        usage: {
          input_tokens: 6,
          output_tokens: 3,
          total_tokens: 9,
        },
      },
    }),
  })

  const payload = await streamPromise
  assert.equal(factoryCallCount, 2)
  assert.equal(payload.text, 'Recovered after reconnect.')
  assert.equal(JSON.parse(firstSocket.sent[0]).type, 'response.create')
  assert.equal(JSON.parse(secondSocket.sent[0]).type, 'response.create')
  assert.equal(transportStatuses[0]?.status, 'reconnecting')
  assert.equal(transportStatuses[0]?.attempt, 1)
  assert.equal(transportStatuses[1]?.status, 'recovered')
})

test('openai websocket runtime reconnects once when the socket closes before a terminal event and no output was emitted', async () => {
  const firstSocket = new FakeSocket()
  const secondSocket = new FakeSocket()
  let factoryCallCount = 0
  __setOpenAIResponsesWebSocketReconnectWaitForTests(async () => {})
  __setOpenAIResponsesWebSocketFactoryForTests(() => {
    factoryCallCount += 1
    return factoryCallCount === 1 ? firstSocket : secondSocket
  })

  const streamPromise = createExperimentalOpenAIResponsesWebSocketStream({
    apiKey: 'sk-test',
    messages: [
      { role: 'system', content: 'You are ADDOM.' },
      { role: 'user', content: 'Continue.' },
    ],
    options: {
      model: 'gpt-5.4',
      providerRuntimeSettings: {
        transportMode: 'responses_websocket_experimental',
      },
    },
  })

  firstSocket.emit('open')
  firstSocket.emit('close', {
    reason: 'connection lifetime exceeded',
  })

  await new Promise((resolve) => setTimeout(resolve, 10))
  secondSocket.emit('open')
  secondSocket.emit('message', {
    data: JSON.stringify({
      type: 'response.completed',
      response: {
        id: 'resp_ws_recover_close_1',
        model: 'gpt-5.4',
        status: 'completed',
        output_text: 'Recovered after close.',
        output: [],
        usage: {
          input_tokens: 6,
          output_tokens: 3,
          total_tokens: 9,
        },
      },
    }),
  })

  const payload = await streamPromise
  assert.equal(factoryCallCount, 2)
  assert.equal(payload.text, 'Recovered after close.')
  assert.equal(payload.providerResponseMeta.websocketReuseMode, 'unpooled_socket')
})

test('openai websocket runtime retries up to 6 times before surfacing reconnect exhaustion', async () => {
  let factoryCallCount = 0
  const sockets = Array.from({ length: 7 }, () => new FakeSocket())
  const transportStatuses = []
  __setOpenAIResponsesWebSocketReconnectWaitForTests(async () => {})
  __setOpenAIResponsesWebSocketFactoryForTests(() => {
    const socket = sockets[factoryCallCount]
    factoryCallCount += 1
    return socket
  })

  const streamPromise = createExperimentalOpenAIResponsesWebSocketStream({
    apiKey: 'sk-test',
    messages: [
      { role: 'system', content: 'You are ADDOM.' },
      { role: 'user', content: 'Continue.' },
    ],
    options: {
      model: 'gpt-5.4',
      providerRuntimeSettings: {
        transportMode: 'responses_websocket_experimental',
        websocketFallbackToStream: true,
      },
      onTransportStatus: (payload) => transportStatuses.push(payload),
    },
  })
  let capturedError = null
  const streamOutcomePromise = streamPromise
    .then((value) => ({ value, error: null }))
    .catch((error) => {
      capturedError = error
      return { value: null, error }
    })

  const emitPromise = (async () => {
    for (const socket of sockets) {
      socket.emit('open')
      socket.emit('message', {
        data: JSON.stringify({
          type: 'response.failed',
          response: {
            id: `resp_ws_limit_${factoryCallCount}`,
            model: 'gpt-5.4',
            status: 'failed',
            error: {
              code: 'websocket_connection_limit_reached',
              message: 'connection lifetime exceeded',
            },
          },
        }),
      })
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  })()

  const [{ error }] = await Promise.all([streamOutcomePromise, emitPromise])
  assert.equal(error, capturedError)
  assert.equal(error?.openaiWebSocketReconnectExhausted, true)
  assert.equal(error?.openaiWebSocketReconnectAttempt, 6)
  assert.equal(error?.openaiWebSocketFallbackRecommended, true)
  assert.equal(factoryCallCount, 7)
  assert.equal(transportStatuses.filter((row) => row.status === 'reconnecting').length, 6)
  assert.equal(transportStatuses.at(-1)?.status, 'exhausted')
  assert.equal(transportStatuses.at(-1)?.attempt, 6)
})

test('openai websocket runtime keeps reconnects inside a single turn timeout budget', async () => {
  const realDateNow = Date.now
  let fakeNow = 1_000
  Date.now = () => fakeNow

  try {
    let factoryCallCount = 0
    const sockets = Array.from({ length: 2 }, () => new FakeSocket())
    const transportStatuses = []
    __setOpenAIResponsesWebSocketStreamTimeoutMsForTests(9_000)
    __setOpenAIResponsesWebSocketReconnectWaitForTests(async () => {
      fakeNow += 5_000
    })
    __setOpenAIResponsesWebSocketFactoryForTests(() => {
      const socket = sockets[factoryCallCount]
      factoryCallCount += 1
      return socket
    })

    const streamPromise = createExperimentalOpenAIResponsesWebSocketStream({
      apiKey: 'sk-test',
      messages: [{ role: 'user', content: 'Continue.' }],
      options: {
        model: 'gpt-5.4',
        providerRuntimeSettings: {
          transportMode: 'responses_websocket_experimental',
          websocketFallbackToStream: false,
        },
        onTransportStatus: (payload) => transportStatuses.push(payload),
      },
    })
    let capturedError = null
    const streamOutcomePromise = streamPromise
      .then((value) => ({ value, error: null }))
      .catch((error) => {
        capturedError = error
        return { value: null, error }
      })

    for (const socket of sockets) {
      socket.emit('open')
      socket.emit('message', {
        data: JSON.stringify({
          type: 'response.failed',
          response: {
            id: `resp_ws_limit_budget_${factoryCallCount}`,
            model: 'gpt-5.4',
            status: 'failed',
            error: {
              code: 'websocket_connection_limit_reached',
              message: 'connection lifetime exceeded',
            },
          },
        }),
      })
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    const { error } = await streamOutcomePromise
    assert.equal(error, capturedError)
    assert.equal(String(error?.code || ''), 'openai_websocket_turn_timeout')
    assert.equal(error?.openaiWebSocketReconnectAttempt, 2)
    assert.equal(factoryCallCount, 2)
    assert.equal(transportStatuses.filter((row) => row.status === 'reconnecting').length, 1)
  } finally {
    Date.now = realDateNow
  }
})
