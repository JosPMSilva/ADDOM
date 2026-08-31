export function createChatEventBridgeStreamingIndex({
  useChatStore,
  useAppStore,
} = {}) {
      const normalizeThreadId = (value = '') => String(value || '').trim()
      const normalizeMessageId = (value = '') => String(value || '').trim()
      const normalizeTurnId = (value = '') => String(value || '').trim()
      const normalizeLower = (value = '') => String(value || '').trim().toLowerCase()
      // Track message IDs that were already finalized by the onError handler,
      // so the subsequent onTurnState('completed') skips re-creating a
      // placeholder that would result in a duplicate error bubble.
      const errorFinalizedMessageIds = new Set()
      const streamingMessageIdByThread = new Map()
      const streamingThreadByMessageId = new Map()
      const streamingMessageIdByTurn = new Map()
      const turnKeysByMessageId = new Map()
      const resolveActiveThreadId = () => (
        normalizeThreadId(useAppStore.getState().activeThreadId)
        || normalizeThreadId(useChatStore.getState().activeThreadId)
      )
      const buildTurnKey = (threadId = '', turnId = '') => {
        const tid = normalizeThreadId(threadId)
        const turn = normalizeTurnId(turnId)
        return tid && turn ? `${tid}::${turn}` : ''
      }
      const bindMessageThread = (threadId = '', messageId = '') => {
        const tid = normalizeThreadId(threadId)
        const mid = normalizeMessageId(messageId)
        if (!tid || !mid) return
        streamingThreadByMessageId.set(mid, tid)
      }
      const bindThreadStreamingMessage = (threadId = '', messageId = '') => {
        const tid = normalizeThreadId(threadId)
        const mid = normalizeMessageId(messageId)
        if (!tid || !mid) return
        streamingMessageIdByThread.set(tid, mid)
        bindMessageThread(tid, mid)
      }
      const bindTurnStreamingMessage = (threadId = '', turnId = '', messageId = '') => {
        const key = buildTurnKey(threadId, turnId)
        const mid = normalizeMessageId(messageId)
        if (!key || !mid) return
        const previousId = normalizeMessageId(streamingMessageIdByTurn.get(key))
        if (previousId && previousId !== mid) {
          const previousKeys = turnKeysByMessageId.get(previousId)
          if (previousKeys instanceof Set) {
            previousKeys.delete(key)
            if (previousKeys.size === 0) turnKeysByMessageId.delete(previousId)
          }
        }
        streamingMessageIdByTurn.set(key, mid)
        if (!turnKeysByMessageId.has(mid)) turnKeysByMessageId.set(mid, new Set())
        turnKeysByMessageId.get(mid).add(key)
        bindMessageThread(threadId, mid)
      }
      const clearThreadStreamingMessage = (threadId = '') => {
        const tid = normalizeThreadId(threadId)
        if (!tid) return
        const existing = normalizeMessageId(streamingMessageIdByThread.get(tid))
        if (existing) {
          const boundThread = normalizeThreadId(streamingThreadByMessageId.get(existing))
          if (!boundThread || boundThread === tid) streamingThreadByMessageId.delete(existing)
        }
        streamingMessageIdByThread.delete(tid)
      }
      const clearMessageThreadBinding = (messageId = '') => {
        const mid = normalizeMessageId(messageId)
        if (!mid) return
        const tid = normalizeThreadId(streamingThreadByMessageId.get(mid))
        if (tid && normalizeMessageId(streamingMessageIdByThread.get(tid)) === mid) {
          streamingMessageIdByThread.delete(tid)
        }
        streamingThreadByMessageId.delete(mid)
        const messageTurnKeys = turnKeysByMessageId.get(mid)
        if (messageTurnKeys instanceof Set) {
          for (const key of messageTurnKeys) streamingMessageIdByTurn.delete(key)
          turnKeysByMessageId.delete(mid)
        }
      }
      const readStreamingIdFromStore = (threadId = '') => {
        const state = useChatStore.getState()
        const tid = normalizeThreadId(threadId)
        const activeThreadId = resolveActiveThreadId()
        if (!tid) {
          const fallback = normalizeMessageId(state.streamingId)
          return fallback || null
        }
        if (tid === activeThreadId) {
          const activeId = normalizeMessageId(state.streamingId)
          return activeId || null
        }
        const hiddenId = normalizeMessageId(state.threadStateById?.[tid]?.streamingId)
        return hiddenId || null
      }
      const syncStreamingIndexFromStore = (state) => {
        const activeThreadId = resolveActiveThreadId() || normalizeThreadId(state?.activeThreadId)
        if (!activeThreadId) return
        const activeStreamingId = normalizeMessageId(state?.streamingId)
        if (activeStreamingId) bindThreadStreamingMessage(activeThreadId, activeStreamingId)
        else clearThreadStreamingMessage(activeThreadId)
      }
      syncStreamingIndexFromStore(useChatStore.getState())
      const unsubStreamingId = useChatStore.subscribe((state) => {
        syncStreamingIndexFromStore(state)
      })
  
      const getStreamingId = (threadId = '') => {
        const tid = normalizeThreadId(threadId)
        if (tid) {
          const mappedId = normalizeMessageId(streamingMessageIdByThread.get(tid))
          if (mappedId) return mappedId
          const storeId = readStreamingIdFromStore(tid)
          if (storeId) {
            bindThreadStreamingMessage(tid, storeId)
            return storeId
          }
          return null
        }
        const activeThreadId = resolveActiveThreadId()
        if (activeThreadId) {
          const mappedActiveId = normalizeMessageId(streamingMessageIdByThread.get(activeThreadId))
          if (mappedActiveId) return mappedActiveId
          const activeStoreId = readStreamingIdFromStore(activeThreadId)
          if (activeStoreId) {
            bindThreadStreamingMessage(activeThreadId, activeStoreId)
            return activeStoreId
          }
        }
        return readStreamingIdFromStore('')
      }
      const resolveTurnStreamingMessage = (threadId = '', turnId = '') => {
        const key = buildTurnKey(threadId, turnId)
        return key ? (normalizeMessageId(streamingMessageIdByTurn.get(key)) || null) : null
      }
      const ensurePlaceholderForMessage = ({
        threadId = '',
        turnId = '',
        messageId = '',
        bindThread = false,
      } = {}) => {
        const tid = normalizeThreadId(threadId)
        const mid = normalizeMessageId(messageId)
        const normalizedTurnId = normalizeTurnId(turnId)
        if (!tid || !mid) return null
        useChatStore.getState().ensureAssistantPlaceholder({
          messageId: mid,
          threadId: tid,
        })
        bindMessageThread(tid, mid)
        if (bindThread) bindThreadStreamingMessage(tid, mid)
        if (normalizedTurnId) bindTurnStreamingMessage(tid, normalizedTurnId, mid)
        return mid
      }
      const ensureStreamingIdForPayload = (payload = {}) => {
        const tid = normalizeThreadId(payload?.threadId)
        const turnId = normalizeTurnId(payload?.turnId)
        const currentId = getStreamingId(tid)
        const assistantMessageId = normalizeMessageId(payload?.assistantMessageId)
        if (currentId && assistantMessageId && assistantMessageId !== currentId && tid) {
          return ensurePlaceholderForMessage({
            threadId: tid,
            turnId,
            messageId: assistantMessageId,
            bindThread: false,
          })
        }
        if (currentId) {
          if (tid && turnId) bindTurnStreamingMessage(tid, turnId, currentId)
          return currentId
        }
        const turnMessageId = resolveTurnStreamingMessage(tid, turnId)
        if (turnMessageId) return turnMessageId
        if (!assistantMessageId || !tid) return null
        return ensurePlaceholderForMessage({
          threadId: tid,
          turnId,
          messageId: assistantMessageId,
          bindThread: true,
        })
      }
      const resolveTerminalMessageIdForPayload = (payload = {}) => {
        const tid = normalizeThreadId(payload?.threadId)
        const turnId = normalizeTurnId(payload?.turnId)
        const assistantMessageId = normalizeMessageId(payload?.assistantMessageId)
        if (assistantMessageId && tid) {
          return ensurePlaceholderForMessage({
            threadId: tid,
            turnId,
            messageId: assistantMessageId,
            bindThread: false,
          })
        }
        const turnMessageId = resolveTurnStreamingMessage(tid, turnId)
        if (turnMessageId) return turnMessageId
        return getStreamingId(tid)
      }
  const resolveThreadIdForMessage = (messageId = '') => normalizeThreadId(streamingThreadByMessageId.get(normalizeMessageId(messageId)))

  return {
    bindThreadStreamingMessage, clearThreadStreamingMessage, clearMessageThreadBinding,
    bindTurnStreamingMessage, resolveTurnStreamingMessage,
    getStreamingId, ensureStreamingIdForPayload, resolveTerminalMessageIdForPayload, resolveThreadIdForMessage,
    normalizeThreadId, normalizeMessageId, normalizeLower, errorFinalizedMessageIds, unsubStreamingId,
  }
}
