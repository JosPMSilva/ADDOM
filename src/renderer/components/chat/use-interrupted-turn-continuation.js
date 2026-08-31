import { useCallback } from 'react'
import { createInterruptedTurnContinuation } from './interrupted-turn-action.mjs'

export function useInterruptedTurnContinuation({
  activeThreadId,
  continuationText,
  queueChatDraftInjection,
  setActiveThread,
  clearPendingChatDraftInjection,
}) {
  return useCallback(async (turn = {}) => {
    const continuation = createInterruptedTurnContinuation({
      threadId: turn?.threadId || activeThreadId,
      text: continuationText,
    })
    if (!continuation) return false
    queueChatDraftInjection({
      threadId: continuation.threadId,
      text: continuation.text,
      mode: 'replace',
      source: 'interrupted_turn_continue',
      focusComposer: continuation.focusComposer,
    })
    if (continuation.threadId === activeThreadId) return true
    const selected = await setActiveThread(continuation.threadId)
    if (selected) return true
    clearPendingChatDraftInjection()
    return false
  }, [
    activeThreadId,
    clearPendingChatDraftInjection,
    continuationText,
    queueChatDraftInjection,
    setActiveThread,
  ])
}
