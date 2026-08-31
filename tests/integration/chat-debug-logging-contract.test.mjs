import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readSource(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

test('thread session debug logging uses pipe-safe logging in stream and cancel handlers', () => {
  const streamSource = readSource('src/main/ipc-handlers/chat-stream-handler.mjs')
  const cancelSource = readSource('src/main/chat/chat-cancel-handler.mjs')

  assert.match(streamSource, /import \{ safeDebug \} from '\.\.\/utils\/safe-console\.mjs'/)
  assert.match(cancelSource, /import \{ safeDebug \} from '\.\.\/utils\/safe-console\.mjs'/)
  assert.doesNotMatch(streamSource, /console\.debug\(/)
  assert.doesNotMatch(cancelSource, /console\.debug\(/)
  assert.match(streamSource, /safeDebug\('\[thread-session\] run:start'/)
  assert.match(streamSource, /safeDebug\('\[thread-session\] run:error'/)
  assert.match(streamSource, /safeDebug\('\[thread-session\] run:done'/)
  assert.match(cancelSource, /safeDebug\('\[thread-session\] cancel:request'/)
})

test('safe-console helper intentionally suppresses only broken pipe style console failures', () => {
  const source = readSource('src/main/utils/safe-console.mjs')

  assert.match(source, /BROKEN_PIPE_ERROR_CODES/)
  assert.match(source, /'EPIPE'/)
  assert.match(source, /'ERR_STREAM_DESTROYED'/)
  assert.match(source, /if \(!isBrokenConsolePipeError\(error\)\) throw error/)
})

