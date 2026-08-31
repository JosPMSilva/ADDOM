import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const chatStoreSource = fs.readFileSync(new URL('../../src/renderer/store/useChatStore.js', import.meta.url), 'utf8')
const helpersSource = fs.readFileSync(new URL('../../src/renderer/store/chat/use-chat-store-helpers.mjs', import.meta.url), 'utf8')
const noticeActionsSource = fs.readFileSync(new URL('../../src/renderer/store/chat/use-chat-store-notice-actions.mjs', import.meta.url), 'utf8')
const reasoningActionsSource = fs.readFileSync(new URL('../../src/renderer/store/chat/use-chat-store-reasoning-actions.mjs', import.meta.url), 'utf8')

test('chat store hot paths use the clone-once helper utilities', () => {
  assert.match(helpersSource, /export function appendCappedItem\(list, item, max = Infinity\)/)
  assert.match(helpersSource, /export function appendTrimmedTimelineRow\(timeline, row\)/)
  assert.match(chatStoreSource, /appendCappedItem,/)
  assert.match(chatStoreSource, /appendTrimmedTimelineRow,/)
  assert.match(chatStoreSource, /\.\.\.createNoticeActions\(\{/)
  assert.match(chatStoreSource, /pushToolActivity: \(entry\) => \{[\s\S]*appendCappedItem\(thread\.toolActivity, normalized, MAX_TOOL_ACTIVITY_ITEMS\)/)
  assert.match(noticeActionsSource, /pushNotice: \(\{ type = 'info', text = '', meta = null, threadId = '' \} = \{\}\) => \{[\s\S]*appendCappedItem\(thread\.notices, notice, maxNotices\)/)
  assert.match(chatStoreSource, /addAssistantPlaceholder: \(options = \{\}\) => \{[\s\S]*appendCappedItem\(thread\.messages, message\)/)
  assert.match(chatStoreSource, /addUserMessage: \(content, options = \{\}\) => \{[\s\S]*appendTrimmedTimelineRow\(thread\.timeline, toTimelineMessage\(message, now\(\)\)\)/)
  assert.match(chatStoreSource, /appendChunk: \(id, chunk, options = \{\}\) => \{[\s\S]*updateMessageAndTimelineById\(thread, id,/)
  assert.match(chatStoreSource, /\.\.\.createReasoningActions\(\{/)
  assert.match(reasoningActionsSource, /appendReasoning: \(id, chunk, options = \{\}\) => \{[\s\S]*updateMessageAndTimelineById\(thread, id,/)
  assert.doesNotMatch(chatStoreSource, /trimTimeline\(\[\.\.\.s\.timeline, toTimelineTool\(normalized\)\]\)/)
  assert.doesNotMatch(chatStoreSource, /trimTimeline\(\[\.\.\.s\.timeline, toTimelineMessage\(message, now\(\)\)\]\)/)
})
