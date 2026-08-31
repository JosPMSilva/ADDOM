import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveWorkspaceTargetIntent } from '../../src/renderer/store/workspace-target-activation.mjs'

test('resolves a same-project thread selection without project activation', () => {
  assert.deepEqual(resolveWorkspaceTargetIntent({
    activeProjectId: 'p1',
    projectId: 'p1',
    threadId: 't2',
  }), {
    kind: 'thread',
    projectId: 'p1',
    threadId: 't2',
    createThread: false,
  })
})

test('normalizes a cross-project thread selection', () => {
  assert.deepEqual(resolveWorkspaceTargetIntent({
    activeProjectId: ' p1 ',
    projectId: ' p2 ',
    threadId: ' t2 ',
  }), {
    kind: 'project_thread',
    projectId: 'p2',
    threadId: 't2',
    createThread: false,
  })
})

test('resolves thread creation with the matching activation kind', () => {
  assert.deepEqual(resolveWorkspaceTargetIntent({
    activeProjectId: 'p1',
    projectId: 'p1',
    threadId: 'ignored',
    createThread: true,
  }), {
    kind: 'thread',
    projectId: 'p1',
    threadId: '',
    createThread: true,
  })
  assert.deepEqual(resolveWorkspaceTargetIntent({
    activeProjectId: 'p1',
    projectId: 'p2',
    createThread: true,
  }), {
    kind: 'project_thread',
    projectId: 'p2',
    threadId: '',
    createThread: true,
  })
})

test('returns null when no destination project is available', () => {
  assert.equal(resolveWorkspaceTargetIntent({
    activeProjectId: 'p1',
    projectId: '  ',
    threadId: 't2',
  }), null)
})
