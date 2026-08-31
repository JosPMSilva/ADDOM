export function resolveTerminalStreamingNote(turnState = '', payload = {}) {
  const normalizedState = String(turnState || '').trim().toLowerCase()
  if (normalizedState !== 'cancelled') return ''
  return String(payload?.reason || '').trim() || 'Stop requested. Stopping after current action.'
}

export function isTerminalMemorySuggestionToolResult(payload = {}) {
  return (
    String(payload?.toolName || '').trim().toLowerCase() === 'terminal_memory_suggest'
    && payload?.isError !== true
    && String(payload?.decision || '').trim().toLowerCase() === 'approved'
  )
}

export function turnStateEventKind(state = '') {
  const normalized = String(state || '').trim().toLowerCase()
  if (normalized === 'started') return 'turn_started'
  if (normalized === 'cancelled') return 'turn_cancelled'
  if (normalized === 'interrupted') return 'turn_interrupted'
  if (normalized === 'completed') return 'turn_completed'
  return 'turn_phase'
}

export function turnStateLabel(state = '', payload = {}) {
  const normalized = String(state || '').trim().toLowerCase()
  if (normalized === 'started') return 'Turn started'
  if (normalized === 'completed') return `Turn completed (${String(payload.status || 'ok')})`
  if (normalized === 'cancelled') return `Stop requested: ${String(payload.reason || 'stop requested')}`
  if (normalized === 'interrupted') return 'Turn interrupted by app restart'
  if (normalized === 'model_streaming') return 'Model streaming'
  if (normalized === 'tools_pending') {
    const count = Number(payload.count || 0) || 0
    return count > 0 ? `Preparing ${count} tool${count === 1 ? '' : 's'}` : 'Preparing tools'
  }
  if (normalized === 'waiting_for_approval') return `Waiting for approval: ${String(payload.toolName || 'tool')}`
  if (normalized === 'running_tool') return `Running tool: ${String(payload.toolName || 'tool')}`
  if (normalized === 'applying_artifact') return `Applying artifact: ${String(payload.toolName || 'file change')}`
  if (normalized === 'stale') return 'Stale/no progress detected'
  return 'Turn update'
}

export function buildTurnStateActivity(state = '', payload = {}) {
  const normalizedState = String(state || '').trim().toLowerCase()
  const turnId = String(payload?.turnId || '').trim()
  if (!normalizedState || !turnId) return null
  const reason = String(payload?.reason || '').trim()
  return {
    type: normalizedState === 'stale' ? 'warning' : 'turn',
    threadId: String(payload?.threadId || ''),
    turnId,
    eventKind: turnStateEventKind(normalizedState),
    turnState: normalizedState,
    turnStatus: String(payload?.status || '').trim().toLowerCase(),
    label: turnStateLabel(normalizedState, payload),
    detail: reason ? `reason: ${reason}` : '',
    createdAt: Number(payload?.createdAt || payload?.startedAt || payload?.finishedAt || 0) || Date.now(),
    updatedAt: Number(payload?.finishedAt || payload?.updatedAt || payload?.createdAt || payload?.startedAt || 0) || Date.now(),
  }
}

export function buildCancelledStreamingMessageContent(content = '', note = '') {
  const normalizedContent = String(content ?? '')
  const normalizedNote = String(note || '').trim()
  if (!normalizedNote) return normalizedContent
  const bracketedNote = `[${normalizedNote}]`
  if (normalizedContent.trimEnd().endsWith(bracketedNote)) return normalizedContent
  return normalizedContent.trim().length > 0
    ? `${normalizedContent}\n\n${bracketedNote}`
    : bracketedNote
}
