import { create } from 'zustand'
import {
  appendOutputState,
  createInitialTerminalStoreState,
  mergeAttachOutput,
} from './terminal-store-shared.js'
import { createTerminalArchiveActions } from './terminal-store-archive-actions.js'
import { createTerminalHydrationActions } from './terminal-store-hydration-actions.js'
import { createTerminalMemoryActions } from './terminal-store-memory-actions.js'
import { createTerminalSessionActions } from './terminal-store-session-actions.js'
import { createTerminalViewportActions } from './terminal-store-viewport-actions.js'

const useTerminalStore = create((set, get) => ({
  ...createInitialTerminalStoreState(),
  ...createTerminalViewportActions({ set, get }),
  ...createTerminalArchiveActions({ set, get }),
  ...createTerminalMemoryActions({ set, get }),
  ...createTerminalSessionActions({ set, get }),
  ...createTerminalHydrationActions({ set, get }),
  clearThreadState: (threadId = '') => set((state) => {
    const normalizedThreadId = String(threadId || '').trim()
    if (!normalizedThreadId) return {}
    const threadSuggestionArchivesByThreadId = { ...state.threadSuggestionArchivesByThreadId }
    const threadSuggestionArchivesPendingByThreadId = { ...state.threadSuggestionArchivesPendingByThreadId }
    delete threadSuggestionArchivesByThreadId[normalizedThreadId]
    delete threadSuggestionArchivesPendingByThreadId[normalizedThreadId]
    return {
      archivedSessions: (state.archivedSessions || []).filter((row) => (
        String(row?.threadId || '').trim() !== normalizedThreadId
      )),
      threadSuggestionArchivesByThreadId,
      threadSuggestionArchivesPendingByThreadId,
    }
  }),
}))

export { appendOutputState, mergeAttachOutput }
export default useTerminalStore
