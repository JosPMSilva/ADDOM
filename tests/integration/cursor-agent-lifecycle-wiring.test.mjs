import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('workspace disposal removes only Cursor session mappings for the disposed scope', () => {
  const source = fs.readFileSync(new URL('../../src/main/main-ipc-registration.mjs', import.meta.url), 'utf8')

  assert.match(source, /getCursorAgentSessionRegistry\(\)\.deleteThread\(normalizedThreadId\)/)
  assert.match(source, /getCursorAgentSessionRegistry\(\)\.deleteProject\(projectId\)/)
  assert.doesNotMatch(source, /cursorAgentSessionRegistry[^\n]*rmSync/)
})
