import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createSharedStreamWithTools,
  __resetSharedStreamTextForTests,
  __setSharedStreamTextForTests,
} from '../../src/main/api-clients/ai-provider-adapter-core.mjs'

test.afterEach(() => {
  __resetSharedStreamTextForTests()
})

function createTestAdapter() {
  return {
    buildModel() {
      return { id: 'fake-model' }
    },
    buildProviderOptions() {
      return undefined
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
        openaiOptions: null,
      }
    },
  }
}

function createCapabilityAwareTestAdapter({ onResolveCapabilities = null } = {}) {
  return {
    ...createTestAdapter(),
    async resolveCapabilities(args = {}) {
      if (typeof onResolveCapabilities === 'function') {
        return onResolveCapabilities(args)
      }
      return {
        supportsTools: true,
      }
    },
  }
}

function createFakeStreamText({
  events = [],
  finalText = 'Done.',
  finalReasoning = '',
  finalReasoningParts = [],
  finalProviderMetadata = null,
  finishReason = 'stop',
  finalDelayMs = 0,
} = {}) {
  return async ({ onChunk, abortSignal }) => {
    const normalizedEvents = Array.isArray(events) ? events : []
    const timers = []
    let text = ''
    let reasoning = ''
    let settled = false
    let handleAbort = () => {}

    const cleanup = () => {
      while (timers.length > 0) {
        clearTimeout(timers.pop())
      }
      try {
        abortSignal?.removeEventListener?.('abort', handleAbort)
      } catch {
        // Best effort only.
      }
    }

    const textPromise = new Promise((resolve, reject) => {
      const finishAt = normalizedEvents.reduce((max, row) => {
        const at = Math.max(0, Number(row?.at || 0) || 0)
        return Math.max(max, at)
      }, 0) + Math.max(0, Number(finalDelayMs || 0) || 0)

      const complete = () => {
        if (settled) return
        settled = true
        cleanup()
        resolve(finalText || text)
      }

      const fail = (error) => {
        if (settled) return
        settled = true
        cleanup()
        reject(error)
      }

      handleAbort = () => {
        fail(abortSignal?.reason || new Error('aborted'))
      }

      if (abortSignal?.aborted) {
        handleAbort()
        return
      }

      try {
        abortSignal?.addEventListener?.('abort', handleAbort, { once: true })
      } catch {
        // Best effort only.
      }

      for (const event of normalizedEvents) {
        timers.push(setTimeout(() => {
          if (settled) return
          if (event?.type === 'text-delta') {
            text += String(event.delta ?? event.text ?? '')
          } else if (event?.type === 'reasoning-delta') {
            reasoning += String(event.delta ?? event.text ?? '')
          }
          onChunk({ chunk: event })
        }, Math.max(0, Number(event?.at || 0) || 0)))
      }

      timers.push(setTimeout(complete, finishAt))
    })

    return {
      text: textPromise,
      reasoningText: Promise.resolve(finalReasoning || reasoning),
      reasoning: Promise.resolve(Array.isArray(finalReasoningParts) ? finalReasoningParts : []),
      toolCalls: Promise.resolve([]),
      finishReason: Promise.resolve(finishReason),
      usage: Promise.resolve(null),
      providerMetadata: Promise.resolve(finalProviderMetadata),
      response: Promise.resolve(null),
      warnings: Promise.resolve([]),
    }
  }
}

test('shared stream does not stale while text deltas keep arriving', async () => {
  __setSharedStreamTextForTests(createFakeStreamText({
    events: [
      { type: 'text-delta', delta: 'A', at: 0 },
      { type: 'text-delta', delta: 'B', at: 15 },
      { type: 'text-delta', delta: 'C', at: 30 },
    ],
    finalText: 'ABC',
    finalDelayMs: 10,
  }))

  const payload = await createSharedStreamWithTools({
    adapter: createTestAdapter(),
    providerId: 'openai',
    apiKey: 'sk-test',
    messages: [{ role: 'user', content: 'Hi' }],
    options: {
      model: 'gpt-test',
      streamTimeoutMs: 120,
      streamIdleTimeoutMs: 40,
    },
  })

  assert.equal(payload.text, 'ABC')
  assert.equal(payload.stopReason, 'stop')
})

test('shared stream preserves whitespace-only text and reasoning deltas in provider order', async () => {
  __setSharedStreamTextForTests(createFakeStreamText({
    events: [
      { type: 'text-delta', delta: 'Heading', at: 0 },
      { type: 'text-delta', delta: '\n', at: 1 },
      { type: 'text-delta', delta: '- item', at: 2 },
      { type: 'reasoning-delta', delta: 'Inspect', at: 3 },
      { type: 'reasoning-delta', delta: '\n', at: 4 },
      { type: 'reasoning-delta', delta: 'Verify', at: 5 },
    ],
    finalText: 'Heading\n- item',
    finalReasoning: 'Inspect\nVerify',
  }))

  const textChunks = []
  const reasoningChunks = []
  await createSharedStreamWithTools({
    adapter: createTestAdapter(),
    providerId: 'openai',
    apiKey: 'sk-test',
    messages: [{ role: 'user', content: 'Hi' }],
    options: {
      model: 'gpt-test',
      streamTimeoutMs: 120,
      streamIdleTimeoutMs: 40,
    },
    onChunk(delta) {
      textChunks.push(delta)
    },
    onReasoning(delta) {
      reasoningChunks.push(delta)
    },
  })

  assert.deepEqual(textChunks, ['Heading', '\n', '- item'])
  assert.deepEqual(reasoningChunks, ['Inspect', '\n', 'Verify'])
})

test('shared stream routes interleaved OpenRouter Codex text deltas into reasoning', async () => {
  __setSharedStreamTextForTests(createFakeStreamText({
    events: [
      { type: 'text-delta', delta: 'First step. ', at: 0 },
      { type: 'text-delta', delta: 'Second step.', at: 10 },
    ],
    finalText: 'Final answer.',
  }))

  const textChunks = []
  const reasoningChunks = []
  const payload = await createSharedStreamWithTools({
    adapter: createTestAdapter(),
    providerId: 'openrouter',
    apiKey: 'sk-test',
    messages: [{ role: 'user', content: 'Hi' }],
    options: {
      model: 'openai/gpt-5.3-codex',
      streamTimeoutMs: 120,
      streamIdleTimeoutMs: 40,
    },
    onChunk(delta) {
      textChunks.push(delta)
    },
    onReasoning(delta) {
      reasoningChunks.push(delta)
    },
  })

  assert.deepEqual(textChunks, [])
  assert.deepEqual(reasoningChunks, ['First step. ', 'Second step.'])
  assert.equal(payload.text, 'Final answer.')
})

test('shared stream preserves final reasoning for non-interleaved OpenRouter OpenAI routes', async () => {
  __setSharedStreamTextForTests(createFakeStreamText({
    events: [
      { type: 'text-delta', delta: 'Visible answer prelude. ', at: 0 },
    ],
    finalText: 'Final answer.',
    finalReasoning: 'Final reasoning summary.',
  }))

  const textChunks = []
  const reasoningChunks = []
  const payload = await createSharedStreamWithTools({
    adapter: createTestAdapter(),
    providerId: 'openrouter',
    apiKey: 'sk-test',
    messages: [{ role: 'user', content: 'Hi' }],
    options: {
      model: 'openai/gpt-5.4',
      streamTimeoutMs: 120,
      streamIdleTimeoutMs: 40,
    },
    onChunk(delta) {
      textChunks.push(delta)
    },
    onReasoning(delta) {
      reasoningChunks.push(delta)
    },
  })

  assert.deepEqual(textChunks, ['Visible answer prelude. '])
  assert.deepEqual(reasoningChunks, [])
  assert.equal(payload.text, 'Final answer.')
  assert.equal(payload.reasoning, 'Final reasoning summary.')
})

test('shared stream captures provider-specific reasoning history parts from the adapter', async () => {
  __setSharedStreamTextForTests(createFakeStreamText({
    finalText: 'Final answer.',
    finalReasoningParts: [
      {
        type: 'reasoning',
        text: 'Anthropic thinking block.',
        providerMetadata: {
          anthropic: {
            signature: 'sig_123',
          },
        },
      },
      {
        type: 'reasoning',
        text: '',
        providerMetadata: {
          anthropic: {
            redactedData: 'redacted_blob',
          },
        },
      },
    ],
  }))

  const payload = await createSharedStreamWithTools({
    adapter: {
      ...createTestAdapter(),
      extractReasoningHistoryParts(reasoningParts = []) {
        return reasoningParts.map((part) => ({
          type: 'reasoning',
          text: String(part.text ?? ''),
          providerOptions: {
            anthropic: {
              ...(part?.providerMetadata?.anthropic?.signature
                ? { signature: part.providerMetadata.anthropic.signature }
                : {}),
              ...(part?.providerMetadata?.anthropic?.redactedData
                ? { redactedData: part.providerMetadata.anthropic.redactedData }
                : {}),
            },
          },
        }))
      },
    },
    providerId: 'anthropic',
    apiKey: 'sk-test',
    messages: [{ role: 'user', content: 'Hi' }],
    options: {
      model: 'claude-sonnet-4-6',
      streamTimeoutMs: 120,
      streamIdleTimeoutMs: 40,
    },
  })

  assert.deepEqual(payload.providerReasoningParts, [
    {
      type: 'reasoning',
      text: 'Anthropic thinking block.',
      providerOptions: {
        anthropic: {
          signature: 'sig_123',
        },
      },
    },
    {
      type: 'reasoning',
      text: '',
      providerOptions: {
        anthropic: {
          redactedData: 'redacted_blob',
        },
      },
    },
  ])
})

test('shared stream stale timeout resets on provider tool progress', async () => {
  __setSharedStreamTextForTests(createFakeStreamText({
    events: [
      {
        type: 'tool-input-start',
        id: 'tool_1',
        toolName: 'web_search',
        providerExecuted: true,
        at: 0,
      },
      {
        type: 'tool-result',
        toolCallId: 'tool_1',
        toolName: 'web_search',
        providerExecuted: true,
        output: { ok: true },
        at: 20,
      },
    ],
    finalText: '',
    finalDelayMs: 10,
  }))

  const payload = await createSharedStreamWithTools({
    adapter: createTestAdapter(),
    providerId: 'openai',
    apiKey: 'sk-test',
    messages: [{ role: 'user', content: 'Hi' }],
    options: {
      model: 'gpt-test',
      streamTimeoutMs: 120,
      streamIdleTimeoutMs: 35,
    },
  })

  assert.equal(Array.isArray(payload.providerToolStatuses), true)
  assert.equal(payload.providerToolStatuses.length > 0, true)
})

test('shared stream throws stale when no activity arrives from the start of the turn', async () => {
  __setSharedStreamTextForTests(createFakeStreamText({
    events: [],
    finalText: '',
    finalDelayMs: 120,
  }))

  await assert.rejects(
    createSharedStreamWithTools({
      adapter: createTestAdapter(),
      providerId: 'openai',
      apiKey: 'sk-test',
      messages: [{ role: 'user', content: 'Hi' }],
      options: {
        model: 'gpt-test',
        streamIdleTimeoutMs: 30,
      },
    }),
    (error) => error?.streamStale === true && String(error?.code || '') === 'provider_stream_stale',
  )
})

test('shared stream throws stale when progress goes silent after initial activity', async () => {
  __setSharedStreamTextForTests(createFakeStreamText({
    events: [
      { type: 'text-delta', delta: 'A', at: 0 },
    ],
    finalText: 'A',
    finalDelayMs: 120,
  }))

  await assert.rejects(
    createSharedStreamWithTools({
      adapter: createTestAdapter(),
      providerId: 'openai',
      apiKey: 'sk-test',
      messages: [{ role: 'user', content: 'Hi' }],
      options: {
        model: 'gpt-test',
        streamTimeoutMs: 200,
        streamIdleTimeoutMs: 30,
      },
    }),
    (error) => error?.streamStale === true && String(error?.code || '') === 'provider_stream_stale',
  )
})

test('shared stream hard timeout still wins over stale when work keeps progressing', async () => {
  __setSharedStreamTextForTests(createFakeStreamText({
    events: [
      { type: 'text-delta', delta: 'A', at: 0 },
      { type: 'text-delta', delta: 'B', at: 20 },
      { type: 'text-delta', delta: 'C', at: 40 },
      { type: 'text-delta', delta: 'D', at: 60 },
    ],
    finalText: 'ABCD',
    finalDelayMs: 80,
  }))

  await assert.rejects(
    createSharedStreamWithTools({
      adapter: createTestAdapter(),
      providerId: 'openai',
      apiKey: 'sk-test',
      messages: [{ role: 'user', content: 'Hi' }],
      options: {
        model: 'gpt-test',
        streamTimeoutMs: 70,
        streamIdleTimeoutMs: 60,
      },
    }),
    (error) => error?.streamStale !== true,
  )
})

test('shared stream keeps succeeding by default while activity stays inside the stale window', async () => {
  __setSharedStreamTextForTests(createFakeStreamText({
    events: [
      { type: 'text-delta', delta: 'A', at: 0 },
      { type: 'text-delta', delta: 'B', at: 25 },
      { type: 'text-delta', delta: 'C', at: 50 },
      { type: 'text-delta', delta: 'D', at: 75 },
      { type: 'text-delta', delta: 'E', at: 100 },
    ],
    finalText: 'ABCDE',
    finalDelayMs: 25,
  }))

  const payload = await createSharedStreamWithTools({
    adapter: createTestAdapter(),
    providerId: 'openai',
    apiKey: 'sk-test',
    messages: [{ role: 'user', content: 'Hi' }],
    options: {
      model: 'gpt-test',
      streamIdleTimeoutMs: 60,
    },
  })

  assert.equal(payload.text, 'ABCDE')
})

test('shared stream tolerates a small provider settle window after the last progress event', async () => {
  __setSharedStreamTextForTests(createFakeStreamText({
    events: [
      { type: 'text-delta', delta: 'A', at: 0 },
      { type: 'text-delta', delta: 'B', at: 25 },
      { type: 'text-delta', delta: 'C', at: 50 },
      { type: 'text-delta', delta: 'D', at: 75 },
      { type: 'text-delta', delta: 'E', at: 100 },
    ],
    finalText: 'ABCDE',
    finalDelayMs: 70,
  }))

  const payload = await createSharedStreamWithTools({
    adapter: createTestAdapter(),
    providerId: 'openai',
    apiKey: 'sk-test',
    messages: [{ role: 'user', content: 'Hi' }],
    options: {
      model: 'gpt-test',
      streamIdleTimeoutMs: 60,
    },
  })

  assert.equal(payload.text, 'ABCDE')
})

test('shared stream uses strict capability probing when tools are present', async () => {
  __setSharedStreamTextForTests(createFakeStreamText({
    events: [{ type: 'text-delta', delta: 'A', at: 0 }],
    finalText: 'A',
  }))

  let capturedFailOnProbeError = null
  const payload = await createSharedStreamWithTools({
    adapter: createCapabilityAwareTestAdapter({
      onResolveCapabilities(args = {}) {
        capturedFailOnProbeError = args.failOnProbeError
        return { supportsTools: true }
      },
    }),
    providerId: 'gemini',
    apiKey: 'sk-test',
    messages: [{ role: 'user', content: 'Hi' }],
    options: {
      model: 'gemini-2.5-pro',
      tools: {
        test_tool: {
          description: 'test',
          inputSchema: { type: 'object', properties: {} },
        },
      },
    },
  })

  assert.equal(capturedFailOnProbeError, true)
  assert.equal(payload.text, 'A')
})

test('shared stream reuses pre-resolved tool capabilities without probing again', async () => {
  __setSharedStreamTextForTests(createFakeStreamText({
    events: [{ type: 'text-delta', delta: 'A', at: 0 }],
    finalText: 'A',
  }))

  let probeCalls = 0
  const payload = await createSharedStreamWithTools({
    adapter: createCapabilityAwareTestAdapter({
      onResolveCapabilities() {
        probeCalls += 1
        return { supportsTools: true }
      },
    }),
    providerId: 'gemini',
    apiKey: 'sk-test',
    messages: [{ role: 'user', content: 'Hi' }],
    options: {
      model: 'gemini-2.5-pro',
      resolvedModelCapabilities: {
        supportsTools: true,
        source: 'merged_catalog',
      },
      tools: {
        test_tool: {
          description: 'test',
          inputSchema: { type: 'object', properties: {} },
        },
      },
    },
  })

  assert.equal(probeCalls, 0)
  assert.equal(payload.text, 'A')
})

test('shared stream logs reasoning classification anomalies for openrouter codex text-only reasoning-like output', async () => {
  __setSharedStreamTextForTests(createFakeStreamText({
    events: [
      { type: 'text-delta', delta: 'Got it — I will inspect the repo first.', at: 0 },
      { type: 'text-delta', delta: ' I will apply a narrower patch next.', at: 10 },
    ],
    finalText: 'Got it — I will inspect the repo first. I will apply a narrower patch next.',
    finalReasoning: '',
  }))

  const logs = []
  const originalInfo = console.info
  console.info = (...args) => logs.push(args)

  try {
    const payload = await createSharedStreamWithTools({
      adapter: createTestAdapter(),
      providerId: 'openrouter',
      apiKey: 'sk-test',
      messages: [{ role: 'user', content: 'Hi' }],
      options: {
        model: 'openai/gpt-5.3-codex',
        streamTimeoutMs: 120,
        streamIdleTimeoutMs: 40,
      },
    })

    assert.equal(payload.text.length > 0, true)
  } finally {
    console.info = originalInfo
  }

  const anomalyLog = logs.find(([label, payload]) => (
    label === '[reasoning-classification]'
    && payload?.providerId === 'openrouter'
    && payload?.modelId === 'openai/gpt-5.3-codex'
  ))

  assert.ok(anomalyLog)
  assert.equal(anomalyLog[1].anomaly, true)
  assert.equal(anomalyLog[1].textDeltaCount > 0, true)
  assert.equal(anomalyLog[1].reasoningDeltaCount, 0)
  assert.match(String(anomalyLog[1].firstTextSample || ''), /inspect the repo first/i)
})

test('shared stream routes OpenRouter reasoning_details raw chunks into onReasoning', async () => {
  __setSharedStreamTextForTests(createFakeStreamText({
    events: [
      {
        type: 'raw',
        rawValue: {
          choices: [{
            delta: {
              reasoning_details: [{
                type: 'reasoning.text',
                text: 'First, inspect the workspace. ',
              }],
            },
          }],
        },
        at: 0,
      },
      {
        type: 'raw',
        rawValue: {
          choices: [{
            delta: {
              reasoning_details: [{
                type: 'reasoning.text',
                text: 'Then edit the target file.',
              }],
            },
          }],
        },
        at: 10,
      },
    ],
    finalText: 'Done.',
  }))

  const { default: openrouterProviderAdapter } = await import('../../src/main/api-clients/ai-provider-openrouter.mjs')
  assert.equal(openrouterProviderAdapter.includeRawChunks, true)
  assert.equal(typeof openrouterProviderAdapter.extractReasoningFromRawChunk, 'function')

  const textChunks = []
  const reasoningChunks = []
  const reasoningMetadata = []
  const payload = await createSharedStreamWithTools({
    adapter: {
      ...createTestAdapter(),
      includeRawChunks: true,
      extractReasoningFromRawChunk: openrouterProviderAdapter.extractReasoningFromRawChunk,
    },
    providerId: 'openrouter',
    apiKey: 'sk-test',
    messages: [{ role: 'user', content: 'Hi' }],
    options: {
      model: 'openai/gpt-5.3-codex',
      streamTimeoutMs: 120,
      streamIdleTimeoutMs: 40,
    },
    onChunk(delta) {
      textChunks.push(delta)
    },
    onReasoning(delta, metadata) {
      reasoningChunks.push(delta)
      reasoningMetadata.push(metadata)
    },
  })

  assert.deepEqual(reasoningChunks, [
    'First, inspect the workspace. ',
    'Then edit the target file.',
  ])
  assert.deepEqual(reasoningMetadata, [
    { boundaryBefore: true },
    { boundaryBefore: true },
  ])
  assert.deepEqual(textChunks, [])
  assert.equal(payload.text, 'Done.')
})

test('shared stream keeps provider-owned runtime tools active when the resolved capability mode is provider_owned_runtime_only', async () => {
  let probeCalls = 0
  let capturedToolNames = []
  __setSharedStreamTextForTests(async (args = {}) => {
    capturedToolNames = Object.keys(args.tools || {}).sort()
    return createFakeStreamText({
      events: [{ type: 'text-delta', delta: 'A', at: 0 }],
      finalText: 'A',
    })(args)
  })

  const payload = await createSharedStreamWithTools({
    adapter: createCapabilityAwareTestAdapter({
      onResolveCapabilities() {
        probeCalls += 1
        return {
          supportsTools: true,
        }
      },
    }),
    providerId: 'perplexity',
    apiKey: 'sk-test',
    messages: [{ role: 'user', content: 'Hi' }],
    options: {
      model: 'sonar-pro',
      resolvedModelCapabilities: {
        supportsTools: false,
        toolSupportMode: 'provider_owned_runtime_only',
        source: 'merged_catalog',
      },
      tools: {
        read_file: {
          description: 'read',
          inputSchema: { type: 'object', properties: {} },
        },
      },
    },
  })

  assert.equal(probeCalls, 0)
  assert.deepEqual(capturedToolNames, ['read_file'])
  assert.equal(payload.text, 'A')
})
