import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

function readSource(relativePath) {
  return fs.readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8')
}

test('trusted Playwright task authorization reaches both local lint boundaries', () => {
  const roundRunner = readSource('src/main/chat/chat-stream-round-runner.mjs')
  const rounds = readSource('src/main/chat/chat-stream-rounds.mjs')

  assert.match(
    roundRunner,
    /taskAuthorization:\s*resolveToolLintTaskAuthorization\(\{ userMessage \}\)/,
  )
  assert.match(
    rounds,
    /lintToolCall\(\{[\s\S]*?toolInput,[\s\S]*?taskAuthorization,[\s\S]*?\}\)/,
  )
  assert.match(
    rounds,
    /executeApprovedToolStep\(\{[\s\S]*?taskAuthorization,[\s\S]*?\}\)/,
  )
})

test('trusted Playwright task authorization reaches the account execution boundary', () => {
  const handler = readSource('src/main/ipc-handlers/chat-stream-handler.mjs')
  const accountExecutor = readSource('src/main/ipc-handlers/chat-stream-handler-account-tool-executor.mjs')

  assert.match(
    handler,
    /const toolLintTaskAuthorization = resolveToolLintTaskAuthorization\(\{ userMessage \}\)/,
  )
  assert.match(
    handler,
    /createOpenAIAccountDynamicToolExecutor\(\{[\s\S]*?taskAuthorization:\s*toolLintTaskAuthorization,[\s\S]*?\}\)/,
  )
  assert.match(
    accountExecutor,
    /executeApprovedToolStep\(\{[\s\S]*?taskAuthorization,[\s\S]*?\}\)/,
  )
})
