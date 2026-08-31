import test from 'node:test'
import assert from 'node:assert/strict'

import {
  executeProviderModelStream,
  finalizeProviderModelRound,
  resolveScopedProviderRuntimeSettings,
} from '../../src/main/chat/chat-stream-model-step.mjs'
import { buildChatUsagePayload } from '../../src/main/chat/chat-usage-payload.mjs'
import { emitStreamFailure } from '../../src/main/chat/chat-stream-error-output.mjs'
import { getProviderUsageFixture } from '../fixtures/provider-usage-fixtures.mjs'

test('executeProviderModelStream passes provider-specific runtime settings to non-OpenAI providers', async () => {
  let capturedRuntimeSettings = null

  await executeProviderModelStream({
    providerId: 'gemini',
    apiKey: 'test-key',
    history: [{ role: 'user', content: 'hello' }],
    options: { model: 'gemini-2.5-flash', tools: {} },
    providerRuntimeSettings: {
      openai: { transportMode: 'responses_stream' },
      gemini: { exampleFlag: true },
    },
    activeProjectId: 'project_1',
    activeThreadId: 'thread_1',
    activeTurnId: 'turn_1',
    tools: {},
    round: 1,
    model: 'gemini-2.5-flash',
    send: () => {},
    persistTimelineEvent: () => {},
    sendNotice: () => {},
    createStreamWithTools: async (_providerId, _apiKey, _history, options) => {
      capturedRuntimeSettings = options.providerRuntimeSettings
      return {
        stopReason: 'stop',
        text: 'done',
        toolCalls: [],
        usage: null,
        reasoning: '',
      }
    },
  })

  assert.deepEqual(capturedRuntimeSettings, { exampleFlag: true })
})

test('executeProviderModelStream forwards provider-scoped request context for non-OpenAI providers', async () => {
  let capturedRequestContext = null

  await executeProviderModelStream({
    providerId: 'anthropic',
    apiKey: 'test-key',
    history: [{ role: 'user', content: 'hello' }],
    options: { model: 'claude-sonnet-4-6', tools: {} },
    providerRuntimeSettings: {
      anthropic: {
        useContextManagementCompaction: false,
      },
    },
    providerRequestContextForRound: {
      anthropic: {
        useContextManagementCompaction: true,
        contextManagementCompactionThresholdTokens: 80_000,
        contextManagementCompactionInstructions: 'Keep decisions.',
      },
    },
    activeProjectId: 'project_1',
    activeThreadId: 'thread_1',
    activeTurnId: 'turn_1',
    tools: {},
    round: 1,
    model: 'claude-sonnet-4-6',
    send: () => {},
    persistTimelineEvent: () => {},
    sendNotice: () => {},
    createStreamWithTools: async (_providerId, _apiKey, _history, options) => {
      capturedRequestContext = options.requestContext
      return {
        stopReason: 'stop',
        text: 'done',
        toolCalls: [],
        usage: null,
        reasoning: '',
      }
    },
  })

  assert.deepEqual(capturedRequestContext?.anthropic, {
    useContextManagementCompaction: true,
    contextManagementCompactionThresholdTokens: 80_000,
    contextManagementCompactionInstructions: 'Keep decisions.',
  })
  assert.equal(capturedRequestContext?.threadId, 'thread_1')
})

test('executeProviderModelStream persists only provider statuses explicitly marked durable', async () => {
  const sent = []
  const persisted = []

  await executeProviderModelStream({
    providerId: 'anthropic',
    apiKey: 'test-key',
    history: [{ role: 'user', content: 'continue' }],
    options: { model: 'gpt-5.4', tools: {} },
    activeProjectId: 'project_durable_status',
    activeThreadId: 'thread_durable_status',
    activeTurnId: 'turn_durable_status',
    tools: {},
    round: 1,
    model: 'claude-sonnet-4-6',
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    sendNotice: () => {},
    createStreamWithTools: async (_providerId, _apiKey, _history, options) => {
      options.onProviderToolStatus({
        type: 'running',
        toolCallId: 'ephemeral',
        toolName: 'command_execution',
        delta: 'ordinary streamed output',
      })
      options.onProviderToolStatus({
        type: 'running',
        toolCallId: 'durable',
        toolName: 'mcp_tool_call',
        model: 'provider-terminal-model',
        delta: 'Reading project files',
        activityKind: 'openai_account_mcp_progress',
        durable: true,
      })
      return {
        stopReason: 'stop',
        text: 'done',
        toolCalls: [],
        usage: null,
        reasoning: '',
      }
    },
  })

  assert.equal(sent.filter((entry) => entry.channel === 'chat:provider-tool-status').length, 2)
  assert.deepEqual(persisted, [{
    kind: 'provider_tool_status',
    payload: {
      role: 'assistant',
      content: 'Reading project files',
      lifecycle: 'active',
      progressiveKey: 'provider_tool_status:1:durable',
      meta: {
        threadId: 'thread_durable_status',
        turnId: 'turn_durable_status',
        round: 1,
        sequence: 2,
        providerId: 'anthropic',
        model: 'provider-terminal-model',
        type: 'running',
        toolCallId: 'durable',
        toolName: 'mcp_tool_call',
        delta: 'Reading project files',
        activityKind: 'openai_account_mcp_progress',
        durable: true,
      },
    },
  }])
})

test('executeProviderModelStream keeps recoverable provider protocol drift out of the viewport', async () => {
  const notices = []

  await executeProviderModelStream({
    providerId: 'openai',
    apiKey: 'account',
    history: [{ role: 'user', content: 'continue' }],
    options: { model: 'gpt-5.6-luna', tools: {} },
    activeProjectId: 'project_silent_drift',
    activeThreadId: 'thread_silent_drift',
    activeTurnId: 'turn_silent_drift',
    tools: {},
    round: 1,
    model: 'gpt-5.6-luna',
    send: () => {},
    persistTimelineEvent: () => {},
    sendNotice: (notice) => notices.push(notice),
    createStreamWithTools: async (_providerId, _apiKey, _history, options) => {
      options.onProviderWarning({
        type: 'warning',
        text: 'Codex app-server activity',
        meta: {
          noticeKind: 'provider_protocol_drift',
          reason: 'unrecognized_provider_activity',
          protocolMethod: 'thread/futureState/updated',
        },
      })
      return {
        stopReason: 'stop',
        text: 'done',
        toolCalls: [],
        usage: null,
        reasoning: '',
      }
    },
  })

  assert.deepEqual(notices, [])
})

test('executeProviderModelStream preserves partial output and durable provider failure context when the stream rejects', async () => {
  const sent = []
  const persisted = []

  await assert.rejects(
    () => executeProviderModelStream({
      providerId: 'openai',
      apiKey: 'account',
      history: [{ role: 'user', content: 'continue' }],
      options: { model: 'gpt-5.4', tools: {} },
      activeProjectId: 'project_partial_failure',
      activeThreadId: 'thread_partial_failure',
      activeTurnId: 'turn_partial_failure',
      tools: {},
      round: 1,
      model: 'gpt-5.4',
      send: (channel, payload) => sent.push({ channel, payload }),
      persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
      sendNotice: () => {},
      createStreamWithTools: async (_providerId, _apiKey, _history, options, onChunk, onReasoning) => {
        onReasoning('Investigating the provider failure.')
        onChunk('Useful partial output.')
        options.onProviderToolStatus({
          type: 'failed',
          toolCallId: 'provider_error:turn_partial_failure',
          toolName: 'provider_error',
          delta: 'Provider connection closed.',
          activityKind: 'openai_account_turn_error',
          durable: true,
        })
        throw new Error('Provider connection closed.')
      },
    }),
    /Provider connection closed\./,
  )

  assert.equal(
    sent.some((entry) => (
      entry.channel === 'chat:chunk'
      && entry.payload?.chunk === 'Useful partial output.'
    )),
    true,
  )
  assert.equal(
    sent.some((entry) => (
      entry.channel === 'chat:provider-tool-status'
      && entry.payload?.activityKind === 'openai_account_turn_error'
    )),
    true,
  )
  assert.equal(
    persisted.some((entry) => (
      entry.kind === 'provider_tool_status'
      && entry.payload?.meta?.activityKind === 'openai_account_turn_error'
      && entry.payload?.meta?.type === 'failed'
    )),
    true,
  )
  const reasoningChunks = persisted.filter((entry) => entry.kind === 'execution_reasoning_chunk')
  assert.deepEqual(reasoningChunks.map((entry) => entry.payload.lifecycle), ['active', 'failed'])
  assert.deepEqual(
    reasoningChunks.map((entry) => entry.payload.content),
    ['Investigating the provider failure.', 'Investigating the provider failure.'],
  )
})

test('executeProviderModelStream forwards reasoning deltas into chat events and aggregates the reasoning buffer', async () => {
  const sent = []
  const persisted = []

  const streamResult = await executeProviderModelStream({
    providerId: 'anthropic',
    apiKey: 'test-key',
    history: [{ role: 'user', content: 'hello' }],
    options: { model: 'claude-sonnet-4-6', tools: {} },
    providerRuntimeSettings: {
      anthropic: {
        useContextManagementCompaction: false,
      },
    },
    activeProjectId: 'project_1',
    activeThreadId: 'thread_1',
    activeTurnId: 'turn_1',
    tools: {},
    round: 1,
    model: 'claude-sonnet-4-6',
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    sendNotice: () => {},
    createStreamWithTools: async (_providerId, _apiKey, _history, _options, onChunk, onReasoning) => {
      onReasoning('First reasoning step. ')
      onReasoning('Second reasoning step.')
      onChunk('Final answer.')
      return {
        stopReason: 'stop',
        text: 'Final answer.',
        toolCalls: [],
        usage: null,
        reasoning: '',
      }
    },
  })

  const reasoningEvents = sent.filter((entry) => entry.channel === 'chat:reasoning-chunk')
  assert.equal(reasoningEvents.length, 2)
  assert.equal(reasoningEvents[0]?.payload?.sequence, 1)
  assert.equal(reasoningEvents[1]?.payload?.sequence, 2)
  assert.equal(reasoningEvents[0]?.payload?.chunk, 'First reasoning step. ')
  assert.equal(reasoningEvents[1]?.payload?.chunk, 'Second reasoning step.')
  assert.equal(reasoningEvents[0]?.payload?.providerId, 'anthropic')
  assert.equal(reasoningEvents[0]?.payload?.model, 'claude-sonnet-4-6')

  const answerEvents = sent.filter((entry) => entry.channel === 'chat:chunk')
  assert.equal(answerEvents.length, 1)
  assert.equal(answerEvents[0]?.payload?.chunk, 'Final answer.')
  assert.equal(answerEvents[0]?.payload?.providerId, 'anthropic')
  assert.equal(answerEvents[0]?.payload?.model, 'claude-sonnet-4-6')
  assert.deepEqual(
    persisted.map((entry) => entry.kind),
    ['execution_reasoning_chunk', 'execution_reasoning_chunk', 'execution_reasoning_chunk'],
  )
  assert.deepEqual(persisted.map((entry) => entry.payload.lifecycle), ['active', 'active', 'completed'])
  assert.equal(persisted[0]?.payload?.meta?.sequence, 1)
  assert.equal(persisted[1]?.payload?.meta?.sequence, 2)
  assert.equal(persisted[2]?.payload?.meta?.sequence, 2)
  assert.deepEqual(
    persisted.map((entry) => entry.payload?.meta?.reasoningSegment),
    [0, 0, 0],
  )
  assert.equal(persisted[0]?.payload?.progressiveKey, 'execution_reasoning:1')
  assert.equal(persisted[1]?.payload?.progressiveKey, 'execution_reasoning:1')
  assert.equal(persisted[2]?.payload?.progressiveKey, 'execution_reasoning:1')
  assert.equal(persisted[0]?.payload?.content, 'First reasoning step. ')
  assert.equal(persisted[1]?.payload?.content, 'First reasoning step. Second reasoning step.')
  assert.equal(persisted[2]?.payload?.content, 'First reasoning step. Second reasoning step.')

  assert.equal(streamResult.reasoningBuffer, 'First reasoning step. Second reasoning step.')
  assert.equal(streamResult.text, 'Final answer.')
})

test('executeProviderModelStream forwards normalized chunk phase into chat:chunk payloads', async () => {
  const sent = []
  const persisted = []

  const streamResult = await executeProviderModelStream({
    providerId: 'anthropic',
    apiKey: 'test-key',
    history: [{ role: 'user', content: 'hello' }],
    options: { model: 'claude-sonnet-4-6', tools: {} },
    activeProjectId: 'project_phase',
    activeThreadId: 'thread_phase',
    activeTurnId: 'turn_phase',
    tools: {},
    round: 1,
    model: 'claude-sonnet-4-6',
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    sendNotice: () => {},
    createStreamWithTools: async (_providerId, _apiKey, _history, _options, onChunk) => {
      onChunk({ chunk: 'Inspecting files. ', phase: 'commentary' })
      onChunk({ text: 'Checking the scheduler. ', phase: 'commentary', boundaryBefore: true })
      onChunk({ delta: 'Final answer.', phase: 'final answer' })
      onChunk({ chunk: { unexpected: 'provider object' }, phase: 'final answer' })
      return {
        stopReason: 'stop',
        text: 'Final answer.',
        toolCalls: [],
        usage: null,
        reasoning: '',
      }
    },
  })

  const answerEvents = sent.filter((entry) => entry.channel === 'chat:chunk')
  assert.equal(answerEvents.length, 3)
  assert.equal(answerEvents[0]?.payload?.chunk, 'Inspecting files. ')
  assert.equal(answerEvents[0]?.payload?.phase, 'commentary')
  assert.equal(answerEvents[1]?.payload?.chunk, '\n\nChecking the scheduler. ')
  assert.equal(answerEvents[1]?.payload?.phase, 'commentary')
  assert.equal(answerEvents[2]?.payload?.chunk, 'Final answer.')
  assert.equal(answerEvents[2]?.payload?.phase, 'final_answer')
  assert.equal(answerEvents[0]?.payload?.sequence, 1)
  assert.equal(answerEvents[1]?.payload?.sequence, 2)
  assert.equal(answerEvents[2]?.payload?.sequence, 3)
  assert.equal(streamResult.commentaryBuffer, 'Inspecting files. \n\nChecking the scheduler. ')
  assert.deepEqual(
    persisted.map((entry) => entry.kind),
    ['execution_commentary_chunk', 'execution_commentary_chunk', 'execution_commentary_chunk'],
  )
  assert.deepEqual(persisted.map((entry) => entry.payload.lifecycle), ['active', 'active', 'completed'])
  assert.equal(persisted[0]?.payload?.progressiveKey, 'execution_commentary:1')
  assert.equal(persisted[1]?.payload?.progressiveKey, 'execution_commentary:1')
  assert.equal(persisted[2]?.payload?.progressiveKey, 'execution_commentary:1')
  assert.equal(String(persisted[0]?.payload?.content || ''), 'Inspecting files. ')
  assert.equal(String(persisted[1]?.payload?.content || ''), 'Inspecting files. \n\nChecking the scheduler. ')
  assert.equal(String(persisted[2]?.payload?.content || ''), 'Inspecting files. \n\nChecking the scheduler. ')
})

test('OpenAI account reasoning keeps provider-tool phases independently ordered', async () => {
  const sent = []
  const persisted = []

  const streamResult = await executeProviderModelStream({
    providerId: 'openai',
    apiKey: '',
    history: [{ role: 'user', content: 'inspect both files' }],
    options: { model: 'gpt-5.6-luna', tools: {} },
    activeProjectId: 'project-luna',
    activeThreadId: 'thread-luna',
    activeTurnId: 'turn-luna',
    activeAssistantMessageId: 'assistant-luna',
    tools: {},
    round: 1,
    model: 'gpt-5.6-luna',
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    sendNotice: () => {},
    createStreamWithTools: async (_providerId, _apiKey, _history, providerOptions, onChunk, onReasoning) => {
      onReasoning('Preparing the first read.')
      onChunk({ chunk: 'I will inspect the first file.', phase: 'commentary' })
      providerOptions.onProviderToolBoundary({
        type: 'running', toolName: 'read_file',
      })
      onReasoning('Reviewing the first file.')
      onChunk({ chunk: 'I will inspect the second file.', phase: 'commentary' })
      providerOptions.onProviderToolBoundary({
        type: 'running', toolCallId: 'image-2', toolName: 'image_generation',
      })
      providerOptions.onProviderToolOutput({
        type: 'tool-output-available', toolCallId: 'image-2', toolName: 'image_generation', output: { ok: true },
      })
      onReasoning('Comparing the second file.')
      return {
        stopReason: 'stop',
        text: 'Final answer.',
        toolCalls: [],
        usage: null,
        reasoning: 'Preparing the first read.Reviewing the first file.Comparing the second file.',
        providerResponseMeta: { authMethod: 'account', transportMode: 'codex_app_server_chatgpt' },
      }
    },
  })

  const reasoningEvents = sent.filter((entry) => (
    entry.channel === 'chat:reasoning-chunk' && entry.payload.flushPending !== true
  ))
  assert.deepEqual(reasoningEvents.map((entry) => entry.payload.reasoningSegment), [0, 1, 2])
  const boundaryEvents = sent.filter((entry) => (
    entry.channel === 'chat:reasoning-chunk' && entry.payload.flushPending === true
  ))
  assert.deepEqual(boundaryEvents.map((entry) => entry.payload.reasoningSegment), [0, 1])
  const orderedChannels = sent
    .filter((entry) => (
      entry.channel === 'chat:reasoning-chunk'
      || entry.channel === 'chat:provider-tool-status'
      || entry.channel === 'chat:provider-tool-output'
    ))
    .map((entry) => entry.payload.flushPending === true ? 'reasoning-flush' : entry.channel)
  assert.deepEqual(orderedChannels, [
    'chat:reasoning-chunk',
    'reasoning-flush',
    'chat:reasoning-chunk',
    'reasoning-flush',
    'chat:reasoning-chunk',
    'chat:provider-tool-output',
  ])
  const reasoningRecords = persisted.filter((entry) => entry.kind === 'execution_reasoning_chunk')
  assert.deepEqual(reasoningRecords.map((entry) => entry.payload.progressiveKey), [
    'execution_reasoning:1:0',
    'execution_reasoning:1:1',
    'execution_reasoning:1:2',
    'execution_reasoning:1:2',
  ])
  assert.deepEqual(reasoningRecords.slice(0, 3).map((entry) => entry.payload.content), [
    'Preparing the first read.',
    'Reviewing the first file.',
    'Comparing the second file.',
  ])
  const commentaryRecords = persisted.filter((entry) => entry.kind === 'execution_commentary_chunk')
  assert.deepEqual(commentaryRecords.map((entry) => entry.payload.progressiveKey), [
    'execution_commentary:1:0',
    'execution_commentary:1:1',
  ])
  assert.deepEqual(commentaryRecords.slice(0, 2).map((entry) => entry.payload.content), [
    'I will inspect the first file.',
    'I will inspect the second file.',
  ])
  assert.equal(streamResult.currentReasoningBuffer, 'Comparing the second file.')
})

test('executeProviderModelStream defers unphased OpenRouter text while a tool-capable round is unresolved', async () => {
  const sent = []

  const streamResult = await executeProviderModelStream({
    providerId: 'openrouter',
    apiKey: 'test-key',
    history: [{ role: 'user', content: 'build it' }],
    options: { model: 'openai/gpt-5.4', tools: { read_file: {} } },
    activeProjectId: 'project_openrouter',
    activeThreadId: 'thread_openrouter',
    activeTurnId: 'turn_openrouter',
    tools: { read_file: {} },
    round: 1,
    model: 'openai/gpt-5.4',
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: () => {},
    sendNotice: () => {},
    createStreamWithTools: async (_providerId, _apiKey, _history, _options, onChunk) => {
      onChunk('I\'ll inspect the existing site first.')
      return {
        stopReason: 'tool_calls',
        text: 'I\'ll inspect the existing site first.',
        toolCalls: [{ id: 'call_openrouter', name: 'read_file', input: { path: 'website/index.html' } }],
        usage: null,
        reasoning: '',
      }
    },
  })

  assert.equal(sent.some((entry) => entry.channel === 'chat:chunk'), false)
  assert.equal(streamResult.text, 'I\'ll inspect the existing site first.')
})

test('executeProviderModelStream recovers prefixed Kimi progress from a terminal text block', async () => {
  const sent = []
  const persisted = []
  const userMessage = 'read two files'
  const combinedText = `**What I will inspect**: README.md for documented npm commands and package.json for the actual scripts defined.

**Progress update after reading README.md**: The README documents two commands: \`npm run check\` and \`npm run start\`. Now reading package.json to compare with actual scripts.

FINAL ACCEPTANCE:
- Documented commands: \`npm run check\`, \`npm run start\`
- Actual scripts: \`check\`, \`dev\`
- Mismatch: \`start\` is missing and \`dev\` is undocumented`

  const streamResult = await executeProviderModelStream({
    providerId: 'openrouter',
    apiKey: 'test-key',
    history: [{ role: 'user', content: userMessage }],
    options: { model: 'moonshotai/kimi-k2', tools: { read_file: {} } },
    activeProjectId: 'project_kimi',
    activeThreadId: 'thread_kimi',
    activeTurnId: 'turn_kimi',
    activeAssistantMessageId: 'assistant_kimi',
    tools: { read_file: {} },
    round: 2,
    model: 'moonshotai/kimi-k2',
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    sendNotice: () => {},
    createStreamWithTools: async (_providerId, _apiKey, _history, _options, onChunk) => {
      onChunk(combinedText)
      return {
        stopReason: 'stop',
        text: combinedText,
        toolCalls: [],
        usage: { reasoningTokens: 359 },
        reasoning: '',
      }
    },
  })

  const textEvents = sent.filter((entry) => entry.channel === 'chat:chunk')
  assert.deepEqual(textEvents.map((entry) => entry.payload.phase), [
    'commentary',
    'commentary',
    'final_answer',
  ])
  assert.deepEqual(textEvents.slice(0, 2).map((entry) => entry.payload.chunk.trim()), [
    '**What I will inspect**: README.md for documented npm commands and package.json for the actual scripts defined.',
    '**Progress update after reading README.md**: The README documents two commands: `npm run check` and `npm run start`. Now reading package.json to compare with actual scripts.',
  ])
  assert.equal(textEvents[2]?.payload?.chunk, `FINAL ACCEPTANCE:
- Documented commands: \`npm run check\`, \`npm run start\`
- Actual scripts: \`check\`, \`dev\`
- Mismatch: \`start\` is missing and \`dev\` is undocumented`)
  assert.equal(streamResult.text, textEvents[2]?.payload?.chunk)
  assert.equal(streamResult.commentaryBuffer, textEvents.slice(0, 2).map((entry) => entry.payload.chunk.trim()).join('\n\n'))
  assert.equal(persisted.filter((entry) => entry.kind === 'execution_commentary_chunk').length, 3)
})

test('executeProviderModelStream defers unphased DeepSeek text while a tool-capable round is unresolved', async () => {
  const sent = []

  const streamResult = await executeProviderModelStream({
    providerId: 'deepseek',
    apiKey: 'test-key',
    history: [{ role: 'user', content: 'inspect it' }],
    options: { model: 'deepseek-v4-pro', tools: { read_file: {} } },
    activeProjectId: 'project_deepseek',
    activeThreadId: 'thread_deepseek',
    activeTurnId: 'turn_deepseek',
    tools: { read_file: {} },
    round: 1,
    model: 'deepseek-v4-pro',
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: () => {},
    sendNotice: () => {},
    createStreamWithTools: async (_providerId, _apiKey, _history, _options, onChunk) => {
      onChunk('I will inspect the file first.')
      return {
        stopReason: 'tool_calls',
        text: 'I will inspect the file first.',
        toolCalls: [{ id: 'call_deepseek', name: 'read_file', input: { path: 'README.md' } }],
        usage: null,
        reasoning: '',
      }
    },
  })

  assert.equal(sent.some((entry) => entry.channel === 'chat:chunk'), false)
  assert.equal(streamResult.text, 'I will inspect the file first.')
})

test('executeProviderModelStream emits account context usage updates from live stream telemetry', async () => {
  const sent = []
  const persisted = []

  await executeProviderModelStream({
    providerId: 'openai',
    apiKey: 'test-key',
    history: [{ role: 'user', content: 'hello' }],
    options: { model: 'gpt-5.4', tools: {} },
    activeProjectId: 'project_usage',
    activeThreadId: 'thread_usage',
    activeTurnId: 'turn_usage',
    tools: {},
    round: 1,
    model: 'gpt-5.4',
    buildChatUsagePayload,
    modelContext: { limitTokens: 258_400 },
    promptOccupancyEstimateTokens: 42_000,
    promptOccupancyEstimateConfidence: 'rough_estimate',
    promptOccupancyEstimateMethod: 'history_estimate',
    rollingUsage: {
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
    },
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, event) => persisted.push({ kind, event }),
    sendNotice: () => {},
    createStreamWithTools: async (_providerId, _apiKey, _history, options) => {
      options.onContextUsageUpdate({
        accountBridgeThreadId: 'bridge_thread_usage',
        accountBridgeTurnId: 'bridge_turn_usage',
        remainingContextTokens: 88_878,
        threadOccupancyTokens: 169_522,
        threadCumulativeTotalTokens: 686_322,
        providerUsageSemantics: 'openai_account_provider_context',
      })
      return {
        stopReason: 'stop',
        text: 'done',
        toolCalls: [],
        usage: null,
        reasoning: '',
      }
    },
  })

  const usageEvents = sent.filter((entry) => entry.channel === 'chat:usage')
  assert.equal(usageEvents.length, 1)
  assert.equal(usageEvents[0]?.payload?.threadId, 'thread_usage')
  assert.equal(usageEvents[0]?.payload?.turnId, 'turn_usage')
  assert.equal(usageEvents[0]?.payload?.contextRemainingTokens, 88_878)
  assert.equal(usageEvents[0]?.payload?.contextOccupancyTokens, 169_522)
  assert.equal(usageEvents[0]?.payload?.accountBridgeThreadId, 'bridge_thread_usage')
  assert.equal(usageEvents[0]?.payload?.accountBridgeTurnId, 'bridge_turn_usage')
  assert.equal(usageEvents[0]?.payload?.rollingTotalTokens, 0)
  assert.equal(persisted.length, 1)
  assert.equal(persisted[0]?.kind, 'chat_usage')
  assert.equal(persisted[0]?.event?.meta?.accountBridgeThreadId, 'bridge_thread_usage')
})

test('executeProviderModelStream persists the accepted account occupancy when a same-generation sample regresses', async () => {
  const sent = []
  const persisted = []

  await executeProviderModelStream({
    providerId: 'openai',
    apiKey: 'test-key',
    history: [{ role: 'user', content: 'hello again' }],
    options: { model: 'gpt-5.4', tools: {} },
    activeProjectId: 'project_usage_monotonic',
    activeThreadId: 'thread_usage_monotonic',
    activeTurnId: 'turn_usage_monotonic_2',
    tools: {},
    round: 1,
    model: 'gpt-5.4',
    buildChatUsagePayload,
    modelContext: { limitTokens: 200_000 },
    rollingUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
    resolveLatestContextUsage: () => ({
      threadId: 'thread_usage_monotonic',
      turnId: 'turn_usage_monotonic_1',
      authMethod: 'account',
      accountBridgeThreadId: 'bridge_usage_monotonic',
      contextCompactionGeneration: 0,
      modelLimit: 200_000,
      providerOccupancyTokens: 80_000,
      effectiveOccupancyTokens: 80_000,
      contextOccupancyTokens: 80_000,
      contextRemainingTokens: 120_000,
      remainingTokens: 120_000,
      occupancySource: 'provider_thread_context',
      occupancyConfidence: 'provider_verified',
    }),
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, event) => persisted.push({ kind, event }),
    sendNotice: () => {},
    createStreamWithTools: async (_providerId, _apiKey, _history, options) => {
      options.onContextUsageUpdate({
        accountBridgeThreadId: 'bridge_usage_monotonic',
        accountBridgeTurnId: 'bridge_turn_usage_monotonic_2',
        inputLimitTokens: 200_000,
        threadOccupancyTokens: 70_000,
        remainingContextTokens: 130_000,
        providerUsageSemantics: 'openai_account_provider_context',
      })
      return { stopReason: 'stop', text: 'done', toolCalls: [], usage: null, reasoning: '' }
    },
  })

  const usageEvent = sent.find((entry) => entry.channel === 'chat:usage')
  assert.equal(usageEvent?.payload?.contextOccupancyTokens, 80_000)
  assert.equal(usageEvent?.payload?.contextRemainingTokens, 120_000)
  assert.equal(usageEvent?.payload?.contextUsageAnomaly, 'account_context_usage_regression_without_compaction')
  assert.deepEqual(persisted.map((entry) => entry.kind), [
    'account_context_usage_anomaly',
    'chat_usage',
  ])
  assert.equal(persisted[1]?.event?.meta?.contextOccupancyTokens, 80_000)
})

test('resolveScopedProviderRuntimeSettings normalizes provider ids and does not leak full settings maps', () => {
  assert.deepEqual(
    resolveScopedProviderRuntimeSettings('OpenAI', {
      openai: { transportMode: 'responses_stream' },
      gemini: { exampleFlag: true },
    }),
    { transportMode: 'responses_stream' },
  )

  assert.equal(
    resolveScopedProviderRuntimeSettings('gemini', {
      openai: { transportMode: 'responses_stream' },
    }),
    null,
  )

  assert.deepEqual(
    resolveScopedProviderRuntimeSettings('gemini', { exampleFlag: true }),
    { exampleFlag: true },
  )
})

test('finalizeProviderModelRound continues into tool execution when tool calls exist even with stop finish reasons', () => {
  const history = []
  let finalizedWithoutTools = false

  const result = finalizeProviderModelRound({
    streamResult: {
      stopReason: 'end_turn',
      text: '',
      toolCalls: [{ id: 'call_1', name: 'read_file', input: { path: 'src/app.js' } }],
      usage: null,
      reasoning: '',
      providerResponseMeta: null,
      reasoningBuffer: '',
    },
    errorDiagnostics: {
      mode: 'execute',
      requestedToolCount: 1,
      toolCallCount: 0,
      usedTools: [],
      rollingTotalTokens: 0,
      modelTextualApprovalCueCount: 0,
    },
    turnStartedAt: Date.now(),
    rollingUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
    buildChatUsagePayload: () => null,
    emitUsageEvent: () => {},
    send: () => {},
    persistTimelineEvent: () => {},
    modelContext: {},
    promptOccupancyEstimateTokens: 0,
    round: 1,
    emitReasoningDone: () => {},
    activeThreadId: 'thread_1',
    activeTurnId: 'turn_1',
    providerId: 'openai',
    model: 'gpt-5.2',
    turnReasoningSegments: [],
    openAIContinuityEnabled: false,
    openAIRequestContextForRound: undefined,
    updateOpenAIContinuationContext: (value) => value,
    emitOpenAIResponseMeta: () => {},
    resolveOpenAIContinuationPersistence: () => ({}),
    repeatedToolCallState: { lastSignature: '', repeatedCount: 0 },
    recordRepeatedToolCallBatch: () => ({ blocked: false }),
    maxConsecutiveIdenticalToolRounds: 3,
    pushUniqueRuntimeValue: () => {},
    sendNotice: () => {},
    sendTurnState: () => {},
    loop: { cancelled: false },
    finalizeRoundWithoutTools: () => { finalizedWithoutTools = true },
    touchProjectUsageByThread: () => {},
    continuityRuntime: null,
    runPostTurnTasks: () => {},
    projectFolder: '',
    userMessage: '',
    turnToolResults: [],
    mode: 'execute',
    memoryCompressionEnabled: false,
    memoryCompressionThreshold: 0,
    memoryCompressionCooldownMs: 0,
    memoryCompressionMaxPerHour: 0,
    memoryCompressionMinNewLogs: 0,
    apiKey: '',
    isAbortError: () => false,
    assistantFinalPhase: 'final_answer',
    assistantCommentaryPhase: 'commentary',
    buildAssistantToolUseMessage: (text, toolCalls) => ({ role: 'assistant', content: [{ type: 'text', text }, ...toolCalls] }),
    history,
    detectTextualApprovalRequestWithoutToolCall: () => false,
  })

  assert.equal(finalizedWithoutTools, false)
  assert.equal(result.shouldBreakRoundLoop, false)
  assert.equal(Array.isArray(result.toolCalls), true)
  assert.equal(result.toolCalls.length, 1)
  assert.equal(history.length, 1)
  assert.equal(history[0]?.role, 'assistant')
  assert.equal(Array.isArray(history[0]?.content), true)
  assert.equal(history[0]?.content?.[1]?.name, 'read_file')
})

test('finalizeProviderModelRound surfaces an error instead of silently completing when assistant text is empty', () => {
  const sent = []
  const timeline = []
  const notices = []
  let turnState = null
  let finalizedWithoutTools = false

  const result = finalizeProviderModelRound({
    streamResult: {
      stopReason: 'stop',
      text: '   ',
      toolCalls: [],
      usage: null,
      reasoning: '',
      providerResponseMeta: null,
      reasoningBuffer: '',
    },
    errorDiagnostics: {
      mode: 'execute',
      requestedToolCount: 0,
      toolCallCount: 0,
      usedTools: [],
      guardrailFailures: [],
      rollingTotalTokens: 0,
      modelTextualApprovalCueCount: 0,
      failure_reason_code: '',
      failure_message_sanitized: '',
      next_action_hint: '',
    },
    turnStartedAt: Date.now(),
    rollingUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
    buildChatUsagePayload: () => null,
    emitUsageEvent: () => {},
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => timeline.push({ kind, payload }),
    modelContext: {},
    promptOccupancyEstimateTokens: 0,
    round: 1,
    emitReasoningDone: () => {},
    activeThreadId: 'thread_1',
    activeTurnId: 'turn_1',
    providerId: 'gemini',
    model: 'gemini-2.5-flash',
    turnReasoningSegments: [],
    openAIContinuityEnabled: false,
    openAIRequestContextForRound: undefined,
    updateOpenAIContinuationContext: (value) => value,
    emitOpenAIResponseMeta: () => {},
    resolveOpenAIContinuationPersistence: () => ({}),
    repeatedToolCallState: { lastSignature: '', repeatedCount: 0 },
    recordRepeatedToolCallBatch: () => ({ blocked: false }),
    maxConsecutiveIdenticalToolRounds: 3,
    pushUniqueRuntimeValue: (target, value) => {
      if (!Array.isArray(target)) return
      if (!target.includes(value)) target.push(value)
    },
    sendNotice: (payload) => notices.push(payload),
    sendTurnState: (_state, payload) => { turnState = payload },
    loop: { cancelled: false },
    finalizeRoundWithoutTools: () => { finalizedWithoutTools = true },
    touchProjectUsageByThread: () => {},
    continuityRuntime: null,
    runPostTurnTasks: () => {},
    projectFolder: '',
    userMessage: 'hey',
    turnToolResults: [],
    mode: 'execute',
    memoryCompressionEnabled: false,
    memoryCompressionThreshold: 0,
    memoryCompressionCooldownMs: 0,
    memoryCompressionMaxPerHour: 0,
    memoryCompressionMinNewLogs: 0,
    apiKey: '',
    isAbortError: () => false,
    assistantFinalPhase: 'final_answer',
    assistantCommentaryPhase: 'commentary',
    buildAssistantToolUseMessage: () => ({}),
    history: [],
    detectTextualApprovalRequestWithoutToolCall: () => false,
  })

  assert.equal(finalizedWithoutTools, false)
  assert.equal(result.shouldBreakRoundLoop, true)
  assert.equal(notices.length, 0)
  assert.equal(sent[0]?.channel, 'chat:error')
  assert.match(String(sent[0]?.payload?.message || ''), /no assistant text/i)
  assert.equal(turnState?.status, 'error')
  assert.match(String(turnState?.reason || ''), /No output generated/i)
  assert.equal(timeline[0]?.kind, 'chat_error')
  assert.match(String(timeline[0]?.payload?.content || ''), /no assistant text/i)
})

test('finalizeProviderModelRound accepts an intentionally blank transcript-quiet lifecycle completion', () => {
  let finalized = null
  let failure = null

  const result = finalizeProviderModelRound({
    streamResult: {
      stopReason: 'stop',
      text: '',
      toolCalls: [],
      usage: null,
      reasoning: '',
      providerResponseMeta: null,
      reasoningBuffer: '',
    },
    errorDiagnostics: { guardrailFailures: [] },
    loop: { cancelled: false },
    allowBlankAssistantCompletion: true,
    finalizeRoundWithoutTools: (payload) => { finalized = payload },
    commitFailureTurn: (payload) => { failure = payload },
  })

  assert.equal(result.shouldBreakRoundLoop, true)
  assert.equal(failure, null)
  assert.ok(finalized)
  assert.equal(finalized.assistantText, '')
})

test('finalizeProviderModelRound emits final-only reasoning through the canonical reasoning_done contract before final answer completion', () => {
  const sent = []
  const persisted = []
  const reasoningCalls = []
  let finalizedWithoutTools = false

  const result = finalizeProviderModelRound({
    streamResult: {
      stopReason: 'stop',
      text: 'Final answer.',
      toolCalls: [],
      usage: {
        reasoningTokens: 82,
      },
      reasoning: 'Final reasoning summary.',
      providerResponseMeta: null,
      reasoningBuffer: '',
    },
    errorDiagnostics: {
      mode: 'execute',
      requestedToolCount: 0,
      toolCallCount: 0,
      usedTools: [],
      guardrailFailures: [],
      rollingTotalTokens: 0,
      modelTextualApprovalCueCount: 0,
    },
    turnStartedAt: Date.now(),
    rollingUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
    buildChatUsagePayload: () => null,
    emitUsageEvent: () => {},
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    modelContext: {},
    promptOccupancyEstimateTokens: 0,
    round: 1,
    emitReasoningDone: (payload) => reasoningCalls.push(payload),
    activeThreadId: 'thread_final_reasoning',
    activeTurnId: 'turn_final_reasoning',
    providerId: 'gemini',
    model: 'gemini-2.5-flash',
    turnReasoningSegments: [],
    openAIContinuityEnabled: false,
    openAIRequestContextForRound: undefined,
    updateOpenAIContinuationContext: (value) => value,
    emitOpenAIResponseMeta: () => {},
    resolveOpenAIContinuationPersistence: () => ({}),
    repeatedToolCallState: { lastSignature: '', repeatedCount: 0 },
    recordRepeatedToolCallBatch: () => ({ blocked: false }),
    maxConsecutiveIdenticalToolRounds: 3,
    pushUniqueRuntimeValue: () => {},
    sendNotice: () => {},
    sendTurnState: () => {},
    loop: { cancelled: false },
    finalizeRoundWithoutTools: () => { finalizedWithoutTools = true },
    touchProjectUsageByThread: () => {},
    continuityRuntime: null,
    runPostTurnTasks: () => {},
    projectFolder: '',
    userMessage: 'Continue',
    turnToolResults: [],
    mode: 'execute',
    memoryCompressionEnabled: false,
    memoryCompressionThreshold: 0,
    memoryCompressionCooldownMs: 0,
    memoryCompressionMaxPerHour: 0,
    memoryCompressionMinNewLogs: 0,
    apiKey: '',
    isAbortError: () => false,
    assistantFinalPhase: 'final_answer',
    assistantCommentaryPhase: 'commentary',
    buildAssistantToolUseMessage: () => ({}),
    history: [],
    detectTextualApprovalRequestWithoutToolCall: () => false,
  })

  assert.equal(result.shouldBreakRoundLoop, true)
  assert.equal(finalizedWithoutTools, true)
  assert.equal(reasoningCalls.length, 1)
  assert.equal(reasoningCalls[0]?.reasoningBuffer, 'Final reasoning summary.')
  assert.equal(reasoningCalls[0]?.usageReasoningTokens, 82)
  assert.equal(reasoningCalls[0]?.threadId, 'thread_final_reasoning')
  assert.equal(reasoningCalls[0]?.turnId, 'turn_final_reasoning')
  assert.equal(sent.length, 0)
  assert.equal(persisted.length, 0)
})

test('finalizeProviderModelRound prefers authoritative reasoning over malformed streamed reconstruction', () => {
  const reasoningCalls = []
  const turnReasoningSegments = []
  finalizeProviderModelRound({
    streamResult: {
      stopReason: 'stop', text: 'Final answer.', toolCalls: [], usage: {},
      reasoning: 'The user wants a concise review.',
      reasoningBuffer: 'Theuserwantsaconcisereview.',
      providerResponseMeta: null,
    },
    errorDiagnostics: {
      mode: 'execute', requestedToolCount: 0, toolCallCount: 0, usedTools: [],
      guardrailFailures: [], rollingTotalTokens: 0, modelTextualApprovalCueCount: 0,
    },
    turnStartedAt: Date.now(),
    rollingUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
    buildChatUsagePayload: () => null, emitUsageEvent: () => {}, send: () => {},
    persistTimelineEvent: () => {}, modelContext: {}, promptOccupancyEstimateTokens: 0,
    round: 1, emitReasoningDone: (payload) => reasoningCalls.push(payload),
    activeThreadId: 'thread_snapshot', activeTurnId: 'turn_snapshot', providerId: 'openrouter',
    model: 'deepseek/deepseek-v4-pro', turnReasoningSegments,
    openAIContinuityEnabled: false, openAIRequestContextForRound: undefined,
    updateOpenAIContinuationContext: (value) => value, emitOpenAIResponseMeta: () => {},
    resolveOpenAIContinuationPersistence: () => ({}),
    repeatedToolCallState: { lastSignature: '', repeatedCount: 0 },
    recordRepeatedToolCallBatch: () => ({ blocked: false }), maxConsecutiveIdenticalToolRounds: 3,
    pushUniqueRuntimeValue: () => {}, sendNotice: () => {}, sendTurnState: () => {},
    loop: { cancelled: false }, finalizeRoundWithoutTools: () => {}, touchProjectUsageByThread: () => {},
    continuityRuntime: null, runPostTurnTasks: () => {}, projectFolder: '', userMessage: 'Continue',
    turnToolResults: [], mode: 'execute', memoryCompressionEnabled: false,
    memoryCompressionThreshold: 0, memoryCompressionCooldownMs: 0,
    memoryCompressionMaxPerHour: 0, memoryCompressionMinNewLogs: 0, apiKey: '',
    isAbortError: () => false, assistantFinalPhase: 'final_answer',
    assistantCommentaryPhase: 'commentary', buildAssistantToolUseMessage: () => ({}), history: [],
    detectTextualApprovalRequestWithoutToolCall: () => false,
  })

  assert.equal(reasoningCalls[0]?.reasoningBuffer, 'The user wants a concise review.')
})

test('finalizeProviderModelRound forwards Anthropic provider reasoning history parts on no-tool completion', () => {
  const finalizedCalls = []

  const providerReasoningParts = [
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
  ]

  const result = finalizeProviderModelRound({
    streamResult: {
      stopReason: 'stop',
      text: 'Final answer.',
      toolCalls: [],
      usage: null,
      reasoning: 'Readable UI reasoning only.',
      providerResponseMeta: null,
      reasoningBuffer: '',
      providerReasoningParts,
    },
    errorDiagnostics: {
      mode: 'execute',
      requestedToolCount: 0,
      toolCallCount: 0,
      usedTools: [],
      guardrailFailures: [],
      rollingTotalTokens: 0,
      modelTextualApprovalCueCount: 0,
    },
    turnStartedAt: Date.now(),
    rollingUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
    buildChatUsagePayload: () => null,
    emitUsageEvent: () => {},
    send: () => {},
    persistTimelineEvent: () => {},
    modelContext: {},
    promptOccupancyEstimateTokens: 0,
    round: 1,
    emitReasoningDone: () => {},
    activeThreadId: 'thread_anthropic_reasoning',
    activeTurnId: 'turn_anthropic_reasoning',
    activeAssistantMessageId: 'assistant_anthropic_reasoning',
    providerId: 'anthropic',
    model: 'claude-sonnet-4-6',
    turnReasoningSegments: [],
    openAIContinuityEnabled: false,
    openAIRequestContextForRound: undefined,
    updateOpenAIContinuationContext: (value) => value,
    emitOpenAIResponseMeta: () => {},
    resolveOpenAIContinuationPersistence: () => ({}),
    repeatedToolCallState: { lastSignature: '', repeatedCount: 0 },
    recordRepeatedToolCallBatch: () => ({ blocked: false }),
    maxConsecutiveIdenticalToolRounds: 3,
    pushUniqueRuntimeValue: () => {},
    sendNotice: () => {},
    sendTurnState: () => {},
    loop: { cancelled: false },
    finalizeRoundWithoutTools: (payload) => { finalizedCalls.push(payload) },
    touchProjectUsageByThread: () => {},
    continuityRuntime: null,
    runPostTurnTasks: () => {},
    projectFolder: '',
    userMessage: 'Continue',
    turnToolResults: [],
    mode: 'execute',
    memoryCompressionEnabled: false,
    memoryCompressionThreshold: 0,
    memoryCompressionCooldownMs: 0,
    memoryCompressionMaxPerHour: 0,
    memoryCompressionMinNewLogs: 0,
    apiKey: '',
    isAbortError: () => false,
    assistantFinalPhase: 'final_answer',
    assistantCommentaryPhase: 'commentary',
    buildAssistantToolUseMessage: () => ({}),
    history: [],
    detectTextualApprovalRequestWithoutToolCall: () => false,
  })

  assert.equal(result.shouldBreakRoundLoop, true)
  assert.equal(finalizedCalls.length, 1)
  assert.equal(finalizedCalls[0]?.assistantText, 'Final answer.')
  assert.equal(finalizedCalls[0]?.assistantMessageId, 'assistant_anthropic_reasoning')
  assert.deepEqual(finalizedCalls[0]?.assistantHistoryParts, [
    ...providerReasoningParts,
    { type: 'text', text: 'Final answer.' },
  ])
})

test('finalizeProviderModelRound does not synthesize duplicate persisted commentary for completed no-tool turns', () => {
  const persisted = []
  let finalizedWithoutTools = false

  const result = finalizeProviderModelRound({
    streamResult: {
      stopReason: 'stop',
      text: 'Final answer only.',
      toolCalls: [],
      usage: null,
      reasoning: '',
      providerResponseMeta: {
        authMethod: 'account',
        transportMode: 'codex_app_server_chatgpt',
      },
      reasoningBuffer: '',
      commentaryBuffer: 'Inspecting the workspace first. Now drafting the final answer. ',
    },
    errorDiagnostics: {
      mode: 'execute',
      requestedToolCount: 0,
      toolCallCount: 0,
      usedTools: [],
      guardrailFailures: [],
      rollingTotalTokens: 0,
      modelTextualApprovalCueCount: 0,
    },
    turnStartedAt: Date.now(),
    rollingUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
    buildChatUsagePayload: () => null,
    emitUsageEvent: () => {},
    send: () => {},
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    modelContext: {},
    promptOccupancyEstimateTokens: 0,
    round: 1,
    emitReasoningDone: () => {},
    activeThreadId: 'thread_execution_persisted',
    activeTurnId: 'turn_execution_persisted',
    providerId: 'openai',
    model: 'gpt-5.4',
    turnReasoningSegments: [],
    openAIContinuityEnabled: false,
    openAIRequestContextForRound: undefined,
    updateOpenAIContinuationContext: (value) => value,
    emitOpenAIResponseMeta: () => {},
    resolveOpenAIContinuationPersistence: () => ({}),
    repeatedToolCallState: { lastSignature: '', repeatedCount: 0 },
    recordRepeatedToolCallBatch: () => ({ blocked: false }),
    maxConsecutiveIdenticalToolRounds: 3,
    pushUniqueRuntimeValue: () => {},
    sendNotice: () => {},
    sendTurnState: () => {},
    loop: { cancelled: false },
    finalizeRoundWithoutTools: ({ persistTimelineEvent: persistFinalAssistantMessage, assistantText, assistantPhase }) => {
      finalizedWithoutTools = true
      persistFinalAssistantMessage('assistant_message', {
        role: 'assistant',
        content: assistantText,
        meta: {
          phase: assistantPhase,
        },
      })
    },
    touchProjectUsageByThread: () => {},
    continuityRuntime: null,
    runPostTurnTasks: () => {},
    projectFolder: '',
    userMessage: 'Continue',
    turnToolResults: [],
    mode: 'execute',
    memoryCompressionEnabled: false,
    memoryCompressionThreshold: 0,
    memoryCompressionCooldownMs: 0,
    memoryCompressionMaxPerHour: 0,
    memoryCompressionMinNewLogs: 0,
    apiKey: '',
    isAbortError: () => false,
    assistantFinalPhase: 'final_answer',
    assistantCommentaryPhase: 'commentary',
    buildAssistantToolUseMessage: () => ({}),
    history: [],
    detectTextualApprovalRequestWithoutToolCall: () => false,
  })

  assert.equal(result.shouldBreakRoundLoop, true)
  assert.equal(finalizedWithoutTools, true)
  assert.deepEqual(
    persisted.map((entry) => entry.kind),
    ['assistant_message'],
  )
  assert.equal(persisted[0]?.payload?.content, 'Final answer only.')
  assert.equal(persisted[0]?.payload?.meta?.phase, 'final_answer')
})

test('finalizeProviderModelRound keeps streamed commentary as the only local OpenAI execution-commentary path', () => {
  const sent = []
  const persisted = []

  const result = finalizeProviderModelRound({
    streamResult: {
      stopReason: 'tool_calls',
      text: 'Checking files before the patch.',
      toolCalls: [{ id: 'call_local_commentary', name: 'read_file', input: { path: 'src/app.js' } }],
      usage: null,
      reasoning: '',
      providerResponseMeta: {
        authMethod: 'api_key',
        transportMode: 'responses_stream',
      },
      reasoningBuffer: '',
      commentaryBuffer: 'Checking files before the patch.',
      commentaryChunkCount: 2,
    },
    errorDiagnostics: {
      mode: 'execute',
      requestedToolCount: 1,
      toolCallCount: 0,
      usedTools: [],
      guardrailFailures: [],
      rollingTotalTokens: 0,
      modelTextualApprovalCueCount: 0,
    },
    turnStartedAt: Date.now(),
    rollingUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
    buildChatUsagePayload: () => null,
    emitUsageEvent: () => {},
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    modelContext: {},
    promptOccupancyEstimateTokens: 0,
    round: 1,
    emitReasoningDone: () => {},
    activeThreadId: 'thread_local_commentary',
    activeTurnId: 'turn_local_commentary',
    activeAssistantMessageId: 'assistant_local_commentary',
    providerId: 'openai',
    model: 'gpt-5.4',
    turnReasoningSegments: [],
    openAIContinuityEnabled: false,
    openAIRequestContextForRound: undefined,
    updateOpenAIContinuationContext: (value) => value,
    emitOpenAIResponseMeta: () => {},
    resolveOpenAIContinuationPersistence: () => ({}),
    repeatedToolCallState: { lastSignature: '', repeatedCount: 0 },
    recordRepeatedToolCallBatch: () => ({ blocked: false }),
    maxConsecutiveIdenticalToolRounds: 3,
    pushUniqueRuntimeValue: () => {},
    sendNotice: () => {},
    sendTurnState: () => {},
    loop: { cancelled: false },
    finalizeRoundWithoutTools: () => {},
    touchProjectUsageByThread: () => {},
    continuityRuntime: null,
    runPostTurnTasks: () => {},
    projectFolder: '',
    userMessage: 'Continue',
    turnToolResults: [],
    mode: 'execute',
    memoryCompressionEnabled: false,
    memoryCompressionThreshold: 0,
    memoryCompressionCooldownMs: 0,
    memoryCompressionMaxPerHour: 0,
    memoryCompressionMinNewLogs: 0,
    apiKey: '',
    isAbortError: () => false,
    assistantFinalPhase: 'final_answer',
    assistantCommentaryPhase: 'commentary',
    buildAssistantToolUseMessage: (text, toolCalls) => ({ role: 'assistant', content: [{ type: 'text', text }, ...toolCalls] }),
    history: [],
    detectTextualApprovalRequestWithoutToolCall: () => false,
  })

  assert.equal(result.shouldBreakRoundLoop, false)
  assert.equal(sent.some((entry) => entry.channel === 'chat:assistant-commentary'), false)
  assert.deepEqual(
    persisted.map((entry) => entry.kind),
    ['tool_pending'],
  )
})

test('finalizeProviderModelRound preserves account-auth execution commentary behavior', () => {
  const sent = []
  const persisted = []

  const result = finalizeProviderModelRound({
    streamResult: {
      stopReason: 'tool_calls',
      text: 'Checking files before the patch.',
      toolCalls: [{ id: 'call_account_commentary', name: 'read_file', input: { path: 'src/app.js' } }],
      usage: null,
      reasoning: '',
      providerResponseMeta: {
        authMethod: 'account',
        transportMode: 'codex_app_server_chatgpt',
      },
      reasoningBuffer: '',
      commentaryBuffer: 'Checking files before the patch.',
      commentaryChunkCount: 2,
    },
    errorDiagnostics: {
      mode: 'execute',
      requestedToolCount: 1,
      toolCallCount: 0,
      usedTools: [],
      guardrailFailures: [],
      rollingTotalTokens: 0,
      modelTextualApprovalCueCount: 0,
    },
    turnStartedAt: Date.now(),
    rollingUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
    buildChatUsagePayload: () => null,
    emitUsageEvent: () => {},
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    modelContext: {},
    promptOccupancyEstimateTokens: 0,
    round: 1,
    emitReasoningDone: () => {},
    activeThreadId: 'thread_account_commentary',
    activeTurnId: 'turn_account_commentary',
    activeAssistantMessageId: 'assistant_account_commentary',
    providerId: 'openai',
    model: 'gpt-5.4',
    turnReasoningSegments: [],
    openAIContinuityEnabled: false,
    openAIRequestContextForRound: undefined,
    updateOpenAIContinuationContext: (value) => value,
    emitOpenAIResponseMeta: () => {},
    resolveOpenAIContinuationPersistence: () => ({}),
    repeatedToolCallState: { lastSignature: '', repeatedCount: 0 },
    recordRepeatedToolCallBatch: () => ({ blocked: false }),
    maxConsecutiveIdenticalToolRounds: 3,
    pushUniqueRuntimeValue: () => {},
    sendNotice: () => {},
    sendTurnState: () => {},
    loop: { cancelled: false },
    finalizeRoundWithoutTools: () => {},
    touchProjectUsageByThread: () => {},
    continuityRuntime: null,
    runPostTurnTasks: () => {},
    projectFolder: '',
    userMessage: 'Continue',
    turnToolResults: [],
    mode: 'execute',
    memoryCompressionEnabled: false,
    memoryCompressionThreshold: 0,
    memoryCompressionCooldownMs: 0,
    memoryCompressionMaxPerHour: 0,
    memoryCompressionMinNewLogs: 0,
    apiKey: '',
    isAbortError: () => false,
    assistantFinalPhase: 'final_answer',
    assistantCommentaryPhase: 'commentary',
    buildAssistantToolUseMessage: (text, toolCalls) => ({ role: 'assistant', content: [{ type: 'text', text }, ...toolCalls] }),
    history: [],
    detectTextualApprovalRequestWithoutToolCall: () => false,
  })

  assert.equal(result.shouldBreakRoundLoop, false)
  assert.equal(sent.some((entry) => entry.channel === 'chat:assistant-commentary'), true)
  assert.deepEqual(
    persisted.map((entry) => entry.kind),
    ['execution_commentary_chunk', 'tool_pending'],
  )
})

test('finalizeProviderModelRound preserves OpenRouter tool-round text as execution commentary', () => {
  const sent = []
  const persisted = []

  const result = finalizeProviderModelRound({
    streamResult: {
      stopReason: 'tool_calls',
      text: 'I\'ll inspect the existing site and calculator first.',
      toolCalls: [{ id: 'call_or', name: 'read_file', input: { path: 'src/app.js' } }],
      usage: null,
      reasoning: '',
      providerResponseMeta: null,
      reasoningBuffer: '',
      commentaryBuffer: '',
      commentaryChunkCount: 0,
    },
    errorDiagnostics: {
      mode: 'execute',
      requestedToolCount: 1,
      toolCallCount: 0,
      usedTools: [],
      guardrailFailures: [],
      rollingTotalTokens: 0,
      modelTextualApprovalCueCount: 0,
    },
    turnStartedAt: Date.now(),
    rollingUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
    buildChatUsagePayload: () => null,
    emitUsageEvent: () => {},
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    modelContext: {},
    promptOccupancyEstimateTokens: 0,
    round: 1,
    emitReasoningDone: () => {},
    activeThreadId: 'thread_openrouter_commentary',
    activeTurnId: 'turn_openrouter_commentary',
    activeAssistantMessageId: 'assistant_openrouter_commentary',
    providerId: 'openrouter',
    model: 'openai/gpt-5.4',
    turnReasoningSegments: [],
    openAIContinuityEnabled: false,
    openAIRequestContextForRound: undefined,
    updateOpenAIContinuationContext: (value) => value,
    emitOpenAIResponseMeta: () => {},
    resolveOpenAIContinuationPersistence: () => ({}),
    repeatedToolCallState: { lastSignature: '', repeatedCount: 0 },
    recordRepeatedToolCallBatch: () => ({ blocked: false }),
    maxConsecutiveIdenticalToolRounds: 3,
    pushUniqueRuntimeValue: () => {},
    sendNotice: () => {},
    sendTurnState: () => {},
    loop: { cancelled: false },
    finalizeRoundWithoutTools: () => {},
    touchProjectUsageByThread: () => {},
    continuityRuntime: null,
    runPostTurnTasks: () => {},
    projectFolder: '',
    userMessage: 'Continue',
    turnToolResults: [],
    mode: 'execute',
    memoryCompressionEnabled: false,
    memoryCompressionThreshold: 0,
    memoryCompressionCooldownMs: 0,
    memoryCompressionMaxPerHour: 0,
    memoryCompressionMinNewLogs: 0,
    apiKey: '',
    isAbortError: () => false,
    assistantFinalPhase: '',
    assistantCommentaryPhase: '',
    buildAssistantToolUseMessage: (text, toolCalls) => ({ role: 'assistant', content: [{ type: 'text', text }, ...toolCalls] }),
    history: [],
    detectTextualApprovalRequestWithoutToolCall: () => false,
  })

  assert.equal(result.shouldBreakRoundLoop, false)
  assert.equal(sent.some((entry) => entry.channel === 'chat:assistant-commentary'), true)
  assert.deepEqual(
    persisted.map((entry) => entry.kind),
    ['execution_commentary_chunk', 'tool_pending'],
  )
  assert.equal(persisted[0]?.payload?.content, 'I\'ll inspect the existing site and calculator first.')
})

test('emitStreamFailure surfaces the provider error text instead of forcing the generic no-output card', () => {
  const sent = []
  const timeline = []
  let turnState = null

  emitStreamFailure({
    outerErr: new Error("Invalid value: 'in-memory'. Supported values are: 'in_memory' and '24h'."),
    providerId: 'openai',
    model: 'gpt-5.1',
    errorDiagnostics: { runbookDetailMode: 'full' },
    send: (channel, payload) => sent.push({ channel, payload }),
    sendTurnState: (_state, payload) => { turnState = payload },
    persistTimelineEvent: (kind, payload) => timeline.push({ kind, payload }),
  })

  assert.equal(sent[0]?.channel, 'chat:error')
  assert.match(String(sent[0]?.payload?.message || ''), /in[-_]memory/i)
  assert.doesNotMatch(String(sent[0]?.payload?.message || ''), /^No output generated\./i)
  assert.match(String(turnState?.reason || ''), /in[-_]memory/i)
  assert.match(String(timeline[0]?.payload?.content || ''), /in[-_]memory/i)
})

test('finalizeProviderModelRound emits an Anthropic compaction event when provider metadata reports compaction', () => {
  const sent = []
  const timeline = []

  const result = finalizeProviderModelRound({
    streamResult: {
      stopReason: 'stop',
      text: 'done',
      toolCalls: [],
      usage: null,
      reasoning: '',
      providerResponseMeta: {
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-6',
        contextManagementApplied: true,
        contextManagementAppliedEdits: ['compact_20260112'],
        compactionApplied: true,
        compactionSummaryDetected: false,
        usageIterations: [
          { type: 'compaction', inputTokens: 1200, outputTokens: 140 },
          { type: 'message', inputTokens: 700, outputTokens: 110 },
        ],
      },
      reasoningBuffer: '',
    },
    errorDiagnostics: {
      mode: 'execute',
      requestedToolCount: 0,
      toolCallCount: 0,
      usedTools: [],
      guardrailFailures: [],
      rollingTotalTokens: 0,
      modelTextualApprovalCueCount: 0,
      failure_reason_code: '',
      failure_message_sanitized: '',
      next_action_hint: '',
    },
    turnStartedAt: Date.now(),
    rollingUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
    buildChatUsagePayload: () => null,
    emitUsageEvent: () => {},
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => timeline.push({ kind, payload }),
    modelContext: {},
    promptOccupancyEstimateTokens: 0,
    round: 2,
    emitReasoningDone: () => {},
    activeThreadId: 'thread_1',
    activeTurnId: 'turn_1',
    providerId: 'anthropic',
    model: 'claude-sonnet-4-6',
    turnReasoningSegments: [],
    openAIContinuityEnabled: false,
    openAIRequestContextForRound: undefined,
    providerRequestContextForRound: {
      anthropic: {
        contextManagementCompactionThresholdTokens: 80_000,
      },
    },
    updateOpenAIContinuationContext: (value) => value,
    emitOpenAIResponseMeta: () => {},
    resolveOpenAIContinuationPersistence: () => ({}),
    repeatedToolCallState: { lastSignature: '', repeatedCount: 0 },
    recordRepeatedToolCallBatch: () => ({ blocked: false }),
    maxConsecutiveIdenticalToolRounds: 3,
    pushUniqueRuntimeValue: () => {},
    sendNotice: () => {},
    sendTurnState: () => {},
    loop: { cancelled: false },
    finalizeRoundWithoutTools: () => {},
    touchProjectUsageByThread: () => {},
    continuityRuntime: null,
    runPostTurnTasks: () => {},
    projectFolder: '',
    userMessage: 'Continue',
    turnToolResults: [],
    mode: 'execute',
    memoryCompressionEnabled: false,
    memoryCompressionThreshold: 0,
    memoryCompressionCooldownMs: 0,
    memoryCompressionMaxPerHour: 0,
    memoryCompressionMinNewLogs: 0,
    apiKey: '',
    isAbortError: () => false,
    assistantFinalPhase: 'final_answer',
    assistantCommentaryPhase: 'commentary',
    buildAssistantToolUseMessage: () => ({}),
    history: [],
    detectTextualApprovalRequestWithoutToolCall: () => false,
  })

  assert.equal(result.shouldBreakRoundLoop, true)
  const compactionEvent = sent.find((entry) => entry.channel === 'chat:anthropic-compaction-event')
  assert.ok(compactionEvent)
  assert.equal(compactionEvent.payload.selectedCompactionMode, 'provider_chain_compaction')
  assert.deepEqual(compactionEvent.payload.candidateCompactionModes, ['provider_chain_compaction', 'local_summary'])
  assert.equal(compactionEvent.payload.contextManagementCompactionThresholdTokens, 80_000)
  assert.deepEqual(compactionEvent.payload.contextManagementAppliedEdits, ['compact_20260112'])
  assert.equal(timeline.some((entry) => entry.kind === 'anthropic_compaction_event'), true)
})

test('finalizeProviderModelRound emits thread-local usage estimates for OpenAI account turns without provider token usage', () => {
  let emittedUsagePayload = null
  let finalizedWithoutTools = false

  const result = finalizeProviderModelRound({
    streamResult: {
      stopReason: 'stop',
      text: 'done',
      toolCalls: [],
      usage: null,
      reasoning: '',
      providerResponseMeta: {
        authMethod: 'account',
        transportMode: 'codex_app_server_chatgpt',
      },
      reasoningBuffer: '',
    },
    errorDiagnostics: {
      mode: 'execute',
      requestedToolCount: 0,
      toolCallCount: 0,
      usedTools: [],
      guardrailFailures: [],
      rollingTotalTokens: 0,
      modelTextualApprovalCueCount: 0,
    },
    turnStartedAt: Date.now(),
    rollingUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
    buildChatUsagePayload,
    emitUsageEvent: ({ usagePayload }) => { emittedUsagePayload = usagePayload },
    send: () => {},
    persistTimelineEvent: () => {},
    modelContext: { limitTokens: 400000, source: 'verified_fallback' },
    promptOccupancyEstimateTokens: 12000,
    round: 1,
    emitReasoningDone: () => {},
    activeThreadId: 'thread_account_est',
    activeTurnId: 'turn_account_est',
    providerId: 'openai',
    model: 'gpt-5.4',
    turnReasoningSegments: [],
    openAIContinuityEnabled: false,
    openAIRequestContextForRound: undefined,
    updateOpenAIContinuationContext: (value) => value,
    emitOpenAIResponseMeta: () => {},
    resolveOpenAIContinuationPersistence: () => ({}),
    repeatedToolCallState: { lastSignature: '', repeatedCount: 0 },
    recordRepeatedToolCallBatch: () => ({ blocked: false }),
    maxConsecutiveIdenticalToolRounds: 3,
    pushUniqueRuntimeValue: () => {},
    sendNotice: () => {},
    sendTurnState: () => {},
    loop: { cancelled: false },
    finalizeRoundWithoutTools: () => { finalizedWithoutTools = true },
    touchProjectUsageByThread: () => {},
    continuityRuntime: null,
    runPostTurnTasks: () => {},
    projectFolder: '',
    userMessage: 'Continue',
    turnToolResults: [],
    mode: 'execute',
    memoryCompressionEnabled: false,
    memoryCompressionThreshold: 0,
    memoryCompressionCooldownMs: 0,
    memoryCompressionMaxPerHour: 0,
    memoryCompressionMinNewLogs: 0,
    apiKey: '',
    isAbortError: () => false,
    assistantFinalPhase: 'final_answer',
    assistantCommentaryPhase: 'commentary',
    buildAssistantToolUseMessage: () => ({}),
    history: [],
    detectTextualApprovalRequestWithoutToolCall: () => false,
  })

  assert.equal(result.shouldBreakRoundLoop, true)
  assert.equal(finalizedWithoutTools, true)
  assert.ok(emittedUsagePayload)
  assert.equal(emittedUsagePayload.source, 'account_thread_local_estimate')
  assert.equal(emittedUsagePayload.limitProvenance, 'account_thread_local_estimate')
  assert.equal(emittedUsagePayload.limitPrecision, 'estimated')
  assert.equal(emittedUsagePayload.occupancySource, 'thread_local_estimate')
  assert.equal(emittedUsagePayload.contextOccupancyTokens, 12000)
  assert.equal(emittedUsagePayload.providerUsageAvailable, false)
  assert.equal(emittedUsagePayload.authMethod, 'account')
  assert.equal(emittedUsagePayload.transportMode, 'codex_app_server_chatgpt')
})

test('finalizeProviderModelRound prefers mapped provider occupancy over the pre-call estimate when provider usage is valid', () => {
  let emittedUsagePayload = null

  const result = finalizeProviderModelRound({
    streamResult: {
      stopReason: 'stop',
      text: 'done',
      toolCalls: [],
      usage: getProviderUsageFixture('openai')?.expected,
      reasoning: '',
      providerResponseMeta: {
        authMethod: 'api_key',
        transportMode: 'responses_stream',
      },
      reasoningBuffer: '',
    },
    errorDiagnostics: {
      mode: 'execute',
      requestedToolCount: 0,
      toolCallCount: 0,
      usedTools: [],
      guardrailFailures: [],
      rollingTotalTokens: 0,
      modelTextualApprovalCueCount: 0,
    },
    turnStartedAt: Date.now(),
    rollingUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
    buildChatUsagePayload,
    emitUsageEvent: ({ usagePayload }) => { emittedUsagePayload = usagePayload },
    send: () => {},
    persistTimelineEvent: () => {},
    modelContext: { limitTokens: 400000, source: 'provider', provenance: 'provider' },
    promptOccupancyEstimateTokens: 12000,
    round: 1,
    emitReasoningDone: () => {},
    activeThreadId: 'thread_provider_usage',
    activeTurnId: 'turn_provider_usage',
    providerId: 'openai',
    model: 'gpt-5.4',
    turnReasoningSegments: [],
    openAIContinuityEnabled: false,
    openAIRequestContextForRound: undefined,
    updateOpenAIContinuationContext: (value) => value,
    emitOpenAIResponseMeta: () => {},
    resolveOpenAIContinuationPersistence: () => ({}),
    repeatedToolCallState: { lastSignature: '', repeatedCount: 0 },
    recordRepeatedToolCallBatch: () => ({ blocked: false }),
    maxConsecutiveIdenticalToolRounds: 3,
    pushUniqueRuntimeValue: () => {},
    sendNotice: () => {},
    sendTurnState: () => {},
    loop: { cancelled: false },
    finalizeRoundWithoutTools: () => {},
    touchProjectUsageByThread: () => {},
    continuityRuntime: null,
    runPostTurnTasks: () => {},
    projectFolder: '',
    userMessage: 'Continue',
    turnToolResults: [],
    mode: 'execute',
    memoryCompressionEnabled: false,
    memoryCompressionThreshold: 0,
    memoryCompressionCooldownMs: 0,
    memoryCompressionMaxPerHour: 0,
    memoryCompressionMinNewLogs: 0,
    apiKey: '',
    isAbortError: () => false,
    assistantFinalPhase: 'final_answer',
    assistantCommentaryPhase: 'commentary',
    buildAssistantToolUseMessage: () => ({}),
    history: [],
    detectTextualApprovalRequestWithoutToolCall: () => false,
  })

  assert.equal(result.shouldBreakRoundLoop, true)
  assert.ok(emittedUsagePayload)
  assert.equal(emittedUsagePayload.providerOccupancyTokens, 150)
  assert.equal(emittedUsagePayload.estimatedOccupancyTokens, 12000)
  assert.equal(emittedUsagePayload.effectiveOccupancyTokens, 150)
  assert.equal(emittedUsagePayload.contextOccupancyTokens, 150)
  assert.equal(emittedUsagePayload.rollingTotalTokens, 150)
  assert.equal(emittedUsagePayload.occupancySource, 'provider_last_request')
  assert.equal(emittedUsagePayload.occupancyConfidence, 'provider_verified')
  assert.equal(emittedUsagePayload.providerCachedReadTokens, 40)
})
