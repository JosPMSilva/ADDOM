import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildLiveExecutionState,
  appendLiveExecutionToolOutput,
  appendLiveExecutionReasoningEvent,
  createEmptyLiveExecutionState,
  pruneDuplicatedFinalReasoningFromLiveExecution,
  upsertLiveExecutionActivity,
} from '../../src/renderer/store/chat/live-execution-store.mjs'
import { mapTimelineFromPersistedEvents } from '../../src/renderer/store/chat/timeline-hydration.mjs'
import { threadSessionHasLiveState } from '../../src/renderer/store/chat/thread-session-store-utils.mjs'

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
    const mod = await import(`../../src/renderer/store/useChatStore.js?liveExecution=${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
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

test('buildLiveExecutionState hydrates persisted stdout and stderr previews into tool output events', () => {
  const state = buildLiveExecutionState({
    toolActivity: [{
      id: 'tool-1',
      type: 'result',
      turnId: 'turn-1',
      stepId: 'step-1',
      toolName: 'run_command',
      label: 'Command finished',
      stdoutPreview: 'stdout preview',
      stderrPreview: 'stderr preview',
      createdAt: 100,
      finishedAt: 200,
    }],
  })

  const turn = state.turnsById['turn-1']
  assert.ok(turn)
  const events = turn.eventOrder.map((eventId) => turn.eventsById[eventId])
  assert.equal(events.some((event) => event.kind === 'tool_result'), true)
  assert.equal(events.some((event) => event.kind === 'tool_output' && event.stream === 'stdout'), true)
  assert.equal(events.some((event) => event.kind === 'tool_output' && event.stream === 'stderr'), true)
})

test('upsertLiveExecutionActivity records provider tool status as canonical tool_started without legacy rows', () => {
  const state = upsertLiveExecutionActivity(createEmptyLiveExecutionState(), {
    id: 'provider_tool_input:turn-1:call-1',
    type: 'provider_tool',
    eventKind: 'provider_tool_status',
    threadId: 'thread-1',
    turnId: 'turn-1',
    stepId: 'call-1',
    toolName: 'read_file',
    label: 'Provider tool input: tool',
    detail: 'Collecting provider tool input...',
    createdAt: 100,
  })

  const turn = state.turnsById['turn-1']
  assert.equal(turn.eventOrder.length, 0)
  assert.deepEqual(turn.itemOrder, ['tool:session:turn-1:call-1'])
  assert.equal(turn.sessionsById['session:turn-1:call-1'].state, 'active')
})

test('upsertLiveExecutionActivity applies later provider progress to one stable tool session', () => {
  let state = createEmptyLiveExecutionState()
  for (const [sequence, detail] of [
    [1, 'Reading src/app.mjs'],
    [2, 'Reviewing exports'],
  ]) {
    state = upsertLiveExecutionActivity(state, {
      id: 'provider_tool:turn-progress:mcp-progress',
      type: 'provider_tool',
      eventKind: 'provider_tool_status',
      threadId: 'thread-progress',
      turnId: 'turn-progress',
      stepId: 'mcp-progress',
      toolName: 'mcp_tool_call',
      detail,
      sequence,
      createdAt: 100 + sequence,
    })
  }

  const turn = state.turnsById['turn-progress']
  assert.deepEqual(turn.itemOrder, ['tool:session:turn-progress:mcp-progress'])
  assert.equal(Object.keys(turn.sessionsById).length, 1)
  assert.equal(
    turn.sessionsById['session:turn-progress:mcp-progress'].inputDetail,
    'Reviewing exports',
  )
})

test('upsertLiveExecutionActivity maps completed error turns to an error turn status', () => {
  const state = upsertLiveExecutionActivity(createEmptyLiveExecutionState(), {
    id: 'turn-error-1',
    type: 'turn',
    eventKind: 'turn_completed',
    threadId: 'thread-error',
    turnId: 'turn-error',
    turnState: 'completed',
    turnStatus: 'error',
    label: 'Turn completed (error)',
    detail: 'reason: The operation was aborted due to timeout',
    createdAt: 100,
    finishedAt: 150,
  })

  const turn = state.turnsById['turn-error']
  assert.ok(turn)
  assert.equal(turn.status, 'error')
})

test('upsertLiveExecutionActivity keeps completed error turns with recorded file side effects as error', () => {
  let state = upsertLiveExecutionActivity(createEmptyLiveExecutionState(), {
    id: 'file-change-1',
    type: 'file_change',
    eventKind: 'file_change',
    threadId: 'thread-partial',
    turnId: 'turn-partial',
    filePath: 'src/app.js',
    changeType: 'modified',
    addedLines: 4,
    removedLines: 1,
    createdAt: 110,
    finishedAt: 120,
  })

  state = upsertLiveExecutionActivity(state, {
    id: 'turn-partial-1',
    type: 'turn',
    eventKind: 'turn_completed',
    threadId: 'thread-partial',
    turnId: 'turn-partial',
    turnState: 'completed',
    turnStatus: 'error',
    label: 'Turn completed (error)',
    detail: 'reason: a later recoverable step failed',
    createdAt: 100,
    finishedAt: 150,
  })

  const turn = state.turnsById['turn-partial']
  assert.ok(turn)
  assert.equal(turn.status, 'error')
})

test('upsertLiveExecutionActivity keeps explicit terminal error authoritative after approval timeout', () => {
  let state = upsertLiveExecutionActivity(createEmptyLiveExecutionState(), {
    id: 'approval-timeout-1',
    type: 'result',
    eventKind: 'approval_timeout',
    threadId: 'thread-approval-timeout',
    turnId: 'turn-approval-timeout',
    toolName: 'run_command',
    label: 'Approval expired for run_command (timeout).',
    isError: true,
    decision: 'denied',
    denyReason: 'timeout',
    createdAt: 110,
    finishedAt: 120,
  })

  state = upsertLiveExecutionActivity(state, {
    id: 'turn-approval-timeout-1',
    type: 'turn',
    eventKind: 'turn_completed',
    threadId: 'thread-approval-timeout',
    turnId: 'turn-approval-timeout',
    turnState: 'completed',
    turnStatus: 'error',
    label: 'Turn completed (error)',
    detail: 'reason: approval timeout is non-fatal',
    createdAt: 100,
    finishedAt: 150,
  })

  const turn = state.turnsById['turn-approval-timeout']
  assert.ok(turn)
  assert.equal(turn.status, 'error')
})

test('upsertLiveExecutionActivity keeps failed tool attempts local when the turn succeeds', () => {
  let state = upsertLiveExecutionActivity(createEmptyLiveExecutionState(), {
    id: 'command-failed-1',
    type: 'result',
    eventKind: 'tool_result',
    threadId: 'thread-retry',
    turnId: 'turn-retry',
    stepId: 'attempt-1',
    toolName: 'run_command',
    label: 'Command failed',
    isError: true,
    createdAt: 110,
    finishedAt: 120,
  })

  assert.equal(state.turnsById['turn-retry'].status, 'active')

  state = upsertLiveExecutionActivity(state, {
    id: 'turn-retry-completed',
    type: 'turn',
    eventKind: 'turn_completed',
    threadId: 'thread-retry',
    turnId: 'turn-retry',
    turnState: 'completed',
    turnStatus: 'done',
    label: 'Turn completed',
    createdAt: 100,
    finishedAt: 150,
  })

  const turn = state.turnsById['turn-retry']
  assert.equal(turn.status, 'done')
  assert.equal(turn.sessionsById['session:turn-retry:attempt-1'].state, 'failed')
})

test('upsertLiveExecutionActivity keeps started turns active until completion arrives', () => {
  const state = upsertLiveExecutionActivity(createEmptyLiveExecutionState(), {
    id: 'turn-start-1',
    type: 'turn',
    eventKind: 'turn_started',
    threadId: 'thread-start',
    turnId: 'turn-start',
    turnState: 'started',
    label: 'Turn started',
    createdAt: 100,
  })

  const turn = state.turnsById['turn-start']
  assert.ok(turn)
  assert.equal(turn.status, 'active')
})

test('upsertLiveExecutionActivity keeps non-terminal turn phases active', () => {
  const state = upsertLiveExecutionActivity(createEmptyLiveExecutionState(), {
    id: 'turn-approval-1',
    type: 'turn',
    eventKind: 'turn_phase',
    threadId: 'thread-approval',
    turnId: 'turn-approval',
    turnState: 'waiting_for_approval',
    turnStatus: 'waiting_for_approval',
    label: 'Waiting for approval: run_command',
    createdAt: 100,
    updatedAt: 120,
  })

  const turn = state.turnsById['turn-approval']
  assert.ok(turn)
  assert.equal(turn.status, 'active')
})

test('upsertLiveExecutionActivity keeps requested provider compaction active until it is applied', () => {
  let state = upsertLiveExecutionActivity(createEmptyLiveExecutionState(), {
    id: 'openai_compaction:thread-live:turn-live:automatic:provider_chain_compaction',
    type: 'info',
    eventKind: 'openai_compaction_event',
    threadId: 'thread-live',
    turnId: 'turn-live',
    status: 'requested',
    label: 'Compacting context',
    createdAt: 100,
    coalesce: true,
  })

  let turn = state.turnsById['turn-live']
  assert.ok(turn)
  let event = turn.eventsById['activity:openai_compaction:thread-live:turn-live:automatic:provider_chain_compaction']
  assert.ok(event)
  assert.equal(event.status, 'active')

  state = upsertLiveExecutionActivity(state, {
    id: 'openai_compaction:thread-live:turn-live:automatic:provider_chain_compaction',
    type: 'info',
    eventKind: 'openai_compaction_event',
    threadId: 'thread-live',
    turnId: 'turn-live',
    status: 'running',
    label: 'Compacting context',
    createdAt: 120,
    coalesce: true,
  })

  turn = state.turnsById['turn-live']
  assert.ok(turn)
  event = turn.eventsById['activity:openai_compaction:thread-live:turn-live:automatic:provider_chain_compaction']
  assert.ok(event)
  assert.equal(event.status, 'active')
  assert.equal(event.updatedAt, 120)

  state = upsertLiveExecutionActivity(state, {
    id: 'openai_compaction:thread-live:turn-live:automatic:provider_chain_compaction',
    type: 'info',
    eventKind: 'openai_compaction_event',
    threadId: 'thread-live',
    turnId: 'turn-live',
    status: 'applied',
    label: 'OpenAI compaction applied',
    compactionMilestone: true,
    compactionMilestoneTitle: 'Context compacted before the next turn',
    compactionMilestoneDetail: 'OpenAI server-side compaction',
    createdAt: 140,
    coalesce: true,
  })

  turn = state.turnsById['turn-live']
  assert.ok(turn)
  assert.deepEqual(turn.eventOrder, ['activity:openai_compaction:thread-live:turn-live:automatic:provider_chain_compaction'])
  event = turn.eventsById['activity:openai_compaction:thread-live:turn-live:automatic:provider_chain_compaction']
  assert.ok(event)
  assert.equal(event.status, 'done')
  assert.equal(event.createdAt, 100)
  assert.equal(event.updatedAt, 140)
})

test('upsertLiveExecutionActivity marks completed MoA delegations as done turns', () => {
  const state = upsertLiveExecutionActivity(createEmptyLiveExecutionState(), {
    id: 'moa-done-1',
    type: 'info',
    eventKind: 'moa_delegation_done',
    threadId: 'thread-moa',
    turnId: 'turn-moa',
    label: 'MoA delegation finished (completed)',
    createdAt: 100,
    finishedAt: 150,
    moa: {
      status: 'completed',
    },
  })

  const turn = state.turnsById['turn-moa']
  assert.ok(turn)
  assert.equal(turn.status, 'done')
})

test('threadSessionHasLiveState ignores active live-execution turns that already have a terminal MoA event', () => {
  const liveExecution = upsertLiveExecutionActivity(createEmptyLiveExecutionState(), {
    id: 'moa-done-2',
    type: 'info',
    eventKind: 'moa_delegation_done',
    threadId: 'thread-stale',
    turnId: 'turn-stale',
    label: 'MoA delegation finished (completed)',
    createdAt: 100,
    finishedAt: 150,
    moa: {
      status: 'completed',
    },
  })

  const stuckState = {
    liveExecution: {
      ...liveExecution,
      turnsById: {
        ...liveExecution.turnsById,
        'turn-stale': {
          ...liveExecution.turnsById['turn-stale'],
          status: 'active',
        },
      },
    },
  }

  assert.equal(threadSessionHasLiveState(stuckState), false)
})

test('timeline hydration preserves active restored turns until durable recovery records a terminal event', () => {
  const mapped = mapTimelineFromPersistedEvents([{
    eventId: 1,
    kind: 'turn_started',
    turnId: 'turn-reload',
    content: '',
    createdAt: 100,
    meta: {
      threadId: 'thread-reload',
      turnId: 'turn-reload',
      state: 'started',
      startedAt: 100,
    },
  }, {
    eventId: 2,
    kind: 'tool_pending',
    turnId: 'turn-reload',
    content: '',
    createdAt: 120,
    meta: {
      threadId: 'thread-reload',
      turnId: 'turn-reload',
      count: 1,
    },
  }])

  const turn = mapped.liveExecution.turnsById['turn-reload']
  assert.ok(turn)
  assert.equal(turn.status, 'active')
  assert.equal(threadSessionHasLiveState({ liveExecution: mapped.liveExecution }), true)
  const activity = mapped.toolActivity.find((row) => row.eventKind === 'turn_interrupted')
  assert.equal(activity, undefined)
})

test('timeline hydration leaves completed restored turns terminal', () => {
  const mapped = mapTimelineFromPersistedEvents([{
    eventId: 1,
    kind: 'turn_started',
    turnId: 'turn-done',
    content: '',
    createdAt: 100,
    meta: {
      threadId: 'thread-done',
      turnId: 'turn-done',
      state: 'started',
      startedAt: 100,
    },
  }, {
    eventId: 2,
    kind: 'turn_completed',
    turnId: 'turn-done',
    content: '',
    createdAt: 130,
    meta: {
      threadId: 'thread-done',
      turnId: 'turn-done',
      state: 'completed',
      status: 'ok',
      finishedAt: 130,
    },
  }])

  assert.equal(mapped.liveExecution.turnsById['turn-done'].status, 'done')
  assert.equal(mapped.toolActivity.some((row) => row.eventKind === 'turn_interrupted'), false)
})

test('threadSessionHasLiveState ignores stale streaming ids once no streaming message or active turn remains', () => {
  const staleState = {
    streamingId: 'assistant_stale',
    messages: [{
      id: 'assistant_stale',
      role: 'assistant',
      status: 'done',
      content: 'Recovered output.',
    }],
    liveExecution: {
      turnsById: {
        'turn-stale': {
          turnId: 'turn-stale',
          status: 'warning',
          eventOrder: ['evt-complete'],
          eventsById: {
            'evt-complete': {
              id: 'evt-complete',
              kind: 'transport',
              activity: {
                eventKind: 'turn_completed',
              },
            },
          },
        },
      },
    },
  }

  assert.equal(threadSessionHasLiveState(staleState), false)
})

test('threadSessionHasLiveState drops once an active turn receives a terminal error completion', () => {
  let liveExecution = upsertLiveExecutionActivity(createEmptyLiveExecutionState(), {
    id: 'turn-error-live:start',
    type: 'turn',
    eventKind: 'turn_started',
    threadId: 'thread-error-live',
    turnId: 'turn-error-live',
    turnState: 'started',
    label: 'Turn started',
    createdAt: 100,
  })

  assert.equal(threadSessionHasLiveState({
    streamingId: 'assistant-error-live',
    messages: [{
      id: 'assistant-error-live',
      role: 'assistant',
      status: 'streaming',
      content: '',
    }],
    liveExecution,
  }), true)

  liveExecution = upsertLiveExecutionActivity(liveExecution, {
    id: 'turn-error-live:done',
    type: 'turn',
    eventKind: 'turn_completed',
    threadId: 'thread-error-live',
    turnId: 'turn-error-live',
    turnState: 'completed',
    turnStatus: 'error',
    label: 'Turn completed (error)',
    detail: 'reason: Error: boom',
    createdAt: 100,
    finishedAt: 180,
  })

  assert.equal(threadSessionHasLiveState({
    streamingId: 'assistant-error-live',
    messages: [{
      id: 'assistant-error-live',
      role: 'assistant',
      status: 'error',
      content: 'Error: boom',
    }],
    liveExecution,
  }), false)
})

test('appendLiveExecutionToolOutput caps output and preserves truncation state', () => {
  let state = createEmptyLiveExecutionState()
  state = appendLiveExecutionToolOutput(state, {
    turnId: 'turn-2',
    stepId: 'step-2',
    toolName: 'run_command',
    stream: 'stdout',
    chunk: 'a'.repeat(14_000),
    emittedAt: 100,
  })

  const turn = state.turnsById['turn-2']
  const events = turn.eventOrder.map((eventId) => turn.eventsById[eventId])
  const outputEvent = events.find((event) => event.kind === 'tool_output')
  assert.ok(outputEvent)
  assert.equal(outputEvent.truncated, true)
  assert.match(String(outputEvent.detail || ''), /\[truncated\]/)
})

test('appendLiveExecutionToolOutput keeps a clean trailing view across repeated truncation', () => {
  let state = createEmptyLiveExecutionState()
  state = appendLiveExecutionToolOutput(state, {
    turnId: 'turn-tail',
    stepId: 'step-tail',
    toolName: 'run_command',
    stream: 'stdout',
    chunk: 'A'.repeat(11_995),
    emittedAt: 100,
  })
  state = appendLiveExecutionToolOutput(state, {
    turnId: 'turn-tail',
    stepId: 'step-tail',
    toolName: 'run_command',
    stream: 'stdout',
    chunk: 'B'.repeat(20),
    emittedAt: 110,
  })
  state = appendLiveExecutionToolOutput(state, {
    turnId: 'turn-tail',
    stepId: 'step-tail',
    toolName: 'run_command',
    stream: 'stdout',
    chunk: 'C'.repeat(20),
    emittedAt: 120,
  })

  const turn = state.turnsById['turn-tail']
  assert.ok(turn)
  const outputEvent = turn.eventsById['tool_output:turn-tail:step-tail:stdout']
  assert.ok(outputEvent)
  const detail = String(outputEvent.detail || '')
  assert.equal((detail.match(/\[truncated\]/g) || []).length, 1)
  assert.doesNotMatch(detail, /\[truncated\][\s\S]*C{20}/)
  assert.match(detail, /B{20}C{20}\n\.\.\.\[truncated\]$/)
})

test('appendLiveExecutionToolOutput ignores malformed step-less chunks', () => {
  const state = appendLiveExecutionToolOutput(createEmptyLiveExecutionState(), {
    turnId: 'turn-step-less',
    toolName: 'run_command',
    stream: 'stdout',
    chunk: 'orphaned output',
    emittedAt: 100,
  })

  assert.deepEqual(state, createEmptyLiveExecutionState())
})

test('appendLiveExecutionToolOutput reorders live events chronologically when earlier output arrives after a terminal result', () => {
  let state = createEmptyLiveExecutionState()
  state = upsertLiveExecutionActivity(state, {
    id: 'tool-result-late',
    type: 'result',
    eventKind: 'tool_result',
    threadId: 'thread-live-order',
    turnId: 'turn-live-order',
    stepId: 'step-1',
    sequence: 1,
    toolName: 'run_command',
    label: 'Command finished',
    result: 'ok',
    startedAt: 100,
    finishedAt: 120,
  })
  state = appendLiveExecutionToolOutput(state, {
    threadId: 'thread-live-order',
    turnId: 'turn-live-order',
    stepId: 'step-1',
    sequence: 1,
    toolName: 'run_command',
    stream: 'stdout',
    chunk: 'stdout before completion',
    emittedAt: 110,
    status: 'done',
  })

  const turn = state.turnsById['turn-live-order']
  assert.ok(turn)
  const events = turn.eventOrder.map((eventId) => turn.eventsById[eventId])
  assert.deepEqual(events.map((event) => event.kind), ['tool_output', 'tool_result'])
})

test('appendLiveExecutionReasoningEvent keeps all reasoning blocks visible while the turn is active', () => {
  let state = createEmptyLiveExecutionState()
  state = appendLiveExecutionReasoningEvent(state, {
    threadId: 'thread-cap',
    turnId: 'turn-cap',
    messageId: 'msg-cap',
    chunk: 'Using Verc',
    emittedAt: 1,
  })
  state = appendLiveExecutionReasoningEvent(state, {
    threadId: 'thread-cap',
    turnId: 'turn-cap',
    messageId: 'msg-cap',
    chunk: 'el and ',
    emittedAt: 2,
  })
  state = appendLiveExecutionReasoningEvent(state, {
    threadId: 'thread-cap',
    turnId: 'turn-cap',
    messageId: 'msg-cap',
    chunk: 'Next.js',
    emittedAt: 3,
  })
  for (let index = 2; index <= 40; index += 1) {
    state = appendLiveExecutionReasoningEvent(state, {
      threadId: 'thread-cap',
      turnId: 'turn-cap',
      messageId: 'msg-cap',
      chunk: `block-${index}`,
      forceNewBlock: true,
      emittedAt: index + 3,
    })
  }

  const turn = state.turnsById['turn-cap']
  assert.ok(turn)
  assert.equal(turn.status, 'active')
  assert.equal(turn.eventsById['reasoning:turn-cap:archive'], undefined)

  const visibleReasoningEvents = turn.eventOrder
    .map((eventId) => turn.eventsById[eventId])
    .filter((event) => event?.kind === 'reasoning' && event?.archived !== true)
  assert.equal(visibleReasoningEvents.length, 40)
  assert.equal(visibleReasoningEvents[0].detail, 'Using Vercel and Next.js')
})

test('appendLiveExecutionReasoningEvent ignores a repeated explicit source event', () => {
  const sourceEvent = {
    threadId: 'thread-idempotent',
    turnId: 'turn-idempotent',
    eventId: 'persisted:50436',
    messageId: 'execution_commentary:turn-idempotent:1',
    reasoningRole: 'commentary',
    chunk: 'vada',
    emittedAt: 1_001,
  }
  let state = appendLiveExecutionReasoningEvent(createEmptyLiveExecutionState(), sourceEvent)
  state = appendLiveExecutionReasoningEvent(state, sourceEvent)

  const turn = state.turnsById['turn-idempotent']
  const reasoningEvents = turn.eventOrder
    .map((eventId) => turn.eventsById[eventId])
    .filter((event) => event?.kind === 'reasoning')

  assert.equal(reasoningEvents.length, 1)
  assert.deepEqual(reasoningEvents[0].reasoningChunks, ['vada'])
  assert.deepEqual(
    turn.reasoningById['execution_commentary:turn-idempotent:1'].chunks,
    ['vada'],
  )
})

test('appendLiveExecutionReasoningEvent archives whole reasoning blocks only after the turn becomes terminal', () => {
  let state = createEmptyLiveExecutionState()
  for (let index = 1; index <= 60; index += 1) {
    state = appendLiveExecutionReasoningEvent(state, {
      threadId: 'thread-cap-terminal',
      turnId: 'turn-cap-terminal',
      messageId: 'msg-cap-terminal',
      chunk: `block-${index}`,
      forceNewBlock: index > 1,
      emittedAt: index,
    })
  }

  state = upsertLiveExecutionActivity(state, {
    id: 'turn-cap-terminal:completed',
    type: 'turn',
    eventKind: 'turn_completed',
    threadId: 'thread-cap-terminal',
    turnId: 'turn-cap-terminal',
    turnState: 'completed',
    turnStatus: 'completed',
    label: 'Turn completed',
    createdAt: 100,
    finishedAt: 160,
  })

  const turn = state.turnsById['turn-cap-terminal']
  assert.ok(turn)

  const archiveEvent = turn.eventsById['reasoning:turn-cap-terminal:archive']
  assert.ok(archiveEvent)
  assert.equal(archiveEvent.archived, true)
  assert.ok(Array.isArray(archiveEvent.blocks))
  assert.equal(archiveEvent.blocks[0].detail, 'block-1')
  assert.equal(archiveEvent.blocks.length, 10)

  const visibleReasoningEvents = turn.eventOrder
    .map((eventId) => turn.eventsById[eventId])
    .filter((event) => event?.kind === 'reasoning' && event?.archived !== true)
  assert.equal(visibleReasoningEvents.length, 50)
  assert.equal(String(visibleReasoningEvents[0].detail || ''), 'block-11')
  assert.equal(String(visibleReasoningEvents[49].detail || ''), 'block-60')
})

test('appendLiveExecutionReasoningEvent does not truncate long reasoning chunks', () => {
  let state = createEmptyLiveExecutionState()
  state = appendLiveExecutionReasoningEvent(state, {
    turnId: 'turn-long',
    threadId: 'thread-long',
    messageId: 'msg-long',
    chunk: 'x'.repeat(14_000),
    emittedAt: 100,
  })

  const turn = state.turnsById['turn-long']
  assert.ok(turn)
  const event = turn.eventsById[turn.eventOrder[0]]
  assert.ok(event)
  assert.equal(event.truncated, false)
  assert.equal(String(event.detail || '').length, 14_000)
  assert.doesNotMatch(String(event.detail || ''), /\[truncated\]/)
  assert.equal(event.stableDetail, event.detail)
  assert.equal(event.pendingTail, '')
  assert.equal(event.hasPendingTail, false)
})

test('pruneDuplicatedFinalReasoningFromLiveExecution removes trailing reasoning that duplicates the final assistant text', () => {
  let state = createEmptyLiveExecutionState()
  state = appendLiveExecutionReasoningEvent(state, {
    turnId: 'turn-dedupe',
    threadId: 'thread-dedupe',
    messageId: 'msg-dedupe',
    chunk: 'Great — continued and finished.',
    emittedAt: 100,
  })

  const next = pruneDuplicatedFinalReasoningFromLiveExecution(state, {
    turnId: 'turn-dedupe',
    messageId: 'msg-dedupe',
    assistantText: 'Great — continued and finished.',
  })

  const turn = next.turnsById['turn-dedupe']
  assert.ok(turn)
  const reasoningEvents = turn.eventOrder
    .map((eventId) => turn.eventsById[eventId])
    .filter((event) => event?.kind === 'reasoning' && event?.archived !== true)
  assert.equal(reasoningEvents.length, 0)
})

test('pruneDuplicatedFinalReasoningFromLiveExecution strips smashed answer leak from reasoning events', () => {
  let state = createEmptyLiveExecutionState()
  state = appendLiveExecutionReasoningEvent(state, {
    turnId: 'turn-smash',
    threadId: 'thread-smash',
    messageId: 'msg-smash',
    chunk: '**Implementing new services page**I\'ll add a new page under app/services.',
    emittedAt: 100,
    streamMeta: { providerId: 'openrouter', turnId: 'turn-smash', threadId: 'thread-smash' },
  })

  const next = pruneDuplicatedFinalReasoningFromLiveExecution(state, {
    turnId: 'turn-smash',
    messageId: 'msg-smash',
    assistantText: 'I\'ll add a new page under app/services.',
  })

  const turn = next.turnsById['turn-smash']
  const reasoningEvents = turn.eventOrder
    .map((eventId) => turn.eventsById[eventId])
    .filter((event) => event?.kind === 'reasoning' && event?.archived !== true)
  assert.equal(reasoningEvents.length, 1)
  assert.equal(reasoningEvents[0].detail, '**Implementing new services page**')
  assert.doesNotMatch(String(reasoningEvents[0].detail || ''), /I'?ll add a new page/i)
})

test('appendLiveExecutionReasoningEvent drops OpenRouter answer prose after a completed thinking title', () => {
  let state = createEmptyLiveExecutionState()
  state = appendLiveExecutionReasoningEvent(state, {
    turnId: 'turn-or',
    threadId: 'thread-or',
    messageId: 'msg-or',
    chunk: '**Creating simple electrical calculator**',
    emittedAt: 100,
    streamMeta: { providerId: 'openrouter', turnId: 'turn-or', threadId: 'thread-or' },
  })
  state = appendLiveExecutionReasoningEvent(state, {
    turnId: 'turn-or',
    threadId: 'thread-or',
    messageId: 'msg-or',
    chunk: 'Done — I created a simple Python electrical calculator at: V, I,',
    emittedAt: 110,
    streamMeta: { providerId: 'openrouter', turnId: 'turn-or', threadId: 'thread-or' },
  })

  const turn = state.turnsById['turn-or']
  const reasoningEvents = turn.eventOrder
    .map((eventId) => turn.eventsById[eventId])
    .filter((event) => event?.kind === 'reasoning' && event?.archived !== true)
  assert.equal(reasoningEvents.length, 1)
  assert.equal(reasoningEvents[0].detail, '**Creating simple electrical calculator**')
  assert.doesNotMatch(String(reasoningEvents[0].detail || ''), /Done —/)
})

test('appendLiveExecutionReasoningEvent drops OpenRouter final-answer prose after tools seal titles', () => {
  let state = createEmptyLiveExecutionState()
  state = appendLiveExecutionReasoningEvent(state, {
    turnId: 'turn-post-tool',
    threadId: 'thread-post-tool',
    messageId: 'msg-post-tool',
    chunk: '**Planning GPU occupancy script**',
    emittedAt: 100,
    streamMeta: { providerId: 'openrouter', turnId: 'turn-post-tool', threadId: 'thread-post-tool' },
  })
  // Seal the title the same way tool_started does.
  const sealed = state.turnsById['turn-post-tool']
  const activeId = sealed.eventOrder.find((eventId) => sealed.eventsById[eventId]?.kind === 'reasoning')
  sealed.eventsById[activeId] = {
    ...sealed.eventsById[activeId],
    status: 'done',
  }

  state = appendLiveExecutionReasoningEvent(state, {
    turnId: 'turn-post-tool',
    threadId: 'thread-post-tool',
    messageId: 'msg-post-tool',
    chunk: 'Done — I created a simple GPU occupancy checker at:',
    emittedAt: 200,
    streamMeta: { providerId: 'openrouter', turnId: 'turn-post-tool', threadId: 'thread-post-tool' },
  })

  const turn = state.turnsById['turn-post-tool']
  const reasoningEvents = turn.eventOrder
    .map((eventId) => turn.eventsById[eventId])
    .filter((event) => event?.kind === 'reasoning' && event?.archived !== true)
  assert.equal(reasoningEvents.length, 1)
  assert.equal(reasoningEvents[0].detail, '**Planning GPU occupancy script**')
  assert.equal(reasoningEvents[0].status, 'done')
  assert.doesNotMatch(
    reasoningEvents.map((event) => event.detail).join('\n'),
    /Done —|occupancy checker/i,
  )
})

test('appendLiveExecutionReasoningEvent keeps only the title from a smashed OpenRouter heading+answer chunk', () => {
  let state = createEmptyLiveExecutionState()
  state = appendLiveExecutionReasoningEvent(state, {
    turnId: 'turn-smash-chunk',
    threadId: 'thread-smash-chunk',
    messageId: 'msg-smash-chunk',
    chunk: '**Creating simple electrical calculator**Done — I created a simple Python electrical calculator.',
    emittedAt: 100,
    streamMeta: { providerId: 'openrouter', turnId: 'turn-smash-chunk', threadId: 'thread-smash-chunk' },
  })

  const turn = state.turnsById['turn-smash-chunk']
  const reasoningEvents = turn.eventOrder
    .map((eventId) => turn.eventsById[eventId])
    .filter((event) => event?.kind === 'reasoning' && event?.archived !== true)
  assert.equal(reasoningEvents.length, 1)
  assert.equal(reasoningEvents[0].detail, '**Creating simple electrical calculator**')
})

test('store syncs live reasoning state from the streaming assistant message', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    const messageId = api.addAssistantPlaceholder()

    api.markStreamStarted(messageId, {
      startedAt: 1_000,
      threadId: 'thread-live',
      turnId: 'turn-live',
    })
    api.appendReasoning(messageId, 'step one ')
    api.appendReasoning(messageId, 'step two')

    let turn = store.getState().liveExecution.turnsById['turn-live']
    assert.ok(turn)
    let reasoningEvents = turn.eventOrder
      .map((eventId) => turn.eventsById[eventId])
      .filter((event) => event?.kind === 'reasoning')
    assert.equal(reasoningEvents.length, 1)
    assert.equal(reasoningEvents[0].status, 'active')
    assert.match(String(reasoningEvents[0].detail || ''), /step one step two/)

    api.markReasoningDone(messageId)
    turn = store.getState().liveExecution.turnsById['turn-live']
    reasoningEvents = turn.eventOrder
      .map((eventId) => turn.eventsById[eventId])
      .filter((event) => event?.kind === 'reasoning')
    assert.equal(reasoningEvents.every((event) => event.status === 'done'), true)
    assert.equal(reasoningEvents.every((event) => event.hasPendingTail === false), true)
  })
})

test('execution commentary stays in live execution, preserves tool ordering, and leaves the assistant bubble for the final answer', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread-execution-commentary')
    const messageId = api.addAssistantPlaceholder({ threadId: 'thread-execution-commentary' })

    api.markStreamStarted(messageId, {
      startedAt: 1_000,
      threadId: 'thread-execution-commentary',
      turnId: 'turn-execution-commentary',
      providerId: 'openai',
      model: 'gpt-5.4',
    })

    api.appendExecutionCommentary({
      threadId: 'thread-execution-commentary',
      turnId: 'turn-execution-commentary',
      round: 1,
      chunk: 'Inspecting the workspace first.',
      emittedAt: 1_010,
      streamMeta: {
        threadId: 'thread-execution-commentary',
        turnId: 'turn-execution-commentary',
      },
    })

    api.pushToolActivity({
      id: 'tool-result-execution-commentary',
      type: 'result',
      eventKind: 'tool_result',
      threadId: 'thread-execution-commentary',
      turnId: 'turn-execution-commentary',
      stepId: 'step-1',
      sequence: 1,
      toolName: 'read_file',
      label: 'Read file',
      result: 'ok',
      createdAt: 1_020,
      finishedAt: 1_030,
    })

    api.appendExecutionCommentary({
      threadId: 'thread-execution-commentary',
      turnId: 'turn-execution-commentary',
      round: 2,
      chunk: 'Now patching the renderer path.',
      emittedAt: 1_040,
      streamMeta: {
        threadId: 'thread-execution-commentary',
        turnId: 'turn-execution-commentary',
      },
    })

    api.finalizeMessage(messageId, 'Final answer only.', {
      phase: 'final_answer',
      threadId: 'thread-execution-commentary',
    })
    api.markExecutionCommentaryDone({
      threadId: 'thread-execution-commentary',
      turnId: 'turn-execution-commentary',
      streamMeta: {
        threadId: 'thread-execution-commentary',
        turnId: 'turn-execution-commentary',
        completedAt: 1_050,
      },
    })

    const message = store.getState().messages.find((entry) => entry.id === messageId)
    assert.ok(message)
    assert.equal(String(message?.content || ''), 'Final answer only.')
    assert.equal(String(message?.reasoning || ''), '')

    const turn = store.getState().liveExecution.turnsById['turn-execution-commentary']
    assert.ok(turn)
    const events = turn.eventOrder.map((eventId) => turn.eventsById[eventId]).filter(Boolean)
    assert.deepEqual(events.map((event) => event.kind), ['reasoning', 'tool_result', 'reasoning'])
    assert.equal(String(events[0]?.detail || ''), 'Inspecting the workspace first.')
    assert.equal(String(events[1]?.summary || ''), 'Read file')
    assert.equal(String(events[2]?.detail || ''), 'Now patching the renderer path.')
    assert.equal(events[0]?.status, 'done')
    assert.equal(events[2]?.status, 'done')
  })
})

test('execution commentary keeps one stable round slot across intervening tools', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread-stable-commentary')

    api.appendExecutionCommentary({
      threadId: 'thread-stable-commentary',
      turnId: 'turn-stable-commentary',
      round: 1,
      chunk: 'Checking ',
      emittedAt: 1_000,
    })
    api.pushToolActivity({
      id: 'tool-between-commentary',
      type: 'result',
      eventKind: 'tool_result',
      threadId: 'thread-stable-commentary',
      turnId: 'turn-stable-commentary',
      stepId: 'step-1',
      toolName: 'read_file',
      label: 'Read file',
      result: 'ok',
      createdAt: 1_010,
      finishedAt: 1_020,
    })
    api.appendExecutionCommentary({
      threadId: 'thread-stable-commentary',
      turnId: 'turn-stable-commentary',
      round: 1,
      chunk: 'the workspace.',
      emittedAt: 1_030,
    })
    api.appendExecutionCommentary({
      threadId: 'thread-stable-commentary',
      turnId: 'turn-stable-commentary',
      round: 2,
      chunk: 'Running verification.',
      emittedAt: 1_040,
    })

    const turn = store.getState().liveExecution.turnsById['turn-stable-commentary']
    const reasoningEvents = turn.eventOrder
      .map((eventId) => turn.eventsById[eventId])
      .filter((event) => event?.kind === 'reasoning')
    assert.equal(reasoningEvents.length, 2)
    assert.equal(reasoningEvents[0].messageId, 'execution_commentary:turn-stable-commentary:1')
    assert.equal(reasoningEvents[0].detail, 'Checking the workspace.')
    assert.equal(reasoningEvents[1].messageId, 'execution_commentary:turn-stable-commentary:2')
    assert.equal(reasoningEvents[1].detail, 'Running verification.')
  })
})

test('OpenAI account empty-final fallback is transport-scoped and keeps execution commentary settled in live execution', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread-openai-account-live-execution')
    const messageId = api.addAssistantPlaceholder({ threadId: 'thread-openai-account-live-execution' })

    api.markStreamStarted(messageId, {
      startedAt: 4_000,
      threadId: 'thread-openai-account-live-execution',
      turnId: 'turn-openai-account-live-execution',
      providerId: 'openai',
      model: 'gpt-5.4',
      transportMode: 'codex_app_server_chatgpt',
    })

    api.appendExecutionCommentary({
      threadId: 'thread-openai-account-live-execution',
      turnId: 'turn-openai-account-live-execution',
      chunk: 'Inspecting the workspace first.',
      emittedAt: 4_020,
      streamMeta: {
        threadId: 'thread-openai-account-live-execution',
        turnId: 'turn-openai-account-live-execution',
        transportMode: 'codex_app_server_chatgpt',
      },
    })

    api.finalizeMessage(messageId, '   ', {
      threadId: 'thread-openai-account-live-execution',
      providerId: 'openai',
      model: 'gpt-5.4',
      transportMode: 'codex_app_server_chatgpt',
    })
    api.markExecutionCommentaryDone({
      threadId: 'thread-openai-account-live-execution',
      turnId: 'turn-openai-account-live-execution',
      streamMeta: {
        threadId: 'thread-openai-account-live-execution',
        turnId: 'turn-openai-account-live-execution',
        completedAt: 4_040,
      },
    })

    const message = store.getState().messages.find((entry) => entry.id === messageId)
    assert.ok(message)
    assert.equal(String(message?.status || ''), 'done')
    assert.equal(String(message?.content || ''), 'Completed, but no final answer text was returned.')
    assert.equal(String(message?.reasoning || ''), '')

    const turn = store.getState().liveExecution.turnsById['turn-openai-account-live-execution']
    assert.ok(turn)
    const reasoningEvents = turn.eventOrder
      .map((eventId) => turn.eventsById[eventId])
      .filter((event) => event?.kind === 'reasoning' && event?.archived !== true)
    assert.equal(reasoningEvents.length, 1)
    assert.equal(String(reasoningEvents[0]?.detail || ''), 'Inspecting the workspace first.')
    assert.equal(String(reasoningEvents[0]?.status || ''), 'done')
  })
})

test('finalizeMessage removes settled reasoning that duplicates the assistant conclusion', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread-dedupe')
    const messageId = api.addAssistantPlaceholder({ threadId: 'thread-dedupe' })

    api.markStreamStarted(messageId, {
      startedAt: 1_000,
      threadId: 'thread-dedupe',
      turnId: 'turn-dedupe',
    })
    api.appendReasoning(messageId, 'Great — continued and finished.')

    let turn = store.getState().liveExecution.turnsById['turn-dedupe']
    assert.ok(turn)
    assert.equal(
      turn.eventOrder
        .map((eventId) => turn.eventsById[eventId])
        .filter((event) => event?.kind === 'reasoning').length,
      1,
    )

    api.finalizeMessage(messageId, 'Great — continued and finished.', {
      threadId: 'thread-dedupe',
    })
    api.markReasoningDone(messageId, { threadId: 'thread-dedupe' })

    turn = store.getState().liveExecution.turnsById['turn-dedupe']
    const reasoningEvents = turn
      ? turn.eventOrder
        .map((eventId) => turn.eventsById[eventId])
        .filter((event) => event?.kind === 'reasoning' && event?.archived !== true)
      : []
    assert.equal(reasoningEvents.length, 0)

    const message = store.getState().messages.find((entry) => entry.id === messageId)
    assert.equal(String(message?.content || ''), 'Great — continued and finished.')
    assert.equal(String(message?.status || ''), 'done')
  })
})

test('late finalizeReasoning does not add assistant conclusion duplicates to execution reasoning', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread-late-finalize')
    const messageId = api.addAssistantPlaceholder({ threadId: 'thread-late-finalize' })

    api.markStreamStarted(messageId, {
      startedAt: 1_000,
      threadId: 'thread-late-finalize',
      turnId: 'turn-late-finalize',
    })
    api.finalizeMessage(messageId, 'Matching final answer.', {
      threadId: 'thread-late-finalize',
    })
    api.finalizeReasoning(messageId, 'Matching final answer.', {
      threadId: 'thread-late-finalize',
    })
    api.markReasoningDone(messageId, {
      threadId: 'thread-late-finalize',
    })

    const message = store.getState().messages.find((entry) => entry.id === messageId)
    assert.ok(message)
    assert.equal(String(message?.content || ''), 'Matching final answer.')
    assert.equal(String(message?.reasoning || ''), '')
    assert.equal(message?.reasoningDone, true)

    const turn = store.getState().liveExecution.turnsById['turn-late-finalize']
    const reasoningEvents = turn
      ? turn.eventOrder
        .map((eventId) => turn.eventsById[eventId])
        .filter((event) => event?.kind === 'reasoning' && event?.archived !== true)
      : []
    assert.equal(reasoningEvents.length, 0)
  })
})

test('buildLiveExecutionState normalizes legacy object-backed reasoning into settled execution events', () => {
  const state = buildLiveExecutionState({
    messages: [{
      id: 'assistant-legacy',
      role: 'assistant',
      reasoning: {
        text: 'legacy step one\n\n---\n\nlegacy step two',
        done: true,
        mode: 'summary_end',
      },
      streamMeta: {
        threadId: 'thread-legacy',
        turnId: 'turn-legacy',
        startedAt: 100,
        completedAt: 200,
      },
    }],
  })

  const turn = state.turnsById['turn-legacy']
  assert.ok(turn)
  const reasoningEvents = turn.eventOrder
    .map((eventId) => turn.eventsById[eventId])
    .filter((event) => event?.kind === 'reasoning' && event?.archived !== true)
  assert.equal(reasoningEvents.length, 2)
  assert.equal(reasoningEvents[0].status, 'done')
  assert.equal(reasoningEvents[0].detail, 'legacy step one')
  assert.equal(reasoningEvents[1].detail, 'legacy step two')
})

test('buildLiveExecutionState synthesizes multiple reasoning events from persisted step separators', () => {
  const state = buildLiveExecutionState({
    messages: [{
      id: 'assistant-1',
      role: 'assistant',
      reasoning: 'step one\n\n---\n\nstep two',
      reasoningDone: true,
      reasoningMeta: { mode: 'summary_end' },
      streamMeta: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        startedAt: 100,
        completedAt: 200,
      },
    }],
  })

  const turn = state.turnsById['turn-1']
  assert.ok(turn)
  const reasoningEvents = turn.eventOrder
    .map((eventId) => turn.eventsById[eventId])
    .filter((event) => event?.kind === 'reasoning')
  assert.equal(reasoningEvents.length, 2)
  assert.equal(reasoningEvents[0].detail, 'step one')
  assert.equal(reasoningEvents[1].detail, 'step two')
  assert.equal(reasoningEvents.every((event) => event.status === 'done'), true)
})

test('buildLiveExecutionState ignores legacy reasoning activities and hydrates from assistant reasoning only once', () => {
  const state = buildLiveExecutionState({
    messages: [{
      id: 'assistant-2',
      role: 'assistant',
      reasoning: 'step one\n\n---\n\nstep two',
      reasoningDone: true,
      reasoningMeta: { mode: 'summary_end' },
      streamMeta: {
        threadId: 'thread-2',
        turnId: 'turn-2',
        startedAt: 100,
        completedAt: 200,
      },
    }],
    toolActivity: [{
      id: 'reasoning-activity-1',
      type: 'reasoning',
      turnId: 'turn-2',
      label: 'Reasoning summary captured',
      detail: 'step one',
      createdAt: 150,
    }, {
      id: 'reasoning-activity-2',
      type: 'reasoning',
      turnId: 'turn-2',
      label: 'Reasoning summary captured',
      detail: 'step two',
      createdAt: 175,
    }],
  })

  const turn = state.turnsById['turn-2']
  assert.ok(turn)
  const reasoningEvents = turn.eventOrder
    .map((eventId) => turn.eventsById[eventId])
    .filter((event) => event?.kind === 'reasoning')
  assert.equal(reasoningEvents.length, 2)
  assert.equal(reasoningEvents[0].detail, 'step one')
  assert.equal(reasoningEvents[1].detail, 'step two')
})

test('buildLiveExecutionState hydrates persisted reasoning activities in chronological order when no assistant reasoning exists', () => {
  const state = buildLiveExecutionState({
    toolActivity: [{
      id: 'reasoning-activity-1',
      type: 'reasoning',
      eventKind: 'reasoning_done',
      turnId: 'turn-hydrated',
      threadId: 'thread-hydrated',
      label: 'Reasoning summary captured',
      detail: 'Planning schema updates',
      createdAt: 110,
    }, {
      id: 'tool-activity-1',
      type: 'result',
      eventKind: 'tool_result',
      turnId: 'turn-hydrated',
      stepId: 'step-1',
      toolName: 'read_file',
      label: 'Read schema.sql',
      result: 'ok',
      createdAt: 120,
      finishedAt: 125,
    }, {
      id: 'reasoning-activity-2',
      type: 'reasoning',
      eventKind: 'reasoning_done',
      turnId: 'turn-hydrated',
      threadId: 'thread-hydrated',
      label: 'Reasoning summary captured',
      detail: 'Preparing patch',
      createdAt: 130,
    }],
  })

  const turn = state.turnsById['turn-hydrated']
  assert.ok(turn)
  const events = turn.eventOrder.map((eventId) => turn.eventsById[eventId])
  assert.deepEqual(
    events.map((event) => event.kind),
    ['reasoning', 'tool_result', 'reasoning'],
  )
  assert.equal(events[0].detail, 'Planning schema updates')
  assert.equal(events[2].detail, 'Preparing patch')
})

test('buildLiveExecutionState reorders out-of-order hydrated activities by event time', () => {
  const state = buildLiveExecutionState({
    toolActivity: [{
      id: 'reasoning-activity-late',
      type: 'reasoning',
      eventKind: 'reasoning_done',
      turnId: 'turn-hydrated-order',
      threadId: 'thread-hydrated-order',
      label: 'Reasoning summary captured',
      detail: 'late',
      createdAt: 200,
    }, {
      id: 'reasoning-activity-early',
      type: 'reasoning',
      eventKind: 'reasoning_done',
      turnId: 'turn-hydrated-order',
      threadId: 'thread-hydrated-order',
      label: 'Reasoning summary captured',
      detail: 'early',
      createdAt: 100,
    }],
  })

  const turn = state.turnsById['turn-hydrated-order']
  assert.ok(turn)
  const events = turn.eventOrder.map((eventId) => turn.eventsById[eventId])
  assert.deepEqual(events.map((event) => event.detail), ['early', 'late'])
})

test('buildLiveExecutionState includes assistant commentary activities in the execution narrative', () => {
  const state = buildLiveExecutionState({
    toolActivity: [{
      id: 'assistant-commentary-1',
      type: 'reasoning',
      eventKind: 'assistant_commentary',
      turnId: 'turn-commentary',
      threadId: 'thread-commentary',
      label: 'Assistant update',
      detail: 'Retrying now. I will check the files first.',
      createdAt: 110,
    }, {
      id: 'tool-activity-1',
      type: 'result',
      eventKind: 'tool_result',
      turnId: 'turn-commentary',
      stepId: 'step-1',
      toolName: 'list_directory',
      label: 'Listed in project root',
      result: 'ok',
      createdAt: 120,
      finishedAt: 125,
    }],
  })

  const turn = state.turnsById['turn-commentary']
  assert.ok(turn)
  const events = turn.eventOrder.map((eventId) => turn.eventsById[eventId])
  assert.deepEqual(
    events.map((event) => event.kind),
    ['reasoning', 'tool_result'],
  )
  assert.match(String(events[0]?.detail || ''), /Retrying now/)
})

test('buildLiveExecutionState skips malformed step-less output previews instead of merging them', () => {
  const state = buildLiveExecutionState({
    toolActivity: [{
      id: 'tool-step-less-1',
      type: 'result',
      eventKind: 'tool_result',
      turnId: 'turn-step-less-hydrated',
      threadId: 'thread-step-less-hydrated',
      toolName: 'run_command',
      label: 'Command finished',
      stdoutPreview: 'first',
      createdAt: 100,
      finishedAt: 110,
    }, {
      id: 'tool-step-less-2',
      type: 'result',
      eventKind: 'tool_result',
      turnId: 'turn-step-less-hydrated',
      threadId: 'thread-step-less-hydrated',
      toolName: 'run_command',
      label: 'Command finished again',
      stdoutPreview: 'second',
      createdAt: 120,
      finishedAt: 130,
    }],
  })

  const turn = state.turnsById['turn-step-less-hydrated']
  assert.ok(turn)
  const events = turn.eventOrder.map((eventId) => turn.eventsById[eventId])
  assert.deepEqual(events.map((event) => event.kind), ['tool_result', 'tool_result'])
  assert.equal(events.some((event) => event.kind === 'tool_output'), false)
})

test('legacy reasoning activity upserts do not mutate live execution reasoning', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.upsertReasoningActivity({
      id: 'legacy-reasoning-1',
      type: 'reasoning',
      turnId: 'turn-legacy',
      label: 'Reasoning summary captured',
      detail: 'legacy reasoning summary',
      createdAt: 100,
    })

    const liveTurn = store.getState().liveExecution.turnsById['turn-legacy']
    assert.equal(liveTurn, undefined)

    const reasoningActivities = store.getState().toolActivity.filter((entry) => entry?.type === 'reasoning')
    assert.equal(reasoningActivities.length, 1)
    assert.equal(reasoningActivities[0].detail, 'legacy reasoning summary')
  })
})

test('useChatStore keeps provider tool status in canonical live execution while retaining timeline activity', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread-live')
    api.pushToolActivity({
      id: 'provider_tool_input:turn-live:call-live',
      type: 'provider_tool',
      eventKind: 'provider_tool_status',
      threadId: 'thread-live',
      turnId: 'turn-live',
      stepId: 'call-live',
      label: 'Provider tool input: tool',
      detail: 'Collecting provider tool input...',
      toolName: 'tool',
      coalesce: true,
    })

    const next = store.getState()
    assert.equal(next.toolActivity.length, 1)
    assert.equal(next.timeline.filter((row) => row?.kind === 'tool').length, 1)
    const turn = next.liveExecution.turnsById['turn-live']
    assert.equal(turn.eventOrder.length, 0)
    assert.equal(turn.itemOrder.length, 1)
    assert.equal(turn.sessionsById['session:turn-live:call-live'].state, 'active')
  })
})
