import test from 'node:test'
import assert from 'node:assert/strict'

import { copyFileResourceToClipboard } from '../../src/main/attachments/attachment-file-clipboard.mjs'

test('Windows file copy passes the path through environment state to a static PowerShell script', async () => {
  const calls = []
  const filePath = 'C:\\Temp\\report [1].pdf'
  const result = await copyFileResourceToClipboard(filePath, {
    platform: 'win32',
    spawnProcess: async (command, args, options) => {
      calls.push({ command, args, options })
      return { code: 0, stdout: '', stderr: '' }
    },
  })

  assert.deepEqual(result, { ok: true })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].command.toLowerCase(), 'powershell.exe')
  assert.equal(calls[0].options.env.ADDOM_ATTACHMENT_CLIPBOARD_PATH, filePath)
  assert.equal(calls[0].args.join(' ').includes(filePath), false)
  assert.match(calls[0].args.join(' '), /Set-Clipboard -LiteralPath/)
})

test('macOS file copy passes the file path as an osascript argv item', async () => {
  const calls = []
  const filePath = '/tmp/report [1].pdf'
  const result = await copyFileResourceToClipboard(filePath, {
    platform: 'darwin',
    spawnProcess: async (command, args) => {
      calls.push({ command, args })
      return { code: 0, stdout: '', stderr: '' }
    },
  })

  assert.deepEqual(result, { ok: true })
  assert.equal(calls[0].command, 'osascript')
  assert.equal(calls[0].args.at(-1), filePath)
  assert.equal(calls[0].args.slice(0, -1).join(' ').includes(filePath), false)
})

test('Linux file copy returns unsupported instead of copying path text when no native tool exists', async () => {
  const result = await copyFileResourceToClipboard('/tmp/report.pdf', {
    platform: 'linux',
    commandExists: async () => false,
    spawnProcess: async () => {
      throw new Error('must not spawn')
    },
  })

  assert.deepEqual(result, { ok: false, error: 'file_clipboard_unsupported' })
})

test('platform clipboard failures return a normalized error', async () => {
  const result = await copyFileResourceToClipboard('C:\\Temp\\report.pdf', {
    platform: 'win32',
    spawnProcess: async () => ({ code: 1, stdout: '', stderr: 'private path detail' }),
  })

  assert.deepEqual(result, { ok: false, error: 'file_clipboard_failed' })
})
