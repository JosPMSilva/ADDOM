import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-artifact-thread-scope-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { closeDb, getDb } = await import('../../src/main/memory/db.mjs')
const { listFiles, listRevisions, recordWrite } = await import('../../src/main/memory/artifact-store.mjs')

function isNativeDbLoadError(error) {
  const message = String(error?.message || '')
  return String(error?.code || '') === 'ERR_DLOPEN_FAILED'
    || /NODE_MODULE_VERSION|better[-_ ]sqlite3/i.test(message)
}

test.after(() => {
  try { closeDb() } catch { /* best-effort cleanup */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort cleanup */ }
})

test('Artifact thread scope filters files while preserving unified revision history', (t) => {
  try {
    const project = path.join(userDataPath, 'workspace')
    const threadA = 'artifact-thread-a'
    const threadB = 'artifact-thread-b'
    fs.mkdirSync(project, { recursive: true })

    recordWrite({ project, filePath: 'src/shared.js', newContent: 'a1', threadId: threadA })
    recordWrite({ project, filePath: 'src/shared.js', newContent: 'b2', threadId: threadB })
    recordWrite({ project, filePath: 'src/a-only.js', newContent: 'a', threadId: threadA })
    recordWrite({ project, filePath: 'src/b-only.js', newContent: 'b', threadId: threadB })

    const allFiles = listFiles(project)
    const threadFiles = listFiles(project, { threadId: threadA })
    assert.deepEqual(allFiles.map((file) => file.file_path).sort(), [
      'src/a-only.js',
      'src/b-only.js',
      'src/shared.js',
    ])
    assert.deepEqual(threadFiles.map((file) => file.file_path).sort(), [
      'src/a-only.js',
      'src/shared.js',
    ])
    assert.equal(threadFiles.find((file) => file.file_path === 'src/shared.js')?.total_revisions, 2)

    const revisions = listRevisions(project, 'src/shared.js')
    assert.deepEqual(revisions.map((revision) => revision.origin_thread_id), [threadB, threadA])
    assert.deepEqual(revisions.map((revision) => revision.rev), [2, 1])

    getDb().prepare(`
      UPDATE artifacts
      SET origin_thread_title = ?, origin_thread_state = 'deleted', origin_thread_deleted_at = ?
      WHERE id = ?
    `).run('Deleted source thread', 1_700_000_000_000, revisions[1].id)
    const recovered = listRevisions(project, 'src/shared.js')
    assert.equal(recovered[1].origin_thread_title, 'Deleted source thread')
    assert.equal(recovered[1].origin_thread_state, 'deleted')
    assert.equal(recovered[1].origin_thread_deleted_at, 1_700_000_000_000)
  } catch (error) {
    if (isNativeDbLoadError(error)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw error
  }
})
