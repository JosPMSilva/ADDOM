import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { jsonSchema } from 'ai'

import {
  createStreamWithTools,
} from '../../src/main/api-clients/ai-provider.mjs'

const ORIGINAL_MOONSHOT_BASE_URL = process.env.ADDOM_MOONSHOT_BASE_URL

function restoreMoonshotBaseUrl() {
  if (ORIGINAL_MOONSHOT_BASE_URL === undefined) {
    delete process.env.ADDOM_MOONSHOT_BASE_URL
  } else {
    process.env.ADDOM_MOONSHOT_BASE_URL = ORIGINAL_MOONSHOT_BASE_URL
  }
}

async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : {}
}

function writeSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

async function startServer(handler) {
  const server = http.createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return {
    url: `http://127.0.0.1:${port}/v1`,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    },
  }
}

test.after(() => {
  restoreMoonshotBaseUrl()
})

test('moonshot runtime streams reasoning before text and requests usage-inclusive streaming', async () => {
  const requestBodies = []
  const server = await startServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (req.method !== 'POST' || url.pathname !== '/v1/chat/completions') {
      res.writeHead(404).end()
      return
    }
    requestBodies.push(await readJsonBody(req))
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })
    writeSse(res, {
      id: 'chatcmpl_1',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'kimi-k2.7-code-highspeed',
      choices: [{
        index: 0,
        delta: { reasoning_content: 'Consider options. ' },
        finish_reason: null,
      }],
    })
    writeSse(res, {
      id: 'chatcmpl_1',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'kimi-k2.7-code-highspeed',
      choices: [{
        index: 0,
        delta: { content: 'Hello' },
        finish_reason: null,
      }],
    })
    writeSse(res, {
      id: 'chatcmpl_1',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'kimi-k2.7-code-highspeed',
      choices: [{
        index: 0,
        delta: { content: ' world' },
        finish_reason: null,
      }],
      usage: {
        prompt_tokens: 4,
        completion_tokens: 2,
        reasoning_tokens: 3,
        total_tokens: 9,
      },
    })
    writeSse(res, {
      id: 'chatcmpl_1',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'kimi-k2.7-code-highspeed',
      choices: [{
        index: 0,
        delta: {},
        finish_reason: 'stop',
      }],
    })
    res.end('data: [DONE]\n\n')
  })

  process.env.ADDOM_MOONSHOT_BASE_URL = server.url

  try {
    const eventOrder = []
    const payload = await createStreamWithTools(
      'moonshot',
      'moonshot-secret',
      [{ role: 'user', content: 'Say hello.' }],
      {
        model: 'kimi-k2.7-code',
        tools: {},
        requestContext: { processingMode: 'fast' },
      },
      (chunk) => {
        eventOrder.push(`text:${chunk}`)
      },
      (chunk) => {
        eventOrder.push(`reason:${chunk}`)
      },
    )

    assert.match(String(eventOrder[0] || ''), /^reason:/)
    assert.equal(payload.stopReason, 'stop')
    assert.equal(payload.text, 'Hello world')
    assert.equal(payload.reasoning, 'Consider options.')
    assert.deepEqual(payload.toolCalls, [])
    assert.equal(payload.usage.inputTokens, 4)
    assert.equal(payload.usage.outputTokens, 2)
    assert.ok(payload.usage.totalTokens >= 6)
    assert.equal(requestBodies[0]?.stream_options?.include_usage, true)
    assert.equal(requestBodies[0]?.model, 'kimi-k2.7-code-highspeed')
  } finally {
    await server.close()
    restoreMoonshotBaseUrl()
  }
})

test('moonshot runtime reconstructs streamed tool calls', async () => {
  const server = await startServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (req.method !== 'POST' || url.pathname !== '/v1/chat/completions') {
      res.writeHead(404).end()
      return
    }
    await readJsonBody(req)
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })
    writeSse(res, {
      id: 'chatcmpl_2',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'kimi-k2.6',
      choices: [{
        index: 0,
        delta: { reasoning_content: 'Need search.' },
        finish_reason: null,
      }],
    })
    writeSse(res, {
      id: 'chatcmpl_2',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'kimi-k2.6',
      choices: [{
        index: 0,
        delta: {
          tool_calls: [{
            index: 0,
            id: 'call_1',
            type: 'function',
            function: {
              name: 'search',
              arguments: '{"query":"weath',
            },
          }],
        },
        finish_reason: null,
      }],
    })
    writeSse(res, {
      id: 'chatcmpl_2',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'kimi-k2.6',
      choices: [{
        index: 0,
        delta: {
          tool_calls: [{
            index: 0,
            function: {
              arguments: 'er"}',
            },
          }],
        },
        finish_reason: null,
      }],
      usage: {
        prompt_tokens: 5,
        completion_tokens: 1,
        reasoning_tokens: 2,
        total_tokens: 8,
      },
    })
    writeSse(res, {
      id: 'chatcmpl_2',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'kimi-k2.6',
      choices: [{
        index: 0,
        delta: {},
        finish_reason: 'tool_calls',
      }],
    })
    res.end('data: [DONE]\n\n')
  })

  process.env.ADDOM_MOONSHOT_BASE_URL = server.url

  try {
    const payload = await createStreamWithTools(
      'moonshot',
      'moonshot-secret',
      [{ role: 'user', content: 'Search for the weather.' }],
      {
        model: 'kimi-k2.6',
        tools: {
          search: {
            description: 'Search the web',
            inputSchema: jsonSchema({
              type: 'object',
              properties: {
                query: { type: 'string' },
              },
              required: ['query'],
            }),
          },
        },
      },
      () => {},
      () => {},
    )

    assert.equal(payload.stopReason, 'tool-calls')
    assert.equal(payload.reasoning, 'Need search.')
    assert.deepEqual(payload.toolCalls, [{
      id: 'call_1',
      name: 'search',
      input: { query: 'weather' },
    }])
    assert.equal(payload.usage.inputTokens, 5)
    assert.equal(payload.usage.outputTokens, 1)
    assert.ok(payload.usage.totalTokens >= 6)
  } finally {
    await server.close()
    restoreMoonshotBaseUrl()
  }
})
