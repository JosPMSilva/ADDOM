import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { createChatEventBridgeStreamingIndex } from '../../src/renderer/components/chat/chat-event-bridge-streaming-index.mjs'
import {
  resolveCancelableTurnId,
  stopCurrentTurnOptimistically,
} from '../../src/renderer/components/chat/chat-panel-stop-turn.mjs'

test('ChatPanelView keeps composer input enabled during streaming so replacement prompts remain typeable', () => {
  const source = fs.readFileSync(
    path.resolve('src/renderer/components/chat/ChatPanelView.jsx'),
    'utf8',
  )

  assert.match(source, /disabled=\{!activeThreadId\}/)
  assert.doesNotMatch(source, /disabled=\{!activeThreadId \|\| isStreaming\}/)
})

test('ChatPanel stop path scopes optimistic cancellation to the active turn/message instead of the full thread', () => {
  const source = fs.readFileSync(
    path.resolve('src/renderer/components/chat/chat-panel-stop-turn.mjs'),
    'utf8',
  )

  assert.match(source, /cancel\(targetThreadId,\s*targetTurnId\)/)
  assert.match(source, /if \(targetThreadId && targetMessageId\) \{\s*const currentContent = String\(streamingMessage\?\.content \|\| ''\)/)
  assert.match(source, /finalizeMessage\(targetMessageId,\s*nextContent,\s*\{ threadId: targetThreadId \}\)/)
  assert.doesNotMatch(source, /cancelStreaming\(/)
})

test('ChatPanel stop path can cancel a restored active live-execution turn without a streaming message', () => {
  const turnId = 'turn_restored_active'
  const liveExecutionTurns = {
    [turnId]: {
      turnId,
      status: 'active',
      eventOrder: ['event_started'],
      eventsById: {
        event_started: {
          activity: { eventKind: 'turn_started' },
        },
      },
    },
  }
  const cancelCalls = []
  const activityCalls = []

  assert.equal(resolveCancelableTurnId({ liveExecutionTurns }), turnId)

  stopCurrentTurnOptimistically({
    activeThreadId: 'thread_restored',
    streamingMessage: null,
    liveExecutionTurns,
    cancel: (...args) => cancelCalls.push(args),
    pushToolActivity: (activity) => activityCalls.push(activity),
  })

  assert.deepEqual(cancelCalls, [['thread_restored', turnId]])
  assert.equal(activityCalls[0]?.eventKind, 'turn_cancelled')
  assert.equal(activityCalls[0]?.turnState, 'cancelled')
  assert.equal(activityCalls[0]?.turnId, turnId)
})

function buildCancelledStreamingMessageContent(content = '', note = '') {
  const normalizedContent = String(content ?? '')
  const normalizedNote = String(note || '').trim()
  if (!normalizedNote) return normalizedContent
  return normalizedContent.trim().length > 0
    ? `${normalizedContent}\n\n[${normalizedNote}]`
    : `[${normalizedNote}]`
}

function createMemoryLocalStorage() {
  const map = new Map()
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null
    },
    setItem(key, value) {
      map.set(String(key), String(value))
    },
    removeItem(key) {
      map.delete(String(key))
    },
    clear() {
      map.clear()
    },
  }
}

async function withChatStores(testFn) {
  const prevWindow = globalThis.window
  const prevLocalStorage = globalThis.localStorage
  const localStorage = createMemoryLocalStorage()
  let injectedCrypto = false
  if (!globalThis.crypto) {
    globalThis.crypto = { randomUUID: () => `uuid_${Math.random().toString(36).slice(2, 10)}` }
    injectedCrypto = true
  }
  globalThis.window = {
    localStorage,
    addom: {
      workspace: {
        listTimeline: async () => [],
        listProjects: async () => [],
        listThreads: async () => [],
        setActiveThread: async (_projectId, threadId) => ({ thread: { id: threadId } }),
      },
    },
  }
  globalThis.localStorage = localStorage

  try {
    const chatMod = await import('../../src/renderer/store/useChatStore.js')
    const appMod = await import('../../src/renderer/store/useAppStore.js')
    const chatStore = chatMod.default
    const appStore = appMod.default

    if (typeof chatStore?.setState === 'function' && typeof chatStore?.getInitialState === 'function') {
      chatStore.setState(chatStore.getInitialState(), true)
    }
    if (typeof appStore?.setState === 'function' && typeof appStore?.getInitialState === 'function') {
      appStore.setState(appStore.getInitialState(), true)
    }

    return await testFn({ chatStore, appStore })
  } finally {
    globalThis.window = prevWindow
    globalThis.localStorage = prevLocalStorage
    if (injectedCrypto) delete globalThis.crypto
  }
}

test('replacement-turn cancellation resolves and finalizes the superseded placeholder without clearing the replacement stream', async () => {
  await withChatStores(async ({ chatStore, appStore }) => {
    const threadId = 'thread_replace'
    const oldTurnId = 'turn_old'
    const newTurnId = 'turn_new'

    appStore.getState().setActiveThreadId?.(threadId)
    chatStore.getState().setActiveThread(threadId)

    const chat = chatStore.getState()
    const oldMessageId = chat.addAssistantPlaceholder({ threadId })
    chat.appendChunk(oldMessageId, 'Old partial output', { threadId })

    const streamingIndex = createChatEventBridgeStreamingIndex({
      useChatStore: chatStore,
      useAppStore: appStore,
    })
    streamingIndex.ensureStreamingIdForPayload({
      threadId,
      turnId: oldTurnId,
      assistantMessageId: oldMessageId,
    })

    const newMessageId = chat.addAssistantPlaceholder({ threadId })
    chat.appendChunk(newMessageId, 'New replacement output', { threadId })
    streamingIndex.ensureStreamingIdForPayload({
      threadId,
      turnId: newTurnId,
      assistantMessageId: newMessageId,
    })

    const resolvedCancelledMessageId = streamingIndex.resolveTerminalMessageIdForPayload({
      threadId,
      turnId: oldTurnId,
    })
    assert.equal(resolvedCancelledMessageId, oldMessageId)

    const oldMessage = chatStore.getState().getThreadState(threadId).messages.find((message) => message?.id === oldMessageId)
    chatStore.getState().finalizeMessage(
      resolvedCancelledMessageId,
      buildCancelledStreamingMessageContent(oldMessage?.content, 'Stop requested. Stopping after current action.'),
      { threadId },
    )
    streamingIndex.clearMessageThreadBinding(oldMessageId)

    const nextThread = chatStore.getState().getThreadState(threadId)
    const nextOldMessage = nextThread.messages.find((message) => message?.id === oldMessageId)
    const nextNewMessage = nextThread.messages.find((message) => message?.id === newMessageId)

    assert.equal(nextThread.streamingId, newMessageId)
    assert.equal(streamingIndex.getStreamingId(threadId), newMessageId)
    assert.equal(String(nextOldMessage?.status || ''), 'done')
    assert.match(String(nextOldMessage?.content || ''), /\[Stop requested\. Stopping after current action\.\]/)
    assert.equal(String(nextNewMessage?.status || ''), 'streaming')
    assert.equal(String(nextNewMessage?.content || ''), 'New replacement output')

    streamingIndex.unsubStreamingId?.()
  })
})
