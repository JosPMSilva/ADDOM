import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('renderer startup always initializes the OpenAI account bridge and prepares the runtime only for account mode', () => {
  const appSource = fs.readFileSync(path.resolve('src/renderer/App.jsx'), 'utf8')
  assert.match(appSource, /const selectedOpenAIAuthMethod = useSettingsStore\(\(s\) => \(/)
  assert.match(appSource, /const cleanupOpenAIAccountBridge = initializeOpenAIAccountBridge\(\)/)
  assert.doesNotMatch(appSource, /openAIAccountAuthEnabled/)
  assert.match(appSource, /if \(selectedOpenAIAuthMethod !== 'account'\) return/)
  assert.match(appSource, /prepareOpenAIAccountRuntime\(\{ background: true \}\)/)
})

test('OpenAI account IPC handlers always route to the account service instead of feature-disabled stubs', () => {
  const handlerSource = fs.readFileSync(path.resolve('src/main/ipc-handlers/openai-account.mjs'), 'utf8')
  assert.doesNotMatch(handlerSource, /feature_disabled/)
  assert.doesNotMatch(handlerSource, /isOpenAIAccountFeatureEnabled/)
  assert.match(handlerSource, /return getEnabledOpenAIAccountService\(\)\.refreshState\(\)/)
  assert.match(handlerSource, /return getEnabledOpenAIAccountService\(\)\.prepareRuntime\(payload\)/)
  assert.match(handlerSource, /return getEnabledOpenAIAccountService\(\)\.startLogin\(\)/)
  assert.match(handlerSource, /return getEnabledOpenAIAccountService\(\)\.reopenLoginBrowser\(loginId\)/)
})

test('chat stream handler prefers an explicitly configured native collaboration mode before falling back to the account service default', () => {
  const handlerSource = fs.readFileSync(path.resolve('src/main/ipc-handlers/chat-stream-handler.mjs'), 'utf8')
  assert.match(handlerSource, /const persistedOpenAIAccountCollaborationModeId = String\(\s*openAIAccountRuntimeSettings\.nativeCollaborationModeId \|\| ''\s*\)\.trim\(\)/)
  assert.match(handlerSource, /openAIAccountCollaborationModeId = persistedOpenAIAccountCollaborationModeId\s*\|\|\s*await accountAuthService\?\.resolveNativeCollaborationModeId\?\.\(\)\s*\|\|\s*''/)
})
