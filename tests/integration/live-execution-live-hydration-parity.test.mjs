import test from 'node:test'
import assert from 'node:assert/strict'

import {
  appendLiveExecutionReasoningEvent,
  createEmptyLiveExecutionState,
  upsertLiveExecutionActivity,
} from '../../src/renderer/store/chat/live-execution-store.mjs'
import { mapTimelineFromPersistedEvents } from '../../src/renderer/store/chat/timeline-hydration.mjs'
import { mapPersistedTimelineRecordToExecutionEvents } from '../../src/renderer/store/chat/timeline-execution-event-adapter.mjs'

function project(state, turnId) {
  const turn = state.turnsById[turnId]
  return {
    status: turn.status,
    terminalState: turn.terminalState,
    itemOrder: turn.itemOrder,
    sessions: Object.values(turn.sessionsById).map((session) => ({
      id: session.id,
      toolKind: session.toolKind,
      state: session.state,
      detail: session.detail,
    })),
    reasoning: Object.values(turn.reasoningById).map((entry) => ({
      id: entry.id,
      role: entry.role,
      detail: entry.detail,
    })),
  }
}

test('persisted commentary records retain round identity in the canonical contract', () => {
  const events = mapPersistedTimelineRecordToExecutionEvents({
    eventId: 1,
    kind: 'execution_commentary_chunk',
    turnId: 'turn-1',
    content: 'Checking the workspace.',
    createdAt: 100,
    meta: { threadId: 'thread-1', round: 2 },
  })

  assert.equal(events.length, 1)
  assert.equal(events[0].kind, 'reasoning_chunk')
  assert.equal(events[0].messageId, 'execution_commentary:turn-1:2')
  assert.equal(events[0].reasoningRole, 'commentary')
})

test('persisted provider reasoning remains reasoning instead of becoming commentary', () => {
  const events = mapPersistedTimelineRecordToExecutionEvents({
    eventId: 2,
    kind: 'execution_reasoning_chunk',
    turnId: 'turn-1',
    content: 'Comparing the implementation choices.\n\nKeeping this paragraph distinct.',
    createdAt: 110,
    meta: { threadId: 'thread-1', reasoningSegment: 1, providerId: 'deepseek' },
  })

  assert.equal(events.length, 1)
  assert.equal(events[0].reasoningRole, 'reasoning')
})

test('live ingestion and timeline hydration produce equivalent canonical state', () => {
  let live = createEmptyLiveExecutionState()
  live = appendLiveExecutionReasoningEvent(live, {
    threadId: 'thread-1', turnId: 'turn-1',
    messageId: 'execution_commentary:turn-1:1', reasoningRole: 'commentary',
    chunk: 'Checking the workspace.', emittedAt: 100,
  })
  live = upsertLiveExecutionActivity(live, {
    id: 'start-1', type: 'executing', eventKind: 'tool_executing',
    threadId: 'thread-1', turnId: 'turn-1', stepId: 'step-1',
    toolName: 'run_command', label: 'Run command', createdAt: 110,
  })
  live = upsertLiveExecutionActivity(live, {
    id: 'result-1', type: 'result', eventKind: 'tool_result',
    threadId: 'thread-1', turnId: 'turn-1', stepId: 'step-1',
    toolName: 'run_command', label: 'Command failed', detail: 'exit 1',
    isError: true, createdAt: 110, finishedAt: 120,
  })
  live = appendLiveExecutionReasoningEvent(live, {
    threadId: 'thread-1', turnId: 'turn-1',
    messageId: 'execution_commentary:turn-1:2', reasoningRole: 'commentary',
    chunk: 'Retrying with the correct target.', emittedAt: 130,
  })
  live = upsertLiveExecutionActivity(live, {
    id: 'turn-1-done', type: 'turn', eventKind: 'turn_completed',
    threadId: 'thread-1', turnId: 'turn-1', turnState: 'completed',
    turnStatus: 'done', label: 'Turn completed', createdAt: 90, finishedAt: 140,
  })

  const hydrated = mapTimelineFromPersistedEvents([
    { eventId: 1, kind: 'execution_commentary_chunk', turnId: 'turn-1', content: 'Checking the workspace.', createdAt: 100, meta: { threadId: 'thread-1', round: 1 } },
    { eventId: 2, kind: 'tool_executing', turnId: 'turn-1', content: '', createdAt: 110, meta: { threadId: 'thread-1', stepId: 'step-1', toolName: 'run_command' } },
    { eventId: 3, kind: 'tool_result', turnId: 'turn-1', content: 'exit 1', createdAt: 120, meta: { threadId: 'thread-1', stepId: 'step-1', toolName: 'run_command', isError: true, finishedAt: 120 } },
    { eventId: 4, kind: 'execution_commentary_chunk', turnId: 'turn-1', content: 'Retrying with the correct target.', createdAt: 130, meta: { threadId: 'thread-1', round: 2 } },
    { eventId: 5, kind: 'turn_completed', turnId: 'turn-1', content: '', createdAt: 140, meta: { threadId: 'thread-1', turnId: 'turn-1', state: 'completed', status: 'done', finishedAt: 140 } },
  ]).liveExecution

  assert.deepEqual(project(hydrated, 'turn-1'), project(live, 'turn-1'))
})

test('token-only reasoning_done stays out of both live and hydrated execution projections', () => {
  const turnId = 'turn-openrouter-kimi-token-reasoning'
  const threadId = 'thread-openrouter-kimi-token-reasoning'
  const live = createEmptyLiveExecutionState()
  const hydrated = mapTimelineFromPersistedEvents([{
    eventId: 65396,
    kind: 'reasoning_done',
    turnId,
    content: '',
    createdAt: 100,
    meta: {
      threadId,
      assistantMessageId: 'assistant-openrouter-kimi-token-reasoning',
      providerId: 'openrouter',
      model: 'moonshotai/kimi-k2',
      round: 1,
      reasoningSegment: 0,
      full: '',
      current: '',
      reasoningTokens: 96,
    },
  }]).liveExecution

  assert.equal(live.turnsById[turnId], undefined)
  assert.equal(hydrated.turnsById[turnId], undefined)
})

test('hydration recovers terminal Kimi progress into commentary and keeps only the marked final answer', () => {
  const turnId = 'turn-kimi-terminal-progress'
  const threadId = 'thread-kimi-terminal-progress'
  const combined = `**What I will inspect**: README.md and package.json.

**Progress update after reading README.md**: Now reading package.json.

FINAL ACCEPTANCE:
- Documented commands: check and start
- Actual scripts: check and dev
- Mismatch: start is missing`
  const hydrated = mapTimelineFromPersistedEvents([
    { eventId: 1, kind: 'tool_result', turnId, content: 'README', createdAt: 100, meta: { threadId, stepId: 'readme', toolName: 'read_file' } },
    { eventId: 2, kind: 'tool_result', turnId, content: 'package', createdAt: 110, meta: { threadId, stepId: 'package', toolName: 'read_file' } },
    { eventId: 3, kind: 'reasoning_done', turnId, content: '', createdAt: 120, meta: { threadId, reasoningTokens: 359 } },
    { eventId: 4, kind: 'assistant_message', turnId, content: combined, createdAt: 130, meta: { threadId, providerId: 'openrouter', model: 'moonshotai/kimi-k2' } },
  ])

  const assistant = hydrated.messages.find((message) => message.role === 'assistant')
  assert.equal(assistant?.content, `FINAL ACCEPTANCE:
- Documented commands: check and start
- Actual scripts: check and dev
- Mismatch: start is missing`)
  const turn = hydrated.liveExecution.turnsById[turnId]
  const commentary = turn.eventOrder
    .map((eventId) => turn.eventsById[eventId])
    .filter((event) => event?.kind === 'reasoning')
    .map((event) => event.detail.trim())
  assert.deepEqual(commentary, [
    '**What I will inspect**: README.md and package.json.',
    '**Progress update after reading README.md**: Now reading package.json.',
  ])
  assert.doesNotMatch(JSON.stringify(hydrated), /reasoning tokens: 359/i)
})

test('persisted commentary chunks without round share one turn-scoped message identity', () => {
  const first = mapPersistedTimelineRecordToExecutionEvents({
    eventId: 40691,
    kind: 'execution_commentary_chunk',
    turnId: 'turn-1',
    content: 'Rendering check passed.',
    createdAt: 100,
    meta: { threadId: 'thread-1' },
  })
  const second = mapPersistedTimelineRecordToExecutionEvents({
    eventId: 40692,
    kind: 'execution_commentary_chunk',
    turnId: 'turn-1',
    content: '**',
    createdAt: 101,
    meta: { threadId: 'thread-1' },
  })

  assert.equal(first[0].messageId, 'execution_commentary:turn-1')
  assert.equal(second[0].messageId, 'execution_commentary:turn-1')
})

test('timeline hydration preserves distinct commentary deltas emitted in the same millisecond', () => {
  const hydrated = mapTimelineFromPersistedEvents([
    {
      eventId: 50434,
      kind: 'execution_commentary_chunk',
      turnId: 'turn-portuguese',
      content: 'Está alinhada com a direcção ',
      createdAt: 1_000,
      meta: { threadId: 'thread-portuguese', round: 1, emittedAt: 1_000 },
    },
    {
      eventId: 50435,
      kind: 'execution_commentary_chunk',
      turnId: 'turn-portuguese',
      content: 'apro',
      createdAt: 1_001,
      meta: { threadId: 'thread-portuguese', round: 1, emittedAt: 1_001 },
    },
    {
      eventId: 50436,
      kind: 'execution_commentary_chunk',
      turnId: 'turn-portuguese',
      content: 'vada',
      createdAt: 1_001,
      meta: { threadId: 'thread-portuguese', round: 1, emittedAt: 1_001 },
    },
    {
      eventId: 50437,
      kind: 'execution_commentary_chunk',
      turnId: 'turn-portuguese',
      content: ': pronta.',
      createdAt: 1_002,
      meta: { threadId: 'thread-portuguese', round: 1, emittedAt: 1_002 },
    },
  ]).liveExecution

  const turn = hydrated.turnsById['turn-portuguese']
  assert.equal(
    turn.reasoningById['execution_commentary:turn-portuguese:1'].detail,
    'Está alinhada com a direcção aprovada: pronta.',
  )
  assert.equal(turn.seenEventIds['persisted:50435'], true)
  assert.equal(turn.seenEventIds['persisted:50436'], true)
})

test('timeline hydration preserves same-round commentary boundaries and removes the streamed final answer', () => {
  const finalAnswer = 'Created the Northstar landing page in exactly three files.'
  const hydrated = mapTimelineFromPersistedEvents([
    {
      eventId: 1,
      kind: 'execution_commentary_chunk',
      turnId: 'turn-openai',
      content: 'I am inspecting the empty project folder first.',
      createdAt: 100,
      meta: { threadId: 'thread-openai', round: 1, providerId: 'openai' },
    },
    {
      eventId: 2,
      kind: 'tool_executing',
      turnId: 'turn-openai',
      content: '',
      createdAt: 110,
      meta: { threadId: 'thread-openai', stepId: 'step-1', toolName: 'list_directory' },
    },
    {
      eventId: 3,
      kind: 'tool_result',
      turnId: 'turn-openai',
      content: 'ok',
      createdAt: 120,
      meta: { threadId: 'thread-openai', stepId: 'step-1', toolName: 'list_directory', finishedAt: 120 },
    },
    {
      eventId: 4,
      kind: 'execution_commentary_chunk',
      turnId: 'turn-openai',
      content: 'I have the structure. Next I am writing the files.',
      createdAt: 130,
      meta: { threadId: 'thread-openai', round: 1, providerId: 'openai' },
    },
    {
      eventId: 5,
      kind: 'tool_executing',
      turnId: 'turn-openai',
      content: '',
      createdAt: 140,
      meta: { threadId: 'thread-openai', stepId: 'step-2', toolName: 'write_file' },
    },
    {
      eventId: 6,
      kind: 'tool_result',
      turnId: 'turn-openai',
      content: 'ok',
      createdAt: 150,
      meta: { threadId: 'thread-openai', stepId: 'step-2', toolName: 'write_file', finishedAt: 150 },
    },
    {
      eventId: 7,
      kind: 'execution_commentary_chunk',
      turnId: 'turn-openai',
      content: finalAnswer,
      createdAt: 160,
      meta: { threadId: 'thread-openai', round: 1, providerId: 'openai' },
    },
    {
      eventId: 8,
      kind: 'assistant_message',
      turnId: 'turn-openai',
      content: finalAnswer,
      createdAt: 170,
      meta: { threadId: 'thread-openai', providerId: 'openai', phase: 'final_answer' },
    },
  ])

  const turn = hydrated.liveExecution.turnsById['turn-openai']
  assert.deepEqual(
    turn.itemOrder.map((itemId) => itemId.startsWith('reasoning:') ? 'reasoning' : itemId),
    [
      'reasoning',
      'tool:session:turn-openai:step-1',
      'reasoning',
      'tool:session:turn-openai:step-2',
    ],
  )
  assert.deepEqual(
    Object.values(turn.reasoningById).map((reasoning) => reasoning.detail),
    [
      'I am inspecting the empty project folder first.',
      'I have the structure. Next I am writing the files.',
    ],
  )
  assert.equal(hydrated.messages[0].content, finalAnswer)
})

test('timeline hydration derives missing account reasoning segments from result-only tool boundaries', () => {
  const turnId = 'turn-account-result-only'
  const hydrated = mapTimelineFromPersistedEvents([
    {
      eventId: 1,
      kind: 'execution_reasoning_chunk',
      turnId,
      content: '**Preparing image generation**',
      createdAt: 100,
      meta: {
        threadId: 'thread-account',
        providerId: 'openai',
        assistantMessageId: 'assistant-account',
      },
    },
    {
      eventId: 2,
      kind: 'provider_tool_output',
      turnId,
      content: 'image_generation',
      createdAt: 110,
      meta: {
        threadId: 'thread-account',
        providerId: 'openai',
        toolCallId: 'image-call-1',
        toolName: 'image_generation',
      },
    },
    {
      eventId: 3,
      kind: 'execution_reasoning_chunk',
      turnId,
      content: '**Reviewing the first image**',
      createdAt: 120,
      meta: {
        threadId: 'thread-account',
        providerId: 'openai',
        assistantMessageId: 'assistant-account',
      },
    },
    {
      eventId: 4,
      kind: 'provider_tool_output',
      turnId,
      content: 'image_generation',
      createdAt: 130,
      meta: {
        threadId: 'thread-account',
        providerId: 'openai',
        toolCallId: 'image-call-2',
        toolName: 'image_generation',
      },
    },
    {
      eventId: 5,
      kind: 'execution_reasoning_chunk',
      turnId,
      content: '**Formatting the final response**',
      createdAt: 140,
      meta: {
        threadId: 'thread-account',
        providerId: 'openai',
        assistantMessageId: 'assistant-account',
      },
    },
  ])

  const turn = hydrated.liveExecution.turnsById[turnId]
  assert.deepEqual(
    turn.itemOrder.map((itemId) => itemId.startsWith('reasoning:') ? 'reasoning' : 'tool'),
    ['reasoning', 'tool', 'reasoning', 'tool', 'reasoning'],
  )
  assert.deepEqual(
    Object.values(turn.reasoningById).map((reasoning) => reasoning.detail),
    [
      '**Preparing image generation**',
      '**Reviewing the first image**',
      '**Formatting the final response**',
    ],
  )
})

test('timeline hydration preserves DeepSeek reasoning from every persisted model-tool round', () => {
  const turnId = 'turn-deepseek-rounds'
  const assistantMessageId = 'assistant-deepseek-rounds'
  const hydrated = mapTimelineFromPersistedEvents([
    {
      eventId: 1,
      kind: 'execution_reasoning_chunk',
      turnId,
      content: 'Inspecting README before the first read.',
      createdAt: 100,
      meta: {
        threadId: 'thread-deepseek-rounds',
        providerId: 'deepseek',
        assistantMessageId,
        round: 1,
      },
    },
    {
      eventId: 2,
      kind: 'reasoning_done',
      turnId,
      content: 'Inspecting README before the first read.',
      createdAt: 105,
      meta: {
        threadId: 'thread-deepseek-rounds',
        providerId: 'deepseek',
        assistantMessageId,
        round: 1,
        current: 'Inspecting README before the first read.',
        full: 'Inspecting README before the first read.',
      },
    },
    {
      eventId: 3,
      kind: 'tool_result',
      turnId,
      content: 'README contents',
      createdAt: 110,
      meta: {
        threadId: 'thread-deepseek-rounds',
        providerId: 'deepseek',
        stepId: 'read-readme',
        toolName: 'read_file',
        finishedAt: 110,
      },
    },
    {
      eventId: 4,
      kind: 'execution_reasoning_chunk',
      turnId,
      content: 'README is documented; now inspect package.json.',
      createdAt: 120,
      meta: {
        threadId: 'thread-deepseek-rounds',
        providerId: 'deepseek',
        assistantMessageId,
        round: 2,
      },
    },
    {
      eventId: 5,
      kind: 'reasoning_done',
      turnId,
      content: 'README is documented; now inspect package.json.',
      createdAt: 125,
      meta: {
        threadId: 'thread-deepseek-rounds',
        providerId: 'deepseek',
        assistantMessageId,
        round: 2,
        current: 'README is documented; now inspect package.json.',
        full: 'Inspecting README before the first read.\n\n---\n\nREADME is documented; now inspect package.json.',
      },
    },
    {
      eventId: 6,
      kind: 'tool_result',
      turnId,
      content: 'package.json contents',
      createdAt: 130,
      meta: {
        threadId: 'thread-deepseek-rounds',
        providerId: 'deepseek',
        stepId: 'read-package',
        toolName: 'read_file',
        finishedAt: 130,
      },
    },
    {
      eventId: 7,
      kind: 'execution_reasoning_chunk',
      turnId,
      content: 'Comparing the documented and actual commands.',
      createdAt: 140,
      meta: {
        threadId: 'thread-deepseek-rounds',
        providerId: 'deepseek',
        assistantMessageId,
        round: 3,
      },
    },
    {
      eventId: 8,
      kind: 'reasoning_done',
      turnId,
      content: 'Comparing the documented and actual commands.',
      createdAt: 145,
      meta: {
        threadId: 'thread-deepseek-rounds',
        providerId: 'deepseek',
        assistantMessageId,
        round: 3,
        current: 'Comparing the documented and actual commands.',
        full: 'Inspecting README before the first read.\n\n---\n\nREADME is documented; now inspect package.json.\n\n---\n\nComparing the documented and actual commands.',
      },
    },
  ])

  const turn = hydrated.liveExecution.turnsById[turnId]
  assert.deepEqual(
    turn.itemOrder.map((itemId) => itemId.startsWith('reasoning:') ? 'reasoning' : 'tool'),
    ['reasoning', 'tool', 'reasoning', 'tool', 'reasoning'],
  )
  assert.deepEqual(
    Object.values(turn.reasoningById).map((reasoning) => reasoning.detail),
    [
      'Inspecting README before the first read.',
      'README is documented; now inspect package.json.',
      'Comparing the documented and actual commands.',
    ],
  )
})

test('timeline hydration preserves an OpenRouter Codex reasoning title after later commentary and final-answer rounds', () => {
  const turnId = 'turn-openrouter-codex-title'
  const assistantMessageId = 'assistant-openrouter-codex-title'
  const firstCommentary = 'I’ll inspect README.md for documented commands first.'
  const progressCommentary = 'README is documented. Next I’ll inspect package.json.'
  const finalAnswer = 'FINAL ACCEPTANCE:\n\n- documented commands\n- actual scripts\n- mismatch'
  const fullReasoning = [
    '**Planning file inspections**',
    progressCommentary,
    finalAnswer,
  ].join('\n\n---\n\n')

  const hydrated = mapTimelineFromPersistedEvents([
    {
      eventId: 1,
      kind: 'execution_reasoning_chunk',
      turnId,
      content: `**Planning file inspections**${firstCommentary}`,
      createdAt: 100,
      meta: {
        threadId: 'thread-openrouter-codex-title',
        providerId: 'openrouter',
        assistantMessageId,
        round: 1,
        reasoningSegment: 0,
      },
    },
    {
      eventId: 2,
      kind: 'reasoning_done',
      turnId,
      content: '**Planning file inspections**',
      createdAt: 105,
      meta: {
        threadId: 'thread-openrouter-codex-title',
        providerId: 'openrouter',
        assistantMessageId,
        round: 1,
        reasoningSegment: 0,
        current: `**Planning file inspections**${firstCommentary}`,
        full: '**Planning file inspections**',
      },
    },
    {
      eventId: 3,
      kind: 'execution_commentary_chunk',
      turnId,
      content: firstCommentary,
      createdAt: 110,
      meta: {
        threadId: 'thread-openrouter-codex-title',
        providerId: 'openrouter',
        round: 1,
        reasoningSegment: 0,
      },
    },
    {
      eventId: 4,
      kind: 'tool_result',
      turnId,
      content: 'README contents',
      createdAt: 120,
      meta: {
        threadId: 'thread-openrouter-codex-title',
        providerId: 'openrouter',
        stepId: 'read-readme',
        toolName: 'read_file',
        finishedAt: 120,
      },
    },
    {
      eventId: 5,
      kind: 'execution_reasoning_chunk',
      turnId,
      content: progressCommentary,
      createdAt: 130,
      meta: {
        threadId: 'thread-openrouter-codex-title',
        providerId: 'openrouter',
        assistantMessageId,
        round: 2,
        reasoningSegment: 1,
      },
    },
    {
      eventId: 6,
      kind: 'reasoning_done',
      turnId,
      content: progressCommentary,
      createdAt: 135,
      meta: {
        threadId: 'thread-openrouter-codex-title',
        providerId: 'openrouter',
        assistantMessageId,
        round: 2,
        reasoningSegment: 1,
        current: progressCommentary,
        full: fullReasoning.split('\n\n---\n\n').slice(0, 2).join('\n\n---\n\n'),
      },
    },
    {
      eventId: 7,
      kind: 'execution_commentary_chunk',
      turnId,
      content: progressCommentary,
      createdAt: 140,
      meta: {
        threadId: 'thread-openrouter-codex-title',
        providerId: 'openrouter',
        round: 2,
        reasoningSegment: 1,
      },
    },
    {
      eventId: 8,
      kind: 'tool_result',
      turnId,
      content: 'package.json contents',
      createdAt: 150,
      meta: {
        threadId: 'thread-openrouter-codex-title',
        providerId: 'openrouter',
        stepId: 'read-package',
        toolName: 'read_file',
        finishedAt: 150,
      },
    },
    {
      eventId: 9,
      kind: 'execution_reasoning_chunk',
      turnId,
      content: finalAnswer,
      createdAt: 160,
      meta: {
        threadId: 'thread-openrouter-codex-title',
        providerId: 'openrouter',
        assistantMessageId,
        round: 3,
        reasoningSegment: 2,
      },
    },
    {
      eventId: 10,
      kind: 'reasoning_done',
      turnId,
      content: finalAnswer,
      createdAt: 165,
      meta: {
        threadId: 'thread-openrouter-codex-title',
        providerId: 'openrouter',
        assistantMessageId,
        round: 3,
        reasoningSegment: 2,
        current: finalAnswer,
        full: fullReasoning,
      },
    },
    {
      eventId: 11,
      kind: 'assistant_message',
      turnId,
      content: finalAnswer,
      createdAt: 170,
      meta: {
        threadId: 'thread-openrouter-codex-title',
        providerId: 'openrouter',
        phase: 'final_answer',
      },
    },
  ])

  const turn = hydrated.liveExecution.turnsById[turnId]
  assert.deepEqual(
    turn.itemOrder.map((itemId) => itemId.startsWith('reasoning:') ? 'reasoning' : 'tool'),
    ['reasoning', 'reasoning', 'tool', 'reasoning', 'tool'],
  )
  assert.deepEqual(
    Object.values(turn.reasoningById).map((reasoning) => reasoning.detail),
    [
      '**Planning file inspections**',
      firstCommentary,
      progressCommentary,
    ],
  )
  assert.equal(hydrated.messages[0].content, finalAnswer)
})

test('timeline hydration restores native command output with the same canonical command shape as live events', () => {
  const hydrated = mapTimelineFromPersistedEvents([{
    eventId: 1,
    kind: 'provider_tool_output',
    turnId: 'turn-command-hydration',
    content: 'command_execution',
    createdAt: 100,
    meta: {
      threadId: 'thread-command-hydration',
      providerId: 'openai',
      toolCallId: 'command-hydration-1',
      toolName: 'command_execution',
      output: {
        type: 'commandExecution',
        command: 'npm run build',
        cwd: 'C:\\workspace',
        status: 'failed',
        aggregatedOutput: '\u001b[31mBuild failed\u001b[0m',
        exitCode: 1,
        durationMs: 859,
      },
    },
  }])

  const activity = hydrated.toolActivity[0]
  assert.equal(activity.toolName, 'run_command')
  assert.deepEqual(activity.toolInput, {
    command: 'npm run build',
    cwd: 'C:\\workspace',
  })
  assert.equal(activity.result, 'Build failed')
  assert.equal(activity.isError, true)
  assert.equal(activity.exitCode, 1)
  assert.equal(activity.durationMs, 859)
})

test('timeline hydration keeps terminal execution time pinned to persisted timestamps', () => {
  const hydrated = mapTimelineFromPersistedEvents([
    {
      eventId: 1,
      kind: 'turn_started',
      turnId: 'turn-duration',
      createdAt: 1_000,
      meta: { threadId: 'thread-duration', turnId: 'turn-duration', state: 'started', startedAt: 1_000 },
    },
    {
      eventId: 2,
      kind: 'execution_reasoning_chunk',
      turnId: 'turn-duration',
      content: 'Working through the task.',
      createdAt: 1_200,
      meta: { threadId: 'thread-duration', emittedAt: 1_200 },
    },
    {
      eventId: 3,
      kind: 'turn_completed',
      turnId: 'turn-duration',
      createdAt: 1_500,
      meta: {
        threadId: 'thread-duration',
        turnId: 'turn-duration',
        state: 'completed',
        status: 'done',
        startedAt: 1_000,
        finishedAt: 1_500,
      },
    },
  ]).liveExecution.turnsById['turn-duration']

  assert.equal(hydrated.updatedAt, 1_500)
  assert.equal(hydrated.status, 'done')
})
