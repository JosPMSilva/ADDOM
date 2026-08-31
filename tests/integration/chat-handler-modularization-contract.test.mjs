import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const chatHandlerPath = path.join(process.cwd(), 'src/main/ipc-handlers/chat.mjs')
const chatStreamHandlerPath = path.join(process.cwd(), 'src/main/ipc-handlers/chat-stream-handler.mjs')
const chatStreamHandlerRoundContextPath = path.join(process.cwd(), 'src/main/ipc-handlers/chat-stream-handler-round-context.mjs')
const chatStreamHandlerAdaptiveBudgetPath = path.join(process.cwd(), 'src/main/ipc-handlers/chat-stream-handler-adaptive-budget.mjs')
const chatStreamRoundRunnerPath = path.join(process.cwd(), 'src/main/chat/chat-stream-round-runner.mjs')
const chatStreamRoundsPath = path.join(process.cwd(), 'src/main/chat/chat-stream-rounds.mjs')
const chatStreamOpenAIPath = path.join(process.cwd(), 'src/main/chat/chat-stream-openai-round.mjs')
const chatStreamModelRoundPath = path.join(process.cwd(), 'src/main/chat/chat-stream-model-round.mjs')
const chatStreamModelStepPath = path.join(process.cwd(), 'src/main/chat/chat-stream-model-step.mjs')
const chatStreamPrecallPath = path.join(process.cwd(), 'src/main/chat/chat-stream-precall-round.mjs')
const chatStreamPrecallHistoryConditioningPath = path.join(process.cwd(), 'src/main/chat/chat-stream-precall-history-conditioning.mjs')

test('chat handler keeps stream/cancel contract while delegating to modular helpers', () => {
  const source = fs.readFileSync(chatHandlerPath, 'utf8')
  const streamHandlerSource = fs.readFileSync(chatStreamHandlerPath, 'utf8')
  const handlerRoundContextSource = fs.readFileSync(chatStreamHandlerRoundContextPath, 'utf8')
  const handlerAdaptiveBudgetSource = fs.readFileSync(chatStreamHandlerAdaptiveBudgetPath, 'utf8')
  const roundRunnerSource = fs.readFileSync(chatStreamRoundRunnerPath, 'utf8')
  const roundsSource = fs.readFileSync(chatStreamRoundsPath, 'utf8')
  const openAISource = fs.readFileSync(chatStreamOpenAIPath, 'utf8')
  const modelRoundSource = fs.readFileSync(chatStreamModelRoundPath, 'utf8')
  const modelStepSource = fs.readFileSync(chatStreamModelStepPath, 'utf8')
  const precallSource = fs.readFileSync(chatStreamPrecallPath, 'utf8')
  const precallHistoryConditioningSource = fs.readFileSync(chatStreamPrecallHistoryConditioningPath, 'utf8')

  assert.match(source, /onVersioned\(ipcMain,\s*'chat:stream'/)
  assert.match(source, /createChatRunRegistry\(\{ appendEvent \}\)/)
  assert.match(source, /handleChatStream\(event, payload, registry\)/)
  assert.match(source, /registerChatCancelHandler\(\{ ipcMain, runRegistry: registry, appendEvent \}\)/)
  assert.match(source, /return registry/)

  assert.match(streamHandlerSource, /buildChatStreamRoundContext/)
  assert.match(streamHandlerSource, /resolveLearnedBudgetProfileWithRuntimeDiagnostics/)
  assert.match(handlerRoundContextSource, /bootstrapTurnHistory/)
  assert.match(handlerAdaptiveBudgetSource, /resolveLearnedProviderBudgetProfile/)
  assert.match(streamHandlerSource, /runStreamRounds/)
  assert.match(roundRunnerSource, /runProviderModelRound/)
  assert.match(roundRunnerSource, /maybeQueueOpenAIBackgroundTurn/)
  assert.match(roundRunnerSource, /preparePreCallRoundContext/)
  assert.doesNotMatch(roundsSource, /refreshMoaRoleCatalogForRound/)
  assert.match(openAISource, /createOpenAIResponseMetaEmitter/)
  assert.match(openAISource, /prepareOpenAIBackgroundTurn/)
  assert.match(modelRoundSource, /executeProviderModelStream/)
  assert.match(modelRoundSource, /finalizeProviderModelRound/)
  assert.match(modelStepSource, /createStreamWithTools/)
  assert.match(modelStepSource, /finalizeRoundWithoutTools/)
  assert.match(modelStepSource, /buildAssistantToolUseMessage/)
  assert.match(precallSource, /buildPreCallContinuityInput/)
  assert.match(precallSource, /applyPreCallHistoryConditioning/)
  assert.match(precallHistoryConditioningSource, /compactHistoryForContextWindow/)
  assert.match(precallSource, /resolveOpenAIThreadContinuation/)
  assert.match(
    roundRunnerSource,
    /allowBlankAssistantCompletion:\s*Boolean\(turnOptions\?\.planAction\)/,
  )
})
