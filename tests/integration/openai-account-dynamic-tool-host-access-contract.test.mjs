import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('OpenAI account dynamic tool execution forwards approved host file access into tool execution', () => {
  const handlerSource = fs.readFileSync(
    path.resolve('src/main/ipc-handlers/chat-stream-handler-account-tool-executor.mjs'),
    'utf8',
  )

  assert.match(
    handlerSource,
    /createOpenAIAccountDynamicToolExecutor[\s\S]*?executeApprovedToolStep\(\{[\s\S]*?fileSystemHostFullAccess:\s*approval\.fileSystemHostFullAccess === true,/,
  )
})

test('OpenAI account dynamic tool executor uses stable per-turn history containers instead of pre-round TDZ bindings', () => {
  const handlerSource = fs.readFileSync(path.resolve('src/main/ipc-handlers/chat-stream-handler.mjs'), 'utf8')

  assert.match(
    handlerSource,
    /const history = \[\][\s\S]*?const turnToolResults = \[\][\s\S]*?createOpenAIAccountDynamicToolExecutor\(\{[\s\S]*?history,\s*[\s\S]*?turnToolResults,/,
  )
  assert.match(
    handlerSource,
    /history:\s*roundHistory,\s*[\s\S]*?turnToolResults:\s*roundTurnToolResults[\s\S]*?history\.length = 0[\s\S]*?history\.push\(\.\.\.roundHistory\)[\s\S]*?turnToolResults\.length = 0[\s\S]*?turnToolResults\.push\(\.\.\.roundTurnToolResults\)/,
  )
})

test('OpenAI account bridge receives a stable full-task dynamic-tool catalog separately from active turn tools', () => {
  const handlerSource = fs.readFileSync(path.resolve('src/main/ipc-handlers/chat-stream-handler.mjs'), 'utf8')
  const roundContextSource = fs.readFileSync(
    path.resolve('src/main/ipc-handlers/chat-stream-handler-round-context.mjs'),
    'utf8',
  )

  assert.match(
    handlerSource,
    /const openAIAccountDynamicToolCatalog = toAISDKTools\(permissionMode, true, \{[\s\S]*?includeTerminalSessionTools: true,[\s\S]*?\}\)/,
  )
  assert.match(
    handlerSource,
    /buildChatStreamRoundContext\(\{[\s\S]*?tools,[\s\S]*?openAIAccountDynamicToolCatalog,/,
  )
  assert.match(
    roundContextSource,
    /openAIAccountDynamicToolCatalog = \{\},[\s\S]*?const options = \{[\s\S]*?tools,[\s\S]*?openAIAccountDynamicToolCatalog,/,
  )
})

test('typed Plan lifecycle actions are routed through an explicit OpenAI account turn input', () => {
  const roundContextSource = fs.readFileSync(
    path.resolve('src/main/ipc-handlers/chat-stream-handler-round-context.mjs'),
    'utf8',
  )
  const accountProviderSource = fs.readFileSync(
    path.resolve('src/main/api-clients/ai-provider-openai-account.mjs'),
    'utf8',
  )

  assert.match(
    roundContextSource,
    /if \(normalizedProviderId === 'openai' && planActionPrompt\)[\s\S]*?options\.openAIAccountCurrentTurnInput = \[\{[\s\S]*?text: planActionPrompt,/,
  )
  assert.match(
    accountProviderSource,
    /buildTurnInput\(messages, \{[\s\S]*?currentTurnInput: options\?\.openAIAccountCurrentTurnInput/,
  )
})
