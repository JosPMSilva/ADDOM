import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  materializeLegacyAttachment,
  resolveAttachmentActionResource,
} from '../../src/main/attachments/attachment-action-resource.mjs'

test('cached attachment actions resolve original cache bytes before inline or preview data', async () => {
  const originalBytes = Buffer.from('original cached bytes')
  const cachedPath = 'C:/cache/diagram.png'
  const calls = []

  const result = await resolveAttachmentActionResource({
    attachmentId: 'att_1',
    previewUrl: 'file:///thumbnail.png',
    data: Buffer.from('wrong inline bytes').toString('base64'),
    fileName: 'fallback.png',
    mediaType: 'image/png',
  }, {
    projectId: 'project_1',
    threadId: 'thread_1',
  }, {
    resolveCachedPath: async (attachmentId, scope) => {
      calls.push({ attachmentId, scope })
      return {
        ok: true,
        absolutePath: cachedPath,
        fileName: 'diagram.png',
        mediaType: 'image/png',
        kind: 'image',
      }
    },
    readFile: async (filePath) => {
      assert.equal(filePath, cachedPath)
      return originalBytes
    },
  })

  assert.deepEqual(calls, [{
    attachmentId: 'att_1',
    scope: { projectId: 'project_1', threadId: 'thread_1' },
  }])
  assert.deepEqual(result, {
    ok: true,
    path: cachedPath,
    bytes: originalBytes,
    fileName: 'diagram.png',
    mediaType: 'image/png',
    kind: 'image',
    temporary: false,
  })
})

test('legacy attachment materialization preserves exact original bytes', async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'addom-attachment-resource-'))
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }))
  const bytes = Buffer.from('legacy attachment bytes')

  const result = await materializeLegacyAttachment({
    data: bytes.toString('base64'),
    fileName: 'notes.txt',
    mediaType: 'text/plain',
    kind: 'file',
  }, {
    attachmentTempDir: tempDir,
    maxBytes: 1024,
  })

  assert.equal(result.ok, true)
  assert.equal(result.temporary, true)
  assert.equal(path.dirname(result.path), tempDir)
  assert.equal(path.basename(result.path).endsWith('_notes.txt'), true)
  assert.deepEqual(await fs.readFile(result.path), bytes)
})

test('legacy attachment materialization rejects malformed and oversized data', async () => {
  const malformed = await materializeLegacyAttachment({
    data: 'not base64!',
    fileName: 'bad.bin',
  }, { maxBytes: 16 })
  assert.deepEqual(malformed, { ok: false, error: 'invalid_attachment_data' })

  const oversized = await materializeLegacyAttachment({
    data: Buffer.alloc(17, 1).toString('base64'),
    fileName: 'large.bin',
  }, { maxBytes: 16 })
  assert.deepEqual(oversized, { ok: false, error: 'attachment_too_large' })
})

test('cached attachment scope failures do not fall through to inline data', async () => {
  const result = await resolveAttachmentActionResource({
    attachmentId: 'att_denied',
    data: Buffer.from('inline fallback').toString('base64'),
  }, {
    projectId: 'project_other',
    threadId: 'thread_other',
  }, {
    resolveCachedPath: async () => ({ ok: false, error: 'attachment_scope_violation' }),
  })

  assert.deepEqual(result, { ok: false, error: 'attachment_scope_violation' })
})
