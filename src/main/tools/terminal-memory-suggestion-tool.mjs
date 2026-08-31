import { persistTerminalMemorySuggestionCandidate } from '../chat/terminal-memory-suggestion-policy.mjs'

export async function suggestTerminalMemory(_projectRoot, toolInput = {}, options = {}) {
  const persisted = persistTerminalMemorySuggestionCandidate(toolInput, {
    threadId: options?.threadId,
    turnId: options?.turnId,
  })
  if (!persisted?.ok) {
    const error = new Error(String(persisted?.message || 'terminal_memory_suggest_failed'))
    error.code = String(persisted?.code || 'terminal_memory_suggest_failed')
    throw error
  }

  return {
    status: 'pending',
    message: 'Terminal memory suggestion prepared.',
    suggestion: persisted.suggestion,
    guidance: 'Render this as a same-turn local Save/Dismiss card after terminal close output and assistant completion. Do not ask a follow-up question.',
  }
}
