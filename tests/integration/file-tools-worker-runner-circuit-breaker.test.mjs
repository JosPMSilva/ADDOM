import test from 'node:test'
import assert from 'node:assert/strict'

import {
  __createFileToolInputSignatureForTests,
  __getFileToolWorkerCircuitStateForTests,
  __recordFileToolWorkerFailureForTests,
  __resetFileToolWorkerRunnerForTests,
  runFileToolInWorker,
} from '../../src/main/tools/file-tools-worker-runner.mjs'

test.beforeEach(() => {
  __resetFileToolWorkerRunnerForTests()
})

test.after(() => {
  __resetFileToolWorkerRunnerForTests()
})

test('worker circuit opens after repeated failures', async () => {
  __recordFileToolWorkerFailureForTests('boom-a')
  __recordFileToolWorkerFailureForTests('boom-b')
  __recordFileToolWorkerFailureForTests('boom-c')

  const state = __getFileToolWorkerCircuitStateForTests()
  assert.equal(state.isCircuitOpen, true)
  assert.equal(state.failuresInWindow >= 3, true)
  assert.equal(state.lastFailureReason, 'boom-c')

  await assert.rejects(
    () => runFileToolInWorker('list_directory', '.', { path: '.' }),
    /file_tools_worker_temporarily_disabled/,
  )
})

test('worker circuit reset re-enables worker path', () => {
  __recordFileToolWorkerFailureForTests('boom-a')
  __recordFileToolWorkerFailureForTests('boom-b')
  __recordFileToolWorkerFailureForTests('boom-c')
  assert.equal(__getFileToolWorkerCircuitStateForTests().isCircuitOpen, true)

  __resetFileToolWorkerRunnerForTests()
  const state = __getFileToolWorkerCircuitStateForTests()
  assert.equal(state.isCircuitOpen, false)
  assert.equal(state.failuresInWindow, 0)
})

test('worker cooldown escalates with repeated circuit trips', () => {
  __recordFileToolWorkerFailureForTests('trip-1a', { nowMs: 1_000 })
  __recordFileToolWorkerFailureForTests('trip-1b', { nowMs: 2_000 })
  __recordFileToolWorkerFailureForTests('trip-1c', { nowMs: 3_000 })
  const firstTrip = __getFileToolWorkerCircuitStateForTests(3_000)
  assert.equal(firstTrip.isCircuitOpen, true)
  assert.equal(firstTrip.cooldownLevel >= 1, true)
  const firstDisabledUntil = Number(firstTrip.disabledUntilMs || 0)

  __recordFileToolWorkerFailureForTests('trip-2a', { nowMs: 4_000 })
  __recordFileToolWorkerFailureForTests('trip-2b', { nowMs: 5_000 })
  __recordFileToolWorkerFailureForTests('trip-2c', { nowMs: 6_000 })
  const secondTrip = __getFileToolWorkerCircuitStateForTests(6_000)
  assert.equal(secondTrip.isCircuitOpen, true)
  assert.equal(secondTrip.cooldownLevel > firstTrip.cooldownLevel, true)
  assert.equal(Number(secondTrip.disabledUntilMs || 0) > firstDisabledUntil, true)
})

test('repeated deterministic input failures quarantine matching worker input signature', async () => {
  const baseNow = Date.now()
  const signature = __createFileToolInputSignatureForTests('list_directory', '.', { path: './same-input' })
  __recordFileToolWorkerFailureForTests('sig-fail-1', { signature, nowMs: baseNow })
  __recordFileToolWorkerFailureForTests('sig-fail-2', { signature, nowMs: baseNow + 31_000 })
  __recordFileToolWorkerFailureForTests('sig-fail-3', { signature, nowMs: baseNow + 62_000 })

  const state = __getFileToolWorkerCircuitStateForTests(baseNow + 62_000)
  const quarantined = Array.isArray(state.quarantinedInputs)
    ? state.quarantinedInputs.find((entry) => entry.signature === signature)
    : null
  assert.ok(quarantined)
  assert.equal(Number(quarantined.remainingMs || 0) > 0, true)

  await assert.rejects(
    () => runFileToolInWorker('list_directory', '.', { path: './same-input' }),
    /file_tools_worker_input_quarantined/,
  )
})
