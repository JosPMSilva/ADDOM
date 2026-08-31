import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { cleanupAttachmentTempDir } from '../../src/main/attachments/attachment-temp-cleanup.mjs'

test('cleanupAttachmentTempDir removes stale files and keeps recent files', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-attachment-temp-cleanup-'))
  try {
    const stalePath = path.join(tempRoot, 'stale.bin')
    const recentPath = path.join(tempRoot, 'recent.bin')
    fs.writeFileSync(stalePath, 'stale', 'utf8')
    fs.writeFileSync(recentPath, 'recent', 'utf8')

    const now = Date.now()
    const staleTime = new Date(now - 60_000)
    const recentTime = new Date(now - 500)
    fs.utimesSync(stalePath, staleTime, staleTime)
    fs.utimesSync(recentPath, recentTime, recentTime)

    const result = await cleanupAttachmentTempDir(tempRoot, {
      olderThanMs: 1_000,
      nowMs: now,
    })
    assert.equal(result.ok, true)
    assert.equal(result.deletedEntries, 1)
    assert.equal(fs.existsSync(stalePath), false)
    assert.equal(fs.existsSync(recentPath), true)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('cleanupAttachmentTempDir treats missing directory as a successful no-op', async () => {
  const missing = path.join(os.tmpdir(), `addom-attachment-temp-missing-${Date.now()}`)
  const result = await cleanupAttachmentTempDir(missing)
  assert.equal(result.ok, true)
  assert.equal(result.scannedEntries, 0)
  assert.equal(result.deletedEntries, 0)
})
