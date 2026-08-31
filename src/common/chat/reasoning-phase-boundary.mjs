/** Marker chunk emitted between Cursor thinking phases (thinking_completed → next thinking_delta). */
export const REASONING_PHASE_BOUNDARY = '\n\n'

export function isReasoningPhaseBoundary(value = '') {
  return String(value ?? '') === REASONING_PHASE_BOUNDARY
}

export function allowsReasoningChunk(chunk = '') {
  return isReasoningPhaseBoundary(chunk) || String(chunk || '').trim().length > 0
}
