import test from 'node:test'
import assert from 'node:assert/strict'

import {
  closeIncompleteToolSessions,
  pruneDuplicatedExecutionCommentaryFromCanonicalState,
  reduceCanonicalExecutionEvent,
} from '../../src/renderer/store/chat/live-execution-canonical-reducer.mjs'

function reduce(events) {
  return events.reduce(
    (state, event) => reduceCanonicalExecutionEvent(state, event),
    { turnsById: {}, turnOrder: [] },
  )
}

function event(kind, patch = {}) {
  return {
    kind,
    turnId: 'turn-1',
    threadId: 'thread-1',
    emittedAt: 100,
    ...patch,
  }
}

test('canonical reducer aggregates a tool lifecycle into one session', () => {
  const state = reduce([
    event('tool_started', { eventId: 'start-1', sessionId: 'step-1', toolKind: 'command', state: 'active' }),
    event('tool_output', { eventId: 'out-1', sessionId: 'step-1', stream: 'stdout', detail: 'first\n', sequence: 1 }),
    event('tool_output', { eventId: 'out-2', sessionId: 'step-1', stream: 'stderr', detail: 'second\n', sequence: 2 }),
    event('tool_result', { eventId: 'result-1', sessionId: 'step-1', state: 'failed', detail: 'exit 1', emittedAt: 120 }),
  ])

  const turn = state.turnsById['turn-1']
  assert.deepEqual(turn.itemOrder, ['tool:step-1'])
  assert.equal(Object.keys(turn.sessionsById).length, 1)
  assert.equal(turn.sessionsById['step-1'].state, 'failed')
  assert.deepEqual(
    turn.sessionsById['step-1'].outputs.map(({ stream, detail }) => ({ stream, detail })),
    [
      { stream: 'stdout', detail: 'first\n' },
      { stream: 'stderr', detail: 'second\n' },
    ],
  )
  assert.equal(turn.status, 'active')
})

test('failed attempts stay local and successful terminal state is authoritative', () => {
  const state = reduce([
    event('tool_started', { eventId: 'start-1', sessionId: 'attempt-1', toolKind: 'command', state: 'active' }),
    event('tool_result', { eventId: 'result-1', sessionId: 'attempt-1', state: 'failed' }),
    event('tool_started', { eventId: 'start-2', sessionId: 'attempt-2', toolKind: 'command', state: 'active' }),
    event('tool_result', { eventId: 'result-2', sessionId: 'attempt-2', state: 'succeeded' }),
    event('turn_state', { eventId: 'turn-result', state: 'succeeded', terminal: true, emittedAt: 150 }),
  ])

  const turn = state.turnsById['turn-1']
  assert.deepEqual(turn.itemOrder, ['tool:attempt-1', 'tool:attempt-2'])
  assert.equal(turn.sessionsById['attempt-1'].state, 'failed')
  assert.equal(turn.sessionsById['attempt-2'].state, 'succeeded')
  assert.equal(turn.terminalState, 'succeeded')
  assert.equal(turn.status, 'done')
})

test('terminal failure is authoritative and closes active sessions as interrupted', () => {
  const state = reduce([
    event('tool_started', { eventId: 'start-1', sessionId: 'step-1', toolKind: 'command', state: 'active' }),
    event('turn_state', { eventId: 'turn-result', state: 'failed', terminal: true, emittedAt: 150 }),
  ])

  const turn = state.turnsById['turn-1']
  assert.equal(turn.status, 'error')
  assert.equal(turn.sessionsById['step-1'].state, 'interrupted')
  assert.equal(turn.sessionsById['step-1'].completedAt, 150)
})

test('warning diagnostics remain local and canonical events are idempotent', () => {
  const warning = event('diagnostic', {
    eventId: 'warning-1',
    diagnosticSeverity: 'warning',
    detail: 'recoverable issue',
  })
  const once = reduce([warning])
  const twice = reduceCanonicalExecutionEvent(once, warning)

  assert.deepEqual(twice, once)
  assert.equal(once.turnsById['turn-1'].status, 'active')
  assert.equal(once.turnsById['turn-1'].diagnosticsById['warning-1'].detail, 'recoverable issue')
})

test('canonical reducer preserves unidentified reasoning deltas emitted in the same millisecond', () => {
  const state = reduce([
    event('reasoning_chunk', {
      messageId: 'message-1',
      reasoningRole: 'commentary',
      detail: 'apro',
      emittedAt: 100,
    }),
    event('reasoning_chunk', {
      messageId: 'message-1',
      reasoningRole: 'commentary',
      detail: 'vada',
      emittedAt: 100,
    }),
  ])

  assert.equal(state.turnsById['turn-1'].reasoningById['message-1'].detail, 'aprovada')
})

test('closeIncompleteToolSessions does not overwrite terminal turn outcome', () => {
  const active = reduce([
    event('tool_started', { eventId: 'start-1', sessionId: 'step-1', state: 'active' }),
  ])
  const closed = closeIncompleteToolSessions(active, {
    turnId: 'turn-1',
    completedAt: 200,
    terminalState: 'succeeded',
  })

  assert.equal(closed.turnsById['turn-1'].status, 'done')
  assert.equal(closed.turnsById['turn-1'].sessionsById['step-1'].state, 'interrupted')
})

test('commentary chunks merge with the shared reasoning merge profile', () => {
  const state = reduce([
    event('reasoning_chunk', {
      eventId: 'reason-1',
      messageId: 'message-1',
      reasoningRole: 'commentary',
      detail: 'Checking ',
      emittedAt: 10,
    }),
    event('reasoning_chunk', {
      eventId: 'reason-2',
      messageId: 'message-1',
      reasoningRole: 'commentary',
      detail: 'the workspace.',
      emittedAt: 20,
    }),
    event('reasoning_chunk', {
      eventId: 'reason-3',
      messageId: 'message-1',
      reasoningRole: 'commentary',
      detail: '**Rendering check passed.**',
      emittedAt: 30,
    }),
  ])

  const detail = state.turnsById['turn-1'].reasoningById['message-1'].detail
  assert.equal(detail, 'Checking the workspace.\n\n**Rendering check passed.**')
})

test('commentary merge profile repairs tokenized markdown bold chunks', () => {
  const state = reduce([
    event('reasoning_chunk', {
      eventId: 'reason-1',
      messageId: 'message-1',
      reasoningRole: 'commentary',
      detail: 'Rendering check passed.',
      emittedAt: 10,
    }),
    event('reasoning_chunk', {
      eventId: 'reason-2',
      messageId: 'message-1',
      reasoningRole: 'commentary',
      detail: '**\n',
      emittedAt: 20,
    }),
    event('reasoning_chunk', {
      eventId: 'reason-3',
      messageId: 'message-1',
      reasoningRole: 'commentary',
      detail: 'Rendering\n',
      emittedAt: 30,
    }),
    event('reasoning_chunk', {
      eventId: 'reason-4',
      messageId: 'message-1',
      reasoningRole: 'commentary',
      detail: ' check\n',
      emittedAt: 40,
    }),
    event('reasoning_chunk', {
      eventId: 'reason-5',
      messageId: 'message-1',
      reasoningRole: 'commentary',
      detail: ' passed\n',
      emittedAt: 50,
    }),
    event('reasoning_chunk', {
      eventId: 'reason-6',
      messageId: 'message-1',
      reasoningRole: 'commentary',
      detail: '.**\n',
      emittedAt: 60,
    }),
  ])

  const detail = state.turnsById['turn-1'].reasoningById['message-1'].detail
  assert.equal(detail, 'Rendering check passed.\n\n**Rendering\n check\n passed\n**')
})

test('same-round execution commentary gets a new canonical slot after a tool boundary', () => {
  const state = reduce([
    event('reasoning_chunk', {
      eventId: 'commentary-before-tool',
      messageId: 'execution_commentary:turn-1:1',
      reasoningRole: 'commentary',
      detail: 'Inspecting the workspace first.',
      emittedAt: 10,
    }),
    event('tool_started', {
      eventId: 'start-1',
      sessionId: 'step-1',
      toolKind: 'read_file',
      state: 'active',
      emittedAt: 20,
    }),
    event('tool_result', {
      eventId: 'result-1',
      sessionId: 'step-1',
      toolKind: 'read_file',
      state: 'succeeded',
      emittedAt: 30,
    }),
    event('reasoning_chunk', {
      eventId: 'commentary-after-tool',
      messageId: 'execution_commentary:turn-1:1',
      reasoningRole: 'commentary',
      detail: 'Now I am writing the files.',
      emittedAt: 40,
    }),
  ])

  const turn = state.turnsById['turn-1']
  assert.deepEqual(turn.itemOrder, [
    'reasoning:execution_commentary:turn-1:1',
    'tool:step-1',
    'reasoning:execution_commentary:turn-1:1:segment:1',
  ])
  assert.deepEqual(
    Object.values(turn.reasoningById).map((reasoning) => reasoning.detail),
    ['Inspecting the workspace first.', 'Now I am writing the files.'],
  )
})

test('mid-sentence same-round commentary stays in its canonical slot across a tool boundary', () => {
  const state = reduce([
    event('reasoning_chunk', {
      eventId: 'commentary-before-tool',
      messageId: 'execution_commentary:turn-1:1',
      reasoningRole: 'commentary',
      detail: 'Checking ',
      emittedAt: 10,
    }),
    event('tool_started', {
      eventId: 'start-1',
      sessionId: 'step-1',
      toolKind: 'read_file',
      state: 'active',
      emittedAt: 20,
    }),
    event('tool_result', {
      eventId: 'result-1',
      sessionId: 'step-1',
      toolKind: 'read_file',
      state: 'succeeded',
      emittedAt: 30,
    }),
    event('reasoning_chunk', {
      eventId: 'commentary-after-tool',
      messageId: 'execution_commentary:turn-1:1',
      reasoningRole: 'commentary',
      detail: 'the workspace.',
      emittedAt: 40,
    }),
  ])

  const turn = state.turnsById['turn-1']
  assert.deepEqual(turn.itemOrder, [
    'reasoning:execution_commentary:turn-1:1',
    'tool:step-1',
  ])
  assert.equal(
    turn.reasoningById['execution_commentary:turn-1:1'].detail,
    'Checking the workspace.',
  )
})

test('pruneDuplicatedExecutionCommentaryFromCanonicalState removes answer commentary duplicated in the final bubble', () => {
  const state = reduce([
    event('reasoning_chunk', {
      eventId: 'commentary-1',
      messageId: 'execution_commentary:turn-1',
      reasoningRole: 'commentary',
      detail: 'Creating a calculator.py file. Run tests with pytest.',
      emittedAt: 10,
    }),
    event('tool_started', { eventId: 'start-1', sessionId: 'step-1', toolKind: 'tool', state: 'active' }),
  ])
  const pruned = pruneDuplicatedExecutionCommentaryFromCanonicalState(state, {
    turnId: 'turn-1',
    assistantText: 'Creating a calculator.py file. Run tests with pytest.',
  })

  assert.equal(pruned.turnsById['turn-1'].reasoningById['execution_commentary:turn-1'], undefined)
  assert.deepEqual(pruned.turnsById['turn-1'].itemOrder, ['tool:step-1'])
})

test('pruneDuplicatedExecutionCommentaryFromCanonicalState strips smashed final-answer suffixes from reasoning', () => {
  const state = reduce([
    event('reasoning_chunk', {
      eventId: 'reason-1',
      messageId: 'msg-1',
      reasoningRole: 'commentary',
      detail: '**Implementing new services page**I\'ll add a new page under app/services and link it from the header.',
      emittedAt: 10,
    }),
  ])
  const pruned = pruneDuplicatedExecutionCommentaryFromCanonicalState(state, {
    turnId: 'turn-1',
    assistantText: 'I\'ll add a new page under app/services and link it from the header.',
  })

  assert.equal(
    pruned.turnsById['turn-1'].reasoningById['msg-1'].detail,
    '**Implementing new services page**',
  )
  assert.doesNotMatch(
    String(pruned.turnsById['turn-1'].reasoningById['msg-1'].detail || ''),
    /I'?ll add a new page/i,
  )
})
