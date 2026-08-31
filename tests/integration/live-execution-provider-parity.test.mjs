import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveExecutionCapabilityProfile } from '../../src/common/chat/execution-capabilities.mjs'
import { reduceCanonicalExecutionEvent } from '../../src/renderer/store/chat/live-execution-canonical-reducer.mjs'
import { buildExecutionStreamItems, coalesceFragmentedCommentaryItems } from '../../src/renderer/components/chat/live-execution-stream-items.mjs'
import { mapActivityToCanonicalExecutionEvents } from '../../src/renderer/store/chat/live-execution-store-activity.mjs'
import { appendLiveExecutionReasoningEvent, createEmptyLiveExecutionState } from '../../src/renderer/store/chat/live-execution-store.mjs'

function buildTurn() {
  const events = [
    { kind: 'reasoning_chunk', turnId: 'turn-1', eventId: 'reason-1a', messageId: 'message-1', reasoningRole: 'commentary', detail: 'Checking ', emittedAt: 10 },
    { kind: 'tool_started', turnId: 'turn-1', eventId: 'start-1', sessionId: 'attempt-1', toolKind: 'command', state: 'active', detail: 'npm test', emittedAt: 20 },
    { kind: 'reasoning_chunk', turnId: 'turn-1', eventId: 'reason-1b', messageId: 'message-1', reasoningRole: 'commentary', detail: 'the workspace.', emittedAt: 25 },
    { kind: 'tool_output', turnId: 'turn-1', eventId: 'output-1', sessionId: 'attempt-1', toolKind: 'command', stream: 'stderr', state: 'active', detail: 'test failed', emittedAt: 30 },
    { kind: 'tool_result', turnId: 'turn-1', eventId: 'result-1', sessionId: 'attempt-1', toolKind: 'command', state: 'failed', detail: 'exit 1', emittedAt: 40 },
    { kind: 'reasoning_chunk', turnId: 'turn-1', eventId: 'reason-2', messageId: 'message-2', reasoningRole: 'commentary', detail: 'Retrying with the correct target.', emittedAt: 50 },
    { kind: 'tool_started', turnId: 'turn-1', eventId: 'start-2', sessionId: 'attempt-2', toolKind: 'command', state: 'active', detail: 'npm test fixed', emittedAt: 60 },
    { kind: 'tool_result', turnId: 'turn-1', eventId: 'result-2', sessionId: 'attempt-2', toolKind: 'command', state: 'succeeded', detail: 'exit 0', emittedAt: 70 },
    { kind: 'turn_state', turnId: 'turn-1', eventId: 'done', state: 'succeeded', terminal: true, emittedAt: 80 },
  ]
  const state = events.reduce(
    (current, event) => reduceCanonicalExecutionEvent(current, event),
    { turnsById: {}, turnOrder: [] },
  )
  return state.turnsById['turn-1']
}

test('all reasoning-capable provider families produce the same compact items', () => {
  const turn = buildTurn()
  const families = ['openai_account', 'openai_api', 'anthropic', 'gemini', 'cursor']
  const projections = families.map((family) => buildExecutionStreamItems(
    turn,
    resolveExecutionCapabilityProfile({ family }),
  ))

  for (const projection of projections.slice(1)) {
    assert.deepEqual(projection, projections[0])
  }
  assert.deepEqual(projections[0].map(({ kind, label, statusMark }) => ({ kind, label, statusMark })), [
    { kind: 'commentary', label: 'Checking the workspace.', statusMark: '' },
    { kind: 'tool', label: 'Failed npm test', statusMark: '×' },
    { kind: 'commentary', label: 'Retrying with the correct target.', statusMark: '' },
    { kind: 'tool', label: 'Ran npm test fixed', statusMark: '✓' },
  ])
  assert.equal(projections[0][1].expandedEvidence.outputs[0].detail, 'test failed')
  assert.equal(projections[0][1].expandedEvidence.input, 'npm test')
  assert.equal(projections[0][1].expandedEvidence.result, 'exit 1')
  assert.equal(projections[0][1].evidenceSections[0].label, 'Command')
})

test('DeepSeek provider routes expose reasoning, commentary, and tools', () => {
  const profile = resolveExecutionCapabilityProfile({ providerId: 'deepseek' })
  assert.deepEqual(profile, { reasoning: true, commentary: true, tools: true })
  const items = buildExecutionStreamItems(buildTurn(), profile)
  assert.deepEqual(items.map(({ kind, label }) => ({ kind, label })), [
    { kind: 'commentary', label: 'Checking the workspace.' },
    { kind: 'tool', label: 'Failed npm test' },
    { kind: 'commentary', label: 'Retrying with the correct target.' },
    { kind: 'tool', label: 'Ran npm test fixed' },
  ])
})

test('OpenRouter preserves commentary emitted after a completed tool', () => {
  let state = createEmptyLiveExecutionState()
  state = appendLiveExecutionReasoningEvent(state, {
    turnId: 'openrouter-commentary',
    eventId: 'commentary-1',
    messageId: 'execution_commentary:openrouter-commentary:1',
    reasoningRole: 'commentary',
    chunk: 'I will inspect README.md first.',
    emittedAt: 10,
    streamMeta: { providerId: 'openrouter' },
  })
  state = reduceCanonicalExecutionEvent(state, {
    kind: 'tool_started',
    turnId: 'openrouter-commentary',
    eventId: 'tool-start',
    sessionId: 'readme',
    toolKind: 'file_read',
    providerId: 'openrouter',
    state: 'active',
    detail: 'README.md',
    emittedAt: 20,
  })
  state = reduceCanonicalExecutionEvent(state, {
    kind: 'tool_result',
    turnId: 'openrouter-commentary',
    eventId: 'tool-done',
    sessionId: 'readme',
    toolKind: 'file_read',
    providerId: 'openrouter',
    state: 'succeeded',
    emittedAt: 30,
  })
  state = appendLiveExecutionReasoningEvent(state, {
    turnId: 'openrouter-commentary',
    eventId: 'commentary-2',
    messageId: 'execution_commentary:openrouter-commentary:2',
    reasoningRole: 'commentary',
    chunk: 'README.md documents npm run start. I will compare package.json next.',
    emittedAt: 40,
    streamMeta: { providerId: 'openrouter' },
  })

  const items = buildExecutionStreamItems(
    state.turnsById['openrouter-commentary'],
    resolveExecutionCapabilityProfile({ providerId: 'openrouter' }),
    { collapseSettled: false },
  )
  assert.deepEqual(items.map(({ kind, label }) => ({ kind, label })), [
    { kind: 'commentary', label: 'I will inspect README.md first.' },
    { kind: 'tool', label: 'Read README.md' },
    { kind: 'commentary', label: 'README.md documents npm run start. I will compare package.json next.' },
  ])
})

test('execution projection orders asynchronously flushed items by source event time', () => {
  let state = reduceCanonicalExecutionEvent({ turnsById: {}, turnOrder: [] }, {
    kind: 'reasoning_chunk', turnId: 'flush-race', eventId: 'commentary',
    messageId: 'execution_commentary:flush-race:1', reasoningRole: 'commentary',
    detail: 'I will inspect README.md.', emittedAt: 20,
  })
  state = reduceCanonicalExecutionEvent(state, {
    kind: 'reasoning_chunk', turnId: 'flush-race', eventId: 'reasoning',
    messageId: 'execution_reasoning:flush-race:0', reasoningRole: 'reasoning',
    detail: 'Planning reading sequence', emittedAt: 10,
  })
  state = reduceCanonicalExecutionEvent(state, {
    kind: 'tool_started', turnId: 'flush-race', eventId: 'tool', sessionId: 'readme',
    toolKind: 'file_read', detail: 'README.md', emittedAt: 30,
  })
  state = reduceCanonicalExecutionEvent(state, {
    kind: 'tool_result', turnId: 'flush-race', eventId: 'tool-done', sessionId: 'readme',
    toolKind: 'file_read', state: 'succeeded', emittedAt: 31,
  })

  const items = buildExecutionStreamItems(
    state.turnsById['flush-race'],
    { reasoning: true, commentary: true, tools: true },
    { collapseSettled: false },
  )
  assert.deepEqual(items.map(({ kind, label }) => ({ kind, label })), [
    { kind: 'reasoning', label: 'Planning reading sequence' },
    { kind: 'commentary', label: 'I will inspect README.md.' },
    { kind: 'tool', label: 'Read README.md' },
  ])
})

test('cursor hides persisted answer commentary while keeping thinking and tools visible', () => {
  const turn = {
    turnId: 'turn-cursor',
    status: 'done',
    providerId: 'cursor',
    itemOrder: [
      'reasoning:execution_reasoning:turn-cursor',
      'reasoning:execution_commentary:turn-cursor',
      'tool:step-1',
    ],
    sessionsById: {
      'step-1': { id: 'step-1', toolKind: 'tool', state: 'succeeded', inputDetail: '', detail: '', outputs: [] },
    },
    reasoningById: {
      'execution_reasoning:turn-cursor': {
        id: 'execution_reasoning:turn-cursor',
        role: 'commentary',
        detail: 'Checking the existing calculator implementation.',
      },
      'execution_commentary:turn-cursor': {
        id: 'execution_commentary:turn-cursor',
        role: 'commentary',
        detail: 'The calculator already exists and all tests pass.',
      },
    },
  }
  const cursorItems = buildExecutionStreamItems(turn, resolveExecutionCapabilityProfile({ family: 'cursor' }))
  assert.deepEqual(cursorItems.map(({ kind, label }) => ({ kind, label })), [
    { kind: 'commentary', label: 'Checking the existing calculator implementation.' },
    { kind: 'tool', label: 'Ran tool' },
  ])
})

test('tools-only profiles omit reasoning without changing tool lifecycle rendering', () => {
  const items = buildExecutionStreamItems(
    buildTurn(),
    resolveExecutionCapabilityProfile({ family: 'generic' }),
  )
  assert.deepEqual(items.map(({ label, statusMark }) => ({ label, statusMark })), [
    { label: 'Failed npm test', statusMark: '×' },
    { label: 'Ran npm test fixed', statusMark: '✓' },
  ])
})

test('tool categories use concise active and completed labels', () => {
  const expected = {
    command: ['Running command', 'Ran command'],
    file_read: ['Reading file', 'Read file'],
    file_write: ['Writing file', 'Wrote file'],
    file_edit: ['Editing file', 'Edited file'],
    file_delete: ['Deleting file', 'Deleted file'],
    search: ['Searching files', 'Searched files'],
    plan: ['Updating plan', 'Updated plan'],
    web: ['Fetching page', 'Fetched page'],
    browser: ['Using browser', 'Used browser'],
    agent: ['Running agent', 'Ran agent'],
  }

  for (const [toolKind, [activeLabel, completedLabel]] of Object.entries(expected)) {
    let state = reduceCanonicalExecutionEvent({ turnsById: {}, turnOrder: [] }, {
      kind: 'tool_started', turnId: toolKind, eventId: `${toolKind}-start`,
      sessionId: `${toolKind}-session`, toolKind, state: 'active', emittedAt: 1,
    })
    let items = buildExecutionStreamItems(state.turnsById[toolKind], { reasoning: true, commentary: true, tools: true })
    assert.equal(items[0].label, activeLabel)
    assert.equal(items[0].statusMark, '…')

    state = reduceCanonicalExecutionEvent(state, {
      kind: 'tool_result', turnId: toolKind, eventId: `${toolKind}-done`,
      sessionId: `${toolKind}-session`, toolKind, state: 'succeeded', emittedAt: 2,
    })
    items = buildExecutionStreamItems(state.turnsById[toolKind], { reasoning: true, commentary: true, tools: true })
    assert.equal(items[0].label, completedLabel)
    assert.equal(items[0].statusMark, '✓')
  }
})

test('agent labels never expose delegation planning metadata as an identity', () => {
  let state = reduceCanonicalExecutionEvent({ turnsById: {}, turnOrder: [] }, {
    kind: 'tool_started',
    turnId: 'agent-metadata',
    eventId: 'agent-start',
    sessionId: 'agent-session',
    toolKind: 'agent',
    state: 'active',
    detail: 'requested_tasks: 1 planned_tasks: 1 estimated_tokens: 1627',
    emittedAt: 1,
  })
  state = reduceCanonicalExecutionEvent(state, {
    kind: 'tool_result',
    turnId: 'agent-metadata',
    eventId: 'agent-result',
    sessionId: 'agent-session',
    toolKind: 'agent',
    state: 'succeeded',
    detail: '<delegation state="completed">...</delegation>',
    emittedAt: 2,
  })

  const items = buildExecutionStreamItems(
    state.turnsById['agent-metadata'],
    { reasoning: true, commentary: true, tools: true },
  )
  assert.equal(items[0].label, 'Ran agent')
  assert.equal(items[0].identity, '')
})

test('native tool names normalize to provider-neutral categories and preserve evidence', () => {
  const expectedKinds = {
    run_command: 'command',
    local_shell: 'command',
    read_file: 'file_read',
    list_directory: 'file_read',
    write_file: 'file_write',
    create_directory: 'file_write',
    edit_file: 'file_edit',
    apply_patch: 'file_edit',
    rename_file: 'file_edit',
    delete_file: 'file_delete',
    search_code: 'search',
    find_files: 'search',
    plan_update: 'plan',
    fetch_page: 'web',
    web_search: 'web',
    browser_action: 'browser',
    delegate_to_agents: 'agent',
  }

  for (const [toolName, toolKind] of Object.entries(expectedKinds)) {
    const [event] = mapActivityToCanonicalExecutionEvents({
      id: `${toolName}-1`, turnId: 'turn-1', stepId: `${toolName}-step`,
      type: 'executing', toolName, toolInput: { path: 'src/app.js' }, createdAt: 1,
    })
    assert.equal(event.toolKind, toolKind, toolName)
  }

  const [command] = mapActivityToCanonicalExecutionEvents({
    id: 'command-1', turnId: 'turn-1', stepId: 'command-step',
    type: 'executing', toolName: 'run_command', toolInput: { command: 'npm test' }, createdAt: 1,
  })
  assert.equal(command.detail, 'npm test')
})

const PARITY_SCENARIOS = Object.freeze({
  commentary_tool_commentary_success: [
    { kind: 'reasoning_chunk', eventId: 'r1', messageId: 'm1', reasoningRole: 'commentary', detail: 'Inspecting. ', emittedAt: 1 },
    { kind: 'tool_started', eventId: 's1', sessionId: 'a1', toolKind: 'file_read', detail: 'src/a.js', emittedAt: 2 },
    { kind: 'tool_result', eventId: 'd1', sessionId: 'a1', toolKind: 'file_read', state: 'succeeded', detail: 'read', emittedAt: 3 },
    { kind: 'reasoning_chunk', eventId: 'r2', messageId: 'm2', reasoningRole: 'commentary', detail: 'Implementing.', emittedAt: 4 },
    { kind: 'turn_state', eventId: 't1', state: 'succeeded', terminal: true, emittedAt: 5 },
  ],
  failed_retry_final_success: [
    { kind: 'tool_started', eventId: 's1', sessionId: 'a1', toolKind: 'command', detail: 'npm test', emittedAt: 1 },
    { kind: 'tool_result', eventId: 'd1', sessionId: 'a1', toolKind: 'command', state: 'failed', detail: 'exit 1', emittedAt: 2 },
    { kind: 'tool_started', eventId: 's2', sessionId: 'a2', toolKind: 'command', detail: 'npm test fixed', emittedAt: 3 },
    { kind: 'tool_result', eventId: 'd2', sessionId: 'a2', toolKind: 'command', state: 'succeeded', detail: 'exit 0', emittedAt: 4 },
    { kind: 'turn_state', eventId: 't1', state: 'succeeded', terminal: true, emittedAt: 5 },
  ],
  successful_tool_final_failure: [
    { kind: 'tool_started', eventId: 's1', sessionId: 'a1', toolKind: 'command', detail: 'build', emittedAt: 1 },
    { kind: 'tool_result', eventId: 'd1', sessionId: 'a1', toolKind: 'command', state: 'succeeded', detail: 'ok', emittedAt: 2 },
    { kind: 'turn_state', eventId: 't1', state: 'failed', terminal: true, emittedAt: 3 },
  ],
  multi_stream_output: [
    { kind: 'tool_started', eventId: 's1', sessionId: 'a1', toolKind: 'command', detail: 'build', emittedAt: 1 },
    { kind: 'tool_output', eventId: 'o1', sessionId: 'a1', toolKind: 'command', stream: 'stdout', detail: 'one', sequence: 1, emittedAt: 2 },
    { kind: 'tool_output', eventId: 'o2', sessionId: 'a1', toolKind: 'command', stream: 'stderr', detail: 'two', sequence: 2, emittedAt: 3 },
    { kind: 'tool_result', eventId: 'd1', sessionId: 'a1', toolKind: 'command', state: 'succeeded', detail: 'ok', emittedAt: 4 },
    { kind: 'turn_state', eventId: 't1', state: 'succeeded', terminal: true, emittedAt: 5 },
  ],
  create_edit_delete: [
    { kind: 'tool_started', eventId: 's1', sessionId: 'a1', toolKind: 'file_write', detail: 'a.js', emittedAt: 1 },
    { kind: 'tool_result', eventId: 'd1', sessionId: 'a1', toolKind: 'file_write', state: 'succeeded', emittedAt: 2 },
    { kind: 'file_change', eventId: 'f1', detail: 'a.js:create', state: 'succeeded', emittedAt: 3 },
    { kind: 'tool_started', eventId: 's2', sessionId: 'a2', toolKind: 'file_edit', detail: 'a.js', emittedAt: 4 },
    { kind: 'tool_result', eventId: 'd2', sessionId: 'a2', toolKind: 'file_edit', state: 'succeeded', emittedAt: 5 },
    { kind: 'file_change', eventId: 'f2', detail: 'a.js:edit', state: 'succeeded', emittedAt: 6 },
    { kind: 'tool_started', eventId: 's3', sessionId: 'a3', toolKind: 'file_delete', detail: 'a.js', emittedAt: 7 },
    { kind: 'tool_result', eventId: 'd3', sessionId: 'a3', toolKind: 'file_delete', state: 'succeeded', emittedAt: 8 },
    { kind: 'file_change', eventId: 'f3', detail: 'a.js:delete', state: 'succeeded', emittedAt: 9 },
    { kind: 'turn_state', eventId: 't1', state: 'succeeded', terminal: true, emittedAt: 10 },
  ],
  interrupted_tool: [
    { kind: 'tool_started', eventId: 's1', sessionId: 'a1', toolKind: 'command', detail: 'watch', emittedAt: 1 },
    { kind: 'turn_state', eventId: 't1', state: 'interrupted', terminal: true, emittedAt: 2 },
  ],
  warning_final_success: [
    { kind: 'diagnostic', eventId: 'w1', diagnosticSeverity: 'warning', detail: 'retryable', emittedAt: 1 },
    { kind: 'turn_state', eventId: 't1', state: 'succeeded', terminal: true, emittedAt: 2 },
  ],
})

test('deterministic execution scenarios preserve terminal authority and provider parity', () => {
  const families = ['openai_account', 'openai_api', 'anthropic', 'gemini', 'cursor']

  for (const [scenarioName, sourceEvents] of Object.entries(PARITY_SCENARIOS)) {
    const events = sourceEvents.map((event) => ({ ...event, turnId: scenarioName }))
    const state = events.reduce(
      (current, event) => reduceCanonicalExecutionEvent(current, event),
      { turnsById: {}, turnOrder: [] },
    )
    const turn = state.turnsById[scenarioName]
    const projections = families.map((family) => buildExecutionStreamItems(
      turn,
      resolveExecutionCapabilityProfile({ family }),
    ))
    for (const projection of projections.slice(1)) assert.deepEqual(projection, projections[0], scenarioName)

    const leafToolCount = projections[0].reduce((count, item) => {
      if (item.kind === 'tool') return count + 1
      if (item.kind === 'cluster') return count + (Array.isArray(item.items) ? item.items.length : 0)
      return count
    }, 0)
    assert.equal(leafToolCount, Object.keys(turn.sessionsById).length, scenarioName)
    assert.equal(Object.values(turn.sessionsById).every((session) => !['queued', 'active'].includes(session.state)), true, scenarioName)
    assert.equal(turn.status, scenarioName === 'successful_tool_final_failure' ? 'error' : (scenarioName === 'interrupted_tool' ? 'interrupted' : 'done'))
  }

  const outputEvents = PARITY_SCENARIOS.multi_stream_output.map((event) => ({ ...event, turnId: 'output' }))
  const outputState = outputEvents.reduce((state, event) => reduceCanonicalExecutionEvent(state, event), { turnsById: {}, turnOrder: [] })
  assert.deepEqual(outputState.turnsById.output.sessionsById.a1.outputs.map(({ stream, detail }) => ({ stream, detail })), [
    { stream: 'stdout', detail: 'one' },
    { stream: 'stderr', detail: 'two' },
  ])
  const commentaryEvents = PARITY_SCENARIOS.commentary_tool_commentary_success.map((event) => ({ ...event, turnId: 'commentary' }))
  const commentaryState = commentaryEvents.reduce((state, event) => reduceCanonicalExecutionEvent(state, event), { turnsById: {}, turnOrder: [] })
  assert.deepEqual(buildExecutionStreamItems(commentaryState.turnsById.commentary, { reasoning: true, commentary: true, tools: true }).map((item) => item.label), [
    'Inspecting.', 'Read a.js', 'Implementing.',
  ])
  const fileEvents = PARITY_SCENARIOS.create_edit_delete.map((event) => ({ ...event, turnId: 'files' }))
  const fileState = fileEvents.reduce((state, event) => reduceCanonicalExecutionEvent(state, event), { turnsById: {}, turnOrder: [] })
  assert.equal(Object.keys(fileState.turnsById.files.fileChangesById).length, 3)
  assert.deepEqual(Object.values(fileState.turnsById.files.sessionsById).map((session) => session.toolKind), ['file_write', 'file_edit', 'file_delete'])
})

test('coalesceFragmentedCommentaryItems merges legacy persisted token rows into one markdown row', () => {
  const items = coalesceFragmentedCommentaryItems([
    { kind: 'commentary', label: 'Rendering check passed.' },
    { kind: 'commentary', label: '**' },
    { kind: 'commentary', label: 'Rendering' },
    { kind: 'commentary', label: ' check' },
    { kind: 'commentary', label: ' passed' },
    { kind: 'commentary', label: '.**' },
  ])
  assert.deepEqual(items, [{ kind: 'commentary', label: '**Rendering check passed.**' }])
})
