import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createWorkspaceTargetTransitionController,
} from '../../src/renderer/workspace-target-transition.mjs'

function createHarness({
  activeProjectId = 'project-a',
  dirtyTabs = [],
  activationResult = { project: { id: 'project-b' }, thread: { id: 'thread-b' } },
  saveResults = [],
  saveError = null,
} = {}) {
  const calls = []
  const controller = createWorkspaceTargetTransitionController({
    getActiveProjectId: () => activeProjectId,
    getDirtyTabs: () => dirtyTabs,
    activateWorkspaceTarget: async (target) => {
      calls.push(['activate', target])
      return activationResult
    },
    saveAllDirtyTabs: async () => {
      calls.push(['save'])
      if (saveError) throw saveError
      return saveResults
    },
    discardAllDirtyTabs: () => calls.push(['discard']),
    clearProjectPresentation: () => calls.push(['clear-presentation']),
    reportSaveFailure: async (failed) => calls.push(['save-failure', failed.map((row) => row.filePath)]),
    reportActivationFailure: async () => calls.push(['activation-failure']),
  })
  return { calls, controller }
}

test('same-project thread selection bypasses dirty confirmation and presentation cleanup', async () => {
  const dirtyTabs = [{ id: 'tab-a', filePath: 'src/a.js' }]
  const { calls, controller } = createHarness({
    dirtyTabs,
    activationResult: { project: { id: 'project-a' }, thread: { id: 'thread-2' } },
  })

  const result = await controller.requestTarget({ projectId: 'project-a', threadId: 'thread-2' })

  assert.equal(result?.thread?.id, 'thread-2')
  assert.deepEqual(calls, [['activate', {
    projectId: 'project-a',
    threadId: 'thread-2',
    createThread: false,
  }]])
  assert.deepEqual(controller.getState(), {
    busy: false,
    dirtyTabs: [],
    error: '',
    pendingTarget: null,
  })
})

test('clean cross-project target activates the exact intent then clears source presentation', async () => {
  const { calls, controller } = createHarness()

  const result = await controller.requestTarget({
    kind: 'create-thread',
    projectId: ' project-b ',
    threadId: 'ignored',
  })

  assert.equal(result?.project?.id, 'project-b')
  assert.deepEqual(calls, [
    ['activate', { projectId: 'project-b', threadId: '', createThread: true }],
    ['clear-presentation'],
  ])
})

test('rapid clean targets apply presentation only for the latest completed request', async () => {
  const pending = new Map()
  const calls = []
  const controller = createWorkspaceTargetTransitionController({
    getActiveProjectId: () => 'project-a',
    getDirtyTabs: () => [],
    activateWorkspaceTarget: (target) => new Promise((resolve) => {
      calls.push(['activate', target.projectId])
      pending.set(target.projectId, resolve)
    }),
    clearProjectPresentation: () => calls.push(['clear-presentation']),
    onTargetActivated: (result) => calls.push(['target-activated', result.project.id]),
    reportActivationFailure: async () => calls.push(['activation-failure']),
  })

  const first = controller.requestTarget({ projectId: 'project-b', threadId: 'thread-b' })
  const second = controller.requestTarget({ projectId: 'project-c', threadId: 'thread-c' })
  pending.get('project-c')({ project: { id: 'project-c' }, thread: { id: 'thread-c' } })
  assert.equal((await second)?.project?.id, 'project-c')
  pending.get('project-b')(null)
  assert.equal(await first, null)

  assert.deepEqual(calls, [
    ['activate', 'project-b'],
    ['activate', 'project-c'],
    ['clear-presentation'],
    ['target-activated', 'project-c'],
  ])
})

test('path-based project entry uses the same target coordinator and requests a fresh thread', async () => {
  const { calls, controller } = createHarness()

  const result = await controller.requestTarget({
    projectPath: ' C:/work/new-project ',
    createThread: true,
  })

  assert.equal(result?.project?.id, 'project-b')
  assert.deepEqual(calls, [
    ['activate', { projectId: '', projectPath: 'C:/work/new-project', threadId: '', createThread: true }],
    ['clear-presentation'],
  ])
})

test('dirty cross-project request captures a complete immutable target intent', async () => {
  const dirtyTabs = [{ id: 'tab-a', filePath: 'src/a.js' }]
  const target = { projectId: 'project-b', threadId: 'thread-b' }
  const { calls, controller } = createHarness({ dirtyTabs })

  const result = await controller.requestTarget(target)
  target.threadId = 'raced-thread'

  assert.equal(result, null)
  assert.deepEqual(calls, [])
  assert.deepEqual(controller.getState().pendingTarget, {
    projectId: 'project-b',
    threadId: 'thread-b',
    createThread: false,
  })
  assert.deepEqual(controller.getState().dirtyTabs, dirtyTabs)
})

test('Save continues only after every dirty tab saves successfully', async () => {
  const dirtyTabs = [{ id: 'tab-a', filePath: 'src/a.js' }]
  const { calls, controller } = createHarness({
    dirtyTabs,
    saveResults: [{ ok: true, filePath: 'src/a.js' }],
  })
  await controller.requestTarget({ projectId: 'project-b', threadId: 'thread-b' })

  const result = await controller.saveAndContinue()

  assert.equal(result?.thread?.id, 'thread-b')
  assert.deepEqual(calls, [
    ['save'],
    ['activate', { projectId: 'project-b', threadId: 'thread-b', createThread: false }],
    ['clear-presentation'],
  ])
  assert.equal(controller.getState().pendingTarget, null)
})

test('Save failure retains the exact pending target and never activates or clears presentation', async () => {
  const dirtyTabs = [{ id: 'tab-a', filePath: 'src/a.js' }]
  const { calls, controller } = createHarness({
    dirtyTabs,
    saveResults: [{ ok: false, filePath: 'src/a.js', error: 'denied' }],
  })
  await controller.requestTarget({ projectId: 'project-b', createThread: true })

  const result = await controller.saveAndContinue()

  assert.equal(result, null)
  assert.deepEqual(calls, [
    ['save'],
    ['save-failure', ['src/a.js']],
  ])
  assert.deepEqual(controller.getState().pendingTarget, {
    projectId: 'project-b',
    threadId: '',
    createThread: true,
  })
  assert.deepEqual(controller.getState().dirtyTabs, dirtyTabs)
  assert.match(controller.getState().error, /failed to save/i)
})

test('unexpected bulk-save rejection becomes a concise retryable failure', async () => {
  const dirtyTabs = [{ id: 'tab-a', filePath: 'src/a.js' }]
  const { calls, controller } = createHarness({
    dirtyTabs,
    saveError: new Error('disk unavailable'),
  })
  await controller.requestTarget({ projectId: 'project-b', threadId: 'thread-b' })

  const result = await controller.saveAndContinue()

  assert.equal(result, null)
  assert.deepEqual(calls, [
    ['save'],
    ['save-failure', ['src/a.js']],
  ])
  assert.match(controller.getState().error, /failed to save/i)
  assert.equal(controller.getState().pendingTarget?.threadId, 'thread-b')
  assert.equal(controller.getState().busy, false)
})

test('Discard uses editor discard semantics and continues to the captured target', async () => {
  const dirtyTabs = [{ id: 'tab-a', filePath: 'src/a.js' }]
  const { calls, controller } = createHarness({ dirtyTabs })
  await controller.requestTarget({ projectId: 'project-b', threadId: 'thread-b' })

  await controller.discardAndContinue()

  assert.deepEqual(calls, [
    ['discard'],
    ['activate', { projectId: 'project-b', threadId: 'thread-b', createThread: false }],
    ['clear-presentation'],
  ])
})

test('Discard is single-flight while target activation is pending', async () => {
  const dirtyTabs = [{ id: 'tab-a', filePath: 'src/a.js' }]
  let releaseActivation
  const activation = new Promise((resolve) => {
    releaseActivation = resolve
  })
  const calls = []
  const controller = createWorkspaceTargetTransitionController({
    getActiveProjectId: () => 'project-a',
    getDirtyTabs: () => dirtyTabs,
    activateWorkspaceTarget: async (target) => {
      calls.push(['activate', target])
      return activation
    },
    discardAllDirtyTabs: () => calls.push(['discard']),
    clearProjectPresentation: () => calls.push(['clear-presentation']),
  })
  await controller.requestTarget({ projectId: 'project-b', threadId: 'thread-b' })

  const first = controller.discardAndContinue()
  const second = controller.discardAndContinue()

  assert.equal(controller.getState().busy, true)
  assert.equal(await second, null)
  assert.deepEqual(calls, [
    ['discard'],
    ['activate', { projectId: 'project-b', threadId: 'thread-b', createThread: false }],
  ])

  releaseActivation({ project: { id: 'project-b' }, thread: { id: 'thread-b' } })
  await first
  assert.equal(controller.getState().busy, false)
})

test('Cancel leaves the route, dirty tabs, terminal presentation, and target activation untouched', async () => {
  const dirtyTabs = [{ id: 'tab-a', filePath: 'src/a.js' }]
  const { calls, controller } = createHarness({ dirtyTabs })
  await controller.requestTarget({ projectId: 'project-b', threadId: 'thread-b' })

  controller.cancel()

  assert.deepEqual(calls, [])
  assert.deepEqual(controller.getState(), {
    busy: false,
    dirtyTabs: [],
    error: '',
    pendingTarget: null,
  })
})

test('activation failure retains approved source presentation and never invokes cancellation APIs', async () => {
  const { calls, controller } = createHarness({ activationResult: null })

  const result = await controller.requestTarget({ projectId: 'project-b', threadId: 'thread-b' })

  assert.equal(result, null)
  assert.deepEqual(calls, [
    ['activate', { projectId: 'project-b', threadId: 'thread-b', createThread: false }],
    ['activation-failure'],
  ])
  assert.equal(calls.some(([name]) => /cancel|stop|abort/i.test(name)), false)
})
