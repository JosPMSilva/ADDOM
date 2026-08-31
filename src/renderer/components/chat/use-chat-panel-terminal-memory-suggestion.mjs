import React, { useMemo } from 'react'
import TerminalMemorySuggestionCard from './TerminalMemorySuggestionCard.jsx'

export function useChatPanelTerminalMemorySuggestion({
  activeThreadId, isStreaming, threadSuggestionArchivesByThreadId,
  threadSuggestionArchivesPendingByThreadId, acceptArchivedSessionSuggestion,
  dismissArchivedSessionSuggestion, pushNotice,
} = {}) {
    const pendingTerminalMemorySuggestion = useMemo(() => {
      const threadId = String(activeThreadId || '').trim()
      if (!threadId) return null
      const rows = Array.isArray(threadSuggestionArchivesByThreadId?.[threadId])
        ? threadSuggestionArchivesByThreadId[threadId]
        : []
      return rows.find((archive) => (
        String(archive?.threadId || '').trim() === threadId
        && String(archive?.memoryCandidateStatus || '').trim().toLowerCase() === 'pending'
        && String(archive?.memoryCandidateSummary || '').trim()
      )) || null
    }, [activeThreadId, threadSuggestionArchivesByThreadId])
  const terminalMemorySuggestionCard = useMemo(() => {
    if (isStreaming || !pendingTerminalMemorySuggestion) return null
    const suggestionArchivesPending = threadSuggestionArchivesPendingByThreadId?.[String(activeThreadId || '').trim()] === true
    return React.createElement(TerminalMemorySuggestionCard, {
      archive: pendingTerminalMemorySuggestion, busy: suggestionArchivesPending,
      onSave: async (sessionId, targetScope = 'thread') => {
        const saved = await acceptArchivedSessionSuggestion(sessionId, { targetScope })
        if (!saved) pushNotice({ type: 'warning', text: 'Could not save the terminal memory suggestion.', threadId: activeThreadId })
      },
      onDismiss: async (sessionId) => {
        const dismissed = await dismissArchivedSessionSuggestion(sessionId)
        if (!dismissed) pushNotice({ type: 'warning', text: 'Could not dismiss the terminal memory suggestion.', threadId: activeThreadId })
      },
    })
  }, [
    acceptArchivedSessionSuggestion, activeThreadId, dismissArchivedSessionSuggestion,
    isStreaming, pendingTerminalMemorySuggestion, pushNotice,
    threadSuggestionArchivesPendingByThreadId,
  ])
  return { pendingTerminalMemorySuggestion, terminalMemorySuggestionCard }
}
