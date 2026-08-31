import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createStreamRuntime,
  isBubbleOwnedTextChunk,
} from '../../src/renderer/components/chat/chat-event-bridge-stream-runtime.mjs'

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createMemoryLocalStorage() {
  const map = new Map()
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null
    },
    setItem(key, value) {
      map.set(String(key), String(value))
    },
    removeItem(key) {
      map.delete(String(key))
    },
    clear() {
      map.clear()
    },
  }
}

async function withChatStore(testFn) {
  const prevWindow = globalThis.window
  const prevLocalStorage = globalThis.localStorage
  const localStorage = createMemoryLocalStorage()
  let injectedCrypto = false
  if (!globalThis.crypto) {
    globalThis.crypto = { randomUUID: () => `uuid_${Math.random().toString(36).slice(2, 10)}` }
    injectedCrypto = true
  }
  globalThis.window = { localStorage }
  globalThis.localStorage = localStorage

  try {
    const mod = await import(`../../src/renderer/store/useChatStore.js?stream_runtime=${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
    const store = mod.default
    if (typeof store?.setState === 'function' && typeof store?.getInitialState === 'function') {
      store.setState(store.getInitialState(), true)
    }
    return await testFn({ store })
  } finally {
    globalThis.window = prevWindow
    globalThis.localStorage = prevLocalStorage
    if (injectedCrypto) delete globalThis.crypto
  }
}

test('createStreamRuntime batches plain text chunks before appending to the store', async () => {
  const appendCalls = []
  const markStartedCalls = []
  const streamMetaCalls = []
  const state = {
    appendChunk(id, delta, options = {}) {
      appendCalls.push({ id, delta, options })
    },
    appendReasoning() {},
    setStreamMeta(id, patch) {
      streamMetaCalls.push({ id, patch })
    },
    markStreamStarted(id, meta) {
      markStartedCalls.push({ id, meta })
    },
    finalizeStreamMeta() {},
  }
  const runtime = createStreamRuntime({
    useChatStore: {
      getState() {
        return state
      },
    },
  })

  runtime.queueBufferedChannelChunk('msg_1', 'text', 'Hello', {
    threadId: 'thread_1',
    startedAt: 111,
  })
  runtime.queueBufferedChannelChunk('msg_1', 'text', ' world', {
    threadId: 'thread_1',
    startedAt: 111,
  })

  assert.equal(appendCalls.length, 0)
  assert.equal(markStartedCalls.length, 1)

  await wait(60)

  assert.equal(appendCalls.length, 1)
  assert.deepEqual(appendCalls[0], {
    id: 'msg_1',
    delta: 'Hello world',
    options: { threadId: 'thread_1' },
  })
  assert.equal(streamMetaCalls.length, 1)
})

test('commentary text chunks are excluded from the assistant bubble path', async () => {
  assert.equal(isBubbleOwnedTextChunk({ phase: 'commentary' }), false)
  assert.equal(isBubbleOwnedTextChunk({ phase: 'final_answer' }), true)

  const appendCalls = []
  const state = {
    appendChunk(id, delta, options = {}) {
      appendCalls.push({ id, delta, options })
    },
    appendReasoning() {},
    setStreamMeta() {},
    markStreamStarted() {},
    finalizeStreamMeta() {},
  }
  const runtime = createStreamRuntime({
    useChatStore: {
      getState() {
        return state
      },
    },
  })

  runtime.queueBufferedChannelChunk('msg_commentary_only', 'text', 'Inspecting the workspace.', {
    threadId: 'thread_commentary_only',
    phase: 'commentary',
    startedAt: 111,
  })

  await wait(60)

  assert.equal(appendCalls.length, 0)
})

test('execution-owned text chunks flush into live execution commentary instead of the assistant bubble', async () => {
  const appendCalls = []
  const executionCommentaryCalls = []
  const state = {
    appendChunk(id, delta, options = {}) {
      appendCalls.push({ id, delta, options })
    },
    appendExecutionCommentary(payload = {}) {
      executionCommentaryCalls.push(payload)
    },
    appendReasoning() {},
    setStreamMeta() {},
    markStreamStarted() {},
    finalizeStreamMeta() {},
  }
  const runtime = createStreamRuntime({
    useChatStore: {
      getState() {
        return state
      },
    },
  })

  runtime.queueBufferedChannelChunk('msg_execution_commentary', 'execution', 'Inspecting the workspace.', {
    threadId: 'thread_execution_commentary',
    turnId: 'turn_execution_commentary',
    providerId: 'openai',
    model: 'gpt-5.4',
    phase: 'commentary',
    startedAt: 111,
    emittedAt: 140,
  })

  await wait(60)

  assert.equal(appendCalls.length, 0)
  assert.equal(executionCommentaryCalls.length, 1)
  assert.deepEqual(executionCommentaryCalls[0], {
    threadId: 'thread_execution_commentary',
    turnId: 'turn_execution_commentary',
    chunk: 'Inspecting the workspace.',
    emittedAt: executionCommentaryCalls[0].emittedAt,
    streamMeta: {
      threadId: 'thread_execution_commentary',
      turnId: 'turn_execution_commentary',
      providerId: 'openai',
      model: 'gpt-5.4',
      startedAt: 111,
      lastChunkAt: 140,
      lastFlushAt: executionCommentaryCalls[0].streamMeta.lastFlushAt,
    },
  })
  assert.equal(typeof executionCommentaryCalls[0].emittedAt, 'number')
  assert.equal(typeof executionCommentaryCalls[0]?.streamMeta?.lastFlushAt, 'number')
})

test('execution commentary phase changes flush into distinct ordered segments', async () => {
  const executionCommentaryCalls = []
  const state = {
    appendChunk() {},
    appendExecutionCommentary(payload = {}) {
      executionCommentaryCalls.push(payload)
    },
    appendReasoning() {},
    setStreamMeta() {},
    markStreamStarted() {},
    finalizeStreamMeta() {},
  }
  const runtime = createStreamRuntime({
    useChatStore: { getState: () => state },
  })
  const base = {
    threadId: 'thread_segmented_commentary',
    turnId: 'turn_segmented_commentary',
    providerId: 'openai',
    model: 'gpt-5.6-luna',
    phase: 'commentary',
    round: 1,
  }

  runtime.queueBufferedChannelChunk('msg_segmented_commentary', 'execution', 'Before the first read.', {
    ...base, reasoningSegment: 0, emittedAt: 100,
  })
  runtime.flushBufferedChannel('msg_segmented_commentary', 'execution', 'provider_tool_boundary')
  runtime.queueBufferedChannelChunk('msg_segmented_commentary', 'execution', 'After the first read.', {
    ...base, reasoningSegment: 1, emittedAt: 200,
  })
  runtime.flushBufferedChannel('msg_segmented_commentary', 'execution', 'test')

  assert.deepEqual(executionCommentaryCalls.map((entry) => ({
    chunk: entry.chunk,
    emittedAt: entry.emittedAt,
    round: entry.streamMeta?.round,
    reasoningSegment: entry.streamMeta?.reasoningSegment,
  })), [
    { chunk: 'Before the first read.', emittedAt: 100, round: 1, reasoningSegment: 0 },
    { chunk: 'After the first read.', emittedAt: 200, round: 1, reasoningSegment: 1 },
  ])
})

test('delayed reasoning flush keeps provider chronology around tool activity', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread_delayed_reasoning_order')
    const messageId = api.addAssistantPlaceholder({ threadId: 'thread_delayed_reasoning_order' })
    const baseTs = Date.now() - 10_000

    api.markStreamStarted(messageId, {
      startedAt: baseTs,
      threadId: 'thread_delayed_reasoning_order',
      turnId: 'turn_delayed_reasoning_order',
      providerId: 'openai',
      model: 'gpt-5.6-luna',
    })

    const runtime = createStreamRuntime({ useChatStore: store })
    runtime.queueBufferedChannelChunk(messageId, 'reasoning', 'Planning initial inspection.', {
      threadId: 'thread_delayed_reasoning_order',
      turnId: 'turn_delayed_reasoning_order',
      providerId: 'openai',
      model: 'gpt-5.6-luna',
      reasoningSegment: 0,
      emittedAt: baseTs + 10,
    })

    api.pushToolActivity({
      id: 'tool-delayed-reasoning-order',
      type: 'result',
      eventKind: 'tool_result',
      threadId: 'thread_delayed_reasoning_order',
      turnId: 'turn_delayed_reasoning_order',
      stepId: 'step-delayed-reasoning-order',
      sequence: 1,
      toolName: 'read_file',
      label: 'Read file',
      result: 'ok',
      createdAt: baseTs + 20,
      finishedAt: baseTs + 20,
    })

    runtime.flushBufferedChannel(messageId, 'reasoning', 'provider_tool_boundary')
    runtime.queueBufferedChannelChunk(messageId, 'reasoning', 'Preparing final response.', {
      threadId: 'thread_delayed_reasoning_order',
      turnId: 'turn_delayed_reasoning_order',
      providerId: 'openai',
      model: 'gpt-5.6-luna',
      reasoningSegment: 1,
      emittedAt: baseTs + 30,
    })
    runtime.flushBufferedChannel(messageId, 'reasoning', 'test')

    const turn = store.getState().liveExecution.turnsById.turn_delayed_reasoning_order
    assert.ok(turn)
    const ordered = turn.itemOrder.map((itemId) => {
      if (itemId.startsWith('tool:')) return 'tool'
      return turn.reasoningById[itemId.slice('reasoning:'.length)]?.detail || ''
    })
    assert.deepEqual(ordered, [
      'Planning initial inspection.',
      'tool',
      'Preparing final response.',
    ])
  })
})

test('execution-owned text survives finalization and stays out of the assistant bubble body across interleaved tool activity', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread_execution_runtime_order')
    const messageId = api.addAssistantPlaceholder({ threadId: 'thread_execution_runtime_order' })
    const baseTs = Date.now()

    api.markStreamStarted(messageId, {
      startedAt: baseTs,
      threadId: 'thread_execution_runtime_order',
      turnId: 'turn_execution_runtime_order',
      providerId: 'openai',
      model: 'gpt-5.4',
      authMethod: 'account',
      transportMode: 'codex_app_server_chatgpt',
    })

    const runtime = createStreamRuntime({
      useChatStore: store,
      setReasoningMetaForMessage(id, patch, threadId) {
        store.getState().setReasoningMeta(id, patch, threadId ? { threadId } : undefined)
      },
    })

    runtime.queueBufferedChannelChunk(messageId, 'execution', 'Inspecting the workspace first.', {
      threadId: 'thread_execution_runtime_order',
      turnId: 'turn_execution_runtime_order',
      providerId: 'openai',
      model: 'gpt-5.4',
      authMethod: 'account',
      transportMode: 'codex_app_server_chatgpt',
      phase: 'commentary',
      startedAt: baseTs,
      emittedAt: baseTs + 10,
    })

    await wait(120)

    let turn = store.getState().liveExecution.turnsById['turn_execution_runtime_order']
    assert.ok(turn)
    let events = turn.eventOrder.map((eventId) => turn.eventsById[eventId]).filter(Boolean)
    assert.deepEqual(events.map((event) => event.kind), ['reasoning'])
    assert.equal(String(events[0]?.detail || ''), 'Inspecting the workspace first.')

    api.pushToolActivity({
      id: 'tool-result-execution-runtime-order',
      type: 'result',
      eventKind: 'tool_result',
      threadId: 'thread_execution_runtime_order',
      turnId: 'turn_execution_runtime_order',
      stepId: 'step-1',
      sequence: 1,
      toolName: 'read_file',
      label: 'Read file',
      result: 'ok',
      createdAt: baseTs + 20,
      finishedAt: baseTs + 30,
    })

    runtime.queueBufferedChannelChunk(messageId, 'execution', 'Now patching the renderer path.', {
      threadId: 'thread_execution_runtime_order',
      turnId: 'turn_execution_runtime_order',
      providerId: 'openai',
      model: 'gpt-5.4',
      authMethod: 'account',
      transportMode: 'codex_app_server_chatgpt',
      phase: 'commentary',
      startedAt: baseTs,
      emittedAt: baseTs + 40,
    })

    await wait(120)

    api.finalizeMessage(messageId, 'Final answer only.', {
      phase: 'final_answer',
      threadId: 'thread_execution_runtime_order',
      providerId: 'openai',
      model: 'gpt-5.4',
      authMethod: 'account',
      transportMode: 'codex_app_server_chatgpt',
    })
    api.markExecutionCommentaryDone({
      threadId: 'thread_execution_runtime_order',
      turnId: 'turn_execution_runtime_order',
      streamMeta: {
        threadId: 'thread_execution_runtime_order',
        turnId: 'turn_execution_runtime_order',
        completedAt: baseTs + 50,
      },
    })

    const message = store.getState().messages.find((entry) => entry.id === messageId)
    assert.ok(message)
    assert.equal(String(message?.content || ''), 'Final answer only.')
    assert.equal(String(message?.reasoning || ''), '')

    turn = store.getState().liveExecution.turnsById['turn_execution_runtime_order']
    assert.ok(turn)
    events = turn.eventOrder.map((eventId) => turn.eventsById[eventId]).filter(Boolean)
    assert.equal(events.some((event) => event.kind === 'tool_result'), true)
    const reasoningEvents = events.filter((event) => event.kind === 'reasoning')
    assert.equal(reasoningEvents.length >= 1, true)
    const mergedReasoning = reasoningEvents.map((event) => String(event?.detail || '')).join('\n')
    assert.match(mergedReasoning, /Inspecting the workspace first\./)
    assert.match(mergedReasoning, /Now patching the renderer path\./)
    assert.equal(reasoningEvents.every((event) => event.status === 'done'), true)
  })
})

test('createStreamRuntime keeps reasoning chunks canonical without a duplicate legacy activity', async () => {
  const reasoningAppendCalls = []
  const reasoningActivityCalls = []
  const state = {
    activeThreadId: 'thread_2',
    messages: [{
      id: 'msg_reasoning_1',
      role: 'assistant',
      reasoning: 'First step. Second step.',
      streamMeta: {
        threadId: 'thread_2',
        turnId: 'turn_reasoning_1',
      },
    }],
    appendChunk() {},
    appendReasoning(id, delta, options = {}) {
      reasoningAppendCalls.push({ id, delta, options })
    },
    upsertReasoningActivity(activity) {
      reasoningActivityCalls.push(activity)
    },
    setStreamMeta() {},
    markStreamStarted() {},
    finalizeStreamMeta() {},
  }
  const runtime = createStreamRuntime({
    useChatStore: {
      getState() {
        return state
      },
    },
  })

  runtime.queueBufferedChannelChunk('msg_reasoning_1', 'reasoning', 'First step. ', {
    threadId: 'thread_2',
    turnId: 'turn_reasoning_1',
    startedAt: 222,
  })
  runtime.queueBufferedChannelChunk('msg_reasoning_1', 'reasoning', 'Second step.', {
    threadId: 'thread_2',
    turnId: 'turn_reasoning_1',
    startedAt: 222,
  })

  await wait(80)

  assert.equal(reasoningAppendCalls.length, 1)
  assert.deepEqual(reasoningAppendCalls[0], {
    id: 'msg_reasoning_1',
    delta: 'First step. Second step.',
    options: {
      threadId: 'thread_2',
      emittedAt: reasoningAppendCalls[0].options.emittedAt,
    },
  })
  assert.equal(typeof reasoningAppendCalls[0].options.emittedAt, 'number')
  assert.equal(reasoningActivityCalls.length, 0)
})

test('createStreamRuntime carries provider and model metadata through reasoning chunk flush and finalize', async () => {
  const reasoningAppendCalls = []
  const reasoningMetaCalls = []
  const streamMetaCalls = []
  const finalizeStreamMetaCalls = []
  const markStartedCalls = []
  const state = {
    activeThreadId: 'thread_meta',
    messages: [{
      id: 'msg_reasoning_meta',
      role: 'assistant',
      reasoning: 'Inspecting files.',
      streamMeta: {
        threadId: 'thread_meta',
        turnId: 'turn_meta',
        providerId: 'anthropic',
        model: 'claude-sonnet-4-6',
      },
    }],
    appendChunk() {},
    appendReasoning(id, delta, options = {}) {
      reasoningAppendCalls.push({ id, delta, options })
    },
    upsertReasoningActivity() {},
    setStreamMeta(id, patch) {
      streamMetaCalls.push({ id, patch })
    },
    setReasoningMeta(id, patch, options = {}) {
      reasoningMetaCalls.push({ id, patch, options })
    },
    markStreamStarted(id, meta) {
      markStartedCalls.push({ id, meta })
    },
    finalizeStreamMeta(id, patch) {
      finalizeStreamMetaCalls.push({ id, patch })
    },
  }
  const runtime = createStreamRuntime({
    useChatStore: {
      getState() {
        return state
      },
    },
    setReasoningMetaForMessage(id, patch, threadId) {
      state.setReasoningMeta(id, patch, threadId ? { threadId } : {})
    },
  })

  runtime.queueBufferedChannelChunk('msg_reasoning_meta', 'reasoning', 'Inspecting files.', {
    threadId: 'thread_meta',
    turnId: 'turn_meta',
    providerId: 'anthropic',
    model: 'claude-sonnet-4-6',
    startedAt: 500,
    emittedAt: 540,
  })

  runtime.recordReasoningChunkStats('msg_reasoning_meta', 'Inspecting files.')

  await wait(80)

  const latestStreamMetaPatch = streamMetaCalls[streamMetaCalls.length - 1]?.patch || {}
  assert.equal(markStartedCalls.length, 1)
  assert.equal(markStartedCalls[0]?.meta?.providerId, 'anthropic')
  assert.equal(markStartedCalls[0]?.meta?.model, 'claude-sonnet-4-6')
  assert.equal(reasoningAppendCalls.length, 1)
  assert.equal(latestStreamMetaPatch.providerId, 'anthropic')
  assert.equal(latestStreamMetaPatch.model, 'claude-sonnet-4-6')

  runtime.finalizeReasoningStats('msg_reasoning_meta', {
    finalText: 'Inspecting files.',
    reasoningTokens: 17,
    providerId: 'anthropic',
    model: 'claude-sonnet-4-6',
  })
  runtime.finalizeStreamStatsForMessage('msg_reasoning_meta', {
    threadId: 'thread_meta',
    turnId: 'turn_meta',
    providerId: 'anthropic',
    model: 'claude-sonnet-4-6',
    completedAt: 620,
  })

  const latestReasoningMeta = reasoningMetaCalls[reasoningMetaCalls.length - 1]
  const finalizedStreamMeta = finalizeStreamMetaCalls[finalizeStreamMetaCalls.length - 1]
  assert.equal(latestReasoningMeta?.patch?.providerId, 'anthropic')
  assert.equal(latestReasoningMeta?.patch?.model, 'claude-sonnet-4-6')
  assert.equal(latestReasoningMeta?.options?.threadId, 'thread_meta')
  assert.equal(finalizedStreamMeta?.patch?.providerId, 'anthropic')
  assert.equal(finalizedStreamMeta?.patch?.model, 'claude-sonnet-4-6')
})

test('createStreamRuntime persists non-openai reasoning into the settled execution stream with provider metadata', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread_anthropic_runtime')
    const messageId = api.addAssistantPlaceholder({ threadId: 'thread_anthropic_runtime' })

    const runtime = createStreamRuntime({
      useChatStore: store,
      setReasoningMetaForMessage(id, patch, threadId) {
        store.getState().setReasoningMeta(id, patch, threadId ? { threadId } : undefined)
      },
    })

    runtime.queueBufferedChannelChunk(messageId, 'reasoning', 'Plan the inspection. ', {
      threadId: 'thread_anthropic_runtime',
      turnId: 'turn_anthropic_runtime',
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
      startedAt: 1_000,
      emittedAt: 1_040,
    })
    runtime.recordReasoningChunkStats(messageId, 'Plan the inspection. ')

    runtime.queueBufferedChannelChunk(messageId, 'reasoning', 'Then answer.', {
      threadId: 'thread_anthropic_runtime',
      turnId: 'turn_anthropic_runtime',
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
      startedAt: 1_000,
      emittedAt: 1_080,
    })
    runtime.recordReasoningChunkStats(messageId, 'Then answer.')

    await wait(80)

    runtime.finalizeReasoningStats(messageId, {
      finalText: 'Plan the inspection. Then answer.',
      reasoningTokens: 21,
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
    })
    runtime.finalizeStreamStatsForMessage(messageId, {
      threadId: 'thread_anthropic_runtime',
      turnId: 'turn_anthropic_runtime',
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
      completedAt: 1_200,
    })

    api.finalizeReasoning(messageId, 'Plan the inspection. Then answer.', {
      threadId: 'thread_anthropic_runtime',
    })
    api.markReasoningDone(messageId, {
      threadId: 'thread_anthropic_runtime',
    })
    api.finalizeMessage(messageId, 'Final answer.', {
      phase: 'final_answer',
      threadId: 'thread_anthropic_runtime',
    })

    const message = store.getState().messages.find((entry) => entry.id === messageId)
    assert.ok(message)
    assert.equal(String(message?.reasoning || ''), 'Plan the inspection. Then answer.')
    assert.equal(message?.reasoningDone, true)
    assert.equal(String(message?.content || ''), 'Final answer.')
    assert.equal(String(message?.streamMeta?.providerId || ''), 'anthropic')
    assert.equal(String(message?.streamMeta?.model || ''), 'claude-sonnet-4-6')
    assert.equal(String(message?.streamMeta?.turnId || ''), 'turn_anthropic_runtime')

    const turn = store.getState().liveExecution.turnsById['turn_anthropic_runtime']
    assert.ok(turn)
    const reasoningEvents = turn.eventOrder
      .map((eventId) => turn.eventsById[eventId])
      .filter((event) => event?.kind === 'reasoning' && event?.archived !== true)
    assert.equal(reasoningEvents.length, 1)
    assert.equal(String(reasoningEvents[0]?.detail || ''), 'Plan the inspection. Then answer.')
    assert.equal(String(reasoningEvents[0]?.status || ''), 'done')
  })
})

test('createStreamRuntime preserves final-only openrouter gpt-5.4 reasoning in the settled execution stream', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread_openrouter_runtime')
    const messageId = api.addAssistantPlaceholder({ threadId: 'thread_openrouter_runtime' })

    api.markStreamStarted(messageId, {
      startedAt: 2_000,
      threadId: 'thread_openrouter_runtime',
      turnId: 'turn_openrouter_runtime',
      providerId: 'openrouter',
      model: 'openai/gpt-5.4',
    })

    api.finalizeReasoning(messageId, 'OpenRouter final reasoning summary.', {
      threadId: 'thread_openrouter_runtime',
    })
    api.setReasoningMeta(messageId, {
      mode: 'summary_end',
      reasoningTokens: 18,
      providerId: 'openrouter',
      model: 'openai/gpt-5.4',
    }, {
      threadId: 'thread_openrouter_runtime',
    })
    api.markReasoningDone(messageId, {
      threadId: 'thread_openrouter_runtime',
    })
    api.finalizeStreamMeta(messageId, {
      completedAt: 2_240,
      threadId: 'thread_openrouter_runtime',
      turnId: 'turn_openrouter_runtime',
      providerId: 'openrouter',
      model: 'openai/gpt-5.4',
    })
    api.finalizeMessage(messageId, 'OpenRouter final answer.', {
      phase: 'final_answer',
      threadId: 'thread_openrouter_runtime',
    })

    const message = store.getState().messages.find((entry) => entry.id === messageId)
    assert.ok(message)
    assert.equal(String(message?.reasoning || ''), 'OpenRouter final reasoning summary.')
    assert.equal(message?.reasoningDone, true)
    assert.equal(String(message?.reasoningMeta?.mode || ''), 'summary_end')
    assert.equal(Number(message?.reasoningMeta?.reasoningTokens || 0), 18)
    assert.equal(String(message?.streamMeta?.providerId || ''), 'openrouter')
    assert.equal(String(message?.streamMeta?.model || ''), 'openai/gpt-5.4')

    const turn = store.getState().liveExecution.turnsById['turn_openrouter_runtime']
    assert.ok(turn)
    const reasoningEvents = turn.eventOrder
      .map((eventId) => turn.eventsById[eventId])
      .filter((event) => event?.kind === 'reasoning' && event?.archived !== true)
    assert.equal(reasoningEvents.length, 1)
    assert.equal(String(reasoningEvents[0]?.detail || ''), 'OpenRouter final reasoning summary.')
    assert.equal(String(reasoningEvents[0]?.status || ''), 'done')
  })
})

test('createStreamRuntime preserves final-only openai gpt-5.4 reasoning in the settled execution stream', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread_openai_runtime')
    const messageId = api.addAssistantPlaceholder({ threadId: 'thread_openai_runtime' })

    api.markStreamStarted(messageId, {
      startedAt: 3_000,
      threadId: 'thread_openai_runtime',
      turnId: 'turn_openai_runtime',
      providerId: 'openai',
      model: 'gpt-5.4',
      transportMode: 'codex_app_server_chatgpt',
    })

    api.finalizeReasoning(messageId, 'OpenAI final reasoning summary.', {
      threadId: 'thread_openai_runtime',
    })
    api.setReasoningMeta(messageId, {
      mode: 'summary_end',
      reasoningTokens: 14,
      providerId: 'openai',
      model: 'gpt-5.4',
    }, {
      threadId: 'thread_openai_runtime',
    })
    api.markReasoningDone(messageId, {
      threadId: 'thread_openai_runtime',
    })
    api.finalizeStreamMeta(messageId, {
      completedAt: 3_220,
      threadId: 'thread_openai_runtime',
      turnId: 'turn_openai_runtime',
      providerId: 'openai',
      model: 'gpt-5.4',
      transportMode: 'codex_app_server_chatgpt',
    })
    api.finalizeMessage(messageId, 'OpenAI final answer.', {
      phase: 'final_answer',
      threadId: 'thread_openai_runtime',
    })

    const message = store.getState().messages.find((entry) => entry.id === messageId)
    assert.ok(message)
    assert.equal(String(message?.reasoning || ''), 'OpenAI final reasoning summary.')
    assert.equal(message?.reasoningDone, true)
    assert.equal(String(message?.reasoningMeta?.mode || ''), 'summary_end')
    assert.equal(Number(message?.reasoningMeta?.reasoningTokens || 0), 14)
    assert.equal(String(message?.streamMeta?.providerId || ''), 'openai')
    assert.equal(String(message?.streamMeta?.model || ''), 'gpt-5.4')
    assert.equal(String(message?.streamMeta?.transportMode || ''), 'codex_app_server_chatgpt')

    const turn = store.getState().liveExecution.turnsById['turn_openai_runtime']
    assert.ok(turn)
    const reasoningEvents = turn.eventOrder
      .map((eventId) => turn.eventsById[eventId])
      .filter((event) => event?.kind === 'reasoning' && event?.archived !== true)
    assert.equal(reasoningEvents.length, 1)
    assert.equal(String(reasoningEvents[0]?.detail || ''), 'OpenAI final reasoning summary.')
    assert.equal(String(reasoningEvents[0]?.status || ''), 'done')
  })
})

test('createStreamRuntime preserves final-only gemini reasoning in the settled execution stream', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread_gemini_runtime')
    const messageId = api.addAssistantPlaceholder({ threadId: 'thread_gemini_runtime' })

    api.markStreamStarted(messageId, {
      startedAt: 4_000,
      threadId: 'thread_gemini_runtime',
      turnId: 'turn_gemini_runtime',
      providerId: 'gemini',
      model: 'gemini-2.5-pro',
    })

    api.finalizeReasoning(messageId, 'Gemini final reasoning summary.', {
      threadId: 'thread_gemini_runtime',
    })
    api.setReasoningMeta(messageId, {
      mode: 'summary_end',
      reasoningTokens: 19,
      providerId: 'gemini',
      model: 'gemini-2.5-pro',
    }, {
      threadId: 'thread_gemini_runtime',
    })
    api.markReasoningDone(messageId, {
      threadId: 'thread_gemini_runtime',
    })
    api.finalizeStreamMeta(messageId, {
      completedAt: 4_220,
      threadId: 'thread_gemini_runtime',
      turnId: 'turn_gemini_runtime',
      providerId: 'gemini',
      model: 'gemini-2.5-pro',
    })
    api.finalizeMessage(messageId, 'Gemini final answer.', {
      phase: 'final_answer',
      threadId: 'thread_gemini_runtime',
    })

    const message = store.getState().messages.find((entry) => entry.id === messageId)
    assert.ok(message)
    assert.equal(String(message?.reasoning || ''), 'Gemini final reasoning summary.')
    assert.equal(message?.reasoningDone, true)
    assert.equal(String(message?.reasoningMeta?.mode || ''), 'summary_end')
    assert.equal(Number(message?.reasoningMeta?.reasoningTokens || 0), 19)
    assert.equal(String(message?.streamMeta?.providerId || ''), 'gemini')
    assert.equal(String(message?.streamMeta?.model || ''), 'gemini-2.5-pro')

    const turn = store.getState().liveExecution.turnsById['turn_gemini_runtime']
    assert.ok(turn)
    const reasoningEvents = turn.eventOrder
      .map((eventId) => turn.eventsById[eventId])
      .filter((event) => event?.kind === 'reasoning' && event?.archived !== true)
    assert.equal(reasoningEvents.length, 1)
    assert.equal(String(reasoningEvents[0]?.detail || ''), 'Gemini final reasoning summary.')
    assert.equal(String(reasoningEvents[0]?.status || ''), 'done')
  })
})

test('createStreamRuntime keeps final-only openai gpt-5.4 reasoning visible when the assistant conclusion lands first', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread_openai_late_reasoning_runtime')
    const messageId = api.addAssistantPlaceholder({ threadId: 'thread_openai_late_reasoning_runtime' })

    api.markStreamStarted(messageId, {
      startedAt: 5_000,
      threadId: 'thread_openai_late_reasoning_runtime',
      turnId: 'turn_openai_late_reasoning_runtime',
      providerId: 'openai',
      model: 'gpt-5.4',
      transportMode: 'responses_stream',
    })

    api.finalizeMessage(messageId, 'OpenAI final answer first.', {
      phase: 'final_answer',
      threadId: 'thread_openai_late_reasoning_runtime',
    })
    api.finalizeReasoning(messageId, 'OpenAI late reasoning summary.', {
      threadId: 'thread_openai_late_reasoning_runtime',
    })
    api.setReasoningMeta(messageId, {
      mode: 'summary_end',
      reasoningTokens: 17,
      providerId: 'openai',
      model: 'gpt-5.4',
    }, {
      threadId: 'thread_openai_late_reasoning_runtime',
    })
    api.markReasoningDone(messageId, {
      threadId: 'thread_openai_late_reasoning_runtime',
    })
    api.finalizeStreamMeta(messageId, {
      completedAt: 5_240,
      threadId: 'thread_openai_late_reasoning_runtime',
      turnId: 'turn_openai_late_reasoning_runtime',
      providerId: 'openai',
      model: 'gpt-5.4',
      transportMode: 'responses_stream',
    })

    const message = store.getState().messages.find((entry) => entry.id === messageId)
    assert.ok(message)
    assert.equal(String(message?.content || ''), 'OpenAI final answer first.')
    assert.equal(String(message?.reasoning || ''), 'OpenAI late reasoning summary.')
    assert.equal(message?.reasoningDone, true)
    assert.equal(String(message?.streamMeta?.providerId || ''), 'openai')
    assert.equal(String(message?.streamMeta?.model || ''), 'gpt-5.4')
    assert.equal(String(message?.streamMeta?.transportMode || ''), 'responses_stream')

    const turn = store.getState().liveExecution.turnsById['turn_openai_late_reasoning_runtime']
    assert.ok(turn)
    const reasoningEvents = turn.eventOrder
      .map((eventId) => turn.eventsById[eventId])
      .filter((event) => event?.kind === 'reasoning' && event?.archived !== true)
    assert.equal(reasoningEvents.length, 1)
    assert.equal(String(reasoningEvents[0]?.detail || ''), 'OpenAI late reasoning summary.')
    assert.equal(String(reasoningEvents[0]?.status || ''), 'done')
  })
})
