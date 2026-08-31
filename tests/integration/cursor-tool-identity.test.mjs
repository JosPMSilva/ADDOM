import test from 'node:test'
import assert from 'node:assert/strict'

import { extractToolIdentityDetail } from '../../src/common/chat/tool-identity.mjs'
import { formatExecutionToolLabel } from '../../src/renderer/components/chat/live-execution-stream-labels.mjs'
import { buildExecutionStreamItems } from '../../src/renderer/components/chat/live-execution-stream-items.mjs'
import { createCursorAgentEventMapper } from '../../src/main/cursor-agent/cursor-agent-event-mapper.mjs'
import { mapActivityToCanonicalExecutionEvents } from '../../src/renderer/store/chat/live-execution-store-activity.mjs'
import { reduceCanonicalExecutionEvent } from '../../src/renderer/store/chat/live-execution-canonical-reducer.mjs'

test('extractToolIdentityDetail reads Cursor args and success payloads', () => {
  assert.equal(
    extractToolIdentityDetail({
      toolKind: 'file_edit',
      toolInput: { path: 'src/app.js', old_string: 'a', new_string: 'b' },
    }),
    'src/app.js',
  )
  assert.equal(
    extractToolIdentityDetail({
      toolKind: 'file_edit',
      toolInput: { targetFile: 'pdfa_checker.py' },
    }),
    'pdfa_checker.py',
  )
  assert.equal(
    extractToolIdentityDetail({
      toolKind: 'search',
      detail: JSON.stringify({ success: { pattern: 'pdf|pdfa', path: 'C:\\\\repo' } }),
    }),
    'pdf|pdfa',
  )
  assert.equal(
    extractToolIdentityDetail({
      toolKind: 'command',
      detail: JSON.stringify({ success: { command: 'python -m unittest', workingDirectory: 'C:\\\\repo' } }),
    }),
    'python -m unittest',
  )
})

test('extractToolIdentityDetail recovers path/command from truncated Cursor JSON', () => {
  const truncatedEdit = (
    '{"success":{"path":"C:\\\\Users\\\\example\\\\Documents\\\\Codex Testing\\\\pdfa_checker.py",'
    + '"linesAdded":272,"diffString":"'
    + 'x'.repeat(2500)
  )
  assert.equal(
    extractToolIdentityDetail({ toolKind: 'file_edit', detail: truncatedEdit }),
    'C:\\Users\\example\\Documents\\Codex Testing\\pdfa_checker.py',
  )

  const truncatedCommand = (
    '{"success":{"command":"python pdfa_checker.py test_pdfa_checker.py 2>&1",'
    + '"stdout":"'
    + 'y'.repeat(2500)
  )
  assert.equal(
    extractToolIdentityDetail({ toolKind: 'command', detail: truncatedCommand }),
    'python pdfa_checker.py test_pdfa_checker.py 2>&1',
  )
})

test('empty-pattern search identity prefers folder basename over absolute path', () => {
  assert.equal(
    extractToolIdentityDetail({
      toolKind: 'search',
      detail: JSON.stringify({
        success: { pattern: '', path: 'C:\\\\Users\\\\example\\\\Documents\\\\Codex Testing' },
      }),
    }),
    'Codex Testing',
  )
  assert.equal(
    formatExecutionToolLabel({
      toolKind: 'search',
      state: 'succeeded',
      inputDetail: 'C:\\Users\\example\\Documents\\Codex Testing',
    }),
    'Searched Codex Testing',
  )
})

test('Cursor tool rows show basename identity from result JSON when inputDetail is empty', () => {
  const items = buildExecutionStreamItems({
    itemOrder: ['tool:edit-1', 'tool:search-1', 'tool:cmd-1', 'tool:edit-trunc'],
    sessionsById: {
      'edit-1': {
        id: 'edit-1',
        toolKind: 'file_edit',
        state: 'succeeded',
        inputDetail: '',
        detail: JSON.stringify({ success: { path: 'C:\\\\Users\\\\example\\\\Documents\\\\Codex Testing\\\\pdfa_checker.py' } }),
      },
      'search-1': {
        id: 'search-1',
        toolKind: 'search',
        state: 'succeeded',
        inputDetail: '',
        detail: JSON.stringify({ success: { pattern: 'pdf|pdfa', path: 'C:\\\\repo' } }),
      },
      'cmd-1': {
        id: 'cmd-1',
        toolKind: 'command',
        state: 'succeeded',
        inputDetail: '',
        detail: JSON.stringify({ success: { command: 'python -m unittest test_pdfa_checker.py -v' } }),
      },
      'edit-trunc': {
        id: 'edit-trunc',
        toolKind: 'file_edit',
        state: 'succeeded',
        inputDetail: '',
        detail: (
          '{"success":{"path":"C:\\\\Users\\\\example\\\\Documents\\\\Codex Testing\\\\test_pdfa_checker.py",'
          + '"diffString":"'
          + 'z'.repeat(2500)
        ),
      },
    },
  }, { reasoning: true, commentary: true, tools: true }, { collapseSettled: false })

  assert.equal(items.find((item) => item.id === 'tool:edit-1')?.label, 'Edited pdfa_checker.py')
  assert.equal(items.find((item) => item.id === 'tool:search-1')?.label, 'Searched pdf|pdfa')
  assert.match(items.find((item) => item.id === 'tool:cmd-1')?.label || '', /Ran python -m unittest/)
  assert.equal(items.find((item) => item.id === 'tool:edit-trunc')?.label, 'Edited test_pdfa_checker.py')
})

test('Cursor mapper forwards toolInput args on provider tool status and output', () => {
  const sent = []
  const mapper = createCursorAgentEventMapper({
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: () => {},
    threadId: 'thread-1',
    turnId: 'turn-1',
  })
  mapper.handle({
    kind: 'tool_started',
    callId: 'call-edit',
    toolCall: { editToolCall: { args: { path: 'pdfa_checker.py' } } },
  })
  mapper.handle({
    kind: 'tool_completed',
    callId: 'call-edit',
    toolCall: {
      editToolCall: {
        args: { path: 'pdfa_checker.py' },
        result: { success: { path: 'C:\\\\repo\\\\pdfa_checker.py' } },
      },
    },
  })

  const status = sent.find((entry) => entry.channel === 'chat:provider-tool-status')
  const output = sent.find((entry) => entry.channel === 'chat:provider-tool-output')
  assert.deepEqual(status?.payload?.toolInput, { path: 'pdfa_checker.py' })
  assert.deepEqual(output?.payload?.toolInput, { path: 'pdfa_checker.py' })
})

test('Cursor mapper enriches empty args from result success path/command', () => {
  const sent = []
  const mapper = createCursorAgentEventMapper({
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: () => {},
    threadId: 'thread-1',
    turnId: 'turn-1',
  })
  mapper.handle({
    kind: 'tool_completed',
    callId: 'call-edit',
    toolCall: {
      editToolCall: {
        args: {},
        result: { success: { path: 'C:\\\\repo\\\\pdfa_checker.py', linesAdded: 10 } },
      },
    },
  })
  mapper.handle({
    kind: 'tool_completed',
    callId: 'call-shell',
    toolCall: {
      shellToolCall: {
        args: {},
        result: { success: { command: 'python -m unittest -v', exitCode: 0 } },
      },
    },
  })
  const outputs = sent.filter((entry) => entry.channel === 'chat:provider-tool-output')
  assert.equal(outputs[0]?.payload?.toolInput?.path, 'C:\\\\repo\\\\pdfa_checker.py')
  assert.equal(outputs[1]?.payload?.toolInput?.command, 'python -m unittest -v')
})

test('provider tool result fills session inputDetail from Cursor success JSON', () => {
  const events = mapActivityToCanonicalExecutionEvents({
    type: 'result',
    eventKind: 'provider_tool_output',
    threadId: 'thread-1',
    turnId: 'turn-1',
    toolName: 'edit',
    stepId: 'call-1',
    id: 'provider_tool:turn-1:call-1',
    detail: JSON.stringify({ success: { path: 'C:\\\\repo\\\\pdfa_checker.py' } }),
    toolInput: { path: 'pdfa_checker.py' },
  })
  assert.equal(events[0]?.kind, 'tool_result')

  const state = events.reduce(
    (next, event) => reduceCanonicalExecutionEvent(next, event),
    { turnsById: {}, turnOrder: [] },
  )
  const session = Object.values(state.turnsById['turn-1'].sessionsById)[0]
  assert.equal(session.inputDetail, 'pdfa_checker.py')
  assert.match(String(session.detail || ''), /pdfa_checker\.py/)
})

test('formatExecutionToolLabel still falls back when identity is missing', () => {
  assert.equal(formatExecutionToolLabel({
    toolKind: 'file_edit',
    state: 'succeeded',
    inputDetail: '',
  }), 'Edited file')
})

test('Cursor tool start+output collapse to one canonical session (no provider_tool_input ghost)', () => {
  const startEvents = mapActivityToCanonicalExecutionEvents({
    id: 'provider_tool:turn-1:call-1',
    type: 'provider_tool',
    eventKind: 'provider_tool_status',
    threadId: 'thread-1',
    turnId: 'turn-1',
    toolName: 'read',
    stepId: 'call-1',
    toolInput: { path: 'pdfa_checker.py' },
    detail: 'Collecting provider tool input...',
  })
  const resultEvents = mapActivityToCanonicalExecutionEvents({
    id: 'provider_tool:turn-1:call-1',
    type: 'result',
    eventKind: 'provider_tool_output',
    threadId: 'thread-1',
    turnId: 'turn-1',
    toolName: 'read',
    stepId: 'call-1',
    toolInput: { path: 'pdfa_checker.py' },
    detail: JSON.stringify({ success: { path: 'pdfa_checker.py' } }),
  })
  const turnDone = mapActivityToCanonicalExecutionEvents({
    type: 'turn',
    eventKind: 'turn_completed',
    turnId: 'turn-1',
    threadId: 'thread-1',
    turnState: 'completed',
    turnStatus: 'done',
  })

  const state = [...startEvents, ...resultEvents, ...turnDone].reduce(
    (next, event) => reduceCanonicalExecutionEvent(next, event),
    { turnsById: {}, turnOrder: [] },
  )
  const turn = state.turnsById['turn-1']
  const sessionIds = Object.keys(turn.sessionsById)
  assert.deepEqual(sessionIds, ['session:turn-1:call-1'])
  assert.equal(
    sessionIds.some((id) => id.includes('provider_tool_input')),
    false,
  )
  assert.equal(turn.sessionsById['session:turn-1:call-1'].state, 'succeeded')
  assert.equal(turn.sessionsById['session:turn-1:call-1'].inputDetail, 'pdfa_checker.py')
})
