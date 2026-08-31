import useChatStore from './useChatStore.js'
import useTerminalStore from './useTerminalStore.js'
import useToolStore from './useToolStore.js'

function normalizeId(value) {
  return String(value || '').trim()
}

export function clearDeletedThreadRendererState(threadId, {
  successorThreadId = '',
  timelineRequestIndex = null,
} = {}) {
  const normalizedThreadId = normalizeId(threadId)
  if (!normalizedThreadId) return false
  timelineRequestIndex?.delete?.(normalizedThreadId)
  useChatStore.getState().removeThread?.(normalizedThreadId, { successorThreadId })
  useToolStore.getState().clearThread?.(normalizedThreadId)
  useTerminalStore.getState().clearThreadState?.(normalizedThreadId)
  return true
}
