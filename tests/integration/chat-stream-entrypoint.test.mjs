import test from 'node:test'
import assert from 'node:assert/strict'

const entrypoint = await import('../../src/main/ipc-handlers/chat-stream-entrypoint.mjs').catch(() => ({}))

test('chat stream entrypoint converts setup exceptions into a canonical failed turn and settles an orphaned run', async () => {
  assert.equal(typeof entrypoint.runChatStreamWithFailureBoundary, 'function')

  const run = { loopKey: '7:thread-1', threadId: 'thread-1', turnId: 'turn-1' }
  const committed = []
  const settled = []
  await entrypoint.runChatStreamWithFailureBoundary({
    event: { sender: { id: 7, isDestroyed: () => false } },
    payload: {
      projectId: 'project-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      assistantMessageId: 'assistant-1',
      providerId: 'openai',
      model: 'gpt-test',
    },
    runRegistry: {
      select: () => [run],
      settle: (loopKey, activeRun) => settled.push({ loopKey, activeRun }),
    },
    handleStream: async () => {
      throw new Error('delivery setup exploded')
    },
    createDelivery: () => ({
      commitFailureTurn: (failure) => committed.push(failure),
    }),
  })

  assert.equal(committed.length, 1)
  assert.equal(committed[0].message, 'ADDOM could not start this turn. Please try again.')
  assert.match(committed[0].reason, /chat_stream_setup_failure.*delivery setup exploded/i)
  assert.equal(committed[0].errorMeta.failureStage, 'stream_setup')
  assert.deepEqual(settled, [{ loopKey: '7:thread-1', activeRun: run }])
})

test('chat stream entrypoint does not emit a fallback failure after a successful stream', async () => {
  assert.equal(typeof entrypoint.runChatStreamWithFailureBoundary, 'function')
  let failureDeliveries = 0

  await entrypoint.runChatStreamWithFailureBoundary({
    event: { sender: { id: 7, isDestroyed: () => false } },
    payload: { threadId: 'thread-1', turnId: 'turn-1' },
    runRegistry: { select: () => [] },
    handleStream: async () => {},
    createDelivery: () => {
      failureDeliveries += 1
      return { commitFailureTurn: () => {} }
    },
  })

  assert.equal(failureDeliveries, 0)
})

test('chat stream entrypoint assigns one turn id when the payload omits it', async () => {
  assert.equal(typeof entrypoint.runChatStreamWithFailureBoundary, 'function')
  let handledTurnId = ''
  let reportedTurnId = ''

  await entrypoint.runChatStreamWithFailureBoundary({
    event: { sender: { id: 7, isDestroyed: () => false } },
    payload: { threadId: 'thread-1' },
    runRegistry: { select: () => [], settle: () => {} },
    handleStream: async (_event, payload) => {
      handledTurnId = payload.turnId
      throw new Error('setup failed after run registration')
    },
    createDelivery: ({ activeTurnId }) => {
      reportedTurnId = activeTurnId
      return { commitFailureTurn: () => {} }
    },
  })

  assert.match(handledTurnId, /^turn_setup_/)
  assert.equal(reportedTurnId, handledTurnId)
})
