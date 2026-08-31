import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createManagedRuntimeLifecycle,
} from '../../src/main/agents/agent-managed-runtime-lifecycle.mjs'

test('managed runtime lifecycle reconciles before work and owns heartbeat/reaper timers', async () => {
  const order = []
  const heartbeats = []
  const timers = []
  const cleared = []
  const scheduler = {
    heartbeat(attemptId) {
      heartbeats.push(attemptId)
      return true
    },
  }
  const lifecycle = createManagedRuntimeLifecycle({
    scheduler,
    orphanReaper: {
      reap(options) {
        order.push(options?.includeUnregisteredReservations ? 'startup_reap' : 'periodic_reap')
        return []
      },
    },
    async ensureWorkspaceRecovery() {
      order.push('workspace_recovery')
      return []
    },
    recoverProjections() {
      order.push('projection_recovery')
      return []
    },
    setIntervalFn(callback, delay) {
      const timer = {
        callback,
        delay,
        unrefCalled: false,
        unref() {
          this.unrefCalled = true
        },
      }
      timers.push(timer)
      return timer
    },
    clearIntervalFn(timer) {
      cleared.push(timer)
    },
    heartbeatIntervalMs: 10,
    reapIntervalMs: 20,
  })

  await lifecycle.start()
  assert.deepEqual(order, [
    'workspace_recovery',
    'startup_reap',
    'projection_recovery',
  ])
  assert.deepEqual(timers.map((timer) => timer.delay), [10, 20])
  assert.equal(timers.every((timer) => timer.unrefCalled), true)

  lifecycle.trackAttempt('attempt_01')
  timers[0].callback()
  timers[1].callback()
  assert.deepEqual(heartbeats, ['attempt_01'])
  assert.equal(order.at(-1), 'periodic_reap')

  lifecycle.untrackAttempt('attempt_01')
  timers[0].callback()
  assert.deepEqual(heartbeats, ['attempt_01'])

  lifecycle.stop()
  assert.deepEqual(cleared, timers)
})

test('managed runtime lifecycle start is idempotent', async () => {
  let recoveries = 0
  const lifecycle = createManagedRuntimeLifecycle({
    scheduler: { heartbeat: () => true },
    orphanReaper: { reap: () => [] },
    ensureWorkspaceRecovery: async () => {
      recoveries += 1
      return []
    },
    recoverProjections: () => [],
    setIntervalFn: () => ({ unref() {} }),
    clearIntervalFn: () => {},
  })

  await Promise.all([lifecycle.start(), lifecycle.start()])

  assert.equal(recoveries, 1)
  lifecycle.stop()
})
