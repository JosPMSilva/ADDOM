import test from 'node:test'
import assert from 'node:assert/strict'

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
    const mod = await import(`../../src/renderer/store/useChatStore.js?reasoning=${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
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

test('reasoning store path avoids duplicate append when finalizeReasoning repeats streamed text', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    const id = api.addAssistantPlaceholder()

    api.markStreamStarted(id, {
      startedAt: 1_000,
      threadId: 'thread-stream',
      turnId: 'turn-stream',
    })

    api.appendReasoning(id, 'streamed step text')
    api.finalizeReasoning(id, 'streamed step text')

    const msg = store.getState().messages.find((m) => m.id === id)
    assert.equal(msg.reasoning, 'streamed step text')
    assert.equal(msg.reasoningDone, false)
    const turn = store.getState().liveExecution.turnsById['turn-stream']
    const reasoningEvents = turn.eventOrder
      .map((eventId) => turn.eventsById[eventId])
      .filter((event) => event?.kind === 'reasoning')
    assert.equal(reasoningEvents.length, 1)

    api.markReasoningDone(id)
    const finalized = store.getState().messages.find((m) => m.id === id)
    assert.equal(finalized.reasoningDone, true)
  })
})

test('late segment zero finalization adopts the streamed OpenRouter reasoning identity without duplication', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    const id = api.addAssistantPlaceholder()
    api.markStreamStarted(id, {
      startedAt: 1_000,
      threadId: 'thread-openrouter-late-segment',
      turnId: 'turn-openrouter-late-segment',
      providerId: 'openrouter',
      model: 'openai/gpt-5.3-codex',
    })

    const title = '**Planning strict format adherence**'
    api.appendReasoning(id, title, { threadId: 'thread-openrouter-late-segment' })
    api.finalizeReasoning(id, title, {
      threadId: 'thread-openrouter-late-segment',
      authoritative: true,
      currentText: title,
      reasoningSegment: 0,
    })

    const turn = store.getState().liveExecution.turnsById['turn-openrouter-late-segment']
    const reasoningEvents = turn.eventOrder
      .map((eventId) => turn.eventsById[eventId])
      .filter((event) => event?.kind === 'reasoning')

    assert.equal(reasoningEvents.length, 1)
    assert.equal(reasoningEvents[0].messageId, 'execution_reasoning:turn-openrouter-late-segment')
    assert.deepEqual(
      turn.itemOrder.filter((itemId) => itemId.startsWith('reasoning:')),
      ['reasoning:execution_reasoning:turn-openrouter-late-segment'],
    )
    assert.equal(turn.reasoningById['execution_reasoning:turn-openrouter-late-segment']?.detail, title)
    assert.equal(turn.reasoningById[id], undefined)
  })
})

test('authoritative reasoning finalization preserves every provider model-tool round', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    const id = api.addAssistantPlaceholder()

    api.markStreamStarted(id, {
      startedAt: 1_000,
      threadId: 'thread-rounds',
      turnId: 'turn-rounds',
      providerId: 'deepseek',
      model: 'deepseek-v4-pro',
    })

    const phases = [
      'Inspecting the request before reading files.',
      'Comparing the README with the implementation.',
      'Preparing the final recommendation.',
    ]
    phases.forEach((phase, reasoningSegment) => {
      api.appendReasoning(id, phase, {
        threadId: 'thread-rounds',
        reasoningSegment,
      })
      api.finalizeReasoning(id, phase, {
        threadId: 'thread-rounds',
        authoritative: true,
        currentText: phase,
        reasoningSegment,
      })
    })

    const turn = store.getState().liveExecution.turnsById['turn-rounds']
    const reasoningEvents = turn.eventOrder
      .map((eventId) => turn.eventsById[eventId])
      .filter((event) => event?.kind === 'reasoning')

    assert.deepEqual(reasoningEvents.map((event) => event.detail), phases)
    assert.deepEqual(reasoningEvents.map((event) => event.messageId), [
      'execution_reasoning:turn-rounds',
      'execution_reasoning:turn-rounds:1',
      'execution_reasoning:turn-rounds:2',
    ])
    assert.deepEqual(
      turn.itemOrder.filter((itemId) => itemId.startsWith('reasoning:')),
      [
        'reasoning:execution_reasoning:turn-rounds',
        'reasoning:execution_reasoning:turn-rounds:1',
        'reasoning:execution_reasoning:turn-rounds:2',
      ],
    )
    assert.equal(turn.itemOrder.filter((itemId) => itemId.endsWith(':4')).length, 0)
  })
})

test('reasoning store replaces malformed streamed text with an authoritative completion snapshot', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    const id = api.addAssistantPlaceholder()
    api.markStreamStarted(id, {
      startedAt: 1_000,
      threadId: 'thread-authoritative',
      turnId: 'turn-authoritative',
    })
    api.appendReasoning(id, 'Theuserwantsaconcisereview.')
    api.finalizeReasoning(id, 'The user wants a concise review.', {
      authoritative: true,
      currentText: 'The user wants a concise review.',
    })

    const state = store.getState()
    const message = state.messages.find((entry) => entry.id === id)
    assert.equal(message.reasoning, 'The user wants a concise review.')
    const turn = state.liveExecution.turnsById['turn-authoritative']
    const reasoningEvents = turn.eventOrder
      .map((eventId) => turn.eventsById[eventId])
      .filter((event) => event?.kind === 'reasoning')
    assert.equal(reasoningEvents.length, 1)
    assert.equal(reasoningEvents[0].detail, 'The user wants a concise review.')
    assert.equal(turn.reasoningById[reasoningEvents[0].messageId]?.detail, 'The user wants a concise review.')
  })
})

test('reasoning store leaves prior execution blocks intact when the authoritative current round is empty', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    const id = api.addAssistantPlaceholder()
    api.markStreamStarted(id, {
      startedAt: 1_000,
      threadId: 'thread-authoritative-empty-round',
      turnId: 'turn-authoritative-empty-round',
    })
    api.appendReasoning(id, 'Plan the inspection.')
    api.appendReasoning(id, '\n\n---\n\n')
    api.appendReasoning(id, 'Confirm the result.')
    api.finalizeReasoning(id, 'Plan the inspection.\n\n---\n\nConfirm the result.', {
      authoritative: true,
      currentText: '',
    })

    const state = store.getState()
    const message = state.messages.find((entry) => entry.id === id)
    assert.equal(message.reasoning, 'Plan the inspection.\n\n---\n\nConfirm the result.')
    const turn = state.liveExecution.turnsById['turn-authoritative-empty-round']
    const reasoningEvents = turn.eventOrder
      .map((eventId) => turn.eventsById[eventId])
      .filter((event) => event?.kind === 'reasoning')
    assert.deepEqual(reasoningEvents.map((event) => event.detail), [
      'Plan the inspection.',
      'Confirm the result.',
    ])
  })
})

test('ensureAssistantPlaceholder keeps reasoning string-backed for the active pipeline', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.ensureAssistantPlaceholder({ messageId: 'assistant-placeholder' })

    const message = store.getState().messages.find((entry) => entry.id === 'assistant-placeholder')
    assert.ok(message)
    assert.equal(typeof message.reasoning, 'string')
    assert.equal(message.reasoning, '')
    assert.equal(message.reasoningDone, false)
    assert.deepEqual(message.reasoningMeta, {
      mode: 'none',
      chunkCount: 0,
      charsStreamed: 0,
    })
  })
})

test('reasoning store path keeps unbalanced bold reasoning visible while it is still streaming', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    const id = api.addAssistantPlaceholder()

    api.markStreamStarted(id, {
      startedAt: 1_000,
      threadId: 'thread-buffered',
      turnId: 'turn-buffered',
    })

    api.appendReasoning(id, '**Inspecting project for')
    api.appendReasoning(id, ' database context')

    let turn = store.getState().liveExecution.turnsById['turn-buffered']
    let reasoningEvents = (turn?.eventOrder || [])
      .map((eventId) => turn.eventsById[eventId])
      .filter((event) => event?.kind === 'reasoning')
    assert.equal(reasoningEvents.length, 1)
    assert.equal(reasoningEvents[0].detail, '**Inspecting project for database context')
    assert.equal(reasoningEvents[0].stableDetail, '')
    assert.equal(reasoningEvents[0].pendingTail, '**Inspecting project for database context')
    assert.equal(reasoningEvents[0].hasPendingTail, true)

    api.appendReasoning(id, '**')

    turn = store.getState().liveExecution.turnsById['turn-buffered']
    reasoningEvents = turn.eventOrder
      .map((eventId) => turn.eventsById[eventId])
      .filter((event) => event?.kind === 'reasoning')
    assert.equal(reasoningEvents.length, 1)
    assert.equal(reasoningEvents[0].detail, '**Inspecting project for database context**')
    assert.equal(reasoningEvents[0].stableDetail, '**Inspecting project for database context**')
    assert.equal(reasoningEvents[0].pendingTail, '')
    assert.equal(reasoningEvents[0].hasPendingTail, false)
  })
})

test('reasoning store path keeps incomplete fenced code visible and upgrades it once the fence closes', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    const id = api.addAssistantPlaceholder()

    api.markStreamStarted(id, {
      startedAt: 1_000,
      threadId: 'thread-fenced',
      turnId: 'turn-fenced',
    })

    api.appendReasoning(id, 'Intro paragraph.\n\n```python\nprint("hello")')

    let turn = store.getState().liveExecution.turnsById['turn-fenced']
    let reasoningEvents = (turn?.eventOrder || [])
      .map((eventId) => turn.eventsById[eventId])
      .filter((event) => event?.kind === 'reasoning')
    assert.equal(reasoningEvents.length, 1)
    assert.equal(reasoningEvents[0].detail, 'Intro paragraph.\n\n```python\nprint("hello")')
    assert.equal(reasoningEvents[0].stableDetail, 'Intro paragraph.\n\n')
    assert.equal(reasoningEvents[0].pendingTail, '```python\nprint("hello")')
    assert.equal(reasoningEvents[0].hasPendingTail, true)

    api.appendReasoning(id, '\n```')

    turn = store.getState().liveExecution.turnsById['turn-fenced']
    reasoningEvents = turn.eventOrder
      .map((eventId) => turn.eventsById[eventId])
      .filter((event) => event?.kind === 'reasoning')
    assert.equal(reasoningEvents.length, 1)
    assert.equal(reasoningEvents[0].detail, 'Intro paragraph.\n\n```python\nprint("hello")\n```')
    assert.equal(reasoningEvents[0].stableDetail, 'Intro paragraph.\n\n```python\nprint("hello")\n```')
    assert.equal(reasoningEvents[0].pendingTail, '')
    assert.equal(reasoningEvents[0].hasPendingTail, false)
  })
})

test('markReasoningDone finalizes a pending live reasoning tail into the settled execution stream', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    const id = api.addAssistantPlaceholder()

    api.markStreamStarted(id, {
      startedAt: 1_000,
      threadId: 'thread-terminal-tail',
      turnId: 'turn-terminal-tail',
    })

    api.appendReasoning(id, '**Still thinking')
    api.markReasoningDone(id)

    const turn = store.getState().liveExecution.turnsById['turn-terminal-tail']
    const reasoningEvents = turn.eventOrder
      .map((eventId) => turn.eventsById[eventId])
      .filter((event) => event?.kind === 'reasoning')

    assert.equal(reasoningEvents.length, 1)
    assert.equal(reasoningEvents[0].status, 'done')
    assert.equal(reasoningEvents[0].detail, '**Still thinking')
    assert.equal(reasoningEvents[0].stableDetail, '**Still thinking')
    assert.equal(reasoningEvents[0].pendingTail, '')
    assert.equal(reasoningEvents[0].hasPendingTail, false)
  })
})

test('reasoning segmentation preserves leading whitespace for subsequent streamed chunks', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    const id = api.addAssistantPlaceholder()

    api.markStreamStarted(id, {
      startedAt: 1_000,
      threadId: 'thread-spacing',
      turnId: 'turn-spacing',
    })

    api.appendReasoning(id, 'I')
    api.appendReasoning(id, ' noted that')

    const turn = store.getState().liveExecution.turnsById['turn-spacing']
    const reasoningEvents = turn.eventOrder
      .map((eventId) => turn.eventsById[eventId])
      .filter((event) => event?.kind === 'reasoning')

    assert.equal(reasoningEvents.length, 1)
    assert.equal(reasoningEvents[0].detail, 'I noted that')
  })
})

test('reasoning store path never emits the internal step delimiter as a live reasoning row', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    const id = api.addAssistantPlaceholder()

    api.markStreamStarted(id, {
      startedAt: 1_000,
      threadId: 'thread-separator',
      turnId: 'turn-separator',
    })

    api.appendReasoning(id, 'first step')
    api.finalizeReasoning(id, 'first step')
    api.appendReasoning(id, '\n\n---\n\n')
    api.markReasoningDone(id)

    const turn = store.getState().liveExecution.turnsById['turn-separator']
    const reasoningEvents = turn.eventOrder
      .map((eventId) => turn.eventsById[eventId])
      .filter((event) => event?.kind === 'reasoning')

    assert.equal(reasoningEvents.length, 1)
    assert.equal(reasoningEvents[0].detail, 'first step')
    assert.equal(reasoningEvents.some((event) => String(event?.detail || '').includes('---')), false)
  })
})

test('assistant placeholder initializes streaming pointers and appendChunk keeps message/timeline in sync', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    const id = api.addAssistantPlaceholder()

    let next = store.getState()
    assert.equal(next.streamingId, id)
    assert.equal(typeof next.streamingMessageIndex, 'number')
    assert.equal(typeof next.streamingTimelineIndex, 'number')
    assert.equal(next.messages[next.streamingMessageIndex]?.id, id)
    assert.equal(next.timeline[next.streamingTimelineIndex]?.message?.id, id)

    api.appendChunk(id, 'hello')
    api.appendChunk(id, ' world')

    next = store.getState()
    const msg = next.messages.find((entry) => entry.id === id)
    const timelineRow = next.timeline.find((row) => row.kind === 'message' && row.message?.id === id)
    assert.equal(msg?.content, 'hello world')
    assert.equal(timelineRow?.message?.content, 'hello world')
  })
})

test('reasoning store path adopts batch summary when no chunks arrived', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    const id = api.addAssistantPlaceholder()
    api.markStreamStarted(id, {
      startedAt: 2_000,
      threadId: 'thread-batch',
      turnId: 'turn-batch',
    })

    api.finalizeReasoning(id, 'batch reasoning summary', {
      authoritative: true,
      currentText: 'batch reasoning summary',
    })

    const msg = store.getState().messages.find((m) => m.id === id)
    assert.equal(msg.reasoning, 'batch reasoning summary')
    assert.equal(msg.reasoningDone, false)
    const turn = store.getState().liveExecution.turnsById['turn-batch']
    const reasoningEvents = turn.eventOrder
      .map((eventId) => turn.eventsById[eventId])
      .filter((event) => event?.kind === 'reasoning')
    assert.equal(reasoningEvents.length, 1)
    assert.equal(reasoningEvents[0].detail, 'batch reasoning summary')
    assert.equal(reasoningEvents[0].reasoningRole, 'reasoning')

    api.markReasoningDone(id)
    const row = store.getState().timeline.find((r) => r.kind === 'message' && r.message?.id === id)
    assert.equal(row?.message?.reasoning, 'batch reasoning summary')
    assert.equal(row?.message?.reasoningDone, true)
  })
})

test('reasoning store path remains race-safe when final message completes before reasoning finalize', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    const id = api.addAssistantPlaceholder()

    api.finalizeMessage(id, 'assistant final response')
    api.finalizeReasoning(id, 'late reasoning summary')
    api.markReasoningDone(id)

    const msg = store.getState().messages.find((m) => m.id === id)
    assert.equal(msg.status, 'done')
    assert.equal(msg.content, 'assistant final response')
    assert.equal(msg.reasoning, 'late reasoning summary')
    assert.equal(msg.reasoningDone, true)
  })
})

test('stream meta derives TTFT, reasoning TTFT, and duration for streamed assistant messages', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    const id = api.addAssistantPlaceholder()

    api.markStreamStarted(id, {
      startedAt: 1_000,
      threadId: 'thread_1',
      turnId: 'turn_1',
      providerId: 'openai',
      model: 'gpt-test',
    })
    api.setStreamMeta(id, {
      firstTextChunkAt: 1_120,
      firstReasoningChunkAt: 1_180,
      textChunkCount: 5,
      reasoningChunkCount: 2,
      textCharsStreamed: 240,
      reasoningCharsStreamed: 64,
      textFlushCount: 3,
      reasoningFlushCount: 1,
      lastChunkAt: 1_350,
      lastFlushAt: 1_360,
    })
    api.finalizeStreamMeta(id, { completedAt: 1_700 })

    const msg = store.getState().messages.find((m) => m.id === id)
    assert.equal(msg?.streamMeta?.providerId, 'openai')
    assert.equal(msg?.streamMeta?.model, 'gpt-test')
    assert.equal(msg?.streamMeta?.threadId, 'thread_1')
    assert.equal(msg?.streamMeta?.turnId, 'turn_1')
    assert.equal(msg?.streamMeta?.ttftMs, 120)
    assert.equal(msg?.streamMeta?.reasoningTtftMs, 180)
    assert.equal(msg?.streamMeta?.durationMs, 700)
    assert.equal(msg?.streamMeta?.textChunkCount, 5)
    assert.equal(msg?.streamMeta?.reasoningChunkCount, 2)
    assert.equal(msg?.streamMeta?.textFlushCount, 3)
    assert.equal(msg?.streamMeta?.reasoningFlushCount, 1)
  })
})

test('local OpenAI streamed reasoning keeps delivery metadata on live execution events for renderer-only grouping', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread_local_reasoning_meta')
    const id = api.addAssistantPlaceholder({ threadId: 'thread_local_reasoning_meta' })

    api.markStreamStarted(id, {
      startedAt: 2_100,
      threadId: 'thread_local_reasoning_meta',
      turnId: 'turn_local_reasoning_meta',
      providerId: 'openai',
      model: 'gpt-5.4',
      authMethod: 'api_key',
      transportMode: 'responses_stream',
    })
    api.appendReasoning(id, 'Checking repository status')
    api.setReasoningMeta(id, {
      mode: 'live',
      chunkCount: 2,
      charsStreamed: 48,
      providerId: 'openai',
      model: 'gpt-5.4',
    }, {
      threadId: 'thread_local_reasoning_meta',
    })

    const turn = store.getState().liveExecution.turnsById.turn_local_reasoning_meta
    assert.ok(turn)
    const reasoningEvents = turn.eventOrder
      .map((eventId) => turn.eventsById[eventId])
      .filter((event) => event?.kind === 'reasoning' && event?.archived !== true)
    assert.equal(reasoningEvents.length, 1)
    assert.equal(String(reasoningEvents[0]?.reasoningMeta?.mode || ''), 'live')
    assert.equal(Number(reasoningEvents[0]?.reasoningMeta?.chunkCount || 0), 2)
    assert.equal(String(reasoningEvents[0]?.streamMeta?.authMethod || ''), 'api_key')
    assert.equal(String(reasoningEvents[0]?.streamMeta?.transportMode || ''), 'responses_stream')
  })
})

test('stream meta finalize remains id-based after final message completion clears streaming pointers', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    const id = api.addAssistantPlaceholder()

    api.markStreamStarted(id, { startedAt: 2_000 })
    api.finalizeMessage(id, 'done')
    api.finalizeStreamMeta(id, { completedAt: 2_350 })

    const msg = store.getState().messages.find((m) => m.id === id)
    assert.equal(msg?.status, 'done')
    assert.equal(msg?.streamMeta?.startedAt, 2_000)
    assert.equal(msg?.streamMeta?.completedAt, 2_350)
    assert.equal(msg?.streamMeta?.durationMs, 350)
  })
})

test('late turn binding backfills already-captured reasoning into live execution', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread-late-binding')
    const id = api.addAssistantPlaceholder({ threadId: 'thread-late-binding' })

    api.appendReasoning(id, 'Recovered after late turn binding.')

    assert.equal(store.getState().liveExecution.turnsById['turn-late-binding'], undefined)

    api.markStreamStarted(id, {
      startedAt: 3_000,
      threadId: 'thread-late-binding',
      turnId: 'turn-late-binding',
    })
    api.markReasoningDone(id, { threadId: 'thread-late-binding' })

    const msg = store.getState().messages.find((entry) => entry.id === id)
    assert.equal(String(msg?.reasoning || ''), 'Recovered after late turn binding.')
    assert.equal(String(msg?.streamMeta?.turnId || ''), 'turn-late-binding')

    const turn = store.getState().liveExecution.turnsById['turn-late-binding']
    assert.ok(turn)
    const reasoningEvents = turn.eventOrder
      .map((eventId) => turn.eventsById[eventId])
      .filter((event) => event?.kind === 'reasoning' && event?.archived !== true)
    assert.equal(reasoningEvents.length, 1)
    assert.equal(String(reasoningEvents[0]?.detail || ''), 'Recovered after late turn binding.')
    assert.equal(String(reasoningEvents[0]?.status || ''), 'done')
  })
})

test('finalizeMessage preserves streamed assistant text when done payload is blank', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    const id = api.addAssistantPlaceholder()

    api.appendChunk(id, 'Created ')
    api.appendChunk(id, 'random.txt')
    api.finalizeMessage(id, '   ')

    const msg = store.getState().messages.find((m) => m.id === id)
    assert.equal(msg?.status, 'done')
    assert.equal(msg?.content, 'Created random.txt')
  })
})

test('finalizeMessage keeps OpenAI account commentary in live execution and synthesizes a non-blank fallback when the final payload is empty', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread-openai-account-empty-final')
    const id = api.addAssistantPlaceholder({ threadId: 'thread-openai-account-empty-final' })

    api.markStreamStarted(id, {
      startedAt: 4_000,
      threadId: 'thread-openai-account-empty-final',
      turnId: 'turn-openai-account-empty-final',
      providerId: 'openai',
      model: 'gpt-5.4',
      authMethod: 'account',
      transportMode: 'codex_app_server_chatgpt',
    })
    api.appendExecutionCommentary({
      threadId: 'thread-openai-account-empty-final',
      turnId: 'turn-openai-account-empty-final',
      chunk: 'Inspecting the workspace first.',
      emittedAt: 4_020,
      streamMeta: {
        threadId: 'thread-openai-account-empty-final',
        turnId: 'turn-openai-account-empty-final',
        authMethod: 'account',
        transportMode: 'codex_app_server_chatgpt',
      },
    })

    api.finalizeMessage(id, '   ', {
      threadId: 'thread-openai-account-empty-final',
      providerId: 'openai',
      model: 'gpt-5.4',
      authMethod: 'account',
      transportMode: 'codex_app_server_chatgpt',
    })
    api.markExecutionCommentaryDone({
      threadId: 'thread-openai-account-empty-final',
      turnId: 'turn-openai-account-empty-final',
      streamMeta: {
        threadId: 'thread-openai-account-empty-final',
        turnId: 'turn-openai-account-empty-final',
        completedAt: 4_040,
      },
    })

    const msg = store.getState().messages.find((entry) => entry.id === id)
    assert.ok(msg)
    assert.equal(msg?.status, 'done')
    assert.equal(msg?.content, 'Completed, but no final answer text was returned.')

    const turn = store.getState().liveExecution.turnsById['turn-openai-account-empty-final']
    assert.ok(turn)
    const reasoningEvents = turn.eventOrder
      .map((eventId) => turn.eventsById[eventId])
      .filter((event) => event?.kind === 'reasoning' && event?.archived !== true)
    assert.equal(reasoningEvents.length, 1)
    assert.equal(String(reasoningEvents[0]?.detail || ''), 'Inspecting the workspace first.')
  })
})
