import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

import {
  createStreamWithTools,
} from '../../src/main/api-clients/ai-provider.mjs'
import { buildOpenAIHostedToolBundle } from '../../src/main/api-clients/openai-hosted-tools-runtime.mjs'
import { resolveProviderModelAdapter } from '../../src/main/api-clients/provider-model-adapters.mjs'
import { resolveProviderToolSurface } from '../../src/main/chat/tool-surface-selection.mjs'
import { toAISDKTools } from '../../src/main/tools/tool-definitions.mjs'

const ORIGINAL_OPENAI_BASE_URL = process.env.ADDOM_OPENAI_BASE_URL

function restoreOpenAIBaseUrl() {
  if (ORIGINAL_OPENAI_BASE_URL === undefined) {
    delete process.env.ADDOM_OPENAI_BASE_URL
  } else {
    process.env.ADDOM_OPENAI_BASE_URL = ORIGINAL_OPENAI_BASE_URL
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

function withResponsesStream(options = {}) {
  return {
    ...options,
    providerRuntimeSettings: {
      ...(options?.providerRuntimeSettings && typeof options.providerRuntimeSettings === 'object'
        ? options.providerRuntimeSettings
        : {}),
      transportMode: 'responses_stream',
    },
  }
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
  restoreOpenAIBaseUrl()
})

test('openai stream surfaces model_not_found error chunks instead of silently completing', async () => {
  const requestBodies = []
  const textChunks = []
  const reasoningChunks = []
  const server = await startServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (req.method !== 'POST' || url.pathname !== '/v1/responses') {
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
      type: 'error',
      sequence_number: 2,
      error: {
        type: 'invalid_request_error',
        code: 'model_not_found',
        message: 'The model `deleted-preview-model` does not exist or you do not have access to it.',
        param: null,
      },
    })
    res.end()
  })

  process.env.ADDOM_OPENAI_BASE_URL = server.url

  try {
    await assert.rejects(
      () => createStreamWithTools(
        'openai',
        'sk-test',
        [{ role: 'user', content: 'Take a screenshot of bing.com' }],
        withResponsesStream({ model: 'deleted-preview-model', tools: {} }),
        (chunk) => textChunks.push(chunk),
        (chunk) => reasoningChunks.push(chunk),
      ),
      (error) => {
        assert.match(String(error?.message || ''), /deleted-preview-model/i)
        assert.match(String(error?.message || ''), /(does not exist|do not have access)/i)
        assert.equal(String(error?.code || '').toLowerCase(), 'model_not_found')
        return true
      },
    )

    assert.equal(textChunks.length, 0)
    assert.equal(reasoningChunks.length, 0)
    assert.equal(requestBodies.length, 1)
    assert.equal(requestBodies[0]?.model, 'deleted-preview-model')
    assert.equal(requestBodies[0]?.stream, true)
  } finally {
    await server.close()
    restoreOpenAIBaseUrl()
  }
})

test('openai gpt-5.4 bundle only enables explicitly selected provider-native tools', async () => {
  const requestBodies = []
  const server = await startServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (req.method !== 'POST' || url.pathname !== '/v1/responses') {
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
      type: 'error',
      sequence_number: 1,
      error: {
        type: 'invalid_request_error',
        code: 'forced_test_exit',
        message: 'synthetic stop for request inspection',
        param: null,
      },
    })
    res.end()
  })

  process.env.ADDOM_OPENAI_BASE_URL = server.url

  try {
    const bundle = buildOpenAIHostedToolBundle({
      modelId: 'gpt-5.4',
      runtimeSettings: {
        hostedToolsEnabled: true,
        enabledHostedTools: ['code_interpreter', 'apply_patch'],
      },
    })
    assert.equal(Object.prototype.hasOwnProperty.call(bundle.tools, 'code_interpreter'), true)
    assert.equal(Object.prototype.hasOwnProperty.call(bundle.tools, 'apply_patch'), true)

    await assert.rejects(
      () => createStreamWithTools(
        'openai',
        'sk-test',
        [{ role: 'user', content: 'run python and print hello' }],
        withResponsesStream({ model: 'gpt-5.4', tools: bundle.tools }),
        () => {},
        () => {},
      ),
      /synthetic stop for request inspection/i,
    )

    assert.equal(requestBodies.length, 1)
    const providerTools = Array.isArray(requestBodies[0]?.tools) ? requestBodies[0].tools : []
    assert.equal(providerTools.some((tool) => String(tool?.type || '') === 'code_interpreter'), true)
    assert.equal(providerTools.some((tool) => String(tool?.type || '') === 'apply_patch'), true)
    assert.deepEqual(
      providerTools.find((tool) => String(tool?.type || '') === 'code_interpreter')?.container || null,
      { type: 'auto' },
    )
  } finally {
    await server.close()
    restoreOpenAIBaseUrl()
  }
})

test('openai gpt-5.4 request omits local_shell and keeps explicit hosted shell selection', async () => {
  const requestBodies = []
  const server = await startServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (req.method !== 'POST' || url.pathname !== '/v1/responses') {
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
      type: 'error',
      sequence_number: 1,
      error: {
        type: 'invalid_request_error',
        code: 'forced_test_exit',
        message: 'synthetic stop for request inspection',
        param: null,
      },
    })
    res.end()
  })

  process.env.ADDOM_OPENAI_BASE_URL = server.url

  try {
    const bundle = buildOpenAIHostedToolBundle({
      modelId: 'gpt-5.4',
      runtimeSettings: {
        hostedToolsEnabled: true,
        enabledHostedTools: ['shell', 'local_shell', 'apply_patch'],
        hostedToolConfig: {
          local_shell: { enabled: true },
          apply_patch: { enabled: true },
        },
      },
      includeLocalRuntimeTools: true,
    })

    assert.equal(Object.prototype.hasOwnProperty.call(bundle.tools, 'local_shell'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(bundle.tools, 'apply_patch'), true)
    assert.equal(Object.prototype.hasOwnProperty.call(bundle.tools, 'shell'), true)

    await assert.rejects(
      () => createStreamWithTools(
        'openai',
        'sk-test',
        [{ role: 'user', content: 'edit the file and run tests' }],
        withResponsesStream({ model: 'gpt-5.4', tools: bundle.tools }),
        () => {},
        () => {},
      ),
      /synthetic stop for request inspection/i,
    )

    assert.equal(requestBodies.length, 1)
    const providerTools = Array.isArray(requestBodies[0]?.tools) ? requestBodies[0].tools : []
    assert.equal(providerTools.some((tool) => String(tool?.type || '') === 'local_shell'), false)
    assert.equal(providerTools.some((tool) => String(tool?.type || '') === 'apply_patch'), true)
    assert.equal(providerTools.some((tool) => String(tool?.type || '') === 'shell'), true)
  } finally {
    await server.close()
    restoreOpenAIBaseUrl()
  }
})

test('openai gpt-5.4 request keeps only the explicit mutually-compatible hosted selection', async () => {
  const requestBodies = []
  const server = await startServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (req.method !== 'POST' || url.pathname !== '/v1/responses') {
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
      type: 'error',
      sequence_number: 1,
      error: {
        type: 'invalid_request_error',
        code: 'forced_test_exit',
        message: 'synthetic stop for request inspection',
        param: null,
      },
    })
    res.end()
  })

  process.env.ADDOM_OPENAI_BASE_URL = server.url

  try {
    const bundle = buildOpenAIHostedToolBundle({
      modelId: 'gpt-5.4',
      runtimeSettings: {
        hostedToolsEnabled: true,
        enabledHostedTools: ['code_interpreter', 'shell'],
      },
    })

    assert.equal(Object.prototype.hasOwnProperty.call(bundle.tools, 'code_interpreter'), true)
    assert.equal(Object.prototype.hasOwnProperty.call(bundle.tools, 'shell'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(bundle.tools, 'apply_patch'), false)

    await assert.rejects(
      () => createStreamWithTools(
        'openai',
        'sk-test',
        [{ role: 'user', content: 'run shell and python tasks' }],
        withResponsesStream({ model: 'gpt-5.4', tools: bundle.tools }),
        () => {},
        () => {},
      ),
      /synthetic stop for request inspection/i,
    )

    assert.equal(requestBodies.length, 1)
    const providerTools = Array.isArray(requestBodies[0]?.tools) ? requestBodies[0].tools : []
    assert.equal(providerTools.some((tool) => String(tool?.type || '') === 'code_interpreter'), true)
    assert.equal(providerTools.some((tool) => String(tool?.type || '') === 'shell'), false)
    assert.equal(providerTools.some((tool) => String(tool?.type || '') === 'apply_patch'), false)
    assert.deepEqual(
      providerTools.find((tool) => String(tool?.type || '') === 'code_interpreter')?.container || null,
      { type: 'auto' },
    )
  } finally {
    await server.close()
    restoreOpenAIBaseUrl()
  }
})

test('openai local runtime surface suppresses overlapping ADDOM function tools on the wire', async () => {
  const requestBodies = []
  const server = await startServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (req.method !== 'POST' || url.pathname !== '/v1/responses') {
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
      type: 'error',
      sequence_number: 1,
      error: {
        type: 'invalid_request_error',
        code: 'forced_test_exit',
        message: 'synthetic stop for request inspection',
        param: null,
      },
    })
    res.end()
  })

  process.env.ADDOM_OPENAI_BASE_URL = server.url

  try {
    const addomTools = toAISDKTools('ask', true)
    const openaiBundle = buildOpenAIHostedToolBundle({
      modelId: 'gpt-5.3-codex',
      runtimeSettings: {
        hostedToolsEnabled: true,
        enabledHostedTools: ['apply_patch'],
        hostedToolConfig: {
          apply_patch: { enabled: true },
        },
      },
      includeLocalRuntimeTools: true,
    })
    const surface = resolveProviderToolSurface({
      adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.3-codex'),
      addomTools: {
        apply_patch: addomTools.apply_patch,
        read_file: addomTools.read_file,
        search_code: addomTools.search_code,
        write_file: addomTools.write_file,
        edit_file: addomTools.edit_file,
        run_command: addomTools.run_command,
      },
      providerTools: openaiBundle.tools,
    })

    assert.equal(Object.prototype.hasOwnProperty.call(surface.tools, 'apply_patch'), true)
    assert.equal(Object.prototype.hasOwnProperty.call(surface.tools, 'read_file'), true)
    assert.equal(Object.prototype.hasOwnProperty.call(surface.tools, 'search_code'), true)
    assert.equal(Object.prototype.hasOwnProperty.call(surface.tools, 'write_file'), true)
    assert.equal(Object.prototype.hasOwnProperty.call(surface.tools, 'edit_file'), true)
    assert.equal(Object.prototype.hasOwnProperty.call(surface.tools, 'run_command'), true)

    await assert.rejects(
      () => createStreamWithTools(
        'openai',
        'sk-test',
        [{ role: 'user', content: 'inspect files, patch them, and then run tests' }],
        withResponsesStream({ model: 'gpt-5.3-codex', tools: surface.tools }),
        () => {},
        () => {},
      ),
      /synthetic stop for request inspection/i,
    )

    assert.equal(requestBodies.length, 1)
    const functionTools = Array.isArray(requestBodies[0]?.tools)
      ? requestBodies[0].tools.filter((tool) => String(tool?.type || '') === 'function')
      : []
    const functionToolNames = functionTools.map((tool) => String(tool?.name || '').trim()).filter(Boolean).sort()
    assert.deepEqual(functionToolNames, ['apply_patch', 'edit_file', 'read_file', 'run_command', 'search_code', 'write_file'])
    assert.equal(Array.isArray(requestBodies[0]?.tools), true)
    assert.equal(requestBodies[0].tools.some((tool) => String(tool?.type || '') === 'apply_patch'), false)
    assert.equal(functionToolNames.includes('write_file'), true)
    assert.equal(functionToolNames.includes('edit_file'), true)
  } finally {
    await server.close()
    restoreOpenAIBaseUrl()
  }
})
