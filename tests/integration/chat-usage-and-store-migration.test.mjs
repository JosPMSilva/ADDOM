import test from 'node:test'
import assert from 'node:assert/strict'
import { mapTimelineFromPersistedEvents } from '../../src/renderer/store/chat/timeline-hydration.mjs'
import { buildContextMeterUsage, executeSendMessage } from '../../src/renderer/components/chat/chat-panel-helpers.mjs'

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
    _map: map,
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
    const mod = await import(`../../src/renderer/store/useChatStore.js?phase7=${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
    const store = mod.default
    if (typeof store?.setState === 'function' && typeof store?.getInitialState === 'function') {
      store.setState(store.getInitialState(), true)
    }
    return await testFn({ store, localStorage })
  } finally {
    globalThis.window = prevWindow
    globalThis.localStorage = prevLocalStorage
    if (injectedCrypto) {
      // Only restore if we created a stub in this helper.
      // In Node, globalThis.crypto is commonly a read-only accessor.
      delete globalThis.crypto
    }
  }
}

test('timeline hydration maps chat_usage occupancy fields separately from rolling spend', () => {
  const createdAt = Date.now()
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 1,
      createdAt,
      kind: 'chat_usage',
      turnId: 'turn_1',
      meta: {
        threadId: 'thread_1',
        turnId: 'turn_1',
        usage: { inputTokens: 120, outputTokens: 80, reasoningTokens: 25, totalTokens: 225 },
        rollingInputTokens: 1000,
        rollingOutputTokens: 2000,
        rollingReasoningTokens: 300,
        rollingTotalTokens: 3300,
        modelLimit: 128000,
        maxOutputTokens: 16384,
        contextOccupancyTokens: 9000,
        contextRemainingTokens: 119000,
        source: 'provider',
        occupancySource: 'estimated_history',
      },
    },
  ])

  assert.equal(mapped.contextUsage.threadId, 'thread_1')
  assert.equal(mapped.contextUsage.totalTokens, 225)
  assert.equal(mapped.contextUsage.rollingTotalTokens, 3300)
  assert.equal(mapped.contextUsage.contextOccupancyTokens, 9000)
  assert.equal(mapped.contextUsage.providerOccupancyTokens, null)
  assert.equal(mapped.contextUsage.estimatedOccupancyTokens, 9000)
  assert.equal(mapped.contextUsage.effectiveOccupancyTokens, 9000)
  assert.equal(mapped.contextUsage.contextRemainingTokens, 119000)
  assert.equal(mapped.contextUsage.maxOutputTokens, 16384)
  assert.equal(mapped.contextUsage.occupancySource, 'estimated_history')
  assert.equal(mapped.contextUsage.occupancyConfidence, 'rough_estimate')
  assert.equal(mapped.toolActivity.some((a) => a.type === 'usage'), true)
  const usageActivity = mapped.toolActivity.find((a) => a.type === 'usage')
  assert.ok(usageActivity)
  assert.match(String(usageActivity.detail || ''), /rolling spend: 3300/)
  assert.match(String(usageActivity.detail || ''), /occupancy: 9000/)
  assert.doesNotMatch(String(usageActivity.detail || ''), /occupancy_source:/)
  assert.doesNotMatch(String(usageActivity.detail || ''), /occupancy_confidence:/)
  assert.doesNotMatch(String(usageActivity.detail || ''), /provider_occupancy:/)
  assert.doesNotMatch(String(usageActivity.detail || ''), /estimated_occupancy:/)
  assert.doesNotMatch(String(usageActivity.detail || ''), /provenance:/)
  assert.doesNotMatch(String(usageActivity.detail || ''), /precision:/)
  assert.doesNotMatch(String(usageActivity.detail || ''), /last_verified:/)
})

test('timeline hydration prefers explicit provider-backed occupancy over rolling spend and legacy alias fields', () => {
  const createdAt = Date.now()
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 2,
      createdAt,
      kind: 'chat_usage',
      turnId: 'turn_provider_1',
      meta: {
        threadId: 'thread_provider_1',
        turnId: 'turn_provider_1',
        usage: { inputTokens: 120, outputTokens: 30, reasoningTokens: 7, totalTokens: 150 },
        rollingInputTokens: 1000,
        rollingOutputTokens: 2000,
        rollingReasoningTokens: 300,
        rollingTotalTokens: 3300,
        modelLimit: 400000,
        providerOccupancyTokens: 120,
        estimatedOccupancyTokens: 12000,
        effectiveOccupancyTokens: 120,
        contextOccupancyTokens: 120,
        occupancySource: 'provider_rendered_input',
        occupancyConfidence: 'provider_verified',
      },
    },
  ])

  assert.equal(mapped.contextUsage.rollingTotalTokens, 3300)
  assert.equal(mapped.contextUsage.providerOccupancyTokens, 120)
  assert.equal(mapped.contextUsage.estimatedOccupancyTokens, 12000)
  assert.equal(mapped.contextUsage.effectiveOccupancyTokens, 120)
  assert.equal(mapped.contextUsage.contextOccupancyTokens, 120)
  assert.equal(mapped.contextUsage.contextRemainingTokens, 399880)
  assert.equal(mapped.contextUsage.occupancySource, 'provider_rendered_input')
  assert.equal(mapped.contextUsage.occupancyConfidence, 'provider_verified')
})

test('timeline hydration preserves compaction usage refresh state without resetting prior rolling totals', () => {
  const createdAt = Date.now()
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 3,
      createdAt,
      kind: 'chat_usage',
      turnId: 'turn_compaction_usage_before',
      meta: {
        threadId: 'thread_compaction_usage_refresh',
        turnId: 'turn_compaction_usage_before',
        usage: { inputTokens: 120, outputTokens: 80, reasoningTokens: 25, totalTokens: 225 },
        rollingInputTokens: 1000,
        rollingOutputTokens: 2000,
        rollingReasoningTokens: 300,
        rollingTotalTokens: 3300,
        modelLimit: 400000,
        contextOccupancyTokens: 9000,
        contextRemainingTokens: 391000,
        occupancySource: 'estimated_history',
      },
    },
    {
      eventId: 4,
      createdAt: createdAt + 1,
      kind: 'chat_usage',
      turnId: 'turn_compaction_usage_after',
      meta: {
        threadId: 'thread_compaction_usage_refresh',
        turnId: 'turn_compaction_usage_after',
        usage: {},
        compactionStrategy: 'codex_thread_compaction',
        compactionScope: 'thread_reset',
        compactionSource: 'provider',
        usageRefreshState: 'recalculating',
        occupancySource: 'unavailable',
        occupancyConfidence: 'unavailable',
        authMethod: 'account',
        transportMode: 'codex_app_server_chatgpt',
      },
    },
  ])

  assert.equal(mapped.contextUsage.turnId, 'turn_compaction_usage_after')
  assert.equal(mapped.contextUsage.rollingTotalTokens, 3300)
  assert.equal(mapped.contextUsage.compactionStrategy, 'codex_thread_compaction')
  assert.equal(mapped.contextUsage.compactionScope, 'thread_reset')
  assert.equal(mapped.contextUsage.compactionSource, 'provider')
  assert.equal(mapped.contextUsage.usageRefreshState, 'recalculating')
  assert.equal(mapped.contextUsage.occupancySource, 'unavailable')
  assert.equal(mapped.contextUsage.occupancyConfidence, 'unavailable')
  assert.equal(mapped.contextUsage.authMethod, 'account')
  assert.equal(mapped.contextUsage.transportMode, 'codex_app_server_chatgpt')
})

test('timeline hydration restores user attachment parts from persisted event meta', () => {
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 11,
      createdAt: Date.now(),
      kind: 'user_message',
      role: 'user',
      content: '[2 attachments]',
      meta: {
        userContentParts: [
          { type: 'text', text: 'Check this.' },
          { type: 'image', image: 'R0lGODlhAQABAIAAAAUEBA==', mediaType: 'image/jpeg' },
          { type: 'file', mediaType: 'application/pdf', filename: 'spec.pdf', data: 'JVBERi0xLjQK' },
        ],
      },
    },
  ])

  assert.equal(mapped.messages.length, 1)
  assert.equal(mapped.messages[0].role, 'user')
  assert.equal(Array.isArray(mapped.messages[0].content), true)
  assert.equal(mapped.messages[0].content.length, 3)
  assert.equal(mapped.messages[0].content[0].type, 'text')
  assert.equal(mapped.messages[0].content[1].type, 'image')
  assert.equal(mapped.messages[0].content[2].type, 'file')
  assert.equal(mapped.messages[0].content[2].data, 'JVBERi0xLjQK')
})

test('timeline hydration restores reasoning_done as runbook reasoning activity', () => {
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 20,
      createdAt: 1_000,
      kind: 'assistant_message',
      turnId: 'turn_reasoning',
      content: 'Done.',
      meta: { threadId: 'thread_reasoning' },
    },
    {
      eventId: 21,
      createdAt: 1_050,
      kind: 'reasoning_done',
      turnId: 'turn_reasoning',
      content: 'First thought.\n\n---\n\nSecond thought.',
      meta: { threadId: 'thread_reasoning' },
    },
  ])

  const assistant = mapped.messages.find((message) => String(message?.role || '') === 'assistant')
  assert.ok(assistant)
  assert.match(String(assistant.reasoning || ''), /First thought/)

  const reasoningActivities = mapped.toolActivity.filter((activity) => String(activity?.eventKind || '') === 'reasoning_done')
  assert.equal(reasoningActivities.length, 2)
  assert.equal(String(reasoningActivities[0]?.type || ''), 'reasoning')
  assert.equal(String(reasoningActivities[0]?.detail || ''), 'First thought.')
  assert.equal(String(reasoningActivities[1]?.detail || ''), 'Second thought.')

  const reasoningTimelineRows = mapped.timeline.filter((row) => (
    row?.kind === 'tool'
    && String(row?.activity?.eventKind || '') === 'reasoning_done'
  ))
  assert.equal(reasoningTimelineRows.length, 2)
})

test('timeline hydration keeps split reasoning_done blocks distinct in live execution order', () => {
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 20,
      createdAt: 1_000,
      kind: 'reasoning_done',
      turnId: 'turn_interleaved_reasoning',
      content: 'Plan the search.\n\n---\n\nCompare the files.',
      meta: { threadId: 'thread_interleaved_reasoning' },
    },
    {
      eventId: 21,
      createdAt: 1_010,
      kind: 'tool_result',
      turnId: 'turn_interleaved_reasoning',
      content: 'Listed project files.',
      meta: {
        threadId: 'thread_interleaved_reasoning',
        toolName: 'list_directory',
        decision: 'approved',
      },
    },
  ])

  assert.deepEqual(
    mapped.toolActivity.map((activity) => ({
      eventKind: String(activity?.eventKind || ''),
      detail: String(activity?.detail || ''),
    })),
    [
      { eventKind: 'reasoning_done', detail: 'Plan the search.' },
      { eventKind: 'reasoning_done', detail: 'Compare the files.' },
      { eventKind: 'tool_result', detail: '' },
    ],
  )
})

test('timeline hydration replaces malformed round previews with authoritative snapshots without reload duplication', () => {
  const events = [
    {
      eventId: 30,
      createdAt: 1_000,
      kind: 'execution_reasoning_chunk',
      turnId: 'turn_authoritative_reload',
      content: 'Plantheinspection.',
      meta: {
        threadId: 'thread_authoritative_reload',
        assistantMessageId: 'assistant_authoritative_reload',
        round: 1,
        emittedAt: 1_000,
      },
    },
    {
      eventId: 31,
      createdAt: 1_010,
      kind: 'reasoning_done',
      turnId: 'turn_authoritative_reload',
      content: 'Plan the inspection.',
      meta: {
        threadId: 'thread_authoritative_reload',
        assistantMessageId: 'assistant_authoritative_reload',
        round: 1,
        current: 'Plan the inspection.',
        full: 'Plan the inspection.',
      },
    },
    {
      eventId: 32,
      createdAt: 1_020,
      kind: 'tool_result',
      turnId: 'turn_authoritative_reload',
      content: 'Read app.js.',
      meta: {
        threadId: 'thread_authoritative_reload',
        toolName: 'read_file',
        decision: 'approved',
      },
    },
    {
      eventId: 33,
      createdAt: 1_030,
      kind: 'execution_reasoning_chunk',
      turnId: 'turn_authoritative_reload',
      content: 'Confirmtheresult.',
      meta: {
        threadId: 'thread_authoritative_reload',
        assistantMessageId: 'assistant_authoritative_reload',
        round: 2,
        emittedAt: 1_030,
      },
    },
    {
      eventId: 34,
      createdAt: 1_040,
      kind: 'assistant_message',
      turnId: 'turn_authoritative_reload',
      content: 'Final answer.',
      meta: {
        threadId: 'thread_authoritative_reload',
        assistantMessageId: 'assistant_authoritative_reload',
      },
    },
    {
      eventId: 35,
      createdAt: 1_050,
      kind: 'reasoning_done',
      turnId: 'turn_authoritative_reload',
      content: 'Confirm the result.',
      meta: {
        threadId: 'thread_authoritative_reload',
        assistantMessageId: 'assistant_authoritative_reload',
        round: 2,
        current: 'Confirm the result.',
        full: 'Plan the inspection.\n\n---\n\nConfirm the result.',
      },
    },
  ]

  const inspect = () => {
    const mapped = mapTimelineFromPersistedEvents(events)
    const turn = mapped.liveExecution.turnsById.turn_authoritative_reload
    const execution = turn.eventOrder.map((eventId) => turn.eventsById[eventId]).filter(Boolean)
    return {
      assistantReasoning: mapped.messages.find((message) => message.id === 'assistant_authoritative_reload')?.reasoning,
      execution: execution.map((event) => ({ kind: event.kind, detail: String(event.detail || '') })),
      reasoningActivity: mapped.toolActivity
        .filter((activity) => activity.eventKind === 'reasoning_done')
        .map((activity) => activity.detail),
    }
  }

  const firstLoad = inspect()
  const reloaded = inspect()
  assert.equal(firstLoad.assistantReasoning, 'Plan the inspection.\n\n---\n\nConfirm the result.')
  assert.deepEqual(firstLoad.execution, [
    { kind: 'reasoning', detail: 'Plan the inspection.' },
    { kind: 'tool_result', detail: 'Read app.js.' },
    { kind: 'reasoning', detail: 'Confirm the result.' },
  ])
  assert.deepEqual(firstLoad.reasoningActivity, ['Plan the inspection.', 'Confirm the result.'])
  assert.deepEqual(reloaded, firstLoad)
  assert.doesNotMatch(JSON.stringify(reloaded), /Plantheinspection|Confirmtheresult/)
})

test('timeline hydration does not turn token-only reasoning_done metadata into visible reasoning', () => {
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 21,
      createdAt: 1_050,
      kind: 'reasoning_done',
      turnId: 'turn_reasoning_tokens',
      content: '',
      meta: {
        threadId: 'thread_reasoning_tokens',
        reasoningTokens: 82,
      },
    },
  ])

  const reasoningActivity = mapped.toolActivity.find((activity) => String(activity?.eventKind || '') === 'reasoning_done')
  assert.equal(reasoningActivity, undefined)
  const reasoningTimelineRow = mapped.timeline.find((row) => (
    row?.kind === 'tool'
    && String(row?.activity?.eventKind || '') === 'reasoning_done'
  ))
  assert.equal(reasoningTimelineRow, undefined)
})

test('timeline hydration restores assistant_commentary as a persisted execution-stream activity', () => {
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 22,
      createdAt: 1_025,
      kind: 'assistant_commentary',
      turnId: 'turn_commentary',
      content: 'Retrying now. I will quickly check current files before recreating the website files.',
      meta: {
        threadId: 'thread_commentary',
        round: 1,
      },
    },
    {
      eventId: 23,
      createdAt: 1_050,
      kind: 'tool_pending',
      turnId: 'turn_commentary',
      content: 'Preparing 1 action...',
      meta: {
        threadId: 'thread_commentary',
        count: 1,
      },
    },
  ])

  const commentaryActivity = mapped.toolActivity.find((activity) => String(activity?.eventKind || '') === 'assistant_commentary')
  assert.ok(commentaryActivity)
  assert.equal(String(commentaryActivity?.type || ''), 'reasoning')
  assert.match(String(commentaryActivity?.detail || ''), /Retrying now/)

  const commentaryTimelineRow = mapped.timeline.find((row) => (
    row?.kind === 'tool'
    && String(row?.activity?.eventKind || '') === 'assistant_commentary'
  ))
  assert.ok(commentaryTimelineRow)
})

test('timeline hydration skips redundant local OpenAI assistant_commentary when streamed commentary chunks already exist', () => {
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 24,
      createdAt: 1_000,
      kind: 'execution_commentary_chunk',
      turnId: 'turn_local_commentary_hydration',
      content: 'Inspecting the project first.',
      meta: {
        threadId: 'thread_local_commentary_hydration',
        providerId: 'openai',
        sequence: 1,
        emittedAt: 1_000,
      },
    },
    {
      eventId: 25,
      createdAt: 1_020,
      kind: 'assistant_commentary',
      turnId: 'turn_local_commentary_hydration',
      content: 'Inspecting the project first.',
      meta: {
        threadId: 'thread_local_commentary_hydration',
        providerId: 'openai',
        authMethod: 'api_key',
        transportMode: 'responses_stream',
        round: 1,
      },
    },
  ])

  const commentaryActivity = mapped.toolActivity.find((activity) => String(activity?.eventKind || '') === 'assistant_commentary')
  assert.equal(commentaryActivity, undefined)

  const turn = mapped.liveExecution.turnsById['turn_local_commentary_hydration']
  assert.ok(turn)
  const events = turn.eventOrder.map((eventId) => turn.eventsById[eventId]).filter(Boolean)
  assert.deepEqual(
    events.map((event) => ({ kind: event.kind, detail: String(event.detail || '') })),
    [{ kind: 'reasoning', detail: 'Inspecting the project first.' }],
  )
})

test('timeline hydration preserves account-auth assistant_commentary alongside streamed commentary history', () => {
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 26,
      createdAt: 1_000,
      kind: 'execution_commentary_chunk',
      turnId: 'turn_account_commentary_hydration',
      content: 'Inspecting the project first.',
      meta: {
        threadId: 'thread_account_commentary_hydration',
        providerId: 'openai',
        sequence: 1,
        emittedAt: 1_000,
      },
    },
    {
      eventId: 27,
      createdAt: 1_020,
      kind: 'assistant_commentary',
      turnId: 'turn_account_commentary_hydration',
      content: 'Inspecting the project first.',
      meta: {
        threadId: 'thread_account_commentary_hydration',
        providerId: 'openai',
        authMethod: 'account',
        transportMode: 'codex_app_server_chatgpt',
        round: 1,
      },
    },
  ])

  const commentaryActivity = mapped.toolActivity.find((activity) => String(activity?.eventKind || '') === 'assistant_commentary')
  assert.ok(commentaryActivity)
  assert.match(String(commentaryActivity?.detail || ''), /Inspecting the project first/)
})

test('timeline hydration rebuilds live execution chronology from persisted execution chunk events', () => {
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 40,
      createdAt: 1_000,
      kind: 'execution_reasoning_chunk',
      turnId: 'turn_execution_order',
      content: 'Planning the change.',
      meta: {
        threadId: 'thread_execution_order',
        assistantMessageId: 'assistant_execution_order',
        sequence: 1,
        emittedAt: 1_000,
      },
    },
    {
      eventId: 41,
      createdAt: 1_010,
      kind: 'tool_result',
      turnId: 'turn_execution_order',
      content: 'Listed files.',
      meta: {
        threadId: 'thread_execution_order',
        toolName: 'list_directory',
        decision: 'approved',
      },
    },
    {
      eventId: 42,
      createdAt: 1_020,
      kind: 'execution_reasoning_chunk',
      turnId: 'turn_execution_order',
      content: 'Applying the patch now.',
      meta: {
        threadId: 'thread_execution_order',
        assistantMessageId: 'assistant_execution_order',
        sequence: 2,
        emittedAt: 1_020,
      },
    },
  ])

  const turn = mapped.liveExecution.turnsById['turn_execution_order']
  assert.ok(turn)
  const events = turn.eventOrder.map((eventId) => turn.eventsById[eventId]).filter(Boolean)
  assert.deepEqual(
    events.map((event) => ({ kind: event.kind, detail: String(event.detail || ''), status: String(event.status || '') })),
    [
      { kind: 'reasoning', detail: 'Planning the change.', status: 'done' },
      { kind: 'tool_result', detail: 'Listed files.', status: 'done' },
      { kind: 'reasoning', detail: 'Applying the patch now.', status: 'done' },
    ],
  )
})

test('timeline hydration preserves fragmented local OpenAI execution reasoning blocks and their delivery metadata', () => {
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 43,
      createdAt: 1_000,
      kind: 'execution_reasoning_chunk',
      turnId: 'turn_local_fragmented_reasoning',
      content: 'Checking repository status',
      meta: {
        threadId: 'thread_local_fragmented_reasoning',
        assistantMessageId: 'assistant_local_fragmented_reasoning',
        providerId: 'openai',
        model: 'gpt-5.4',
        authMethod: 'api_key',
        transportMode: 'responses_stream',
        sequence: 1,
        emittedAt: 1_000,
      },
    },
    {
      eventId: 44,
      createdAt: 1_010,
      kind: 'execution_reasoning_chunk',
      turnId: 'turn_local_fragmented_reasoning',
      content: 'I need to figure out',
      meta: {
        threadId: 'thread_local_fragmented_reasoning',
        assistantMessageId: 'assistant_local_fragmented_reasoning',
        providerId: 'openai',
        model: 'gpt-5.4',
        authMethod: 'api_key',
        transportMode: 'responses_stream',
        forceNewBlock: true,
        sequence: 2,
        emittedAt: 1_010,
      },
    },
    {
      eventId: 45,
      createdAt: 1_020,
      kind: 'execution_reasoning_chunk',
      turnId: 'turn_local_fragmented_reasoning',
      content: '.',
      meta: {
        threadId: 'thread_local_fragmented_reasoning',
        assistantMessageId: 'assistant_local_fragmented_reasoning',
        providerId: 'openai',
        model: 'gpt-5.4',
        authMethod: 'api_key',
        transportMode: 'responses_stream',
        forceNewBlock: true,
        sequence: 3,
        emittedAt: 1_020,
      },
    },
  ])

  const turn = mapped.liveExecution.turnsById.turn_local_fragmented_reasoning
  assert.ok(turn)
  const reasoningEvents = turn.eventOrder
    .map((eventId) => turn.eventsById[eventId])
    .filter((event) => event?.kind === 'reasoning' && event?.archived !== true)

  assert.deepEqual(
    reasoningEvents.map((event) => String(event?.detail || '')),
    ['Checking repository status', 'I need to figure out', '.'],
  )
  assert.equal(String(reasoningEvents[0]?.reasoningMeta?.mode || ''), 'live')
  assert.equal(String(reasoningEvents[0]?.streamMeta?.authMethod || ''), 'api_key')
  assert.equal(String(reasoningEvents[0]?.streamMeta?.transportMode || ''), 'responses_stream')
})

test('useChatStore hydrateFromTimeline keeps persisted execution reasoning interleaved with tool events after reload', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread_reload_execution_order')
    api.hydrateFromTimeline([
      {
        eventId: 50,
        createdAt: 2_000,
        kind: 'execution_reasoning_chunk',
        turnId: 'turn_reload_execution_order',
        content: 'Inspecting the files first.',
        meta: {
          threadId: 'thread_reload_execution_order',
          assistantMessageId: 'assistant_reload_execution_order',
          sequence: 1,
          emittedAt: 2_000,
        },
      },
      {
        eventId: 51,
        createdAt: 2_010,
        kind: 'tool_result',
        turnId: 'turn_reload_execution_order',
        content: 'Read app.js.',
        meta: {
          threadId: 'thread_reload_execution_order',
          toolName: 'read_file',
          decision: 'approved',
        },
      },
      {
        eventId: 52,
        createdAt: 2_020,
        kind: 'execution_commentary_chunk',
        turnId: 'turn_reload_execution_order',
        content: 'Now updating the renderer.',
        meta: {
          threadId: 'thread_reload_execution_order',
          sequence: 1,
          emittedAt: 2_020,
        },
      },
    ], { threadId: 'thread_reload_execution_order' })

    const turn = store.getState().liveExecution.turnsById['turn_reload_execution_order']
    assert.ok(turn)
    const events = turn.eventOrder.map((eventId) => turn.eventsById[eventId]).filter(Boolean)
    assert.deepEqual(
      events.map((event) => ({ kind: event.kind, detail: String(event.detail || '') })),
      [
        { kind: 'reasoning', detail: 'Inspecting the files first.' },
        { kind: 'tool_result', detail: 'Read app.js.' },
        { kind: 'reasoning', detail: 'Now updating the renderer.' },
      ],
    )
    assert.equal(events[0]?.status, 'done')
    assert.equal(events[2]?.status, 'done')
  })
})

test('timeline hydration restores interrupted-turn reasoning from chat_error meta when no assistant message was persisted', () => {
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 30,
      createdAt: 1_000,
      kind: 'tool_result',
      turnId: 'turn_interrupted',
      content: 'Tool error: apply_patch requires unified diff hunks.',
      meta: {
        threadId: 'thread_interrupted',
        toolName: 'apply_patch',
        isError: true,
        decision: 'approved',
      },
    },
    {
      eventId: 31,
      createdAt: 1_050,
      kind: 'chat_error',
      turnId: 'turn_interrupted',
      content: 'Stopped: 3 consecutive rounds of tool errors.',
      meta: {
        threadId: 'thread_interrupted',
        reason: 'consecutive_tool_errors',
        reasoningSnapshot: 'Planning update.\n\n---\n\nApplying schema patch.',
      },
    },
  ])

  const reasoningActivities = mapped.toolActivity.filter((activity) => (
    String(activity?.eventKind || '') === 'reasoning_done'
    && String(activity?.turnId || '') === 'turn_interrupted'
  ))
  assert.equal(reasoningActivities.length, 2)
  assert.deepEqual(
    reasoningActivities.map((activity) => String(activity?.detail || '')),
    ['Planning update.', 'Applying schema patch.'],
  )

  const errorMessage = mapped.messages.find((message) => String(message?.status || '') === 'error')
  assert.ok(errorMessage)
  assert.match(String(errorMessage?.reasoning || ''), /Planning update/)

  const reasoningTimelineRows = mapped.timeline.filter((row) => (
    row?.kind === 'tool'
    && String(row?.activity?.turnId || '') === 'turn_interrupted'
    && String(row?.activity?.eventKind || '') === 'reasoning_done'
  ))
  assert.equal(reasoningTimelineRows.length, 2)
})

test('timeline hydration restores persisted write_conflict entries into writeConflicts', () => {
  const createdAt = 1_710_000_000_000
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 31,
      createdAt,
      kind: 'write_conflict',
      turnId: 'turn_conflict',
      meta: {
        threadId: 'thread_conflict',
        turnId: 'turn_conflict',
        toolName: 'write_file',
        filePath: 'calculator.py',
        newRevId: 'rev_new',
        prevRevId: 'rev_prev',
        conflictBaseRevId: 'rev_base',
        conflictActualRevId: 'rev_actual',
        detectedAt: createdAt + 25,
      },
    },
  ])

  assert.equal(Array.isArray(mapped.writeConflicts), true)
  assert.equal(mapped.writeConflicts.length, 1)
  assert.deepEqual(mapped.writeConflicts[0], {
    id: 'write_conflict:thread_conflict|turn_conflict|calculator.py|rev_new|rev_prev|rev_base|rev_actual',
    threadId: 'thread_conflict',
    turnId: 'turn_conflict',
    toolName: 'write_file',
    filePath: 'calculator.py',
    newRevId: 'rev_new',
    prevRevId: 'rev_prev',
    conflictBaseRevId: 'rev_base',
    conflictActualRevId: 'rev_actual',
    detectedAt: createdAt + 25,
    resolved: false,
    mergeProposal: null,
  })
  assert.equal(mapped.toolActivity.length, 0)
  assert.equal(mapped.timeline.length, 0)
})

test('timeline hydration preserves cached attachment references from persisted event meta', () => {
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 14,
      createdAt: Date.now(),
      kind: 'user_message',
      role: 'user',
      content: '[2 attachments]',
      meta: {
        userContentParts: [
          {
            type: 'image',
            attachmentId: 'att_image_01',
            mediaType: 'image/png',
            filename: 'diagram.png',
            previewUrl: 'file:///tmp/diagram.png',
          },
          {
            type: 'file',
            attachmentId: 'att_file_01',
            mediaType: 'application/pdf',
            filename: 'spec.pdf',
          },
        ],
      },
    },
  ])

  assert.equal(mapped.messages.length, 1)
  assert.equal(Array.isArray(mapped.messages[0].content), true)
  const imagePart = mapped.messages[0].content[0]
  const filePart = mapped.messages[0].content[1]
  assert.equal(imagePart.type, 'image')
  assert.equal(imagePart.attachmentId, 'att_image_01')
  assert.equal(imagePart.previewUrl, 'file:///tmp/diagram.png')
  assert.equal(filePart.type, 'file')
  assert.equal(filePart.attachmentId, 'att_file_01')
})

test('timeline hydration rebuilds file data from chunked attachment payload', () => {
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 12,
      createdAt: Date.now(),
      kind: 'user_message',
      role: 'user',
      content: '[1 attachment]',
      meta: {
        userContentParts: [
          {
            type: 'file',
            mediaType: 'application/pdf',
            filename: 'chunked.pdf',
            dataChunks: ['JVBERi0x', 'LjQKQ2h1', 'bmtz'],
          },
        ],
      },
    },
  ])
  assert.equal(mapped.messages.length, 1)
  assert.equal(Array.isArray(mapped.messages[0].content), true)
  assert.equal(mapped.messages[0].content[0].type, 'file')
  assert.equal(mapped.messages[0].content[0].data, 'JVBERi0xLjQKQ2h1bmtz')
})

test('timeline hydration rebuilds image data from chunked attachment payload', () => {
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 13,
      createdAt: Date.now(),
      kind: 'user_message',
      role: 'user',
      content: '[1 image]',
      meta: {
        userContentParts: [
          {
            type: 'image',
            mediaType: 'image/png',
            imageChunks: ['iVBORw0K', 'GgoAAAAN', 'SUhEUg=='],
          },
        ],
      },
    },
  ])
  assert.equal(mapped.messages.length, 1)
  assert.equal(Array.isArray(mapped.messages[0].content), true)
  assert.equal(mapped.messages[0].content[0].type, 'image')
  assert.equal(mapped.messages[0].content[0].image, 'iVBORw0KGgoAAAANSUhEUg==')
})

test('useChatStore recordUsage keeps occupancy semantics separate from rolling spend on live updates', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread_live')
    api.recordUsage({
      threadId: 'thread_live',
      turnId: 'turn_1',
      usage: { inputTokens: 10, outputTokens: 20, reasoningTokens: 5, totalTokens: 35 },
      rollingInputTokens: 100,
      rollingOutputTokens: 200,
      rollingReasoningTokens: 50,
      rollingTotalTokens: 350,
      modelLimit: 400000,
      maxOutputTokens: 128000,
      contextOccupancyTokens: 1400,
      contextRemainingTokens: 398600,
      source: 'provider',
      occupancySource: 'estimated_history',
    })

    let next = store.getState().contextUsage
    assert.equal(next.rollingTotalTokens, 350)
    assert.equal(next.contextOccupancyTokens, 1400)
    assert.equal(next.contextRemainingTokens, 398600)
    assert.equal(next.maxOutputTokens, 128000)

    api.recordUsage({
      threadId: 'thread_live',
      turnId: 'turn_2',
      usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
      rollingTotalTokens: 360,
      modelLimit: 400000,
      // No occupancy fields on purpose: should fall back deterministically.
    })

    next = store.getState().contextUsage
    assert.equal(next.rollingTotalTokens, 360)
    assert.equal(next.contextOccupancyTokens, 0)
    assert.equal(next.effectiveOccupancyTokens, 0)
    assert.equal(next.estimatedOccupancyTokens, null)
    assert.equal(next.contextRemainingTokens, 0)
    assert.equal(next.occupancySource, 'unavailable')
    assert.equal(next.occupancyConfidence, 'unavailable')
  })
})

test('useChatStore recordUsage prefers provider-backed occupancy when explicit Sprint 2 fields are present', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread_provider_live')
    api.recordUsage({
      threadId: 'thread_provider_live',
      turnId: 'turn_provider_live',
      usage: { inputTokens: 120, outputTokens: 30, reasoningTokens: 7, totalTokens: 150 },
      rollingTotalTokens: 3300,
      modelLimit: 400000,
      providerOccupancyTokens: 120,
      estimatedOccupancyTokens: 12000,
      effectiveOccupancyTokens: 120,
      contextOccupancyTokens: 120,
      occupancySource: 'provider_rendered_input',
      occupancyConfidence: 'provider_verified',
      providerInputTokens: 120,
      providerCachedReadTokens: 40,
    })

    let next = store.getState().contextUsage
    assert.equal(next.rollingTotalTokens, 3300)
    assert.equal(next.providerOccupancyTokens, 120)
    assert.equal(next.estimatedOccupancyTokens, 12000)
    assert.equal(next.contextOccupancyTokens, 120)
    assert.equal(next.contextRemainingTokens, 399880)
    assert.equal(next.occupancySource, 'provider_rendered_input')
    assert.equal(next.occupancyConfidence, 'provider_verified')
  })
})

test('useChatStore recordUsage keeps calibrated estimates separate from rolling spend when provider occupancy is unavailable', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread_calibrated_live')
    api.recordUsage({
      threadId: 'thread_calibrated_live',
      turnId: 'turn_calibrated_live',
      usage: { inputTokens: 0, outputTokens: 12, totalTokens: 12 },
      rollingTotalTokens: 888,
      modelLimit: 400000,
      estimatedOccupancyTokens: 2400,
      effectiveOccupancyTokens: 2400,
      occupancySource: 'estimated_history',
      occupancyConfidence: 'calibrated_estimate',
      occupancyMethod: 'transformed_history_plus_tool_schema',
    })

    const next = store.getState().contextUsage
    assert.equal(next.rollingTotalTokens, 888)
    assert.equal(next.providerOccupancyTokens, null)
    assert.equal(next.estimatedOccupancyTokens, 2400)
    assert.equal(next.contextOccupancyTokens, 2400)
    assert.equal(next.contextRemainingTokens, 397600)
    assert.equal(next.occupancyConfidence, 'calibrated_estimate')
    assert.equal(next.occupancyMethod, 'transformed_history_plus_tool_schema')
  })
})

test('useChatStore recordUsage preserves rolling totals when a compaction refresh is recalculating', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread_compaction_refresh_live')
    api.recordUsage({
      threadId: 'thread_compaction_refresh_live',
      turnId: 'turn_compaction_refresh_before',
      usage: { inputTokens: 10, outputTokens: 20, reasoningTokens: 5, totalTokens: 35 },
      rollingInputTokens: 100,
      rollingOutputTokens: 200,
      rollingReasoningTokens: 50,
      rollingTotalTokens: 350,
      modelLimit: 400000,
      contextOccupancyTokens: 1400,
      contextRemainingTokens: 398600,
      occupancySource: 'estimated_history',
    })

    api.recordUsage({
      threadId: 'thread_compaction_refresh_live',
      turnId: 'turn_compaction_refresh_after',
      usage: {},
      compactionStrategy: 'codex_thread_compaction',
      compactionScope: 'thread_reset',
      compactionSource: 'provider',
      usageRefreshState: 'recalculating',
      occupancySource: 'unavailable',
      occupancyConfidence: 'unavailable',
      authMethod: 'account',
      transportMode: 'codex_app_server_chatgpt',
    })

    const next = store.getState().contextUsage
    assert.equal(next.turnId, 'turn_compaction_refresh_after')
    assert.equal(next.rollingTotalTokens, 350)
    assert.equal(next.compactionStrategy, 'codex_thread_compaction')
    assert.equal(next.compactionScope, 'thread_reset')
    assert.equal(next.compactionSource, 'provider')
    assert.equal(next.usageRefreshState, 'recalculating')
    assert.equal(next.providerOccupancyTokens, null)
    assert.equal(next.estimatedOccupancyTokens, null)
    assert.equal(next.effectiveOccupancyTokens, 0)
    assert.equal(next.contextOccupancyTokens, 0)
    assert.equal(next.contextRemainingTokens, 0)
    assert.equal(next.occupancySource, 'unavailable')
    assert.equal(next.occupancyConfidence, 'unavailable')
    assert.equal(next.providerUsageAvailable, false)
    assert.equal(next.authMethod, 'account')
    assert.equal(next.transportMode, 'codex_app_server_chatgpt')
  })
})

test('useChatStore recordUsage replaces stale pre-compaction occupancy with verified post-compaction thread context', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread_compaction_refresh_verified_live')
    api.recordUsage({
      threadId: 'thread_compaction_refresh_verified_live',
      turnId: 'turn_compaction_refresh_verified_before',
      usage: { inputTokens: 10, outputTokens: 20, reasoningTokens: 5, totalTokens: 35 },
      rollingInputTokens: 100,
      rollingOutputTokens: 200,
      rollingReasoningTokens: 50,
      rollingTotalTokens: 350,
      modelLimit: 400000,
      estimatedOccupancyTokens: 180000,
      effectiveOccupancyTokens: 180000,
      contextOccupancyTokens: 180000,
      contextRemainingTokens: 220000,
      occupancySource: 'estimated_history',
      occupancyConfidence: 'calibrated_estimate',
    })

    api.recordUsage({
      threadId: 'thread_compaction_refresh_verified_live',
      turnId: 'turn_compaction_refresh_verified_after',
      usage: {},
      compactionStrategy: 'codex_thread_compaction',
      compactionScope: 'thread_reset',
      compactionSource: 'provider',
      usageRefreshState: 'verified',
      modelLimit: 400000,
      providerOccupancyTokens: 8000,
      effectiveOccupancyTokens: 8000,
      contextOccupancyTokens: 8000,
      threadOccupancyTokens: 8000,
      contextRemainingTokens: 392000,
      occupancySource: 'provider_thread_context',
      occupancyConfidence: 'provider_verified',
      providerUsageAvailable: true,
      authMethod: 'account',
      transportMode: 'codex_app_server_chatgpt',
    })

    const next = store.getState().contextUsage
    assert.equal(next.turnId, 'turn_compaction_refresh_verified_after')
    assert.equal(next.rollingTotalTokens, 350)
    assert.equal(next.compactionStrategy, 'codex_thread_compaction')
    assert.equal(next.compactionScope, 'thread_reset')
    assert.equal(next.compactionSource, 'provider')
    assert.equal(next.usageRefreshState, 'verified')
    assert.equal(next.providerOccupancyTokens, 8000)
    assert.equal(next.estimatedOccupancyTokens, null)
    assert.equal(next.effectiveOccupancyTokens, 8000)
    assert.equal(next.contextOccupancyTokens, 8000)
    assert.equal(next.contextRemainingTokens, 392000)
    assert.equal(next.occupancySource, 'provider_thread_context')
    assert.equal(next.occupancyConfidence, 'provider_verified')
    assert.equal(next.providerUsageAvailable, true)
    assert.equal(next.authMethod, 'account')
    assert.equal(next.transportMode, 'codex_app_server_chatgpt')
  })
})

test('useChatStore hydrateFromTimeline keeps coalesced compaction activity and verified usage refresh aligned after reload', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread_reload_compaction_verified')
    api.hydrateFromTimeline([
      {
        eventId: 1,
        createdAt: 1_000,
        kind: 'openai_compaction_event',
        turnId: 'turn_reload_compaction_verified',
        role: 'system',
        content: 'OpenAI compaction requested.',
        meta: {
          activityId: 'openai_compaction:thread_reload_compaction_verified:turn_reload_compaction_verified:manual:codex_thread_compaction',
          threadId: 'thread_reload_compaction_verified',
          turnId: 'turn_reload_compaction_verified',
          providerId: 'openai',
          model: 'gpt-5.4',
          status: 'requested',
          mode: 'manual',
          reason: 'manual_compaction_requested',
          selectedCompactionMode: 'codex_thread_compaction',
          candidateCompactionModes: ['codex_thread_compaction', 'local_summary'],
          compactionEventType: 'codex_thread_compaction',
          compactionEventPhase: 'running',
          compactionEventOccurred: false,
          usageRefreshState: 'recalculating',
        },
      },
      {
        eventId: 2,
        createdAt: 1_010,
        kind: 'openai_compaction_event',
        turnId: 'turn_reload_compaction_verified',
        role: 'system',
        content: 'OpenAI compaction applied.',
        meta: {
          activityId: 'openai_compaction:thread_reload_compaction_verified:turn_reload_compaction_verified:manual:codex_thread_compaction',
          threadId: 'thread_reload_compaction_verified',
          turnId: 'turn_reload_compaction_verified',
          providerId: 'openai',
          model: 'gpt-5.4',
          status: 'applied',
          mode: 'manual',
          reason: 'compacted',
          selectedCompactionMode: 'codex_thread_compaction',
          candidateCompactionModes: ['codex_thread_compaction', 'local_summary'],
          compactionEventType: 'codex_thread_compaction',
          compactionEventPhase: 'resumed_after',
          compactionEventOccurred: true,
          compactionId: 'cmp_reload_verified_1',
          usageRefreshState: 'verified',
        },
      },
      {
        eventId: 3,
        createdAt: 1_020,
        kind: 'chat_usage',
        turnId: 'turn_reload_compaction_verified',
        role: 'system',
        content: 'usage after compaction refresh',
        meta: {
          threadId: 'thread_reload_compaction_verified',
          turnId: 'turn_reload_compaction_verified',
          usage: {},
          rollingTotalTokens: 350,
          modelLimit: 400000,
          compactionStrategy: 'codex_thread_compaction',
          compactionScope: 'thread_reset',
          compactionSource: 'provider',
          usageRefreshState: 'verified',
          providerOccupancyTokens: 8000,
          effectiveOccupancyTokens: 8000,
          contextOccupancyTokens: 8000,
          threadOccupancyTokens: 8000,
          contextRemainingTokens: 392000,
          occupancySource: 'provider_thread_context',
          occupancyConfidence: 'provider_verified',
          providerUsageAvailable: true,
          authMethod: 'account',
          transportMode: 'codex_app_server_chatgpt',
        },
      },
    ], { threadId: 'thread_reload_compaction_verified' })

    const next = store.getState()
    const turn = next.liveExecution.turnsById.turn_reload_compaction_verified
    assert.ok(turn)
    assert.equal(
      turn.eventOrder.includes(
        'activity:openai_compaction:thread_reload_compaction_verified:turn_reload_compaction_verified:manual:codex_thread_compaction',
      ),
      true,
    )
    const event = turn.eventsById['activity:openai_compaction:thread_reload_compaction_verified:turn_reload_compaction_verified:manual:codex_thread_compaction']
    assert.ok(event)
    assert.equal(event.status, 'done')
    assert.equal(String(event?.activity?.compactionMilestoneTitle || ''), 'Context compacted before the next turn')

    assert.equal(next.contextUsage.turnId, 'turn_reload_compaction_verified')
    assert.equal(next.contextUsage.rollingTotalTokens, 350)
    assert.equal(next.contextUsage.compactionStrategy, 'codex_thread_compaction')
    assert.equal(next.contextUsage.compactionScope, 'thread_reset')
    assert.equal(next.contextUsage.compactionSource, 'provider')
    assert.equal(next.contextUsage.usageRefreshState, 'verified')
    assert.equal(next.contextUsage.contextOccupancyTokens, 8000)
    assert.equal(next.contextUsage.contextRemainingTokens, 392000)
    assert.equal(next.contextUsage.occupancySource, 'provider_thread_context')
    assert.equal(next.contextUsage.occupancyConfidence, 'provider_verified')
  })
})

test('buildContextMeterUsage subtracts existing occupancy when backfilling model limit from manifest', () => {
  const nextUsage = buildContextMeterUsage({
    contextOccupancyTokens: 1200,
    rollingTotalTokens: 85000,
    source: 'estimated',
  }, {
    contextWindowTokens: 400000,
    contextWindowSource: 'verified_fallback',
    contextWindowProvenance: 'verified_fallback',
    contextWindowPrecision: 'verified_fallback',
  })

  assert.equal(nextUsage.modelLimit, 400000)
  assert.equal(nextUsage.contextOccupancyTokens, 1200)
  assert.equal(nextUsage.contextRemainingTokens, 398800)
  assert.equal(nextUsage.remainingTokens, 398800)
  assert.equal(nextUsage.emptyThreadContextLeftFallback, false)
})

test('buildContextMeterUsage treats explicit zero occupancy as available when backfilling the limit', () => {
  const nextUsage = buildContextMeterUsage({
    contextOccupancyTokens: 0,
  }, {
    contextWindowTokens: 400000,
  })

  assert.equal(nextUsage.modelLimit, 400000)
  assert.equal(nextUsage.contextOccupancyTokens, 0)
  assert.equal(nextUsage.contextRemainingTokens, 400000)
  assert.equal(nextUsage.occupancyAvailable, true)
  assert.equal(nextUsage.emptyThreadContextLeftFallback, false)
})

test('buildContextMeterUsage marks only truly empty threads for the full-ring fallback when occupancy telemetry is missing', () => {
  const emptyThreadUsage = buildContextMeterUsage({}, {
    contextWindowTokens: 400000,
  }, {
    threadIsEmpty: true,
  })
  const occupiedThreadUsage = buildContextMeterUsage({}, {
    contextWindowTokens: 400000,
  }, {
    threadIsEmpty: false,
  })

  assert.equal(emptyThreadUsage.modelLimit, 400000)
  assert.equal(emptyThreadUsage.contextRemainingTokens, 400000)
  assert.equal(emptyThreadUsage.occupancyAvailable, false)
  assert.equal(emptyThreadUsage.emptyThreadContextLeftFallback, true)
  assert.equal(occupiedThreadUsage.emptyThreadContextLeftFallback, false)
})

test('buildContextMeterUsage marks OpenAI account context usage as a thread-local estimate', () => {
  const nextUsage = buildContextMeterUsage({
    modelLimit: 400000,
    contextOccupancyTokens: 2200,
    contextRemainingTokens: 397800,
    source: 'verified_fallback',
    limitProvenance: 'verified_fallback',
    limitPrecision: 'verified_fallback',
  }, null, {
    accountThreadEstimate: true,
  })

  assert.equal(nextUsage.source, 'account_thread_local_estimate')
  assert.equal(nextUsage.limitProvenance, 'account_thread_local_estimate')
  assert.equal(nextUsage.limitPrecision, 'estimated')
  assert.equal(nextUsage.occupancySource, 'thread_local_estimate')
  assert.equal(nextUsage.providerUsageAvailable, false)
  assert.equal(nextUsage.authMethod, 'account')
})

test('buildContextMeterUsage preserves provider-backed OpenAI account thread context when it is explicit', () => {
  const nextUsage = buildContextMeterUsage({
    modelLimit: 8192,
    contextOccupancyTokens: 5120,
    effectiveOccupancyTokens: 5120,
    estimatedOccupancyTokens: 144,
    providerOccupancyTokens: 5120,
    contextRemainingTokens: 3072,
    occupancySource: 'provider_thread_context',
    occupancyConfidence: 'provider_verified',
    providerUsageAvailable: true,
    authMethod: 'account',
  }, null, {
    accountThreadEstimate: true,
  })

  assert.equal(nextUsage.contextOccupancyTokens, 5120)
  assert.equal(nextUsage.effectiveOccupancyTokens, 5120)
  assert.equal(nextUsage.providerOccupancyTokens, 5120)
  assert.equal(nextUsage.contextRemainingTokens, 3072)
  assert.equal(nextUsage.occupancySource, 'provider_thread_context')
  assert.equal(nextUsage.occupancyConfidence, 'provider_verified')
  assert.equal(nextUsage.providerUsageAvailable, true)
})

test('useChatStore hydrateFromTimeline seeds per-thread rolling usage totals for later incremental updates', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread_seeded')
    api.hydrateFromTimeline([
      {
        eventId: 1,
        createdAt: Date.now(),
        kind: 'chat_usage',
        turnId: 'turn_1',
        meta: {
          threadId: 'thread_seeded',
          turnId: 'turn_1',
          usage: { inputTokens: 120, outputTokens: 80, reasoningTokens: 25, totalTokens: 225 },
          rollingInputTokens: 1000,
          rollingOutputTokens: 2000,
          rollingReasoningTokens: 300,
          rollingTotalTokens: 3300,
          modelLimit: 128000,
          contextOccupancyTokens: 9000,
          contextRemainingTokens: 119000,
          source: 'provider',
        },
      },
    ], { threadId: 'thread_seeded' })

    let nextState = store.getState()
    assert.deepEqual(nextState.threadUsageTotals.thread_seeded, {
      inputTokens: 1000,
      outputTokens: 2000,
      reasoningTokens: 300,
      totalTokens: 3300,
    })

    api.recordUsage({
      threadId: 'thread_seeded',
      turnId: 'turn_2',
      usage: { inputTokens: 10, outputTokens: 20, reasoningTokens: 5, totalTokens: 35 },
      modelLimit: 128000,
      contextOccupancyTokens: 9035,
      contextRemainingTokens: 118965,
      source: 'provider',
    })

    nextState = store.getState()
    assert.equal(nextState.contextUsage.rollingInputTokens, 1010)
    assert.equal(nextState.contextUsage.rollingOutputTokens, 2020)
    assert.equal(nextState.contextUsage.rollingReasoningTokens, 305)
    assert.equal(nextState.contextUsage.rollingTotalTokens, 3335)
    assert.deepEqual(nextState.threadUsageTotals.thread_seeded, {
      inputTokens: 1010,
      outputTokens: 2020,
      reasoningTokens: 305,
      totalTokens: 3335,
    })
  })
})

test('useChatStore recordUsage accepts occupancy-only account estimates without provider token usage', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread_account_usage')
    api.recordUsage({
      threadId: 'thread_account_usage',
      turnId: 'turn_account_usage',
      usage: {},
      modelLimit: 400000,
      contextOccupancyTokens: 16000,
      contextRemainingTokens: 384000,
      source: 'account_thread_local_estimate',
      limitProvenance: 'account_thread_local_estimate',
      limitPrecision: 'estimated',
      occupancySource: 'thread_local_estimate',
      providerUsageAvailable: false,
      authMethod: 'account',
      transportMode: 'codex_app_server_chatgpt',
    })

    const next = store.getState().contextUsage
    assert.equal(next.threadId, 'thread_account_usage')
    assert.equal(next.contextOccupancyTokens, 16000)
    assert.equal(next.contextRemainingTokens, 384000)
    assert.equal(next.totalTokens, 0)
    assert.equal(next.limitProvenance, 'account_thread_local_estimate')
    assert.equal(next.occupancySource, 'thread_local_estimate')
    assert.equal(next.providerUsageAvailable, false)
    assert.equal(next.authMethod, 'account')
    assert.equal(next.transportMode, 'codex_app_server_chatgpt')
  })
})

test('useChatStore recordUsage does not lower account occupancy within one bridge compaction generation', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread_account_monotonic')
    api.recordUsage({
      threadId: 'thread_account_monotonic',
      turnId: 'turn_account_1',
      authMethod: 'account',
      accountBridgeThreadId: 'bridge_account_1',
      contextCompactionGeneration: 0,
      modelLimit: 200000,
      providerOccupancyTokens: 80000,
      effectiveOccupancyTokens: 80000,
      contextOccupancyTokens: 80000,
      contextRemainingTokens: 120000,
      occupancySource: 'provider_thread_context',
      occupancyConfidence: 'provider_verified',
    })

    api.recordUsage({
      threadId: 'thread_account_monotonic',
      turnId: 'turn_account_2',
      authMethod: 'account',
      accountBridgeThreadId: 'bridge_account_1',
      contextCompactionGeneration: 0,
      modelLimit: 200000,
      providerOccupancyTokens: 70000,
      effectiveOccupancyTokens: 70000,
      contextOccupancyTokens: 70000,
      contextRemainingTokens: 130000,
      occupancySource: 'provider_thread_context',
      occupancyConfidence: 'provider_verified',
    })

    let next = store.getState().contextUsage
    assert.equal(next.contextOccupancyTokens, 80000)
    assert.equal(next.contextRemainingTokens, 120000)
    assert.equal(next.accountBridgeThreadId, 'bridge_account_1')
    assert.equal(next.contextCompactionGeneration, 0)
    assert.equal(next.contextUsageAnomaly, 'account_context_usage_regression_without_compaction')

    api.recordUsage({
      threadId: 'thread_account_monotonic',
      turnId: 'turn_account_3',
      authMethod: 'account',
      accountBridgeThreadId: 'bridge_account_1',
      contextCompactionGeneration: 1,
      modelLimit: 200000,
      providerOccupancyTokens: 10000,
      effectiveOccupancyTokens: 10000,
      contextOccupancyTokens: 10000,
      contextRemainingTokens: 190000,
      occupancySource: 'provider_thread_context',
      occupancyConfidence: 'provider_verified',
    })

    next = store.getState().contextUsage
    assert.equal(next.contextOccupancyTokens, 10000)
    assert.equal(next.contextRemainingTokens, 190000)
    assert.equal(next.contextCompactionGeneration, 1)
    assert.equal(next.contextUsageAnomaly, '')
  })
})

test('timeline hydration does not synthesize an account context reset from a lower same-generation sample', () => {
  const now = Date.now()
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 201,
      createdAt: now,
      kind: 'chat_usage',
      turnId: 'turn_account_hydrate_1',
      meta: {
        threadId: 'thread_account_hydrate',
        turnId: 'turn_account_hydrate_1',
        authMethod: 'account',
        accountBridgeThreadId: 'bridge_account_hydrate',
        contextCompactionGeneration: 0,
        modelLimit: 200000,
        providerOccupancyTokens: 80000,
        effectiveOccupancyTokens: 80000,
        contextOccupancyTokens: 80000,
        contextRemainingTokens: 120000,
        occupancySource: 'provider_thread_context',
        occupancyConfidence: 'provider_verified',
      },
    },
    {
      eventId: 202,
      createdAt: now + 1,
      kind: 'chat_usage',
      turnId: 'turn_account_hydrate_2',
      meta: {
        threadId: 'thread_account_hydrate',
        turnId: 'turn_account_hydrate_2',
        authMethod: 'account',
        accountBridgeThreadId: 'bridge_account_hydrate',
        contextCompactionGeneration: 0,
        modelLimit: 200000,
        providerOccupancyTokens: 70000,
        effectiveOccupancyTokens: 70000,
        contextOccupancyTokens: 70000,
        contextRemainingTokens: 130000,
        occupancySource: 'provider_thread_context',
        occupancyConfidence: 'provider_verified',
      },
    },
  ])

  assert.equal(mapped.contextUsage.contextOccupancyTokens, 80000)
  assert.equal(mapped.contextUsage.contextRemainingTokens, 120000)
  assert.equal(mapped.contextUsage.contextUsageAnomaly, 'account_context_usage_regression_without_compaction')
})

test('timeline hydration ignores account usage from a different bridge without a provider-session boundary', () => {
  const now = Date.now()
  const usageMeta = {
    threadId: 'thread_account_bridge_scope',
    authMethod: 'account',
    contextCompactionGeneration: 0,
    modelLimit: 200000,
    occupancySource: 'provider_thread_context',
    occupancyConfidence: 'provider_verified',
  }
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 203,
      createdAt: now,
      kind: 'chat_usage',
      turnId: 'turn_account_bridge_1',
      meta: {
        ...usageMeta,
        turnId: 'turn_account_bridge_1',
        accountBridgeThreadId: 'bridge_account_active',
        providerOccupancyTokens: 80000,
        effectiveOccupancyTokens: 80000,
        contextOccupancyTokens: 80000,
        contextRemainingTokens: 120000,
      },
    },
    {
      eventId: 204,
      createdAt: now + 1,
      kind: 'chat_usage',
      turnId: 'turn_account_bridge_stale',
      meta: {
        ...usageMeta,
        turnId: 'turn_account_bridge_stale',
        accountBridgeThreadId: 'bridge_account_stale',
        providerOccupancyTokens: 90000,
        effectiveOccupancyTokens: 90000,
        contextOccupancyTokens: 90000,
        contextRemainingTokens: 110000,
      },
    },
  ])

  assert.equal(mapped.contextUsage.accountBridgeThreadId, 'bridge_account_active')
  assert.equal(mapped.contextUsage.contextOccupancyTokens, 80000)
  assert.equal(mapped.contextUsage.contextUsageAnomaly, 'account_context_usage_stale_bridge')
  assert.equal(mapped.contextUsage.rejectedAccountBridgeThreadId, 'bridge_account_stale')
})

test('useChatStore addUserMessage keeps attachment parts in timeline entries', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.addUserMessage([
      { type: 'text', text: 'See attachment' },
      { type: 'image', image: 'R0lGODlhAQABAIAAAAUEBA==', mediaType: 'image/png' },
    ])

    const nextState = store.getState()
    assert.equal(nextState.timeline.length, 1)
    const first = nextState.timeline[0]
    assert.equal(first.kind, 'message')
    assert.equal(first.message.role, 'user')
    assert.equal(Array.isArray(first.message.content), true)
    assert.equal(first.message.content.length, 2)
    assert.equal(first.message.content[1].type, 'image')
  })
})

test('useChatStore hydrateFromTimeline keeps write conflicts deduped across live and persisted state', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread_conflict')
    api.pushWriteConflict({
      threadId: 'thread_conflict',
      turnId: 'turn_conflict',
      toolName: 'write_file',
      filePath: 'calculator.py',
      newRevId: 'rev_new',
      prevRevId: 'rev_prev',
      conflictBaseRevId: 'rev_base',
      conflictActualRevId: 'rev_actual',
      detectedAt: 2_000,
    })

    api.hydrateFromTimeline([
      {
        eventId: 99,
        createdAt: 2_000,
        kind: 'write_conflict',
        turnId: 'turn_conflict',
        meta: {
          threadId: 'thread_conflict',
          turnId: 'turn_conflict',
          toolName: 'write_file',
          filePath: 'calculator.py',
          newRevId: 'rev_new',
          prevRevId: 'rev_prev',
          conflictBaseRevId: 'rev_base',
          conflictActualRevId: 'rev_actual',
          detectedAt: 2_000,
        },
      },
    ], { threadId: 'thread_conflict' })

    let next = store.getState()
    assert.equal(next.writeConflicts.length, 1)
    assert.equal(next.writeConflicts[0]?.id, 'write_conflict:thread_conflict|turn_conflict|calculator.py|rev_new|rev_prev|rev_base|rev_actual')

    api.hydrateFromTimeline([
      {
        eventId: 99,
        createdAt: 2_000,
        kind: 'write_conflict',
        turnId: 'turn_conflict',
        meta: {
          threadId: 'thread_conflict',
          turnId: 'turn_conflict',
          toolName: 'write_file',
          filePath: 'calculator.py',
          newRevId: 'rev_new',
          prevRevId: 'rev_prev',
          conflictBaseRevId: 'rev_base',
          conflictActualRevId: 'rev_actual',
          detectedAt: 2_000,
        },
      },
    ], { threadId: 'thread_conflict' })

    next = store.getState()
    assert.equal(next.writeConflicts.length, 1)
  })
})

test('useChatStore finalizeMessage keeps addom_plan prose literal without recreating renderer plan state', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    const assistantId = api.addAssistantPlaceholder()
    api.finalizeMessage(assistantId, [
      'Planning update',
      '```addom_plan',
      JSON.stringify({
        summary: 'Preserve OpenAI first.',
        questions: [{
          id: 'q_scope',
          text: 'What provider should lead?',
          choices: ['keep OpenAI', 'stay provider agnostic'],
        }],
        options: [{
          id: 'opt_a',
          title: 'OpenAI first',
          description: 'Start with OpenAI continuity surfaces.',
          recommended: true,
        }],
        requests: [{
          id: 'req_1',
          type: 'artifact_review',
          reason: 'Inspect compaction modules',
        }],
      }, null, 2),
      '```',
    ].join('\n'))

    const nextState = store.getState()
    const message = nextState.messages.find((entry) => entry.id === assistantId)
    assert.ok(message)
    assert.match(String(message?.content || ''), /```addom_plan/)
    assert.equal(Object.hasOwn(nextState, 'planState'), false)
    assert.equal(nextState.legacyPlanStateMigrationCandidate, null)
  })
})

test('live finalizeMessage and hydrated assistant_message share canonical final-document identity', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread_final_document')
    const assistantId = api.addAssistantPlaceholder({ threadId: 'thread_final_document' })
    const authoritativeFinalDocument = {
      schemaVersion: 1,
      threadId: 'thread_final_document',
      turnId: 'turn_final_document',
      messageId: assistantId,
      ownership: 'final-document',
      text: 'Alpha\nBeta\n',
      parts: [
        {
          threadId: 'thread_final_document',
          turnId: 'turn_final_document',
          messageId: assistantId,
          partId: `${assistantId}:final-document:2`,
          appendOrder: 2,
          sequence: 77,
          status: 'completed',
          ownership: 'final-document',
          kind: 'markdown',
          text: 'Beta\n',
        },
        {
          threadId: 'thread_final_document',
          turnId: 'turn_final_document',
          messageId: assistantId,
          partId: `${assistantId}:final-document:1`,
          appendOrder: 1,
          sequence: 41,
          status: 'completed',
          ownership: 'final-document',
          kind: 'markdown',
          text: 'Alpha\n',
        },
      ],
    }

    api.markStreamStarted(assistantId, {
      threadId: 'thread_final_document',
      turnId: 'turn_final_document',
      startedAt: 1_000,
    })
    api.finalizeMessage(assistantId, 'Alpha\nBeta\n', {
      threadId: 'thread_final_document',
      turnId: 'turn_final_document',
      providerHistoryParts: [
        { type: 'text', appendOrder: 2, text: 'Wrong beta\n' },
        { type: 'reasoning', text: 'Ignore me.' },
        { type: 'text', appendOrder: 1, text: 'Wrong alpha\n' },
      ],
      finalDocument: authoritativeFinalDocument,
    })

    const liveMessage = store.getState().messages.find((message) => message.id === assistantId)
    assert.ok(liveMessage)

    const hydrated = mapTimelineFromPersistedEvents([
      {
        eventId: 401,
        createdAt: 2_000,
        kind: 'assistant_message',
        turnId: 'turn_final_document',
        content: 'Alpha\nBeta\n',
        meta: {
          threadId: 'thread_final_document',
          assistantMessageId: assistantId,
          providerHistoryParts: [
            { type: 'text', appendOrder: 2, text: 'Different beta\n' },
            { type: 'reasoning', text: 'Still ignore me.' },
            { type: 'text', appendOrder: 1, text: 'Different alpha\n' },
          ],
          finalDocument: authoritativeFinalDocument,
        },
      },
    ])

    const hydratedMessage = hydrated.messages.find((message) => message.id === assistantId)
    assert.ok(hydratedMessage)
    assert.deepEqual(hydratedMessage.finalDocument, liveMessage.finalDocument)
    assert.deepEqual(hydratedMessage.finalDocument?.parts?.map((part) => part.partId), [
      `${assistantId}:final-document:1`,
      `${assistantId}:final-document:2`,
    ])
    assert.deepEqual(hydratedMessage.finalDocument?.parts?.map((part) => part.text), [
      'Alpha\n',
      'Beta\n',
    ])
  })
})

test('hydration ignores non-authoritative finalDocument payloads when assistantMessageId is missing', () => {
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 987,
      createdAt: 2_000,
      kind: 'assistant_message',
      turnId: 'turn_legacy_document',
      content: 'Legacy full text.',
      meta: {
        threadId: 'thread_legacy_document',
        providerHistoryParts: [
          { type: 'text', appendOrder: 1, text: 'Provider history override.' },
        ],
        finalDocument: {
          parts: [
            { appendOrder: 1, partId: 'bad-part', text: 'Injected document.' },
          ],
        },
      },
    },
  ])

  const hydratedMessage = mapped.messages.find((message) => message.role === 'assistant')
  assert.ok(hydratedMessage)
  assert.equal(hydratedMessage.id, 'event:987')
  assert.equal(hydratedMessage.finalDocument?.text, 'Legacy full text.')
  assert.deepEqual(hydratedMessage.finalDocument?.parts?.map((part) => ({
    partId: part.partId,
    text: part.text,
  })), [
    {
      partId: 'event:987:final-document:1',
      text: 'Legacy full text.',
    },
  ])
})

test('useChatStore persist merge retains exact and custom selectedModel ids without legacy remaps', async () => {
  await withChatStore(async ({ store }) => {
    const merge = store.persist?.getOptions?.().merge
    assert.equal(typeof merge, 'function')

    const currentState = store.getState()

    const retainedGrok = merge({
      selectedProvider: 'grok',
      selectedModel: 'grok-4.3',
    }, currentState)
    assert.equal(retainedGrok.selectedProvider, 'grok')
    assert.equal(retainedGrok.selectedModel, 'grok-4.3')

    const retainedMistral = merge({
      selectedProvider: 'mistral',
      selectedModel: 'mistral-medium-2604',
    }, currentState)
    assert.equal(retainedMistral.selectedModel, 'mistral-medium-2604')

    const retainedGemini = merge({
      selectedProvider: 'gemini',
      selectedModel: 'gemini-3.5-flash',
    }, currentState)
    assert.equal(retainedGemini.selectedModel, 'gemini-3.5-flash')

    const removedLegacyModel = merge({
      selectedProvider: 'grok',
      selectedModel: 'grok-4-0709',
    }, currentState)
    assert.equal(removedLegacyModel.selectedModel, 'grok-4-0709')

    const unknownCustom = merge({
      selectedProvider: 'openai',
      selectedModel: 'my-custom-model-x',
    }, currentState)
    assert.equal(unknownCustom.selectedModel, 'my-custom-model-x')
  })
})

test('useChatStore keeps processing mode isolated and persisted per thread', async () => {
  await withChatStore(async ({ store }) => {
    store.getState().setActiveThread('thread-fast')
    store.getState().setProcessingMode('fast')
    assert.equal(store.getState().processingMode, 'fast')

    store.getState().setActiveThread('thread-standard')
    assert.equal(store.getState().processingMode, 'standard')
    store.getState().setProcessingMode('standard')

    store.getState().setActiveThread('thread-fast')
    assert.equal(store.getState().processingMode, 'fast')

    const persistOptions = store.persist?.getOptions?.()
    const persisted = persistOptions.partialize(store.getState())
    assert.equal(persisted.processingModeByThreadId['thread-fast'], 'fast')
    assert.equal(persisted.processingModeByThreadId['thread-standard'], 'standard')

    const merged = persistOptions.merge(persisted, store.getState())
    assert.equal(merged.processingModeByThreadId['thread-fast'], 'fast')
  })
})

test('useChatStore pushToolActivity caps retained tool entries and appends timeline tool rows', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    for (let i = 0; i < 505; i += 1) {
      api.pushToolActivity({
        id: `tool_${i}`,
        type: 'status',
        label: `Step ${i}`,
        detail: `Detail ${i}`,
      })
    }

    const next = store.getState()
    assert.equal(next.toolActivity.length, 500)
    assert.equal(next.toolActivity[0]?.id, 'tool_5')
    assert.equal(next.toolActivity.at(-1)?.id, 'tool_504')
    const timelineRow = next.timeline.at(-1)
    assert.equal(timelineRow?.kind, 'tool')
    assert.equal(timelineRow?.activity?.id, 'tool_504')
  })
})

test('useChatStore pushToolActivity coalesces updates with matching id when requested', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.pushToolActivity({
      id: 'provider_tool_input:turn-1:call-1',
      type: 'provider_tool',
      label: 'Provider tool input: tool',
      detail: '{',
      coalesce: true,
    })
    api.pushToolActivity({
      id: 'provider_tool_input:turn-1:call-1',
      type: 'provider_tool',
      label: 'Provider tool input: tool',
      detail: '{"path":"todo_app.py"}',
      coalesce: true,
    })

    const next = store.getState()
    assert.equal(next.toolActivity.length, 1)
    assert.equal(next.toolActivity[0]?.id, 'provider_tool_input:turn-1:call-1')
    assert.equal(next.toolActivity[0]?.detail, '{"path":"todo_app.py"}')
    const toolRows = next.timeline.filter((row) => row?.kind === 'tool')
    assert.equal(toolRows.length, 1)
    assert.equal(toolRows[0]?.activity?.detail, '{"path":"todo_app.py"}')
  })
})

test('useChatStore pushToolActivity keeps no-op coalesced updates reference-stable', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.pushToolActivity({
      id: 'provider_tool_input:turn-2:call-2',
      type: 'provider_tool',
      eventKind: 'provider_tool_status',
      turnId: 'turn-2',
      label: 'Provider tool input: tool',
      detail: 'Collecting provider tool input...',
      toolName: 'tool',
      coalesce: true,
    })

    const before = store.getState()
    api.pushToolActivity({
      id: 'provider_tool_input:turn-2:call-2',
      type: 'provider_tool',
      eventKind: 'provider_tool_status',
      turnId: 'turn-2',
      label: 'Provider tool input: tool',
      detail: 'Collecting provider tool input...',
      toolName: 'tool',
      coalesce: true,
    })

    const next = store.getState()
    assert.equal(next.toolActivity, before.toolActivity)
    assert.equal(next.timeline, before.timeline)
    assert.equal(next.liveExecution, before.liveExecution)
    assert.equal(next.toolActivity.length, 1)
    assert.equal(next.timeline.filter((row) => row?.kind === 'tool').length, 1)
  })
})

test('useChatStore keeps pending context prefixes isolated per thread', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()

    api.setActiveThread('thread_a')
    api.addUserMessage('thread A history')
    api.setPendingContextPrefix('[Context Bootstrap]\nA only')

    api.setActiveThread('thread_b')
    api.addUserMessage('thread B history')
    assert.equal(api.consumePendingContextPrefix(), null)
    api.setPendingContextPrefix('[Context Bootstrap]\nB only')

    api.setActiveThread('thread_a')
    const aPrefix = api.consumePendingContextPrefix()
    assert.match(String(aPrefix?.text || ''), /A only/)
    assert.equal(String(store.getState().messages[0]?.content || ''), 'thread A history')
    assert.equal(store.getState().messages.some((m) => String(m?.content || '') === 'thread B history'), false)

    api.setActiveThread('thread_b')
    const bPrefix = api.consumePendingContextPrefix()
    assert.match(String(bPrefix?.text || ''), /B only/)
    assert.equal(String(store.getState().messages[0]?.content || ''), 'thread B history')
    assert.equal(store.getState().messages.some((m) => String(m?.content || '') === 'thread A history'), false)
  })
})

test('executeSendMessage builds history from active thread only (no sibling-thread bleed)', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread_a')
    api.addUserMessage('A-ONLY-CONTEXT')

    api.setActiveThread('thread_b')
    api.addUserMessage('B-THREAD-HISTORY')

    let captured = null
    const sent = executeSendMessage({
      rawContent: 'B live prompt',
      selectedProvider: 'openai',
      selectedModel: 'gpt-4o-mini',
      activeThreadId: 'thread_b',
      projectFolder: '/tmp/project',
      activeProjectId: 'project_1',
      permissionMode: 'ask',
      chatMode: 'execute',
      consumePendingContextPrefix: api.consumePendingContextPrefix,
      addUserMessage: api.addUserMessage,
      setAttachedImages: () => {},
      addAssistantPlaceholder: api.addAssistantPlaceholder,
      getChatState: () => store.getState(),
      chatStream: (...args) => {
        const [, , history] = args
        captured = Array.isArray(history) ? history : null
      },
    })

    assert.equal(sent, true)
    assert.ok(Array.isArray(captured))
    const renderedHistory = JSON.stringify(captured)
    assert.match(renderedHistory, /B-THREAD-HISTORY/)
    assert.doesNotMatch(renderedHistory, /A-ONLY-CONTEXT/)
  })
})

test('executeSendMessage can target a non-projected thread without sibling-thread bleed', async () => {
  await withChatStore(async ({ store }) => {
    const api = store.getState()
    api.setActiveThread('thread_a')
    api.addUserMessage('A-ONLY-CONTEXT')

    api.setActiveThread('thread_b')
    api.addUserMessage('B-THREAD-HISTORY')
    api.setPendingContextPrefix('[Context Bootstrap]\nB only', { threadId: 'thread_b' })

    api.setActiveThread('thread_a')

    let captured = null
    const sent = executeSendMessage({
      rawContent: 'B delayed prompt',
      selectedProvider: 'openai',
      selectedModel: 'gpt-4o-mini',
      activeThreadId: 'thread_b',
      projectFolder: '/tmp/project',
      activeProjectId: 'project_1',
      permissionMode: 'ask',
      chatMode: 'execute',
      consumePendingContextPrefix: (options) => api.consumePendingContextPrefix(options),
      addUserMessage: api.addUserMessage,
      setAttachedImages: () => {},
      addAssistantPlaceholder: api.addAssistantPlaceholder,
      getChatState: () => store.getState().getThreadState('thread_b'),
      chatStream: (...args) => {
        const [, , history] = args
        captured = Array.isArray(history) ? history : null
      },
    })

    assert.equal(sent, true)
    assert.ok(Array.isArray(captured))
    const renderedHistory = JSON.stringify(captured)
    assert.match(renderedHistory, /B-THREAD-HISTORY/)
    assert.match(renderedHistory, /Context Bootstrap/)
    assert.match(renderedHistory, /B only/)
    assert.doesNotMatch(renderedHistory, /A-ONLY-CONTEXT/)
  })
})
