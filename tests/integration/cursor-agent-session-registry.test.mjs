import test from 'node:test'
import assert from 'node:assert/strict'

import { createCursorAgentSessionRegistry } from '../../src/main/cursor-agent/cursor-agent-session-registry.mjs'

function createHarness(initial = {}) {
  let persisted = structuredClone(initial)
  const registry = createCursorAgentSessionRegistry({
    readSessionMap: () => structuredClone(persisted),
    writeSessionMap: (next) => { persisted = structuredClone(next) },
  })
  return { registry, read: () => structuredClone(persisted) }
}

test('Cursor session registry persists and resumes only the exact project-thread-workspace tuple', () => {
  const { registry } = createHarness()

  registry.set({
    projectId: 'project-1',
    threadId: 'thread-1',
    projectPath: 'C:\\repo-one',
    sessionId: 'cursor-session-1',
  })

  assert.equal(registry.get({
    projectId: 'project-1',
    threadId: 'thread-1',
    projectPath: 'C:\\repo-one',
  })?.sessionId, 'cursor-session-1')
  assert.equal(registry.get({
    projectId: 'project-1',
    threadId: 'thread-1',
    projectPath: 'C:\\different-repo',
  }), null)
})

test('Cursor session cleanup removes only the requested lifecycle scope', () => {
  const { registry, read } = createHarness()
  registry.set({ projectId: 'p1', threadId: 't1', projectPath: 'C:\\one', sessionId: 's1' })
  registry.set({ projectId: 'p1', threadId: 't2', projectPath: 'C:\\one', sessionId: 's2' })
  registry.set({ projectId: 'p2', threadId: 't3', projectPath: 'C:\\two', sessionId: 's3' })

  assert.equal(registry.deleteThread('t1'), 1)
  assert.equal(registry.get({ projectId: 'p1', threadId: 't2', projectPath: 'C:\\one' })?.sessionId, 's2')
  assert.equal(registry.deleteProject('p1'), 1)
  assert.equal(Object.keys(read()).length, 1)
  assert.equal(registry.get({ projectId: 'p2', threadId: 't3', projectPath: 'C:\\two' })?.sessionId, 's3')
})
