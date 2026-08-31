import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

function readSource(relativePath) {
  return fs.readFileSync(path.resolve(relativePath), 'utf8')
}

test('artifact tracking exceptions are persisted, streamed, and renderer-visible', () => {
  const turnEvents = readSource('src/main/chat/chat-turn-events.mjs')
  const preload = readSource('src/preload/index.mjs')
  const auxBridge = readSource('src/renderer/components/chat/chat-event-bridge-aux-subscriptions.mjs')

  assert.match(turnEvents, /kind:\s*'artifact_tracking'/)
  assert.match(turnEvents, /channel:\s*'chat:artifact-tracking'/)
  assert.match(preload, /onArtifactTracking:\s*\(cb\)\s*=>\s*subVersioned\('chat:artifact-tracking',\s*cb\)/)
  assert.match(auxBridge, /safeSub\(chatApi\.onArtifactTracking/)
  assert.match(auxBridge, /eventKind:\s*'artifact_tracking'/)
})

test('OpenAI account dynamic tool executor forwards shell write diagnostics into tool outcome recording', () => {
  const executor = readSource('src/main/ipc-handlers/chat-stream-handler-account-tool-executor.mjs')

  assert.match(executor, /shellWriteDiagnostics:\s*execution\.shellWriteDiagnostics/)
})
