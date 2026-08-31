import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { registerAttachmentOpenHandler } from '../../src/main/attachment-open-handler.mjs'

test('legacy default-open reuses original-byte materialization before opening', async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'addom-open-handler-'))
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }))
  const handlers = new Map()
  const openedPaths = []
  const ipcMain = {
    handle(channel, handler) { handlers.set(channel, handler) },
  }
  registerAttachmentOpenHandler({
    ipcMain,
    attachmentTempDir: tempDir,
    openPath: async (filePath) => {
      openedPaths.push(filePath)
      return ''
    },
  })

  const bytes = Buffer.from('open original bytes')
  const result = await handlers.get('v1:shell:openAttachmentFile')({}, {
    data: bytes.toString('base64'),
    fileName: 'notes.txt',
    mediaType: 'text/plain',
  })

  assert.equal(result.ok, true)
  assert.equal(openedPaths.length, 1)
  assert.deepEqual(await fs.readFile(openedPaths[0]), bytes)
})

test('legacy default-open preserves normalized materialization errors', async () => {
  const handlers = new Map()
  registerAttachmentOpenHandler({
    ipcMain: { handle(channel, handler) { handlers.set(channel, handler) } },
    openPath: async () => '',
  })

  const result = await handlers.get('v1:shell:openAttachmentFile')({}, {
    data: 'not base64!',
    fileName: 'bad.bin',
  })
  assert.deepEqual(result, { ok: false, error: 'invalid_attachment_data' })
})
