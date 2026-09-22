import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let flushMatchingToolOutputBuffers = null
let createToolOutputBufferRuntime = null
let resolveTerminalStreamingNote = null
let isTerminalMemorySuggestionToolResult = null
let buildTurnStateActivity = null
let buildCancelledStreamingMessageContent = null

before(async () => {
  const bufferMod = await ssrLoadRendererModule('/components/chat/chat-event-bridge-tool-output-buffer.mjs')
  const turnMod = await ssrLoadRendererModule('/components/chat/chat-event-bridge-turn-state.mjs')
  flushMatchingToolOutputBuffers = bufferMod?.flushMatchingToolOutputBuffers || null
  createToolOutputBufferRuntime = bufferMod?.createToolOutputBufferRuntime || null
  resolveTerminalStreamingNote = turnMod?.resolveTerminalStreamingNote || null
  isTerminalMemorySuggestionToolResult = turnMod?.isTerminalMemorySuggestionToolResult || null
  buildTurnStateActivity = turnMod?.buildTurnStateActivity || null
  buildCancelledStreamingMessageContent = turnMod?.buildCancelledStreamingMessageContent || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('flushMatchingToolOutputBuffers scopes cancellation flushes to the matching turn', () => {
  assert.equal(typeof flushMatchingToolOutputBuffers, 'function')
  const buffers = new Map([
    ['turn-a:step-1:stdout', {
      threadId: 'thread-a',
      turnId: 'turn-a',
      stepId: 'step-1',
    }],
    ['turn-a:step-2:stderr', {
      threadId: 'thread-a',
      turnId: 'turn-a',
      stepId: 'step-2',
    }],
    ['turn-b:step-1:stdout', {
      threadId: 'thread-b',
      turnId: 'turn-b',
      stepId: 'step-1',
    }],
  ])
  const flushed = []

  const flushedCount = flushMatchingToolOutputBuffers(
    buffers,
    (key) => flushed.push(key),
    { threadId: 'thread-a', turnId: 'turn-a' },
  )

  assert.equal(flushedCount, 2)
  assert.deepEqual(flushed, ['turn-a:step-1:stdout', 'turn-a:step-2:stderr'])
})

test('flushMatchingToolOutputBuffers can target one step without touching sibling buffered output', () => {
  assert.equal(typeof flushMatchingToolOutputBuffers, 'function')
  const buffers = new Map([
    ['turn-c:step-1:stdout', {
      threadId: 'thread-c',
      turnId: 'turn-c',
      stepId: 'step-1',
    }],
    ['turn-c:step-2:stdout', {
      threadId: 'thread-c',
      turnId: 'turn-c',
      stepId: 'step-2',
    }],
  ])
  const flushed = []

  const flushedCount = flushMatchingToolOutputBuffers(
    buffers,
    (key) => flushed.push(key),
    { turnId: 'turn-c', stepId: 'step-2' },
  )

  assert.equal(flushedCount, 1)
  assert.deepEqual(flushed, ['turn-c:step-2:stdout'])
})

test('tool output buffering preserves stdout and stderr chronology within one flush interval', () => {
  const appended = []
  const runtime = createToolOutputBufferRuntime({
    useChatStore: {
      getState: () => ({
        appendLiveExecutionToolOutput: (payload) => appended.push(payload),
      }),
    },
  })

  runtime.queueToolOutputChunk({ turnId: 'turn-order', stepId: 'step-order', stream: 'stdout', chunk: 'A', sequence: 1, emittedAt: 101 })
  runtime.queueToolOutputChunk({ turnId: 'turn-order', stepId: 'step-order', stream: 'stderr', chunk: 'B', sequence: 2, emittedAt: 102 })
  runtime.queueToolOutputChunk({ turnId: 'turn-order', stepId: 'step-order', stream: 'stdout', chunk: 'C', sequence: 3, emittedAt: 103 })
  runtime.flushToolOutputBuffersByStep({ turnId: 'turn-order', stepId: 'step-order' })

  assert.deepEqual(appended.map(({ stream, chunk, sequence }) => ({ stream, chunk, sequence })), [
    { stream: 'stdout', chunk: 'A', sequence: 1 },
    { stream: 'stderr', chunk: 'B', sequence: 2 },
    { stream: 'stdout', chunk: 'C', sequence: 3 },
  ])
})

test('tool output buffering keeps burst callbacks bounded until the scheduled flush', () => {
  const appended = []
  const runtime = createToolOutputBufferRuntime({
    useChatStore: {
      getState: () => ({
        appendLiveExecutionToolOutput: (payload) => appended.push(payload),
      }),
    },
  })

  for (let sequence = 1; sequence <= 2_000; sequence += 1) {
    runtime.queueToolOutputChunk({
      turnId: 'turn-burst',
      stepId: 'step-burst',
      stream: 'stdout',
      chunk: `${sequence}:${'x'.repeat(1_594)}\n`,
      sequence,
      emittedAt: 100 + sequence,
    })
  }

  assert.equal(appended.length, 0)
  runtime.flushToolOutputBuffersByStep({ turnId: 'turn-burst', stepId: 'step-burst' })
  assert.ok(appended.length <= 2)
  assert.ok(appended.reduce((total, payload) => total + payload.chunk.length, 0) <= 66_000)
  assert.match(appended.at(-1).chunk, /2000:/)
})

test('resolveTerminalStreamingNote keeps cancelled turns readable without affecting successful completions', () => {
  assert.equal(typeof resolveTerminalStreamingNote, 'function')
  assert.equal(
    resolveTerminalStreamingNote('cancelled', { reason: 'User stopped the run.' }),
    'User stopped the run.',
  )
  assert.equal(
    resolveTerminalStreamingNote('cancelled', {}),
    'Stop requested. Stopping after current action.',
  )
  assert.equal(
    resolveTerminalStreamingNote('completed', { reason: 'ignored' }),
    '',
  )
})

test('buildCancelledStreamingMessageContent does not duplicate an existing stop note', () => {
  assert.equal(typeof buildCancelledStreamingMessageContent, 'function')
  const stopNote = 'Stop requested. Stopping after current action.'
  const content = `Partial output.\n\n[${stopNote}]`

  assert.equal(
    buildCancelledStreamingMessageContent(content, stopNote),
    content,
  )
})

test('isTerminalMemorySuggestionToolResult only marks approved structured terminal suggestion results', () => {
  assert.equal(typeof isTerminalMemorySuggestionToolResult, 'function')
  assert.equal(isTerminalMemorySuggestionToolResult({
    toolName: 'terminal_memory_suggest',
    decision: 'approved',
    isError: false,
  }), true)
  assert.equal(isTerminalMemorySuggestionToolResult({
    toolName: 'terminal_memory_suggest',
    decision: 'denied',
    isError: false,
  }), false)
  assert.equal(isTerminalMemorySuggestionToolResult({
    toolName: 'question_user',
    decision: 'approved',
    isError: false,
  }), false)
})

test('buildTurnStateActivity preserves terminal error completions as explicit turn events', () => {
  assert.equal(typeof buildTurnStateActivity, 'function')
  const activity = buildTurnStateActivity('completed', {
    threadId: 'thread-error',
    turnId: 'turn-error',
    status: 'error',
    reason: 'Error: boom',
    finishedAt: 150,
  })

  assert.deepEqual(activity, {
    type: 'turn',
    threadId: 'thread-error',
    turnId: 'turn-error',
    eventKind: 'turn_completed',
    turnState: 'completed',
    turnStatus: 'error',
    label: 'Turn completed (error)',
    detail: 'reason: Error: boom',
    createdAt: 150,
    updatedAt: 150,
  })
})
