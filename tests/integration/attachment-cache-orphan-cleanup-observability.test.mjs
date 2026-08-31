import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-attachment-orphan-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { closeDb } = await import('../../src/main/memory/db.mjs')
const {
  stageAttachmentBatch,
  readCachedAttachmentBase64,
  cleanupAttachmentCacheOrphans,
  getAttachmentCacheRoot,
} = await import('../../src/main/attachments/attachment-cache.mjs')

function isNativeDbLoadError(err) {
  const message = String(err?.message || '')
  return (
    String(err?.code || '') === 'ERR_DLOPEN_FAILED'
    || /NODE_MODULE_VERSION/i.test(message)
    || /better[-_ ]sqlite3/i.test(message)
  )
}

test.after(() => {
  try { closeDb() } catch { /* best-effort test cleanup */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('cleanupAttachmentCacheOrphans reports deleted rows/files and exposes details', async (t) => {
  try {
    const staged = await stageAttachmentBatch({
      projectId: 'proj_observe',
      threadId: 'thread_observe',
      attachments: [
        {
          kind: 'image',
          mediaType: 'image/png',
          fileName: 'preview.png',
          data: Buffer.from('image-bytes').toString('base64'),
        },
      ],
    })

    assert.equal(staged.ok, true)
    assert.equal(staged.attachments.length, 1)
    const attachmentId = String(staged.attachments[0]?.attachmentId || '')
    assert.ok(attachmentId)

    const stagedFile = await readCachedAttachmentBase64(attachmentId)
    assert.equal(stagedFile.ok, true)
    assert.ok(stagedFile.absolutePath)

    fs.rmSync(stagedFile.absolutePath, { force: true })

    const orphanPath = path.join(
      getAttachmentCacheRoot(),
      'projects',
      'proj_observe',
      'threads',
      'thread_observe',
      'orphan.bin',
    )
    fs.mkdirSync(path.dirname(orphanPath), { recursive: true })
    fs.writeFileSync(orphanPath, 'orphan-data', 'utf8')

    const result = await cleanupAttachmentCacheOrphans()
    assert.equal(typeof result.scannedRows, 'number')
    assert.equal(typeof result.scannedFiles, 'number')
    assert.equal(result.deletedRows, 1)
    assert.ok(Array.isArray(result.deletedRowIds))
    assert.ok(result.deletedRowIds.includes(attachmentId))
    assert.ok(result.deletedFiles >= 1)
    assert.ok(Array.isArray(result.deletedFilePaths))
    assert.ok(
      result.deletedFilePaths.some((entry) => path.resolve(String(entry || '')) === path.resolve(orphanPath)),
    )
    assert.equal(result.errorCount, 0)
    assert.equal(Array.isArray(result.errors), true)
    assert.equal(result.errors.length, 0)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})
