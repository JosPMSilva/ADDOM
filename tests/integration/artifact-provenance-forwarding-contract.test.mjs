import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

function readSource(relativePath) {
  return fs.readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8')
}

test('chat, shell, and staged agent writes forward thread and turn provenance', () => {
  const execution = readSource('src/main/chat/chat-stream-tool-execution.mjs')
  const artifactMeta = readSource('src/main/chat/chat-tool-step-artifact-meta.mjs')
  const shellSnapshot = readSource('src/main/chat/chat-tool-step-shell-snapshot.mjs')
  const stagedWrites = readSource('src/main/moa/staged-write-pipeline.mjs')

  assert.match(execution, /threadId:\s*activeThreadId/)
  assert.match(execution, /turnId:\s*activeTurnId/)
  assert.match(artifactMeta, /recordWrite\(\{[\s\S]*?threadId,[\s\S]*?turnId,/)
  assert.match(shellSnapshot, /recordWrite\(\{[\s\S]*?threadId,[\s\S]*?turnId,/)
  assert.match(shellSnapshot, /buildShellHydratedChanges\(\{[\s\S]*?threadId,[\s\S]*?turnId,/)
  assert.match(stagedWrites, /recordWrite\(\{[\s\S]*?threadId,[\s\S]*?turnId,/)
})
