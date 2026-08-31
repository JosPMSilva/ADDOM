import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-cursor-artifacts-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { closeDb } = await import('../../src/main/memory/db.mjs')
const { getRevision, listFiles } = await import('../../src/main/memory/artifact-store.mjs')
const { recordCursorAgentFileChange } = await import('../../src/main/cursor-agent/cursor-agent-artifact-recorder.mjs')

test.after(() => {
  try { closeDb() } catch { /* best-effort */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort */ }
})

function isNativeDbLoadError(err) {
  const message = String(err?.message || '')
  return String(err?.code || '') === 'ERR_DLOPEN_FAILED' || /NODE_MODULE_VERSION|better[-_ ]sqlite3/i.test(message)
}

test('Cursor artifact recorder stores relative paths, exact content, deletion revisions, and provenance', (t) => {
  try {
    const projectPath = path.join(userDataPath, 'project')
    const filePath = path.join(projectPath, 'src', 'app.js')

    const first = recordCursorAgentFileChange({
      projectPath, filePath, changeType: 'created', newContent: 'one\n', prevContent: null,
      threadId: 'thread-1', turnId: 'turn-1',
    })
    const second = recordCursorAgentFileChange({
      projectPath, filePath, changeType: 'modified', newContent: 'two\n', prevContent: 'one\n',
      threadId: 'thread-1', turnId: 'turn-1',
    })
    const third = recordCursorAgentFileChange({
      projectPath, filePath, changeType: 'deleted', newContent: '', prevContent: 'two\n',
      threadId: 'thread-1', turnId: 'turn-1',
    })

    assert.deepEqual(listFiles(projectPath).map((entry) => entry.file_path), ['src/app.js'])
    assert.equal(getRevision(first.newRevId).content, 'one\n')
    assert.equal(getRevision(second.newRevId).content, 'two\n')
    assert.equal(getRevision(third.newRevId).content, '')
    assert.equal(getRevision(third.newRevId).source, 'cursor_agent')
    assert.equal(getRevision(third.newRevId).origin_thread_id, 'thread-1')
    assert.equal(getRevision(third.newRevId).origin_turn_id, 'turn-1')
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})
