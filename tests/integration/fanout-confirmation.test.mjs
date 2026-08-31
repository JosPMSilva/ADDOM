import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

import {
  applyFanoutDecision,
  evaluateFanoutConfirmation,
  requestAgentFanoutConfirmation,
} from '../../src/main/chat/fanout-confirmation.mjs'

function createIpcMainMock() {
  const emitter = new EventEmitter()
  return {
    on: (channel, handler) => emitter.on(channel, handler),
    removeListener: (channel, handler) => emitter.removeListener(channel, handler),
    emit: (channel, event, payload) => emitter.emit(channel, event, payload),
    listenerCount: (channel) => emitter.listenerCount(channel),
  }
}

test('fanout confirmation is count based and defaults to five agents', () => {
  assert.deepEqual(evaluateFanoutConfirmation({ requestedCount: 5 }), {
    requestedCount: 5,
    threshold: 5,
    shouldConfirm: false,
  })
  assert.deepEqual(evaluateFanoutConfirmation({ requestedCount: 12 }), {
    requestedCount: 12,
    threshold: 5,
    shouldConfirm: true,
  })
  assert.equal(evaluateFanoutConfirmation({
    requestedCount: 100,
    threshold: 100,
  }).shouldConfirm, false)
})

test('fanout decisions launch all, limit to the configured threshold, or stop the turn', () => {
  const tasks = Array.from({ length: 12 }, (_, index) => ({ task_id: `task_${index + 1}` }))
  assert.equal(applyFanoutDecision({ decision: 'launch_all', tasks, threshold: 5 }).tasks.length, 12)
  assert.equal(applyFanoutDecision({ decision: 'limit', tasks, threshold: 5 }).tasks.length, 5)
  assert.deepEqual(applyFanoutDecision({ decision: 'stop_turn', tasks, threshold: 5 }), {
    decision: 'stop_turn',
    tasks: [],
    limitedTaskCount: 0,
    stopTurn: true,
  })
})

test('fanout confirmation accepts only the three compact decisions and cleans up listeners', async () => {
  const ipcMain = createIpcMainMock()
  const sent = []
  const promise = requestAgentFanoutConfirmation({
    ipcMain,
    senderId: 41,
    send: (channel, payload) => sent.push({ channel, payload }),
    threadId: 'thread_1',
    turnId: 'turn_1',
    requestPayload: {
      stepId: 'step_1',
      requestedCount: 12,
      threshold: 5,
    },
  })

  assert.equal(sent[0].channel, 'agents:fanout-confirm-request')
  assert.equal(sent[0].payload.requestedCount, 12)
  assert.equal(sent[0].payload.threshold, 5)
  assert.ok(String(sent[0].payload.requestId).startsWith('agent_fanout_'))

  ipcMain.emit('v1:agents:fanout-confirm-response', { sender: { id: 41 } }, {
    requestId: sent[0].payload.requestId,
    decision: 'limit',
  })

  assert.deepEqual(await promise, { decision: 'limit' })
  assert.equal(ipcMain.listenerCount('agents:fanout-confirm-response'), 0)
  assert.equal(ipcMain.listenerCount('v1:agents:fanout-confirm-response'), 0)
})
