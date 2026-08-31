import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readSource(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

test('chat round orchestration emits visible model, tool, approval, artifact, and stale phases', () => {
  const roundRunner = readSource('src/main/chat/chat-stream-round-runner.mjs')
  const rounds = readSource('src/main/chat/chat-stream-rounds.mjs')
  const approval = readSource('src/main/chat/chat-tool-approval.mjs')
  const failure = readSource('src/main/chat/chat-stream-error-output.mjs')
  const bridge = readSource('src/renderer/components/ChatEventBridge.jsx')
  const turnStateHelpers = readSource('src/renderer/components/chat/chat-event-bridge-turn-state.mjs')

  assert.match(roundRunner, /sendTurnState\('model_streaming'/)
  assert.match(roundRunner, /sendTurnState\('tools_pending'/)
  assert.match(approval, /sendTurnState\('waiting_for_approval'/)
  assert.match(rounds, /sendTurnState\(isFileMutationTool\(tc\.name\) \? 'applying_artifact' : 'running_tool'/)
  assert.match(failure, /sendTurnState\('stale'/)
  assert.match(bridge, /buildTurnStateActivity/)
  assert.match(turnStateHelpers, /function turnStateLabel/)
  assert.match(turnStateHelpers, /Stale\/no progress detected/)
})
