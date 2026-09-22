import test from 'node:test'
import assert from 'node:assert/strict'

import { createApplicationUpdateInstallCoordinator } from '../../src/main/updater/application-update-install-coordinator.mjs'

function blocker(label = '1 task is still running') {
  return { kind: 'running-task', label }
}

test('install coordinator refuses before quiescence when work is active', async () => {
  const calls = []
  const coordinator = createApplicationUpdateInstallCoordinator({
    collectBlockers: async () => {
      calls.push('collect')
      return [blocker()]
    },
    beginQuiescence: () => { calls.push('quiesce') },
    prepareForExit: async () => { calls.push('prepare') },
  })

  const result = await coordinator.run({
    rendererPreflight: { dirtyTabCount: 0, capturedAt: 1_000 },
    install: async () => { calls.push('install') },
  })

  assert.deepEqual(result, { ok: false, code: 'not_idle', blockers: [blocker()] })
  assert.deepEqual(calls, ['collect'])
})

test('install coordinator closes the race with a second idle check under quiescence', async () => {
  const calls = []
  let checks = 0
  let released = 0
  const coordinator = createApplicationUpdateInstallCoordinator({
    collectBlockers: async () => {
      calls.push('collect')
      checks += 1
      return checks === 1 ? [] : [blocker('A task started during preflight')]
    },
    beginQuiescence: () => {
      calls.push('quiesce')
      return { release: () => { released += 1 } }
    },
    prepareForExit: async () => { calls.push('prepare') },
  })

  const result = await coordinator.run({
    rendererPreflight: { dirtyTabCount: 0, capturedAt: 1_000 },
    install: async () => { calls.push('install') },
  })

  assert.equal(result.ok, false)
  assert.equal(result.code, 'not_idle')
  assert.deepEqual(calls, ['collect', 'quiesce', 'collect'])
  assert.equal(released, 1)
})

test('install coordinator prepares shutdown immediately before invoking installer', async () => {
  const calls = []
  let released = 0
  const coordinator = createApplicationUpdateInstallCoordinator({
    collectBlockers: async ({ rendererPreflight }) => {
      calls.push(['collect', rendererPreflight])
      return []
    },
    beginQuiescence: () => {
      calls.push(['quiesce'])
      return { release: () => { released += 1 } }
    },
    prepareForExit: async () => { calls.push(['prepare']) },
  })
  const rendererPreflight = { dirtyTabCount: 0, capturedAt: 1_000 }

  const result = await coordinator.run({
    rendererPreflight,
    onQuiesced: async () => { calls.push(['locked']) },
    install: async () => {
      calls.push(['install'])
      return { ok: true }
    },
  })

  assert.deepEqual(result, { ok: true })
  assert.deepEqual(calls, [
    ['collect', rendererPreflight],
    ['quiesce'],
    ['collect', rendererPreflight],
    ['locked'],
    ['prepare'],
    ['install'],
  ])
  assert.equal(released, 0)
})

test('install coordinator releases quiescence when shutdown preparation or install fails', async () => {
  for (const failingStep of ['prepare', 'install']) {
    let released = 0
    const coordinator = createApplicationUpdateInstallCoordinator({
      collectBlockers: async () => [],
      beginQuiescence: () => ({ release: () => { released += 1 } }),
      prepareForExit: async () => {
        if (failingStep === 'prepare') throw new Error('private preparation failure')
      },
    })

    await assert.rejects(coordinator.run({
      rendererPreflight: { dirtyTabCount: 0, capturedAt: 1_000 },
      install: async () => {
        if (failingStep === 'install') throw new Error('private installer failure')
        return { ok: true }
      },
    }))
    assert.equal(released, 1, failingStep)
  }
})

