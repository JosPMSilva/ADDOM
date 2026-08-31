import test from 'node:test'
import assert from 'node:assert/strict'

import { createWorkspaceProjectLifecycleActions } from '../../src/renderer/store/workspace-project-lifecycle-actions.js'

function createHarness({
  activeProjectId = null,
  removeResult = { ok: true, deletedProjectId: 'project-a' },
  stopResult = { ok: true },
} = {}) {
  const calls = []
  let state = {
    activeProjectId,
    activeThreadId: activeProjectId ? 'thread-a' : null,
    preferredProjectId: activeProjectId,
    threads: activeProjectId ? [{ id: 'thread-a' }] : [],
    restoreWorkspaceViewMode: activeProjectId ? 'chat' : 'project-entry',
    projectEntryArchivedAtById: {},
    projectEntryRestoredAtById: { 'project-a': 50 },
    leaveToProjectEntry() {
      calls.push('leave')
      state.activeProjectId = null
      return { project: null, activeThread: null }
    },
    async loadProjects() {
      calls.push('load')
      return []
    },
  }
  const workspaceApi = {
    async stopActiveWork(payload) {
      calls.push(['stop', payload])
      return stopResult
    },
    async clearActiveProject(options) {
      calls.push(['clearActive', options])
      return { project: null, activeThread: null }
    },
    async removeProject(projectId, options) {
      calls.push(['remove', projectId, options])
      return removeResult
    },
  }
  const set = (update) => {
    const patch = typeof update === 'function' ? update(state) : update
    state = { ...state, ...patch }
    calls.push('persist')
  }
  const actions = createWorkspaceProjectLifecycleActions({
    get: () => state,
    set,
    workspaceApi,
    now: () => 100,
  })
  state = { ...state, ...actions }
  return { actions, calls, getState: () => state }
}

test('inactive project archive persists the override without clearing the workspace', async () => {
  const harness = createHarness()

  const result = await harness.actions.archiveProjectById('project-a')

  assert.deepEqual(result, { ok: true, projectId: 'project-a', wasActive: false })
  assert.deepEqual(harness.getState().projectEntryArchivedAtById, { 'project-a': 100 })
  assert.deepEqual(harness.getState().projectEntryRestoredAtById, {})
  assert.deepEqual(harness.calls, [
    ['stop', { scope: 'project', projectId: 'project-a', stopActive: false }],
    'persist',
  ])
})

test('active project archive settles work before clearing to project entry', async () => {
  const harness = createHarness({ activeProjectId: 'project-a' })

  const result = await harness.actions.archiveProjectById('project-a', { stopActive: true })

  assert.deepEqual(result, { ok: true, projectId: 'project-a', wasActive: true })
  assert.deepEqual(harness.calls, [
    ['stop', { scope: 'project', projectId: 'project-a', stopActive: true }],
    ['clearActive', { notifyRenderer: false }],
    'persist',
    'leave',
  ])
  assert.equal(harness.getState().activeProjectId, null)
})

test('failed settlement leaves archive and active workspace state unchanged', async () => {
  const harness = createHarness({
    activeProjectId: 'project-a',
    stopResult: { ok: false, error: 'active_work_settlement_timeout' },
  })

  const result = await harness.actions.archiveProjectById('project-a', { stopActive: true })

  assert.deepEqual(result, { ok: false, error: 'active_work_settlement_timeout' })
  assert.deepEqual(harness.getState().projectEntryArchivedAtById, {})
  assert.equal(harness.getState().activeProjectId, 'project-a')
  assert.equal(harness.calls.includes('persist'), false)
  assert.equal(harness.calls.includes('leave'), false)
})

test('restore clears manual archive and adds Recent priority without opening the project', () => {
  const harness = createHarness()
  harness.getState().projectEntryArchivedAtById['project-a'] = 80

  harness.actions.restoreProjectToRecent('project-a')

  assert.deepEqual(harness.getState().projectEntryArchivedAtById, {})
  assert.deepEqual(harness.getState().projectEntryRestoredAtById, { 'project-a': 100 })
  assert.equal(harness.calls.some((entry) => Array.isArray(entry) && entry[0] === 'clearActive'), false)
})

test('failed project removal leaves renderer lifecycle state unchanged and retryable', async () => {
  const harness = createHarness({
    activeProjectId: 'project-a',
    removeResult: {
      ok: false,
      errorCode: 'remote_cleanup_failed',
      retryable: true,
    },
  })
  harness.getState().projectEntryArchivedAtById['project-a'] = 80

  const result = await harness.actions.removeProjectById('project-a', { stopActive: true })

  assert.equal(result.ok, false)
  assert.equal(harness.getState().activeProjectId, 'project-a')
  assert.deepEqual(harness.getState().projectEntryArchivedAtById, { 'project-a': 80 })
  assert.deepEqual(harness.calls, [['remove', 'project-a', { stopActive: true }]])
})

test('successful inactive removal prunes archive and restore preferences after service success', async () => {
  const harness = createHarness()
  harness.getState().projectEntryArchivedAtById['project-a'] = 80

  const result = await harness.actions.removeProjectById('project-a')

  assert.equal(result.ok, true)
  assert.deepEqual(harness.getState().projectEntryArchivedAtById, {})
  assert.deepEqual(harness.getState().projectEntryRestoredAtById, {})
  assert.deepEqual(harness.calls, [
    ['remove', 'project-a', { stopActive: false }],
    'persist',
    'load',
  ])
})

test('successful active removal clears the foreground workspace and returns to project entry', async () => {
  const harness = createHarness({ activeProjectId: 'project-a' })
  harness.getState().projectEntryArchivedAtById['project-a'] = 80

  const result = await harness.actions.removeProjectById('project-a', { stopActive: true })

  assert.equal(result.ok, true)
  assert.equal(harness.getState().activeProjectId, null)
  assert.equal(harness.getState().activeThreadId, null)
  assert.deepEqual(harness.getState().threads, [])
  assert.equal(harness.getState().preferredProjectId, null)
  assert.equal(harness.getState().restoreWorkspaceViewMode, 'project-entry')
  assert.deepEqual(harness.getState().projectEntryArchivedAtById, {})
  assert.deepEqual(harness.getState().projectEntryRestoredAtById, {})
  assert.deepEqual(harness.calls, [
    ['remove', 'project-a', { stopActive: true }],
    'persist',
    'load',
  ])
})
