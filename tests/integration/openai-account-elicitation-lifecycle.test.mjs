import assert from 'node:assert/strict'
import test from 'node:test'

import {
  __resetOpenAIAccountPendingMcpElicitationsForTests,
  getOpenAIAccountPendingMcpElicitation,
  registerOpenAIAccountPendingMcpElicitation,
  respondToOpenAIAccountPendingMcpElicitation,
} from '../../src/main/api-clients/ai-provider-openai-account-elicitation-pending.mjs'
import {
  normalizeOpenAIAccountMcpElicitationRequest,
} from '../../src/main/api-clients/ai-provider-openai-account-elicitation.mjs'

function buildElicitation() {
  return normalizeOpenAIAccountMcpElicitationRequest({
    threadId: 'provider_thread_1',
    turnId: 'provider_turn_1',
    serverName: 'example-mcp',
    mode: 'form',
    message: 'Choose a target.',
    requestedSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          enum: ['staging', 'production'],
        },
      },
      required: ['target'],
    },
  }).elicitation
}

test.beforeEach(() => {
  __resetOpenAIAccountPendingMcpElicitationsForTests()
})

test.afterEach(() => {
  __resetOpenAIAccountPendingMcpElicitationsForTests()
})

test('pending MCP elicitation returns only its safe form and never persists submitted values', async () => {
  const responses = []
  const resolved = []
  registerOpenAIAccountPendingMcpElicitation({
    bridge: {
      respond: async (id, payload) => {
        responses.push({ id, payload })
      },
    },
    bridgeRequestId: 41,
    appThreadId: 'app_thread_1',
    providerThreadId: 'provider_thread_1',
    providerTurnId: 'provider_turn_1',
    elicitation: buildElicitation(),
    onResolved: (payload) => resolved.push(payload),
  })

  const pending = getOpenAIAccountPendingMcpElicitation({
    threadId: 'app_thread_1',
  })
  assert.equal(pending.message, 'Choose a target.')
  assert.equal(JSON.stringify(pending).includes('submitted'), false)

  await respondToOpenAIAccountPendingMcpElicitation({
    threadId: 'app_thread_1',
    action: 'accept',
    content: { target: 'production' },
  })

  assert.deepEqual(responses, [{
    id: 41,
    payload: {
      action: 'accept',
      content: { target: 'production' },
      _meta: null,
    },
  }])
  assert.deepEqual(resolved, [{
    threadId: 'app_thread_1',
    providerThreadId: 'provider_thread_1',
    providerTurnId: 'provider_turn_1',
    action: 'accept',
    reason: 'responded',
  }])
  assert.equal(JSON.stringify(resolved).includes('production'), false)
  assert.equal(getOpenAIAccountPendingMcpElicitation({ threadId: 'app_thread_1' }), null)
})

test('pending MCP elicitation rejects wrong-thread and invalid submissions without resolving', async () => {
  const responses = []
  registerOpenAIAccountPendingMcpElicitation({
    bridge: {
      respond: async (id, payload) => responses.push({ id, payload }),
    },
    bridgeRequestId: 42,
    appThreadId: 'app_thread_1',
    providerThreadId: 'provider_thread_1',
    providerTurnId: 'provider_turn_1',
    elicitation: buildElicitation(),
  })

  await assert.rejects(
    respondToOpenAIAccountPendingMcpElicitation({
      threadId: 'other_thread',
      action: 'accept',
      content: { target: 'staging' },
    }),
    /no longer pending/i,
  )
  await assert.rejects(
    respondToOpenAIAccountPendingMcpElicitation({
      threadId: 'app_thread_1',
      action: 'accept',
      content: { target: 'unknown' },
    }),
    /invalid/i,
  )
  assert.deepEqual(responses, [])
  assert.ok(getOpenAIAccountPendingMcpElicitation({ threadId: 'app_thread_1' }))
})

test('pending MCP elicitation is visible and actionable only to its originating renderer', async () => {
  const responses = []
  registerOpenAIAccountPendingMcpElicitation({
    bridge: {
      respond: async (id, payload) => responses.push({ id, payload }),
    },
    bridgeRequestId: 44,
    appThreadId: 'app_thread_1',
    providerThreadId: 'provider_thread_1',
    providerTurnId: 'provider_turn_1',
    rendererSenderId: 7,
    elicitation: buildElicitation(),
  })

  assert.equal(getOpenAIAccountPendingMcpElicitation({
    threadId: 'app_thread_1',
    senderId: 8,
  }), null)
  assert.ok(getOpenAIAccountPendingMcpElicitation({
    threadId: 'app_thread_1',
    senderId: 7,
  }))
  await assert.rejects(
    respondToOpenAIAccountPendingMcpElicitation({
      threadId: 'app_thread_1',
      senderId: 8,
      action: 'accept',
      content: { target: 'staging' },
    }),
    /another renderer/i,
  )

  await respondToOpenAIAccountPendingMcpElicitation({
    threadId: 'app_thread_1',
    senderId: 7,
    action: 'accept',
    content: { target: 'staging' },
  })
  assert.equal(responses.length, 1)
})

test('pending MCP elicitation decline returns no content or metadata', async () => {
  const responses = []
  registerOpenAIAccountPendingMcpElicitation({
    bridge: {
      respond: async (id, payload) => responses.push({ id, payload }),
    },
    bridgeRequestId: 43,
    appThreadId: 'app_thread_1',
    providerThreadId: 'provider_thread_1',
    providerTurnId: 'provider_turn_1',
    elicitation: buildElicitation(),
  })

  await respondToOpenAIAccountPendingMcpElicitation({
    threadId: 'app_thread_1',
    action: 'decline',
  })

  assert.deepEqual(responses, [{
    id: 43,
    payload: {
      action: 'decline',
      content: null,
      _meta: null,
    },
  }])
})

test('pending MCP elicitation cancels when its renderer is destroyed', async () => {
  const responses = []
  let rendererDestroyed = null
  registerOpenAIAccountPendingMcpElicitation({
    bridge: {
      respond: async (id, payload) => responses.push({ id, payload }),
    },
    bridgeRequestId: 45,
    appThreadId: 'app_thread_1',
    providerThreadId: 'provider_thread_1',
    providerTurnId: 'provider_turn_1',
    rendererSenderId: 7,
    subscribeRendererDestroyed: (callback) => {
      rendererDestroyed = callback
      return () => {
        rendererDestroyed = null
      }
    },
    elicitation: buildElicitation(),
  })

  rendererDestroyed()
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(getOpenAIAccountPendingMcpElicitation({
    threadId: 'app_thread_1',
    senderId: 7,
  }), null)
  assert.equal(responses[0].payload.action, 'cancel')
})

test('pending MCP elicitation cancels when its owning turn aborts', async () => {
  const responses = []
  const controller = new AbortController()
  registerOpenAIAccountPendingMcpElicitation({
    bridge: {
      respond: async (id, payload) => responses.push({ id, payload }),
    },
    bridgeRequestId: 46,
    appThreadId: 'app_thread_1',
    providerThreadId: 'provider_thread_1',
    providerTurnId: 'provider_turn_1',
    rendererSenderId: 7,
    abortSignal: controller.signal,
    elicitation: buildElicitation(),
  })

  controller.abort()
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(getOpenAIAccountPendingMcpElicitation({
    threadId: 'app_thread_1',
    senderId: 7,
  }), null)
  assert.equal(responses[0].payload.action, 'cancel')
})
