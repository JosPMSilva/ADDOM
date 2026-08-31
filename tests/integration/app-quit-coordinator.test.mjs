import test from 'node:test'
import assert from 'node:assert/strict'

import { createAppQuitCoordinator } from '../../src/main/app-quit-coordinator.mjs'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function flushTasks() {
  return new Promise((resolve) => setImmediate(resolve))
}

test('prevents the first quit, settles runs, closes resources, then quits once', async () => {
  const preparation = deferred()
  const calls = []
  const app = { quit: () => calls.push('quit') }
  const coordinator = createAppQuitCoordinator({
    app,
    prepareRuntime: async () => {
      calls.push('prepare')
      await preparation.promise
    },
    closeResources: async () => calls.push('close'),
    timeoutMs: 1000,
  })
  const event = { prevented: 0, preventDefault() { this.prevented += 1 } }

  coordinator.handleBeforeQuit(event)
  coordinator.handleBeforeQuit(event)
  await Promise.resolve()
  assert.equal(event.prevented, 2)
  assert.deepEqual(calls, ['prepare'])

  preparation.resolve()
  await coordinator.prepareForExit()
  await flushTasks()

  assert.deepEqual(calls, ['prepare', 'close', 'quit'])
  const finalEvent = { prevented: 0, preventDefault() { this.prevented += 1 } }
  coordinator.handleBeforeQuit(finalEvent)
  assert.equal(finalEvent.prevented, 0)
  assert.deepEqual(calls, ['prepare', 'close', 'quit'])
})

test('direct preparation is shared with profile reset and does not request quit', async () => {
  const calls = []
  const coordinator = createAppQuitCoordinator({
    app: { quit: () => calls.push('quit') },
    prepareRuntime: async () => calls.push('prepare'),
    closeResources: async () => calls.push('close'),
    timeoutMs: 1000,
  })

  await Promise.all([coordinator.prepareForExit(), coordinator.prepareForExit()])
  assert.deepEqual(calls, ['prepare', 'close'])
})

test('bounded preparation still closes resources and completes the quit sequence', async () => {
  const calls = []
  const coordinator = createAppQuitCoordinator({
    app: { quit: () => calls.push('quit') },
    prepareRuntime: () => new Promise(() => {}),
    closeResources: async () => calls.push('close'),
    timeoutMs: 5,
  })
  const event = { preventDefault() { calls.push('prevent') } }

  coordinator.handleBeforeQuit(event)
  await new Promise((resolve) => setTimeout(resolve, 20))

  assert.deepEqual(calls, ['prevent', 'close', 'quit'])
})

test('runtime preparation failure does not skip resource cleanup', async () => {
  const calls = []
  const coordinator = createAppQuitCoordinator({
    app: { quit: () => calls.push('quit') },
    prepareRuntime: async () => { throw new Error('settlement failed') },
    closeResources: async () => calls.push('close'),
    timeoutMs: 1000,
  })

  await assert.rejects(coordinator.prepareForExit(), /settlement failed/)
  assert.deepEqual(calls, ['close'])
})
