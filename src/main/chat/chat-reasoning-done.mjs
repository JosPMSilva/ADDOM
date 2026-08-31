export function recordReasoningDoneSegment(turnReasoningSegments = [], reasoningBuffer = '') {
  const current = String(reasoningBuffer || '').trim()
  if (current) {
    const last = turnReasoningSegments[turnReasoningSegments.length - 1] || ''
    if (last !== current) turnReasoningSegments.push(current)
  }
  const full = turnReasoningSegments
    .map((segment) => String(segment || '').trim())
    .filter(Boolean)
    .join('\n\n---\n\n')
  return { current, full }
}
