import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createUpdateStore,
  toLegacyUpdatePresentation,
} from '../../src/renderer/store/useUpdateStore.js'

function deferred() {
  let resolve
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

function snapshot(revision, phase, overrides = {}) {
  return {
    phase,
    version: null,
    progressPercent: 0,
    errorCode: null,
    checkedAt: null,
    downloadedAt: null,
    installBlockers: [],
    simulation: null,
    revision,
    ...overrides,
  }
}

test('update store keeps an event that is newer than its delayed hydration snapshot', async () => {
  const hydration = deferred()
  let listener = null
  const store = createUpdateStore()
  const initialize = store.getState().initialize({
    getState: () => hydration.promise,
    onStateChanged(callback) {
      listener = callback
      return () => {}
    },
  })

  listener(snapshot(2, 'downloading', { version: '99.0.0-dev', progressPercent: 46 }))
  hydration.resolve(snapshot(1, 'available', { version: '99.0.0-dev' }))
  await initialize

  assert.equal(store.getState().hydrated, true)
  assert.equal(store.getState().snapshot.phase, 'downloading')
  assert.equal(store.getState().snapshot.progressPercent, 46)
})

test('update store initializes once and cleanup preserves the last durable snapshot', async () => {
  let subscribeCalls = 0
  let unsubscribeCalls = 0
  const store = createUpdateStore()
  const api = {
    getState: async () => snapshot(3, 'ready', { version: '99.0.0-dev', progressPercent: 100 }),
    onStateChanged() {
      subscribeCalls += 1
      return () => { unsubscribeCalls += 1 }
    },
  }

  await Promise.all([
    store.getState().initialize(api),
    store.getState().initialize(api),
  ])
  store.getState().dispose()

  assert.equal(subscribeCalls, 1)
  assert.equal(unsubscribeCalls, 1)
  assert.equal(store.getState().snapshot.phase, 'ready')
})

test('update store actions call the initialized updater API', async () => {
  const calls = []
  const store = createUpdateStore({
    getDirtyTabCount: () => 2,
    now: () => 4_200,
  })
  const api = {
    getState: async () => snapshot(0, 'hidden'),
    onStateChanged: () => () => {},
    checkForUpdates: async () => { calls.push('check'); return { ok: true } },
    downloadUpdate: async () => { calls.push('download'); return { ok: true } },
    refreshInstallReadiness: async (preflight) => { calls.push(['refresh', preflight]); return { ok: true } },
    installUpdate: async (preflight) => { calls.push(['install', preflight]); return { ok: true } },
  }
  await store.getState().initialize(api)

  await store.getState().checkForUpdates()
  await store.getState().downloadUpdate()
  await store.getState().refreshInstallReadiness()
  await store.getState().installUpdate()

  assert.deepEqual(calls, ['check', 'download', ['refresh', {
    dirtyTabCount: 2,
    capturedAt: 4_200,
  }], ['install', {
    dirtyTabCount: 2,
    capturedAt: 4_200,
  }]])
})

test('update store normalizes untrusted renderer snapshots', async () => {
  const store = createUpdateStore()
  await store.getState().initialize({
    getState: async () => ({
      phase: 'invented',
      version: { secret: true },
      progressPercent: 800,
      errorCode: 'private-detail',
      installBlockers: [{ kind: 'running-task', label: ' Task ', simulated: true, detail: 'discarded' }],
      simulation: { enabled: true, candidateVersion: '99.0.0-dev', extra: 'discarded' },
      revision: 4,
    }),
    onStateChanged: () => () => {},
  })

  assert.deepEqual(store.getState().snapshot, {
    phase: 'hidden',
    version: '[object Object]',
    progressPercent: 100,
    errorCode: 'generic',
    checkedAt: null,
    downloadedAt: null,
    installBlockers: [{ kind: 'running-task', label: 'Task', simulated: true }],
    simulation: { enabled: true, candidateVersion: '99.0.0-dev' },
    revision: 4,
  })
})

test('shared snapshots map onto the existing Settings update presentation', () => {
  assert.deepEqual(toLegacyUpdatePresentation(snapshot(1, 'ready', {
    version: '99.0.0-dev',
    progressPercent: 100,
    simulation: { enabled: true, candidateVersion: '99.0.0-dev' },
  })), {
    status: 'downloaded',
    info: {
      version: '99.0.0-dev',
      code: null,
      installBlockers: [],
      simulation: { enabled: true, candidateVersion: '99.0.0-dev' },
    },
    percent: 100,
  })
  assert.equal(toLegacyUpdatePresentation(snapshot(2, 'hidden')).status, null)
  assert.equal(toLegacyUpdatePresentation(snapshot(3, 'unavailable')).status, 'unavailable')
  assert.equal(toLegacyUpdatePresentation(snapshot(4, 'managed')).status, 'managed')
})

test('Settings presentation preserves updater errors, blockers, and installing state', () => {
  assert.equal(toLegacyUpdatePresentation(snapshot(1, 'hidden', {
    errorCode: 'network',
  })).status, 'error')

  const failedDownload = toLegacyUpdatePresentation(snapshot(2, 'error', {
    version: '2.0.0',
    errorCode: 'network',
  }))
  assert.equal(failedDownload.status, 'error')
  assert.equal(failedDownload.info.version, '2.0.0')

  const blockedReady = toLegacyUpdatePresentation(snapshot(3, 'ready', {
    version: '2.0.0',
    progressPercent: 100,
    installBlockers: [{ kind: 'running-task', label: 'One task is still running' }],
  }))
  assert.equal(blockedReady.status, 'blocked')
  assert.deepEqual(blockedReady.info.installBlockers, [
    { kind: 'running-task', label: 'One task is still running', simulated: false },
  ])

  assert.equal(toLegacyUpdatePresentation(snapshot(4, 'installing', {
    version: '2.0.0',
  })).status, 'installing')
})
