import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createInitialUpdateSnapshot,
  createUnavailableUpdateSnapshot,
  normalizeUpdateSnapshot,
  reduceApplicationUpdateState,
} from '../../src/main/updater/application-update-state.mjs'

test('unavailable updater state is explicit without exposing a reason', () => {
  assert.deepEqual(createUnavailableUpdateSnapshot(), {
    ...createInitialUpdateSnapshot(),
    phase: 'unavailable',
  })
})

test('application update state progresses from hidden to available to ready', () => {
  const hidden = createInitialUpdateSnapshot()
  const checking = reduceApplicationUpdateState(hidden, { type: 'check_started' }, 100)
  const available = reduceApplicationUpdateState(checking, {
    type: 'update_available',
    version: '99.0.0-dev',
  }, 200)
  const downloading = reduceApplicationUpdateState(available, { type: 'download_started' }, 300)
  const halfway = reduceApplicationUpdateState(downloading, {
    type: 'download_progress',
    percent: 46.4,
  }, 400)
  const ready = reduceApplicationUpdateState(halfway, {
    type: 'download_succeeded',
    version: '99.0.0-dev',
  }, 500)

  assert.equal(hidden.phase, 'hidden')
  assert.equal(checking.phase, 'checking')
  assert.equal(available.phase, 'available')
  assert.equal(available.checkedAt, 200)
  assert.equal(downloading.progressPercent, 0)
  assert.equal(halfway.progressPercent, 46)
  assert.equal(ready.phase, 'ready')
  assert.equal(ready.progressPercent, 100)
  assert.equal(ready.downloadedAt, 500)
})

test('a detected version survives a sanitized download failure', () => {
  const available = {
    ...createInitialUpdateSnapshot(),
    phase: 'available',
    version: '99.0.0-dev',
  }
  const failed = reduceApplicationUpdateState(available, {
    type: 'operation_failed',
    operation: 'download',
    errorCode: 'network',
  }, 600)

  assert.equal(failed.phase, 'error')
  assert.equal(failed.version, '99.0.0-dev')
  assert.equal(failed.errorCode, 'network')
})

test('check failures stay hidden until a candidate is known', () => {
  const failed = reduceApplicationUpdateState(createInitialUpdateSnapshot(), {
    type: 'operation_failed',
    operation: 'check',
    errorCode: 'upstream-secret-detail',
  }, 700)

  assert.equal(failed.phase, 'hidden')
  assert.equal(failed.errorCode, 'generic')
  assert.equal(failed.checkedAt, 700)
})

test('snapshot normalization clamps progress and discards untrusted fields', () => {
  const snapshot = normalizeUpdateSnapshot({
    phase: 'downloading',
    version: ' 99.0.0-dev ',
    progressPercent: 140.8,
    errorCode: 'network',
    checkedAt: 100,
    downloadedAt: -5,
    installBlockers: [
      { kind: 'running-task', label: ' Task 1 ', detail: 'must not escape' },
      { kind: 'unknown', label: 'ignored' },
      null,
    ],
    simulation: { enabled: true, candidateVersion: '99.0.0-dev', secret: 'discarded' },
    extra: 'discarded',
  })

  assert.deepEqual(snapshot, {
    phase: 'downloading',
    version: '99.0.0-dev',
    progressPercent: 100,
    errorCode: 'network',
    checkedAt: 100,
    downloadedAt: null,
    installBlockers: [{ kind: 'running-task', label: 'Task 1', simulated: false }],
    simulation: { enabled: true, candidateVersion: '99.0.0-dev' },
    revision: 0,
  })
})

test('install blockers and installation have explicit transitions', () => {
  const ready = {
    ...createInitialUpdateSnapshot(),
    phase: 'ready',
    version: '99.0.0-dev',
    progressPercent: 100,
  }
  const blocked = reduceApplicationUpdateState(ready, {
    type: 'install_blockers_changed',
    blockers: [{ kind: 'running-task', label: 'Thread is running', simulated: true }],
  }, 800)
  const installing = reduceApplicationUpdateState(blocked, { type: 'install_started' }, 900)

  assert.deepEqual(blocked.installBlockers, [
    { kind: 'running-task', label: 'Thread is running', simulated: true },
  ])
  assert.equal(installing.phase, 'installing')
  assert.deepEqual(installing.installBlockers, [])
})

test('unknown state and events normalize to a safe hidden snapshot', () => {
  const snapshot = reduceApplicationUpdateState({
    phase: 'invented',
    progressPercent: Number.NaN,
    revision: -4,
  }, { type: 'invented_event' }, 1_000)

  assert.deepEqual(snapshot, createInitialUpdateSnapshot())
})

