import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readSource(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

test('question_user clarification flow is promoted into a composer-adjacent action card', () => {
  const chatTurnEventsSource = readSource('src/main/chat/chat-turn-events.mjs')
  const chatEventBridgeSource = readSource('src/renderer/components/ChatEventBridge.jsx')
  const chatPanelSource = [
    readSource('src/renderer/components/ChatPanel.jsx'),
    readSource('src/renderer/components/chat/ChatPanelView.jsx'),
  ].join('\n')
  const composerAreaSource = readSource('src/renderer/components/chat/ChatPanelComposerArea.jsx')
  const questionCardSource = readSource('src/renderer/components/chat/QuestionUserCard.jsx')
  const chatPanelHelpersSource = readSource('src/renderer/components/chat/chat-panel-helpers.mjs')

  assert.match(chatTurnEventsSource, /questionUser:\s*normalizedQuestionUser/)
  assert.match(chatEventBridgeSource, /questionUser:\s*payload\.questionUser/)
  assert.match(chatEventBridgeSource, /import \{ normalizeQuestionUserRequest \} from '\.\.\/\.\.\/common\/chat\/question-user-request\.mjs'/)
  assert.match(chatEventBridgeSource, /String\(toolName \|\| ''\)\.trim\(\) === 'question_user'/)
  assert.match(chatEventBridgeSource, /chatApi\.onQuestionUserRequested/)
  assert.match(chatEventBridgeSource, /chatApi\.onQuestionUserCleared/)
  assert.match(chatEventBridgeSource, /useChatStore\.getState\(\)\.setPendingQuestionUser\(/)
  assert.match(chatEventBridgeSource, /clearPendingQuestionUser\(\{ threadId: targetThreadId \}\)/)
  assert.match(chatPanelSource, /const pendingQuestionUser = useChatStore\(\(s\) => s\.pendingQuestionUser\)/)
  assert.match(chatPanelSource, /const handleSubmitQuestionUserAnswer = useCallback\(async \(answer, meta = \{\}\) => \{/)
  assert.match(chatPanelSource, /submitQuestionUserAnswer\(\{/)
  assert.match(chatPanelSource, /window\.addom\.chat\.respondQuestionUser\(payload\)/)
  assert.match(chatPanelSource, /window\.addom\.chat\.getPendingQuestionUser\(threadId\)/)
  assert.match(chatPanelSource, /pendingQuestionUser=\{pendingQuestionUser\}/)
  assert.match(chatPanelSource, /onSubmitQuestionUserAnswer=\{handleSubmitQuestionUserAnswer\}/)
  assert.match(chatPanelHelpersSource, /if \(source === 'openai_account_bridge'\)/)
  assert.match(chatPanelHelpersSource, /if \(normalizedRequest\?\.responsePending === true\) return false/)
  assert.match(chatPanelHelpersSource, /await respondQuestionUser\(\{/)
  assert.match(chatPanelHelpersSource, /const sent = sendMessage\(normalizedAnswer, normalizeMode\(normalizedRequest\?\.originMode, 'execute'\)\)/)
  assert.match(composerAreaSource, /import QuestionUserCard from '\.\/QuestionUserCard\.jsx'/)
  assert.match(composerAreaSource, /resolveQuestionUserCardDisabled\(\{/)
  assert.match(composerAreaSource, /pendingQuestionUser = null/)
  assert.match(composerAreaSource, /onSubmitQuestionUserAnswer = \(\) => \{\}/)
  assert.match(composerAreaSource, /<QuestionUserCard[\s\S]*request=\{pendingQuestionUser\}[\s\S]*onSubmitAnswer=\{onSubmitQuestionUserAnswer\}/)
  assert.match(questionCardSource, /data-ui="chat-question-user-card"/)
  assert.match(questionCardSource, /tone="warning"/)
  assert.doesNotMatch(questionCardSource, /clarificationNeeded/)
  assert.doesNotMatch(questionCardSource, /waitingOnYou/)
  assert.match(questionCardSource, /data-ui="chat-question-user-option"/)
  assert.match(questionCardSource, /data-ui="chat-question-user-answer"/)
  assert.match(questionCardSource, /data-ui="chat-question-user-submit"/)
  assert.match(questionCardSource, /data-ui="approval-shortcut-enter"/)
  assert.match(questionCardSource, /const \[isSubmitting, setIsSubmitting\] = React\.useState\(false\)/)
  assert.match(questionCardSource, /if \(!answer \|\| requestDisabled \|\| isSubmitting\) return/)
  assert.match(questionCardSource, /const sending = request\?\.responsePending === true \|\| isSubmitting/)
  assert.match(questionCardSource, /core:chat\.questionUser\.sending/)
  assert.match(questionCardSource, /core:chat\.questionUser\.sendAnswer/)
})
