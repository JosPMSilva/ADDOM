import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('chat stream handler explicitly blocks deprecated computer-use preview model', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/main/ipc-handlers/chat-stream-handler.mjs'),
    'utf8',
  )

  assert.match(source, /computer-use-preview/)
  assert.match(source, /computer_use_preview_disabled/)
  assert.match(source, /disabled in ADDOM while this feature remains unstable/i)
})
