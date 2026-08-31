export function handleTerminalCollaborationEvent({
  payload = {},
  normalizeMessageId = (value = '') => String(value || '').trim(),
  normalizeLower = (value = '') => String(value || '').trim().toLowerCase(),
  useTerminalStore,
  useChatStore,
} = {}) {
  const terminalSession = payload?.terminalSession && typeof payload.terminalSession === 'object'
  ? payload.terminalSession
  : null
  const sessionId = normalizeMessageId(terminalSession?.sessionId)
  if (!terminalSession || !sessionId) return
  
  const panelIntent = normalizeLower(terminalSession?.panelIntent)
  const threadId = String(payload?.threadId || '').trim()
  const terminalState = useTerminalStore.getState?.()
  terminalState?.noteModelSessionActivity?.({
  sessionId,
  action: String(terminalSession?.action || '').trim(),
  displayName: String(terminalSession?.displayName || sessionId).trim(),
  attentionMessage: String(terminalSession?.attentionMessage || '').trim(),
  panelIntent,
  liveSurface: String(terminalSession?.liveSurface || 'chat_dock').trim(),
  userTakeoverAvailable: terminalSession?.userTakeoverAvailable === true,
  threadId,
  status: String(terminalSession?.status || terminalSession?.lifecycleState || '').trim(),
  })
  terminalState?.setActiveSessionId?.(sessionId)
  if (threadId) {
  useChatStore.getState().setTerminalDockState?.({
  collapsed: false,
  selectedTabId: sessionId,
  }, { threadId })
  }
  
  if (panelIntent !== 'open') return
  void terminalState?.ensureSessionConnected?.(sessionId)
  void terminalState?.requestSessionSurfaceFocus?.(sessionId, 'chat_dock')
}

export function refreshArchivedSuggestionsForThread({
  threadId = '',
  useAppStore,
  useTerminalStore,
} = {}) {
  const normalizedThreadId = String(threadId || '').trim()
  const projectFolder = String(useAppStore.getState?.().projectFolder || '').trim()
  if (!normalizedThreadId || !projectFolder) return
  void useTerminalStore.getState?.().refreshThreadSuggestionArchives?.({
  projectFolder,
  threadId: normalizedThreadId,
  })
}
