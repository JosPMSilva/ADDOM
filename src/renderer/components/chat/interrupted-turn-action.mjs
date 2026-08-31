export const INTERRUPTED_TURN_CONTINUATION_TEXT = 'Continue from the saved context.'

export function createInterruptedTurnContinuation({
  threadId = '',
  text = INTERRUPTED_TURN_CONTINUATION_TEXT,
} = {}) {
  const normalizedThreadId = String(threadId || '').trim()
  if (!normalizedThreadId) return null
  return {
    threadId: normalizedThreadId,
    text: String(text || INTERRUPTED_TURN_CONTINUATION_TEXT),
    focusComposer: true,
  }
}
