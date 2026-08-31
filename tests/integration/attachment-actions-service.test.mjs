import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  createAttachmentActionsService,
  materializeFileClipboardResource,
} from '../../src/main/attachments/attachment-actions-service.mjs'

const scope = { projectId: 'project_1', threadId: 'thread_1' }

test('image copy writes the original resolved bytes to the Electron clipboard', async () => {
  const bytes = Buffer.from('original image bytes')
  const writes = []
  const service = createAttachmentActionsService({
    resolveResource: async () => ({
      ok: true,
      path: 'C:/Temp/image.png',
      bytes,
      fileName: 'image.png',
      mediaType: 'image/png',
      kind: 'image',
    }),
    nativeImage: {
      createFromBuffer: (input) => ({ bytes: input, isEmpty: () => false }),
    },
    clipboard: { writeImage: (image) => writes.push(image) },
  })

  const result = await service.copy({ attachmentId: 'att_image' }, scope)
  assert.deepEqual(result, { ok: true })
  assert.deepEqual(writes[0].bytes, bytes)
})

test('reveal asks Electron to show the resolved cached resource in its folder', async () => {
  const revealed = []
  const service = createAttachmentActionsService({
    resolveResource: async () => ({
      ok: true,
      path: 'C:/Cache/generated/image.png',
      bytes: Buffer.from('image'),
      fileName: 'image.png',
      mediaType: 'image/png',
      kind: 'image',
    }),
    shell: {
      showItemInFolder: (filePath) => revealed.push(filePath),
    },
  })

  assert.deepEqual(await service.reveal({ attachmentId: 'att_image' }, scope), { ok: true })
  assert.deepEqual(revealed, ['C:/Cache/generated/image.png'])
})

test('file copy delegates the validated resource path to the native clipboard adapter', async () => {
  const copied = []
  const service = createAttachmentActionsService({
    resolveResource: async () => ({ ok: true, path: 'C:/Temp/report.pdf', kind: 'file' }),
    materializeClipboardFile: async () => 'C:/Temp/report.pdf',
    copyFileToClipboard: async (filePath) => {
      copied.push(filePath)
      return { ok: true }
    },
  })

  assert.deepEqual(await service.copy({ attachmentId: 'att_file' }, scope), { ok: true })
  assert.deepEqual(copied, ['C:/Temp/report.pdf'])
})

test('file clipboard materialization preserves the visible filename and exact bytes', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'addom-clipboard-test-'))
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }))
  const bytes = Buffer.from('exact clipboard file bytes')

  const filePath = await materializeFileClipboardResource({
    bytes,
    fileName: 'report [1].pdf',
    mediaType: 'application/pdf',
  }, { clipboardTempRoot: tempRoot })

  assert.equal(path.basename(filePath), 'report [1].pdf')
  assert.deepEqual(await fs.readFile(filePath), bytes)
})

test('save cancellation is returned as a neutral canceled result with a parent window', async () => {
  const parent = { id: 'main-window' }
  const calls = []
  const service = createAttachmentActionsService({
    resolveResource: async () => ({
      ok: true,
      path: 'C:/Temp/report.pdf',
      fileName: 'report.pdf',
      kind: 'file',
    }),
    getMainWindow: () => parent,
    dialog: {
      showSaveDialog: async (...args) => {
        calls.push(args)
        return { canceled: true, filePath: '' }
      },
    },
  })

  assert.deepEqual(await service.saveAs({ attachmentId: 'att_file' }, scope), {
    ok: false,
    canceled: true,
  })
  assert.equal(calls[0][0], parent)
  assert.equal(calls[0][1].defaultPath, 'report.pdf')
})

test('save as copies the original resource bytes unchanged', async () => {
  const bytes = Buffer.from('exact saved attachment bytes')
  const copies = []
  const service = createAttachmentActionsService({
    resolveResource: async () => ({
      ok: true,
      path: 'C:/Cache/report.pdf',
      bytes,
      fileName: 'report.pdf',
      kind: 'file',
    }),
    getMainWindow: () => null,
    dialog: {
      showSaveDialog: async () => ({ canceled: false, filePath: 'C:/Saved/report.pdf' }),
    },
    copyFile: async (source, destination) => copies.push({ source, destination }),
  })

  const result = await service.saveAs({ attachmentId: 'att_file' }, scope)
  assert.equal(result.ok, true)
  assert.equal(result.sha256, crypto.createHash('sha256').update(bytes).digest('hex'))
  assert.deepEqual(copies, [{
    source: 'C:/Cache/report.pdf',
    destination: 'C:/Saved/report.pdf',
  }])
})

test('save failures are normalized without exposing filesystem details', async () => {
  const service = createAttachmentActionsService({
    resolveResource: async () => ({
      ok: true,
      path: 'C:/Cache/report.pdf',
      bytes: Buffer.from('report'),
      fileName: 'report.pdf',
      kind: 'file',
    }),
    dialog: {
      showSaveDialog: async () => ({ canceled: false, filePath: 'C:/Private/report.pdf' }),
    },
    copyFile: async () => { throw new Error('C:/Private/report.pdf permission denied') },
  })

  assert.deepEqual(await service.saveAs({ attachmentId: 'att_file' }, scope), {
    ok: false,
    error: 'save_attachment_failed',
  })
})

test('open-with listing publishes capabilities and stale IDs remain rejected', async () => {
  const service = createAttachmentActionsService({
    resolveResource: async () => ({
      ok: true,
      path: 'C:/Temp/notes.txt',
      fileName: 'notes.txt',
      kind: 'file',
    }),
    discoverApplications: async () => ([
      { label: 'Cursor', target: 'C:/Apps/Cursor.exe' },
    ]),
    shell: { openPath: async () => '' },
  })
  const listed = await service.listOpenWith({ attachmentId: 'att_file' }, scope)
  assert.equal(listed.ok, true)
  assert.deepEqual(listed.applications.map((application) => application.label), [
    'Default app', 'Cursor', 'Choose another app...',
  ])
  assert.equal(listed.applications.some((application) => 'target' in application), false)

  const stale = await service.openWith({ attachmentId: 'att_file' }, 'app_stale', scope)
  assert.deepEqual(stale, { ok: false, error: 'open_with_application_unavailable' })
})

test('resolver failures are normalized without throwing', async () => {
  const service = createAttachmentActionsService({
    resolveResource: async () => ({ ok: false, error: 'attachment_scope_violation' }),
  })
  assert.deepEqual(await service.copy({ attachmentId: 'att_file' }, scope), {
    ok: false,
    error: 'attachment_scope_violation',
  })
})
