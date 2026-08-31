import test from 'node:test'
import assert from 'node:assert/strict'

import { registerAttachmentHandlers } from '../../src/main/ipc-handlers/attachments.mjs'

test('attachment action IPC exposes scoped versioned handlers without accepting paths', async () => {
  const handlers = new Map()
  const calls = []
  const ipcMain = {
    handle(channel, handler) { handlers.set(channel, handler) },
  }
  const service = {
    copy: async (...args) => { calls.push(['copy', ...args]); return { ok: true } },
    reveal: async (...args) => { calls.push(['reveal', ...args]); return { ok: true } },
    saveAs: async (...args) => { calls.push(['saveAs', ...args]); return { ok: true } },
    listOpenWith: async (...args) => {
      calls.push(['listOpenWith', ...args])
      return { ok: true, applications: [] }
    },
    openWith: async (...args) => { calls.push(['openWith', ...args]); return { ok: true } },
  }
  registerAttachmentHandlers({ ipcMain, service })

  const payload = {
    attachment: {
      attachmentId: 'att_1',
      fileName: 'notes.txt',
      path: 'C:/private/renderer-supplied.txt',
    },
    projectId: 'project_1',
    threadId: 'thread_1',
    applicationId: 'app_cursor',
    executablePath: 'C:/private/Cursor.exe',
  }
  for (const action of ['copy', 'reveal', 'save-as', 'list-open-with', 'open-with']) {
    const result = await handlers.get(`v1:attachments:${action}`)({}, payload)
    assert.equal(result.ok, true)
  }

  assert.equal(handlers.has('v1:attachments:copy'), true)
  assert.deepEqual(calls[0], [
    'copy',
    { attachmentId: 'att_1', data: '', fileName: 'notes.txt', mediaType: '', kind: 'file' },
    { projectId: 'project_1', threadId: 'thread_1' },
  ])
  assert.deepEqual(calls[4], [
    'openWith',
    { attachmentId: 'att_1', data: '', fileName: 'notes.txt', mediaType: '', kind: 'file' },
    'app_cursor',
    { projectId: 'project_1', threadId: 'thread_1' },
  ])
  assert.equal(JSON.stringify(calls).includes('renderer-supplied'), false)
  assert.equal(JSON.stringify(calls).includes('Cursor.exe'), false)
})
