import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const SYNC_FS_CALL_REGEX = /\b(?:readFileSync|writeFileSync|appendFileSync|readdirSync|statSync|lstatSync|existsSync|unlinkSync|mkdirSync|renameSync)\b/g

function readSource(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

function countSyncFsCalls(sourceText = '') {
  const matches = String(sourceText || '').match(SYNC_FS_CALL_REGEX)
  return Array.isArray(matches) ? matches.length : 0
}

test('stream-adjacent modules do not grow sync fs usage', () => {
  const guardedModules = new Map([
    ['src/main/chat/chat-tool-step.mjs', 0],
    ['src/main/attachments/attachment-cache.mjs', 0],
    ['src/main/workspace/file-watcher.mjs', 0],
    ['src/main/attachments/attachment-text-extraction.mjs', 5],
  ])

  for (const [relPath, maxAllowed] of guardedModules.entries()) {
    const source = readSource(relPath)
    const syncCount = countSyncFsCalls(source)
    assert.ok(
      syncCount <= maxAllowed,
      `${relPath} has ${syncCount} sync fs call sites (baseline max ${maxAllowed})`,
    )
  }
})

test('chat stream orchestration and provider runtime stay free of sync fs calls', () => {
  const criticalModules = [
    'src/main/ipc-handlers/chat-stream-handler.mjs',
    'src/main/api-clients/ai-provider.mjs',
  ]

  for (const relPath of criticalModules) {
    const source = readSource(relPath)
    const syncCount = countSyncFsCalls(source)
    assert.equal(syncCount, 0, `${relPath} should not call sync fs APIs`)
  }
})
