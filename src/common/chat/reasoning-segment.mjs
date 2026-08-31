export function readExecutionReasoningSegment(turn = {}) {
  return Math.max(0, Number(turn?.executionReasoningSegment || 0) || 0)
}

export function bumpExecutionReasoningSegment(turn = {}) {
  const next = readExecutionReasoningSegment(turn) + 1
  turn.executionReasoningSegment = next
  return next
}

export function resolveExecutionReasoningMessageId({
  turnId = '',
  segment = 0,
  providerId = '',
  reasoningRole = '',
  explicitMessageId = '',
} = {}) {
  const normalizedTurnId = String(turnId || '').trim()
  const normalizedSegment = Math.max(0, Number(segment || 0) || 0)
  const explicit = String(explicitMessageId || '').trim()
  const role = String(reasoningRole || '').trim().toLowerCase()

  if (explicit.startsWith('execution_commentary:')) return explicit
  if (explicit.startsWith('execution_stage:')) return explicit
  if (role === 'stage' && normalizedTurnId) return `execution_stage:${normalizedTurnId}`

  const useSegmentedExecutionReasoning = (
    normalizedSegment > 0
    || String(providerId || '').trim().toLowerCase() === 'cursor'
    || explicit.startsWith('execution_reasoning:')
    || !explicit
  )

  if (!useSegmentedExecutionReasoning && explicit) return explicit
  if (!normalizedTurnId) return explicit || 'execution_reasoning'

  if (normalizedSegment === 0) return `execution_reasoning:${normalizedTurnId}`
  return `execution_reasoning:${normalizedTurnId}:${normalizedSegment}`
}

export function parseExecutionReasoningSegment(messageId = '') {
  const normalized = String(messageId || '').trim()
  const match = normalized.match(/^execution_reasoning:([^:]+)(?::(\d+))?$/)
  if (!match) return { turnId: '', segment: 0 }
  return {
    turnId: match[1],
    segment: match[2] == null ? 0 : Math.max(0, Number(match[2]) || 0),
  }
}
