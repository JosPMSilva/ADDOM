import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  cleanupToolResultSpillover,
  persistToolResultSpillover,
  pruneToolResultSpillover,
  readToolResultSpillover,
  resetToolResultSpillover,
  resolveToolResultSpilloverRoot,
  summarizeToolResultSpillover,
} from '../../src/main/tools/tool-result-spillover.mjs'

function createTempUserDataPath() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'addom-tool-result-spillover-'))
}

function writeSpilloverFixture(filePath, size = 120) {
  const payload = {
    kind: 'tool_result_spillover',
    version: 1,
    output: 'x'.repeat(size),
  }
  fs.writeFileSync(filePath, JSON.stringify(payload), 'utf8')
}

test('pruneToolResultSpillover removes expired and overflow spillover files without touching paths outside the spillover root', () => {
  const userDataPath = createTempUserDataPath()
  const spilloverRoot = resolveToolResultSpilloverRoot(userDataPath)
  const outsidePath = path.join(userDataPath, 'outside.json')
  const now = Date.now()

  fs.mkdirSync(spilloverRoot, { recursive: true })
  fs.writeFileSync(outsidePath, '{"outside":true}', 'utf8')

  const expiredPath = path.join(spilloverRoot, 'expired.json')
  const overflowPath = path.join(spilloverRoot, 'overflow.json')
  const newestPath = path.join(spilloverRoot, 'newest.json')
  writeSpilloverFixture(expiredPath, 180)
  writeSpilloverFixture(overflowPath, 180)
  writeSpilloverFixture(newestPath, 180)
  fs.utimesSync(expiredPath, new Date(now - 10_000), new Date(now - 10_000))
  fs.utimesSync(overflowPath, new Date(now - 5_000), new Date(now - 5_000))
  fs.utimesSync(newestPath, new Date(now - 500), new Date(now - 500))

  const cleanup = pruneToolResultSpillover({
    userDataPath,
    now,
    projectedAdditionalFiles: 1,
    projectedAdditionalBytes: 1,
    retentionPolicy: {
      maxFileCount: 2,
      maxAggregateBytes: 10_000,
      maxAgeMs: 1_000,
    },
  })

  assert.equal(cleanup.applied, true)
  assert.equal(cleanup.cleanupState, 'pruned')
  assert.equal(cleanup.deletedFileCount, 2)
  assert.ok(!fs.existsSync(expiredPath))
  assert.ok(!fs.existsSync(overflowPath))
  assert.ok(fs.existsSync(newestPath))
  assert.ok(fs.existsSync(outsidePath))

  fs.rmSync(userDataPath, { recursive: true, force: true })
})

test('persistToolResultSpillover stays non-fatal when cleanup scanning degrades and still records spillover metadata', () => {
  const userDataPath = createTempUserDataPath()
  const spilloverRoot = resolveToolResultSpilloverRoot(userDataPath)
  fs.mkdirSync(spilloverRoot, { recursive: true })

  const originalReaddirSync = fs.readdirSync
  fs.readdirSync = () => {
    const error = new Error('spillover root unavailable')
    error.code = 'EACCES'
    throw error
  }

  try {
    const result = persistToolResultSpillover({
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
      toolName: 'run_command',
      resultText: 'stdout:\n' + 'x'.repeat(4_000),
      originalChars: 4_008,
      userDataPath,
    })
    const persisted = readToolResultSpillover(result.persistedOutputPath)

    assert.equal(result.persistence, 'enabled')
    assert.equal(result.spilloverPersistenceState, 'persisted_with_cleanup_degraded')
    assert.equal(result.spilloverCleanupState, 'failed')
    assert.equal(result.spilloverDegraded, true)
    assert.ok(Array.isArray(result.spilloverFailureReasons))
    assert.ok(result.spilloverFailureReasons.some((value) => String(value).startsWith('scan_failed:')))
    assert.equal(persisted?.output?.startsWith('stdout:\n'), true)
  } finally {
    fs.readdirSync = originalReaddirSync
    fs.rmSync(userDataPath, { recursive: true, force: true })
  }
})

test('persistToolResultSpillover keeps the freshly written file even when it alone exceeds the retention budget', () => {
  const userDataPath = createTempUserDataPath()

  try {
    const result = persistToolResultSpillover({
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
      toolName: 'run_command',
      resultText: 'stdout:\n' + 'x'.repeat(4_000),
      originalChars: 4_008,
      userDataPath,
      retentionPolicy: {
        maxFileCount: 1,
        maxAggregateBytes: 64,
        maxAgeMs: 7 * 24 * 60 * 60 * 1000,
      },
    })
    const persisted = readToolResultSpillover(result.persistedOutputPath)

    assert.equal(result.persistence, 'enabled')
    assert.equal(result.spilloverPersistenceState, 'persisted')
    assert.ok(result.persistedOutputPath)
    assert.equal(fs.existsSync(result.persistedOutputPath), true)
    assert.equal(persisted?.output?.startsWith('stdout:\n'), true)
  } finally {
    fs.rmSync(userDataPath, { recursive: true, force: true })
  }
})

test('persistToolResultSpillover preserves all oversized spillovers from the active turn', () => {
  const userDataPath = createTempUserDataPath()

  try {
    const first = persistToolResultSpillover({
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
      toolName: 'apply_patch',
      resultText: 'first:\n' + 'x'.repeat(4_000),
      originalChars: 4_007,
      userDataPath,
      threadId: 'thread_1',
      turnId: 'turn_1',
      retentionPolicy: {
        maxFileCount: 1,
        maxAggregateBytes: 64,
        maxAgeMs: 7 * 24 * 60 * 60 * 1000,
      },
    })
    const second = persistToolResultSpillover({
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
      toolName: 'edit_file',
      resultText: 'second:\n' + 'y'.repeat(4_000),
      originalChars: 4_008,
      userDataPath,
      threadId: 'thread_1',
      turnId: 'turn_1',
      retentionPolicy: {
        maxFileCount: 1,
        maxAggregateBytes: 64,
        maxAgeMs: 7 * 24 * 60 * 60 * 1000,
      },
    })

    assert.equal(first.persistence, 'enabled')
    assert.equal(second.persistence, 'enabled')
    assert.equal(second.spilloverRetentionExceeded, true)
    assert.equal(second.spilloverCleanupState, 'retention_exceeded')
    assert.equal(fs.existsSync(first.persistedOutputPath), true)
    assert.equal(fs.existsSync(second.persistedOutputPath), true)
    assert.equal(readToolResultSpillover(first.persistedOutputPath)?.output?.startsWith('first:\n'), true)
    assert.equal(readToolResultSpillover(second.persistedOutputPath)?.output?.startsWith('second:\n'), true)
  } finally {
    fs.rmSync(userDataPath, { recursive: true, force: true })
  }
})

test('summarizeToolResultSpillover reports aggregate state and retention policy without exposing raw output', () => {
  const userDataPath = createTempUserDataPath()

  try {
    persistToolResultSpillover({
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
      toolName: 'run_command',
      resultText: 'stdout:\n' + 'x'.repeat(2_000),
      originalChars: 2_008,
      userDataPath,
    })
    persistToolResultSpillover({
      providerId: 'openai',
      model: 'gpt-5.4',
      toolName: 'read_file',
      resultText: 'body:\n' + 'y'.repeat(1_000),
      originalChars: 1_006,
      userDataPath,
    })

    const summary = summarizeToolResultSpillover({ userDataPath })

    assert.equal(summary.rootPath, resolveToolResultSpilloverRoot(userDataPath))
    assert.equal(summary.fileCount, 2)
    assert.ok(summary.totalBytes > 0)
    assert.deepEqual(summary.retentionPolicy, {
      maxFileCount: 64,
      maxAggregateBytes: 20 * 1024 * 1024,
      maxAgeMs: 7 * 24 * 60 * 60 * 1000,
    })
    assert.equal(summary.sessionCleanupRecorded, true)
    assert.equal(typeof summary.sessionCleanupState, 'string')
    assert.equal(summary.latestOutputPreview, undefined)
  } finally {
    fs.rmSync(userDataPath, { recursive: true, force: true })
  }
})

test('cleanupToolResultSpillover prunes retained spillover files and returns refreshed summary', () => {
  const userDataPath = createTempUserDataPath()
  const spilloverRoot = resolveToolResultSpilloverRoot(userDataPath)
  const now = Date.now()

  try {
    fs.mkdirSync(spilloverRoot, { recursive: true })
    const expiredPath = path.join(spilloverRoot, 'expired.json')
    const newestPath = path.join(spilloverRoot, 'newest.json')
    writeSpilloverFixture(expiredPath, 180)
    writeSpilloverFixture(newestPath, 180)
    fs.utimesSync(expiredPath, new Date(now - 10_000), new Date(now - 10_000))
    fs.utimesSync(newestPath, new Date(now - 500), new Date(now - 500))

    const result = cleanupToolResultSpillover({
      userDataPath,
      now,
      retentionPolicy: {
        maxFileCount: 4,
        maxAggregateBytes: 10_000,
        maxAgeMs: 1_000,
      },
    })

    assert.equal(result.ok, true)
    assert.equal(result.deletedCount, 1)
    assert.ok(!fs.existsSync(expiredPath))
    assert.ok(fs.existsSync(newestPath))
    assert.equal(result.summary.fileCount, 1)
    assert.equal(result.summary.sessionCleanupRecorded, true)
    assert.equal(result.summary.sessionCleanupState, 'pruned')
  } finally {
    fs.rmSync(userDataPath, { recursive: true, force: true })
  }
})

test('resetToolResultSpillover clears only spillover files under the spillover root', () => {
  const userDataPath = createTempUserDataPath()
  const spilloverRoot = resolveToolResultSpilloverRoot(userDataPath)
  const outsidePath = path.join(userDataPath, 'outside.json')

  try {
    fs.mkdirSync(spilloverRoot, { recursive: true })
    fs.writeFileSync(outsidePath, '{"outside":true}', 'utf8')
    writeSpilloverFixture(path.join(spilloverRoot, 'first.json'), 180)
    writeSpilloverFixture(path.join(spilloverRoot, 'second.json'), 220)

    const result = resetToolResultSpillover({ userDataPath })

    assert.equal(result.ok, true)
    assert.equal(result.deletedCount, 2)
    assert.equal(result.summary.fileCount, 0)
    assert.equal(result.summary.sessionCleanupRecorded, true)
    assert.equal(fs.existsSync(outsidePath), true)
    assert.equal(fs.existsSync(path.join(spilloverRoot, 'first.json')), false)
    assert.equal(fs.existsSync(path.join(spilloverRoot, 'second.json')), false)
  } finally {
    fs.rmSync(userDataPath, { recursive: true, force: true })
  }
})
