import test from 'node:test'
import assert from 'node:assert/strict'

import {
  PROGRESSIVE_EXECUTION_PERSIST_INTERVAL_MS,
  createProgressiveExecutionChunkWriter,
} from '../../src/main/chat/chat-stream-progressive-chunks.mjs'

function createFakeClock(start = 1_000) {
  let current = start
  let nextTimerId = 1
  const timers = new Map()

  const runDueTimers = () => {
    while (true) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.dueAt <= current)
        .sort((left, right) => left[1].dueAt - right[1].dueAt)[0]
      if (!due) return
      const [timerId, timer] = due
      timers.delete(timerId)
      timer.callback()
    }
  }

  return {
    now: () => current,
    setTimer(callback, delay) {
      const timerId = nextTimerId
      nextTimerId += 1
      timers.set(timerId, { callback, dueAt: current + Math.max(0, Number(delay) || 0) })
      return timerId
    },
    clearTimer(timerId) {
      timers.delete(timerId)
    },
    advance(milliseconds) {
      current += Math.max(0, Number(milliseconds) || 0)
      runDueTimers()
    },
    pendingTimerCount: () => timers.size,
  }
}

function createWriterHarness() {
  const clock = createFakeClock()
  const persisted = []
  const writer = createProgressiveExecutionChunkWriter({
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    threadId: 'thread_progressive',
    turnId: 'turn_progressive',
    assistantMessageId: 'assistant_progressive',
    round: 1,
    providerId: 'openai',
    model: 'gpt-test',
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  })
  return { clock, persisted, writer }
}

test('progressive execution persistence coalesces cumulative snapshots at a bounded cadence', () => {
  const { clock, persisted, writer } = createWriterHarness()
  let content = ''

  for (let sequence = 1; sequence <= 1_000; sequence += 1) {
    content += '0123456789'
    writer.write('execution_reasoning_chunk', {
      content,
      sequence,
      reasoningSegment: 0,
    })
  }

  assert.equal(persisted.length, 1)
  assert.equal(clock.pendingTimerCount(), 1)
  clock.advance(PROGRESSIVE_EXECUTION_PERSIST_INTERVAL_MS)
  assert.equal(persisted.length, 2)
  assert.equal(persisted[1].payload.content, content)

  writer.settle({
    reasoningContent: content,
    reasoningSequence: 1_000,
    reasoningSegment: 0,
    lifecycle: 'completed',
  })

  assert.equal(persisted.length, 3)
  assert.deepEqual(persisted.map((entry) => entry.payload.lifecycle), ['active', 'active', 'completed'])
  const persistedContentCharacters = persisted.reduce(
    (total, entry) => total + entry.payload.content.length,
    0,
  )
  assert.ok(persistedContentCharacters <= 20_010)
})

test('progressive execution persistence flushes the previous phase before a new segment', () => {
  const { persisted, writer } = createWriterHarness()

  writer.write('execution_reasoning_chunk', {
    content: 'Phase zero.', sequence: 1, reasoningSegment: 0,
  })
  writer.write('execution_reasoning_chunk', {
    content: 'Phase zero complete.', sequence: 2, reasoningSegment: 0,
  })
  writer.write('execution_reasoning_chunk', {
    content: 'Phase one.', sequence: 3, reasoningSegment: 1,
  })

  assert.deepEqual(
    persisted.map((entry) => [entry.payload.progressiveKey, entry.payload.content]),
    [
      ['execution_reasoning:1:0', 'Phase zero.'],
      ['execution_reasoning:1:0', 'Phase zero complete.'],
      ['execution_reasoning:1:1', 'Phase one.'],
    ],
  )
})

test('progressive execution terminal settlement supersedes the pending preview immediately', () => {
  const { clock, persisted, writer } = createWriterHarness()

  writer.write('execution_commentary_chunk', {
    content: 'Checking.', phase: 'commentary', sequence: 1, reasoningSegment: 0,
  })
  writer.write('execution_commentary_chunk', {
    content: 'Checking the result.', phase: 'commentary', sequence: 2, reasoningSegment: 0,
  })
  writer.settle({
    commentaryContent: 'Checking the result.',
    commentarySequence: 2,
    commentarySegment: 0,
    lifecycle: 'failed',
  })

  assert.equal(clock.pendingTimerCount(), 0)
  assert.deepEqual(
    persisted.map((entry) => [entry.payload.lifecycle, entry.payload.content]),
    [
      ['active', 'Checking.'],
      ['failed', 'Checking the result.'],
    ],
  )
})

test('progressive execution writer can flush a pending preview before shutdown', () => {
  const { clock, persisted, writer } = createWriterHarness()

  writer.write('execution_reasoning_chunk', {
    content: 'First.', sequence: 1, reasoningSegment: 0,
  })
  writer.write('execution_reasoning_chunk', {
    content: 'First. Second.', sequence: 2, reasoningSegment: 0,
  })
  writer.flush()

  assert.equal(clock.pendingTimerCount(), 0)
  assert.equal(persisted.length, 2)
  assert.equal(persisted[1].payload.content, 'First. Second.')
})

test('progressive execution writer surfaces a deferred timer persistence failure at settlement', () => {
  const clock = createFakeClock()
  let persistenceCalls = 0
  const writer = createProgressiveExecutionChunkWriter({
    persistTimelineEvent() {
      persistenceCalls += 1
      if (persistenceCalls === 2) throw new Error('simulated persistence failure')
    },
    threadId: 'thread_failure',
    turnId: 'turn_failure',
    round: 1,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  })

  writer.write('execution_reasoning_chunk', {
    content: 'First.', sequence: 1, reasoningSegment: 0,
  })
  writer.write('execution_reasoning_chunk', {
    content: 'First. Second.', sequence: 2, reasoningSegment: 0,
  })
  clock.advance(PROGRESSIVE_EXECUTION_PERSIST_INTERVAL_MS)

  assert.throws(() => writer.settle({
    reasoningContent: 'First. Second.',
    reasoningSequence: 2,
    reasoningSegment: 0,
    lifecycle: 'completed',
  }), /simulated persistence failure/)
})
