import test from 'node:test'
import assert from 'node:assert/strict'

import { REASONING_PHASE_BOUNDARY } from '../../src/common/chat/reasoning-phase-boundary.mjs'
import { createCursorAgentEventMapper } from '../../src/main/cursor-agent/cursor-agent-event-mapper.mjs'

test('Cursor event mapper routes mid-turn assistant narration to execution commentary', () => {
  const sent = []
  const timeline = []
  const mapper = createCursorAgentEventMapper({
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => timeline.push({ kind, payload }),
    threadId: 'thread-1',
    turnId: 'turn-1',
    assistantMessageId: 'assistant_cursor_1',
  })

  mapper.handle({ kind: 'assistant_delta', text: 'Hello' })
  mapper.handle({ kind: 'assistant_delta', text: 'Hello world' })
  mapper.handle({
    kind: 'tool_started',
    callId: 'call-1',
    toolCall: { shellToolCall: { args: { command: 'npm test' } } },
  })
  mapper.handle({
    kind: 'tool_completed',
    callId: 'call-1',
    toolCall: { shellToolCall: { args: { command: 'npm test' }, result: { success: { output: 'ok' } } } },
  })
  mapper.handle({ kind: 'result', sessionId: 'session-1', status: 'success', result: 'Hello world' })
  mapper.complete()

  assert.deepEqual(
    sent.filter((entry) => entry.channel === 'chat:assistant-commentary')
      .map((entry) => entry.payload.text),
    ['Hello world'],
  )
  assert.equal(sent.some((entry) => entry.channel === 'chat:provider-tool-status'), true)
  assert.equal(sent.some((entry) => entry.channel === 'chat:provider-tool-output'), true)
  // Result matched flushed commentary only — no distinct post-tool answer.
  assert.equal(sent.find((entry) => entry.channel === 'chat:done')?.payload.full, '')
  assert.equal(sent.some((entry) => entry.channel === 'chat:chunk'), false)
  assert.equal(sent.some((entry) => entry.channel === 'chat:reasoning-chunk'), false)
  assert.equal(timeline.some((entry) => entry.kind === 'execution_commentary_chunk'), true)
  assert.equal(timeline.some((entry) => entry.kind === 'assistant_message'), true)
  assert.equal(sent.every((entry) => entry.payload?.executionOwner !== 'addom'), true)
  const doneEvent = sent.find((entry) => entry.channel === 'chat:done')
  assert.equal(doneEvent?.payload?.assistantMessageId, 'assistant_cursor_1')
  assert.deepEqual(doneEvent?.payload?.finalDocument, {
    schemaVersion: 1,
    threadId: 'thread-1',
    turnId: 'turn-1',
    messageId: 'assistant_cursor_1',
    ownership: 'final-document',
    text: '',
    parts: [{
      threadId: 'thread-1',
      turnId: 'turn-1',
      messageId: 'assistant_cursor_1',
      partId: 'assistant_cursor_1:final-document:1',
      appendOrder: 1,
      sequence: 1,
      status: 'completed',
      ownership: 'final-document',
      kind: 'markdown',
      text: '',
    }],
  })
  const assistantMessage = timeline.find((entry) => entry.kind === 'assistant_message')
  assert.equal(assistantMessage?.payload?.meta?.assistantMessageId, 'assistant_cursor_1')
  assert.deepEqual(assistantMessage?.payload?.meta?.finalDocument, doneEvent?.payload?.finalDocument)
})

test('Cursor event mapper keeps thinking and mid-turn narration in execution; bubble gets final segment only', () => {
  const sent = []
  const timeline = []
  const mapper = createCursorAgentEventMapper({
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => timeline.push({ kind, payload }),
    threadId: 'thread-1',
    turnId: 'turn-1',
    assistantMessageId: 'assistant_cursor_2',
  })

  mapper.handle({ kind: 'thinking_delta', text: 'Checking' })
  mapper.handle({ kind: 'thinking_delta', text: ' the command.' })
  mapper.handle({ kind: 'thinking_completed' })
  mapper.handle({ kind: 'assistant_delta', text: 'I will run the check.' })
  mapper.handle({ kind: 'assistant_delta', text: 'I will run the check.' })
  mapper.handle({
    kind: 'tool_started',
    callId: 'call-1',
    toolCall: { shellToolCall: { args: { command: 'exit 0' } } },
  })
  mapper.handle({
    kind: 'tool_completed',
    callId: 'call-1',
    toolCall: { shellToolCall: { args: { command: 'exit 0' }, result: { success: { exitCode: 0 } } } },
  })
  mapper.handle({ kind: 'assistant_delta', text: 'Done.' })
  mapper.handle({ kind: 'assistant_delta', text: 'Done.' })
  mapper.handle({
    kind: 'result',
    sessionId: 'session-1',
    status: 'success',
    // Cursor concatenates every assistant segment into result.result — must not land in the bubble.
    result: 'I will run the check.\nDone.',
  })
  mapper.complete()

  assert.deepEqual(
    sent.filter((entry) => entry.channel === 'chat:reasoning-chunk').map((entry) => entry.payload.chunk),
    ['Checking', ' the command.', REASONING_PHASE_BOUNDARY],
  )
  assert.deepEqual(
    sent.filter((entry) => entry.channel === 'chat:assistant-commentary')
      .map((entry) => entry.payload.text),
    ['I will run the check.'],
  )
  assert.deepEqual(
    sent.filter((entry) => entry.channel === 'chat:chunk')
      .map((entry) => ({ chunk: entry.payload.chunk, phase: entry.payload.phase })),
    [{ chunk: 'Done.', phase: 'final_answer' }],
  )
  const doneEvent = sent.find((entry) => entry.channel === 'chat:done')
  assert.equal(doneEvent?.payload.full, 'Done.')
  assert.equal(doneEvent?.payload.assistantMessageId, 'assistant_cursor_2')
  assert.deepEqual(doneEvent?.payload.finalDocument?.parts?.map((part) => part.partId), ['assistant_cursor_2:final-document:1'])
  assert.deepEqual(doneEvent?.payload.finalDocument?.parts?.map((part) => part.text), ['Done.'])
  const assistantMessage = timeline.find((entry) => entry.kind === 'assistant_message')
  assert.equal(assistantMessage?.payload?.meta?.assistantMessageId, 'assistant_cursor_2')
  assert.deepEqual(assistantMessage?.payload?.meta?.finalDocument, doneEvent?.payload?.finalDocument)
  assert.equal(timeline.some((entry) => entry.kind === 'execution_reasoning_chunk'), true)
  assert.equal(timeline.some((entry) => entry.kind === 'execution_commentary_chunk'), true)
})

test('Cursor event mapper accepts distinct result text when no post-tool assistant segment arrives', () => {
  const sent = []
  const mapper = createCursorAgentEventMapper({
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: () => {},
    threadId: 'thread-1',
    turnId: 'turn-1',
    assistantMessageId: 'assistant_cursor_3',
  })

  mapper.handle({ kind: 'assistant_delta', text: 'I will inspect the project.' })
  mapper.handle({
    kind: 'tool_started',
    callId: 'call-1',
    toolCall: { readToolCall: { args: { path: 'README.md' } } },
  })
  mapper.handle({
    kind: 'tool_completed',
    callId: 'call-1',
    toolCall: {
      readToolCall: {
        args: { path: 'README.md' },
        result: { success: { content: '# Project' } },
      },
    },
  })
  mapper.handle({
    kind: 'result',
    sessionId: 'session-1',
    status: 'success',
    result: 'The README identifies the project.',
  })
  mapper.complete()

  assert.deepEqual(
    sent.filter((entry) => entry.channel === 'chat:assistant-commentary')
      .map((entry) => entry.payload.text),
    ['I will inspect the project.'],
  )
  const doneEvent = sent.find((entry) => entry.channel === 'chat:done')
  assert.equal(doneEvent?.payload.full, 'The README identifies the project.')
  assert.equal(doneEvent?.payload.assistantMessageId, 'assistant_cursor_3')
  assert.deepEqual(doneEvent?.payload.finalDocument?.parts?.map((part) => part.partId), ['assistant_cursor_3:final-document:1'])
})

test('Cursor event mapper records ordered provider-owned mutations with revision metadata', () => {
  const sent = []
  const recorded = []
  const mapper = createCursorAgentEventMapper({
    send: (channel, payload) => sent.push({ channel, payload }),
    projectPath: 'C:\\repo',
    recordFileChange: (change) => {
      recorded.push(change)
      return { newRevId: `revision-${recorded.length}`, prevRevId: '', rev: recorded.length }
    },
  })

  mapper.handle({
    kind: 'tool_completed',
    callId: 'create-1',
    toolCall: { writeToolCall: {
      args: { path: 'src/new.js', fileText: 'export const value = 1\n' },
      result: { success: { path: 'C:\\repo\\src\\new.js' } },
    } },
  })
  mapper.handle({
    kind: 'tool_completed',
    callId: 'edit-1',
    toolCall: { editToolCall: {
      args: { path: 'src/existing.js' },
      result: { success: {
        path: 'C:\\repo\\src\\existing.js',
        beforeFullFileContent: 'old\n',
        afterFullFileContent: 'new\n',
      } },
    } },
  })
  mapper.handle({
    kind: 'tool_completed',
    callId: 'delete-1',
    toolCall: { deleteToolCall: {
      args: { path: 'src/old.js' },
      result: { success: { path: 'C:\\repo\\src\\old.js', prevContent: 'obsolete\n' } },
    } },
  })

  assert.deepEqual(recorded.map(({ changeType, newContent, prevContent }) => ({ changeType, newContent, prevContent })), [
    { changeType: 'created', newContent: 'export const value = 1\n', prevContent: null },
    { changeType: 'modified', newContent: 'new\n', prevContent: 'old\n' },
    { changeType: 'deleted', newContent: '', prevContent: 'obsolete\n' },
  ])
  const changes = sent.filter((entry) => entry.channel === 'chat:file-change')
  assert.deepEqual(changes.map((entry) => entry.payload.newRevId), ['revision-1', 'revision-2', 'revision-3'])
  assert.equal(sent.filter((entry) => entry.channel === 'artifacts:updated').length, 3)
  assert.deepEqual(mapper.getToolResults().map((entry) => entry.fileChange.changeType), ['created', 'modified', 'deleted'])
  assert.equal(mapper.getToolResults().every((entry) => entry.providerOwned && entry.decision === 'provider_owned'), true)
})

test('Cursor event mapper surfaces file activity without claiming ADDOM approval', () => {
  const sent = []
  const mapper = createCursorAgentEventMapper({
    send: (channel, payload) => sent.push({ channel, payload }),
    projectPath: 'C:\\repo',
  })

  mapper.handle({
    kind: 'tool_completed',
    callId: 'write-1',
    toolCall: { writeToolCall: { args: { path: 'src/index.js' }, result: { success: {} } } },
  })

  const change = sent.find((entry) => entry.channel === 'chat:file-change')?.payload
  assert.equal(change.filePath, 'C:\\repo\\src\\index.js')
  assert.equal(change.source, 'cursor_agent')
  assert.equal(change.executionOwner, 'cursor')
  assert.equal(Object.hasOwn(change, 'decision'), false)
})

test('Cursor event mapper preserves live edit output for a newly created file', () => {
  const sent = []
  const mapper = createCursorAgentEventMapper({
    send: (channel, payload) => sent.push({ channel, payload }),
    projectPath: 'C:\\repo',
  })
  const diffString = [
    '--- /dev/null',
    '+++ b/C:\\repo\\calculator.py',
    '@@ -0,0 +1,2 @@',
    '+print("one")',
    '+print("two")',
  ].join('\n')

  mapper.handle({
    kind: 'tool_completed',
    callId: 'edit-create-1',
    toolCall: {
      editToolCall: {
        args: { path: 'calculator.py' },
        result: {
          success: {
            path: 'C:\\repo\\calculator.py',
            linesAdded: 2,
            linesRemoved: 1,
            diffString,
            afterFullFileContent: 'print("one")\nprint("two")\n',
          },
        },
      },
    },
  })

  const change = sent.find((entry) => entry.channel === 'chat:file-change')?.payload
  assert.equal(change.filePath, 'C:\\repo\\calculator.py')
  assert.equal(change.changeType, 'created')
  assert.equal(change.addedLines, 2)
  assert.equal(change.removedLines, 0)
  assert.equal(change.diffText, diffString)
})

test('Cursor event mapper derives delete counts from previous content when no diff is provided', () => {
  const sent = []
  const mapper = createCursorAgentEventMapper({
    send: (channel, payload) => sent.push({ channel, payload }),
    projectPath: 'C:\\repo',
  })

  mapper.handle({
    kind: 'tool_completed',
    callId: 'delete-with-content',
    toolCall: {
      deleteToolCall: {
        args: { path: 'src/old.txt' },
        result: {
          success: {
            path: 'C:\\repo\\src\\old.txt',
            prevContent: 'first\nsecond\n',
          },
        },
      },
    },
  })

  const change = sent.find((entry) => entry.channel === 'chat:file-change')?.payload
  assert.equal(change.changeType, 'deleted')
  assert.equal(change.addedLines, 0)
  assert.equal(change.removedLines, 2)
})

test('Cursor event mapper keeps multiple create, edit, and delete changes in completion order', () => {
  const sent = []
  const mapper = createCursorAgentEventMapper({
    send: (channel, payload) => sent.push({ channel, payload }),
    projectPath: 'C:\\repo',
  })

  mapper.handle({
    kind: 'tool_completed',
    callId: 'write-1',
    toolCall: {
      writeToolCall: {
        args: { path: 'src/new.js' },
        result: { success: { path: 'C:\\repo\\src\\new.js', linesAdded: 1, linesRemoved: 0 } },
      },
    },
  })
  mapper.handle({
    kind: 'tool_completed',
    callId: 'edit-1',
    toolCall: {
      editToolCall: {
        args: { path: 'src/existing.js' },
        result: {
          success: {
            path: 'C:\\repo\\src\\existing.js',
            diffString: ['--- a/src/existing.js', '+++ b/src/existing.js', '@@ -1 +1 @@', '-old', '+new'].join('\n'),
          },
        },
      },
    },
  })
  mapper.handle({
    kind: 'tool_completed',
    callId: 'delete-1',
    toolCall: {
      deleteToolCall: {
        args: { path: 'src/old.js' },
        result: {
          success: {
            path: 'C:\\repo\\src\\old.js',
            diffString: ['--- a/src/old.js', '+++ /dev/null', '@@ -1,2 +0,0 @@', '-old', '-content'].join('\n'),
          },
        },
      },
    },
  })

  const changes = sent.filter((entry) => entry.channel === 'chat:file-change').map((entry) => entry.payload)
  assert.deepEqual(
    changes.map(({ filePath, changeType, addedLines, removedLines }) => ({ filePath, changeType, addedLines, removedLines })),
    [
      { filePath: 'C:\\repo\\src\\new.js', changeType: 'created', addedLines: 1, removedLines: 0 },
      { filePath: 'C:\\repo\\src\\existing.js', changeType: 'modified', addedLines: 1, removedLines: 1 },
      { filePath: 'C:\\repo\\src\\old.js', changeType: 'deleted', addedLines: 0, removedLines: 2 },
    ],
  )
})

test('Cursor event mapper ignores failed mutations and paths outside the active project', () => {
  const sent = []
  const mapper = createCursorAgentEventMapper({
    send: (channel, payload) => sent.push({ channel, payload }),
    projectPath: 'C:\\repo',
  })

  mapper.handle({
    kind: 'tool_completed',
    callId: 'failed-write',
    toolCall: {
      writeToolCall: {
        args: { path: 'src/not-created.js' },
        result: { failure: { message: 'write failed' } },
      },
    },
  })
  mapper.handle({
    kind: 'tool_completed',
    callId: 'escaped-write',
    toolCall: {
      writeToolCall: {
        args: { path: '..\\outside.js' },
        result: { success: { path: 'C:\\outside.js', linesAdded: 1 } },
      },
    },
  })

  assert.equal(sent.filter((entry) => entry.channel === 'chat:file-change').length, 0)
})

test('Cursor event mapper does not classify file reads as mutations', () => {
  const sent = []
  const mapper = createCursorAgentEventMapper({
    send: (channel, payload) => sent.push({ channel, payload }),
    projectPath: 'C:\\repo',
  })

  mapper.handle({
    kind: 'tool_completed',
    callId: 'read-1',
    toolCall: {
      readFileToolCall: {
        args: { path: 'src/index.js' },
        result: { success: { path: 'C:\\repo\\src\\index.js', content: 'const value = 1' } },
      },
    },
  })

  assert.equal(sent.filter((entry) => entry.channel === 'chat:file-change').length, 0)
})

test('Cursor event mapper counts diff content that resembles file headers', () => {
  const sent = []
  const mapper = createCursorAgentEventMapper({
    send: (channel, payload) => sent.push({ channel, payload }),
    projectPath: 'C:\\repo',
  })

  mapper.handle({
    kind: 'tool_completed',
    callId: 'edit-header-like-lines',
    toolCall: {
      editToolCall: {
        args: { path: 'src/flags.txt' },
        result: {
          success: {
            diffString: [
              '--- a/src/flags.txt',
              '+++ b/src/flags.txt',
              '@@ -1 +1 @@',
              '---old-flag',
              '+++new-flag',
            ].join('\n'),
          },
        },
      },
    },
  })

  const change = sent.find((entry) => entry.channel === 'chat:file-change')?.payload
  assert.equal(change.addedLines, 1)
  assert.equal(change.removedLines, 1)
})
