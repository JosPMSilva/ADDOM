import test from 'node:test'
import assert from 'node:assert/strict'

import { createTurnLifecycle } from '../../src/main/chat/turn-lifecycle.mjs'

test('createTurnLifecycle emits started and completed turn state with stable startedAt and a single finalization', () => {
  const sent = []
  const persisted = []
  const loop = { cancellationSent: false, turnStateFinalized: false }
  const { sendTurnState } = createTurnLifecycle({
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    loop,
    threadId: 'thread-1',
    turnId: 'turn-1',
    mode: 'execute',
  })

  sendTurnState('started', { startedAt: 1234 })
  sendTurnState('completed', { status: 'ok', startedAt: 1234, finishedAt: 4321 })
  sendTurnState('completed', { status: 'ignored', startedAt: 1234, finishedAt: 9999 })

  assert.equal(loop.turnStateFinalized, true)
  assert.equal(sent.length, 2)
  assert.deepEqual(sent.map((row) => row.channel), ['chat:turn-state', 'chat:turn-state'])
  assert.equal(sent[0].payload.state, 'started')
  assert.equal(sent[0].payload.startedAt, 1234)
  assert.equal(sent[1].payload.state, 'completed')
  assert.equal(sent[1].payload.startedAt, 1234)
  assert.equal(sent[1].payload.finishedAt, 4321)
  assert.equal(persisted.length, 2)
  assert.equal(persisted[0].kind, 'turn_started')
  assert.equal(persisted[1].kind, 'turn_completed')
})

test('createTurnLifecycle sendCancelled emits cancelled state and chat_cancelled only once', () => {
  const sent = []
  const persisted = []
  const loop = { cancellationSent: false, turnStateFinalized: false }
  const { sendCancelled } = createTurnLifecycle({
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    loop,
    threadId: 'thread-2',
    turnId: 'turn-2',
    mode: 'plan',
  })

  sendCancelled('Stop requested. Stopping after current action.')
  sendCancelled('Should be ignored')

  assert.equal(loop.cancellationSent, true)
  assert.equal(loop.turnStateFinalized, true)
  assert.equal(sent.length, 2)
  assert.deepEqual(sent.map((row) => row.channel), ['chat:cancelled', 'chat:turn-state'])
  assert.equal(sent[0].payload.reason, 'Stop requested. Stopping after current action.')
  assert.equal(sent[1].payload.state, 'cancelled')
  assert.equal(sent[1].payload.status, 'cancelled')
  assert.equal(persisted.length, 2)
  assert.equal(persisted[0].kind, 'chat_cancelled')
  assert.equal(persisted[1].kind, 'turn_cancelled')
})

test('createTurnLifecycle ignores empty state names', () => {
  const sent = []
  const persisted = []
  const loop = { cancellationSent: false, turnStateFinalized: false }
  const { sendTurnState } = createTurnLifecycle({
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    loop,
    threadId: 'thread-3',
    turnId: 'turn-3',
  })

  sendTurnState('')
  sendTurnState('   ')

  assert.equal(sent.length, 0)
  assert.equal(persisted.length, 0)
  assert.equal(loop.turnStateFinalized, false)
})

test('createTurnLifecycle emits non-final phase states without finalizing the turn', () => {
  const sent = []
  const persisted = []
  const loop = { cancellationSent: false, turnStateFinalized: false }
  const { sendTurnState } = createTurnLifecycle({
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    loop,
    threadId: 'thread-phase',
    turnId: 'turn-phase',
  })

  sendTurnState('model_streaming', { status: 'model_streaming', label: 'model streaming', startedAt: 123 })
  sendTurnState('running_tool', { status: 'running_tool', toolName: 'run_command', startedAt: 123 })
  sendTurnState('completed', { status: 'ok', startedAt: 123, finishedAt: 456 })

  assert.equal(loop.turnStateFinalized, true)
  assert.deepEqual(sent.map((row) => row.payload.state), ['model_streaming', 'running_tool', 'completed'])
  assert.deepEqual(persisted.map((row) => row.kind), ['turn_phase', 'turn_phase', 'turn_completed'])
  assert.equal(sent[0].payload.startedAt, 123)
  assert.equal(sent[1].payload.startedAt, 123)
  assert.equal(sent[2].payload.finishedAt, 456)
})

test('createTurnLifecycle persists each state before projection and surfaces persistence failure', () => {
  const order = []
  const loop = { cancellationSent: false, turnStateFinalized: false }
  const { sendTurnState } = createTurnLifecycle({
    send: (channel) => order.push(`send:${channel}`),
    persistTimelineEvent: (kind) => order.push(`persist:${kind}`),
    loop,
    threadId: 'thread-order',
    turnId: 'turn-order',
  })

  sendTurnState('started', { startedAt: 123 })
  assert.deepEqual(order, ['persist:turn_started', 'send:chat:turn-state'])

  const failedOrder = []
  const failedLoop = { cancellationSent: false, turnStateFinalized: false }
  const failed = createTurnLifecycle({
    send: (channel) => failedOrder.push(`send:${channel}`),
    persistTimelineEvent: (kind) => {
      failedOrder.push(`persist:${kind}`)
      throw new Error('ledger unavailable')
    },
    loop: failedLoop,
    threadId: 'thread-failure',
    turnId: 'turn-failure',
  })

  assert.throws(() => failed.sendTurnState('completed', { status: 'ok' }), /ledger unavailable/i)
  assert.deepEqual(failedOrder, ['persist:turn_completed'])
  assert.equal(failedLoop.turnStateFinalized, false)
})
