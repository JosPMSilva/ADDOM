import test from 'node:test'
import assert from 'node:assert/strict'
import { closeDb } from '../../src/main/memory/db.mjs'

import {
  createThread,
  registerProject,
  resolveWorkspaceProjectPath,
} from '../../src/main/workspace/workspace-store.mjs'

function isNativeDbLoadError(err) {
  const message = String(err?.message || '')
  return (
    String(err?.code || '') === 'ERR_DLOPEN_FAILED'
    || /NODE_MODULE_VERSION/i.test(message)
    || /better[-_ ]sqlite3/i.test(message)
  )
}

test.after(() => {
  try { closeDb() } catch { /* best-effort cleanup */ }
})

test('resolveWorkspaceProjectPath prefers the thread project path over stale payload values', (t) => {
  try {
    const registered = registerProject('C:/Users/example/Desktop/test/P21')
    const created = createThread(registered.project.id, 'Path Resolution')

    assert.equal(
      resolveWorkspaceProjectPath({
        projectId: 'project_stale_payload',
        threadId: created.thread.id,
      }),
      registered.project.path,
    )
  } catch (error) {
    if (isNativeDbLoadError(error)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw error
  }
})

test('resolveWorkspaceProjectPath falls back to projectId when threadId is unavailable', (t) => {
  try {
    const registered = registerProject('C:/Users/example/Desktop/test/P22')

    assert.equal(
      resolveWorkspaceProjectPath({
        projectId: registered.project.id,
        threadId: 'thread_missing_payload',
      }),
      registered.project.path,
    )
  } catch (error) {
    if (isNativeDbLoadError(error)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw error
  }
})
