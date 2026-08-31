import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('context meter view model reuses the shared token formatter from chat utils', () => {
  const source = fs.readFileSync(
    path.resolve('src/renderer/components/chat/context-meter-view-model.mjs'),
    'utf8',
  )

  assert.match(source, /import\s+\{\s*formatTokenCompact\s*\}\s+from\s+'\.\/chat-utils\.js'/)
  assert.match(source, /export\s+\{\s*formatTokenCompact\s*\}/)
  assert.doesNotMatch(source, /export function formatTokenCompact/)
})
