import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

import {
  buildMoonshotFormulaToolBundle,
  executeMoonshotFormulaToolCall,
  __testMoonshotFormulaRuntimeInternals,
} from '../../src/main/api-clients/moonshot-formula-runtime.mjs'

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
  __testMoonshotFormulaRuntimeInternals.clearSchemaCache()
})

test('moonshot Formula bundle caches successful schema loads and skips failing formulas', async () => {
  __testMoonshotFormulaRuntimeInternals.clearSchemaCache()
  const hits = new Map()

  const server = await startServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    const match = url.pathname.match(/^\/v1\/formulas\/([^/]+)\/tools$/)
    if (!match) {
      res.writeHead(404).end()
      return
    }
    const formulaUri = decodeURIComponent(match[1])
    hits.set(formulaUri, (hits.get(formulaUri) || 0) + 1)

    if (formulaUri === 'moonshot/fetch:latest') {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'boom' }))
      return
    }

    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({
      object: 'list',
      tools: [{
        type: 'function',
        function: {
          name: 'search',
          description: 'Search the web',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
            required: ['query'],
          },
        },
      }],
    }))
  })

  process.env.ADDOM_MOONSHOT_BASE_URL = server.url

  try {
    const first = await buildMoonshotFormulaToolBundle({
      apiKey: 'moonshot-secret',
      runtimeSettings: {
        remoteToolsEnabled: true,
        enabledFormulaUris: [
          'moonshot/web-search:latest',
          'moonshot/fetch:latest',
        ],
      },
    })

    assert.equal(Object.keys(first.tools).includes('moonshot_formula__web_search__search'), true)
    assert.equal(first.toolMap.get('moonshot_formula__web_search__search')?.formulaUri, 'moonshot/web-search:latest')
    assert.equal(first.notices.length, 1)
    assert.match(String(first.notices[0]?.text || ''), /were skipped/i)

    const second = await buildMoonshotFormulaToolBundle({
      apiKey: 'moonshot-secret',
      runtimeSettings: {
        remoteToolsEnabled: true,
        enabledFormulaUris: [
          'moonshot/web-search:latest',
          'moonshot/fetch:latest',
        ],
      },
    })

    assert.equal(Object.keys(second.tools).includes('moonshot_formula__web_search__search'), true)
    assert.equal(hits.get('moonshot/web-search:latest'), 1)
    assert.ok((hits.get('moonshot/fetch:latest') || 0) >= 2)
  } finally {
    await server.close()
    restoreMoonshotBaseUrl()
  }
})

test('moonshot Formula execution returns encrypted and structured outputs', async () => {
  __testMoonshotFormulaRuntimeInternals.clearSchemaCache()
  const requestBodies = []

  const server = await startServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    const match = url.pathname.match(/^\/v1\/formulas\/([^/]+)\/fibers$/)
    if (!match) {
      res.writeHead(404).end()
      return
    }
    const formulaUri = decodeURIComponent(match[1])
    requestBodies.push({
      formulaUri,
      body: await readJsonBody(req),
    })

    res.writeHead(200, { 'content-type': 'application/json' })
    if (formulaUri === 'moonshot/web-search:latest') {
      res.end(JSON.stringify({
        status: 'succeeded',
        context: {
          encrypted_output: 'ENCRYPTED_RESULT',
        },
      }))
      return
    }

    res.end(JSON.stringify({
      status: 'succeeded',
      context: {
        output: {
          ok: true,
          rows: 3,
        },
      },
    }))
  })

  process.env.ADDOM_MOONSHOT_BASE_URL = server.url

  try {
    const encrypted = await executeMoonshotFormulaToolCall({
      apiKey: 'moonshot-secret',
      mapping: {
        formulaUri: 'moonshot/web-search:latest',
        originalToolName: 'search',
      },
      toolInput: { query: 'latest moonshot news' },
    })
    assert.deepEqual(encrypted, {
      ok: true,
      result: 'ENCRYPTED_RESULT',
      source: 'encrypted_output',
    })

    const structured = await executeMoonshotFormulaToolCall({
      apiKey: 'moonshot-secret',
      mapping: {
        formulaUri: 'moonshot/fetch:latest',
        originalToolName: 'fetch_url',
      },
      toolInput: { url: 'https://example.com' },
    })
    assert.equal(structured.ok, true)
    assert.equal(structured.source, 'output_json')
    assert.equal(structured.result, JSON.stringify({ ok: true, rows: 3 }))

    assert.deepEqual(requestBodies, [
      {
        formulaUri: 'moonshot/web-search:latest',
        body: {
          name: 'search',
          arguments: JSON.stringify({ query: 'latest moonshot news' }),
        },
      },
      {
        formulaUri: 'moonshot/fetch:latest',
        body: {
          name: 'fetch_url',
          arguments: JSON.stringify({ url: 'https://example.com' }),
        },
      },
    ])
  } finally {
    await server.close()
    restoreMoonshotBaseUrl()
  }
})
