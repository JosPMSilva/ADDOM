import test from 'node:test'
import assert from 'node:assert/strict'

import { COMPACTION_MODES } from '../../src/main/chat/continuity/compaction-mode-contract.mjs'
import {
  buildOpenAIResponsesWebSocketCreateBody,
  prepareOpenAIResponsesWebSocketRequest,
  resolveOpenAIResponsesWebSocketEligibility,
} from '../../src/main/api-clients/experimental/openai-websocket/openai-websocket-request-builder.mjs'
import { buildOpenAIHostedToolBundle } from '../../src/main/api-clients/openai-hosted-tools-runtime.mjs'

test('openai websocket request builder prepares continuity fields and omits unsupported transport truncation', () => {
  const prepared = prepareOpenAIResponsesWebSocketRequest({
    messages: [
      { role: 'system', content: 'You are ADDOM.' },
      { role: 'assistant', content: 'Previous answer.', phase: 'commentary' },
      { role: 'user', content: 'Continue the work.' },
    ],
    options: {
      model: 'gpt-5.4',
      providerRuntimeSettings: {
        transportMode: 'responses_websocket_experimental',
        useServerSideCompaction: true,
        serverSideCompactionThresholdTokens: 180_000,
      },
      requestContext: {
        projectId: 'project-websocket',
        threadId: 'thread-websocket',
        openai: {
          store: true,
          previousResponseId: 'resp_prev_1',
        },
      },
    },
  })

  assert.equal(prepared.eligible, true)
  assert.equal(prepared.modelId, 'gpt-5.4')
  assert.equal(prepared.createBody.model, 'gpt-5.4')
  assert.equal(prepared.createBody.store, true)
  assert.equal(prepared.createBody.previous_response_id, 'resp_prev_1')
  assert.equal(prepared.createBody.prompt_cache_retention, 'in_memory')
  assert.equal(prepared.createBody.context_management, undefined)
  assert.equal(prepared.createBody.input.length, 2)
  assert.equal(prepared.createBody.input[0].role, 'system')
  assert.equal(prepared.createBody.input[1].role, 'user')
})

test('openai websocket request builder carries transform-resolved max output tokens into the create body', () => {
  const prepared = prepareOpenAIResponsesWebSocketRequest({
    messages: [
      { role: 'system', content: 'You are ADDOM.' },
      { role: 'user', content: 'Continue the work.' },
    ],
    options: {
      model: 'gpt-5.4',
      maxOutputTokens: 999999,
      providerRuntimeSettings: {
        transportMode: 'responses_websocket_experimental',
      },
    },
  })

  assert.equal(prepared.eligible, true)
  assert.equal(prepared.maxOutputTokens, 128000)
  assert.equal(prepared.createBody.max_output_tokens, 128000)
})

test('openai websocket request builder omits max_output_tokens when no explicit cap is requested', () => {
  const prepared = prepareOpenAIResponsesWebSocketRequest({
    messages: [
      { role: 'system', content: 'You are ADDOM.' },
      { role: 'user', content: 'Continue the work.' },
    ],
    options: {
      model: 'gpt-5.4',
      providerRuntimeSettings: {
        transportMode: 'responses_websocket_experimental',
      },
    },
  })

  assert.equal(prepared.eligible, true)
  assert.equal(prepared.maxOutputTokens, null)
  assert.equal(Object.prototype.hasOwnProperty.call(prepared.createBody, 'max_output_tokens'), false)
})

test('openai websocket request builder derives a documented warmup request when enabled for a stable prefix plus one user message', () => {
  const prepared = prepareOpenAIResponsesWebSocketRequest({
    messages: [
      { role: 'system', content: 'You are ADDOM.' },
      { role: 'developer', content: 'Be concise.' },
      { role: 'user', content: 'Continue the work.' },
    ],
    options: {
      model: 'gpt-5.4',
      providerRuntimeSettings: {
        transportMode: 'responses_websocket_experimental',
        websocketWarmupEnabled: true,
      },
    },
  })

  assert.equal(prepared.eligible, true)
  assert.deepEqual(prepared.warmupBody?.input, [
    { type: 'message', role: 'system', content: 'You are ADDOM.' },
    { type: 'message', role: 'developer', content: 'Be concise.' },
  ])
  assert.equal(prepared.warmupBody?.generate, false)
  assert.deepEqual(prepared.createBody.input, [
    { type: 'message', role: 'user', content: 'Continue the work.' },
  ])
  assert.equal(Object.prototype.hasOwnProperty.call(prepared.createBody, 'previous_response_id'), false)
})

test('openai websocket request builder keeps custom tools on both warmup and generated requests', () => {
  const prepared = prepareOpenAIResponsesWebSocketRequest({
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

  assert.equal(prepared.eligible, true)
  assert.equal(prepared.warmupBody?.generate, false)
  assert.equal(prepared.warmupBody?.tools?.[0]?.name, 'read_file')
  assert.equal(prepared.createBody?.tools?.[0]?.name, 'read_file')
})

test('openai websocket eligibility accepts hydrated user attachments and allows custom function tools', () => {
  const attachmentTurn = resolveOpenAIResponsesWebSocketEligibility({
    modelId: 'gpt-5.4',
    messages: [{
      role: 'user',
      content: [{ type: 'file', filename: 'spec.pdf', mediaType: 'application/pdf', data: 'cGRm' }],
    }],
    runtimeSettings: {
      transportMode: 'responses_websocket_experimental',
    },
  })
  assert.deepEqual(attachmentTurn, {
    eligible: true,
    reason: '',
  })

  const toolTurn = resolveOpenAIResponsesWebSocketEligibility({
    modelId: 'gpt-5.4',
    messages: [{ role: 'user', content: 'Use the tool.' }],
    tools: {
      read_file: {
        description: 'Reads a file.',
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
    runtimeSettings: {
      transportMode: 'responses_websocket_experimental',
    },
  })
  assert.deepEqual(toolTurn, {
    eligible: true,
    reason: '',
  })
})

test('openai websocket request builder emits documented Responses input_image and input_file parts for hydrated user attachments', () => {
  const payload = buildOpenAIResponsesWebSocketCreateBody({
    modelId: 'gpt-5.4',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Inspect these attachments.' },
        {
          type: 'image',
          mediaType: 'image/png',
          image: 'iVBORw0KGgoAAAANSUhEUgAAAAUA',
          detail: 'high',
        },
        {
          type: 'file',
          mediaType: 'application/pdf',
          filename: 'spec.pdf',
          data: 'JVBERi0xLjQKJcTl8uXr',
        },
      ],
    }],
    providerOptions: {
      openai: {
        store: true,
      },
    },
  })

  assert.equal(payload.ok, true)
  assert.deepEqual(payload.body.input, [{
    type: 'message',
    role: 'user',
    content: [
      { type: 'input_text', text: 'Inspect these attachments.' },
      {
        type: 'input_image',
        image_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA',
        detail: 'high',
      },
      {
        type: 'input_file',
        filename: 'spec.pdf',
        file_data: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXr',
      },
    ],
  }])
})

test('openai websocket request builder preserves file urls and openai file ids for user attachments', () => {
  const payload = buildOpenAIResponsesWebSocketCreateBody({
    modelId: 'gpt-5.4',
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          image: 'file-vision_123',
          mediaType: 'image/png',
        },
        {
          type: 'file',
          data: 'https://example.com/spec.pdf',
          filename: 'spec.pdf',
          mediaType: 'application/pdf',
        },
      ],
    }],
    providerOptions: {
      openai: {
        store: true,
      },
    },
  })

  assert.equal(payload.ok, true)
  assert.deepEqual(payload.body.input, [{
    type: 'message',
    role: 'user',
    content: [
      { type: 'input_image', file_id: 'file-vision_123' },
      { type: 'input_file', file_url: 'https://example.com/spec.pdf' },
    ],
  }])
})

test('openai websocket request builder maps official hosted provider tools onto Responses tools', () => {
  const openaiBundle = buildOpenAIHostedToolBundle({
    modelId: 'gpt-5.4',
    runtimeSettings: {
      hostedToolsEnabled: true,
      enabledHostedTools: ['web_search', 'code_interpreter', 'image_generation', 'apply_patch', 'file_search'],
    },
    vectorStoreIds: ['vs_project_123'],
  })

  const payload = buildOpenAIResponsesWebSocketCreateBody({
    modelId: 'gpt-5.4',
    messages: [{ role: 'user', content: 'Search and cite the project docs.' }],
    providerOptions: {
      openai: {
        store: true,
        include: ['file_search_call.results'],
      },
    },
    tools: openaiBundle.tools,
  })

  assert.equal(payload.ok, true)
  assert.deepEqual(payload.body.tools, [
    { type: 'web_search', search_context_size: 'medium' },
    { type: 'code_interpreter', container: { type: 'auto' } },
    { type: 'image_generation', output_format: 'webp', quality: 'medium' },
    { type: 'apply_patch' },
    { type: 'file_search', vector_store_ids: ['vs_project_123'], max_num_results: 8 },
  ])
})

test('openai websocket request builder emits custom tools and converts tool-call history into Responses items', () => {
  const payload = buildOpenAIResponsesWebSocketCreateBody({
    modelId: 'gpt-5.4',
    messages: [
      {
        role: 'assistant',
        phase: 'commentary',
        content: [
          { type: 'text', text: 'I will inspect the file.' },
          {
            type: 'tool-call',
            toolCallId: 'call_read_1',
            toolName: 'read_file',
            input: { path: 'src/main/index.mjs' },
          },
        ],
      },
      {
        role: 'tool',
        content: [{
          type: 'tool-result',
          toolCallId: 'call_read_1',
          toolName: 'read_file',
          output: {
            type: 'text',
            value: 'file contents',
          },
        }],
      },
      { role: 'user', content: 'Continue.' },
    ],
    providerOptions: {
      openai: {
        store: true,
      },
    },
    tools: {
      read_file: {
        description: 'Reads a file.',
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
  })

  assert.equal(payload.ok, true)
  assert.deepEqual(payload.body.tools, [{
    type: 'function',
    name: 'read_file',
    description: 'Reads a file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
      },
      required: ['path'],
    },
    strict: true,
  }])
  assert.deepEqual(payload.body.input, [
    {
      type: 'message',
      role: 'assistant',
      content: 'I will inspect the file.',
      phase: 'commentary',
    },
    {
      type: 'function_call',
      call_id: 'call_read_1',
      name: 'read_file',
      arguments: '{"path":"src/main/index.mjs"}',
    },
    {
      type: 'function_call_output',
      call_id: 'call_read_1',
      output: 'file contents',
    },
    {
      type: 'message',
      role: 'user',
      content: 'Continue.',
    },
  ])
})

test('openai websocket request builder preserves canonical tool-result history while serializing sanitized media payloads', () => {
  const payload = buildOpenAIResponsesWebSocketCreateBody({
    modelId: 'gpt-5.4',
    messages: [{
      role: 'tool',
      content: [{
        type: 'tool-result',
        toolCallId: 'call_browser_1',
        toolName: 'browser_action',
        output: {
          type: 'json',
          value: {
            summary: 'Captured screenshot.',
            content: [
              { type: 'text', text: 'Screenshot generated.' },
              { type: 'image', filename: 'capture.jpg', mediaType: 'image/jpeg', image: 'raw-image' },
            ],
            screenshotBase64: 'raw-screenshot',
            screenshotMediaType: 'image/jpeg',
            screenshotFilepath: 'captures/page.jpg',
          },
        },
      }],
    }],
    providerOptions: {
      openai: {
        store: true,
      },
    },
  })

  assert.equal(payload.ok, true)
  assert.deepEqual(payload.body.input, [{
    type: 'function_call_output',
    call_id: 'call_browser_1',
    output: JSON.stringify({
      summary: 'Captured screenshot.',
      content: [
        { type: 'text', text: 'Screenshot generated.' },
        { type: 'text', text: '[Tool result image omitted: capture.jpg]' },
      ],
      screenshotMediaType: 'image/jpeg',
      screenshotFilepath: 'captures/page.jpg',
      screenshotOmitted: true,
      screenshotPlaceholder: '[Tool result image omitted: captures/page.jpg]',
    }),
  }])
})

test('openai websocket request builder keeps assistant non-text attachments as readable placeholders instead of rejecting the turn', () => {
  const payload = buildOpenAIResponsesWebSocketCreateBody({
    modelId: 'gpt-5.4',
    messages: [
      {
        role: 'assistant',
        phase: 'commentary',
        content: [
          { type: 'text', text: 'I inspected the generated assets.' },
          { type: 'image', filename: 'diagram.png', mediaType: 'image/png' },
          { type: 'file', filename: 'report.pdf', mediaType: 'application/pdf' },
          {
            type: 'tool-call',
            toolCallId: 'call_read_1',
            toolName: 'read_file',
            input: { path: 'src/main/index.mjs' },
          },
        ],
      },
    ],
    providerOptions: {
      openai: {
        store: true,
      },
    },
    tools: {
      read_file: {
        description: 'Reads a file.',
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
  })

  assert.equal(payload.ok, true)
  assert.deepEqual(payload.body.input, [
    {
      type: 'message',
      role: 'assistant',
      content: [
        'I inspected the generated assets.',
        '[Assistant image attachment omitted in WebSocket history: diagram.png]',
        '[Assistant file attachment omitted in WebSocket history: report.pdf]',
      ].join('\n'),
      phase: 'commentary',
    },
    {
      type: 'function_call',
      call_id: 'call_read_1',
      name: 'read_file',
      arguments: '{"path":"src/main/index.mjs"}',
    },
  ])
})

test('openai websocket request builder keeps developer attachment history as readable placeholder text', () => {
  const payload = buildOpenAIResponsesWebSocketCreateBody({
    modelId: 'gpt-5.4',
    messages: [{
      role: 'developer',
      content: [
        { type: 'text', text: 'Follow this reference.' },
        { type: 'file', filename: 'style-guide.pdf', mediaType: 'application/pdf' },
      ],
    }],
    providerOptions: {
      openai: {
        store: true,
      },
    },
  })

  assert.equal(payload.ok, true)
  assert.deepEqual(payload.body.input, [{
    type: 'message',
    role: 'developer',
    content: [
      'Follow this reference.',
      '[developer file attachment omitted in WebSocket history: style-guide.pdf]',
    ].join('\n'),
  }])
})

test('openai websocket eligibility accepts supported hosted provider tool bundles', () => {
  const openaiBundle = buildOpenAIHostedToolBundle({
    modelId: 'gpt-5.4',
    runtimeSettings: {
      hostedToolsEnabled: true,
      enabledHostedTools: ['web_search', 'file_search'],
    },
    vectorStoreIds: ['vs_project_123'],
  })

  const result = resolveOpenAIResponsesWebSocketEligibility({
    modelId: 'gpt-5.4',
    messages: [{ role: 'user', content: 'Search the docs and summarize them.' }],
    tools: openaiBundle.tools,
    runtimeSettings: {
      transportMode: 'responses_websocket_experimental',
    },
  })

  assert.deepEqual(result, {
    eligible: true,
    reason: '',
  })
})

test('openai websocket eligibility stays disabled when background mode is enabled', () => {
  const result = resolveOpenAIResponsesWebSocketEligibility({
    modelId: 'gpt-5.4',
    messages: [{ role: 'user', content: 'Continue.' }],
    runtimeSettings: {
      transportMode: 'responses_websocket_experimental',
      enableBackgroundMode: true,
    },
  })

  assert.deepEqual(result, {
    eligible: false,
    reason: 'background_mode_enabled',
  })
})

test('openai websocket request builder still rejects manual responses.compact without a compacted window', () => {
  const prepared = prepareOpenAIResponsesWebSocketRequest({
    messages: [{ role: 'user', content: 'Continue.' }],
    options: {
      model: 'gpt-5.4',
      providerRuntimeSettings: {
        transportMode: 'responses_websocket_experimental',
      },
      requestContext: {
        openai: {
          store: true,
          previousResponseId: 'resp_prev_1',
          compaction: {
            requestedMode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
            selectedMode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
          },
        },
      },
    },
  })

  assert.equal(prepared.eligible, false)
  assert.equal(prepared.reason, 'manual_compaction_unsupported')
})

test('openai websocket request builder starts a fresh chain from a compacted window and appends only new delta input', () => {
  const prepared = prepareOpenAIResponsesWebSocketRequest({
    messages: [
      { role: 'system', content: 'You are ADDOM.' },
      { role: 'assistant', content: 'Previous answer.', phase: 'commentary' },
      { role: 'user', content: 'Continue from the compacted chain.' },
    ],
    options: {
      model: 'gpt-5.4',
      providerRuntimeSettings: {
        transportMode: 'responses_websocket_experimental',
      },
      requestContext: {
        openai: {
          store: true,
          compaction: {
            requestedMode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
            selectedMode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
          },
          resetChainFromCompactedWindow: true,
          manualCompactedWindow: [
            { type: 'message', id: 'msg_prev_1' },
            { type: 'compaction', id: 'cmp_prev_1', encrypted_content: 'enc_prev_1' },
          ],
        },
      },
    },
  })

  assert.equal(prepared.eligible, true)
  assert.equal(Object.prototype.hasOwnProperty.call(prepared.createBody, 'previous_response_id'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(prepared.createBody, 'conversation'), false)
  assert.deepEqual(prepared.createBody.input, [
    { type: 'message', id: 'msg_prev_1' },
    { type: 'compaction', id: 'cmp_prev_1', encrypted_content: 'enc_prev_1' },
    {
      type: 'message',
      role: 'user',
      content: 'Continue from the compacted chain.',
    },
  ])
})

test('openai websocket create-body builder rejects unsupported content shapes', () => {
  const payload = buildOpenAIResponsesWebSocketCreateBody({
    modelId: 'gpt-5.4',
    messages: [{ role: 'user', content: { text: 'bad-shape' } }],
    providerOptions: { openai: {} },
  })

  assert.equal(payload.ok, false)
  assert.equal(payload.reason, 'unsupported_content_shape')
})

test('openai websocket create-body builder normalizes raw assistant alias parts at its direct-entry boundary', () => {
  const payload = buildOpenAIResponsesWebSocketCreateBody({
    modelId: 'gpt-5.4',
    messages: [
      {
        role: 'assistant',
        phase: 'commentary',
        content: [
          { type: 'reasoning', text: 'Should be stripped.' },
          { type: 'tool_call', call_id: 'call_raw_1', name: 'read_file', args: { path: 'src/main/index.mjs' } },
        ],
      },
      {
        role: 'tool',
        content: [
          { type: 'tool_result', call_id: 'call_raw_1', name: 'read_file', result: { ok: true } },
        ],
      },
    ],
    providerOptions: {
      openai: {
        store: true,
      },
    },
    tools: {
      read_file: {
        description: 'Reads a file.',
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
  })

  assert.equal(payload.ok, true)
  assert.deepEqual(payload.body.input, [
    {
      type: 'function_call',
      call_id: 'call_raw_1',
      name: 'read_file',
      arguments: '{"path":"src/main/index.mjs"}',
    },
    {
      type: 'function_call_output',
      call_id: 'call_raw_1',
      output: JSON.stringify({ ok: true }),
    },
  ])
})
