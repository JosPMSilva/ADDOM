import test from 'node:test'
import assert from 'node:assert/strict'
import { closeDb } from '../../src/main/memory/db.mjs'
import {
  autoTitleThread,
  createThread,
  registerProject,
  renameThread,
} from '../../src/main/workspace/workspace-store.mjs'

function isNativeDbLoadError(error) {
  const message = String(error?.message || '')
  return String(error?.code || '') === 'ERR_DLOPEN_FAILED'
    || /NODE_MODULE_VERSION|better[-_ ]sqlite3/i.test(message)
}

test.after(() => {
  try { closeDb() } catch { /* best-effort cleanup */ }
})

test('auto-title updates a default thread once and never overwrites a manual rename', (t) => {
  try {
    const project = registerProject(`C:/Users/example/Desktop/test/auto-title-${Date.now()}`).project
    const thread = createThread(project.id).thread
    assert.equal(thread.titleSource, 'default')

    const titled = autoTitleThread(project.id, thread.id, 'Please inspect hardware_info.py and propose a minimal fix.')
    assert.equal(titled.updated, true)
    assert.equal(titled.thread.title, 'Inspect hardware_info.py and propose a minimal fix.')
    assert.equal(titled.thread.titleSource, 'auto')

    const unchanged = autoTitleThread(project.id, thread.id, 'This must not replace the first title.')
    assert.equal(unchanged.updated, false)
    assert.equal(unchanged.thread.title, 'Inspect hardware_info.py and propose a minimal fix.')

    renameThread(project.id, thread.id, 'My manual name')
    const manual = autoTitleThread(project.id, thread.id, 'This must not replace the manual name.')
    assert.equal(manual.updated, false)
    assert.equal(manual.thread.title, 'My manual name')
    assert.equal(manual.thread.titleSource, 'manual')
  } catch (error) {
    if (isNativeDbLoadError(error)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw error
  }
})
