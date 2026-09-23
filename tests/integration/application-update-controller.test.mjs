import test from 'node:test'
import assert from 'node:assert/strict'

import { createApplicationUpdateController } from '../../src/main/updater/application-update-controller.mjs'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function createFakeTimers() {
  let nextId = 0
  const timers = new Map()
  return {
    setTimer(callback, delay) {
      nextId += 1
      timers.set(nextId, { callback, delay })
      return nextId
    },
    clearTimer(id) {
      timers.delete(id)
    },
    pendingCount: () => timers.size,
    pendingDelays: () => [...timers.values()].map(({ delay }) => delay),
    async runNext() {
      const entry = timers.entries().next().value
      assert.ok(entry, 'expected a scheduled timer')
      const [id, timer] = entry
      timers.delete(id)
      return timer.callback()
    },
  }
}

function createFakeAdapter(overrides = {}) {
  return {
    simulation: false,
    classifyError: (error) => error?.code || 'generic',
    checkForUpdates: async () => ({ available: false }),
    downloadUpdate: async () => ({ version: '99.0.0-dev' }),
    installUpdate: async () => ({ ok: true }),
    dispose() {},
    ...overrides,
  }
}

test('controller schedules the next check only after the current check settles', async () => {
  const pending = deferred()
  const timers = createFakeTimers()
  const controller = createApplicationUpdateController({
    adapter: createFakeAdapter({ checkForUpdates: () => pending.promise }),
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    checkIntervalMs: 1_800_000,
    launchDelayMs: 10_000,
  })

  controller.start()
  assert.deepEqual(timers.pendingDelays(), [10_000])
  const launchCheck = timers.runNext()
  assert.equal(timers.pendingCount(), 0)
  pending.resolve({ available: false })
  await launchCheck
  assert.deepEqual(timers.pendingDelays(), [1_800_000])
})

test('controller rejects overlapping checks and downloads', async () => {
  const pending = deferred()
  const controller = createApplicationUpdateController({
    adapter: createFakeAdapter({ checkForUpdates: () => pending.promise }),
  })

  const first = controller.checkForUpdates()
  assert.deepEqual(await controller.checkForUpdates(), { ok: false, code: 'operation_in_progress' })
  assert.deepEqual(await controller.downloadUpdate(), { ok: false, code: 'operation_in_progress' })
  pending.resolve({ available: false })
  assert.equal((await first).ok, true)
})

test('controller publishes revisioned download progress and ready state', async () => {
  const snapshots = []
  const controller = createApplicationUpdateController({
    adapter: createFakeAdapter({
      checkForUpdates: async () => ({ available: true, version: '99.0.0-dev' }),
      downloadUpdate: async ({ onProgress }) => {
        onProgress(25.2)
        onProgress(71.7)
        return { version: '99.0.0-dev' }
      },
    }),
    now: (() => {
      let value = 100
      return () => value += 100
    })(),
    onStateChanged: (snapshot) => snapshots.push(snapshot),
  })

  await controller.checkForUpdates()
  const result = await controller.downloadUpdate()

  assert.equal(result.ok, true)
  assert.equal(controller.getSnapshot().phase, 'ready')
  assert.equal(controller.getSnapshot().progressPercent, 100)
  assert.deepEqual(snapshots.map(({ revision }) => revision), [1, 2, 3, 4, 5, 6])
  assert.deepEqual(snapshots.map(({ progressPercent }) => progressPercent), [0, 0, 0, 25, 72, 100])
})

test('controller preserves a staged update instead of checking again', async () => {
  let checkCalls = 0
  const controller = createApplicationUpdateController({
    adapter: createFakeAdapter({
      checkForUpdates: async () => {
        checkCalls += 1
        return { available: true, version: '2.0.0' }
      },
      downloadUpdate: async () => ({ version: '2.0.0' }),
    }),
  })

  await controller.checkForUpdates()
  await controller.downloadUpdate()
  const readySnapshot = controller.getSnapshot()
  const result = await controller.checkForUpdates()

  assert.deepEqual(result, {
    ok: true,
    skipped: true,
    code: 'update_ready',
    snapshot: readySnapshot,
  })
  assert.equal(checkCalls, 1)
  assert.deepEqual(controller.getSnapshot(), readySnapshot)
})

test('controller hides check failures and sanitizes adapter error codes', async () => {
  const controller = createApplicationUpdateController({
    adapter: createFakeAdapter({
      classifyError: () => 'upstream-secret-detail',
      checkForUpdates: async () => { throw new Error('sensitive response') },
    }),
    now: () => 750,
  })

  const result = await controller.checkForUpdates()

  assert.deepEqual(result, { ok: false, code: 'generic' })
  assert.equal(controller.getSnapshot().phase, 'hidden')
  assert.equal(controller.getSnapshot().checkedAt, 750)
})

test('controller refuses installation while blockers remain', async () => {
  let installCalls = 0
  const controller = createApplicationUpdateController({
    adapter: createFakeAdapter({
      installUpdate: async () => {
        installCalls += 1
        return { ok: true }
      },
    }),
  })
  controller.replaceSnapshot({
    phase: 'ready',
    version: '99.0.0-dev',
    progressPercent: 100,
    installBlockers: [{ kind: 'running-task', label: 'Task is running', simulated: true }],
  })

  assert.deepEqual(await controller.installUpdate(), { ok: false, code: 'not_idle' })
  assert.equal(installCalls, 0)
})

test('controller delegates production installation to the idle coordinator with renderer preflight', async () => {
  const calls = []
  const controller = createApplicationUpdateController({
    adapter: createFakeAdapter({
      installUpdate: async () => {
        calls.push(['adapter-install'])
        return { ok: true }
      },
    }),
    installCoordinator: {
      run: async ({ rendererPreflight, onQuiesced, install }) => {
        calls.push(['coordinate', rendererPreflight])
        await onQuiesced()
        return install()
      },
    },
  })
  controller.replaceSnapshot({
    phase: 'ready',
    version: '99.0.0-dev',
    progressPercent: 100,
    installBlockers: [],
  })
  const rendererPreflight = { dirtyTabCount: 0, capturedAt: 1_000 }

  assert.deepEqual(await controller.installUpdate(rendererPreflight), { ok: true })
  assert.deepEqual(calls, [
    ['coordinate', rendererPreflight],
    ['adapter-install'],
  ])
  assert.equal(controller.getSnapshot().phase, 'installing')
})

test('controller keeps ready state and publishes blockers returned by the coordinator', async () => {
  const controller = createApplicationUpdateController({
    adapter: createFakeAdapter(),
    installCoordinator: {
      run: async () => ({
        ok: false,
        code: 'not_idle',
        blockers: [{ kind: 'unsaved-work', label: '1 unsaved editor tab' }],
      }),
    },
  })
  controller.replaceSnapshot({
    phase: 'ready',
    version: '99.0.0-dev',
    progressPercent: 100,
    installBlockers: [],
  })

  assert.equal((await controller.installUpdate({ dirtyTabCount: 1, capturedAt: 1_000 })).code, 'not_idle')
  assert.equal(controller.getSnapshot().phase, 'ready')
  assert.deepEqual(controller.getSnapshot().installBlockers, [
    { kind: 'unsaved-work', label: '1 unsaved editor tab', simulated: false },
  ])
})

test('controller restores ready state when coordinated installation fails', async () => {
  const controller = createApplicationUpdateController({
    adapter: createFakeAdapter(),
    installCoordinator: {
      run: async () => { throw new Error('private preparation failure') },
    },
  })
  controller.replaceSnapshot({
    phase: 'ready',
    version: '99.0.0-dev',
    progressPercent: 100,
    installBlockers: [],
  })

  assert.deepEqual(await controller.installUpdate({ dirtyTabCount: 0, capturedAt: 1_000 }), {
    ok: false,
    code: 'generic',
  })
  assert.equal(controller.getSnapshot().phase, 'ready')
  assert.equal(controller.getSnapshot().version, '99.0.0-dev')
})

test('controller refreshes cached blockers without starting installation', async () => {
  let collectCalls = 0
  let installCalls = 0
  const controller = createApplicationUpdateController({
    adapter: createFakeAdapter({
      installUpdate: async () => { installCalls += 1 },
    }),
    installBlockerCollector: async () => {
      collectCalls += 1
      return []
    },
  })
  controller.replaceSnapshot({
    phase: 'ready',
    version: '99.0.0-dev',
    progressPercent: 100,
    installBlockers: [{ kind: 'running-task', label: '1 task is still running' }],
  })

  const result = await controller.refreshInstallBlockers({ dirtyTabCount: 0, capturedAt: 1_000 })

  assert.equal(result.ok, true)
  assert.equal(collectCalls, 1)
  assert.equal(installCalls, 0)
  assert.deepEqual(controller.getSnapshot().installBlockers, [])
})

test('controller stop clears scheduled checks and disposes its adapter', () => {
  const timers = createFakeTimers()
  let disposeCalls = 0
  const controller = createApplicationUpdateController({
    adapter: createFakeAdapter({ dispose: () => { disposeCalls += 1 } }),
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  })

  controller.start()
  controller.stop()

  assert.equal(timers.pendingCount(), 0)
  assert.equal(disposeCalls, 1)
})
